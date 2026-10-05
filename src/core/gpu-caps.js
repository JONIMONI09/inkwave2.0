// INKWAVE — GPU capability probe (feature detection only, never user-agent sniffing).
//
// Why this exists: the renderer used to assume a modern GL context. Firefox on Linux (and any machine falling back
// to software GL) can come up without renderable half-float colour buffers, and without KHR_parallel_shader_compile
// every `compileAsync` silently degrades to a blocking compile. Both failures used to surface as a black screen or a
// frozen boot, which is exactly the class of bug a capability probe removes.
//
// Nothing here looks at the user agent or the platform string: every answer comes from asking the driver what it can
// actually do (an extension being present, an internal format being renderable). `describe()` is logged once at boot
// so a bug report carries the real reason.

/** Half-float colour targets: needed by the HDR composer target, bloom, the showcase pedestal and the portrait read-back. */
function probeHalfFloat(gl) {
  // WebGL2 exposes RGBA16F as a core-sized format; it is only usable as a colour attachment with an extension.
  const ext = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  if (!ext) return false;
  // WEBGL1 (three's fallback context) has no getInternalformatParameter — the extension's presence is the answer there.
  if (typeof gl.getInternalformatParameter !== 'function') return true;
  try {
    return !!gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.RENDERABLE);
  } catch {
    return false;   // a driver that throws here is not one to trust with an HDR target
  }
}

/** Linear filtering of half-float textures: required by the bloom mip chain and the bloom taps. */
function probeHalfFloatLinear(gl) {
  if (!probeHalfFloat(gl)) return false;
  if (typeof gl.getInternalformatParameter !== 'function') return true;
  try {
    // Per the WebGL2 spec this returns null when the combination is not supported — so null means "cannot filter",
    // and only `undefined` (a partial implementation) is allowed to fall back to "yes".
    const f = gl.getInternalformatParameter(gl.TEXTURE_2D, gl.RGBA16F, gl.TEXTURE_FILTERABLE);
    return f === undefined ? true : !!f;
  } catch {
    return true;
  }
}

/**
 * Probe a live WebGL context. Returns a plain record the renderer and the boot log can read.
 * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
 */
export function probeCaps(gl) {
  if (!gl) return { webgl2: false, parallelCompile: false, halfFloat: false, halfFloatLinear: false, aniso: 0 };
  const parallelCompile = !!gl.getExtension('KHR_parallel_shader_compile');
  const halfFloat = probeHalfFloat(gl);
  const halfFloatLinear = halfFloat && probeHalfFloatLinear(gl);
  let aniso = 0;
  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) aniso = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 0;
  return {
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
    parallelCompile,
    halfFloat,
    halfFloatLinear,
    maxSamples: maxSamples(gl),
    aniso,
  };
}

/** Largest MSAA sample count the driver will actually accept for a colour target. */
function maxSamples(gl) {
  try {
    const v = typeof gl.getParameter === 'function' ? gl.getParameter(gl.MAX_SAMPLES) : null;
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** One-line, comma-separated summary for the boot log. */
export function describe(caps) {
  if (!caps) return 'gpu caps: none';
  return `gpu caps: webgl${caps.webgl2 ? '2' : '1'} · parallel-compile ${caps.parallelCompile ? 'yes' : 'no'}` +
    ` · half-float ${caps.halfFloat ? (caps.halfFloatLinear ? 'yes' : 'no-filter') : 'no'}` +
    ` · msaa≤${caps.maxSamples || 0}`;
}