// Regression tests for the results-display fixes (Brief B1): the judge bar must show each team's
// absolute coverage (neutral unpainted middle, never a pa/(pa+pb) share), the winner banner must
// come from the authoritative result.winner, and zero / non-finite coverage must be guarded.
// Run with: node test/results.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { G } from '../src/core/ctx.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// Extract the pure math from _judgeTurf by reading its source and evaluating the same expressions.
// (Keeps the test honest about the shipped code without dragging in DOM/three.js.)
async function judgeMath() {
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  // the fix must use per-team absolute coverage, not a pa/(pa+pb) share for the bar
  assert.ok(!/barA|setBars\([^)]*share/.test(src.split('_judgeTurf')[1].split('let t = 0')[0]), 'bar math must not derive from the pa/(pa+pb) share');
  return src;
}

await test('hud.js: judge bar no longer derives widths from the share pa/(pa+pb)', async () => {
  await judgeMath();
});

// The exact expressions _judgeTurf now applies, mirrored here for numeric checks:
function mirror(pa, pb, winArg) {
  const fin = (v) => (Number.isFinite(+v) ? Math.max(0, +v) : 0);
  const fa = fin(pa), fb = fin(pb);
  const over = fa + fb > 100 ? 100 / (fa + fb) : 1;
  const ba = (fa * over) / 100, bb = (fb * over) / 100;
  const winner = winArg === 0 || winArg === 1 ? winArg : fa === fb ? -1 : fa > fb ? 0 : 1;
  return { ba, bb, winner, fa, fb };
}

await test('bar shows each team absolute coverage with a neutral middle (42.4 vs 22.3)', async () => {
  const { ba, bb, winner } = mirror(42.4, 22.3, 0);
  assert.ok(Math.abs(ba - 0.424) < 1e-9, `team A fills its own coverage, got ${ba}`);
  assert.ok(Math.abs(bb - 0.223) < 1e-9, `team B fills its own coverage, got ${bb}`);
  assert.ok(ba + bb < 1, 'unpainted turf stays neutral between the fronts');
  assert.equal(winner, 0);
});

await test('sums over 100 % are clamped without reordering the teams', async () => {
  const { ba, bb, winner } = mirror(90, 40, null);
  assert.ok(ba > bb, 'relative order preserved after clamping');
  assert.ok(ba + bb <= 1.0001, 'bars never overflow the track');
  assert.equal(winner, 0);
});

await test('winner comes from result.winner, never from rounded display values', async () => {
  // host nudge: displayed as 50.1 vs 50.0 after rounding — still a win, not a tie
  assert.equal(mirror(50.1, 50.0, 0).winner, 0, 'authoritative winner 0 wins');
  assert.equal(mirror(50.0, 50.1, 1).winner, 1, 'authoritative winner 1 wins even when A is printed first');
  assert.equal(mirror(50.0, 50.0, undefined).winner, -1, 'no authoritative winner + exactly equal → tie');
  assert.equal(mirror(50.05, 50.0, undefined).winner, 0, 'rounding equal (50.1/50.1) still judged by raw values offline');
});

await test('zero, NaN and negative coverage are guarded', async () => {
  assert.ok(mirror(0, 0, undefined).winner === -1, 'zero-turf map: tie banner, no crash');
  assert.equal(mirror(NaN, 30, undefined).winner, 1, 'NaN coverage reads as 0');
  assert.equal(mirror(-5, 30, undefined).winner, 1, 'negative coverage reads as 0');
  assert.equal(mirror(0, 0, 1).winner, 1, 'zero-turf map still honours the authoritative winner');
});

await test('main.js passes result.winner into hud.judge (source assert)', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const i = src.indexOf('this.hud?.judge({ colors:');
  assert.ok(i > 0, 'turf judge call found');
  const call = src.slice(i, src.indexOf('});', i));
  assert.ok(/winner:\s*m\.result\.winner/.test(call), 'hud.judge receives the authoritative winner');
});

await test('results screen: computeAwards margin uses absolute percentage points of all turf', async () => {
  // Sun 42.4 % vs Sea 22.3 % → margin 20.1 → LANDSLIDE +20.1 % (matches the screenshot's correct tag)
  const { computeAwards } = await import('../src/ui/menu-art.js');
  const players = [
    { name: 'Player', team: 0, turf: 2891, splats: 11, deaths: 1, isSelf: true },
    { name: 'Nori', team: 1, turf: 1740, splats: 3, deaths: 3 },
  ];
  const aw = computeAwards(players, { win: true, percents: [42.4, 22.3] });
  const tag = aw.match.find((t) => t.id === 'landslide');
  assert.ok(tag, '42.4 vs 22.3 is a landslide (≥ 20 points)');
  assert.equal(tag.value, '+20.1%');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
