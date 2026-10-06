# AGENTS.md

The working rules for this repository live in **[CLAUDE.md](CLAUDE.md)** — verified commands, the
verify-before-change policy, the `docs/CONTRACTS.md` and `session.md` / `error.md` obligations, and
the English/German-only rule.

Read `CLAUDE.md` first. This file is only a pointer so the rules are found from either filename;
it deliberately does not repeat them.

## Whole-tree check rule (agent workflow)

**Before committing anything non-trivial, run `sh tools/check-deps.sh` once and read the whole report**
instead of checking files one by one. It sweeps every folder and reports, in English:

1. **SYNTAX** — `node --check` on every `.js/.mjs/.cjs` (the only hard failure; exit code 1).
2. **LOCAL IMPORTS** — every file → which local modules it needs; broken import targets are flagged.
3. **ORPHANS** — `src/` modules nothing imports (entry points like `main.js` legitimately appear here;
   the report is informational — decide case by case, do not auto-delete).
4. **DUPLICATE EXPORTS** — the same name exported from two or more modules (possible copy-paste;
   e.g. shared stage helpers like `register`/`toWorld` are EXPECTED duplicates — verify, don't "fix"
   blindly). Report only.
5. **QUICK HEURISTICS** — trailing whitespace, tabs in `src/` (the tree is space-indented), and
   `console.log` call sites in `src/` (the logger should carry game output; a few deliberate ones are fine).

The script **never modifies anything** — it only reports, so an item appearing in the report means
"this should be looked at", not "this is broken". Only section 1 (syntax) and broken import targets
turn the exit code non-zero.
