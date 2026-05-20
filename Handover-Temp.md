# Handover — Obsi Print Plugin

Obsidian-Note → PDF via Docker-Pipeline (Pandoc + LaTeX). Atomic-Note-Konzept mit Frontmatter-gesteuertem `latex-env` für strukturierte Inhalte, Wikilink-basierte Cross-References, Glossar.

## Architektur

**TypeScript-Plugin** (`src/`) registriert die Commands „Export active note to PDF", „Build docker image (with cache)", „Create branding template", „Remove docker image" und „Cleanup build folder", stellt eine Settings-UI mit Preflight-Checks, Build-Button (`noCache: true`) und Maintenance-Sektion (Remove-Image, Cleanup-Build, Keep-Intermediates-Toggle) bereit und spawnt Docker-Compose mit `VAULT_PATH` als ENV.

**Docker-Pipeline** (`pipeline/`) basiert auf `pandoc/extra:latest` (Pandoc 3.9.x festgepinnt) plus `bash` und ausgewählten tlmgr-Paketen. Drei Lua-Filter laufen in Reihenfolge: `obsidian-transclude.lua` (Embeds, Wikilink-Resolver, Image-Figures, Glossary), `obsidian-inline.lua` (Comments, Highlights), `callouts.lua` (Obsidian-Callouts → awesomebox). Eisvogel-Template und latexmk schließen ab.

Bind-Mounts: `/vault` (read-only), `/app` (read-only Pipeline-Folder), `/build` (writable Intermediates und finale PDF, persistent für Debugging). Das Plugin kopiert die finale PDF an den konfigurierten Output-Path.

## Features

**Note-Embeds und -Slices.** `![[Note]]`, `![[Note#Heading]]`, `![[Note#^block-id]]`. Slice-Logik schneidet bis zum nächsten Heading gleicher oder höherer Ebene; Block-IDs werden beim Embed gestrippt und gelabelt. Die `.md`-Extension ist optional und wird von Embedder und Resolver gleichermaßen kanonisiert.

**Auto-Heading-Shift.** Headings der embedded Note (bzw. ihres Slice) werden kontextbasiert verschoben: das niedrigste Header-Level der Note landet eine Ebene unter dem zuletzt aktiven Heading im umgebenden Scope, die relative Hierarchie innerhalb der Note bleibt erhalten. Formel: `shift = max(0, host_last_level + 1 − min_embed_level)`. Clamp ≥ 0 verhindert Auto-Promotion (eine H2-startende Note in einem header-losen Kontext bleibt H2). Nested Embeds rechnen rekursiv im Local-Scope ihrer Parent-Note. Header aus expandierten Embeds aktualisieren `current_level` im umgebenden Scope NICHT — zwei aufeinanderfolgende `![[…]]` shiften beide gegen dasselbe Host-Heading. Keine Konfiguration, kein Frontmatter-Key, kein Embed-Tag-Hint. Implementation: `process_blocks` trackt `current_level` lokal, `load_note(src, host_level)` wendet den Shift nach dem Slice an (`find_min_header_level` + `shift_headings`).

**Wikilink-Resolver-Präzedenz.** (1) Glossary-Entry (`gls-id` im Target-Frontmatter) → `\gls{<id>}`. (2) Embed-Target in `available_targets` → `\autoref{label}` für Default-Display auf autoref-Targets, sonst `\hyperref[label]{content}`. (3) Plain-Text-Fallback für Refs auf nicht-embedded Notes (Denk-Verweise ohne Crash). Custom-Display unterdrückt `\autoref` und erzwingt `\hyperref`. Glossary gewinnt bei Konflikt mit Embed-Targets.

**`latex-env: theorem` und amsthm-Verwandte** (lemma, definition, proof, custom). Voll-Embed wird in `\begin{<env>}[latex-short]\label{note:X}…\end{<env>}` gewrappt; das `latex-short:`-Frontmatter ist optional. Default-Display-Refs liefern „Theorem N" via `\autoref`.

