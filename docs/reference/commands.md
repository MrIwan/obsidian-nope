# Commands

| Command | What it does |
| --- | --- |
| **Export active note to PDF** | The main command. Runs the pipeline and copies the PDF to the output path. |
| **Open PDF preview** | Live preview pane that re-renders on save. The toolbar has editor→PDF sync. Ctrl/Cmd-click follows in both directions. |
| **Toggle click-to-open in PDF preview** | While active, clicking into the PDF opens the note rendered at that spot. |
| **Add structured note** | Fuzzy picker: scaffolds an atomic note (table, base table, theorem, lemma, definition, proof, mermaid, equation, glossary term, abbreviation) and inserts its embed at the cursor. With text selected, the selection becomes the note body. |
| **Create branding template** | Scaffolds a pre-filled branding note. |
| **Create custom LaTeX template** | Copies `nope_minimal.tex` into the vault as a starting point. |
| **Create example main document** | Scaffolds a main document. |
| **Build docker image (with cache / no cache)** | Manual image build. Normally automatic. |
| **Remove docker image** / **Cleanup build folder** | Maintenance. Cleanup also resets the [package tree](../styling/tlmgr.md). |
| **Install AI conventions skill** | Pushes the authoring-conventions skill into the vault for AI assistants. |
