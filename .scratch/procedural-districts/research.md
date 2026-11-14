# Procedural Districts: research

Answers [#34](https://github.com/artsaraiva/clearway/issues/34). Written 2026-11-14. Numbers marked _measured_ were taken in this repo on an M4 Pro (Node 22) with existing scripts, or with throwaway scripts kept outside the repo. Numbers marked _estimate_ are arithmetic on those measurements.

Source tags: every claim has a numbered reference. A reference marked **secondary** is not the owner of the claim. Papers I could not open are listed at the end of `## Sources` and are not cited for anything.

## Answer

Recommend authored Level templates with generated variation, run as an offline content tool, not at play time. The tool generates a District file, checks it with the real sim, and a human playtests and commits it as `levels/district-NN.ts`. Committed files are covered by `levels/levels.test.ts` as they stand, so this needs no new test seam.

- **Road graph: generate it.** A grid with per-column and per-row spacing, a few Roads deleted to make T-junctions, and a few roundabouts. It is easy to keep inside every hard constraint, it gives rectangular Blocks that the existing lot fill handles, and its Reveal order is a sweep of rectangles. L-systems, tensor fields and wave function collapse all output shapes this game must then undo (curves, kinks, dead ends, degree-2 corners).
- **Levels: generate the break, not the whole Level.** A Level is a template ("a heavy stream on a yielding Arm", "the dual right is off") bound to a Junction. The solution is the inverse of the break, so a solution exists by construction. The sim then decides everything else: that the break jams, that the fix wins, and over how many seeds. Searching for a free-form jamming Demand is the same loop with Demand as the variable, and it is a fallback for templates, not a replacement.
- **Cost of the checks is low.** About 100 ms per Level per seed, so roughly 570 single-seed candidate checks a minute on one core (_measured_). The hard part is not cost. Level 1 shows the jam and win windows barely overlap (see `## Measured cost`), so a generator needs a stricter acceptance bar than the hand-tuned "7 of 10 seeds", plus templates with a wide capacity gap.
- **A human is still needed** for whether the Jam reads, whether the fix is discoverable, teaching order and theme.
- **Staying hand-authored is the right call** if there will be only a handful of Districts. The tool pays off from roughly five Districts on (a guess, not a measurement). A grilling ticket is worth opening before any build; its questions are at the end.

## What is authored today, and what is already generated

Authored in a District file ([road network spec](../road-network/spec.md), `src/sim/district.ts`):

- **Road graph:** Junction positions and types, Roads (straight, lanes per direction), Gateways as point ends at the District edge.
- **Levels:** `reveal`, `seed`, `tools`, `demand`, `initial`, `solution`, and `pieces` (the rectangles of slab the Reveal adds).
- **Scenery:** theme, seed, landmarks, park and plaza Blocks, street names, avenues.

Generated already:

- **Blocks:** cut from lane geometry with a distance field, so they need no authoring (`src/render/blocks.ts`, [visual style spec](../visual-style/spec.md)).
- **Lots and buildings:** `fillBlock` splits each Block's bounding box into lots from a seed mixed with the Block's position (`src/render/fill.ts`). It drops lots that overhang a rounded corner or a non-rectangular outline, so axis-aligned Blocks lose the fewest.
- **Defaults and arrivals:** each Junction's default Connections come from its type, and arrivals come from the Level seed.
- **Checks:** `validateDistrict` already rejects a Road too short for its Junctions' footprints, Arms too close in angle, Demand naming a non-Gateway, and pieces that overlap or lanes that leave the slab.

Today `levels/district-01.ts` is one Level: a 4-Arm roundabout with 3.5 m lanes. The seven-Level ladder in [district-01 spec](../district-01/spec.md) is on hold: its Level issues ([#8](https://github.com/artsaraiva/clearway/issues/8)–[#14](https://github.com/artsaraiva/clearway/issues/14)) were closed as superseded, and [#33](https://github.com/artsaraiva/clearway/issues/33) re-grills District 1 for the diorama. The only multi-Junction District is the dev fixture `src/dev/street-grid.ts`, with untuned Demand and no solutions. So there is exactly one real Level to measure, and every sim number below comes from it. That is a limit on this note.

## Constraints a generator must meet

Checked against the code, not just the specs.

| Constraint | Where it lives | What it means for a generator |
| --- | --- | --- |
| Straight Roads | `RoadSpec` has only `from` and `to` | Any curved street has to be cut into straight Roads, each between two Junctions. |
| Roundabout 3–6 Arms, priority 3–4 | `buildRoundabout`, `buildPriority` | No degree-2 Junction and no degree above 6. A kink in a street is not a Junction. |
| Priority Arms at least 30° apart | `MIN_ARM_GAP` | A Y-fork under 30° throws. |
| Roundabout Arms apart by both mouths plus 5° | `buildRoundabout`; mouth = asin((lanes × laneWidth + 8) / R) | With R 40 and 7 m lanes: about 49° for 1-lane Arms and 72° for 2-lane Arms (my arithmetic). So 6 Arms fit only as 1-lane Arms. |
| Road keeps 10 m of lane between footprints | `MIN_ROAD_LANE`, `footprint` | Footprint is R + ring lanes × laneWidth / 2 + 15 m for a roundabout (62 m for R 40, 2 Ring lanes, 7 m lanes) and corner + 5 m for a priority Junction (12 m for a 1-lane crossroads, 19 m for 2 lanes). Two crossroads need at least 34 m between centres. A R 40 roundabout beside a crossroads needs at least 84 m, which is already two Blocks. A smaller Ring (R 20, 1 lane: 38.5 m) needs 60.5 m beside a 1-lane crossroads, so it fits a grid gap of about 61 m or more. |
| 5–8 Junctions, 2–5 min per Level | [game map](../game/map.md) | A pacing target. Nothing in code checks either. |
| Blocks 40–60 m, lanes about 7 m | [visual style spec](../visual-style/spec.md) | The renderer cuts whatever it is given. `wide()` only drops slivers under 5 m. |
| Each Level adds rectangles of slab, with its new lanes inside them | `checkPieces` | Pieces never overlap. A lane new in Level n must lie on Level n's pieces, measured at both lane edges. A Road that leaves the map must end exactly at the slab edge. No dead-end stubs inside the slab. |
| Demand only between Gateways of that Level | `validateDistrict` | A Fog Road is a Gateway until its far Junction is Revealed, so Demand has to be re-wired on every Reveal. |
| Tools per Level | `Tool = 'connector' \| 'priority'` | Signal does not exist in code yet, so today's Change space has two Tools. |

Two consequences matter for the design.

1. `footprint()` reads every Road in the District file, including Roads of Junctions still in Fog. So a Gateway Road's length in Level 1 depends on Junctions Revealed in Level 5. The road graph must be fixed in full before any Level is generated or checked.
2. A Road that crosses a seam between two pieces ends at a footprint edge. The seam check measures lane corners, so a slanted Road across a seam can fail by up to a lane width times the sine of the slant (my reading of `checkPieces`, not tested). Keeping seam-crossing Roads perpendicular to the seam avoids it.

## 1. Road networks that look planned

What suits a slab of 5–8 Junctions with 40–60 m Blocks: a grid with varied spacing, optionally cut by guillotine splits. The rest each output something this format cannot hold as is.

### Perturbed grid (recommended)

SUMO's `netgenerate` is the nearest off-the-shelf example: a grid with `--grid.number` Junctions per axis and `--grid.length` street length, a spider net, and a random network that adds edges with min and max length, a `--rand.min-angle` and `--rand.grid` to place nodes on a grid [8]. It is a traffic-simulation tool, so it knows nothing about Block size or looks.

In this format a grid generator would output:

- **Positions:** W column x-values and H row y-values, each gap drawn from about 56–64 m. Varying whole columns and rows keeps every Road axis-aligned, every Block a rectangle, and every seam perpendicular to the Roads that cross it. Per-node jitter would give slanted Roads, quads, and lots dropped by `fillBlock`.
- **Variation:** delete a few interior Roads to make T-junctions and larger Blocks. A Junction must keep 3 or more Arms. Replace one or two Junctions by roundabouts, never adjacent (footprint above).
- **Gateways:** a Road from each edge Junction to the slab edge. A corner Junction with two Gateways is a crossroads, with one it is a T.
- **Reveal order:** a sweep of columns or rows. Each Level's piece is a strip with its seams at the footprint edges of the next Junctions, which is what `src/dev/street-grid.ts` already does by hand.

Size matters. A 3×3 lattice has 12 interior Roads, so 2^12 = 4,096 possible Road sets. A 2×4 lattice has 10. At that scale every layout can be enumerated and filtered against the degree rule and the 5–8 Junction rule. No cleverness is needed.

What breaks: nothing in the format. The cost is that every District looks like a grid. Theme, landmarks and Block fill carry the variety, as in the diorama prototype, which was a grid.

### Guillotine splitting (a variant)

Yang, Wang, Vouga and Wonka split a region recursively with streets, either along cross-field streamlines or by fitting pre-designed templates, and the result is a street network and parcels [3]. I read only the abstract, not the full text. Restricted to axis-aligned cuts, the idea reduces to a binary space partition of the slab rectangle. This is my reduction, not the paper's method:

- A cut is a Road from edge to edge, and later cuts end on it as T-junctions.
- Blocks are the leaf rectangles, and a size rule stops the recursion.
- The pieces of slab are the subtrees, so the Reveal order is a tree walk.

It gives more varied Block sizes than a plain grid, but only T-junctions, so it needs crossroads added by hand. A good second step.

### Parish and Müller L-system

The method grows a street map from an extended L-system. Global goals (population density, a street pattern: basic, raster, radial) pick the direction and length of each new segment, and local constraints (water, parks) prune or rotate it. Roads that meet form crossings, and segments that end near a crossing are extended into it [1]. Blocks are then cut from the map and divided into lots until each is under an area threshold [1].

In this format:

- **Output:** many short segments at arbitrary angles with crossings of any degree.
- **What breaks:** a segment rotated to dodge a boundary leaves a kink, which is a degree-2 node this game has no Junction for. Dead ends inside the map are normal in the method, and here they would be Gateways in the middle of the slab. Crossing degree is unbounded, and a 5-way crossing is neither of this game's types. The result has no rectangle structure, so no rectangular Reveal.
- **Verdict:** the "raster" pattern it offers is a grid [1]. Use the grid directly.

### Chen et al. tensor fields

Chen, Esch, Wonka, Müller and Zhang blend basis tensor fields (regular and radial patterns, boundary-derived fields) into one field, then trace its major and minor eigenvector hyperstreamlines as streets, in a major and minor road hierarchy [2].

- **Output:** curved polylines. The radial basis field gives hubs where several streets meet.
- **What breaks:** the curves must be chopped into straight Roads, and streamlines that run close and parallel give Arms under the 30° minimum.
- **Where it fits:** a radial hub is a plausible roundabout with 3–6 Arms, but the whole system is an interactive design tool [2]. It does not make 5–8 Junction Districts.

### Example-based layouts and real street data

Aliaga, Vanegas and Beneš extract street networks and parcels from real GIS data, then join, expand and blend example fragments into new layouts [4].

- **Output:** real streets, so curves, odd angles, 5-way junctions and parcels of any shape.
- **What breaks:** a 5–8 Junction fragment has to be straightened, and Junctions with the wrong degree or angle rewritten. The pieces-of-slab rule would not hold.
- **Licence:** OpenStreetMap data is under the ODbL. The OSM page says you may distribute a derived database only under the same licence, and that attribution is required [9]. It does not say whether a game map made from the data counts as a produced work, so this needs a legal read before anyone ships a layout derived from it. I would not use it.

### Wave function collapse

The algorithm repeatedly collapses the lowest-entropy cell and propagates adjacency constraints. A contradiction ends the run, and the README does not describe an automatic restart [5]. Karth and Smith describe it as a non-backtracking, greedy search with local constraints that globally restarts on a contradiction [6].

- **Output:** a grid of road tiles whose edges match.
- **What breaks:** a corner tile is a degree-2 Junction, and a dead-end tile is a stub. A tileset of straights, T and cross tiles is a grid with random deletions, and that is the grid generator above.
- **No global guarantees:** nothing in WFC enforces 5–8 Junctions or connectivity. Constraints are local [5][6]. Oskar Stålberg's Bad North generator follows its tile pass with a playability check and restores a saved state when an island fails, and its navigability check is admitted to be a heuristic [7]. That is **secondary**: a journalist's article built on an interview with Stålberg. I could not open his own talks. Even the best-known WFC games generate and then validate.
- **Townscaper:** it subdivides a hexagonal grid into quads [7] (**secondary**), so its cells are not rectangles. That does not fit rectangular Blocks.

### Summary

| Technique | Output here | Breaks | Fit |
| --- | --- | --- | --- |
| Perturbed grid | Rectangles, T and crossroads, roundabouts | Looks like a grid | Best |
| Guillotine split | Rectangles, T only | Needs crossroads added | Good second step |
| L-system [1] | Arbitrary angles and degrees | Kinks, dead ends, high degree | Poor |
| Tensor field [2] | Curved streets, radial hubs | Curves, small angles, interactive | Poor |
| Example-based [4] | Real streets | Straightening, licence | Poor |
| WFC [5][6] | Tile grid | Corners, stubs, no global rules | Adds nothing at this size |

### Scenery

The `scenery` block could also be generated, and none of it is hard:

- **Seed:** a number.
- **Street names:** collinear runs of Roads share a name drawn without repeats from a word list. The list itself is authored content.
- **Avenues:** the longest collinear run.
- **Special Blocks and landmarks:** a park or plaza on a chosen Block, and a tower on a Block big enough for its 38 × 48 m ground (`towerGround`). Only `tower` exists as a landmark type, and only the `city` theme.

Landmark placement needs the Blocks, which come from the renderer's field, so the generator would approximate them from the grid cells. The look of the result needs a human.

## 2. Levels that are guaranteed solvable

Two terms first. A Level here is checked as `levels.test.ts` checks it: Level n is built with Levels 1..n−1 solved, left alone it must have Flow below 0.5 after 180 sim-seconds, and its solution must Win within 300 [ADR 0002](../../docs/adr/0002-reveal-rebuilds-the-simulation.md). Vehicles never reroute around Jams [ADR 0001](../../docs/adr/0001-free-flow-routing.md), so a Level is a deterministic function of the District file, the Changes and the seed.

Generation approaches in the literature fall into constructive (never produces broken content) and generate-and-test (candidates are tested and discarded) [10]. Search-based generation is generate-and-test and has no guaranteed completion time or guarantee of a good result [10]. Everything below is a mix: construct what you can, test the rest with the sim.

### A. Solve first, then break (the base of the recommendation)

Build the Junctions in a configuration that Wins under a Demand. Then apply a break B, a set of Changes the Tools allow, and write B as the Level's `initial`. The `solution` is the inverse of B.

- **By construction:** a solution exists and is in the player's vocabulary. The `tools` list is the Tools B uses, which also gives the teaching restriction for free.
- **Not guaranteed:** that B jams. That the solved configuration Wins at all. That the Jam shows at the intended Junction. These need the sim.
- **Where the sim helps:** run the sim over a Demand scale. Find the smallest scale λ_jam at which B jams on every seed, and the largest λ_win at which the solved configuration Wins on every seed. A Level exists only if λ_jam is below λ_win with room to spare. Choose a scale between them. Both searches are bisection with about six steps each (_estimate_: 5–10 s per candidate Level with 10 seeds and no early exit, from about 50–100 ms per run).

This is the Sokoban idea in this game's terms. Taylor and Parberry build a Sokoban level by laying out a room, placing goals, then searching backwards from the goal state, because any state reached in reverse is solvable when played forward [13]. Smith, Butler and Popović describe the same strategy: search from a solved state to find a guaranteed-distant one and name it the start [11]. The differences here:

- A traffic Change is not a reversible move, so there is no reverse search over states. The search is over configurations (the Connections on or off, the Priority rule of each Arm), and the sim is the outcome function.
- "Farthest from the goal" becomes "needs the most Changes to Win". That is computable by search (see `## Measured cost`).

### B. Search for a jamming Demand

Fix the network and its configuration, and search Demand (rate per Gateway, destination weights) for one that jams at a chosen Junction and clears after a known Change. This is search-based generation with a simulation-based evaluation function [10], and the "where" is the hard part.

- The sim's only score is one Flow number across the whole Revealed network (`src/sim/metric.ts`). The Jam's location needs a per-Junction read (queue length on the Approach lanes, or Spillback reaching an upstream Junction). That read is easy in a script, since `lane.vehicles` and `v.waiting` are public. Asserting it in a test is outside the agreed seams.
- A capacity estimate could steer the search to one Junction. Gap-acceptance capacity formulas (Tanner 1962, and the roundabout models behind the Highway Capacity Manual) are the usual tool. I could not open Tanner or the NCHRP 572 model (see `## Sources`), so I did not use their formulas. Their parameters would not match this sim anyway: its gap acceptance is its own constants (`GAP_AFTER` 1.5 s, `GAP_BEFORE` 1.0 s, car-following by the Intelligent Driver Model [19]). The sim can be its own capacity oracle. One Junction in a fixture, a Demand ramp, and the Flow at which it jams, measured once per Junction type and configuration, gives a table. Demand search then becomes arithmetic on that table.
- Weakness: free search finds jams that do not read, and fixes that are not discoverable. Both need a human.

### C. Authored templates with generated variation

Hand-write each Level pattern once, and let the generator choose where it goes and how big it is. The nearest game example is Spelunky: a level is a 4×4 grid of 16 rooms, each room a 10×8 tile string with random rolls on some tiles, with obstacle overlays picked at random [15]. That source is **secondary** (a modding tutorial), and the same tutorial says the solution path is built by separate code it does not describe. I could not open Derek Yu's book, and the released source is a binary GameMaker file. I would not rely on how Spelunky ensures solvability.

For this game, the patterns come straight from [district-01 spec](../district-01/spec.md):

- **Priority swap:** a heavy stream on the yielding Arm of a T. Fix: swap which Arm is main (Level 2).
- **Lane-locked turn:** a Connection upstream is off, so the downstream Junction jams. Fix: enable it (Level 3).
- **Spillback pair:** the Jam shows at one Junction and the cause is the next one down the road (Level 4).
- **Route shift:** a new shorter Road moves a stream onto a Junction that cannot take it. Fix: disable the Connection the shifted stream takes (Levels 6 and 7).

A template binds to a Junction and carries preconditions the generator can check with no sim, such as "the stream's shortest free-flow path changes at this Reveal", using the sim's own `route`. Then the sim confirms it.

- **By construction:** the template's logic, if it was hand-checked.
- **Still needs the sim:** every instance, because the surroundings change routes and capacity.
- **Why it suits teaching:** the template library is where teaching order lives. Butler et al. generate progressions from a model of what each Level needs the player to do (an imperative procedure for producing solutions, or features common to all solutions) [12]. Annotating each template with the Tool and concept it needs gives the same input, and a progression can be built from it. They tested their approach on a math puzzle game, so this is a model to copy, not evidence it works here.

### Route shifts are not Braess's paradox

The lead was to treat route-shift Levels as Braess's paradox. They are not. Braess's 1968 paradox is that adding a link to a network where each link's travel time depends on its flow can lengthen everyone's trip, because drivers choose the route that looks best to them [17]. ADR 0001 removes the first condition: drivers route by free-flow time and never react to congestion, and its consequences section says Braess-style puzzles are impossible until revisited. The route-shift Levels are plain shortest-path changes when a Road is added. That helps a generator: the shift is a geometric fact about the graph, so it can be found and checked with Dijkstra before any sim run. Roughgarden's results [18] are about choosing which links to keep under selfish routing. There is no polynomial algorithm with an approximation ratio better than n/2 for general latencies, unless P = NP [18]. That is about large networks and is irrelevant at 5–8 Junctions, where enumeration works. I read the conference version, not the journal version [18].

### How the chain of Levels complicates all three

1. **Two phases.** The road graph, the Reveal partition and the pieces are fixed first (the footprint dependence above). Levels are then generated one at a time, because Level n's check applies Levels 1..n−1's solutions and needs nothing after n. A failed Level n means regenerating Level n, and only if every retry fails, the graph.
2. **Earlier Junctions keep simulating.** A break at a new Junction can be hidden or amplified by upstream Junctions, so a Level must be checked with the earlier solutions applied. `levels.test.ts` already does this. A generator must call the same constructor, `new Sim(district, n, solutions)`.
3. **Streams continue through a Reveal.** When a Fog Gateway's Junction is Revealed, a stream that left there continues through it to one of its new Gateways at the same rate, and an entering stream now enters at one of them. A generator can do this mechanically and pick the new Gateway at random. It must also notice when both ends of a stream sit behind the same Junction, because that stream collapses on the Reveal (hazard 2 in the District 1 spec).
4. **Unintended route shifts.** Every Reveal can move a stream onto a newly shorter path. In a template that wants a shift, it is the point of the Level. Everywhere else it is a bug (hazard 1 of the District 1 spec). A generator can diff the free-flow paths before and after each Reveal and reject unplanned shifts.
5. **Re-jams.** Earlier Junctions are in their solved state. A new Level that wants an earlier Junction to re-jam can only do it through a route shift or Demand growth, never by editing it.

## 3. What can be checked automatically

### Already covered

| Check | Where | Notes |
| --- | --- | --- |
| District file is well-formed | `validateDistrict`, run by the `Sim` constructor | Unknown ids and refs, Road length, Arm angles, Demand Gateways, pieces and lanes on the slab. |
| Level jams untouched | `levels.test.ts`: Flow below 0.5 after 180 sim-s | Shipped seed only. |
| Reference solution Wins | `levels.test.ts`: Win within 300 sim-s | Shipped seed only. Earlier solutions applied. |
| Seed robustness | `scripts/sweep.ts`: seeds 1–10, same two checks | A dev script, not a test. |

### What could be added

| Check | Needs | Inside the agreed seams? |
| --- | --- | --- |
| Seed robustness as an assertion (for example jam and win on all 10 seeds) | A loop over seeds in the test | Same outcomes (jammed, won) on more seeds, but the road network spec says tests run only the shipped seed. That is a decision for you. |
| Win margin: Flow well above 0.8, or Win quickly | Read `flow` and `time` after the solution | Outcome, so inside. |
| Jam margin: Flow well below 0.5 | Same | Inside. |
| The fix is needed, not incidental: undo the solution and the Level jams again | One more run | Outcome, so inside. |
| No smaller Change also Wins (solution minimality) | A search over Changes (see below) | Outside. A new kind of test. |
| The Jam is at the intended Junction | A per-Junction queue read | Outside. Not jammed, cleared or won. |
| Intended route shift happens, and no other | Compare `route()` over Reveals | Outside. A routing assertion, and the repo has no network tests by decision. |
| Generator is deterministic: the same seed gives the same District | A test on a new generator module | Outside. A new seam. |
| A generated District passes `validateDistrict` for seeds 1..N | A test on a new generator module | Outside. A new seam. |
| Blocks are 40–60 m and the look is right | The renderer | Outside by decision: `src/render` is verified by running the game. |

If generation runs offline and writes files to `levels/`, the existing test covers every shipped District and the generator itself needs only a dev script, as `sweep` and `bench` are. If generation ran in the browser at play time, nothing would test its output before the player sees it, and the sweep would have to run inside the generator. That is the main fork for the grilling.

### Measured cost

All _measured_ on the existing Level 1 (roundabout, 4 Arms, 2 lanes).

| What | Result |
| --- | --- |
| `npm run sweep` | 1.7 s wall, including starting Vite. Output: Level 1 jams on 9 of 10 seeds (seed 4 does not) and wins on 10 of 10. |
| `npx vitest run levels` | 1.25 s wall, 2 tests, 0.45 s reported duration. |
| Sim speed, roundabout, 68 vehicles | About 4,600 sim-seconds per wall-second in a warm process. 10 seeds with both checks (4,869 sim-s) took 1.06 s, so 105 ms per candidate per seed. |
| Sim speed, 9-Junction grid fixture, 45 vehicles | About 2,860 sim-s per wall-s. |
| Sim speed, `npm run bench`, 4 Junctions, about 1,000 vehicles | 0.59 ms per frame at 8×, about 226 sim-s per wall-s. Cost grows with vehicle count. |
| 48 single-Connection flips, each a full 300 s Win run | 146 ms each, 7.0 s in all. |

What this means for generate-and-test:

- **Single-seed candidate checks:** about 570 a minute on one core (_estimate_ from 105 ms). Most bad candidates fail the first seed, so early exit is cheaper than that.
- **A 10-seed acceptance:** about 1 s, so about 57 candidates a minute per core. Sims are independent, so more cores should scale it (not measured).
- **A whole District of 6–7 Levels, 10 seeds each:** roughly 10–20 s (_estimate_: the 9-Junction fixture runs at 60% of the roundabout speed, and Levels will carry more vehicles than the fixture's 45).
- **Real Levels have tens to a few hundred vehicles**, not the 1,000 of the bench, so the 4,600 and 2,860 figures are the right range.

#### The window is narrow

I scaled every Gateway's rate in Level 1 and ran seeds 1–10 (_measured_, throwaway script):

| Demand × | 0.8 | 0.9 | 1.0 (shipped) | 1.1 | 1.25 | 1.5 |
| --- | --- | --- | --- | --- | --- | --- |
| Jams untouched | 2/10 | 4/10 | 9/10 | 10/10 | 10/10 | 10/10 |
| Wins with the solution | 10/10 | 10/10 | 10/10 | 7/10 | 3/10 | 0/10 |

No scale has 10 of 10 on both. The solved roundabout only has about 10–25% more capacity than the broken one, so near the shipped Demand the result is seed-sensitive. The hand-tuned Level sits at the edge of that window, and the "7 of 10 seeds" rule of the District 1 spec is what lets it pass. A generator has no human to nudge Demand, so it needs a stricter bar (for example 10 of 10 on both, with margin) and break types with a wide capacity gap. I have no data on other break types, since no other Level exists. Measuring a priority-swap Level on a T-junction is the first thing the prototype should do.

#### The Change space

Counts from `buildNetwork` for each Junction (_measured_, built with 7 m lanes and a right-angle T):

| Junction | Candidate Connections | On by default | Connector subsets | Priority settings |
| --- | --- | --- | --- | --- |
| T, 1 lane | 6 | 6 | 2^6 = 64 | 2^3 = 8 |
| T, 2 lanes | 24 | 8 | 2^24 ≈ 1.7 × 10^7 | 8 |
| Crossroads, 1 lane | 12 | 12 | 2^12 = 4,096 | 2^4 = 16 |
| Crossroads, 2 lanes | 48 | 16 | 2^48 ≈ 2.8 × 10^14 | 16 |
| Roundabout, 4 Arms, 1-lane Ring | 12 | 12 | 2^12 = 4,096 | none |
| Roundabout, 4 Arms, 2-lane Ring | 48 | 24 | 2^48 ≈ 2.8 × 10^14 | none |

Single flips are the number of candidate Connections plus the number of Arms (priority). A Revealed network of five such Junctions has roughly 60–250 single flips. Exhaustive checks:

- **All single flips, anywhere in the network:** 60–250 runs at about 150 ms each (_measured_: 146 ms), so 9–40 s per Level. It answers "does one Change fix this?" including a Change at an upstream Junction (the Levels 3 and 4 trap).
- **All pairs:** 1,800–31,000 runs, so about 5–80 min per Level on one core (_estimate_). Feasible offline on several cores. All triples are not. Exhaustive generation with a solver has precedent: Fogleman enumerated every 6×6 Rush Hour layout meeting his rules and analysed each one, 2.6 million puzzles in about 17 hours on 72 cores [14].
- **Raw Connection flips are the wrong alphabet.** The Level 1 solution flips about 20 Connections, since the file's `*` sets one Connection at every Arm. All 48 single flips on Level 1 leave it jammed (_measured_: none Wins). The right unit is a Change as the player makes it, which for the connector is not fixed yet ([#7](https://github.com/artsaraiva/clearway/issues/7) and [#15](https://github.com/artsaraiva/clearway/issues/15) decide it). With `*` classes, the 4-Arm 2-lane roundabout has 12 classes (6 on by default, 5 in Level 1's initial configuration), so 2^12 = 4,096 subsets. I ran all of them on Level 1, shipped seed (_measured_, throwaway script): 356 s in all, 87 ms each. 58 subsets Win. None flips fewer than 4 classes, and 3 flip exactly 4, for example enable `*.in1>*.ring1`, `*.ring1>*.ring1`, `*.ring1>*.out0` and disable `*.in1>*.ring0`. The shipped reference solution flips 5. The road network spec's own 4-class example, which leaves `*.ring0>*.out1` on, does not Win (Flow 0.71 on the shipped seed). So the hand-written solution is not the shortest winner, which is the kind of finding a minimality check gives. It is also a reminder that any Win counts, so a generator's solution is one of several. On this one Level the exhaustive check is cheap (about 6 min on one core, under a minute on ten).

### What only a human can judge

- **Whether the Jam reads.** The sim reports Flow. Whether a player sees a queue at one Junction and understands it is the diorama's job: anger marks, shaking, steam ([visual style spec](../visual-style/spec.md)).
- **Whether the fix is discoverable.** Uniqueness (no smaller fix) is checkable, but a unique fix can still be undiscoverable.
- **Teaching order.** Which Tool is introduced where, and whether a Level follows from the last. The templates can carry it. The ordering is a design choice.
- **Pacing.** The 2–5 minutes per Level is mostly player time. A Win needs Flow at or above 0.8 for 60 sim-s with a 20 s moving average, so at least about 80 sim-s after the fix, 20 s of real time at the default 4×. The rest is thinking.
- **Theme and look.** Whether the District looks planned, where the park goes, whether Blocks near seams look right.
- **Which solutions count as shortcuts.** In the District 1 spec any configuration that Wins counts. Smith, Butler and Popović call undesirable ways through a puzzle "shortcut solutions" and formalise excluding them as a very hard search [11]. For this game, minimality plus a human look is enough.

Mixed-initiative tools point the same way. Sentient Sketchbook tests a designer's map for playability constraints and offers generated alternatives [16]. The designer judges. A preview of the generated District with its Levels, for a human to accept, is the natural shape of the tool here.

## Recommendation

**Authored templates with generated variation, run offline.**

Why:

- Solvability comes from the template's solution and the sim, not from luck. Everything else the sim can decide, it decides.
- Generation of the road graph is cheap and safe. The grid keeps every hard constraint, and the existing renderer already handles its Blocks.
- The things a generator cannot judge (the Jam reads, teaching order, theme) stay with a human, who reviews a few finished candidates instead of authoring each one.
- Offline output is a normal `levels/district-NN.ts`. The current tests, the sweep and the renderer need no change.
- Fully generated Levels (approach B as the main route) would find jams that do not read and give no teaching order. Staying hand-authored is fine for a few Districts.

Risks:

- **A narrow window.** Shown above for Level 1. Templates with a small capacity gap will fail the strict bar most of the time. Measure the gap of each template before building around it.
- **One real Level of evidence.** Everything about the sim is measured on a single roundabout Level.
- **Every District looks like a grid.** Variety comes from theme and Block fill.
- **The word "hand-authored" is in the glossary** (District). If Districts are generated, that entry changes, which is for you to decide.
- **Teaching order across Districts is open.** District 1's teaching Levels restrict Tools. A later District can assume every Tool is known, which changes what a template is for.

First step, small and throwaway: a script outside `src/` (like `sweep`) that, for a seed, builds a 2×4 or 3×3 warped grid with 5–8 Junctions, a column-sweep Reveal and its pieces, and passes `validateDistrict`. Then it writes one template Level, the priority swap on a T, with the Demand scale bisected on 10 seeds. Report how many seeds of the grid produce a Level that passes a 10-of-10 bar, and how wide the Demand window is. That answers whether the strict bar is reachable before anyone designs a tool around it.

### Is a grilling ticket worth opening?

Yes, before any build, because the answers change the design. It should settle:

1. **Purpose.** An offline content pipeline for shipped Districts, or endless generated Districts at play time? The second needs generation-time checks, since no test sees the output.
2. **How many Districts** are planned. If under about five, stay hand-authored and generate only the scaffolding.
3. **Teaching across Districts.** Does District 2 onward assume all Tools are known, and what does that do to the Tool restriction per Level?
4. **What "difficulty" means.** Minimum number of Changes? Whether the fix is upstream? Distinct Junctions involved? And what counts as one Change for the connector.
5. **Acceptance bar.** Seeds (10 of 10?), margins, whether to allow a human to nudge Demand after generation.
6. **Uniqueness.** Must the fix be the only one of its size, or is "any configuration that Wins counts" enough?
7. **New test seams.** Is a generator-determinism check or a sweep-as-test wanted? The pre-agreed list does not include them.
8. **Shape of the road graph.** Warped grid only, or add guillotine splits. Whether roundabouts are placed by the generator.
9. **Scenery.** Generate names and landmarks, or keep them authored.
10. **Workflow.** What the human sees and approves: a preview of the District, its Levels and their jams.
11. **Real street data.** Confirm it is out of scope, given the ODbL question.
12. **Glossary.** Whether "hand-authored" leaves the District entry.

## Sources

Opened and read:

1. Parish, Y. and Müller, P., "Procedural Modeling of Cities", SIGGRAPH 2001. https://cgl.ethz.ch/Downloads/Publications/Papers/2001/p_Par01.pdf (ETH Zürich, authors' group)
2. Chen, G., Esch, G., Wonka, P., Müller, P. and Zhang, E., "Interactive Procedural Street Modeling", ACM Trans. Graph. 27(3), 2008. https://web.engr.oregonstate.edu/~zhange/images/street_sig08.pdf (co-author's page)
3. Yang, Y.-L., Wang, J., Vouga, E. and Wonka, P., "Urban Pattern: Layout Design by Hierarchical Domain Splitting", ACM Trans. Graph. 32(6), 2013. **Abstract only**, from the university record https://asu.elsevierpure.com/en/publications/urban-pattern-layout-design-by-hierarchical-domain-splitting. The full text could not be fetched (the author's PDF returned an error, a mirror returned HTML).
4. Aliaga, D. G., Vanegas, C. A. and Beneš, B., "Interactive Example-Based Urban Layout Synthesis", ACM Trans. Graph. 27(5), 2008. https://www.cs.purdue.edu/homes/bbenes/papers/Aliaga08ToG.pdf (author's page)
5. Gumin, M., WaveFunctionCollapse README. https://github.com/mxgmn/WaveFunctionCollapse
6. Karth, I. and Smith, A. M., "WaveFunctionCollapse is Constraint Solving in the Wild", FDG 2017. https://escholarship.org/content/qt1f29235t/qt1f29235t.pdf (DOI 10.1145/3102071.3110566)
7. Thompson, T., "How Townscaper Works: A Story Four Games in the Making", Game Developer, 2022, from an interview with Oskar Stålberg. https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making **Secondary.** Stålberg's own talks could not be opened.
8. SUMO documentation, netgenerate. https://sumo.dlr.de/docs/netgenerate.html
9. OpenStreetMap copyright and licence page. https://www.openstreetmap.org/copyright
10. Togelius, J., Yannakakis, G. N., Stanley, K. O. and Browne, C., "Search-Based Procedural Content Generation: A Taxonomy and Survey", IEEE TCIAIG 3(3), 2011. http://julian.togelius.com/Togelius2011Searchbased.pdf (author's page)
11. Smith, A. M., Butler, E. and Popović, Z., "Quantifying over Play: Constraining Undesirable Solutions in Puzzle Design", FDG 2013. https://grail.cs.washington.edu/wp-content/uploads/2015/08/smith2013qop.pdf
12. Butler, E., Andersen, E., Smith, A. M., Gulwani, S. and Popović, Z., "Automatic Game Progression Design through Analysis of Solution Features", CHI 2015. https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/chi15-game.pdf
13. Taylor, J. and Parberry, I., "Procedural Generation of Sokoban Levels", GAMEON-NA 2011. https://ianparberry.com/pubs/GAMEON-NA_METH_03.pdf (author's page)
14. Fogleman, M., "Solving Rush Hour, the Puzzle", 2018. https://michaelfogleman.com/rush. It enumerated every 6×6 layout meeting its "interesting" rules, 2,577,412 puzzles in all, in about 3 h 10 m for no walls on a 4-core machine and about 17 h on 72 cores for up to two walls. Cited for the precedent of exhaustive generation with a solver.
15. tinysubversions.com (Darius Kazemi's site), "Tutorial: Modding Spelunky's Level Generator", 2010. https://www.tinysubversions.com/2010/01/tutorial-modding-spelunkys-level-generator/index.html **Secondary.**
16. Liapis, A., Yannakakis, G. N. and Togelius, J., "Sentient Sketchbook: Computer-Aided Game Level Authoring", FDG 2013. https://mail.antoniosliapis.com/papers/sentient_sketchbook.pdf (author's page)
17. Braess, D., Nagurney, A. and Wakolbinger, T., "On a Paradox of Traffic Planning" (translation of Braess 1968), Transportation Science 39(4), 2005. https://homepage.rub.de/dietrich.braess/Paradox-BNW.pdf (Braess's homepage)
18. Roughgarden, T., "Designing Networks for Selfish Users is Hard", FOCS 2001. https://www.cs.cornell.edu/timr/papers/nd_hard_full.pdf (author's page). This is the conference version of "On the severity of Braess's Paradox: Designing networks for selfish users is hard", JCSS 72(5), 2006, which I could not open.
19. Treiber, M., Hennecke, A. and Helbing, D., "Congested Traffic States in Empirical Observations and Microscopic Simulations", Phys. Rev. E 62, 2000 (arXiv cond-mat/0002177). **Abstract only.** https://arxiv.org/abs/cond-mat/0002177. Cited only for the Intelligent Driver Model's existence.

Repo sources are cited by path: `GLOSSARY.md`, `.scratch/game/map.md`, `.scratch/road-network/spec.md`, `.scratch/visual-style/spec.md`, `.scratch/district-01/spec.md`, `levels/`, `src/sim/`, `src/render/`, `src/dev/street-grid.ts`, `scripts/`, `docs/adr/`.

Leads dropped or not opened:

- **Smith and Mateas, "Answer Set Programming for Procedural Content Generation" (2011):** the only copy found was a course-site copy that returned an error. Its use in Smith, Butler and Popović is described in [11].
- **Murase, Matsubara and Hiraga (PRICAI 1996):** the publisher page needed a login. Taylor and Parberry say their room generation is "somewhat similar" to it [13], and I say no more than that. It is not a reverse-play method as the lead suggested. What I could see of its abstract listing says it generates candidates and filters them with a solver, but I did not read it.
- **Kartal, Sohre and Guy (AIIDE 2016):** the AAAI page blocked automated access and the project page had a certificate error.
- **Tanagra (Smith, Whitehead, Mateas):** not opened. Karth and Smith mention it as a backtracking constraint-solving level tool [6].
- **Tanner 1962 and the roundabout capacity model (NCHRP 572, FHWA guide):** Tanner is paywalled, the NAP page had no text and the FHWA guide returned 403. No capacity formula is used in this note.
- **Derek Yu's *Spelunky* book and the Spelunky Classic source:** the book is not online and the released source is a binary GameMaker file. Only secondary [15].
- **Oskar Stålberg's own talks (Bad North, Townscaper):** videos, no transcript found. Only [7].
- **Mini Motorways or other city and traffic game postmortems on map generation:** searched, and found no first-party source on how their maps are made, so none is cited.
- **Shaker, Togelius and Nelson, *Procedural Content Generation in Games* (pcgbook.com):** not opened.