**`latex-env: table`.** Tabellen-Note erfordert `caption:` im Frontmatter (mandatory, sonst harter Filter-Error). Pandoc-Table erhält Caption plus `\label{tab:X}` als RawInline am Caption-Ende; kein `\begin{table}`-Wrap, da dieser mit longtable konfligiert. Refs liefern „Tabelle N".

**`latex-env: equation`** (sowie `align`, `gather`, `multline`, `alignat` und deren Stern-Varianten). Voll-Embed mit einem `$$…$$`-Block im Body; der DisplayMath-Para wird durch `\begin{<env>}\label{eq:X}…\end{<env>}` ersetzt. `align`/`gather` dürfen direkt `&`/`\\` enthalten (Counter pro Zeile); `equation` kann via inneres `aligned` mehrzeilig sein (eine Nummer). Fehlender Math-Block → harter Filter-Error. Refs liefern „Gleichung N".

**Image-Figures.** `![[bild.png|Caption]]` und `![[bild.png]]` (Filename als Caption-Fallback) werden zu nummerierten Figures; `\label{fig:X}` wird als RawInline ans Caption-Ende gehängt, da Pandoc 3.9.x kein Label aus `Figure.attr.identifier` emittiert. Optionaler Width-Hint per Suffix `|w=<value>` (`60%`, `400px`, `8cm`, `0.5\textwidth`); der Marker muss am Caption-Ende stehen, wird vom Filter (`extract_width_hint`) gestrippt und nach `img.attributes.width` geschrieben. Width gilt pro Embed, das Label nur beim ersten — Mehrfach-Embeds können unterschiedliche Größen tragen.

**Inline-Filter** (`obsidian-inline.lua`). `%%text%%` Comments (auch multi-block über Leerzeilen hinweg); `==text==` Highlights (paragraph-scoped, unbalanced wird literal reverted).

**Lokalisierung und Listen.** Babel-`ngerman` setzt `\figurename`/`\tablename`; ein `\AtBeginDocument`-Block (eisvogel.tex Z. ~980) setzt zusätzlich `\figureautorefname`/`\tableautorefname`/`\equationautorefname`. Ergebnis: „Abbildung"/„Tabelle"/„Gleichung" in Captions wie in `\autoref`. Abbildungs- und Tabellenverzeichnis sind per `lof: true`/`lot: true` aktiviert (Default an, pro Doc abschaltbar) und erscheinen mit eigenem `\newpage` direkt nach dem TOC; Titel kommen aus Babel-ngerman.

**Glossary.** Atomic Glossary-Notes mit Frontmatter-Keys `gls-id`, `gls-short`, `gls-long`, `gls-description`, `gls-type` (`acronym` oder `term`). Wikilink `[[KI]]` → `\gls{ki}`. Referenzierte Entries werden gesammelt und als `\newacronym`/`\newglossaryentry` in `header-includes` injiziert. Template lädt `glossaries` mit `acronym, toc, nonumberlist` (eisvogel.tex Z. 502), ruft `\makeglossaries` und gibt am Doc-Ende `\printglossary[type=\acronymtype, title={Abkürzungen}]` plus `\printglossary[title={Glossar}]` aus. `latexmkrc` triggert `makeglossaries` automatisch über `.glo→.gls` und `.acn→.acr`.

**Mehrfach-Embed-Konsistenz.** Über alle Wrap-Pfade (normal, table, math, theorem/amsthm, image) wird `\label{}` nur beim ersten Embed gesetzt — vermeidet „multiply defined"-Warnings. Counter inkrementieren bei jedem Embed; Wikilinks zeigen über das eine Label weiterhin auf das erste Vorkommen.

**Branding-Override.** Selektion per `obsi-print-branding: "[[Branding-Kunde1]]"` im Doc-Frontmatter; ohne Key gelten reine `_base.yml`-Defaults. Die Branding-Datei ist eine normale `.md` mit Frontmatter (überschriebene Keys) und Body (Editor-Doku, beim Export ignoriert). Wikilinks im YAML müssen quoted sein (sonst Flow-Sequence-Parse-Fehler). Resolution per `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` mit der Branding-Datei als `sourcePath`; führender Slash erzwingt einen Root-Pfad.

