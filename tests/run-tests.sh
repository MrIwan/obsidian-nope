#!/usr/bin/env bash
# run-tests.sh — headless pipeline tests over the example vault.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
PIPELINE_DIR="$REPO_DIR/pipeline"
VAULT="${NOPE_TEST_VAULT:-$REPO_DIR/example-vault}"
MANIFEST="$SCRIPT_DIR/manifest.txt"
FILTER="${1:-}"

rm -rf "$PIPELINE_DIR"/build/test-run-* 2>/dev/null
BUILD_ROOT="$PIPELINE_DIR/build/test-run-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$BUILD_ROOT"
echo "build root: $BUILD_ROOT"

pass_count=0
fail_count=0
skip_count=0
failed_docs=""

run_test() {
  local doc="$1" musts="$2" mustnots="$3"
  if [ -n "$FILTER" ] && [[ "$doc" != *"$FILTER"* ]]; then
    skip_count=$((skip_count + 1))
    return
  fi

  local base work tex pdf runlog latexlog errors start elapsed exported
  base=$(basename "$doc" .md)
  work="$BUILD_ROOT/$base"
  tex="$work/$base.tex"
  pdf="$work/$base.pdf"
  latexlog="$work/$base.log"
  runlog="$work/build_sh.log"
  errors=""
  exported=0
  mkdir -p "$work"

  start=$(date +%s)
  # </dev/null: compose must not eat the manifest being read by the caller's loop.
  if (cd "$PIPELINE_DIR" && VAULT_PATH="$VAULT" NOPE_BUILD_PATH="$BUILD_ROOT" \
      docker compose run --rm pipeline "$doc") > "$runlog" 2>&1 < /dev/null; then
    exported=1
  fi

  if [ "$exported" -ne 1 ]; then
    local marker
    marker=$(grep -m1 '>>> NOPE-ERROR:' "$runlog" 2>/dev/null | sed 's/^>>> NOPE-ERROR: //')
    errors="$errors
  export failed${marker:+: $marker}"
  else
    [ -s "$pdf" ] || errors="$errors
  no PDF produced"
    if [ -f "$tex" ]; then
      while IFS= read -r m; do
        [ -z "$m" ] && continue
        grep -qF -- "$m" "$tex" || errors="$errors
  missing in .tex: $m"
      done <<< "$musts"
      while IFS= read -r m; do
        [ -z "$m" ] && continue
        grep -qF -- "$m" "$tex" && errors="$errors
  forbidden in .tex: $m"
      done <<< "$mustnots"
    else
      errors="$errors
  no .tex produced"
    fi
    if [ -f "$latexlog" ] && grep -q 'There were undefined references' "$latexlog"; then
      errors="$errors
  LaTeX log reports undefined references"
    fi
  fi
  elapsed=$(( $(date +%s) - start ))

  if [ -z "$errors" ]; then
    echo "PASS  $doc (${elapsed}s)"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  $doc (${elapsed}s)$errors"
    echo "      run log: $runlog"
    # Surface the cause directly in the (CI) output — artifacts are a detour.
    if [ "$exported" -ne 1 ] && [ -f "$runlog" ]; then
      echo "      ---- run log tail ----"
      tail -n 20 "$runlog" | sed 's/^/      /'
    fi
    fail_count=$((fail_count + 1))
    failed_docs="$failed_docs $doc"
  fi
}

current=""
musts=""
mustnots=""

flush() {
  [ -z "$current" ] && return
  run_test "$current" "$musts" "$mustnots"
  current=""
  musts=""
  mustnots=""
}

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '#'*|'') ;;
    '['*']')
      flush
      current="${line#[}"
      current="${current%]}"
      ;;
    must=*)
      musts="$musts${line#must=}
"
      ;;
    must-not=*)
      mustnots="$mustnots${line#must-not=}
"
      ;;
    *)
      echo "manifest: unrecognized line: $line" >&2
      exit 2
      ;;
  esac
done < "$MANIFEST"
flush

echo ""
echo "== $pass_count passed, $fail_count failed, $skip_count skipped =="
[ -n "$failed_docs" ] && echo "failed:$failed_docs"
[ "$fail_count" -eq 0 ]
