// Regression tests for the touch-control fixes (Brief B3 / B5 foundations): the map's tap catcher is
// touch-only, the movement zone hands its taps back while MAP is held (otherwise a tap never reaches the
// diorama), and the touch-layout storage is versioned, per-orientation and normalised.
// Run with: node test/touch.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

await test('B3: diorama tap-picking exists, is touch-gated and reuses the normal _jump path', async () => {
  const src = await read('../src/ui/diorama.js');
  assert.ok(/class: 'iw-dio__tap'/.test(src), 'a tap catcher layer is created');
  assert.ok(/addEventListener\('pointerdown', \(e\) => this\._tap\(e\)\)/.test(src), 'it listens for pointerdown');
  const tap = src.slice(src.indexOf('  _tap(e) {'), src.indexOf('  _head() {'));
  assert.ok(/G\.input\?\.touchOnly/.test(tap), 'taps only count on a touch device (mouse/keyboard/gamepad untouched)');
  assert.ok(/this\.k <= 0\.7/.test(tap), 'only while the map is really open');
  assert.ok(/this\._jump\(best, G\.match\?\.local\)/.test(tap), 'the same selection path as a click (queue while splatted)');
  assert.ok(/if \(i === 4\) continue;/.test(tap), "your own arrow is not a jump target");
  assert.ok(/preventDefault\(\)/.test(tap), 'no compatibility mouse events leak into aim/fire');
  assert.ok(/is-touch/.test(src), 'the catcher is armed through a touch-only class');
});

await test('B3: touch.js hands the whole screen to the map while MAP is held', async () => {
  const src = await read('../src/core/touch.js');
  assert.ok(/_setMapMode\(true\)/.test(src) && /_setMapMode\(false\)/.test(src), 'MAP down/up toggles map mode');
  const m = src.slice(src.indexOf('  _setMapMode(on) {'));
  assert.ok(/this\._aim\.style\.pointerEvents/.test(m), 'the look surface stops eating taps');
  assert.ok(/this\._zone\.style\.pointerEvents/.test(m), 'the movement zone stops eating taps (it covered the lower left)');
  assert.ok(/_releaseAll[\s\S]*_setMapMode\(false\)/.test(src), 'leaving a match restores both surfaces');
});

