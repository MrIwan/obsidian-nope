# Customization

The custom template provides several color variables in the spirit of the original package: `PhbLightGreen` (comment boxes), `PhbLightCyan` (sidebars), `PhbMauve`, `PhbTan` (read-aloud boxes) and the stat block colors `DndMonsterTan`, `DndDarkRed` and `DndRuleRed`. The values are approximations of the core book accents.

## Trinkets

A table for rolling trinkets, as in the original color showcase:

![[DnD-Table-Trinkets]]

## Themed Boxes

The box environments accept tcolorbox options per use, so a single box can switch its theme color. This one is set via a raw ` ```latex ` block:

```latex
\begin{DndComment}[colback=PhbMauve]
\textbf{This Comment Is in Mauve}

This comment is in the new color.
\end{DndComment}
```
