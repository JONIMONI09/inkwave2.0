---
name: performance-change
description: Measure INKWAVE performance before changing it, change one factor at a time, and compare results honestly. Use when a change targets FPS, load time, frame hitches, selection freezes, boot time or memory — or when asked to "optimise", "speed up", "reduce lag" or "fix the stutter". Includes the live instrumentation in src/core/perf.js, the deterministic capture tools, and the reporting format that separates measured numbers from guesses.
---

# Performance changes in INKWAVE

"Optimise X" is not a task until X is measured. An optimisation with no baseline is a change that
feels good on the machine it was written on.

## 1. Measure first

There is live instrumentation. Read it from DevTools on a running game:

```js
__inkwave.perf.snapshot()     // frame percentiles, worst spot, long tasks, draw calls
__inkwave.perf.summary()      // one line
```

`src/core/perf.js` holds a 600-frame ring (p50/p95/p99), a `PerformanceObserver` for long tasks
(≥ 60 ms, logged above 120 ms), named spot timings, and sampled `renderer.info` counters. It costs
almost nothing and is always on.

Deterministic capture, for a number you can put in a commit:

```bash
node tools/measure-handling.mjs     # deterministic capture helpers
node tools/shot.mjs <url> <out.png> [--w 1600 --h 900 --wait 2500 --eval "js"]
```

Measure the **same** thing before and after: same stage, same camera path, same quality preset, same
device. A number from a different map or preset is not a comparison.

## 2. Know what usually owns the cost

Before optimising, check the cheap explanations in this order — they are the usual answers:

1. **Pixel ratio.** On phones this dominates everything else. Render density below CSS pixels is the
   single biggest lever (see `QUALITY.potato` and the dynamic-resolution floor in `main.js`).
2. **Fill rate**, not triangle count: full-screen post passes, MSAA, bloom, AO each cost per pixel.
3. **Per-frame allocation** in the sim or update path — GC pauses look exactly like hitches.
4. **Synchronous blocks**: building a whole scene, character or shader variant in one frame. These
   are visible as one long task and cannot be hidden behind a spinner (the thread is busy — nothing
   can paint). Measure them (`Perf.record('showcase.swap', ms)`) and decide honestly whether to make
   them async or just to report them.
5. **Draw calls** — only worth chasing after fill rate is already under control.

## 3. Change one factor at a time

Change one thing. Re-measure. If two things moved together you cannot attribute the result, and the
"improvement" is a coincidence you will re-lose.

Never trade correctness for speed silently. If a change alters gameplay timing, netcode cadence or a
judge result, that is a gameplay change and needs its own tests (see `gameplay-change-pr`).

Every full-screen effect needs a quality gate that turns it **off** on the `potato` / `low` presets —
that is a standing rule from `error.md` E-001.

## 4. Report as a comparison

A performance claim without both numbers is not a result:

> `showcase.swap` p50 62 ms → 11 ms (n=40, same preset, stage `plaza`).
> Measured via `Perf.record` on a desktop; not re-measured on Android.

State the sample size, the preset and the machine. State what you did **not** measure — a desktop
number does not transfer to a budget phone, and saying so is part of the result, not a weakness in it.

If the change cannot be measured in this environment (no GPU, no device, boot exceeds the command
cap), say that plainly and deliver the measurement instead of the optimisation. That is a complete,
honest outcome; a guessed speedup is not.
