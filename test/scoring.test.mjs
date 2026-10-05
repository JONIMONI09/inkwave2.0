// Regression tests for the scoring-correctness fixes (P1 in the gameplay-manager brief).
// Run with: node test/scoring.test.mjs — plain node, no browser, no GPU.
// Covers:
//   P1.1  zone-turf credit is per-cell (inside/outside the live zone, aiming never matters, repaint)
//   P1.2  ineligible paint (wall / ceiling / buried / own repaint) grants no turf or special credit
//   P1.3  deterministic turf tie-break (Alpha wins exact ties with the displayed +0.1 %)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G } from '../src/core/ctx.js';
import { PaintSystem } from '../src/world/paint.js';
import { Match } from '../src/game/match.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ------------------------------------------------------------------ harness: a PaintSystem without WebGL
// A stub renderer is enough for the CPU path (atlas layout + grid); _initGPU builds render targets but never
// renders, which node's three.js tolerates. _drawQuads touches the GL-ish surface but with zero quads queued it
// never reaches the render-target calls.
const stubRenderer = {
  capabilities: { getMaxAnisotropy: () => 1 },
  getRenderTarget: () => null,
  setRenderTarget: () => {},
  autoClear: true,
  getClearColor: () => new THREE.Color(),
  getClearAlpha: () => 0,
  setClearColor: () => {},
  clear: () => {},
  render: () => {},
};

function face({ origin = [0, 0, 0], u = [1, 0, 0], v = [0, 0, 1], n = [0, 1, 0], su = 4, sv = 4, wall = false, turf = !wall, id = 0 }) {
  return {
    id, origin: new THREE.Vector3(...origin), u: new THREE.Vector3(...u), v: new THREE.Vector3(...v), n: new THREE.Vector3(...n),
    su, sv, wall, turf, paintable: true, atlas: {}, block: id,
  };
}

function makePaint(faces, { buriedZ = Infinity } = {}) {
  const level = {
    faces, blocks: faces.map((f) => ({ faces: [f.id, -1, -1, -1, -1, -1], aabbMin: f.origin.clone().addScalar(-2), aabbMax: f.origin.clone().addScalar(2) })),
    queryBlocks: (x0, z0, x1, z1, out) => { out.length = 0; for (let i = 0; i < faces.length; i++) out.push(i); return out; },
    pointInside: (p) => p.z > buriedZ,   // cells whose centre sits beyond buriedZ count as buried
  };
  return new PaintSystem(stubRenderer, level, { atlasSize: 256, maxDensity: 2, cell: 0.5 });
}

// live Zone Control match stub: one active objective zone over x ∈ [0, 2] of the floor
function zonesStub() {
  return { zones: { active: { zones: [{ region: { polys: [[[0, 0], [2, 0], [2, 4], [0, 4]]], y0: -2, y1: 6 } }] } }, state: 'playing' };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cellA = 0.25;   // cell = 0.5 m → 0.25 m²

// ------------------------------------------------------------------ P1.2: ineligible paint credit
await test('P1.2 floor paint grants turf credit (counts + returned area)', async () => {
  G.match = null;
  const floor = face({});
  const P = makePaint([floor]);
  const area = P.splat(V(2, 0.05, 2), 1, 0, { seed: 0.5 });
  assert.ok(area > 0, `expected credit on turf, got ${area}`);
  assert.ok(Math.abs(P.counts[0] * cellA - area) < 1e-6, 'returned area must equal the coverage delta');
  assert.ok(P.coverage()[0] > 0, 'coverage must move');
});

await test('P1.2 wall paint is visual only: no credit, no coverage, but the grid is painted', async () => {
  G.match = null;
  const wall = face({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1], wall: true, turf: false });
  const P = makePaint([wall]);
  const area = P.splat(V(2, 2, 0.05), 1, 0, { seed: 0.5 });
  assert.equal(area, 0, `walls must claim nothing, got ${area}`);
  assert.equal(P.counts[0], 0, 'coverage counts untouched');
  assert.ok(P.grid.some((v) => v === 1), 'the visual grid is still painted');
});

await test('P1.2 ceiling paint grants nothing', async () => {
  G.match = null;
  const ceil = face({ origin: [0, 3, 0], u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0], wall: false, turf: false });
  const P = makePaint([ceil]);
  const area = P.splat(V(2, 2.95, 2), 1, 0, { seed: 0.5 });
  assert.equal(area, 0, `ceilings must claim nothing, got ${area}`);
  assert.equal(P.counts[0], 0);
});

