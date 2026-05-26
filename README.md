# obsi-print

Obsidian → publication-ready PDF. Powered by pdflatex and pandoc, all encapsulated in Docker. No local TeX installation required; reproducible builds.


Atomic notes are the core concept of 'thinking' in Obsidian. It is therefore most natural to create a document out of these atomic notes. The core idea is to include notes with the normal '![[]]' syntax and then reference them with normal links, which will then be turned into hyperlinks. This concept applies to chapters, complete note embeddings or embedding from one heading, tables, and custom LaTeX environments such as theorems. The glossary is also built up from simple linked notes. Frontmatter drives everything.



## Install

Community Store: pending.

Until then, via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install BRAT.
2. Add beta plugin: `MrIwan/obsi-print`.
3. Enable Obsi Print.

Requires Docker. First export builds the image.

## Example

`Theorem-Pythagoras.md`:

```yaml
---
latex-env: theorem
latex-short: Pythagoras
---
# Pythagoras
$a^2 + b^2 = c^2$
```

Anywhere else:

```markdown
![[Theorem-Pythagoras]]

From [[Theorem-Pythagoras]] we have ...
```

Embed becomes a numbered theorem. Ref becomes `\autoref{Theorem 1}`. Same model for tables, equations, figures, glossary terms, mermaid.

Full syntax: [`skill/SKILL.md`](skill/SKILL.md).

## Features

Embeds and refs

- Full note, `#Heading`-slice, `#^block-id`-slice
- Auto-heading-shift on embed — host context decides depth, no manual tweaking
- `[[Note]]` → `\autoref` with localized prefix; `[[Note|Text]]` → `\hyperref`; refs to non-embedded targets fall back to plain text
- Passive embeds `+[[…]]` — expanded in PDF, hidden in Obsidian preview
- Multi-embed safe — label on first occurrence, counter increments, no "multiply defined" warnings

Structured blocks via `latex-env`

- `theorem`, `lemma`, `definition`, `proof` + custom amsthm envs; `latex-short` for `(Pythagoras)`
- `table` with mandatory caption, auto-label, LoT entry
- `equation`, `align`, `gather`, `multline`, `alignat` + star variants; `aligned` inside `equation` for multi-line single-number
- `mermaid` as atomic note — cached by source hash, `scale:` 1–5 for resolution, `w:` for size

Everything else

- Image embeds with width hints: `![[plot.png|Caption|w=60%]]` (percent, px, cm, mm, `\textwidth`)
- Glossary via `gls-id` frontmatter — acronym list + glossary, auto `\gls{…}`
- Obsidian callouts → awesomebox; `%%comments%%` (multi-block), `==highlights==`
- Per-customer branding overrides — header/footer logos auto-expand to `\includegraphics`
- TOC, list of figures, list of tables — German Babel out of the box
- Maintenance UX: build/remove image, cleanup, keep-intermediates toggle for debugging
- AI authoring skill — install `skill/SKILL.md` into your vault for Claude, Cursor and friends

## License

See LICENSE.
