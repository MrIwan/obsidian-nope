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

# Passive-Embed-Syntax `+[[Note]]` → `![[Note]]`.
# Obsidian rendert `+[[…]]` NICHT als Embed (man sieht nur `+` + Wikilink in der
# Editor-Ansicht), aber die Pipeline expandiert ihn wie ein normales `![[…]]`.
# Praktisch, wenn man im Editor Übersicht behalten will (z.B. lange
# Kapitel-Embeds in einem TOC-artigen Hauptdokument), das PDF aber den vollen
# Inhalt enthalten soll. Spiegelbild dieser Regel sitzt in
# obsidian-transclude.lua's load_note() für rekursiv eingebundene Notes —
# beide Stellen müssen synchron bleiben.
# Die Top-Level-Datei liegt unter /vault read-only — daher kopieren statt
# in-place modifizieren, in $WORK landet ohnehin der Build-Output.
PROCESSED_INPUT="$WORK/$BASE.md"
sed 's/+\[\[/![[/g' "$INPUT_ABS" > "$PROCESSED_INPUT"

# Vault resource-path discovery: collect vault dirs, exclude common non-content folders.
# Order: INPUT_DIR first, then vault dirs, with /app/assets as fallback.
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

# Mermaid-Render in obsidian-transclude.lua (wrap_mermaid für latex-env: mermaid) legt PNGs in $WORK/mermaid/ ab; die .tex referenziert sie relativ als „mermaid/<sha1>.png", was beim latexmk-cd in $WORK direkt aufgeht.
export MERMAID_WORK_DIR="$WORK"

# Check if bibliography exists
EXTRA_BIB_ARGS=()
if [[ -f "$WORK/references.bib" ]]; then
  echo ">>> Bibliography: $WORK/references.bib"
  EXTRA_BIB_ARGS+=(--citeproc --bibliography="$WORK/references.bib")
  if [[ -f "$WORK/citation-style.csl" ]]; then
    echo ">>> CSL: $WORK/citation-style.csl"
    EXTRA_BIB_ARGS+=(--csl="$WORK/citation-style.csl")
  fi
fi

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
  "${EXTRA_BIB_ARGS[@]}" \
  --toc \
  -s \
  -t latex \
  -o "$WORK/$BASE.tex" \
  "$PROCESSED_INPUT"
# WICHTIG: EXTRA_BIB_ARGS (--citeproc + --bibliography + ggf. --csl) muss NACH
# den --lua-filter-Flags stehen. Pandoc 2.11+ läuft Filter und Citeproc in der
# Reihenfolge der Kommandozeile durch. Steht --citeproc davor, sieht es nur
# Top-Level-Citations — eingebettete Notes mit [@key] werden erst danach durch
# obsidian-transclude.lua expandiert und entgehen der Citeproc-Verarbeitung
# komplett. Symptom: Citation-Marker erscheinen als escaped Roh-Text
# (`{[}@key{]}`) statt als formatierte Citation (`(Vaswani u. a. 2023)`).
#   --filter=pandoc-crossref \

cd "$WORK"
echo ">>> latexmk (pdflatex + makeglossaries, so oft bis stabil)"
latexmk -pdf -interaction=nonstopmode -r /app/scripts/latexmkrc "$BASE.tex"

# Per-export-Artefakte aufräumen, damit kein stale State zwischen Builds übrig
# bleibt. branding-override.yml + branding/-Assets von der Branding-Mechanik,
# references.bib + citation-style.csl von der Bibliography-Mechanik — beide
# werden vor jedem Export von der TS-Seite neu materialisiert.
rm -f "$WORK/branding-override.yml" "$WORK/references.bib" "$WORK/citation-style.csl"
rm -rf "$WORK/branding"

echo ""
echo ">>> Done: build/$BASE.pdf"
echo ">>> Intermediates: build/$BASE/"