await test('P1.2 dead (buried) cells paint but grant nothing', async () => {
  G.match = null;
  const P = makePaint([face({})], { buriedZ: 2 });
  const buried = P.splat(V(2, 0.05, 3), 0.8, 0, { seed: 0.5 });   // entirely in the buried band
  assert.equal(buried, 0, `buried cells must claim nothing, got ${buried}`);
  const live = P.splat(V(2, 0.05, 1), 0.8, 0, { seed: 0.5 });     // entirely live
  assert.ok(live > 0, 'live cells beside them still credit');
});

await test('P1.2 repainting own ink claims nothing; repainting enemy ink flips the cell', async () => {
  G.match = null;
  const P = makePaint([face({})]);
  const first = P.splat(V(2, 0.05, 2), 1, 0, { seed: 0.5 });
  const again = P.splat(V(2, 0.05, 2), 1, 0, { seed: 0.5 });
  assert.ok(again === 0, `own repaint must claim 0, got ${again}`);
  const steal = P.splat(V(2, 0.05, 2), 1, 1, { seed: 0.5 });
  assert.ok(steal > 0, 'enemy repaint must claim');
  assert.ok(Math.abs(P.counts[1] * cellA - first) < 1e-6, 'coverage moved team 0 → team 1');
  assert.equal(P.counts[0], 0, 'team 0 lost its cells');
});

// ------------------------------------------------------------------ P1.1: zone credit is per-cell
await test('P1.1 zoneOut: only cells inside the live zone count as zone ink', async () => {
  const floor = face({});
  const P = makePaint([floor]);
  G.match = zonesStub();
  try {
    const zIn = { area: 0 }, zOut = { area: 0 };
    const inside = P.splat(V(1, 0.05, 2), 0.8, 0, { seed: 0.5, zoneOut: zIn });
    const outside = P.splat(V(3, 0.05, 2), 0.8, 0, { seed: 0.5, zoneOut: zOut });
    assert.ok(inside > 0, 'inside paint claims ordinary turf');
    assert.ok(outside > 0, 'outside paint is still ordinary turf — it claims');
    assert.ok(zIn.area > 0 && zIn.area <= inside, 'the in-zone part is reported');
    assert.equal(zOut.area, 0, 'outside the live zone: no zone credit');
    // a splat straddling the boundary credits exactly its in-zone part
    const P2 = makePaint([face({})]);
    const zStr = { area: 0 };
    P2.splat(V(2, 0.05, 2), 1.4, 0, { seed: 0.5, zoneOut: zStr });
    assert.ok(zStr.area > 0 && zStr.area < P2.turfArea, 'straddling splat credits partially');
  } finally { G.match = null; }
});

await test('P1.1 takeZoneClaim: kit-path accumulator is per team and consumed exactly once', async () => {
  const floor = face({});
  const P = makePaint([floor]);
  G.match = zonesStub();
  try {
    P.splat(V(1, 0.05, 2), 0.8, 0, { seed: 0.5 });            // kit path: no zoneOut
    P.splat(V(1, 0.05, 2), 0.8, 1, { seed: 0.5 });
    const z0 = P.takeZoneClaim(0), z1 = P.takeZoneClaim(1);
    assert.ok(z0 > 0, 'team 0 zone claim accumulated');
    assert.ok(z1 > 0, 'team 1 zone claim accumulated');
    assert.equal(P.takeZoneClaim(0), 0, 'take consumes (no double credit)');
  } finally { G.match = null; }
});

await test('P1.1 noZoneClaim: unattributed droplet paint credits nobody', async () => {
  const floor = face({});
  const P = makePaint([floor]);
  G.match = zonesStub();
  try {
    const before = P.zoneAccum[0];
    P.splat(V(1, 0.05, 2), 0.8, 0, { seed: 0.5, noZoneClaim: true });
    assert.equal(P.zoneAccum[0], before, 'droplets claim turf but never zone credit');
    P.splat(V(1, 0.05, 0.5), 0.8, 0, { seed: 0.5 });   // fresh cells: normal paint still accumulates
    assert.ok(P.zoneAccum[0] > before, 'normal paint still accumulates');
  } finally { G.match = null; }
});

