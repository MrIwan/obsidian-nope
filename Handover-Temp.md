# Handover — Obsi Print Plugin

Obsidian-Note → PDF via Docker-Pipeline (Pandoc + LaTeX). Atomic-Note-Konzept mit Frontmatter-gesteuertem `latex-env` für strukturierte Inhalte, Wikilink-basierte Cross-References, Glossar.

## Agent-Workflow

Zwei Docs, getrennte Zielgruppen, keine Duplikation:

- `Handover-Temp.md` (diese Datei) → Plugin-Internals (Architektur, Code-Pfade, Algorithmen, was offen). Für Dev-Chats.
- `skill/SKILL.md` → User-Schreibkonvention (Frontmatter-Keys, Wikilink-Syntax, Beispiele, DO/DON'T). Für Authoring-Chats. Wird per Settings-Button in den Vault gepusht.

**Regel bei jedem Feature-Change:**

1. User-visible? (neue/geänderte Frontmatter-Keys, Commands, Wikilink-/Embed-Syntax, Filter-Verhalten das der User direkt sieht) → Skill UND Handover patchen.
2. Reiner Impl-Refactor (Renaming, Code-Move, Performance, interne Filter-Phase) → nur Handover.

**Trennlinie:** Skill beschreibt was der User schreibt und beobachtet; Handover wie das Plugin das verarbeitet. Beispiel: dass `latex-env: theorem` einen Theorem-Block produziert → Skill. Dass `wrap_block` in `obsidian-transclude.lua` das mit `\label{note:X}` als RawInline macht → Handover.

Bei Unsicherheit: knappe Erwähnung in beiden ist besser als ein Detail an zwei Stellen pflegen — aber Cross-Reference statt Copy/Paste. Wenn Implementation-Section auf User-Verhalten verweisen muss, mit „siehe Skill" abkürzen.

Beim Bumpen von Features: `obsi-print-version` und `last-updated` im Skill-Frontmatter mit ziehen, damit Drift zwischen geladener und aktueller Version sichtbar wird.

## Architektur

**TypeScript-Plugin** (`src/`) registriert die Commands „Export active note to PDF", „Build docker image (with cache)", „Create branding template", „Remove docker image" und „Cleanup build folder", stellt eine Settings-UI mit Preflight-Checks, Build-Button (`noCache: true`) und Maintenance-Sektion (Remove-Image, Cleanup-Build, Keep-Intermediates-Toggle) bereit und spawnt Docker-Compose mit `VAULT_PATH` als ENV.

**Docker-Pipeline** (`pipeline/`) basiert auf `pandoc/extra:latest` (Pandoc 3.9.x festgepinnt) plus `bash`, `nodejs`/`npm`/`chromium` für Mermaid-CLI und ausgewählten tlmgr-Paketen. Drei Lua-Filter laufen in Reihenfolge: `obsidian-transclude.lua` (Embeds, Wikilink-Resolver, Image-Figures, Glossary, Mermaid-Render via `wrap_mermaid`), `obsidian-inline.lua` (Comments, Highlights), `callouts.lua` (Obsidian-Callouts → awesomebox). Eisvogel-Template und latexmk schließen ab.

Bind-Mounts: `/vault` (read-only), `/app` (read-only Pipeline-Folder), `/build` (writable Intermediates und finale PDF, persistent für Debugging). Das Plugin kopiert die finale PDF an den konfigurierten Output-Path.

## Features (Implementation-Sicht)

User-Syntax und Frontmatter-Keys siehe Skill (`skill/SKILL.md`). Hier nur Implementation-Details und plugin-interne Semantik.

**Embeds und Slices.** Slice-Logik schneidet bis zum nächsten Heading gleicher oder höherer Ebene; Block-IDs werden beim Embed gestrippt und gelabelt. Embedder und Resolver kanonisieren die optionale `.md`-Extension gemeinsam.

**Auto-Heading-Shift.** Formel: `shift = max(0, host_last_level + 1 − min_embed_level)`. Clamp ≥ 0 verhindert Auto-Promotion (H2-startende Note im header-losen Kontext bleibt H2). Nested Embeds rechnen rekursiv im Local-Scope ihrer Parent-Note. Header aus expandierten Embeds aktualisieren `current_level` im umgebenden Scope NICHT — zwei aufeinanderfolgende `![[…]]` shiften beide gegen dasselbe Host-Heading. Implementation: `process_blocks` trackt `current_level` lokal, `load_note(src, host_level)` wendet den Shift nach dem Slice an (`find_min_header_level` + `shift_headings`).

**Wikilink-Resolver-Präzedenz.** (1) Glossary-Entry (`gls-id` im Target-Frontmatter) → `\gls{<id>}`. (2) Embed-Target in `available_targets` → `\autoref{label}` für Default-Display auf autoref-Targets, sonst `\hyperref[label]{content}`. (3) Plain-Text-Fallback für Refs auf nicht-embedded Notes. Custom-Display unterdrückt `\autoref` und erzwingt `\hyperref`. Glossary gewinnt bei Konflikt mit Embed-Targets.

**Theorem-Family-Wrap.** Voll-Embed wird in `\begin{<env>}[latex-short]\label{note:X}…\end{<env>}` gewrappt; `latex-short` ist optional. `\autoref` liefert „Theorem N" via Babel-Lokalisierung.

**Table-Wrap.** Pandoc-Table erhält Caption plus `\label{tab:X}` als RawInline am Caption-Ende; kein `\begin{table}`-Wrap, weil das mit longtable konfligiert. Fehlende `caption:` im Frontmatter → harter Filter-Error.

**Math-Wrap.** DisplayMath-Para im Body wird durch `\begin{<env>}\label{eq:X}…\end{<env>}` ersetzt. `MATH_ENVS` enthält `equation`, `align`, `gather`, `multline`, `alignat` plus Stern-Varianten. Fehlender Math-Block → harter Filter-Error.

**Image-Figures.** Pandoc 3.9.x emittiert kein Label aus `Figure.attr.identifier`, daher hängt der Filter `\label{fig:X}` als RawInline ans Caption-Ende. `extract_width_hint` strippt `|w=…` aus dem Caption-Ende und schreibt es nach `img.attributes.width`. Width gilt pro Embed, Label nur beim ersten Embed.

**Inline-Filter** (`obsidian-inline.lua`). `%%`-Comments arbeiten multi-block über Leerzeilen hinweg; `==`-Highlights sind paragraph-scoped, unbalanced wird literal reverted.

**Lokalisierung und Listen.** Babel-`ngerman` setzt `\figurename`/`\tablename`; ein `\AtBeginDocument`-Block (eisvogel.tex Z. ~980) setzt zusätzlich `\figureautorefname`/`\tableautorefname`/`\equationautorefname`. Abbildungs- und Tabellenverzeichnis sind per `lof`/`lot` aktiviert (Default an) und erscheinen mit eigenem `\newpage` direkt nach dem TOC.

**Glossary.** Referenzierte Entries werden gesammelt und als `\newacronym`/`\newglossaryentry` in `header-includes` injiziert. Template lädt `glossaries` mit `acronym, toc, nonumberlist` (eisvogel.tex Z. 502), ruft `\makeglossaries` und gibt am Doc-Ende `\printglossary[type=\acronymtype, title={Abkürzungen}]` plus `\printglossary[title={Glossar}]` aus. `latexmkrc` triggert `makeglossaries` automatisch über `.glo→.gls` und `.acn→.acr`.

**Mehrfach-Embed-Konsistenz.** Über alle Wrap-Pfade (normal, table, math, theorem/amsthm, image) wird `\label{}` nur beim ersten Embed gesetzt — vermeidet „multiply defined"-Warnings. Counter inkrementieren bei jedem Embed; Refs zeigen über das eine Label weiterhin auf das erste Vorkommen.

**Branding-Override.** Resolution per `metadataCache.getFirstLinkpathDest(linkpath, sourcePath)` mit der Branding-Datei als `sourcePath`; führender Slash erzwingt einen Root-Pfad. Zwei Resolutions-Pfade: (i) **Key-agnostische Pfad-Substitution** ersetzt jedes `[[…]]` in einem String-Value durch den Container-Pfad `/build/<docname>/branding/<original-name>` — funktioniert auch innerhalb von LaTeX-Snippets. (ii) **Logo-Auto-Expansion** für `header-*`/`footer-*`-Slots: Solo-Wikilink auf eine Bild-Datei wird zu `\raisebox{-0.3\height}{\includegraphics[height=<h>]{<path>}}` expandiert. Andere Image-Keys (`titlepage-logo`, `titlepage-background`) bleiben bei reiner Pfad-Substitution, da Eisvogel dort einen Pfad erwartet.

Keine Rekursion: ein `obsi-print-branding` in der Branding-Datei wird ignoriert. Merge-Reihenfolge: `_base.yml` → `branding-override.yml` → Doc-Frontmatter. `build.sh` erkennt `$WORK/branding-override.yml` und hängt das `--metadata-file` an die Pandoc-Invocation; nach erfolgreichem Run räumt das Skript Override-YAML und `branding/`-Folder weg, sodass zwischen Exports kein stale State zurückbleibt.

Der Command „Create branding template" schreibt eine vorbefüllte `Branding-Template.md` ins Vault-Root, mit allen `_base.yml`-Keys im Frontmatter. Overwrite-Confirm vermeidet, dass eigene Anpassungen unbemerkt verloren gehen.

**Maintenance-UX.** Settings-Sektion „Maintenance" plus zwei Commands („Remove docker image", „Cleanup build folder"). Toggle „Keep LaTeX intermediates after build" (Default `false`) löscht `pipeline/build/<base>/` komplett nach erfolgreichem Export (PDF ist da schon im Vault); Toggle an → Folder bleibt für Debugging. Settings-Button-Handler und Command-Callbacks teilen sich `removeImage`, `cleanupBuildFolder`, `cleanupIntermediates` in `src/utils/docker.ts` — keine Logik-Duplikation.

**Mermaid-Render.** Atomic-Pattern: `latex-env: mermaid` plus mandatory `caption:` im Frontmatter, Body ist genau ein ```mermaid-CodeBlock — Obsidian rendert die Note im Live-Preview, der Export macht daraus eine nummerierte Figure. Implementiert als `wrap_mermaid` in `obsidian-transclude.lua` (analog zu `wrap_table`); kein separater Filter und kein zweiter Code-Pfad. Dispatch in `load_note`: `env_name == "mermaid"` → `wrap_mermaid(notename, env_name, sliced, doc_meta)`. Caption fehlt → harter Filter-Error wie bei `latex-env: table`. Body ohne `is_mermaid_code`-Match → ebenfalls harter Filter-Error. `render_mermaid_to_png(source)` schreibt eine `.mmd`-Source-Datei nach `$MERMAID_WORK_DIR/mermaid/<sha1>.mmd` und ruft `mmdc` mit `-b transparent` und `-p /etc/mmdc/puppeteer-config.json` auf — Output ist `<sha1>.png` im selben Verzeichnis. Sha1-Hash über den Diagramm-Source dient als Cache-Key (identische Diagramme rendern nur einmal pro Build, auch über mehrere Notes). Image-src im AST ist der ABSOLUTE Pfad (`$MERMAID_WORK_DIR/mermaid/<sha1>.png`); ein relativer Pfad schlug fehl, weil $MERMAID_WORK_DIR nicht im Pandoc-`--resource-path` enthalten ist — der LaTeX-Writer droppt dann den ganzen Image-Inline und gibt nur `{}` in der Figure aus (verifizierter Stolperstein). Image-Alt wird mit dem Notenamen befüllt, fließt nur in `\includegraphics[alt={…}]` als PDF-Accessibility-Metadata; sichtbarer Caption-Text kommt allein aus der Figure-Caption. Caption-Inlines kommen aus dem Frontmatter (`meta_to_inlines`), `\label{fig:X}` wird beim ersten Embed als RawInline ans Caption-Ende gehängt; `register_target(notename, "fig")` markiert die Note `autoref`-fähig, sodass Wikilinks darauf zu „Abbildung N" auflösen. Zwei orthogonale Frontmatter-Keys: `w:` (oder `width:`) steuert die PDF-Darstellungsgröße via `img.attributes.width` (Prozent, px, cm, mm, LaTeX-Längen); `w:` gewinnt bei Konflikt mit `width:`. `scale:` (1–5, Default 2 = ~1600px-Breite ≈ 300dpi) steuert die mmdc-Render-Auflösung via `--scale`-Flag. Scale geht in den sha1-Cache-Key ein (`sha1(source .. ":scale:" .. n)`), sonst würden Renders mit unterschiedlicher Auflösung kollidieren. Mmdc-Backend: Puppeteer mit dem system-`chromium-browser` (ENV `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`); `--no-sandbox` über `/etc/mmdc/puppeteer-config.json`, weil Container-root sonst von Chromium-Sandbox blockiert wird. Image-Bloat durch nodejs/npm/chromium: ~250 MB on top. Inline-```mermaid-Blöcke in Notes ohne `latex-env: mermaid` werden bewusst NICHT verarbeitet (Konsistenz mit dem Atomic-Pattern für Theorem/Table/Math) — sie bleiben als Code-Fence im PDF.

**AI-Conventions-Skill-Install.** SSoT liegt im Plugin-Repo unter `skill/SKILL.md` (Frontmatter `obsi-print-version`/`last-updated`). Settings-Sektion „AI conventions skill" plus Command „Install AI conventions skill" kopieren die Datei explizit per Klick nach `<vault>/.claude/skills/obsi-print/SKILL.md` — kein Auto-Push, damit eigene Anpassungen am installierten Skill nicht stillschweigend überschrieben werden. `getSkillStatus(pluginDir, vaultPath)` in `src/utils/skill.ts` vergleicht byte-equal und liefert drei States: `missing` (Target fehlt) → ✗-Label und „Install"-Button, `outdated` (Bytes weichen ab — Upstream-Bump oder Local-Edit, beides triggert denselben State) → ⚠-Label und „Update"-Button, `current` → ✓-Label und „Reinstall"-Button. Settings-Status wird bei jedem Tab-Open und nach jedem Install neu berechnet. Export-Command zeigt eine Notice, wenn der Skill nicht installiert ist (`missing`) — reiner Hinweis auf die Settings, keine Blockade: die Pipeline läuft weiter, der Skill ist Authoring-Support und kein Pipeline-Input.

## Implementierungs-Referenz

**Lua-Filter** `pipeline/app/filters/obsidian-transclude.lua`:

- `Pandoc(doc)` läuft dreiphasig: (1) `process_blocks` expandiert Embeds, befüllt `available_targets`, labelt Image-Figures; (2) `pandoc.walk_block(pandoc.Div(...), {Link = resolve_wikilink})` löst Wikilinks auf dem expandierten AST (deshalb werden Glossary-Refs auch in embedded Notes gefunden); (3) `flush_glossary_entries(doc)` schreibt Entries in `header-includes`.
- `available_targets[notename] = label` mit kanonischen Keys (ohne `.md`). Label-Prefixe je Target-Typ: `note:X` (Standard, Theorem), `tab:X`, `eq:X`, `fig:bild.png`, `note:X:sec-Heading` und `note:X:blk-id` (Slices). `autoref_targets[notename] = true` markiert `\autoref`-fähige Targets.
- `load_note`-Dispatch: `MATH_ENVS[env]` → `wrap_math`; `env == "table"` → `wrap_table`; `env == "mermaid"` → `wrap_mermaid` (ruft `render_mermaid_to_png` → mmdc-Subprocess, baut Figure mit Caption + `\label{fig:X}`); sonst → `wrap_block` (Default für theorem, lemma, definition, proof, custom amsthm). Ohne `latex-env` → kein Wrap, nur `annotate_with_labels`.
- Glossary-Modul-State: `glossary_entries` (id → entry) und `frontmatter_cache` (target → fm-table oder `false`-Sentinel für „bereits geprüft, kein gls-id"). `read_frontmatter` ist ein leichter Regex-Parser ohne Pandoc-Roundtrip; `tex_escape(s)` escapt `& % $ # _ { }` für sichere Entries.
- `register_image_figure` erkennt Pandoc-Figures mit Single-Image-Inline, hängt Label an Caption, registriert in `available_targets`/`autoref_targets`. `extract_width_hint` strippt `|w=…` aus dem Caption-Ende.
- Konstruktor-Stolperstein: `pandoc.Caption(long, short)` — `long` sind Blocks (mandatory), `short` sind Inlines (optional, für LoF/LoT-Kurzform). Bei `object has no __toinline metamethod` liegt fast immer ein Arg-Reihenfolge- oder Block-vs-Inline-Mismatch vor.

**Branding (TypeScript)** `src/utils/branding.ts`:

- `prepareBrandingOverride(app, exportFile, workDir, vaultBasePath, baseName)` ist der Einstiegspunkt: liest Doc- und Branding-Frontmatter, walked Keys, dispatched je nach Key/Wert auf `expandLogoWikilink` oder die Pfad-Substitution, schreibt `branding-override.yml`.
- Helper: `parseLogoLinkInner` extrahiert kanonischen linkpath plus optionalen `|h=…`-Wert; `isLogoImage` prüft die Extension gegen `LOGO_IMAGE_EXTS`; `expandLogoWikilink` baut das LaTeX-Snippet; `copyAssetByLinkpath` ist der gemeinsame Asset-Copy-Pfad für beide Routen.
- YAML-Output via handgeschriebenem `serializeYaml` mit double-quoted strings (`\\`, `\"`, `\n`-Escapes), damit eingebettete LaTeX-Backslashes sauber round-trippen.

## Was offen

**1. SVG-Support für Logos.** `LOGO_IMAGE_EXTS` akzeptiert `.svg`, aber pdflatex kann sie nicht direkt rendern. Pipeline-Erweiterung wäre Inkscape ins Image (~200 MB), `\usepackage{svg}` im Template und `--shell-escape` im latexmk. Bis dahin: PDF/PNG-Export aus Inkscape als Workaround.

**2. Zitationen** Irgendwie müssen noch Literatur-Verzeichnisse unterstützt werden. Der Übliche Weg scheint mir hierfür ein Zotero plugin mit einzubezeiehn. Der genaue Workflow muss noch geklärt werden.

**3. Auto Rerender PDF** Ein Feature für viel viel Später! Mit einem Command soll ein extra Fenster oder Leaf ( Also Tab ) geöffnet werden. Dieser Tab sieht aus wie der rechte Teil auf overleaf und macht auch das. Oben links kann man das Auto Rerender an und aus stellen. Ein Button sagt auch einfach "Neu rendern". Auto Automatische Mode braucht irgendwie einen Life Cykle der halt immer wieder ausgelöst wird, wenn änderungen in einer der betroffenen Notes festgestellt wird und den neu rendern auslöst, wenn sich etwas geändert hat. 

**4. Schriftarten einbinden**

**5. Mehrere Logos** 

**6. Über Bases als TOC ein Document** Handhabung mit Bases. 

## Test-Dateien

`ExampleFiles/HelperFiles/`: `Theorem-Pythagoras.md`, `Tabelle-Vergleich.md`, `Tabelle-Projektphasen.md` (Counter-Test), `Navier-Stokes.md` (Multi-Line via `aligned`), `Eulersche-Identitaet.md` (einzeilig), `slice-source-{1,2,3}.md`, `env-test.md`, `image-test.md`, `gleichungen-test.md`, `glossar-test.md`, Glossary-Atoms `KI.md`/`CNN.md`/`DNN.md`/`NLP.md`/`Transformer.md`/`Spracherkennung.md`/`Computer Vision.md`. Test-Bilder: `neuron.excalidraw.png`, `neuronales_netz.excalidraw.png`. Im `ExampleFiles/`-Root: `tabellen-test.md`, `Testdokument.md`, `Testdokument-minimal.md`.

## Debugging

Lua-Filter, Eisvogel-Template und `_base.yml` sind Bind-Mounts; Änderungen wirken bei jedem Export, kein Image-Rebuild nötig. Image-Rebuild ist nur bei Dockerfile-Änderung, neuen tlmgr-Paketen oder Pandoc-Version-Wechseln erforderlich (Settings → „Build image" mit `--no-cache`, oder Command „Build docker image (with cache)" für inkrementell).

`pipeline/build/<docname>/` enthält Intermediates (`.tex`, `.log`, `.aux`, …). Per Default wird der Folder nach jedem erfolgreichen Export gelöscht (PDF ist da schon im Vault) — für Debugging Settings → „Keep LaTeX intermediates after build" anschalten, dann bleibt der Folder stehen. `pipeline/build/last_latex_run.log` enthält den vollen stderr von Pandoc und latexmk, `last-build.log` den Docker-Build-stderr (beide auf `pipeline/build/`-Root, also vom Per-Doc-Cleanup unberührt). `io.stderr:write(...)` aus Lua-Filtern landet in `last_latex_run.log` — der Standard-Debug-Mechanismus.

Lua-Syntax-Check außerhalb der Pipeline via Python und `lupa`: `lua.execute('load(code)')` parst den Filter ohne Docker-Run.

## Roadmap

Architektur ist konsolidiert, Math-Envs sind erweiterbar, Atomic-Note-Pfade verhalten sich konsistent (first_embed-Guard, autoref-Registrierung), Auto-Heading-Shift greift kontextbasiert ohne Konfiguration, Branding-Override läuft stabil inklusive Logo-Auto-Expansion, Maintenance-UX deckt Image-Remove und Build-Cleanup ab. Sinnvolle nächste Schritte:

1. Zitationen via Zotero (Punkt 2) — Workflow noch offen.
2. SVG-Logo-Support (Punkt 1) — nur bei konkretem Bedarf.
