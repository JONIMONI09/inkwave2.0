// Bot brain: picks turf to claim, paths there (swimming through its own ink), paints on the move, spots and
// fights enemies with human-ish reaction time and aim error, refills ink, throws bombs and uses specials.
// Motion (stream 4): aim is a critically-damped spring with a turn-rate cap and a smoothly wandering error (plus an
// acquisition over/undershoot that settles), shots follow the bot's *actual* aim ray, the move command slews its
// heading (no twitch at waypoint switches / strafe flips), strafes ease, bots dodge-hop when hit, swim in to close
// distance and retreat through own ink to heal when they're losing a duel.
import * as THREE from 'three';
import { G, clamp, angleDiff } from '../core/ctx.js';
import { PLAYER, DIFFICULTY, SUB, SPECIALS, weaponRange } from '../config.js';
import { Hit } from './physics.js';
import { MAIN_KITS, SUB_KITS } from './kits/registry.js';
import { Perf } from '../core/perf.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _walkHit = new Hit();
const _stats = { own: 0, enemy: 0, empty: 0, n: 0 };
// weapon families the brain treats alike: close-range pushers, and charge-then-release weapons
// (exported so kit weapons / subs (src/game/kits/*.js) can add their kinds to these tables)
export const MELEE = { roller: true, brush: true };
export const CHARGES = { charger: true, spinner: true, splatling: true };

// ============================================================================================ Zone Control team plan
// Shared by every bot in a zones match (one per ZoneControl): each zone's paint cells mapped to the nav nodes you'd
// stand on to ink them, built once; the live zones' ink re-scanned ~3×/s into per-node "need" (cells not yet ours,
// enemy ink weighted up); and per-team roles, re-dealt on every rotation / change of hands (and every 2 s):
//   paint — ink the zone's neediest patches (everyone, when the zone isn't ours; rollers / brushes / buckets always)
//   guard — hold it: stand on its enemy-facing edge, touch up and re-ink enemy ink (2–3 bots while we hold it)
//   watch — chargers / spinners: a perch on our side with a sightline over the zone, inking it from range
//   push  — 1–2 bots press forward past the zone while we hold it
// Two-zone centres split the team, more bodies on the zone we don't hold.
// Retaking (anti-snowball, no number fudging): while the other team holds the objective, bots off the zone regroup at
// a staging point just outside it on our side (role 'stage'), then push together once ≥ 3 are gathered or a
// teammate's special is ready ('push' wave: everyone inks one zone — on a two-zone centre the weaker one, which is
// enough to break the hold), chaining specials one after another; bombs go onto the zone's enemy ink; respawners super
// jump to the group.
export const LONG = { charger: true, spinner: true, splatling: true };
export const THROWN = { bomb: true, sticky: true, burst: true, mist: true, seeker: true };
// aim pitch that lobs a thrown sub (weapons.js throwVelocity: pitch + 0.28, +1.5 up, from 1.35 m, gravity 24) d metres out
// to a spot dy above our feet; null when out of reach
function lobPitch(d, dy, speed) {
  let best = null, be = Infinity;
  for (let p = -0.5; p <= 0.75; p += 0.025) {
    const tp = clamp(p + 0.28, -0.3, 1.1), vx = Math.cos(tp) * speed, vy = Math.sin(tp) * speed + 1.5, disc = vy * vy + 48 * (1.35 - dy);
    if (disc < 0) continue;
    const e = Math.abs((vx * (vy + Math.sqrt(disc))) / 24 - d);
    if (e < be) { be = e; best = p; }
  }
  return be < 1.2 ? best : null;
}
export const PAINTERS = { roller: true, brush: true, bucket: true, slosher: true };
// Counter-play vs enemy devices and shields (BotBrain "threats" section): tests flip `enabled` off for an A/B on the
// same code; THREAT_STATS counts what the bots did (engagements, not frames — holdFire is seconds)
export const THREAT_AI = { enabled: true };
export const THREAT_STATS = { noticed: 0, shoot: 0, evade: 0, swim: 0, sidestep: 0, gone: 0, steer: 0, breakWall: 0, flank: 0, holdFire: 0, shieldSub: 0 };
const _thrList = [];
const _thrAim = { yaw: 0, pitch: 0, dist: 6 };
const _evP = new THREE.Vector3();
const _wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
const _plans = new WeakMap();
export function zonePlan() {
  const m = G.match, Z = m && m.zones;
  if (!Z || m.attract || m.practice || !G.nav || !G.paint) return null;    let P = _plans.get(Z);
    if (!P) { P = new ZonePlan(Z); _plans.set(Z, P); }
    Perf.spot('zonePlan', () => P.tick());   // work-plan §2: is the shared team plan ever a hitch source?
    return P;
}

class ZonePlan {
  constructor(Z) {
    this.Z = Z;
    const faces = G.level.faces.filter((f) => f.turf && f.atlas).sort((x, y) => x.grid - y.grid);
    const starts = faces.map((f) => f.grid);
    this.info = Z.zones.map((z) => this._build(z, faces, starts));
    this.t = -1; this.roleT = -1; this.sig = '';
    this.roles = [new Map(), new Map()];
    // per-team retake wave: 'free' (we hold it / it's neutral) · 'stage' (regrouping) · 'push' (going in together)
    this.waves = [0, 1].map(() => ({ state: 'free', t0: 0, zone: -1, pushes: 0 }));
    this.spNext = [0, 0];   // chained specials on a push: the next one may go at this time
  }
  // the team's wave state, and (staging / pushing) the zone it's going for
  waveOf(t) { return this.waves[t]; }

  _build(z, faces, starts) {
    const nav = G.nav, cells = z.cells, n = cells.length, idx = new Map(), nodes = [], cellNode = new Int32Array(n).fill(-1);
    const [cx, cy, cz] = z.center;
    let R = 2;
    for (let i = 0; i < n; i++) {
      const k = cells[i];
      let lo = 0, hi = starts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= k) lo = mid; else hi = mid - 1; }
      const f = faces[lo], loc = k - f.grid, s = ((loc % f.nu) + 0.5) * f.cu, t = (((loc / f.nu) | 0) + 0.5) * f.cv;
      const x = f.origin.x + f.u.x * s + f.v.x * t, y = f.origin.y + f.u.y * s + f.v.y * t, zz = f.origin.z + f.u.z * s + f.v.z * t;
      R = Math.max(R, Math.hypot(x - cx, zz - cz));
      const id = nav.nearest(_v.set(x, y, zz), 1.0);
      if (id < 0) continue;
      const nd = nav.nodes[id];
      if (Math.hypot(nd.x - x, nd.z - zz) > 2.2 || Math.abs(nd.y - y) > 1.8) continue;   // nowhere to stand near it
      let li = idx.get(id);
      if (li === undefined) { li = nodes.length; idx.set(id, li); nodes.push(id); }
      cellNode[i] = li;
    }
    let reach = 0; for (let i = 0; i < n; i++) if (cellNode[i] >= 0) reach++;
    // neighbourhoods (≤ 2.3 m, same level) so a pick weighs the patch round a node, not one square metre
    const nb = nodes.map((id) => {
      const a = nav.nodes[id], out = [];
      nodes.forEach((jd, j) => { const b = nav.nodes[jd]; if (Math.abs(a.x - b.x) < 2.4 && Math.abs(a.z - b.z) < 2.4 && Math.abs(a.y - b.y) < 1 && Math.hypot(a.x - b.x, a.z - b.z) <= 2.3) out.push(j); });
      return out;
    });
    // nav nodes round the zone: ring (on / by it: guard + watch spots), far (3–18 m out: push)
    const ring = [], far = [];
    for (const id of nav.validIds) {
      const q = nav.nodes[id], d = Math.hypot(q.x - cx, q.z - cz);
      if (q.zone >= 0) continue;
      if (d <= R + 16) ring.push(id);
      if (d >= R + 3 && d <= R + 18) far.push(id);
    }
    const parts = z.def.polys || [z.def.poly];
    // staging spots: a patch of ground 3–9 m outside the zone on each team's own side (toward its spawn)
    const stage = [0, 1].map((t) => {
      const p = G.level.spawnPads[t], ex = p.x - cx, ez = p.z - cz, el = Math.hypot(ex, ez) || 1;
      let best = -1, bs = -Infinity;
      for (const id of ring) {
        const q = nav.nodes[id], dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
        if (d < R + 3 || d > R + 9 || q.wet === 2) continue;
        const sc = ((dx * ex + dz * ez) / (d * el)) * 3 - Math.abs(d - (R + 5)) * 0.3 - Math.abs(q.y - cy) * 0.35 - (q.wet ? 1 : 0);
        if (sc > bs) { bs = sc; best = id; }
      }
      if (best < 0) return null;
      const b = nav.nodes[best], spots = ring.filter((id) => { const q = nav.nodes[id]; return Math.hypot(q.x - b.x, q.z - b.z) < 3.2 && Math.abs(q.y - b.y) < 1.2 && q.wet !== 2; });
      return { x: b.x, y: b.y, z: b.z, spots: spots.length ? spots : [best] };
    });
    return { cellNode, nodes, nb, reach, R, ring: ring.length ? ring : nodes.slice(), far: far.length ? far : ring.slice(), parts, y0: z.def.y0 ?? -2, y1: z.def.y1 ?? 6, stage,
      need: [new Float32Array(nodes.length), new Float32Array(nodes.length)], needSum: [0, 0], ink: [new Uint16Array(nodes.length), new Uint16Array(nodes.length)] };
  }

  isActive(zi) { return this.Z.active.zones.some((z) => z.id === zi); }
  roleOf(a) { return this.roles[a.team].get(a) || { role: 'paint', zone: this.Z.active.zones[0].id }; }
  // unit xz direction from a zone toward team t's enemy spawn
  enemyDir(zone, t) {
    const p = G.level.spawnPads[1 - t], dx = p.x - zone.center[0], dz = p.z - zone.center[2], l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }
  // standing on (or right at the edge of) zone zi?
  onZone(zi, p) {
    const I = this.info[zi], c = this.Z.zones[zi].center;
    return Math.hypot(p.x - c[0], p.z - c[2]) < I.R + 1.5 && p.y > I.y0 - 1.5 && p.y < I.y1 + 2.5;
  }
  // is (x, y, z) on a live zone?
  onActive(x, y, z) {
    for (const zn of this.Z.active.zones) {
      const I = this.info[zn.id];
      if (y < I.y0 - 1.5 || y > I.y1 + 2.5) continue;
      for (const poly of I.parts) {
        let ins = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, zi] = poly[i], [xj, zj] = poly[j];
          if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
        }
        if (ins) return true;
      }
    }
    return false;
  }
  // the most-needed spot of zone zi for team t (e.g. a Vortex Strike's landing point)
  hotspot(zi, t) {
    if (!(zi >= 0) || !this.isActive(zi)) zi = this.Z.active.zones[0].id;
    const I = this.info[zi], need = I.need[t];
    let bv = -1, bi = -1;
    for (let li = 0; li < I.nodes.length; li++) { let v = 0; for (const k of I.nb[li]) v += need[k]; if (v > bv) { bv = v; bi = li; } }
    return bi >= 0 ? G.nav.nodes[I.nodes[bi]] : null;
  }

  tick() {
    const now = G.time;
    if (this.t >= 0 && now - this.t < 0.33 && now >= this.t) return;
    this.t = now;
    const grid = G.paint.grid, Z = this.Z;
    for (const z of Z.active.zones) {
      const I = this.info[z.id], c = z.cells, cn = I.cellNode, n0 = I.need[0], n1 = I.need[1], k0 = I.ink[0], k1 = I.ink[1];
      n0.fill(0); n1.fill(0); k0.fill(0); k1.fill(0);
      let s0 = 0, s1 = 0;
      for (let i = 0; i < c.length; i++) {
        const li = cn[i];
        if (li < 0) continue;
        const g = grid[c[i]];
        if (g === 1) k0[li]++; else if (g === 2) k1[li]++;
        if (g !== 1) { const v = g === 2 ? 1.5 : 1; n0[li] += v; s0 += v; }
        if (g !== 2) { const v = g === 1 ? 1.5 : 1; n1[li] += v; s1 += v; }
      }
      I.needSum[0] = s0; I.needSum[1] = s1;
    }
    this._wave(0, now); this._wave(1, now);
    const sig = Z.active.id + ':' + Z.owner + ':' + Z.active.zones.map((z) => z.owner).join(',') + ':' + this.waves[0].state + this.waves[1].state;
    if (sig !== this.sig || now - this.roleT > 2 || now < this.roleT) { this.sig = sig; this.roleT = now; this._assign(0); this._assign(1); }
  }

  // retake waves for team t (only while the other team holds the objective)
  _wave(t, now) {
    const Z = this.Z, W = this.waves[t];
    if (Z.owner !== 1 - t) { W.state = 'free'; W.zone = -1; return; }
    if (W.state === 'free') {
      // go for one zone: on a two-zone centre the one they hold least firmly (neutralising either breaks their hold)
      const zs = Z.active.zones;
      W.zone = zs.reduce((b, z) => (z.share[1 - t] < b.share[1 - t] ? z : b), zs[0]).id;
      W.state = 'stage'; W.t0 = now;
    }
    const I = this.info[W.zone], st = I.stage[t], c = Z.zones[W.zone].center;
    let alive = 0, gathered = 0, sp = false;
    for (const a of G.actors) {
      if (a.team !== t || !a.bot || !a.alive) continue;
      alive++;
      const near = (st && Math.hypot(a.pos.x - st.x, a.pos.z - st.z) < 8) || Math.hypot(a.pos.x - c[0], a.pos.z - c[2]) < I.R + 2;
      if (near) gathered++;
      if (a.specialReady() && Math.hypot(a.pos.x - c[0], a.pos.z - c[2]) < I.R + 18) sp = true;
    }
    if (W.state === 'stage') {
      const waited = now - W.t0;
      if ((alive >= 3 && gathered >= 3) || (sp && gathered >= 2) || (gathered >= alive && alive > 0 && waited > 7) || waited > 15) {
        W.state = 'push'; W.t0 = now; W.pushes++; this.spNext[t] = now;
      }
    } else if (W.state === 'push' && alive <= 1 && now - W.t0 > 4) { W.state = 'stage'; W.t0 = now; }   // wiped out: regroup
  }

  _assign(t) {
    const Z = this.Z, act = Z.active.zones, prev = this.roles[t], out = new Map();
    const bots = G.actors.filter((a) => a.team === t && a.bot);
    const holdAll = Z.owner === t;
    // 0 mid · 1 painter · 2 long range (chargers always keep a perch; spinners only while we hold — else they ink it)
    const kind = (a) => (a.weapon.kind === 'charger' || (LONG[a.weapon.kind] && holdAll) ? 2 : PAINTERS[a.weapon.kind] ? 1 : 0);
    // pushers, only while we hold the whole objective: one, or two once it's safely inked (mid-range kits first)
    let nPush = 0;
    if (holdAll && bots.length >= 3) nPush = bots.length >= 4 && act.every((z) => z.share[t] >= 0.9) ? 2 : 1;
    const pushers = new Set(bots.filter((a) => kind(a) !== 2)
      .sort((x, y) => ((prev.get(y)?.role === 'push') - (prev.get(x)?.role === 'push')) || (kind(x) - kind(y)) || (x.slot - y.slot)).slice(0, nPush));
    // zone per bot on a two-zone centre: one bot keeps a zone we hold, the rest go for the other; holding neither, 3
    // pile onto the one we're closest to taking (then move on) rather than splitting 2 / 2 (hysteresis: bots stay put
    // unless the other zone is clearly closer)
    const zoneOf = new Map();
    if (act.length === 1) for (const a of bots) zoneOf.set(a, act[0].id);
    else {
      const [z0, z1] = act;
      let w0 = z0.owner === t ? 1 : 3, w1 = z1.owner === t ? 1 : 3;
      if (w0 === 3 && w1 === 3) {
        const pf = this.focus?.[t], f0 = z0.share[t] + (pf === z0.id ? 0.1 : 0), f1 = z1.share[t] + (pf === z1.id ? 0.1 : 0);
        if (f0 >= f1) w1 = 1; else w0 = 1;
        (this.focus || (this.focus = []))[t] = f0 >= f1 ? z0.id : z1.id;
      }
      const cap0 = Math.round((bots.length * w0) / (w0 + w1));
      const pos = (a) => (a.alive ? a.pos : G.level.spawnPads[t]);
      const dd = (a, z) => Math.hypot(pos(a).x - z.center[0], pos(a).z - z.center[2]);
      const key = (a) => dd(a, z0) - dd(a, z1) + (prev.get(a)?.zone === z0.id ? -5 : prev.get(a)?.zone === z1.id ? 5 : 0);
      const order = [...bots].sort((x, y) => key(x) - key(y));
      order.forEach((a, i) => zoneOf.set(a, i < cap0 ? z0.id : z1.id));
    }
    const W = this.waves[t];
    for (const a of bots) {
      let role = pushers.has(a) ? 'push' : kind(a) === 2 ? 'watch' : holdAll && kind(a) !== 1 ? 'guard' : 'paint', zone = zoneOf.get(a);
      if (W.state !== 'free') {
        // locked out: everyone goes for the one zone; off it, wait at the staging spot until the push
        zone = W.zone;
        if (role !== 'watch' && W.state === 'stage' && !(a.alive && this.onZone(W.zone, a.pos))) role = 'stage';
      }
      out.set(a, { role, zone });
    }
    // painters (rollers / brushes / buckets) guard by re-inking when we hold it: 'paint' already does that
    this.roles[t] = out;
  }
}

