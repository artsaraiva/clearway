# Tile sandbox

Status: open. Prototyped in [#82](https://github.com/artsaraiva/clearway/issues/82) (verdict 2026-11-15: go), rules grilled in [#83](https://github.com/artsaraiva/clearway/issues/83). Replaces the land game (`.scratch/land-game/spec.md`).

## Goal

Make the tile sandbox the game. The player builds a City by dragging road Tiles from a bar. Every open road end is a Gateway that sends trips, every arrived trip pays, and the price of the next Tile rises. Growth causes Jams, and the player clears them with Changes or by building around them. There is no end state and no lose state.

Vocabulary in root `GLOSSARY.md`. Routing follows ADR 0001, the Rebuild ADR 0002, yielding ADR 0003, two-Arm Junctions ADR 0004.

## Decided before #83

- A fixed bar of Layouts. Every Layout is always available and can be placed any number of times.
- A Tile can be rotated. A drop is legal only when the Tile touches the City and every shared edge matches, road to road and blank to blank.
- The Tile in the hand is a 3D piece of unbuilt slab seated at the City's level.
- Changes are free and unlimited, with both Tools on every Junction.
- The browser, Three.js, the per-car sim and the diorama renderer stay.

## Rules

### Goal

- A pure sandbox. The City cannot be finished or lost.
- The measure of doing well is trips arriving per minute (Income divided by the pay per trip).
- **Holding:** Flow at or above 80% for 60 sim-seconds, the bar the sim already has (`WIN_FLOW`, `WIN_TIME`).
- **Record:** the most trips per minute the City has carried while Holding. The page shows it beside the current value, which can fall.

### The board

- A square grid of 100 m cells with no bounds. The City is a sparse set of cells.
- One City only: every Tile joins the rest by road.
- Blocks are scenery and do not affect Demand.

### Layouts

- Five Layouts: Straight, Curve, T-junction, Crossroads, Roundabout. Every road is two lanes each way, so there is one edge type.
- The Roundabout is a Layout, not a Change.
- Every Tile is exactly one Junction, and both Tools work on it. A Straight and a Curve are two-Arm Priority junctions (ADR 0004).

### Placing

A drop is legal when all of these hold:

- the cell is empty;
- every edge shared with a placed Tile matches;
- at least one road joins the Tile to the City;
- the City keeps at least two open ends.

A new run starts with one Tile already placed and the price of the first Tile in hand. The starting Tile's Layout and rotation are drawn from the run's seed, so they change from run to run. Every Layout has at least two road edges, so any of them is a legal start.

### Swap

- Dropping a Layout on a placed Tile replaces it. The same four conditions apply, with the cell's own Tile ignored. Edges facing empty cells may change, so a Swap can open or close ends.
- A Swap costs the price of the next Tile and does not raise that price. Nothing is refunded for the old Tile.
- The swapped Tile's Changes return to defaults. Changes on every other Tile carry over.
- A Tile cannot be removed or moved.

### Undo

- The last placement or Swap can be undone for a full refund until 10 sim-seconds of earning have run since it. Paused time does not count.
- Undo restores the City and every Change as they were. Yen earned in between is kept.

### Rebuild

Placing, Swap and Undo each rebuild the simulation (ADR 0002): a new network from the City, Changes carried over by stable lane ids, a hidden Pre-warm. No vehicle survives. Nothing is earned during the Pre-warm.

### Demand

- Every open end is a Gateway until a Tile closes it. A closed end's trips are gone; they do not move to other ends.
- A Gateway's rate is `base × weight × (1 + growth × (Tiles − 1))` trips a minute. The weight is fixed by the end's position, so some ends are busy and some quiet, which is what gives the Priority rule something to fix.
- A Gateway's trips are split evenly between the other Gateways a car can drive to, with the Connections as they stand at the Rebuild. A Gateway that reaches no other sends nothing.
- Demand is recomputed at every Rebuild and fixed between them.

### Economy

- **Pay:** a flat amount for each trip that leaves at the Gateway it set out for.
- **Price:** Tile n+1 costs `base × growth^(n−1)`, the same for every Layout.
- **Loop rebate:** a placement that joins two or more placed Tiles by road costs less. A Swap gets no rebate.
- **Income:** yen earned over the last 60 sim-seconds, as yen per minute.
- **Income floor:** the player never earns less than a small share of the next price per minute, so a jammed City can always afford a fix.
- Yen is spent only on placing and Swap. No upkeep.

### Numbers

Tuned in [#89](https://github.com/artsaraiva/clearway/issues/89) against the Bars below, with `npm run tune`. They live in `src/tuning.ts`.

| Number | Value | Start, before tuning |
| --- | --- | --- |
| Pay per trip | ¥10 | ¥10 |
| Price base, growth | ¥350, 1.3, rounded to ¥50 | ¥300, 1.25 |
| Gateway base rate | 1.75 trips a minute | 3 |
| Gateway weight | 1, 1, 2 or 3 by position | the same |
| Gateway growth | 0.12 per Tile | 0.03 |
| Loop rebate | 25% off | 25% |
| Income floor | next price ÷ 25 per minute | ÷ 30 |
| Undo window | 10 sim-seconds | 10 |

## Build

### The City (`src/city`)

Pure TypeScript with no sim or Three.js import.

- A City is the Tiles placed, in order: cell, Layout and rotation.
- It answers: is this drop legal, is this Swap legal, which ends are open, what does the next Tile cost, does this placement earn the rebate.
- A Tile's Junction is named by its cell, and a Road by the cell edge it crosses. Ids stay the same whatever is placed around them, so Changes carry over.

### The Sim takes a City

- `Sim` is built from a City, the Changes carried over and a seed. It builds one Junction per Tile, one Road across each shared road edge, and a Road to the cell edge for each open end, which is its Gateway.
- A Priority junction may have two Arms (ADR 0004). The prototype's change to `src/sim/network.ts` is the reference.
- Demand comes from the open ends by the rule above. The District file, `Level`, streams and `levels/` are removed.
- `Reset` returns every Junction to its default configuration.

### The game state

Beside the Sim, not inside it: the run's seed, yen, the City, the Changes, the Record and the one step of Undo. A new run takes a new seed, which picks the starting Tile and seeds the Sim; a test passes a fixed one. It reads `completed` trips and Flow from the Sim, applies the Income floor, and rebuilds the Sim on placing, Swap and Undo.

### The page

`/` opens the sandbox. The minimum screen, until [#15](https://github.com/artsaraiva/clearway/issues/15) designs the real one:

- The bar of five Layouts. Drag, rotate with `R` or the wheel, cancel with `Esc`, as in the prototype: a green ghost with the price when legal, grey when too expensive, red with the reason when not.
- Dropping on a placed Tile is a Swap.
- An Undo button while the window is open.
- The yen counter, Income, trips per minute with the Record, and Flow.
- Each Gateway labelled with its trips per minute.
- Pause, 1×, 4× and 8×. Both Tools on every Junction, and the route Inspector.
- The slab, lighting and distance field follow the City's extent, since the board has no bounds.

Nothing is saved yet. Save is [#15](https://github.com/artsaraiva/clearway/issues/15)'s question.

## Bars

`npm run tune` (`scripts/tune.ts`) grows scripted Cities headless and reports them against these. Results for the numbers above are in [#89](https://github.com/artsaraiva/clearway/issues/89).

| Bar | Target |
| --- | --- |
| A Jam emerges | untouched, a City stops Holding by about 6 Tiles |
| Changes work early | up to about 10 Tiles, a Change restores Holding |
| Building works late | past that, a placement or Swap restores Holding where no Change does |
| Pace | the first 12 Tiles take 10–20 minutes at 4× |
| Recovery | from a fully jammed City, the Income floor affords a Tile within 30 sim-minutes |

## Verification

By playing, per `CLAUDE.md`, plus its three test seams (agreed 2026-11-15 in #83).

- **Simulation outcomes** (`src/sim`): a City jams as configured, a known Change clears the Jam, and a seed gives the same result every run. Changes carry over a placement, and a Swap resets the swapped Tile's. District 1's two built Levels become fixtures here: the same Junctions, Demand, initial configuration and solution.
- **Placement rules** (`src/city`): a drop or a Swap is legal or refused.
- **Economy:** the price of the n-th Tile, the loop rebate, the Income floor and the Undo refund.

Assert outcomes only: jammed, cleared, legal, refused, a price, yen.

## Issues

- [#85](https://github.com/artsaraiva/clearway/issues/85) The City and its placement rules
- [#86](https://github.com/artsaraiva/clearway/issues/86) The Sim built from a City, blocked by #85
- [#87](https://github.com/artsaraiva/clearway/issues/87) Yen, Swap and Undo, blocked by #86
- [#88](https://github.com/artsaraiva/clearway/issues/88) The game page, blocked by #87
- [#89](https://github.com/artsaraiva/clearway/issues/89) Tune Demand and prices to the bars, blocked by #87

## Not in this spec

- Contracts at Gateways: [#90](https://github.com/artsaraiva/clearway/issues/90).
- Landmarks out on the board: [#91](https://github.com/artsaraiva/clearway/issues/91).
- Gateways with character (rush hours, pulses, lorries): [#92](https://github.com/artsaraiva/clearway/issues/92).
- One-lane Layouts: [#93](https://github.com/artsaraiva/clearway/issues/93).
- A second town: [#94](https://github.com/artsaraiva/clearway/issues/94).
- Blocks that drive Demand: [#95](https://github.com/artsaraiva/clearway/issues/95).
- A free-money mode: [#96](https://github.com/artsaraiva/clearway/issues/96).
- Milestones and sim scale for a large City: [#48](https://github.com/artsaraiva/clearway/issues/48). Unlocking Layouts and Tools: [#55](https://github.com/artsaraiva/clearway/issues/55).
- The real screens and save: [#15](https://github.com/artsaraiva/clearway/issues/15).
- Hex cells, a random tile stack, free removal and per-Layout prices: ruled out in #83.
