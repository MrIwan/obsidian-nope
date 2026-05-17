Handover — Obsi Print Plugin
Stand nach Rollback. Aktueller Code ist stabil bis einschließlich Theorem-/LaTeX-env-Feature. Image-Figure-Feature ist zurückgerollt und unerledigt — wegen Pandoc-Version-Inkompatibilität mit pandoc-crossref.
Plugin-Architektur (Kurzfassung)
Zwei Hälften:
Obsidian-Plugin (TypeScript, in src/) — registriert zwei Commands („Export active note to PDF", „Build docker image with cache"), eine Settings-UI (Output-Path, Auto-Open-PDF, Preflight-Checks, Setup-Section mit Build-Button mit noCache: true). Spawnt Docker-Compose mit VAULT_PATH als ENV.
Docker-Pipeline (in pipeline/) — pandoc/extra:latest als Base, plus bash und einige tlmgr-Pakete. Vier Lua-Filter laufen in Reihenfolge: pdf.lua (Math-Compat), obsidian-transclude.lua (Embeds + Wikilinks + Map-basiertes Autoref), obsidian-inline.lua (Comments + Highlights), callouts.lua (Obsidian-Callouts → awesomebox), glossary.lua (Glossary-Refs). Plus pandoc-crossref als Filter, plus Eisvogel-Template, plus latexmk-Loop.
Bind-Mounts: /vault (read-only Vault), /app (read-only Plugin-Pipeline-Folder), /build (writable Intermediates + finale PDF, intentional persistent für Debugging — Plugin kopiert die finale PDF zum konfigurierten Output-Path).
Was funktioniert (stabil getestet)
![[Note]], ![[Note#Heading]], ![[Note#^block-id]] — voller und sliced Note-Embed mit korrekter Slice-Logik (bis zum nächsten Heading gleicher/höherer Ebene). Block-IDs werden beim Embed gestrippt + gelabelt.
[[Note]], [[Note|Display]], [[Note#Heading]], [[Note#^id]] — Wikilink-Auflösung über eine Map die beim Embed gefüllt wird. Default-Display → \hyperref[label]{display}, custom display funktioniert. Note-Refs auf nicht-eingebettete Notes fallen graceful als Plain-Text durch (für „Denkprozess-Verweise" die nicht im PDF landen sollen).
latex-env: theorem Frontmatter — eine Note mit diesem Frontmatter wird beim Voll-Embed in \begin{theorem}[short]\label{note:X}...\end{theorem} gewrapped. Wikilinks darauf mit Default-Display nutzen \autoref → „Theorem N". Custom-Display bleibt \hyperref.
%%text%% Comments (auch multi-block über Leerzeilen hinweg), ==text== Highlights (paragraph-scoped, unbalanced wird literal reverted), in obsidian-inline.lua.
Mehrfach-Embed der gleichen Note → wird mit inline-Hinweis abgelehnt („Bereits eingebettet — bitte mit [[X]] referenzieren").
Was offen / abgebrochen ist
1. Image-Figure-Feature
Konzept ist: ![[Bild.png|Caption]] → nummerierte Figure mit Caption, [[Bild.png]] → \autoref{fig:...} → „Abbildung N" klickbar.
Implementation war drin (Branch register_image_figure in transclude.lua, Helper figure_image_with_caption), aber zurückgerollt. Zwei Hindernisse:
Pandoc 3.9.0.2 emit kein \label{} aus Figure.attr.identifier. Mein Identifier-Setting via pandoc.Attr() wirkte nicht.

Test-Dateien im Vault
ExampleFiles/Theorem-Pythagoras.md — Atomic-Note mit latex-env: theorem Frontmatter.
ExampleFiles/env-test.md — Demonstriert Theorem-Embed, Default-Wikilink (autoref), Custom-Display-Wikilink (hyperref).
ExampleFiles/image-test.md — Test-Cases für Image-Feature (aktuell broken, siehe oben).
ExampleFiles/slice-source.md — Quell-Note für Slice-Tests.
ExampleFiles/Testdokument.md, ExampleFiles/Testdokument-minimal.md — User-eigene Tests.
ExampleFiles/HelperFiles/ — User hat dort die Bilder rein verschoben (neuron.excalidraw.png etc.). Resource-Path-Discovery in build.sh findet die.
Plugin-Internals — kurzer Reference
Wikilink-Map in transclude.lua:
available_targets[key] = label registriert jeden erreichbaren Anker. Keys: Note, Note#Heading-Text (case-sensitive), Note#^block-id. Values sind LaTeX-Label-Strings (note:X, note:X:sec-Heading, note:X:blk-id).
autoref_targets[notename] = true markiert ein Target als „benutzt LaTeX-Counter" (aktuell nur Theorem-Notes mit latex-env Frontmatter, später Image-Figures).
embedded_keys[notename..#..anchor] verhindert Mehrfach-Embeds.
Pandoc(doc) läuft in zwei Phasen: erst process_blocks (befüllt Map und expandiert Embeds), dann pandoc.walk_block(Div(...), {Link = resolve_wikilink}) für die Resolution.
Debugging-Workflow
Lua-Filter sind Bind-Mount — Änderungen wirken bei jedem Export, kein Docker-Image-Rebuild nötig.
Template (eisvogel.tex) ist Bind-Mount — gleiches.
Image-Rebuild nötig nur bei Änderungen an Dockerfile, neuen tlmgr-Paketen oder Pandoc-Version-Wechseln. Über Settings → „Build image" (Force-Rebuild mit --no-cache) oder Command Palette → „Build docker image (with cache)" (incremental).
pipeline/build/<docname>/ enthält Intermediates (.tex, .log, .aux, etc.) — bewusst persistent. Bei Pipeline-Bugs: .tex-File anschauen ist meist der schnellste Diagnoseweg.
pipeline/build/last_latex_run.log + last-build.log enthalten den vollen stderr von Pandoc + latexmk bzw. Docker-Build.
io.stderr:write(...) in Lua-Filtern ist der Standard-Debug-Mechanismus — landet in last_latex_run.log.
Empfohlene erste Schritte im nächsten Chat

Template-Bug fixen: \@ifpackageloaded durch \IfPackageLoadedTF ersetzen (cleaner, kein makeatletter nötig). Erstmal verifizieren dass damit Testdokument-minimal.md clean durchläuft.
Pandoc-Version im Base-Image pinnen oder Pandoc-crossref-Strategie entscheiden.
Erst dann Image-Figure-Feature angehen — entweder über Crossref (wenn Versionen passen) oder über Custom-RawBlock-Figure (wenn nicht).
Tabellen-Numbering und Refs (Pendant zum Image-Feature für Table-Blocks) bleibt offen für später. Wenn du das als HANDOVER.md im Plugin-Root oder Vault-Root abgelegt haben willst, sag Bescheid wohin — ich kann's für dich anlegen