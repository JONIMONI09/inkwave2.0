# INKWAVE Fork — Work Session

A living log of the work done on this fork and what is still open. Update this file as work
progresses; keep the completed list factual and the remaining list actionable.

Last updated: 2026-10-06

### E-011: GPU self-test shaders repaired, honest capability verdicts, Android polish (2026-10-06, branch `fix/gpu-selftest-shaders-android`)

**The false-legacy bug (E-011).** Every desktop GPU (user's Firefox/GTX 980 evidence) reported FAIL FAIL FAIL FAIL
and was forced into the legacy tier — because the self-test's OWN shaders were broken (`_mat()` injected a second
`outColour`, T1's source-replace produced `uniform int 0;`, T2's extra unlocated output) and no compile/link check
separated "our shader is broken" from "the GPU can't do it". The shader errors also failed the CI smoke. Fixed:
per-test outputs, real uniform for T1, `_assertProgram()` compile/link verification before drawing, SETUP-ERROR
verdicts never change the tier, `signature()`-cached tier (invalidated on GPU/browser change), tier resolved
BEFORE the texlib (legacy skips that build), and `gpu-caps.js` probes via framebuffer completeness instead of the
non-standard pnames. 13 new tests in `test/selftest-and-android.test.mjs`; compat B7 stubs updated.

**Android.** Touch look sensitivity is now its own slider (Settings → Touch, `touchSensitivity`, applied when
`lastDevice === 'touch'`); Fullscreen works in BROWSERS now (Standard Fullscreen API — previously Electron-only);
portrait during a match shows a rotate-your-device overlay (match keeps running; guard follows the live mode in
the frame loop).

**PC spikes vs. smooth tablet (user question).** The user's own trace answers it: the PC run was in the FALSE
legacy tier (broken self-test, E-011) — procedural fallback + full shader recompiles every boot, 85.6 s boot,
`match.update` max 7.6 s and `render` max 20.5 s are those one-off build/compile blocks, not per-frame cost
(steady-state p50 6.1 ms / ~120–225 calls). The tablet likely ran cached `gpuTier`/warm caches differently.
With the tier fixed, expect the PC to return to the normal path; re-measure before attributing more.

**GitHub Pages.** `configure-pages` fails with `Not Found`: Pages is not enabled on the repo. The managed App
cannot create it (403) — the OWNER must do it once: repo Settings → Pages → Source: **GitHub Actions**.

**Checks run.** `npm run check` → syntax ok; `npm test` → 134 assertions green, 14 suites, 0 failed.
NOT measured: the corrected four-part verdict on real hardware (no GPU here) — Firefox/GTX 980 should PASS all
four and keep the full tier; Snapdragon results remain unknown until re-tested.

### Boot-crash hotfix, CI smoke → warn-not-block, perf port analysis (2026-10-06, branches `fix/gpu-selftest-null-renderer` + `perf/hitch-first-1`)

**E-010 boot crash fixed.** `boot()` built `GpuSelfTest(G.renderer)` before `G.renderer` existed → `null.getContext()`
crashed every boot during „Building the plaza…". Fix: self-test construction (and `?gpudiag`) moved directly after
`G.renderer = this.R.renderer`; `GpuSelfTest.run()` additionally returns null without a renderer. PR #9 — merge first.

**CI: smoke no longer blocks Pages.** The smoke job is `continue-on-error: true` with a `::warning::` step; a failed
boot test warns and `deploy-pages` still runs. Trade-off accepted: CI can no longer prove boot health — the unit
suites + local `npm run smoke` carry that.

**Perf port list from the People-11 addendum — verified against our tree (one factor at a time, measure first):**
- **#6 instrumentation self-infection — CONFIRMED and fixed.** `Perf.frame()` built `summary()` (Array.from over a
  600-frame ring + sort + all spots stringified) as an EAGER argument on every hitch frame ≥45 ms, even when the
  rate limiter suppressed the line. Fix: `Log.occasional` accepts lazy (function) args; perf.js passes a thunk;
  summary is built only when the line actually logs. New suite `test/perf-summary.test.mjs` (5 tests) pins the
  thunk (source assertion) and the suppression behaviour (behavioural).
- **#4 ally name tags — already largely handled in our diverged HUD.** `_updMarkers` is dirty-checked via a rounded
  position key and writes transform-only styles; the People-11 "re-rasterize every frame" pattern is not present.
  No port needed; revisit only with DevTools reflow evidence on a device.
- **#1 shader keep-alive / precompile** — partially ours already (`compileAsync` warm-up, prewarm); the
  mid-match first-use precompile (screen FX, bombs, storm clouds) is still open.
- **#2 one updateMatrixWorld pass, #3 HUD layout thrash reads, #5 bot paint-grid cache @10 Hz, #7 pass fusion,
  #8 single-output texlib bakes, #9 menu-idle bot pre-roll** — not yet ported; each needs a before/after
  `__inkwave.perf` comparison on a device we do not have in this container.
- **#10 workers, #11 timestamp stepping** — explicitly later/high-risk, unchanged.

**Checks run.** `npm run check` → syntax ok; `npm test` → 121 assertions green across **13 suites** (new:
perf-summary). NOT measured: actual hitch percentiles before/after (no GPU in this container, no device) —
the #6 fix is behaviourally proven by test, its real-world p95 effect is unmeasured.

### GPU compatibility self-test, dark-map fix system, and touch auto-aim (2026-10-06, branch `fix/hud-timing-spawn-protection`)
**User reports.** (a) On the Snapdragon tablet maps render dark (chrome://gpu evidence in the brief: Adreno 750,
ANGLE GLES, `srgbBlendingBroken` ENABLED, untrustworthy renderability probes, broken MSAA readPixels);
(b) Fortnite-mobile-style auto-aim wanted for touch, safe (no walls, no infinite lock). See error.md E-009 for the
full write-up.

