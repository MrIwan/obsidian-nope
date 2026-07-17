---
title: "Feature: Obsidian Markup"
author: MrIwan
notitlepage: true
toc: false
---

# Obsidian Markup

## Comments (`%%...%%`)

Before the comment, %%this text is hidden%% and after the comment.

%%
This paragraph is part of the hidden region.
%%

After the hidden region.

## Highlights (`==...==`)

First ==highlight==, second ==also marked==, third ==end==.

This is **important and ==central word== plus rest** in the sentence.

## Lists

- Write the atomic note in Obsidian as usual
- Embed it with `![[Note]]`
    - Works at any nesting depth

1. Add the matching `latex-env` frontmatter to the note
2. Export the document to PDF

## Unsupported Characters

Emoji get stripped without crashing the export: 😀 ✅ ⭐
