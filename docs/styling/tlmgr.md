# Extra LaTeX packages

Custom templates often need LaTeX packages beyond the base image, like fonts, `pgfplots` or `cancel`. Declare them in the **document frontmatter** (or the branding note) as [tlmgr](https://ctan.org/pkg/texlive) package names:

```yaml
---
nope-template: "[[my-template]]"
nope-tlmgr: [cancel, pgfplots]
---
```

During the export, the pipeline installs missing packages into a **persistent TeX user tree** inside the build folder: the first run downloads them, every later run finds them on disk. The same mechanism serves plugin exports, the live preview, CI and standalone runs. No settings, no image rebuild.

```latex
\usepackage{tgbonum}   % declared via nope-tlmgr: [tex-gyre]
```

**Cleanup build folder** removes the tree. The next export re-installs what the document declares.

!!! example "See it in action"
    The [custom template demo](templates.md) flips a box from red to green when `cancel` is declared. The [DnD showcase](../showcase/dnd.md) pulls in its entire 5e font stack (`tex-gyre`, `kpfonts`, `gillius`) this way.
