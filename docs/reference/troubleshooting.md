# Troubleshooting

## Where is the real error?

The preview banner already shows the first LaTeX error line (starting with `!`). The full story lives in the plugin folder under `pipeline/build/`:

| File | Contents |
| --- | --- |
| `build/<doc>/<doc>.log` | Full pdflatex log. Search for the first line starting with `!`. |
| `build/<doc>/build_sh.log` | The whole pipeline run (pandoc + latexmk). |
| `build/last-build.log` | Docker **image** build log (only relevant when the image build fails). |

`Latexmk: Problematic refs and citations` and `multiply defined` are **warnings**. Keep reading to the `!` line.

## Common causes

- **Missing `caption:`** on a `latex-env: table` or `mermaid` note. This is a hard error by design.
- **A ` ```latex ` fence with a typo**. Raw LaTeX is passed through unchecked.
- **A missing package**. Declare it via [`nope-tlmgr`](../styling/tlmgr.md) instead of guarding template code.
- **Emoji in notes** are stripped with a notice (pdflatex cannot typeset them). Greek letters and math symbols are mapped automatically.

## Reproducing without Obsidian

The whole pipeline runs headless, which is useful to share a failing case:

```bash
cd <vault>/.obsidian/plugins/nope/pipeline
VAULT_PATH="/absolute/path/to/vault" docker compose run --rm pipeline "Folder/Document.md"
```

Errors print a `>>> NOPE-ERROR: …` line naming the cause. Bases embeds need the Obsidian API and stay empty in standalone runs.

## Docker not found

Settings → Docker runs a preflight chain (CLI → daemon → image) and pinpoints the failing step. GUI apps do not inherit your shell `PATH`. If you use colima or OrbStack, set the Docker path override (the auto-detect button finds common locations).
