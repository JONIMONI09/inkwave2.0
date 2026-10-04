# INKWAVE Fork — Work Session

A living log of the work done on this fork and what is still open. Update this file as work
progresses; keep the completed list factual and the remaining list actionable.

Last updated: 2026-10-04

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

---

## Remaining tasks

- **Lighthouse audit** — run a Lighthouse pass on the hosted build (performance, PWA-ish basics,
  accessibility of the menus) and fix what it reports.
- **Real-device testing** — confirm the Lite preset's FPS gain on physical Android hardware
  (headless/SwiftShader numbers do not transfer); re-test after any renderer change (see E-001).
- **First CI run** — GitHub Pages must be enabled once in the repo settings (Source: GitHub Actions)
  before the `deploy-pages` job can publish; the first smoke run on a real runner should be watched
  in case the software-WebGL boot needs a larger `UNTIL_MS`.
- (Optional) touch sensitivity setting; fill `error.md` with further entries as issues surface.
