# Traffic Puzzle Game: Map

The parent for everything after the prototype. Open tickets are [GitHub issues](https://github.com/artsaraiva/clearway/issues); resolved grilling tickets stay in `issues/` as records. Each topic that resolves into build work gets its own `.scratch/<topic>/spec.md`, and its tickets go to GitHub.

**Open work:** see the section at the bottom, or the GitHub issue list.

## Vision

A browser puzzle game: the player fixes traffic jams by changing how junctions work (lane connections, right of way, signals, and more), then watches the jam clear. Look (since [#16](https://github.com/artsaraiva/clearway/issues/16)): an anime-flavoured miniature diorama, built on the Apple Maps 3D look that came first. The original Apple Maps brief was a white/off-white ground, gray roads with curbs and sidewalks, rounded corners, lane markings, crosswalks, grass, blobby low-poly trees, light-gray extruded buildings, and in-world signs. See `reference/apple-maps-roundabout.png` (local only: third-party imagery is gitignored and never published). Later: a chain of junctions and roundabouts, where fixing one opens the next.

## Notes

- Prototype: `.scratch/traffic-prototype/spec.md`, built in commit `9ea74dd`. Run with `npm run dev`; test with `npm test`.
- What the prototype has: `src/sim/` (seed-quality, pure TS) with a 4-arm roundabout generator, IDM car-following, gap acceptance, BFS routing, yield/stop/signal, a flow metric and a seeded RNG. `src/render/` and `src/ui/` are throwaway.
- Prototype findings (details in the spec's `## Comments`):
  - The jam and the inner-ring connector fix read well visually.
  - Fixed-cycle signals on the side arms never beat plain yield. Fixed signals can't add ring capacity, and red time adds stopped cars to the metric. Signals are unproven as a tool.
  - The headless result is seed-sensitive: about 8 of 10 seeds pass each scenario.
  - The flow metric needed `v_free` redefined (free speed at that spot) and a 60 s warm-up before the win timer.
- Code review open items:
  - `Sim` does spawn, routing, driving, rules and metric in one class.
  - Ports are plain strings (`approach1>ring0`).
  - `Lane.arm` means three things.
  - No direct tests for geometry or network.
- User verdict on the prototype: "an ok prototype". 1× was too slow, so 4× is now the default.
- Workflow: grilling ticket, then `spec.md`, then split into `issues/NN-*.md`, then `/implement` each one (it ends with code review and a commit). Start `GLOSSARY.md` via `/domain-modeling` during the first grilling.

## Decisions so far

- Platform stays browser, Three.js + TypeScript + Vite, no game engine. (prototype grilling)
- Simulation stays microscopic and deterministic: IDM, gap acceptance, seeded RNG. `src/sim/` has no Three.js import. (prototype grilling)
- Prototype closed 2026-11-09: rubric 4 of 4 yes (jam read as a jam, connector change visibly mattered, look direction right, build the chain). Spec marked done.
- Core loop (01, 2026-11-09). Details in `issues/01-core-loop.md` under Answer. Vocabulary in root `GLOSSARY.md`.
  - Progression: one hand-authored District per map, revealed one Junction at a time. Fog is presentation; fogged junctions don't exist in the sim. All revealed junctions simulate together. Upstream junctions stay editable.
  - Demand is authored per Level and changes on each Reveal. Re-jamming an upstream junction is a deliberate puzzle beat.
  - Win: Flow (`v / v_free`, queued spawns count 0) ≥ 80 % for 60 sim-seconds across the whole revealed network. Unreachable destinations no longer re-roll; the car waits at spawn and counts 0, so cutting routes can't delete demand.
  - Pure puzzle: fixed demand within a level, no ramp, no clock, no lose state. Ramping only as an authored event if a level needs it.
  - Feedback: Pre-warm each level ~90 s hidden on Reveal, so the jam is visible at once and the 60 s warm-up goes. Speeds pause/1×/4×/8×, default 4×. Win banner, sim keeps running, player clicks next to Reveal.
  - Brute force: first playable has no change limit and no budget. Each level lists its allowed tools. Change counts, budgets and stars are backlog, decided after a district plays end to end.
  - Reset-to-initial per level. Undo is backlog.
  - Pacing target: 2–5 min per level, 5–8 junctions per district.
  - First playable: one district, 4 levels: (1) prototype roundabout, connector only; (2) T-junction, priority rule; (3) crossroads where the fix is upstream; (4) two junctions revealed at once, spillback. Tools: connector, yield/stop. Signals cut until 02 proves them. Screens: fogged map, gauge, win banner, next-level reveal. No menu, no save.
- Player tools (02, 2026-11-09). Details in `issues/02-player-tools.md` under Answer; spec in `.scratch/player-tools/spec.md`.
  - District 1 Tools: connector, Priority rule as main/yield per Arm (stop dropped). A Junction-wide Signal was planned on condition of a crossroads gate test; it failed (see the Signal gate note below), so the Signal is out of v1.
  - Turn bans, one-way and closures are connector moves. Roundabouts take connector only; the Priority rule applies to crossroads and T-junctions.
  - Conflict rules: equal Arms give way to the right, left turn yields to oncoming straight, yield Arm yields to every main Arm.
  - Inspector: read-only, always available, not in `Level.tools`. First one: click a car, its route lights up. Heatmap, queue bars, desire lines are backlog.
  - District 1 is 7 Levels: 1–4 from 01, 5 crossroads (a main-road swap, since the Signal failed its gate), 6 remove a Connection, 7 finale that re-jams the roundabout.
  - Backlog: lane arrows, add/remove lane, junction type swap.
- Look-dev (03, 2026-11-09). Details in `issues/03-look-dev.md` under Answer; the throwaway scene (`/lookdev.html`, `src/lookdev/`) was deleted from `main` in [#32](https://github.com/artsaraiva/clearway/issues/32); screenshots in `reference/lookdev-*.png`.
  - Verdict: Three.js reaches the look cheaply. Rubric 4 of 4, user confirmed: same family, kerbs and mouths legible, about 1.9 ms per frame with 1,000 cars at retina resolution on an M4 Pro, road from lane polylines only.
  - Chosen: perspective free-look camera (35° FOV, `MapControls`); a ground shader over one baked distance-field texture (road SDF from lane capsules plus a morphological close, island flood fill, grass SDF, contact AO); static AO instead of shadows; no post-processing; instanced trees and cars; merged markings and buildings.
  - For 04: no separate road outline needed, but road edges need attributes (bike band, sidewalk, medians, splitter islands), and props need block polygons from the road graph's faces.
- Road network model (04, 2026-11-09). Details in `issues/04-road-network-model.md` under Answer. The spec is `.scratch/road-network/spec.md` with issues #1–#5 on GitHub. ADRs are in `docs/adr/` (0001 routing, 0002 Reveal).
  - One hand-written TS file per District in `levels/`: a road graph (Junctions joined by straight Roads, lanes per direction, edge attributes) plus ordered Levels with their reference solutions.
  - Two Junction types: roundabout and priority junction (T, crossroads). Each generates default Connections, and the file lists only deviations. Refs look like `J1: R1.in0>R1.ring0`. No lane changes.
  - Drivers route by free-flow travel time and never reroute around Jams (ADR 0001).
  - Trips start and end only at Gateways: the District edge, or a Road whose far Junction is still in Fog.
  - A Reveal rebuilds the sim, carries Changes over, then Pre-warms (ADR 0002).
  - Pedestrians and bikes are decoration. Blocks and their fill belong to the visual-style effort.
  - Seeds: vehicle type is drawn at arrival, and tests run only the shipped seed. Level tests apply earlier solutions, then check jammed and Win.
- Visual style split out of 03 as its own grilling, [#16](https://github.com/artsaraiva/clearway/issues/16) (2026-11-09).
- Visual style ([#16](https://github.com/artsaraiva/clearway/issues/16), 2026-11-13). Spec in `.scratch/visual-style/spec.md`; the prototype (`/diorama.html`, `src/lookdev/`) was deleted from `main` in [#32](https://github.com/artsaraiva/clearway/issues/32) and stays on the local branch `16-visual-style-prototype` (and in history at `37a6488`); screenshots in `reference/diorama-*.png`.
  - The target is the user's "Anime Map Diorama" design: a Japanese-flavoured toy town on a floating slab. Four looks were prototyped (cel shading, hand-inked, painterly, diorama); the diorama on a street grid won.
  - Recipe: standard soft-lit materials, tone mapping, one soft shadow map, contact-shadow decals, no post-processing except an optional night bloom. Style comes from shape, palette and proportion. All procedural, no authored assets.
  - Overturns look-dev (03): orthographic grab-to-rotate camera instead of perspective, real shadows instead of static AO, and raised Blocks cut from lane geometry instead of the baked ground shader.
  - Fog has no visual: the District is a slab that grows. A Reveal drops the next piece in brick by brick; each Level authors its piece as a rectangle.
  - Proportion is the look: lanes about 7 m wide, Blocks 40–60 m. Landmarks are authored, the rest is seeded lot fill. Districts are themed.
  - Jam emotion (anger marks, shaking, steam, speech bubbles) is the main in-world jam signal. Priority shows as road paint that follows Changes. Clicking a car shows its route.
  - Full cosmetic day cycle; night stays bright. Clouds fade on zoom; planes, boats and pavement walkers are decoration.
  - First playable District becomes a small street grid, with the roundabout later. This contradicts the junction chain (06) and needs its own grilling before [#8](https://github.com/artsaraiva/clearway/issues/8)–[#14](https://github.com/artsaraiva/clearway/issues/14) are built.
  - Measured: 9.9 ms per frame with 1,000 cars at 2× pixel density on an M4 Pro.
- Junction chain (06, 2026-11-12). Details in `issues/06-junction-chain.md` under Answer; spec in `.scratch/district-01/spec.md` with one issue per Level.
  - District 1 is a ladder of 8 Junctions (2 roundabouts, 3 T, 3 crossroads), Revealed clockwise; loops appear only as Blocks close in Levels 5–7.
  - Levels 3 and 4 are a pair: jam visible downstream with the fix upstream, then the reverse. Levels 6 and 7 are route-shift puzzles: removing a Connection sends traffic back the way that worked.
  - Teaching Levels restrict Tools. Streams continue through a Reveal at the same rate; only Level 7 re-jams an earlier Junction.
  - Sim change: a car on the map whose destination becomes unreachable re-plans to the nearest reachable Gateway (in [#4](https://github.com/artsaraiva/clearway/issues/4)).
- Procedural Districts ([#34](https://github.com/artsaraiva/clearway/issues/34), research, 2026-11-14). Findings and sources in `.scratch/procedural-districts/research.md`; grilling in [#43](https://github.com/artsaraiva/clearway/issues/43).
  - Recommendation: authored Level templates with generated variation, run offline. A tool writes `levels/district-NN.ts`, the sim checks it, and a human playtests and commits it, so `levels/levels.test.ts` covers the output with no new test seam. Stay hand-authored if only a few Districts are planned.
  - Road graph: a warped grid (column and row spacing varied, a few Roads removed for T-junctions, the odd small roundabout). It stays axis-aligned, so Blocks are rectangles and each Reveal adds rectangular pieces. L-systems, tensor fields and wave function collapse output curves, kinks, dead ends and 2-Arm corners the District file can't hold.
  - Levels: start from a configuration that Wins, apply a break as `initial`, and the solution is the break undone, so a solution exists by construction. The sim decides whether the break jams and the fix wins, over seeds. A human judges whether the Jam reads, whether the fix is discoverable, teaching order and theme.
  - A check costs about 100 ms per candidate per seed. The risk is a narrow window: no Demand scale makes Level 1 both jam and win on all 10 seeds, so a generator needs a stricter bar than 7 of 10 and break types with a wide capacity gap.
  - Route-shift Levels are shortest-path changes, not Braess's paradox (ADR 0001 rules that out), so routing can find them before any sim run. `footprint()` reads Roads still in Fog, so a District's road graph is fixed before its Levels are generated.
  - Found on the way: three 4-class Changes Win Level 1, one fewer than the shipped solution's 5.
- Procedural Districts ([#43](https://github.com/artsaraiva/clearway/issues/43), grilling, 2026-11-14). Answer in the issue; issues [#45](https://github.com/artsaraiva/clearway/issues/45)–[#49](https://github.com/artsaraiva/clearway/issues/49). The spec (`.scratch/procedural-districts/spec.md`) is written after [#45](https://github.com/artsaraiva/clearway/issues/45) reports.
  - The game is an authored campaign first, with a procedural mode as a later goal. Four stages: District 1 hand-authored ([#33](https://github.com/artsaraiva/clearway/issues/33)); a dev-time tool generates the scaffolding and Levels are written by hand ([#46](https://github.com/artsaraiva/clearway/issues/46)); proven Level patterns become templates, so the tool generates whole Districts that a human reviews ([#47](https://github.com/artsaraiva/clearway/issues/47)); the same code runs in the browser ([#48](https://github.com/artsaraiva/clearway/issues/48)).
  - The generator is pure TypeScript beside `src/sim`, with no Node-only code. No backend server.
  - A generated District is bounded: 5–8 Junctions, about 7 Levels, a fixed generation time budget. The number of Districts is unlimited, each from a seed.
  - Gate: [#45](https://github.com/artsaraiva/clearway/issues/45) checks a warped grid and one priority-swap Level against the bar before any spec. If the bar is out of reach, the plan stops at reviewed Districts.
  - Acceptance bar for generated Levels: jam untouched and Win with the solution on 10 of 10 seeds, Demand mid-window, and a window at least 20% wide. Hand-written Levels keep 7 of 10. Demand may be nudged by hand until the browser stage.
  - Difficulty is the template kind plus the number of Junctions involved, not a count of Changes. The connector's Change unit stays with [#7](https://github.com/artsaraiva/clearway/issues/7) and [#15](https://github.com/artsaraiva/clearway/issues/15).
  - Any configuration that Wins counts. A search for smaller fixes is a report, not a rejection rule.
  - Generated Levels allow every Tool. Authored campaign Districts may restrict Tools to teach.
  - Road graph: a warped grid only, Priority junctions first. Roundabouts follow [#33](https://github.com/artsaraiva/clearway/issues/33)'s Ring size ([#49](https://github.com/artsaraiva/clearway/issues/49)). Guillotine splits and real street data are dropped.
  - Scenery is generated in full from an authored word list, and stays editable in the file. Review is the normal game loading the file, plus the seed sweep; no preview screen.
  - Test seams are unchanged. The determinism test is a question for [#48](https://github.com/artsaraiva/clearway/issues/48).
  - Glossary: "hand-authored" left the District entry.
- Procedural Districts check ([#45](https://github.com/artsaraiva/clearway/issues/45), prototype, 2026-11-14). Report in the issue; the throwaway script is `scripts/priority-swap.ts`.
  - Verdict: **not reachable**. 0 of 24 generated grids have a priority-swap Level that meets the bar, out of 103 Levels (one per T-junction). Every grid passed `validateDistrict`.
  - The window is inverted. The highest Demand that Wins on 10 of 10 seeds is 0.46–0.68 times the lowest that jams on 10 of 10; the bar needs 1.2. No scale in the gap does both. No looser bar helps: on a T-junction alone, the best of 588 Demand mixes jams on 4 of 10 seeds and Wins on 4.
  - Reading: the swap moves the queue from one Arm to the other and leaves Flow about the same. In nearly every mix the seeds that jam and the seeds that Win add up to about 10, so the Level jams or Wins by its seed, not by its Priority rule.
  - Measured with 7 m lanes, 56–64 m between parallel Roads, 8 m/s and 60 m Gateway Roads, none settled until [#33](https://github.com/artsaraiva/clearway/issues/33). The T-junction alone was also scanned at 13.9 m/s and with 200 m Roads, with the same result.
  - By [#43](https://github.com/artsaraiva/clearway/issues/43)'s gate the plan stops at generated Districts reviewed by a human ([#47](https://github.com/artsaraiva/clearway/issues/47)); [#48](https://github.com/artsaraiva/clearway/issues/48) is told. Only the priority swap was measured, so other templates are still unknown.
- Yielding costs time ([#52](https://github.com/artsaraiva/clearway/issues/52), 2026-11-14). Findings in the issue; decision in `docs/adr/0003-yielding-costs-time.md`.
  - Cause of [#45](https://github.com/artsaraiva/clearway/issues/45)'s result: a T-junction carried about 23–25 vehicles a minute in total whichever Arm was main, so a swap only moved the queue. Gap times and the rules in `conflicting` were not the lever.
  - Change: a vehicle that must yield to a main Arm slows to a crawl at its line even when nobody is coming. A yield Arm now carries less than a main one.
  - This overturns [#45](https://github.com/artsaraiva/clearway/issues/45)'s verdict. With a nearly empty stem, 24 of 24 grids have a priority-swap Level that meets the bar at 13.9 m/s (62 of 103 Levels, windows 1.05–1.53×). At 8 m/s only 4 of 24 do (windows 0.97–1.25×), because a lane tops out near 25 vehicles a minute.
  - So the bar is reachable, and the speed of a 7 m-lane District decides it. That is one more input for [#33](https://github.com/artsaraiva/clearway/issues/33). [#48](https://github.com/artsaraiva/clearway/issues/48) is no longer on hold.
  - Playtested on the street-grid fixture (2026-11-14): the crawl looks fine. That fixture now jams, since every east–west Road there yields.
- District 1 on the diorama ([#33](https://github.com/artsaraiva/clearway/issues/33), grilling, 2026-11-14). Answer in the issue; spec rewritten in `.scratch/district-01/spec.md`; Level issues [#56](https://github.com/artsaraiva/clearway/issues/56)–[#62](https://github.com/artsaraiva/clearway/issues/62). This replaces the ladder from the junction chain (06).
  - Scale: lanes are 7 m in the sim as well as on screen, one geometry. Speed limit 13.9 m/s; if it looks frantic, the default play speed drops to 2× and the sim speed stays.
  - Layout: a 4 × 2 grid of eight Junctions (3 T, 4 crossroads, 1 roundabout), every Road axis-aligned, Revealed clockwise. Columns 90 m apart, rows 80 m, slab about 370 × 210 m. Eight edge Gateways.
  - Queue room: two lanes each way only on the path of the heavy streams (the north row, N2, J4–J5, J5–J6). Those Roads keep about 52 m of lane, 8 cars per lane. J4–J5 keeps 30–35 m on purpose, for Spillback.
  - Roundabout: one, in the south-east corner, Revealed in Level 4 as the cause of the Spillback. Two Ring lanes on a radius of about 18 m. [#49](https://github.com/artsaraiva/clearway/issues/49) copies that size.
  - Lessons, in order: Priority rule on a T-junction, connector (an unused lane), fix upstream, Spillback, a main-road swap at the J6 crossroads, turn ban, and a finale that re-jams J1. Teaching Levels restrict Tools.
  - Route shifts in Levels 6 and 7 come from speed limits on the cross streets (8, 11 and 13.9 m/s), not from slanted Roads.
  - Each Level adds one strip of slab (Level 4 adds two), tiling to a rectangle.
  - The single-roundabout Level is retired, not re-tuned. The determinism test moves to the new Level 1, and the street-grid dev fixture is deleted with it.
  - [#7](https://github.com/artsaraiva/clearway/issues/7) blocked only Level 5 and ran its gate once, at 7 m lanes and 13.9 m/s.
  - Estimates to pin while authoring: a two-lane Junction's footprint (about 19 m) and the lane left on J4–J5.
- Signal gate ([#7](https://github.com/artsaraiva/clearway/issues/7), 2026-11-14): **failed, so the Signal is out of v1.** The sweep is in the issue's comments; the prototype and its sweep script are in commit `1aa628e`.
  - The Signal tried: per Priority junction, each Arm green in turn with a fixed equal split (6–20 s green, 1–3 s all red), Priority rules ignored while on.
  - With straight crossing streams, one or two lanes, Roads of 200–300 m, 6–20 arrivals a minute per Gateway: the best Priority arrangement beat the Signal in every case, and the Signal never reached Flow 0.80. Where every Priority arrangement jams, the Signal jams harder.
  - Why: a four-Arm cycle gives each Arm a quarter of the time, and every car standing at red counts as 0 in Flow. On Roads this short the wait is a large share of the trip.
  - The Signal does beat every Priority arrangement in one corner: two lanes, about half the cars turning left, 9 to 12 a minute per Gateway. It reaches 0.80 there only on Roads of 600–800 m, and holds it for 60 s on at most 3 seeds of 6. District 1's Roads are 80–90 m.
  - Level 5 ([#60](https://github.com/artsaraiva/clearway/issues/60)) is a main-road swap at the J6 crossroads, Priority rule only.
  - Worth another look only with something this Signal lacks: opposite Arms sharing a green, or timing that follows the queues. Not ticketed.

## Fog

- Brute-force limit after the first district: change count, budget currency, or stars only? Deferred in 01; revisit once District 1 plays end to end. Not ticketed yet.
- Does another Level template reach the 10 of 10 bar? Only the priority swap is measured ([#45](https://github.com/artsaraiva/clearway/issues/45)). [#53](https://github.com/artsaraiva/clearway/issues/53).
- How does the generator run in the browser as a procedural mode? [#48](https://github.com/artsaraiva/clearway/issues/48), after [#47](https://github.com/artsaraiva/clearway/issues/47).
- Pedestrians as a mechanic (crossings, crosswalk Tool). [#35](https://github.com/artsaraiva/clearway/issues/35).

## Open work

Every open ticket is a GitHub issue: https://github.com/artsaraiva/clearway/issues. Grillings carry `ready-for-human`, build work `ready-for-agent`, and blockers are GitHub "blocked by" links.

- Grillings: [#15](https://github.com/artsaraiva/clearway/issues/15) UI/UX, [#35](https://github.com/artsaraiva/clearway/issues/35) pedestrians, [#48](https://github.com/artsaraiva/clearway/issues/48) procedural mode in the browser.
- Procedural Districts: [#46](https://github.com/artsaraiva/clearway/issues/46) scaffolding tool → [#47](https://github.com/artsaraiva/clearway/issues/47) Level templates → [#48](https://github.com/artsaraiva/clearway/issues/48). Roundabouts in generated grids: [#49](https://github.com/artsaraiva/clearway/issues/49).
- Build chain: renderer [#25](https://github.com/artsaraiva/clearway/issues/25) → [#26](https://github.com/artsaraiva/clearway/issues/26) → [#27](https://github.com/artsaraiva/clearway/issues/27) and [#28](https://github.com/artsaraiva/clearway/issues/28) → [#29](https://github.com/artsaraiva/clearway/issues/29), [#30](https://github.com/artsaraiva/clearway/issues/30), [#31](https://github.com/artsaraiva/clearway/issues/31) → [#32](https://github.com/artsaraiva/clearway/issues/32). District 1 Levels [#56](https://github.com/artsaraiva/clearway/issues/56) → [#57](https://github.com/artsaraiva/clearway/issues/57) → [#58](https://github.com/artsaraiva/clearway/issues/58) → [#59](https://github.com/artsaraiva/clearway/issues/59) → [#60](https://github.com/artsaraiva/clearway/issues/60) → [#61](https://github.com/artsaraiva/clearway/issues/61) → [#62](https://github.com/artsaraiva/clearway/issues/62); the old ones ([#8](https://github.com/artsaraiva/clearway/issues/8)–[#14](https://github.com/artsaraiva/clearway/issues/14)) are closed as superseded.

## Resolved tickets

- [#33](https://github.com/artsaraiva/clearway/issues/33) District 1 on the diorama (answer in the issue; spec in `../district-01/spec.md`)
- [#52](https://github.com/artsaraiva/clearway/issues/52) Does the Priority rule change Flow enough to carry a Level? (findings in the issue; ADR 0003)
- [#45](https://github.com/artsaraiva/clearway/issues/45) Procedural Districts check (report in the issue; verdict above)
- [#43](https://github.com/artsaraiva/clearway/issues/43) Procedural Districts (answer in the issue), [#34](https://github.com/artsaraiva/clearway/issues/34) its research (`../procedural-districts/research.md`)
- [#16](https://github.com/artsaraiva/clearway/issues/16) Visual style (answer in the issue; spec in `../visual-style/spec.md`)
- [#34](https://github.com/artsaraiva/clearway/issues/34) Procedural Districts research (answer in the issue; findings in `../procedural-districts/research.md`)
- `game/01` [Core loop](issues/01-core-loop.md), `game/02` [Player tools](issues/02-player-tools.md), `game/03` [Look-dev](issues/03-look-dev.md), `game/04` [Road network model](issues/04-road-network-model.md), `game/06` [Junction chain](issues/06-junction-chain.md)
- `player-tools/03` [Route inspector](../player-tools/issues/03-route-inspector.md)
- [Traffic prototype](../traffic-prototype/spec.md)
