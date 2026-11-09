# Road Network: Districts of many Junctions

Status: open (grilled 2026-11-09 in `.scratch/game/issues/04-road-network-model.md`)

## Goal

Replace the roundabout-only generator (`RoundaboutSpec`, `buildNetwork`) with a road graph that holds a whole District. That means several Junctions of different types joined by Roads, Gateways at the District edge and at the Fog, and the Levels that reveal it. Vocabulary is in the root `GLOSSARY.md`. Decisions with a trade-off are in `docs/adr/0001-free-flow-routing.md` and `docs/adr/0002-reveal-rebuilds-the-simulation.md`.

## District file

There is one hand-written TS file per District in `levels/`. `levels/district-01.ts` replaces `levels/roundabout-01.ts`. There's no editor and no procedural generation. Shape, with names illustrative and pinned in issue 02:

```ts
export default {
  roadDefaults: { speed: 13.9, laneWidth: 3.5, bikeBand: true, sidewalk: 2, median: 0 },
  junctions: {
    J1: { type: 'roundabout', at: [0, 0], radius: 40, ringLanes: 2 },
    J2: { type: 'priority', at: [320, 0] },
  },
  roads: {
    N: { from: [0, 200], to: 'J1', lanes: [2, 2] }, // a point end is on the District edge: a Gateway
    R1: { from: 'J1', to: 'J2', lanes: [2, 2] }, // lanes per direction: [from→to, to→from]
  },
  levels: [
    {
      reveal: ['J1'],
      seed: 8,
      tools: ['connector'],
      demand: { N: { rate: 22, to: { S: 0.8, E: 0.1, R1: 0.1 } } },
      initial: { J1: { disable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], enable: ['*.in1>*.ring0', '*.ring0>*.out1'] } },
      solution: [{ at: 'J1', enable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], disable: ['*.in1>*.ring0'] }],
    },
  ],
} satisfies District
```

Loading validates the file and throws with a readable message on an unknown id or ref, a Road too short for the footprints of the Junctions at its ends, Arms of one Junction too close in angle, or Demand naming something that isn't a Gateway in that Level.

## Road graph

- **Junction**: id, position in metres, type, type parameters.
- **Road**: a straight line between two Junctions, or between a Junction and a point on the District edge. Roads meet at any angle. A Road has a lane count per direction, constant along its length (no turn pockets), plus a speed limit and edge attributes that override `roadDefaults`. No curved Roads.
- **Edge attributes** (bike band, sidewalk width, median) are stored for the renderer. The sim never reads them. Computing Blocks (faces of the road graph) and what fills them is the visual-style effort's job.

## Junction types

| Type | Arms | Candidate Connections | Default enabled set |
| --- | --- | --- | --- |
| `roundabout` | 3–6 | At each Arm, as in the prototype: every incoming lane or arriving Ring lane to every outgoing lane or departing Ring lane, except straight back out the same Arm | approach lane i to Ring lane i, Ring i stays on Ring i, Ring i leaves to exit lane i |
| `priority` (T-junction = 3 Arms, crossroads = 4) | 3–4 | Every incoming lane to every outgoing lane on a different Arm, with no U-turns | 1 lane takes all turns. 2 lanes: right lane takes right and straight, left lane takes left and straight |

Arm directions come from the Roads: each points from the Junction centre toward the Road's other end. Signalized is a mode, not a type (see `.scratch/player-tools/spec.md`). Turbo roundabouts are backlog.

## Lanes and refs

- Every Lane belongs to exactly one owner: a Road plus a direction, or a Junction (Connection lanes and Ring lanes). This replaces the three meanings of `Lane.arm`.
- Lane 0 is the rightmost (outermost) lane, as now.
- Lane ids are stable across Reveals (Road id + direction + index), so configuration carries over by id.
- Inside a Junction, the file names lanes relative to that Junction: `R1.in0` is incoming lane 0 of Road R1, `R1.out1` is outgoing lane 1, and `R1.ring0` is Ring lane 0 at R1's Arm. A Connection ref is `<lane>><lane>`. On a roundabout, `*` in place of the Road id applies the ref to every Arm, and both sides of one ref share that Arm.
- Refs are parsed and validated at load. In code, Connections hold Lane objects only, and the `approach1>ring0` port strings go away.
- `initial` lists only `enable` / `disable` deviations from the Junction type's default enabled set.
- Conflict detection stays geometric (merges share an outgoing lane, crossings come from polyline intersection), unchanged.

## Changes

A reference solution is a list of Changes in the player's vocabulary. The UI calls the same API:

