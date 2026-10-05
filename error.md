# INKWAVE Fork — Error Log

A living log of known errors, their causes, solutions and prevention. Add new entries at the top;
keep the format below. Update alongside `session.md`.

---

## E-006 · Results screen never appears: dead `judgeP ||` fallback in `_judge()`

**Status:** resolved (2026-10-05)

### What happens
After the match's final whistle the judge card shows, but the results screen never arrives — the round is stuck
on the judge overlay (user report: "ergebnisanzeige bleibt stuck", with a screenshot of the judge card rendering
correctly, so the failure is in the hand-off, not the rendering).

### Root cause — confirmed
`src/main.js _judge()` awaited the HUD judge animation as
`await (judgeP || new Promise((r) => setTimeout(r, 4000)))`. `judgeP` is a Promise, and a Promise is **always
truthy** — so the `||` fallback was dead code from the day it was written. The judge animation resolves itself
from the HUD's *own* rAF loop (`_fxLoop` on `_fxTime`, `src/ui/hud.js`), which respects `hud.paused` and dies with
tab throttling or a thrown fx callback. When that loop stalls, nothing else advances the match: the player is
locked on the judge card with no path to the results.

### Solution path
`const JUDGE_MAX_MS = 9000; if (judgeP) await Promise.race([judgeP.catch(() => {}), new Promise((r) =>
setTimeout(r, JUDGE_MAX_MS))]);` — the ceiling sits well above the animation's own end (~3.45 s drumroll + reveal),
so a healthy judge still controls the pacing; a stalled one can no longer strand the round. A swallowed judge
rejection (`catch`) also cannot block the hand-off.

### Verification
`node test/menu-back.test.mjs` asserts the race on the source, that the truthy fallback is gone, and proves at
runtime that a never-resolving promise raced against a timeout does not block. `npm test` → 92 passed, 0 failed.
Not yet seen in a browser (headless boot exceeds the command cap).

### Prevention
Never write `promise || fallback` — every object is truthy, so the fallback can never fire. Use `Promise.race`
with an explicit ceiling for any await whose resolution depends on a render loop you do not own.

---

## E-005 · Esc cycles forever between Settings and the touch editor (push-instead-of-pop on Back)

**Status:** resolved (2026-10-05)

### What happens
Settings → Touch → Touch layout editor, then Esc: the editor closes, Settings shows, Esc again — and the editor
comes back. Esc keeps alternating between Settings and the editor instead of leaving to the main menu (user
report: "lande ich in einem Loop").

### Root cause — confirmed (own regression, introduced with the profiles/touch-editor screens)
The touchedit `onBack`, its DONE button and the profiles `onBack` called `_go('settings', { back: true })`.
`_go` always *pushes* (`show()`'s stack rule: `opts.push && name` → push; the `back: true` flag does not change
that). The stack became `[main, settings, touchedit, settings]`, and `_back()` pops to `stack[len-2]` — which is
now `touchedit`. Each Esc therefore pushed another Settings onto the stack and the next Esc re-entered the editor.

### Solution path
New `Menus._popTo(name)` helper: if `stack[len-2] === name`, use `show(name, { pop: true, back: true })` — the
editor leaves the stack and Esc from Settings then pops to `main`; otherwise fall back to
`_go(name, { back: true })`, which stays correct for screens the engine opens directly with no Settings
underneath. All three call sites now go through `_popTo('settings')`. Forward navigation (`_go` pushes) is
untouched.

### Verification
`test/menu-back.test.mjs` reproduces `show()`/`_back()`'s stack semantics verbatim: the old push-on-back cycle is
demonstrated (Esc from Settings lands back in the editor), the pop variant escapes, and the source is asserted to
contain no remaining `_go('settings', { back: true })`. `npm run check` → `syntax ok`; `npm test` → 92 passed,
0 failed. Not yet exercised on a device.

### Prevention
A handler that *leaves* a screen must pop, not push: adding new sub-screens means auditing every `onBack` for
push-vs-pop. The regression test encodes the stack arithmetic so this class of bug cannot return silently.

---

## E-004 · `self._saveProfile()` written into class methods where `self` is not in scope

**Status:** resolved (2026-10-05)

### What happens
A scripted replacement of the five `saveJSON('inkwave.profile', …)` call sites rewrote two of them — inside
`_bossResults()` and `_judge()` — to `self._saveProfile()`. `const self = this` only exists inside `_menuApi()`
and one other closure, so in those two methods `self` is undefined and the post-match XP save throws a
`ReferenceError`. The game would still have won the match and then failed on the results screen.

`node --check` reported `syntax ok`: an undefined identifier is a runtime error, not a syntax error.

### Reproduction
`grep -n "_saveProfile();" src/main.js` shows `self.` on the two lines inside the results methods. Compare with
`grep -n "const self = this" src/main.js` (only inside `_menuApi`).

### Root cause — confirmed
The replacement matched on the argument text (`saveJSON('inkwave.profile', p)`) without checking which
receiver was in scope at each of the two different call sites.

### Solution path
Corrected both to `this._saveProfile()` (they are class methods). Added a regression assertion in
`test/profiles.test.mjs` that no `self._saveProfile()` appears after `_setSettings`, i.e. outside the menu API
closure.

### Verification
`npm run check` → `syntax ok`; `node test/profiles.test.mjs` → 11 passed, 0 failed; `npm test` → 85 passed, 0 failed.

### Prevention
A scripted edit across several call sites must check the scope of every receiver it rewrites. A test that asserts
"no `self.` outside the closure" catches the class of mistake, not just this instance.

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
