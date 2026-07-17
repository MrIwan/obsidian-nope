---
title: "Feature: Slice Embeds & Wikilinks"
author: MrIwan
notitlepage: true
toc: false
---

# Slice Embeds

## Heading slice

![[slice-source#Middle Section]]

## Block-id slice

![[slice-para#^para-first]]

![[slice-para#^para-second]]

## Broken anchor fallback

![[slice-source#Does-Not-Exist]]

![[slice-source#^block-does-not-exist]]

## Full embed

![[slice-full]]

# Wikilinks

Link without anchor: [[slice-source]].

Link with alias: [[slice-source|alternative display]].

Link to an embedded heading: [[slice-source#Middle Section]].

Block-id link: [[slice-para#^para-first]].

Link to a non-embedded note: [[A-Note-We-Did-Not-Embed]].
