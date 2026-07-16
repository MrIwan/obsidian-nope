---
title: "Feature: Citations"
author: MrIwan
bibliography: nope.bib
notitlepage: true
toc: false
---

# Citations

Two sources feed the same reference list: a `.bib` file referenced via the `bibliography` frontmatter key and citation notes carrying a `citekey` in their frontmatter.

Pandoc citeproc resolves `[@key]` against the `.bib` file referenced in the `bibliography` frontmatter. The build locates the file by basename match in the vault — path quotation is therefore irrelevant.

It can look like this: The Transformer replaces recurrence and convolution with pure attention mechanism [@vaswani_attention_2023].

When the author is already named in the running text, `[-@key]` suppresses the author in the citation block: Vaswani et al. demonstrate [-@vaswani_attention_2023] that attention alone suffices for sequence transduction.

`[@key, p. 42]` appends a page reference: The attention formula is defined in [@vaswani_attention_2023, p. 4].

Separate multiple citations with semicolon: the concept has multiple roots [@vaswani_attention_2023, p.1; @vaswani_attention_2023, p. 2].

## Citation notes (`citekey`)

A note that carries a `citekey` in its frontmatter is itself a source — no `.bib` entry needed. A `[[Note]]` link to it resolves to a citation and the matching BibTeX is generated automatically, alongside the `.bib` above: tracing JITs specialize dynamic-language code at runtime [[cite-tracemonkey]]. The generated entry joins the same reference list as the `.bib` keys.

A citation note can be minimal — `citekey`, `author`, `title` and `year` are enough, as in the backpropagation paper [[cite-backprop]].

## Bibliography

::: {#refs}
:::
