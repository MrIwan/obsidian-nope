# Getting started

## Requirements

- **Obsidian** ≥ 1.11 (the plugin is desktop-only)
- **Docker Desktop**. The export toolchain runs fully containerized, so no LaTeX installation is needed.

## Install

1. Install **Nope** from the Obsidian community plugins (or via BRAT from `MrIwan/obsidian-nope`).
2. Enable it and open the plugin settings. The **Docker** section runs preflight checks (CLI found → daemon running → image present) and tells you exactly what is missing.
3. The pipeline image is pulled automatically on the first export (prebuilt, 1–3 minutes).

## First export

1. Open any note.
2. Run the command **Export active note to PDF**.
3. The PDF lands next to the note (configurable under *Output path*).

For writing, start with two commands:

- **Add structured note**: a picker that scaffolds atomic notes (table, theorem, mermaid, equation, glossary term, …) with the right frontmatter and inserts the embed at your cursor.
- **Open PDF preview**: a live preview pane that re-renders on save, with click-to-open in both directions.

## Where to go next

Read the [concept page](writing/concept.md) to understand atomic notes and embeds. Everything else builds on it. Then stroll through the feature pages: each one shows the **source note on the left and the exported PDF on the right**.

!!! tip "Example vault"
    Everything on this site lives in the repo's [`example-vault/`](https://github.com/MrIwan/obsidian-nope/tree/master/example-vault). Open it in Obsidian and export away.
