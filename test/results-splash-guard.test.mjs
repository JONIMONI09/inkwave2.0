// Regression tests for the results coverage bar (no air gap, winner shove), the shared
// splashAttack fall-power helper (Tidal Slam + super-jump chain), the fullscreen re-trigger
// guard, and the README link/credits contract (E-013/E-014 session).
//
// The splashAttack maths is a pure function — pinned with real numeric assertions. The rest
// are contract assertions over the sources, mirroring the other suites. No GPU, no device
// (E-007): device look and feel remain the user's hands-on check.
// Run with: node test/results-splash-guard.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const actor = await read('../src/game/actor.js');
const css = await read('../styles/ui.css');
const main = await read('../src/main.js');
const readme = await read('../README.md');
const agents = await read('../AGENTS.md');

// ---- splashAttack: the fall-power maths (pure, so pinned numerically) -----------------------------

let splashAttack, SPLASH_ATTACK;
await test('splashAttack imports and is a pure function', async () => {
  ({ splashAttack, SPLASH_ATTACK } = await import('../src/game/actor.js'));
  assert.equal(typeof splashAttack, 'function');
  const a = { specialActive: { startY: 10 }, pos: { y: 5 } };
  const r1 = splashAttack(a, { y: 5 });
  const r2 = splashAttack(a, { y: 5 });
  assert.deepEqual(r1, r2, 'same inputs, same outputs (pure — no match state read)');
});

await test('a flat drop is shipped-power; a higher fall scales radius, damage and fx', () => {
  const flat = splashAttack({ specialActive: { startY: 2 }, pos: { y: 2 } }, { y: 2 });
  assert.equal(flat.radius, 1, 'no fall, no bonus');
  assert.equal(flat.damage, 1);
  const low = splashAttack({ specialActive: { startY: 4 }, pos: { y: 2 } }, { y: 2 });   // 2 m fall
  // 10 m fall: minFall 1 m grace is subtracted first, so k = 9/9 = 1 (full bonus)
  const high = splashAttack({ specialActive: { startY: 12 }, pos: { y: 2 } }, { y: 2 });
  assert.ok(high.radius > low.radius && low.radius > 1, 'radius grows with fall');
  assert.ok(high.damage > low.damage && low.damage > 1, 'damage grows with fall');
  assert.equal(high.fall, SPLASH_ATTACK.maxFall, 'max fall measured after the grace subtraction');
  assert.equal(high.radius, 1 + SPLASH_ATTACK.radiusBonus, 'max fall = full radius bonus');
  assert.equal(high.damage, 1 + SPLASH_ATTACK.damageBonus, 'max fall = full damage bonus');
});

await test('every multiplier is capped', () => {
  const s = splashAttack(
    { specialActive: { startY: 100, fromSuperJump: true }, pos: { y: 0 } }, { y: 0 });
  assert.ok(s.radius <= SPLASH_ATTACK.cap, `radius ${s.radius} within cap`);
  assert.ok(s.damage <= SPLASH_ATTACK.cap, `damage ${s.damage} within cap`);
  assert.equal(s.superJump, true, 'the super-jump chain is reported');
});

await test('a super-jump chain lands harder than the same fall without one', () => {
  const no = splashAttack({ specialActive: { startY: 11, fromSuperJump: false }, pos: { y: 2 } }, { y: 2 });
  const yes = splashAttack({ specialActive: { startY: 11, fromSuperJump: true }, pos: { y: 2 } }, { y: 2 });
  assert.ok(yes.radius > no.radius && yes.damage > no.damage, 'chain bonus applies');
});