export class BotBrain {
  constructor(actor, difficulty = 'normal') {
    this.a = actor;
    this.setDifficulty(difficulty);
    this.reset();
  }
  setDifficulty(d) { this.diff = DIFFICULTY[d] || DIFFICULTY.normal; }
  reset() {
    this.path = null; this.pi = 0; this.goal = -1; this.repath = 0; this.goalTimer = 0;
    this.target = null; this.seeTimer = 0; this.react = 0; this.lostTimer = 0;
    this.stuck = 0; this.lastPos = new THREE.Vector3(); this.jumpCd = 0; this.bestD = Infinity; this.noProg = 0;
    this.mode = 'paint';
    this.sweep = Math.random() * 10;
    this.aimYaw = this.a.yaw; this.aimPitch = 0;
    this.errYaw = 0; this.errPitch = 0; this.errT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.bombCd = 3 + Math.random() * 4;
    this.fireHold = 0;
    this.think = Math.random() * 0.2;
    this.refillUntil = 0;
    this.chargeRelease = 0.95 + Math.random() * 0.05;
    this.paintPause = 0;
    this.aimYawV = 0; this.aimPitchV = 0;
    this.acqT = 9; this.acqSignY = 0; this.acqSignP = 0;
    this.ph1 = Math.random() * 20; this.ph2 = Math.random() * 20; this.t = Math.random() * 10;
    this.strafeS = 0; this.strafeAmp = 1;
    this.mvYaw = this.a.yaw; this.mvMag = 0;
    this.dodgeCd = 1 + Math.random() * 2;
    this.retreatT = 0; this._firing = false;
    this.strikes = 0; this.strikeT = 0; this.wiggleT = 0; this.wiggleYaw = 0; this.airStill = 0;
    this.dispT = 0; this.moveAcc = 0; this.snap = new THREE.Vector3(); this.paintYawOff = 0; this.paintScanT = 0; this.goalCheckT = 0;
    this.climbT = 0; this.noClimbUntil = 0; this._climbAim = null;
    // Zone Control (unused in Turf War): role + zone from the team plan, the hold timer at a guard / watch spot, and
    // the needy patch of the zone being aimed at
    this.zRole = null; this.zZone = -1; this.zHoldUntil = 0; this.zHoldDur = 0; this._zAct = null; this.zAimT = 0; this._zAim = null; this.zFail = 0; this.zFace = 0; this.zJumpAt = 0; this.zBomb = null; this.zBombScan = 0;
    // threats (enemy Waddles / Torpedoes hunting us, enemy canopies): the device being dealt with, when each one was
    // noticed (+ reaction time), line of sight to it, evade heading / sidestep side, canopy steering + flanking state
    this.thr = null; this.thrCand = null; this.thrScanT = Math.random() * 0.25; this._thrMem = new Map(); this._shl = [];
    this.thrLos = false; this.thrLosT = 0; this.thrAct = null; this.thrActs = 0; this.thrFiring = false; this.thrPulse = false;
    this.thrEvT = 0; this.thrEvYaw = 0; this.thrSide = 0; this.thrAcqT = 9; this.thrSignY = 0; this.thrSignP = 0;
    this.canRef = null; this.canSide = 0; this.canT = 0; this.flankSide = 0; this.blockT = 0; this.flankT = 0;
    this.navBack = null; this.navBackT = 0;   // off-graph recovery (_backOnNav)
  }

