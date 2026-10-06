// INKWAVE — boot, main loop and game-flow orchestration (menus ⇄ attract mode ⇄ matches ⇄ results).
import * as THREE from 'three';
import { G, on, emit, clamp, damp } from './core/ctx.js';
import { Renderer } from './core/renderer.js';
import { Input } from './core/input.js';
import { TouchControls, isTouchDevice } from './core/touch.js';
import { loadLayout, saveLayout, activeOrientation } from './core/touch-layout.js';
import { loadAccounts, saveAccounts, activeAccount, createAccount, deleteAccount, renameAccount } from './core/profiles.js';
import { mapTheme,
  DEFAULT_SETTINGS, QUALITY, TEAM_PALETTES, COLORBLIND_PALETTE, TEAM_NAMES, WEAPONS, WEAPON_ORDER, WEAPON_SUCCESSOR, ZONES, SUB, SUBS, SUB_ORDER, SPECIALS, SPECIAL_ORDER,
  MAPS, DIFFICULTY, PLAYER, PROGRESSION, VERSION, MATCH, OFFLINE_MAPS, mapOfflineOk, mapNoBots, mapBossOk,
} from './config.js';
import { Level } from './world/level.js';
import { MAP_LAYOUTS } from './world/maps.js';
import { PaintSystem } from './world/paint.js';
import { createLevelMaterial, setLevelLamps } from './world/levelMaterial.js';
import { SwimWake } from './fx/swimWake.js';
import { Decor } from './world/decor.js';
import { createMuralTexture } from './world/murals.js';
import { layoutThumbSVG } from './world/mapThumb.js';
import { dressingFor } from './world/dressing.js';
import { inMode, layoutFor, variantKey } from './world/variants.js';
import './game/kits/index.js';   // kit weapons + subs register themselves (game/kits/registry.js)
import { Physics, Hit } from './game/physics.js';
import { NavGraph } from './game/nav.js';
import { Projectiles } from './game/weapons.js';
import { SubSystem } from './game/subs.js';
import { SpecialSystem } from './game/specials.js';
import { CameraRig } from './game/cameraRig.js';
import { Match } from './game/match.js';
import { Minimap } from './game/minimap.js';
import { Showcase } from './game/showcase.js';
import { ZoneMarks } from './fx/zoneMarks.js';
import { BOSS_MODE } from './boss/bossMode.js';
import { Log } from './core/logger.js';
import { GpuSelfTest, verdictToTier, describeVerdict } from './core/gpu-selftest.js';
import { Perf } from './core/perf.js';

const params = new URLSearchParams(location.search);
// dev-only: ?devstage lets an online-only stage (config onlineOnly — Cargo Terminal) boot as the backdrop and be walked
// solo offline (never with bots); without it such a stage only ever loads for an online match
const DEV_STAGE = params.has('devstage');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const REFRESH_RATES = [30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 240]; // common display rates (Hz)

// ------------------------------------------------------------------------------------------ persistence
function loadJSON(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v ? { ...def, ...v } : { ...def }; } catch { return { ...def }; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } }

async function loadModule(path, stubName) {
  try { return await import(path); }
  catch (e) {
    console.error(`[inkwave] failed to load ${path} — using stub`, e);
    const stubs = await import('./dev/stubs.js');
    return stubName ? stubs : {};
  }
}

class Game {
  async boot() {
    const t0 = performance.now();
    // GPU compatibility self-test (?gpudiag runs it verbosely; the tier logic also runs on demand from Settings).
    // The verdict maps to a render tier — see _applyRenderTier. Only a REAL render+readback decides; extension
    // probes are untrustworthy on the Adreno/ANGLE stacks this exists for.
    // NOTE: G.renderer does not exist until the renderer is created further down — the GpuSelfTest is
    // constructed there. Building it earlier ran the tier test on a null renderer and crashed boot
    // ("can't access property 'getContext', r is null").
    // real top-down thumbnails for the stage cards, generated from each layout's geometry
    for (const m of MAPS) { try { m.thumb = layoutThumbSVG(MAP_LAYOUTS[m.layout || m.id], m.theme); } catch (e) { console.warn('thumb', m.id, e); } }
    this.settings = G.settings = loadJSON('inkwave.settings', DEFAULT_SETTINGS);
    // phones / tablets, first run: pick the potato preset so a cheap Android gets playable fps out of
    // the box (render density far below CSS pixels, no shadows/bloom). One saved setting and it never
    // overrides again — the settings menu has the full ladder including Lite.
    if (!localStorage.getItem('inkwave.settings') && isTouchDevice()) {
      Object.assign(this.settings, { quality: 'potato', shadows: false, bloom: false, fpsCap: 60, showFps: true });
      saveJSON('inkwave.settings', this.settings);
    }
    // touch devices get the touch-only auto-aim assist offered once, off by default (never auto-enabled:
    // it is a gameplay-affecting setting, and a silent one that changes how the game plays)
    if (this.settings.touchAutoAim === undefined) this.settings.touchAutoAim = false;
    if (this.settings.autoFireOnAim === undefined) this.settings.autoFireOnAim = false;
    if (this.settings.gpuMode === undefined) this.settings.gpuMode = 'auto';   // 'auto' | 'legacy'
    if (this.settings.gpuTier === undefined) this.settings.gpuTier = null;     // cached self-test verdict tier
    // desktop app: the window's fullscreen state is owned by the native shell; mirror it into settings for the menu
    if (window.inkwaveNative) {
      this.settings.fullscreen = window.inkwaveNative.isFullScreen();
      window.inkwaveNative.onFullScreenChange((on) => { this.settings.fullscreen = on; });
    }
    // v1.1: fov became horizontal — migrate old vertical values once
    if (this.settings.fovMode !== 'h') { this.settings.fov = DEFAULT_SETTINGS.fov; this.settings.fovMode = 'h'; saveJSON('inkwave.settings', this.settings); }
    // local profiles: the account store owns the save from here on, and migrates the old single-profile key on first
    // run so nobody loses progress. this.profile stays a live reference to the active account's profile object.
    const acc = loadAccounts();
    this.accounts = acc.accounts;
    this.accountId = acc.activeId;
    this.profile = activeAccount(this.accounts, this.accountId).profile;
    if (WEAPON_SUCCESSOR[this.profile.weapon]) this.profile.weapon = WEAPON_SUCCESSOR[this.profile.weapon];   // retired weapons
    const app = document.getElementById('app');
    this.uiRoot = document.getElementById('ui-root');
    this.fadeEl = document.getElementById('fade');

    // UI first so the loading screen shows immediately
    const [menusMod, hudMod] = await Promise.all([loadModule('./ui/menus.js'), loadModule('./ui/hud.js')]);
    this.menus = G.menus = menusMod.Menus ? new menusMod.Menus(this.uiRoot, this._menuApi()) : null;
    this.hud = G.hud = hudMod.HUD ? new hudMod.HUD(this.uiRoot, { playSound: (n, o) => G.audio?.play(n, o) }) : null;
    // map diorama pins/finish live inside the HUD layer (under every other HUD element)
    try { const { DioramaOverlay } = await import('./ui/diorama.js'); this.diorama = new DioramaOverlay(this.hud ? this.hud.el : this.uiRoot); } catch (e) { console.error('[inkwave] diorama', e); this.diorama = null; }
    this.hud?.setVisible(false);
    this.menus?.show('loading');
    // the inline splash (index.html) has done its job the moment the real loading screen is on stage
    if (typeof window !== 'undefined' && window.inkwaveBootDone) window.inkwaveBootDone();
    Log.install();   // uncaught errors / rejections leave a [inkwave:crash] trace
    this.bootMarks = [];
    const bootStep = Log.steps('boot');   // one line per boot step, with its duration
    const progress = async (p, label) => { this.bootMarks.push([label, Math.round(performance.now() - t0)]); bootStep(label); this.menus?.setLoading(p, label); await nextFrame(); };
    await progress(0.05, 'Mixing ink…');

    // renderer / scene
    this.R = new Renderer(app, this.settings);
    G.renderer = this.R.renderer;
    // now a renderer exists: build the self-test and honour ?gpudiag (moved here from the top of boot)
    this.gpuTest = new GpuSelfTest(G.renderer);
    if (params.has('gpudiag')) {
      const v = this.gpuTest.run();
      Log.info('gpu', v.info || '');
      Log.info('gpu', describeVerdict(v));
      if (v.error) Log.error('gpu', v.error);
    }
    // tier BEFORE anything builds textures (addendum rule 4): legacy skips the texlib entirely
    this._resolveGpuTier();
    const scene = (G.scene = new THREE.Scene());
    const camera = (G.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.15, 6500));
    camera.position.set(0, 40, -60);
    this.R.setScene(scene, camera);
    this.input = G.input = new Input(this.R.renderer.domElement);
    // touch devices (phones/tablets): on-screen controls instead of pointer lock + keyboard
    this.isTouch = isTouchDevice() && !params.has('no-touch');
    this.input.touchOnly = this.isTouch;
    if (this.isTouch) this.touch = new TouchControls(this.input, { onPause: () => this._touchPause() }).bindOrientation();
    if (this.isTouch) this.touch.applyLayout();   // the player's saved touch layout (per orientation)
    // portrait is not supported during a match (not enough vertical view for a turf shooter): a
    // full-screen overlay asks for landscape; the match itself keeps running underneath
    if (this.isTouch) {
      const guard = document.createElement('div');
      guard.id = 'iw-rotate';
      guard.style.cssText = 'position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;text-align:center;background:rgba(8,10,18,.85);color:#fff;font:800 20px Rubik,system-ui,sans-serif;padding:24px;letter-spacing:.02em';
      guard.textContent = 'Rotate your device — INKWAVE plays in landscape.';
      document.body.appendChild(guard);
      const upd = () => {
        const portrait = innerHeight > innerWidth * 1.05;
        guard.style.display = (portrait && G.mode === 'match') ? 'flex' : 'none';
      };
      addEventListener('resize', upd);
      addEventListener('orientationchange', upd);
      this._rotGuardUpdate = upd;
    }
    this.input.onKey = (e, repeat) => this._onKey(e, repeat);
    this.input.onUnlock = () => this._onPointerUnlock();
    // after a focus steal while the map was held, the next click on the game takes the mouse back (no pause detour)
    this.R.renderer.domElement.addEventListener('mousedown', () => {
      if (this._relock && G.mode === 'match' && this.match && !this.match.paused && !this.menus?.current) { this._relock = false; this.input.requestLock(); }
    });

    // modules built by other authors
    const [charMod, fxMod, envMod, audioMod, musicMod] = await Promise.all([
      loadModule('./game/character.js', true), loadModule('./fx/fx.js', true), loadModule('./world/environment.js', true),
      loadModule('./audio/audio.js', true), loadModule('./audio/music.js', true),
    ]);
    this.CharacterClass = charMod.Character;
    try { this.PropKit = (await import('./world/props.js')).PropKit; } catch (e) { console.error('[inkwave] prop kit failed to load', e); this.PropKit = null; }
    G.audio = audioMod.audio; G.music = musicMod.music;
    await progress(0.15, 'Building the plaza…');

    // world
    // (old ?map=sunset links = Tidewater at dusk)
    const pm = params.get('map') === 'sunset' ? 'tidewater' : params.get('map');
    let map = MAPS.find((m) => m.id === pm) || MAPS[0];
    if (!mapOfflineOk(map.id) && !DEV_STAGE) { console.info(`[inkwave] ${map.name} is online only — booting ${OFFLINE_MAPS[0].name}`); map = OFFLINE_MAPS[0]; }
    this.time = params.get('time') === 'dusk' || params.get('map') === 'sunset' ? 'dusk' : (this.settings.timeOfDay === 'dusk' ? 'dusk' : 'day');
    this.theme = mapTheme(map, this.time);
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.murals = await createMuralTexture();
    if (this.gpuTier === 'legacy') {
      // compatibility mode / proven-broken stack: the procedural material path — don't pay for a
      // texlib build we would immediately throw away
      this.texlib = null;
      Log.info('gpu', 'skipping texture library (legacy render path)');
    } else {
      try {
        const { createTextureLibrary } = await import('./world/texlib.js');
        // linearAlbedo: the self-test proved the driver mishandles sRGB array attachments — build the
        // albedo layer linear instead (the sampler then returns the same linear values through a path
        // the driver demonstrably gets right; no shader-side decode needed, encode/decode cancel)
        this.texlib = await createTextureLibrary(G.renderer, { size: q.paintAtlas >= 4096 ? 512 : 256, linearAlbedo: this.gpuTier === 'linearAlbedo' });
      } catch (e) { console.error('[inkwave] texture library failed — procedural fallback', e); this.texlib = null; }
    }
    await this._buildWorld(map);
    this.zoneMarks = new ZoneMarks(scene);   // Zone Control ground markings: build / clear themselves on 'match:state'
    await progress(0.4, 'Filling the harbor…');
    const B = G.level.bounds;
    G.env = new envMod.Environment(G.renderer, scene, { bounds: B, theme: this.theme, shadowSize: q.shadowSize, footprint: this._footprint(G.level) });
    if (G.env.envMap) scene.environment = G.env.envMap;
    // sky-fill balance (scene.environmentIntensity, hemisphere) + per-theme exposure are the environment theme's job
    // (Environment.setTheme), so a stage/time looks the same booted into or switched to mid-session
    G.renderer.toneMappingExposure = 0.94;
    await progress(0.55, 'Teaching squids to swim…');
    G.projectiles = new Projectiles(scene);
    G.subs = new SubSystem(scene);
    G.specials = new SpecialSystem(scene);
    G.fx = new fxMod.FX(scene, { quality: q });
    G.fx.setLighting?.(G.env.getSkyColors?.());
    this._applyNight();
    G.fx.setCollider?.((from, to) => { const h = G.physics.segment(from, to, this._fxHit || (this._fxHit = new Hit()), true); return h.hit ? { point: h.point, normal: h.normal } : null; });
    G.fx.onDropletLand = (point, normal, color, size) => {
      if (G.netm) return;   // online: turf only comes from replicated splats, never from local-only cosmetic droplets
      const team = this._teamOfColor(color);
      if (team < 0) return;
      G.paint.splat(this._tmpV.copy(point).addScaledVector(normal, 0.05), clamp(size * 2.4, 0.12, 0.45), team, { seed: Math.random(), noZoneClaim: true });   // unattributed droplets claim turf but credit no actor
    };
    this._tmpV = new THREE.Vector3(); this._tmpC = new THREE.Color();
    this.rig = new CameraRig(camera);
    G.post = this.R; G.game = this; G.rig = this.rig;
    // optional modules owned by the VFX / screen-FX work streams (absent = skipped)
    try { const m = await import('./fx/fxHooks.js'); this.fxHooks = m.initFxHooks?.(G) || null; } catch (e) { if (!/Failed to fetch|Cannot find module|404/i.test(String(e))) console.error('[inkwave] fxHooks', e); }
    try { const m = await import('./fx/screenfx.js'); this.screenfx = m.ScreenFX ? new m.ScreenFX(this.R, G) : null; } catch (e) { if (!/Failed to fetch|Cannot find module|404/i.test(String(e))) console.error('[inkwave] screenfx', e); }
    this.showcase = new Showcase(G.renderer, this.CharacterClass);
    // online session (G.net) — the menus' online screens and startNetMatch/netMatchGo/netMatchEnd below drive it
    try { (await import('./net/session.js')).installNet(); } catch (e) { console.error('[inkwave] net', e); }
    G.net?.on?.('lobby', ({ lobby }) => this._roomPalette(lobby));
    await progress(0.7, 'Tuning the tentacles…');

