# Citations & bibliography

Two ways to cite: a classic `.bib` file (`bibliography:` + optional `csl:`), or **citation atoms**: one note per source with a `citekey` and bibliographic frontmatter, referenced with a plain `[[wikilink]]`. Both feed the same reference list. Standard Pandoc syntax (`[@key]`, `[@key, p. 42]`) works throughout.

[Open PDF](../assets/pdf/feature-citations.pdf){ .md-button }

**Source notes**

=== "feature-citations.md"

    ````markdown
    --8<-- "example-vault/features/feature-citations.md"
    ````

=== "cite-backprop.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/cite-backprop.md"
    ````

=== "nope.bib"

    ````bibtex
    --8<-- "example-vault/example-document/helper-files/nope.bib"
    ````
