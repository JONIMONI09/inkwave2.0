#!/bin/sh
# Boot the game, advance the match deterministically to 'playing' + 8 s of live play, report state + any console errors. Exit 1 on errors.
#
# The sim is advanced with __inkwave.debug.step() — the game's own fixed-60 Hz stepping (freeze() stops the rAF loop,
# step() walks _frame(1/60) directly) — instead of waiting for wall-clock rAF. On CI's software WebGL the renderer
# runs at ~1 fps and the frame loop clamps sim time to 1/24 s per rendered frame, so the 4.2 s intro would need
# ~100 rendered frames: every CI smoke run timed out in state 'intro' that way (pre-existing, on main too).
# Stepping is fps-independent; what the smoke asserts is unchanged: match reaches 'playing', plays 8 s, no
# console/page errors. ?shadercheck stays, so a broken shader still fails loudly.
#
# The steps live in tools/smoke-steps.json (play.mjs accepts a file path), which keeps the shell quoting honest.
# SMOKE_W / SMOKE_H override the viewport (CI uses a small one — software WebGL is fill-rate bound).
cd "$(dirname "$0")/.."
OUT=$(node tools/play.mjs "http://localhost:${SMOKE_PORT:-8490}/?autostart=60&autopilot&shadercheck" tools/smoke-steps.json \
  --w "${SMOKE_W:-1600}" --h "${SMOKE_H:-900}" 2>&1)
echo "$OUT" | grep -v "Failed to fetch\|404\|preload"
echo "$OUT" | grep -qiE "\[error\]|pageerror|until timeout|eval error" && { echo "SMOKE FAIL"; exit 1; }
echo "$OUT" | grep -q "smoke ->" || { echo "SMOKE FAIL (no result — is the dev server on :${SMOKE_PORT:-8490} up?)"; exit 1; }
# the stepping evals must have ended in the live state; if the loop burned its 300-step guard first, fail with why
echo "$OUT" | grep -q '"state":"playing"' || { echo "SMOKE FAIL (match never reached playing: $(echo "$OUT" | grep 'smoke ->' | head -1))"; exit 1; }
echo "SMOKE OK"
