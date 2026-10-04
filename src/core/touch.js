// Touch controls for phones and tablets: a left-thumb movement stick, a right-thumb drag-to-look
// surface and hold-to-fire buttons, feeding the existing Input pipeline (virtual keys + mouse flags)
// so the PlayerController, weapons and specials need no changes.
//
// Design notes
// - Pointer Events + setPointerCapture: joystick, look surface and buttons all track their own
//   pointer id, so you can move, aim and fire at the same time.
// - Look feeds input.mouse.dx/dy (the same channel pointer-lock mouse uses), pre-scaled so the
//   PlayerController's mouse sensitivity constant lands at a comfortable touch turn rate.
// - Movement is analog: input.moveAxis (x strafe, y forward), read alongside the stick/keys.
// - Buttons are virtual keys (ShiftLeft squid, Space jump, KeyE sub, KeyF special, Tab map, KeyC
//   cheer) plus mouse.left for fire — exactly what a gamepad/keyboard press produces.
// - The layer is hidden whenever the menus or the pause screen are up; main.js calls setVisible().
export const isTouchDevice = () => {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return true;
  } catch { /* old browsers */ }
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
};

// screen px → fed into input.mouse.dx/dy (the controller applies 0.0021 rad/px × sensitivity)
const LOOK_GAIN = 2.3;
const STICK_RADIUS = 62;         // px of travel for a full-speed move
const STICK_DEAD = 0.14;

