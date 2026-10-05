// Sub weapons (every kind except the Splat Bomb, which lives in weapons.js): thrown and placed devices, clouds,
// curtains, mines and jump beacons, plus the status effects they put on players (tracking, poison).
//
//   G.subs.use(actor, subDef)             throw or place (called by the weapon runner after the ink is paid)
//   G.subs.update(dt)                     per frame
//   G.subs.blockActor(actor)              push an actor out of enemy ink curtains (after its movement)
//   G.subs.blockShot(prev, pos, team, dmg) true if an enemy curtain / device absorbed this projectile segment
//   G.subs.blockRay(from, dir, len, team, dmg)  distance to the first enemy curtain / device on a beam (or len)
//   G.subs.damageArea(center, radius, dmg, team)  blasts hurt enemy devices
//   G.subs.beaconsFor(team)               live jump beacons, for the super-jump map
//   G.subs.jumpToBeacon(actor, beacon)
//   G.subs.clear()
//
// Props come from getSubDef(kind) (origin at the bottom centre, +Y away from the surface, +Z forward).
import * as THREE from 'three';
import { G, emit, on, clamp, lerp } from '../core/ctx.js';
import { SUBS, PLAYER } from '../config.js';
import { Physics, Hit } from './physics.js';
import { getSubDef } from './character-weapons.js';
import { getPlasticMaterial, getInkMaterial } from './character-mats.js';
import { MAIN_KITS, SUB_KITS, KIT_GHOSTS, netRec, netId, netHurt, netMuted } from './kits/registry.js';
const r2 = (x) => Math.round(x * 100) / 100;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _hit = new Hit(), _hit2 = new Hit();
const _res = { t: 0, dist: 0 };
const GRAV = 24;
const SUB_SCALE = 1.9;         // prop models are built at hand scale; in the world they read at the splat bomb's size

function nearCam(p, r = 30) { return G.camera && G.camera.position.distanceToSquared(p) < r * r; }

// ------------------------------------------------------------------------------------------------ curtain shader
// A sheet of falling ink: scrolling vertical streaks, thicker at the top where it pours from, ragged bottom edge.
const CURTAIN_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CURTAIN_FS = `
  uniform vec3 uColor; uniform float uTime; uniform float uLife; varying vec2 vUv;
  float hash(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
  void main(){
    float col = floor(vUv.x * 46.0);
    float speed = 1.4 + hash(col) * 1.2;
    float y = vUv.y + uTime * speed * 0.55 + hash(col + 3.1);
    float streak = smoothstep(0.35, 0.0, abs(fract(y * 3.0) - 0.5) - 0.15);
    float sheet = 0.42 + 0.35 * streak;
    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float bottom = smoothstep(0.0, 0.12 + 0.06 * hash(col + 7.0), vUv.y);
    float a = sheet * edge * bottom * (0.35 + 0.65 * uLife);
    vec3 c = mix(uColor * 0.7, uColor * 1.35 + 0.08, streak * 0.8 + vUv.y * 0.2);
    gl_FragColor = vec4(c, a);
  }`;

KIT_GHOSTS.subs = { ghost: (a, d) => G.subs?.netGhost(a, d) };

