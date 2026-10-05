# INKWAVE Fork — Work Session

A living log of the work done on this fork and what is still open. Update this file as work
progresses; keep the completed list factual and the remaining list actionable.

Last updated: 2026-10-05

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
- **All checks green after the pass:** `npm run check`, `npm run check-maps`, `npm run music`.

---

## Remaining tasks

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
