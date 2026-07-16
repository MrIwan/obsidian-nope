# TikZ diagrams

A note with `latex-env: tikz` and a `caption:` holds one ` ```tikz ` block. Obsidian renders it live through [obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax), and the export compiles it natively into a numbered, referencable vector figure.

The block is tikzjax-compatible. Everything before `\begin{document}` (packages, `\usetikzlibrary`, `\pgfplotsset`) is hoisted into the document preamble, and the picture between `\begin{document}` and `\end{document}` becomes the figure body. Declare the packages the block needs via `nope-tlmgr`, for example `[pgfplots]`, so they are installed at export.

[Open PDF](../assets/pdf/feature-tikz.pdf){ .md-button }

**Source notes**

=== "feature-tikz.md"

    ````markdown
    --8<-- "example-vault/features/feature-tikz.md"
    ````

=== "tikz-example.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/tikz-example.md"
    ````

!!! note "Thanks"
    The ` ```tikz ` block format follows the [obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax) plugin by artisticat1, so the same block renders live in Obsidian and exports here.
