#!/usr/bin/env bash
# preview-wiki.sh — serve the documentation site locally via Docker.
#
# Usage:
#   scripts/preview-wiki.sh            # build image + serve
#   scripts/preview-wiki.sh --assets   # export the example PDFs first, then serve

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$SCRIPT_DIR")
PORT="${PORT:-8000}"

if [[ "${1:-}" == "--assets" ]]; then
  echo "== building wiki assets"
  "$SCRIPT_DIR/build-wiki-assets.sh"
fi

echo "== building nope-wiki image"
docker build -f "$REPO/Dockerfile.wiki" -t nope-wiki "$REPO"

echo "== serving on http://127.0.0.1:$PORT (Ctrl+C to stop)"
docker run --rm -it -p "$PORT:8000" -v "$REPO:/docs" nope-wiki
