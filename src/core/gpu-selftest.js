// INKWAVE GPU self-test — render-and-readback compatibility probes (src/core/gpu-selftest.js).
//
// Why: on some Adreno/ANGLE driver stacks the texture-library path fails SILENTLY — maps render dark or
// washed-out while FPS stays fine, and nothing throws. getInternalformatParameter / extension probes
// cannot be trusted either (Chromium force-enables some colour-buffer formats on Android, so a probe
// can claim renderable while the actual render is wrong). The only source of truth is: draw the game's
// actual formats with the game's actual operations and READ THE PIXELS BACK.
//
// Rules (hard):
//   • feature detection + render self-tests only — NO user-agent sniffing anywhere in here.
//   • every readback targets a NON-multisampled RGBA8 framebuffer (readPixels with
//     EXT_multisampled_render_to_texture is broken on recent Adreno drivers, crbug 890002).
//   • comparisons involving sRGB expect ENCODED bytes (the driver is allowed to skip the readback
//     transform — Chromium reports `unsizedSRGBReadPixelsDoesntTransform` on these stacks).
//   • runs at boot or on demand (Settings button / ?gpudiag) — NEVER in the frame loop.
//   • every test restores renderer state (render target, autoClear) and disposes what it makes.
//   • each test shader declares its OWN fragment output(s) and compiles/links are VERIFIED before
//     drawing: a broken test shader is a SETUP ERROR (verdict.ran stays false, the tier must NOT
//     change), never a capability FAIL. Before this rule, injected/duplicated `outColour` and a
//     source-replaced uniform (E-011) made every desktop GPU report FAIL FAIL FAIL FAIL and forced
//     the legacy tier.
//
// Tests, each mirroring what the game actually does:
//   T1  texture-array sampling: two layers with known solid colours, sampled by layer index.
//   T2  MRT: write 3 attachments at once (the texlib generator's layout), read each back.
//   T3  sRGB attachment roundtrip: a known linear colour into an SRGB8_ALPHA8 attachment, read back,
//       must equal the ENCODED byte (validates the attachment's hardware encode).
//   T4  sRGB blending: blend two quads into an SRGB8_ALPHA8 attachment vs. the same blend into linear
//       RGBA8 with shader-side encode. Directly targets ANGLE's `srgbBlendingBroken` workarounds.

import * as THREE from 'three';

const DEG2ENCODE = (c) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

export const TEST_NAMES = ['arraySampling', 'mrt', 'srgbAttachment', 'srgbBlending'];

// Verdict → render tier (see main.js _applyRenderTier):
//   all pass            → 'full'        (array texture + MRT + sRGB attachments — the normal path)
//   only sRGB fails     → 'linearAlbedo' (albedo attachment linear, decode in shader — T3/T4 fail)
//   array sampling fail → 'atlas'       (2D atlas fallback; not implemented yet → legacy path today)
//   MRT fail            → 'legacy'      (sequential passes would be a bigger rebuild; legacy path today)
//   setup ERROR / crash / context lost / never ran → null (KEEP the current behaviour — a broken or
//   absent test must never change the tier; only a genuine capability FAIL may downgrade)
export function verdictToTier(verdict, preferLegacy) {
  if (preferLegacy) return 'legacy';
  if (!verdict) return null;                       // not tested yet — keep the current behaviour
  if (!verdict.ran) return null;                   // setup error / crash / context lost — not evidence
  if (verdict.allPass) return 'full';
  if (verdict.arraySampling && verdict.mrt && !(verdict.srgbAttachment && verdict.srgbBlending)) return 'linearAlbedo';
  return 'legacy';
}

export function describeVerdict(verdict) {
  if (!verdict) return 'not tested';
  if (!verdict.ran) return `SETUP ERROR: ${verdict.error || 'unknown'}`;
  const fmt = (v) => (v ? 'PASS' : 'FAIL');
  return `array ${fmt(verdict.arraySampling)} · mrt ${fmt(verdict.mrt)} · srgb-att ${fmt(verdict.srgbAttachment)} · srgb-blend ${fmt(verdict.srgbBlending)}`;
}

export class GpuSelfTest {
  constructor(renderer) {
    this.renderer = renderer;
    this.verdict = null;
  }

