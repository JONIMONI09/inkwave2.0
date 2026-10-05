---
name: error-triage
description: Reproduce, diagnose, fix and document real errors in the INKWAVE repository's error.md. Use when something fails — a failing test, a broken build, a crash in the browser, a console error, a headless smoke failure, or a bug report. Covers deciding whether a failure is a game defect or an environment/tooling problem, and recording it honestly. Do not use for hypothetical errors.
---

# Error triage (`error.md`)

`error.md` is the living bug log: what broke, how to reproduce it, what actually caused it, and
whether it is fixed. It is written for the next person, who will hit the same error and want to know
in ten seconds whether it is their fault.

**Only for errors that actually happened.** Not for bugs you imagine might exist, and not for a
hypothetical edge case you chose not to fix. If you did not observe it, it does not get an entry.

## 1. Reproduce before theorising

Get the exact message, not a paraphrase. Then make it happen again on purpose.

```bash
npm run check      # syntax gate
npm test           # headless suites
npm run smoke      # real browser (needs Chrome)
```

A bug report, a feature name or an old commit message is not a reproduction. If you cannot reproduce
it, that is the finding — write the entry with the status **open** and say what you could not get.

## 2. Separate game defects from environment failures

This distinction matters more than the fix, because CI failures get misread as broken gameplay.

| Symptom | Almost certainly |
| --- | --- |
| `node --check` syntax error | a real defect in the file you edited |
| Assertion failure in `test/*.test.mjs` | a real defect (or a wrong expectation you wrote) |
| Chrome sandbox / `No usable sandbox` | environment: the headless browser cannot run here |
| Boot exceeds the command cap | environment: the cap, not the game |
| `convex dev` / network / auth refused | environment: no credential or no network |

Record environmental failures anyway — the brief requires it — but **label them environmental** so
nobody later goes looking for a game bug that was never there.

Never "fix" an environment failure by disabling the thing that was being tested (`--no-sandbox` on a
real browser check, a skipped assertion, a weakened threshold). Report it instead.

## 3. Root cause: confirmed or unconfirmed

Read the code path and confirm the cause **before** writing it down.

- **confirmed** — you traced it: read the code, reproduced it, and the fix made it go away.
- **unconfirmed** — you have a strong hypothesis you did not prove. Say which evidence is missing.

Never write a tidy narrative cause you have not verified. "Confirmed" on a guess poisons the log:
the next session trusts it and skips the real investigation.

## 4. Fix, then verify

Make the fix, then run the check that proves it and record **that exact command and its result**.

```bash
npm test -- <suite>     # or: node test/<name>.test.mjs
```

If the fix has a code path worth guarding, add a regression test. A bug fixed without a test comes
back.

## 5. Write the entry

`error.md` is **append-style, newest at the top** (see the file's own instruction line). Read the
top entry and copy its shape:

```
## E-00N · <one-line title>
**Status:** open | resolved (YYYY-MM-DD) — <short note>

### What happens
<symptom, with the exact error message quoted>

### Reproduction
<numbered steps, the file:line or environment involved>

### Root cause — confirmed | unconfirmed
<the traced cause, or the hypothesis plus what is missing>

### Solution path
<what changed, file by file>

### Verification
<exact command → exact result>

### Prevention
<the rule that stops this class of bug returning>
```

Keep the `**Status:**` line and the `###` headings — the file is scanned for them.

## 6. Close the loop

- Status **resolved** only after the verification command actually passed.
- If the same error recurs later, add a new entry that references the old number and says what
  changed. Do not rewrite the old one — its history is the point.
- English or German. Never Chinese.
