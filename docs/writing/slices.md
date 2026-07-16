# Slices & block embeds

You do not have to embed whole notes. `![[Note#Heading]]` embeds a slice from a heading to the next heading of equal or higher level. `![[Note#^block-id]]` embeds from a block id. Missing anchors degrade gracefully instead of crashing the export.

[Open PDF](../assets/pdf/feature-slices.pdf){ .md-button }

**Source notes**

=== "feature-slices.md"

    ````markdown
    --8<-- "example-vault/features/feature-slices.md"
    ````

=== "slice-source.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/slice-source.md"
    ````

=== "slice-para.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/slice-para.md"
    ````

=== "slice-full.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/slice-full.md"
    ````
