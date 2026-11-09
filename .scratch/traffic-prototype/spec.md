# Traffic Prototype: Single Roundabout

Status: done (rubric 4 of 4 yes, 2026-11-09; see `.scratch/game/issues/01-core-loop.md`)

## Goal

Validate one question before building the game: **is fixing a traffic jam by editing lane connections and priority rules satisfying to watch?** Secondary: does the white, minimal, slightly-3D aesthetic (Apple Maps / Mini Motorways) land?

Not in scope: chaining levels, fog of war, vehicle types other than cars, lane changes mid-segment, save/load, deployment. Local only.

## Decisions (from grilling, 2026-11-09)

| Area | Decision |
| --- | --- |
| Platform | Browser. Three.js + TypeScript + Vite. No game engine. |
| Simulation | Microscopic. Each vehicle is an agent on a lane graph, car-following via IDM, gap acceptance at junction conflict points. Deterministic (seeded RNG). |
| Level | One hand-authored 4-arm roundabout, 2-lane approaches, 2-lane circulating ring. Geometry fixed; generated parametrically from a level file. |
| Player tools | (1) Lane connector per ring node, TM:PE style. (2) Priority rule per approach: yield / stop / signal. |
| Flow metric | Mean of `v / v_free` over all vehicles, exponential moving average with ~20 s window. Vehicles blocked from spawning count as speed 0. Win = ≥ 80 % sustained for 60 sim-seconds. |
| Time | Fixed sim timestep 30 Hz. Pause / 1× / 4×. |
| Vehicles | Cars only. Type table left as a single-row parameter table so adding types later is data, not code. |
| Disposition | `src/sim/` is seed-quality (typed, tested, no Three.js import). `src/render/` and UI are throwaway. |
| Repo | `git init` locally, no remote. Vitest for the headless test. |

## Simulation model

### Lane graph

