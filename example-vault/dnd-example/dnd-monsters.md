# Monsters and NPCs

The ` ```statblock ` code block is used to typeset monster and NPC stat blocks. Declare the identifier once in the main document (`nope-blocks: [statblock]`) and drop the block into the flowing text. The keys follow the [Fantasy Statblock](https://plugins.javalent.com/statblocks) community plugin, so the very same block renders live in Obsidian's reading view and exports as a 5e stat block:

```statblock
name: Monster Foo
size: Medium
type: aberration
subtype: metasyntactic variable
alignment: neutral evil
ac: 9 (12 with mage armor)
hp: 16
hit_dice: 3d8 + 3
speed: 30 ft., fly 30 ft.
stats: [12, 8, 13, 10, 14, 15]
senses: darkvision 60 ft., passive Perception 10
languages: Common, Goblin, Undercommon
cr: 1
traits:
  - name: Innate Spellcasting
    desc: Foo's spellcasting ability is Charisma (spell save DC 12, +4 to hit with spell attacks). It can innately cast the following spells, requiring no material components. At will: misty step. 3/day each: fog cloud, rope trick. 1/day: identify.
  - name: Spellcasting
    desc: Foo is a 2nd-level spellcaster. Its spellcasting ability is Charisma (spell save DC 12, +4 to hit with spell attacks). It has the following sorcerer spells prepared. Cantrips (at will): blade ward, fire bolt, light, shocking grasp. 1st level (3 slots): burning hands, mage armor, shield.
actions:
  - name: Multiattack
    desc: The foo makes two melee attacks.
  - name: Dagger
    desc: Melee or Ranged Weapon Attack: +3 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 3 (1d4 + 1) piercing damage.
  - name: Flame Tongue Longsword
    desc: Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) slashing damage plus 7 (2d6) fire damage, or 6 (1d10 + 1) slashing damage if used with two hands.
  - name: Assassin's Light Crossbow
    desc: Ranged Weapon Attack: +1 to hit, range 80/320 ft., one target. Hit: 4 (1d8) piercing damage and the target must make a DC 15 Constitution saving throw, taking 24 (7d6) poison damage on a failed save, or half as much damage on a successful one.
legendary_description: The foo can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The foo regains spent legendary actions at the start of its turn.
legendary_actions:
  - name: Move
    desc: The foo moves up to its speed.
  - name: Dagger Attack
    desc: The foo makes a dagger attack.
  - name: Create Contract (Costs 3 Actions)
    desc: The foo presents a contract in a language it knows and waves it in the face of a creature within 10 feet. The creature must make a DC 10 Intelligence saving throw. On a failure, the creature is incapacitated until the start of the foo's next turn. A creature who cannot read the language in which the contract is written has advantage on this saving throw.
```

The `statblock` environment reads the Fantasy Statblock keys `name`, `size`, `type`, `subtype`, `alignment`, `ac`, `hp`, `hit_dice`, `speed`, `stats` (six ability scores — the modifiers are computed at export), `senses`, `languages`, `cr`, the `damage_*`/`condition_immunities` details and the lists `traits`, `actions`, `reactions` and `legendary_actions` (up to six/eight/four/four `name`/`desc` items) plus `legendary_description`. Omitted keys simply render nothing. Install the Fantasy Statblock plugin to get the same block rendered live while writing.
