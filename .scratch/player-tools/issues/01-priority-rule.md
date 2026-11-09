# 01 Priority rule: main / yield

Type: task
Status: ready-for-agent
Blocked by: game 04 (road network model, generic junction)

## Goal

Replace the per-Arm `yield | stop | signal` Priority with `main | yield`, and add the crossroads conflict rules. Spec: `../spec.md`.

## Changes

- `Priority` becomes `'main' | 'yield'`. Stop is removed from the sim, levels and UI.
- Signal leaves the per-Arm type; it becomes a Junction mode in issue 02.
- Conflict resolution at a crossroads or T-junction:
  - `yield` Arm yields to every `main` Arm.
  - Equal Arms give way to the right.
  - Left turn yields to oncoming straight traffic of equal priority.
- Roundabout: ring is always main. The Priority tool is not offered on roundabout Junctions.
- `Level.tools` gains `'priority'` only on Levels with a crossroads or T-junction.

## Test (outcome only)

A T-junction Level where the heavy road is `yield` and the light road is `main` jams at start. Setting the heavy road to `main` and the light road to `yield` clears it. Same seed, same result every run.

## Comments
