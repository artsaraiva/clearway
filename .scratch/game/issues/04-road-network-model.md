# 04 Road network model

Type: grilling
Status: open
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

## Comments