Zwei Resolutions-Pfade: (i) **Key-agnostische Pfad-Substitution** ersetzt jedes `[[…]]` in einem String-Value durch den Container-Pfad `/build/<docname>/branding/<original-name>` — funktioniert auch innerhalb von LaTeX-Snippets. (ii) **Logo-Auto-Expansion** für `header-left`, `header-center`, `header-right`, `footer-left`, `footer-center`, `footer-right`: Ist der Value ein Solo-Wikilink auf eine Bild-Datei, wird er zu `\raisebox{-0.3\height}{\includegraphics[height=<h>]{<container-path>}}` expandiert. Default-Höhe `0.7cm`, Override per `|h=<wert>`-Suffix (`"[[logo.png|h=1.2cm]]"`). Andere Image-Keys (`titlepage-logo`, `titlepage-background`) bleiben bei reiner Pfad-Substitution, da Eisvogel dort einen Pfad erwartet. Mixed-Mode (Text plus Logo in einer Header-Zelle) bleibt manuell: der User schreibt LaTeX, `[[…]]` dient als Pfad-Platzhalter. pdflatex kann SVGs nicht direkt einbinden — Logos als PDF oder PNG ablegen.

Keine Rekursion: ein `obsi-print-branding` in der Branding-Datei wird ignoriert. Merge-Reihenfolge: `_base.yml` → `branding-override.yml` → Doc-Frontmatter. `build.sh` erkennt `$WORK/branding-override.yml` und hängt das `--metadata-file` an die Pandoc-Invocation; nach erfolgreichem Run räumt das Skript Override-YAML und `branding/`-Folder weg, sodass zwischen Exports kein stale State zurückbleibt.

Der Command „Create branding template" schreibt eine vorbefüllte `Branding-Template.md` ins Vault-Root, mit allen `_base.yml`-Keys im Frontmatter und einer deutschen Erklärung im Body (inkl. Logo-Wikilink-Syntax und `|h=`-Override). Overwrite-Confirm verhindert, dass eigene Anpassungen unbemerkt verloren gehen.

