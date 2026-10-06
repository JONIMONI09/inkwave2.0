---
name: inkwave-verify
description: Run the INKWAVE project's real verification commands and report accurately what was and was not checked. Use before finishing any change, after editing a module, when asked to verify or prove a fix, or before writing a PR description or session.md entry. Covers which checks are unit-level versus browser-level versus device-level, and how to report a check that could not run.
---

# Verifying INKWAVE changes

INKWAVE has no build step. "It compiles" is not a check that exists here. These are the real ones,
and they are not interchangeable.

## The ladder

| Check | Command | Proves | Needs |
| --- | --- | --- | --- |
| Syntax | `npm run check` | every module parses | nothing |
| Unit | `npm test` | the pure logic (scoring, judge, input priority, storage, caps) | nothing |
| Layouts | `npm run check-maps` | every stage exists and is mirrored | nothing |
| Browser | `npm run smoke` | boot, a live match, no console errors | Google Chrome |
| Manual | open `npm run serve` | anything visual, touch, or device-specific | a human, a screen |

Run `npm run check` after **every** edit — it is ~2 s. Run `npm test` before claiming any behaviour
changed. Run `npm run smoke` when the change touches boot, the renderer, or anything that only shows
up in a real WebGL context.

## Adding a regression test

Tests are plain node, no framework, no DOM. Read an existing one and copy its shape:

```js
import assert from 'node:assert/strict';
let pass = 0, fail = 0;
await test('what it guarantees', () => { /* assert */ });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

Two kinds, both legitimate:

- **Behavioural** — import the real module and drive it (this is what `test/scoring.test.mjs` does).
  Prefer it whenever the logic can run without a canvas.
- **Contract** — read the source with `readFile` and assert on it, for things a node process cannot
  execute (CSS hooks, a DOM event wiring). Keep these few and specific; a grep-for-a-word test proves
  a string exists, not that it runs.

Wire every new file into the `test` script in `package.json`, or nobody runs it.

A test must fail before the fix and pass after. If it passed before, it is not testing the fix.

## Honest reporting

The rule that matters: **a check that did not run is not a check that passed.**

- Name the command and paste what it printed: `npm test` → `41 passed, 0 failed`.
- Say which level you reached: unit only, unit + browser, unit + browser + device.
- `npm run smoke` may exceed a 180 s command cap (boot alone is 74–160 s). That is an **environment
  limit** — report it as "could not complete in this environment", never as a pass and never as a
  game failure. Do not disable the Chrome sandbox to force it through.
- Touch, rotation, safe areas, phone GPUs and Firefox paths are **device/browser checks**. Unit tests
  do not cover them. Say "not verified on device" rather than implying the code is proven.
- Never weaken an assertion, skip a test, or add a suppress to get a green suite. If an expectation is
  genuinely wrong, change it and say why in the same breath.

## Before you report

1. `git status --porcelain` — does the diff match what you claim to have changed?
2. Reread the changed hunks, not just the file names.
3. List what you checked, what you did not, and what you would need (a phone, a browser) to close the
   gap.
