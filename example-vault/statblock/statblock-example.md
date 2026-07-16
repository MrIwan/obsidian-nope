---
title: "Stat blocks"
author: MrIwan
toc: false
nope-blocks:
  - statblock
nope-tlmgr:
  - tcolorbox
nope-template: "[[nope_statblock.tex]]"
---

# Stat blocks

A `statblock` fence in [Fantasy Statblock](https://plugins.javalent.com/statblocks) syntax renders live in Obsidian and exports through the `statblock` environment defined in the custom template, from one source. Each scalar key becomes `\nope<key>`; a block list like `traits:` becomes numbered `\nope<key><N>-<subkey>` commands.

The stat block look is inspired by the [DnD 5e LaTeX template](https://github.com/rpgtex/DND-5e-LaTeX-Template) by the rpgTeX team (MIT). Thanks for the groundwork.

```statblock
name: Goblin
size: Small
type: humanoid
alignment: neutral evil
ac: 15
hp: 7 (2d6)
speed: 30 ft.
stats: [8, 14, 10, 10, 8, 8]
cr: "1/4"
traits:
  - name: Nimble Escape
    desc: The goblin can take the Disengage or Hide action as a bonus action.
actions:
  - name: Scimitar
    desc: Melee weapon attack, reach 5 ft., one target. Hit 5 (1d6+2) slashing damage.
```
