# Nope — Example Vault

A complete, ready-to-open Obsidian vault with worked examples for every core
feature of the **Nope** plugin (Markdown → PDF via Pandoc + LaTeX).

## Opening

1. Open this folder (`example-vault/`) in Obsidian (*Open folder as vault*).
2. Make the **Nope** plugin available to the vault — pick one:
   - **From the Community Store** — install (or enable) Nope like any other
     community plugin.
   - **From a cloned repo** — create a symlink so the vault uses your local
     build (see [Creating a symlink](#creating-a-symlink)).
3. Enable Nope under *Settings → Community plugins*. For the base examples,
   also enable the core **Bases** plugin (Obsidian ≥ 1.10).
4. Open a document and export it, or use the live PDF preview.

## Creating a symlink

Use this if you cloned the repo and want the vault to load Nope straight from
your **local build** — every rebuild is picked up, with no copying.

Obsidian looks for plugins in `<vault>/.obsidian/plugins/<id>/`. We point a
`nope` link there at the repo root, which already holds `manifest.json` and the
built `main.js`.

Build the plugin once in the repo root, then create the link from the
`example-vault/` root:

```bash
# in the repo root: produce main.js
npm run build

# in example-vault/: link the plugin folder to the repo root
mkdir -p .obsidian/plugins
ln -s ../../.. .obsidian/plugins/nope
```

- The link name **must** be `nope` — it has to match the plugin `id` in
  `manifest.json`.
- `../../..` is resolved from the link's location (`.obsidian/plugins/`) and
  points three levels up to the repo root.
- After each rebuild, reload the plugin in Obsidian (toggle it off/on, or run
  *Reload app without saving*) so the new `main.js` is loaded.