- `{ at: 'J1', enable: [refs], disable: [refs] }`: connector
- `{ at: 'J2', priority: { R1: 'yield' } }`: Priority rule per Arm, keyed by Road id (values reworked in player-tools issue 01)
- `{ at: 'J2', signal: true }`: Signal (player-tools issue 02)

## Gateways and Demand

- A Gateway's id is its Road's id.
- A Level's Gateways are every Road end on the District edge, plus every Road whose other Junction is still in Fog. Such a Road keeps its full length, and vehicles leave or enter at its fogged end, so its spillback behaves the same before and after the Reveal. A Road with no Revealed Junction does not exist in the sim.
- Demand per Level keeps the current shape: arrivals per minute per Gateway, plus destination weights over the other Gateways.
- An arrival draws its destination **and its vehicle type** together, so the random stream depends only on time and seed, never on the player's Changes.
- Unchanged: queued spawns count 0 in Flow, and a car whose destination is unreachable waits at spawn.

## Routing

Per ADR 0001:

- Each car takes the shortest path by free-flow travel time (lane length ÷ speed limit, with Connection lanes at their curve speed) over enabled Connections. That's Dijkstra with a deterministic tie-break, and it replaces BFS by hop count.
- The target is the Gateway Road's outgoing lanes.
- A car plans at spawn, and every vehicle re-plans on each Change. No congestion-aware rerouting.
- Spawn lane choice keeps the queue-length cost, with trip cost now measured in time.
- No lane changes on Roads. The Connection a car takes at one Junction fixes its lane at the next, and routing over the lane graph accounts for that.

## Reveal

Per ADR 0002:

- Level k's network is every Junction in the `reveal` lists of Levels 1 to k.
- A Reveal rebuilds the sim:
  1. build the new network
  2. carry over the configuration of previously Revealed Junctions (enabled Connections, Priority rules, Signals) by stable ids
  3. apply Level k's `initial` to the newly Revealed Junctions
  4. apply Level k's Demand and seed
  5. Pre-warm 90 s
- Reset returns the network to a snapshot taken at the Reveal. That's the authored initial for new Junctions and the carried-over state for earlier ones. This is assumed here; UI/UX (game ticket 05) may refine it.

## Spillback

The don't-block-the-box rule (`hasRoom`) is the whole spillback model: queues already back up along Roads into upstream Junctions. There's no deadlock breaker until a playtest shows a gridlock that no Change can clear.

## Sim structure

Split `Sim` by concern into separate modules: network builder, demand and spawn, routing, driving rules, metric. `Sim` stays the facade the UI and tests use (`step`, Changes, `flow`, Win). `src/sim` keeps no Three.js import.

## Verification

Per CLAUDE.md, outcomes only:

- **Levels**: `levels/levels.test.ts` runs every Level of every District file. For Level N it applies the reference solutions of Levels 1 to N−1, Reveals Level N (which Pre-warms), and asserts Flow < 0.5 after 180 sim-seconds untouched. Then, from the same Reveal, it applies Level N's solution and asserts a Win within 300 sim-seconds. It uses only the shipped seed.
- **Sim**: the determinism check stays (same seed, same vehicles). Fixture Districts in `src/sim` cover the priority junction and the Reveal, asserting outcomes only.
- No direct geometry or network tests.
- **Dev scripts** (tuning aids, not tests):
  - `npm run sweep` prints each Level's jam and clear pass rate over seeds 1–10
  - `npm run bench` prints ms per frame at 8×
- **Performance gate**: 1,000 vehicles at 8× within 4 ms per frame on a 4-Junction fixture, on the main thread. Move the sim to a web worker only if this fails.

## Issues

- [01 Split Sim and draw vehicle type at arrival](issues/01-split-sim.md)
- [02 District file and road graph builder](issues/02-district-file.md), blocked by 01
- [03 Priority junction](issues/03-priority-junction.md), blocked by 02
- [04 Free-flow routing](issues/04-free-flow-routing.md), blocked by 02
- [05 Reveal and Fog-edge Gateways](issues/05-reveal.md), blocked by 03, 04

## Out of scope

- Lane changes, curved Roads, turn pockets (easy to add when a Level needs them).
- Congestion-aware rerouting (ADR 0001), and a deadlock breaker.
- Level editor, procedural generation.
- Simulated pedestrians and bikes: they are decoration only.
- Blocks and their fill: the visual-style effort.
- District 1 Levels 2–7: the junction-chain ticket (game 06).
- Turbo roundabouts.
