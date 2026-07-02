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

# Phase timer: emits ">>> NOPE-TIMING <label> <ms>" lines the plugin parses for the export summary.
_timer_t0=0
timer_start() { _timer_t0=$(date +%s%3N); }
timer_end() { echo ">>> NOPE-TIMING $1 $(( $(date +%s%3N) - _timer_t0 ))ms"; }

# Template: custom-template.tex (materialized by the plugin) wins, else Eisvogel.
TEMPLATE="/app/template/eisvogel.tex"
if [[ -f "$WORK/custom-template.tex" ]]; then
  echo ">>> Custom template: $WORK/custom-template.tex"
  TEMPLATE="$WORK/custom-template.tex"
fi

# Read a scalar key from the leading YAML frontmatter block (quotes stripped).
read_frontmatter() {
  awk -v key="$1" '
    NR==1 && $0!="---" { exit }        # no frontmatter
    NR==1 { next }
    $0=="---" || $0=="..." { exit }     # end of frontmatter
    $0 ~ "^"key"[[:space:]]*:" {
      sub("^"key"[[:space:]]*:[[:space:]]*", "")
      gsub(/^["'"'"']|["'"'"']$/, "")
      print; exit
    }
  ' "$2"
}

# book: true (Eisvogel's scrbook class) → map # to \part, ## to \chapter, ### to \section.
# --top-level-division auto-sets has-frontmatter, which routes toc/abstract into
# a branch scrbook skips, so force has-frontmatter off to keep them.
FORMAT_ARGS=()
if [[ "$(read_frontmatter "book" "$INPUT_ABS")" == "true" ]]; then
  FORMAT_ARGS=(--top-level-division=part -M has-frontmatter=false)
  echo ">>> book: part-based headings"
fi

# Passive-Embed-Syntax `+[[Note]]` → `![[Note]]`. Top-Level mit Base-Embeds löst das Plugin
# vorab zu $BASE.src.md auf — die als sed-Quelle bevorzugen, sonst das Vault-Original.
PROCESSED_INPUT="$WORK/$BASE.md"
SRC_INPUT="$INPUT_ABS"
[[ -f "$WORK/$BASE.src.md" ]] && SRC_INPUT="$WORK/$BASE.src.md"
sed 's/+\[\[/![[/g' "$SRC_INPUT" > "$PROCESSED_INPUT"

# Dependency manifest for plugin watch mode
export NOPE_DEPS_FILE="$WORK/deps.txt"
printf '%s\n' "$INPUT_ABS" > "$NOPE_DEPS_FILE"

# Vault resource-path discovery: collect vault dirs, exclude common non-content folders.
VAULT_PATHS=$(find /vault -type d \
    -not -path '*/.obsidian*' \
    -not -path '*/.git*' \
    -not -path '*/.trash*' \
    -not -path '*/node_modules*' \
    2>/dev/null | tr '\n' ':')

# Check if Branding Override exists
EXTRA_METADATA_FILES=()
if [[ -f "$WORK/branding-override.yml" ]]; then
  echo ">>> Branding override detected: $WORK/branding-override.yml"
  EXTRA_METADATA_FILES+=(--metadata-file="$WORK/branding-override.yml")
fi

# Mermaid rendering in obsidian-transclude.lua (wrap_mermaid for latex-env: mermaid) places PNGs in $WORK/mermaid/; the .tex file references them using the relative path "mermaid/<sha1>.png", which resolves correctly given that latexmk runs in $WORK.
export MERMAID_WORK_DIR="$WORK"

# Check if bibliography exists. Two sources, both via citeproc references.bib
EXTRA_BIB_ARGS=()
if [[ -f "$WORK/references.bib" || -f "$WORK/references-notes.bib" ]]; then
  EXTRA_BIB_ARGS+=(--citeproc)
  if [[ -f "$WORK/references.bib" ]]; then
    echo ">>> Bibliography: $WORK/references.bib"
    EXTRA_BIB_ARGS+=(--bibliography="$WORK/references.bib")
  fi
  if [[ -f "$WORK/references-notes.bib" ]]; then
    echo ">>> Citation notes: $WORK/references-notes.bib"
    EXTRA_BIB_ARGS+=(--bibliography="$WORK/references-notes.bib")
  fi
  if [[ -f "$WORK/citation-style.csl" ]]; then
    echo ">>> CSL: $WORK/citation-style.csl"
    EXTRA_BIB_ARGS+=(--csl="$WORK/citation-style.csl")
  fi
fi

# Pandoc: Markdown -> LaTeX (incl. Lua filters, mermaid render and citeproc)
echo ">>> Pandoc: $BASE.md → $BASE.tex"
timer_start
pandoc \
  -f markdown+wikilinks_title_after_pipe \
  --metadata-file=/app/branding/_base.yml \
  "${EXTRA_METADATA_FILES[@]}" \
  --resource-path="$WORK:$INPUT_DIR:$VAULT_PATHS/app/assets" \
  --extract-media="$WORK/media" \
  --template="$TEMPLATE" \
  --lua-filter=/app/filters/obsidian-transclude.lua \
  --lua-filter=/app/filters/strip-unsupported.lua \
  --lua-filter=/app/filters/obsidian-inline.lua \
  --lua-filter=/app/filters/callouts.lua \
  "${EXTRA_BIB_ARGS[@]}" \
  "${FORMAT_ARGS[@]}" \
  -s \
  -t latex \
  -o "$WORK/$BASE.tex" \
  "$PROCESSED_INPUT"
timer_end pandoc

cd "$WORK"
echo ">>> latexmk (pdflatex + makeglossaries, so oft bis stabil)"
timer_start
latexmk -pdf -interaction=nonstopmode -r /app/scripts/latexmkrc "$BASE.tex"
timer_end latexmk

# Cleanup intermediates, keep media and .tex for debugging.
rm -f "$WORK/branding-override.yml" "$WORK/references.bib" "$WORK/references-notes.bib" "$WORK/citation-style.csl" "$WORK/custom-template.tex"
rm -rf "$WORK/branding"

echo ""
echo ">>> Done: build/$BASE.pdf"
echo ">>> Intermediates: build/$BASE/"