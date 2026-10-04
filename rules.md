# INKWAVE Fork — Rules for AI Systems

General rules for AI assistants and agents working in this repository. They exist so future
automated or human contributors keep the fork consistent, honest and maintainable.

---

## 1. Ethical guidelines

- **Respect the upstream project.** This is a fork of INKWAVE (MIT, © Jayden Davis). Keep the
  license and attribution intact; never present upstream work as original, and never remove
  license headers or the disclaimer that this project is not affiliated with Nintendo.
- **No destructive actions without explicit user consent.** Never run `git reset --hard`,
  `git clean`, history rewrites, force-pushes, or delete user data to "fix" something. Changes
  belong in commits the user reviews.
- **Report honestly.** Never claim a build, test, or performance result that was not actually
  observed. If a check could not run (no GPU, no network, no credentials), say so instead of
  assuming success.
- **Privacy.** Never read, print, or copy secrets (API keys, tokens, `.env` values). If a key is
  required, ask the user to add it through the designated settings — never ask users to paste
  credentials into chat or commit them to the repo.
- **Scope discipline.** Fix what was asked. Do not refactor unrelated systems, reformat files, or
  "improve" things nobody requested — every avoidable diff makes review harder.
- **Accessibility and fairness.** Gameplay-affecting defaults (aim assist, quality tiers, control
  schemes) must not advantage players by device class in online play; visual/performance assists
  should be available to everyone.

## 2. Documentation standards

- **Language: English only.** Code comments, docs, commit messages and UI strings stay in English
  — this is a fork of an English-language project and consistency beats convenience.
- **Update the living docs in the same change.** `session.md` (work log), `error.md` (error log)
  and this file must reflect reality after every meaningful task; a stale log is worse than none.
- **Comment the *why*.** The upstream codebase comments intent and measured trade-offs (e.g. why a
  shadow filter was replaced). Match that style: explain decisions and numbers, not syntax.
- **Document every user-facing change in `README.md`** (controls, settings, browser support) and
  every reusable dev tool in `tools/` with a usage comment at the top of the file.
- **Use the established doc format** in `session.md` and `error.md` (entry IDs, status lines,
  what-happened / solution / prevention) instead of inventing new ones.

## 3. Best practices for future learning & development

- **Understand before editing.** Read `README.md`, `docs/*.md` and the module in question first.
  The architecture is documented (events in `docs/EVENTS.md`, rig in `docs/RIG.md`, netcode in
  `docs/NET.md`) — work with it, not around it.
- **Preserve the input contract.** New input methods (touch, gamepad, whatever comes next) feed
  the existing `Input` pipeline; do not bypass `PlayerController` or special-case gameplay code.
- **Gate every graphics feature by quality tier.** Anything added to the render path needs an
  off-switch on the potato/low presets (see `error.md` E-001).
- **Verify like a skeptic.** Run `npm run check` after edits; use `tools/verify-touch.mjs` or
  `tools/smoke.sh` for behaviour; treat "it compiles" as the start of verification, not the end.
- **Keep changes reviewable.** Small, focused diffs; no drive-by reformatting; no dependency
  additions without a strong reason (the game is intentionally build-free and procedural).
- **Learn from measurements.** When tuning (handling, weapons, performance), reproduce numbers with
  the existing tools (`tools/measure-handling.mjs`, `tools/botlab`, FPS counter) and record them in
  comments or the logs — opinions do not beat data.
- **Leave the campsite cleaner.** If you find a bug while working on something else, log it in
  `error.md` (or fix it if small and in scope) rather than walking past it.