  // Cheap GPU signature (renderer + GL version) for caching the verdict in settings: when EITHER
  // changes, the cached tier is invalid and the test re-runs. Readback-free, boot-safe.
  signature() {
    const r = this.renderer;
    if (!r) return '';
    try {
      const gl = r.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return `${dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))} · ${gl.getParameter(gl.VERSION)}`;
    } catch { return ''; }
  }

  // Runs all tests. Returns the verdict record; every field is a boolean except `ran` / `error` /
  // `info` (a human line for the log). Idempotent: call again any time (the Settings button does).
  // `ran: false` + `error` = SETUP ERROR (broken test or lost context) — callers must keep the
  // current tier; it is NOT evidence about the GPU.
  run() {
    const r = this.renderer;
    const verdict = (this.verdict = {
      ran: false, arraySampling: false, mrt: false, srgbAttachment: false, srgbBlending: false,
      info: '', error: null,
    });
    // no renderer (called before boot creates it) → no verdict; callers null-check and keep the
    // current behaviour instead of downgrading the tier on a timing bug
    if (!r) return null;
    const gl = r.getContext();
    verdict.info = this.signature();
    // keep the whole suite alive on context loss: one lost context fails everything loudly instead of
    // throwing mid-run and leaving the game without a verdict
    if (gl.isContextLost()) { verdict.error = 'context lost'; return verdict; }

    const prevRT = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    try {
      verdict.arraySampling = this._t1ArraySampling(gl);
      verdict.mrt = this._t2Mrt(gl);
      verdict.srgbAttachment = this._t3SrgbAttachment(gl);
      verdict.srgbBlending = this._t4SrgbBlending(gl);
      verdict.ran = true;
      verdict.allPass = verdict.arraySampling && verdict.mrt && verdict.srgbAttachment && verdict.srgbBlending;
    } catch (e) {
      verdict.error = e?.message || String(e);
    } finally {
      r.setRenderTarget(prevRT);
      r.autoClear = prevAutoClear;
    }
    return verdict;
  }

  // ---- shader plumbing with compile/link verification ---------------------------------------------

