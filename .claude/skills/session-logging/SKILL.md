---
name: session-logging
description: Read and maintain the root session.md work log for the INKWAVE repository. Use when starting a task (to learn what is already done, in flight or blocked), after every meaningful work step, and before stopping or handing off. Also use when asked "what was done last session", "update the session log", or to record a decision, a check result or a blocker.
---

# Session logging (`session.md`)

`session.md` is the running log of this project's work. It is the first thing to read before planning
and the last thing to write before stopping. It exists so the next session (or the next agent) does
not have to re-derive what is finished, what is half-done, and what was only ever claimed.

## Read first

```bash
head -60 session.md && git log --oneline -8 && git status --porcelain
```

Read the **newest** entries first — new material is appended toward the top of the current section
structure. Take three things away before touching any code:

1. **What is already complete.** Do not redo it, and do not re-open it without a reason.
2. **What is in flight or blocked**, and why (a device test nobody can run, a decision waiting on the
   user). Carry the blocker forward instead of silently re-reporting the work as done.
3. **Which findings are verified.** Entries label findings confirmed / plausible / unverified. A
   `plausible` lead from a previous session is still a lead.

## Write after every meaningful step

Not once at the end. After each coherent piece of work — a fix plus its tests, a decision, a
verification run — append what happened. If the session dies mid-way, the log should already explain
the state.

Match the file's existing structure. It uses `###` sections with a date and topic, then bullet
groups. Each entry carries:

- **Date and branch** (`git branch --show-current`).
- **Work completed and decisions made** — and *why*, including options you rejected.
- **Findings labelled** confirmed / plausible / unverified. Copy the labels; do not upgrade one.
- **Files changed and why** — one clause per file is enough.
- **Exact checks run and their results** — the real command and what it printed:
  `npm test` 41/41, `npm run check` syntax ok. Not "tests pass".
- **Remaining work, blockers, next steps** — and what you need from the user to unblock.

## Preserve the history

`session.md` is **append-style**. Add a new section; do not rewrite, reorder or delete earlier
sections, and do not retype an old entry to make it look tidier. Correct an earlier entry by adding a
new line that says what changed.

Language: English or German. Never Chinese.

## Before stopping

Reread what you wrote and confirm three things are true in it:

- Every check I claim to have run appears in my shell history with that result.
- Anything I did **not** verify is labelled as such, not implied to be fine.
- The next reader can tell what to do next without re-reading the diff.
