---
title: Bases this-context Test
subtitle: this-inlining, end to end
author: MrIwan
project: Phoenix
shelf: Nordics
curator:
  name: Mara Voss
lang: en
---

# What this tests

This is the **host note**

## Transclude form — host is this document

The base is embedded directly here, so `this` resolves against **this** note
(`project: Phoenix`). 

![[Project-Tasks.base#Tasks]]

## Table form — host is the wrapper note

Here the base sits inside the wrapper `Project-Tasks-Table`, so `this` resolves
against the **wrapper** (which also sets `project: Phoenix`). The `host` column
is a `this.file.link` formula and must link back to the wrapper in every row —
proving `this.file.link` resolves instead of breaking.

![[Project-Tasks-Table]]

# `this.<anything>` and `file.hasLink(this)`


## `this.<key>` — transclude form, host is this document


![[Books-by-Shelf.base#Shelf]]

## `this.<key>` — table form, host is the wrapper note


![[Books-by-Shelf-Table]]

## `file.hasLink(this)` — host is the reading-list note


![[Reading-List-2026]]
