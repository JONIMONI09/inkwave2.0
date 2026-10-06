// Regression tests for the GPU self-test shader repairs (E-011), the capability-probe cleanup,
// and the Android touch additions (touch sensitivity, browser fullscreen, portrait guard).
//
// Everything here is decidable without a GPU (this container has none — E-007): the tier logic
// around SETUP-ERROR verdicts, static shader-source hygiene (each test shader owns its outputs,
// no source-replaced uniforms, compile/link verified before drawing), the boot-order guarantee
// (tier resolved before the texlib; legacy skips the build), and the touch settings plumbing.
// Run with: node test/selftest-and-android.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const selftest = await read('../src/core/gpu-selftest.js');
const main = await read('../src/main.js');
const caps = await read('../src/core/gpu-caps.js');
const player = await read('../src/game/player.js');
const menus = await read('../src/ui/menus.js');

let verdictToTier, describeVerdict;
await test('the module imports and exports the tier mapping', async () => {
  ({ verdictToTier, describeVerdict } = await import('../src/core/gpu-selftest.js'));
  assert.equal(typeof verdictToTier, 'function');
  assert.equal(typeof describeVerdict, 'function');
});

await test('a SETUP-ERROR verdict never changes the render tier', () => {
  // ran:false = broken test shader / lost context / crash — NOT evidence about the GPU
  assert.equal(verdictToTier({ ran: false, error: 'shader failed to compile' }, false), null);
  assert.equal(verdictToTier(null, false), null);
  assert.equal(describeVerdict({ ran: false, error: 'x' }), 'SETUP ERROR: x');
});

await test('a genuine capability FAIL still downgrades to legacy', () => {
  assert.equal(verdictToTier({ ran: true, allPass: false, arraySampling: true, mrt: false, srgbAttachment: true, srgbBlending: true }, false), 'legacy');
  assert.equal(verdictToTier({ ran: true, allPass: true, arraySampling: true, mrt: true, srgbAttachment: true, srgbBlending: true }, false), 'full');
});

await test('every test shader declares its own outputs — _mat injects none', () => {
  // the E-011 bug: _mat prepended `out vec4 outColour;` while T1/T3/T4 declared it too (redefinition)
  const mat = selftest.slice(selftest.indexOf('_mat(fs'), selftest.indexOf('_quad()'));
  assert.doesNotMatch(mat, /out vec4 outColour/, '_mat must not inject a fragment output');
  assert.match(mat, /precision highp float;/, '_mat still adds the precision line');
});

await test('T1 passes the layer as a real uniform, never by editing shader source', () => {
  assert.match(selftest, /uniform int uLayer;/, 'the uniform declaration stays intact');
  assert.doesNotMatch(selftest, /\.replace\('uLayer/, 'no source-replace of the uniform');
  assert.match(selftest, /uniforms: \{ uLayer: \{ value: l \} \}/, 'the layer value is uploaded');
});

await test('T2 locates all three MRT outputs explicitly', () => {
  for (const loc of ['layout(location = 0) out vec4 c0;', 'layout(location = 1) out vec4 c1;', 'layout(location = 2) out vec4 c2;']) {
    assert.ok(selftest.includes(loc), `missing: ${loc}`);
  }
});

await test('every test verifies compile/link status BEFORE drawing', () => {
  // one _assertProgram call per test shader source: T1, T2, T3, T4(fill/blend/encode)
  const calls = (selftest.match(/this\._assertProgram\(/g) || []).length;
  assert.ok(calls >= 4, `expected ≥4 _assertProgram calls, found ${calls}`);
  assert.match(selftest, /COMPILE_STATUS/);
  assert.match(selftest, /LINK_STATUS/);
});

await test('a cheap GPU signature exists for verdict caching', () => {
  assert.match(selftest, /signature\(\)/);
});

await test('the tier is resolved BEFORE the texlib is built, and legacy skips that build', () => {
  const resolve = main.indexOf('this._resolveGpuTier();');
  const texlib = main.indexOf('createTextureLibrary');
  assert.ok(resolve > -1 && texlib > -1 && resolve < texlib, 'boot order: tier before texlib');
  assert.match(main, /skipping texture library \(legacy render path\)/);
  assert.match(main, /gpuSig/, 'the cached tier is invalidated when the GPU signature changes');
});

await test('capability probes no longer call getInternalformatParameter', () => {
  // comment mentions of the old bug are fine — actual gl.getInternalformatParameter calls are not
  assert.doesNotMatch(caps, /gl\.getInternalformatParameter/);
  assert.match(caps, /checkFramebufferStatus/, 'renderability via a real framebuffer completeness check');
});

await test('touch look uses its own sensitivity setting', () => {
  assert.match(player, /inp\.lastDevice === 'touch' \? \(s\.touchSensitivity \?\? s\.sensitivity \?\? 1\)/);
});

await test('the Touch settings tab has the sensitivity slider and browsers get fullscreen', () => {
  assert.match(menus, /key: 'touchSensitivity', label: 'Touch look sensitivity', type: 'slider'/);
  assert.match(menus, /document\.documentElement\.requestFullscreen/);
});

await test('a browser fullscreen path exists and a portrait guard protects the match view', () => {
  assert.match(main, /document\.documentElement\.requestFullscreen/);
  assert.match(main, /exitFullscreen/);
  assert.match(main, /iw-rotate/, 'the rotate-your-device overlay');
  assert.match(main, /_rotGuardUpdate\?\.\(\)/, 'the guard follows the live game mode');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
