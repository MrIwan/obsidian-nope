# Handover — Obsi Print Plugin

Stand: Image-Figure-Feature und Tabellen-Numbering laufen. Beides via RawInline-`\label{}`-Injektion in der Caption (Pandoc-Version-unabhängig). `pandoc-crossref` ist aus der Pipeline raus. Frontmatter-basierte Note-Konfiguration ist konsolidiert auf Single-Source.

## Plugin-Architektur (Kurzfassung)

Zwei Hälften:

**Obsidian-Plugin** (TypeScript, in `src/`) — registriert zwei Commands („Export active note to PDF", „Build docker image with cache"), eine Settings-UI (Output-Path, Auto-Open-PDF, Preflight-Checks, Setup-Section mit Build-Button + `noCache: true`). Spawnt Docker-Compose mit `VAULT_PATH` als ENV.

**Docker-Pipeline** (in `pipeline/`) — `pandoc/extra:latest` als Base, plus `bash` und einige tlmgr-Pakete. Fünf Lua-Filter laufen in Reihenfolge: `pdf.lua` (Math-Compat), `obsidian-transclude.lua` (Embeds + Wikilinks + Map-basiertes Autoref + Image-Figures + Table-Captions), `obsidian-inline.lua` (Comments + Highlights), `callouts.lua` (Obsidian-Callouts → awesomebox), `glossary.lua` (Glossary-Refs). Kein `pandoc-crossref` mehr — wurde durch eigene RawInline-Label-Logik plus Babel-`ngerman`-Naming-Renames ersetzt. Plus Eisvogel-Template, plus latexmk-Loop.

Bind-Mounts: `/vault` (read-only Vault), `/app` (read-only Plugin-Pipeline-Folder), `/build` (writable Intermediates + finale PDF, intentional persistent für Debugging — Plugin kopiert die finale PDF zum konfigurierten Output-Path).

## Was funktioniert (stabil getestet)

Note-Embeds und -Slices: `![[Note]]`, `![[Note#Heading]]`, `![[Note#^block-id]]` — voller und sliced Note-Embed mit korrekter Slice-Logik (bis zum nächsten Heading gleicher/höherer Ebene). Block-IDs werden beim Embed gestrippt und gelabelt.