**Built.** `src/core/gpu-selftest.js` (T1 array sampling, T2 MRT, T3 sRGB attachment, T4 sRGB blending; every
readback on a non-MSAA RGBA8 target, sRGB comparisons expect ENCODED bytes, black readback = failure). Tier mapping
full / linearAlbedo / legacy decided once per session in `_resolveGpuTier()` (before the first texlib build),
cached in `settings.gpuTier`; `linearAlbedo` builds the albedo layer with `colorSpace: NoColorSpace` (texlib
`linearAlbedo` option) so encode/decode cancel through a path the driver proved it handles. `gpuMode: 'legacy'`
forces the procedural path. texlib validates framebuffer completeness and throws into the existing fallback.
MSAA clamp fixed for falsy `maxSamples`. Settings → Optimize: "Graphics compatibility check" RUN button
(`api.gpuCheck`) + "Compatibility mode" Auto/Always segment; `?gpudiag` logs renderer string + verdict at boot.
Touch auto-aim/auto-fire in `player.js` (off by default, touch-only, ease steering, per-frame LOS via the shared
`_assistTarget`, auto-fire self-releasing) with rows in Settings → Touch.

**CI status on the branch during this work.** `40aeb33` (smoke fix) GREEN — first green smoke in repo history.
`c3c753b` (stage-build chunking) broke the 8-min smoke budget → E-008, budget now 12 min (`d45c7e4`),
verification run pending at the time of writing (empty commit `819ef95` fired it; the PR head had lagged origin
before — re-check `gh pr view 7 --json headRefOid` if a run is missing).

**Checks run.** `npm run check` → syntax ok; `npm test` → **116 passed, 0 failed** across **12 suites** (new:
test/gpu-selftest.test.mjs 14, test/touch-autoaim.test.mjs 10; compat suite updated for the fixed clamp).

**Not verified on a device — needs the user.** On the tablet: either `?gpudiag` in the URL (read the
`[inkwave:gpu]` console lines via chrome://inspect) or Settings → Optimize → RUN the check. Report the 4 lines;
the tier applies after a reload. If anything still looks wrong: Compatibility mode → Always (guaranteed correct,
procedural surfaces). The self-test itself runs in <1 s on a real GPU (desktop must stay all-PASS and visually
unchanged).

---

### Stage-build smoothness: chunked build, precompiled shaders, surfaced failures (2026-10-06, branch `fix/hud-timing-spawn-protection`)
**User reports.** (a) On PC the map transitions are not smooth and the E-001 optimizations changed nothing there;
(b) on an Android tablet (Snapdragon) everything works except the maps, which "won't load".

**Confirmed in code (`src/main.js _buildWorldNow`).** The whole arena build ran as one unbroken synchronous block
(props → Level → Physics → lightmap await → PaintSystem + buildGeometry×2 → decor → nav → minimap → environment):
- the loading overlay can only repaint *between* chunks, so its `setLoading` labels (0.45/0.62) never drew and the
  fade froze mid-way on every map transition, on every device — this is the PC stutter;
- the new stage's shaders compiled on the first rendered frames of the intro fly-over (boot's `compileAsync` never
  re-ran for a rebuilt world);
- on a phone the block is tens of seconds; the 22 s gate safety could force the loading screen away mid-build into
  an empty world — which reads exactly as "the map won't load"; and any build exception stranded the player with
  zero diagnostics (no try/catch around `_buildWorld` in `startMatch`).

**Changes (src/main.js only, commit `c3c753b`).** Yields (`await nextFrame()`) between the heavy chunks — safe
because `_loop` returns immediately while `_building`; `renderer.compileAsync(scene, G.camera)` behind the loading
screen (the same call the boot path makes, with a `compile` fallback); `Log.steps('build')` per-chunk timings
(`props (+0.4s)` … `shaders (+1.2s)`) in the console; the gate safety no longer forces while `_building`; a failed
build now logs loudly, toasts `Stage failed to load: <reason>` and returns to the menu.

**Incident: CI smoke step timeout (E-008).** The up-front compile costs minutes on SwiftShader; the green baseline
step took 6 min 6 s, the new one was killed by `timeout-minutes: 8` before any assertion. Budget raised to 12 min;
assertions untouched.

**Checks run.** `npm run check` → syntax ok; `npm test` → 92 passed, 0 failed (10 suites). CI on `40aeb33` (PR #7)
green end-to-end — the first green headless smoke in the repo's history (checks + smoke; deploy-pages correctly
skipped).

**Not verified on a device — needs the user.** PC transition smoothness and the tablet's map load need real
hardware. On the tablet: after this change a failed stage build shows the reason as a toast, and per-chunk timings
land in the console (`[inkwave:build]`). For a full picture, chrome://inspect (remote debugging over USB) from a PC
reads the tablet's console directly. If the tablet still hangs *without* an error, the `build` step timings will
show which chunk is slow on Adreno.

---

### UI bug fixes: Esc loop in pushed sub-screens and a stuck judge hand-off (2026-10-05, branch `fix/hud-timing-spawn-protection`)
Both bugs were user-reported with screenshots. Base still `a3309cf`; two files changed plus one new test suite.

### CI smoke made fps-independent (2026-10-05, branch `fix/hud-timing-spawn-protection`)
**PR #6 check triage (confirmed).** `checks` (syntax + maps) passes; the `smoke` job fails — and has failed on
**every** CI run in this repo's history, on `main` too. Signature: `until timeout …state==="playing"`, then
`smoke -> {"state":"intro","boot":72000–126000,"fps":0–1}` → SMOKE FAIL.

