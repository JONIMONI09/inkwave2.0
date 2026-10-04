# INKWAVE Fork — Error Log

A living log of known errors, their causes, solutions and prevention. Add new entries at the top;
keep the format below. Update alongside `session.md`.

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
