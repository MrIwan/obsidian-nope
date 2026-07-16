# Branding

One branding note per **document type**: a thesis, a client report, a campaign book. It holds colors, title page, header and footer logos and geometry. Apply it to any document via `nope-branding: "[[Branding-Note]]"`. Logo wikilinks in header/footer slots expand automatically. Precedence is document frontmatter over branding over defaults.

!!! tip "Need more than frontmatter can express?"
    A branding note tunes the built-in look through frontmatter keys. For structural changes — custom LaTeX environments, restyled callouts, your own page layout — reach for a [custom LaTeX template](templates.md). Branding and templates combine: point a document at both.

[Open PDF](../assets/pdf/feature-branding.pdf){ .md-button }

**Source notes**

=== "feature-branding.md"

    ````markdown
    --8<-- "example-vault/features/feature-branding.md"
    ````

=== "branding-template.md"

    ````markdown
    --8<-- "example-vault/example-document/helper-files/branding-template.md"
    ````
