---
lang: en
toc: true
toc-own-page: true
toc-depth: 3
lof: false
lot: false
titlepage: true
titlepage-rule-height: 1
header-left:
numbersections: true
book: false
secnumdepth: "2"
---

# Branding-Template

This note controls the branding of an export. In your document set:

```yaml
---
nope-branding: "[[branding-template]]"
---
```

(or the name of a copy of this file, e.g. `[[Branding-Client1]]`).

## What the keys mean

- **lang** — document language. `de` activates the German caption prefixes
  (`Abbildung`, `Tabelle`, `Gleichung`); `en` uses Figure / Table / Equation.
- **toc / toc-own-page / toc-title / toc-depth** — table of contents on/off,
  own page, title, depth (3 = down to `###`).
- **lof / lot** — list of figures / list of tables on/off.
- **titlepage** — title page on/off. When `false`, all `titlepage-*` keys are
  ignored.
- **titlepage-color** — title-page background colour, 6-digit hex without `#`.
- **titlepage-text-color** — text colour for title, author and date.
- **titlepage-rule-color / -height** — rule below the title.
- **titlepage-background** — full-bleed background image of the title page.
  Wikilink to a file in the vault.
- **titlepage-logo** — logo shown on the title page.
- **header-left** — left-hand content of the page header. Plain text works
  directly; embedding a logo needs LaTeX.

## Wikilink rules

1. Every `[[…]]` in the frontmatter MUST be wrapped in double quotes —
   otherwise YAML parses it as a flow sequence.
2. Resolution follows Obsidian's usual disambiguation (same folder first,
   then nearest, then alphabetical). To force a root path, use
   `"[[/client1/branding/logo.png]]"`.
3. On export, every referenced file is copied into the pipeline's internal
   build folder — the originals in the vault stay untouched.

## Usage

1. Duplicate this file, e.g. to `Branding-Client1.md`.
2. Edit the values (swap logos, adjust colours).
3. In the document to export, set the frontmatter:
   `nope-branding: "[[Branding-Client1]]"`.
4. Export. The branding is resolved fresh on every export.
