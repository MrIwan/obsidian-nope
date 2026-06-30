# Nope — Example Vault

A complete, ready-to-open Obsidian vault with worked examples for every core
feature of the **Nope** plugin (Markdown → PDF via Pandoc + LaTeX).

## Opening

1. Open this folder (`example-vault/`) in Obsidian (*Open folder as vault*).
2. Install or enable the **Nope** plugin. The bundled
   `.obsidian/community-plugins.json` already lists `nope` as enabled — the
   plugin binary itself is intentionally not checked in; it comes from the
   parent repo or the community store.
3. Open a document and export it, or use the PDF preview.

## Test cases

- `Bases/bases.md` — exercises base `this`-context inlining: a base filtered by
  `project == this.project` plus a `this.file.link` formula column. Phoenix tasks
  appear, Apollo tasks (negative control) stay out. Export it to verify the
  feature end to end.
