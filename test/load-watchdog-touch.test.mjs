// Regression tests for the match-start presentation, the hitch watchdog, the full-viewport touch
// editor, the PC touch lockout and the stronger touch aim assist (session: load/camera/watchdog/touch).
//
// Everything here is decidable without a GPU or a device (this container has none — E-007): contract
// assertions over the sources, mirroring the existing suites' static-test style. Run with:
// node test/load-watchdog-touch.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const main = await read('../src/main.js');
const menus = await read('../src/ui/menus.js');
const player = await read('../src/game/player.js');
const css = await read('../styles/ui.css');
const touchjs = await read('../src/core/touch.js');

// ---- 1. play → loading screen immediately, then the intro fly-over -------------------------------

await test('PLAY shows the loading screen immediately, not only after 600 ms', () => {
  // the old gate.slow timer hid the screen behind a blank fade for the first 600 ms
  assert.doesNotMatch(main, /gate\.slow/, 'no delayed loading timer left');
  assert.doesNotMatch(main, /setTimeout\(\(\) => \{ if \(!gate\.done\) \{ this\.menus\?\.show\('loading'\)/,
    'no delayed show of the loading screen');
  assert.match(main, /this\.menus\?\.show\('loading'\);\s*\n\s*this\.menus\?\.setLoading\(0\.1, 'Raising the arena…'\)/,
    'the themed loading screen goes up the moment PLAY is pressed');
});

await test('the loading screen leaves at the GO banner, before the intro camera runs', () => {
  // _gateDone is called exactly on the 'playing' state edge; the intro fly-over (_intro) only starts
  // on the 'intro' state edge, and the gate's finish() hides the loading screen — no overlap
  assert.match(main, /state === 'playing'\) \{\s*\n\s*this\._gateDone\(\)/,
    'gate closes on the playing edge');
  assert.match(main, /if \(state === 'intro'\) this\._intro\(\)/, 'the fly-over still starts on intro');
  assert.match(main, /if \(this\.menus\?\.current === 'loading'\) this\.menus\?\.show\(null\)/,
    'the loading screen is hidden by the gate, not torn down mid-render');
});

// ---- 2. hitch watchdog ---------------------------------------------------------------------------

await test('a hitch watchdog exists and shows the corner spinner, never a full overlay', () => {
  assert.match(main, /_hitchWatchdog\(dt\)/, 'the loop calls it every frame');
  assert.match(main, /_hitchWatchdog\(dt\) \{/, 'the method exists');
  assert.match(main, /this\.menus\?\.showBusy\('Catching up…'\)/, 'the cue is the corner busy spinner');
  const wd = main.slice(main.indexOf('_hitchWatchdog(dt) {'), main.indexOf('// Display refresh estimate'));
  assert.doesNotMatch(wd, /show\('loading'\)/, 'no full loading screen inside the watchdog body');
});

await test('the watchdog never overlaps menus, pause or the match-start loading screen', () => {
  // live requires: real match, not attract, not paused, NO menu/current screen up, playing or intro
  assert.match(main, /!m\.paused && !this\.menus\?\.current && \(m\.state === 'playing' \|\| m\.state === 'intro'\)/);
  // it clears itself the moment the state leaves live play
  assert.match(main, /if \(!live\) \{ if \(this\._hitchBusy\) \{ this\._hitchBusy = false; this\.menus\?\.hideBusy\(\); \} return; \}/);
});

await test('the watchdog needs sustained hitches, not one GC blip', () => {
  assert.match(main, /this\._hitchN >= 3/, 'three ≥50 ms frames in a row');
  assert.match(main, /dt > 1 \/ 20\)[^{]*\{\s*\n\s*this\._hitchN = \(this\._hitchN \|\| 0\) \+ 1/, 'threshold ≥ 50 ms');
});

// ---- 3. pre-warm: the whole kit list, idle-sized and cancellable ----------------------------------

await test('pre-warm compiles every weapon kind in cancellable idle batches', () => {
  assert.match(main, /_prewarmWeaponBatches\(\)/, 'the equipped-weapon warm chains into the batch pass');
  assert.match(main, /WEAPON_ORDER\.filter\(\(id\) => id !== \(this\.profile\.weapon \|\| 'shooter'\)\)/,
    'the rest of the kit list, equipped weapon first (already warm)');
  assert.match(main, /removeEventListener\('pointerdown', stop, true\)/, 'stops on user input');
  assert.match(main, /if \(G\.mode !== 'menu'\) return stop\(\)/, 'stops when a match starts');
  assert.doesNotMatch(main, /AudioContext[^\n]*prewarm/i, 'never touches audio before a user gesture');
});

// ---- 4. touch editor: full-viewport stage, buttons always reachable -------------------------------

await test('the touch editor stage spans the whole viewport like the real controls', () => {
  assert.match(css, /\.iw-tle__stage \{ position: absolute; left: 0;[^}]*width: 100vw; height: calc\(100vh - var\(--u\) \* 12\.4\)/);
  assert.doesNotMatch(css, /aspect-ratio: 16 \/ 9; max-width: 52vw/, 'the old small card is gone');
  // the panel must stay interactive ABOVE the stage (no overlap trap)
  assert.match(css, /\.iw-touchedit \.iw-tle \{[^}]*z-index: 2/, 'settings panel sits above the stage');
});

await test('editor drags stay clamped and buttons keep pointer-events', () => {
  assert.match(menus, /L\[orient\]\[drag\.id\]\.x = Math\.max\(0\.04, Math\.min\(0\.96, x \+ drag\.dx\)\)/,
    'a control can never end up off-screen');
  assert.match(css, /\.iw-tle__btn \{[^}]*pointer-events: auto/, 'every on-stage button stays grabbable');
  // the live layer applies the SAME record the editor edits — size slider reaches the game
  assert.match(touchjs, /applyLayout\(layout\)/, 'the touch layer consumes the layout record');
  assert.match(menus, /setEntry\(sel\.id, \{ s: v \}\)/, 'the size slider writes through to the record');
});

// ---- 5. PC: touch is locked out entirely ----------------------------------------------------------

await test('a fine pointer (PC) never builds the touch layer', () => {
  assert.match(main, /pointer: fine/, 'the pointer probe exists');
  assert.match(main, /isTouchDevice\(\) && !params\.has\('no-touch'\) && !finePointer/,
    'isTouch is false on a desktop with a mouse');
  // no touch layer ⇒ no touch input channel at all on PC
  assert.match(main, /if \(this\.isTouch\) this\.touch = new TouchControls/, 'the layer is only built when isTouch');
});

await test('a PC gets no Touch settings tab (its rows would be dead controls)', () => {
  assert.match(menus, /api\.isTouch && this\.api\.isTouch\(\)/, 'the menus ask whether touch is active');
  assert.match(menus, /SETTINGS_TABS\.filter\(\(t\) => t\.id !== 'touch'\)/, 'the touch tab is filtered out');
  assert.match(main, /isTouch: \(\) => !!self\.isTouch/, 'main exposes the device kind to the menus');
});

await test('touch auto-aim stays impossible on PC (touch-only by device, not just by setting)', () => {
  // the assist is gated on lastDevice === 'touch', which can never be set without the touch layer
  assert.match(player, /inp\.lastDevice === 'touch' && s\.touchAutoAim/);
  assert.match(player, /!usingPad && inp\.lastDevice === 'touch'/);
});

// ---- 6. stronger touch aim assist -----------------------------------------------------------------

await test('the touch aim assist strength was raised 0.65 → 0.8', () => {
  assert.match(player, /touchAutoAim \? 0\.8 : 0/, 'stronger ease for thumb precision');
  assert.doesNotMatch(player, /touchAutoAim \? 0\.65 : 0/, 'the old value is gone');
});

await test('the assist still releases by itself (no new lock semantics)', () => {
  assert.match(player, /_assistTarget\(strength\) \{/, 'the shared, LOS-verified target finder is unchanged in role');
  assert.match(player, /G\.physics\.los\(cam\.position, _c\)/, 'still never aims through walls');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
