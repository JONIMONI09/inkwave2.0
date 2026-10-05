// Match: turf-war rules, lifecycle (intro → countdown → play → time's up → judge → results), team setup.
import * as THREE from 'three';
import { G, emit, on, clamp } from '../core/ctx.js';
import { MATCH, PLAYER, WEAPON_ORDER, SUB_ORDER, SPECIAL_ORDER, BOT_NAMES, TEAM_NAMES, ZONES } from '../config.js';
import { ZoneControl } from './zones.js';
import { randomStyle } from './character-style.js';
import { Actor } from './actor.js';
import { BotBrain } from './bots.js';
import { PlayerController } from './player.js';
import { BossMode, BOSS_MODE } from '../boss/bossMode.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Match {
  constructor(opts) {
    this.opts = opts;          // { duration, difficulty, attract, practice, playerName, weapon, CharacterClass, input, rig, mode }
    this.attract = !!opts.attract;
    this.practice = !!opts.practice;   // solo on an empty stage: no enemies, no teammates, no clock
    // turf | zones (Zone Control) | boss (one squad, team 0, vs HULLBREAKER); attract backdrops and practice are turf
    this.mode = this.attract || this.practice ? 'turf' : opts.mode === 'boss' ? 'boss' : opts.mode === 'zones' ? 'zones' : 'turf';
    this.duration = opts.duration || (this.mode === 'zones' ? ZONES.duration : this.mode === 'boss' ? BOSS_MODE.duration : MATCH.defaultDuration);
    this.zones = null;             // ZoneControl (Zone Control mode)
    this.time = this.duration;
    this.state = 'init';
    this.stateT = 0;
    this.actors = [];
    this.controller = null;
    this.result = null;
    this.paused = false;
    this.lastMinuteFired = false;
    this.lastCount = 99;
    this.events = [];
  }

  playing() { return this.state === 'playing' && !this.paused; }
  canRespawn() { return this.state === 'playing'; }

  setup() {
    const o = this.opts;
    const CharacterClass = o.CharacterClass;
    if (o.roster) { this._setupRoster(o, CharacterClass); return; }
    // weapons: each team gets a balanced mix
    const pickTeam = (first) => {
      const pool = [...WEAPON_ORDER];
      const out = [];
      if (first) { out.push(first); pool.splice(pool.indexOf(first), 1); }
      while (out.length < MATCH.teamSize) {
        if (!pool.length) pool.push(...WEAPON_ORDER);
        out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
      }
      return out;
    };
    const names = shuffle([...BOT_NAMES]);
    let ni = 0;
    const boss = this.mode === 'boss';
    // humans-only stage (config noBots) offline: a match is just you (the ?devstage walk), the attract backdrop nobody
    // (o.mannequins: idle, brainless kids for the render audits)
    const noBots = !!o.noBots;
    for (let team = 0; team < (boss || this.practice ? 1 : 2); team++) {
      const weapons = pickTeam(team === 0 && !this.attract ? o.weapon : null);
      if (boss) weapons.push(...pickTeam(null));   // the whole squad on one side: 8 kids, every weapon kind
      for (let s = 0; s < (this.practice ? 1 : boss ? BOSS_MODE.squad : MATCH.teamSize); s++) {
        const isLocal = team === 0 && s === 0 && !this.attract;
        if (noBots && !isLocal && !(this.attract && o.mannequins)) continue;
        // subs: yours from the loadout; bots carry a random one (about half keep their weapon's default)
        const sub = isLocal ? o.sub : Math.random() < 0.5 ? null : SUB_ORDER[(Math.random() * SUB_ORDER.length) | 0];
        const special = isLocal ? o.special : Math.random() < 0.5 ? null : SPECIAL_ORDER[(Math.random() * SPECIAL_ORDER.length) | 0];
        const a = new Actor({
          team, slot: s, weapon: weapons[s], sub, special, isLocal, isBot: !isLocal,
          name: isLocal ? (o.playerName || 'You') : names[ni++ % names.length],
          // your look from the Locker (an empty style resolves from your name); bots get random looks
          style: isLocal ? { ...(o.style || {}) } : randomStyle(), CharacterClass,
        });
        if (isLocal && o.style) { /* reserved for future customisation */ }
        G.scene.add(a.character.root);
        if ((!isLocal || o.autopilot) && !(noBots && !isLocal)) a.bot = new BotBrain(a, o.difficulty);
        this.actors.push(a);
      }
    }
    G.actors = this.actors;
    this.local = this.actors.find((a) => a.isLocal) || null;
    G.local = this.local;
    if (this.local && !o.autopilot) this.controller = new PlayerController(this.local, o.rig, o.input);
    // initial placement on the spawn decks (standing, no drop)
    for (const a of this.actors) {
      const pad = G.level.spawnPads[a.team];
      const ang = (a.slot / (this.mode === 'boss' ? BOSS_MODE.squad : 4)) * Math.PI * 2 + 0.6, rr = this.mode === 'boss' ? 1.7 : 1.2;
      _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
      a.invuln = 0;
      if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    }
    this.unsubs = [
      on('splatted', (e) => this._onSplatted(e)),
    ];
    if (this.mode === 'zones') {
      this.zones = new ZoneControl(this);
      this.unsubs.push(on('turf', (e) => this._zoneTurf(e)));
    }
    if (this.mode === 'boss') { this.bossMode = new BossMode(this); this.boss = this.bossMode.boss; }
  }

  // Online: the host's roster — who owns which squidkid (players their own, the host the bots).
  _setupRoster(o, CharacterClass) {
    const me = o.myId;
    this.follower = !o.host;
    for (const r of o.roster) {
      const mine = r.owner === me;
      const a = new Actor({ team: r.team, slot: r.slot, weapon: r.weapon, sub: r.sub || null, special: r.special || null, isLocal: mine && !r.bot, isBot: r.bot, name: r.name, style: r.style || undefined, CharacterClass });
      a.nid = r.nid; a.owner = r.owner; a.remote = !mine;
      G.scene.add(a.character.root);
      if (mine && (r.bot || o.autopilot)) a.bot = new BotBrain(a, o.difficulty);
      this.actors.push(a);
    }
    G.actors = this.actors;
    this.local = this.actors.find((a) => a.isLocal) || null;
    G.local = this.local;
    if (this.local && !o.autopilot) this.controller = new PlayerController(this.local, o.rig, o.input);
    for (const a of this.actors) {
      const pad = G.level.spawnPads[a.team];
      const ang = (a.slot / (this.mode === 'boss' ? BOSS_MODE.squad : 4)) * Math.PI * 2 + 0.6, rr = this.mode === 'boss' ? 1.7 : 1.2;
      _v.set(pad.x + Math.cos(ang) * rr, pad.y, pad.z + Math.sin(ang) * rr);
      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);
      a.invuln = 0;
      if (a.bot) { a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; }
    }
    this.unsubs = [on('splatted', (e) => this._onSplatted(e))];
    if (this.mode === 'zones') {   // Zone Control online: the host runs the rules, guests follow (zones.js netEvent)
      this.zones = new ZoneControl(this);
      this.unsubs.push(on('turf', (e) => this._zoneTurf(e)));
    }
    if (this.mode === 'boss') { this.bossMode = new BossMode(this); this.boss = this.bossMode.boss; }
  }

  // Zone Control: ink the splat actually left inside the live zone counts as objective play (results / XP).
  // paint.js reports the in-zone part of each claim in the event's `zoneArea` (per-cell test, the same outline +
  // height check zoneCells() builds the zones' cells with) — actor position and aim point deliberately do not
  // matter, so standing outside the zone spraying into it credits nothing, and being inside while painting the
  // floor outside it credits nothing either.
  _zoneTurf({ actor, zoneArea }) {
    if (!this.zones || this.state !== 'playing' || !actor || !(zoneArea > 0)) return;
    actor.stats.zoneTurf = (actor.stats.zoneTurf || 0) + zoneArea;
  }

  // Zone Control decided the match (knockout / overtime result): straight to time's up
  endZones(winner, reason) {
    this.zoneResult = { winner, reason };
    if (this.state === 'playing') { this.time = Math.max(0, this.time); this.setState('finish'); }
  }

  start() {
    this.setState(this.attract || this.practice ? 'playing' : 'intro');
  }

  setState(s) {
    this.state = s; this.stateT = 0;
    emit('match:state', { state: s, match: this });
  }

  dispose() {
    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;
    for (const a of this.actors) { G.scene.remove(a.character.root); a.weaponRunner.reset(); a.character.dispose?.(); }
    this.unsubs?.forEach((u) => u());
    G.actors = [];
    G.local = null;
  }

  // Online, humans-only stage (config noBots): a player left, and nobody takes over their squidkid — it bursts into its
  // own ink and is gone. HUD squads, the minimap, specials / weapons and the judge all read this.actors (G.actors is the
  // same array), so dropping it here is all they need.
  removeActor(a) {
    const i = this.actors.indexOf(a);
    if (i < 0) return;
    if (a.alive && a.character.root.visible) {
      _v.copy(a.pos); _v.y += 0.6;
      G.fx?.splatted(_v, a.color);
      G.fx?.burst?.(_v, _up, a.color, { count: 18, speed: 5, size: 0.1 });
      G.audio?.play?.('splat_big', { pos: a.pos, volume: 0.6 });
    }
    this.actors.splice(i, 1);
    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot
    G.scene.remove(a.character.root); a.weaponRunner.reset(); a.character.dispose?.();
    emit('actor:removed', { actor: a });
  }

  _onSplatted({ victim, attacker, cause }) {
    this.events.push({ t: this.duration - this.time, victim, attacker, cause });
  }

  update(dt) {
    if (this.paused) return;
    this.stateT += dt;
    switch (this.state) {
      case 'intro':
        if (this.stateT > (this.bossMode ? BOSS_MODE.intro : 4.2)) this.setState('playing');
        break;
      case 'playing': {
        if (this.practice) break;   // practice never runs out
        if (this.zones) {
          this.zones.update(dt);
          if (this.state !== 'playing') break;         // knockout / overtime decided it
          if (this.zones.overtime) break;              // the clock stays at 0 through overtime
        }
        this.time -= dt;
        if (!this.attract) {
          if (!this.lastMinuteFired && this.time <= 60 && this.duration > 60) { this.lastMinuteFired = true; emit('match:oneminute', {}); }
          const c = Math.ceil(this.time);
          if (this.time <= MATCH.finalCountdown && c !== this.lastCount && c > 0) { this.lastCount = c; emit('match:count', { n: c }); }
        }
        if (this.time <= 0) {
          this.time = 0;
          // Zone Control may go to overtime instead; online, the host calls time
          if (!this.follower && (!this.zones || this.zones.timeUp())) { if (this.state === 'playing') this.setState('finish'); }
        }
        break;
      }
      case 'finish':
        if (this.stateT > (this.bossMode ? (this.bossMode.boss.dead ? BOSS_MODE.finishWin : BOSS_MODE.finishLose) : 2.6) && !this.follower && !this.result) this._judge();
        break;
    }
    // actors (the local controller runs once per rendered frame via updateController)
    const live = this.state === 'playing';
    for (const a of this.actors) {
      if (a.bot) {
        if (live) a.bot.update(dt);
        else { a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.squid = a.intent.sub = a.intent.jump = a.intent.special = false; }
      }
    }
    const nm = G.netm;
    for (const a of this.actors) { if (a.remote && nm) nm.applyRemote(a, dt); else a.update(dt); }
    this.bossMode?.update(dt);
    // soft push between actors
    for (let i = 0; i < this.actors.length; i++) for (let j = i + 1; j < this.actors.length; j++) {
      const a = this.actors[i], b = this.actors[j];
      if (!a.alive || !b.alive) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dz * dz;
      const r = PLAYER.radius * 1.7;
      if (d2 < r * r && Math.abs(dy) < 1.2 && d2 > 1e-5) {
        // online: other players' squidkids are where their owners say — only your own side gives way
        const ka = a.remote ? 0 : b.remote ? 1 : 0.5, kb = b.remote ? 0 : a.remote ? 1 : 0.5;
        const d = Math.sqrt(d2), push = (r - d);
        a.pos.x -= (dx / d) * push * ka; a.pos.z -= (dz / d) * push * ka;
        b.pos.x += (dx / d) * push * kb; b.pos.z += (dz / d) * push * kb;
      }
    }
  }

  updateController(dt) {
    if (!this.controller) return;
    this.controller.enabled = this.state === 'playing' && !this.paused && this.local.alive;
    this.controller.update(dt);
  }

  _judge() {
    if (this.zones) {
      const Z = this.zones;
      this.result = { mode: 'zones', coverage: G.paint.coverage(), winner: Z.winner ?? 0, reason: Z.reason,
        counts: [Math.ceil(Z.count[0]), Math.ceil(Z.count[1])], penalty: [...Z.penalty], overtime: Z.overtime, log: Z.log };
      G.netm?.sendResult(this.result);        // online: every client shows the host's result
      this.setState('judge');
      return;
    }
    if (this.bossMode) {
      this.result = this.bossMode.result();
      G.netm?.sendResult(this.result);
      this.setState('judge');
      return;
    }
    const cov = G.paint.coverage();
    // Turf tie-break (Splatoon 3's rule, deterministic): an exact tie goes to team 0 (Alpha) with the displayed
    // coverage nudged +0.1 % — never a coin flip, so the same paint state always judges the same way. Online this
    // runs on the host only and travels to every client through netmatch.sendResult ('res'), so results stay
    // authoritative and consistent across clients.
    const tie = cov[0] === cov[1];
    if (tie) cov[0] += 0.001;   // +0.1 % of the stage — matches the UI's one-decimal display
    const win = tie ? 0 : cov[0] > cov[1] ? 0 : 1;
    this.result = { coverage: cov, winner: win, ...(tie ? { tieBreak: true } : {}) };
    G.netm?.sendResult(this.result);        // online: every client shows the host's count
    this.setState('judge');
  }

  teamSummary() {
    return [0, 1].map((t) => ({
      color: G.teamHex[t],
      players: this.actors.filter((a) => a.team === t).map((a) => ({
        name: a.name, weapon: a.weaponId, alive: a.alive, respawn: a.alive ? 0 : Math.max(0, a.respawnTimer), specialReady: a.specialReady(), isSelf: a.isLocal,
      })),
    }));
  }
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