await test('the slam consumes the helper; the cheer orb never does', () => {
  assert.match(actor, /splashAttack\(this, c\)/, '_slamImpact routes through the shared helper');
  assert.match(actor, /fromSuperJump: !!this\.superJumpState/, 'the arc chain is detected at special start');
  // the cheer orb lives in specials.js — the ONLY splashAttack call site in the game code is the slam impact
  assert.equal((actor.match(/splashAttack\(/g) || []).length, 2, 'one import-bearing declaration + one call site');
});

// ---- results coverage bar: neutral remainder + winner shove ---------------------------------------

await test('the coverage bars fill the whole track — the unpainted ground is neutral, not an air gap', () => {
  // each bar is its share of the PAINTED ground, stretched to the middle
  assert.match(css, /\.iw-cover__a \{ left: 0; width: calc\(var\(--pa\) \/ \(var\(--pa\) \+ var\(--pb\)/);
  assert.match(css, /\.iw-cover__b \{ right: 0; width: calc\(var\(--pb\) \/ \(var\(--pa\) \+ var\(--pb\)/);
});

await test('on landing the WINNER shoves the loser aside (whichever side won)', () => {
  assert.match(css, /\.iw-res__cover\.is-landed\.is-a \.iw-cover__a \{[^}]*max\(var\(--pa\), var\(--pb\)\)/, 'A winning pushes B to the edge');
  assert.match(css, /\.iw-res__cover\.is-landed\.is-b \.iw-cover__b \{[^}]*max\(var\(--pa\), var\(--pb\)\)/, 'B winning pushes A to the edge');
  assert.match(css, /transition: width \.45s var\(--spring\)/, 'the shove animates, it does not snap');
});

await test('Zone Control bars keep their full-track race layout (penalty hatches unaffected)', () => {
  assert.match(css, /\.iw-cover--zones \.iw-cover__a \{ width: 50%; \}/);
  assert.match(css, /var\(--pa\) \* 2 \* 100%\)/, 'pen positions compensate the 0..0.5 scale');
});

// ---- fullscreen re-trigger guard -------------------------------------------------------------------

await test('exiting fullscreen mid-match re-triggers it and tells the user why', () => {
  assert.match(main, /document\.addEventListener\('fullscreenchange'/, 'the guard listens for browser-forced exits');
  assert.match(main, /requestFullscreen\(\)\.catch/, 're-entry rides the next user gesture');
  assert.match(main, /Fullscreen stays on/, 'a toast explains the snap-back (and how to really exit)');
  assert.match(main, /removeEventListener\('pointerdown', re, true\)/, 'the gesture listener cleans itself up');
});

// ---- README contract: the Pages link works and the original repo is credited ------------------------

await test('the README play link points at this fork\u2019s Pages URL', () => {
  assert.match(readme, /https:\/\/jonimoni09\.github\.io\/inkwave2\.0\//, 'the live deployment URL');
  assert.doesNotMatch(readme, /inkwave-aah\.pages\.dev/, 'the stale upstream deployment link is gone');
  assert.match(readme, /https:\/\/github\.com\/JONIMONI09\/inkwave2\.0\/actions\/workflows\/ci\.yml/, 'CI badge is this fork\u2019s');
});

await test('the README credits the original repository and its author', () => {
  assert.match(readme, /## Credits/, 'a dedicated credits section');
  assert.match(readme, /jaydendavisnc\/inkwave/, 'the original repo');
  assert.match(readme, /Jayden Davis/, 'the original author');
  assert.match(readme, /fork of/, 'the fork relationship is stated plainly');
  assert.match(readme, /not affiliated with Nintendo/, 'the trademark disclaimer stays');
});

// ---- the whole-tree checker exists and is wired into the agent rules --------------------------------

await test('tools/check-deps.sh exists and is the documented whole-tree report', async () => {
  const tool = await read('../tools/check-deps.sh');
  assert.match(tool, /node --check/, 'section 1: syntax');
  assert.match(tool, /MISSING TARGET/, 'section 2: broken imports');
  assert.match(tool, /DUPLICATE EXPORT/, 'section 4: duplicate export report');
  assert.match(tool, /exit \$FAILED/, 'only hard failures set the exit code');
  assert.match(agents, /tools\/check-deps\.sh/, 'AGENTS.md documents the whole-tree check rule');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
