# Sections

This template is designed to aid you in writing beautifully typeset documents for the fifth edition of the world's greatest roleplaying game. It starts by adjusting the section formatting from the defaults in LaTeX to something a bit more familiar to the reader.

## Section

Sections break up chapters into large groups of associated text.

### Subsection

Subsections further break down the information for the reader.

#### Subsubsection

Subsubsections are the furthest division of text that still have a block header. Below this level, headers are displayed inline.

## Special Sections

The original template ships helper commands for multi-line section headers: feats, magic items and spells. In NOPE these become **atomic notes** with a `latex-env` (`dndfeat`, `dnditem`, `dndspell`) whose frontmatter keys feed the header — the note body is the description:

![[dnd-feat-typesetting-savant]]

![[dnd-item-foos-quill]]

![[dnd-spell-beautiful-typesetting]]

## Map Regions

The map region commands `\DndArea` and `\DndSubArea` provide automatic numbering of areas. They are defined in the custom template and called through plain ` ```latex ` blocks in the flowing text:

```latex
\DndArea{Village of Hommlet}
```

This is the village of Hommlet.

```latex
\DndSubArea{Inn of the Welcome Wench}
```

Inside the village is the inn of the Welcome Wench.

```latex
\DndSubArea{Blacksmith's Forge}
```

There's a blacksmith in town, too.

```latex
\DndArea{Foo's Castle}
```

This is foo's home, a hovel of mud and sticks.

```latex
\DndSubArea{Moat}
```

This ditch has a board spanning it.

```latex
\DndSubArea{Entrance}
```

A five-foot hole reveals the dirt floor illuminated by a hole in the roof.
