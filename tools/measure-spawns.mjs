// Spawn-point measurement (brief section 5: measure, do not guess).
//
// Static geometry only — it reads every stage's layout and reports where the spawns actually are relative to each
// other and to the midline. That answers "is a spawn too close to the enemy / too far from the fight?" without
// booting the game, and it is the evidence a spawn change has to be argued from.
//
// What it does NOT measure, and why: "deaths soon after spawning" and "time to first contact" are outcomes, not
// geometry. They need a real match (bots or online), and a headless run cannot complete inside the command cap here.
// Those numbers stay unmeasured until someone runs a match — see the notes at the bottom.
//
// Run: node tools/measure-spawns.mjs
import { STAGES } from '../src/world/stages/index.js';

const rows = [];
for (const [id, mod] of Object.entries(STAGES)) {
  // each stage module exports its geometry as LAYOUT; the merged stage object has it under that name
  const layout = mod.LAYOUT || mod;
  const pads = layout.spawnPads || [];
  if (pads.length < 2) { rows.push({ id, note: `only ${pads.length} pad(s)` }); continue; }
  const [a, b] = pads;
  const [ax, ay, az] = Array.isArray(a) ? a : [a.x, a.y, a.z];
  const [bx, by, bz] = Array.isArray(b) ? b : [b.x, b.y, b.z];
  const bounds = layout.bounds || {};
  const depth = (bounds.maxZ ?? 46) - (bounds.minZ ?? -46);
  rows.push({
    id,
    padToPad: +Math.hypot(ax - bx, az - bz).toFixed(1),
    toMid: +Math.abs(az).toFixed(1),
    stageDepth: +depth.toFixed(0),
    // fraction of the stage you must cross before you can even see the enemy half
    crossPct: +(Math.abs(az) / depth * 100).toFixed(0),
    spawnBarrier: layout.spawnBarrier ?? null,
    width: bounds.maxX != null ? +(bounds.maxX - bounds.minX).toFixed(0) : null,
  });
}

const w = (s, n) => String(s).padEnd(n);
console.log(`${w('stage', 14)}${w('pad→pad m', 11)}${w('spawn→mid m', 14)}${w('cross %', 9)}${w('depth m', 9)}${w('width m', 9)}barrier`);
for (const r of rows) {
  if (r.note) { console.log(`${w(r.id, 14)}${r.note}`); continue; }
  console.log(`${w(r.id, 14)}${w(r.padToPad, 11)}${w(r.toMid, 14)}${w(r.crossPct + '%', 9)}${w(r.stageDepth, 9)}${w(r.width, 9)}${r.spawnBarrier}`);
}

const pads = rows.filter((r) => !r.note);
if (pads.length) {
  const mean = (k) => pads.reduce((s, r) => s + r[k], 0) / pads.length;
  console.log(`\nmean spawn→mid ${mean('toMid').toFixed(1)} m · mean pad→pad ${mean('padToPad').toFixed(1)} m ` +
    `· range ${Math.min(...pads.map((r) => r.toMid))}–${Math.max(...pads.map((r) => r.toMid))} m`);
}

console.log(`
Not measured here (need a live match, not a layout file):
  · deaths within the first N seconds of spawning
  · time to first contact
  · how often a spawn is camped
Run a real match and read those from the match log before moving anything.`);