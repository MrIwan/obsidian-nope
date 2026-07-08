# Pipeline tests

Headless export tests against the example vault. Two levels:

- **Feature level** — `example-vault/Features/Feature-*.md`: one small document per feature, each just frontmatter + embeds of the existing `HelperFiles` notes. Precise failure localization, and users can export them individually as living documentation.
- **Integration level** — `Example Document`, `Example Custom LaTeX`, `Book Example`: cross-feature interactions (counters across embeds, glossary + citeproc, branding, book mode) that no single-feature document exercises.

## How a test works

`run-tests.sh` reads `manifest.txt` and, per case:

1. exports the document via `docker compose run` into a fresh throwaway build root (`pipeline/build/test-run-<ts>-<pid>/` via `NOPE_BUILD_PATH`).
2. asserts: exit code 0, non-empty PDF, all `must=` strings present and all `must-not=` strings absent in the generated `.tex`, no `undefined references` in the LaTeX log

## Running

```bash
tests/run-tests.sh            # all cases (~1 min with a built image)
tests/run-tests.sh Tables     # only cases whose path contains "Tables"
```

Requires the `nope` Docker image. `NOPE_TEST_VAULT` overrides the vault (default: `example-vault`). CI runs the suite on every push (`.github/workflows/pipeline-tests.yml`, image layer-cached. logs uploaded as artifact on failure).

## Adding a test

1. Create a document in `example-vault/Features/` — reuse existing `HelperFiles` notes via embeds; the basename must be vault-unique (hence the `Feature-` prefix).
2. Add a manifest block:

   ```
   [Features/Feature-X.md]
   must=<string that proves the feature rendered>
   must-not=[Not found:
   ```

   Strings are fixed (grep -F), matched against the `.tex`. Mind pandoc's escaping: `[`/`#` appear as `{[}`/`\#` — assert on unescaped fragments.

## Not covered

Bases (need the Obsidian API), the plugin UI/preview, and visual fidelity (mermaid/layout changes need an eyeball on the PDF).