export class SubSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.cloudGeo = new THREE.IcosahedronGeometry(1, 3);
    // a splatted owner loses their sprinkler; a super jump that lands on a beacon uses it up
    on('splatted', ({ victim }) => { for (const it of this.items) if (it.owner === victim && it.kind === 'sprinkler' && it.state === 'spray') this._destroy(it); });
    on('superjump:land', ({ actor }) => this._landedOnBeacon(actor));
  }

  clear() {
    for (const it of this.items) this._dispose(it);
    this.items.length = 0;
    for (const k in SUB_KITS) SUB_KITS[k].clear?.();
  }

  // ---------------------------------------------------------------------------------------------- deploy
  use(a, sub) {
    if (SUB_KITS[sub.kind]) return SUB_KITS[sub.kind].use(this, a, sub);   // kit subs (kits/*.js)
    if (sub.placed) return this._place(a, sub);
    const pos = a.pos.clone(); pos.y += 1.35;
    const vel = G.projectiles.throwVelocity(a, sub.throwSpeed, new THREE.Vector3());
    const it = this._throw(a, sub, pos, vel, false);
    netRec(a, 'subs', [0, it.gid, sub.kind, r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z)]);
    emit('sub:use', { actor: a, kind: sub.kind });
  }
  // a thrown sub in flight (ghost: a remote player's, online — see netGhost)
  _throw(a, sub, pos, vel, ghost, gid = 0) {
    const mesh = this._prop(sub.kind, a.team);
    mesh.position.copy(pos);
    mesh.userData.inner.position.y = -mesh.userData.lift;   // tumble about the middle while flying
    this.scene.add(mesh);
    const it = { sp: !!a.specialActive,   // thrown during a special (Bomb Barrage): its ink never charges the meter
      kind: sub.kind, sub, owner: a, team: a.team, mesh, pos: pos.clone(), vel: vel.clone(), state: 'fly', age: 0, t: 0,
      spinV: new THREE.Vector3(3 + Math.random() * 6, 3 + Math.random() * 6, 0),
      dir: new THREE.Vector3(vel.x, 0, vel.z).normalize(), ghost, gid: gid || netId(a),
    };
    this.items.push(it);
    if (a.isLocal || a._nearCamera()) G.audio?.play('bomb_throw', { pos: a.isLocal ? undefined : a.pos, volume: 0.65, pitch: sub.kind === 'burst' ? 1.2 : 1 });
    return it;
  }

  _place(a, sub) {
    const g = G.physics.raycast(_v.copy(a.pos).setY(a.pos.y + 0.4), DOWN, 3, _hit);
    if (!g.hit) return; { const gb = G.level.blocks[g.block]; if (gb && (gb.roof || gb.rail || gb.perch)) return; }   // nothing gets planted on an off-limits roof, a railing or a crane perch
    // per-player limits: mines — the oldest beyond the limit goes off; beacons — the oldest is removed
    const mine = this.items.filter((it) => it.owner === a && it.kind === sub.kind && it.state !== 'dead').sort((x, y) => x.born - y.born);
    while (mine.length >= sub.max) { const old = mine.shift(); if (sub.kind === 'mine') this._mineBlast(old); else this._destroy(old); }
    const it = this._plant(a, sub, g.point, g.normal, a.yaw, g, false);
    netRec(a, 'subs', [1, it.gid, sub.kind, r2(it.pos.x), r2(it.pos.y), r2(it.pos.z), r2(g.normal.x), r2(g.normal.y), r2(g.normal.z), r2(a.yaw)]);
    emit('sub:use', { actor: a, kind: sub.kind, pos: it.pos.clone() });
  }
  // a placed device (mine / beacon) on the floor at pos (g: the floor hit, for the ink under it; ghost: see netGhost)
  _plant(a, sub, pos, normal, yaw, g, ghost, gid = 0) {
    const mesh = this._prop(sub.kind, a.team);
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(UP, normal);
    mesh.rotateY(yaw);
    this.scene.add(mesh);
    const it = { kind: sub.kind, sub, owner: a, team: a.team, mesh, pos: pos.clone(), state: sub.kind, age: 0, t: 0, born: G.time, normal: normal.clone(), sp: !!a.specialActive,
      face: g ? g.face : -1, u: g ? g.u : 0, v: g ? g.v : 0, hp: sub.hp || 1, uses: sub.uses || 0, ghost, gid: gid || netId(a) };
    this.items.push(it);
    if (sub.kind === 'mine') this._paintUnder(it, 1.1);
    if (a.isLocal || a._nearCamera()) G.audio?.play('bomb_beep', { pos: a.isLocal ? undefined : a.pos, volume: 0.5, pitch: sub.kind === 'beacon' ? 1.3 : 0.8 });
    return it;
  }

  // prop meshes: an outer node (world transform) → inner (offset while flying so it tumbles about its middle) → model
  _prop(kind, team) {
    const d = getSubDef(kind);
    if (d._top == null) { d.body.computeBoundingBox(); d._top = d.body.boundingBox.max.y; }
    const outer = new THREE.Group(), inner = new THREE.Group(), model = new THREE.Group();
    model.scale.setScalar(SUB_SCALE);
    const col = G.teamColors[team];
    const body = new THREE.Mesh(d.body, getPlasticMaterial()); body.castShadow = true;
    const ink = new THREE.Mesh(d.ink, getInkMaterial(col)); ink.castShadow = true;
    model.add(body, ink);
    if (d.glow) model.add(new THREE.Mesh(d.glow, this._glowMat(team)));
    let spin = null;
    if (d.spin) {
      spin = new THREE.Group(); spin.position.copy(d.spinAt);
      const sm = new THREE.Mesh(d.spin, getPlasticMaterial()); sm.position.copy(d.spinAt).negate(); sm.castShadow = true; spin.add(sm);
      if (d.spinInk) { const si = new THREE.Mesh(d.spinInk, getInkMaterial(col)); si.position.copy(d.spinAt).negate(); spin.add(si); }
      model.add(spin);
    }
    inner.add(model);
    outer.add(inner);
    outer.userData = { inner, spin, def: d, lift: d._top * SUB_SCALE * 0.5 };
    return outer;
  }
  // lit parts (scan orb band, beacon lamp): team colour that glows a little
  _glowMat(team) {
    this._glow = this._glow || [];
    if (!this._glow[team]) {
      const c = G.teamColors[team];
      this._glow[team] = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.35), emissive: c.clone(), emissiveIntensity: 1.1, roughness: 0.35 });
    }
    return this._glow[team];
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    for (const k in SUB_KITS) SUB_KITS[k].tick?.(dt);   // kit subs' own objects
    const items = this.items, nm = G.netm;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt; it.t += dt;
      const gm = it.ghost && nm;   // (a ghost's splats are its owner's to send; its hits are dropped as a remote's)
      if (gm) nm.mute++;
      try { this._step(it, dt); } finally { if (gm) nm.mute--; }
      if (it.state === 'dead') {
        if (!it.ghost && it.gid) netRec(it.owner, 'subs', [2, it.gid]);
        this._dispose(it); items.splice(i, 1);
      }
    }
  }
  _step(it, dt) {
    {
      switch (it.state) {
        case 'fly': this._fly(it, dt); break;
        case 'stuck': this._stuck(it, dt); break;
        case 'run': this._run(it, dt); break;
        case 'cloud': this._cloud(it, dt); break;
        case 'mist': this._mist(it, dt); break;
        case 'curtain': this._curtain(it, dt); break;
        case 'spray': this._spray(it, dt); break;
        case 'mine': this._mine(it, dt); break;
        case 'beacon': this._beacon(it, dt); break;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- online
  // A remote player's subs: its throws / placements arrive as kit records (KIT_GHOSTS.subs → netGhost) and play out here
  // as ghosts — same flight, sticking, clouds, curtains (solid: they block the local player's shots and push the local
  // kid back), sprinklers, beacons (a teammate can jump to one) — with paint muted and hits dropped (the owner's arrive
  // apart). A ghost mine never goes off by itself: its owner decides (the end record). Damage the local player does to
  // a ghost device goes to its owner (netHurt); the owner's end record ends a ghost still standing.
  netGhost(a, d) {
    if (!Array.isArray(d)) return;
    const [op, gid] = d;
    if (op === 2) {
      const it = this.items.find((x) => x.ghost && x.gid === gid && x.state !== 'dead');
      if (!it) return;
      if (it.kind === 'mine') this._mineBlast(it);
      else if (it.state === 'stuck' || it.state === 'run') this._blast(it, _v.copy(it.pos).setY(it.pos.y + 0.2), it.sub.radius, it.sub.damageMax, it.sub.damageMin, it.sub.paintRadius, it.normal || UP);
      else this._destroy(it);
      it.state = 'dead';
      return;
    }
    const sub = SUBS[d[2]];
    if (!sub || this.items.some((x) => x.gid === gid)) return;
    if (op === 0) this._throw(a, sub, _v.set(d[3], d[4], d[5]), _v2.set(d[6], d[7], d[8]), true, gid);
    else if (op === 1) {
      const n = _v2.set(d[6], d[7], d[8]);
      const g = G.physics.raycast(_v3.set(d[3], d[4] + 0.4, d[5]), DOWN, 1.2, _hit);
      this._plant(a, sub, _v.set(d[3], d[4], d[5]), n, d[9], g.hit ? g : null, true, gid);
    }
  }
  // the owner's side of a hit on one of its devices, made on another screen
  netHurt(gid, dmg) {
    const it = this.items.find((x) => !x.ghost && x.gid === gid && x.state !== 'dead');
    if (it) this._hurt(it, dmg);
  }

  _fly(it, dt) {
    const s = it.sub;
    it.vel.y -= GRAV * dt;
    _v.copy(it.pos);
    it.pos.addScaledVector(it.vel, dt);
    // direct hits on enemies (pellet pops on them, murk bomb poisons them for the whole mist)
    if (it.kind === 'burst' || it.kind === 'mist') {
      for (const e of G.actors) {
        if (e.team === it.team || !e.alive) continue;
        Physics.segmentCapsuleDist(_v, it.pos, e.pos, PLAYER.radius + 0.1, e.form === 'squid' ? PLAYER.squidHeight : PLAYER.height, _res);
        if (_res.dist < PLAYER.radius + 0.12) {
          it.pos.lerpVectors(_v, it.pos, _res.t);
          if (it.kind === 'burst') { this._pelletBlast(it, e); it.state = 'dead'; } else { it.direct = e; this._startMist(it); }
          return;
        }
      }
    }
    // clouds burst in mid-air when their fuse runs out
    if ((it.kind === 'scan' || it.kind === 'mist') && it.age > s.fuse) { it.kind === 'scan' ? this._startCloud(it) : this._startMist(it); return; }
    const hit = G.physics.segment(_v, it.pos, _hit);
    if (hit.hit) {
      const n = hit.normal, floor = n.y > 0.6;
      switch (it.kind) {
        case 'sticky': return this._stick(it, hit, 'stuck', s.fuse);
        case 'sprinkler': return this._stick(it, hit, 'spray', 0);
        case 'burst': this._pelletBlast(it, null, hit.point); it.state = 'dead'; return;
        case 'scan': it.pos.copy(hit.point).addScaledVector(n, 0.3); return this._startCloud(it);
        case 'mist': it.pos.copy(hit.point).addScaledVector(n, 0.3); return this._startMist(it);
        case 'seeker': if (floor) return this._startRun(it, hit); break;
        case 'curtain': if (floor) return this._startCurtain(it, hit); break;
      }
      // bounce (seeker / curtain off walls, until they find a floor)
      it.pos.copy(hit.point).addScaledVector(n, 0.12);
      const vn = it.vel.dot(n);
      it.vel.addScaledVector(n, -vn * 1.4).multiplyScalar(0.55);
    }
    if (it.pos.y < PLAYER.waterY - 1.8) { it.state = 'dead'; return; }
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.x += it.spinV.x * dt; it.mesh.rotation.z += it.spinV.y * dt;
  }

  _stick(it, hit, state, fuse) {
    it.state = state; it.t = 0; it.fuse = fuse; it.beepT = 0;
    it.normal = hit.normal.clone();
    it.pos.copy(hit.point).addScaledVector(hit.normal, 0.005);
    it.face = hit.face; it.u = hit.u; it.v = hit.v;
    it.hp = it.sub.hp || 1; it.born = G.time;
    it.mesh.userData.inner.position.y = 0;
    it.mesh.position.copy(it.pos);
    it.mesh.quaternion.setFromUnitVectors(UP, hit.normal);
    if (state === 'spray') {
      // one sprinkler per player: a new one replaces the old
      for (const o of this.items) if (o !== it && o.owner === it.owner && o.kind === 'sprinkler' && o.state === 'spray') this._destroy(o);
      it.pulseT = 0; it.spin = 0;
    }
    if (nearCam(it.pos)) G.audio?.play('bomb_beep', { pos: it.pos, volume: 0.55, pitch: state === 'spray' ? 1.4 : 1 });
    emit('sub:land', { kind: it.kind, pos: it.pos.clone(), team: it.team, radius: it.sub.radius || 0 });
  }

  // ---- cling charge: stuck, blinking faster, then a wide blast
  _stuck(it, dt) {
    it.beepT -= dt;
    const k = clamp(it.t / it.fuse, 0, 1);
    it.mesh.scale.setScalar(1 + k * 0.3 + Math.sin(it.t * 40) * 0.025 * k);
    if (it.beepT <= 0) { it.beepT = lerp(0.45, 0.1, k); if (nearCam(it.pos)) G.audio?.play('bomb_beep', { pos: it.pos, volume: 0.3 + 0.4 * k, pitch: 1 + 0.3 * k }); }
    if (it.t >= it.fuse) {
      const s = it.sub;
      this._blast(it, it.pos, s.radius, s.damageMax, s.damageMin, s.paintRadius, it.normal);
      it.state = 'dead';
    }
  }

  // ---- skitter bomb: lands, scuttles after the nearest enemy laying a swimmable trail, bursts on reaching them
  _startRun(it, hit) {
    it.state = 'run'; it.t = 0;
    it.pos.copy(hit.point);
    it.heading = Math.atan2(it.dir.x, it.dir.z);
    it.trail = 0; it.stuckT = 0; it.target = null; it.dash = false;
    it.mesh.userData.inner.position.y = 0;
    it.mesh.rotation.set(0, it.heading, 0);
  }
  _run(it, dt) {
    const s = it.sub;
    if (!it.target || !it.target.alive) {
      let best = null, bd = s.seekRange;
      for (const e of G.actors) {
        if (e.team === it.team || !e.alive) continue;
        const d = e.pos.distanceTo(it.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (best !== it.target) it.dash = false;
      it.target = best;
    }
    // steering, made to be sidestepped: it turns at most s.turnRate (a wide circle at full speed) and, once close and
    // lined up (s.commitDist), dashes straight without steering, so a late sidestep makes it overshoot and swing round.
    // Onto a slow / standing target that sits inside its circle it slows into the turn (s.creep) instead of orbiting.
    let speed = s.speed;
    if (it.target) {
      const tg = it.target, dx = tg.pos.x - it.pos.x, dz = tg.pos.z - it.pos.z, dist = Math.hypot(dx, dz);
      let d = Math.atan2(dx, dz) - it.heading; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      if (!it.dash && dist < s.commitDist && Math.abs(d) < 0.35) it.dash = true;
      else if (it.dash && (Math.abs(d) > Math.PI / 2 || dist > s.commitDist + 1)) it.dash = false;
      if (!it.dash) {
        it.heading += clamp(d, -s.turnRate * dt, s.turnRate * dt);
        if (Math.hypot(tg.vel.x, tg.vel.z) < 2.5) speed *= 1 - s.creep * clamp((Math.abs(d) - 0.7) / 0.6, 0, 1);
      }
    }
    const hx = Math.sin(it.heading), hz = Math.cos(it.heading), step = speed * dt;
    // walls: turn away along them
    _v.copy(it.pos); _v.y += 0.2;
    const w = G.physics.raycast(_v, _v2.set(hx, 0, hz), step + 0.3, _hit2, true);
    if (w.hit && Math.abs(w.normal.y) < 0.5) {
      it.stuckT += dt;
      const side = hx * w.normal.z - hz * w.normal.x >= 0 ? 1 : -1;
      it.heading += side * 6 * dt;
    } else {
      it.stuckT = Math.max(0, it.stuckT - dt);
      const nx = it.pos.x + hx * step, nz = it.pos.z + hz * step;
      const gy = G.level.groundHeight(nx, nz, it.pos.y + 0.6);
      if (gy === -Infinity) { it.state = 'dead'; if (nearCam(it.pos)) G.fx?.burst(it.pos, UP, G.teamColors[it.team], { count: 10, speed: 3, size: 0.08 }); return; }
      it.pos.set(nx, gy, nz);
      it.trail += step;
      if (it.trail > 0.35) { it.trail = 0; const zone = { area: 0 }; this._credit(it, G.paint.splat(_v.copy(it.pos).setY(it.pos.y + 0.12), s.trailRadius, it.team, { seed: Math.random(), zoneOut: zone }), zone.area); }
    }
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.set(0, it.heading, 0);
    it.mesh.userData.inner.position.y = Math.abs(Math.sin(it.t * 26)) * 0.025;
    const reached = it.target && it.target.pos.distanceTo(it.pos) < s.triggerDist;
    if (reached || it.t > s.life || it.stuckT > 0.6) {
      this._blast(it, _v.copy(it.pos).setY(it.pos.y + 0.2), s.radius, s.damageMax, s.damageMin, s.paintRadius, UP);
      it.state = 'dead';
    }
  }

  // ---- echo orb: a sensing cloud that tags enemies it touches (tracked for the thrower's team)
  _startCloud(it) {
    it.state = 'cloud'; it.t = 0;
    it.mesh.visible = false;
    const col = G.teamColors[it.team];
    it.cloud = new THREE.Mesh(this.cloudGeo, new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.35), transparent: true, opacity: 0.4, depthWrite: false }));
    it.cloud.position.copy(it.pos); it.cloud.scale.setScalar(0.2);
    this.scene.add(it.cloud);
    it.tagged = new Set();
    if (nearCam(it.pos, 40)) G.audio?.play('special_activate', { pos: it.pos, volume: 0.45, pitch: 1.6 });
    emit('sub:cloud', { kind: 'scan', pos: it.pos.clone(), team: it.team, radius: it.sub.radius });
  }
  _cloud(it, dt) {
    const s = it.sub;
    const grow = clamp(it.t / 0.25, 0, 1), fade = clamp((it.t - s.cloudTime * 0.5) / (s.cloudTime * 0.5), 0, 1);
    it.cloud.scale.setScalar(lerp(0.2, s.radius, 1 - (1 - grow) ** 3));
    it.cloud.material.opacity = 0.4 * (1 - fade);
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive || it.tagged.has(e)) continue;
      if (_v.copy(e.pos).setY(e.pos.y + 0.7).distanceTo(it.pos) < s.radius * grow) {
        it.tagged.add(e);
        this.track(e, it.team, s.trackTime);
      }
    }
    if (it.t >= s.cloudTime) it.state = 'dead';
  }

  // ---- murk bomb: a poison mist (no damage) — slows and drains ink while inside; a direct hit lasts the whole mist
  _startMist(it) {
    it.state = 'mist'; it.t = 0;
    it.mesh.visible = false;
    const col = G.teamColors[it.team].clone().lerp(new THREE.Color(0.25, 0.2, 0.3), 0.55);
    it.cloud = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const p = new THREE.Mesh(this.cloudGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false }));
      const a = (k / 7) * Math.PI * 2;
      p.position.set(Math.cos(a) * 1.3 * (k ? 1 : 0), (k % 2) * 0.5, Math.sin(a) * 1.3 * (k ? 1 : 0));
      p.userData.ph = Math.random() * 6;
      it.cloud.add(p);
    }
    it.cloud.position.copy(it.pos);
    it.cloud.scale.setScalar(0.3);
    this.scene.add(it.cloud);
    if (it.direct) this.poison(it.direct, it.sub.mistTime);
    if (nearCam(it.pos, 40)) G.audio?.play('enemy_ink_sizzle', { pos: it.pos, volume: 0.7, pitch: 0.7 });
    emit('sub:cloud', { kind: 'mist', pos: it.pos.clone(), team: it.team, radius: it.sub.radius });
  }
  _mist(it, dt) {
    const s = it.sub;
    const grow = clamp(it.t / 0.4, 0, 1), fade = clamp((it.t - (s.mistTime - 0.8)) / 0.8, 0, 1);
    it.cloud.scale.setScalar(lerp(0.3, s.radius * 0.72, 1 - (1 - grow) ** 3));
    for (const p of it.cloud.children) {
      p.material.opacity = 0.3 * (1 - fade);
      p.scale.setScalar(1 + 0.12 * Math.sin(it.t * 1.7 + p.userData.ph));
      p.rotation.y += dt * 0.3;
    }
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (_v.copy(e.pos).setY(e.pos.y + 0.6).distanceTo(it.pos) < s.radius * grow) this.poison(e, 0.6);
    }
    if (it.t >= s.mistTime) it.state = 'dead';
  }

  // ---- drip curtain: a sheet of falling ink across the throw line; blocks enemy players and shots
  _startCurtain(it, hit) {
    const s = it.sub;
    it.state = 'curtain'; it.t = 0; it.hp = s.hp;
    it.pos.copy(hit.point);
    it.n = it.dir.clone();                               // curtain faces the thrower
    it.tan = new THREE.Vector3(-it.n.z, 0, it.n.x);
    it.mesh.userData.inner.position.y = 0;
    it.mesh.position.copy(it.pos);
    it.mesh.rotation.set(0, Math.atan2(it.n.x, it.n.z), 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: G.teamColors[it.team].clone() }, uTime: { value: 0 }, uLife: { value: 1 } },
      vertexShader: CURTAIN_VS, fragmentShader: CURTAIN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    it.sheet = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.height), mat);
    it.sheet.position.set(0, s.height / 2 + 0.05, 0);
    it.mesh.add(it.sheet);
    this._paintUnder(it, 1.4);
    if (nearCam(it.pos, 40)) G.audio?.play('swim_splash', { pos: it.pos, volume: 0.8, pitch: 0.8 });
    emit('sub:land', { kind: 'curtain', pos: it.pos.clone(), team: it.team, radius: s.width / 2 });
  }
  _curtain(it, dt) {
    const s = it.sub;
    it.hp -= s.decay * dt;
    it.sheet.material.uniforms.uTime.value = it.t;
    it.sheet.material.uniforms.uLife.value = clamp(it.hp / s.hp, 0, 1);
    const k = it.t < 0.25 ? it.t / 0.25 : 1;
    it.sheet.scale.set(1, k, 1); it.sheet.position.y = (s.height * k) / 2 + 0.05;
    if (it.hp <= 0) this._destroy(it);
  }

  // ---- twirl sprinkler: stuck to a surface, spraying pulses of droplets around itself (weaker after a while)
  _spray(it, dt) {
    const s = it.sub;
    it.pulseT -= dt;
    it.spin += dt * (it.t < s.sprayFade ? 9 : 4.5);
    const spin = it.mesh.userData.spin;
    if (spin) spin.rotation.y = it.spin;
    if (it.pulseT > 0 || it.ghost) return;   // (a ghost's drops: its owner's arrive as ghost rounds)
    it.pulseT = s.pulse * (it.t < s.sprayFade ? 1 : 2);
    const n = it.normal;
    // a tangent frame on the mounting surface; drops fan out around it, lobbed away from the surface
    const t1 = _v2.set(1, 0, 0); if (Math.abs(n.x) > 0.9) t1.set(0, 0, 1);
    t1.addScaledVector(n, -t1.dot(n)).normalize();
    const t2 = _v3.crossVectors(n, t1);
    const base = _v.copy(it.pos).addScaledVector(n, 0.2);
    for (let k = 0; k < s.drops; k++) {
      const a = it.spin * 1.7 + (k / s.drops) * Math.PI * 2 + Math.random() * 0.4;
      const out = Math.random() * 0.4 + 0.6, sp = 3.2 + Math.random() * 2.6;
      const vx = (Math.cos(a) * t1.x + Math.sin(a) * t2.x) * out + n.x * 0.75;
      const vy = (Math.cos(a) * t1.y + Math.sin(a) * t2.y) * out + n.y * 0.75;
      const vz = (Math.cos(a) * t1.z + Math.sin(a) * t2.z) * out + n.z * 0.75;
      G.projectiles.spawnDrop(it.owner, base, vx * sp, vy * sp, vz * sp, { damage: s.dropDamage, radius: 0.5 + Math.random() * 0.25, size: 0.08, weaponId: 'sprinkler' });
    }
  }

  // ---- lurk mine: hidden in its owner's ink; an enemy coming close sets it off (damage + tracking)
  _mine(it, dt) {
    if (it.ghost) return;   // (a remote player's mine goes off when its owner says: netGhost)
    const s = it.sub;
    const loc = G.local;
    const inOwnInk = it.face >= 0 && G.paint.sample(it.face, it.u, it.v) - 1 === it.team;
    it.mesh.visible = !loc || loc.team === it.team || !inOwnInk;
    if (it.fuse != null) {
      it.fuse -= dt;
      it.mesh.visible = true;
      it.mesh.scale.setScalar(1 + Math.sin(it.t * 50) * 0.08);
      if (it.fuse <= 0) this._mineBlast(it);
      return;
    }
    if (it.t < s.armTime) return;
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (e.pos.distanceTo(it.pos) < s.triggerRadius) {
        it.fuse = s.delay;
        if (nearCam(it.pos, 40)) G.audio?.play('bomb_beep', { pos: it.pos, volume: 0.8, pitch: 1.5 });
        emit('sub:arm', { kind: 'mine', pos: it.pos.clone(), team: it.team, radius: s.radius });
        return;
      }
    }
  }
  _mineBlast(it) {
    if (it.state === 'dead') return;
    const s = it.sub, c = _v.copy(it.pos).setY(it.pos.y + 0.3).clone();
    this._paint(it, c, s.paintRadius);
    G.fx?.explosion(c, G.teamColors[it.team], s.radius * 0.8);
    G.audio?.play('bomb_explode', { pos: c, volume: 0.7, pitch: 1.2 });
    emit('bomb:explode', { actor: it.owner, pos: c.clone(), team: it.team, radius: s.radius });
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      if (_v2.copy(e.pos).setY(e.pos.y + 0.7).distanceTo(c) > s.radius || !G.physics.los(c, _v2)) continue;
      G.projectiles.applyHit(it.owner, e, s.damage, 'mine');
      this.track(e, it.team, s.trackTime);
    }
    this.damageArea(c, s.radius, 30, it.team);
    it.state = 'dead';
  }

  // ---- hop beacon: a super-jump point for the team (two uses)
  _beacon(it, dt) {
    const spin = it.mesh.userData.spin;
    if (spin) spin.rotation.y += dt * 1.5;
  }
  beaconsFor(team) { return this.items.filter((it) => it.kind === 'beacon' && it.state === 'beacon' && it.team === team); }
  jumpToBeacon(actor, b) {
    if (!b || b.state !== 'beacon' || b.team !== actor.team) return false;
    const ok = actor.superJump(b.pos.clone());
    if (ok) actor._jumpBeacon = b;
    return ok;
  }
  _landedOnBeacon(actor) {
    const b = actor._jumpBeacon;
    if (!b) return;
    actor._jumpBeacon = null;
    if (b.state !== 'beacon') return;
    b.uses--;
    // a jumper who carries beacons themselves uses it up on landing
    if (b.uses <= 0 || actor.sub?.kind === 'beacon') this._destroy(b);
  }

  // ---------------------------------------------------------------------------------------------- effects
  track(e, team, time) {
    const st = e.status;
    const fresh = !(st.track > 0 && st.trackTeam === team);
    st.track = Math.max(st.trackTeam === team ? st.track : 0, time); st.trackTeam = team;
    if (fresh) emit('actor:tracked', { actor: e, team });
  }
  poison(e, time) {
    const fresh = !(e.status.poison > 0);
    e.status.poison = Math.max(e.status.poison, time);
    if (fresh) emit('actor:poisoned', { actor: e });
  }

  // paint + damage enemies (with line of sight) around a blast, like the splat bomb
  _blast(it, c, radius, dmgMax, dmgMin, paintRadius, n) {
    const center = c.clone();
    this._paint(it, _v2.copy(center).addScaledVector(n || UP, 0.2), paintRadius);
    G.fx?.explosion(center, G.teamColors[it.team], radius);
    G.audio?.play('bomb_explode', { pos: center });
    emit('shake', { pos: center.clone(), amount: 0.6 });
    emit('bomb:explode', { actor: it.owner, pos: center.clone(), team: it.team, radius });
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive) continue;
      _v3.copy(e.pos); _v3.y += 0.7;
      const d = _v3.distanceTo(center);
      if (d > radius || !G.physics.los(_v2.copy(center).addScaledVector(n || UP, 0.3), _v3)) continue;
      const k = 1 - clamp((d - 0.8) / (radius - 0.8), 0, 1);
      G.projectiles.applyHit(it.owner, e, lerp(dmgMin, dmgMax, k * k), it.kind);
    }
    this.damageArea(center, radius, 60, it.team);
    G.boss?.splash(it.owner, center, radius, dmgMax, dmgMin, it.kind);   // Boss Battle
  }
  _pelletBlast(it, direct, at) {
    const s = it.sub, c = (at || it.pos).clone();
    this._paint(it, _v2.copy(c).setY(c.y + 0.2), s.paintRadius);
    G.fx?.explosion(c, G.teamColors[it.team], s.radius * 0.8);
    G.audio?.play('blaster_boom', { pos: c, volume: 0.6, pitch: 1.2 });
    emit('bomb:explode', { actor: it.owner, pos: c.clone(), team: it.team, radius: s.radius });
    if (direct) G.projectiles.applyHit(it.owner, direct, s.directDamage, 'burst');
    for (const e of G.actors) {
      if (e.team === it.team || !e.alive || e === direct) continue;
      _v3.copy(e.pos); _v3.y += 0.7;
      if (_v3.distanceTo(c) > s.radius || !G.physics.los(_v2.copy(c).setY(c.y + 0.3), _v3)) continue;
      G.projectiles.applyHit(it.owner, e, s.splashDamage, 'burst');
    }
    this.damageArea(c, s.radius, 25, it.team);
    G.boss?.splash(it.owner, c, s.radius, s.directDamage, s.splashDamage, 'burst');   // Boss Battle
  }
  _paint(it, c, r) {
    let area = 0;
    const zone = { area: 0 };
    area += G.paint.splat(c, r, it.team, { seed: Math.random(), zoneOut: zone });
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, rr = r * (0.55 + Math.random() * 0.45);
      area += G.paint.splat(_v3.set(c.x + Math.cos(a) * rr, c.y + 0.3, c.z + Math.sin(a) * rr), 0.5 + Math.random() * 0.4, it.team, { seed: Math.random(), zoneOut: zone });
    }
    this._credit(it, area, zone.area);
  }
  _paintUnder(it, r) { const zone = { area: 0 }; this._credit(it, G.paint.splat(_v3.copy(it.pos).setY(it.pos.y + 0.2), r, it.team, { seed: Math.random(), zoneOut: zone }), zone.area); }
  // turf for the thrower; ink from a special (Bomb Barrage throws) never charges the special meter
  _credit(it, area, zoneArea = 0) { if (it.sp) it.owner.addTurfNoSpecial(area, zoneArea); else it.owner.addTurf(area, zoneArea); }

  // ---------------------------------------------------------------------------------------------- blocking + damage
  _hurt(it, dmg) {
    if (it.state === 'dead' || netMuted()) return;   // (a ghost's hit: its owner's copy decides)
    if (it.ghost) {   // a remote player's device: its owner's copy takes the hit (and says when it's gone)
      netHurt(it.owner, 'subs', it.gid, dmg);
      if (it.state === 'curtain') it.hp -= dmg;   // (the curtain fades as it's hit)
      return;
    }
    it.hp -= dmg;
    if (it.state === 'curtain') return;               // curtains fade instead; _curtain removes them at 0
    if (it.hp <= 0) this._destroy(it);
  }
  // an enemy shot segment: curtains absorb it (and lose hp); devices it touches are damaged
  blockShot(prev, pos, team, dmg) {
    for (const R of [MAIN_KITS, SUB_KITS]) for (const k in R) if (R[k].blockShot?.(prev, pos, team, dmg)) return true;   // kit shields / shoot-able bombs
    for (const it of this.items) {
      if (it.team === team) continue;
      if (it.state === 'curtain') {
        const s = it.sub;
        const a = _v.copy(prev).sub(it.pos).dot(it.n), b = _v2.copy(pos).sub(it.pos).dot(it.n);
        if ((a > 0) === (b > 0)) continue;
        const f = a / (a - b);
        _v3.lerpVectors(prev, pos, f).sub(it.pos);
        if (Math.abs(_v3.dot(it.tan)) > s.width / 2 || _v3.y < -0.2 || _v3.y > s.height) continue;
        this._hurt(it, dmg * s.shotMul);
        if (nearCam(it.pos)) G.fx?.burst(_v3.add(it.pos), it.n, G.teamColors[it.team], { count: 3, speed: 2, size: 0.06 });
        return true;
      }
      if (it.state === 'spray' || it.state === 'beacon') {
        const h = it.mesh.userData.lift * 2;                // model height
        _v.copy(it.pos).addScaledVector(it.normal || UP, h * 0.5);
        Physics.segmentCapsuleDist(prev, pos, _v2.copy(_v).setY(_v.y - h * 0.5), 0.3, h, _res);
        if (_res.dist < 0.34) { this._hurt(it, dmg); return true; }
      }
    }
    return false;
  }
  blockRay(from, dir, len, team, dmg) {
    for (const R of [MAIN_KITS, SUB_KITS]) for (const k in R) if (R[k].blockRay) len = Math.min(len, R[k].blockRay(from, dir, len, team, dmg));   // kit shields
    let best = len, hitIt = null;
    for (const it of this.items) {
      if (it.team === team || it.state !== 'curtain') continue;
      const s = it.sub;
      const dn = dir.dot(it.n);
      if (Math.abs(dn) < 1e-4) continue;
      const t = _v.copy(it.pos).sub(from).dot(it.n) / dn;
      if (t <= 0 || t >= best) continue;
      _v2.copy(from).addScaledVector(dir, t).sub(it.pos);
      if (Math.abs(_v2.dot(it.tan)) > s.width / 2 || _v2.y < -0.2 || _v2.y > s.height) continue;
      best = t; hitIt = it;
    }
    if (hitIt) this._hurt(hitIt, dmg * hitIt.sub.shotMul);
    return best;
  }
  damageArea(c, radius, dmg, team) {
    if (netMuted()) return;   // a ghost's blast: the owner's own blast hurts devices (netHurt carries it to theirs)
    G.specials?.areaHit(c, radius, dmg, team);
    for (const k in SUB_KITS) SUB_KITS[k].damageArea?.(c, radius, dmg, team);   // kit subs caught in a blast (torpedo)
    for (const it of this.items) {
      if (it.team === team || !(it.state === 'curtain' || it.state === 'spray' || it.state === 'beacon')) continue;
      if (it.pos.distanceTo(c) < radius + 0.4) this._hurt(it, dmg);
    }
  }
  // enemy players can't walk (or swim) through a curtain: push them back out to the side they're on
  blockActor(a) {
    for (const it of this.items) {
      if (it.state !== 'curtain' || it.team === a.team) continue;
      const s = it.sub;
      _v.copy(a.pos).sub(it.pos);
      const along = _v.dot(it.tan), across = _v.dot(it.n), r = PLAYER.radius + 0.12;
      if (Math.abs(along) > s.width / 2 + PLAYER.radius || _v.y < -1.2 || _v.y > s.height || Math.abs(across) > r) continue;
      const side = across >= 0 ? 1 : -1;
      a.pos.addScaledVector(it.n, side * r - across);
      const vn = a.vel.dot(it.n);
      if (vn * side < 0) a.vel.addScaledVector(it.n, -vn);
    }
  }

  _destroy(it) {
    if (it.state === 'dead') return;
    const c = _v.copy(it.pos).addScaledVector(it.normal || UP, 0.2);
    if (nearCam(c, 40)) {
      G.fx?.burst(c, it.normal || UP, G.teamColors[it.team], { count: 12, speed: 4, size: 0.08 });
      G.audio?.play('splat_small', { pos: c, volume: 0.7, pitch: 0.8 });
    }
    emit('sub:destroyed', { kind: it.kind, pos: c.clone(), team: it.team });
    it.state = 'dead';
  }
  _dispose(it) {
    this.scene.remove(it.mesh);
    if (it.cloud) {
      this.scene.remove(it.cloud);
      it.cloud.traverse?.((o) => o.material?.dispose());
      it.cloud.material?.dispose();
    }
    if (it.sheet) { it.sheet.geometry.dispose(); it.sheet.material.dispose(); }
  }
}
