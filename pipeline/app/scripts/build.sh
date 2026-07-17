#!/bin/bash
# build.sh: Obsidian Markdown to PDF via Pandoc and LaTeX. Orchestrates the export.
# Runs in the container with mounts /app (templates and assets), /vault, /build (output).
# Usage: docker compose run --rm pipeline /app/scripts/build.sh <path-relative-to-vault>
#
# Stages, in order:
#   1. rewrite passive embeds +[[...]] to ![[...]] on the top-level file
#      (also done in obsidian-transclude.lua for nested notes, keep both in sync)
#   2. nope-prepare.lua pass: template, branding, bibliography, citation notes, tlmgr
#   3. main pandoc pass with strip-unsupported, obsidian-transclude, obsidian-inline,
#      callouts, obsidian-codeblocks (order matters)
#   4. citeproc flags come AFTER the lua-filter flags, else embed citations are missed
#   5. latexmk to PDF, then copy the PDF to the output path
# See ARCHITECTURE.md for the cross-file invariants.

set -e
# UTF-8 locale must be set before the first pandoc or lua call. The container
# defaults to POSIX, where pandoc mangles non-ASCII argv: umlaut paths become
# U+FFFD and their embeds are not found. Keep this line here, above everything.
export LANG=C.UTF-8 LC_ALL=C.UTF-8

# Shared tlmgr historic-repo resolution (also used by the Dockerfile base layer).
. "$(dirname "$0")/tlmgr-repo.sh"

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

# Read a key that may be a scalar, an inline list ([a, b]) or a block list (- item)
# from the leading YAML frontmatter block; prints whitespace-separated values.
read_frontmatter_list() {
  awk -v key="$1" '
    NR==1 { yaml = ($0=="---") ? 0 : 1; if (!yaml) next }  # md: skip opening ---
    !yaml && ($0=="---" || $0=="...") { exit }             # md: end of frontmatter
    /^[[:space:]]*#/ { next }                              # skip YAML comments
    collect && /^[[:space:]]*-[[:space:]]*/ {
      sub(/^[[:space:]]*-[[:space:]]*/, ""); gsub(/^["'"'"']|["'"'"']$/, ""); print; next
    }
    collect { exit }                     # next key ends the block list
    $0 ~ "^"key"[[:space:]]*:" {
      sub("^"key"[[:space:]]*:[[:space:]]*", "")
      if ($0 == "") { collect=1; next }  # block list follows
      gsub(/[][,]/, " "); gsub(/["'"'"']/, ""); print; exit
    }
  ' "$2"
}

# nope-tlmgr: LaTeX packages the document (or its branding note) declares.
# The single install path for plugin, preview, CI and standalone runs. The container is ephemeral, so installs go into a user-mode TeX tree on the persistent /build mount — packages download once and survive across runs (Cleanup build folder resets them). System-tree install stays as fallback for the rare package that misbehaves in user mode (not persistent).
# Names are whitelisted hard — they end up on a tlmgr command line.
export TEXMFHOME=/build/.texlive/texmf
export TEXMFVAR=/build/.texlive/texmf-var
export TEXMFCONFIG=/build/.texlive/texmf-config

tlmgr_has() {
  tlmgr info --only-installed --data name "$1" 2>/dev/null | grep -qx "$1" && return 0
  [[ -d "$TEXMFHOME/tlpkg" ]] &&
    tlmgr --usermode info --only-installed --data name "$1" 2>/dev/null | grep -qx "$1"
}

install_tlmgr_packages() {
  local requested missing p year repo
  requested=$(
    { read_frontmatter_list "nope-tlmgr" "$INPUT_ABS"
      [[ -f "$WORK/branding-override.yml" ]] && read_frontmatter_list "nope-tlmgr" "$WORK/branding-override.yml"
      true
    } | tr ' \t' '\n\n' | grep -E '^[A-Za-z0-9][A-Za-z0-9._-]*$' | sort -u | tr '\n' ' '
  ) || true
  [[ -n "${requested// /}" ]] || return 0
  missing=""
  for p in $requested; do
    tlmgr_has "$p" || missing="$missing $p"
  done
  [[ -n "${missing// /}" ]] || return 0
  echo ">>> Installing LaTeX packages:$missing"
  timer_start
  repo="$(nope_tlmgr_repo)"
  [[ -d "$TEXMFHOME/tlpkg" ]] || tlmgr init-usertree >/dev/null 2>&1 || true
  tlmgr --usermode --repository "$repo" install $missing ||
    tlmgr --usermode install $missing ||
    tlmgr --repository "$repo" install $missing ||
    tlmgr install $missing || true
  # Register font maps from user-tree installs (no-op when nothing changed).
  updmap-user >/dev/null 2>&1 || true
  for p in $missing; do
    if ! tlmgr_has "$p"; then
      echo ">>> NOPE-ERROR: LaTeX package '$p' could not be installed (nope-tlmgr)"
      exit 1
    fi
  done
  timer_end tlmgr
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

RESOURCE_PATH="$WORK:$INPUT_DIR:$VAULT_PATHS/app/assets"

# Prepare pass: resolve custom template, branding override, bibliography and citation notes from the vault into $WORK
echo ">>> Prepare: resolving vault references"
timer_start
NOPE_WORK_DIR="$WORK" NOPE_BASE="$BASE" pandoc \
  -f markdown+wikilinks_title_after_pipe \
  --resource-path="$RESOURCE_PATH" \
  --lua-filter=/app/filters/nope-prepare.lua \
  -t plain \
  -o /dev/null \
  "$PROCESSED_INPUT"
timer_end prepare

# Template: custom-template.tex (materialized by the prepare pass) wins, else Eisvogel.
TEMPLATE="/app/template/eisvogel.tex"
if [[ -f "$WORK/custom-template.tex" ]]; then
  echo ">>> Custom template: $WORK/custom-template.tex"
  TEMPLATE="$WORK/custom-template.tex"
fi

# Check if Branding Override exists
EXTRA_METADATA_FILES=()
if [[ -f "$WORK/branding-override.yml" ]]; then
  echo ">>> Branding override detected: $WORK/branding-override.yml"
  EXTRA_METADATA_FILES+=(--metadata-file="$WORK/branding-override.yml")
fi

# Install nope-tlmgr packages that are not already baked into the image.
install_tlmgr_packages

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
  --resource-path="$RESOURCE_PATH" \
  --extract-media="$WORK/media" \
  --template="$TEMPLATE" \
  --lua-filter=/app/filters/obsidian-transclude.lua \
  --lua-filter=/app/filters/strip-unsupported.lua \
  --lua-filter=/app/filters/obsidian-codeblocks.lua \
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