# Bases (dynamic embeds)

Embed an Obsidian **base view** with `![[Base.base#View]]` and let the query decide what ends up in the PDF. The view's filters, formulas, sort and columns are evaluated by Obsidian's real Bases engine at export. What the view shows is what you get.

Two modes, chosen by the surrounding note's `latex-env`:

**Transclusion (default)**: every file the view returns is embedded, in view order. Use it as a document spine:

```markdown
## Chapters

![[Thesis-Chapters.base#Reading order]]
```

**Table**: wrap the embed in an atomic note with `latex-env: table` and a `caption:` to render the view as a numbered table with exactly its columns and sort:

```markdown
---
latex-env: table
caption: "Project overview"
---
![[Projects.base#Table]]
```

Filters and formulas may reference the embedding note via `this` (`status == this.status`, `file.hasLink(this)`, `this.file.folder`, any frontmatter key). The host note's values are frozen into the query at export.

!!! note "Needs Obsidian"
    Bases require the core **Bases** plugin (Obsidian ≥ 1.10) and the Obsidian API. They resolve in plugin exports and the preview, but stay empty in headless/standalone pipeline runs. That is also why this page has no CI-built PDF.
