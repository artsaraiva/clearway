# Land game

Status: open. Grilled in [#72](https://github.com/artsaraiva/clearway/issues/72), prototyped in [#74](https://github.com/artsaraiva/clearway/issues/74), verdict 2026-11-14: this is the game.

## Goal

Make the land game the game. The player owns one Tile of a District, earns yen from every trip that arrives, and buys neighbouring Tiles. Each purchase is a Reveal that adds Demand, so Jams emerge, and the player clears them with Changes. Owning every Tile is the Win.

The first release is District 1's grid: 8 Tiles, played at `/`. A District of about 24 Junctions follows ([#46](https://github.com/artsaraiva/clearway/issues/46)).

Vocabulary in root `GLOSSARY.md`. Routing and Reveal follow ADR 0001 and ADR 0002; yielding follows ADR 0003.

## Decided in #72

- The player buys Tiles and makes Changes, nothing else. Changes are free and unlimited. Every Tool works on every owned Junction.
- One currency, yen. It is earned only by arrived trips and spent only on Tiles. No upkeep, taxes or loans.
- The price of the next Tile rises with the number owned and is the same for any Tile.
- The player may buy any Tile that touches the owned slab.
- The whole road graph is fixed before play. No Road-laying, zoning or building placement.
- No lose state. A jammed city earns slowly.
- The sim stays per-car. No yen accrues during the Pre-warm.
- The platform stays the browser (2026-11-14). A move to an engine is reconsidered only for consoles, for an editor that non-programmers need, or for a measured performance wall with the sim already in a worker.

## What the prototype showed

The prototype is on the local branch `74-land-economy-prototype`; its report is a comment on [#74](https://github.com/artsaraiva/clearway/issues/74). Numbers below are from that report.

- **The loop works on the real sim and renderer.** A purchase as a Reveal needed no sim change.
- **An uncontrolled crossroads gridlocks at about 30 trips a minute in total.** Every Junction starts with all Arms on yield, so this is the Jam that emerges.
- **A yield Arm carries about 4 trips a minute against a busy main road.** A fix exists only where one road is busy and the rest are nearly empty.
- **Default Connections make some trips loop the grid.** Lane 0 cannot turn left and there are no lane changes, so some pairs of Gateways are joined only by a detour through several Junctions.
- **Waiting nearly beat fixing.** With no Jam fixed, the eight Tiles took 7% longer than with every Jam fixed.
- **Late Jams often had no clearing Change.** Across 21 purchases a Jam appeared after 11, and a Change cleared it in 5.

## Build

### Tiles in the District file

A District lists Tiles in place of Levels.

- **Tile:** an id, its cell (a rectangle on the grid), the Junction on it, and its streams. Cells tile the District and never overlap.
- **Start:** the District names the Tile owned at the start.
- **Removed:** `Level`, its `reveal`, `tools`, `initial`, `solution` and `pieces`. A Tile's piece of slab is its cell.
- **Scenery:** unchanged, with one rule added. A landmark or special Block stands inside one cell, clear of the grid lines.

`validateDistrict` checks that every Junction is on exactly one Tile, that every Road crosses a Tile edge only on a grid line, and the rules for streams below.

### A Road stops at the edge of an unowned Tile

A Road whose far Junction is on an unowned Tile ends at the Tile edge, and that end is its Gateway. When the Tile is bought, the Road runs on to the Junction. Lane ids stay the same, so Changes carry over.

This is a sim change. The prototype let such a Road run to the far Junction's footprint, which put a stub of road on land the player did not own.

### The Sim takes the Tiles owned

`Sim` is built from a District, the Tiles owned in the order bought, and the configuration carried over. It builds the network of the owned Tiles, applies the carried Changes, sets Demand for the owned set, and Pre-warms (ADR 0002). The order bought only seeds the random stream.

`Reset` returns every Junction to its configuration at the last Reveal, as `Sim.reset` does now.

### Demand from streams

- **Stream:** trips per minute from one edge Gateway of the District to another. It belongs to one Tile and joins Demand when that Tile is bought.
- **Route:** fixed by the fastest free-flow route over the whole District with every Junction in its default configuration.
- **Continuity:** with only some Tiles owned, a stream runs over the owned stretch of its route around its own Tile. It enters and leaves by the Gateways at the ends of that stretch, so it runs on through a neighbouring Tile once that is bought.
- **Checked by `validateDistrict`:** a stream's route passes its own Tile, and passes no Junction twice.

### Economy

- **Pay:** a flat amount for each trip that leaves at the Gateway it set out for. A vehicle re-planned to another Gateway after a Change pays nothing.
- **Price:** `base × growth ^ (Tiles bought)`, rounded to ¥100. Both numbers live in the District file.
- **Income:** yen earned over the last 60 sim-seconds, as yen per minute.
- **Potential:** what the owned Tiles' streams would pay if every trip arrived. The Income gauge reads against it.
- **Starting values** from the prototype: ¥10 a trip, base ¥1,500, growth 1.28. Tuning replaces them (see Bars).

The economy is game state beside the Sim, not inside it. It reads `completed` trips from the Sim and holds yen, the Tiles owned and the price.

### Reveal

- A purchase takes the price, rebuilds the Sim with the new Tile, and plays the Reveal animation. Yen starts accruing when the Pre-warm is done and the cars are shown.
- The renderer builds a Tile's scenery from its cell. It prepares the build of every Tile for sale ahead of time, a few milliseconds a frame, so a purchase starts its Reveal at once. The prototype built it on the click and stalled.
- Lighting and the distance field cover the whole District from the start, as now.

### The page

`/` opens the land game. The Level page and its `?level=` resume are removed.

The minimum screen, until [#15](https://github.com/artsaraiva/clearway/issues/15) designs the real one:

- The yen counter, the Income gauge against potential, and Flow as a second reading.
- Each Tile for sale outlined on the road plane, with the price and what its streams would pay per minute.
- Pause, 1×, 4× and 8×.
- Both Tools on every owned Junction, and the route Inspector.
- A banner when every Tile is owned. The sim keeps running.

Nothing is saved yet. Save is [#15](https://github.com/artsaraiva/clearway/issues/15)'s question.

## Sizing streams

Rules for whoever writes a District's streams, by hand or by generator:

- At every Junction one pair of Arms carries the heavy streams and can be made main. Every other Arm carries at most 4 trips a minute.
- A heavy stream stays under 20 trips a minute per lane.
- No stream turns left off a one-lane Road that carries a heavy stream: the turning car blocks the lane.
- With every Tile owned, the trips through each crossroads total more than 30 a minute, so it jams untouched.

These limits make "make the busy road main" the fix nearly everywhere. More kinds of fix need more Tools, which is [#55](https://github.com/artsaraiva/clearway/issues/55).

## Bars

A District ships when a headless run meets these in three recorded purchase orders. The prototype's `scripts/proto-land-report.ts` becomes the dev script that measures them.

| Bar | Target | Prototype |
| --- | --- | --- |
| A reference configuration clears every Jam after every purchase | no Junction under half its free speed | J2 and J3 stay jammed late |
| A Jam emerges | untouched, Income with every Tile is at most 75% of potential | 72% |
| Fixing pays | untouched, first Tile to last takes at least 1.5 times as long as fixed | 1.07 times |
| Pace | fixed, first Tile to last takes 10–20 minutes at 4× | about 14 minutes |

The reference configuration is written in the District's test, not in the District file: the game has no authored solution.

## Verification

By playing, per `CLAUDE.md`, plus its two test seams (the Districts seam was agreed 2026-11-14).

- **Simulation outcomes** (`src/sim`), unchanged in kind: a fixture jams as configured, a known Change clears the Jam, and a seed gives the same result every run. District 1's two built Levels become these fixtures: the same Junctions, Demand, initial configuration and solution, as owned Tiles and Changes.
- **Districts** (`levels/`), replacing the Levels seam: for each recorded purchase order of each District, the reference configuration leaves no Junction jammed after any purchase, and with every Tile owned and nothing changed, Income stays under the Jam bar.

Assert outcomes only: jammed, cleared, Income over or under a bar, Won.

## Issues

- [#77](https://github.com/artsaraiva/clearway/issues/77) Tiles in the District file and the Sim
- [#78](https://github.com/artsaraiva/clearway/issues/78) Demand from streams, blocked by #77
- [#79](https://github.com/artsaraiva/clearway/issues/79) The game page, with yen and Tile buying, blocked by #77 and #78
- [#80](https://github.com/artsaraiva/clearway/issues/80) District 1 tuned to the bars, blocked by #77 and #78

## Not in this spec

- The real screens, the buying interaction and save: [#15](https://github.com/artsaraiva/clearway/issues/15).
- More Tools: [#55](https://github.com/artsaraiva/clearway/issues/55).
- A 24-Junction District and its generator: [#46](https://github.com/artsaraiva/clearway/issues/46).
- The endless map and a coarser sim away from the camera: [#48](https://github.com/artsaraiva/clearway/issues/48).
- Upkeep, per-Tile prices, pay by distance, Road-laying and zoning: ruled out in [#72](https://github.com/artsaraiva/clearway/issues/72).
