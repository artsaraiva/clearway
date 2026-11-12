# 01 Road graph and Level 1

Type: task
Status: ready-for-agent
Blocked by: road-network 05 (Fog-edge Gateways)

## Goal

Grow `levels/district-01.ts` from the single roundabout `road-network/02` ports into the full District 1 road graph, with Level 1 playing as before. Spec: `../spec.md` (Layout, Level 1).

## Changes

- All 8 Junctions and every Road from the spec's coordinates and Roads tables, including R27's asymmetric lanes (1 southbound, 2 northbound).
- Level 1 Reveals J1 only. R12 and R18 become Fog Gateways; W1 and N1 stay edge Gateways. Demand, initial configuration and solution as the prototype, with R12 taking the old east side Arm's 4 per minute and R18 the corridor's south end.
- R18 now leaves J1 at about 288° and R12/R18 are about 200 m, so re-check Level 1 with the sweep and re-pick the seed or nudge Demand if needed.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
