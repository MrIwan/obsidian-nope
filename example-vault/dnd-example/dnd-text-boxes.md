# Text Boxes

The template has three environments for setting text apart so that it is drawn to the reader's attention. In NOPE they map onto ordinary Obsidian callouts: `[!quote]` becomes read-aloud text, `[!tip]` a sidebar and every other type a comment box.

> [!quote]
> As you approach this module you get a sense that the blood and tears of many generations went into its making. A warm feeling welcomes you as you type your first words.

## As an Aside

The other two box styles are the comment and the sidebar. The comment is breakable and can safely be used inline in the text.

> [!note] This Is a Comment Box!
> A comment is a box for minimal highlighting of text. It lacks the ornamentation of the sidebar, but it can handle being broken over a page.

In the original the sidebar floats toward a page corner; in this single-column rebuild it sits inline.

> [!tip] Behold the Sidebar!
> The sidebar is used as a sidebar. In the two-column original it does not break over columns and is best floated to one corner of the page where the surrounding text can then flow around it.

## Tables

The original `DndTable` colors the even rows and is set to the width of a line by default. In NOPE a table is an atomic note with `latex-env: table`:

![[dnd-table-nice]]
