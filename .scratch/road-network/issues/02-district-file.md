# 02 District file and road graph builder

Type: task
Status: ready-for-agent
Blocked by: 01

## Goal

Replace `RoundaboutSpec` and `buildNetwork` with the District file and a road graph builder, and port Level 1 into it. Roundabouts only in this issue. Spec: `../spec.md` (District file, Road graph, Junction types, Lanes and refs, Changes).

## Changes

- `District` type and loader. Junctions, Roads (straight, any angle, lanes per direction, speed and edge attributes over `roadDefaults`) and an ordered list of Levels (`reveal`, `seed`, `tools`, `demand`, `initial`, `solution`). Validation throws a readable error on bad ids, refs, too-short Roads, Arms too close in angle, and Demand on non-Gateways.
- Roundabout generator driven by the graph. Arm directions come from the Roads, lane lengths from Road length (`approachLength` goes away), and the Ring belongs to the Junction.
- Lane ownership: Road + direction, or Junction. Remove `Lane.arm`.
- Lane and Connection refs (`R1.in0`, `R1.out1`, `R1.ring0`, `<lane>><lane>`, `*` for every Arm on a roundabout), parsed and validated at load. Connections hold Lane objects; port strings go away. Pin the exact syntax here and update the spec if it differs.
- Default enabled set per roundabout. `initial` applies `enable` / `disable` deviations.
- Change API in the player's vocabulary (`{ at, enable, disable }`, `{ at, priority }`), used by the UI and by reference solutions.
- Port `levels/roundabout-01.ts` to `levels/district-01.ts`: one roundabout, four Roads each ending in a Gateway on the District edge, Level 1 with its current Demand, initial configuration and the inner-Ring reference solution. Delete the old file.
- `levels/levels.test.ts`: the Level test harness described in the spec's Verification section. Apply earlier Levels' solutions, Reveal (Pre-warm), check jammed, then apply the solution and check the Win.
- Adapt the throwaway renderer, UI and look-dev scene (`src/render`, `src/ui`, `src/lookdev`) to the new network shape, so `npm run dev` and `/lookdev.html` still work. No new UI.

## Test (outcome only)

District 1 Level 1: Flow < 0.5 after 180 sim-seconds untouched, and a Win within 300 sim-seconds after its reference solution. `src/sim/sim.test.ts` keeps its determinism check, moved onto the District file. Its jam and clear checks are now covered by the Level test.

## Comments
