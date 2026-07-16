# Custom LaTeX templates

Swap the default Eisvogel template for your own `.tex` via `nope-template: "[[my-template]]"`. Start from `nope_minimal.tex` (command *Create custom LaTeX template*), keep the marked `NOPE-IMPORTS` block verbatim and define your own environments. You can also restyle NOPE defaults like callouts and tables by overriding their `nope*` names. The demo below flips a box from red to green depending on whether an extra package is installed.

[Open PDF](../assets/pdf/example-custom-latex.pdf){ .md-button }

**Source notes**

=== "example-custom-latex.md"

    ````markdown
    --8<-- "example-vault/minimal-latex/example-custom-latex.md"
    ````

=== "nope_minimal.tex"

    ````latex
    --8<-- "example-vault/minimal-latex/nope_minimal.tex"
    ````
