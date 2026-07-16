# Inline markup & comments

Obsidian-flavoured inline syntax survives the export: `%%text%%` becomes an invisible comment (works across blank lines) and `==text==` becomes a highlight. Unbalanced markers are kept literally instead of breaking the build.

[Open PDF](../assets/pdf/feature-markup.pdf){ .md-button }

**Source notes**

=== "feature-markup.md"

    ````markdown
    --8<-- "example-vault/features/feature-markup.md"
    ````
