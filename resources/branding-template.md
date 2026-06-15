---
lang: en
toc: true
toc-own-page: true
toc-depth: 3
lof: true
lot: true
titlepage: true
titlepage-color: "FFFFFF"
titlepage-text-color: "1A1A1A"
titlepage-background: "[[bg.png]]"
titlepage-logo: "[[logo.png]]"
header-left: "[[logo.png]]"
---

# Branding Template

> [!note] The text below is documentation only and has **no effect** on the
> branding. Only the frontmatter keys above are read by `nope`. Edit those.

This file defines **branding overrides** for `nope`. Duplicate it per customer
(e.g., `Branding-Customer1.md`) and edit the frontmatter keys above. Enable
branding in an export note by adding `nope-branding: "[[Branding-Customer1]]"`
to its frontmatter — or run the command **Set branding for this note**, which
writes the key for you. If unset, the plugin uses defaults from `_base.yml`.

## Key rules

- **Always quote wikilinks**: `"[[logo.png]]"`, not `[[logo.png]]`. Unquoted
  wikilinks are parsed as YAML lists and the value fails.
- **Body ignored on export**. Document freely here without side effects.
- **Precedence**: a key in the export note overrides the branding file, which
  overrides the plugin defaults in `_base.yml`.

## Key reference

### Language

- `lang`: Language code (e.g., `en`, `de`). Controls Babel in the LaTeX
  template, sets `Figure`/`Table`/`Equation` captions and `\autoref` labels.

### Table of contents

- `toc`: Generate table of contents.
- `toc-own-page`: Place TOC on a separate page (true) or inline (false).
- `toc-title`: Title of the TOC.
- `toc-depth`: Heading depth for TOC entries (1–6).
- `lof`: Generate list of figures.
- `lot`: Generate list of tables.

### Title page

- `titlepage`: Generate a title page.
- `titlepage-color`: Background color (hex without `#`, e.g. `FFFFFF`).
- `titlepage-text-color`: Text color (hex without `#`).
- `titlepage-background`: Full-width background image. Use a quoted wikilink,
  e.g. `"[[bg.png]]"`. The image can be anywhere in the vault.
- `titlepage-logo`: Logo at the top of the title page. Also a quoted wikilink.

### Header and footer

For `header-left`, `header-center`, `header-right`, `footer-left`,
`footer-center`, and `footer-right`:

- **Plain text**: `header-left: "Draft"` renders text directly.
- **Logo via wikilink**: `header-left: "[[logo.png]]"` auto-expands to
  `\raisebox{-0.3\height}{\includegraphics[height=0.7cm]{<path>}}`. Default
  height is `0.7cm`; override with an optional `|h=<value>` suffix:
  `"[[logo.png|h=1.2cm]]"`. Accepted units: `cm`, `mm`, `pt`, `em`, and LaTeX
  lengths like `0.5\textheight`.
- **Mixed mode (text + logo)**: write the LaTeX snippet manually; embedded
  `[[…]]` still resolve to container paths, e.g.
  `header-left: "Draft – \\includegraphics[height=0.5cm]{[[logo.png]]}"`.
