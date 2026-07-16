---
title: "Feature: Slice Embeds & Wikilinks"
author: MrIwan
notitlepage: true
toc: false
---

# Slice Embeds

Embeds can pull in a whole note, a heading section or a single block.

## Heading-Slice

Only the "Middle Section" including its sub-headings should appear:

![[slice-source#Middle Section]]

## Block-ID-Slice

Only the single paragraphs marked with `^para-first` / `^para-second`:

![[slice-para#^para-first]]

![[slice-para#^para-second]]

## Fallback for Broken Anchor

A plain-text notice instead of the whole note:

![[slice-source#Does-Not-Exist]]

![[slice-source#^block-does-not-exist]]

## Full Embed

![[slice-full]]

# Wikilinks

Note link without anchor: [[slice-source]] — jumps to the first embed.

Note link with display alias: [[slice-source|alternative display]].

Heading link to embedded heading: [[slice-source#Middle Section]].

Block-ID link: [[slice-para#^para-first]].

Link to non-embedded note: [[A-Note-We-Did-Not-Embed]] — plain text fallback.
