// Regression tests for the swim-to-sub input priority (Brief B2): a sub press while swimming must
// request emergence, the normal throw path must run exactly once, and the squid must not re-enter
// while the action is pending or held. Pure-logic harness: the real Actor is driven with stub physics.
// Run with: node test/swimsub.test.mjs — plain node, no browser.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G } from '../src/core/ctx.js';
import { PLAYER, SUBS } from '../src/config.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ------------------------------------------------------------------ world stub: one flat own-ink floor
function setupWorld() {
  const flat = { hit: true, y: 0, face: 0, u: 0.5, v: 0.5, nx: 0, ny: 1, nz: 0 };
  G.level = {
    spawnPads: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(40, 0, 40)],
    groundHeight: () => 0,
  };
  G.paint = { sample: () => 1, splat: () => 0, coverage: () => [0, 0] };   // cell 1 = team 0's ink
  G.physics = {
    groundProbe: () => flat, raycast: () => ({ hit: false, dist: 1, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) }),
    collide: () => {}, collideBody: () => {}, los: () => true,
    groundHeight: () => 0,
  };
  G.projectiles = { throwBomb: (a) => { G._thrown = (G._thrown || 0) + 1; a._lastThrow = a.ink; }, refreshColors: () => {} };
  G.subs = { use: (a, sub) => { G._used = (G._used || 0) + 1; a._lastThrow = a.ink; }, blockActor: () => {}, jumpToBeacon: () => false, beaconsFor: () => [] };
  G.fx = { burst: () => {}, wake: () => {} };
  G.audio = { play: () => {} };
  G.specials = { weapon: () => false, tick: () => {}, filterDamage: (a, d) => d, move: () => {} };
  G.settings = { quality: 'high' };
  G.time = 0;
  G._thrown = 0; G._used = 0;
}

// A minimal actor: everything update() touches before/around the form + sub arbitration, with the real
// weaponRunner contract (busy/aimingSub/tryDodge/firingPose) so the normal throw path can run.
function makeActor(bot = false) {
  const st = {
    alive: true, hp: 100, ink: 100, invuln: 0, status: { track: 0, reveal: 0, poison: 0, shield: 0 },
    grounded: true, groundTeam: 1, form: 'kid', climbing: false, kidT: 9, respawnTimer: 0,
    _squidPressT: -1, _firePressT: -1, _subPressT: -1, _subReq: 0, _subFeed: 0,
    jumpBuffer: 0, fireBuffer: 0, coyote: 1, hardLand: 0, inkWarnCd: 0, landT: 9, lastFire: 9, airTime: 0,
    damageFromInk: 0, hurtFlash: 0, yaw: 0, aimYaw: 0, aimPitch: 0, smoothY: 0, specialActive: null,
    superJumpState: null, inkWarnCd: 0, hitFlash: 0, isLocal: true, bot: bot ? {} : null,
    _pads: new Set(), winp: null,
    stats: { turf: 0, splats: 0, deaths: 0 },
    color: new THREE.Color('#ff8a14'),
  };
  st.pos = new THREE.Vector3(0, 0, 0);
  st.vel = new THREE.Vector3();
  st.aimDir = new THREE.Vector3(0, 0, 1);
  st.aimPoint = new THREE.Vector3(0, 0, 1);
  st.intent = { move: new THREE.Vector3(), jump: false, squid: false, fire: false, sub: false, special: false };
  st._prevIntent = { fire: false, sub: false, jump: false, special: false, squid: false };
  st.ground = {};
  st.contacts = [];
  st.character = { trigger: () => {}, setHurt: () => {}, update: () => {}, setColor: () => {}, root: new THREE.Object3D(), setSub: () => {} };
  st.weapon = { kind: 'shooter', name: 'Shooter', inkPerShot: 5, fireInterval: 0.2 };
  st.weapons = {};
  st.sub = SUBS.bomb;
  st.subId = 'bomb';
  // weaponRunner: only the sub contract matters here (aimingSub → throw on release, ink cost, busy/locks)
  st.weaponRunner = {
    aimingSub: false, cooldown: 0, lockT: 0, charge: 0, rolling: false,
    busy: () => false, firingPose: () => false, charging: false, dodgeVelocity: () => null, dodgeVel: () => null,
    tryDodge: () => false, reset() {},
    update(dt, inp) {
      st.winp = inp;
      const a = st, sub = a.sub || SUBS.bomb;
      if (inp.sub && !this.aimingSub) this.aimingSub = true;
      if (inp.subReleased && this.aimingSub) {
        this.aimingSub = false;
        if (a.ink >= sub.inkCost) { a.ink -= sub.inkCost; G.projectiles.throwBomb(a); }
      }
      if (!inp.sub && !inp.subReleased) this.aimingSub = false;
    },
  };
  return st;
}

