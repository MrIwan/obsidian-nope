---
title: "Feature: Equations"
author: MrIwan
notitlepage: true
toc: false
---

# Equations

Atomic equation notes (`latex-env: equation`) embedded as numbered equations with working cross-references.

This document tests how equations from atomic notes are embedded as numbered equations. Convention: the note's frontmatter carries `latex-env: equation` and its body contains exactly one `$$…$$` display-math block. The filter wraps that block in `\begin{equation}\label{eq:X}…\end{equation}`. The `caption` frontmatter is optional and for documentation only — it does not render in the PDF.

Source note `Navier-Stokes.md` has `latex-env: equation` and a `$$…$$` block with `\begin{aligned}…\end{aligned}` inside. Expected: a single equation number for the whole block.

![[eq-navier-stokes]]

As described in [[eq-navier-stokes]], conservation of momentum couples the pressure gradient to friction. The reference also works with custom text — see [[eq-navier-stokes|the conservation law]] — and stays clickable as a hyperref.

Source note `Euler-Identity.md` has a simple `$$…$$` block. Expected: "Equation 2".

![[eq-euler-identity]]

From [[eq-euler-identity]] the link between the fundamental constants follows directly.

![[eq-navier-stokes]]

If the same equation is embedded again, the reference points to the first embed. See [[eq-navier-stokes]].

As with tables and figures, wikilinks to non-embedded equation notes pass through as plain text (no crash), so conceptual references to non-rendered notes still work:

[[Equation-Does-Not-Exist]]
