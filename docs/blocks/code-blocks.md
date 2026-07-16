# Code blocks & stat blocks

Fenced code blocks dispatch on their identifier. A ` ```latex ` fence passes raw LaTeX straight into the PDF. Identifiers declared via `nope-blocks:` render as template environments fed by YAML-lite `key: value` bodies. Everything else stays an ordinary code fence.

The flagship use case: a ` ```statblock ` fence in [Fantasy Statblock](https://plugins.javalent.com/statblocks) syntax renders live in Obsidian **and** exports as a typeset 5e stat block, from the same source. Lists (`traits:` with `- name:`/`desc:` items) map to numbered `\nope<key><N>-<subkey>` commands. Ability modifiers are computed at export.

[Open PDF](../assets/pdf/dnd-example.pdf){ .md-button }

**Source notes**

=== "dnd-monsters.md"

    ````markdown
    --8<-- "example-vault/dnd-example/dnd-monsters.md"
    ````

=== "dnd-example.md"

    ````markdown
    --8<-- "example-vault/dnd-example/dnd-example.md"
    ````