Wikilink-Auflösung: `[[Note]]`, `[[Note|Display]]`, `[[Note#Heading]]`, `[[Note#^id]]` — über eine Map die beim Embed gefüllt wird. Default-Display nutzt `\hyperref[label]{display}` oder `\autoref{label}` (je nach Target-Typ), custom display bleibt immer `\hyperref`. Refs auf nicht-eingebettete Notes fallen graceful als Plain-Text durch (für „Denkprozess-Verweise", die nicht im PDF landen sollen).

`.md`-Canonicalization: `![[X.md]]`/`[[X.md]]` und `![[X]]`/`[[X]]` und gemischte Schreibweisen funktionieren alle identisch. `parse_anchor`+`load_note` strippen die `.md`-Extension beim Map-Key-Bilden, der Resolver strippt sie ebenfalls beim Lookup.

`latex-env: theorem` (und andere amsthm-Envs wie lemma, definition): Voll-Embed wird in `\begin{theorem}[latex-short]\label{note:X}…\end{theorem}` gewrapped. Default-Display-Wikilinks darauf nutzen `\autoref` → „Theorem N". Custom-Display bleibt `\hyperref`. Optional-Arg via `latex-short:` Frontmatter.

`latex-env: table`: Tabellen-Note bekommt `caption: "…"` im Frontmatter (mandatory — Filter wirft harten Error wenn fehlt). Pandoc-Table wird mit dieser Caption + `\label{tab:X}` als RawInline am Caption-Ende versehen — kein `\begin{table}`-Wrap (würde mit longtable konfligieren). Single-Source: keine Pipe-Caption am Embed-Tag, keine Pandoc-Native-`: …`-Fallback. Wikilinks darauf → `\autoref{tab:X}` → „Tabelle N".

Image-Figures: `![[bild.png|Caption]]` und `![[bild.png]]` (ohne Caption → Filename als Caption) werden zu nummerierten Figures mit Label. `\label{fig:X}` wird als RawInline ans Caption-Ende gehängt (Pandoc 3.9.x emit kein `\label` aus `Figure.attr.identifier`, RawInline ist der portable Weg). Wikilinks `[[bild.png]]` → `\autoref{fig:X}` → „Abbildung N".

„Abbildung"/„Tabelle" statt „Figure"/„Table": durch zwei Mechanismen — Babel-`ngerman` setzt `\figurename`/`\tablename` (Caption-Prefix), plus Template-`\AtBeginDocument`-Block (Zeile ~980 in eisvogel.tex) mit `\IfPackageLoadedTF{babel}+\iflanguage{ngerman}` setzt `\figureautorefname`/`\tableautorefname` etc. (was `\autoref` rendert).

Inline-Filter: `%%text%%` Comments (auch multi-block über Leerzeilen hinweg), `==text==` Highlights (paragraph-scoped, unbalanced wird literal reverted), in `obsidian-inline.lua`.

Mehrfach-Embed der gleichen Note: für Note-Embeds (normal + table-env + image-figure) wird das `\label{}` nur beim ersten Embed gesetzt — vermeidet „multiply defined"-Warnungen. Für theorem-Env-Wraps wird das Label aktuell noch bei jedem Embed neu emitted (latenter Bug, falls jemand das gleiche Theorem zweimal voll-embedded; bisher nicht real getroffen).

## Was offen / nicht erledigt

**1. Dead-Metadata in `branding/_base.yml` aufräumen.** Nach dem crossref-Schnitt sind `figureTitle`, `tableTitle`, `figPrefix`, `tblPrefix`, `eqnPrefix` reine No-Ops (Pandoc reicht sie weiter, niemand liest sie mehr). `lang: de` muss bleiben (treibt Babel-`ngerman`). Reines Cleanup, niedrige Priorität.

**2. Equation-Numbering und Refs.** Pendant zum Image-/Table-Feature für Math-Blocks (`$$ … $$`). Mechanik analog: `\label{eq:X}` in eine equation-Environment injizieren, Wikilink-Resolver mit autoref-Target. Frontmatter-Konvention noch zu entscheiden — ggf. `latex-env: equation` mit `caption:`-Frontmatter analog zu tables (auch wenn Equations selten Captions haben, brauchen sie zumindest einen Label-Anker, der über die Note-Identity gebunden ist). Open question: soll man auf eine Equation in der Note oder eine bestimmte Math-Inline referenzieren können? Vermutlich Note-Level reicht.

**3. Aufräumen: `Tabelle-Mit-Eigener-Caption.md`.** Beim Single-Source-Refactor wurde die Test-Note inhaltlich auf „Risikomatrix" umgestellt — der Filename passt semantisch nicht mehr. Beim nächsten Mal manuell zu `Tabelle-Risiken.md` umbenennen.

**4. Latenter Bug: Theorem-Mehrfach-Embed.** `latex-env: theorem`-Notes setzen das `\label` bei jedem Embed neu — würde bei tatsächlichem Doppel-Embed „multiply defined"-Warnungen geben. Fix wäre analog zu Tabellen/Bildern: `first_embed`-Check vor dem Label-Emit. Aktuell nicht-blockierend, weil Theoreme typisch einmal embedded werden.

## Test-Dateien im Vault

- `ExampleFiles/HelperFiles/Theorem-Pythagoras.md` — atomic Note mit `latex-env: theorem` Frontmatter.
- `ExampleFiles/HelperFiles/Tabelle-Vergleich.md` — atomic Tabellen-Note mit `latex-env: table` + `caption:`.
- `ExampleFiles/HelperFiles/Tabelle-Projektphasen.md` — zweite Tabellen-Note.
- `ExampleFiles/HelperFiles/Tabelle-Mit-Eigener-Caption.md` — dritte Tabellen-Note (Filename veraltet, Inhalt = Risikomatrix; siehe „offen" Punkt 3).
- `ExampleFiles/HelperFiles/neuron.excalidraw.png`, `neuronales_netz.excalidraw.png` — Test-Bilder.
- `ExampleFiles/HelperFiles/slice-source-1.md` bis `slice-source-3.md` — Quell-Notes für Slice-Tests.
- `ExampleFiles/HelperFiles/env-test.md` — demonstriert Theorem-Embed, Default-Wikilink (autoref), Custom-Display-Wikilink (hyperref).
- `ExampleFiles/HelperFiles/image-test.md` — Test-Cases für Image-Feature: Embed mit Caption, Embed ohne Caption (Filename-Default), Plain-Text-Fallback für non-embedded Refs.
- `ExampleFiles/tabellen-test.md` — drei Tabellen-Embeds (Counter-Inkrement-Test), Default- und Custom-Display-Refs, Plain-Text-Fallback.
- `ExampleFiles/Testdokument.md`, `ExampleFiles/Testdokument-minimal.md` — User-eigene Tests.

## Plugin-Internals — kurzer Reference

Datei: `pipeline/app/filters/obsidian-transclude.lua`.

Wikilink-Map:

- `available_targets[notename] = label` registriert jeden erreichbaren Anker. Keys sind canonical (ohne `.md`). Values sind LaTeX-Label-Strings mit Prefix nach Target-Typ: `note:X` (Standard-Embed, Theorem-Wrap), `tab:X` (latex-env: table), `fig:bild.png` (Image-Embed), `note:X:sec-Heading`, `note:X:blk-id` (Slice-Anker).
- `autoref_targets[notename] = true` markiert Targets, deren Default-Display-Wikilinks per `\autoref` aufgelöst werden (Theorem-Envs, Tables, Image-Figures). Andere Targets nutzen `\hyperref` mit Display-Text.

Frontmatter-gesteuerte Wraps (in `load_note`):

- `latex-env: theorem` (oder andere amsthm-Env): RawBlock-Wrap mit `\begin{env}[latex-short]\label{note:X}…\end{env}`.
- `latex-env: table`: Caption aus `caption:` ins Frontmatter (mandatory, sonst `error()`). Caption + `\label{tab:X}` als RawInline an der Pandoc-Table.
- Andere `latex-env`-Werte → generischer Theorem-Wrap (potentiell sinnvoll für custom amsthm-Envs).

Image-Figures (in `register_image_figure`):

- Erkennt Pandoc-Figures, deren einziges Inline ein Image mit Bild-Extension ist.
- Hängt `\label{fig:<sanitized-src>}` als RawInline ans Caption-Ende.
- Registriert `available_targets[src]` und `autoref_targets[src]`.

Pandoc-Loop (`Pandoc(doc)`): zwei Phasen. Erst `process_blocks(doc.blocks)` (befüllt Map und expandiert Embeds, labelt Image-Figures). Dann `pandoc.walk_block(pandoc.Div(...), {Link = resolve_wikilink})` für die Wikilink-Resolution.

Helper-Hinweise:

- `meta_to_inlines(meta_value)` — robust gegen MetaInlines, MetaString, MetaBlocks. Gibt flache Inline-Liste zurück.
- `sanitize_label_id(s)` — reduziert auf alphanum + dash + underscore + colon.
- `pandoc.Caption(long [, short])` — **erstes Arg ist `long` (Blocks), nicht `short`**. `short` ist optional (Inlines, für LoF/LoT-Kurzform). Mit nur einem Arg: `pandoc.Caption({pandoc.Plain(...)})`.

## Debugging-Workflow

Lua-Filter sind Bind-Mount — Änderungen wirken bei jedem Export, kein Docker-Image-Rebuild nötig. Template (`eisvogel.tex`) und Branding (`_base.yml`) sind ebenfalls Bind-Mount. Image-Rebuild nötig nur bei Änderungen an Dockerfile, neuen tlmgr-Paketen oder Pandoc-Version-Wechseln. Über Settings → „Build image" (Force-Rebuild mit `--no-cache`) oder Command Palette → „Build docker image (with cache)" (incremental).

`pipeline/build/<docname>/` enthält Intermediates (`.tex`, `.log`, `.aux`, etc.) — bewusst persistent. Bei Pipeline-Bugs ist das `.tex`-File anzuschauen meist der schnellste Diagnoseweg. `pipeline/build/last_latex_run.log` und `last-build.log` enthalten den vollen stderr von Pandoc + latexmk bzw. Docker-Build. `io.stderr:write(...)` in Lua-Filtern ist der Standard-Debug-Mechanismus — landet in `last_latex_run.log`.

Lua-Syntax-Check außerhalb der Pipeline: in einer Python-Umgebung mit `lupa` lässt sich der Filter über `lua.execute('load(code)')` parsen, ohne Docker zu starten. Hilfreich für schnelle Iteration vor dem Export.

Häufiger Stolperstein: Pandoc-Lua-API-Konstruktor-Signaturen. `pandoc.Caption(long, short)` — nicht `(short, long)`. Bei `object has no __toinline metamethod`-Fehlern fast immer Arg-Reihenfolge oder falscher Typ (Blocks statt Inlines).

## Empfohlene erste Schritte im nächsten Chat

1. Equation-Numbering-Feature konzipieren und implementieren (offener Punkt 2).
2. Theorem-Mehrfach-Embed-Bug fixen (offener Punkt 4) — kleine Erweiterung im env-Branch von `load_note`: `first_embed`-Check vor dem `\label`-Emit.
3. `Tabelle-Mit-Eigener-Caption.md` zu `Tabelle-Risiken.md` umbenennen und `tabellen-test.md` entsprechend nachziehen.
4. Dead-Metadata in `_base.yml` entrümpeln (`figureTitle`, `tableTitle`, `figPrefix`, `tblPrefix`, `eqnPrefix` — Reste aus der crossref-Zeit).
