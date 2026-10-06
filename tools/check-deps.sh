#!/bin/sh
# INKWAVE — check-deps: a fast, whole-tree "syntax checker XXL" (rules.md / AGENTS.md companion tool).
#
# What it does (read-only, never fixes anything — it only REPORTS in English):
#   1. SYNTAX      — node --check on every .js/.mjs/.cjs in src, test, tools, build, server, electron.
#   2. DEPENDENCIES— for each source file, which local modules it imports and whether every import target
#                    exists (catches broken paths faster than a full test run).
#   3. ORPHANS     — local modules nothing imports (candidates for dead code; REPORT ONLY — some are
#                    entry points, e.g. main.js, electron main, so this is informational).
#   4. DUPLICATES  — exported names declared in more than one module (possible accidental copy-paste or
#                    a shared helper that should live in one place). REPORT ONLY — decide case by case.
#   5. QUICK HEURISTICS — trailing whitespace, tabs in src (the tree is space-indented), and leftover
#                    console.log in src/ (logger or deliberate debug lines are fine; the report just lists them).
#
# Usage: sh tools/check-deps.sh          (from the repo root)
# Exit code: 0 if no SYNTAX errors, 1 otherwise. Everything else is informational.
# Run it before committing anything non-trivial; it is deliberately fast (< a few seconds).

set -u

echo "== check-deps: INKWAVE whole-tree report =="
FAILED=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ---------- 1. syntax ----------
echo ""
echo "-- 1. SYNTAX (node --check on every js/mjs/cjs) --"
SYNTAX_BAD=0
for f in $(find src test tools build server electron -name '*.js' -o -name '*.mjs' -o -name '*.cjs' 2>/dev/null); do
  if ! node --check "$f" >/dev/null 2>&1; then
    echo "  SYNTAX FAIL: $f"
    node --check "$f" 2>&1 | head -4 | sed 's/^/      /'
    SYNTAX_BAD=$((SYNTAX_BAD + 1))
  fi
done
echo "  checked $(find src test tools build server electron -name '*.js' -o -name '*.mjs' -o -name '*.cjs' 2>/dev/null | wc -l | tr -d ' ') files, $SYNTAX_BAD syntax error(s)"
[ "$SYNTAX_BAD" -gt 0 ] && FAILED=1

# ---------- 2. local import graph ----------
echo ""
echo "-- 2. LOCAL IMPORTS (file -> which local module it needs; missing targets flagged) --"
IMPORTS="$TMP/imports.txt"
: > "$IMPORTS"
for f in $(find src tools server -name '*.js' -o -name '*.mjs' 2>/dev/null); do
  # relative and named-module imports: from './x.js', from '../core/ctx.js'
  grep -oE "from '(\.[^']+)'" "$f" 2>/dev/null | sed "s/from '//; s/'//" | while read -r imp; do
    echo "$f -> $imp" >> "$IMPORTS"
  done
done
MISSING=0
while IFS= read -r line; do
  src_f="${line%% ->*}"; imp="${line##*-> }"
  dir="$(dirname "$src_f")"
  # resolve the import path relative to the importing file
  target="$dir/$imp"
  if [ ! -f "$target" ]; then
    # import maps may omit the extension
    found=0
    for ext in .js .mjs .cjs /index.js; do
      if [ -f "$target$ext" ]; then found=1; break; fi
    done
    if [ "$found" -eq 0 ]; then
      echo "  MISSING TARGET: $src_f imports '$imp' (resolved $target) — file not found"
      MISSING=$((MISSING + 1)); FAILED=1
    fi
  fi
done < "$IMPORTS"
echo "  $(wc -l < "$IMPORTS" | tr -d ' ') local import edges checked, $MISSING broken target(s)"

# ---------- 3. orphans ----------
echo ""
echo "-- 3. ORPHANS (src modules nothing imports — informational, entry points expected here) --"
for f in $(find src -name '*.js' | grep -v node_modules); do
  base="${f#src/}"
  hits=$(grep -l "/${base}" src tools test server 2>/dev/null | grep -v "^${f}$" | wc -l | tr -d ' ')
  [ "$hits" -eq 0 ] && echo "  ORPHAN? $f (no importer found — entry point or dead code, decide manually)"
done
true

# ---------- 4. duplicate exports ----------
echo ""
echo "-- 4. DUPLICATE EXPORTS (same name exported by 2+ modules — possible copy-paste, report only) --"
EXPORTS="$TMP/exports.txt"
: > "$EXPORTS"
for f in $(find src -name '*.js'); do
  grep -oE "^export (function|const|class) [A-Za-z_$][A-Za-z0-9_$]*" "$f" 2>/dev/null \
    | awk -v F="$f" '{print $3, F}' >> "$EXPORTS"
done
DUP=0
cut -d' ' -f1 "$EXPORTS" | sort | uniq -d | while read -r name; do
  echo "  DUPLICATE EXPORT '$name':"
  grep "^$name " "$EXPORTS" | awk '{print "      " $2}' | sed 's/^/      /' | sed 's/^      /      /'
  DUP=$((DUP + 1))
done
echo "  $(wc -l < "$EXPORTS" | tr -d ' ') exports scanned"

# ---------- 5. quick heuristics ----------
echo ""
echo "-- 5. QUICK HEURISTICS (informational — trailing whitespace, tabs in src, console.log in src) --"
TW=$(grep -rln ' $' src --include='*.js' 2>/dev/null | head -6)
[ -n "$TW" ] && echo "  trailing whitespace in: $(echo $TW)"
TB=$(grep -rln "$(printf '\t')" src --include='*.js' 2>/dev/null | head -6)
[ -n "$TB" ] && echo "  tabs in src (tree is space-indented): $(echo $TB)"
CL=$(grep -rn "console\.log(" src --include='*.js' 2>/dev/null | grep -v "// " | wc -l | tr -d ' ')
echo "  console.log call sites in src: $CL (logger should be used for game output; a few deliberate ones are fine)"

echo ""
echo "== check-deps done. FAILED=$FAILED (1 = syntax errors or broken imports above; everything else is a report) =="
exit $FAILED
