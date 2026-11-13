#!/usr/bin/env bash
# Runs every tests/*.js against a local copy of the app. Usage: bash tests/run.sh [name-filter]
# These are browser scripts (Playwright + headless Chromium) that print what they observe; a script FAILS if it
# throws, times out, logs a page error, or reports a button "CUT OFF". Read the output when a change should alter it.
set -u
here="$(cd "$(dirname "$0")" && pwd)"; root="$(dirname "$here")"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
cd "$root" && python3 -m http.server 8765 >/dev/null 2>&1 & srv=$!
trap 'kill $srv 2>/dev/null' EXIT
sleep 1
out="$(mktemp -d)"; cd "$out"            # screenshots the scripts write land here, not in the repo
fail=0
for f in "$here"/*${1:-}*.js; do
  name="$(basename "$f" .js)"
  log="$(timeout 180 node "$f" 2>&1)"; code=$?
  if [ $code -ne 0 ] || echo "$log" | grep -qE 'ERR |TimeoutError|CUT OFF|Error:'; then echo "FAIL  $name"; echo "$log" | grep -E 'ERR |TimeoutError|CUT OFF|Error:' | head -3 | sed 's/^/        /'; fail=1; else echo "ok    $name"; fi
done
echo "screenshots: $out"
exit $fail