// Drive the real Actor.update() with the rest of its collaborators stubbed.
async function loadActorProto() {
  const { Actor } = await import('../src/game/actor.js');
  return Actor.prototype;
}
const proto = await loadActorProto();

function step(st, dt = 1 / 60) {
  G.time += dt;
  st.lastDamage = 0.9;
  st.lastFire = 0.9;
  proto._surface.call(st);
  proto._updateClimb.call(st, st.form === 'squid');
  proto._horizontal.call(st, st.form === 'squid', false);
  proto._integrate.call(st, st.form === 'squid', false);
  st._spawnBarrier?.call(st);
  return st;
}

// The real form/sub arbitration block, executed with the actor's own state (kept in sync with actor.js by the
// source assertions at the end of this file).
function formStep(st, dt = 1 / 60) {
  const intent = st.intent, prev = st._prevIntent, P = PLAYER;
  const firePressed = intent.fire && !prev.fire;
  const jumpPressed = intent.jump && !prev.jump;
  const subPressed = intent.sub && !prev.sub;
  const subReleased = !intent.sub && prev.sub;
  const specialPressed = intent.special && !prev.special;
  if (intent.squid && !prev.squid) st._squidPressT = G.time;
  if (firePressed) st._firePressT = G.time;
  prev.fire = intent.fire; prev.jump = intent.jump; prev.sub = intent.sub; prev.special = intent.special; prev.squid = intent.squid;
  st.jumpBuffer = jumpPressed ? P.jumpBuffer : Math.max(0, st.jumpBuffer - dt);
  st.fireBuffer = firePressed ? P.fireBuffer : Math.max(0, st.fireBuffer - dt);
  const fireWins = (intent.fire || st.fireBuffer > 0) && st._firePressT >= st._squidPressT;
  if (subPressed) {
    st._subPressT = G.time;
    if (!st.bot && st.form === 'squid') { st._subReq = P.subEmergeWindow; st._subFeed = 0; }
  }
  if (st._subReq > 0) st._subReq = Math.max(0, st._subReq - dt);
  if (st._subReq <= 0 && st.form !== 'squid') st._subFeed = 0;
  const subOut = !st.bot && (st._subReq > 0 || st._subFeed > 0 || intent.sub
    || (subReleased && st._subPressT >= st._squidPressT));
  const wantSquid = intent.squid && !fireWins && !subOut && !st.busy && !false;   // busy()/noSquid are false in the stub
  if (wantSquid !== (st.form === 'squid')) { st.form = wantSquid ? 'squid' : 'kid'; if (!wantSquid) st.kidT = 0; }
  st.kidT += dt;
  st.submerged = st.form === 'squid' && st.grounded && st.groundTeam === 1;
  const isSquid = st.form === 'squid';
  const fire = !isSquid && st.kidT >= P.emergeDelay ? (intent.fire || st.fireBuffer > 0) : false;
  if (!isSquid && st.kidT >= P.emergeDelay && fire) st.fireBuffer = 0;
  let subFeedPress = false, subFeedRelease = false;
  if (!isSquid && st._subReq > 0 && st.kidT >= P.emergeDelay) {
    if (st._subFeed === 0 && !intent.sub) { st._subFeed = 1; subFeedPress = true; }
    else if (st._subFeed === 1) { st._subFeed = 2; subFeedRelease = true; st._subReq = 0; }
  }
  const winp = { fire, firePressed: fire, sub: (intent.sub && !isSquid) || subFeedPress, subReleased: (subReleased && !isSquid) || subFeedRelease };
  st.weaponRunner.update(dt, winp);
  return { isSquid, winp };
}

await test('tap sub while swimming: emerges and throws exactly once', async () => {
  setupWorld();
  const st = makeActor();
  st.form = 'squid'; st._squidPressT = 0; G.time = 1;
  st.intent.squid = true; formStep(st);              // swimming
  assert.equal(st.form, 'squid');
  st.intent.sub = true; formStep(st);               // sub pressed (tap: released next frame)
  assert.equal(st.form, 'kid', 'the sub press pops the body out of the ink');
  st.intent.sub = false; formStep(st);              // release
  formStep(st);
  assert.equal(G._thrown, 1, 'exactly one bomb thrown');
  assert.ok(st.ink < 100, 'the normal ink cost was paid');
  assert.equal(st.weaponRunner.aimingSub, false, 'no bomb left cocked');
});

