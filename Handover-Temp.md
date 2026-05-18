# Handover — Obsi Print Plugin

Stand: Image-Figure-, Tabellen- und Equation-Numbering laufen. Image/Tabellen via RawInline-`\label{}`-Injektion in der Caption, Equations via `\begin{equation}\label{}…\end{equation}`-Wrap des DisplayMath-Blocks (alles Pandoc-Version-unabhängig). `pandoc-crossref` ist aus der Pipeline raus. Frontmatter-basierte Note-Konfiguration ist konsolidiert auf Single-Source.

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

`latex-env: equation`: Voll-Embed mit genau einem `$$…$$`-Block im Body. Der DisplayMath-Para wird durch einen `RawBlock` mit `\begin{equation}\label{eq:X}…\end{equation}` ersetzt. Prosa drumherum bleibt erhalten (permissiv). Multi-Line-Gleichungen über `\begin{aligned}…\end{aligned}` im Math-Block — eine gemeinsame Nummer für den Block. Mehrfach-Embed: jedes Embed wird als eigene Equation gewrapt (Counter inkrementiert), aber `\label` nur beim ersten (analog Tabellen). Fehlender Math-Block → harter Filter-Error. `caption:`-Frontmatter ist optional und reine Doku, rendert nicht im PDF. Wikilinks darauf → `\autoref{eq:X}` → „Gleichung N".

„Abbildung"/„Tabelle"/„Gleichung" statt „Figure"/„Table"/„Equation": durch zwei Mechanismen — Babel-`ngerman` setzt `\figurename`/`\tablename` (Caption-Prefix), plus Template-`\AtBeginDocument`-Block (Zeile ~980 in eisvogel.tex) mit `\IfPackageLoadedTF{babel}+\iflanguage{ngerman}` setzt `\figureautorefname`/`\tableautorefname`/`\equationautorefname` etc. (was `\autoref` rendert).

Inline-Filter: `%%text%%` Comments (auch multi-block über Leerzeilen hinweg), `==text==` Highlights (paragraph-scoped, unbalanced wird literal reverted), in `obsidian-inline.lua`.

Mehrfach-Embed der gleichen Note: für alle Note-Embed-Wrap-Pfade (normal, table-env, equation-env, theorem-env + andere amsthm-Envs, image-figure) wird das `\label{}` nur beim ersten Embed gesetzt — vermeidet „multiply defined"-Warnungen. Counter (z.B. Theorem-Nummer, Tabellen-Nummer) inkrementieren bei jedem Embed, weil jeder Wrap eine eigene Environment-Instanz ist; Wikilinks zeigen über das eine Label weiterhin auf das erste Embed.

## Was offen / nicht erledigt

**1. Architektur-Refactor: env-Dispatch generalisieren.** Aktuell ein eigener `if env_name == ... then ... end`-Branch pro env-Wert in `load_note`, ~30-40 Zeilen Boilerplate pro Branch (`first_embed`-Guard, Target-Registrierung, Block-Suche, Error-Pfad). Schon bei 3 Envs (table/equation/theorem) sichtbar repetitiv; bei 5-8 Envs unwartbar. Geplanter Refactor: drei Handler nach Env-Family — `wrap_math` (equation, align, gather, multline, alignat), `wrap_table` (nur table wegen Caption-Pflicht), `wrap_block` (alles andere — theorem, lemma, definition, proof + user-defined). Plus shared Helpers `register_target(notename, prefix)` und `find_block(blocks, predicate)`. Senkt Cost pro neuem Env auf ~1 Zeile Config. Vor dem nächsten Math-Env-Add (align o.ä.) angehen — dann ist die Code-Konvergenz auf saubere Helpers maximal.

**2. Heading-Shifting bei Note-Embeds.** Aktuell werden Headings der embedded Note unverändert übernommen — eine Note mit „# Definition" als Top-Level-Heading wirkt im Host-Dokument wie ein neuer H1-Abschnitt, was die Hierarchie zerschießt. Mögliche Strategien: (a) Headings um N Level nach unten shiften (analog Pandoc's `--shift-heading-level-by`, auto-detect aus Host-Context), (b) Headings strippen wenn Note via `latex-env` gewrappt wird (typisch für atomic Theorem/Equation-Notes — die haben sowieso keine sinnvolle eigene Hierarchie), (c) Embed-Tag mit Level-Hint (`![[Note:h+1]]` o.ä., aber bricht Obsidian-Syntax-Kompat). Vermutlich (b) als Default + (a) für nicht-gewrappte Embeds. Konvention noch offen.

**3. Mermaid-Render-Engine.** Aktuell werden Mermaid-Codeblöcke einfach als Code-Fence im PDF gerendert (= Quelltext, nicht Diagramm). Für technische Doku mit Architektur-/Flow-Diagrammen sinnvoll. Standard-Lösung: Pandoc-Filter (`pandoc-mermaid`, `mermaid-filter`, `diagram-filter`) der die Code-Block-Inhalte über CLI an mermaid-cli übergibt und das resultierende SVG/PDF einbindet. Pipeline-Kosten: Node + `@mermaid-js/mermaid-cli` ins Docker-Image (zieht Headless-Chromium nach — Image wird deutlich größer). Alternative: vorgerenderte Mermaid-Bilder im Vault speichern und als normale `![[diagram.svg]]`-Embeds — kein Filter nötig, dafür manueller Render-Step. Entscheidung Pipeline-Integration vs. Pre-Render-Convention offen.

