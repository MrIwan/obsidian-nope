# Theorems & environments

`latex-env: theorem` (or `lemma`, `definition`, `corollary`, `proposition`, `example`) wraps a note in the matching amsthm environment with its **own counter**. A wikilink to it reads "Lemma 1.2", not just "Theorem". `proof`, `remark` and `note` stay unnumbered. Any other value becomes a custom environment defined in your template, including per-note metadata via `\nope<key>` commands.

[Open PDF](../assets/pdf/feature-environments.pdf){ .md-button }

**Source notes**

=== "feature-environments.md"

    ````markdown
    --8<-- "example-vault/features/feature-environments.md"
    ````

=== "thm-pythagorean-theorem.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/thm-pythagorean-theorem.md"
    ````
