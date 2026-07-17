---
author: MrIwan
title: "Feature: Placeholders"
projekt: "Projekt Alpha"
kunde: "Nordwind GmbH"
nope-template: "[[nope_placeholders.tex]]"
toc: false
---

# Placeholders

This document sets `projekt` and `kunde` once in the frontmatter. The custom template mirrors each as a LaTeX macro.

Write the macro in the body and it expands: \projekt is delivered for \kunde. The bare command reads the same value every time.

The same frontmatter value feeds the title page through the `$projekt$` template variable. One source, two outputs. A new placeholder costs one frontmatter key plus one `\newcommand` line in the template.
