## Agent skills

### Issue tracker

Tickets are GitHub Issues at `artsaraiva/clearway`; specs and maps stay under `.scratch/<feature>/`. The repo is on the personal `artsaraiva` account: prefix `gh` with `GH_TOKEN=$(gh auth token -u artsaraiva)`. See `docs/agents/issue-tracker.md`.

Each ticket gets its own branch off `main`, named `<n>-<slug>` (e.g. `1-split-sim`). Finish with a PR whose body comes from `/pr` and says `Closes #<n>`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Testing

Most of this game is verified by playtesting. Tests cover the simulation, where playtesting misses regressions.

These test seams are pre-agreed with the user and form the complete list:

- **Simulation outcomes** (`src/sim`): a City jams as configured, a known Change clears the Jam, and a seed gives the same result every run. Changes carry over a placement, and a Swap resets the swapped Tile's.
- **Placement rules** (`src/city`): a drop or a Swap is legal or refused.
- **Economy**: the Price of the n-th Tile, the loop rebate, the Income floor and the Undo refund. A save loads back the same City, Changes, yen and Record, and a save that will not load starts a new run that keeps the Record.
- **Stages** (`src/game`): a Tile whose Junction is served reaches its next Stage, and one whose Junction is in a Jam does not. A Swap keeps the Stage and progress, and Rezoning starts the Tile again at Stage 1. A save loads back each Tile's Stage and progress.

Assert outcomes only: jammed, cleared, legal, refused, a price, yen, a Stage. Verify everything else (`src/render`, `src/ui`, visuals, feel, tuning) by running the game.

Visual-style PR evidence comes from `scripts/visual/`: `npm run shots -- <zones>` for the Stage sheets, `npm run bench:visual -- <zones> --against origin/main` for the 1,000-car frame time. Usage heads each script.

The rules of finish that are facts about what was placed come from the scene check, `npm run check:scene -- <zones> --against origin/main`: a script, not part of `npm test`, that builds each Zone's City in Node at every Stage and asserts that everything stands on its Block and keeps clear of bays, door steps and the rest, movers' paths too; vehicles stand on wheels; neighbours differ; each Block has its scenes; something moves; lights leave pools; small props are Close-only; no colour nears the reserved two; triangles and meshes stay under a ceiling. It prints the building forms and scenes built and whether each Zone's meshes match the ref. Known failures are listed with their owners in `scripts/visual/scene/known.ts`; its rules have their own tests over hand-made reports. Sheets are for the look alone: a Zone ticket asks for a pass and one sheet.

Zone work lives in `src/render/zones/<zone>.ts` (its look, fill, plans and scenes) and `.scratch/visual-style/zones/<zone>.md` (its part of the visual-style spec); what every Zone shares stays in `src/render/zones/ground.ts`, `scenes.ts`, the kit and `.scratch/visual-style/spec.md`. The pre-commit hook runs the scene check on each staged Zone module, and on every Zone when another render file or the check itself is staged (about 50 s).

Write the test first when the rule is clear up front. When the behavior is still being explored, build it, playtest it, then lock it in with a test.
