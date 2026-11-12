# Traffic Puzzle Game: Map

The parent for everything after the prototype. Child tickets live in `issues/`; each topic that resolves into build work gets its own `.scratch/<topic>/spec.md` + `issues/`.

**Start at the Board below.** Ticket numbers restart in every effort, so always name the effort: `game/05`, `road-network/03`, `player-tools/01`.

## Vision

A browser puzzle game: the player fixes traffic jams by changing how junctions work (lane connections, right of way, signals, and more), then watches the jam clear. Look: Apple Maps 3D. That means a white/off-white ground, gray roads with curbs and sidewalks, rounded corners, lane markings, crosswalks, grass, blobby low-poly trees, light-gray extruded buildings, and in-world signs. See `reference/apple-maps-roundabout.png`. Later: a chain of junctions and roundabouts, where fixing one opens the next.

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
  - District 1 Tools: connector, Priority rule as main/yield per Arm (stop dropped), Signal as Junction-wide on/off with fixed split. Signal is conditional on a crossroads gate test (blocked by 04); timing editor, phases, actuation are backlog.
  - Turn bans, one-way and closures are connector moves. Roundabouts take connector only; Priority rule and Signal apply to crossroads and T-junctions.
  - Conflict rules: equal Arms give way to the right, left turn yields to oncoming straight, yield Arm yields to every main Arm.
  - Inspector: read-only, always available, not in `Level.tools`. First one: click a car, its route lights up. Heatmap, queue bars, desire lines are backlog.
  - District 1 is 7 Levels: 1–4 from 01, 5 crossroads (Signal), 6 remove a Connection, 7 finale that re-jams the roundabout.
  - Backlog: lane arrows, add/remove lane, junction type swap.
- Look-dev (03, 2026-11-09). Details in `issues/03-look-dev.md` under Answer; scene at `/lookdev.html` (`src/lookdev/`, throwaway), screenshots in `reference/lookdev-*.png`.
  - Verdict: Three.js reaches the look cheaply. Rubric 4 of 4, user confirmed: same family, kerbs and mouths legible, about 1.9 ms per frame with 1,000 cars at retina resolution on an M4 Pro, road from lane polylines only.
  - Chosen: perspective free-look camera (35° FOV, `MapControls`); a ground shader over one baked distance-field texture (road SDF from lane capsules plus a morphological close, island flood fill, grass SDF, contact AO); static AO instead of shadows; no post-processing; instanced trees and cars; merged markings and buildings.
  - For 04: no separate road outline needed, but road edges need attributes (bike band, sidewalk, medians, splitter islands), and props need block polygons from the road graph's faces.
- Road network model (04, 2026-11-09). Details in `issues/04-road-network-model.md` under Answer. The spec is `.scratch/road-network/spec.md` with issues 01–05. ADRs are in `docs/adr/` (0001 routing, 0002 Reveal).
  - One hand-written TS file per District in `levels/`: a road graph (Junctions joined by straight Roads, lanes per direction, edge attributes) plus ordered Levels with their reference solutions.
  - Two Junction types: roundabout and priority junction (T, crossroads). Each generates default Connections, and the file lists only deviations. Refs look like `J1: R1.in0>R1.ring0`. No lane changes.
  - Drivers route by free-flow travel time and never reroute around Jams (ADR 0001).
  - Trips start and end only at Gateways: the District edge, or a Road whose far Junction is still in Fog.
  - A Reveal rebuilds the sim, carries Changes over, then Pre-warms (ADR 0002).
  - Pedestrians and bikes are decoration. Blocks and their fill belong to the visual-style effort.
  - Seeds: vehicle type is drawn at arrival, and tests run only the shipped seed. Level tests apply earlier solutions, then check jammed and Win.
