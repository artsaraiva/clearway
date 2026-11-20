# The game is called Dioramania

The game was called Clearway, a name for a traffic game: a clearway is a road where stopping is forbidden. Since [ADR 0005](0005-a-diorama-city-builder.md) the game is a diorama city builder, where traffic is the system that decides how well the City grows, and the name no longer said what the game is. With the paper & stamp redesign, which gives the game a title screen and puts its name on screen for the first time ([#243](https://github.com/artsaraiva/clearway/issues/243)), the user renamed it Dioramania.

The name is in the browser tab, on the title card, in the package, in the dev hook on the window and in every doc an agent reads. The saves move to keys of the new name, and a save kept under an old key is carried over to its new key the first time the page opens, so a City saved before the rename opens after it. The save's version does not change: what a save holds is the same, only where it is kept.

ADRs are records, so the ones written before this keep the old name.

## Consequences

- The dev hook is `window.dioramania`, and the scripts under `scripts/visual/` call it by that name. A page they open from a ref before the rename puts its hook under the old name, and the scripts take it under the new one, so a comparison `--against` such a ref still runs.
- The carry-over reads the old keys for as long as the code keeps it. It is a few lines in `src/game/save.ts` with no cost once the new keys hold a save, so it has no end date.
- The GitHub repository is renamed by hand and the repo's own address follows in its own step, after this one. Until then the repo is called Dioramania but lives at `artsaraiva/clearway`.
