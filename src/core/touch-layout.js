// Touch-control layout store: normalized button positions (viewport fractions), per-control size multiplier and
// opacity, kept separately for portrait and landscape and persisted under one versioned key.
//
// Why normalized: a phone's thumb reaches the corners, a tablet's does not, and the safe-area insets differ per
// device. Storing 0..1 fractions of the viewport (plus a clamp on every read) means a layout made on one phone is
// still sane on another, and a rotation switches to the other set instead of mirroring a landscape layout.
//
// Editor: src/ui/touch-editor.js (Settings → Touch layout) writes this record; core/touch.js applies it.
export const TOUCH_LAYOUT_KEY = 'inkwave.touchLayout';
export const TOUCH_LAYOUT_VERSION = 1;

const clamp01 = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : 0);
const clampRange = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : dflt);

// The controls a player can move. `x`/`y` are the button CENTRE in viewport fractions; `s` scales the size the CSS
// already picked (clamp() on vmin), so a layout never fights the design's own responsive sizing; `o` dims the
// button without hiding it. Order is the editor's order (thumb-side first).
export const TOUCH_CONTROLS = [
  { id: 'fire', label: 'FIRE', hint: 'Hold to charge' },
  { id: 'jump', label: 'JUMP', hint: 'Hop / dodge' },
  { id: 'squid', label: 'SQUID', hint: 'Hold to swim' },
  { id: 'sub', label: 'SUB', hint: 'Throw / bomb' },
  { id: 'special', label: 'SP', hint: 'Super Jump, once charged' },
  { id: 'cheer', label: 'C', hint: 'Cheer orb' },
  { id: 'map', label: 'MAP', hint: 'Hold: stage map + Super Jump' },
  { id: 'pause', label: 'II', hint: 'Pause' },
];

// Shipped defaults mirror the CSS layout in styles/ui.css (right-hand cluster, plus the two top-right buttons).
// A control missing from a saved record falls back to these.
export const DEFAULT_LAYOUT = {
  version: TOUCH_LAYOUT_VERSION,
  portrait: {
    fire: { x: 0.89, y: 0.80, s: 1, o: 1 },
    jump: { x: 0.71, y: 0.62, s: 1, o: 1 },
    squid: { x: 0.71, y: 0.94, s: 1, o: 1 },
    sub: { x: 0.94, y: 0.50, s: 1, o: 1 },
    special: { x: 0.71, y: 0.36, s: 1, o: 1 },
    cheer: { x: 0.53, y: 0.70, s: 1, o: 1 },
    map: { x: 0.71, y: 0.05, s: 1, o: 1 },
    pause: { x: 0.93, y: 0.05, s: 1, o: 1 },
  },
  landscape: {
    fire: { x: 0.93, y: 0.76, s: 1, o: 1 },
    jump: { x: 0.80, y: 0.50, s: 1, o: 1 },
    squid: { x: 0.80, y: 0.90, s: 1, o: 1 },
    sub: { x: 0.97, y: 0.50, s: 1, o: 1 },
    special: { x: 0.80, y: 0.26, s: 1, o: 1 },
    cheer: { x: 0.63, y: 0.66, s: 1, o: 1 },
    map: { x: 0.80, y: 0.09, s: 1, o: 1 },
    pause: { x: 0.95, y: 0.09, s: 1, o: 1 },
  },
};

// A tap target never shrinks below the platform's minimum, and a button never fades out of reach.
export const MIN_SIZE = 0.6, MAX_SIZE = 1.8, MIN_OPACITY = 0.2;

export const orientationFor = (vp) => ((vp && vp.w >= vp.h) ? 'landscape' : 'portrait');
const orientOf = () => orientationFor({ w: (typeof innerWidth === 'number' ? innerWidth : 800), h: (typeof innerHeight === 'number' ? innerHeight : 400) });

/** One control entry, clamped. `dflt` is the shipped default for that id. */
export function normalizeEntry(raw, dflt) {
  const d = dflt || { x: 0.5, y: 0.5, s: 1, o: 1 };
  const v = (k) => (raw && raw[k] !== undefined && raw[k] !== null ? raw[k] : d[k]);  // a missing field is the default, never 0
  return {
    x: clamp01(v('x')),
    y: clamp01(v('y')),
    s: clampRange(v('s'), MIN_SIZE, MAX_SIZE, 1),
    o: clampRange(v('o'), MIN_OPACITY, 1, 1),
  };
}

/** A whole record: both orientations, every known control, defaults filled in. */
export function normalizeLayout(raw) {
  const out = { version: TOUCH_LAYOUT_VERSION, portrait: {}, landscape: {} };
  for (const orient of ['portrait', 'landscape']) {
    const src = (raw && raw[orient]) || {};
    for (const c of TOUCH_CONTROLS) out[orient][c.id] = normalizeEntry(src[c.id], DEFAULT_LAYOUT[orient][c.id]);
  }
  return out;
}

/** Read the saved layout. Anything unreadable, foreign or corrupt falls back to the shipped defaults. */
export function loadLayout(key = TOUCH_LAYOUT_KEY) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    if (!raw || typeof raw !== 'object') return normalizeLayout(null);
    if (raw.version !== TOUCH_LAYOUT_VERSION) return normalizeLayout(null);   // future/old record: defaults, never crash
    return normalizeLayout(raw);
  } catch { return normalizeLayout(null); }
}

export function saveLayout(layout, key = TOUCH_LAYOUT_KEY) {
  const rec = normalizeLayout(layout);
  try { localStorage.setItem(key, JSON.stringify(rec)); } catch { /* private mode: the layout just isn't kept */ }
  return rec;
}

export function clearLayout(key = TOUCH_LAYOUT_KEY) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  return normalizeLayout(null);
}

/** The orientation the game is in right now (portrait vs landscape). */
export const activeOrientation = orientOf;

/**
 * Turn a layout entry into inline styles for one button. Positions are fractions of the touch layer's box, and the
 * layer already sits inside the safe-area insets (styles/ui.css), so a control dragged to the visual edge of the
 * play area is a real thumb's width from the bezel.
 */
export function entryToStyle(entry) {
  const e = normalizeEntry(entry);
  return `left:${(e.x * 100).toFixed(2)}%;top:${(e.y * 100).toFixed(2)}%;--tw-scale:${e.s.toFixed(3)};opacity:${e.o.toFixed(3)}`;
}
