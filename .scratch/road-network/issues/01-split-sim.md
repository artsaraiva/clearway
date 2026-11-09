# 01 Split Sim and draw vehicle type at arrival

Type: task
Status: ready-for-agent
Blocked by: none

## Goal

Prepare `src/sim` for the road graph without changing what the sim does, apart from one RNG fix. Spec: `../spec.md` (Sim structure, Gateways and Demand).

## Changes

- Split `Sim` (`src/sim/sim.ts`) by concern into separate modules: demand and spawn, routing, driving rules (IDM, gap acceptance, don't-block-the-box), metric (Flow, Win latch). `Sim` stays the facade with its current public API.
- Spawn queue entries carry `{ dest, type }`. The vehicle type is drawn at arrival together with the destination, not when the car enters a lane, so the random stream depends only on time and seed.
- Add `npm run sweep`: for the current Level, run the jam check and the clear check over seeds 1–10 and print the pass rates. It's a dev script, not a test.

## Test (outcome only)

The existing `src/sim/sim.test.ts` keeps passing: Level 1 jams with its initial Connections, connecting the inner Ring clears it, and the same seed gives the same result. If the RNG change breaks jam or clear on seed 8, re-pick the shipped seed (or nudge Demand) using the sweep, and record the new pass rate in a comment here.

## Comments