// ------------------------------------------------------------------ P1.1: Match._zoneTurf uses the payload only
function fakeMatch(state = 'playing') {
  const m = Object.create(Match.prototype);
  m.zones = {}; m.state = state;
  return m;
}
await test('P1.1 zoneTurf credits from the payload, never from actor position or aim point', async () => {
  const m = fakeMatch();
  const actor = { stats: {}, pos: V(1, 0, 2), aimPoint: V(1, 0, 2) };   // standing inside + aiming into the zone
  m._zoneTurf({ actor, area: 5, zoneArea: 0 });                          // but the ink landed outside
  assert.equal(actor.stats.zoneTurf || 0, 0, 'standing in the zone with outside ink credits nothing');
  m._zoneTurf({ actor, area: 5, zoneArea: 3 });                          // ink actually inside
  assert.equal(actor.stats.zoneTurf, 3, 'only the in-zone area is credited');
  m._zoneTurf({ actor, area: 5, zoneArea: 0 });
  assert.equal(actor.stats.zoneTurf, 3, 'a second outside splat still credits nothing');
  const outside = { stats: {}, pos: V(9, 0, 9), aimPoint: V(1, 0, 2) };  // aiming into the zone from far away
  m._zoneTurf({ actor: outside, area: 5, zoneArea: 0 });
  assert.equal(outside.stats.zoneTurf, undefined, 'aim point never credits');
  m._zoneTurf({ actor, area: 2, zoneArea: 2 });                          // repaint: fresh claims only
  assert.equal(actor.stats.zoneTurf, 5, 'repainted cells count once, on the flip');
});

await test('P1.1 zoneTurf ignored outside a playing zones match', async () => {
  const m = fakeMatch('finish');
  const actor = { stats: {} };
  m._zoneTurf({ actor, area: 5, zoneArea: 4 });
  assert.equal(actor.stats.zoneTurf, undefined, 'gate stays closed outside playing');
  const t = fakeMatch(); t.zones = null;
  t._zoneTurf({ actor, area: 5, zoneArea: 4 });
  assert.equal(actor.stats.zoneTurf, undefined, 'gate stays closed without zones');
});

// ------------------------------------------------------------------ P1.3: deterministic tie-break
function judge(cov) {
  const m = Object.create(Match.prototype);
  m.zones = null; m.bossMode = null; m.mode = 'turf';
  m.result = null;
  m.setState = () => {};
  const save = G.paint; G.paint = { coverage: () => [cov[0], cov[1]] };
  try { m._judge(); } finally { G.paint = save; }
  return m.result;
}
await test('P1.3 exact tie: Alpha wins with the +0.1 % tie-break, deterministically', async () => {
  const r = judge([0.5, 0.5]);
  assert.equal(r.winner, 0, 'Alpha wins an exact tie');
  assert.ok(r.tieBreak, 'tie-break is flagged');
  assert.ok(Math.abs(r.coverage[0] - 0.501) < 1e-9, `Alpha displayed +0.1 %, got ${r.coverage[0]}`);
  assert.ok(Math.abs(r.coverage[1] - 0.5) < 1e-9, 'Bravo unchanged');
  const r2 = judge([0.5, 0.5]);
  assert.deepEqual([r2.winner, r2.coverage[0]], [0, r.coverage[0]], 'same paint state → same outcome (no coin flip)');
});

await test('P1.3 near-ties: the higher coverage wins, no tie-break flag', async () => {
  assert.equal(judge([0.5001, 0.5]).winner, 0);
  assert.equal(judge([0.5, 0.5002]).winner, 1);
  assert.equal(judge([0.4, 0.6]).winner, 1);
  assert.ok(!judge([0.5001, 0.5]).tieBreak, 'no tie-break outside exact ties');
  assert.ok(!judge([0.5002, 0.5]).tieBreak, 'a 0.02-point margin is not an exact tie');
});

await test('P1.3 no random winner fallback remains in match.js', async () => {
  const src = (await import('node:fs/promises')).readFile;
  const srcMatch = await src(new URL('../src/game/match.js', import.meta.url), 'utf8');
  // (bots' random loadout picks legitimately use Math.random — only the winner fallback must be gone)
  assert.ok(!/\?\?\s*\(\s*Math\.random/.test(srcMatch) && !/winner\s*[=:]\s*[^;]*Math\.random/.test(srcMatch),
    'match.js must not fall back to a random winner anymore');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