  update(dt) {
    const a = this.a;
    const it = a.intent;
    if (!a.alive) { it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; this.path = null; this.target = null; this._wasDead = true; this.mvMag = 0; this.navBack = null; this.navBackT = 0; return; }
    if (this._wasDead && G.match && G.match.playing()) {
      // just respawned: face the way the body faces, then sometimes super jump to the teammate furthest up the field
      this._wasDead = false;
      this.aimYaw = a.yaw; this.aimPitch = 0; this.aimYawV = 0; this.aimPitchV = 0;
      const zp0 = zonePlan();
      if (zp0) this._zoneJump(zp0);
      else if (Math.random() < 0.5) {
        const enemyPad = G.level.spawnPads[1 - a.team];
        let best = null, bd = Infinity;
        for (const o of G.actors) {
          if (o === a || o.team !== a.team || !o.alive || o.superJumpState) continue;
          const d = o.pos.distanceTo(enemyPad);
          if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
        }
        // a team jump beacon further up the field beats a teammate
        for (const b of G.subs ? G.subs.beaconsFor(a.team) : []) {
          const d = b.pos.distanceTo(enemyPad);
          if (d < bd - 2 && b.pos.distanceTo(a.pos) > 18) { bd = d; best = b; }
        }
        const ok = best && (best.pos && best.kind === 'beacon' ? G.subs.jumpToBeacon(a, best) : a.superJump(best));
        if (ok) { this.path = null; this.goalTimer = 0; }
      }
    }
    if (a.superJumpState) { it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; this.mvMag = 0; return; }
    if (!G.match || !G.match.playing()) { it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; this.mvMag = 0; return; }
    this.think -= dt; this.jumpCd -= dt; this.bombCd -= dt; this.strafeT -= dt; this.paintPause -= dt; this.dodgeCd -= dt;
    this.acqT += dt; this.t += dt;
    if (G.boss) { this._bossTick(dt); return; }   // Boss Battle: a different job (below)

    // ---------------- perception
    if (this.think <= 0) {
      this.think = 0.15 + Math.random() * 0.1;
      this._perceive();
    }
    const tgt = this.target;
    if (tgt && !tgt.alive) { this.target = null; }

    // ---------------- Zone Control: the team plan (null in Turf War); re-target at once on a rotation or a new role
    const zp = zonePlan();
    if (zp) this._zoneSync(zp);

    // ---------------- mode selection (retreat = break line of sight and heal in own ink when losing a duel)
    const inkFrac = a.ink / PLAYER.inkMax;
    const hpFrac = a.hp / PLAYER.hp;
    const w = a.weapon;
    if (this.mode === 'retreat') {
      this.retreatT -= dt;
      if (hpFrac > 0.85 || this.retreatT <= 0 || (!this.target && hpFrac > 0.6)) { this.mode = 'paint'; this.path = null; this.goalTimer = 0; }
    } else if (this.target && this.seeTimer > 0 && ((hpFrac < 0.34 && !MELEE[w.kind] && a.lastDamage < 0.8) || hpFrac < 0.2) && Math.random() < 0.6 * dt * 60 * this.diff.fireDiscipline
      && !MAIN_KITS[w.kind]?.bot?.stayIn?.(this)) {   // (a kit may veto: e.g. the Cutlass finishing a fight at blade range)
      this.mode = 'retreat'; this.retreatT = 2.2 + Math.random() * 1.4; this.repath = 0; this._pickRetreat();
    }
    if (this.mode !== 'refill' && this.mode !== 'retreat' && inkFrac < 0.12 && !(this.target && this.seeTimer > 0 && !MELEE[w.kind] && inkFrac > 0.05)) {
      this.mode = 'refill'; this.refillUntil = 0.85 + Math.random() * 0.1;
    }
    if (this.mode === 'refill' && inkFrac >= this.refillUntil) this.mode = 'paint';
    if (zp) {
      // the objective first: only take fights that are in range or on / by the zone (pushers fight like Turf War)
      if (this.mode !== 'refill' && this.mode !== 'retreat') {
        const m = this.target && this._zoneEngage(zp) ? 'fight' : 'paint';
        if (m === 'paint' && this.mode === 'fight') { this.goalTimer = 0; this.zHoldUntil = 0; }   // back to the zone
        this.mode = m;
      }
    } else if (this.mode !== 'refill' && this.mode !== 'retreat') this.mode = this.target ? 'fight' : 'paint';

    // ---------------- navigation goal
    this.goalTimer -= dt; this.repath -= dt;
    if (this.mode === 'fight' && this.target) {
      if (zp && this._zoneHoldGround(zp)) { this.path = null; this.repath = 0.3; }   // watchers / guards: don't chase off the zone
      else if (this.repath <= 0) this._pathTo(this.target.pos, 0.6);
    } else if (this.mode === 'refill') {
      if (this.repath <= 0 || !this.path) this._pickRefill();
    } else if (this.mode === 'retreat') {
      if (this.repath <= 0 || !this.path) this._pickRetreat();
    } else {
      // our team has already covered the goal area: move on instead of walking over our own ink
      this.goalCheckT -= dt;
      if (this.goalCheckT <= 0 && this.goal >= 0 && this.path) {
        this.goalCheckT = 1;
        const g = G.nav.nodes[this.goal], st = G.paint.regionStats(g.x, g.y, g.z, 3, a.team, _stats);
        if (st.n && st.own > 0.85) this.goalTimer = 0;
      }
      if (zp) {
        // Zone Control: arrive → hold a moment (guards / watchers) → next spot on the zone
        const arrived = !this.path || this.pi >= this.path.length;
        if (arrived && this.zHoldDur > 0) { this.zHoldUntil = this.t + this.zHoldDur; this.zHoldDur = 0; }
        if (this.wiggleT <= 0 && (this.goalTimer <= 0 || (arrived && this.t >= (this.zHoldUntil || 0)))) this._pickZoneGoal(zp);
      } else if (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length) this._pickPaintGoal();
    }

    // ---------------- steering along the path
    const move = this._steer(dt);
    this._unstick(dt, move);
    if (!this.path && this.wiggleT <= 0) this._backOnNav(dt, move);
    const wantMove = move.lengthSq() > 0.01;

    // ---------------- actions
    it.fire = false; it.sub = false; it.special = false; it.squid = false; it.jump = false;
    let wantYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw;
    let wantPitch = -0.1;
    const enemyVisible = this.target && this.seeTimer > 0;
    let fightDist = 0, idealYaw = 0, idealPitch = 0, aimDist = 6;

    if ((this.mode === 'fight' || this.mode === 'retreat') && this.target) {
      const t = this.target;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      fightDist = dist;
      const range = this._range();
      // lead the target by the projectile's time to arrive (slosher: the heave windup + a slower, longer arc)
      const lead = w.kind === 'charger' ? 0 : w.kind === 'slosher' ? (w.windup || 0.13) + dist / ((w.projSpeed || 15) * 0.88)
        : dist / (w.projSpeed || w.speedMax || w.throwSpeed || 30);
      _v.set(t.pos.x + t.vel.x * lead, t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? 0.3 : 0.85), t.pos.z + t.vel.z * lead);
      _v2.copy(_v); _v2.x -= a.pos.x; _v2.y -= a.pos.y + 1.1; _v2.z -= a.pos.z;
      idealYaw = Math.atan2(_v2.x, _v2.z);
      idealPitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
      aimDist = _v2.length();
      // human aim error: a slow wander plus an acquisition error that settles over the reaction time
      const e = this.diff.aimError;
      const acq = Math.exp(-this.acqT / Math.max(0.12, this.diff.reaction * 0.9));
      const wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
      wantYaw = idealYaw + e * (0.75 * wander(this.t * 1.7 + this.ph1) + 2.4 * acq * this.acqSignY);
      wantPitch = idealPitch + e * 0.6 * (0.75 * wander(this.t * 2.1 + this.ph2) + 1.6 * acq * this.acqSignP);
      if (this.mode === 'fight') {
        // movement in combat: keep preferred distance + eased strafing (+ swim in to close distance)
        const pref = w.kind === 'charger' ? range * 0.8 : MELEE[w.kind] ? 0.5 : range * 0.7;
        if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.5 + Math.random() * 0.5; }
        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-5 * dt));
        const nx = dx / Math.max(dist, 0.01), nz = dz / Math.max(dist, 0.01);
        let mvx = 0, mvz = 0;
        if (dist > pref + 1.2 && wantMove) { mvx = move.x; mvz = move.z; }
        else if (dist < pref - 1.5 && !MELEE[w.kind]) { mvx = -nx; mvz = -nz; }
        if (!(CHARGES[w.kind] && a.weaponRunner.charging)) { mvx += -nz * this.strafeS * 0.9; mvz += nx * this.strafeS * 0.9; }
        if (MELEE[w.kind] && dist < 7) { mvx = nx; mvz = nz; }
        // twin pistols: after a roll, stand planted for a moment in rapid mode (moving would drop back to dual mode)
        if (w.kind === 'twins') {
          const planted = a.weaponRunner.turret;
          if (planted && !this._wasPlanted) this.plantT = 0.7 + Math.random() * 0.7;
          this._wasPlanted = planted;
          this.plantT = (this.plantT || 0) - dt;
          if (planted && this.plantT > 0) { mvx = 0; mvz = 0; }
        }
        // an enemy on a Mega Stamp: never stand in its path — it charges straight and turns slowly, so step out of its
        // line to the side (and back off a touch), then work round to its flank / back where it's open
        const ts = t.specialActive;
        if (ts && ts.id === 'stamp') {
          const fy = ts.bodyYaw ?? t.yaw, fx = Math.sin(fy), fz = Math.cos(fy);
          const rx = a.pos.x - t.pos.x, rz = a.pos.z - t.pos.z, rl = Math.hypot(rx, rz) || 1;
          if ((rx * fx + rz * fz) / rl > Math.cos(1.25) && dist < 10) {
            const side = (rx * fz - rz * fx) >= 0 ? 1 : -1;   // which side of its facing line we're already on
            mvx = fz * side + (rx / rl) * 0.45; mvz = -fx * side + (rz / rl) * 0.45;
          } else if (dist < 4.5 && !MELEE[w.kind]) { mvx += (rx / rl) * 0.4; mvz += (rz / rl) * 0.4; }
        }
        const l = Math.hypot(mvx, mvz);
        if (l > 0.01) move.set(mvx / l, 0, mvz / l); else move.set(0, 0, 0);
        // fire only when the *actual* aim is on the body (shots follow the visible aim, not the target)
        const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
        const tol = Math.max(0.05, Math.atan2(0.55, dist)) * (this._firing ? 2.4 : 1.5);
        const aimed = off < tol;
        this._firing = false;
        const BK = MAIN_KITS[w.kind]?.bot;
        if (enemyVisible && this.react <= 0 && aimed && inkFrac > 0.02) {
          if (BK?.fight) {
            // kit weapons (kits/*.js) decide their own trigger (and may steer `move`)
            it.fire = BK.fight(this, { a, w, dist, range, dt, it, move, target: t });
          } else if (w.kind === 'spinner') {
            // spin up to the release point, let go, and let the stream run (aim keeps tracking during the burst)
            const wr = a.weaponRunner;
            it.fire = wr.burstT <= 0 && !(wr.charging && wr.charge >= this.chargeRelease);
          } else if (w.kind === 'splatling') {
            // spin up (a full charge at range, a quicker partial one up close), release, track while the stream runs
            const wr = a.weaponRunner, want = dist > range * 0.55 ? this.chargeRelease : 0.55 + 0.25 * this.chargeRelease;
            it.fire = !wr.streaming && dist < range * 1.1 && !(wr.charging && wr.charge >= want);
            if (wr.charging) move.multiplyScalar(0.45);
          } else if (w.kind === 'slosher') {
            it.fire = dist < range * 1.05;   // the lob also reaches targets up on ledges / behind low cover
          } else if (w.kind === 'brush') {
            it.fire = dist < 4.5;
          } else if (w.kind === 'charger') {
            it.fire = !(a.weaponRunner.charging && a.weaponRunner.charge >= this.chargeRelease);
            if (a.weaponRunner.charging) move.multiplyScalar(0.3);
          } else if (w.kind === 'roller') {
            it.fire = dist < 5.5 || (a.weaponRunner.rolling && dist < 8);
          } else {
            it.fire = dist < range * 1.08;
          }
          this._firing = it.fire;
          if (this.bombCd <= 0 && this._fightSub(dist)) { it.sub = true; this._bombAim = true; }
        } else if (CHARGES[w.kind] && a.weaponRunner.charging && !enemyVisible) {
          it.fire = true; // keep charge while target briefly hidden
        }
        // out of range with own ink underfoot: swim in (fast, hard to hit) instead of walking
        if (!it.fire && !a.weaponRunner.charging && dist > range * 1.15 && a.groundTeam === 1) it.squid = true;
        if (w.kind === 'dualies') {
          // dodge roll: while firing, roll sideways when hit or when the fight gets close (the runner locks the turret
          // after) — never toward the sea
          const wr = a.weaponRunner;
          if (it.fire && this.dodgeCd <= 0 && a.grounded && !wr.dodge && wr.dualRolls > 0 && (a.lastDamage < 0.3 || dist < 5.5) && Math.random() < 0.08 * dt * 60) {
            const side = Math.random() < 0.5 ? -1 : 1;
            if (!this._nearWater(a, (w.rollDist ?? 2.8) + 0.4)) { move.set(-nz * side, 0, nx * side); it.jump = true; this.dodgeCd = 1.4 + Math.random() * 1.6; }
          }
        } else if (a.lastDamage < 0.25 && this.dodgeCd <= 0 && a.grounded && !CHARGES[w.kind] && Math.random() < (w.kind === 'twins' ? 0.6 : 0.3)
          && !this._nearWater(a, w.kind === 'twins' ? (w.rollDist ?? 3.4) + 0.4 : 1.6)) {
          // dodge: a strafe-hop right after taking a hit (twins: a dodge roll, since they're firing and moving)
          it.jump = true; this.dodgeCd = w.kind === 'twins' ? 0.9 + Math.random() : 2 + Math.random() * 2.5;
        }
        // an enemy canopy between us and the target: flank round it, save the shots, lob a sub over it
        if (enemyVisible) this._shieldFight(t, dist, move, it, dt); else this.blockT = 0;
        // kit weapons with their own fight tactics (bot.tactics, e.g. the Cutlass: flank, pre-charge, swim in, strafe):
        // every fight frame, aimed or not, after the defaults above — may override move, fire, squid and jump
        if (BK?.tactics) BK.tactics(this, { a, w, dist, range, dt, it, move, target: t, visible: enemyVisible, aimed, canFire: enemyVisible && this.react <= 0 && aimed && inkFrac > 0.02 });
        // special
        if (a.specialReady() && (this._wantSpecial('fight', dist, enemyVisible) || (zp && this._zoneSpecial(zp, true)))) it.special = true;
      } else {
        // retreat: swim away through own ink, keep eyes on the threat
        it.squid = true;
        // (kits with their own tactics run the retreat too — ctx.retreat — e.g. the Cutlass runs where there's no ink)
        const RK = MAIN_KITS[w.kind]?.bot;
        if (RK?.tactics) RK.tactics(this, { a, w, dist, range, dt, it, move, target: t, visible: enemyVisible, aimed: false, canFire: false, retreat: true });
      }
    } else if (this.mode === 'paint') {
      // paint the most valuable ground in reach (unclaimed, and enemy ink even more), with a sweeping aim around it
      this.sweep += dt * (w.kind === 'charger' ? 0.8 : 2.1);
      this.paintScanT -= dt;
      if (this.paintScanT <= 0 && !MELEE[w.kind]) {
        this.paintScanT = 0.35 + Math.random() * 0.15;
        const reach = w.kind === 'charger' || w.kind === 'spinner' || w.kind === 'splatling' ? 8.5 : w.kind === 'bucket' || w.kind === 'slosher' ? 7 : w.kind === 'blaster' ? 5 : 4.5;
        let bestOff = 0, bestV = -1;
        for (const off of [0, -0.6, 0.6, -1.2, 1.2]) {
          const yw = (wantMove ? Math.atan2(move.x, move.z) : this.aimYaw) + off;
          const st = G.paint.regionStats(a.pos.x + Math.sin(yw) * reach, a.pos.y, a.pos.z + Math.cos(yw) * reach, 2.2, a.team, _stats);
          let v = st.n ? st.empty + st.enemy * 1.4 - Math.abs(off) * 0.12 : -1;
          if (zp && st.n && zp.onActive(a.pos.x + Math.sin(yw) * reach, a.pos.y, a.pos.z + Math.cos(yw) * reach)) v += 0.8;   // the zone's ink first
          if (v > bestV) { bestV = v; bestOff = off; }
        }
        this.paintYawOff = bestOff;
      }
      const sweepAmt = MELEE[w.kind] ? 0 : 0.35;
      wantYaw += (MELEE[w.kind] ? 0 : this.paintYawOff) + Math.sin(this.sweep) * sweepAmt;
      wantPitch = MAIN_KITS[w.kind]?.bot?.paintPitch !== undefined ? MAIN_KITS[w.kind].bot.paintPitch : w.kind === 'charger' ? -0.12 : w.kind === 'spinner' || w.kind === 'slosher' ? -0.16 : w.kind === 'blaster' ? -0.28 : w.kind === 'splatling' ? -0.3
        : w.kind === 'bucket' ? -0.5 : -0.42;
      // Zone Control: a needy patch of the zone in reach → ink that (long range: from the perch, straight at it)
      let zAim = zp && !MELEE[w.kind] ? this._zoneAim(zp, dt, wantMove, move) : null;
      if (zp && this.zFace > 0) {   // about to throw a special onto the zone: turn to it first
        this.zFace -= dt;
        const c = zp.Z.zones[this.zZone]?.center;
        if (c) zAim = { x: c[0], y: c[1], z: c[2], d: Math.hypot(c[0] - a.pos.x, c[2] - a.pos.z) };
      }
      if (zAim) {
        wantYaw = Math.atan2(zAim.x - a.pos.x, zAim.z - a.pos.z) + Math.sin(this.sweep) * 0.22;
        if (CHARGES[w.kind] || zAim.d < 3.2) wantPitch = clamp(Math.atan2(zAim.y + 0.05 - (a.pos.y + 1.1), Math.max(0.5, zAim.d)), -0.95, 0.15);
      }
      const aheadStats = G.paint.regionStats(a.pos.x + Math.sin(wantYaw) * 4, a.pos.y, a.pos.z + Math.cos(wantYaw) * 4, 3, a.team, _stats);
      const needPaint = aheadStats.n === 0 || aheadStats.own < 0.75 || !!zAim;
      const PK = MAIN_KITS[w.kind]?.bot;
      if (PK?.paint) {
        it.fire = PK.paint(this, { a, w, dt, it, move, needPaint, inkFrac, wantMove });
      } else if (MELEE[w.kind]) {
        it.fire = inkFrac > 0.08 && (needPaint || Math.random() < 0.02) && wantMove;
      } else if (w.kind === 'spinner') {
        // spin to ~60 %, release, let the stream paint, breather
        const wr = a.weaponRunner;
        if (wr.burstT > 0) it.fire = false;
        else if (wr.charging) { it.fire = wr.charge < 0.6; if (!it.fire) this.paintPause = 0.25 + Math.random() * 0.3; }
        else it.fire = needPaint && inkFrac > 0.3 && this.paintPause <= 0;
      } else if (w.kind === 'splatling') {
        // spin up ~60 %, hose the lane while the stream runs, breathe, repeat
        const wr = a.weaponRunner;
        if (wr.streaming) it.fire = false;
        else if (wr.charging) { it.fire = wr.charge < 0.6; if (!it.fire) this.paintPause = 0.25 + Math.random() * 0.3; }
        else it.fire = needPaint && inkFrac > 0.25 && this.paintPause <= 0;
      } else if (w.kind === 'charger') {
        // charge to ~70 % and release a paint line, then a short breather before the next one
        if (a.weaponRunner.charging) {
          it.fire = a.weaponRunner.charge < 0.7;
          if (!it.fire) this.paintPause = 0.3 + Math.random() * 0.35;
        } else it.fire = needPaint && inkFrac > 0.3 && this.paintPause <= 0;
      } else {
        it.fire = needPaint && inkFrac > 0.18;
      }
      // travel as a squid through own ink when not painting
      if (!it.fire && this._pathRemaining() > 5 && a.groundTeam === 1) it.squid = true;
      if (this.bombCd <= 0 && this._paintSub()) { it.sub = true; this._bombAim = true; }
      else if (zp) {
        // Zone Control: lob a bomb onto a patch of their ink on the zone (turn to it, then throw)
        const zb = this._zoneBombAim(zp, dt);
        if (zb) {
          wantYaw = zb.yaw; wantPitch = zb.pitch;
          if (zb.release) this.zBomb = null;
          else if (Math.abs(angleDiff(this.aimYaw, zb.yaw)) < 0.09 && Math.abs(this.aimPitch - zb.pitch) < 0.09) { this._bombAim = true; zb.release = true; this.bombCd = 4 + Math.random() * 3; }
        }
      }
      if (a.specialReady() && (zp ? this._zoneSpecial(zp) : this._wantSpecial('paint', 0, false))) it.special = true;
    } else if (this.mode === 'refill') {
      it.squid = a.groundTeam === 1 || this._pathRemaining() > 2;
      if (a.groundTeam !== 1 && this._pathRemaining() < 1.5 && inkFrac > 0.03) {
        // no ink here: paint a puddle to swim in
        it.squid = false; it.fire = true;
        wantPitch = -1.0;
      }
    }
    // ---------------- running specials (and cheering on a teammate's Cheer Orb)
    this._specialCtl(dt, it, move, fightDist, enemyVisible);
    // ---------------- enemy Waddles / Torpedoes after us: shoot them down or get out of the way (aim + trigger + move);
    // enemy launched canopies in the way: steer round the nearer edge (or break one we're boxed in by)
    let thrAim = this._threatCtl(dt, it, move);
    const canAim = this._canopyCtl(dt, it, move, !thrAim);
    if (!thrAim && canAim) thrAim = canAim;
    if (thrAim) { wantYaw = thrAim.yaw; wantPitch = thrAim.pitch; }
    // ---------------- wall climb (nav 'climb' edge): ink the wall column up to the top, then swim up it
    this._climbAim = this._climb(dt, move, it);
    if (this._climbAim) { wantYaw = this._climbAim.yaw; wantPitch = this._climbAim.pitch; }
    this._tail(dt, move, wantYaw, wantPitch, aimDist, wantMove, thrAim, enemyVisible);
  }

  // shared by turf and boss play: bomb release, the aim spring, the smoothed move command, edge guard, stuck recovery.
  // thrAim: a device / canopy the turf code is drawing a bead on; enemyVisible: in a duel (both unset in boss play)
  _tail(dt, move, wantYaw, wantPitch, aimDist, wantMove, thrAim = null, enemyVisible = false) {
    const a = this.a, it = a.intent, w = a.weapon;
    // throws and placements only happen in humanoid form: stay upright for the press and the release
    if (this._bombAim) { it.sub = true; it.squid = false; this._bombAim = false; this._releaseBomb = true; }
    else if (this._releaseBomb) { it.sub = false; it.squid = false; this._releaseBomb = false; }

    // ---------------- aim: critically-damped spring with a turn-rate cap (flicks accelerate and settle; no twitch)
    const fighting = this.mode === 'fight';
    const snappy = fighting || !!thrAim;   // duelling, or drawing a bead on a device / canopy
    const om = snappy ? (this.diff.aimOmega ?? 13) : 8;
    const maxRate = snappy ? (this.diff.aimTurn ?? 10) : 6;
    wantPitch = clamp(wantPitch, -1.1, 1.0);
    this.aimYawV += (om * om * angleDiff(this.aimYaw, wantYaw) - 2 * om * this.aimYawV) * dt;
    this.aimYawV = clamp(this.aimYawV, -maxRate, maxRate);
    this.aimYaw += this.aimYawV * dt;
    if (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2; else if (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
    this.aimPitchV += (om * om * (wantPitch - this.aimPitch) - 2 * om * this.aimPitchV) * dt;
    this.aimPitchV = clamp(this.aimPitchV, -maxRate * 0.7, maxRate * 0.7);
    this.aimPitch = clamp(this.aimPitch + this.aimPitchV * dt, -1.1, 1.0);
    a.aimYaw = this.aimYaw; a.aimPitch = this.aimPitch;
    // shots go where the bot is actually aiming (its eye ray at the target's distance), never straight to the target
    {
      const cp = Math.cos(this.aimPitch);
      const d = this._climbAim ? this._climbAim.dist : thrAim ? thrAim.dist : fighting && this.target ? aimDist : this.mode === 'refill' ? 1.6 : 6;
      a.aimPoint.set(a.pos.x + Math.sin(this.aimYaw) * cp * d, a.pos.y + 1.1 + Math.sin(this.aimPitch) * d, a.pos.z + Math.cos(this.aimYaw) * cp * d);
      if (!fighting && !thrAim) { const gy = a.pos.y; if (a.aimPoint.y < gy) a.aimPoint.y = gy; }
    }

    // ---------------- never walk, strafe or swim off into the sea; stay a kid over grates spanning water
    this._avoidWater(move);
    if (it.squid && this._squidWouldDrop(move)) it.squid = false;

    // ---------------- smooth the move command: heading slews (no twitch at waypoint switches / strafe flips)
    const ml = Math.min(1, move.length());
    if (ml > 0.01) {
      const des = Math.atan2(move.x, move.z);
      const d = angleDiff(this.mvYaw, des);
      if (this.mvMag < 0.05) this.mvYaw = des;
      else if (Math.abs(d) > 2.1) { this.mvYaw = des; this.mvMag *= 0.35; }      // reversal: let the body plant and reverse
      else this.mvYaw += clamp(d, -11 * dt, 11 * dt);
    }
    this.mvMag += (ml - this.mvMag) * (1 - Math.exp(-14 * dt));
    it.move.set(Math.sin(this.mvYaw) * this.mvMag, 0, Math.cos(this.mvYaw) * this.mvMag);
    // edge guard (after the smoothing, which can swing the heading past what _avoidWater checked): never steer off a
    // deck into the sea. Probe the ground a stopping distance ahead; if it's water, slide along the edge (whichever
    // diagonal is safe) or stop.
    if (this.mvMag > 0.05 && a.grounded && !a.climbing) this._edgeGuard(a, it.move);
    // stuck recovery, based on progress toward the current waypoint: hop → skip the waypoint → replan
    const trying = this.path && wantMove && !(CHARGES[w.kind] && (a.weaponRunner.charging || a.weaponRunner.burstT > 0));
    if (!trying) this.noProg = 0;
    if (this.noProg > 0.7 && this.jumpCd <= 0 && a.grounded && !this._nearWater(a, 1.2)) { it.jump = true; this.jumpCd = 1.0; }
    if (this.noProg > 1.5 && this.path && this.pi < this.path.length - 1 && !this._skipped) { this.pi++; this._skipped = true; this.bestD = Infinity; }
    if (this.noProg > 2.4) {
      this.noProg = 0; this._skipped = false; this.path = null; this.goalTimer = 0; this.repath = 0;
      // replanning keeps failing here: shake loose in a random direction and let the next goal come from elsewhere
      if (++this.strikes >= 2) { this.strikes = 0; this._wiggle(0.9); }
      this.strikeT = 8;
    }
    if (this.noProg === 0) this._skipped = false;
    this.stuck = this.noProg;
    if (this._needJump && this.jumpCd <= 0 && a.grounded) { it.jump = true; this.jumpCd = 0.6; this._needJump = false; }
    // displacement watchdog: asking to move for 1.5 s but covering < 0.4 m means something the waypoint logic can't
    // see is holding us (re-plans reset its progress timer, so it can't catch this). Duels are exempt: strafing
    // back and forth is meant to stay put.
    this.dispT += dt; this.moveAcc += this.mvMag * dt;
    if (this.dispT >= 1.5) {
      const moved = Math.hypot(a.pos.x - this.snap.x, a.pos.z - this.snap.z);
      if (this.moveAcc / this.dispT > 0.45 && moved < 0.4 && !(this.mode === 'fight' && enemyVisible) && a.grounded && !this._climbAim && !a.climbing) {
        if (++this.strikes >= 2) { this.strikes = 0; this.goalTimer = 0; }
        this.strikeT = 8;
        this._wiggle(0.7);
      }
      this.snap.copy(a.pos); this.dispT = 0; this.moveAcc = 0;
    }
  }

  _climbEdge() {
    if (!this.path || this.pi <= 0 || this.pi >= this.path.length) return null;
    const e = G.nav.edge(this.path[this.pi - 1], this.path[this.pi]);
    return e && e.type === 'climb' ? e : null;
  }
  // Drives a climb edge once we're at its wall. Returns the aim to hold ({ yaw, pitch, dist }) or null.
  _climb(dt, move, it) {
    const a = this.a, e = this._climbEdge();
    if (!e) { this.climbT = 0; return null; }
    const top = G.nav.nodes[this.path[this.pi]];
    if (a.grounded && a.pos.y > top.y - 0.4) { this.climbT = 0; return null; }       // on top: normal steering finishes
    const [wx, , wz] = e.wallP, [nx, nz] = e.wallN;
    const dist = (a.pos.x - wx) * nx + (a.pos.z - wz) * nz;                            // distance out from the wall
    if (!a.climbing && (dist > 2.4 || Math.hypot(a.pos.x - wx, a.pos.z - wz) > 2.8)) return null; // still walking up to it
    this.climbT += dt;
    if (this.climbT > 7) {                                                              // not working: plan around climbs for a while
      this.climbT = 0; this.noClimbUntil = this.t + 12; this.path = null; this.repath = 0; this.goalTimer = 0;
      return null;
    }
    const yaw = Math.atan2(-nx, -nz);
    const swim = () => { it.squid = true; it.fire = false; move.set(-nx, 0, -nz); return { yaw, pitch: 0.5, dist: 2 }; };
    if (a.climbing) return swim();
    const gap = this._wallInkGap(wx, wz, nx, nz, a.pos.y, e.topY);
    if (gap === null) return swim();                                                    // column is ours: swim up
    if (a.ink < PLAYER.inkMax * 0.05) return null;                                      // out of ink: refill logic takes over
    // stand ~1–1.6 m off the wall and paint the lowest un-inked strip, working upward
    if (dist < 0.9) move.set(nx * 0.6, 0, nz * 0.6); else if (dist > 1.6) move.set(-nx * 0.6, 0, -nz * 0.6); else move.set(0, 0, 0);
    it.squid = false;
    const w = a.weapon;
    if (CHARGES[w.kind]) it.fire = a.weaponRunner.burstT <= 0 && !(a.weaponRunner.charging && a.weaponRunner.charge >= 0.45);
    else it.fire = true;
    const hd = Math.max(0.5, dist), dy = gap + 0.3 - (a.pos.y + 1.1);
    return { yaw, pitch: Math.atan2(dy, hd), dist: Math.hypot(hd, dy) };
  }
  // Lowest height on the wall column in front of the climb spot that isn't our ink yet (null = inked to the top).
  _wallInkGap(wx, wz, nx, nz, y0, topY) {
    const P = G.physics, h = this._wh || (this._wh = new Hit()), o = _v, d = _v2.set(-nx, 0, -nz);
    for (let y = y0 + 0.3; y < topY - 0.1; y += 0.45) {
      o.set(wx + nx * 0.6, y, wz + nz * 0.6);
      if (!P.raycast(o, d, 1.2, h, true).hit) return null;                               // wall ended below the top
      if (h.face < 0 || G.paint.sample(h.face, h.u, h.v) - 1 !== this.a.team) return y;
    }
    return null;
  }

  // Remove any heading that would put us over open water: try the nearest safe heading, else stand still.
  _avoidWater(move) {
    const l = Math.hypot(move.x, move.z);
    if (l < 0.05) return;
    const a = this.a, L = G.level, yaw = Math.atan2(move.x, move.z);
    const safe = (yw) => {
      for (const d of [0.7, 1.3]) if (L.groundHeight(a.pos.x + Math.sin(yw) * d, a.pos.z + Math.cos(yw) * d, 50) === -Infinity) return false;
      return true;
    };
    if (safe(yaw)) return;
    for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2]) {
      const yw = yaw + (this._waterSide || 1) * off;
      if (safe(yw)) { this._waterSide = Math.sign(off) * (this._waterSide || 1); move.set(Math.sin(yw) * l, 0, Math.cos(yw) * l); return; }
    }
    move.set(0, 0, 0);
  }
  // ---- water probes (upstream). "Wet" = open sea under (x, z): no deck at all below y + 0.6 — exactly the rule that
  // splats an actor (actor.js) and that nav uses for node.wet. Upstream also counted any ground below
  // PLAYER.fallDeathY as wet, but our dry-dock trench floors (y = -2.0, below the sea surface) are safe, walkable nav
  // ground — counting them would freeze bots in the trench (edge guard) and block their hops there. Grates count as
  // ground here (these probes are for kid-form walking / hopping / rolling; _squidWouldDrop handles squids).
  _wet(x, z, y) { return G.level.groundHeight(x, z, y + 0.6) === -Infinity; }
  // ground all the way along a straight walk (samples every 0.45 m)
  _dryLine(x0, y0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.45);
    for (let i = 1; i <= n; i++) { const t = i / n; if (this._wet(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y0)) return false; }
    return true;
  }
  // open water anywhere on a ring of radius r around the actor
  _nearWater(a, r) {
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; if (this._wet(a.pos.x + Math.cos(t) * r, a.pos.z + Math.sin(t) * r, a.pos.y)) return true; }
    return false;
  }
  // final move command: if the ground a stopping distance ahead is water, slide along the edge or stop
  _edgeGuard(a, mv) {
    const m = Math.hypot(mv.x, mv.z); if (m < 1e-4) return;
    const dx = mv.x / m, dz = mv.z / m;
    const look = 0.6 + Math.hypot(a.vel.x, a.vel.z) * 0.17;
    const px = a.pos.x, py = a.pos.y, pz = a.pos.z;
    const bad = (ux, uz) => this._wet(px + ux * 0.45, pz + uz * 0.45, py) || this._wet(px + ux * look, pz + uz * look, py);
    if (!bad(dx, dz)) return;
    for (const ang of [0.8, -0.8, 1.45, -1.45]) {
      const c = Math.cos(ang), s = Math.sin(ang), nx = dx * c + dz * s, nz = -dx * s + dz * c;
      if (!bad(nx, nz)) { mv.set(nx * m, 0, nz * m); return; }
    }
    mv.set(0, 0, 0);
  }
  // squid form drops through grates: is there only water under us (or just ahead) once grates don't count?
  _squidWouldDrop(move) {
    const a = this.a, L = G.level;
    if (L.groundHeight(a.pos.x, a.pos.z, 50, true) === -Infinity) return true;
    const l = Math.hypot(move.x, move.z);
    return l > 0.05 && L.groundHeight(a.pos.x + (move.x / l) * 1.2, a.pos.z + (move.z / l) * 1.2, 50, true) === -Infinity;
  }

  // Low on health mid-duel: head for own ink away from the threat (swim = heal + hard to spot), then come back.
  _pickRetreat() {
    const a = this.a, t = this.target;
    let bestP = null, bs = -Infinity;
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
      _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
      const st = G.paint.regionStats(_v.x, _v.y, _v.z, 1.4, a.team, _stats);
      if (!st.n) continue;
      const away = t ? Math.hypot(_v.x - t.pos.x, _v.z - t.pos.z) - Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) : 0;
      const score = st.own * 6 + away * 0.8 - r * 0.15 + (t && !G.physics.los(_v2.set(_v.x, _v.y + 1, _v.z), _v3.set(t.pos.x, t.pos.y + 1, t.pos.z)) ? 4 : 0);
      if (score > bs) { bs = score; bestP = _v.clone(); }
    }
    if (bestP) this._pathTo(bestP, 0.5); else this.path = null;
    this.repath = 1.0;
  }

  // Mid-duel sub use (enemy in view at `dist`). Sets the cooldown and returns true to throw this frame.
  // when to fire off the special (fight: distance to the target; paint: only the turf-claiming ones)
  _wantSpecial(mode, dist, vis) {
    const a = this.a, id = SPECIALS[a.specialId]?.kind || a.specialId, r = Math.random();
    if (mode === 'fight') {
      switch (id) {
        case 'slam': return dist < 4.5;
        case 'storm': return dist < 16;
        case 'barrage': return dist < 14;
        case 'bubbler': return dist < 12 && (a.lastDamage < 0.6 || r < 0.02);
        case 'sonar': return r < 0.02;
        case 'strike': return dist > 14 && r < 0.01;
        case 'zooka': return vis && dist > 7 && dist < 36;
        case 'wail': return vis && dist > 5 && dist < 40;
        case 'kraken': return dist < 10;
        case 'blower': return dist < 14;
        case 'jetpack': return dist > 5 && dist < 22;
        case 'stamp': return dist < 9;
        case 'booyah': return dist > 9 && dist < 26 && r < 0.03;
        case 'zipcaster': return dist < 16;
        case 'crab': return dist < 20;
      }
      return false;
    }
    const turf = { storm: 1, strike: 1, booyah: 1, barrage: 1, sonar: 1, kraken: 1, crab: 1, zooka: 1, blower: 1, stamp: 1 };
    if (!turf[id] || r > 0.012) return false;
    const st = G.paint.regionStats(a.pos.x, a.pos.y, a.pos.z, 6, a.team, _stats);
    return st.own < 0.55;
  }

  // driving a running special: most reuse the normal fight aim; these set the trigger / sub / movement they need
  _specialCtl(dt, it, move, dist, vis) {
    const a = this.a, s = a.specialActive;
    // cheer on a teammate's charging Cheer Orb
    if ((!s || s.id !== 'booyah') && Math.random() < dt * 1.3) {
      for (const o of G.actors) { const os = o.specialActive; if (o !== a && o.team === a.team && os && os.id === 'booyah' && !os.thrown) { it.cheer = true; break; } }
    }
    // don't waste shots or bombs into a Mega Stamp's swing from the front (its guard deflects them)
    const ts = this.target && this.target.specialActive;
    if (ts && ts.id === 'stamp' && ts.guard > 0) {
      const T = this.target, fy = ts.bodyYaw ?? T.yaw, rx = a.pos.x - T.pos.x, rz = a.pos.z - T.pos.z, rl = Math.hypot(rx, rz) || 1;
      if ((rx * Math.sin(fy) + rz * Math.cos(fy)) / rl > Math.cos(1.2)) { it.fire = false; it.sub = false; }
    }
    if (!s) return;
    // Zone Control: a Vortex Strike lands on the live zone (on its enemy ink when we're taking it back)
    if (s.id === 'strike' && s.aiming && s.target && !s._zoneAimed && G.match && G.match.zones) {
      s._zoneAimed = true;
      const P = zonePlan(), p = P && P.hotspot(this.zZone, a.team);
      if (p) s.target.set(p.x, 0, p.z);
    }
    const fighting = this.mode === 'fight' && !!this.target;
    const t = this.target;
    // charge straight at the target only when it's close (further out the nav path + water avoidance steer)
    const toward = () => {
      if (!t || dist > 5 || Math.abs(t.pos.y - a.pos.y) > 1.2) return;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
      if (G.level.groundHeight(a.pos.x + (dx / l) * 1.5, a.pos.z + (dz / l) * 1.5, a.pos.y + 1) < a.pos.y - 1.5) return;   // don't run off a ledge
      move.set(dx / l, 0, dz / l);
    };
    this.spT = (this.spT || 0) + dt;
    switch (s.kind || s.id) {
      case 'barrage':
        this.barrageCd = (this.barrageCd || 0) - dt;
        if (this.barrageCd <= 0 && (!fighting || dist < 16)) { it.sub = true; this._bombAim = true; this.barrageCd = 0.35 + Math.random() * 0.3; }
        break;
      case 'zooka':
        it.fire = fighting ? vis && dist < 42 : Math.random() < 0.06;
        it.squid = false;
        break;
      case 'kraken':
        it.squid = false;
        if (fighting) { toward(); it.fire = dist < 3.6 && vis; if (a.grounded && dist > 6 && Math.random() < dt * 0.8) it.jump = true; }
        break;
      case 'stamp': {
        // heavy stamp: charge when the target is roughly ahead of the (slow-turning) body, stop to turn when it isn't,
        // flip (jump + swing) to hit something right behind or just past swing reach, throw it at range
        it.squid = false;
        const d = s.def;
        this.stampFlip = (this.stampFlip || 0) - dt;
        if (this.stampFlip > 0) { if (!a.grounded) it.fire = true; break; }   // mid-jump: swing once airborne = the flip
        if (fighting && t) {
          const off = Math.abs(angleDiff(s.bodyYaw ?? a.yaw, Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z)));
          const near3 = Math.abs(t.pos.y - a.pos.y) < 1.8;
          if (a.grounded && near3 && dist < 2.6 && off > 2.3) { it.jump = true; this.stampFlip = 0.4; }             // right behind: flip
          else if (a.grounded && near3 && off < 0.3 && dist > 3.3 && dist < 4.3) { it.jump = true; this.stampFlip = 0.4; }   // just out of reach: flip
          else if (off > 0.9 && dist < 9) move.set(0, 0, 0);                                                           // stop and turn
          else {
            // charge: straight at the target from further out than other specials (unless that runs off a ledge)
            if (near3 && dist < 12) {
              const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
              if (G.level.groundHeight(a.pos.x + (dx / l) * 1.5, a.pos.z + (dz / l) * 1.5, a.pos.y + 1) >= a.pos.y - 1.5) move.set(dx / l, 0, dz / l);
            }
            it.fire = off < 0.7 && dist < d.reach + d.radius + 0.5;
          }
          if (vis && dist > 9 && dist < 20 && Math.random() < dt * 0.8) it.sub = true;
        } else it.fire = Math.random() < 0.5;
        break;
      }
      case 'crab':
        it.fire = fighting ? vis && dist < 24 : Math.random() < 0.3;
        it.sub = fighting && vis && dist > 8 && dist < 22 && Math.random() < dt * 1.5;
        it.squid = (fighting && s.hp < s.def.hp * 0.3 && dist > 8) || (!fighting && this._pathRemaining() > 12);
        break;
      case 'blower':
        this.blowT = (this.blowT || 0) + dt;
        it.fire = this.blowT < 0.9;
        if (this.blowT > 1.4) this.blowT = 0;
        it.squid = false;
        break;
      case 'booyah':
        it.squid = false;
        it.fire = s.charge >= 1 && Math.random() < dt * 3;
        break;
      case 'jetpack':
        it.fire = fighting && vis && dist < 30;
        break;
      case 'zipcaster':
        if (fighting && vis && dist > 6 && dist < 18 && Math.random() < dt * 0.6) it.sub = true;
        break;
    }
  }

  _fightSub(dist) {
    const a = this.a, sub = a.sub || SUB.bomb, k = sub.kind;
    if (a.ink < sub.inkCost + 8 || k === 'beacon') return false;
    { const SK = SUB_KITS[k]?.bot; if (SK?.fight) return SK.fight(this, dist); }   // kit subs decide for themselves
    const roll = Math.random() < 0.02 * (1 + this.diff.fireDiscipline);
    let go = false;
    switch (k) {
      case 'burst': go = dist > 3 && dist < 12 && Math.random() < 0.04; break;                // cheap: often
      case 'scan': go = dist > 8 && dist < 18 && roll; break;
      case 'curtain': go = dist > 4 && dist < 14 && a.lastDamage < 0.6 && Math.random() < 0.05; break;  // cover when hit
      case 'sprinkler': go = false; break;
      case 'mine': go = dist < 10 && a.lastDamage < 1.5 && Math.random() < 0.05; break;     // a trap at your feet while under fire
      case 'seeker': go = dist > 5 && dist < 15 && roll; break;
      default: go = dist > 4 && dist < 14 && roll;                                              // bomb, sticky, mist
    }
    if (go) this.bombCd = k === 'burst' ? 1.5 + Math.random() * 2 : 5 + Math.random() * 6;
    return go;
  }
  // Sub use while painting: sprinklers onto open turf ahead, mines around the contested middle, beacons up front.
  _paintSub() {
    const a = this.a, sub = a.sub || SUB.bomb, k = sub.kind;
    { const SK = SUB_KITS[k]?.bot; if (SK?.paint) return a.ink >= sub.inkCost + 4 && SK.paint(this); }
    if (a.ink < sub.inkCost + (sub.placed ? 4 : 20) || Math.random() > (sub.placed ? 0.04 : 0.01)) return false;
    const pads = G.level.spawnPads, total = pads[0].distanceTo(pads[1]);
    const progress = 1 - Math.hypot(a.pos.x - pads[1 - a.team].x, a.pos.z - pads[1 - a.team].z) / total;
    let go = false;
    if (k === 'sprinkler') {
      const st = G.paint.regionStats(a.pos.x + Math.sin(a.aimYaw) * 5, a.pos.y, a.pos.z + Math.cos(a.aimYaw) * 5, 3, a.team, _stats);
      go = st.n > 0 && st.own < 0.4;
    } else if (k === 'mine') go = progress > 0.3 && progress < 0.7;
    else if (k === 'beacon') go = progress > 0.4 && !G.subs.beaconsFor(a.team).some((b) => b.pos.distanceTo(a.pos) < 12);
    if (go) this.bombCd = 8 + Math.random() * 8;
    return go;
  }

  // ================================================================ Zone Control (only ever called in a zones match)
  // after respawning: super jump to the teammate (or jump beacon) closest to our zone when it's a long way off
  _zoneJump(P, minD = 24, chance = 0.8) {
    const a = this.a, r = P.roleOf(a), c = P.Z.zones[r.zone].center, R = P.info[r.zone].R;
    const dSelf = Math.hypot(a.pos.x - c[0], a.pos.z - c[2]);
    if (dSelf < minD || Math.random() > chance || r.role === 'push') return;
    let best = null, bd = Math.min(dSelf - 12, R + 14);
    const W = P.waves[a.team], st = W.state !== 'free' ? P.info[r.zone].stage[a.team] : null;
    if (st) {
      // locked out: land with the group at the staging spot, never alone on their zone
      bd = 9;
      for (const o of G.actors) {
        if (o === a || o.team !== a.team || !o.alive || o.superJumpState || o.hp < PLAYER.hp * 0.45 || P.onZone(r.zone, o.pos)) continue;
        const d = Math.hypot(o.pos.x - st.x, o.pos.z - st.z);
        if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
      }
      if (!best) return;
      if (a.superJump(best)) { this.path = null; this.goalTimer = 0; }
      return;
    }
    for (const o of G.actors) {
      if (o === a || o.team !== a.team || !o.alive || o.superJumpState || o.hp < PLAYER.hp * 0.45) continue;
      const d = Math.hypot(o.pos.x - c[0], o.pos.z - c[2]);
      if (d < bd && o.pos.distanceTo(a.pos) > 18) { bd = d; best = o; }
    }
    for (const b of G.subs ? G.subs.beaconsFor(a.team) : []) {
      const d = Math.hypot(b.pos.x - c[0], b.pos.z - c[2]);
      if (d < bd - 2 && b.pos.distanceTo(a.pos) > 18) { bd = d; best = b; }
    }
    const ok = best && (best.pos && best.kind === 'beacon' ? G.subs.jumpToBeacon(a, best) : a.superJump(best));
    if (ok) { this.path = null; this.goalTimer = 0; }
  }

  // per frame: a rotation or a changed role / zone re-targets straight away
  _zoneSync(P) {
    const r = P.roleOf(this.a);
    if (P.Z.active !== this._zAct || r.role !== this.zRole || r.zone !== this.zZone) {
      const rotated = P.Z.active !== this._zAct && this._zAct !== null;
      this._zAct = P.Z.active; this.zRole = r.role; this.zZone = r.zone;
      this.goalTimer = 0; this.zHoldUntil = 0; this.zHoldDur = 0; this.zAimT = 0; this._zAim = null;
      if (rotated && this.mode === 'paint') this.path = null;
      if (rotated) this.zJumpAt = this.t + 0.4 + Math.random() * 2;   // the objective moved a long way off: maybe jump there
    }
    // (after a rotation, a bot far from the new zone and not in a fight super jumps to a teammate already on it)
    if (this.zJumpAt && this.t >= this.zJumpAt) {
      this.zJumpAt = 0;
      if (this.mode === 'paint' && !this.target && this.a.alive && !this.a.specialActive) this._zoneJump(P, 34, 0.5);
    }
  }

  // take the fight? In range, or the foe is on / by our zone; otherwise keep inking the objective
  _zoneEngage(P) {
    const a = this.a, t = this.target;
    if (!t) return false;
    if (this.zRole === 'push') return true;
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z), range = this._range();
    if (d < range * (this.zRole === 'watch' ? 1.05 : 1.25)) return true;
    if (this.zRole === 'watch' || this.zRole === 'stage') return false;   // (stagers wait for the group)
    const c = P.Z.zones[this.zZone].center;
    return Math.hypot(t.pos.x - c[0], t.pos.z - c[2]) < P.info[this.zZone].R + 5;
  }
  // in a fight: watchers keep their perch while the foe is in range; guards don't chase more than ~10 m off the zone
  _zoneHoldGround(P) {
    const a = this.a, t = this.target, range = this._range();
    const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    if (this.zRole === 'watch') return d < range * 1.05 && d > 3;
    if (this.zRole === 'stage') return d > 4;                          // hold the staging spot: shoot, don't chase
    if (this.zRole === 'push' || d < 4) return false;
    // guards / painters: never chase a foe further off the zone than we are (shoot from here, then back to the ink)
    const c = P.Z.zones[this.zZone].center, R = P.info[this.zZone].R;
    const tz = Math.hypot(t.pos.x - c[0], t.pos.z - c[2]), sz = Math.hypot(a.pos.x - c[0], a.pos.z - c[2]);
    return tz > R + (this.zRole === 'guard' ? 3 : 6) && tz > sz + 2;
  }

  // next spot to go to for our role
  _pickZoneGoal(P) {
    const a = this.a, nav = G.nav, t = a.team, r = P.roleOf(a), zi = r.zone, I = P.info[zi], zone = P.Z.zones[zi];
    this.zRole = r.role; this.zZone = zi; this.zHoldDur = 0;
    let role = r.role;
    const needFrac = I.needSum[t] / Math.max(1, I.reach);
    // a guard with touch-ups to do paints; a watcher with nowhere to perch (or a zone slipping away) paints too
    if (role === 'guard' && needFrac > 0.1) role = 'paint';
    let id = -1, hold = 0;
    if (role === 'stage') {
      // regroup just outside the zone on our side and wait for the push (the plan flips us to 'paint' when it goes)
      const st = I.stage[t];
      if (st) { id = st.spots[(Math.random() * st.spots.length) | 0]; hold = 2 + Math.random() * 2; this.goalTimer = 12; }
      else role = 'guard';
    }
    if (role === 'push') {
      id = this._zonePushNode(P, I, zone);
      this.goalTimer = 4 + Math.random() * 3;
    } else if (role === 'watch') {
      id = this._zoneWatchNode(P, I, zone);
      if (id >= 0) { hold = 3 + Math.random() * 3; this.goalTimer = 12; }
    } else if (role === 'guard' && id < 0) {
      id = this._zoneGuardNode(P, I, zone);
      hold = 1 + Math.random() * 1.6; this.goalTimer = 7;
    }
    if (id < 0) {
      id = this._zonePaintNode(P, I, zone);
      hold = 0; this.goalTimer = 3.5 + Math.random() * 2;
    }
    // nothing left to ink on it: stand guard on it (or, failing that, press on past it)
    if (id < 0) { id = this._zoneGuardNode(P, I, zone); hold = 1 + Math.random() * 1.5; this.goalTimer = 6; }
    if (id < 0) { id = this._zonePushNode(P, I, zone); hold = 0; this.goalTimer = 4 + Math.random() * 3; }
    if (id < 0) { this._pickPaintGoal(); return; }
    const n = nav.nodes[id];
    if (this._pathTo(_v3.set(n.x, n.y, n.z), 0.3)) { this.zHoldDur = hold; this.zFail = 0; }
    else if (++this.zFail >= 3) { this.zFail = 0; this._wiggle(0.8); }   // no way out of here (off the nav mesh): shake loose
  }

  // the neediest reachable patch of the zone (its not-ours ink round a node), nearby first, away from teammates' goals
  _zonePaintNode(P, I, zone) {
    const a = this.a, nav = G.nav, need = I.need[a.team], N = I.nodes.length;
    if (!N) return -1;
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    let best = -1, bs = -Infinity;
    const step = N > 110 ? 2 : 1;
    for (let li = (Math.random() * step) | 0; li < N; li += step) {
      let v = 0;
      for (const k of I.nb[li]) v += need[k];
      if (v < 4) continue;
      const n = nav.nodes[I.nodes[li]];
      const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z) + Math.abs(n.y - a.pos.y) * 1.5;
      let sc = Math.min(v, 60) * 0.25 - d * 0.16 + Math.random() * 2;
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 3.5) sc -= 4; }
      if (sc > bs) { bs = sc; best = I.nodes[li]; }
    }
    return best;
  }
  // a spot on / at the edge of the zone, on its enemy-facing side, apart from the other guards
  _zoneGuardNode(P, I, zone) {
    const a = this.a, nav = G.nav, c = zone.center, e = P.enemyDir(zone, a.team);
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 40; k++) {
      const id = I.ring[(Math.random() * I.ring.length) | 0];
      const n = nav.nodes[id];
      const dx = n.x - c[0], dz = n.z - c[2], d = Math.hypot(dx, dz);
      if (d > I.R + 3 || n.wet === 2) continue;
      const side = (dx * e[0] + dz * e[1]) / Math.max(d, 1);
      let sc = side * 2 + (d > I.R * 0.4 ? 1 : 0) - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.05 + Math.random() * 1.5 - Math.abs(n.y - c[1]) * 0.5;
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 4) sc -= 3; }
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }
  // long range: a perch on our side of the zone, a little above it if possible, that can see it
  _zoneWatchNode(P, I, zone) {
    const a = this.a, nav = G.nav, c = zone.center, e = P.enemyDir(zone, a.team), range = this._range();
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot && o.alive && o.bot.goal >= 0);
    const dMax = Math.min(range * 0.85, I.R + 12), dMin = Math.min(I.R * 0.55, dMax - 2), cands = [];
    for (let k = 0; k < 70; k++) {
      const id = I.ring[(Math.random() * I.ring.length) | 0];
      const n = nav.nodes[id];
      const dx = n.x - c[0], dz = n.z - c[2], d = Math.hypot(dx, dz);
      if (d < dMin || d > dMax || n.wet === 2) continue;
      const side = (dx * e[0] + dz * e[1]) / Math.max(d, 1);
      let sc = clamp(n.y - c[1], -2, 4) * 1.1 - side * 1.6 - Math.abs(d - range * 0.55) * 0.1 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.04 + Math.random() * 1.2 - (n.wet ? 1.5 : 0);
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 5) sc -= 4; }
      cands.push([sc, id]);
    }
    cands.sort((x, y) => y[0] - x[0]);
    _v2.set(c[0], c[1] + 0.6, c[2]);
    for (let k = 0; k < Math.min(6, cands.length); k++) {
      const n = nav.nodes[cands[k][1]];
      if (G.physics.los(_v.set(n.x, n.y + 1.4, n.z), _v2)) return cands[k][1];
    }
    return -1;
  }
  // pressure forward: unclaimed / enemy turf 3–18 m past the zone toward the enemy's side (never camping their spawn)
  _zonePushNode(P, I, zone) {
    const a = this.a, nav = G.nav, c = zone.center, e = P.enemyDir(zone, a.team), ep = G.level.spawnPads[1 - a.team];
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 28; k++) {
      const id = I.far[(Math.random() * I.far.length) | 0];
      if (id === undefined) break;
      const n = nav.nodes[id];
      if (n.zone >= 0 || n.wet === 2 || Math.hypot(n.x - ep.x, n.z - ep.z) < 22) continue;
      const dx = n.x - c[0], dz = n.z - c[2], d = Math.hypot(dx, dz), side = (dx * e[0] + dz * e[1]) / Math.max(d, 1);
      if (side < -0.1) continue;
      const near = G.paint.regionStats(n.x, n.y, n.z, 3, a.team, _stats);
      if (!near.n) continue;
      const v = near.empty + near.enemy * 1.4;
      const sc = v * 10 + side * 2 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.1 + Math.random() * 1.5 - (n.wet ? 1.5 : 0);
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  }

  // a needy patch of our zone in reach of where we stand (re-picked ~1×/s); null = the normal paint scan decides
  _zoneAim(P, dt, moving, move) {
    this.zAimT -= dt;
    if (this.zAimT <= 0) {
      this.zAimT = 0.7 + Math.random() * 0.4;
      this._zAim = null;
      const a = this.a, w = a.weapon, zi = this.zZone;
      if (zi < 0 || !P.isActive(zi)) return null;
      const I = P.info[zi], need = I.need[a.team], nav = G.nav;
      const far = CHARGES[w.kind] ? Math.min(this._range() * 0.9, 16) : w.kind === 'bucket' || w.kind === 'slosher' ? 7 : w.kind === 'blaster' ? 6 : 5.5;
      const c = P.Z.zones[zi].center;
      if (Math.hypot(a.pos.x - c[0], a.pos.z - c[2]) > I.R + far) return null;
      let bs = -Infinity, bp = null;
      for (let li = 0; li < I.nodes.length; li++) {
        if (need[li] < 3) continue;
        const n = nav.nodes[I.nodes[li]], d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
        if (d < 1.4 || d > far || Math.abs(n.y - a.pos.y) > 3.5) continue;
        const sc = need[li] - d * 0.35;
        if (sc > bs) { bs = sc; bp = n; }
      }
      if (bp) {
        // (short-range kids only look aside for it when they're standing, or it's roughly the way they're going)
        const ahead = !moving || Math.abs(angleDiff(Math.atan2(move.x, move.z), Math.atan2(bp.x - a.pos.x, bp.z - a.pos.z))) < 1.1;
        if (CHARGES[w.kind] || ahead) this._zAim = { x: bp.x, y: bp.y, z: bp.z, d: 0 };
      }
    }
    const z = this._zAim;
    if (z) z.d = Math.hypot(z.x - this.a.pos.x, z.z - this.a.pos.z);
    return z;
  }

  // specials: break a hold on the zone (standing on / facing it), or defend it when foes turn up
  // (gauges fill fast in this mode — 4.5 p/s while the other team holds — so they're spent readily)
  _zoneSpecial(P, fighting = false) {
    const a = this.a, t = a.team, zi = this.zZone, W = P.waves[t];
    if (zi < 0 || !P.isActive(zi)) return false;
    if (W.state === 'stage' && !fighting) return false;                // saved for the push
    if (W.state === 'push' && G.time < P.spNext[t]) return false;     // chained: one teammate at a time
    const zone = P.Z.zones[zi], I = P.info[zi], c = zone.center;
    const dz = Math.hypot(a.pos.x - c[0], a.pos.z - c[2]);
    if (dz > I.R + 12) return false;
    const ours = P.Z.owner === t;
    let foes = 0;
    for (const o of G.actors) if (o.team !== t && o.alive && Math.hypot(o.pos.x - c[0], o.pos.z - c[2]) < I.R + 8) foes++;
    if (ours && !foes) return false;                                 // holding it quietly: keep it for the push-back
    const id = SPECIALS[a.specialId]?.kind || a.specialId;
    if ((id === 'sonar' || id === 'bubbler' || id === 'wail' || id === 'zooka' || id === 'stamp' || id === 'crab') && !foes) return false;
    // thrown / aimed ones go where we look: only while facing the zone or standing on it (fights: _wantSpecial's aim)
    const thrown = id === 'storm' || id === 'barrage' || id === 'booyah' || id === 'zooka' || id === 'wail' || id === 'blower';
    if (thrown && !fighting && dz > I.R * 0.7 && Math.abs(angleDiff(this.aimYaw, Math.atan2(c[0] - a.pos.x, c[2] - a.pos.z))) > 0.6) { this.zFace = 0.8; return false; }
    const go = Math.random() < (fighting ? 0.03 : W.state === 'push' ? 0.2 : 0.08);
    if (go && W.state === 'push') P.spNext[t] = G.time + 2.2 + Math.random() * 0.8;
    return go;
  }

  // a thrown sub onto the biggest patch of their ink on our zone in lobbing range (re-looked-for twice a second);
  // returns the aim to hold ({ yaw, pitch, release }) while it's thrown
  _zoneBombAim(P, dt) {
    if (this.zBomb) { this.zBomb.t -= dt; if (this.zBomb.t <= 0) this.zBomb = null; return this.zBomb; }
    this.zBombScan -= dt;
    const a = this.a, sub = a.sub || SUB.bomb;
    if (this.zBombScan > 0 || this.bombCd > 0 || !THROWN[sub.kind] || a.ink < sub.inkCost + 10 || this.zRole === 'watch') return null;
    if (SUB_KITS[sub.kind]?.blocked?.(a, sub)) return null;   // one already out (Torpedo / Boomerang): don't wind up a throw
    this.zBombScan = 0.5;
    const t = a.team, zi = this.zZone;
    if (zi < 0 || !P.isActive(zi)) return null;
    const zone = P.Z.zones[zi];
    if (zone.owner !== 1 - t && zone.share[1 - t] < 0.25) return null;   // only to open up a zone they hold / are taking
    const I = P.info[zi], ink = I.ink[1 - t], nav = G.nav;
    let bv = 24, bn = null, bd = 0;
    for (let li = 0; li < I.nodes.length; li++) {
      if (ink[li] < 6) continue;
      const n = nav.nodes[I.nodes[li]], d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
      if (d < 4.5 || d > 12 || Math.abs(n.y - a.pos.y) > 3) continue;
      let v = 0; for (const k of I.nb[li]) v += ink[k];
      if (v > bv) { bv = v; bn = n; bd = d; }
    }
    if (!bn) return null;
    const pitch = lobPitch(bd, bn.y - a.pos.y, sub.throwSpeed || 13.5);
    if (pitch === null) return null;
    this.zBomb = { yaw: Math.atan2(bn.x - a.pos.x, bn.z - a.pos.z), pitch, t: 1.1, release: false };
    return this.zBomb;
  }

  // ============================================================================================ threats
  // Enemy devices that hunt a player — Waddle Bombs (walk after a foe along the nav graph at 4 m/s, give up after ~9 s /
  // 26 m) and Tide Torpedoes (lock on in mid-air, hover, then home in gently) — and enemy Brolly canopies (a held one
  // blocks shots; a launched one is a sliding wall that blocks players too). The kits list them through
  // SUB_KITS[k].threats(out) / MAIN_KITS[k].shields(out) (kits/registry.js), scanned a few times a second.
  // A bot notices a device hunting it after its reaction time, then shoots it down when it has a line on it and the
  // reach (Waddle 30 hp, Torpedo 20; melee kits flick / swipe / cut / punch at one in their window), else evades: kites a
  // Waddle (a running kid outruns it), swims off through its own ink, steps out of a hovering Torpedo's sight,
  // sidesteps + hops a launched one late. A duel with an enemy player close by keeps priority unless the device is
  // about to arrive (the bot edges away from it meanwhile); far-off devices, or ones after someone else, are left alone.
  // Launched canopies across our way: steer round the nearer edge, or shoot apart one that boxes us in. A shield between
  // us and our target: flank round it, hold the shots unless it's nearly broken, lob a sub over it.
  _threatScan() {
    const a = this.a, L = _thrList, S = this._shl;
    L.length = 0; S.length = 0;
    for (const k in SUB_KITS) SUB_KITS[k].threats?.(L);
    for (const k in MAIN_KITS) MAIN_KITS[k].shields?.(S);
    for (let i = S.length - 1; i >= 0; i--) if (S[i].team === a.team) { S[i] = S[S.length - 1]; S.pop(); }
    let best = null, bs = 0.2;
    for (const d of L) {
      if (d.team === a.team || !d.live) continue;
      const s = this._threatScore(d);
      if (s > bs) { bs = s; best = d; }
    }
    L.length = 0;
    const mem = this._thrMem;
    for (const d of mem.keys()) if (!d.live) mem.delete(d);
    // a new one is acted on only after our reaction time (it beeps / shows its lock ring: no sight line needed)
    if (best && !mem.has(best)) { mem.set(best, G.time + this.diff.reaction * (0.8 + Math.random() * 0.7) + 0.05); THREAT_STATS.noticed++; }
    this.thrCand = best;
  }
  // how much a device matters to us right now: 0 = not at all; ~1.5+ outranks a duel in weapon range, 2.4+ one up close
  _threatScore(d) {
    const a = this.a, dx = d.pos.x - a.pos.x, dz = d.pos.z - a.pos.z, dh = Math.hypot(dx, dz);
    const dy = d.pos.y + d.aimY - (a.pos.y + 0.8);
    if (dh > 18 || Math.abs(dy) > 6) return 0;
    const st = d.state, mine = d.target === a;
    if (st === 'fly') {
      // still in the air after the throw: a human sees it coming, so it's noticed now (the reaction time runs during its
      // flight) — a walker coming down within its sensing circle of us (it'll lock on), a flyer heading our way
      const v = d.vel;
      if (d.ground) {
        const t = (v.y + Math.sqrt(Math.max(0, v.y * v.y + 48 * (d.pos.y - a.pos.y)))) / 24;
        return Math.hypot(d.pos.x + v.x * t - a.pos.x, d.pos.z + v.z * t - a.pos.z) < (d.senseRadius || 7) + 1 ? 0.6 : 0;
      }
      return dh < (d.lockRange || 6.5) + 3 && dx * v.x + dz * v.z < 0 ? 0.5 : 0;
    }
    if (!d.ground) {
      // flyers (Torpedo): hovering on us before its launch, or darting at us (or past us close enough to catch the burst)
      if (st === 'unfold') return mine ? 3 : dh < d.radius ? 0.8 : 0;
      if (st !== 'launch') return 0;
      const v = d.vel, sp = Math.max(2, v.length()), d3 = Math.hypot(dh, dy);
      if (mine) return 4 / (0.25 + d3 / Math.max(6, sp));   // (it's only just pushing off: it'll be quick)
      const tca = -(dx * v.x + dy * v.y + dz * v.z) / (sp * sp);
      if (tca > 0 && tca < 1.2) { const mx = -dx - v.x * tca, my = -dy - v.y * tca, mz = -dz - v.z * tca; if (mx * mx + my * my + mz * mz < 1.6) return 2; }
      return d3 < d.radius ? 0.8 : 0;
    }
    // walkers (Waddle): sitting on its sensing circle with us (nearly) inside, or walking after us / our way
    if (st === 'sense') return dh < (d.senseRadius || 7) + 0.6 ? 0.7 : 0;
    if (!d.locked) return 0;
    const eta = Math.max(0, dh - (d.trigger || 1.2)) / (d.speed || 4);
    if (mine) return (4 / (0.5 + eta)) * (d.left !== undefined && d.left < eta * 0.8 ? 0.3 : 1);   // (gives up before it gets here)
    if (dh < d.radius + 0.8) return 1.7;                                   // after a teammate, right by us: its blast gets us too
    const v = d.vel, vl = Math.hypot(v.x, v.z);
    if (dh < 9 && vl > 0.5 && -(dx * v.x + dz * v.z) / (dh * vl) > 0.8) return 1.2 / (0.5 + eta);
    return 0;
  }
  // per frame, after the mode's own actions: deal with the device we've noticed (aim + trigger + move). Returns the aim
  // to hold (_thrAim, shared) or null to leave the frame as it is.
  _threatCtl(dt, it, move) {
    if (!THREAT_AI.enabled) return null;
    const a = this.a;
    if ((this.thrScanT -= dt) <= 0) { this.thrScanT = 0.2 + Math.random() * 0.1; this._threatScan(); }
    let d = this.thr;
    if (d && !d.live) { this._thrEnd(true); d = null; }
    const c = this.thrCand;
    if (c && c !== d && c.live && G.time >= (this._thrMem.get(c) ?? Infinity) && (!d || this._threatScore(c) > this._threatScore(d) * 1.3)) {
      d = this.thr = c; this.thrAct = null; this.thrActs = 0; this.thrSide = 0; this.thrEvT = 0; this.thrAcqT = 0; this.thrLosT = 0;
      this.thrSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.thrSignP = (Math.random() - 0.5) * 1.2;
    }
    // a special that owns the body (a ride / transformation) plays out; others (thrown / aura / weapon specials) only
    // get our footwork — the special keeps the trigger
    const sp = a.specialActive, spK = sp && (sp.kind || sp.id);
    if (!d || spK === 'kraken' || spK === 'stamp' || spK === 'crab' || spK === 'jetpack' || spK === 'zipcaster' || a.climbing || this._climbAim || a.superJumpState) return null;
    const moveOnly = !!sp;
    const score = this._threatScore(d);
    if (score < 0.15) { this._thrEnd(false); return null; }   // lost interest in us / walked off after someone else
    this.thrAcqT += dt;
    const w = a.weapon, kind = w.kind, wr = a.weaponRunner, KB = MAIN_KITS[kind]?.bot, melee = !!(MELEE[kind] || KB?.melee);
    // eye → the device's hit centre, led by the shot's flight time
    const ex = a.pos.x, ey = a.pos.y + 1.1, ez = a.pos.z, hx = d.pos.x, hy = d.pos.y + d.aimY, hz = d.pos.z;
    let dx = hx - ex, dy = hy - ey, dz = hz - ez;
    const dh = Math.hypot(dx, dz), d3 = Math.hypot(dh, dy), v = d.vel;
    const lt = kind === 'charger' ? 0 : Math.min(0.5, d3 / (w.projSpeed || w.speedMax || w.throwSpeed || 30));
    dx += v.x * lt; dy += v.y * lt; dz += v.z * lt;
    // (a roller's flick at something on the ground: aim low — the flick's arc bottoms out there and lands 5–6.6 m out)
    const idealYaw = Math.atan2(dx, dz), idealPitch = kind === 'roller' && d.ground ? -0.3 : Math.atan2(dy, Math.hypot(dx, dz));
    if ((this.thrLosT -= dt) <= 0) { this.thrLosT = 0.1; this.thrLos = G.physics.los(_v.set(ex, ey + 0.1, ez), _v2.set(hx, hy + 0.05, hz)); }
    // can we pop it? a line on it, in reach (melee: the window its flick / swipe / cut / punch lands in), ink to shoot
    const [lo, hi] = melee ? this._meleeWindow(w, d) : [0, this._range() * (d.ground ? 0.95 : 1)];
    const inkOk = a.ink > Math.max(2.5, w.inkPerShot || 0, (w.inkFull || 0) * 0.25);
    const canShoot = !moveOnly && d.shootable && this.thrLos && d3 >= lo && d3 <= hi && inkOk;
    // a walker coming at us from just out of reach: stand and let it walk into it (running only buys time)
    const waitIn = !canShoot && !moveOnly && d.ground && d.shootable && this.thrLos && inkOk && d3 > hi && d3 < hi + 4 && hi - (d.trigger || 1.2) > 2.5;
    const mine = d.target === a, ttl = !d.ground && d.state === 'launch' ? d3 / Math.max(2, v.length()) : 9;
    const eta = d.ground ? Math.max(0, dh - (d.trigger || 1.2)) / (d.speed || 4) : ttl;
    // a duel with an enemy player close by outranks a device that isn't about to arrive
    const T = this.target;
    if (T && this.mode === 'fight' && this.seeTimer > 0) {
      const td = Math.hypot(T.pos.x - a.pos.x, T.pos.z - a.pos.z);
      const pd = td < 4 ? 2.4 : td < this._range() * 0.9 || td < weaponRange(T.weapon) * 0.9 ? 1.5 : 0.5;
      if (score < pd) { if (mine || dh < 4) this._thrDrift(d, move, 0.6); return null; }
    }
    // far off / out of reach and not about to arrive: carry on, edging away from it
    const urgent = d.ground ? eta < 2.2 || dh < (d.radius || 3) + 0.5 : d.state === 'launch' || d.state === 'unfold';
    if (!canShoot && !waitIn && !urgent) { this._thrDrift(d, move, 0.5); return null; }
    const act = canShoot || waitIn ? 'shoot' : 'evade', bit = act === 'shoot' ? 1 : 2;
    if (!(this.thrActs & bit)) { this.thrActs |= bit; THREAT_STATS[act]++; }
    this.thrAct = act;
    let dodge = false;
    if (canShoot || waitIn) {
      it.squid = false;
      a.fireFacing = Math.max(a.fireFacing, 0.25);   // square up to it (a flick / swipe leaves along the body)
      const rx = a.pos.x - d.pos.x, rz = a.pos.z - d.pos.z, rl = Math.hypot(rx, rz) || 1;
      // too late to count on the shot (a charge weapon a little sooner): sidestep its line, still firing if on it
      dodge = !d.ground && d.state === 'launch' && ttl < (CHARGES[kind] ? 0.8 : 0.45);
      if (dodge) this._thrSidestep(d, move, it, ttl < 0.3);
      else if (waitIn || (d.ground && kind === 'roller')) move.set(0, 0, 0);                          // (a flick lands a fixed way out)
      else if (d.ground && melee) move.set((rx / rl) * 0.35, 0, (rz / rl) * 0.35);                   // let it walk into the swing
      else if (d.ground && dh < 4.5) move.set(rx / rl, 0, rz / rl);                                  // kite while shooting
      else move.multiplyScalar(0.25);                                                                    // plant a moment for the shot
      if (CHARGES[kind] && wr.charging && !dodge) move.multiplyScalar(0.4);
    } else this._thrEvade(d, dt, move, it, ttl);
    this.noProg = 0; this.bestD = Infinity;   // (off the route on purpose: not "stuck")
    // aim: the usual human error, a little tighter (it's small and we're looking straight at it)
    const e = this.diff.aimError * 0.7, acq = Math.exp(-this.thrAcqT / Math.max(0.12, this.diff.reaction * 0.9));
    _thrAim.yaw = idealYaw + e * (0.7 * _wander(this.t * 1.7 + this.ph1) + 2.2 * acq * this.thrSignY);
    _thrAim.pitch = idealPitch + e * 0.6 * (0.7 * _wander(this.t * 2.1 + this.ph2) + 1.5 * acq * this.thrSignP);
    _thrAim.dist = Math.max(1, d3);
    // trigger only with the actual aim on it (shots follow the bot's aim ray)
    const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
    const tol = Math.max(0.035, Math.atan2(d.ground ? 0.24 : 0.28, d3)) * (this.thrFiring ? 2.2 : 1.3);
    if (moveOnly) { it.squid = false; return null; }   // (the special keeps its aim and trigger; it's used in kid form)
    it.fire = canShoot ? this._devTrigger(d3, off < tol, off < tol * 4, lo, hi) : !!(CHARGES[kind] && wr.charging && !it.squid);
    if (dodge && CHARGES[kind] && wr.charging && wr.charge >= 0.12) it.fire = false;   // let the charge go (roughly at it) and run
    this.thrFiring = it.fire && off < tol;
    if (it.fire) it.squid = false;
    it.sub = false; this._bombAim = false;
    return _thrAim;
  }
  _thrEnd(gone) {
    if (gone && this.thrActs) THREAT_STATS.gone++;
    const acted = !!this.thrActs;
    this.thr = null; this.thrAct = null; this.thrActs = 0; this.thrFiring = false;
    // back to what we were doing: re-plan the route from wherever the dodge left us
    if (acted && G.nav) {
      if (this.mode === 'paint' && this.goal >= 0 && this.path) { const n = G.nav.nodes[this.goal]; this._pathTo(_v3.set(n.x, n.y, n.z), 0.3); }
      else this.repath = 0;
    }
  }
  // keep doing what we're doing, but edge away from it
  _thrDrift(d, move, k) {
    const a = this.a, rx = a.pos.x - d.pos.x, rz = a.pos.z - d.pos.z, rl = Math.hypot(rx, rz) || 1;
    const x = move.x + (rx / rl) * k, z = move.z + (rz / rl) * k, l = Math.hypot(x, z);
    if (l > 1) move.set(x / l, 0, z / l); else move.set(x, 0, z);
  }
  // can't pop it: run (a kid outruns a Waddle; out of a hovering Torpedo's sight), swim through our own ink, or — a
  // Torpedo about to arrive — sidestep its line and hop
  _thrEvade(d, dt, move, it, ttl) {
    const a = this.a;
    if (!d.ground && d.state === 'launch' && ttl < 0.55) { this._thrSidestep(d, move, it, ttl < 0.35); return; }
    this.thrEvT -= dt;
    if (this.thrEvT <= 0) { this.thrEvT = 0.45 + Math.random() * 0.3; this.thrEvYaw = this._pickEvade(d); }
    move.set(Math.sin(this.thrEvYaw), 0, Math.cos(this.thrEvYaw));
    const swim = a.groundTeam === 1 && !this._squidWouldDrop(move);
    if (swim && !(this.thrActs & 4)) { this.thrActs |= 4; THREAT_STATS.swim++; }
    it.squid = swim;
    // running from a walker we can see: back off facing it, ready to shoot the moment it's in reach
    if (!swim && d.ground && this.thrLos) a.fireFacing = Math.max(a.fireFacing, 0.25);
  }
  _thrSidestep(d, move, it, hop) {
    const a = this.a, v = d.vel, vl = Math.hypot(v.x, v.z), rx = a.pos.x - d.pos.x, rz = a.pos.z - d.pos.z;
    let px, pz;
    if (vl > 0.3) { px = -v.z / vl; pz = v.x / vl; } else { const rl = Math.hypot(rx, rz) || 1; px = -rz / rl; pz = rx / rl; }
    if (!this.thrSide) {
      // step to the side of its line we're already on, unless that's a wall or the sea
      const ok = (sg) => this._dryLine(a.pos.x, a.pos.y, a.pos.z, a.pos.x + px * sg * 2, a.pos.z + pz * sg * 2) && this._fatLos(a.pos.x, a.pos.y, a.pos.z, a.pos.x + px * sg * 2, a.pos.y, a.pos.z + pz * sg * 2);
      let s = rx * px + rz * pz >= 0 ? 1 : -1;
      if (!ok(s) && ok(-s)) s = -s;
      this.thrSide = s;
      if (!(this.thrActs & 8)) { this.thrActs |= 8; THREAT_STATS.sidestep++; }
    }
    move.set(px * this.thrSide, 0, pz * this.thrSide);
    it.squid = false;
    if (hop && a.grounded && this.jumpCd <= 0 && !this._nearWater(a, 1.4)) { it.jump = true; this.jumpCd = 0.9; }
  }
  // a heading to run from it: away (flyers: across its line, out of its sight), clear of walls and water, onto our ink
  _pickEvade(d) {
    const a = this.a, x0 = a.pos.x, y0 = a.pos.y, z0 = a.pos.z, base = Math.atan2(x0 - d.pos.x, z0 - d.pos.z);
    const wp = this.path && this.pi < this.path.length ? G.nav.nodes[this.path[this.pi]] : null;
    let best = base, bs = -Infinity;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1]) {
      const yw = base + off, sx = Math.sin(yw), sz = Math.cos(yw), px = x0 + sx * 3.2, pz = z0 + sz * 3.2;
      if (G.nav.nearest(_evP.set(px, y0, pz), 1.0) < 0) continue;   // never run off the walkable graph (no way back)
      if (!this._dryLine(x0, y0, z0, px, pz) || !this._fatLos(x0, y0, z0, px, y0, pz)) continue;
      let sc = Math.cos(off) * (d.ground ? 2 : 1) + (d.ground ? 0 : Math.abs(Math.sin(off)) * 1.2);
      const st = G.paint.regionStats(px, y0, pz, 1.3, a.team, _stats);
      if (st.n) sc += st.own * 1.5;
      if (wp) { const wx = wp.x - x0, wz = wp.z - z0, wl = Math.hypot(wx, wz) || 1; sc += (0.4 * (wx * sx + wz * sz)) / wl; }
      if (!d.ground && !G.physics.los(_v.copy(d.pos), _v2.set(px, y0 + 1, pz))) sc += 2;
      sc += Math.random() * 0.3;
      if (sc > bs) { bs = sc; best = yw; }
    }
    return best;
  }
  // melee kits vs a device: the distance window their attack pops it in (a roller's flick arcs over anything close;
  // a brush's swipe globs fly low and short; the Cutlass's cut throws droplets; a punch flies straight)
  _meleeWindow(w, d) {
    switch (w.kind) {
      // (ground, aimed low: the flick comes down 5–6.6 m out ~0.6 s after the press — a walker is ~2.3 m closer by then)
      case 'roller': return !d.ground ? [1.5, 6] : d.state === 'walk' ? [7.3, 9] : [5, 6.6];
      case 'brush': return !d.ground ? [0.8, 4.5] : d.state === 'walk' ? [99, 99] : [0.8, 2.8];   // (a walker inside 2.8 m is too close to call: run)
      case 'blade': return d.ground ? [0, 4] : [0, 5.5];
      default: return [0, weaponRange(w) * 0.95];
    }
  }
  // the trigger for a shot at a device dist m away (aimed: on it now; roughly: swinging onto it)
  _devTrigger(dist, aimed, roughly, lo, hi) {
    const a = this.a, w = a.weapon, wr = a.weaponRunner, k = w.kind, KB = MAIN_KITS[k]?.bot, inWin = dist >= lo && dist <= hi;
    if (MELEE[k] || KB?.melee) {
      // press, release, press… (a roller's flick / a brush's swipe goes where the body faces: wait until it's squared up)
      const faced = (k !== 'roller' && k !== 'brush') || Math.abs(angleDiff(a.yaw, this.aimYaw)) < 0.3;
      this.thrPulse = aimed && faced && inWin && !this.thrPulse; return this.thrPulse;
    }
    if (CHARGES[k] || KB?.charges) {
      if (wr.burstT > 0 || wr.streaming) return false;                     // a spinner / splatling stream runs on by itself
      // a short charge does it (a charger tap is 40+, bow ring 1 ~30, a short spinner burst)
      const rel = k === 'charger' ? 0.12 : k === 'spinner' ? 0.3 : k === 'splatling' ? 0.35 : (w.ring1 ?? 0.4) + 0.06;
      if (wr.charging) return !(aimed && wr.charge >= rel);
      return roughly && inWin && !(wr.cooldown > 0);
    }
    return aimed && inWin;
  }

  // In a fight: an enemy shield (their held canopy, or a launched one) between us and the target soaks every shot —
  // flank round to the side it doesn't cover (sticky side, flipped off walls / water), save the shots unless it's nearly
  // broken or we can't get round, and lob a sub over it.
  _shieldFight(t, dist, move, it, dt) {
    if (!THREAT_AI.enabled || !this._shl.length) { this.blockT = 0; return; }
    const a = this.a, ex = a.pos.x, ey = a.pos.y + 1.1, ez = a.pos.z;
    const tx = t.pos.x, ty = t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? 0.3 : 0.85), tz = t.pos.z;
    let blk = null;
    for (const s of this._shl) {
      if (!s.live) continue;
      const C = s.C, N = s.N;
      const p0 = (ex - C.x) * N.x + (ey - C.y) * N.y + (ez - C.z) * N.z, p1 = (tx - C.x) * N.x + (ty - C.y) * N.y + (tz - C.z) * N.z;
      if ((p0 > 0) === (p1 > 0) || p0 === p1) continue;
      const k = p0 / (p0 - p1), qx = ex + (tx - ex) * k - C.x, qy = ey + (ty - ey) * k - C.y, qz = ez + (tz - ez) * k - C.z;
      if (qx * qx + qy * qy + qz * qz > (s.R + 0.12) * (s.R + 0.12)) continue;
      blk = s; break;
    }
    if (!blk) { if (this.blockT > 0) { this.blockT = Math.max(0, this.blockT - dt * 3); if (this.blockT === 0) this.flankSide = 0; } return; }
    if (this.blockT === 0) THREAT_STATS.flank++;
    this.blockT += dt;
    // flank: across our line to the target, toward the side of the shield we're already off-centre on
    const N = blk.N, sx = -N.z, sz = N.x, hl = Math.max(0.3, Math.hypot(tx - ex, tz - ez)), nx = (tx - ex) / hl, nz = (tz - ez) / hl;
    if (!this.flankSide) { this.flankSide = (ex - blk.C.x) * sx + (ez - blk.C.z) * sz >= 0 ? 1 : -1; this.flankT = 0; }
    let lx = -nz, lz = nx;
    if ((lx * sx + lz * sz) * this.flankSide < 0) { lx = -lx; lz = -lz; }
    if ((this.flankT -= dt) <= 0) {
      this.flankT = 0.5;
      const ok = this._dryLine(ex, a.pos.y, ez, ex + lx * 1.8, ez + lz * 1.8) && this._fatLos(ex, a.pos.y, ez, ex + lx * 1.8, a.pos.y, ez + lz * 1.8);
      if (!ok) { this.flankSide = -this.flankSide; lx = -lx; lz = -lz; }
    }
    const inward = dist > 6 ? 0.45 : dist < 2.5 ? -0.35 : 0.1, mx = lx + nx * inward, mz = lz + nz * inward, ml = Math.hypot(mx, mz) || 1;
    move.set(mx / ml, 0, mz / ml);
    // shots: only into a shield we'd break in about a second (a fast shooter on a worn one), or when we can't get round
    // it; charge weapons keep their charge for the opening
    const w = a.weapon, wr = a.weaponRunner, dps = w.damage && w.fireInterval && !CHARGES[w.kind] ? w.damage / w.fireInterval : 120;
    const through = blk.hp <= dps * 1.3 || this.blockT > 2.5 || (!blk.held && blk.left < 0.5) || (this.canRef === blk && this.canSide === 2);
    if (!through && this.blockT > 0.15) {
      if (CHARGES[w.kind] || MAIN_KITS[w.kind]?.bot?.charges) it.fire = it.fire || !!wr.charging;
      else if (it.fire) { it.fire = false; THREAT_STATS.holdFire += dt; }
    }
    // a thrown sub goes over / round it
    const sub = a.sub || SUB.bomb;
    if (this.blockT > 0.5 && this.bombCd <= 0 && THROWN[sub.kind] && a.ink >= sub.inkCost + 8 && dist > 3 && dist < 13 && !SUB_KITS[sub.kind]?.blocked?.(a, sub) && Math.random() < dt * 2.5) {
      it.sub = true; this._bombAim = true; this.bombCd = 5 + Math.random() * 4; THREAT_STATS.shieldSub++;
    }
  }

  // Enemy launched canopies (sliding walls that hold enemy players back) across our way: steer round the nearer edge
  // (then across behind it); boxed in (walls / water on both sides) or still not round after 4 s → shoot it apart.
  // Returns the aim to hold while breaking one (only when `free`: no device being dealt with), else null.
  _canopyCtl(dt, it, move, free) {
    if (!THREAT_AI.enabled) return null;
    const a = this.a, S = this._shl;
    if (!S.length || a.climbing || a.superJumpState || a.specialActive) { this.canRef = null; return null; }
    let ml = Math.hypot(move.x, move.z);
    let hit = null, hAlong = 0, hSide = 1, hW = 1;
    for (const s of S) {
      if (!s.blocksActors || !s.live) continue;
      const N = s.N, tx = -N.z, tz = N.x, px = a.pos.x - s.pos.x, pz = a.pos.z - s.pos.z, dy = a.pos.y - s.pos.y;
      if (dy < -1.2 || dy > 1.6) continue;
      const along = px * tx + pz * tz, across = px * N.x + pz * N.z - s.planeOff, W = s.halfW + PLAYER.radius * 0.6 + 0.3;
      if (Math.abs(across) > 3 || Math.abs(along) > W + 2.5) continue;
      const side = across >= 0 ? 1 : -1;
      // it's sliding at us (we're in front of it, in its lane): step out of its way even if we're standing still
      const coming = side > 0 && across < 2.2 && Math.abs(along) < W && (s.speed || 0) > 0.5;
      if (!coming) {
        if (ml <= 0.05) continue;
        const mx = move.x / ml, mz = move.z / ml, mN = mx * N.x + mz * N.z, mT = mx * tx + mz * tz;
        if (mN * side > -0.2) continue;                               // moving along it or away from it
        const tCross = -across / mN;                                  // metres of travel to its plane
        if (tCross > 2.5 || Math.abs(along + mT * tCross) > W) continue;   // far yet / we'd clear its edge anyway
      }
      hit = s; hAlong = along; hSide = side; hW = W; break;
    }
    if (hit && ml <= 0.05) ml = 1;
    if (!hit) { this.canRef = null; this._canBroke = false; return null; }
    if (this.canRef !== hit) { this.canRef = hit; this.canSide = 0; this.canT = 0; this._canBroke = false; THREAT_STATS.steer++; }
    this.canT += dt;
    const N = hit.N, tx = -N.z, tz = N.x;
    // a spot beside its edge: `off` m out from its plane on our side (negative: past it)
    const edgeX = (sg, off) => hit.pos.x + N.x * (hit.planeOff + hSide * off) + tx * sg * (hW + 0.55);
    const edgeZ = (sg, off) => hit.pos.z + N.z * (hit.planeOff + hSide * off) + tz * sg * (hW + 0.55);
    if (!this.canSide) {
      const ok = (sg) => {
        const x1 = edgeX(sg, 0.9), z1 = edgeZ(sg, 0.9), x2 = edgeX(sg, -1.4), z2 = edgeZ(sg, -1.4), y = a.pos.y;
        return this._dryLine(a.pos.x, y, a.pos.z, x1, z1) && this._fatLos(a.pos.x, y, a.pos.z, x1, y, z1) && this._dryLine(x1, y, z1, x2, z2) && this._fatLos(x1, y, z1, x2, y, z2);
      };
      const pref = hAlong >= 0 ? 1 : -1;
      this.canSide = ok(pref) ? pref : ok(-pref) ? -pref : 2;
    }
    if (this.canSide !== 2 && this.canT > 4) this.canSide = 2;
    if (this.canSide === 2) {
      if (!free) return null;
      if (!this._canBroke) { this._canBroke = true; THREAT_STATS.breakWall++; }
      const C = hit.C, dx = C.x - a.pos.x, dy = C.y - (a.pos.y + 1.1), dz = C.z - a.pos.z, dh = Math.hypot(dx, dz);
      _thrAim.yaw = Math.atan2(dx, dz); _thrAim.pitch = Math.atan2(dy, dh); _thrAim.dist = Math.max(1, Math.hypot(dh, dy));
      const off = Math.hypot(angleDiff(this.aimYaw, _thrAim.yaw), this.aimPitch - _thrAim.pitch);
      const melee = MELEE[a.weapon.kind] || MAIN_KITS[a.weapon.kind]?.bot?.melee;
      it.fire = a.ink > 3 && this._devTrigger(_thrAim.dist, off < 0.3, off < 0.7, 0, melee ? 3.5 : this._range());
      if (it.fire) it.squid = false;
      move.set(N.x * hSide * 0.3, 0, N.z * hSide * 0.3);
      this.noProg = 0; this.bestD = Infinity;
      return _thrAim;
    }
    this._canBroke = false;
    // beside its face → out to the edge; clear of the edge → across behind it
    const off = Math.abs(hAlong) < hW + 0.1 ? 0.9 : -1.4;
    const gx = edgeX(this.canSide, off) - a.pos.x, gz = edgeZ(this.canSide, off) - a.pos.z, gl = Math.hypot(gx, gz);
    if (gl > 0.05) move.set((gx / gl) * ml, 0, (gz / gl) * ml);
    this.noProg = 0; this.bestD = Infinity;
    return null;
  }

  _range() {
    const w = this.a.weapon;
    return weaponRange(w) * (CHARGES[w.kind] ? 0.9 : 1);
  }

  _perceive() {
    const a = this.a;
    const eye = _v.copy(a.pos); eye.y += 1.3;
    let best = null, bd = Infinity;
    const aw = this.diff.awareness;
    const bias = MAIN_KITS[a.weapon.kind]?.bot?.targetBias;   // kit weapons may weigh targets (e.g. the Cutlass: busy ones)
    for (const e of G.actors) {
      if (e.team === a.team || !e.alive) continue;
      const d = e.pos.distanceTo(a.pos);
      if (d > aw) continue;
      const swimming = e.anim.form === 'swim';
      const hs = Math.hypot(e.vel.x, e.vel.z);
      if (swimming && d > 3 && !(hs > 7 && d < 9)) continue;
      _v2.copy(e.pos); _v2.y += e.form === 'squid' ? 0.3 : 1.0;
      if (!G.physics.los(eye, _v2)) continue;
      const score = d - (e === this.target ? 4 : 0) + (bias ? bias(this, e, d) : 0);
      if (score < bd) { bd = score; best = e; }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best; this.react = this.diff.reaction * (0.7 + Math.random() * 0.6); this.repath = 0;
        // first look lands a little off (over- or under-shoot) and settles — like a human flick
        this.acqT = 0; this.acqSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.acqSignP = (Math.random() - 0.5) * 1.2;
      }
      this.seeTimer = 1.2;
      this.lostTimer = 0;
    } else {
      this.seeTimer -= 0.2;
      if (this.target) {
        this.lostTimer += 0.2;
        if (this.lostTimer > 2.5 || this.target.pos.distanceTo(a.pos) > aw + 6) this.target = null;
      }
    }
    this.react -= 0.2;
  }

  _pathTo(pos, maxUp = 0.8) {
    const nav = G.nav;
    let s = nav.nearest(this.a.pos, 1.2, true);
    // standing at the foot of a step: don't start the route from the ledge above (we can't get up there from here)
    if (s >= 0 && this.a.grounded && nav.nodes[s].y - this.a.pos.y > 0.5) { const s2 = nav.nearest(this.a.pos, 0.45, true); if (s2 >= 0) s = s2; }
    const g = nav.nearest(pos, maxUp);
    this.repath = 0.8 + Math.random() * 0.4;
    if (s < 0 || g < 0) { this.path = null; return false; }
    const p = Perf.spot('nav.path', () => nav.path(s, g, this.a.team, undefined, this.t < this.noClimbUntil));   // A* spot-timed
    if (!p) { this.path = null; return false; }
    this.path = p; this.pi = Math.min(1, p.length - 1); this.goal = g; this.bestD = Infinity; this.noProg = 0;
    return true;
  }

  _pickPaintGoal() {
    const a = this.a, nav = G.nav;
    let best = -1, bs = -Infinity;
    const enemyPad = G.level.spawnPads[1 - a.team];
    const ownPad = G.level.spawnPads[a.team];
    const total = ownPad.distanceTo(enemyPad);
    const mates = G.actors.filter((o) => o !== a && o.team === a.team && o.bot);
    for (let i = 0; i < 28; i++) {
      const id = nav.validIds[(Math.random() * nav.validIds.length) | 0];
      const n = nav.nodes[id];
      if (n.zone >= 0 || n.wet === 2) continue;
      const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
      if (d > 38) continue;
      // value of the spot and of the patch around it: unclaimed turf counts, enemy ink counts more (flipping it
      // swings the score both ways); own ink is worth nothing
      const near = G.paint.regionStats(n.x, n.y, n.z, 3, a.team, _stats);
      if (!near.n) continue;
      const vNear = near.empty + near.enemy * 1.4;
      const wide = G.paint.regionStats(n.x, n.y, n.z, 6.5, a.team, _stats);
      const value = vNear * 0.55 + (wide.empty + wide.enemy * 1.4) * 0.45;
      const progress = 1 - Math.hypot(n.x - enemyPad.x, n.z - enemyPad.z) / total; // 0 at own base → 1 at enemy base
      let score = value * 16 - d * 0.14 + clamp(progress, 0, 0.8) * 2.5 + Math.random() * 1.5 - (n.wet ? 1.5 : 0);
      if (CHARGES[a.weapon.kind]) score += clamp(n.y, 0, 5) * 1.6; // long range: high perches see (and paint) more
      if (value < 0.15) score -= 8; // already ours: only if nothing better turns up
      for (const m of mates) if (m.bot.goal >= 0) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 8) score -= 5; }
      if (score > bs) { bs = score; best = id; }
    }
    this.goalTimer = 4 + Math.random() * 3;
    if (best < 0) return;
    const n = nav.nodes[best];
    this._pathTo(_v3.set(n.x, n.y, n.z), 0.3);
  }


  _pickRefill() {
    const a = this.a;
    // search nearby for own ink
    let bestP = null, bd = Infinity;
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2, r = 1 + Math.random() * 7;
      _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
      const st = G.paint.regionStats(_v.x, _v.y, _v.z, 1.2, a.team, _stats);
      if (st.n && st.own > 0.6 && r < bd) { bd = r; bestP = _v.clone(); }
    }
    // nothing close: look further out, and failing that head back toward our own spawn (always our colour)
    for (let i = 0; i < 16 && !bestP; i++) {
      const ang = Math.random() * Math.PI * 2, r = 8 + Math.random() * 14;
      _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
      const st = G.paint.regionStats(_v.x, _v.y, _v.z, 1.5, a.team, _stats);
      if (st.n && st.own > 0.6) bestP = _v.clone();
    }
    if (!bestP || !this._pathTo(bestP, 0.4)) this._pathTo(G.level.spawnPads[a.team], 1.2);
    this.repath = 1.2;
  }

  // Escape move: steer a fixed random heading for a moment (hopping if on the ground), then re-plan from wherever
  // that leaves us. Used when perched on an edge in mid-air or when repeated re-plans make no progress.
  _wiggle(t) {
    this.wiggleT = t; this.wiggleYaw = Math.random() * Math.PI * 2;
    this.path = null; this.goalTimer = 0; this.repath = 0;
    if (this.a.grounded) this._needJump = true;
  }
  _unstick(dt, move) {
    const a = this.a;
    this.strikeT -= dt;
    if (this.strikeT <= 0) this.strikes = 0;
    // resting on a ledge corner: not grounded, not falling, not moving → the waypoint logic can't fix that
    const still = !a.grounded && Math.abs(a.vel.y) < 0.6 && Math.hypot(a.vel.x, a.vel.z) < 0.4 && !a.superJumpState;
    this.airStill = still ? this.airStill + dt : 0;
    if (this.airStill > 0.4 && this.wiggleT <= 0) this._wiggle(0.6);
    if (this.wiggleT > 0) {
      this.wiggleT -= dt;
      move.set(Math.sin(this.wiggleYaw), 0, Math.cos(this.wiggleYaw));
      this.noProg = 0; this.bestD = Infinity; // the escape isn't "no progress" toward the waypoint
    }
  }

  // No route, and no nav graph under us (dodged, shoved or dropped somewhere the graph doesn't reach — every re-plan
  // fails from there, so nothing else would ever move us): walk to the nearest graph node in sight, then plan again
  _backOnNav(dt, move) {
    const a = this.a, N = G.nav;
    if (!N || !a.grounded || a.climbing || a.superJumpState) { this.navBack = null; return; }
    this.navBackT = (this.navBackT || 0) - dt;
    if (this.navBackT <= 0) {
      this.navBackT = 0.6; this.navBack = null;
      if (N.nearest(a.pos, 1.2, true) >= 0) return;                  // on the graph: the normal re-plan works
      const cands = [];
      for (const id of N.validIds) {
        const q = N.nodes[id], d2 = (q.x - a.pos.x) ** 2 + (q.z - a.pos.z) ** 2;
        if (d2 < 100 && Math.abs(q.y - a.pos.y) < 1.2 && !q.wet) cands.push([d2, q]);
      }
      cands.sort((x, y) => x[0] - y[0]);
      for (let k = 0; k < Math.min(12, cands.length); k++) {
        const q = cands[k][1];
        if (this._dryLine(a.pos.x, a.pos.y, a.pos.z, q.x, q.z) && this._fatLos(a.pos.x, a.pos.y, a.pos.z, q.x, q.y, q.z)) { this.navBack = q; break; }
      }
      if (!this.navBack && cands.length) this.navBack = cands[0][1];
    }
    const q = this.navBack;
    if (q) { const dx = q.x - a.pos.x, dz = q.z - a.pos.z, l = Math.hypot(dx, dz); if (l > 0.3) move.set(dx / l, 0, dz / l); }
  }

  _pathRemaining() {
    if (!this.path) return 0;
    const n = G.nav.nodes[this.path[this.path.length - 1]];
    return Math.hypot(n.x - this.a.pos.x, n.z - this.a.pos.z);
  }

  // body-width line of sight at knee height (centre + both shoulders) so bots never cut corners they can't fit past
  _fatLos(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const px = (-dz / l) * 0.34, pz = (dx / l) * 0.34;
    for (const o of [0, 1, -1]) {
      _v.set(ax + px * o, ay + 0.45, az + pz * o); _v2.set(bx + px * o, by + 0.45, bz + pz * o);
      // a walking line: grates and rails block it (shots see through them, legs don't — so not physics.los)
      _v3.copy(_v2).sub(_v); const len = _v3.length();
      if (len < 1e-4) continue;
      _v3.multiplyScalar(1 / len);
      if (G.physics.raycast(_v, _v3, len - 0.05, _walkHit, false).hit) return false;
    }
    return true;
  }

  _steer(dt) {
    const a = this.a, nav = G.nav, out = this._mv || (this._mv = new THREE.Vector3());
    out.set(0, 0, 0);
    if (!this.path || this.pi >= this.path.length) return out;
    // advance waypoints we've reached (generous vertically when dropping down)
    while (this.pi < this.path.length) {
      const n = nav.nodes[this.path[this.pi]];
      const dx = n.x - a.pos.x, dz = n.z - a.pos.z, dy = n.y - a.pos.y;
      if (dx * dx + dz * dz < 0.6 * 0.6 && dy < 0.9 && dy > -1.8) { this.pi++; this.bestD = Infinity; this.noProg = 0; }
      else break;
    }
    if (this.pi >= this.path.length) return out;
    const cur = nav.nodes[this.path[this.pi]];
    const hd = Math.hypot(cur.x - a.pos.x, cur.z - a.pos.z);
    // waypoint is above us and we can't get there from here (slipped off a ledge, got pushed): replan now
    if (a.grounded && cur.y - a.pos.y > 0.9 && hd < 1.2 && !['jump', 'climb'].includes(nav.edgeType(this.path[Math.max(0, this.pi - 1)], this.path[this.pi]))) {
      this.path = null; this.repath = 0; this.goalTimer = 0;
      // the replan keeps landing on the same unreachable ledge: shake loose instead of re-planning every frame
      if (this.t - (this._ledgeT ?? -9) > 2) this._ledgeN = 0;
      this._ledgeT = this.t;
      if (++this._ledgeN >= 4) { this._ledgeN = 0; this._wiggle(0.8); }
      return out;
    }
    // waypoint is below us and we're standing over it (drop edge): keep going the way the path runs to step off
    if (cur.y - a.pos.y < -0.9 && hd < 0.8 && this.pi > 0) {
      const p = nav.nodes[this.path[this.pi - 1]];
      out.set(cur.x - p.x, 0, cur.z - p.z);
      const ll = out.length();
      if (ll > 0.01) { out.multiplyScalar(1 / ll); return out; }
    }
    // look ahead: aim at the furthest waypoint we can walk to in a straight line on this level (re-chosen every
    // ~0.1 s or when the waypoint advances — the probes are the costly part, the heading still updates every frame)
    let ti = this.pi;
    this._laT = (this._laT ?? 0) - dt;
    if (this._laT > 0 && this._laPi === this.pi && this._laPath === this.path && this._laTi < this.path.length) ti = this._laTi;
    else {
      for (let k = this.pi + 1; k < Math.min(this.path.length, this.pi + 7); k++) {
        const n = nav.nodes[this.path[k]];
        if (Math.abs(n.y - a.pos.y) > 0.4) break;
        if (nav.edgeType(this.path[k - 1], this.path[k]) !== 'walk') break;
        if (!this._fatLos(a.pos.x, a.pos.y, a.pos.z, n.x, n.y, n.z)) break;
        if (!this._dryLine(a.pos.x, a.pos.y, a.pos.z, n.x, n.z)) break;   // never cut a corner across water
        ti = k;
      }
      this._laT = 0.1; this._laPi = this.pi; this._laPath = this.path; this._laTi = ti;
    }
    const n = nav.nodes[this.path[ti]];
    out.set(n.x - a.pos.x, 0, n.z - a.pos.z);
    const l = out.length();
    if (l > 0.001) out.multiplyScalar(1 / l);
    // jump edges
    if (this.pi > 0) {
      const et = nav.edgeType(this.path[this.pi - 1], this.path[this.pi]);
      if (et === 'jump' && cur.y - a.pos.y > 0.4 && hd < 1.6) this._needJump = true;
    }
    // separation from teammates (only sideways relative to travel, so it never stalls forward progress)
    for (const o of G.actors) {
      if (o === a || !o.alive) continue;
      const dx = a.pos.x - o.pos.x, dz = a.pos.z - o.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.4 * 1.4 && d2 > 1e-4) {
        const d = Math.sqrt(d2), k = (1.4 - d) * 0.7;
        const side = (dx * -out.z + dz * out.x) >= 0 ? 1 : -1;
        const ox = out.x, oz = out.z;
        out.x = ox - oz * side * k; out.z = oz + ox * side * k;
      }
    }
    const l2 = out.length();
    if (l2 > 1) out.multiplyScalar(1 / l2);
    // progress tracking toward the current waypoint (used by the stuck recovery)
    if (hd < this.bestD - 0.2) { this.bestD = hd; this.noProg = 0; } else this.noProg += dt;
    return out;
  }


  // ============================================================================================ Boss Battle
  // One squad vs HULLBREAKER (docs/BOSS.md): spread round its flanks at weapon range, shoot what it exposes (eyes; the
  // belly while it's stunned — everyone piles in), step out of every telegraph, hop the shockwave rings, duck under the
  // sweep in own ink, pop the crablets that come for the squad, and clean boss ink off the routes (rollers most of all).
  _bossTick(dt) {
    const a = this.a, it = a.intent, w = a.weapon, boss = G.boss;
    const inkFrac = a.ink / PLAYER.inkMax;
    it.fire = false; it.sub = false; it.special = false; it.squid = false; it.jump = false;
    if (this.think <= 0) { this.think = 0.12 + Math.random() * 0.1; this._bossPerceive(boss); }
    this.react -= dt; this.evadeT = (this.evadeT || 0) - dt;
    const th = Object.assign(this._th || (this._th = {}), boss.hz.threat(a.pos.x, a.pos.y, a.pos.z, 1.4));   // (threat() reuses its result)
    // human-ish: a new telegraph takes a reaction time to register, and now and then a ring hop is simply missed
    if (th.level > 0 || th.ringIn >= 0) {
      if (this.thSeen === undefined) { this.thSeen = this.t + this.diff.reaction * (0.5 + Math.random() * 0.9); this.hopMiss = Math.random() < (0.45 - this.diff.fireDiscipline * 0.4); }
      if (this.t < this.thSeen) { th.level = 0; th.ringIn = -1; th.beam = false; th.cover = false; }
    } else this.thSeen = undefined;
    // ---- mode: refill when dry (unless a crablet is right on us), else fight
    if (this.mode === 'refill' && inkFrac >= this.refillUntil) { this.mode = 'boss'; this.path = null; this.goalTimer = 0; }
    if (this.mode !== 'refill' && inkFrac < 0.1 && !(this.bTgt?.crab && this.bTgt.dist < 4 && inkFrac > 0.03)) { this.mode = 'refill'; this.refillUntil = 0.8 + Math.random() * 0.15; this.path = null; }
    if (this.mode !== 'refill') this.mode = 'boss';
    // ---- where to go
    this.goalTimer -= dt; this.repath -= dt;
    const evading = th.level > 0.2 && !(th.beam && a.groundTeam === 1);   // in own ink under a sweep: just dive
    if (evading && (this.evadeT <= 0 || !this.path)) { this._bossEvade(boss, th); this.evadeT = 0.45; }
    else if (!evading && this._wasEvading) { this.path = null; this.goalTimer = 0; }
    this._wasEvading = evading;
    if (!evading) {
      if (this.mode === 'refill') { if (this.repath <= 0 || !this.path) this._pickRefill(); }
      else if (this.goalTimer <= 0 || !this.path || this.pi >= this.path.length || (boss.stunned && !this._rushing)) this._bossGoal(boss);
    }
    const move = this._steer(dt);
    let wantMove = move.lengthSq() > 0.01;
    // ---- aim + fire
    let wantYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw, wantPitch = -0.1, aimDist = 6;
    const T = this.bTgt;
    const dive = th.beam && a.groundTeam === 1;   // submerged in own ink: the beam passes over
    this.target = null;
    if (T && this.mode === 'boss' && !dive) {
      const tp = T.shape ? T.shape.pos : T.pos;
      _v.set(tp.x, tp.y, tp.z);
      _v2.copy(_v); _v2.x -= a.pos.x; _v2.y -= a.pos.y + 1.1; _v2.z -= a.pos.z;
      const dist = Math.hypot(_v2.x, _v2.z);
      T.dist = dist;
      const idealYaw = Math.atan2(_v2.x, _v2.z), idealPitch = Math.atan2(_v2.y, dist);
      aimDist = _v2.length();
      const e = this.diff.aimError * 0.8;
      const acq = Math.exp(-this.acqT / Math.max(0.12, this.diff.reaction * 0.9));
      const wander = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.27 + 1.3) * 0.4;
      wantYaw = idealYaw + e * (0.75 * wander(this.t * 1.7 + this.ph1) + 2.4 * acq * this.acqSignY);
      wantPitch = idealPitch + e * 0.6 * (0.75 * wander(this.t * 2.1 + this.ph2) + 1.6 * acq * this.acqSignP);
      this.target = T;
      const range = this._range() + (T.crab ? 0 : T.rad * 0.6);
      const inRange = dist < range * (w.kind === 'charger' ? 1.0 : 1.05);
      // circle-strafe a little while holding position (a squad that stands still gets slammed)
      if (!wantMove && !th.level && w.kind !== 'charger') {
        if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.4; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.35 + Math.random() * 0.4; }
        this.strafeS += (this.strafe * this.strafeAmp - this.strafeS) * (1 - Math.exp(-4 * dt));
        const nx = _v2.x / Math.max(dist, 0.01), nz = _v2.z / Math.max(dist, 0.01);
        move.set(-nz * this.strafeS, 0, nx * this.strafeS);
        if (dist < 4) move.x -= nx * 0.6, move.z -= nz * 0.6;   // not right under its claws
        wantMove = move.lengthSq() > 0.01;
      }
      const off = Math.hypot(angleDiff(this.aimYaw, idealYaw), this.aimPitch - idealPitch);
      const tol = Math.max(0.05, Math.atan2(T.rad, Math.max(dist, 0.5))) * (this._firing ? 2.4 : 1.5);
      this._firing = false;
      if (inRange && T.los && off < tol && this.react <= 0 && inkFrac > 0.02) {
        const wr = a.weaponRunner;
        if (w.kind === 'charger') { it.fire = !(wr.charging && wr.charge >= this.chargeRelease); if (wr.charging) move.multiplyScalar(0.3); }
        else if (w.kind === 'splatling') { it.fire = !wr.streaming && !(wr.charging && wr.charge >= this.chargeRelease * 0.9); if (wr.charging) move.multiplyScalar(0.45); }
        else if (w.kind === 'spinner') { it.fire = wr.burstT <= 0 && !(wr.charging && wr.charge >= this.chargeRelease); if (wr.charging) move.multiplyScalar(0.6); }
        // hold-to-charge kits: the bow draws to the release point; the Cutlass charges its heavy cut to full (its runner
        // never sets .charging, only .charge) and lets go
        else if (w.kind === 'bow') it.fire = !(wr.charging && wr.charge >= Math.max(0.5, this.chargeRelease));
        else if (w.kind === 'blade') it.fire = !(wr.charge >= 0.98);
        // Brolly: pump the trigger (holding it would unfold the canopy, then launch it)
        else if (w.kind === 'brolly') { it.fire = !this._pump; this._pump = it.fire; }
        else if (w.kind === 'roller') it.fire = dist < 5.5 || (wr.rolling && dist < 8);
        else it.fire = true;
        this._firing = it.fire;
        this.mode = 'fight';   // (the aim spring's combat stiffness while shooting; reset each frame)
        if (this.bombCd <= 0 && !T.crab && a.ink > SUB.bomb.inkCost + 10 && dist > 5 && dist < 13 && Math.random() < 0.025) { it.sub = true; this.bombCd = 6 + Math.random() * 6; this._bombAim = true; }
      } else if ((w.kind === 'charger' || w.kind === 'splatling' || w.kind === 'spinner' || w.kind === 'bow') && a.weaponRunner.charging && T.los) it.fire = true;   // hold a charge through a blink
      // specials: slam from under its claws, the storm cloud onto it
      if (a.specialReady() && !th.level && !T.crab) {
        if (w.special === 'slam' && dist < 5.5) it.special = true;
        if (w.special === 'storm' && dist < 13 && T.los) it.special = true;
      }
    }
    // ---- not shooting it: clean boss ink off the way (and rollers roll it up)
    if (!it.fire && this.mode !== 'refill' && !dive && inkFrac > 0.15) {
      const aheadYaw = wantMove ? Math.atan2(move.x, move.z) : a.yaw;
      const st = G.paint.regionStats(a.pos.x + Math.sin(aheadYaw) * 3, a.pos.y, a.pos.z + Math.cos(aheadYaw) * 3, 2.5, a.team, _stats);
      if (a.groundTeam === 2 || (st.n && st.enemy > 0.2)) {
        this.sweep += dt * 2.1;
        if (this.mode !== 'fight') { wantYaw = aheadYaw + (w.kind === 'roller' ? 0 : Math.sin(this.sweep) * 0.5); wantPitch = w.kind === 'charger' ? -0.12 : w.kind === 'blaster' ? -0.28 : -0.42; }
        it.fire = w.kind === 'roller' ? wantMove : w.kind !== 'charger' && w.kind !== 'splatling' ? true : !a.weaponRunner.charging || a.weaponRunner.charge < 0.6;
      }
    }
    if (this.mode === 'refill') {
      it.squid = a.groundTeam === 1 || this._pathRemaining() > 2;
      if (a.groundTeam !== 1 && this._pathRemaining() < 1.5 && inkFrac > 0.03) { it.squid = false; it.fire = true; wantPitch = -1.0; }
    }
    // ---- dodges: hop the shockwave, dive under the sweep, swim when travelling through own ink
    if (th.ringIn >= 0 && th.ringIn < 0.2 && a.grounded && this.jumpCd <= 0 && !this.hopMiss) { it.jump = true; this.jumpCd = 0.5; }
    if (dive) { it.squid = true; it.fire = false; }
    else if (!it.fire && !a.weaponRunner.charging && a.groundTeam === 1 && (this._pathRemaining() > 4 || evading)) it.squid = true;
    if (!wantMove && !it.fire && a.groundTeam !== 1) it.squid = false;
    this._tail(dt, move, wantYaw, wantPitch, aimDist, wantMove);
    if (this.mode === 'fight') this.mode = 'boss';
  }

  // what to shoot: a crablet that's closing in, else the part of the boss worth hitting that it can see
  _bossPerceive(boss) {
    const a = this.a, eye = _v3.copy(a.pos); eye.y += 1.2;
    let T = null;
    for (const c of boss.crabs.values()) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - a.pos.x, c.z - a.pos.z);
      if (d > 9 || (T && d >= T.dist)) continue;
      if (!G.physics.los(eye, _v.set(c.x, c.y + 0.35, c.z))) continue;
      T = { crab: c, pos: new THREE.Vector3(c.x, c.y + 0.35, c.z), rad: 0.5, dist: d, los: true };
    }
    if (T) { T.pos.set(T.crab.x, T.crab.y + 0.35, T.crab.z); }
    else if (boss.visible && !boss.dead) {
      // keep a chosen spot for a while; the belly (when open) and the eyes are worth 2.5×
      this.shapeT = (this.shapeT || 0) - 0.2;
      const shapes = boss.model.hitShapes.filter((h) => h.active);
      const belly = shapes.find((h) => h.weak && h.socket === 'belly');
      let pick = this.bTgt && !this.bTgt.crab && this.shapeT > 0 && this.bTgt.shape.active ? this.bTgt.shape : null;
      if (belly && pick !== belly) pick = null;
      if (!pick) {
        this.shapeT = 1.2 + Math.random() * 1.5;
        const eyes = this.a.weapon.kind === 'charger' || Math.random() < 0.25 + this.diff.fireDiscipline * 0.3;
        const order = shapes.slice().sort((h1, h2) => {
          const s = (h) => (h === belly ? -100 : h.weak && eyes ? -50 : h.weak ? 10 : 0) + h.pos.distanceTo(eye);
          return s(h1) - s(h2);
        });
        for (const h of order) if (G.physics.los(eye, h.pos)) { pick = h; break; }
        if (!pick) pick = order.find((h) => !h.weak) || null;
      }
      if (pick) {
        const los = G.physics.los(eye, pick.pos);
        T = this.bTgt && this.bTgt.shape === pick ? this.bTgt : { shape: pick, rad: pick.r * 0.85, weak: pick.weak, dist: pick.pos.distanceTo(a.pos) };
        T.los = los;
      }
    }
    const prev = this.bTgt;
    if (T && (!prev || (prev.shape || prev.crab) !== (T.shape || T.crab))) {
      this.react = this.diff.reaction * (0.6 + Math.random() * 0.5);
      this.acqT = 0; this.acqSignY = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); this.acqSignP = (Math.random() - 0.5) * 1.2;
    }
    this.bTgt = T;
  }

  // a spot to fight from: weapon range off its flank (not in front of it — slams, sweeps and charges go that way), clear
  // of the other bots, seeing it. When it's stunned everyone rushes the belly.
  _bossGoal(boss) {
    const a = this.a, w = a.weapon, nav = G.nav;
    this.goalTimer = 2.4 + Math.random() * 2;
    const stunned = boss.stunned || (boss.phase >= 3 && Math.random() < 0.3);
    this._rushing = boss.stunned;
    const fwd = boss.yaw, bx = boss.pos.x, bz = boss.pos.z;
    // rollers keep the squad's routes clean while the boss isn't open
    if (w.kind === 'roller' && !boss.stunned) {
      let bestP = null, bs = 0.25;
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2, r = 3 + Math.random() * 12;
        _v.set(a.pos.x + Math.cos(ang) * r, a.pos.y, a.pos.z + Math.sin(ang) * r);
        const st = G.paint.regionStats(_v.x, _v.y, _v.z, 2.2, a.team, _stats);
        if (!st.n || boss.hz.threat(_v.x, _v.y, _v.z, 1.5).level > 0) continue;
        const sc = st.enemy - r * 0.02;
        if (sc > bs) { bs = sc; bestP = _v.clone(); }
      }
      if (bestP && Math.random() < 0.7) { this._pathTo(bestP, 0.4); return; }
    }
    const reach = w.kind === 'charger' ? 15 : w.kind === 'roller' ? 3.2 : clamp(this._range() * 0.7, 4.5, 11);
    const R = 3.4 + (boss.stunned ? Math.min(reach, 6) : reach);
    const mates = G.actors.filter((o) => o !== a && o.bot && o.alive && o.bot.goal >= 0);
    let best = -1, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      // bearing: its front when it's open (belly), else a flank or the rear
      const off = stunned ? (Math.random() - 0.5) * 1.3 : (Math.random() < 0.5 ? 1 : -1) * (0.95 + Math.random() * 1.9);
      const ang = fwd + off, r = R * (0.85 + Math.random() * 0.3);
      _v.set(bx + Math.sin(ang) * r, boss.pos.y + 0.5, bz + Math.cos(ang) * r);
      const id = nav.nearest(_v, 2.5);
      if (id < 0) continue;
      const n = nav.nodes[id];
      if (Math.hypot(n.x - _v.x, n.z - _v.z) > 2.5) continue;
      let s = -Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.08 + Math.random();
      if (boss.hz.threat(n.x, n.y, n.z, 1.5).level > 0) s -= 6;
      if (G.physics.los(_v2.set(n.x, n.y + 1.3, n.z), _v3.set(bx, boss.pos.y + 2.5, bz))) s += 3;
      for (const m of mates) { const g = nav.nodes[m.bot.goal]; if (Math.hypot(g.x - n.x, g.z - n.z) < 4) s -= 2.5; }
      if (s > bs) { bs = s; best = id; }
    }
    if (best < 0) { this.path = null; return; }
    const n = nav.nodes[best];
    this._pathTo(_v.set(n.x, n.y, n.z), 1.0);
  }

  // out of a telegraph: the reachable spot nearby with the least danger, biased along the escape direction
  _bossEvade(boss, th) {
    const a = this.a, nav = G.nav;
    let best = -1, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      const ang = Math.atan2(th.ax, th.az) + (Math.random() - 0.5) * 2.4, r = 3 + Math.random() * 5;
      _v.set(a.pos.x + Math.sin(ang) * r, a.pos.y, a.pos.z + Math.cos(ang) * r);
      const id = nav.nearest(_v, 1.2);
      if (id < 0) continue;
      const n = nav.nodes[id];
      const t = boss.hz.threat(n.x, n.y, n.z, 1.6);
      const s = -t.level * 8 - Math.hypot(n.x - a.pos.x, n.z - a.pos.z) * 0.25 + (Math.sin(ang) * th.ax + Math.cos(ang) * th.az) * 1.5 + Math.random() * 0.5;
      if (s > bs) { bs = s; best = id; }
    }
    if (best < 0) return;
    const n = nav.nodes[best];
    this._pathTo(_v.set(n.x, n.y, n.z), 1.0);
    this.goalTimer = 0.8;
  }
}
