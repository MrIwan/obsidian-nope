---
title: NOPE
subtitle: The Test Document
author: MrIwan
date: 2026-05-20
nope-branding: "[[Branding-Template]]"
bibliography: Obsi Test.bib
abstract: "[[Abstract]]"
---

# Slice-Embed

This document tests slice embeds **and** wikilink resolution against the target map. The source note is `slice-source.md`.

## Heading-Slice

Expected behavior: only the "Middle Section" including sub-headings A and B will be embedded. The first and third sections must not appear. Additionally, the middle section is an H1 in its own note, but should be rendered as an H2 in the PDF. Embedded notes are shifted by $N$ heading levels, where $N$ is always > 0.

![[slice-source#Middle Section]]

## Block-ID-Slice

Expected behavior: only the single paragraph from the first section marked with `^para-first` will be embedded. The `^para-first` suffix itself should not be visible in the PDF.

![[slice-para#^para-first]]

![[slice-para#^para-second]]

## Fallback for Broken Anchor

Expected behavior: a plain-text notice in the style `[Section not found: slice-source#Does-Not-Exist]`, not the entire note content.

![[slice-source#Does-Not-Exist]]

And for block IDs:

![[slice-source#^block-does-not-exist]]

## Full Embed

For verification: a source note without an anchor, embedded completely once.

![[slice-full]]

# Wikilinks

Expected behavior: each of these links should be clickable in the PDF and jump to the correct anchor. In the LaTeX output, `\hyperref{...}` is used with the registered label.

Note link without anchor: [[slice-source]] — jumps to the beginning of the first embed.

Note link with display alias: [[slice-source|alternative display]] — same jump, different visible text.

Heading link to embedded heading: [[slice-source#Middle Section]] — jumps to the "Middle Section".

Block-ID link: [[slice-para#^para-first]] — jumps to the block-ID paragraph from the first section.

Link to non-embedded block: [[slice-para#^does-not-exist]] — the block ID was not part of any slice embed, so no anchor exists. The link text remains visible, but as plain text instead of a hyperref.

Link to non-embedded note: [[A-Note-We-Did-Not-Embed]] — because the note is never embedded in this document with `![[...]]`, no anchor exists. Thus plain text.

Link to non-existent heading of an embedded note: [[slice-source#Does-Not-Exist]] — the note is embedded, but this heading does not appear in it.

# Obsidian Markup

Tests for `obsidian-inline.lua`. Expectations are described in the comment above each test — only what remains after transformation should be visible in the PDF.

## Comments (`%%...%%`)

Expected behavior: a single inline comment disappears, the rest remains visible.

Before the comment, %%this text is hidden%% and after the comment.

Visible paragraph before block comment.

%%
This paragraph is part of the hidden region.
This one too.
%%

After the hidden region.

## Highlights (`==...==`)

Expected behavior: a single-token highlight becomes LaTeX `\hl{}` and is coloured in the PDF (yellow with the `soul` default).

First ==highlight==, second ==also marked==, third ==end==.

This ==has no closer and should appear as plain text with double equals signs.

This is **important and ==central word== plus rest** in the sentence.

\newpage

![[Callouts]]
# Figures

![[image-test]]

## Mermaid

![[mermaid-example]]

As shown in [[mermaid-example]], you can also refer to Mermaid environments!

# Glossary

![[glossary-test]]

# Footnotes

![[footnotes]]

# Environments

![[env-test]]

## Tables

![[tables-test]]

![[Table-Large]]

As shown in [[Table-Large]].

![[Table-Large-Longtable]]

As shown in [[Table-Large-Longtable]].

\newpage
## Equations

![[equations-test]]

# Citations

![[cite-test]]

# Unsupported Characters

One symbol per stripped category — after export each symbol disappears (pdflatex can't render it) and a notice reports how many were removed. The labels stay.

- Emoji & pictographs (U+1F000–1FFFF): 😀
- Misc symbols & dingbats (U+2600–27BF): ✅
- Misc symbols & arrows (U+2B00–2BFF): ⭐
- Regional indicator / flag (U+1F1E6–1F1FF): 🇩🇪
- Variation selector (U+FE00–FE0F): ❤️
- Zero-width joiner (U+200D): 👩‍💻
- Combining enclosing keycap (U+20E3): 1️⃣

# Image Width Tests

One embed per `|w=` value type — each should render at the labelled size with no parse error.

![[neuron.excalidraw.png|Percent (w=50%)|w=50%]]

![[neuron.excalidraw.png|Pixels (w=300px)|w=300px]]

![[neuron.excalidraw.png|Centimeters (w=5cm)|w=5cm]]

![[neuron.excalidraw.png|Millimeters (w=80mm)|w=80mm]]

![[neuron.excalidraw.png|No width hint (natural size)]]

# Bases

Both scenarios use the same base `HelperFiles/Project-Phases.base` (view `Phases`), which lists the three phase notes in `HelperFiles/BaseTest`. The query runs through the real Bases engine at export — the core Bases plugin must be enabled.

## Base as transcluded document

Expected behavior: a base embedded directly in the document transcludes every note the view returns, in order. Each phase note starts with its own `# Title` and is auto-heading-shifted under this section.

![[Project-Phases.base#Phases]]

## Base as table

Expected behavior: the same base rendered as a numbered table with exactly the view's columns (name, status, owner, priority). The wrapper note `Project-Phases-Table` carries `latex-env: table` + caption; its body is just the base embed.

![[Project-Phases-Table]]

As shown in [[Project-Phases-Table]].
