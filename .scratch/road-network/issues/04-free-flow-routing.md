# 04 Free-flow routing

Type: task
Status: ready-for-agent
Blocked by: 02

## Goal

Replace BFS by hop count with the shortest path by free-flow travel time. Spec: `../spec.md` (Routing), `docs/adr/0001-free-flow-routing.md`.

## Changes

- Dijkstra over the enabled lane graph. The cost is lane length ÷ speed limit, with Connection lanes at their curve speed. The tie-break is deterministic, by lane order. The target is the destination Gateway Road's outgoing lanes.
- Plan at spawn, and re-plan every vehicle on each Change (as now).
- Spawn lane choice keeps its queue-length cost; trip cost becomes time instead of distance.
- No congestion-aware rerouting and no lane changes.

## Test (outcome only)

The District 1 Level test and the determinism check still pass. Multi-Junction routing is exercised by issue 05's fixture.

## Comments
