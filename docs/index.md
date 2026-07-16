# NOPE (Not anOther Pdf Exporter)

Write in [Obsidian](https://obsidian.md/), publish as a **typeset PDF**. NOPE exports your notes through a [Pandoc](https://pandoc.org/) + [LaTeX](https://www.latex-project.org/) pipeline in [Docker](https://www.docker.com/). No LaTeX installation, no copy-paste, no drift between your vault and your deliverable.

One concept per note, one main document with embeds. Cross-references number themselves, glossaries and bibliographies build themselves, branding comes from a note.

[Get started](getting-started.md){ .md-button .md-button--primary }

<video class="nope-demo" controls muted autoplay loop playsinline src="https://github.com/user-attachments/assets/962cc7c4-eca4-4ed5-a45c-2170d8e9f676"></video>

## Stumble over the features

<div class="grid cards" markdown>

-   <span class="nope-emoji">🧩</span>

    **Atomic notes & auto-numbered refs.** A main document is just frontmatter plus embeds. `[[wikilinks]]` become "Theorem 1.1" and "Table 5".

    [Concept](writing/concept.md)

-   <span class="nope-emoji">📚</span>

    **Citations.** BibTeX files or citation notes. `[[Smith 2020]]` becomes a real citation.

    [Citations](knowledge/citations.md)

-   <span class="nope-emoji">📖</span>

    **Glossary & acronyms.** One note per term, referenced by wikilink, collected into generated lists.

    [Glossary](knowledge/glossary.md)

-   <span class="nope-emoji">📊</span>

    **Tables.** Auto-fitted to the page or breaking across pages, numbered and referencable, from plain Markdown tables.

    [Tables](blocks/tables.md)

-   <span class="nope-emoji">🖼️</span>

    **Images & figures.** Embedded images become numbered figures with captions, scaled per embed.

    [Images](blocks/figures.md)

-   <span class="nope-emoji">🧜</span>

    **Mermaid diagrams.** Live in the editor, numbered figures in the PDF.

    [Mermaid](blocks/mermaid.md)

-   <span class="nope-emoji">📈</span>

    **TikZ & PGFPlots.** A ` ```tikz ` block that renders live in Obsidian and exports as a native, numbered vector figure.

    [TikZ](blocks/tikz.md)

-   <span class="nope-emoji">📐</span>

    **Theorems & environments.** LaTeX theorem environments with their own counters, plus fully custom environments fed by note frontmatter.

    [Theorems](blocks/theorems.md)

-   <span class="nope-emoji">🧮</span>

    **Equations.** `$$…$$` blocks as numbered equation/align/gather environments.

    [Math](blocks/equations.md)

-   <span class="nope-emoji">🎨</span>

    **Branding & templates.** One reusable look per document type, custom LaTeX templates, per-document package installs.

    [Branding](styling/branding.md)

-   <span class="nope-emoji">🧱</span>

    **Code blocks & custom blocks.** A fenced block's identifier decides its fate: raw LaTeX passthrough, a custom environment from your own template, or a plain code fence.

    [Code blocks](blocks/code-blocks.md)

</div>

## How it works

Exports run in a pinned Docker image (Pandoc + TeX Live), so documents render the same everywhere. Every PDF on this site was built by that pipeline.
