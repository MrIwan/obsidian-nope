---
title: NOPE as a Book
subtitle: book true with section numbering
author: MrIwan
date: 2026-07-02
lang: en
book: true
toc: true
numbersections: true
---

`book: true` switches to the book class (`scrbook`): `#` becomes a **part**, `##` a **chapter**, `###` a **section**.

**Toggle the numbering:** `numbersections: true` in the frontmatter above numbers parts, chapters and sections (Part I, 1 Chapter, 1.1 Section) — and, with the same switch, turns cross-references into numbered references ("Chapter 2") instead of plain jump links. Set it to `false` (or delete the line) and export → no numbers and plain jump links. Control the depth with `secnumdepth:` (default 5, i.e. down to the finest level).

# Foundations

Introduction to the first part. The embedded atomic notes below become chapters automatically, because they sit under a `#` part. 

![[Book-Chapter-Intro]]

![[Book-Chapter-Methods]]

# Application

## Cross-references

With `numbersections: true` these links resolve to numbered references: see [[Book-Chapter-Intro]] and [[Book-Chapter-Methods]]. With numbering off they would stay plain jump links showing the note title as text. 