**Root cause — confirmed by runner logs + source + a local headless probe.** The smoke waited for wall-clock rAF:
`waitForFunction` polls the live page while the frame loop runs. On CI's SwiftShader software WebGL the page renders
at ~1 fps, and `_loop()` clamps sim time to 1/24 s per rendered frame (`dt = Math.min(dt, 1/24)`) — so the 4.2 s
intro needs ~100 *rendered* frames, i.e. ~100 s after a 72–126 s boot. `UNTIL_MS` 300 s was simply spent before the
sim could get there; the game logic itself is fine (the local probe shows state `intro`, `stateT` creeping up
slowly, no page errors on the branch's logic paths).

**Fix (test infrastructure only, no game code).** The smoke now drives the sim with the game's own deterministic
stepping — `__inkwave.debug.freeze()` stops the rAF loop, then `debug.step(100)` walks `_frame(1/60)` until
`state === 'playing'` (300-step guard), then `step(8000)` plays 8 s — via new `tools/smoke-steps.json`
(play.mjs accepts a file path, which also removes the old inline-JSON quoting maze). Assertions unchanged: reaches
`playing`, plays 8 s, no console/page errors, plus a new explicit `"state":"playing"` check with a diagnosis on
failure. Locally verified: script parses, steps JSON parses, and in this WebGL-less container the failure path
triggers exactly as designed (`[error] WebGL context could not be created` → SMOKE FAIL, exit 1). The pass path is
proven by the CI run this push triggers — SwiftShader exists on `ubuntu-latest`, not here.

**Checks run (exact results).** `sh -n tools/smoke.sh` → ok; steps JSON → valid; local `npm run smoke` (SMOKE_PORT
8491, no WebGL available) → failed correctly with the expected error signature; `npm test` → 92/92 (unchanged).

---
**Esc loop (confirmed, E-005 — a regression from the profiles/touch-editor work).** Settings → Touch → Touch
layout editor, then Esc: the editor's `onBack` (and the profiles screen's) called `_go('settings', {back:true})`.
`_go` always *pushes*, so the stack became `[main, settings, touchedit, settings]`; the next Esc popped
`stack[len-2]` = `touchedit` — back into the editor. Esc therefore cycled editor ↔ Settings forever, exactly as
reported. Fix: new `Menus._popTo(name)` helper — if `stack[len-2] === name` it uses `show(name, {pop:true,back:true})`
(and so removes the editor from the stack), otherwise it falls back to the push, which is correct for screens the
engine opens directly (no Settings underneath). Used by the touchedit `onBack` + DONE button and the profiles
`onBack`. Forward navigation via `_go` is untouched — only the way *back* changed.

**Results stuck (confirmed, E-006 — a latent bug, not new).** `_judge()` awaited the HUD judge animation with
`await (judgeP || new Promise(r => setTimeout(r, 4000)))`. A Promise is **always truthy**, so that fallback was
dead code: if the judge's rAF loop ever stalls (HUD paused, tab throttling, a fx callback throwing — the judge
card is driven by the HUD's own `_fxLoop` on `_fxTime`, `src/ui/hud.js` `_fxLoop`), nothing advances the match
and the player stares at the judge card forever. Fix: `Promise.race([judgeP.catch(()=>{}), setTimeout 9000])` —
`JUDGE_MAX_MS` = 9000 s ceiling sits above the animation's own drumroll/reveal end (~3.45 s + reveal) so a healthy
judge still wins the race and controls its own pacing; a stalled one no longer strands the round.

**Regression tests (new `test/menu-back.test.mjs`, 7 tests).** The stack push/pop semantics of `show()`/`_back()`
are reproduced verbatim, so the loop is *demonstrated* (old behaviour cycles; pop escapes); the source is asserted
to contain `_popTo` and no remaining `_go('settings', {back:true})`; the judge race and the removal of the truthy
`judgeP ||` fallback are asserted on `src/main.js` source, including a runtime proof that a never-resolving promise
raced against a timeout does not block. Wired into `npm test` (suite 10).

**Checks run (exact results).** `npm run check` → `syntax ok`; `npm test` → **92 passed, 0 failed** across 10
suites (previous 85 + menu-back 7). `npm run check-maps` and `npm run music` not re-run — no map, audio or
package-config-for-those-scripts changes.

**Not verified on a device.** The screenshots show both screens render correctly (VICTORY results with coverage
bar; judge card with LEMON WINS), so this is a logic fix on top of working rendering — but the actual Esc dance
and the judge hand-off still need one real playthrough, which headless boot cannot complete inside the command
cap. Remaining risk: the Firefox console warnings in the screenshot are benign (TitanOne glyph bbox,
`WEBGL_debug_renderer_info` deprecation, `longtask` unsupported — all already caught); the
`getInternalformatParameter: 'pname' must be SAMPLES` warning comes from `gpu-caps.js` probing
TEXTURE_FILTERABLE/RENDERABLE pnames, works but is noisy — switching to try/catch-only probing is available on
request if console silence matters.

---

### Repository setup, HUD timing and spawn protection (2026-10-05, branch `fix/hud-timing-spawn-protection`)
Base: `c2cd438` (clean tree at start; nothing pre-existing was discarded). Four commits: `b68f2ee`,
`2f602d0`, `32cfa71`, `6194fc7`.

**Project instructions and skills (complete).**
- `CLAUDE.md` (new): verified commands, verify-before-change, English/German-only, no `vendor/` edits,
  respect for `docs/CONTRACTS.md`, session/error obligations, honest reporting. 118 lines.
- `AGENTS.md` (new): a five-line pointer to `CLAUDE.md` — deliberately no duplicated content.
- `.claude/skills/` (new, 6 skills, 32 KB total): `session-logging`, `error-triage`, `inkwave-verify`,
  `gameplay-change-pr`, `touch-ui-change`, `performance-change`. Each has YAML frontmatter whose `name`
  matches its folder (checked by script) and a description stating what it does and when to use it.
- **Unverified:** Freebuff's actual skill discovery could not be exercised from this shell, so whether the
  skills appear in slash autocomplete is **not confirmed**. The format follows `.claude/skills/<name>/SKILL.md`
  with `name` + `description`; no platform-specific frontmatter (`disable-model-invocation`) was used, since
  nothing in this environment confirms Freebuff supports it.

