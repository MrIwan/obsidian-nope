# Placeholders

Define a value once in the frontmatter and reuse it in the running text. Write `\projekt` in your prose and it expands to the frontmatter value everywhere. The same value also feeds the title page. One source of truth, no copy-paste.

!!! note "Needs a custom template"
    Placeholders only work with a custom LaTeX template. The template mirrors each frontmatter key as a macro. See [Custom LaTeX templates](../styling/templates.md).

The template defines one macro per value with:

```tex
\newcommand{\projekt}{$if(projekt)$$projekt$$else$[Projekt]$endif$\xspace}
```

Then `$projekt$` feeds the title page and `\projekt` feeds the body. A bracketed `[Projekt]` shows up if the key is unset. A new placeholder costs one frontmatter key plus one `\newcommand` line. The template stays project-independent, so the same `.tex` serves any number of documents.

[Open PDF](../assets/pdf/example-placeholders.pdf){ .md-button }

**Source notes**

=== "example-placeholders.md"

    ````markdown
    --8<-- "example-vault/placeholders/example-placeholders.md"
    ````

=== "nope_placeholders.tex"

    ````latex
    --8<-- "example-vault/placeholders/nope_placeholders.tex"
    ````
