---
title: Table Numbering Test
author: Obsi Print
abstract: Tests the latex-env table feature. Tables from atomic notes with `caption:` in the frontmatter are embedded as numbered floats; [[Note]] links reference them as "Table N".
---

# Table Numbering Test

This document tests how tables from atomic notes are embedded as numbered floats. Convention: a single-source caption — the caption lives in the table note's frontmatter as `caption: "…"`. There is no pipe override in the embed tag and no Pandoc native-caption fallback.

# First Table

Source note `Table-Comparison.md` has `latex-env: table` and `caption: "Comparison of implementation variants"` in the frontmatter.

![[table-comparison]]

As [[table-comparison]] shows, variant B is superior on several dimensions. The reference also works with custom text — for example [[table-comparison|here]] — and stays clickable as a hyperref.

# Second Table

Demonstrates the counter increment (should become "Table 2"):

![[table-project-phases]]

See [[table-project-phases]] for the rough timeline.

[[Table-Does-Not-Exist]]
