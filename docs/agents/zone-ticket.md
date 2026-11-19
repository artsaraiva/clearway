# Zone tickets: building a Zone to the Finish

How to brief, build and close a visual-style Zone ticket of [#173](https://github.com/artsaraiva/clearway/issues/173). A brief to an implementer is this file, the ticket, and anything the ticket alone cannot say.

The rules of Finish and the three zooms (City, Tile and Block zoom: `GLOSSARY.md`) are in #173, which calls them the level of finish and Framed, Street and Close; the code and the scripts' flags still do. What each finished Zone builds is in `.scratch/visual-style/`.

## Steps

1. **Ask which of the menu to build.** The ticket's Wanted list is a menu: show it to the user, and build what they pick, or all of it when they say so. Done when the user has answered.
2. **Read** the ticket, #173's rules, and the finished Zone nearest yours in the visual-style spec.
3. **Run the scene check on `main`** for your Zone: `npm run check:scene -- <zone> --all`. Its known rows for your Zone in `scripts/visual/scene/known.ts` are your work list.
4. **Build in a loop of seconds:** change the fill, rerun the check, read what failed and where. Commit each time a group of failures clears.
5. **Done building when** `npm run check:scene -- <zone> --seeds 5` passes with your Zone's rows deleted from `known.ts`, and `npm run check:scene -- all --against origin/main` shows every other Zone's meshes unchanged.
6. **Shoot once:** `npm run shots -- <zone> --times noon,night`. Read the sheets against rules 1, 2 and 9, which the check does not assert, and against the approved shops sheets. Then `npm run readability -- <zone> --against origin/main`: one sheet showing whether Tool aids, Jam markers and anger marks read as today over the new surfaces, at noon, dusk and night. Fix and reshoot only what a sheet shows wrong.
7. **Review:** `/code-review` against `origin/main`, on both axes as Review (below) has them. Fix what it finds, rerun the check, and reshoot only what a fix changes.
8. **Bench once:** `npm run bench:visual -- <zone> --against origin/main`, whole City and one Tile, noon and night. Under 12 ms.
9. **Write** what the Zone builds, its colours and its frame time into the visual-style spec. List in one place every departure from a rule and every piece outside the ticket's menu, for the user to accept or drop.
10. **Open a draft PR** (`/pr`, `Closes #<n>`). The user approves the sheets; then mark it ready.

## What the check asserts, and what stays with the sheet

The scene check holds the facts: everything on its Block and clear of bays, doors and each other; movers' paths; wheels; neighbours differ; scenes; something moves; pools; Close-only props; the reserved colours; triangles and meshes under the Zone's ceiling; a Lot the same at every Stage.

The sheet holds the look: walls and roofs that carry something on all four sides (rules 1 and 2, until [#198](https://github.com/artsaraiva/clearway/issues/198)), a Stage that reads at City zoom, a night signature of the Zone's own, whether Tool aids, Jam markers and anger marks still read over it (the readability sheet), and whether it is good. One sheet set, at the end.

## Build it the way the finished Zones are built

Each line is a defect a review caught once.

- **Surface is pattern, not triangles.** Tile rows, floor lines, plaster, windows on backs and ends go through the shared scenery material; lit windows through its lit mask. Varyings are smooth.
- **Keep each Lot's building as `main` draws it** unless a rule needs it changed: same random streams, same order. The check prints Form counts beside the ref's.
- **Neighbours:** a building's Form differs from every Lot beside it, by the test the finished Zones share.
- **Scenes** take their ground from a stream of their own, one a Block from Stage 2 and a second at Stage 3 on 2,500 m² or more, each with a standing piece larger than a car at every hour.
- **Movers that come and go** cross the kerb at a Road, clear of poles, lamps and street trees.
- **Ask the kit before placing:** a piece stands only where `kit.unclaimed` says the ground is free of bays and door steps.
- **Every lit thing near the ground** leaves a pool on the one instanced decal mesh.
- **Small props are Close-only,** hidden at City zoom and during a reveal.
- **Parked vehicles** come from the cars' skins and paints.
- **Reuse the shared helpers** before writing one; one name for one thing.
- **Colour:** nothing within 30° of the Tool blue or the Jam red-orange over 65% of its chroma. Lettering is bands and marks.

## Running it

- **What you built, and where:** `npm run check:scene -- <zone> --counts` prints how many of each thing, scene, mover and pool each Stage built; `--where <kind>` prints where the first few of a kind stand, as `--close=x,y` points for `npm run shots`. No throwaway scripts against `buildReport`.
- **Sheets** land in `scripts/visual/out/`, which is ignored by git and survives a restart. The session's scratch folder does not.
- **The approved sheets** are in this repo under `refs/screenshots/main`: `git fetch origin refs/screenshots/main:refs/screenshots/main`, then `git show refs/screenshots/main:.scratch/visual-style/pr-175/reference-noon-street.jpg > <file>`.
- **Run a command and let it finish.** A background loop that waits on `pgrep` never ends.
- **Commit early.** A restart loses uncommitted reading, not committed work.
- **A fresh worktree** needs `npm install` and `npx husky`.

## Review

Reviewers read the diff and run the check; they do not shoot. The Standards review looks for duplicated helpers and names off the glossary. The Spec review holds the ticket's list and rules 1, 2 and 9 against the sheet.