**Maintenance-UX.** Settings-Sektion „Maintenance" plus zwei Commands: „Remove docker image" (`docker image rm -f obsidian2pdf`, anschließend zeigt der Setup-Status wieder „nicht gebaut") und „Cleanup build folder" (löscht alles unterhalb `pipeline/build/`, inkl. Logs und Per-Doc-Folder). Toggle „Keep LaTeX intermediates after build" (Default `false`) steuert das Verhalten direkt nach jedem erfolgreichen Export: ist er aus, wird `pipeline/build/<base>/` komplett gelöscht, sobald die PDF in den Vault kopiert ist — die PDF im Vault ist die Single-Source-of-Truth, der Build-Folder hat nichts mehr Erhaltenswertes. Zum Debugging Toggle anschalten, dann bleibt `.tex`/`.log`/`.aux`/… stehen. Settings-Button-Handler und Command-Callbacks teilen sich dieselben Util-Funktionen (`removeImage`, `cleanupBuildFolder`, `cleanupIntermediates` in `src/utils/docker.ts`), keine Logik-Duplikation.

## Implementierungs-Referenz

**Lua-Filter** `pipeline/app/filters/obsidian-transclude.lua`:

- `Pandoc(doc)` läuft dreiphasig: (1) `process_blocks` expandiert Embeds, befüllt `available_targets`, labelt Image-Figures; (2) `pandoc.walk_block(pandoc.Div(...), {Link = resolve_wikilink})` löst Wikilinks auf dem expandierten AST (deshalb werden Glossary-Refs auch in embedded Notes gefunden); (3) `flush_glossary_entries(doc)` schreibt Entries in `header-includes`.
- `available_targets[notename] = label` mit kanonischen Keys (ohne `.md`). Label-Prefixe je Target-Typ: `note:X` (Standard, Theorem), `tab:X`, `eq:X`, `fig:bild.png`, `note:X:sec-Heading` und `note:X:blk-id` (Slices). `autoref_targets[notename] = true` markiert `\autoref`-fähige Targets.
- `load_note`-Dispatch: `MATH_ENVS[env]` → `wrap_math`; `env == "table"` → `wrap_table`; sonst → `wrap_block` (Default für theorem, lemma, definition, proof, custom amsthm). Ohne `latex-env` → kein Wrap, nur `annotate_with_labels`.
- Glossary-Modul-State: `glossary_entries` (id → entry) und `frontmatter_cache` (target → fm-table oder `false`-Sentinel für „bereits geprüft, kein gls-id"). `read_frontmatter` ist ein leichter Regex-Parser ohne Pandoc-Roundtrip; `tex_escape(s)` escapt `& % $ # _ { }` für sichere Entries.
- `register_image_figure` erkennt Pandoc-Figures mit Single-Image-Inline, hängt Label an Caption, registriert in `available_targets`/`autoref_targets`. `extract_width_hint` strippt `|w=…` aus dem Caption-Ende.
- Konstruktor-Stolperstein: `pandoc.Caption(long, short)` — `long` sind Blocks (mandatory), `short` sind Inlines (optional, für LoF/LoT-Kurzform). Bei `object has no __toinline metamethod` liegt fast immer ein Arg-Reihenfolge- oder Block-vs-Inline-Mismatch vor.

**Branding (TypeScript)** `src/utils/branding.ts`:

- `prepareBrandingOverride(app, exportFile, workDir, vaultBasePath, baseName)` ist der Einstiegspunkt: liest Doc- und Branding-Frontmatter, walked Keys, dispatched je nach Key/Wert auf `expandLogoWikilink` oder die Pfad-Substitution, schreibt `branding-override.yml`.
- Helper: `parseLogoLinkInner` extrahiert kanonischen linkpath plus optionalen `|h=…`-Wert; `isLogoImage` prüft die Extension gegen `LOGO_IMAGE_EXTS`; `expandLogoWikilink` baut das LaTeX-Snippet; `copyAssetByLinkpath` ist der gemeinsame Asset-Copy-Pfad für beide Routen.
- YAML-Output via handgeschriebenem `serializeYaml` mit double-quoted strings (`\\`, `\"`, `\n`-Escapes), damit eingebettete LaTeX-Backslashes sauber round-trippen.

## Was offen

**1. Mermaid-Render-Engine.** Mermaid-Codeblöcke werden derzeit als Code-Fence gerendert. Standard-Lösung wäre `mermaid-filter` via mermaid-cli — kostet Node und Headless-Chromium im Docker-Image. Alternative: vorgerenderte SVGs/PNGs im Vault, Embed wie bei normalen Images. Pipeline-Integration vs. Pre-Render-Konvention noch offen.

**2. SVG-Support für Logos.** `LOGO_IMAGE_EXTS` akzeptiert `.svg`, aber pdflatex kann sie nicht direkt rendern. Pipeline-Erweiterung wäre Inkscape ins Image (~200 MB), `\usepackage{svg}` im Template und `--shell-escape` im latexmk. Bis dahin: PDF/PNG-Export aus Inkscape als Workaround.

**3. AI-Conventions-Skill installieren.** Button schreibt eine Convention-Doku in den Vault: `<vault>/.claude/skills/obsi-print/SKILL.md` plus `<vault>/AGENTS.md`, generiert aus der Single-Source-of-Truth `pipeline/app/skill/SKILL.md` im Plugin-Repo. Inhalt knapp halten (~200–300 Zeilen): Pipeline-Überblick, Atomic-Note-Prinzip, alle `latex-env`-Werte mit Mini-Beispielen, Glossary-Frontmatter, DO/DON'T-Liste. Version-Header (`obsi-print-version`, `last-updated`) macht Drift sichtbar. Push explizit per Button-Klick, nicht automatisch — Auto-Update würde eigene Anpassungen unbemerkt verlieren. Trigger: erst angehen, wenn die Feature-Liste stabil ist.

**4. Zitationen** Irgendwie müssen noch Literatur-Verzeichnisse unterstützt werden. Der Übliche Weg scheint mir hierfür ein Zotero plugin mit einzubezeiehn. Der genaue Workflow muss noch geklärt werden. 

**5. Auto Rerender PDF** Ein Feature für viel viel Später! Mit einem Command soll ein extra Fenster oder Leaf ( Also Tab ) geöffnet werden. Dieser Tab sieht aus wie der rechte Teil auf overleaf und macht auch das. Oben links kann man das Auto Rerender an und aus stellen. Ein Button sagt auch einfach "Neu rendern". Auto Automatische Mode braucht irgendwie einen Life Cykle der halt immer wieder ausgelöst wird, wenn änderungen in einer der betroffenen Notes festgestellt wird und den neu rendern auslöst, wenn sich etwas geändert hat. 

## Test-Dateien

`ExampleFiles/HelperFiles/`: `Theorem-Pythagoras.md`, `Tabelle-Vergleich.md`, `Tabelle-Projektphasen.md` (Counter-Test), `Navier-Stokes.md` (Multi-Line via `aligned`), `Eulersche-Identitaet.md` (einzeilig), `slice-source-{1,2,3}.md`, `env-test.md`, `image-test.md`, `gleichungen-test.md`, `glossar-test.md`, Glossary-Atoms `KI.md`/`CNN.md`/`DNN.md`/`NLP.md`/`Transformer.md`/`Spracherkennung.md`/`Computer Vision.md`. Test-Bilder: `neuron.excalidraw.png`, `neuronales_netz.excalidraw.png`. Im `ExampleFiles/`-Root: `tabellen-test.md`, `Testdokument.md`, `Testdokument-minimal.md`.

## Debugging

Lua-Filter, Eisvogel-Template und `_base.yml` sind Bind-Mounts; Änderungen wirken bei jedem Export, kein Image-Rebuild nötig. Image-Rebuild ist nur bei Dockerfile-Änderung, neuen tlmgr-Paketen oder Pandoc-Version-Wechseln erforderlich (Settings → „Build image" mit `--no-cache`, oder Command „Build docker image (with cache)" für inkrementell).

`pipeline/build/<docname>/` enthält Intermediates (`.tex`, `.log`, `.aux`, …). Per Default wird der Folder nach jedem erfolgreichen Export gelöscht (PDF ist da schon im Vault) — für Debugging Settings → „Keep LaTeX intermediates after build" anschalten, dann bleibt der Folder stehen. `pipeline/build/last_latex_run.log` enthält den vollen stderr von Pandoc und latexmk, `last-build.log` den Docker-Build-stderr (beide auf `pipeline/build/`-Root, also vom Per-Doc-Cleanup unberührt). `io.stderr:write(...)` aus Lua-Filtern landet in `last_latex_run.log` — der Standard-Debug-Mechanismus.

Lua-Syntax-Check außerhalb der Pipeline via Python und `lupa`: `lua.execute('load(code)')` parst den Filter ohne Docker-Run.

## Roadmap

Architektur ist konsolidiert, Math-Envs sind erweiterbar, Atomic-Note-Pfade verhalten sich konsistent (first_embed-Guard, autoref-Registrierung), Auto-Heading-Shift greift kontextbasiert ohne Konfiguration, Branding-Override läuft stabil inklusive Logo-Auto-Expansion, Maintenance-UX deckt Image-Remove und Build-Cleanup ab. Sinnvolle nächste Schritte:

1. AI-Conventions-Skill (Punkt 3) — sobald die Feature-Liste stabil ist.
2. Mermaid-Engine (Punkt 1) — Architektur-Entscheidung noch offen.
3. Zitationen via Zotero (Punkt 4) — Workflow noch offen.
4. SVG-Logo-Support (Punkt 2) — nur bei konkretem Bedarf.
