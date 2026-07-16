# nope 0.7.0

Fenced code blocks now export. The image hash changes, so the first export rebuilds once.

## New

- **Raw LaTeX blocks.** A ` ```latex ` fence goes into the PDF unchanged. Good for one-off constructs like a `\dirtree{…}` tree. A typo aborts the build with a normal LaTeX error. The fence is only for convenience. Plain LaTeX commands written straight into the text are passed through the same way.
- **Custom code blocks via `nope-blocks`.** Two steps. First declare the identifier in the frontmatter (`nope-blocks: [statblock]`) so the pipeline expects that environment in the `.tex`. Then define the matching environment in your `.tex` template. Each `key: value` line becomes a `\nope<key>` command.
- **Per-document LaTeX packages via `nope-tlmgr`.** List packages in the frontmatter (`nope-tlmgr: [cancel, pgfplots]`). The export installs missing ones into a persistent TeX tree. First run downloads, later runs reuse them.
- **Documentation site.** The [NOPE wiki](https://mriwan.github.io/obsidian-nope/) documents every feature. It is built by the pipeline on each release and versioned.

## Changed

- **"Extra LaTeX packages" setting removed.** Package needs now live in the document via `nope-tlmgr`. Add a `nope-tlmgr:` line where you need them.
- **Leaner image builds.** User packages no longer trigger an image rebuild.

# nope 0.6.1

## New

- **Restyle NOPE defaults from a template.** Callouts, fit tables, highlights and header logos render through overridable LaTeX names: `nopecallout`, `nopefittable`, `\nopehl`, `\nopelogo`. Define them to restyle. Defaults apply otherwise.

## Fixes

- **TeX Live 2026 broke image builds.** tlmgr now installs from the frozen historic repo for the image's year. Pinned images stay buildable.
- **Task-list checkboxes are kept.** ☐/☑/☒ are no longer stripped. For custom templates from before 0.6.1, add `\usepackage{amsmath,amssymb}` to the `NOPE-IMPORTS` block.

# nope 0.6.0

The pipeline image now comes prebuilt from GHCR. First setup drops from a 5–15 minute build to a 1–3 minute pull. The image is pulled automatically on the first export after the update.

## New

- **Prebuilt pipeline image.** Every release ships a multi-arch image at `ghcr.io/mriwan/nope-pipeline:<version>` (amd64 and arm64, native on Apple Silicon). The plugin pulls it by default.
- **"Use prebuilt image" toggle** (Settings → Docker, on by default). Turn it off to build locally from the shipped Dockerfile.
- **"Image tag override" setting.** Pin a specific image tag. Leave empty to use the plugin version.
- **Build provenance attestation.** Verify with `gh attestation verify oci://ghcr.io/mriwan/nope-pipeline:0.6.0 -R MrIwan/obsidian-nope`.

## Changed

- **Extra LaTeX packages apply faster.** In prebuilt mode they install as a thin layer on the pulled image.

# nope 0.5.0

The pipeline runs standalone, mermaid needs no browser, every export path is tested.

## New

- **Extra LaTeX packages.** A new setting lists tlmgr packages, installed as an extra image layer. Demo in `example-vault/minimal-latex/`.
- **Per-feature example docs and tests.** `example-vault/features/` holds one doc per feature. `tests/run-tests.sh` exports them headless and checks the output. Runs on every push.

## Changed