await test('B5: touch layout is versioned, per-orientation, normalised and clamped', async () => {
  const src = await read('../src/core/touch-layout.js');
  assert.ok(/export const TOUCH_LAYOUT_KEY = 'inkwave\.touchLayout'/.test(src), 'versioned storage key as the brief asks');
  assert.ok(/TOUCH_LAYOUT_VERSION = 1/.test(src), 'layout record carries a version');
  assert.ok(/portrait/.test(src) && /landscape/.test(src), 'separate portrait and landscape layouts');
  const norm = src.slice(src.indexOf('export function normalize'));
  assert.ok(/clamp01|clamp\(/.test(norm), 'positions are clamped to the viewport');
  assert.ok(/activeOrientation/.test(src) && /orientationFor/.test(src), 'the active orientation is derived at runtime, not guessed by a flag');
  // sanity: a stored record survives a round trip and rejects nonsense
  const { loadLayout, saveLayout, DEFAULT_LAYOUT, orientationFor, normalizeLayout } = await import('../src/core/touch-layout.js');
  globalThis.localStorage = {
    _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
  };
  assert.deepEqual(loadLayout(), DEFAULT_LAYOUT, 'no saved layout → the shipped defaults');
  const rec = loadLayout();
  rec.portrait.fire = { x: 0.82, y: 0.78, s: 1.15, o: 0.9 };
  saveLayout(rec);
  const back = loadLayout();
  assert.equal(back.portrait.fire.x, 0.82, 'positions persist as numbers');
  assert.equal(typeof back.portrait.fire.o, 'number', 'per-control opacity persists');
  const junk = { version: 1, portrait: { fire: { x: 9, y: -4, s: 0, o: 9 } }, landscape: {} };
  globalThis.localStorage.setItem('inkwave.touchLayout', JSON.stringify(junk));
  const fixed = loadLayout();
  assert.ok(fixed.portrait.fire.x <= 1 && fixed.portrait.fire.x >= 0, 'x clamped into the viewport');
  assert.ok(fixed.portrait.fire.y <= 1 && fixed.portrait.fire.y >= 0, 'y clamped into the viewport');
  assert.ok(fixed.portrait.fire.s >= 0.5, 'a tap target never shrinks below the minimum size');
  assert.ok(fixed.portrait.fire.o <= 1 && fixed.portrait.fire.o >= 0.2, 'opacity stays usable');
  assert.equal(orientationFor({ w: 400, h: 800 }), 'portrait');
  assert.equal(orientationFor({ w: 800, h: 400 }), 'landscape');
  assert.deepEqual(Object.keys(normalizeLayout(junk)).sort(), ['landscape', 'portrait', 'version']);
});

await test('B5: TouchControls applies the saved layout at runtime and on rotation', async () => {
  const src = await read('../src/core/touch.js');
  assert.ok(/applyLayout\(/.test(src), 'TouchControls applies a layout');
  assert.ok(/'resize'|orientationchange/.test(src), 'rotation re-applies it (separate portrait/landscape layouts)');
  assert.ok(/env\(safe-area-inset/.test(await read('../styles/ui.css')), 'safe areas stay in the CSS');
});

await test('B5: the editor screen is wired end to end (rows → screen → menu API → CSS)', async () => {
  const menus = await read('../src/ui/menus.js');
  assert.ok(/touchedit/.test(menus.match(/^const SCREENS = .*$/m)[0]), 'touchedit is a real screen, so it can be navigated to');
  assert.ok(/from '\.\.\/core\/touch-layout\.js'/.test(menus), 'the editor reads the store module instead of poking localStorage itself');
  assert.ok(/{ id: 'touch', label: 'Touch'[\s\S]*?type: 'touchedit'/.test(menus), 'a Touch settings tab opens the editor');
  assert.ok(/type: 'touchreset'/.test(menus), 'and a row that puts the shipped layout back');
  assert.ok(/this\._go\('touchedit'\)/.test(menus), 'the EDIT row navigates into the editor');

  // the three bugs that broke this screen the first time round
  assert.ok(!/this\.menus\?\.toast/.test(menus), 'the reset toast uses this.toast (this.menus does not exist on Menus)');
  assert.ok(!/_touchstamp/.test(menus), 'the reset row does not write a fake setting to force a redraw');
  const scr = menus.slice(menus.indexOf('  _scr_touchedit() {'), menus.indexOf('  // ================================================================ SCREEN: loading'));
  assert.ok(/e\.target\.dataset\.tw/.test(scr), 'a press straight on a button grabs that button (dragging is not restricted to empty card space)');
  assert.ok(/setPointerCapture/.test(scr), 'the drag survives the finger leaving the card');
  assert.ok(/Math\.max\(0\.04, Math\.min\(0\.96/.test(scr), 'a button cannot be dragged off the card or under a bezel');
  assert.ok(/sliders\.s\.value = String\(s\.s\)/.test(scr), 'picking another button resyncs the sliders to its own numbers');

  const main = await read('../src/main.js');
  for (const fn of ['getTouchLayout', 'setTouchLayout', 'touchOrientation'])
    assert.ok(new RegExp(`${fn}:`).test(main), `the menus can call api.${fn}()`);
  assert.ok(/saveLayout\(rec\)/.test(main), 'setTouchLayout persists and normalises the record');
  assert.ok(/self\.touch\?\.applyLayout\(norm\)/.test(main), 'and pushes it straight into the live touch layer');

  const css = await read('../styles/ui.css');
  for (const c of ['.iw-touchedit', '.iw-tle__stage', '.iw-tle__btn', '.iw-tle__slider', '.iw-tle__card', '.iw-tle__stick'])
    assert.ok(css.includes(c), `${c} is styled`);
  assert.ok(/\.iw-tle__stage\.is-portrait/.test(css), 'portrait edits a portrait card');
  assert.ok(/translate: -50% -50%/.test(css.slice(css.indexOf('.iw-tle__btn'), css.indexOf('.iw-tle__btn') + 300)), 'editor buttons are placed by their centre');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
