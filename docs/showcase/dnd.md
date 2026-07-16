# DnD 5e rebuild

The full stress test: a rebuild of the example from the wonderful [DnD 5e LaTeX template](https://github.com/rpgtex/DND-5e-LaTeX-Template) by the rpgTeX team (MIT, thank you!) as a NOPE document. Two-column layout, Bookman/kpfonts/Gillius fonts, red small-caps headings, 5e boxes and a complete monster stat block. All from ordinary Obsidian notes.

Everything on this page exercises features you can use in your own documents:

- **Callouts as 5e boxes**: `[!quote]` becomes read-aloud text, `[!tip]` a sidebar, via a `nopecallout` override in the [custom template](../styling/templates.md).
- **A Fantasy-Statblock-compatible ` ```statblock ` fence** for Monster Foo: [code blocks](../blocks/code-blocks.md) render it live in Obsidian and typeset it on export.
- **Custom environments** `dndfeat`, `dnditem`, `dndspell` fed by note frontmatter.
- **Raw ` ```latex ` fences** for the auto-numbered map regions.
- **The whole font stack via [`nope-tlmgr`](../styling/tlmgr.md)**, with no manual package installs.

<iframe class="nope-pdf" src="../../assets/pdf/dnd-example.pdf" title="Exported PDF"></iframe>

[Open PDF](../assets/pdf/dnd-example.pdf){ .md-button .md-button--primary }

## The main document

The entire book is four embeds plus frontmatter:

````markdown title="dnd-example.md"
--8<-- "example-vault/dnd-example/dnd-example.md"
````

Browse the chapter notes in [`example-vault/dnd-example/`](https://github.com/MrIwan/obsidian-nope/tree/master/example-vault/dnd-example). It includes `nope_dnd.tex`, the custom template that defines the 5e look.
