# Callout Test

This section tests every callout type the Lua filter supports. Each block should render as a coloured box with an icon — not as a grey blockquote.

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

# Table Test

| Criterion                      | Obsidian Default Export | Better Export PDF               | Enhancing Export              | Pandoc Plugin               |
| ------------------------------ | ----------------------- | ------------------------------- | ----------------------------- | --------------------------- |
| Last updated (as of Jan 2026)  | With Obsidian core      | Active (2025)                   | Active (2025)                 | Rare, long gaps             |
| Render engine                  | Obsidian render engine  | Obsidian render engine (Chrome) | Pandoc + pdfLaTeX             | Pandoc + pdfLaTeX           |
| Callouts                       | Yes                     | Yes                             | No (or blockquote only)       | No (or blockquote only)     |
| Mermaid                        | Yes                     | Yes                             | Not natively (filter only)    | Not natively (filter only)  |
| Formulas (LaTeX/MathJax)       | Yes, limited            | Yes                             | Yes, full (native LaTeX)      | Yes, full (native LaTeX)    |
| Excalidraw                     | Yes, if auto-export on  | Yes, if auto-export on          | Only if exported as PNG/SVG   | Only if exported as PNG/SVG |
| Embedded file links (`![[…]]`) | Yes                     | Yes                             | No (Pandoc doesn't know them) | Yes, resolves embeds        |
