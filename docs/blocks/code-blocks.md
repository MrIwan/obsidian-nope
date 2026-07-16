# Code blocks & custom blocks

A fenced code block's **identifier** decides how NOPE handles it on export. There are three behaviors:

- ` ```latex ` passes its body into the PDF as raw LaTeX, unchanged.
- An identifier you declared in `nope-blocks:` renders as a LaTeX **environment of that name**, with the block body forwarded to your template as `\nope<key>` commands.
- Anything else stays an ordinary code fence, shown verbatim.

The middle one is the point of this page. You invent an identifier, declare it once, and define what it renders to in your custom template. That turns a readable `key: value` block in your note into any typeset output you want. The same block can render live in Obsidian through a plugin that understands it and export through your environment, from one source.

!!! note "Inline LaTeX works too"
    The ` ```latex ` fence is only for convenience. LaTeX commands written straight into the running text are passed through the same way (for example a bare `\newpage`). The fence just keeps larger raw blocks readable and stops Markdown from touching them.

## How a custom block works

Two steps:

1. Declare the identifier in the document (or branding) frontmatter: `nope-blocks: [myblock]`. The pipeline now knows a ` ```myblock ` fence maps to a LaTeX environment called `myblock`.
2. Define that environment in your custom `.tex` template. Everything the block needs to render lives there, so the block's appearance is entirely yours.

The block body is YAML-lite and each line is forwarded as a command:

- `key: value` becomes `\nope<key>`.
- `key:` on its own opens a list. Its `- subkey: value` items become `\nope<key><N>-<subkey>`, and bare `- value` items become `\nope<key><N>`.
- Inline lists `[a, b]` have their brackets stripped. Indented lines continue the previous value.

Inside the environment you read those commands and lay them out however you like. An unparsable line is a hard export error. Declared blocks are unnumbered and not referencable. For numbering and `[[refs]]` use an atomic `latex-env` note instead.

## Demo: a stat block

This is only a demonstration of the mechanism above. The identifier happens to be `statblock`, but the same approach works for any block you invent.

The note holds a plain `statblock` fence and renders live in Obsidian through the [Fantasy Statblock](https://plugins.javalent.com/statblocks) plugin. The `statblock` environment in the co-located template turns the forwarded `\nope<key>` commands into the typeset output, from one source.

[Open PDF](../assets/pdf/statblock-example.pdf){ .md-button }

**Source**

=== "statblock-example.md"

    ````markdown
    --8<-- "example-vault/statblock/statblock-example.md"
    ````

=== "nope_statblock.tex"

    ````latex
    --8<-- "example-vault/statblock/nope_statblock.tex"
    ````

!!! note "Thanks"
    The `statblock` demo format follows the [Fantasy Statblock](https://plugins.javalent.com/statblocks) plugin, and its typeset look is modelled on the [DnD 5e LaTeX template](https://github.com/rpgtex/DND-5e-LaTeX-Template) by the rpgTeX team (MIT). Thanks to both.