- Visual style split out of 03 as its own grilling, `game/07` (2026-11-09).
- Junction chain (06, 2026-11-12). Details in `issues/06-junction-chain.md` under Answer; spec in `.scratch/district-01/spec.md` with one issue per Level.
  - District 1 is a ladder of 8 Junctions (2 roundabouts, 3 T, 3 crossroads), Revealed clockwise; loops appear only as Blocks close in Levels 5–7.
  - Levels 3 and 4 are a pair: jam visible downstream with the fix upstream, then the reverse. Levels 6 and 7 are route-shift puzzles: removing a Connection sends traffic back the way that worked.
  - Teaching Levels restrict Tools. Streams continue through a Reveal at the same rate; only Level 7 re-jams an earlier Junction.
  - Sim change: a car on the map whose destination becomes unreachable re-plans to the nearest reachable Gateway (in `road-network/04`).

## Fog

- Brute-force limit after the first district: change count, budget currency, or stars only? Deferred in 01; revisit once District 1 plays end to end. Not ticketed yet.
- Does the Signal pass its crossroads gate test? Answered by `player-tools/02`. If not, Level 5 becomes a main-road swap.

## Board

Every open ticket across `.scratch/`, as of 2026-11-12. Update this when a ticket changes state.

### Needs grilling (all unblocked)

| Id | Ticket | Produces |
| --- | --- | --- |
| `game/05` | [UI/UX](issues/05-ui-ux.md): how the player uses Tools and moves through Levels | `.scratch/ui-ux/` spec + issues |
| `game/07` | [Visual style](issues/07-visual-style.md): look-dev to production renderer, Blocks, Fog look | `.scratch/visual-style/` spec + issues |

Suggested order: 05, then 07.

### Ready to build (unblocked)

| Id | Ticket | Status |
| --- | --- | --- |
| `road-network/01` | [Split Sim, draw vehicle type at arrival](../road-network/issues/01-split-sim.md) | ready-for-agent |

### Blocked (specified, waiting on build work)

| Id | Ticket | Blocked by |
| --- | --- | --- |
| `road-network/02` | [District file and road graph builder](../road-network/issues/02-district-file.md) | `road-network/01` |
| `road-network/03` | [Priority junction](../road-network/issues/03-priority-junction.md) | `road-network/02` |
| `road-network/04` | [Free-flow routing](../road-network/issues/04-free-flow-routing.md) | `road-network/02` |
| `road-network/05` | [Reveal and Fog-edge Gateways](../road-network/issues/05-reveal.md) | `road-network/03`, `road-network/04` |
| `player-tools/01` | [Priority rule: main / yield](../player-tools/issues/01-priority-rule.md) | `road-network/03` |
| `player-tools/02` | [Signal, with gate test](../player-tools/issues/02-signal.md) | `road-network/03`, `player-tools/01` |
| `district-01/01` | [Road graph and Level 1](../district-01/issues/01-level-1.md) | `road-network/05` |
| `district-01/02` | [Level 2: T-junction, Priority rule](../district-01/issues/02-level-2.md) | `district-01/01`, `player-tools/01` |
| `district-01/03` | [Level 3: fix upstream](../district-01/issues/03-level-3.md) | `district-01/02` |
| `district-01/04` | [Level 4: Spillback](../district-01/issues/04-level-4.md) | `district-01/03` |
| `district-01/05` | [Level 5: Signal](../district-01/issues/05-level-5.md) | `district-01/04`, `player-tools/02` |
| `district-01/06` | [Level 6: turn ban](../district-01/issues/06-level-6.md) | `district-01/05` |
| `district-01/07` | [Level 7: finale](../district-01/issues/07-level-7.md) | `district-01/06` |

Build chain: `road-network/01` → `02` → `03` and `04` → `05`. `player-tools/01` → `02` can start as soon as `road-network/03` lands. `district-01/01`–`07` follow, one Level at a time.

### Done

- `game/01` [Core loop](issues/01-core-loop.md), `game/02` [Player tools](issues/02-player-tools.md), `game/03` [Look-dev](issues/03-look-dev.md), `game/04` [Road network model](issues/04-road-network-model.md), `game/06` [Junction chain](issues/06-junction-chain.md)
- `player-tools/03` [Route inspector](../player-tools/issues/03-route-inspector.md)
- [Traffic prototype](../traffic-prototype/spec.md)