- **Mermaid renders without a browser.** [merman](https://github.com/Latias94/merman) replaces mermaid-cli, Puppeteer and Chromium. Ends the "Failed to launch the browser process" errors and likely fixes mermaid on Windows.
- **Pipeline resolves vault references itself.** Templates, branding, bibliography and citation notes are resolved inside the container (`nope-prepare.lua`). Only Bases still need Obsidian. The pipeline runs standalone with `docker compose run pipeline <doc>.md`.
- **One "Add structured note" command.** The ten scaffold commands merge into one fuzzy picker. Re-assign hotkeys from the old commands.

## Fixes

- **Umlauts in folder names work again.** The container now forces `C.UTF-8`, so embeds in folders like `Geschäftsbericht/` resolve.
- **Highlights with umlauts no longer crash.** Templates now load `soulutf8`.

# nope 0.4.3

## Fixes

- **Mermaid rollback of 0.4.2.** mermaid-cli is pinned to 10.9.1.

# nope 0.4.2

## Fixes

- **Node 22 in the pipeline image.** Installed via NodeSource. Current mermaid-cli needs Puppeteer 25 (Node ≥22). mermaid-cli is pinned to major 11.

# nope 0.4.1

## Fixes

- **Mermaid on Windows.** Added `--disable-gpu` and `--disable-dev-shm-usage` for wsl2.

## Docs

- **Callouts example cleaned up.** Removed a leftover comparison table.

# nope 0.4.0

## New

- **Click the PDF, land in the note.** A preview toolbar toggle. Click anywhere in the PDF to open the note rendered there in the last active editor. The nearest anchor above the click decides, so embeds, heading slices, tables, equations and mermaid open their source at the right spot. Title page and TOC open the main document. Also a command, "Toggle click-to-open in PDF preview".
- **"Follow on Ctrl/Cmd+click" setting.** Both sync directions on demand. Mod-click in a note scrolls the PDF. Mod-click in the PDF opens the note. On by default.
- **One-shot sync button in the toolbar.** One click scrolls the PDF to the cursor position.

## Changed

- **"Follow editor" auto mode removed.** Use the explicit buttons instead.
- **"Sync PDF preview to editor" command removed.** Replaced by the toolbar button and Ctrl/Cmd+click.

# nope 0.3.5

## Fixes

- **Updates reach Obsidian 1.11 and 1.12 again.**

# nope 0.3.4

## Fixes

- **`@types/node` replaced with `node-modules.d.ts`.** The [eslint-plugin](https://github.com/obsidianmd/eslint-plugin) does not resolve `@types/node`.

## Changed

- **`book: true` maps headings to the book structure.** `#` becomes a part, `##` a chapter, `###` a section. Plain `article` keeps `#` as a section. TOC and abstract render in book mode.
- **One switch for all numbering.** `numbersections: true` numbers headings and turns wikilinks to embedded headings into numbered cross-references. Set it to `false` for plain jump links. Tune depth with `secnumdepth:`.

## Docs

- **New "Book Example".**
- **New "Lists" example.** The Example Document now shows plain-Markdown lists.

# nope 0.3.3

## Improvements

- **Settings are searchable.** Migrated to Obsidian's declarative settings API. Minimum Obsidian version is now 1.13.0.
- **PDF preview renders immediately.**

## Fixes

- **Base embeds with `file.hasLink(this)` work on export.** `this` is now frozen into the query, so the export matches the live view.

# nope 0.3.2

## Maintenance

- **Fixed spurious type errors in the Obsidian Community review.** The type-checked rules flooded the audit with `no-unsafe-*` warnings because the audit runs without `node_modules`. Those rules are now disabled in `eslint.config.mts`. Development-only. See the [forum thread](https://forum.obsidian.md/t/plugin-audit-reports-spurious-type-errors-because-it-doesnt-resolve-obsidian-types/115198).

# nope 0.3.1

## Security

- **pdf.js updated (3.11 → 4.7.76).** Closes an advisory where a crafted PDF could run arbitrary JavaScript (`GHSA-wgrm-67xf-hhpq`).

## Maintenance

- **Lint toolchain aligned with the Obsidian review.** Bumped `eslint-plugin-obsidianmd` to 0.3.0. Development-only.

## Changed

- **UI wording.** A few command and notice strings reworded for sentence case.

# nope 0.3.0

## New

- **Numbered chapter and section cross-references (`numbersections`).** With `numbersections: true`, wikilinks to embedded headings resolve to numbered `\autoref` references. The same switch numbers the headings, so they stay in sync.
- **`book: true` support.** Added fallbacks for the book class (`\frontmatter`/`\mainmatter`/`\backmatter`, a chapter counter, an abstract environment).
- **"Open build folder" button.** The preview error banner jumps to `pipeline/build`, where the LaTeX logs live.

## Docs

- **Custom LaTeX environments in the skill.** `SKILL.md` documents non-built-in `latex-env` values: define the environment in a template, wire it with `nope-template`, use `\providecommand{…autorefname}`.
- **Numbered cross-reference docs and demo.** Documented in `SKILL.md` and the README. Demo in `example-vault/book-example/`.
- **example-vault added to the repo.**
