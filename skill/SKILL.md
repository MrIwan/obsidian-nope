---
name: nope
description: "Use when authoring or editing Obsidian notes that are exported to PDF via the nope plugin. Covers atomic-note structure, frontmatter keys (latex-env, caption, longtable, latex-short, gls-*, citekey, nope-branding, nope-template, nope-blocks, abstract, numbersections, book), wikilink embeds/refs, image figures, mermaid, code-block dispatch (latex passthrough, declared key:value blocks), glossary, citations, inline markup, callouts, branding and bases."
nope-version: "0.x"
last-updated: 2026-07-14
---

# nope — authoring conventions

nope exports Obsidian notes to PDF through a Pandoc/LaTeX pipeline. The model is **atomic**: every concept (theorem, table, equation, glossary entry, larger definition) **and every chapter** lives in its own `.md` file and is pulled into a short main document via wikilink embeds. A main document is mostly frontmatter plus `![[embeds]]`.

**Cross-references auto-number.** If a note is embedded in the document, `[[Note]]` resolves to its number ("Theorem 1.1", "Table 5", "Figure 2", "Equation 1"). A ref to a note that is *not* embedded falls back to plain text — no crash, so you can link freely while drafting.

**Every atomic note starts with `# Title` (H1).** Auto-heading-shift moves that H1 to the right depth for wherever it is embedded — never adjust heading levels by hand. **Exception:** `latex-env` notes (theorem family, `table`, `mermaid`, math) contain **no headings**; their body is wrapped in a LaTeX environment and the title/caption come from frontmatter.

## Embeds and refs

Embeds (`![[…]]`):

- `![[Note]]` — whole note (`.md` optional).
- `![[Note#Heading]]` — slice from a heading to the next heading of equal/higher level.
- `![[Note#^block-id]]` — slice from a block id.
- `![[image.png|Caption]]` — image **figure**; a caption is **required** for numbering and the list of figures. `|w=<value>` (at the caption end) scales per embed: percent, `px`, `cm` or `mm`.

Passive embed `+[[…]]` behaves **identically on export** to `![[…]]` (all variants work: `+[[Note#Heading]]`, `+[[image.png|Caption|w=60%]]`). The only difference is Obsidian's editor/reader view does **not** render it as an embed — handy to keep a main document with many embeds readable.

Refs (`[[…]]`):

- `[[Note]]` → `\autoref` → the typed name + number.
- `[[Note|Custom text]]` → hyperlink with your text.
- `[[GlossaryNote]]` → `\gls{<gls-id>}` when the target has a `gls-id` (glossary wins over an embed target of the same name).
- `[[CitationNote]]` → a citation when the target has a `citekey` (see Citation atoms); resolved after glossary, before embed targets.
- Multiple embeds of one note: refs point to the first occurrence (counters still advance).

**Chapter/section refs** (`numbersections`): by default a ref to an *embedded heading* — `[[Note#Heading]]`, or a bare `[[Note]]` pointing at a note whose body has headings — is a plain jump **hyperlink** (visible text = the link). Set `numbersections: true` in the **main document** frontmatter (or in the branding file) to make these resolve to `\autoref` instead, so they read "Kapitel X" / "Chapter X" (or "Abschnitt X" etc., depending on heading level). The same switch prints the numbers on the headings themselves — headings and cross-refs are numbered together by one key. Notes:

- `\autoref` always pairs the **name with the matching level**: a heading rendered as `\chapter` reads "Chapter X", a `\subsection` reads "Subsection 1.1.1". 
- Tune numbering depth with `secnumdepth:` (default 5). Without `numbersections` the template emits `\setcounter{secnumdepth}{-\maxdimen}` (no numbers) and refs stay plain jump links.
- The autoref name language follows `lang:` (e.g. `lang: de` → "Kapitel/Abschnitt", `lang: en` → "Chapter/Section").
- Custom-text refs (`[[Note#Heading|text]]`) stay plain hyperlinks regardless.

## `latex-env` — structured blocks

Set on an atomic note (no headings in the body):

