# Contributing

## Where things live

Three doors, one chain. This file is the contributor door. `README.md` is the user door. `AGENTS.md` is the door for an AI assistant. They point at the same places.

- `ARCHITECTURE.md`: the internals. A map into the code, the cross-file invariants, the design decisions.
- `skill/SKILL.md`: the authoring conventions a user writes against.
- The [wiki](https://mriwan.github.io/obsidian-nope/) built from `docs/`: the user-facing feature documentation.
- The code itself: every source file opens with a header docstring. Functions carry their contract. This is the source of truth for how something works. See Comments and docstrings below.

## Example vault

`example-vault/` is a complete Obsidian vault with a worked example for every core feature. Open it in Obsidian to try changes against real documents, or point the vault at your local plugin build via a symlink. Setup and the symlink recipe are in [`example-vault/README.md`](example-vault/README.md).

The same vault is the source for the pipeline tests and the example PDFs embedded in the docs, so keep the example documents building when you touch a feature.

## Running the tests

The pipeline tests export the example vault headlessly and assert on the generated LaTeX. Run the full suite or filter by path:

```bash
tests/run-tests.sh            # all cases
tests/run-tests.sh Tables     # only cases whose path contains "Tables"
```

They need the `nope` pipeline image and run on every push in CI. What each case checks and how to add a new one, is documented in [`tests/README.md`](tests/README.md).


## Building the docs locally

The documentation site is [MkDocs Material](https://squidfunk.github.io/mkdocs-material/). It runs entirely in Docker, so you do not need Python installed.

Serve the site with live-reload:

```bash
scripts/preview-wiki.sh
```

Then open http://127.0.0.1:8000. Every change to a file under `docs/` reloads the page.

The script builds the `nope-wiki` image from `Dockerfile.wiki` and mounts the repo into the container.

### Example PDFs

The feature pages embed example PDFs exported through the real pipeline. These assets are generated, not committed, so a fresh checkout shows empty embeds until they are built once:

```bash
scripts/preview-wiki.sh --assets
```

This runs `scripts/build-wiki-assets.sh` first, then serves. The export needs the `nope` pipeline image (Docker only, no other tools). Once the PDFs exist under `docs/assets/pdf/`, plain `scripts/preview-wiki.sh` picks them up.


## Developing the plugin

The plugin is TypeScript in `src/`, bundled to `main.js` by esbuild. It is desktop-only (`isDesktopOnly: true`) and uses Node and Electron, so there is no mobile target and no mobile guards. Docker is required at runtime, the export spawns Docker Compose and pulls a prebuilt image. `minAppVersion` is 1.11.0, pinned by `SettingGroup.listEl`, do not raise it without a concrete reason.

### Setup

Install with `npm install`. Dev watch with `npm run dev`. Production build with `npm run build`. `npm run lint` must be clean before you finish. `eslint-plugin-obsidianmd` enforces sentence case and `no-unsupported-api`.

### Lint and build traps

- No `@types/node`. Node types are ambient in `src/node-modules.d.ts`. `"types": []` in tsconfig mirrors the community review scanner which does not resolve `@types/*`. Never reinstall it, add a new Node API to the stub. The rationale is in `ARCHITECTURE.md`.
- `lib` is ES2020 for the same scanner reason.
- `activeDocument` and `activeWindow` are registered as globals in `eslint.config.mts`. Use them, not `document` or `window`, so popout windows work.
- `src/generated/` is lint-ignored. The import stays type-safe through the committed `bundled-assets.d.ts`.
- `no-unsupported-api` checks every Obsidian API against its `@since` versus `minAppVersion`.

### NOPE-specific rules

- No hardcoded styles. Use CSS classes in `styles.css` bound to Obsidian variables, which keeps `styles.css` a release asset.
- Settings live in two code paths that must both be patched: `getSettingDefinitions()` and the `display()` fallback.
- The only outbound action is the Docker image pull, the documented core mechanism. No analytics, no vault content leaves the machine.
- Release: bump `version` in `manifest.json`, map it in `versions.json`, tag matching the version with no leading `v`. CI builds the pipeline image on that tag.

### Obsidian guidelines

Everything else is standard Obsidian plugin practice: module structure with a lean `main.ts`, bundling into `main.js`, `this.app` with the `this.register*` cleanup helpers, `async/await`, stable command IDs, `loadData`/`saveData`, sentence-case UI copy, no hidden telemetry. Follow the official sources, do not keep a copy here:

- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Developer policies](https://docs.obsidian.md/Developer+policies)
- [API documentation](https://docs.obsidian.md)

## Publishing

The wiki and the pipeline image are published by CI on version tags. `mike` deploys the wiki to the `gh-pages` branch (versioned, so the site shows the last release). `docker-image.yml` builds the image to GHCR.

Release, in order:

1. Check the plugin passes the review on community.obsidian.md.
2. Bump the version with `npm version <x.y.z>`. The `version` script runs `version-bump.mjs`, which syncs `manifest.json` and `versions.json`. `.npmrc` sets `tag-version-prefix=""`, so the git tag carries no leading `v`. This creates the version commit and the tag locally.
3. `git push` the commit.
4. `git push origin <x.y.z>` to push the tag. The tag triggers CI: `docker-image.yml` builds the GHCR image, `wiki.yml` deploys the wiki, `release.yml` opens a draft release.
5. Wait for `docker-image.yml` to go green. The default image pull only works once an image exists for that version.
6. Publish the draft release.
7. Final community review. Then the community Review on community.obsidian.md can be requested.

## Conventions

### When you change a feature

Responsibilities are split. Keep them separate.

- User-visible change (a frontmatter key, a command, embed or wikilink syntax, filter behavior the user sees): patch the skill at `skill/SKILL.md` and the matching wiki page under `docs/`. The README stays a shop window, nothing new lands there.
- Implementation-only change (a rename, a code move, an internal filter phase): patch the file header docstring. Patch `ARCHITECTURE.md` too if a cross-file invariant or a design decision changed.

The example vault carries one document per feature. Keep it building when you touch a feature. The wiki pages inline these documents, so the docs stay in sync automatically. The `feature-*.md` files hold only the application, no mechanics and no "expected output". The mechanics live in the wiki, the authoring conventions in the skill. When you bump a feature, pull `nope-version` and `last-updated` in the skill frontmatter along.

### Prose style

Plain English, short sentences. No Oxford comma, so write "a, b and c" not "a, b, and c". No semicolons. Em dashes only in rare cases, prefer two sentences. In lists write "Label: description" or "**Label.** description", not the dash form. An en dash in a number range like "1 to 3 minutes" is fine. No emojis in the docs or README. Release notes stay short, one or two crisp sentences per point.

### Comments and docstrings

The code is the source of truth for how something works. Comments carry what and why, never a step-by-step retelling of the how.

- File header: every source file (Lua filter, TS module) opens with a header docstring. What the file does, its responsibility, where it sits in the pipeline or the plugin lifecycle. Lua uses an LDoc-style `---` block, TS uses a TSDoc `/** */` block.
- Public surface: an exported or public function carries a docstring stating its contract. What it does, its inputs, its return, its side effects. Skip trivial internal helpers.
- Inline: a one-line comment at a non-obvious spot states the why, the motivation, not the mechanics.
- Do not narrate the how in prose. Length is not the rule, necessity is. A three-line contract is fine, a paragraph retelling the algorithm is not.
- Cross-file invariants like "these two sites must stay in sync" live canonically in `ARCHITECTURE.md`. A header may point to them, it does not copy them.

There is no stored function index anywhere. A file's API is its docstrings, so an overview is generated on demand, never maintained by hand. In an editor, the symbol outline (the Lua language server, the TS language server) lists a file's functions and shows the docstring on hover. From the CLI the `---` blocks in Lua and the `/** */` blocks in TS are greppable, so `rg '^\s*---' pipeline/app/filters` finds the doc lines. To pair each documented function with its docstring:

```sh
awk '
  /^---/ {buf=$0; b=1; next}
  b && /^--/ {buf=buf ORS $0; next}
  b && /^(local )?function/ {print buf ORS $0 ORS; b=0; next}
  b {b=0; buf=""}
' pipeline/app/filters/obsidian-transclude.lua
```
