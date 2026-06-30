---
title: Chapter-Autoref Test
author: MrIwan
date: 2026-06-29
book: true
nope-chapter-autoref: true
lang: en
---
This document tests `nope-chapter-autoref`: chapters are embedded at the **top level** so their H1 becomes a `\chapter`, then referenced via `[[…]]`. Each reference should resolve to a numbered `\autoref` ("Chapter 2", "Section 2.1") rather than a plain jump link.

Both switches are set directly in the frontmatter here (`book: true`, `nope-chapter-autoref: true`), overriding a branding file. Alternatively, `nope-chapter-autoref: true` in your branding template is enough.

![[Chapter-Introduction]]

![[Chapter-Methodology]]

# Cross-references

Expected behaviour — every reference appears numbered:

- Bare reference to a chapter: [[Chapter-Introduction]] → "Chapter 1".
- Bare reference to the second chapter: [[Chapter-Methodology]] → "Chapter 2".
- Reference to a section within it: [[Chapter-Methodology#Data Collection]] → "Section 2.1".
- Second section: [[Chapter-Methodology#Analysis]] → "Section 2.2".

Counter-check — these should **not** render as `\autoref`:

- Reference with custom text: [[Chapter-Methodology#Data Collection|see here]] → stays a normal link with the text "see here".

Note: this "Cross-references" section is itself a `\chapter`, and therefore Chapter 3.
