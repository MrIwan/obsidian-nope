# Handover — Obsi Print Plugin

Plugin exportiert Obsidian-Notes via Docker-Pipeline (Pandoc + LaTeX) als PDF. Atomic-Note-Konzept mit Frontmatter-gesteuertem `latex-env` für strukturierte Inhalte (theorem, table, equation) und Wikilink-basierten Cross-References inkl. Glossar.

## Plugin-Architektur (Kurzfassung)

Zwei Hälften:

**Obsidian-Plugin** (TypeScript, in `src/`) — registriert zwei Commands („Export active note to PDF", „Build docker image with cache"), eine Settings-UI (Output-Path, Auto-Open-PDF, Preflight-Checks, Setup-Section mit Build-Button + `noCache: true`). Spawnt Docker-Compose mit `VAULT_PATH` als ENV.

**Docker-Pipeline** (in `pipeline/`) — `pandoc/extra:latest` als Base (Pandoc 3.9.x festgepinnt), plus `bash` und einige tlmgr-Pakete. Drei Lua-Filter laufen in Reihenfolge: `obsidian-transclude.lua` (Embeds + Wikilink-Resolver mit Präzedenz glossary → embed-target → plain, plus Image-Figures, Table-Captions, Equation-/Theorem-Wraps und Glossary-Entry-Sammlung), `obsidian-inline.lua` (Comments + Highlights), `callouts.lua` (Obsidian-Callouts → awesomebox). Plus Eisvogel-Template, plus latexmk-Loop.

Bind-Mounts: `/vault` (read-only Vault), `/app` (read-only Plugin-Pipeline-Folder), `/build` (writable Intermediates + finale PDF, intentional persistent für Debugging — Plugin kopiert die finale PDF zum konfigurierten Output-Path).

## Was funktioniert (stabil getestet)

Note-Embeds und -Slices: `![[Note]]`, `![[Note#Heading]]`, `![[Note#^block-id]]` — voller und sliced Note-Embed mit korrekter Slice-Logik (bis zum nächsten Heading gleicher/höherer Ebene). Block-IDs werden beim Embed gestrippt und gelabelt.