  // Compile + link the raw shader pair DIRECTLY through gl (independent of three's material
  // machinery) and throw a setup error carrying the driver's log if either step fails. This is
  // what separates "our test shader is broken" (ERROR, no tier change) from "the GPU can't do it"
  // (FAIL): before E-011 was fixed, invalid test shaders were reported as capability failures.
  _assertProgram(gl, vs, fs) {
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) || 'unknown compile error';
        gl.deleteShader(sh);
        throw new Error(`self-test shader failed to compile: ${log}`);
      }
      return sh;
    };
    const v = mk(gl.VERTEX_SHADER, vs);
    const f = mk(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) || 'unknown link error';
      gl.deleteProgram(p);
      throw new Error(`self-test program failed to link: ${log}`);
    }
    gl.deleteProgram(p);
  }

  // 1×1-pixel shader material. `fs` MUST declare its own fragment output(s) — this helper adds only
  // the precision line (the old version injected `out vec4 outColour;` here, which redefined the
  // output the test shaders already declared and broke every T1/T3/T4 compile).
  _mat(fs, { blend = false, uniforms = null } = {}) {
    const vs = 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vs, fragmentShader: 'precision highp float;\n' + fs,
      depthTest: false, depthWrite: false, transparent: blend,
      blending: blend ? THREE.NormalBlending : THREE.NoBlending,
      uniforms,
    });
  }

  _quad() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    return g;
  }

  _rt(w, h, opts) {
    return new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, ...opts });
  }

  _renderQuad(rt, mat) {
    const r = this.renderer;
    const scene = new THREE.Scene();
    const q = new THREE.Mesh(this._quad(), mat);
    q.frustumCulled = false;
    scene.add(q);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    r.autoClear = true;
    r.setRenderTarget(rt);
    r.render(scene, cam);
    scene.remove(q);
    q.geometry.dispose();
    mat.dispose();
  }

  _read(rt) {
    const out = new Uint8Array(4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, out);
    return out;
  }

  _dispose(...rts) { for (const rt of rts) rt?.dispose?.(); }

  // ---- T1: texture-array sampling ------------------------------------------------------------------
  // Two layers, two known solid colours, sampled by layer index — mirrors the texlib's
  // DataArrayTexture albedo/normal/orm sampling in the level material. The layer index goes in as a
  // REAL uniform value — the old source-replace turned `uniform int uLayer;` into `uniform int 0;`
  // (a GLSL syntax error reported as a capability FAIL).
  _t1ArraySampling(gl) {
    const SIZE = 4, LAYERS = 2;
    const target = new THREE.WebGLArrayRenderTarget(SIZE, SIZE, LAYERS, {
      count: 1, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
    });
    try {
      const col = [
        [40, 200, 90],
        [200, 70, 30],
      ];
      this.renderer.initRenderTarget(target);
      const clear = new THREE.Color();
      for (let l = 0; l < LAYERS; l++) {
        clear.setRGB(col[l][0] / 255, col[l][1] / 255, col[l][2] / 255, THREE.NoColorSpace);
        this.renderer.setRenderTarget(target, l);
        this.renderer.setClearColor(clear, 1);
        this.renderer.clear(true, false, false);
      }
      // sample it back with the game's actual mechanism: a shader indexing sampler2DArray by layer
      const fs = `precision highp sampler2DArray;
uniform sampler2DArray tArr; uniform int uLayer; out vec4 outColour;
void main(){ outColour = texture(tArr, vec3(0.5, 0.5, float(uLayer))); }`;
      const vs = 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
      this._assertProgram(gl, vs, 'precision highp float;\n' + fs);
      for (let l = 0; l < LAYERS; l++) {
        const rt = this._rt(SIZE, SIZE, { type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace });
        const mat = this._mat(fs, { uniforms: { uLayer: { value: l } } });
        this._renderQuad(rt, mat);
        const px = this._read(rt);
        this._dispose(rt);
        if (!near(px[0], col[l][0], 6) || !near(px[1], col[l][1], 6) || !near(px[2], col[l][2], 6)) return false;
      }
      return true;
    } finally {
      this._dispose(target);
      this.renderer.setClearColor(0x9fd8f0, 1);
    }
  }

  // ---- T2: MRT — three attachments written in one pass, each read back -------------------------------
  // Mirrors the texlib generator (albedo / normal / orm written simultaneously). GLSL ES 3.00 needs
  // an explicit location on EVERY output when there is more than one — so this shader declares all
  // three and `_mat` adds none (the implicit unlocated output was the ANGLE link failure).
  _t2Mrt(gl) {
    const N = 4;
    const rt = new THREE.WebGLRenderTarget(N, N, {
      count: 3, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, colorSpace: THREE.NoColorSpace,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
      magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter,
    });
    try {
      this.renderer.initRenderTarget(rt);
      const fs = `precision highp float;
layout(location = 0) out vec4 c0;
layout(location = 1) out vec4 c1;
layout(location = 2) out vec4 c2;
void main(){ c0 = vec4(1.0, 0.0, 0.0, 1.0); c1 = vec4(0.0, 1.0, 0.0, 1.0); c2 = vec4(0.0, 0.0, 1.0, 1.0); }`;
      const vs = 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
      this._assertProgram(gl, vs, 'precision highp float;\n' + fs);
      const mat = this._mat(fs);
      const scene = new THREE.Scene();
      const q = new THREE.Mesh(this._quad(), mat);
      q.frustumCulled = false;
      scene.add(q);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.renderer.autoClear = true;
      this.renderer.setRenderTarget(rt);
      this.renderer.render(scene, cam);
      scene.remove(q);
      q.geometry.dispose();
      mat.dispose();
      const want = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
      for (let a = 0; a < 3; a++) {
        const px = new Uint8Array(4);
        this.renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px, undefined, a);
        if (!near(px[0], want[a][0], 6) || !near(px[1], want[a][1], 6) || !near(px[2], want[a][2], 6)) return false;
      }
      return true;
    } finally {
      this._dispose(rt);
    }
  }

  // ---- T3: sRGB attachment roundtrip -----------------------------------------------------------------
  // Known linear colour → SRGB8_ALPHA8 attachment → read back: must equal the ENCODED byte (the
  // driver may skip the readback transform — Chromium reports that on these stacks — so the only
  // thing we can insist on is that the STORED byte is the correct encoding).
  _t3SrgbAttachment(gl) {
    const N = 4;
    const rt = this._rt(N, N, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
    try {
      this.renderer.initRenderTarget(rt);
      const lin = [0.5, 0.25, 0.125];
      const fs = `precision highp float; out vec4 outColour;
void main(){ outColour = vec4(${lin[0]}, ${lin[1]}, ${lin[2]}, 1.0); }`;
      const vs = 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';
      this._assertProgram(gl, vs, fs);
      this._renderQuad(rt, this._mat(fs));
      const px = this._read(rt);
      // black readback is a FAILURE, not success
      if (px[0] === 0 && px[1] === 0 && px[2] === 0) return false;
      const want = [DEG2ENCODE(lin[0]), DEG2ENCODE(lin[1]), DEG2ENCODE(lin[2])];
      if (!near(px[0], want[0], 10) || !near(px[1], want[1], 10) || !near(px[2], want[2], 10)) return false;
      return true;
    } finally {
      this._dispose(rt);
    }
  }

  // ---- T4: sRGB blending ---------------------------------------------------------------------------
  // Two quads blended into an SRGB8_ALPHA8 attachment vs. the same blend into linear RGBA8 with
  // shader-side encode (the tier-`linearAlbedo` operation). If the two disagree beyond tolerance,
  // sRGB blending is broken on this driver and the attachment must be linear.
  _t4SrgbBlending(gl) {
    const N = 4;
    // three's NormalBlending = src-alpha over: out = src*sa + dst*(1-sa)
    const fsBlend = `precision highp float; out vec4 outColour;
void main(){ outColour = vec4(0.5, 0.5, 0.5, 0.5); }`;
    const fsEncode = `precision highp float; out vec4 outColour;
vec3 enc(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){ outColour = vec4(enc(vec3(0.5, 0.5, 0.5)), 0.5); }`;
    const lin = [0.2, 0.35, 0.5];
    const fsFill = `precision highp float; out vec4 outColour;
void main(){ outColour = vec4(${lin[0]}, ${lin[1]}, ${lin[2]}, 1.0); }`;
    const vs = 'in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';

    const srgbRT = this._rt(N, N, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
    const linRT = this._rt(N, N, { type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace });
    try {
      this.renderer.initRenderTarget(srgbRT);
      this.renderer.initRenderTarget(linRT);
      // validate every shader source BEFORE drawing — a setup problem must not read as a FAIL
      this._assertProgram(gl, vs, fsBlend);
      this._assertProgram(gl, vs, fsEncode);
      this._assertProgram(gl, vs, fsFill);
      // pass 1: opaque fill (distinct colours per target path)
      this._renderQuad(srgbRT, this._mat(fsFill));
      this._renderQuad(linRT, this._mat(fsFill));
      // pass 2: the SAME 0.5/0.5 blend into both
      const blendSrgb = this._mat(fsBlend, { blend: true });
      const blendLin = this._mat(fsEncode, { blend: true });
      this.renderer.autoClear = false;
      const scene = new THREE.Scene();
      const q = new THREE.Mesh(this._quad(), blendSrgb);
      q.frustumCulled = false;
      scene.add(q);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.renderer.setRenderTarget(srgbRT);
      this.renderer.render(scene, cam);
      q.material = blendLin;
      this.renderer.setRenderTarget(linRT);
      this.renderer.render(scene, cam);
      scene.remove(q);
      q.geometry.dispose();
      blendSrgb.dispose();
      blendLin.dispose();

      const a = this._read(srgbRT);
      const b = this._read(linRT);
      if ((a[0] === 0 && a[1] === 0 && a[2] === 0) || (b[0] === 0 && b[1] === 0 && b[2] === 0)) return false;
      const tol = 14;   // 8-bit sRGB blending is inherently non-linear; matching within ~5 % is the bar
      return near(a[0], b[0], tol) && near(a[1], b[1], tol) && near(a[2], b[2], tol);
    } finally {
      this._dispose(srgbRT, linRT);
      this.renderer.setClearColor(0x9fd8f0, 1);
    }
  }
}