- **Lane**: directed centerline polyline with arc length, speed limit, and an ordered list of vehicles. Lanes are either *segment lanes* (approach, exit, ring arc between nodes) or *connection lanes* (short curves inside a node joining one incoming lane to one outgoing lane).
- **Node**: a junction. Prototype has 4 ring nodes, one per arm. Each node has incoming lanes (2 approach + 2 ring upstream) and outgoing lanes (2 ring downstream + 2 exit).
- **Connection**: an (incoming lane, outgoing lane) pair at a node. Player toggles these. Each connection owns a connection lane (Bezier from lane end to lane start).
- **Conflict pair**: two connection lanes at the same node whose curves cross or merge. Precomputed when connections change. Each pair has a priority order from generator rules:
  - Ring beats entering (entering vehicle yields or stops per the arm's priority rule).
  - Inner-ring vehicle exiting (crossing the outer ring lane) yields to outer-ring through traffic.
  - Signal on an arm replaces the yield check for entering vehicles with a red/green gate; ring traffic is unaffected.

### Vehicle behaviour

- **Spawn**: per arm, Poisson arrivals at a rate from the level file, destination exit drawn from the arm's OD row. Seeded RNG. If the approach is full, the vehicle waits in an off-screen queue and counts as speed 0 in the metric.
- **Routing**: at spawn, BFS over the connection graph from each approach lane to the destination exit. Pick the approach lane with a path. If no path exists for that exit, re-roll the destination among reachable exits. No mid-segment lane change.
- **Car-following**: IDM against the nearest vehicle ahead on the current path (looking through connection lanes into the next lane).
- **Conflict handling**: when approaching a conflict point as the lower-priority party, check vehicles on the conflicting lane upstream of the point within a time gap (~3 s for yield). Stop sign: full stop at the line first, then same gap rule. Signal: fixed cycle giving each arm green in turn; red blocks the entry line.
- **Tool change mid-sim**: removed connection: vehicles already on it finish; vehicles upstream replan at their next node; new spawns use the new graph. Priority change applies instantly. No despawn, gauge keeps rolling.

### Flow metric

```
sample = mean over (on-map vehicles ∪ queued spawns) of (v / v_free)   // queued = 0
flow   = ema(sample, window ≈ 20 s)
win    = flow ≥ 0.80 for 60 consecutive sim-seconds
```

## Level file (prototype)

```ts
{
  seed: 1,
  roundabout: { radius: 30, ringLanes: 2, arms: [0, 90, 180, 270], approachLanes: 2 },
  demand: {              // vehicles per minute per arm, and destination distribution
    N: { rate: 20, to: { S: 0.7, E: 0.15, W: 0.15 } },
    S: { rate: 20, to: { N: 0.7, E: 0.15, W: 0.15 } },
    E: { rate: 8,  to: { W: 0.6, N: 0.2, S: 0.2 } },
    W: { rate: 8,  to: { E: 0.6, N: 0.2, S: 0.2 } },
  },
  initial: {
    connections: "all approach lanes → outer ring only; inner ring unused",
    priority: { N: "yield", S: "yield", E: "yield", W: "yield" },
  },
}
```

Numbers are starting points. Tune until the headless test below holds.

## Rendering and UI

- Orthographic camera, ~45° tilt, fixed angle, scroll zoom only.
- White ground plane. Roads are extruded ribbon meshes from lane geometry, gray, raised slightly above ground. Lane dashes as thin white meshes. No textures.
- Cars: `InstancedMesh` of rounded boxes, a few pastel colours.
- One directional light with soft shadow map. No post-processing. No trees or buildings unless the scene feels bare.
- Lane connector: click a ring node, lane-end markers appear. Click an incoming marker then an outgoing marker to toggle the connection. Active connections drawn as coloured curves on the road. Escape closes.
- DOM overlay (plain HTML/CSS, no framework): flow gauge, pause/1×/4× buttons, priority buttons per arm when an arm is selected.

## Architecture

```
src/
  sim/        pure TS, no Three.js. Lane graph, generator, vehicles, IDM, conflicts, metric, RNG.
  render/     Three.js scene built from sim geometry; reads sim state each frame.
  ui/         DOM overlay, tool interactions (raycast → sim commands).
  main.ts     loop: steps-per-frame = time scale; render after stepping.
levels/roundabout-01.ts
```

## Verification

One headless Vitest test, run with no renderer:

1. Load the level, run 180 sim-seconds with initial config. Assert `flow < 0.50`.
2. Load again, connect inner approach lanes to the inner ring and inner ring to exits. Run 180 sim-seconds. Assert `flow ≥ 0.80`.
3. Load again, keep initial connections, set E and W to `signal`. Run 180 sim-seconds. Assert `flow ≥ 0.80`.

Both solutions must pass before any rendering work starts.

## Success rubric (solo, after ~15 minutes of play)

1. Did the jam read as a jam without explanation?
2. Did a connector change visibly matter?
3. Did the white-minimal look feel right?
4. Do you want to build the chaining progression?

3 of 4 yes = proceed to the game. Timebox: 3 focused sessions. Over budget = scope too big, revisit.

## Backlog (not in prototype)

- Chaining: fixed junction unlocks the next fogged area.
- Vehicle types (motorcycle, bus, truck) as rows in the type table.
- Mid-segment lane changes (MOBIL) for weaving levels.
- Per-approach lane count tool, lane arrows.
- Other TM:PE tools: timed signal editing, speed limits, vehicle restrictions, junction restrictions.
- Tool budget per level (e.g. 3 changes) to keep puzzles from being brute-forced.
- Alternative metrics (throughput / demand, mean delay) if speed ratio proves gameable.

## Comments

### 2026-11-09: implementation notes

Built: `src/sim/` (lane graph generator, IDM, gap acceptance, routing, metric, signals, stop signs, seeded RNG), headless test in `src/sim/sim.test.ts`, throwaway `src/render/` + `src/ui/`. Run with `npm run dev`; test with `npm test`.

Deviations from the spec, and why:

- **Verification scenario 3 dropped** (decided with the user). Signals on E/W never beat the initial config. This held across a sweep of demand, gap times, cycle layouts and two signal readings ("green = force in and zip with ring traffic", "green = ring yields to the arm"). Saturated throughput: initial ~43 veh/min, inner-ring fix ~57, E/W signals 34–39. The jam is the single outer ring lane plus the N/S entries. Fixed-cycle side-arm signals can't add ring capacity, and red time adds stopped cars to the speed metric. Yield/stop/signal stay as player tools, to be judged in play.
- **Signal semantics**: green replaces the yield check (entrants force in and zip with ring traffic through car-following; ring traffic is not signalled). The cycle gives each arm of the junction 15 s of green in turn; only signalized arms obey it, so a lone signal is green a quarter of the time.
- **Level numbers retuned**: radius 40 (30 left ring arcs too short and entry curves too tight). Demand is now a heavy N–S corridor (22/min, 80 % straight on) with light side streets (4/min). Seed 8. Across seeds 1–10, initial < 0.50 in 8 of 10 and inner ≥ 0.80 in 8 of 10, so the result is seed-sensitive. Seed 8 has the best margin on both (0.40 / 0.86).
- **Flow metric**: `v_free` is the free speed at that spot. It covers braking for slower curves ahead and accelerating out of them, so a car in free flow scores ~1.0. Without this the free-flow ceiling was ~0.8.
- **Win timer** only runs after a 60 s warm-up, because an empty map starts at 100 % flow.
- **Lane choice at spawn**: shortest trip length plus 6.5 m per vehicle already on the lane. This gives natural lane discipline (right turns outer, left turns inner) and balances queues.
- **Entries at a lane drop**: when both approach lanes feed one ring lane, the left lane yields to the right one. This is part of why the initial config jams.
