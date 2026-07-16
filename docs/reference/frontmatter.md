# Frontmatter keys

Standard Pandoc/Eisvogel keys (`title`, `author`, `lang`, `toc`, `toc-depth`, `lof`, `lot`, `geometry`, `fontsize`, `titlepage`, header/footer slots, link colors, …) work as usual. Precedence: **document frontmatter › branding note › defaults**.

## Document level

| Key | Values | Effect |
| --- | --- | --- |
| `nope-template` | `"[[my-template.tex]]"` | Use a custom LaTeX template instead of Eisvogel. Must keep the `NOPE-IMPORTS` block. |
| `nope-branding` | `"[[Branding-Note]]"` | Apply a branding note (colors, logos, title page). |
| `nope-blocks` | `[myblock, …]` | Declare code-block identifiers rendered as template environments. |
| `nope-tlmgr` | `[cancel, pgfplots]` | LaTeX packages installed automatically during export. |
| `abstract` | text or `"[[Note]]"` | Abstract page. `abstract-title:` overrides the heading. |
| `numbersections` | `true` | Number headings **and** make chapter/section refs read "Chapter X". `secnumdepth:` tunes depth. |
| `book` | `true` | Book class: `#` → part, `##` → chapter, `###` → section. |
| `bibliography` / `csl` | `"refs.bib"` / style | Citations via citeproc. |

## Atomic notes (`latex-env`)

| Key | Values | Effect |
| --- | --- | --- |
| `latex-env` | `theorem`, `lemma`, `definition`, `corollary`, `proposition`, `example` | Numbered amsthm environment, own counter per type. |
| | `proof`, `remark`, `note` | Unnumbered. Refs become title links. |
| | `table` | Body is one Markdown table. **Requires `caption:`**. |
| | `mermaid` | Body is one ` ```mermaid ` block. **Requires `caption:`**. |
| | `equation`, `align`, `gather`, `multline`, `alignat` (+ `*`) | Body is one `$$…$$` block. |
| | anything else | Custom environment from your template. Frontmatter keys become `\nope<key>` commands. |
| `caption` | text | Table/mermaid caption (required there). |
| `latex-short` | text | Bracket title for theorem-family environments. |
| `longtable` | `true`/`false` | Long tables break across pages. Default fits one page. |
| `align` | `center`/`left` | Table placement. |
| `w` / `width`, `scale` | `60%`, `1`–`5` | Mermaid figure size and render resolution. |

## Glossary & citation atoms

| Key | Effect |
| --- | --- |
| `gls-id`, `gls-short`, `gls-long`, `gls-description`, `gls-type` | Glossary/acronym entry. Referenced via `[[wikilink]]`. |
| `citekey`, `bibtype` + bibliographic fields (`author`, `title`, `year`, …) | Citation note. `[[wikilink]]` becomes a citation and BibTeX is generated. |
