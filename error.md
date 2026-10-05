# INKWAVE Fork — Error Log

A living log of known errors, their causes, solutions and prevention. Add new entries at the top;
keep the format below. Update alongside `session.md`.

---

## E-002 · Duplicate lines introduced by a partially-applied edit in `src/game/actor.js`

**Status:** resolved (2026-10-05)

### What happens
A multi-replacement patch tool call failed validation partway through and left three edits applied twice:
the `spawnGrace` / `inSpawnZone` / `_shieldSndT` field block, the one-line reset in `reset()`, and the
`this._updateSpawnProtect(dt)` call in `update()` each appeared twice in the file. `node --check` still passed
(syntax is valid) — the damage was behavioural, not syntactic.

### Reproduction
Apply a multi-replacement patch whose later entries are malformed. Inspect `src/game/actor.js` around the
constructor's `this.invuln = 0`, `reset()` and the `update()` timer block: each shows a duplicated line.

### Root cause — confirmed
The tool applied the valid replacements before rejecting the invalid ones, and nothing in the tool reports a
partial application. Only visible by reading the file back.

### Solution path
Removed the duplicates by hand and re-verified by reading the affected regions. Going forward: after any
failed multi-replacement call, grep the target for the inserted identifiers before continuing.

### Verification
`npm run check` → `syntax ok`; `npm test` → 62 passed, 0 failed.

### Prevention
Do not treat a failed edit call as "nothing happened". Grep for the inserted symbol and confirm it appears once.

---

## E-003 · Import cycle `actor.js` ↔ `weapons.js` when adding the spawn-shield query

**Status:** resolved (2026-10-05)

### What happens
The spawn-protection geometry helper was first written at the bottom of `actor.js` and imported by
`weapons.js`. But `actor.js` already imports `WeaponRunner` from `weapons.js`, so the two modules would import
each other. `node --check` does not resolve imports and reports `syntax ok`.

### Reproduction
`grep '^import' src/game/actor.js` shows `from './weapons.js'`; adding `from './actor.js'` to weapons.js closes
the cycle.

### Root cause — confirmed
Module ownership: the rule query is needed by both sides, so it cannot live in either one.

### Solution path
Moved `inSpawnDome` / `spawnShieldCross` into `src/game/spawn-protect.js`, which imports only `ctx.js` and
`config.js`. Both `actor.js` and `weapons.js` import from it. A regression test asserts neither file imports the
other and that the shared module imports neither.

### Verification
`node test/spawn-protect.test.mjs` → 14 passed, 0 failed; `npm run check` → `syntax ok`.

### Prevention
When a helper is needed by two modules that already depend on each other, it belongs in a third.

---

## E-001 · Single-digit FPS on Android phones (performance bottleneck)

**Status:** mitigated (2026-10-04) — see solution; re-test on real hardware.

### What happens
On mid- and low-range Android phones the game rendered at roughly **3 FPS** in matches, making it
unplayable. The simulation still ran (the match logic is CPU-bound and fine), but every frame was
stuck in the GPU fill: the game was rendering at (or near) the phone's full device pixel ratio —
often 2.5–3× CSS pixels on a 1080p+ panel — into a multisampled HDR target, and then paying for
GTAO ambient occlusion, UnrealBloom, the grade pass, real-time shadow maps, and a 4096² ink atlas
on top. Desktops shrug this off; a phone GPU cannot. The existing `low` preset capped the pixel
ratio at 0.75, but the dynamic-resolution floor never went below 0.75 of that, and nothing steered
a first-time mobile visitor onto a light preset.

### Solution path
1. **Detect touch devices** and default first runs to the new `potato` preset
   (`src/config.js`, `QUALITY.potato`): pixel ratio 0.7×, shadows/bloom/AO/MSAA off, 2048 ink
   atlas, 30 % particle load. Saved settings are never overridden.
2. **Let dynamic resolution go deeper on Lite**: `dynFloor()` returns 0.6 on potato (0.75 on the
   other tiers), so the frame-time monitor in `main.js _dynRes()` can step density down while a
   match is running.
3. **Offer the tier in the UI**: Settings → Graphics now has Lite → Low → Med → High → Ultra, with
   the FPS counter available to check the result.
4. Verify with `tools/verify-touch.mjs` (headless Chrome, touch emulation): confirm the preset
   applies (pixel ratio 0.7), the match reaches "playing", and no console errors appear.

### Prevention
- Never add a full-screen effect (post pass, second render target, screen-space pass) without a
  quality gate that turns it **off** on the potato/low presets.
- Keep pixel ratio capped per quality preset — never render at raw `devicePixelRatio` on mobile.
- When profiling, check `renderer.info.render.calls` and the preset pixel ratio first; on mobile
  GPUs fill rate and MSAA dominate over triangle count.
- Keep the first-run default sensible per device class (touch → Lite) so new mobile players never
  see the unoptimized path.
- Re-test on real Android hardware after any renderer change; SwiftShader/headless numbers do not
  transfer.

---
