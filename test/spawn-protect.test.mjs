// Regression tests for spawn protection (brief section 3).
//
// The rule under test: you are protected while you stand inside your own team's spawn dome and for SPAWN_PROTECT.leaveGrace
// seconds after you step out; hostile ink and bombs stop at the field instead of travelling through it; the protection
// is position-derived, never a second timer stacked on the respawn invulnerability.
//
// The dome geometry (spawn-protect.js) is pure arithmetic over G.level, so it is driven for real here. The actor-side
// wiring is asserted on source, since a node process has no Actor without a scene.
// Run with: node test/spawn-protect.test.mjs — plain node, no browser, no GPU.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const { G } = await import('../src/core/ctx.js');
const { SPAWN_PROTECT, PLAYER } = await import('../src/config.js');
const { inSpawnDome, spawnShieldCross } = await import('../src/game/spawn-protect.js');

// Alpha's pad at the origin, Bravo's mirrored 60 m away — the layout is a 180° rotation of itself.
G.level = { spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 60 }], spawnBarrier: 4.2 };
const V = (x, y, z) => ({ x, y, z });
// spawn-protect.js writes the crossing point into the caller's vector; in the game that is a THREE.Vector3, and a
// stub with the same two methods is all this arithmetic needs
const OUT = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy(v) { return this.set(v.x, v.y, v.z); } };

await test('inside your own dome you are protected; a few metres out you are not', () => {
  assert.equal(inSpawnDome(V(0, 0, 0), 0), true, 'standing on your own pad');
  assert.equal(inSpawnDome(V(SPAWN_PROTECT.radius - 0.1, 0, 0), 0), true, 'just inside the edge');
  assert.equal(inSpawnDome(V(SPAWN_PROTECT.radius + 0.1, 0, 0), 0), false, 'just outside the edge');
  assert.equal(inSpawnDome(V(0, 0, 0), 1), false, "standing on the other team's pad protects nothing for you");
});

await test('the dome has a lid: jumping onto the roof above your own pad is not protected', () => {
  assert.equal(inSpawnDome(V(0, SPAWN_PROTECT.height - 0.1, 0), 0), true, 'below the lid');
  assert.equal(inSpawnDome(V(0, SPAWN_PROTECT.height + 0.5, 0), 0), false, 'above the lid');
});

await test('hostile ink is stopped at the dome wall, at the crossing point', () => {
  const out = OUT;
  const hit = spawnShieldCross(V(-20, 0.5, 0), V(20, 0.5, 0), 0, out);   // fired at the dome from 20 m out
  assert.ok(hit, 'the segment crosses the field, so it is stopped');
  assert.ok(Math.abs(hit.x + SPAWN_PROTECT.radius) < 1e-6, 'stopped ON the wall, not at the far side');
  assert.ok(Math.abs(hit.z) < 1e-6 && Math.abs(hit.y - 0.5) < 1e-6, 'and the y/z of the original path is kept');
});

await test('ink that stops short of the dome passes through untouched', () => {
  const out = OUT;
  assert.equal(spawnShieldCross(V(-20, 0.5, 0), V(-12, 0.5, 0), 0, out), null, 'never reaches the field');
  assert.equal(spawnShieldCross(V(20, 0.5, 0), V(12, 0.5, 0), 0, out), null, 'and neither does ink heading away');
});

await test('ink that arcs over the top of the dome is not blocked by a wall it never touches', () => {
  const out = OUT;
  const over = spawnShieldCross(V(-20, SPAWN_PROTECT.height + 4, 0), V(20, SPAWN_PROTECT.height + 4, 0), 0, out);
  assert.equal(over, null, 'passes over');
  const under = spawnShieldCross(V(-20, 0.4, 0), V(20, 0.4, 0), 0, out);
  assert.ok(under, 'but a flat shot is stopped');
});

await test('a projectile already inside the dome is stopped where it is, not skipped', () => {
  const out = OUT;
  const hit = spawnShieldCross(V(1, 0.5, 1), V(2, 0.5, 1), 0, out);
  assert.ok(hit, 'cannot slip past by starting inside the radius');
  assert.equal(hit.x, 1, 'it is stopped at its start position');
});

await test('a diagonal entry still finds the wall', () => {
  const out = OUT;
  const hit = spawnShieldCross(V(-20, 0.5, -20), V(20, 0.5, 20), 0, out);
  assert.ok(hit, 'crosses');
  const d = Math.hypot(hit.x, hit.z);
  assert.ok(Math.abs(d - SPAWN_PROTECT.radius) < 1e-6, 'and lands exactly on the radius');
});