    this._setPalette(this._pickPalette());
    this._bindEvents();
    this._startAttract();
    // warm up: compile every shader now so the first shot/splat never hitches
    await progress(0.85, 'Warming up…');
    this._warmup();
    // compile in parallel (KHR_parallel_shader_compile) so the loading screen keeps animating instead of freezing
    try { await G.renderer.compileAsync(scene, camera); } catch { G.renderer.compile(scene, camera); }
    for (const m of this._warmMeshes || []) { G.scene.remove(m); }
    this._warmMeshes?.[0]?.geometry.dispose(); this._warmMeshes = null;
    await progress(0.93, 'Warming up…');
    for (let i = 0; i < 3; i++) { this._frame(1 / 60); await nextFrame(); }
    await progress(1, 'Ready!');
    await new Promise((r) => setTimeout(r, 250));

    this.timer = new THREE.Timer(); this.timer.connect?.(document);
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    G.mode = 'menu';
    this.menus?.show(params.has('skipTitle') ? 'main' : 'title');
    // the online hub / lobby set loads in the background once the menus are idle (no arena flash on the first visit)
    if (!params.has('autostart')) setTimeout(() => { if (G.mode === 'menu') this.showcase.preloadLobby?.(); }, 2500);
    // Settings → Optimize → Pre-warm on the menu. There is no asset cache in the game (everything is procedural),
    // so what "pre-warm" honestly means is: run the SAME shader compilation the match start runs, while the player
    // is sitting in a menu instead of during a countdown. It is the existing machinery — Character.warmAll and the
    // showcase warm-up — just moved earlier, so nothing new can break.
    if (this.settings.prewarm) setTimeout(() => this._idlePrewarm(), 3000);
    this._applyAudioVolumes();
    requestAnimationFrame((t) => this._loop(t));
    if (params.has('autostart')) {
      const pm = params.get('mode');
      this.api.startMatch({ mapId: map.id, difficulty: params.get('difficulty') || this.settings.difficulty, duration: +params.get('autostart') || undefined, mode: pm === 'boss' || pm === 'zones' ? pm : 'turf' });
    }
    this.bootMs = Math.round(performance.now() - t0);
    Perf.init();
    Log.info('boot', `ready in ${(this.bootMs / 1000).toFixed(1)}s · quality ${this.settings.quality}${this.isTouch ? ' · touch' : ''}`);
    Log.debug('boot', this.R.capsLine);   // what this driver reports, so a graphics bug report carries the reason
    Log.debug('boot', this.bootMarks.map(([l, t]) => `${l} @${t}ms`).join(' · '));
    window.__inkwave = this; // debug/audit hook
    window.__inkwave.perf = Perf; // work-plan §2 baseline: frame percentiles + spot timings
    window.__G = G;
    this.debug = {
      endMatch: (t = 0.5) => { if (this.match && !this.match.attract) this.match.time = t; },
      paintRandom: (n = 400) => { const v = new THREE.Vector3(); for (let i = 0; i < n; i++) { v.set((Math.random() - 0.5) * 48, 0.4, (Math.random() - 0.5) * 86); G.paint.splat(v, 0.8 + Math.random() * 1.4, Math.random() < 0.5 ? 0 : 1, { noZoneClaim: true }); } },
      // deterministic stepping for audits: freeze(), then step(ms) advances the sim at a fixed 60 Hz and renders once
      freeze: () => { this.frozen = true; },
      unfreeze: () => { this.frozen = false; this.timer.update(this._lastTs); },
      step: (ms = 16.7) => {
        const n = Math.max(1, Math.round(ms / (1000 / 60)));
        this._skipRender = true;
        for (let i = 0; i < n - 1; i++) this._frame(1 / 60);
        this._skipRender = false;
        this._frame(1 / 60);
      },
      key: (code, down) => { if (down) { this.input.keys.add(code); this.input.pressed.add(code); } else this.input.keys.delete(code); },
      fire: (on) => { this.input.mouse.left = on; },
      freezeBots: () => { for (const a of G.actors) if (a.bot && !a.isLocal) a.bot.update = () => { a.intent.move.set(0, 0, 0); a.intent.fire = false; }; },
    };
  }

  // Decide the render tier once per session, before the first texlib build. Order of authority:
  //   1. settings.gpuMode === 'legacy'  → compatibility mode (manual)
  //   2. settings.gpuMode === 'auto'    → the self-test verdict maps to a tier
  //   3. settings.gpuTier set           → a previously computed tier (cache; no re-test every boot)
  // Anything the tests DID prove broken falls back: sRGB-only → linear albedo attachment; array/MRT
  // problems → the pre-texlib procedural material path (texlib = null → USE_TEXLIB off), which renders
  // correctly on every driver.
  _resolveGpuTier() {
    if (this._gpuTierResolved) return;
    this._gpuTierResolved = true;
    if (this.settings.gpuMode === 'legacy') { this.gpuTier = 'legacy'; }
    else if (this.settings.gpuTier && this.settings.gpuSig === (this.gpuTest?.signature?.() ?? '')) {
      // cached verdict — but only while the GPU/browser signature is unchanged (driver update,
      // different machine, browser switch all invalidate it)
      this.gpuTier = this.settings.gpuTier;
    }
    else {
      const v = this.gpuTest?.run();
      if (v) {
        Log.info('gpu', v.info || '');
        Log.info('gpu', describeVerdict(v));
        this.gpuTier = verdictToTier(v, false);
        // only a VALID verdict may be cached: a setup error (broken test, lost context) is not
        // evidence about the GPU and must re-run next boot (E-011)
        if (this.gpuTier) { this.settings.gpuTier = this.gpuTier; this.settings.gpuSig = this.gpuTest.signature(); }
        saveJSON('inkwave.settings', this.settings);
      }
    }
    if (this.gpuTier && this.gpuTier !== 'full') Log.info('gpu', `render tier: ${this.gpuTier} (compatibility fallback)`);
  }

  // Build (or rebuild) everything that depends on the stage layout: level, collision, paint atlas, surface material,
  // decor, navigation graph and minimap. Environment/FX/projectiles persist across stages.
  // mode: 'turf' | 'zones' — a stage with Zone Control-only pieces (variants.js) builds a separate world for that mode
  async _buildWorld(map, mode = 'turf') {
    const scene = G.scene;
    const layoutId = map.layout || map.id;
    const worldKey = variantKey(layoutId, MAP_LAYOUTS[layoutId], dressingFor(layoutId), mode);
    if (this.worldKey === worldKey) { this.mapDef = map; return; }
    // the rebuild awaits (lightmap fetch) between swapping G.level and G.paint: hold the simulation until every
    // stage-dependent system matches, or a frame in between raycasts the new level and samples the old paint atlas
    this._building = true;
    try { await this._buildWorldNow(map, scene, layoutId, mode, worldKey); } finally { this._building = false; }
  }
  async _buildWorldNow(map, scene, layoutId, mode = 'turf', worldKey = layoutId) {
    this.zoneMarks?.clear();   // zone markings belong to the old stage's faces
    if (this.levelMesh) { scene.remove(this.levelMesh, this.grateMesh); this.levelMesh.geometry.dispose(); this.grateMesh?.geometry.dispose(); this.levelMat.dispose(); this.grateMat?.dispose(); }
    if (this.decor) { scene.remove(this.decor.group); }
    if (this.props) { this.props.dispose?.(); this.props = null; }
    G.paint?.dispose();
    this.layoutId = layoutId; this.worldKey = worldKey;
    this.mapDef = map;
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    const step = Log.steps('build');   // per-chunk timings: this build is <1 s on a desktop and can take tens of seconds on a phone — the log names the slow chunk
    // the render tier is decided once per session (boot, before the first texlib is built) — see _resolveGpuTier
    this._resolveGpuTier();
    if (this.gpuTier === 'legacy') this.texlib = null;   // manual compatibility mode / proven-broken stack
    // set dressing first: solid props hand back collision boxes that become part of the level (physics, nav, paint)
    const colliders = [];
    if (this.PropKit) {
      try {
        this.props = new this.PropKit(scene, { castShadow: true, quality: this.settings.quality });
        for (const it of dressingFor(layoutId)) {
          if (!inMode(it, mode)) continue;
          const r = this.props.add(it.type, it);
          if (r && r.colliders) colliders.push(...r.colliders);
        }
        this.props.build();
      } catch (e) { console.error('[inkwave] props failed', e); this.props = null; }
    }
    step('props');
    await nextFrame();   // the loading overlay can only repaint between chunks — one unbroken synchronous build is what freezes it (and reads as "the map won't load" on a phone)
    const level = (G.level = new Level(layoutFor(MAP_LAYOUTS[layoutId], mode), colliders));
    G.physics = new Physics(level);
    step('level');
    const lightmap = await this._loadLightmap(level, worldKey);
    G.paint = new PaintSystem(G.renderer, level, { atlasSize: q.paintAtlas, maxDensity: q.paintAtlas >= 4096 ? 30 : 18 });
    this.murals.userData.setStage?.(layoutId);   // stage decals (murals.js) before the material reads the table
    this.levelMat = createLevelMaterial(G.paint.texture, G.paint.size, this.murals, { lightmap, texlib: this.texlib });
    (this.swimWake || (this.swimWake = new SwimWake())).reset();
    this.levelMesh = new THREE.Mesh(level.buildGeometry(G.paint.size), this.levelMat);
    this.levelMesh.castShadow = true; this.levelMesh.receiveShadow = true;
    this.levelMesh.name = 'level';
    scene.add(this.levelMesh);
    // grates: same surface shader, cut-out holes, no ink (they cast no shadow; the mesh is too fine for the shadow map)
    this.grateMat = createLevelMaterial(G.paint.texture, G.paint.size, this.murals, { grate: true, lightmap, texlib: this.texlib });
    const gg = level.buildGeometry(G.paint.size, (b) => b.grate);
    this.grateMesh = new THREE.Mesh(gg, this.grateMat);
    this.grateMesh.receiveShadow = true; this.grateMesh.visible = gg.index.count > 0;
    scene.add(this.grateMesh);
    step('paint');
    await nextFrame();
    this.decor = new Decor(scene, level);
    G.nav = new NavGraph(level, G.physics);
    this.minimap = new Minimap(level, G.paint);
    step('nav');
    await nextFrame();
    if (G.env?.rebuildForArena) G.env.rebuildForArena(level.bounds, this._footprint(level));
    else if (G.env?.setFootprint) G.env.setFootprint(this._footprint(level));
    // precompile the new stage's shaders behind the loading screen (the same call the boot path makes): without it,
    // every level/grate/prop/decor program compiles on the first rendered frames of the intro fly-over — the
    // transition stutter on fast GPUs, and a silent extra wait on phones
    try { await G.renderer.compileAsync(scene, G.camera); } catch { G.renderer.compile(scene, G.camera); }
    step('shaders');
    if (G.teamColors[0]) this._setPalette(this.palette || this._pickPalette());
  }

  // Baked AO (tools/bake-ao.mjs). Applied only when the bake matches this exact layout.
  async _loadLightmap(level, layoutId) {
    try {
      const meta = await (await fetch(`assets/lightmaps/${layoutId}.json`, { cache: 'no-cache' })).json();
      level.layoutLightmap(meta.ppm, meta.size);
      if (level.layoutHash !== meta.hash) { console.warn(`[inkwave] lightmap for ${layoutId} is stale — re-run tools/bake-ao.mjs`); level.lightSize = 0; for (const f of level.faces) f.light = null; return null; }
      const tex = await new THREE.TextureLoader().loadAsync(`assets/lightmaps/${layoutId}.png?h=${meta.hash}`);
      tex.colorSpace = THREE.NoColorSpace;
      tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      return tex;
    } catch (e) {
      console.warn('[inkwave] no lightmap for', layoutId, e.message);
      for (const f of level.faces) f.light = null;
      return null;
    }
  }

  // deck slabs (top at deck level, bottom in the sea) for the environment: axis-aligned boxes and boxes turned about Y
  // (obox) as oriented rects — centre (cx, cz), half extents (hx, hz), local x axis (ax, az) — plus their XZ AABB
  _footprint(level) {
    return level.blocks.filter((b) => (b.aligned || Math.abs(b.axes[1].y) > 0.9999) && b.aabbMax.y < 0.01 && b.aabbMax.y > -2.5 && b.aabbMin.y < -1)
      .map((b) => ({ minX: b.aabbMin.x, maxX: b.aabbMax.x, minZ: b.aabbMin.z, maxZ: b.aabbMax.z,
        ...(b.aligned ? {} : { cx: b.center.x, cz: b.center.z, hx: b.half.x, hz: b.half.z, ax: b.axes[0].x, az: b.axes[0].z }) }));
  }

  _warmup() {
    // trigger one of each effect off-screen so shaders + pools exist
    const p = new THREE.Vector3(0, -30, 0), n = new THREE.Vector3(0, 1, 0);
    const c = G.teamColors[0];
    try {
      G.fx.burst(p, n, c, { count: 4 }); G.fx.ring(p, n, c, {}); G.fx.explosion(p, c, 2); G.fx.splatted(p, c);
      G.fx.wake(p, n, c, 5); G.fx.muzzle(p, n, c); G.fx.spawnFlash(p, c);
    } catch (e) { console.warn('fx warmup', e); }
    // materials made lazily on first use (a thrown bomb's) get an off-screen stand-in so the boot compile covers them
    try {
      const g = new THREE.SphereGeometry(0.1, 8, 6);
      this._warmMeshes = [0, 1].map((t) => { const m = new THREE.Mesh(g, G.projectiles._bombMat(t)); m.position.copy(p); m.castShadow = true; G.scene.add(m); return m; });
    } catch (e) { console.warn('bomb warmup', e); }
  }

  // ---------------------------------------------------------------------------------------- palette
  // the room's colours while you're in one (so the lobby line-up and the match agree on every screen)
  _pickPalette() {
    if (this.settings.colorblind) return COLORBLIND_PALETTE;
    const room = G.net && G.net.state !== 'offline' && G.net.state !== 'error' && TEAM_PALETTES[G.net.lobby?.palette];
    if (room) return room;
    const p = TEAM_PALETTES[(Math.random() * TEAM_PALETTES.length) | 0];
    return p;
  }
  paletteIndex() { const i = TEAM_PALETTES.indexOf(this.palette); return i >= 0 ? i : (Math.random() * TEAM_PALETTES.length) | 0; }
  _roomPalette(l) {
    if (this.settings.colorblind || G.mode === 'match' || !l) return;
    const p = TEAM_PALETTES[l.palette];
    if (p && p !== this.palette) this._setPalette(p);
  }
  _setPalette(p) {
    this.palette = p;
    G.teamHex = [p.a, p.b];
    G.teamColors = [new THREE.Color(p.a), new THREE.Color(p.b)];
    this.levelMat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]);
    this.levelMat.userData.uniforms.uTeamB.value.copy(G.teamColors[1]);
    if (this.grateMat) { this.grateMat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]); this.grateMat.userData.uniforms.uTeamB.value.copy(G.teamColors[1]); }
    // warm/low light mutes saturated ink: give it more self-glow at dusk so team colours stay the loudest thing on screen
    // ink self-light: more at dusk, a touch more in golden hour's long shadows
    this.levelMat.userData.uniforms.uInkGlow.value = { sunset: 0.2, golden: 0.1 }[this.theme] ?? 0.07;
    this.decor.setTeamColors(G.teamColors);
    this.props?.setTeamColors?.(G.teamColors[0], G.teamColors[1]);
    G.projectiles.refreshColors();
    for (const a of G.actors) a.character.setColor(G.teamColors[a.team]);
    this.minimap.version = -1;
    this.menus?.setAccent?.(p.a, p.b);
  }
  _teamOfColor(color) {
    const c = color.isColor ? color : this._tmpC.set(color);
    for (let t = 0; t < 2; t++) { const k = G.teamColors[t]; if (Math.abs(k.r - c.r) + Math.abs(k.g - c.g) + Math.abs(k.b - c.b) < 0.05) return t; }
    return -1;
  }

  // ---------------------------------------------------------------------------------------- menus api
  // The single place a profile is persisted. Writes the account store (so a switch/switch-back keeps each profile
  // separate) and keeps the legacy 'inkwave.profile' key in step, so a build without the store still finds a
  // usable profile rather than starting over.
  _saveProfile() {
    const a = activeAccount(this.accounts, this.accountId);
    if (a) a.profile = this.profile;
    saveAccounts(this.accounts, this.accountId);
  }

  // Local profiles (browser storage only — nothing is uploaded). Used by Settings → Optimize → Local profile.
  _profileList() {
    return (this.accounts || []).map((a) => ({ id: a.id, name: a.name, active: a.id === this.accountId, created: a.created }));
  }
  _profileCreate(name) {
    const r = createAccount(this.accounts, this.accountId, name);
    this.accounts = r.accounts; this.accountId = r.activeId; this.profile = r.account.profile;
    this._saveProfile();
    this._applyProfileToSession();
    return this._profileList();
  }
  _profileSwitch(id) {
    const a = (this.accounts || []).find((x) => x.id === id);
    if (!a) return this._profileList();
    this.accountId = id; this.profile = a.profile;
    this._saveProfile();
    this._applyProfileToSession();
    return this._profileList();
  }
  _profileRename(id, name) { renameAccount(this.accounts, id, name); this._saveProfile(); return this._profileList(); }
  _profileDelete(id) {
    const r = deleteAccount(this.accounts, this.accountId, id);
    if (r.refused) return { list: this._profileList(), refused: true };
    this.accounts = r.accounts; this.accountId = r.activeId;
    this.profile = activeAccount(this.accounts, this.accountId).profile;
    this._saveProfile();
    this._applyProfileToSession();
    return { list: this._profileList(), refused: false };
  }
  // a different profile can carry a different weapon and look: put it in the player's hands and on the podium
  _applyProfileToSession() {
    if (WEAPON_SUCCESSOR[this.profile.weapon]) this.profile.weapon = WEAPON_SUCCESSOR[this.profile.weapon];
    const m = this.match;
    if (m?.local) { m.local.weaponId = this.profile.weapon; m.local.subId = this._subFor(this.profile.weapon); m.local.specialId = this._specialFor(this.profile.weapon); m.local.character.setWeapon?.(this.profile.weapon); }
    if (this.menus?.current === 'loadout') this.showcase?.showLoadout(this.profile.weapon, G.teamColors[0], this.profile.style);
  }

  _menuApi() {
    const self = this;
    const api = (this.api = {
      version: VERSION,
      weapons: WEAPONS, weaponOrder: WEAPON_ORDER, specials: SPECIALS, specialOrder: SPECIAL_ORDER, sub: SUB.bomb, subs: SUBS, subOrder: SUB_ORDER, maps: MAPS, difficulties: DIFFICULTY,
      getSettings: () => ({ ...self.settings }),
      setSettings: (partial) => self._setSettings(partial),
      getProfile: () => {
        const p = self.profile;
        return { ...p, played: p.matches, xpToNext: PROGRESSION.xpForLevel(p.level) };
      },
      setProfileName: (n) => { self.profile.name = String(n || 'Player').slice(0, 16); self._saveProfile(); },
      // locker look ({ hair, skin, outfit, eyes, hat, brows, … } — indices into character-style.js tables)
      setProfileStyle: (st) => { self.profile.style = { ...(st || {}) }; self._saveProfile(); },
      getLoadout: () => ({ weapon: self.profile.weapon || 'shooter', sub: self._subFor(self.profile.weapon), special: self._specialFor(self.profile.weapon) }),
      setLoadout: ({ weapon, sub, special }) => {
        if (weapon !== undefined) {
          if (!WEAPONS[weapon]) return;
          self.profile.weapon = weapon;
        }
        if (sub !== undefined) self.profile.sub = SUBS[sub] ? sub : null;
        if (special !== undefined) self.profile.special = SPECIALS[special] ? special : null;
        self._saveProfile();
        if (self.menus?.current === 'loadout' && weapon !== undefined) self.showcase.showLoadout(weapon, G.teamColors[0], self.profile.style);
        self._applyPracticeLoadout();   // in practice the new kit is in your hands straight away
      },
      startMatch: (o) => self.startMatch(o),
      // practice: solo on a random stage (no enemies, no clock); the loadout can be changed mid-session
      startPractice: (o) => self.startPractice(o),
      isPractice: () => self._inPractice(),
      practiceInfo: () => (self._inPractice() ? { map: self.mapDef.name, weapon: self.match.local?.weaponId, sub: self.match.local?.subId, special: self.match.local?.specialId } : null),
      practiceReset: () => self.practiceReset(),
      practiceNewStage: () => self.startPractice(),
      quitPractice: () => self.quitToMenu('loadout'),
      resumeMatch: () => self.resume(),
      // online results: the host can take the room back to the lobby without waiting out the timer
      netBackToLobby: () => { if (G.netm && G.net?.isHost && self.match?.state === 'results') { clearTimeout(self._netEndT); G.netm.sendEnd(); self.netMatchEnd(); } },
      // Settings → Optimize → Graphics compatibility: run the self-test on demand and report per-test
      // results. Applies the recommended tier automatically unless the user forced a mode.
      gpuCheck: () => {
        const v = this.gpuTest?.run();
        if (!v) return { ran: false, error: 'self-test unavailable' };
        Log.info('gpu', v.info || '');
        Log.info('gpu', describeVerdict(v));
        if (v.error) Log.error('gpu', v.error);
        const tier = verdictToTier(v, this.settings.gpuMode === 'legacy');
        this.gpuTier = tier;
        this.settings.gpuTier = tier;
        saveJSON('inkwave.settings', this.settings);
        // a tier change needs a world rebuild to take effect: the menu flow prompts a reload,
        // _applyRenderTier picks it up on the next _buildWorldNow either way
        return { ran: true, verdict: v, tier, describe: describeVerdict(v) };
      },
      quitMatch: () => self.quitToMenu(),
      // touch-layout editor (Settings → Touch layout): the menus own the record, the live layer re-applies it so the
      // buttons move under the finger while you drag them
      getTouchLayout: () => loadLayout(),
      setTouchLayout: (rec) => { const norm = saveLayout(rec); self.touch?.applyLayout(norm); return norm; },
      touchOrientation: () => activeOrientation(),
      rematch: () => self.startMatch(self.lastMatchOpts || {}),
      toMainMenu: () => self.quitToMenu(),
      onScreenChange: (s) => self._onScreen(s),
      // local profiles (Settings → Optimize → Local profile). Browser storage only: no account server, no upload.
      getProfiles: () => self._profileList(),
      createProfile: (n) => self._profileCreate(n),
      switchProfile: (id) => self._profileSwitch(id),
      renameProfile: (id, n) => self._profileRename(id, n),
      deleteProfile: (id) => self._profileDelete(id),
      playSound: (n) => { G.audio?.init?.(); G.audio?.play(n); },
    });
    return api;
  }

  // the loadout's sub: the one picked in the loadout, else the weapon's own default
  _subFor(weapon) { return (SUBS[this.profile.sub] && this.profile.sub) || (WEAPONS[weapon || 'shooter'] || WEAPONS.shooter).sub || 'bomb'; }
  // the loadout's special: the one picked in the loadout, else the weapon's own
  _specialFor(weapon) { return (SPECIALS[this.profile.special] && this.profile.special) || (WEAPONS[weapon || 'shooter'] || WEAPONS.shooter).special || 'slam'; }

  _setSettings(partial) {
    Object.assign(this.settings, partial);
    saveJSON('inkwave.settings', this.settings);
    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);
    if ('fullscreen' in partial) {
      if (window.inkwaveNative) window.inkwaveNative.setFullScreen(!!partial.fullscreen);
      else if (document.documentElement?.requestFullscreen) {
        // browser path (touch devices asked for fullscreen): the gesture came from the menu click,
        // so the request is user-activated and allowed
        if (partial.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { /* denied — stay windowed */ });
        else if (!partial.fullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => { /* already out */ });
      }
    }
    if ('master' in partial || 'music' in partial || 'sfx' in partial) this._applyAudioVolumes();
    if ('colorblind' in partial && G.mode !== 'match') this._setPalette(this._pickPalette());
    // turning pre-warm on while sitting in the menus should take effect now, not at the next match start
    if ('prewarm' in partial && partial.prewarm && G.mode === 'menu') { this._prewarmed = false; this._idlePrewarm(); }
  }
  _applyAudioVolumes() { G.audio?.setVolumes?.({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx }); }

  // The gameplay HUD is wanted only while the round is actually being played. Single authority for every caller:
  // the match:state edges, and the loadout-over-live-match tuck in _onScreen (which must not resurrect a HUD that the
  // intro or the judge deliberately hid).
  _gameplayHudWanted() {
    const m = this.match;
    return !!(m && !m.attract && !m.paused && m.state === 'playing');
  }

  _onScreen(s) {
    // the loadout opened mid-practice sits over the live stage: tuck the HUD away while it's up
    if (G.mode === 'match' && this.hud) {
      const hide = s === 'loadout';
      if (hide !== !!this._hudTucked) { this._hudTucked = hide; this.hud.setVisible(!hide && this._gameplayHudWanted()); }
    } else this._hudTucked = false;
    if (!this.showcase) return;
    if (s === 'loadout') this.showcase.showLoadout(this.profile.weapon || 'shooter', G.teamColors[0], this.profile.style);
    else if (s !== 'results') { if (this.showcase.mode === 'loadout') this.showcase.hide(); }
    if (G.mode === 'menu') {
      if (s === 'title' || s === 'main' || s === 'setup' || s === 'settings' || s === 'howto' || s === 'credits' || s === 'loadout' || s === 'locker' || s === 'online' || s === 'lobby') {
        if (this._musicTrack !== (s === 'title' ? 'title' : 'menu')) this._playMusic(s === 'title' ? 'title' : 'menu');
      }
    }
  }
  _playMusic(t) {
    this._musicTrack = t;
    try {
      G.music?.play(t, { fade: 1.2 });
      // asking for the track that's already current is a no-op — if it was left paused, un-pause it (unless we're paused)
      if (t && !this.match?.paused) G.music?.resume?.();
    } catch (e) { /* not initialised yet */ }
  }

  // ---------------------------------------------------------------------------------------- input routing
  _onKey(e, repeat) {
    // first gesture unlocks audio
    if (!this._audioOn) { this._audioOn = true; G.audio?.init?.(); this._applyAudioVolumes(); this._playMusic(this.menus?.current === 'title' || !this.menus ? 'title' : 'menu'); }
    if (G.mode === 'match' && this.match && !this.match.paused && !this.menus?.current) {
      if (e.code === 'Escape' || e.code === 'KeyP') { this.pause(); return true; }
      if (e.code === 'KeyL' && this.match.practice && !repeat) { this.openPracticeLoadout(); return true; }
      return false;
    }
    if (this.menus && this.menus.current) return this.menus.handleKey(e) || false;
    return false;
  }
  _onPointerUnlock() {
    // only a live round pauses on focus loss; intro / time's up / judge / results release the mouse on purpose.
    // Holding the map is never a reason to pause (some browsers/embeds steal focus on TAB): relock on the next click.
    if (this.match?.controller?.mapHeld || (this.rig?.mapK ?? 0) > 0) { this._relock = true; return; }
    if (G.mode === 'match' && this.match && !this.match.paused && this.match.state === 'playing' && !this.menus?.current) this.pause();
  }
  // the touch layer's pause button (phones have no Esc / Start key)
  _touchPause() {
    if (this.match?.paused) this.resume();
    else this.pause();
  }
  // pull the fog back while the view is overhead (the stage is ~150 m away up there), restore it exactly after
  _dioFog() {
    const f = G.scene?.fog, k = this.rig.mapK;
    if (!f || !f.isFog) return;
    if (k > 0) {
      if (!this._fog0) this._fog0 = { near: f.near, far: f.far };
      const e = k * k * (3 - 2 * k);
      f.near = this._fog0.near + 190 * e; f.far = this._fog0.far + 600 * e;
    } else if (this._fog0) { f.near = this._fog0.near; f.far = this._fog0.far; this._fog0 = null; }
  }


  // ---------------------------------------------------------------------------------------- events → HUD/audio
  _bindEvents() {
    const self = this;
    let lastHitSnd = 0, lastHurtSnd = 0;
    on('hit', ({ attacker, victim, damage, killed }) => {
      if (!this.match || this.match.attract) return;
      if (attacker?.isLocal) {
        this.hud?.hitMarker(killed ? 'kill' : 'hit');
        if (G.time - lastHitSnd > 0.06) { lastHitSnd = G.time; G.audio?.play('hit_marker', { volume: 0.6 }); }
      }
    });
    on('damage', ({ victim, amount, attacker, source }) => {
      if (!this.match || this.match.attract || !victim.isLocal) return;
      let ang = null;
      if (attacker && attacker !== victim) {
        const v = this._dmgV || (this._dmgV = new THREE.Vector3());
        v.copy(attacker.pos); v.y += 1; v.project(G.camera);
        let dx = v.x, dy = -v.y;
        const behind = v.z > 1;
        if (behind) { dx = -dx; dy = -dy; }
        if (!behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) ang = dx >= 0 ? 0 : Math.PI;   // attacker on screen: ink the nearer side edge, never over them
        else ang = Math.atan2(dy * innerHeight, dx * innerWidth);
      }
      this.hud?.damage(clamp(amount / 80, 0.15, 1), G.teamHex[victim.enemyTeam], ang);
      if (G.time - lastHurtSnd > 0.25) { lastHurtSnd = G.time; G.audio?.play('hurt', { volume: 0.7 }); }
      if (amount >= 40) this.rig.addShake(clamp((amount - 30) / 220, 0, 0.4));   // only heavy hits move the camera; chip damage reads through the HUD
    });
    // a squid dropping back into its own ink (dolphin-jump re-entry, hopping in from dry ground) gets a wet plunge;
    // transform dives already play squid_in
    const formT = new WeakMap();
    on('actor:form', ({ actor }) => formT.set(actor, G.time));
    on('actor:dive', ({ actor, speed }) => {
      if (!actor || !this.match || this.match.attract || G.time - (formT.get(actor) ?? -9) < 0.2) return;
      if (actor.isLocal || actor._nearCamera?.()) G.audio?.play('swim_splash', { pos: actor.isLocal ? undefined : actor.pos, volume: (actor.isLocal ? 0.5 : 0.32) * Math.min(1, 0.55 + (speed || 0) / 16) });
    });
    // online, humans-only stage: a player who left is gone from the match (Match.removeActor) — say so in the feed
    on('actor:removed', ({ actor }) => { if (this.match && !this.match.attract) this.hud?.feed({ text: `${actor.name} left the match`, color: G.teamHex[actor.team], kind: 'info' }); });
    on('splatted', ({ victim, attacker, cause }) => {
      if (!this.match || this.match.attract) return;
      this._addDeathMark(victim);
      const local = this.match.local;
      if (attacker?.isLocal) {
        G.audio?.play('splat_enemy', { volume: 0.9 });
        this.hud?.feed({ text: `You splatted ${victim.name}!`, color: G.teamHex[local.team], kind: 'kill' });
      } else if (victim.isLocal) {
        G.audio?.play('splatted_self');
        G.audio?.duck?.(0.45, 2.2);
        // the card shows what did it (hud.js splatCause): the attacker's main weapon, or the sub / special / the sea
        const by = attacker ? attacker.name : cause === 'water' ? null : 'enemy ink';
        this.hud?.showSplatted({ by, byColor: attacker ? G.teamHex[attacker.team] : '#6fd0ff', respawn: PLAYER.respawnTime, attacker: attacker || null, cause });
        this.rig.mode = 'spectate';
        this.rig.spectate = { actor: attacker && attacker.alive ? attacker : null, pos: victim.pos.clone(), from: victim.pos.clone() };
        this.rig.lookAt.copy(victim.pos);
      } else if (victim.team === local?.team) {
        G.audio?.play('ally_splatted', { volume: 0.5 });
        this.hud?.feed({ text: `${victim.name} was splatted${attacker ? ' by ' + attacker.name : ''}`, color: G.teamHex[victim.enemyTeam], kind: 'death' });
      } else if (attacker && attacker.team === local?.team) {
        this.hud?.feed({ text: `${attacker.name} splatted ${victim.name}`, color: G.teamHex[attacker.team], kind: 'ally' });
      }
    });
    on('respawn', ({ actor }) => {
      if (!this.match || this.match.attract) return;
      if (actor.isLocal) {
        this.hud?.hideSplatted(); this.rig.follow(actor, true); this.rig.yaw = actor.yaw; this.rig.pitch = -0.12;
        // a Super Jump planned on the TAB map while splatted launches now (normal charge + flight)
        this.match.controller?.launchQueuedJump?.();
      }
    });
    on('special:ready', ({ actor }) => {
      if (actor.isLocal && !this.match?.attract) { G.audio?.play('special_ready'); }
    });
    on('special:use', ({ actor, id }) => {
      if (actor.isLocal && !this.match?.attract) this.hud?.banner('special', SPECIALS[id].name.toUpperCase() + '!');
    });
    on('shake', ({ amount, pos }) => { if (!this.match?.attract) this.rig.addShake(amount, pos); });
    on('recoil', ({ amount }) => { if (!this.match?.attract) this.rig.recoil(amount); });
    on('lowink', ({ actor }) => { if (actor.isLocal) this._lowInkFlash = 1.2; });
    // footsteps (character animation → 'actor:footstep'): surface-aware, only for actors near the camera
    on('actor:footstep', ({ actor, surface, pos, speed }) => {
      if (!actor || !actor.alive || actor.form === 'squid') return;
      const p = pos || actor.pos;
      if (!actor.isLocal && G.camera.position.distanceToSquared(p) > 18 * 18) return;
      const name = surface === 1 ? 'step_ink' : surface === 2 ? 'step_enemy' : 'step_dry';
      const vol = (actor.isLocal ? 0.7 : 0.45) * Math.min(1, 0.45 + (speed || actor.anim.speed || 0) / 8);
      G.audio?.play(name, { pos: actor.isLocal ? undefined : p, volume: vol });
    });
    on('match:oneminute', () => { this.hud?.banner('one_minute'); G.audio?.play('one_minute'); if (this.match?.mode !== 'boss') this._playMusic('battle_final'); });
    on('match:count', ({ n }) => { this.hud?.countdown(n); G.audio?.play('final_count'); });
    on('match:state', ({ state, match }) => {
      if (match.attract || match !== this.match) return;
      Log.info('match', `${state}${match.practice ? ' (practice)' : match.mode ? ` (${match.mode})` : ''}`);
      if (state === 'intro') this._intro();
      if (state === 'playing') {
        this._gateDone();   // 100 % + fade the loading screen away exactly at the GO banner
        // The gameplay HUD (ink tank, minimap, reticle, squad) belongs to live play and nothing else: it stays
        // hidden through the loading fade, the intro fly-over and the whole countdown, and comes up here — the one
        // authoritative 'play has begun' edge — rather than on the intro's own wall-clock timer, which ran early on
        // every stage (the intro lasts MATCH 4.2 s / BOSS_MODE.intro 7.2 s, so a fixed 3.0 / 5.6 s timer put the
        // HUD on screen a second and a half before GO).
        this.hud?.setVisible(!this._hudTucked && this._gameplayHudWanted());
        if (!match.practice) { this.hud?.banner('go'); G.audio?.play('go_horn'); }
        if (match.mode !== 'boss') this._playMusic('battle');   // boss mode: the boss audio director scores it by phase
        if (this.match.local) { this.rig.follow(this.match.local, true); }
      }
      if (state === 'judge') {
        // Round over: the judge card draws in the HUD's own overlay layer, which is NOT hidden by setVisible(false),
        // so hiding here takes the ink tank, minimap and reticle off the overview camera while the results UI stays.
        this.hud?.setVisible(false);
      }
      if (state === 'finish') {
        const bossWon = match.mode === 'boss' && match.boss?.dead;   // the defeat already had its moment (boss:defeat)
        this.hud?.banner('timesup');
        if (!bossWon) G.audio?.play('times_up');
        if (match.mode !== 'boss') {
          // the final-minute recording is timed to ring out just past the horn; anything else stops here
          if (G.music?.fileTrack !== 'battle_final') G.music?.stop?.(0.4);
          this._musicTrack = null;
        }
        this.input.exitLock();
        if (match.boss) this._bossFinishCam(match.boss);
      }
      if (state === 'judge') this._judge();
    });
  }

  // ---------------------------------------------------------------------------------------- death markers
  // A squid-skull in the victim's ink where anyone (either team) was splatted, MATCH.deathMarkLife s, fading out at the
  // end. One fixed pool, reused (no per-frame allocation): the HUD draws the world-view and minimap marks from it
  // (positions filled in _updateHud), the TAB map diorama its own (G.deathMarks).
  _deathPool() {
    return this.deathMarks || (this.deathMarks = G.deathMarks = Array.from({ length: 12 }, () => (
      { on: false, id: 0, x: 0, y: 0, z: 0, team: 0, name: '', ally: false, local: false, t: 0, k: 0, sx: 0, sy: 0, sc: 1, vis: false, mx: 0, my: 0 })));
  }
  _addDeathMark(victim) {
    const pool = this._deathPool();
    let d = pool.find((o) => !o.on);
    if (!d) d = pool.reduce((o, b) => (b.t > o.t ? b : o));   // all showing: recycle the oldest
    const p = victim.pos;
    this._dmId = (this._dmId || 0) + 1;
    d.on = true; d.id = this._dmId; d.t = 0; d.k = 1; d.vis = false;
    d.x = p.x; d.y = Math.max(p.y, PLAYER.waterY + 0.1); d.z = p.z;   // lost at sea: on the water where they went in
    d.team = victim.team; d.name = victim.name || ''; d.local = !!victim.isLocal;
  }
  _ageDeathMarks(dt) {
    const life = MATCH.deathMarkLife ?? 5, fade = MATCH.deathMarkFade ?? 1.3;
    for (const d of this._deathPool()) {
      if (!d.on) continue;
      d.t += dt;
      if (d.t >= life) { d.on = false; continue; }
      d.k = d.t > life - fade ? (life - d.t) / fade : 1;
    }
  }
  _clearDeathMarks() { for (const d of this._deathPool()) d.on = false; }

  // ---------------------------------------------------------------------------------------- attract mode
  _startAttract() {
    if (this.match) this.match.dispose();
    this.rig.dioFlip = false;
    G.projectiles.clear(); G.subs.clear(); G.specials.clear(); G.fx.clear?.(); G.paint.clear(); this._clearDeathMarks();
    // (a humans-only stage — after an online match there — idles with nobody on it; ?devstage stands idle kids there
    // for the render audits)
    const m = (this.match = G.match = new Match({ attract: true, duration: 99999, difficulty: 'normal', CharacterClass: this.CharacterClass, rig: this.rig, input: this.input,
      noBots: mapNoBots(this.mapDef?.id), mannequins: DEV_STAGE }));
    m.setup(); m.start();
    for (const a of m.actors) { a.respawnTimer = 0; }
    this.attractT = 0; this.shotT = 0; this.shotIdx = 0;
    this._attractShot();
    this.hud?.setVisible(false);
  }
  _attractShot() {
    const shots = ['orbit', 'follow', 'orbit2', 'follow'];
    const s = shots[this.shotIdx++ % shots.length];
    this.shotT = s.startsWith('follow') ? 7 : 10;
    if (s === 'orbit') this.rig.orbit(new THREE.Vector3(0, 1, 0), 34, 17, 0.05, Math.random() * 6);
    else if (s === 'orbit2') this.rig.orbit(new THREE.Vector3(0, 2, -8), 18, 7, -0.07, Math.random() * 6);
    else {
      const alive = this.match.actors.filter((a) => a.alive);
      const a = alive[(Math.random() * alive.length) | 0];
      if (a) { this.rig.follow(a, true); this.rig.yaw = a.yaw; this.rig.pitch = -0.28; this._attractFollow = a; }
    }
  }
  _updateAttract(dt) {
    this.attractT += dt; this.shotT -= dt;
    if (this.menus?.current === 'title') { if (this.rig.mode !== 'orbit') this.rig.orbit(new THREE.Vector3(0, 1, 0), 34, 17, 0.05, 0); }
    else if (this.shotT <= 0) this._attractShot();
    if (this.rig.mode === 'follow' && this._attractFollow) {
      const a = this._attractFollow;
      if (!a.alive) this.shotT = Math.min(this.shotT, 0.5);
      this.rig.yaw = G.time > 0 ? this.rig.yaw + (((a.yaw - this.rig.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (1 - Math.exp(-2 * dt)) : a.yaw;
    }
    const cov = G.paint.coverage();
    if (this.attractT > 110 || cov[0] + cov[1] > 0.72) {
      this._fade(1, 400).then(() => { this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600); });
      this.attractT = -999;
    }
  }

  // ---------------------------------------------------------------------------------------- match flow
  // lamps, signs, lit windows: follow the environment's night factor (0 day / golden … 1 dusk)
  _applyNight() {
    const k = G.env?.getSkyColors?.()?.night ?? 0;
    this.props?.setNight?.(k); this.decor?.setNight?.(k);
    // dusk: lanterns bright enough to bloom, and they pool warm light on the deck around them.
    // (compounding bug fixed: this used to be `*= 1 + 3.2 * k` on the live value — every stage
    // rebuild / theme switch multiplied the already-boosted intensity again. The boost is now
    // derived from the material's untouched 0.9 baseline, so repeated calls are idempotent.)
    if (this.decor?.bulbMat) this.decor.bulbMat.emissiveIntensity = 0.9 * (1 + 3.2 * k);
    for (const m of [this.levelMat, this.grateMat]) setLevelLamps(m, G.level, k);
  }

  async startMatch(o = {}) {
    const practice = !!o.practice;
    const opts = {
      mapId: o.mapId === 'sunset' ? 'tidewater' : (o.mapId || this.mapDef.id),
      time: o.mapId === 'sunset' ? 'dusk' : (o.time || this.time || 'day'),
      difficulty: o.difficulty || this.settings.difficulty,
      // Zone Control / Boss Battle from the stage select's MODE; practice is always turf
      mode: o.practice ? 'turf' : o.mode === 'zones' ? 'zones' : o.mode === 'boss' ? 'boss' : 'turf',
    };
    opts.duration = opts.mode === 'zones' ? (o.duration || ZONES.duration) : opts.mode === 'boss' ? (o.duration || BOSS_MODE.duration)
      : Math.min(MATCH.maxDuration, o.duration || this.settings.matchLength || MATCH.defaultDuration);
    if (!practice) this.lastMatchOpts = opts;
    G.audio?.init?.();
    G.audio?.duck?.(1, 0.01);   // a new stage picked from the practice pause menu starts un-ducked
    this.input.requestLock();
    // Match-start presentation: the camera-fade flow (commit 19dd9bd) is the default again — the screen fades out,
    // the stage builds behind the fade, and the intro fly-over + GO banner play. Only real waiting gets an overlay:
    // after 600 ms of measured preparation the themed loading screen steps in (no staged percentages, honest labels);
    // shorter builds never show one, and a late-arriving < 250 ms busy blip gets the small corner spinner instead.
    const gate = (this._matchGate = { t0: performance.now(), map: opts.mapId, mode: opts.mode, done: false });
    // never trap the player if 'playing' never fires — but while a slow device is genuinely still building, keep the
    // honest loading screen: a forced gate mid-build shows an empty world, which reads as "the map won't load"
    const safety = () => { if (this._building) gate.safety = setTimeout(safety, 3000); else this._gateDone(true); };
    gate.safety = setTimeout(safety, 22000);
    gate.slow = setTimeout(() => { if (!gate.done) { this.menus?.show('loading'); this.menus?.setLoading(0.1, 'Raising the arena…'); } }, 600);
    await this._fade(1, 350);
    G.music?.stop?.(0.3); this._musicTrack = null;
    // start buffering this round's match song and the final-minute song while the world loads
    G.music?.preload?.('battle'); if (!practice) G.music?.preload?.('battle_final');
    this.showcase.hide();
    if (this.match) this.match.dispose();
    G.projectiles.clear(); G.subs.clear(); G.specials.clear(); G.fx.clear?.(); G.paint.clear(); this._clearDeathMarks();
    let map = MAPS.find((m) => m.id === opts.mapId) || MAPS[0];
    // offline never plays an online-only stage (the menus don't offer one; a stray ?autostart / api call falls back)
    if (!mapOfflineOk(map.id) && !DEV_STAGE) {
      console.warn(`[inkwave] ${map.name} is online only — offline match on ${OFFLINE_MAPS[0].name} instead`);
      this.menus?.toast?.(`${map.name} is online only`);
      map = OFFLINE_MAPS[0];
    }
    if (opts.mode === 'boss' && !mapBossOk(map.id)) opts.mode = 'turf';
    try {
      await this._buildWorld(map, opts.mode);   // no-op when this stage (+ mode variant) is already built
    } catch (e) {
      // a stage that fails to build must not strand the player on the loading screen or drop them into an empty
      // world: log it loudly, say it in the UI, and hand the menus back the way the match-end flow does
      console.error('[inkwave] world build failed', e);
      Log.error('build', opts.mapId, e?.message || e);
      this._gateDone(true);
      this.menus?.toast?.(`Stage failed to load: ${e?.message || e}`);
      G.mode = 'menu';
      this._startAttract();
      this.menus?.show('main');
      this._fade(0, 400);
      return;
    }
    if (!gate.done) this.menus?.setLoading(0.45, 'Painting the turf…');
    if (performance.now() - gate.t0 > 600 && !gate.done && this.menus?.current !== 'loading') this.menus?.showBusy();
    const theme = mapTheme(map, opts.time);
    this.time = opts.time === 'dusk' ? 'dusk' : 'day';
    if (theme !== this.theme) {
      this.theme = theme;
      G.env.setTheme?.(theme);
      if (G.env.envMap) G.scene.environment = G.env.envMap;
      G.fx.setLighting?.(G.env.getSkyColors?.());
    }
    this._applyNight();   // after any stage rebuild too (new prop kit / decor)
    this.mapDef = map;
    this._setPalette(this._pickPalette());
    const m = (this.match = G.match = new Match({
      attract: false, practice, duration: opts.duration, mode: opts.mode, difficulty: opts.difficulty, weapon: this.profile.weapon || 'shooter', sub: this._subFor(this.profile.weapon), special: this._specialFor(this.profile.weapon),
      playerName: this.profile.name || 'Player', CharacterClass: this.CharacterClass, rig: this.rig, input: this.input,
      autopilot: params.has('autopilot'), style: this.profile.style || null, noBots: mapNoBots(map.id),   // (devstage: a solo walk)
    }));
    m.setup();
    if (!gate.done) this.menus?.setLoading(0.62, 'Tuning the tentacles…');
    await this._warmCharacters(m);
    if (!gate.done) this.menus?.setLoading(0.82, 'Warming the ink…');
    this.minimap.setViewerTeam(0);
    G.mode = 'match';
    this.hud?.setVisible(false);
    this.hudPrompt = null; this._hintT = 0; this._hints = {};
    this.hud?.setPractice?.(practice);
    if (!gate.done) this.menus?.setLoading(0.9, 'Get ready…');   // crawls toward 100 % during the intro
    m.start();
    if (practice) {
      // no intro fly-over: straight in, special charged so it can be tried right away (m.start() already flipped the
      // match to 'playing', which is what raises the HUD)
      if (m.local) m.local.special = m.local.specialCost();
    }
    this._fade(0, 500);
  }

  // Loading gate end. Fast path (the default): the fade was the whole gate — hand everything back immediately and let
  // the camera-fade / intro fly-over play. If the loading screen was shown (preparation took > 600 ms), it hands over
  // at the GO banner. `force` (the 22 s safety timeout) just closes whatever is up.
  _gateDone(force = false) {
    const gate = this._matchGate;
    if (!gate || gate.done) return;
    gate.done = true;
    clearTimeout(gate.safety);
    clearTimeout(gate.slow);
    this.menus?.hideBusy();
    const finish = () => {
      if (this._matchGate !== gate) return;
      this._matchGate = null;
      if (this.menus?.current === 'loading') this.menus?.show(null);
    };
    if (force || this.menus?.current !== 'loading') finish();
    else {
      this.menus?.setLoading(1, 'GO!');
      setTimeout(finish, 700);   // one beat on 100 % / GO!, then away
    }
    Log.info('match', `${gate.map} · ${gate.mode} ready in ${((performance.now() - gate.t0) / 1000).toFixed(1)}s${force ? ' (forced)' : ''}`);
  }

  _inPractice() { return !!(this.match && this.match.practice && G.mode === 'match'); }

  // a random stage (a different one from the current, when there's a choice)
  startPractice(o = {}) {
    const pool = OFFLINE_MAPS.filter((m) => m.id !== this.mapDef?.id);   // (never an online-only stage)
    const map = (o.mapId && OFFLINE_MAPS.find((m) => m.id === o.mapId)) || pool[(Math.random() * pool.length) | 0] || OFFLINE_MAPS[0];
    return this.startMatch({ mapId: map.id, practice: true });
  }

  // practice: open the loadout screen straight from play (Esc on it drops you back in)
  openPracticeLoadout() {
    const m = this.match;
    if (!this._inPractice() || m.paused || m.state !== 'playing') return;
    m.paused = true;
    this.input.exitLock();
    this.menus?.show('loadout', { under: ['pause'], quick: true });
    G.audio?.duck?.(0.5, 99);
    G.music?.pause?.();
  }

  // equip the profile's loadout on the practising player (called whenever the loadout changes)
  _applyPracticeLoadout() {
    if (!this._inPractice()) return;
    const a = this.match.local;
    if (!a) return;
    const w = this.profile.weapon || 'shooter', sub = this._subFor(w), sp = this._specialFor(w);
    if (a.weaponId !== w || a.specialId !== sp) {
      G.specials.end(a, 'swap');
      a.specialActive = null;
      if (a.weaponId !== w) a.setWeapon(w);
      a.setSpecial(sp);
      a.special = a.specialCost();
    }
    if (a.subId !== sub) a.setSub(sub);
    a.ink = PLAYER.inkMax;
  }

  // practice: wipe the stage clean and drop back in at spawn with full ink and special
  practiceReset() {
    if (!this._inPractice()) return;
    const a = this.match.local;
    G.projectiles.clear(); G.subs.clear(); G.specials.clear(); G.fx.clear?.(); G.paint.clear(); this._clearDeathMarks();
    if (!a) return;
    a.respawn();
    a.special = a.specialCost();
    a.stats.turf = 0; a.stats.splats = 0; a.stats.deaths = 0; a.stats.specials = 0;
  }

  // ---- online (src/net/session.js drives these) -----------------------------------------------------------------
  // Build the host's match: same stage / time / palette / roster on every client; the intro starts on netMatchGo.
  async startNetMatch(cfg, nm) {
    G.audio?.init?.();
    this.menus?.show(null);
    await this._fade(1, 350);
    G.music?.stop?.(0.3); this._musicTrack = null;
    this.showcase.hide();
    if (this.match) this.match.dispose();
    G.projectiles.clear(); G.subs.clear(); G.specials.clear(); G.fx.clear?.(); G.paint.clear(); this._clearDeathMarks();
    const map = MAPS.find((m) => m.id === cfg.map) || MAPS[0];
    await this._buildWorld(map, cfg.mode);   // no-op when this stage (+ mode variant) is already built
    const theme = mapTheme(map, cfg.time);
    this.time = cfg.time === 'dusk' ? 'dusk' : 'day';
    if (theme !== this.theme) {
      this.theme = theme;
      G.env.setTheme?.(theme);
      if (G.env.envMap) G.scene.environment = G.env.envMap;
      G.fx.setLighting?.(G.env.getSkyColors?.());
    }
    this._applyNight();
    this.mapDef = map;
    this._setPalette(this.settings.colorblind ? COLORBLIND_PALETTE : TEAM_PALETTES[cfg.palette] || TEAM_PALETTES[0]);
    const m = (this.match = G.match = new Match({
      attract: false, duration: cfg.duration, difficulty: cfg.difficulty, mode: cfg.mode, CharacterClass: this.CharacterClass, rig: this.rig, input: this.input,
      roster: cfg.roster, myId: G.net.myId, host: G.net.isHost, autopilot: params.has('autopilot'),
    }));
    m.setup();
    await this._warmCharacters(m);   // before 'ready': nobody starts until every shader a squidkid can use is compiled
    nm.bind(m);
    this.lastMatchOpts = null;
    this.minimap.setViewerTeam(m.local ? m.local.team : 0);
    G.mode = 'match';
    this.hud?.setVisible(false);
    this.hudPrompt = null; this._hintT = 0; this._hints = {};
    // hold on the stage (not black) while the others finish loading
    if (m.local) { this.rig.follow(m.local, true); this.rig.yaw = m.local.team === 0 ? 0 : Math.PI; }
    this.rig.dioFlip = !!(m.local && m.local.team === 1);
    this._fade(0, 450);
  }
  // Compile every shader variant a squidkid can use this match (all detail tiers, their cross-fades, squid form,
  // weapons) and build every kid's tier meshes while the screen is still faded out, so none of it lands mid-match.
  // Programs are shared, so after the first kid of each weapon the rest are a few ms each.
  // Compile the player's own kit while the menus idle (Settings → Optimize → Pre-warm). Deliberately best-effort:
  // it builds one throwaway kid off-screen purely to force the compile, so a later match start finds everything hot.
  // Never blocks anything, never throws into boot, and is a no-op if the player turned the setting off.
  _idlePrewarm() {
    if (!this.settings?.prewarm || G.mode !== 'menu' || this._prewarmed) return;
    this._prewarmed = true;
    try {
      const c = new this.CharacterClass({
        color: G.teamColors[0].clone(), weapon: this.profile.weapon || 'shooter', style: { ...(this.profile.style || {}) },
        name: 'prewarm', isLocal: false,
      });
      c.root.visible = false;
      G.scene.add(c.root);
      Promise.resolve(c.warmAll?.()).catch(() => {}).then(() => { G.scene.remove(c.root); c.dispose?.(); }, () => { G.scene.remove(c.root); c.dispose?.(); });
    } catch (e) { console.warn('[inkwave] idle prewarm', e); }
    this.showcase?._warmup?.();   // the showcase/locker/portrait shaders, same as after boot
  }

  async _warmCharacters(m) {
    const jobs = m.actors.map((a) => a.character?.warmAll ? Promise.resolve(a.character.warmAll()).catch((e) => console.warn('[inkwave] warm', e)) : null).filter(Boolean);
    if (m.boss) jobs.push(Promise.resolve(m.boss.model.ready).then(() => Promise.all(m.boss.warm().map((o) => G.renderer.compileAsync(o, G.camera, G.scene)))).catch((e) => console.warn('[inkwave] boss warm', e)));
    if (jobs.length) await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 8000))]);   // never hang a load
  }
  netMatchGo() {
    const m = this.match;
    if (!m || m.state !== 'init') return;
    this.input.requestLock();
    m.start();
  }
  // results done → everyone back in the room's lobby
  async netMatchEnd() {
    if (this._netEnding) return;
    this._netEnding = true;
    clearTimeout(this._netEndT);
    try {
      this.input.exitLock();
      this.menus?.show(null);
      await this._fade(1, 350);
      this.hud?.setVisible(false);
      this.hud?.hideSplatted?.();
      this.showcase.hide();
      G.mode = 'menu';
      G.net?.endMatch();
      this._startAttract();
      this.menus?.show(this.menus?.hasScreen?.('lobby') === false ? 'main' : 'lobby');
      this._playMusic('menu');
      G.audio?.duck?.(1, 0.01);
      this._fade(0, 500);
    } finally { this._netEnding = false; }
  }
  // the room went away mid-match (connection lost): back to the menus with the reason
  netMatchAborted(reason) {
    this.quitToMenu().then(() => { if (reason) this.menus?.toast?.(reason); });
  }

  _intro() {
    if (this.match.boss) { this._bossIntro(this.match.boss); return; }
    const L = G.level;
    const local = this.match.local;
    const team = local ? local.team : 0, pad = L.spawnPads[team];
    const sgn = team === 0 ? 1 : -1;     // the layout is a 180° mirror: Bravo's shot is Alpha's rotated about the centre
    // sweep from high over the enemy base down behind the player (a stage can open on its own hero shot instead)
    const I = L.layout?.intro;
    const from = I ? new THREE.Vector3(I.from[0] * sgn, I.from[1], I.from[2] * sgn) : new THREE.Vector3(18 * sgn, 26, 30 * sgn);
    const to = new THREE.Vector3(pad.x, pad.y + 2.6, pad.z - (I?.toBack ?? 5.2) * sgn);
    const lookFrom = I ? new THREE.Vector3(I.lookFrom[0] * sgn, I.lookFrom[1], I.lookFrom[2] * sgn) : new THREE.Vector3(0, 0, 10 * sgn), lookTo = new THREE.Vector3(pad.x, pad.y + 1.6, pad.z + 6 * sgn);
    this.rig.cinematic(from, to, lookFrom, lookTo, 3.6, () => {});
    this.rig.yaw = team === 0 ? 0 : Math.PI; this.rig.pitch = -0.12;
    this.rig.dioFlip = team === 1;
    G.audio?.play('ready');
    setTimeout(() => { if (this.match?.state === 'intro') this.hud?.banner('ready'); }, 1700);
    this._playMusic(null);
  }

  pause() {
    if (!this.match || this.match.attract || this.match.paused) return;
    // only a live round (or its intro) can pause — never on top of time's up / judge / results
    if (this.match.state !== 'playing' && this.match.state !== 'intro') return;
    if (G.netm) {   // online: the match carries on underneath the menu
      this.input.exitLock();
      if (this.match.controller) this.match.controller.enabled = false;
      this.menus?.show('pause');
      return;
    }
    this.match.paused = true;
    this.input.exitLock();
    this.menus?.show('pause');
    G.audio?.duck?.(0.5, 99);
    G.music?.pause?.(); // a recording holds its place so the final-minute song stays in step with the clock
  }
  resume() {
    if (!this.match) return;
    this.menus?.show(null);
    this.match.paused = false;
    if (this.match.controller) this.match.controller.enabled = true;
    this.input.requestLock();
    G.audio?.duck?.(1, 0.01);
    G.music?.resume?.();
  }
  async quitToMenu(screen = 'main') {
    clearTimeout(this._netEndT);
    clearTimeout(this._matchGate?.safety);
    clearTimeout(this._matchGate?.slow);
    if (G.net && G.net.state !== 'offline' && G.net.state !== 'error') G.net.leave();
    this.input.exitLock();
    this.menus?.show(null);
    await this._fade(1, 350);
    this.hud?.setVisible(false);
    this.hud?.hideSplatted?.();
    this.showcase.hide();
    G.mode = 'menu';
    this._setPalette(this._pickPalette());
    this._startAttract();
    this.hud?.setPractice?.(false);
    this.menus?.show(screen);
    this._playMusic('menu');
    G.audio?.duck?.(1, 0.01);
    this._fade(0, 500);
  }

  // Boss Battle intro: sweep in over the arena as HULLBREAKER bursts out of its home ground (boss time 1.8 s), hold on the
  // roar while the title card plays, then swing back down behind the squad's pad for GO. Chained on the rig's own
  // clock (not timers), so it stays in step with the boss under freeze/step audits.
  _bossIntro(b) {
    const pad = G.level.spawnPads[0], B = b.pos, fy = b.yaw;
    const fx = Math.sin(fy), fz = Math.cos(fy), sx = fz, sz = -fx;       // its forward (toward the squad) and a side
    const reveal = new THREE.Vector3(B.x + fx * 15 + sx * 5, B.y + 4.6, B.z + fz * 15 + sz * 5);
    const push = new THREE.Vector3(B.x + fx * 12 + sx * 3.2, B.y + 3.4, B.z + fz * 12 + sz * 3.2);
    const behind = new THREE.Vector3(pad.x, pad.y + 2.6, pad.z - 5.2);
    const chest = new THREE.Vector3(B.x, B.y + 2.6, B.z), head = new THREE.Vector3(B.x, B.y + 3.4, B.z);
    const high = new THREE.Vector3(pad.x + 6, pad.y + 17, pad.z + 4), mid = new THREE.Vector3((pad.x + B.x) / 2, 0, (pad.z + B.z) / 2);
    const m = this.match;
    this.rig.cinematic(high, reveal, mid, chest, 1.9, () => {
      if (this.match !== m || m.state !== 'intro') return;
      this.rig.cinematic(reveal, push, chest, head, 3.0, () => {
        if (this.match !== m || m.state !== 'intro') return;
        this.rig.cinematic(push, behind, head, new THREE.Vector3(pad.x, pad.y + 1.6, pad.z + 6), 2.1, () => {});
      });
    });
    this.rig.yaw = 0; this.rig.pitch = -0.12; this.rig.dioFlip = false;
    G.audio?.play('ready');
    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.banner('ready'); }, 5300);
    this._playMusic(null);
  }
  // round over: circle the boss (sinking, or roaring over a squad that ran out of time)
  _bossFinishCam(b) {
    const c = new THREE.Vector3(b.pos.x, b.pos.y + 2.2, b.pos.z), cam = G.camera.position;
    this.rig.orbit(c, 15, 5.5, 0.09, Math.atan2(cam.x - c.x, cam.z - c.z));
  }
  // Boss Battle results: no turf judge — straight to VICTORY / DEFEAT with the fight's numbers
  async _bossResults() {
    const m = this.match, R = m.result, bo = R.boss || {};
    this.hud?.hideSplatted?.();
    await new Promise((r) => setTimeout(r, 400));
    if (this.match !== m) return;
    const won = !!bo.win, cov = R.coverage || G.paint.coverage();
    m.setState('results');
    this.hud?.setVisible(false);
    const local = m.local, p = this.profile;
    const turf = Math.round(local.stats.turf), dmg = Math.round(local.stats.bossDmg || 0);
    const gained = Math.round((won ? PROGRESSION.xpWin : PROGRESSION.xpLose) + turf * PROGRESSION.xpPerTurfPoint + local.stats.splats * PROGRESSION.xpPerSplat + dmg * 0.04);
    const before = { level: p.level, xp: p.xp, toNext: PROGRESSION.xpForLevel(p.level) };
    p.xp += gained; p.matches++; if (won) p.wins++; p.totalTurf += turf;
    while (p.xp >= PROGRESSION.xpForLevel(p.level)) { p.xp -= PROGRESSION.xpForLevel(p.level); p.level++; }
    this._saveProfile();
    const data = {
      mode: 'boss', win: won, percents: [cov[0] * 100, cov[1] * 100], colors: [G.teamHex[0], G.teamHex[1]], teamNames: this.palette.names || TEAM_NAMES,
      boss: { name: bo.name, defeated: won, time: bo.time, hpLeft: bo.maxHp ? bo.hp / bo.maxHp : 0, phase: bo.phase, maxHp: bo.maxHp },
      players: m.actors.map((a) => ({ name: a.name, team: 0, weapon: a.weaponId, turf: Math.round(a.stats.turf), damage: Math.round(a.stats.bossDmg || 0), weakHits: a.stats.weakHits || 0, splats: a.stats.splats, deaths: a.stats.deaths, isSelf: a.isLocal, bot: !!a.isBot })),
      xp: { gained, levelBefore: before.level, levelAfter: p.level, xpBefore: before.xp, xpAfter: p.xp, xpToNextBefore: before.toNext, xpToNextAfter: PROGRESSION.xpForLevel(p.level) },
      mapName: this.mapDef.name,
    };
    // the squad's top four (by damage) on the podium
    const top = [...m.actors].sort((a1, a2) => (a2.stats.bossDmg || 0) - (a1.stats.bossDmg || 0)).slice(0, 4);
    this.showcase.showResults(0, won, G.teamColors[0], top.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));
    if (G.netm) data.online = true;
    this.menus?.showResults(data);
    this.menus?.show('results');
    G.audio?.play(won ? 'victory_fanfare' : 'defeat_jingle');
    if (G.netm && G.net.isHost) this._netEndT = setTimeout(() => { G.netm?.sendEnd(); this.netMatchEnd(); }, 12000);
  }

  async _judge() {
    const m = this.match;
    if (m.result?.mode === 'boss') return this._bossResults();
    this.hud?.hideSplatted?.();
    this.rig.overview();
    this.hud?.setVisible(false);   // the judge card lives outside the hideable HUD (hud.js overLayer); the gameplay HUD does not
    const cov = m.result.coverage;
    // Zone Control: the final counts (the scores) and each team's leftover penalty (shown apart, like the HUD's "+N"), winner and how it was won
    let zr = null;
    if (m.mode === 'zones' && m.zones && m.result.mode === 'zones') {
      const zs = m.zones.state();
      zr = { counts: [...zs.count], penalty: zs.penalty.map((p) => Math.max(0, Math.ceil(p - 1e-6))), winner: m.result.winner, reason: m.result.reason || 'time', overtime: !!m.result.overtime, overtimeT: zs.overtimeT };
    }
    const judgeP = zr
      ? this.hud?.judge({ mode: 'zones', colors: [G.teamHex[0], G.teamHex[1]], names: this.palette.names || TEAM_NAMES, counts: zr.counts, penalty: zr.penalty, winner: zr.winner, reason: zr.reason, overtime: zr.overtime, percents: [cov[0] * 100, cov[1] * 100] })
      : this.hud?.judge({ colors: [G.teamHex[0], G.teamHex[1]], percents: [cov[0] * 100, cov[1] * 100], names: this.palette.names || TEAM_NAMES, winner: m.result.winner });
    // The judge animation drives itself from the HUD's own rAF loop and resolves when it ends — but if that loop is
    // ever stalled (the HUD paused, a tab throttling rAF, an fx callback throwing) nothing else moves the match on,
    // and the player is left staring at the judge with no way to the results. Race it against a ceiling so the round
    // always lands. `judgeP ||` alone never fired: a Promise is always truthy, so that fallback was dead code.
    const JUDGE_MAX_MS = 9000;
    if (judgeP) await Promise.race([judgeP.catch(() => {}), new Promise((r) => setTimeout(r, JUDGE_MAX_MS))]);
    const myTeam = m.local ? m.local.team : 0;
    const won = m.result.winner === myTeam;
    m.setState('results');
    this.hud?.setVisible(false);
    // profile / XP
    const local = m.local;
    const p = this.profile;
    const turf = Math.round(local.stats.turf);
    let gained = Math.round((won ? PROGRESSION.xpWin : PROGRESSION.xpLose) + turf * PROGRESSION.xpPerTurfPoint + local.stats.splats * PROGRESSION.xpPerSplat);
    let xpParts = null;
    if (zr) {
      // Zone Control: less per point of turf (a 5 min match), extra for ink laid on the live zone, a knockout bonus
      const ZX = PROGRESSION.zones || { turfScale: 0.6, xpPerZoneTurfPoint: 1, xpKnockout: 300 };
      const zoneTurf = Math.round(local.stats.zoneTurf || 0);
      xpParts = [[won ? 'WIN BONUS' : 'MATCH', won ? PROGRESSION.xpWin : PROGRESSION.xpLose], ['TURF', Math.round(turf * PROGRESSION.xpPerTurfPoint * ZX.turfScale)],
        ['ZONE INK', Math.round(zoneTurf * ZX.xpPerZoneTurfPoint)], ['SPLATS', Math.round(local.stats.splats * PROGRESSION.xpPerSplat)], ['KNOCKOUT', won && zr.reason === 'knockout' ? ZX.xpKnockout : 0]].filter(([, v], i) => i < 2 || v > 0);
      gained = xpParts.reduce((a, [, v]) => a + v, 0);
    }
    const before = { level: p.level, xp: p.xp, toNext: PROGRESSION.xpForLevel(p.level) };
    p.xp += gained; p.matches++; if (won) p.wins++; p.totalTurf += turf;
    while (p.xp >= PROGRESSION.xpForLevel(p.level)) { p.xp -= PROGRESSION.xpForLevel(p.level); p.level++; }
    this._saveProfile();
    const data = {
      win: won, percents: [cov[0] * 100, cov[1] * 100], colors: [G.teamHex[0], G.teamHex[1]], teamNames: this.palette.names || TEAM_NAMES,
      players: m.actors.map((a) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: Math.round(a.stats.turf), splats: a.stats.splats, deaths: a.stats.deaths, isSelf: a.isLocal, bot: !!a.isBot, ...(zr ? { zoneTurf: Math.round(a.stats.zoneTurf || 0) } : {}) })),
      xp: { gained, levelBefore: before.level, levelAfter: p.level, xpBefore: before.xp, xpAfter: p.xp, xpToNextBefore: before.toNext, xpToNextAfter: PROGRESSION.xpForLevel(p.level), ...(xpParts ? { parts: xpParts } : {}) },
      mapName: this.mapDef.name,
      ...(zr ? { mode: 'zones', zones: zr } : {}),
    };
    // your team on the podium
    const team = m.actors.filter((a) => a.team === myTeam);
    this.showcase.showResults(myTeam, won, G.teamColors[myTeam], team.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));
    if (G.netm) data.online = true;   // the results screen builds its online variant (back-to-room countdown) from this
    this.menus?.showResults(data);
    this.menus?.show('results');
    G.audio?.play(won ? 'victory_fanfare' : 'defeat_jingle');
    setTimeout(() => this._playMusic(won ? 'results_win' : 'results_lose'), 2600);
    // online: the host brings the room back to the lobby once everyone has seen the results
    if (G.netm) {
      if (G.net.isHost) this._netEndT = setTimeout(() => { G.netm?.sendEnd(); this.netMatchEnd(); }, 12000);
    }
  }

  _fade(to, ms) {
    return new Promise((r) => {
      const el = this.fadeEl;
      if (!el) return r();
      el.style.transition = `opacity ${ms}ms ease`;
      el.style.opacity = String(to);
      el.style.pointerEvents = to > 0.5 ? 'all' : 'none';
      setTimeout(r, ms + 20);
    });
  }

  // ---------------------------------------------------------------------------------------- loop
  // ts is the rAF (vsync) timestamp: stepping the sim by vsync-to-vsync intervals instead of callback times keeps motion
  // even on 120 Hz displays. settings.fpsCap (0 = display rate) skips vsyncs so frames land on a steady cadence.
  _loop(ts) {
    requestAnimationFrame((t) => this._loop(t));
    this._trackVsync(ts);
    this._rotGuardUpdate?.();   // touch portrait guard follows the live mode (cheap boolean + cached style write)
    const cap = this.settings.fpsCap || 0;
    if (cap && ts !== undefined && this._lastTs !== undefined && ts - this._lastTs < 1000 / cap - 2) return;
    this._lastTs = ts;
    this.timer.update(ts); let dt = Math.max(0, this.timer.getDelta());
    if (this.frozen || this._building) return;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    if (dt > 1 / 20) {   // ≥50 ms frames: a real hitch — 3 in a row = sustained, not one GC blip
      this._slowN = (this._slowN || 0) + 1;
      if (this._slowN === 3) Log.occasional('perf', 8000, `slow frame ${(dt * 1000) | 0}ms`, `mode ${G.mode}`, this.match ? `state ${this.match.state}` : '');
    } else this._slowN = 0;
    this._dynRes(dt);
    const rawDt = dt;   // perf wants the real frame time; the sim clamps below
    dt = Math.min(dt, 1 / 24);
    this._frame(dt);
    Perf.frame(rawDt);   // hitch baseline: ring percentiles + long tasks + spot timings
  }

  // Display refresh estimate: 10th percentile of raw rAF intervals (rAF fires every vsync while frames keep up, and
  // keeps doing so under an fps cap because capped frames are skipped here, not in the browser).
  _trackVsync(ts) {
    if (ts === undefined) return;
    const v = this._vs || (this._vs = { last: ts, buf: [], ms: 1000 / 60 });
    const d = ts - v.last; v.last = ts;
    if (d > 2 && d < 50) v.buf.push(d);
    if (v.buf.length >= 90) {
      v.buf.sort((a, b) => a - b);
      // timestamp jitter makes the raw percentile read a little short (7.8 ms on a 120 Hz panel): snap to a real rate
      const hz = 1000 / v.buf[9];
      v.ms = 1000 / REFRESH_RATES.reduce((best, r) => (Math.abs(r - hz) < Math.abs(best - hz) ? r : best));
      v.buf.length = 0;
    }
  }
  // the frame interval (ms) we pace and size the render for: the display's refresh, or the user's cap if that is lower
  _frameTarget() {
    const cap = this.settings.fpsCap || 0;
    return Math.max(this._vs?.ms || 1000 / 60, cap ? 1000 / cap : 0);
  }

  // hold the frame target: when a 4 s window of a live round averages over ~112% of it (frames missing vsync, which
  // on a 120 Hz display reads as 8/16 ms judder), drop render density one notch. Stepping back up needs 12 s locked
  // at the target and happens at most twice, so the image never pumps between sizes (re-sizing every couple of
  // seconds read as flicker).
  _dynRes(dt) {
    if (dt <= 0 || dt > 0.25) return;
    const d = this._dyn || (this._dyn = { acc: 0, n: 0, t: 0, fast: 0, ups: 0 });
    d.acc += dt; d.n++; d.t += dt;
    if (d.t < 4) return;
    const avg = d.acc / d.n;
    d.acc = 0; d.n = 0; d.t = 0;
    const m = this.match;
    if (this.settings.quality === 'ultra' || document.hidden || !m || m.attract || m.state !== 'playing') { d.fast = 0; return; }
    const s = this.R.dynScale || 1, tgt = this._frameTarget() / 1000;
    if (avg > tgt * 1.12 && s > this.R.dynFloor() + 0.01) { this.R.setDynamicScale(s - 0.125); d.fast = 0; Log.occasional('perf', 10000, `dynamic res ↓ ${(100 * (s - 0.125)) | 0}%`, `(4s avg ${(avg * 1000) | 0}ms vs target ${(tgt * 1000) | 0}ms)`); }
    else if (avg < tgt * 1.04 && s < 1 && d.ups < 2) { if (++d.fast >= 3) { this.R.setDynamicScale(s + 0.125); d.fast = 0; d.ups++; Log.occasional('perf', 10000, `dynamic res ↑ ${(100 * (s + 0.125)) | 0}%`, `(4s avg ${(avg * 1000) | 0}ms — recovered)`); } }
    else d.fast = 0;
  }

  _frame(dt) {
    if (dt > 0.25) return;   // long budget frames (frozen / caught-up sim) are baseline noise
    const tA = performance.now();
    G.renderer.info.reset();
    G.time += dt;
    this.input.pollPad();
    this._padMenus();
    G.net?.update?.(dt);
    const m = this.match;
    // the online lobby / hub stand in their own full-frame set (showcase): the attract match behind them is neither
    // simulated nor drawn while it's covered — it resumes exactly where it was when the set fades away
    const setUp = !!this.showcase?.fullFrame;
    if (m && !(setUp && m.attract)) Perf.spot('match.update', () => {
      m.updateController(dt);
      const sub = dt > 1 / 45 ? 2 : 1; // substep physics on slow frames
      for (let i = 0; i < sub; i++) m.update(dt / sub);
      if (!m.paused) { G.projectiles.update(dt); G.subs.update(dt); G.specials.update(dt); }
      if (m.attract) this._updateAttract(dt);
      else if (m.state === 'playing' && m.local?.alive && this.rig.mode !== 'follow' && this.rig.mode !== 'path') this.rig.follow(m.local, true);
    });
    if (!m || !m.paused) G.fx.update(dt, G.camera);
    if (!m || !m.paused) this.fxHooks?.update?.(dt);
    if (m && !m.paused && !m.attract) this._ageDeathMarks(dt);
    this.screenfx?.update?.(dt, this);
    // the TAB map (also while splatted, planning a Super Jump): lift the splatted desaturation + ink flood off the stage
    // so the ink and the pins read
    // (fully gone well before the map is fully open: the flood's drips draw at any alpha above zero)
    const fxU = this.screenfx?.U, mk = this.rig.mapK || 0;
    if (fxU && mk > 0 && fxU.uDesat && fxU.uFlood) {
      const e = Math.min(1, mk / 0.8), k = 1 - e * e * (3 - 2 * e);
      fxU.uDesat.value *= k; fxU.uFlood.value.w = k > 0.02 ? fxU.uFlood.value.w * k : 0;
    }
    G.env.update?.(dt, G.camera);
    this.decor.update(dt);
    this.props?.update?.(dt, G.time);
    // map diorama: held map key during live play (or while waiting to respawn) swoops the view overhead — but not while
    // aiming a Vortex Strike (that uses the flat stage map)
    const strikeAiming = !!(m?.local?.specialActive && m.local.specialActive.id === 'strike' && m.local.specialActive.aiming);
    this.rig.setMap?.(!!(m && !m.attract && !m.paused && m.state === 'playing' && m.controller?.mapHeld && !this.menus?.current && !strikeAiming));
    this.rig.update(dt);
    this._dioFog();
    this.diorama?.update(dt, this.rig.mapK);
    // local player camera-dependent aim must use this frame's camera
    if (m && m.controller && m.state === 'playing') m.controller.computeAim?.();
    // bomb arc preview
    const loc = m?.local;
    const orbReady = !!(loc && loc.specialActive && loc.specialActive.id === 'booyah' && loc.specialActive.charge >= 1);
    G.projectiles.updateArc(loc, !!(loc && loc.alive && (loc.weaponRunner.aimingSub || orbReady) && m.state === 'playing' && !m.paused));
    const tB = performance.now();
    // paint → atlas, shader uniforms (spot-timed for the perf baseline)
    G.paint.flush(dt);
    Perf.record('paint.flush', performance.now() - tB);
    this.levelMat.userData.uniforms.uTime.value = G.time;
    // see-through window toward the local player
    {
      const lu = this.levelMat.userData.uniforms;
      const on = !!(m && !m.attract && loc && loc.alive && this.rig.mode === 'follow' && this.rig.target === loc && (this.rig.mapK ?? 0) < 0.3);
      lu.uSeeOn.value = damp(lu.uSeeOn.value, on ? 1 : 0, 10, dt);
      lu.uSeeA.value.copy(G.camera.position);
      if (loc) lu.uSeeB.value.set(loc.pos.x, loc.pos.y + (loc.form === 'squid' ? 0.4 : 1.0), loc.pos.z);
      if (this.grateMat) { const gu = this.grateMat.userData.uniforms; gu.uSeeOn.value = lu.uSeeOn.value; gu.uSeeA.value.copy(lu.uSeeA.value); gu.uSeeB.value.copy(lu.uSeeB.value); }
    }
    if (this.grateMat) this.grateMat.userData.uniforms.uTime.value = G.time;
    // swimmers' wakes in the ink surface
    if (this.swimWake && (!m || !m.paused)) this.swimWake.update(dt, this.levelMat.userData.uniforms, G.camera.position);
    // music self-heal: a live, unpaused round never sits in silence because a recording was left paused
    if (m && !m.paused && !m.attract && G.mode === 'match' && (this._musicHealT = (this._musicHealT || 0) + dt) > 1) {
      this._musicHealT = 0;
      const ct = G.music?.current;
      if (ct && ct.el && ct.el.paused && !ct.stopped && !ct.el.ended && (m.state === 'playing' || m.state === 'intro')) G.music.resume();
    }
    this.showcase.update(dt);
    this._updateLocalLoops(dt);
    this._updateAmbience(dt);
    // audio listener
    if (G.audio?.setListener) {
      const cam = this.rig.gameCam || G.camera;   // the player's ears stay with the player while the map is up
      G.audio.setListener(cam.position, cam.getWorldDirection(this._lf || (this._lf = new THREE.Vector3())), cam.up);
    }
    // post uniforms (low-hp vignette)
    const g = this.R.grade.uniforms;
    const hpK = loc && m && !m.attract && loc.alive ? clamp(1 - loc.hp / 55, 0, 1) : 0;
    g.uHurt.value = damp(g.uHurt.value, hpK * 0.8, 6, dt);
    if (loc) g.uHurtColor.value.copy(G.teamColors[loc.enemyTeam]);
    // shadows: every frame (half-rate updates made moving shadows — your own, right under the crosshair — judder);
    // only the low preset halves it
    const sm = G.renderer.shadowMap;
    sm.autoUpdate = false;
    this._frameN = (this._frameN || 0) + 1;
    if (this.settings.quality !== 'low' || (this._frameN & 1)) sm.needsUpdate = true;
    if (!this._skipRender) Perf.spot('render', () => {
      if (!setUp) this.R.render();
      if (this.showcase.mode) sm.needsUpdate = true;
      this.showcase.render();
    });
    const tC = performance.now();
    const ps = this.perf || (this.perf = { sim: 0, render: 0, calls: 0, tris: 0 });
    ps.sim += (tB - tA - ps.sim) * 0.05; ps.render += (tC - tB - ps.render) * 0.05;
    ps.calls = G.renderer.info.render.calls; ps.tris = G.renderer.info.render.triangles;
    // HUD
    if (m && !m.attract && this.hud && (m.state === 'playing' || m.state === 'intro' || m.state === 'finish')) this._updateHud(dt);
    // touch controls live only during actual play (never over menus, pause, results or the attract stage) — and, like
    // the gameplay HUD, not during the intro fly-over or after the round ends
    this.touch?.setVisible(!!(m && !m.attract && !m.paused && !this.menus?.current && m.state === 'playing'));
    this.menus?.update?.(dt);
    this.input.endFrame();
  }

  // continuous sounds tied to the local player's state (swim gurgle, wall climb, enemy-ink sizzle)
  // harbour soundscape: continuous sea wash + occasional gull cries out over the water
  _updateAmbience(dt) {
    if (!this._audioOn || !G.audio?.loop) return;
    if (!this._amb) this._amb = G.audio.loop('harbor_ambience', { volume: 0.55 });
    // in the lobby's alley the harbour is only a distant wash (and no gulls overhead)
    const inSet = !!this.showcase?.fullFrame;
    this._ambV = damp(this._ambV ?? 0.55, inSet ? 0.12 : 0.55, 2, dt);
    this._amb.set?.({ volume: this._ambV });
    if (inSet) return;
    this._gullT = (this._gullT ?? 4) - dt;
    if (this._gullT <= 0) {
      this._gullT = 7 + Math.random() * 12;
      const B = G.level.bounds, a = Math.random() * Math.PI * 2;
      const p = this._gullP || (this._gullP = new THREE.Vector3());
      p.set(Math.cos(a) * (B.maxX + 25), 12 + Math.random() * 8, Math.sin(a) * (B.maxZ + 20));
      G.audio.play('gull', { pos: p, volume: 0.6 + Math.random() * 0.4, pitch: 0.9 + Math.random() * 0.25 });
    }
    // marina: rigging ringing against the masts in the gusts, and now and then a ship's horn out in the channel
    if (G.level?.layout?.id === 'halyard') {
      const p = this._ambP || (this._ambP = new THREE.Vector3());
      this._gustT = (this._gustT ?? 2) - dt;
      if (this._gustT <= 0) { this._gustT = 2.5 + Math.random() * 4; this._clinks = 2 + ((Math.random() * 4) | 0); this._clinkT = 0; }
      if (this._clinks > 0 && (this._clinkT -= dt) <= 0) {
        this._clinks--; this._clinkT = 0.12 + Math.random() * 0.45;
        const s = Math.random() < 0.5 ? -1 : 1;
        p.set(s * (27 + Math.random() * 14), 8 + Math.random() * 4, (Math.random() * 2 - 1) * 40);
        G.audio.play('halyard_clink', { pos: p, volume: 0.5 + Math.random() * 0.5, pitch: 0.85 + Math.random() * 0.35 });
      }
      this._hornT = (this._hornT ?? 28 + Math.random() * 10) - dt;
      if (this._hornT <= 0) {
        this._hornT = 55 + Math.random() * 30;
        p.set((Math.random() < 0.5 ? -1 : 1) * 95, 8, (Math.random() * 2 - 1) * 70);
        G.audio.play('ferry_horn', { pos: p, volume: 0.8 });
      }
    }
  }

  _updateLocalLoops(dt) {
    const m = this.match, a = m && !m.attract && !m.paused ? m.local : null;
    const L = this._loops || (this._loops = {});
    const want = (name, on, vol, pitch = 1) => {
      if (on && !L[name]) L[name] = G.audio?.loop?.(name, { volume: 0 });
      const h = L[name];
      if (!h) return;
      h._v = damp(h._v || 0, on ? vol : 0, on ? 10 : 7, dt);
      h.set({ volume: h._v, pitch });
      if (!on && h._v < 0.01) { h.stop(0.05); L[name] = null; }
    };
    const alive = !!(a && a.alive);
    const hs = alive ? Math.hypot(a.vel.x, a.vel.z) : 0;
    want('swim', alive && a.anim.form === 'swim' && hs > 0.5, Math.min(0.6, hs / 11.8 * 0.6 + 0.08), 0.6 + Math.min(1, hs / 11.8));
    want('climb', alive && a.anim.form === 'climb', 0.5, alive ? 0.6 + Math.min(1, Math.abs(a.vel.y) / 7.5) : 1);
    want('enemy_ink_sizzle', alive && a.grounded && a.groundTeam === 2, 0.45, 1.0);
  }

  _padMenus() {
    const inp = this.input;
    if (!inp.pad) return;
    const pp = inp.padPressed;
    if (this.menus?.current) {
      const nav = (d) => this.menus.nav?.(d);
      if (pp.has(12)) nav('up'); if (pp.has(13)) nav('down'); if (pp.has(14)) nav('left'); if (pp.has(15)) nav('right');
      if (pp.has(0)) nav('accept'); if (pp.has(1)) nav('back'); if (pp.has(2)) nav('alt');   // X: locker shuffle etc.
      if (pp.has(4)) nav('tab_prev'); if (pp.has(5)) nav('tab_next');
      if (pp.has(3)) nav('alt');
      // left stick as d-pad with repeat
      const ly = inp.padAxis(1), lx = inp.padAxis(0);
      this._stickT = (this._stickT || 0) - 1 / 60;
      if (this._stickT <= 0) {
        if (ly < -0.6) { nav('up'); this._stickT = 0.22; } else if (ly > 0.6) { nav('down'); this._stickT = 0.22; }
        else if (lx < -0.6) { nav('left'); this._stickT = 0.22; } else if (lx > 0.6) { nav('right'); this._stickT = 0.22; }
      }
      if (pp.has(9) && this.menus.current === 'pause') this.resume();
    } else if (G.mode === 'match' && pp.has(9)) this.pause();
    else if (G.mode === 'match' && pp.has(8) && this.match?.practice) this.openPracticeLoadout();
  }

  _updateHud(dt) {
    const m = this.match, a = m.local, cam = G.camera;
    const _mm0 = performance.now();
    this.minimap.update(dt);
    Perf.record('minimap', performance.now() - _mm0);
    const w = a.weapon;
    // crosshair spread = the weapon's live cone (first-shot accurate, blooms with sustained fire / in the air)
    const vHalf = (G.camera.fov * Math.PI) / 360;
    const coneDeg = a.weaponRunner.spread ?? (w.kind === 'shooter' ? 5.5 : w.kind === 'blaster' ? 1.2 : 0);
    const spread = w.kind === 'roller' ? 28 : w.kind === 'brush' ? 22 : Math.min(90, (Math.tan((coneDeg * Math.PI) / 180) / Math.tan(vHalf)) * (innerHeight / 2));
    const players = [];
    const t = { x: 0, y: 0 };
    for (const o of m.actors) {
      if (!o.alive) continue;
      const tracked = o.team !== a.team && o.status.track > 0 && o.status.trackTeam === a.team;
      if (o.team !== a.team && !o.isLocal) {
        // enemies only show on the map when visible to your team (not submerged far away) — tracked ones always do
        if (o.anim.form === 'swim' && !tracked) continue;
      }
      this.minimap.toCanvas(o.pos.x, o.pos.z, t);
      players.push({ x: t.x / this.minimap.w, y: t.y / this.minimap.h, team: o.team, isSelf: o.isLocal, yaw: -o.yaw + (this.minimap.flip ? Math.PI : 0), alive: o.alive, color: G.teamHex[o.team], tracked });
    }
    // ally markers
    const markers = [];
    const v = this._mv || (this._mv = new THREE.Vector3());
    const W = innerWidth, H = innerHeight;
    for (const o of m.actors) {
      const tracked = o.team !== a.team && o.alive && o.status.track > 0 && o.status.trackTeam === a.team;
      if (!tracked && (o.isLocal || o.team !== a.team || !o.alive)) continue;
      if (o.character.getHeadPosition && o.form !== 'squid') { o.character.getHeadPosition(v); v.y += 0.45; }
      else { if (o.visualPos) o.visualPos(v); else v.copy(o.pos); v.y += o.form === 'squid' ? 1.0 : 1.9; }
      v.project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const onScreen = !behind && x > 20 && x < W - 20 && y > 20 && y < H - 20;
      let angle = 0;
      if (!onScreen) {
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; }
        angle = Math.atan2(dy, dx);
        const k = Math.min((W / 2 - 40) / Math.max(1e-3, Math.abs(Math.cos(angle))), (H / 2 - 40) / Math.max(1e-3, Math.abs(Math.sin(angle))));
        x = W / 2 + Math.cos(angle) * k; y = H / 2 + Math.sin(angle) * k;
      }
      markers.push({ x, y, name: o.name, color: G.teamHex[o.team], onScreen, angle, dist: o.pos.distanceTo(a.pos), tracked });
    }
    // contextual prompts (light tutorial)
    this._hintT += dt;
    let prompt = null;
    const inkF = a.ink / PLAYER.inkMax;
    if (m.state === 'playing' && a.alive) {
      const touch = !!this.touch;
      if (m.controller?.mapHeld) prompt = null;   // the map diorama carries its own super-jump hints
      else if (a.superJumpState) prompt = null;
      else if (this._lowInkFlash > 0) { this._lowInkFlash -= dt; prompt = touch ? 'Low ink! Hold SQUID in your ink to refill' : 'Low ink! Hold SHIFT in your ink to refill'; }
      else if (a.specialReady() && (this._hints.specialT = (this._hints.specialT || 0) + dt) > 2) prompt = touch ? 'Special ready! Tap SP' : 'Special ready! Press F';
      else if (inkF < 0.25 && a.form !== 'squid') prompt = touch ? 'Hold SQUID to swim in your ink and refill' : 'Hold SHIFT to swim in your ink and refill';
      else if (m.duration - m.time < 8 && !this._hints.shot) prompt = m.zones ? 'Ink the zone and hold it to count down!' : 'Paint the ground — most turf wins!';
      if (!a.specialReady()) this._hints.specialT = 0;
      if (a.intent.fire) this._hints.shot = true;
    }
    if (m.practice && m.state === 'playing' && a.alive && this._hintT < 7) prompt = this.touch ? 'Practice · pause menu → loadout' : 'Practice · L to change loadout · ESC for the practice menu';
    const strikeAim = !!(a.specialActive && a.specialActive.id === 'strike' && a.specialActive.aiming);
    // "Yeah!" cheers → screen positions over the cheering player (anyone on screen)
    const cheers = [];
    for (const c of G.specials.cheers) {
      const o = c.a;
      v.set(o.pos.x, o.pos.y + (o.smoothY || 0) + 2.25, o.pos.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      cheers.push({ x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, k: c.t / 1.1, color: G.teamHex[o.team] });
    }
    // death markers: screen spot (floating a little over where they fell), size by camera distance, minimap spot —
    // written into the pooled records the HUD reads (no per-frame garbage)
    const deaths = this._deathPool();
    for (const d of deaths) {
      if (!d.on) continue;
      d.ally = d.team === a.team;
      v.set(d.x, d.y + 0.95, d.z);
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      d.vis = v.z < 1 && Math.abs(v.x) < 1.08 && Math.abs(v.y) < 1.08;
      d.sx = (v.x * 0.5 + 0.5) * W; d.sy = (-v.y * 0.5 + 0.5) * H;
      d.sc = clamp(1.12 - dist / 60, 0.56, 1);
      this.minimap.toCanvas(d.x, d.z, t); d.mx = t.x / this.minimap.w; d.my = t.y / this.minimap.h;
    }
    if (a.specialActive && m.state === 'playing' && a.alive) prompt = G.specials.prompt(a) || prompt;
    else if (m.state === 'playing' && a.alive && m.actors.some((o) => o !== a && o.team === a.team && o.specialActive?.id === 'booyah' && !o.specialActive.thrown)) prompt = 'A teammate is charging a Cheer Orb — press C to cheer it on!';
    const frame = {
      time: m.practice ? null : m.time,
      teams: a.team === 1 ? m.teamSummary().reverse() : m.teamSummary(),   // HUD: [your team, theirs]
      ink: a.ink / PLAYER.inkMax, inkLow: a.ink < 18 || (this._lowInkFlash > 0), subCost: a.specialActive?.kind === 'barrage' ? 0 : (a.sub || SUB.bomb).inkCost / PLAYER.inkMax, subKind: (a.specialActive?.kind === 'barrage' ? a.specialActive.bomb : a.sub || SUB.bomb).kind,
      poisoned: a.status.poison > 0, tracked: a.status.track > 0,
      special: a.specialActive ? G.specials.remaining(a) : a.specialFrac(), specialReady: a.specialReady(), specialActive: !!a.specialActive, specialId: a.specialId,
      hp: a.hp / PLAYER.hp,
      weapon: a.weaponId, charge: a.weaponRunner.charge,
      twin: w.kind === 'twins' ? { planted: !!a.weaponRunner.turret, rolls: a.weaponRunner.rollsLeft() } : null,
      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },
      // corner minimap follows the setting; the TAB map (needed for super jumps) is always available
      map: (this.settings.minimap !== false || strikeAim) ? { canvas: this.minimap.canvas, expanded: strikeAim, strike: strikeAim, players } : null,
      markers,
      cheers,
      deaths,
      // a Super Jump planned on the TAB map while splatted ({ kind, target, name } | null): shown on the splat screen
      jumpQueue: !a.alive ? m.controller?.jumpQueue || null : null,
      prompt,
      fps: this.settings.showFps ? this.fps : undefined,
      // Zone Control: counts / penalties / the operational objective (HUD counters, objective chip, banners)
      zones: m.zones ? { ...m.zones.state(), viewer: a.team } : undefined,
    };
    this.hud.update(dt, frame);
  }
}

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot-error');
  if (el) { el.textContent = 'Something went wrong while loading: ' + e.message; el.style.display = 'block'; }
});
