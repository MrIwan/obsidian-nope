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

## Was offen / nicht erledigt

**1. Heading-Shifting bei Note-Embeds.** Aktuell werden Headings der embedded Note unverändert übernommen — eine Note mit „# Definition" als Top-Level-Heading wirkt im Host-Dokument wie ein neuer H1-Abschnitt, was die Hierarchie zerschießt. Mögliche Strategien: (a) Headings um N Level nach unten shiften (analog Pandoc's `--shift-heading-level-by`, auto-detect aus Host-Context), (b) Headings strippen wenn Note via `latex-env` gewrappt wird (typisch für atomic Theorem/Equation-Notes — die haben sowieso keine sinnvolle eigene Hierarchie), (c) Embed-Tag mit Level-Hint (`![[Note:h+1]]` o.ä., aber bricht Obsidian-Syntax-Kompat). Vermutlich (b) als Default + (a) für nicht-gewrappte Embeds. Konvention noch offen.

**2. Mermaid-Render-Engine.** Aktuell werden Mermaid-Codeblöcke einfach als Code-Fence im PDF gerendert (= Quelltext, nicht Diagramm). Für technische Doku mit Architektur-/Flow-Diagrammen sinnvoll. Standard-Lösung: Pandoc-Filter (`pandoc-mermaid`, `mermaid-filter`, `diagram-filter`) der die Code-Block-Inhalte über CLI an mermaid-cli übergibt und das resultierende SVG/PDF einbindet. Pipeline-Kosten: Node + `@mermaid-js/mermaid-cli` ins Docker-Image (zieht Headless-Chromium nach — Image wird deutlich größer). Alternative: vorgerenderte Mermaid-Bilder im Vault speichern und als normale `![[diagram.svg]]`-Embeds — kein Filter nötig, dafür manueller Render-Step. Entscheidung Pipeline-Integration vs. Pre-Render-Convention offen.

**3. Plugin-Settings-Erweiterungen (UX).** Quality-of-Life-Features die noch fehlen:
- „Remove docker image"-Button — Pendant zu „Build image", räumt das Plugin-Image weg (`docker image rm <image>` oder `docker compose down --rmi all`). Aktuell muss man manuell die Shell bemühen.
- „Cleanup build folder"-Button — Löscht `pipeline/build/*` (Intermediates + alte PDFs). Wird mit der Zeit groß.
- Toggle „Keep LaTeX intermediates after build" — Default `false` (Build-Folder wird nach erfolgreichem Export geleert), Debug-Mode `true` (Verhalten wie heute, alles bleibt persistent für Diagnose). Heute sind die Intermediates immer persistent; das ist gut beim Debuggen, beim normalen Nutzer aber unnötiger Müll.

**4. Branding-Override per Vault-`.md`-File.** Aktuell sind alle Branding-Werte hardcoded in `_base.yml` (titlepage-background, titlepage-logo, header-left, titlepage-text-color etc.). Nutzer soll das pro Vault und pro Kunde überschreiben können, ohne bei Plugin-Updates Settings zu verlieren.

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

Logo-Auto-Expansion in Header/Footer: für die Keys `header-left`, `header-center`, `header-right`, `footer-left`, `footer-center`, `footer-right` gilt eine Spezial-Regel — ist der Value ein **Solo-Wikilink** auf eine Bild-Datei (`^\s*\[\[…\]\]\s*$`, Extension in `LOGO_IMAGE_EXTS`), wird er Plugin-seitig zu `\raisebox{-0.3\height}{\includegraphics[height=<h>]{<container-path>}}` expandiert statt nur den Pfad zu substituieren. Default-Höhe `0.7cm`, override über `|h=<wert>`-Suffix im Wikilink: `"[[logo.png|h=1.2cm]]"` ergibt `height=1.2cm`. Andere Keys (`titlepage-logo`, `titlepage-background`) bleiben bei der reinen Pfad-Substitution — Eisvogel erwartet dort einen Pfad, kein LaTeX-Snippet. Mixed-Mode (Text + Logo in einer Header-Zelle) bleibt manuell: der User schreibt das LaTeX-Snippet selbst und nutzt `[[…]]` als Pfad-Platzhalter, wie zuvor. Helper-Funktionen in `branding.ts`: `parseLogoLinkInner` (extrahiert linkpath + optional height), `isLogoImage` (Extension-Check), `expandLogoWikilink` (LaTeX-Snippet-Builder). `copyAssetByLinkpath` ist der gemeinsame Asset-Copy-Path für beide Routen (Solo-Logo und embedded Wikilink).

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

Architektur ist konsolidiert, Math-Envs sind erweiterbar, alle Atomic-Note-Pfade verhalten sich konsistent (first_embed-Guard, autoref-Registrierung). Nächste sinnvolle Schritte sind alle Design-Entscheidungen ohne harten Trigger — Reihenfolge nach Wunsch:

1. Branding-Override (offener Punkt 4) — größtes neues Feature, vollständig durchgeplant, kann direkt gebaut werden. Touched primär die TypeScript-Seite (`src/`) plus Pandoc-CLI-Args in `build.sh`.
2. Plugin-Settings-UX (offener Punkt 3) — kleine Buttons + Toggle, niedrige Komplexität.
3. Mermaid-Engine (offener Punkt 2) — Architektur-Entscheidung (Pipeline-Integration vs. Pre-Render) noch zu treffen.
4. Heading-Shifting (offener Punkt 1) — Konvention noch zu entscheiden.
