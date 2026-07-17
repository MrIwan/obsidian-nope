# NOPE architecture

The developer view and a map into the code. For the conventions a user writes against, see the skill at `skill/SKILL.md` and the [wiki](https://mriwan.github.io/obsidian-nope/). The rule of thumb: the skill and the wiki describe what the user writes and observes, this document describes how the pipeline is built and where in the source each piece lives.

Every source file opens with a header docstring stating what it does. This file does not repeat that. It gives the shape of the system, points you at the right files. It records the things that live between files: the cross-file invariants and the design decisions.

## Pipeline overview

Two parts. A TypeScript plugin in `src/` runs inside Obsidian. It registers the commands, the settings UI and the preview. It also spawns the pipeline. A Docker pipeline in `pipeline/` does the conversion, built on `pandoc/extra` with Pandoc pinned to 3.9.x plus a Rust-built Mermaid renderer and a set of tlmgr packages.

The export runs in stages orchestrated by [`build.sh`](pipeline/app/scripts/build.sh). Its header documents the stage order.

Bind mounts, declared in [`docker-compose.yml`](pipeline/docker-compose.yml): `/vault` read-only, `/app` the read-only pipeline folder, `/build` writable for intermediates and the PDF. The pipeline runs headless without Obsidian, which is how the tests reproduce a build. The one exception is Bases, which need the Obsidian API.

## Map: feature to source

To change or add a feature, open the file listed for it. The file header and the function docstrings tell you where inside. To list a file's functions with their docstrings, use your editor's symbol outline or the grep in CONTRIBUTING.

| Feature | File |
| --- | --- |
| Embeds, slices, wikilink resolution, auto-heading-shift, structured-block wraps (theorem, table, math, mermaid, tikz), frontmatter forwarding, image figures, glossary and citation refs, abstract | [`obsidian-transclude.lua`](pipeline/app/filters/obsidian-transclude.lua). Passive-embed rewrite also in [`build.sh`](pipeline/app/scripts/build.sh) |
| Callouts | [`callouts.lua`](pipeline/app/filters/callouts.lua) |
| Inline comments and highlights | [`obsidian-inline.lua`](pipeline/app/filters/obsidian-inline.lua) |
| Code fences (latex passthrough, declared blocks) | [`obsidian-codeblocks.lua`](pipeline/app/filters/obsidian-codeblocks.lua) |
| Emoji and pictograph stripping | [`strip-unsupported.lua`](pipeline/app/filters/strip-unsupported.lua) |
| Custom template, branding, bibliography, citation notes | [`nope-prepare.lua`](pipeline/app/filters/nope-prepare.lua). tlmgr install and citeproc flags in [`build.sh`](pipeline/app/scripts/build.sh), repo resolution in [`tlmgr-repo.sh`](pipeline/app/scripts/tlmgr-repo.sh) |
| Bases embeds | [`bases.ts`](src/utils/bases.ts) |
| Book mode | [`build.sh`](pipeline/app/scripts/build.sh) |
| Export lifecycle | [`export.ts`](src/utils/export.ts) |
| PDF preview, editor sync, click-to-open | [`preview.ts`](src/view/preview.ts). PDF anchors in [`pdf-anchors.ts`](src/utils/pdf-anchors.ts) |
| Docker detection, build, run, image freshness | [`docker.ts`](src/utils/docker.ts) |
| Settings tab and preflight | [`settings.ts`](src/settings.ts), [`preflight.ts`](src/utils/preflight.ts) |
| Progress notices, phase and timing parsing | [`progress.ts`](src/utils/progress.ts) |
| Commands (export, build, maintenance, scaffolds) | [`commands/`](src/commands) |
| AI conventions skill install | [`skill.ts`](src/utils/skill.ts), [`commands/maintenance.ts`](src/commands/maintenance.ts) |
| Bundled asset extraction | [`assets.ts`](src/utils/assets.ts), `src/generated/` |
| Template preamble (NOPE-IMPORTS) | `pipeline/app/template/nope_minimal.tex`, the Eisvogel template |

## Cross-file invariants

Genuinely cross-file. Change one, change the other. Single-file ordering and list constraints are not here, they live as a comment at the spot in the file that owns them.

- Passive-embed rewrite `+[[...]]` to `![[...]]` happens in `build.sh` (top-level file, via sed) and in `obsidian-transclude.lua` `load_note` (nested notes). The two-language split is inherent to where each file is read.
- The `%%% NOPE-IMPORTS %%%` block is duplicated in the Eisvogel template and `nope_minimal.tex`. A new `\DeclareUnicodeCharacter` goes in both. `nope_minimal.tex` must stay self-contained because users copy it as a custom-template starter.
- The scaffold templates in `env-templates.ts` mirror the filter's hard-error checks (`caption:` on table and mermaid, `gls-id` on glossary). The coupling is soft, the filter is the real enforcer.

The tlmgr historic-repo resolution used to be duplicated here. It now lives once in `pipeline/app/scripts/tlmgr-repo.sh`, sourced by both `build.sh` and the `Dockerfile`.

## Design decisions and rejected alternatives

No `nope.sty` package. Filters emit semantic markers and guard-inject the default definitions into `header-includes`, so the defaults travel with the filter and a custom template can override any name. A package would be a new dependency and would drift across the Eisvogel template, `nope_minimal.tex` and user copies.

Own theorem counter per type instead of a shared counter, because `\autoref` follows the counter and a shared one printed "Theorem N" for every type.

The historic tlmgr repo instead of CTAN, because CTAN only serves the current release and pinned images broke on the TeX Live year rollover.

merman instead of mermaid-cli, because Debian's chromium crashed headless on a fresh build and no launch flag fixed it. This also removed chromium, nodejs and npm from the image.

No `latex-documentclass` key and no Beamer. `book: true` already existed and only needed the right heading mapping. Beamer was dropped as too narrow a target with its own maintenance cost. The NOPE core features do not carry there.

No live log modal in the preview. It was implemented briefly and removed, raw LaTeX output does not help end users. The debug channel is the disk logs under `pipeline/build/`.

No `@types/node`. The community review scanner does not resolve `@types/*`, so ambient Node types live in `src/node-modules.d.ts` and `"types": []` in tsconfig mirrors the scanner. `lib` is ES2020 for the same reason.

The prepare pass runs in the container in `nope-prepare.lua`. The former TS modules for template, branding, bibliography and citations were deleted. Only `bases.ts` stays in TS because it needs the Obsidian API.

## Where build failures show up

`pipeline/build/<doc>/<doc>.log` is the full pdflatex log, the first line starting with `!` names the cause. `pipeline/build/<doc>/build_sh.log` is the full pipeline run. `pipeline/build/last-build.log` is the Docker image build. Latexmk's "problematic refs" and "multiply defined" are warnings, keep reading to the `!` line.

## Known issues

The PDF preview in a separate Obsidian popout window loses all glyphs and shows small boxes. The main-window preview is unaffected.
