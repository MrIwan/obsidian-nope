# Roadmap

What is planned for NOPE. Ideas and design explorations that are not planned sit at the bottom under [Ideas](#ideas).

## Planned

### Fonts and engine switch

Brand fonts need `fontspec`, which only runs under lualatex or xelatex. The plan has three layers. First switch latexmk to lualatex, which already ships in the base image. Then add a curated font set via tlmgr plus `mainfont`, `sansfont`, `monofont` and `mathfont` keys in `_base.yml`, so a user only writes the font name. Last, allow BYO fonts via wikilink in the branding frontmatter, resolved like logos. The detailed three-tier sketch lives under Ideas.

### SVG logo support

pdflatex cannot render SVG directly. A path would be Inkscape in the image plus the `svg` package and `--shell-escape` in latexmk (~200 MB). Only worth it on concrete demand. Until then export PDF or PNG from Inkscape.

### Split the skill

NOPE has grown large. Split the single authoring skill into a base skill plus focused skills for custom templates, branding and further topics. In the same step make the pipeline usable standalone, so an agent can run minimal test documents in the terminal and read the logs. The pipeline stays self-contained for this.

## Ideas

Not planned. Design explorations kept for reference. Nothing here is committed work.

### Overleaf-style intermediate reuse

Overleaf renders faster because it reuses intermediates. The pipeline keeps intermediates too but recompiles everything, because the SHA of the main `.tex` changes. If each include went into LaTeX via `\input{file}` instead of being inlined, most blocks could be reused across builds.

