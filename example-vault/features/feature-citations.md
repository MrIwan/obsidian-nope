---
title: "Feature: Citations"
author: MrIwan
bibliography: nope.bib
notitlepage: true
toc: false
---

# Citations

Cite a key from the `.bib`: the Transformer replaces recurrence with pure attention [@vaswani_attention_2023].

Suppress the author with `[-@key]`: Vaswani et al. show [-@vaswani_attention_2023] that attention alone suffices.

Add a page with `[@key, p. 42]`: the attention formula sits in [@vaswani_attention_2023, p. 4].

Give several sources at once: the concept has multiple roots [@vaswani_attention_2023, p.1; @vaswani_attention_2023, p. 2].

## Citation notes (`citekey`)

Link a note that carries a `citekey`: tracing JITs specialize dynamic-language code at runtime [[cite-tracemonkey]].

A minimal note with `citekey`, `author`, `title` and `year` also works [[cite-backprop]].

## Bibliography

::: {#refs}
:::
