# Code blocks & stat blocks

Fenced code blocks dispatch on their identifier. A ` ```latex ` fence passes raw LaTeX straight into the PDF. Identifiers declared via `nope-blocks:` render as template environments fed by YAML-lite `key: value` bodies. Everything else stays an ordinary code fence.

!!! note "Inline LaTeX works too"
    The ` ```latex ` fence is only for convenience. LaTeX commands written straight into the running text are passed through the same way (for example a bare `\newpage`). The fence just keeps larger raw blocks readable and stops Markdown from touching them.

One use case: a ` ```statblock ` fence in [Fantasy Statblock](https://plugins.javalent.com/statblocks) syntax renders live in Obsidian **and** exports as a typeset stat block, from the same source. Lists (`traits:` with `- name:`/`desc:` items) map to numbered `\nope<key><N>-<subkey>` commands.

Setting up a custom block takes two steps:

1. Declare the identifier in the frontmatter (`nope-blocks: [statblock]`). The pipeline then knows the fence maps to a LaTeX environment of that name.
2. Define that environment in your custom `.tex` template. Each `key: value` line from the fence is available inside it as a `\nope<key>` command.
