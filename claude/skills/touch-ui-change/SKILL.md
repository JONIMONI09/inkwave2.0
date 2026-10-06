---
name: touch-ui-change
description: Make touch, mobile and on-screen-control changes to INKWAVE without breaking safe areas, rotation or the existing UI conventions. Use when editing src/core/touch.js, src/core/touch-layout.js, the .tw-btn CSS, the touch-layout editor, the map diorama's touch behaviour, or any HUD element shown on a phone. Covers layering, drag targeting, orientation switching and what must be tested on a real device.
---

# Touch / mobile UI changes

Phones are the target, not an afterthought. A change that looks right on a 1600×900 desktop can be
unreachable with a thumb, clipped by a notch, or dead after a rotation.

## Conventions this UI already follows — keep them

- **Buttons live in `#touch-root`** (`src/core/touch.js`), z-index 15. It sits **above** `.iw-hud`
  (z-index 10), so anything the HUD draws — including the map diorama — is under the touch layer.
  New hit targets need an explicit decision about that.
- **Sizes use `clamp(..., vmin, ...)`** so one rule serves a 480×270 embed and a tablet.
- **Positions use `env(safe-area-inset-*)`** in `styles/ui.css`, never hardcoded offsets. A control
  dragged to the visual edge must stay a thumb's width from the bezel.
- **Custom layouts are viewport fractions** (`src/core/touch-layout.js`), stored per orientation under
  the versioned key `inkwave.touchLayout`, clamped on read. Do not store pixels — a phone and a
  tablet share one record.
- **Portrait and landscape are separate records.** Rotating switches sets; it does not mirror.

## Things that break, and how to avoid them

**Swallowed taps.** A full-screen surface (`.tw-aim`, `inset: 0`) or a large zone (`.tw-zone`, left
44 % × bottom 66 %) will eat a tap aimed at something underneath. When a mode needs the whole screen,
turn `pointer-events` off for the blockers — see `_setMapMode(on)` — and restore them in the release
path too, or the next mode starts dead.

**Drag that only starts in empty space.** If a child calls `stopPropagation()` on `pointerdown`, the
parent never begins the drag and the primary gesture (grabbing the button itself) dies. Handle the
press on the element itself.

**A drag that dies when the finger leaves.** Use `setPointerCapture` and release it in both the
`pointerup` and `pointercancel` paths.

**Layout stored in the wrong coordinate space.** Positions are fractions of the touch layer's box,
and the button is anchored by its **centre** (`left`/`top` + `translate(-50%, -50%)`). Writing `right`/`bottom`
alongside them produces a button in the wrong place.

**One frame of wrong orientation.** Re-apply on both `resize` and `orientationchange`, and skip the
work when the layer is hidden.

## Test it like this

`npm test` covers the storage and the wiring contract (`test/touch.test.mjs`) — the versioned key, the
clamps, the per-orientation split, `is-custom` being applied. It cannot cover feel.

A real device pass is required and must be reported as not run until it happens:

- Drag every button to each corner; nothing may end up under a bezel or off-screen.
- Rotate portrait → landscape → portrait; the layout must return to what it was, uncropped.
- With MAP held, tap a teammate's arrow — the Super Jump must fire, and the movement zone must not
  swallow it.
- Both thumbs at once: moving and firing while the stick is anchored.
- `prefers-reduced-motion` respected; the busy spinner stops wobbling.
- A 320 px-wide phone and a tablet, in both orientations.

## Report honestly

Say which of those you actually did. "Tested on device" when you only ran a unit test is the failure
mode this skill exists to prevent — the unit test proves the record round-trips, not that a thumb can
reach the button.
