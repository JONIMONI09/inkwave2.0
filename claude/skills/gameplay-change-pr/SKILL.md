---
name: gameplay-change-pr
description: Make a scoped branch, implement an INKWAVE gameplay change with regression tests, and prepare an English pull request description. Use when starting a feature or bugfix that should end up as a PR, or when asked to branch, commit in pieces, or draft a PR. Covers branch hygiene, preserving uncommitted work, commit granularity, and what a trustworthy PR description must state.
---

# Gameplay change → branch → PR

## 0. Look before you branch

```bash
git status --porcelain && git branch --show-current && git log --oneline -8
```

If the tree is **dirty**, those changes are someone's work — yours from an earlier step or the user's.
Read them, work around them, never discard them. Do not `reset`, `checkout --`, `clean` or stash
away anything you did not create.

## 1. Branch

One scoped branch for one task. Branch names describe the change, not the session:

```bash
git switch -c fix/spawn-protection-shield
```

Never force-push, never rewrite someone else's branch, never work directly on the default branch for
a change that is not finished.

## 2. Confirm the behaviour before changing it

Read the path end to end and label the finding **confirmed**, **plausible** or **unverified** *before*
you edit. A change built on a plausible-but-wrong theory is worse than no change: it moves the
failure somewhere harder to see.

Check `docs/CONTRACTS.md` and `docs/EVENTS.md` first — they define the payload shapes and ownership
rules other modules are written against. If the change alters a contract, the doc changes in the same
commit.

## 3. Implement

- Tuning goes in `src/config.js`. Never scatter a literal through modules.
- Online authority is load-bearing: the host simulates and judges. Any gameplay rule must stay
  deterministic on the host and consistent on guests (`src/net/netmatch.js`, `src/game/match.js`).
- No per-frame allocations. Pool and reuse (`src/fx/fx.js`).
- Match the surrounding style: 2-space indent, single quotes, comments that say *why*.
- Keep the diff to the task. Unrelated tidy-ups belong in their own commit or their own PR.

## 4. Commit in coherent pieces

One commit per coherent change, each one leaving the tree working:

```bash
git add <specific files>          # never `git add -A` over someone else's edits
git commit -m "$(cat <<'EOF'
Fix the results bar to show true turf coverage

The bar sized itself from each team's share of the two teams rather
than from its coverage of all countable turf, so unpainted ground
disappeared and the winner was re-derived from rounded display values.

Co-Authored-By: Codex <noreply@openai.com>
EOF
)"
```

The subject says what changed; the body says **why**. Never "Update 8 files", never "fix bug", never
a summary of the diff. English or German — never Chinese.

## 5. Verify before the PR, not after

```bash
npm run check && npm test
```

Add the regression test with the fix (see `inkwave-verify`). A gameplay change without a test is not
finished.

## 6. PR description

Open-ended prose at the top, then the three sections that make it reviewable:

```markdown
## Summary
What changed and why, in a paragraph. Name the behaviour, not the files.

## Tests actually run
- `npm run check` → syntax ok
- `npm test` → 41 passed, 0 failed
- `npm run smoke` → **not run**: boot exceeded the 180 s command cap in this environment

## Known limitations
What is still unverified (device, browser, online match), and any balance decision
that still needs a human.
```

Two rules that are not negotiable:

- **Never claim a check you did not run.** If the smoke test did not run, it goes in the limitations
  with the reason, not in the tests list.
- **Never merge.** This skill stops at a reviewable branch and a description. Merging is the user's
  call.

## 7. Leave it reviewable

End with the branch name, the commits on it, the diffstat, and the honest status of each item
(complete / incomplete / blocked). If you could not create the PR — no permission, no remote —
say what stopped you and leave the branch in place.
