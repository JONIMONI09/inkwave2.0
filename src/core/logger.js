// INKWAVE — intelligent console logging (src/core/logger.js).
// One small helper so the game logs everything that matters — boot steps, stage builds, match
// lifecycle, dynamic-resolution changes, sustained slow frames, uncaught errors — without ever
// spamming the console:
//   • every line is prefixed `[inkwave:<tag>]` so DevTools can filter a subsystem
//   • Log.occasional() rate-limits repeat events per tag (the first occurrence always logs)
//   • Log.steps() logs a step only when it changes, with the time since the previous one
//   • Log.debug() is silent unless `?verbose` is in the URL; warnings/errors always show
//   • install() hooks window.onerror / unhandledrejection so a crash on a device nobody owns
//     (e.g. an Android WebView) still leaves a trace in the console
const PFX = '[inkwave]';
const VERBOSE = (() => { try { return new URLSearchParams(location.search).has('verbose'); } catch { return false; } })();
const _last = new Map();   // tag → performance.now() of the last line that passed the rate limiter

function emit(kind, tag, args) {
  const c = kind === 'error' ? console.error : kind === 'warn' ? console.warn : console.info;
  c(`${PFX}:${tag}`, ...args);
}

export const Log = {
  verbose: VERBOSE,

  info(tag, ...args) { emit('info', tag, args); },
  warn(tag, ...args) { emit('warn', tag, args); },
  error(tag, ...args) { emit('error', tag, args); },
  debug(tag, ...args) { if (VERBOSE) emit('info', tag, args); },

  /** Rate-limited info line: at most one per `minMs` per tag (the first call always logs).
   *  Lazy args: a function argument is only called when the line actually logs — so a caller can
   *  pass an expensive summary that must not be built on suppressed (rate-limited) calls. */
  occasional(tag, minMs = 5000, ...args) {
    const t = performance.now();
    if (t - (_last.get(tag) ?? -Infinity) < minMs) return false;
    _last.set(tag, t);
    emit('info', tag, args.map((a) => (typeof a === 'function' ? a() : a)));
    return true;
  },

  /** Step logger for a load sequence: logs only when the step changes, with its duration. */
  steps(tag) {
    let prev = null, tPrev = performance.now();
    return (name) => {
      if (name === prev) return;
      const t = performance.now();
      const dt = prev == null ? '' : ` (+${((t - tPrev) / 1000).toFixed(1)}s)`;
      emit('info', tag, [`${name}${dt}`]);
      prev = name; tPrev = t;
    };
  },

  /** Catch uncaught errors + rejections once so crashes leave a console trace. */
  install() {
    if (typeof window === 'undefined' || this._installed) return;
    this._installed = true;
    window.addEventListener('error', (e) => {
      if (e.message || e.error) Log.error('crash', e.message, e.filename ? `(${e.filename}:${e.lineno})` : '');
    });
    window.addEventListener('unhandledrejection', (e) => Log.error('crash', 'unhandled rejection', e.reason?.message || String(e.reason ?? '')));
  },
};
