// Regression tests for the browser-compat work (Brief B7): the GPU capability probe and the fallbacks it drives,
// plus the inline boot splash. Feature detection only — the point of these tests is that no branch of the renderer
// may depend on a half-float target existing.
// Run with: node test/compat.test.mjs — plain node, no browser, no WebGL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const { probeCaps, describe } = await import('../src/core/gpu-caps.js');

// Node has no WebGL globals; the probe's `instanceof WebGL2RenderingContext` check needs one to answer against.
class FakeGL2 { }
class FakeGL1 { }
globalThis.WebGL2RenderingContext = FakeGL2;

// A fake context is the whole point: the probe must answer from what the driver says it can do.
const fakeGL = ({ float = true, filterable = true, parallel = false, webgl2 = true, samples = 4, ext = true } = {}) =>
  Object.assign(new (webgl2 ? FakeGL2 : FakeGL1)(), {
    RENDERBUFFER: 0x8d41, TEXTURE_2D: 0x0de1, RGBA16F: 0x881a, RENDERABLE: 0x8d00, TEXTURE_FILTERABLE: 0x8b02,
    MAX_SAMPLES: 0x8d57,
    getExtension: (n) => (n === 'KHR_parallel_shader_compile' ? (parallel ? {} : null)
      : n === 'EXT_color_buffer_float' || n === 'EXT_color_buffer_half_float' ? (float ? {} : null)
        : n === 'EXT_texture_filter_anisotropic' ? (ext ? { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff } : null) : null),
    getParameter: (p) => (p === 0x84ff ? 16 : p === 0x8d57 ? samples : 0),
    // per spec: [] when not renderable, null when not filterable
    getInternalformatParameter: (t) => (t === 0x8d41 ? (float ? [4] : []) : (filterable ? [4] : null)),
  });

await test('B7: a driver with renderable half-float reports it (WebGL2 path)', () => {
  const c = probeCaps(fakeGL());
  assert.equal(c.halfFloat, true);
  assert.equal(c.halfFloatLinear, true);
  assert.equal(c.webgl2, true);
  assert.equal(c.maxSamples, 4);
});

await test('B7: no colour-buffer extension → no half-float, cleanly', () => {
  const c = probeCaps(fakeGL({ float: false }));
  assert.equal(c.halfFloat, false);
  assert.equal(c.halfFloatLinear, false, 'linear filtering is never claimed without the format itself');
});

await test('B7: half-float that cannot be filtered is reported as such (not silently "yes")', () => {
  const c = probeCaps(fakeGL({ filterable: false }));
  assert.equal(c.halfFloat, true);
  assert.equal(c.halfFloatLinear, false);
});

await test('B7: a driver whose internalformat query throws is not trusted with an HDR target', () => {
  const gl = fakeGL();
  gl.getInternalformatParameter = () => { throw new Error('GL_INVALID_OPERATION'); };
  assert.equal(probeCaps(gl).halfFloat, false);
});

await test('B7: WebGL1 (no getInternalformatParameter) trusts the extension alone', () => {
  const gl = fakeGL({ webgl2: false });
  delete gl.getInternalformatParameter;
  const c = probeCaps(gl);
  assert.equal(c.webgl2, false);
  assert.equal(c.halfFloat, true);
});

await test('B7: missing parallel-shader-compile is detected, not assumed', () => {
  assert.equal(probeCaps(fakeGL({ parallel: false })).parallelCompile, false);
  assert.equal(probeCaps(fakeGL({ parallel: true })).parallelCompile, true);
});

await test('B7: no user-agent or platform sniffing anywhere in the probe or the renderer', async () => {
  for (const p of ['../src/core/gpu-caps.js', '../src/core/renderer.js']) {
    // comments may name the browsers this was found on; executable code may not branch on them
    const code = (await read(p)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/userAgent|navigator\.platform|isFirefox|\bFirefox\b/i.test(code), `${p} must not sniff the browser`);
  }
});

await test('B7: the renderer falls back to an 8-bit target and disables bloom without HDR', async () => {
  const src = await read('../src/core/renderer.js');
  assert.ok(/this\.hdr = this\.caps\.halfFloat/.test(src), 'HDR support is read from the probe');
  assert.ok(/q\.bloom && this\.hdr\) \? THREE\.HalfFloatType : THREE\.UnsignedByteType/.test(src),
    'the composer target is 8-bit unless bloom is on *and* the driver has half-float');
  assert.ok(/this\.bloom\.enabled = !!\(q\.bloom && this\.settings\.bloom && this\.hdr\)/.test(src),
    'bloom is off without HDR (it thresholds HDR values)');
  // a falsy maxSamples (0, or a driver that reports nothing usable) must clamp to 0 too — the old
  // truthy-guard let the requested count through when maxSamples was 0 (E-008 follow-up finding)
  assert.ok(/!this\.caps\.maxSamples \|\| this\.samples > this\.caps\.maxSamples/.test(src),
    'MSAA is clamped to what the driver accepts (also when maxSamples is falsy)');
});

await test('B7: the inline boot splash shows before the modules load and hands over once', async () => {
  const html = await read('../index.html');
  assert.ok(/<div id="boot">/.test(html), 'the splash is in the HTML, so it exists before any module runs');
  assert.ok(/#boot-fill/.test(html) && /@keyframes boot-slide/.test(html), 'it animates on its own CSS');
  assert.ok(/prefers-reduced-motion/.test(html), 'and stops for players who asked for less motion');
  assert.ok(/pointer-events: none/.test(html.slice(html.indexOf('#boot {'), html.indexOf('#boot.is-out'))),
    'the splash never blocks input');
  assert.ok(/window\.inkwaveBootDone = function/.test(html), 'main.js can retire it');
  const main = await read('../src/main.js');
  assert.ok(/window\.inkwaveBootDone && window\.inkwaveBootDone\(\)|window\.inkwaveBootDone\(\)/.test(main),
    'the game retires the splash when the real loading screen is mounted');
  assert.ok(/this\.R\.capsLine/.test(main), 'the probed caps are logged at boot so a bug report carries the reason');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);