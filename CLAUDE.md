# INKWAVE — agent and contributor rules

INKWAVE is an original Splatoon-inspired 4v4 turf-war shooter for the browser: **three.js r186, plain
ES modules, no bundler, no build step.** Everything is procedural — no external models, textures or
audio files; fonts are vendored. Tuned for phones as much as desktops.

## Language

**Chat, commits, PR titles/descriptions and agent-authored documentation: English or German only.**
Never Chinese. This applies to what you write, *not* to existing player-facing game text or unrelated
source comments — leave those in whatever language they already are.

## Verified commands

Use these exact scripts. Do not invent a build step; there isn't one.

```bash
npm run check       # node --check over every module — the fast syntax gate, run after every edit
npm test            # headless regression suites (plain node, no browser, no GPU)
npm run check-maps  # validates every stage layout is present and mirrored
npm run music       # rebuilds songs/manifest.json
npm run smoke       # boots the game in headless Chrome and plays ~8 s on autopilot
npm run serve       # local dev server on :8490 (python3 tools/serve.py 8490)
```

`npm test` is plain `node test/<name>.test.mjs` chained in `package.json`. When you add a suite, add it
to that chain — an unwired test file is a test nobody runs.

`npm run smoke` needs Google Chrome and is the only check that exercises a real browser. It can exceed
a 180 s command cap (boot alone is 74–160 s); that is an environment limit, not a game failure.

## Read before you edit

- `docs/CONTRACTS.md` — the module contracts. They are binding: the event payload shapes, the
  `Character` API and the ownership rules are what other modules are written against. Change a
  contract deliberately, update the doc in the same change.
- `docs/EVENTS.md` — the event bus payload reference.
- `session.md` — what the last sessions did, what is in flight, what is blocked. Read it before
  planning; it will tell you which findings are already verified and which are still guesses.
- `error.md` — known bugs with confirmed/unconfirmed root causes. Check it before assuming a bug is new.

## Verify before you change

Read the code path and confirm the behaviour **in the current tree** before editing it. Mark every
finding **confirmed**, **plausible** or **unverified** — in the change, in the docs and in the report
to the user. Prior chat findings are leads, not proof.

A bug report, a feature name or an old commit message is not evidence. Confirm in code, or say you
could not.

## Ground rules

- **Never edit `vendor/`** (three.js and vendored fonts). It is upstream code, pinned.
- **Preserve online authority.** The host simulates and judges; clients receive and render. Any change
  to a gameplay rule has to stay deterministic on the host and must keep the guest's view consistent —
  check `src/net/netmatch.js` and `src/game/match.js` before touching match logic.
- **Tuning lives in `src/config.js`.** Import the value; do not scatter magic numbers through modules.
- **No per-frame allocations in hot paths.** Reuse vectors, pool effects (see `src/fx/fx.js`).
- **Match the surrounding code**: 2-space indent, single quotes, comments that explain *why*, not
  *what*. One-line blocks stay one line where that reads better.
- **Keep diffs focused.** Unrelated cleanup in a bugfix PR makes the review harder and the revert
  riskier.
- **Never discard uncommitted work.** If the tree is dirty, read what is there and work around it.

## Documenting your work

- `session.md` — append after every meaningful work step and before stopping: date, branch, what
  changed and why, the exact checks you ran and their results, and what is left / blocked.
- `error.md` — append an entry for each **actual** bug, failing test or tooling error you hit (not
  hypothetical ones), including environmental failures. Mark the root cause **confirmed** or
  **unconfirmed**; never invent one. Say whether it is open or resolved.

Both files are append-style with a fixed entry format. Read the top of each and copy the shape.

## Reporting honestly

Say what you verified and how, and separate what you did **not** check. A device test, a browser test
and a unit test are not interchangeable. If a check could not run, say so and why — do not describe an
unrun check as passing, and do not weaken or skip a test to make a suite green.
