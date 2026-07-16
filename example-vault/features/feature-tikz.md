---
title: "Feature: TikZ"
author: MrIwan
notitlepage: true
toc: false
nope-tlmgr:
  - pgfplots
---

# TikZ

TikZ diagram notes (`latex-env: tikz`) render as native, referencable vector figures. A ` ```tikz ` block is tikzjax-compatible: it renders live in Obsidian and, on export, its preamble is hoisted into the document while the picture becomes a numbered figure. Declare the packages the block needs via `nope-tlmgr`.

![[tikz-example]]

As shown in [[tikz-example]], TikZ figures are numbered and referencable like any other figure.
