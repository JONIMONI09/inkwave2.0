// INKWAVE — hitch instrumentation (src/core/perf.js).
// Work-plan §2: a measured baseline before touching render/animation code. Everything here is
// passive: a frame-time ring with p50/p95/p99, a long-task PerformanceObserver, and named spot
// timings around the hot paths (sim / render / paint flush / nav A* / ZonePlan / minimap) plus
// sampled draw-call counters. No behavior change — read live in DevTools as `__inkwave.perf`;
// console lines fire only when a real hitch happens (rate-limited through Log).
import { G } from './ctx.js';
import { Log } from './logger.js';

const RING = 600;          // ~10 s of frames at 60 Hz
const MIN_MS = 4;          // ignore sub-frame sensor noise below this
const REPORT_MS = 45;      // a frame ≥ this is a hitch worth a line
const QUIET_MS = 8000;     // ...but at most one line per 8 s
const TASK_MS = 60;        // long-task observer threshold (ms of main-thread block)
const SUM_EVERY = 5;       // spot timings sampled 1 frame in N to keep the probe's own cost ~0

const S = {
  buf: new Float32Array(RING), idx: 0, filled: 0, n: 0,
  spots: {},                   // name → { seen, samples, sum, max }
  longTasks: { n: 0, total: 0, worst: 0 },
  tasksHooked: false,
  frameCalls: -1, frameTris: -1,
};

function hookTasks() {
  if (S.tasksHooked || typeof PerformanceObserver === 'undefined') return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < TASK_MS) continue;
        S.longTasks.n++; S.longTasks.total += e.duration;
        if (e.duration > S.longTasks.worst) S.longTasks.worst = e.duration;
        // only nag about a long task when it stands alone (a hitch frame already logs its own line)
        if (e.duration > 120) Log.occasional('perf', QUIET_MS, `long task ${e.duration | 0}ms`);
      }
    });
    po.observe({ type: 'longtask', buffered: false });
    S.tasksHooked = true;
  } catch { /* longtask unsupported (older Safari) — the ring still works */ }
}

function pct(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)));
  return sorted[i];
}

export const Perf = {
  /** Called once after boot: enables the long-task observer. */
  init() { hookTasks(); },

  /** One call per rendered frame. dt in seconds. */
  frame(dt) {
    const ms = dt * 1000;
    S.n++;
    if (ms >= MIN_MS && ms < 1000) {   // ≥1 s gaps are tab-switch returns, not hitches — keep them out of the ring
      S.buf[S.idx] = ms; S.idx = (S.idx + 1) % RING;
      if (S.filled < RING) S.filled++;
      if (ms >= REPORT_MS) Log.occasional('perf', QUIET_MS, `hitch ${ms | 0}ms · mode ${G.mode}`, () => this.summary());
      // summary is a THUNK: Log.occasional only calls it when the line passes the rate limiter. Building it
      // eagerly sorted 600 samples + stringified every spot on every hitch frame ≥45 ms — instrumentation
      // cost that spiked exactly while the game was already hitching (perf instrumentation self-infection).
    }
    // sampled renderer.info snapshot (calls/triangles of the last rendered frame)
    if (S.n % SUM_EVERY === 0) {
      const r = G.renderer?.info?.render;
      if (r) { S.frameCalls = r.calls; S.frameTris = r.triangles; }
    }
  },

  /** Spot timing for wrap-able sections: const v = Perf.spot('minimap', () => …) — fn runs as normal. */
  spot(name, fn) {
    const t0 = performance.now();
    const r = fn();
    this.record(name, performance.now() - t0);
    return r;
  },

  /** Manual record for sections with early returns or in-place args. */
  record(name, ms) {
    // aggregate every call: the timestamp is already paid for, and max must never miss a spike
    let s = S.spots[name];
    if (!s) s = S.spots[name] = { seen: 0, sum: 0, max: 0 };
    s.seen++; s.sum += ms;
    if (ms > s.max) s.max = ms;
  },

  /** One-line summary: percentiles over the ring, worst spot, long tasks, draw calls. */
  summary() {
    const n = S.filled, arr = Array.from(S.buf.subarray(0, n)).sort((a, b) => a - b);
    const p = (q) => +pct(arr, q).toFixed(1);
    const spots = Object.entries(S.spots)
      .map(([k, v]) => `${k} ${(v.sum / v.seen).toFixed(1)}ms(avg, ${v.max.toFixed(1)}max)`)
      .join(' · ');
    const lt = S.longTasks;
    const info = S.frameCalls >= 0 ? ` · ${S.frameCalls} calls ${S.frameTris} tris` : '';
    return `frame p50 ${p(0.5)} / p95 ${p(0.95)} / p99 ${p(0.99)}ms of ${n}${spots ? ` · ${spots}` : ''}${lt.n ? ` · ${lt.n} long tasks (worst ${lt.worst | 0}ms)` : ''}${info}`;
  },

  /** Full snapshot for audits / DevTools (`__inkwave.perf.snapshot()`). */
  snapshot() {
    const n = S.filled, arr = Array.from(S.buf.subarray(0, n)).sort((a, b) => a - b);
    const spots = {};
    for (const [k, v] of Object.entries(S.spots)) spots[k] = { avgMs: +(v.sum / v.seen).toFixed(2), maxMs: +v.max.toFixed(2), calls: v.seen };
    return {
      frames: n,
      p50: +(pct(arr, 0.5)).toFixed(2), p95: +(pct(arr, 0.95)).toFixed(2), p99: +(pct(arr, 0.99)).toFixed(2),
      max: n ? +arr[n - 1].toFixed(2) : 0,
      spots,
      longTasks: { ...S.longTasks },
      renderer: { calls: S.frameCalls, triangles: S.frameTris },
    };
  },
};
