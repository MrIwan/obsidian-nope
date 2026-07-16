#!/usr/bin/env bash
# build-wiki-assets.sh — export the wiki's example PDFs through the real
# pipeline. Output: docs/assets/pdf. The docs pages embed these PDFs directly.
# Runs in Docker via the `nope` pipeline image — no host install.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$SCRIPT_DIR")
PIPELINE="$REPO/pipeline"
VAULT="$REPO/example-vault"
OUT_PDF="$REPO/docs/assets/pdf"
BUILD_ROOT="$PIPELINE/build/wiki-assets"

mkdir -p "$OUT_PDF" "$BUILD_ROOT"

# <doc path relative to vault>|<asset slug>
DOCS=(
  "example-document/example-document.md|example-document"
  "features/feature-slices.md|feature-slices"
  "features/feature-markup.md|feature-markup"
  "features/feature-callouts.md|feature-callouts"
  "features/feature-footnotes.md|feature-footnotes"
  "features/feature-tables.md|feature-tables"
  "features/feature-equations.md|feature-equations"
  "features/feature-environments.md|feature-environments"
  "features/feature-mermaid.md|feature-mermaid"
  "features/feature-figures.md|feature-figures"
  "features/feature-glossary.md|feature-glossary"
  "features/feature-citations.md|feature-citations"
  "features/feature-branding.md|feature-branding"
  "minimal-latex/example-custom-latex.md|example-custom-latex"
  "book-example/book-example.md|book-example"
  "dnd-example/dnd-example.md|dnd-example"
)

for entry in "${DOCS[@]}"; do
  IFS='|' read -r doc slug <<< "$entry"
  base=$(basename "$doc" .md)
  echo "== exporting: $doc"
  # </dev/null: compose must not eat stdin of the surrounding loop.
  (cd "$PIPELINE" && VAULT_PATH="$VAULT" NOPE_BUILD_PATH="$BUILD_ROOT" \
    docker compose run --rm pipeline "$doc") < /dev/null

  pdf="$BUILD_ROOT/$base/$base.pdf"
  [[ -s "$pdf" ]] || { echo "ERROR: no PDF for $doc"; exit 1; }
  cp "$pdf" "$OUT_PDF/$slug.pdf"
done

echo "== wiki assets ready: $OUT_PDF"
