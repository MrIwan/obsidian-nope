---
title: "Feature: Callouts"
author: MrIwan
notitlepage: true
toc: false
---

# Callouts

Write a callout with `> [!type] Title`. One block per type below.

> [!note] Important Notice This is a simple note callout with a title.
> The second line belongs to the same block.

> [!tldr] TLDR

> [!warning] Caution `latexmkrc` matters
> What happens here on the second line

> [!danger] Beware Never `rm -rf *`

> [!important] Critical Back up before a major TeX Live update.

> [!note] Multi-line
> - First point
> - Second point
> - Third point
>
> Another sentence here

> [!tip] Code
>
> ```bash
> makeglossaries central_document
> ```
>
> Then run `latexmk -pdf` again.

> [!unknown] simple info box for an unknown type!

> Normal blockquote without a callout marker
