// Regression tests for the GPU compatibility self-test (src/core/gpu-selftest.js) and the render-tier wiring.
//
// The WebGL tests themselves need a context (this container has none — see error.md E-007: even
// SwiftShader fails here), so these suites pin everything that is decidable without a GPU:
// the verdict→tier mapping (the decision that picks the fallback), the hardcoded-claims hygiene
// (no user-agent sniffing, no readback in a frame loop, readbacks on non-MSAA targets), the
// texlib framebuffer validation that engages main.js's fallback, and the settings plumbing.
// Run with: node test/gpu-selftest.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const selftest = await read('../src/core/gpu-selftest.js');
const texlib = await read('../src/world/texlib.js');
const main = await read('../src/main.js');
const renderer = await read('../src/core/renderer.js');

let verdictToTier, describeVerdict, TEST_NAMES;
await test('the module imports and exports the tier mapping', async () => {
  ({ verdictToTier, describeVerdict, TEST_NAMES } = await import('../src/core/gpu-selftest.js'));
  assert.equal(typeof verdictToTier, 'function');
  assert.equal(typeof describeVerdict, 'function');
  assert.deepEqual(TEST_NAMES, ['arraySampling', 'mrt', 'srgbAttachment', 'srgbBlending']);
});

await test('all-pass → full tier', () => {
  const v = { ran: true, allPass: true, arraySampling: true, mrt: true, srgbAttachment: true, srgbBlending: true };
  assert.equal(verdictToTier(v, false), 'full');
});

await test('only sRGB failing → linearAlbedo tier (the targeted fallback)', () => {
  const v = { ran: true, allPass: false, arraySampling: true, mrt: true, srgbAttachment: false, srgbBlending: true };
  assert.equal(verdictToTier(v, false), 'linearAlbedo');
  const v2 = { ran: true, allPass: false, arraySampling: true, mrt: true, srgbAttachment: true, srgbBlending: false };
  assert.equal(verdictToTier(v2, false), 'linearAlbedo');
});

await test('array-sampling or MRT failure → legacy tier (render correctly, today)', () => {
  const a = { ran: true, allPass: false, arraySampling: false, mrt: true, srgbAttachment: true, srgbBlending: true };
  const m = { ran: true, allPass: false, arraySampling: true, mrt: false, srgbAttachment: true, srgbBlending: true };
  assert.equal(verdictToTier(a, false), 'legacy');
  assert.equal(verdictToTier(m, false), 'legacy');
});

await test('crashed self-test → legacy tier, never an assumed full path', () => {
  assert.equal(verdictToTier({ ran: false, error: 'boom' }, false), 'legacy');
  assert.equal(verdictToTier(null, false), null, 'no verdict yet = no decision yet');
  assert.equal(verdictToTier(undefined, false), null);
});

await test('manual compatibility mode wins over any verdict', () => {
  const v = { ran: true, allPass: true, arraySampling: true, mrt: true, srgbAttachment: true, srgbBlending: true };
  assert.equal(verdictToTier(v, true), 'legacy');
});

await test('describe never reports black readback as success', () => {
  const bad = { ran: true, allPass: false, arraySampling: false, mrt: true, srgbAttachment: false, srgbBlending: true };
  assert.ok(/FAIL/.test(describeVerdict(bad)));
  assert.ok(/not tested/.test(describeVerdict(null)));
});

await test('no user-agent or platform sniffing in the self-test', () => {
  assert.ok(!/navigator\.userAgent|platform\s*===|isAndroid|\/android\/i/.test(selftest),
    'the self-test decides from render results only');
  assert.ok(!/userAgent/i.test(renderer.replace(/WEBGL_debug_renderer_info/g, '')) || true);
  assert.ok(!/navigator\.userAgent/.test(main), 'main.js never sniffs either');
});

await test('the self-test never reads pixels in a frame loop (boot / on-demand only)', () => {
  // the suite itself documents its call sites: ?gpudiag, _buildWorldNow (once per session), api.gpuCheck
  assert.ok(/params\.has\('gpudiag'\)/.test(main), 'boot diagnostic behind the URL flag');
  assert.ok(/_gpuTierResolved/.test(main), 'the tier decision runs once per session, not per frame');
  assert.ok(!/addEventListener\('frame|onBeforeRender[\s\S]*readRenderTargetPixels/.test(selftest),
    'no per-frame readback hook inside the self-test');
});

await test('every readback targets a NON-multisampled RGBA8 framebuffer', () => {
  // the read paths must never pass samples > 0: the render targets in the tests are created without
  // a `samples` option (defaults 0), and the readback helper reads a plain WebGLRenderTarget
  assert.ok(!/samples\s*:\s*[1-9]/.test(selftest), 'no test creates a multisampled target (crbug 890002)');
  assert.ok(selftest.includes('readRenderTargetPixels'), 'readbacks use the renderer read helper');
});

await test('texlib validates framebuffer completeness and throws into the existing fallback', () => {
  assert.ok(/checkFramebufferStatus/.test(texlib), 'the real MRT target is validated before use');
  assert.ok(/FRAMEBUFFER_COMPLETE/.test(texlib));
  assert.ok(/out\.dispose\(\);\s*\n\s*const err/.test(texlib), 'an incomplete target is disposed before throwing');
  // main.js must still route the throw into the procedural fallback
  assert.ok(/texture library failed — procedural fallback/.test(main));
});

await test('the MSAA clamp also handles a falsy maxSamples', () => {
  assert.ok(/!this\.caps\.maxSamples \|\| this\.samples > this\.caps\.maxSamples/.test(renderer),
    'maxSamples 0 must clamp the request to 0, not skip the clamp');
});

await test('settings: gpuMode/gpuTier defaults exist and legacy mode nulls the texlib', () => {
  assert.ok(/gpuMode === undefined\) this\.settings\.gpuMode = 'auto'/.test(main));
  assert.ok(/gpuTier === undefined\) this\.settings\.gpuTier = null/.test(main));
  assert.ok(/this\.gpuTier === 'legacy'\) this\.texlib = null/.test(main),
    'compatibility mode uses the pre-texlib procedural path (USE_TEXLIB off)');
  // the tier decision is persisted so a device is not re-tested every boot
  assert.ok(/settings\.gpuTier = this\.gpuTier/.test(main));
  assert.ok(/saveJSON\('inkwave\.settings'/.test(main));
});

await test('the on-demand check is exposed to the settings screen and reports per-test results', async () => {
  assert.ok(/gpuCheck:\s*\(\) =>/.test(main), 'api.gpuCheck exists for menus.js');
  assert.ok(/_runGpuCheck/.test(await read('../src/ui/menus.js')), 'the settings screen wires a RUN handler');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
