---
title: LaTeX Environment Test
author: Obsi Print
abstract: Tests the latex-env frontmatter feature and \autoref resolution for theorem wikilinks.
---

# LaTeX Environment Test

This document tests the `latex-env` frontmatter feature. The source note is `Pythagorean-Theorem.md` with `latex-env: theorem` and `latex-short: Pythagoras` in the frontmatter.

**Template prerequisite:** `\usepackage{amsthm}` plus a `\newtheorem{theorem}{Theorem}` must be defined in `eisvogel.tex`, otherwise pdflatex fails with "Environment theorem undefined".

![[Pythagorean-Theorem]]

The environment can then be referenced. From [[Pythagorean-Theorem]] the statement follows directly.

The displayed text is easy to override. By [[Pythagorean-Theorem|the Pythagorean theorem]], the statement follows directly — the link points to the same theorem.

The `.md` is wrapped in an environment only when the whole node is linked. Otherwise everything is embedded following the logic in [[Example Document#Slice-Embed]].
