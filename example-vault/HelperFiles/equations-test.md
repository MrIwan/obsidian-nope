---
title: Equation Numbering Test
author: Obsi Print
abstract: Tests the latex-env equation feature.
---

# Equation Numbering Test

This document tests how equations from atomic notes are embedded as numbered equations. Convention: the note's frontmatter carries `latex-env: equation` and its body contains exactly one `$$…$$` display-math block. The filter wraps that block in `\begin{equation}\label{eq:X}…\end{equation}`. The `caption` frontmatter is optional and for documentation only — it does not render in the PDF.

Source note `Navier-Stokes.md` has `latex-env: equation` and a `$$…$$` block with `\begin{aligned}…\end{aligned}` inside. Expected: a single equation number for the whole block.

![[Navier-Stokes]]

As described in [[Navier-Stokes]], conservation of momentum couples the pressure gradient to friction. The reference also works with custom text — see [[Navier-Stokes|the conservation law]] — and stays clickable as a hyperref.

Source note `Euler-Identity.md` has a simple `$$…$$` block. Expected: "Equation 2".

![[Euler-Identity]]

From [[Euler-Identity]] the link between the fundamental constants follows directly.

![[Navier-Stokes]]

If the same equation is embedded again, the reference points to the first embed. See [[Navier-Stokes]].

As with tables and figures, wikilinks to non-embedded equation notes pass through as plain text (no crash), so conceptual references to non-rendered notes still work:

[[Equation-Does-Not-Exist]]
