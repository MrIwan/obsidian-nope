#!/bin/bash
# build.sh — Obsidian Markdown to PDF via Pandoc + LaTeX
# Runs in container with mounts: /app (templates/assets), /vault (vault), /build (output)
# Usage: docker compose run --rm pipeline /app/scripts/build.sh <path-relative-to-vault>

set -e

INPUT="$1"

if [[ -z "$INPUT" ]]; then
  echo "Usage: build.sh <pfad-relativ-zu-vault>"
  exit 1
fi

INPUT_ABS="/vault/$INPUT"
[[ -f "$INPUT_ABS" ]] || { echo "Eingabedatei nicht gefunden: $INPUT_ABS"; exit 1; }

BASE=$(basename "$INPUT_ABS" .md)
INPUT_DIR=$(dirname "$INPUT_ABS")
WORK="/build/$BASE"
mkdir -p "$WORK"

# Vault resource-path discovery: collect vault dirs, exclude common non-content folders.
# Order: INPUT_DIR first, then vault dirs, with /app/assets as fallback.
VAULT_PATHS=$(find /vault -type d \
    -not -path '*/.obsidian*' \
    -not -path '*/.git*' \
    -not -path '*/.trash*' \
    -not -path '*/node_modules*' \
    2>/dev/null | tr '\n' ':')

# Pandoc: Markdown -> LaTeX
echo ">>> Pandoc: $BASE.md → $BASE.tex"
pandoc \
  -f markdown+wikilinks_title_after_pipe \
  --metadata-file=/app/branding/_base.yml \
  --resource-path="$INPUT_DIR:$VAULT_PATHS/app/assets" \
  --extract-media="$WORK/media" \
  --template=/app/template/eisvogel.tex \
  --lua-filter=/app/filters/pdf.lua \
  --lua-filter=/app/filters/obsidian-transclude.lua \
  --lua-filter=/app/filters/callouts.lua \
  --lua-filter=/app/filters/glossary.lua \
  --filter=pandoc-crossref \
  --toc \
  -s \
  -t latex \
  -o "$WORK/$BASE.tex" \
  "$INPUT_ABS"

cd "$WORK"
echo ">>> latexmk (pdflatex + makeglossaries, so oft bis stabil)"
latexmk -pdf -interaction=nonstopmode -r /app/scripts/latexmkrc "$BASE.tex"

echo ""
echo ">>> Done: build/$BASE.pdf"
echo ">>> Intermediates: build/$BASE/"