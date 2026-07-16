# Atomic notes, embeds & refs

The core idea of NOPE: **every concept lives in its own small note**. A chapter, a theorem, a table, a glossary term. A main document is little more than frontmatter plus `![[embeds]]`:

```markdown
---
title: "My Report"
toc: true
---

![[chapter-introduction]]

![[chapter-results]]
```

Each embedded note starts with a `# Title` heading and holds its own prose, figures and further embeds. Heading levels shift to the right depth automatically, so you never adjust them by hand.

## Refs that number themselves

A plain `[[wikilink]]` becomes a real **hyperlink** in the PDF as soon as its target note is embedded somewhere in the document. What the link reads depends on the target's note type, declared by its `latex-env` frontmatter: a theorem resolves to "Theorem 1.1", a table to "Table 5", a figure to "Figure 2". Chapter refs read "Chapter 3" once `numbersections: true` is set, otherwise they stay a plain jump link. A ref to a note that is *not* embedded falls back to plain text, so you can link freely.

```markdown
As [[thm-pythagorean-theorem]] shows, the sides relate quadratically.
See [[table-comparison]] for the variants.
```

!!! note "Glossary and citations differ"
    A `[[wikilink]]` to a term or source note does not number itself. It resolves to a glossary entry or a citation instead. See [Glossary](../knowledge/glossary.md) and [Citations](../knowledge/citations.md).

## Passive embeds

`+[[Note]]` exports exactly like `![[Note]]` but stays a plain link in the editor. This keeps a main document with many embeds readable while writing.

!!! example "See it all together"
    The [complete test document](../showcase/integration.md) pulls a dozen helper notes into one PDF: theorems, tables, figures, citations and a glossary.
