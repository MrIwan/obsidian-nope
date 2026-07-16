# Contributing

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

