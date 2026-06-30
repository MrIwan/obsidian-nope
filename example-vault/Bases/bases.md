---
title: Bases this-context Test
subtitle: this-inlining, end to end
author: MrIwan
project: Phoenix
lang: en
---

# What this tests

This is the **host note**; its frontmatter sets `project: Phoenix`. The base
`Project-Tasks.base` filters tasks with `project == this.project`, so only
Phoenix tasks may appear. `Task-Billing` and `Task-Legacy` (project `Apollo`)
are the negative control — they must stay absent. If `this` were not inlined,
the headless mount would see no host, `this.project` would be `null`, and the
table would come out **empty** — that is exactly the regression this guards.

## Transclude form — host is this document

The base is embedded directly here, so `this` resolves against **this** note
(`project: Phoenix`). Expected: Task-API, Task-Auth, Task-Search transcluded, in
that order; no Apollo task.

![[Project-Tasks.base#Tasks]]

## Table form — host is the wrapper note

Here the base sits inside the wrapper `Project-Tasks-Table`, so `this` resolves
against the **wrapper** (which also sets `project: Phoenix`). The `host` column
is a `this.file.link` formula and must link back to the wrapper in every row —
proving `this.file.link` resolves instead of breaking.

![[Project-Tasks-Table]]