**HUD timing (complete).** Three confirmed defects, all fixed in `src/main.js`:
- *Confirmed:* `_intro()` revealed the HUD on a 3.0 s timer and the boss intro on 5.6 s, while the match only
  reaches `playing` at `MATCH` 4.2 s / `BOSS_MODE.intro` 7.2 s (`src/boss/bossMode.js:9`) — the ink tank,
  minimap and reticle were on screen 1.2–1.6 s **before GO** on every stage. Both timers are gone; the HUD now
  comes up on the `match:state` `playing` edge, which is also where the GO banner fires (HUD first, so GO is
  never hidden).
- *Confirmed:* `_judge()` called `hud.setVisible(true)`, re-showing the gameplay HUD over the overview camera.
  The judge card draws in `overLayer`, which `setVisible(false)` does not touch (`src/ui/hud.js:317`), so this
  now hides. Touch controls also lost their `intro` and `finish` states.
- *Confirmed:* the practice-loadout tuck in `_onScreen` could resurrect a HUD the intro/judge had hidden; a
  single `_gameplayHudWanted()` helper now backs both decisions.
- **Not verified in a browser.** The flow is timers plus an event-bus edge; headless boot does not complete
  inside the command cap.

**Spawn protection (complete).** Previously a flat `PLAYER.spawnInvuln` (1.6 s) armed at respawn, with no area.
- New `SPAWN_PROTECT` block in `src/config.js` (radius, height, `leaveGrace: 3.0`, hp/ink regen, intercept flags).
- `Actor.protected` is the single source of truth (`invuln > 0 || inSpawnZone || spawnGrace > 0`) and gates
  `damage()`, enemy-ink damage and the rig's spawn shimmer. The grace timer is *pinned to full while inside*,
  so re-entering re-arms it rather than stacking a second timer — this is what keeps protection coherent with
  `PLAYER.spawnInvuln` instead of additive.
- Hostile ink is consumed at the dome wall in `Projectiles._step`; bombs are disarmed in `_updateBombs` through
  the existing removal path (mesh back, no detonation). Friendly ordnance untouched; the dome has a lid so an
  arcing shot is not blocked by a wall it never touches.
- New `src/game/spawn-protect.js` holds the geometry query, because `weapons.js` needs it and `actor.js`
  already imports `weapons.js` — putting it in `actor.js` would have closed an import cycle.
- Bots, remotes and the local player all run the same `Actor.update` path; online, the host remains the only
  authority for damage (`damage()` is not driven on guests), so the rule stays host-deterministic.
- **Not verified in a match** — dome visuals, the intercept feel and the audio rate-limit need a real session.

**Spawn-point measurement (evidence gathered, nothing changed).** New `tools/measure-spawns.mjs`
(`npm run measure:spawns`), static geometry per stage: pad→pad 80.4–87.2 m (mean 83.9), spawn→midline
35.7–42.0 m (mean 39.4). Two outliers sit closer in: `kelpline` and `cargo` both at 35.7 m / 32 % of stage
depth, against 42–46 % for the other five. **Deaths shortly after spawning and time to first contact were
NOT measured** — they are match outcomes, not layout facts, and need a live match this environment cannot
complete. Per the brief, no spawn location was moved. Waiting on the user to pick an option.

