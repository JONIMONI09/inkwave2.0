// Regression tests for the UX basics (input-aware tips, haptics, PWA manifest, focus-visible)
// and the P2P transport-factory seam. Plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const menusSrc = await read('../src/ui/menus.js');
const mainSrc = await read('../src/main.js');
const cfgSrc = await read('../src/config.js');
const sessionSrc = await read('../src/net/session.js');
const transportSrc = await read('../src/net/transport.js');

let tipPoolFor;
await test('input-aware loading tips: touch pool prepends gesture tips, keys pool is unchanged', async () => {
  ({ tipPoolFor } = await import('../src/ui/menus.js'));
  const touch = tipPoolFor('touch');
  const keys = tipPoolFor('keys');
  assert.ok(touch.length > keys.length, 'touch pool extends the classic pool');
  assert.ok(touch[0].includes('[FIRE]') || touch[0].includes('[SQUID]'), 'gesture tips come first');
  assert.ok(keys.every((t) => !t.includes('[FIRE]')), 'the keyboard pool has no touch buttons');
  assert.deepEqual(keys, touch.slice(touch.length - keys.length), 'the classic pool is kept, in order, at the end');
});

await test('main.js picks the hint from the real touch detection and menus exposes setInputHint', () => {
  assert.match(mainSrc, /setInputHint\?\.\(this\.isTouch \? 'touch' : 'keys'\)/);
  assert.match(menusSrc, /setInputHint\(kind\)/);
});

await test('haptics are opt-in, feature-detected and rate-limited', () => {
  assert.match(cfgSrc, /haptics: false/, 'default OFF — never vibrate without consent');
  assert.match(mainSrc, /!navigator\.vibrate\) return/, 'feature-detected');
  assert.match(mainSrc, /_lastHaptic/, 'rate-limited');
  assert.match(menusSrc, /key: 'haptics', label: 'Vibration \(haptics\)'/, 'a settings row exists');
});

await test('PWA manifest exists, is linked, and promises nothing it does not ship', async () => {
  const manifest = JSON.parse(await read('../manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'landscape', 'matches the landscape-only match view');
  assert.ok(manifest.icons?.length, 'icons declared');
  const html = await read('../index.html');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="icon" href="assets\/icon\.svg"/);
  const icon = await read('../assets/icon.svg');
  assert.ok(icon.includes('<svg'), 'the referenced icon file exists');
  assert.ok(!html.includes('serviceWorker'), 'no service worker — no offline claim without tests');
});

await test('keyboard focus gets a visible ring (:focus-visible)', async () => {
  const css = await read('../styles/ui.css');
  assert.match(css, /#ui-root :focus-visible/);
  assert.match(css, /outline: 2px solid #7cc4ff/);
});

await test('the transport factory exists and defaults to the relay transport', async () => {
  const { createTransport } = await import('../src/net/transport.js');
  const tr = await createTransport();
  assert.equal(typeof tr.connect, 'function');
  assert.equal(typeof tr.broadcast, 'function');
  assert.equal(typeof tr.sendTo, 'function');
  assert.equal(typeof tr.close, 'function');
  assert.ok('open' in tr, 'the Transport surface is intact');
});

await test('session.js uses the factory, and unknown tiers fall back to the relay', async () => {
  assert.doesNotMatch(sessionSrc, /new Transport\(\)/, 'no direct construction left');
  assert.match(sessionSrc, /createTransport\(kind\)/);
  assert.match(transportSrc, /falling back to relay/, 'a broken tier import degrades, never breaks online');
  const { createTransport } = await import('../src/net/transport.js');
  const tr = await createTransport('nonexistent-tier');
  assert.equal(typeof tr.connect, 'function', 'unknown tier → relay fallback, not a crash');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
