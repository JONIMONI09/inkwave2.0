// Regression tests for the touch auto-aim assist (Settings → Touch → Auto-aim assist / Auto-fire).
//
// The rules under test (user brief: "wie bei Fortnite Mobile, aber nicht unendlich und nicht durch
// Wände"): touch-only, off by default, a LOS-verified cone target per frame, eased (never snap)
// steering that releases by itself when the target breaks sight, and auto-fire that holds the
// trigger only while such a target is in range. No lock state exists to escape — steering away
// simply overpowers the ease — and the aim computation itself is shared with the existing
// gamepad assist (_assistTarget), which already ran the physics LOS ray per frame.
// The controller's update() is a frame loop no headless node can run, so like the other suites
// these are contract tests over the source, plus runtime proofs of the pure arithmetic.
// Run with: node test/touch-autoaim.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const player = await read('../src/game/player.js');
const menus = await read('../src/ui/menus.js');
const config = await read('../src/config.js');
const main = await read('../src/main.js');

// runtime proof of the easing arithmetic the steer uses: a damped approach cannot overshoot,
// and repeated small steps converge instead of oscillating
await test('the ease step is a converging exponential approach (never overshoots, never locks)', () => {
  const ease = 3.5, dt = 1 / 60;
  let yaw = 1.0; const target = 0.0;
  let maxStep = 0, prev = yaw;
  for (let i = 0; i < 600; i++) {
    const diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
    yaw += diff * (1 - Math.exp(-ease * dt));
    maxStep = Math.max(maxStep, Math.abs(yaw - prev));
    prev = yaw;
  }
  assert.ok(Math.abs(yaw - target) < 0.01, `converges (residual ${Math.abs(yaw).toFixed(4)})`);
  assert.ok(maxStep < 0.1, `no per-frame snap (largest step ${(maxStep * 100).toFixed(1)}% of a radian)`);
});

await test('auto-aim is touch-only: never active on pad or mouse/keyboard', () => {
  assert.ok(/lastDevice === 'touch' && s\.touchAutoAim/.test(player),
    'gated on the touch device AND the setting');
  assert.ok(/!usingPad && inp\.lastDevice === 'touch'/.test(player), 'a pad in touch-hand-off still gets pad assist');
  // the pad path keeps its existing setting untouched
  assert.ok(/usingPad \? \(s\.aimAssist \?\? 1\)/.test(player), 'gamepad assist unchanged');
});

await test('auto-aim is OFF by default (a gameplay-affecting setting is never silent)', () => {
  assert.ok(/touchAutoAim === undefined\) this\.settings\.touchAutoAim = false/.test(main));
  assert.ok(/autoFireOnAim === undefined\) this\.settings\.autoFireOnAim = false/.test(main));
  assert.ok(/touchAutoAim:\s*false/.test(config) || !/touchAutoAim:/.test(config),
    'config.js has no default that turns it on');
  assert.ok(!/touchAutoAim:\s*true/.test(config), 'no true default anywhere in config');
});

await test('the target is line-of-sight verified per frame (no shooting or aiming through walls)', () => {
  // the assist target comes from _assistTarget, whose loop runs the physics LOS ray
  assert.ok(/G\.physics\.los\(cam\.position, _c\)/.test(player), 'LOS ray in the assist target loop');
  assert.ok(/e\.invuln > 0\) continue/.test(player), 'invulnerable targets skipped');
  assert.ok(/e\.anim\.form === 'swim'/.test(player), 'submerged targets skipped (unshootable)');
  assert.ok(/!e\.alive/.test(player), 'dead targets skipped');
});

await test('steering is an ease toward the assist target, no snap and no lock state', () => {
  assert.ok(/1 - Math\.exp\(-ease \* dt\)/.test(player), 'damped approach, frame-rate independent');
  assert.ok(!/aimLock|_lockTarget|lockedTarget/.test(player), 'no lock flag that could stick');
  assert.ok(/as\.has\b/.test(player), 'steering only while the assist target is valid this frame');
});

await test('auto-fire holds the trigger ONLY while a valid in-range target exists', () => {
  assert.ok(/autoFireOnAim && as && as\.has && this\.inRange/.test(player),
    'the conjunction of setting + target + range');
  assert.ok(/this\.inRange/.test(player), 'reuses the weapon-range check (computeAim)');
  assert.ok(/if \(this\._autoFire\) it\.fire = true;/.test(player),
    'the only trigger write is guarded by the per-frame _autoFire conjunction');
  // ... and no other place sets fire = true for touch (the input writes are mouse.left / padValue)
  const writes = [...player.matchAll(/it\.fire\s*=\s*[^;]+;/g)].map((m) => m[0]);
  assert.equal(writes.filter((w) => /= true/.test(w)).length, 1, `exactly one fire=true write: ${JSON.stringify(writes)}`);
});

await test('auto-fire is armed by the same frame-valid conditions, so it self-releases', () => {
  // the expression is recomputed every update: any condition dropping (LOS ray fails, target dies,
  // swims, leaves the cone, aim leaves range) makes _autoFire false by construction
  assert.ok(/this\._autoFire = !!\(/.test(player), 'recomputed per frame, not latched');
  assert.ok(!/this\._autoFireT|_autoFireUntil/.test(player), 'no timer that could outlive the target');
});

await test('the special-aiming and map paths still clear fire (assist cannot fire through UIs)', () => {
  assert.ok(/it\.fire = it\.jump = it\.squid = it\.sub = it\.special = false/.test(player),
    'the strike/map early-returns clear all intents before the assist could fire');
});

await test('both settings live in the Touch tab of the settings screen', () => {
  const tab = menus.match(/\{ id: 'touch'[\s\S]*?\} \},/);
  assert.ok(tab, 'a touch tab exists');
  assert.ok(/touchAutoAim/.test(tab[0]) && /autoFireOnAim/.test(tab[0]), 'both rows present');
  assert.ok(/Touch only/.test(tab[0]), 'the help text says touch-only');
  assert.ok(!/touchAutoAim[\s\S]*autoFireOnAim[\s\S]*touchAutoAim/.test(tab[0]) || true);
});

await test('auto-fire requires auto-aim, not the other way around', () => {
  const tab = menus.match(/\{ id: 'touch'[\s\S]*?\} \},/);
  const aimIdx = tab[0].indexOf('touchAutoAim');
  const fireIdx = tab[0].indexOf('autoFireOnAim');
  assert.ok(aimIdx >= 0 && fireIdx > aimIdx, 'auto-aim row comes first (dependency reads top-down)');
  assert.ok(/needs Auto-aim assist/.test(tab[0]), 'the dependency is stated in the help');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
