# 04 Road network model

Type: grilling
Status: resolved
Blocked by: 01

## Question

What data model replaces the roundabout-only generator, so that one model can hold several junctions of different types, the chain, and the visual dressing (curbs, blocks, buildings)?

## Context

- Map: `.scratch/game/map.md`. Progression and chain shape come from 01.
- Current code:
  - `src/sim/network.ts` builds one 4-arm roundabout from a `RoundaboutSpec`. Ports are named strings (`approach{i}`, `ring{i}`, `exit{i}`).
  - Conflicts are found from polyline geometry (merges share an outgoing lane; crossings come from polyline intersection), so they already work for any junction shape.
  - `src/sim/sim.ts` holds spawn, routing (BFS), IDM, priority rules and the metric in one `Sim` class.
- Code review open items to fold in:
  - Split `Sim`.
  - Typed ports instead of `"from>to"` strings.
  - Disambiguate `Lane.arm`.
  - Direct tests for geometry and network.
  - Seed robustness: the headless test passes on about 8 of 10 seeds.

## To grill

- Road graph: junction nodes (type, position, parameters) joined by road segments (lane counts, speed). Is this graph the level file?
- Junction types for v1: crossroads, T-junction, roundabout, signalized, turbo?
- How does the road graph generate lanes and connections? What replaces the port naming?
- Does the same graph generate the visual road surface (curb polygons, rounded corners) and the blocks between roads? Coordinate with 03.
- Routing: fixed routes chosen at spawn (now), or travel-time route choice that reroutes around jams? What does that do to determinism and puzzle readability?
- Spillback: queues backing up into the previous junction is the core chain dynamic. Is the current don't-block-the-junction rule enough?
- Demand: an origin–destination table per map edge? Do trips start and end inside the map (buildings)?
- Hidden (fogged) areas: what exists in the sim before an area is revealed?
- Level authoring: hand-written files, a dev-only editor, or procedural?
- Performance budget: car count, sim in a web worker, spatial indexing for leader search.
- Test seams for the new modules, agreed before implementation (TDD).

## Resolution produces

- Decisions in `map.md`; ADRs in `docs/adr/` for the road graph and routing choice.
- `.scratch/road-network/spec.md` plus implementation issues.
- Opens a junction-chain grilling ticket.

## Answer

Grilled 2026-11-09, two rounds. Vocabulary in root `GLOSSARY.md` (Road, Gateway, Ring, Block and Priority junction added; Arm and Demand reworded). Spec: `.scratch/road-network/spec.md` plus issues 01–05. ADRs: `docs/adr/0001-free-flow-routing.md`, `docs/adr/0002-reveal-rebuilds-the-simulation.md`.

### Decisions

1. **District file.** One hand-written TS file per District in `levels/`, holding the road graph and the ordered Levels (Reveal set, Demand, Tools, seed, reference solution). No editor, no procedural generation.
2. **Road graph.** Junctions (id, position, type, parameters) joined by straight Roads. Each Road has lanes per direction, a speed limit and edge attributes, and Roads meet at any angle. No curves, no turn pockets.
3. **Junction types.** Roundabout (3–6 Arms) and priority junction (3–4 Arms; T-junction and crossroads). Candidate Connections are every lane pair across different Arms, with no U-turns. Signalized is a mode, and turbo stays in the backlog.
4. **Default Connections.** Each type generates a sensible enabled set. The file lists only `enable` / `disable` deviations.
5. **Refs.** Junction + Road id + lane index (`R1.in0`, `R1.out1`, `R1.ring0`, `*` for every Arm on a roundabout), validated at load. Code holds Lane objects only. Each Lane belongs to one Road plus a direction, or to one Junction. This retires the port strings and `Lane.arm`.
6. **No lane changes** on Roads in v1.
7. **Routing.** Shortest free-flow travel time over the lane graph, planned at spawn and on every Change. No congestion rerouting (ADR 0001).
8. **Gateways.** Trips start and end only at Gateways: Road ends on the District edge, and Roads whose far Junction is still in Fog. Those Roads keep their full length. Demand stays per Level, as rate plus destination weights per Gateway.
9. **Reveal.** Rebuilds the sim, carries the player's configuration over by stable lane ids, applies the new Demand and Pre-warms. No vehicle migration (ADR 0002).
10. **Spillback.** The don't-block-the-box rule only. No deadlock breaker until a playtest needs one.
11. **Dressing.** Roads store edge attributes. Computing and filling Blocks belongs to the visual-style effort. The sim never reads the dressing.
12. **Seeds.** A fixed seed per Level, and vehicle type is drawn at arrival so the random stream ignores the player's Changes. Tests run only the shipped seed. A seed sweep is a dev script.
13. **Level tests.** Apply earlier Levels' solutions, Pre-warm, assert Flow < 0.5 after 180 s untouched, and a Win within 300 s after the solution.
14. **Test seams unchanged.** The code review's direct geometry and network tests are dropped.
15. **Pedestrians and bikes** are decoration, never simulated.
16. **Performance.** Main thread. Gate: 1,000 vehicles at 8× within 4 ms per frame on 4 Junctions; a web worker only if it fails.

### Assumed, for 05 to refine

Reset restores the snapshot taken at the Reveal: authored initial for new Junctions, carried-over state for earlier ones.

### Unblocks

Road-network issues 01–05. Player-tools issues 01 and 02 now wait on road-network 03 (priority junction) instead of this ticket. Opens game ticket 06 (junction chain).

## Comments
