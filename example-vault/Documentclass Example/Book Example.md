---
title: NOPE als Buch
subtitle: Heading-Mapping über die Dokumentklasse
author: MrIwan
date: 2026-07-02
latex-documentclass: book
nope-chapter-autoref: true
toc: false
---

# Erster Teil

Mit `latex-documentclass: book` wird `#` zu `\part`, `##` zu `\chapter` und
`###` zu `\section` — das native LaTeX-Verhalten der `scrbook`-Klasse.

## Ein Kapitel

Dieser Text steht in einem Kapitel des ersten Teils.

### Ein Abschnitt

Und hier die feinste Ebene, ein Abschnitt.

## Noch ein Kapitel

Zweites Kapitel, weiterhin Teil eins.

# Zweiter Teil

## Kapitel im zweiten Teil

Zum Vergleich die anderen Klassen (jeweils im Frontmatter):

- `latex-documentclass: article` (Default) → `#` = Abschnitt
- `latex-documentclass: report` → `#` = Kapitel, `##` = Abschnitt
- `latex-documentclass: book` → `#` = Teil, `##` = Kapitel, `###` = Abschnitt