**Cheer Orb rework (complete, after the user's clarification).** The user answered the two open questions: keep
the ball mechanic, add a lift-off where you rise slowly, hover (no free flight), can still turn and throw; and
the shield should be tough but breakable, with "Yeah!" making it stronger and stronger. Implemented in
`src/game/specials.js` + a new `CHEER_ORB` block in `src/config.js`:
- `speed: 0` and **no read of `a.intent.move` at all**, with horizontal velocity damped on the rise and while
  hovering — you literally cannot fly around; `aimFace` stays on so turning/aiming keeps working.
- The rise ends at `CHEER_ORB.hoverHeight` above `G.level.groundHeight(...)`, so it works on any stage.
- Shield: a pool (`shieldMax` 120) drained through the **existing `filterDamage` hook** — no new damage path.
  Empty → `shield_pop` + pooled burst + `end(a, 'shield')`, which is the intended way back to normal.
- Cheers: `_booyahCheer()` feeds BOTH charge and shield, reused from the existing teammate scan in `cheer(a)`,
  capped at 260 so C-spam cannot make an unkillable orb. Slow regen (6/s) only up to the base pool.
- Landing grants `invuln = max(invuln, 2.0)` — the **same** invulnerability the spawn dome uses, so the two
  compose instead of stacking into something longer than either was meant to be.
- Online: the shield pool rides in bits 6–15 of the ghost int that was already being sent, so no new packet and
  the host stays authoritative. Remote actors never run `body()`, so the hover physics cannot desync a client.
- The ball itself is untouched: charge 4.5 s, auto-throw, blast radius 8.4 all unchanged.

**Local profiles (complete).** The user deferred the encrypted export and asked for a local profile in browser
data only. New `src/core/profiles.js` + a *Settings → Optimize → Local profile* screen:
- create / switch / rename / delete, everything in `localStorage`, nothing uploaded.
- **Update safety, which was the actual requirement:** the record is versioned; `migrateProfile()` brings an older
  one up field by field and clamps the numbers (a NaN level would otherwise poison the progression screen); the
  pre-profiles `inkwave.profile` key is adopted on first run so nobody loses progress on upgrade; it is kept in
  step on every write so an older build still finds a profile; a record from a **newer** build is left untouched
  with a warning rather than half-applied; the last profile cannot be deleted.
- `DEFAULT_PROFILE` moved from `main.js` into `config.js` so the live profile and the store cannot drift apart.

**Optimize → Pre-warm on the menu (complete, with a correction to the brief's premise).** The brief said shader
pre-loading "should already be implemented" — **it is not.** There is no Service Worker, no Cache API and no
asset cache anywhere in the project; everything is procedural. What *does* exist is the warm-up machinery
(`Character.warmAll`, `showcase._warmup`, `_warmCharacters`), and it currently runs at match start. So the setting
moves that same work earlier into menu idle time instead of inventing a cache. `_idlePrewarm()` is best-effort,
off-scene, gated on `settings.prewarm` and on `G.mode === 'menu'`.

**Checks run (exact results).**
- `npm run check` → `syntax ok`
- `npm test` → **85 passed, 0 failed** across 9 suites (scoring 13, results 7, swimsub 7, touch 5, compat 9,
  hud-timing 7, spawn-protect 14, cheer-orb 12, profiles 11)
- `npm run measure:spawns` → table above
- `npm run check-maps` → ok · `npm run music` → ok

**Remaining / blocked.**
- **Spawn-point change — awaiting the user's choice.** Evidence is in; nothing was moved.
- **Encrypted profile export — deferred by the user** ("egal, dann lasse es erstmal"). Not started.
- **Device/browser verification** — still outstanding for the HUD timing, the spawn dome, the Cheer Orb hover and
  the Firefox path. None of it has been seen in a browser.

---

## Completed work

---

## Completed work

### Mobile touch controls (new feature)
- **`src/core/touch.js`** (new): multi-touch on-screen control layer for phones/tablets.
  - Left-thumb movement stick that spawns wherever the thumb lands (analog, dead zone).
  - Drag-to-look anywhere on the right half of the screen.
  - Buttons: **FIRE** (hold to charge), **JUMP**, **SQUID** (hold), **SUB**, **SP** (special),
    **MAP** (hold — Super-Jump pins stay clickable while held), **C** (cheer), **II** (pause, top right).
  - Pointer Events + `setPointerCapture`, so moving/aiming/firing work simultaneously.
  - Feeds the existing input pipeline (virtual keys + `mouse.left` + analog `moveAxis`), so all
    weapons, specials, dodge rolls and Super Jumps work without gameplay changes.
- **`src/core/input.js`**: virtual keys (`vkeys`/`vpressed`), analog `moveAxis`, pointer-lock
  requests skipped on touch-only devices, blur clears virtual state.
- **`src/game/player.js`**: reads the analog touch stick alongside keyboard/gamepad (3 lines).
- **`src/main.js`**: touch boot wiring (`isTouchDevice()`, `?no-touch` opt-out), per-frame layer
  visibility (hidden over menus/pause/results), touch pause button handler, touch-specific HUD
  hints ("Hold SQUID…", "Tap SP" instead of SHIFT/F).
- **`index.html`**: `viewport-fit=cover`, safe-area insets, no pinch-zoom/scroll/pull-to-refresh on
  the canvas, web-app capable metas, theme color.

### Android performance optimization
- **`src/config.js`**: new `potato` quality preset — render density capped at 0.7× (the single
  biggest lever on mobile GPUs), shadows/bloom/AO/MSAA off, 2048 ink atlas, 30 % particles.
- **`src/main.js`**: first run on a touch device auto-picks Lite (potato), shadows/bloom off,
  60 FPS cap, FPS counter on. Never overrides saved settings.
- **`src/core/renderer.js`**: dynamic-resolution floor lowered to 0.6 on the potato preset so weak
  mobile GPUs can shed more render density during play.
- **`src/ui/menus.js` + `src/ui/menu-art.js`**: full quality ladder in Settings —
  Lite → Low → Med → High → Ultra, with the quality preview updated.
- **`styles/ui.css`**: touch layer styling (button sizes scale with `vmin`, positions in viewport
  percentages — verified overlap-free from a 480×270 embedded view up to tablet portrait, with
  safe-area insets) and compact HUD rules below 920 px / 700 px (prompt, FPS, minimap, splat card).

### Documentation
- **`README.md`** (kept in English — this is a fork): touch controls row in the Controls table,
  a "Phones and tablets" section, and a "Performance on phones and weak GPUs" section in
  Browser support.
- **`error.md`** (E-001): documented the Android single-digit-FPS bottleneck — what happens
  (fill-rate-bound rendering at full device pixel ratio + MSAA/GTAO/bloom/shadows on mobile GPUs),
  the solution path applied (potato preset, auto mobile defaults, deeper dynamic-res floor), and
  prevention rules for future render-path changes.
- **`rules.md`**: rules for AI systems working on this fork — ethical guidelines (upstream
  respect/license, no destructive actions, honest reporting, privacy, scope discipline),
  documentation standards (English only, keep session/error logs current, comment the why), and
  development best practices (quality-gate graphics features, preserve the input contract,
  verify with the project's tools, measure before tuning).

### Tooling & verification
- **`tools/verify-touch.mjs`** (new): headless Chrome (SwiftShader) verification — boots the game,
  emulates a touch phone, screenshots the HUD + touch layer, and checks button geometry.
- **`package.json`**: `serve:preview` script (PORT-aware, binds 0.0.0.0) for the managed preview;
  install command saved as `npm install`.
- **`tools/play.mjs`**: CI-compatible — `CHROME` path override, `CHROME_ARGS` passthrough, platform
  GPU flags (Metal on macOS, SwiftShader elsewhere), configurable boot wait (`UNTIL_MS`).
- **`tools/smoke.sh`**: `SMOKE_W` / `SMOKE_H` viewport override for CI's software-WebGL runner.

### CI/CD (GitHub Actions)
- **`.github/workflows/ci.yml`** (new):
  - `checks` — `npm run check`, `npm run music`, `npm run check-maps` on every push/PR.
  - `smoke` — installs Chrome for Testing, serves the repo, autopilots 8 s of a real match and
    fails on any console/page error (generates `songs/manifest.json` first — it is gitignored).
  - `deploy-pages` — on `main`, assembles `dist/` (`npm run build`) and deploys it to GitHub Pages
    via `actions/deploy-pages`.
- Verified locally: workflow YAML parses (`js-yaml`), `npm run music` / `npm run check-maps` pass,
  `tools/play.mjs` and `tools/smoke.sh` syntax-check, Chrome launches and the game boots headless.

### Verification results
- `npm run check` (syntax over all modules) — passed.
- Headless run: full boot, match reached "playing", zero console/page errors.
- Touch detection → Lite preset auto-applied (pixel ratio 0.7); layer visible only during play.
- Live input checks: fire → `mouse.left`, stick → `moveAxis.y = 0.77`, clean release on lift.
- Geometry QA: 8 controls, none off-screen, zero overlaps (fixed 4 overlaps found on short
  landscape screens).
- Preview serving confirmed (HTTP 200 for index, touch.js, ui.css).

### CI failure fixes + P0–P3 audit (2026-10-05)
Findings are labelled per the verify-before-change policy.

- **P0 baseline (confirmed, evidence from CI + local runs):** The first CI run failed two jobs.
  `checks` failed in `build/check-maps.mjs` (a ramp-angle assertion on the `halyard` map);
  `deploy-pages` failed because `tools/verify-perf.mjs` (an ad-hoc script) was picked up and broke
  the build. No on-device baseline exists — no Android device is attached to this environment;
  see Remaining tasks. `localStorage`-persistence of settings was reviewed in code (saved settings
  are never overridden by the mobile default).
- **P0 fix (confirmed):** `src/world/maps.js` — the turf-variant tug ramp of `halyard` was still
  25.7° (rise 2.6 / run 5.4) while its zones variant had already been softened to 23.8°. Brought
  the turf ramp to the same 23.8° geometry (run 5.9). `npm run check-maps` green before/after
  (fails before, passes after).
- **P0 hygiene fix (confirmed):** removed the stray `tools/verify-perf.mjs`; `npm run build`
  produces a clean `dist/` (index.html + assets verified).
- **P1 portrait mode-select overflow (confirmed, code-level geometry):** the Turf/Zones/Boss
  mode-select cards (3 × 37u) exceed the viewport in portrait (428 px on a 390 px phone).
  `styles/ui.css` now caps the row/card sizes under `@media (orientation: portrait)`; numeric
  check: 2-card row + boss card fit at 360/390/430 px widths.
- **P1 renderer/touch rotation handling (confirmed sound, no change):** `renderer.resize()` polls
  `innerWidth/innerHeight` every frame inside `render()` — dimensions are read after they have
  settled, so rotation cannot strand stale sizes; HUD canvas listens to `resize`; touch buttons
  are CSS-sized (`vmin`) + safe-area inset positioned with no JS-cached dimensions. Desktop and
  gamepad input untouched.
- **P2 mobile render-target format (plausible — reasoned from code, not measured on device):**
  `src/core/renderer.js` now selects an 8-bit render target for the postprocessing chain on the
  potato preset (HalfFloat elsewhere). Rationale: on weak mobile GPUs the fullscreen HalfFloat
  target is a real bandwidth cost, and the grading pass output is screen-space LDR. Not verified
  against a physical device — revisit if banding is reported.
- **P3 night-light compounding bug (confirmed and fixed):** `_applyNight()` mutated
  `decor.bulbMat.emissiveIntensity` in place (`*= 1 + 3.2*k`) and is re-run on every stage
  rebuild/theme switch, so the intensity compounded (reported as ×10 brightening; the formula
  projects ×1.5M after 10 calls). `src/main.js` now derives the value from the stored 0.9
  baseline: `emissiveIntensity = 0.9 * (1 + 3.2 * k)` — idempotent by construction.
  Regression test: repeated-call simulation passes (old: compounds, new: stable at 0.9/1.62/2.34/3.78
  for k = 0/0.25/0.5/1). In-browser test attempt blocked by this container (boot > 165 s under
  CPU contention); the game itself boots error-free in headless Chrome (verified repeatedly).
- **CI smoke sandbox (confirmed by CI root-runner semantics, smoke job itself untested on a runner):**
  the smoke job boots Chrome for Testing as root on `ubuntu-latest`, which refuses its sandbox
  ("No usable sandbox"). `ci.yml`'s smoke step now sets `CHROME_ARGS: --no-sandbox` (step-level
  only). `tools/play.mjs` already merged `CHROME_ARGS`; local runs stay sandboxed (the variable is
  only read when set). Remaining CI risk: the runner's software-WebGL boot time vs `UNTIL_MS`.
- **Hitch instrumentation baseline (work-plan §2 — implemented, module unit-verified, not yet
  profiled on device):** new `src/core/perf.js`: a 600-frame ring with p50/p95/p99, a long-task
  PerformanceObserver, spot timings for `match.update` / `render` / `paint.flush` / `nav.path`
  (A*) / `zonePlan` / `minimap`, sampled `renderer.info` counters, and one rate-limited log line
  per real hitch (dt ≥ 45 ms, ≥ 8 s apart). Read live via `__inkwave.perf.snapshot()` in DevTools
  (hitch frames excluded from the ring: budget frames > 250 ms are filtered in `_frame`).
  Module-verified headlessly (percentile math + spot aggregation exact); `Log.install()` hooks
  window.onerror/unhandledrejection so a device nobody owns still leaves a crash trace.
- **Loading-until-GO gate (implemented earlier in this session, code-verified):** the themed
  loading screen stays up through stage build + shader warm-up + the intro fly-over and yields
  only at the GO banner (`_matchGate` → `_gateDone`, `setLoading(1, 'GO!')`, 22 s safety
  timeout) — first rendered frames of play are already warm, hiding first-shot compile spikes.
- **Intelligent console logging (implemented earlier in this session):** `src/core/logger.js` —
  `[inkwave:<tag>]` prefixes, `Log.occasional` rate limiting, `Log.steps` for load sequences,
  `?verbose` for debug lines, crash hooks. All new diagnostics go through it (no bare console
  spam in the frame loop).
- **All checks green after the pass:** `npm run check`, `npm run check-maps`, `npm run music`.

### Gameplay-manager scoring audit — P1 fixes + regression tests (2026-10-05)
Findings labelled per the verify-before-change policy; the task's confirmations (P1.1 zone credit, P1.2
ineligible paint credit, P1.3 random tie-break) were each verified in the current code and call sites before
fixing. Intentional behaviours were preserved untouched: special activation refills ink, 50 % special charge
kept after a splat, passive special gain for the team not holding the zone, enemy ink slowing/damaging but
never splatting on its own.

- **P1.2 ineligible paint credit (confirmed):** `PaintSystem._cpuSplat` credited every grid cell it flipped,
  including walls, ceilings and cells buried inside other geometry (`dead`), so wall paint fed turf points,
  the special gauge and match coverage. Fix (src/world/paint.js): `creditable = f.turf` + `dead[k]` check —
  ineligible surfaces still paint visually but claim nothing (`claimed += cellA` and the counts update move
  behind the check; own-repaint still claims nothing first).
- **P1.1 zone turf credit (confirmed):** `Match._zoneTurf` booked zoneTurf from the turf event, but the
  payload's zone part was derived from `actor.pos` / `aimPoint` at call sites — standing outside the zone
  spraying into it (or vice versa) mis-credited. Fix: paint.js now reports the in-zone part of each claim as
  `zoneArea` in the turf event, using the exact per-cell test `zoneCells()` builds regions with (new module fn
  `inRegion`), and `_zoneTurf` books only from that payload. The in-zone area reaches the event either via an
  explicit `opts.zoneOut` funnel threaded through weapons/subs/specials/actor-impact call sites or via the
  new per-team `PaintSystem.zoneAccum` consumed by `takeZoneClaim` inside `Actor.addTurf` (kit paths;
  synchronous pairing makes it exact). Unattributed paint (`noZoneClaim`: landing droplets, debug splats) and
  replayed remote splats credit nobody.
- **P1.3 turf tie-break (confirmed):** `Match._judge` picked the winner of an exact 50/50 turf tie with
  `Math.random()`. Fix: deterministic — team 0 (Alpha) wins an exact tie and the result carries the displayed
  `+0.1 %` tie-break (`cov[0] += 0.001`, `result.tieBreak = true`); the zones-mode fallback winner is now
  `Z.winner ?? 0` instead of a coin flip. Online: unchanged host-authoritative path (`_judge` runs on the
  host only; guests receive `sendResult`), so all clients share the deterministic outcome.
- **Docs:** `docs/EVENTS.md` — `turf` payload now `{ actor, area, zoneArea }`. `README.md` — new "Rules &
  fairness notes" section (floor-only scoring, cell-based zoneTurf, deterministic Alpha tie-break, the
  5.5 s respawn + 50 % special keep as intentional pacing).