- **Theorem family** — `theorem`, `lemma`, `definition`, `corollary`, `proposition`, `example` (and custom amsthm envs). Each type has its own counter ("Lemma 1.1", "Definition 1.2"). Optional `latex-short:` becomes the bracket title (`\begin{theorem}[<short>]`).
- **`proof`, `remark`, `note`** — unnumbered; a ref to them is a clickable hyperlink showing the note title, not a number. Embedding works normally.
- **`table`** — requires `caption:`; body is exactly one Pandoc table. Refs give "Table N". Layout via `longtable:` (see below).
- **`mermaid`** — requires `caption:`; body is exactly one ` ```mermaid ` block (Obsidian renders it live; export rasterises it to a numbered figure). Optional `w:`/`width:` (like image `|w=`) and `scale:` (1–5, default 2 ≈ 1600px; raise for large/sharp diagrams, bigger PNG). Identical diagram sources are cached. Inline ` ```mermaid ` blocks in notes *without* `latex-env: mermaid` are **not** rendered (they stay as a code fence).
- **Math** — `equation`, `align`, `gather`, `multline`, `alignat` (+ `*` variants); body is exactly one `$$…$$` block. `align`/`gather` may use `&` and `\\` (one number per line); `equation` with an inner `aligned` is multi-line with one number. Refs give "Equation N".

A missing required block (table/math) or missing `caption` (table/mermaid) is a hard export error.

### Custom environments

Any `latex-env` value that isn't built-in (theorem family, `table`, `mermaid`, math) is wrapped generically into `\begin{<name>}…\end{<name>}`, with `latex-short:` as the optional argument and `[[…]]` refs resolving via `\autoref`. The environment only has to be **defined** somewhere.

Define it in a **custom LaTeX template, not in `header-includes`** — raw LaTeX inside YAML frontmatter is brittle (quoting and escaping bite you, and it does not carry over between documents). A template is far more robust and reusable. Run `Create custom LaTeX template` (gives `nope_minimal.tex`), add your environment next to the existing `\newtheorem` block and point the document at it with `nope-template: "[[my-template]]"`:

```latex
% own counter per type → \autoref prints the right name, numbered "Praxisfall 1.1"
\newtheorem{praxisfall}{Praxisfall}[section]
\providecommand{\praxisfallautorefname}{Praxisfall}
```

A note with `latex-env: praxisfall` then renders as that environment and `[[…]]` refs read "Praxisfall N". The `\providecommand{…autorefname}` line is what makes `\autoref` print your name instead of inheriting the previous counter — keep it. Same pattern for any amsthm style (`\theoremstyle{definition}` etc.). Keep the `%%% NOPE-IMPORTS %%%` block intact (see `nope-template` below).

**Restyling NOPE defaults.** Callouts, fit tables, highlights and header logos render through overridable LaTeX names whose defaults ship with the export: `nopecallout{<type>}` (environment; default maps the Obsidian type to an awesomebox), `nopefittable{<align>}{<colspec>}{<caption>}` (environment; default is a one-page auto-shrunk booktabs table), `\nopehl{…}` (default: soul highlight) and `\nopelogo[<height>]{<path>}` (default: raised `\includegraphics`, 0.7cm). Define any of these names in a custom template **before** the header-includes to replace the default — e.g. restyle all callouts without touching the pipeline. If you don't, the defaults apply; old templates keep working.

### `longtable` (table layout, default `false`)

- `false` — table stays on **one page** and, if wider than the text, is scaled down to fit (no column overflow). Best for **wide, compact** tables. It does not break across pages; in this mode wikilinks **inside cells are not resolved**.
- `true` — set as a `longtable` that breaks across pages with a repeating header. Best for **long** tables; very wide columns with long words can overflow sideways.

Rule of thumb: wide → keep `false`, long → `true`. A table cannot be both.

`align:` (on the table note, `center` default or `left`) sets horizontal placement; works in both layouts.

```yaml
---
latex-env: mermaid
caption: "Architecture overview"
w: "60%"
scale: 3
---
```

## Code blocks (fenced, in flowing text)

Fenced code blocks anywhere in prose are dispatched by their language identifier — no atomic note needed:

- ` ```latex ` — body goes into the PDF as **raw LaTeX, unchanged**. No escaping, no wikilink resolution, no validity check (a typo aborts the build with the usual `!`-line); packages you use must exist (custom template `\usepackage` + Settings → Extra LaTeX packages). Use for one-off constructs, e.g. a `\dirtree{…}` directory tree.
- ` ```<identifier> ` — if declared under `nope-blocks:` (doc frontmatter or branding note, e.g. `nope-blocks: [statblock]`; list or single value, exact case-sensitive match), the body must be **flat `key: value` lines** and renders as `\begin{<identifier>}…\end{<identifier>}` with each key exposed as `\nope<key>` (identical access pattern to frontmatter forwarding in custom environments — one template env serves both the atomic `latex-env` entry and the inline fence). The environment must be defined in a custom template. Values: surrounding quotes stripped, LaTeX specials escaped; a non-`key: value` line is a **hard export error**. Macros are scoped per block.
- Anything else (or no identifier) stays a normal code fence — including ` ```mermaid `, which still renders only in `latex-env: mermaid` notes.

Declared blocks are **unnumbered and not referencable**; for numbering and `[[refs]]` use an atomic `latex-env` note instead.

````markdown
```statblock
name: Goblin Boss
ac: 17
hp: 21 (6d6)
```
````

## Bases

Embed an Obsidian base view with `![[Base.base#View]]`. What it produces depends on the **surrounding note's `latex-env`**:

- **No `latex-env` (default)** — every file the view returns is **transcluded**, in the view's order. Use it as a document spine / table of contents and put the embed straight into the document.
- **`latex-env: table` + `caption:`** — the view is rendered as a **table** with exactly the columns, order and sort of that view. A table needs a caption, so this lives in an atomic wrapper note whose body is just the base embed; pull the wrapper in with `![[…]]`. `longtable:` and `align:` work as for any table.

The query (filters, formulas, sort, columns) is evaluated by Obsidian's real Bases engine at export — what the view shows is what you get. `#View` is optional (first view otherwise). Requires the core **Bases** plugin enabled (Obsidian ≥ 1.10).

**`this` (host-note context).** Filters and formulas may reference the note the base is embedded in via `this`. At export the embedding note's values are frozen into the query, so e.g. `status == this.status` or `file.inFolder(this.file.folder)` resolve against that note, and a `this.file.link` formula column renders a link to it. Supported references:

- a bare `this` or `this.file` — the host **file object**, so `file.hasLink(this)` (and `file.hasLink(this.file)`) work, e.g. to pull in every note that links back to the current one
- `this.file.path`, `this.file.name`, `this.file.basename`, `this.file.folder`, `this.file.ext`, `this.file.link`
- any host frontmatter key — `this.status`, `this.<key>`, including nested `this.author.name`

A missing frontmatter key resolves to `null` (same as Obsidian). **Not** supported: `file.*` properties outside the list above — these resolve to `null`/empty, so don't rely on them.

Transclude (spine) — straight in the document:

```markdown
## Chapters

![[Thesis-Chapters.base#Reading order]]
```

Table — atomic wrapper note, embedded via `![[Project-Overview]]`:

```markdown
---
latex-env: table
caption: "Project overview"
---
![[Projects.base#Table]]
```

## Glossary atoms

One `.md` per term/acronym; referenced anywhere with `[[Note]]` → `\gls{<gls-id>}`. `acronym` goes to the acronym list, `term` to the glossary.

```yaml
---
gls-id: ai                # unique LaTeX id
gls-short: AI
gls-long: Artificial Intelligence
gls-description: ""        # used for terms
gls-type: acronym          # acronym | term
---
```

## Document and branding frontmatter

Standard Pandoc/Eisvogel keys (`lang`, `toc`, `toc-depth`, `lof`, `lot`, `geometry`, `fontsize`, `titlepage`, `titlepage-logo`, `header-left`, link colors, …) work as usual. Precedence: **doc frontmatter > branding note > plugin `_base.yml`**.

- **`book: true`** — switch to the book class (`scrbook`). `#` → part, `##` → chapter, `###` → section (default `article` maps `#` → section). Cross-refs to a `##` chapter read "Kapitel/Chapter"; a ref to a `#` part currently reads "Part N" (not localized).

- **`abstract`** — text block, or a quoted wikilink whose note body becomes the abstract (frontmatter stripped; heading slices and embeds work). `abstract-title:` overrides the heading. No key → no abstract page.
- **`nope-branding: "[[Branding-Note]]"`** — apply a branding note (see below). Without it the `_base.yml` defaults apply.
- **`nope-template: "[[my-template]]"`** — use a custom `.tex` Pandoc template instead of Eisvogel (doc or branding frontmatter; without it Eisvogel is used). The template **must keep the marked `%%% NOPE-IMPORTS %%%` block** (all required packages) or tables/callouts/theorems/glossary break — the export warns if it is missing. Start from the `Create custom LaTeX template` command (`nope_minimal.tex`).

### Citations

Pandoc-citeproc against a `.bib` in the vault; the file is resolved via Obsidian's link index, so a plain path or wikilink both work and folders with spaces are fine.

```yaml
bibliography: "references.bib"   # or "[[references.bib]]"
csl: chicago-author-date         # optional; default style otherwise
```

In-text (standard Pandoc): `[@key]`, `[-@key]` (suppress author), `@key` (author in text), `[@key, p. 42]` (locator), `[@a; @b]` (multiple). The bibliography is appended automatically; place it explicitly with a `::: {#refs}\n:::` placeholder. Recommended source-of-truth workflow: Zotero + Better BibTeX (auto-export `.bib` into the vault).

#### Citation atoms (`citekey`)

Like glossary atoms, but for sources: one `.md` per reference with a `citekey` plus the bibliographic fields. A `[[Note]]` wikilink to it becomes a citation (`[@citekey]`); the plugin generates the matching BibTeX entry automatically, so no `.bib` file is needed. Works on its own or alongside a `bibliography:` `.bib` — both feed the same reference list.

```yaml
---
citekey: smith2020          # the cite key used in the bibliography
bibtype: article            # optional BibTeX type (default: misc)
author:                     # list → joined with " and "; quote each "Last, First"
  - "Smith, Jane"
  - "Doe, John"
title: A Study of Things
year: 2020
journal: Journal of Things
volume: 12
pages: 33-58
doi: 10.1000/xyz
---
```

Recognized fields: `author`, `editor`, `title`, `year`, `month`, `journal`, `booktitle`, `publisher`, `institution`, `school`, `organization`, `volume`, `number`, `pages`, `series`, `chapter`, `edition`, `address`, `doi`, `url`, `isbn`, `issn`, `howpublished`, `note`, `keywords`, `abstract`. A single author can also be one string (`author: "Smith, Jane and Doe, John"`). Reference it with `[[Smith 2020]]` anywhere in the document or in an embedded note. To set a CSL style for a citation-notes-only document, add a `bibliography:` `.bib` (even an empty one) so the `csl:` key takes effect.

### Branding notes

One `.md` per customer/project with frontmatter overrides; the body is ignored on export. **Quote every wikilink value** (`"[[logo.png]]"`) — unquoted, YAML parses it as a list and fails. Logo wikilinks in header/footer slots (`header-left/center/right`, `footer-left/center/right`) auto-expand to `\nopelogo{<path>}` (a raised `\includegraphics`); default height `0.7cm`, override with `"[[logo.png|h=1.2cm]]"`. `titlepage-logo`/`titlepage-background` take a plain path (substitution only). SVG logos are unsupported under pdflatex — use PNG/PDF.

**Always reference a logo by wikilink, never by an absolute path.** The export copies the linked image into the per-document build folder and rewrites the path to point there, so the LaTeX run finds it. An absolute path (e.g. `/Users/me/logo.png`) is *not* copied and lives outside the build sandbox, so the image is missing and the build fails. Use `"[[logo.png]]"`; the file may sit anywhere in the vault.

## Inline markup

- `%%text%%` → comment, invisible in the PDF (works across blank lines).
- `==text==` → highlight (paragraph-scoped; unbalanced `==` kept literally).
- Obsidian callouts render as callout boxes; all types (`[!note]`, `[!warning]`, `[!tip]`, …) are supported.

## Unsupported characters

The pdflatex engine cannot typeset emoji/pictographs (✅, 😀, flags, …). Such characters are **stripped** from the PDF and the export shows a notice with the count — the build no longer crashes. Accents, `€`, dashes etc. are kept. (Real emoji rendering would need a different engine + font.)

Greek letters (θ, η, …), math operators (−, ≤, ≥, ≠, ∞, →, ∑, ∫, ∈, …) and sub/superscript digits (₂, ⁴, …) pasted as **literal Unicode** are mapped to a LaTeX rendering automatically, so they no longer crash the build. If a *new* symbol still aborts the build with "Unicode character … not set up for use with LaTeX", add a `\DeclareUnicodeCharacter{<hex>}{…}` line to the `NOPE-IMPORTS` block in the template — or just write it as math (`$\theta_2$`) in the first place.

## When the build fails

The export notice shows the failing phase, but the real cause is in the build logs (in the plugin folder under `pipeline/build/`):

- `pipeline/build/<doc>/<doc>.log` — the full pdflatex log for that document. Search it for a line starting with `!` (the first LaTeX error) — that line and the few after it name the cause. The preview's error banner already surfaces this first `!`-line.
- `pipeline/build/<doc>/build_sh.log` — the full pipeline run log (pandoc + latexmk output) of that document's export; kept together with the LaTeX intermediates.
- `pipeline/build/last-build.log` — the Docker **image** build log (only relevant when the image build itself fails, not a document build).

`Latexmk: ... Problematic refs and citations` and `multiply defined` are **warnings**, not the failure — keep reading to the `!`-line for the actual error. Common culprits: an unset Unicode character (see above), a missing `caption:` on a `latex-env: table`/`mermaid` note, or a malformed custom template.

## Running the pipeline standalone (no Obsidian)

The whole export runs headless via Docker — useful to test a document or reproduce a build failure without driving the Obsidian UI:

```bash
cd <vault>/.obsidian/plugins/nope/pipeline
VAULT_PATH="/absolute/path/to/vault" docker compose run --rm pipeline "Folder/Document.md"
```

- The document path is **relative to the vault root**; the PDF lands in `pipeline/build/<doc>/<doc>.pdf`, logs and LaTeX intermediates next to it (`build_sh.log`, `<doc>.log`, `<doc>.tex`).
- Requires the `nope` Docker image (built by the plugin on first export, or manually via `docker compose build` in the same directory).
- Everything resolves inside the container — custom templates, branding, bibliography, citation notes, mermaid. **Exception: Bases** (`![[X.base#View]]`) need the Obsidian API and stay empty in standalone runs.
- Failures exit non-zero; resolution errors print a `>>> NOPE-ERROR: …` line naming the cause.
- `NOPE_BUILD_PATH=/some/dir` redirects the output root (defaults to `./build`) — handy for throwaway test runs.

## Commands

- `Export active note to PDF` — main command.
- `Open PDF preview` / `Toggle click-to-open in PDF preview` — live PDF preview pane. Its toolbar has a one-shot editor→PDF sync button (scrolls to the cursor's anchor) plus a click-to-open toggle (also switchable via the command): while active, clicking into the PDF opens the note rendered at that spot in the last active editor tab (title page/TOC open the main document). The setting "Follow on Ctrl/Cmd+click" (on by default) enables both directions per modified click without any toggle: mod-click in an embedded note syncs the PDF, mod-click in the PDF opens the note.
- `Add structured note` — opens a picker (table / base table / theorem / lemma / definition / proof / mermaid diagram / equation / glossary term / abbreviation); the chosen type creates an atomic note with the correct frontmatter + body skeleton next to the current note and inserts its embed (`![[…]]`) or, for glossary/abbreviation, its ref (`[[…]]`) at the cursor. With text selected, the selection becomes the note body instead of the skeleton and is replaced by the link — extract-to-note in one step.
- `Create branding template` / `Create custom LaTeX template` / `Create example main document` — scaffold helper files in the vault.
- `Build docker image (with cache)` / `Remove docker image` / `Cleanup build folder` — pipeline maintenance (the image also rebuilds itself after a plugin update changes the pipeline).

## Do / don't

DO:

- One concept or chapter per atomic note; pull it in with `![[…]]`.
- Start every atomic note with `# Title` — except `latex-env` notes.
- Exactly one Pandoc table per `table` note; exactly one `$$…$$` per math note.
- Quote wikilink values in YAML: `"[[logo.png]]"`.
- A base embed transcludes by default; wrap it in a `latex-env: table` note to get a table.
- Declare custom code-block identifiers in `nope-blocks:` and define the matching environment in a custom template.

DON'T:

- No headings inside `latex-env` notes.
- Don't omit `caption` on `table`/`mermaid` notes — hard error.
- Don't embed an image without a caption — no figure, no number.
- Don't put a ` ```mermaid ` block in a note without `latex-env: mermaid` — it stays a code fence.
- Don't set `\label{}` or adjust embed heading levels by hand — both are automatic.
- Don't use SVG logos — pdflatex can't render them; use PNG/PDF.
- Don't give a logo as an absolute path — use a wikilink (`"[[logo.png]]"`) so the image is copied into the build folder; an absolute path is missing at build time.
- Don't put more than one base embed — or a base embed plus a literal table — in one `table` wrapper.
- In a base, `this`/`this.file` (host file object), the listed `this.file.*` properties and host frontmatter keys are supported; other `file.*` props on `this` resolve to null at export.
- Don't expect wikilinks or `==markup==` inside ` ```latex ` or declared code blocks to resolve — fence content is raw.
- Don't put free prose in a declared code block — only flat `key: value` lines; anything else is a hard export error.

## Example main document

```markdown
---
title: "My Report"
nope-branding: "[[Branding-Customer1]]"
toc: true
abstract: "[[My-Abstract]]"
---

![[Chapter-Introduction]]

![[Chapter-Theory]]

![[Chapter-Results]]
```

Each chapter atom starts with `# Title` and holds its own prose plus further embeds (`![[Theorem-Pythagoras]]`, `![[Table-Comparison]]`, `![[plot.png|Caption]]`) and refs (`[[AI]]`, `[[Table-Comparison]]`). Auto-heading-shift handles the levels.