await test('the grace window is 3 s and is held at full while inside, so leaving always grants all of it', async () => {
  assert.equal(SPAWN_PROTECT.leaveGrace, 3.0, 'the brief asks for 3 seconds after leaving');
  const actor = await read('../src/game/actor.js');
  assert.ok(/this\.spawnGrace = P\.leaveGrace;/.test(actor), 'inside, the timer is pinned to full rather than counting down');
  assert.ok(/this\.spawnGrace = Math\.max\(0, this\.spawnGrace - dt\)/.test(actor), 'outside, it counts down');
  assert.ok(/this\.invuln > 0 \|\| this\.inSpawnZone \|\| this\.spawnGrace > 0/.test(actor),
    'protection is one OR of the three sources — re-entering re-arms the grace, it does not stack a second timer');
});

await test('the protection actually blocks damage and enemy ink', async () => {
  const actor = await read('../src/game/actor.js');
  const dmg = actor.slice(actor.indexOf('  damage(amount, attacker'), actor.indexOf('  damage(amount, attacker') + 400);
  assert.ok(/if \(this\.protected\) return false;/.test(dmg), 'damage() refuses while protected');
  assert.ok(!/if \(this\.invuln > 0\) return false;/.test(dmg), 'it is no longer the raw invuln timer alone');
  assert.ok(/!this\.protected && !\(this\.status\.shield > 0\)/.test(actor), 'enemy ink cannot chew a protected player either');
});

await test('respawn still resets the rule, so protection cannot stack across lives', async () => {
  const actor = await read('../src/game/actor.js');
  const reset = actor.slice(actor.indexOf('\n  reset() {'), actor.indexOf('\n  setSub('));
  assert.ok(/this\.spawnGrace = 0; this\.inSpawnZone = false;/.test(reset), 'reset() clears both');
  assert.ok(/this\.invuln = PLAYER\.spawnInvuln;/.test(actor), 'the existing respawn invulnerability is untouched and still set');
});

await test('both projectile and bomb lifecycles consult the field and consume the ordnance', async () => {
  const w = await read('../src/game/weapons.js');
  const step = w.slice(w.indexOf('  _step(p, dt) {'), w.indexOf('  _bossImpact(p, bh) {'));
  assert.ok(/spawnShieldCross\(p\.prev, p\.pos, 1 - p\.team/.test(step), 'projectiles test the field each step');
  assert.ok(/return true;/.test(step), 'and are consumed by it (no damage, no pass-through)');
  const bombs = w.slice(w.indexOf('  _updateBombs(dt) {'), w.indexOf('  _updateClouds(dt) {'));
  assert.ok(/spawnShieldCross\(_v, b\.pos, 1 - b\.team/.test(bombs), 'bombs test it too');
  assert.ok(/this\.scene\.remove\(b\.mesh\); this\.bombs\.splice\(i, 1\);/.test(bombs), 'a caught bomb is removed through the existing removal path, never exploded');
  assert.ok(!/_explodeBomb/.test(bombs.slice(bombs.indexOf('spawnShieldCross'), bombs.indexOf('spawnShieldCross') + 400)),
    'and specifically does not detonate inside the protected area');
});

await test('friendly ordnance is not affected by your own dome', async () => {
  const w = await read('../src/game/weapons.js');
  // the dome handed to the field query is 1 - team: your own team's pad is the one you are shielded BY, and the
  // query is only ever run for the dome belonging to the opposing team
  assert.ok(/spawnShieldCross\(p\.prev, p\.pos, 1 - p\.team/.test(w), 'the queried dome is the enemy one');
  assert.ok(/spawnShieldCross\(_v, b\.pos, 1 - b\.team/.test(w), 'same for bombs');
});

await test('the tunables live in config.js, not scattered through the modules', async () => {
  const actor = await read('../src/game/actor.js');
  assert.ok(/export const SPAWN_PROTECT = \{/.test(await read('../src/config.js')), 'a single config block exists');
  for (const k of ['radius', 'leaveGrace', 'hpRegen', 'inkRegen', 'intercept'])
    assert.ok(new RegExp(`\\b${k}:`).test(await read('../src/config.js')), `${k} is a named tunable`);
  assert.ok(!/leaveGrace\s*=\s*3\b/.test(actor), 'no magic copy of the grace value in actor.js');
});

await test('the dome query is dependency-free (no import cycle with weapons.js)', async () => {
  const sp = await read('../src/game/spawn-protect.js');
  assert.ok(!/from '\.\/weapons\.js'/.test(sp) && !/from '\.\/actor\.js'/.test(sp), 'spawn-protect imports neither side');
  const w = await read('../src/game/weapons.js');
  assert.ok(/from '\.\/spawn-protect\.js'/.test(w), 'weapons.js imports the shared module');
  assert.ok(!/from '\.\/actor\.js'/.test(w), 'and not actor.js (which imports weapons.js)');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);