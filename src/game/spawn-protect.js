// INKWAVE — the spawn-protection shield field (the dome over your own spawn pad).
//
// Lives in its own module, not in actor.js, for one concrete reason: weapons.js needs the field query and actor.js
// already imports weapons.js (WeaponRunner), so putting it there would close an import cycle. The rule query is
// therefore dependency-free (config + the G context) and both sides can import it safely.
//
// The dome is a cylinder around a team's spawn pad, sized by SPAWN_PROTECT in config.js. Hostile ordnance that
// crosses it is stopped at the crossing point, so a protected player is genuinely unreachable rather than merely
// invulnerable — invulnerability alone still lets a bomb land and paint over their spawn.
//
// Allocation-free by design: the crossing point is written into the caller's vector and only plain arithmetic runs
// here, because this is called for every ink projectile every frame.
import { G } from '../core/ctx.js';
import { SPAWN_PROTECT } from '../config.js';

/** Is `p` (any object with x/y/z) inside team `team`'s spawn dome? */
export function inSpawnDome(p, team) {
  const pad = G.level?.spawnPads?.[team];
  if (!pad) return false;
  const dx = p.x - pad.x, dz = p.z - pad.z;
  if (dx * dx + dz * dz > SPAWN_PROTECT.radius * SPAWN_PROTECT.radius) return false;
  return p.y < pad.y + SPAWN_PROTECT.height;
}

/**
 * First crossing of team `team`'s dome by the segment a→b, written into `out` and returned; null if it never
 * crosses. A segment that already starts inside returns `a`, so a projectile spawned within the radius cannot slip
 * through by beginning past the wall.
 *
 * The dome has a lid: a shot arcing over the top of it is not stopped by a wall it never touched.
 */
export function spawnShieldCross(a, b, team, out) {
  const pad = G.level?.spawnPads?.[team];
  if (!pad) return null;
  const P = SPAWN_PROTECT, r2 = P.radius * P.radius;
  const inA = (a.x - pad.x) ** 2 + (a.z - pad.z) ** 2 <= r2 && a.y < pad.y + P.height;
  const inB = (b.x - pad.x) ** 2 + (b.z - pad.z) ** 2 <= r2 && b.y < pad.y + P.height;
  if (inA) { out.copy(a); return out; }            // already inside: the field stops it right here
  if (inB) return null;                             // heading away from the dome
  // segment (dx,dz) vs the circle at the pad: first root of |a + t·d − pad|² = r² inside [0,1]
  const ax = a.x - pad.x, az = a.z - pad.z, dx = b.x - a.x, dz = b.z - a.z;
  const A = dx * dx + dz * dz;
  if (A < 1e-9) return null;
  const B = 2 * (ax * dx + az * dz), C = ax * ax + az * az - r2;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  const y = a.y + (b.y - a.y) * t;
  if (y > pad.y + P.height) return null;            // over the top: nothing to hit
  return out.set(a.x + dx * t, y, a.z + dz * t);
}