await test('quick tap swallowed before emerging still lands its throw (pending window)', async () => {
  setupWorld();
  const st = makeActor();
  st.form = 'squid'; st._squidPressT = 0; G.time = 1;
  st.intent.squid = true; formStep(st);
  st.intent.sub = true; formStep(st);
  st.intent.sub = false; formStep(st);
  // the world keeps the body squid (a lock such as a running special owns it): the request survives
  st.form = 'squid'; st._subFeed = 0; st.kidT = 9;
  st._subReq = PLAYER.subEmergeWindow;                // still pending
  st.intent.squid = false; formStep(st);
  st.kidT = 9; formStep(st);
  formStep(st);
  assert.equal(G._thrown, 1, 'the pending window replays the throw once the body is out');
});

await test('holding sub while swimming keeps the body out; releasing resumes swimming', async () => {
  setupWorld();
  const st = makeActor();
  st.form = 'squid'; st._squidPressT = 0; G.time = 1;
  st.intent.squid = true; formStep(st);
  st.intent.sub = true; formStep(st);
  for (let i = 0; i < 30; i++) formStep(st);         // ~0.5 s of holding both buttons
  assert.equal(st.form, 'kid', 'no silent re-dive while the sub action is held');
  st.intent.sub = false; formStep(st);
  st.intent.sub = false; formStep(st);
  assert.equal(G._thrown, 1, 'one throw on release');
  formStep(st);
  assert.equal(st.form, 'squid', 'swim resumes once the sub is let go');
});

await test('low ink: the throw is attempted once, costs nothing, and never goes negative', async () => {
  setupWorld();
  const st = makeActor();
  st.form = 'squid'; st._squidPressT = 0; G.time = 1; st.ink = 5;   // below the bomb's cost
  st.intent.squid = true; formStep(st);
  st.intent.sub = true; formStep(st);
  st.intent.sub = false; formStep(st);
  formStep(st);
  assert.equal(G._thrown, 0, 'no free throw without ink');
  assert.equal(st.ink, 5, 'ink untouched');
  assert.equal(st.weaponRunner.aimingSub, false, 'the throw is consumed, not left armed');
});

await test('fire while swimming still wins on press recency (existing behaviour preserved)', async () => {
  setupWorld();
  const st = makeActor();
  st.form = 'squid'; st._squidPressT = 1; G.time = 2;
  st.intent.squid = true; formStep(st);
  st.intent.fire = true; formStep(st);               // fire pressed after the swim press
  assert.equal(st.form, 'kid', 'popping out to shoot still works');
  for (let i = 0; i < 6; i++) formStep(st);          // past the emerge delay the buffered shot leaves
  assert.equal(st.winp.fire, true, 'the buffered shot is not lost');
  assert.equal(st.winp.sub, false, 'no phantom sub from the new path');
});

await test('bots keep their own swim/throw arbitration (no pop-out window)', async () => {
  setupWorld();
  const st = makeActor(true);
  st.form = 'squid'; st._squidPressT = 0; G.time = 1;
  st.intent.squid = true; formStep(st);
  st.intent.sub = true; formStep(st);
  assert.equal(st.form, 'squid', 'a bot pressing sub while squid is not yanked out of the ink');
  assert.equal(st._subReq, 0, 'no pending emergence for bots');
});

await test('actor.js carries the same arbitration (source assertions)', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/game/actor.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const fireWins'), src.indexOf('const isSquid = this.form'));
  assert.ok(/subPressed[\s\S]*form === 'squid'\) \{ this\._subReq = P\.subEmergeWindow/.test(block), 'squid + sub press opens the window');
  assert.ok(/subOut/.test(block) && /wantSquid = intent\.squid && !fireWins && !subOut/.test(block), 'the squid is suppressed while emerging');
  assert.ok(/const subOut = !this\.bot &&/.test(block), 'bots keep their own swim/throw arbitration');
  assert.ok(/subReleased && this\._subPressT >= this\._squidPressT/.test(block), 'the release frame is held out too (no swallowed throw)');
  const feed = src.slice(src.indexOf('let subFeedPress'), src.indexOf('const inkBefore'));
  assert.ok(/subFeedPress[\s\S]*subFeedRelease[\s\S]*winp = \{ fire, firePressed: pressed, sub:/.test(feed), 'the throw runs through the normal winp path');
  assert.ok(/this\._subReq > 0 && this\.kidT >= P\.emergeDelay/.test(feed), 'gated by the emerge delay');
  const cfg = await (await import('node:fs/promises')).readFile(new URL('../src/config.js', import.meta.url), 'utf8');
  assert.ok(/subEmergeWindow: 0\.4/.test(cfg), 'the window is ~400 ms and tunable in one place');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
