// Regression tests for the Cheer Orb rework (brief section 4).
//
// The requested behaviour: activate → rise slowly → HOVER (you cannot fly around, but you can turn and still throw
// the ball); the hover carries a shield that takes a lot of damage before it breaks; a "Yeah!" from you or your team
// makes it stronger and stronger; when it ends, everything is back to normal.
//
// Specials run inside the scene graph, so the state machine is asserted on source and the parts that ARE pure —
// the config numbers, the charge/shield mapping and the network packing — are executed for real.
// Run with: node test/cheer-orb.test.mjs — plain node, no browser, no GPU.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

const cfg = await read('../src/config.js');
const sp = await read('../src/game/specials.js');
const { CHEER_ORB, SPECIALS } = await import('../src/config.js');
const booyah = sp.slice(sp.indexOf('  booyah: {\n    start(a, s) {'), sp.indexOf('  // ---------------------------------------------------------------------------------------------- Zipline'));

await test('the tunables are named config values, not literals in the special', () => {
  assert.ok(/export const CHEER_ORB = \{/.test(cfg), 'a dedicated CHEER_ORB block exists');
  for (const k of ['riseSpeed', 'hoverHeight', 'landRecover', 'shieldMax', 'cheerShield', 'cheerShieldCap', 'shieldRegen'])
    assert.ok(new RegExp(`\\b${k}:`).test(cfg), `${k} is tunable`);
  const booyahDef = SPECIALS.booyah;
  for (const k of ['riseSpeed', 'hoverHeight', 'landRecover', 'shieldMax', 'cheerShield', 'shieldRegen'])
    assert.ok(!(k in booyahDef), `SPECIALS.booyah does not shadow ${k} — CHEER_ORB is the only home`);
});

await test('it rises slowly, then hovers at a fixed height over the ground below', () => {
  assert.ok(/a\.vel\.y = s\.rise;/.test(booyah), 'the climb is driven, not a teleport');
  assert.ok(/if \(a\.pos\.y >= floor \+ C\.hoverHeight\) \{ s\.rise = 0; a\.vel\.y = 0; \}/.test(booyah),
    'the rise ends once the hover height is reached');
  assert.ok(/const wantY = floor \+ C\.hoverHeight/.test(booyah), 'and it then holds that height');
  assert.ok(/G\.level\.groundHeight\(a\.pos\.x, a\.pos\.z/.test(booyah), 'relative to the ground below, so it works on any stage');
  assert.ok(CHEER_ORB.riseSpeed <= 6, `rise is slow (${CHEER_ORB.riseSpeed} m/s)`);
});

await test('you cannot fly around: horizontal velocity is damped to nothing, not steered', () => {
  assert.ok(/a\.vel\.x \*= 0\.86; a\.vel\.z \*= 0\.86;/.test(booyah), 'damped on the way up');
  assert.ok(/a\.vel\.x \*= 0\.82; a\.vel\.z \*= 0\.82;/.test(booyah), 'and while hovering');
  assert.ok(!/a\.intent\.move/.test(booyah), 'the movement stick is never read — there is no flight control');
  assert.ok(/speed: 0,/.test(booyah), 'and the special movement speed is zero');
});

await test('you can still turn, and the ball still charges and throws', () => {
  assert.ok(/aimFace: true/.test(booyah), 'aimFace stays on, so turning/aiming keeps working while hovering');
  assert.ok(/s\.charge = Math\.min\(1, s\.charge \+ dt \/ d\.charge\)/.test(booyah), 'the charge timer is untouched');
  assert.ok(/IMPL\.booyah\.throwIt\.call\(this, a, s\)/.test(booyah), 'and it still throws the ball');
  assert.ok(/autoThrow/.test(booyah), 'including the auto-throw');
  assert.equal(SPECIALS.booyah.charge, 4.5, 'the original charge time is unchanged');
  assert.equal(SPECIALS.booyah.radius, 8.4, 'and so is the blast');
});

await test('the shield soaks damage through the existing filterDamage hook', async () => {
  const fd = sp.slice(sp.indexOf('  filterDamage(v, amount, attacker, source) {'), sp.indexOf('  filterDamage(v, amount, attacker, source) {') + 900);
  assert.ok(/s\.id === 'booyah' && s\.shieldHp > CHEER_ORB\.shieldBreakAt/.test(fd), 'the orb intercepts damage');
  assert.ok(/this\._booyahShieldHit\(v, s, amount\); return 0;/.test(fd), 'and returns 0 — nothing reaches hp');
  const actor = await read('../src/game/actor.js');
  assert.ok(/G\.specials\.filterDamage\(this, amount, attacker, source\)/.test(actor), 'and it runs through the hook actor.js already calls');
});

await test('the shield takes a real beating and eventually breaks, ending the orb', () => {
  assert.ok(CHEER_ORB.shieldMax >= 100, `base pool is substantial (${CHEER_ORB.shieldMax})`);
  const hit = sp.slice(sp.indexOf('  _booyahShieldHit(a, s, amount) {'), sp.indexOf('  // A cheer feeds BOTH'));
  assert.ok(/s\.shieldHp = Math\.max\(C\.shieldBreakAt, s\.shieldHp - amount\)/.test(hit), 'damage drains it');
  assert.ok(/if \(s\.shieldHp <= C\.shieldBreakAt\)/.test(hit), 'and an empty shield breaks it');
  assert.ok(/this\.end\(a, 'shield'\)/.test(hit), 'which ends the orb — the way back to normal');
  assert.ok(/play\('shield_pop'/.test(hit) && /G\.fx\?\.burst/.test(hit), 'breaking it has pooled FX and a sound');
});

await test('a "Yeah!" makes the shield stronger, up to a cap', () => {
  const cheer = sp.slice(sp.indexOf('  _booyahCheer(s) {'), sp.indexOf('  giveShield(a, time, owner) {'));
  assert.ok(/s\.shieldHp = Math\.min\(C\.cheerShieldCap, \(s\.shieldHp \|\| 0\) \+ C\.cheerShield\)/.test(cheer),
    'a cheer adds shield hp, capped');
  assert.ok(/s\.charge = Math\.min\(1, \(s\.charge \|\| 0\) \+ d\.cheer\)/.test(cheer), 'and still charges the ball, as before');
  assert.ok(CHEER_ORB.cheerShield > 0 && CHEER_ORB.cheerShieldCap > CHEER_ORB.shieldMax,
    'cheering is worth doing even once the ball is full (it is capped, so a squad spamming C cannot make an unkillable orb)');
});

await test('cheers from you OR a teammate feed the orb — the existing team loop is reused', () => {
  const loop = sp.slice(sp.indexOf('  cheer(a) {'), sp.indexOf('  // ---------------------------------------------------------------------------------------------- per frame'));
  assert.ok(/o\.team !== a\.team \|\| !o\.alive \|\| !s \|\| s\.id !== 'booyah' \|\| s\.thrown/.test(loop),
    'the existing teammate scan is still the path');
  assert.ok(/this\._booyahCheer\(s\)/.test(loop), 'and it now feeds the shield too');
});

await test('landing grants 2 s of protection through the existing invulnerability', () => {
  assert.equal(CHEER_ORB.landRecover, 2.0, 'the brief asks for 2 seconds');
  assert.ok(/a\.invuln = Math\.max\(a\.invuln, C\.landRecover\)/.test(booyah),
    'granted via invuln so it composes with the spawn dome instead of stacking a third timer');
  assert.ok(!/spawnGrace/.test(booyah), 'it does not reach into the spawn-protection rule');
});

await test('ending the orb puts everything back', () => {
  const end = booyah.slice(booyah.indexOf('    end(a, s) {'));
  assert.ok(/this\._remove\(s\.ball, s\.halo, s\.bubble\)/.test(end), 'every mesh is removed');
  assert.ok(/s\.bubble\?\.material\.dispose\(\)/.test(end), 'and disposed');
  assert.ok(/a\.character\.subPropHidden = false/.test(end), 'the sub prop comes back');
  assert.ok(/s\.ball = s\.halo = s\.bubble = null/.test(end), 'and the state cannot be drawn twice');
});

await test('online: the shield pool travels in the ghost payload, still one int', () => {
  const pack = sp.slice(sp.indexOf('export function specialNetState'), sp.indexOf('export function specialNetApply'));
  const apply = sp.slice(sp.indexOf('export function specialNetApply'));
  assert.ok(/const ch = Math\.round\(clamp\(s\.charge \|\| 0, 0, 1\) \* 63\)/.test(pack), 'charge still takes bits 0–5');
  assert.ok(/const sh = Math\.round\(clamp\(\(s\.shieldHp \|\| 0\) \/ CHEER_ORB\.cheerShieldCap, 0, 1\) \* 255\)/.test(pack), 'shield takes bits 6–15');
  assert.ok(/return ch \| \(sh << 6\);/.test(pack), 'packed together — no new packet');
  assert.ok(/s\.shieldHp = \(\(v >> 6\) & 255\) \/ 255 \* CHEER_ORB\.cheerShieldCap/.test(apply), 'and decoded on the client');
});

await test('the shield has a visible bubble that reflects how worn it is', () => {
  assert.ok(/s\.bubble = new THREE\.Mesh\(this\.sphereGeo, bubbleMat\(a\.color\)\)/.test(booyah), 'a bubble, like Bubbler uses');
  assert.ok(/const wear = 0\.75 \+ 0\.65 \* \(s\.shieldHp \/ C\.shieldMax\)/.test(booyah), 'sized by the remaining pool');
  assert.ok(/s\.shieldPulse \* 0\.5/.test(booyah), 'swells when cheered');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);