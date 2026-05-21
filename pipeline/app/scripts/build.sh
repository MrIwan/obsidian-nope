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

# Branding override: TS side writes branding-override.yml + branding/ assets
# into $WORK before docker runs. Append --metadata-file when present so it
# overrides _base.yml; the doc's own frontmatter still wins over both.
EXTRA_METADATA_FILES=()
if [[ -f "$WORK/branding-override.yml" ]]; then
  echo ">>> Branding override detected: $WORK/branding-override.yml"
  EXTRA_METADATA_FILES+=(--metadata-file="$WORK/branding-override.yml")
fi

# Mermaid-Render in obsidian-transclude.lua (wrap_mermaid für latex-env: mermaid)
# legt PNGs in $WORK/mermaid/ ab; die .tex referenziert sie relativ als
# „mermaid/<sha1>.png", was beim latexmk-cd in $WORK direkt aufgeht.
export MERMAID_WORK_DIR="$WORK"

# Pandoc: Markdown -> LaTeX
echo ">>> Pandoc: $BASE.md → $BASE.tex"
pandoc \
  -f markdown+wikilinks_title_after_pipe \
  --metadata-file=/app/branding/_base.yml \
  "${EXTRA_METADATA_FILES[@]}" \
  --resource-path="$INPUT_DIR:$VAULT_PATHS/app/assets" \
  --extract-media="$WORK/media" \
  --template=/app/template/eisvogel.tex \
  --lua-filter=/app/filters/obsidian-transclude.lua \
  --lua-filter=/app/filters/obsidian-inline.lua \
  --lua-filter=/app/filters/callouts.lua \
  --toc \
  -s \
  -t latex \
  -o "$WORK/$BASE.tex" \
  "$INPUT_ABS"
#   --filter=pandoc-crossref \

cd "$WORK"
echo ">>> latexmk (pdflatex + makeglossaries, so oft bis stabil)"
latexmk -pdf -interaction=nonstopmode -r /app/scripts/latexmkrc "$BASE.tex"

# Branding-Override-Cleanup
rm -f "$WORK/branding-override.yml"
rm -rf "$WORK/branding"

echo ""
echo ">>> Done: build/$BASE.pdf"
echo ">>> Intermediates: build/$BASE/"