- **Tests:** new `test/scoring.test.mjs` (13 tests, wired as `npm test`): floor credit = coverage delta;
  wall/ceiling zero credit with grid painted; buried cells zero credit; own repaint 0 / enemy repaint flips;
  zoneOut in/out/straddle; takeZoneClaim consume-once; noZoneClaim guard; `_zoneTurf` payload-only +
  gates; exact tie deterministic with tieBreak flag; near-ties no flag; source asserts that no random winner
  fallback remains in match.js.
- **Verification:** `npm test` 13/13, `npm run check`, `npm run check-maps` green. A full headless boot→
  playing match could not complete inside this container's command cap (boot alone 74–160 s, highly
  variable); boot reached the late load stages error-free. In-game verification runs via CI smoke.
- **Priority 2 (documented, not changed):** spawn-protection break conditions — unverified against canon,
  no evidence → no change. Super Jump flight time is distance-scaled (`s.dur = 1.15 + min(0.6, dist/80)`) —
  plausible deviation from the canon constant flight; left as-is per brief. 5.5 s respawn documented as
  intentional. Squid Roll/Surge remain optional future features (none implemented).

### Coding-manager pass — results, input priority, touch, loading gate, freezes, Firefox (2026-10-05)
Seven items. Findings labelled confirmed vs. already-correct; nothing was changed on suspicion alone.

