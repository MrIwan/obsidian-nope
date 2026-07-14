---
author: Wanja Zemke
title: The Power of LaTeX
subtitle: Demonstrating the custom template
date: 2026-06-24
nope-template: "[[nope_minimal.tex]]"
---
# Chapter

The custom template is a powerful and dangerous tool. It opens up endless export possibilities and just as many ways for things to go wrong.

# Extra LaTeX packages

Custom templates may need packages that are not part of the base Docker image — here `cancel`. A document declares them in its frontmatter via `nope-tlmgr:`; the export installs missing ones into the Docker image automatically. The demo template loads `cancel` only if it is available, so the box below tells you whether the package made it into the image:

\begin{demobox}
The template checks for the package with \texttt{\textbackslash IfFileExists} and switches this box between red and green.
\end{demobox}

To test it yourself:

1. Export this note once — the box is red: `cancel` is **not** installed.
2. Add `nope-tlmgr: [cancel]` to this note's frontmatter.
3. Export again — the package is installed during the export and the box turns green.

The `IfFileExists` dance is only for this red/green demo. A real template just declares `nope-tlmgr:` in the document (or branding note) and uses plain `\usepackage{...}` — if a package is missing anyway, the export fails and the reason lands in the LaTeX log (keep intermediates via settings to inspect it).
