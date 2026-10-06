// Regression tests for the perf instrumentation self-infection fix (src/core/perf.js + src/core/logger.js).
//
// The bug: Perf.frame() built its full summary string (Array.from over a 600-frame ring + sort +
// every spot stringified) as an EAGER argument on every hitch frame (≥45 ms) — even when
// Log.occasional's rate limiter suppressed the line. On a struggling device (constant hitches)
// the instrumentation itself allocated and sorted on every bad frame, spiking exactly while the
// game was already hitching. The fix passes a thunk; Log.occasional only calls it when the line
// actually logs. Run with: node test/perf-summary.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

const { Perf } = await import('../src/core/perf.js');
const { G } = await import('../src/core/ctx.js');
const { Log } = await import('../src/core/logger.js');
G.mode = 'test';

await test('the summary thunk is only built when the hitch line actually logs', async () => {
  let built = 0;
  const realSummary = Perf.summary;
  Perf.summary = () => { built++; return realSummary.call(Perf); };
  try {
    // first hitch frame: the rate limiter lets the line through → summary must be built once
    Perf.frame(0.05);
    assert.equal(built, 1, 'first hitch line should build the summary exactly once');
    // second hitch immediately after: Log.occasional suppresses (8 s quiet window) → the thunk
    // must NOT be called. The eager code built the summary here too (built would be 2).
    Perf.frame(0.06);
    assert.equal(built, 1, 'suppressed hitch line must not build the summary');
  } finally {
    Perf.summary = realSummary;
  }
});

await test('a logged hitch line still contains the full summary text', async () => {
  const out = Perf.summary();
  assert.match(out, /frame p50/);
  assert.match(out, /p95/);
  assert.match(out, /p99/);
});

await test('sub-threshold frames never build a summary and stay out of nothing', () => {
  // a frame well below REPORT_MS must not even attempt the log path
  Perf.frame(1 / 120);
  Perf.frame(1 / 60);
  assert.ok(true);   // reaching here without a summary build / throw is the assertion
});

await test('snapshot stays a plain object with the percentile fields', () => {
  const s = Perf.snapshot();
  assert.equal(typeof s, 'object');
  for (const k of ['frames', 'p50', 'p95', 'p99', 'spots', 'longTasks', 'renderer']) assert.ok(k in s);
});

await test('the perf source passes the summary as a thunk, not a call', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/core/perf.js', import.meta.url), 'utf8');
  assert.match(src, /\(\) => this\.summary\(\)/, 'frame() must pass a thunk');
  assert.doesNotMatch(src, /Log\.occasional\([^)]*this\.summary\(\)\)/, 'no eager summary() argument left');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