**4. Plugin-Settings-Erweiterungen (UX).** Quality-of-Life-Features die noch fehlen:
- „Remove docker image"-Button — Pendant zu „Build image", räumt das Plugin-Image weg (`docker image rm <image>` oder `docker compose down --rmi all`). Aktuell muss man manuell die Shell bemühen.
- „Cleanup build folder"-Button — Löscht `pipeline/build/*` (Intermediates + alte PDFs). Wird mit der Zeit groß.
- Toggle „Keep LaTeX intermediates after build" — Default `false` (Build-Folder wird nach erfolgreichem Export geleert), Debug-Mode `true` (Verhalten wie heute, alles bleibt persistent für Diagnose). Heute sind die Intermediates immer persistent; das ist gut beim Debuggen, beim normalen Nutzer aber unnötiger Müll.

**5. Branding-Override per Vault-`.md`-File.** Aktuell sind alle Branding-Werte hardcoded in `_base.yml` (titlepage-background, titlepage-logo, header-left, titlepage-text-color etc.). Nutzer soll das pro Vault und pro Kunde überschreiben können, ohne bei Plugin-Updates Settings zu verlieren.

Konvention: Branding wird als normale Obsidian-`.md`-Datei mit Frontmatter angelegt (z.B. `Branding-Kunde1.md` irgendwo im Vault). Frontmatter enthält die YAML-Keys die `_base.yml` überschreiben sollen — z.B.:
```yaml
---
toc-own-page: true
header-left: "Draft"
titlepage-text-color: "1A1A1A"
titlepage-logo: "[[logo_kunde.png]]"
titlepage-background: "[[kunde_1/branding/bg.png]]"
---
```
Unter dem Frontmatter folgt Markdown-Body, der für Endnutzer dokumentiert was die Keys bedeuten (TOC = „Table of Contents", was `titlepage-text-color` macht, etc.). Body wird beim Export ignoriert — er ist nur Doku für den Editor in Obsidian.

Doc-Selection: Im Frontmatter des zu exportierenden Dokuments ein Key `obsi-print-branding: "[[Branding-Kunde1]]"`. Default: kein Key gesetzt → kein Override → reine `_base.yml`-Defaults (heutiges Verhalten).

Wikilink-Pflicht: Wikilinks in YAML MÜSSEN quoted sein — `"[[foo.png]]"`, nicht `[[foo.png]]`. Sonst interpretiert YAML das als Flow-Sequence (Liste-in-Liste) und parsed falsch. Im Template-Body als auffälligen Hinweis dokumentieren.

Wikilink-Resolution: über Obsidians `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` mit `sourcePath` = Branding-File. Standard-Disambiguierung von Obsidian (gleicher Folder zuerst, dann nearest, dann alphabetisch) wird damit übernommen. Forced-Root-Path bei Bedarf via führendem Slash: `"[[/kunde_1/branding/logo.png]]"`.

Resolution-Strategie KEY-AGNOSTIC: Plugin scannt alle String-Values der Branding-Frontmatter auf `[[…]]`-Pattern (general purpose) und ersetzt jeden Treffer durch den resolved absoluten Build-Pfad. Funktioniert auch wenn `[[…]]` innerhalb von LaTeX-Snippets steht (Beispiel: `header-left` enthält `\includegraphics{[[logo.png]]}`). Keine hardcoded Key-Liste — neue Override-Keys funktionieren ohne Code-Change.

Keine Rekursion: Wenn das Branding-File selbst einen `obsi-print-branding`-Key hat, wird der ignoriert. Plugin liest genau einmal und materialisiert daraus eine `branding-override.yml`.

Merge-Reihenfolge: `_base.yml` → `branding-override.yml` → `<doc-frontmatter>`. Pandoc-CLI: `--metadata-file _base.yml --metadata-file branding-override.yml --metadata-file <generierte-doc-frontmatter.yml>` (oder die Doc-Frontmatter wandert via Pandoc-Default-Pfad rein). Bedeutet: doc-eigene Frontmatter-Keys schlagen Branding (Spezialfall im Doc kann Branding lokal kippen), Branding schlägt Base-Defaults.

Asset-Pipeline beim Export (TypeScript-Seite):
1. Lese Frontmatter des Export-Docs. Wenn `obsi-print-branding` gesetzt → resolve Wikilink zur Branding-`.md`.
2. Lese Frontmatter der Branding-`.md`. Body ignorieren.
3. Walk alle String-Values, suche `[[…]]`-Pattern, resolve via `metadataCache.getFirstLinkpathDest`, kopiere referenzierte Files nach `pipeline/build/<docname>/branding/<original-name>`.
4. Schreibe `pipeline/build/<docname>/branding-override.yml` mit den ggf. ersetzten absoluten Container-Pfaden (`/build/<docname>/branding/<name>` aus Container-Sicht).
5. Hänge `--metadata-file <build>/branding-override.yml` an Pandoc-Invocation.

Pro Export frisch generiert — keine persistente Override-YAML, weil Docname pro Export wechselt.

Plus: Command „Create branding template" — legt im Vault-Root eine `Branding-Template.md` an, Frontmatter vollständig ausgefüllt mit allen `_base.yml`-Keys (TOC-Settings, Titlepage-Settings, Header-Settings), darunter im Body deutscher Erklärungstext pro Key. User dupliziert/editiert die Datei pro Kunde.

Späteres Feature (nicht im ersten Wurf): High-Level-Key wie `header-logo: "[[logo.png]]"` der Plugin-seitig zum vollen LaTeX-Snippet (`\raisebox{...}{\includegraphics{...}}`) expanded wird. Aktuell muss der User `header-left` direkt als LaTeX schreiben wenn er ein Logo will, was LaTeX-Kenntnis verlangt — UX-Falle. Aber: `header-left: "Draft"` als plain text funktioniert trivial, also kein Blocker für V1.

## Test-Dateien im Vault

- `ExampleFiles/HelperFiles/Theorem-Pythagoras.md` — atomic Note mit `latex-env: theorem` Frontmatter.
- `ExampleFiles/HelperFiles/Tabelle-Vergleich.md` — atomic Tabellen-Note mit `latex-env: table` + `caption:`.
- `ExampleFiles/HelperFiles/Tabelle-Projektphasen.md` — zweite Tabellen-Note (Counter-Test).
- `ExampleFiles/HelperFiles/Navier-Stokes.md` — atomic Equation-Note mit `latex-env: equation`, Multi-Line via `\begin{aligned}…\end{aligned}` im `$$…$$`-Block.
- `ExampleFiles/HelperFiles/Eulersche-Identitaet.md` — atomic Equation-Note, einzeilige Gleichung (Counter-Test).
- `ExampleFiles/HelperFiles/neuron.excalidraw.png`, `neuronales_netz.excalidraw.png` — Test-Bilder.
- `ExampleFiles/HelperFiles/slice-source-1.md` bis `slice-source-3.md` — Quell-Notes für Slice-Tests.
- `ExampleFiles/HelperFiles/env-test.md` — demonstriert Theorem-Embed, Default-Wikilink (autoref), Custom-Display-Wikilink (hyperref).
- `ExampleFiles/HelperFiles/image-test.md` — Test-Cases für Image-Feature: Embed mit Caption, Embed ohne Caption (Filename-Default), Plain-Text-Fallback für non-embedded Refs.
- `ExampleFiles/HelperFiles/gleichungen-test.md` — Test-Cases für Equation-Feature: Multi-Line via `aligned`, einzeilige Gleichung, Mehrfach-Embed (Counter-Test mit `\label` nur beim ersten), Plain-Text-Fallback.
- `ExampleFiles/tabellen-test.md` — drei Tabellen-Embeds (Counter-Inkrement-Test), Default- und Custom-Display-Refs, Plain-Text-Fallback.
- `ExampleFiles/Testdokument.md`, `ExampleFiles/Testdokument-minimal.md` — User-eigene Tests.

## Plugin-Internals — kurzer Reference

Datei: `pipeline/app/filters/obsidian-transclude.lua`.

Wikilink-Map:

- `available_targets[notename] = label` registriert jeden erreichbaren Anker. Keys sind canonical (ohne `.md`). Values sind LaTeX-Label-Strings mit Prefix nach Target-Typ: `note:X` (Standard-Embed, Theorem-Wrap), `tab:X` (latex-env: table), `eq:X` (latex-env: equation), `fig:bild.png` (Image-Embed), `note:X:sec-Heading`, `note:X:blk-id` (Slice-Anker).
- `autoref_targets[notename] = true` markiert Targets, deren Default-Display-Wikilinks per `\autoref` aufgelöst werden (Theorem-Envs, Tables, Equations, Image-Figures). Andere Targets nutzen `\hyperref` mit Display-Text.

Frontmatter-gesteuerte Wraps (in `load_note`):

- `latex-env: theorem` (oder andere amsthm-Env): RawBlock-Wrap mit `\begin{env}[latex-short]\label{note:X}…\end{env}`.
- `latex-env: table`: Caption aus `caption:` ins Frontmatter (mandatory, sonst `error()`). Caption + `\label{tab:X}` als RawInline an der Pandoc-Table.
- `latex-env: equation`: Erster `$$…$$`-Block (Para mit DisplayMath-Inline) wird durch `RawBlock` mit `\begin{equation}\label{eq:X}…\end{equation}` ersetzt. `first_embed`-Guard fürs Label (Counter inkrementiert aber Label nur beim ersten Embed). Fehlt der Math-Block → `error()`. `caption:`-Frontmatter optional, nicht renderbar.
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

1. Architektur-Refactor (offener Punkt 1) — env-Family-Dispatch mit shared Helpers, bevor weitere Math-Envs (align, gather, multline) dazukommen.