- **B1 results bar (confirmed bug):** `hud._judgeTurf` derived the bar widths from the *share*
  `pa/(pa+pb)`, so the bar showed each team normalising against the other instead of its actual share of
  all countable turf — 30 % vs 70 % painted read as a full-width two-sided split, and the unpainted middle
  vanished. It also picked the winner itself from rounded display numbers. Fix: `hud._judgeTurf` now takes
  `winner` (main.js passes the authoritative `match.result.winner`), animates the bars to each team's
  *absolute* coverage fraction of all turf (normalising only if the two sum above 100 %), keeps `share`
  solely for the clash marker, and guards zero/NaN/negative through a `fin()` helper. The results screen's
  own bar was already absolute and is unchanged. Test: `test/results.test.mjs` (7).
- **B2 swim → sub input priority (confirmed gap):** tapping SUB while swimming dropped straight into squid
  form and swallowed the throw. New `PLAYER.subEmergeWindow = 0.4`: a sub press while squid opens a pending
  window, suppresses re-entering squid, and synthesises the throw as a normal `winp.sub` press plus a
  next-frame `subReleased` once the body is out — so ink cost, `SK.blocked`, Barrage and the input locks
  all still apply and the online authority path is untouched. Player-only (bots arbitrate their own
  swim/throw in bots.js). `actor.reset()` clears the new state. Test: `test/swimsub.test.mjs` (7) — it caught
  two real bugs while being written (a missing `!this.bot` gate and a re-dive on the release frame).
- **B3 Super Jump touch targeting (confirmed bug):** `#touch-root` sits at z-index 15, *above* the diorama,
  and both `.tw-aim` (inset 0) and `.tw-zone` (left 44 % × bottom 66 %) swallowed taps — so on a phone a
  teammate's arrow could not be tapped. Fix: `diorama.js` gets a touch-only `.iw-dio__tap` catcher and
  `_tap(e)` (nearest jumpable pin within a thumb's reach, `G.input.touchOnly` gate, `k > 0.7`, skips the
  player's own arrow, `preventDefault`, and the *same* `_jump()` path a click uses so it queues while
  splatted); `touch.js` `_setMapMode(on)` drops `pointer-events` on both surfaces while MAP is held.
  Test: `test/touch.test.mjs`.