export class TouchControls {
  constructor(input, opts = {}) {
    this.input = input;
    this.onPause = opts.onPause || (() => {});
    this.visible = false;
    this._moveId = null; this._lookId = null;
    this._moveAnchor = { x: 0, y: 0 };
    this._lookLast = { x: 0, y: 0 };
    this._mapHeld = false;
    this._el = this._build();
    document.body.appendChild(this._el);
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'touch-root';
    root.setAttribute('aria-hidden', 'true');
    // look surface (whole screen, under everything else here); disabled while the TAB map is up so
    // the diorama's Super-Jump pins stay clickable
    const aim = document.createElement('div');
    aim.className = 'tw-aim';
    this._aim = aim;
    this._bindLook(aim);
    root.appendChild(aim);
    // movement zone: left thumb area
    const zone = document.createElement('div');
    zone.className = 'tw-zone';
    const base = document.createElement('div');
    base.className = 'tw-stick';
    base.innerHTML = '<i class="tw-stick__ring"></i><i class="tw-stick__knob"></i>';
    this._stickBase = base;
    this._knob = base.querySelector('.tw-stick__knob');
    this._bindStick(zone);
    zone.appendChild(base);
    root.appendChild(zone);
    // buttons
    this._buttons = [];
    const btn = (cls, label, onDown, onUp) => {
      const b = document.createElement('div');
      b.className = 'tw-btn ' + cls;
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('is-down'); onDown(); });
      const up = (e) => { e.preventDefault(); b.classList.remove('is-down'); onUp(); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      root.appendChild(b);
      this._buttons.push(b);
      return b;
    };
    const vk = (code) => ({
      down: () => { this.input.vkeys.add(code); this.input.vpressed.add(code); this.input.lastDevice = 'touch'; },
      up: () => { this.input.vkeys.delete(code); },
    });
    // fire: the mouse-left channel (hold = charge weapons keep charging, exactly like a held button)
    const fireDown = () => { this.input.mouse.left = true; this.input.mouse.leftPressed = true; this.input.lastDevice = 'touch'; };
    const fireUp = () => { this.input.mouse.left = false; };
    const mapBtn = vk('Tab');
    btn('tw-btn--fire', 'FIRE', fireDown, fireUp);
    btn('tw-btn--jump', 'JUMP', vk('Space').down, vk('Space').up);
    btn('tw-btn--squid', 'SQUID', vk('ShiftLeft').down, vk('ShiftLeft').up);
    btn('tw-btn--sub', 'SUB', vk('KeyE').down, vk('KeyE').up);
    btn('tw-btn--special', 'SP', vk('KeyF').down, vk('KeyF').up);
    btn('tw-btn--cheer', 'C', vk('KeyC').down, vk('KeyC').up);
    btn('tw-btn--map', 'MAP', () => { mapBtn.down(); this._aim.style.pointerEvents = 'none'; }, () => { mapBtn.up(); this._aim.style.pointerEvents = ''; });
    btn('tw-btn--pause', 'II', () => this.onPause(), () => {});
    return root;
  }

  // ---- left-thumb movement stick (dynamic anchor: spawns wherever the thumb lands)
  _bindStick(zone) {
    zone.addEventListener('pointerdown', (e) => {
      if (this._moveId !== null) return;
      e.preventDefault(); e.stopPropagation();
      this._moveId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = this._el.getBoundingClientRect();
      this._moveAnchor.x = e.clientX; this._moveAnchor.y = e.clientY;
      this._stickBase.style.left = (e.clientX - r.left) + 'px';
      this._stickBase.style.top = (e.clientY - r.top) + 'px';
      this._stickBase.classList.add('is-on');
      this._knob.style.transform = 'translate(-50%, -50%)';
    });
    const move = (e) => {
      if (e.pointerId !== this._moveId) return;
      e.preventDefault();
      let dx = e.clientX - this._moveAnchor.x, dy = e.clientY - this._moveAnchor.y;
      const m = Math.hypot(dx, dy);
      if (m > STICK_RADIUS) { dx *= STICK_RADIUS / m; dy *= STICK_RADIUS / m; }
      this._knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
      let nx = dx / STICK_RADIUS, ny = dy / STICK_RADIUS;
      const mag = Math.hypot(nx, ny);
      if (mag <= STICK_DEAD) { nx = ny = 0; }
      else { const k = (mag - STICK_DEAD) / (1 - STICK_DEAD) / mag; nx *= k; ny *= k; }
      this.input.moveAxis.x = nx; this.input.moveAxis.y = -ny;   // screen-down drag = walk backwards
      this.input.lastDevice = 'touch';
    };
    const end = (e) => {
      if (e.pointerId !== this._moveId) return;
      this._moveId = null;
      this.input.moveAxis.x = 0; this.input.moveAxis.y = 0;
      this._stickBase.classList.remove('is-on');
    };
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // ---- right-thumb drag-to-look (works anywhere the stick/buttons aren't)
  _bindLook(aim) {
    aim.addEventListener('pointerdown', (e) => {
      if (this._lookId !== null) return;
      e.preventDefault();
      this._lookId = e.pointerId;
      aim.setPointerCapture(e.pointerId);
      this._lookLast.x = e.clientX; this._lookLast.y = e.clientY;
    });
    const move = (e) => {
      if (e.pointerId !== this._lookId) return;
      e.preventDefault();
      this.input.mouse.dx += (e.clientX - this._lookLast.x) * LOOK_GAIN;
      this.input.mouse.dy += (e.clientY - this._lookLast.y) * LOOK_GAIN;
      this._lookLast.x = e.clientX; this._lookLast.y = e.clientY;
      this.input.lastDevice = 'touch';
    };
    const end = (e) => { if (e.pointerId === this._lookId) this._lookId = null; };
    aim.addEventListener('pointermove', move);
    aim.addEventListener('pointerup', end);
    aim.addEventListener('pointercancel', end);
  }

  // main.js calls this every frame; cheap when the state hasn't changed
  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this._el.classList.toggle('is-on', v);
    if (!v) this._releaseAll();
  }

  // leaving a match / opening a menu: drop every held input so nothing sticks down
  _releaseAll() {
    this.input.vkeys.clear();
    this.input.vpressed.clear();
    this.input.mouse.left = false;
    this.input.moveAxis.x = 0; this.input.moveAxis.y = 0;
    this._moveId = this._lookId = null;
    this._aim.style.pointerEvents = '';
    this._stickBase.classList.remove('is-on');
    for (const b of this._buttons) b.classList.remove('is-down');
  }

  dispose() { this._el.remove(); }
}