Wikilink-Auflösung: `[[Note]]`, `[[Note|Display]]`, `[[Note#Heading]]`, `[[Note#^id]]` — über eine Map die beim Embed gefüllt wird. Default-Display nutzt `\hyperref[label]{display}` oder `\autoref{label}` (je nach Target-Typ), custom display bleibt immer `\hyperref`. Refs auf nicht-eingebettete Notes fallen graceful als Plain-Text durch (für „Denkprozess-Verweise", die nicht im PDF landen sollen).

`.md`-Canonicalization: `![[X.md]]`/`[[X.md]]` und `![[X]]`/`[[X]]` und gemischte Schreibweisen funktionieren alle identisch. `parse_anchor`+`load_note` strippen die `.md`-Extension beim Map-Key-Bilden, der Resolver strippt sie ebenfalls beim Lookup.

`latex-env: theorem` (und andere amsthm-Envs wie lemma, definition): Voll-Embed wird in `\begin{theorem}[latex-short]\label{note:X}…\end{theorem}` gewrapped. Default-Display-Wikilinks darauf nutzen `\autoref` → „Theorem N". Custom-Display bleibt `\hyperref`. Optional-Arg via `latex-short:` Frontmatter.

`latex-env: table`: Tabellen-Note bekommt `caption: "…"` im Frontmatter (mandatory — Filter wirft harten Error wenn fehlt). Pandoc-Table wird mit dieser Caption + `\label{tab:X}` als RawInline am Caption-Ende versehen — kein `\begin{table}`-Wrap (würde mit longtable konfligieren). Single-Source: keine Pipe-Caption am Embed-Tag, keine Pandoc-Native-`: …`-Fallback. Wikilinks darauf → `\autoref{tab:X}` → „Tabelle N".

Image-Figures: `![[bild.png|Caption]]` und `![[bild.png]]` (ohne Caption → Filename als Caption) werden zu nummerierten Figures mit Label. `\label{fig:X}` wird als RawInline ans Caption-Ende gehängt (Pandoc 3.9.x emit kein `\label` aus `Figure.attr.identifier`, RawInline ist der portable Weg). Wikilinks `[[bild.png]]` → `\autoref{fig:X}` → „Abbildung N".

Image-Width-Hint: optionaler Suffix `|w=<value>` in der Caption setzt die Image-Width — `![[bild.png|Caption|w=60%]]` oder `![[bild.png|w=400px]]` (ohne Caption → Filename-Fallback greift). Akzeptierte Werte: alles was Pandoc als Längenangabe versteht — `60%`, `400px`, `8cm`, `0.5\textwidth`. Der Filter (`extract_width_hint` in `obsidian-transclude.lua`) scannt den letzten Caption-Block rückwärts auf das `|w=`-Muster, akzeptiert es nur am Ende (nur Whitespace danach), strippt den Marker aus der Caption und schreibt den Wert in `img.attributes.width` — Pandoc übersetzt das beim LaTeX-Output zu `\includegraphics[width=…]{…}`. Width ist pro Embed, Label nur beim ersten — Mehrfach-Embeds desselben Bildes können also unterschiedliche Größen haben.

`latex-env: equation` (sowie `align`, `gather`, `multline`, `alignat` und deren Stern-Varianten): Voll-Embed mit einem `$$…$$`-Block im Body. Der DisplayMath-Para wird durch einen `RawBlock` mit `\begin{<env>}\label{eq:X}…\end{<env>}` ersetzt. Für `align`/`gather` darf der `$$…$$`-Block direkt `&`/`\\` enthalten (jede Zeile bekommt eigenen Counter); für `equation` mit Multi-Line kann `\begin{aligned}…\end{aligned}` innen verwendet werden (eine gemeinsame Nummer). Prosa drumherum bleibt erhalten (permissiv). Mehrfach-Embed: jedes Embed wird als eigene Math-Env gewrapt (Counter inkrementiert), aber `\label` nur beim ersten (analog Tabellen). Fehlender Math-Block → harter Filter-Error. `caption:`-Frontmatter ist optional und reine Doku, rendert nicht im PDF. Wikilinks darauf → `\autoref{eq:X}` → „Gleichung N".

„Abbildung"/„Tabelle"/„Gleichung" statt „Figure"/„Table"/„Equation": durch zwei Mechanismen — Babel-`ngerman` setzt `\figurename`/`\tablename` (Caption-Prefix), plus Template-`\AtBeginDocument`-Block (Zeile ~980 in eisvogel.tex) mit `\IfPackageLoadedTF{babel}+\iflanguage{ngerman}` setzt `\figureautorefname`/`\tableautorefname`/`\equationautorefname` etc. (was `\autoref` rendert).

Abbildungs- und Tabellenverzeichnis: aktiviert per `lof: true` und `lot: true` in `_base.yml` (Default an, pro Doc per Frontmatter abschaltbar). Template emittiert `\listoffigures`/`\listoftables` direkt nach TOC, jedes mit eigenem `\newpage`. Titel kommen automatisch aus Babel-ngerman (`\listfigurename` → „Abbildungsverzeichnis", `\listtablename` → „Tabellenverzeichnis"). Einträge entstehen aus den `\caption{}`-Calls der Image-Figures bzw. Table-Captions.

Inline-Filter: `%%text%%` Comments (auch multi-block über Leerzeilen hinweg), `==text==` Highlights (paragraph-scoped, unbalanced wird literal reverted), in `obsidian-inline.lua`.

Glossary: Atomic Glossary-Notes mit Frontmatter-Keys `gls-id`, `gls-short`, `gls-long`, `gls-description`, `gls-type` (`acronym` oder `term`). Wikilinks `[[KI]]` werden im Resolver (Case 1, vor Embed-Targets) zu `\gls{<id>}` ersetzt; die referenzierten Entries werden gesammelt und als `\newacronym`/`\newglossaryentry`-Lines in `header-includes` injiziert. Funktioniert auch in embedded Notes, weil der Wikilink-Resolver auf dem schon-expandierten AST läuft. Template lädt das `glossaries`-Paket mit `acronym, toc, nonumberlist` (eisvogel.tex Z. 502), ruft `\makeglossaries` auf, und gibt am Doc-Ende `\printglossary[type=\acronymtype, title={Abkürzungen}]` + `\printglossary[title={Glossar}]` aus. `latexmkrc` triggert `makeglossaries` auf `.glo→.gls`- und `.acn→.acr`-Deps automatisch.

Mehrfach-Embed der gleichen Note: für alle Note-Embed-Wrap-Pfade (normal, table-env, equation-env, theorem-env + andere amsthm-Envs, image-figure) wird das `\label{}` nur beim ersten Embed gesetzt — vermeidet „multiply defined"-Warnungen. Counter (z.B. Theorem-Nummer, Tabellen-Nummer) inkrementieren bei jedem Embed, weil jeder Wrap eine eigene Environment-Instanz ist; Wikilinks zeigen über das eine Label weiterhin auf das erste Embed.

Branding-Override per Vault-`.md`-File: Pro Export überschreibt eine Obsidian-`.md`-Datei mit YAML-Frontmatter ausgewählte Werte aus `_base.yml`. Selektion über `obsi-print-branding: "[[Branding-Kunde1]]"` im Doc-Frontmatter; ohne Key keine Übersteuerung (reine `_base.yml`-Defaults, Verhalten vor Feature-Einführung). Die Branding-Datei enthält im Frontmatter die zu überschreibenden Keys (z. B. `header-left`, `titlepage-text-color`, `titlepage-logo`, `titlepage-background`), der Body bleibt unangetastet und dient nur der Doku im Obsidian-Editor.

Wikilink-Pflicht in YAML: `"[[foo.png]]"` mit doppelten Anführungszeichen — sonst interpretiert YAML das als Flow-Sequence (Liste-in-Liste) und der Wert wird falsch geparst. Im Template-Body steht der Hinweis prominent. Resolution läuft über `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` mit `sourcePath` = Branding-File, daher gilt Obsidians Standard-Disambiguierung (gleicher Folder zuerst, dann nearest, dann alphabetisch); ein erzwungener Root-Pfad ist via führendem Slash möglich: `"[[/kunde_1/branding/logo.png]]"`.

Resolution-Strategie ist key-agnostisch für die Standardfälle: Plugin scannt alle String-Values der Branding-Frontmatter auf `[[…]]`-Pattern und ersetzt jeden Treffer durch den resolvten Container-Pfad (`/build/<docname>/branding/<original-name>`). Funktioniert auch wenn ein `[[…]]` mitten in einem LaTeX-Snippet steht (z. B. `header-left: "Vorab – \\includegraphics{[[logo.png]]}"`). Neue, vom User erfundene Override-Keys funktionieren damit ohne Code-Change.

Logo-Auto-Expansion in Header/Footer-Keys (`header-left`, `header-center`, `header-right`, `footer-left`, `footer-center`, `footer-right`): Ist der Value ein **Solo-Wikilink** auf eine Bild-Datei (matched `^\s*\[\[…\]\]\s*$`, Extension in `LOGO_IMAGE_EXTS` = `png/jpg/jpeg/gif/svg/webp/bmp/pdf`), wird er Plugin-seitig zu `\raisebox{-0.3\height}{\includegraphics[height=<h>]{<container-path>}}` expandiert statt nur den Pfad zu substituieren. Default-Höhe `0.7cm`, Override per `|h=<wert>`-Suffix im Wikilink: `"[[logo.png|h=1.2cm]]"` ergibt `height=1.2cm`. Andere Keys wie `titlepage-logo` und `titlepage-background` bleiben bei reiner Pfad-Substitution — Eisvogel erwartet dort einen Pfad, kein LaTeX-Snippet. Mixed-Mode (Text + Logo in einer Header-Zelle) bleibt explizit: der User schreibt das LaTeX-Snippet selbst und nutzt `[[…]]` als Pfad-Platzhalter. Achtung: pdflatex kann SVGs nicht direkt einbinden — Logos als PDF oder PNG ablegen, sonst bricht der Build.

Keine Rekursion: ein `obsi-print-branding`-Key innerhalb der Branding-Datei wird ignoriert. Plugin liest genau eine Branding-Ebene und materialisiert daraus die `branding-override.yml`. Merge-Reihenfolge: `_base.yml` → `branding-override.yml` → Doc-Frontmatter. Doc-Frontmatter-Keys schlagen also lokal das Branding, Branding schlägt die Base-Defaults. Realisiert über `--metadata-file _base.yml --metadata-file <build>/branding-override.yml` plus Pandoc-Default-Pfad für die Doc-Frontmatter.

Asset-Pipeline beim Export (TypeScript in `src/utils/branding.ts`): (1) Doc-Frontmatter lesen, `obsi-print-branding`-Wikilink auf die Branding-`.md` resolven. (2) Branding-Frontmatter lesen, Body ignorieren. (3) Frontmatter walken — bei Header/Footer-Solo-Image-Links: `expandLogoWikilink` (kopiert Asset, baut `\raisebox{}{\includegraphics{}}`-Snippet); sonst bei beliebigen `[[…]]` im String: `copyAssetByLinkpath` + Pfad-Substitution. Beide Pfade landen über denselben Asset-Copy-Helper in `pipeline/build/<docname>/branding/`. (4) `branding-override.yml` ins gleiche Build-Dir schreiben. (5) `build.sh` erkennt die Datei (`if [[ -f "$WORK/branding-override.yml" ]]`) und hängt das `--metadata-file` an die Pandoc-Invocation; nach erfolgreichem Run räumt `build.sh` Override-YAML und `branding/`-Asset-Folder am Ende wieder weg, sodass kein stale State zwischen Exports liegen bleibt (entfernt der User den Branding-Key, ist beim nächsten Export auch nichts mehr vom alten Branding aktiv).

Helper-Übersicht in `branding.ts`: `parseLogoLinkInner` (extrahiert canonical linkpath + optional `|h=…`-Height aus dem Inner eines Wikilinks), `isLogoImage` (Extension-Check gegen `LOGO_IMAGE_EXTS`), `expandLogoWikilink` (Asset-Copy + LaTeX-Snippet-Build mit Default-Height-Fallback), `copyAssetByLinkpath` (gemeinsamer Resolve+Copy-Pfad für Logo- und reguläre Wikilink-Route). YAML-Serialisierung erfolgt in einem minimalistischen handgeschriebenen Serializer (`serializeYaml` + Helper) — double-quoted strings mit `\\`/`\"`/`\n`-Escapes, weil Pandoc YAML parsed nicht LaTeX, und damit eingebettete LaTeX-Backslashes sauber round-trippen.

Plus: Command „Create branding template" — schreibt eine vollständig vorbefüllte `Branding-Template.md` ins Vault-Root, Frontmatter mit allen `_base.yml`-Keys (TOC, Titlepage, Header), Body mit deutscher Erklärung pro Key inklusive Logo-Wikilink-Syntax und `|h=`-Override. Overwrite-Confirm wenn die Datei schon existiert — verhindert, dass eigene Edits unbemerkt verloren gehen.

## Was offen / nicht erledigt

**1. Heading-Shifting bei Note-Embeds.** Aktuell werden Headings der embedded Note unverändert übernommen — eine Note mit „# Definition" als Top-Level-Heading wirkt im Host-Dokument wie ein neuer H1-Abschnitt, was die Hierarchie zerschießt. Mögliche Strategien: (a) Headings um N Level nach unten shiften (analog Pandoc's `--shift-heading-level-by`, auto-detect aus Host-Context), (b) Headings strippen wenn Note via `latex-env` gewrappt wird (typisch für atomic Theorem/Equation-Notes — die haben sowieso keine sinnvolle eigene Hierarchie), (c) Embed-Tag mit Level-Hint (`![[Note:h+1]]` o.ä., aber bricht Obsidian-Syntax-Kompat). Vermutlich (b) als Default + (a) für nicht-gewrappte Embeds. Konvention noch offen.

**2. Mermaid-Render-Engine.** Aktuell werden Mermaid-Codeblöcke einfach als Code-Fence im PDF gerendert (= Quelltext, nicht Diagramm). Für technische Doku mit Architektur-/Flow-Diagrammen sinnvoll. Standard-Lösung: Pandoc-Filter (`pandoc-mermaid`, `mermaid-filter`, `diagram-filter`) der die Code-Block-Inhalte über CLI an mermaid-cli übergibt und das resultierende SVG/PDF einbindet. Pipeline-Kosten: Node + `@mermaid-js/mermaid-cli` ins Docker-Image (zieht Headless-Chromium nach — Image wird deutlich größer). Alternative: vorgerenderte Mermaid-Bilder im Vault speichern und als normale `![[diagram.svg]]`-Embeds — kein Filter nötig, dafür manueller Render-Step. Entscheidung Pipeline-Integration vs. Pre-Render-Convention offen.

**3. Plugin-Settings-Erweiterungen (UX).** Quality-of-Life-Features die noch fehlen:
- „Remove docker image"-Button — Pendant zu „Build image", räumt das Plugin-Image weg (`docker image rm <image>` oder `docker compose down --rmi all`). Aktuell muss man manuell die Shell bemühen.
- „Cleanup build folder"-Button — Löscht `pipeline/build/*` (Intermediates + alte PDFs). Wird mit der Zeit groß.
- Toggle „Keep LaTeX intermediates after build" — Default `false` (Build-Folder wird nach erfolgreichem Export geleert), Debug-Mode `true` (Verhalten wie heute, alles bleibt persistent für Diagnose). Heute sind die Intermediates immer persistent; das ist gut beim Debuggen, beim normalen Nutzer aber unnötiger Müll.

**4. SVG-Support für Logos.** `LOGO_IMAGE_EXTS` akzeptiert `.svg`, aber pdflatex kann SVGs nicht direkt rendern. Workarounds heute: User speichert das Logo als PDF oder PNG. Pipeline-Erweiterung wäre Inkscape ins Docker-Image plus `\usepackage{svg}` plus `--shell-escape` in der latexmk-Invocation — bläht das Image um ~200 MB auf. Entscheidung offen, ob das den Aufwand wert ist; bis dahin ist PDF-Export aus Inkscape o.ä. der saubere Weg.

**5. AI-Conventions-Skill installieren.** Ein Button in den Plugin-Settings, der eine Skill-/Convention-Doku in den Vault schreibt — damit Claude/Cursor/etc. die obsi-print-Konventionen kennen, wenn ein Wissenschaftler im Vault mit AI-Unterstützung schreibt. Sinn: ohne das produziert ein AI confidently falschen Output (pandoc-crossref-Syntax, inline-Theoreme statt atomic Notes, Pipe-Captions am Embed-Tag etc.), der erst beim Export bricht.

Wichtiger Punkt: die RO-Vault-Regel betrifft nur den Docker-Pipeline-Mount. Die TypeScript-Seite des Plugins läuft in Obsidians Renderer und hat über `app.vault.adapter.write(...)` vollen RW-Zugriff. Schreiben in den Vault per Button ist also idiomatisch, kein Regel-Bruch.

Design:
- **Single-Source-of-Truth: `pipeline/app/skill/SKILL.md`** im Plugin-Repo. Wird beim Feature-Add mit-aktualisiert (sonst Drift-Risiko, was schlimmer ist als kein Skill).
- **Zwei Outputs aus derselben Quelle**: `<vault>/.claude/skills/obsi-print/SKILL.md` (Claude-Code-Konvention) plus `<vault>/AGENTS.md` (plattform-agnostische emerging Konvention, wird von Cursor + diversen CLI-Agents gelesen). Der User profitiert egal welches Tool er nutzt.
- **Button: „Install AI conventions guide"** mit User-Confirm wenn Datei schon existiert (verhindert dass eigene Edits unbemerkt überschrieben werden).
- **Version-Header im Skill** (`obsi-print-version: X.Y.Z`, `last-updated: <plugin-version>`). Damit ist Drift sichtbar — der AI kann checken, der User auch.
- **Push-Strategie**: explizit per Button-Klick, NICHT automatisch bei jedem Plugin-Update. Klick = transparent re-install. Auto-Update würde eigene Anpassungen am Skill unbemerkt verlieren.

Inhalt knapp halten (max 200-300 Zeilen, sonst zu kompliziert):
- Was obsi-print ist + welche Pipeline dahinter steht (1-2 Sätze)
- Atomic-Note-Prinzip + Wikilink-Semantik (`[[X]]` vs `![[X]]`, Slice-Embeds, Custom-Display)
- Alle `latex-env`-Werte mit Mini-Beispiel je (theorem mit `latex-short`, table mit Pflicht-`caption`, equation/align/gather)
- Glossary-Frontmatter (`gls-*`-Keys)
- DO/DON'T-Liste: kein pandoc-crossref, keine Pipe-Caption, Theoreme als atomic Notes
- Wann atomic Note, wann inline

Trigger: erst angehen wenn die Features stabil und überzeugend sind. Bei jeder Filter-Convention-Änderung (neuer `latex-env`-Wert, neuer Frontmatter-Key) muss die SKILL.md mit aktualisiert werden — sonst entsteht die Drift, gegen die das Feature gerade schützen soll.

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
- `ExampleFiles/HelperFiles/glossar-test.md` — Test-Cases für Glossary-Feature: Wikilinks zu `[[KI]]`, `[[CNN]]`, `[[DNN]]` etc. die zu `\gls{}`-Refs werden.
- `ExampleFiles/HelperFiles/KI.md`, `CNN.md`, `DNN.md`, `NLP.md`, `Transformer.md`, `Spracherkennung.md`, `Computer Vision.md` — atomic Glossary-Notes mit `gls-id`/`gls-short`/`gls-long`/`gls-description`/`gls-type`-Frontmatter.
- `ExampleFiles/tabellen-test.md` — drei Tabellen-Embeds (Counter-Inkrement-Test), Default- und Custom-Display-Refs, Plain-Text-Fallback.
- `ExampleFiles/Testdokument.md`, `ExampleFiles/Testdokument-minimal.md` — User-eigene Tests.

## Plugin-Internals — kurzer Reference

Datei: `pipeline/app/filters/obsidian-transclude.lua`.

Wikilink-Resolver-Präzedenz (`resolve_wikilink`) — drei Cases:

1. **Glossary** — `try_resolve_glossary(target)` prüft Frontmatter der Target-Note auf `gls-id`. Treffer → `\gls{<id>}`-RawInline + Entry-Registrierung. Gewinnt bei Konflikt mit Embed-Target (Note mit `gls-id` UND `latex-env: theorem` → Glossary).
2. **Embed-Target** — Lookup in `available_targets[target]`. Treffer → bei autoref-Target + Default-Display `\autoref{label}`, sonst `\hyperref[label]{content}`.
3. **Fallback** — kein Treffer → Plain-Text aus `link.content`. Erlaubt Denk-Verweise auf nicht-embedded Notes ohne Crash.

`available_targets[notename] = label` registriert jeden erreichbaren Embed-Anker. Keys sind canonical (ohne `.md`). Values mit Prefix nach Target-Typ: `note:X` (Standard-Embed, Theorem-Wrap), `tab:X` (latex-env: table), `eq:X` (latex-env: equation/align/gather/multline/alignat), `fig:bild.png` (Image-Embed), `note:X:sec-Heading`, `note:X:blk-id` (Slice-Anker). `autoref_targets[notename] = true` markiert Targets mit `\autoref`-Verhalten (Theorem-Envs, Tables, Equations, Image-Figures).

Glossary-Block (eigene Sektion in `obsidian-transclude.lua`):

- Modul-State: `glossary_entries` (id → entry) und `frontmatter_cache` (target → fm-table | false). Sentinel `false` bedeutet „schon geprüft, kein gls-id" — vermeidet wiederholtes Datei-IO.
- `read_frontmatter(path)` — Regex-Parser für YAML-Frontmatter. Akzeptiert `key: value` mit optionalen Quotes. Leichtgewichtig, kein Pandoc-Roundtrip.
- `tex_escape(s)` — escapt `& % $ # _ { }` für sicheren Einsatz in `\newacronym{}`/`\newglossaryentry{}`.
- `try_resolve_glossary(target)` — Cache-Check, Frontmatter-Lookup, Entry-Registrierung. Returns `\gls{}`-RawInline oder nil.
- `flush_glossary_entries(doc)` — emittiert gesammelte Entries als `\newacronym`/`\newglossaryentry`-Block in `header-includes`, setzt `has-glossary`. No-Op wenn nichts gesammelt.

Frontmatter-gesteuerte Wraps (in `load_note`): Dispatch in drei Handler nach Env-Family, plus zwei shared Helpers.

- **Dispatch** (Top von `load_note`): Wenn `latex-env: <env>` gesetzt → `MATH_ENVS[env]` truthy → `wrap_math`. Sonst `env == "table"` → `wrap_table`. Sonst → `wrap_block`. Ohne `latex-env`-Frontmatter → kein Wrap, `annotate_with_labels` für normales Embed.
- **`MATH_ENVS`-Tabelle** (Modul-Level): `equation`, `align`, `gather`, `multline`, `alignat` plus Stern-Varianten. Neuen Math-Env hinzuzufügen ist eine Zeile in der Tabelle.
- **`wrap_math(notename, env_name, sliced, doc_meta)`**: Sucht ersten DisplayMath-Para via `find_block`, ersetzt durch `\begin{<env>}\label{eq:X}…\end{<env>}` mit getrimmtem Content. Label nur beim ersten Embed. Fehlt der Math-Block → `error()`.
- **`wrap_table(notename, env_name, sliced, doc_meta)`**: Caption aus `doc_meta.caption` (mandatory, sonst `error()`). Sucht ersten Table-Block via `find_block`, setzt Caption, hängt `\label{tab:X}` als RawInline ans Caption-Ende beim ersten Embed. Kein `\begin{table}`-Wrap (longtable-Konflikt).
- **`wrap_block(notename, env_name, sliced, doc_meta)`**: Default-Handler für theorem, lemma, definition, proof, custom amsthm-Envs. Wrappt mit `\begin{<env>}[latex-short]\label{note:X}…\end{<env>}`. `latex-short` aus Frontmatter ist optional, wird als amsthm-Optional-Arg eingesetzt.
- **Shared Helpers** (Modul-Level): `register_target(notename, prefix)` setzt `available_targets` + `autoref_targets` + gibt first_embed-Status zurück. `find_block(blocks, predicate)` lokalisiert ersten matchenden Block. Plus zwei Prädikate `is_table` und `is_display_math`.

Image-Figures (in `register_image_figure`):

- Erkennt Pandoc-Figures, deren einziges Inline ein Image mit Bild-Extension ist.
- Hängt `\label{fig:<sanitized-src>}` als RawInline ans Caption-Ende.
- Registriert `available_targets[src]` und `autoref_targets[src]`.

Pandoc-Loop (`Pandoc(doc)`): drei Phasen. (1) `process_blocks(doc.blocks)` expandiert Embeds, befüllt `available_targets`, labelt Image-Figures. (2) `pandoc.walk_block(pandoc.Div(...), {Link = resolve_wikilink})` löst Wikilinks auf dem expandierten AST — der Walker sieht damit auch Wikilinks aus expandiertem Embed-Content, weshalb Glossary-Refs in embedded Notes mit-gefunden werden. (3) `flush_glossary_entries(doc)` schreibt die in Phase 2 gesammelten Entries in `header-includes`.

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

Architektur ist konsolidiert, Math-Envs sind erweiterbar, alle Atomic-Note-Pfade verhalten sich konsistent (first_embed-Guard, autoref-Registrierung), Branding-Override läuft stabil inkl. Logo-Auto-Expansion. Nächste sinnvolle Schritte sind alle Design-Entscheidungen ohne harten Trigger — Reihenfolge nach Wunsch:

1. Plugin-Settings-UX (offener Punkt 3) — kleine Buttons + Toggle, niedrige Komplexität.
2. AI-Conventions-Skill (offener Punkt 5) — sobald die Feature-Liste stabil genug ist, dass die SKILL.md nicht jede Woche driftet.
3. Mermaid-Engine (offener Punkt 2) — Architektur-Entscheidung (Pipeline-Integration vs. Pre-Render) noch zu treffen.
4. Heading-Shifting (offener Punkt 1) — Konvention noch zu entscheiden.
5. SVG-Logo-Support (offener Punkt 4) — nur wenn der Wunsch nach SVG-Logos konkret wird; bis dahin ist PDF/PNG-Export der Workaround.