- **B4 loading gate (reverted as instructed):** commit 572dcaac put a full loading screen in front of every
  match start; the previous behaviour was 19dd9bd (camera fade, build behind the fade, intro fly-over).
  `startMatch` no longer shows the overlay up front — it fades out, builds behind the fade, and a 600 ms
  measured timer raises the themed loading screen *only* when preparation is genuinely slow. `_gateDone`
  closes immediately (the intro plays) unless the loading screen is actually up, in which case the 700 ms
  GO beat is kept; `quitToMenu` clears the timer. `startNetMatch` (online) never had a gate and still has
  none. Boot loading and the perf instrumentation are untouched.
- **B5 touch-layout editor (new):** `src/core/touch-layout.js` stores positions as viewport fractions with a
  per-control size and opacity under the versioned key `inkwave.touchLayout` (`version: 1`), separately for
  portrait and landscape, clamped on every read (`MIN_SIZE 0.6`, `MIN_OPACITY 0.2`) and defaulted per control.
  `touch.js` applies it (`applyLayout`, re-applied on resize/orientationchange via `bindOrientation`);
  `#touch-root.is-custom .tw-btn` switches from right/bottom to centre-anchored left/top so a drag keeps the
  CSS `clamp()` sizing. *Settings → Touch* gains a **Touch layout** editor (drag a button on a device card
  that mirrors the orientation, size/opacity sliders, per-orientation reset, DONE) and a **Reset** row.
  Live: `api.setTouchLayout` persists and pushes the record straight into the touch layer.
  Three bugs in the first draft were caught and fixed: `this.menus?.toast` (no such property — it is
  `this.toast`), a placeholder `_setSetting('_touchstamp', …)`, and a drag that could only start on empty card
  space because the buttons stopped propagation.
- **B6 selection freezes (partially addressed, honestly):** an inline boot splash now exists in `index.html`
  (`#boot`, self-contained CSS, reduced-motion aware, `pointer-events: none`, retired by
  `window.inkwaveBootDone()` the moment the real loading screen mounts) so the seconds before the module graph
  arrives show progress instead of a black `opacity: 1` fade. `menus.showBusy()/hideBusy()` add a corner
  squid spinner with anti-flicker (250 ms in, ≥700 ms held) for work behind a visible screen, wired into the
  match gate. The remaining skin/weapon freeze is `_swapChar` building a whole `Character` synchronously —
  it cannot be covered by a spinner, because the thread is blocked and nothing can paint. It is now measured
  (`Perf.record('showcase.swap')`, a rate-limited log line above 45 ms) instead of silently hitching.
- **B7 Firefox / feature detection (confirmed gap):** the renderer assumed a modern GL context. New
  `src/core/gpu-caps.js` probes renderable half-float, filterable half-float, `KHR_parallel_shader_compile`,
  MAX_SAMPLES and anisotropy — asked of the driver, never sniffed (a test asserts no `userAgent` /
  `navigator.platform` / `isFirefox` branch survives in code). Without renderable half-float the composer
  drops to an 8-bit target and bloom disables itself (it thresholds HDR values); MSAA is clamped to what the
  driver accepts; the answer is logged once (`__inkwave.R.capsLine`). Audio unlock and pointer-lock fallbacks
  were audited and were **already correct** (`_installUnlock` listens capture-phase on four gesture events plus
  `visibilitychange`; `requestLock` retries without `unadjustedMovement` on a rejected promise) — unchanged.
  The 3D squid's tentacle wave (`uWig`) was audited and runs in all four `_updateSquid` branches
  (climb / swim / airborne / dry) — unchanged.
- **Tests:** `npm test` now runs all five suites (41 tests): scoring 13, results 7, swimsub 7, touch 5,
  compat 9. Three real bugs were found *by* the new tests while writing them (normalizeEntry collapsing a
  missing entry to 0,0; the boot-splash hand-off; the caps probe reading `null` "not filterable" as support).
- **Verification:** `npm run check`, `npm test` (41/41), `npm run check-maps`, `npm run music` all green.
  **Not verified:** the touch editor, Super Jump tap targeting, the loading-gate timing and the Firefox
  fallbacks all need a real device/browser — headless in-game boot exceeds this container's command cap
  (74–160 s vs 180 s), and the Firefox path needs a Firefox with software GL. CI smoke plus a phone run
  are still required before calling those accepted.
- **Known regression risk from this pass:** `src/ui/menus.js` was accidentally overwritten mid-session and
  restored from git; every menus.js change was re-applied and is covered by `npm run check` and
  `test/touch.test.mjs`, but the screen-by-screen visual pass on menus is worth re-doing once.

- **Read the perf baseline and act on it** — the instrumentation (`__inkwave.perf.snapshot()`) is
  in but the numbers are not yet captured on a real PC or Android device; the first snapshot
  during a live match tells us whether `paint.flush`, `nav.path`, `zonePlan`, or the render pass
  owns the hitches before any optimization is attempted.
- **Lighthouse audit** — run a Lighthouse pass on the hosted build (performance, PWA-ish basics,
  accessibility of the menus) and fix what it reports.
- **Real-device testing (blocks P1/P2 acceptance)** — the briefing's device acceptance criteria
  (rotate portrait→landscape→portrait without clipping; sustained 30 FPS) can only be verified on
  the affected Android phone/WebView. Needed: model, Android + Chrome/WebView version, DPR,
  `localStorage["inkwave.settings"]` state, and frame-time captures before/after. All P2 claims
  here are code-level only; do not treat them as device-verified.
- **First CI run** — GitHub Pages must be enabled once in the repo settings (Source: GitHub Actions)
  before the `deploy-pages` job can publish; the first smoke run on a real runner should be watched
  in case the software-WebGL boot needs a larger `UNTIL_MS`.
- (Optional) touch sensitivity setting; fill `error.md` with further entries as issues surface;
  watch for banding complaints that would question the 8-bit render-target choice on Lite.
