# 06 Junction chain

Type: grilling
Status: open
Blocked by: 04

## Question

What exactly are District 1's seven Levels? For each one: where the Junctions and Roads sit, which Junctions each Level Reveals, its Demand, its initial configuration and its reference solution. The answer should be complete enough that `levels/district-01.ts` can be authored.

## Context

- Map: `.scratch/game/map.md`. Progression, Win and pacing come from 01, the Tool roster and seven-Level outline from 02 (`.scratch/player-tools/spec.md`), and the file format and Reveal behaviour from 04 (`.scratch/road-network/spec.md`).
- The outline:
  1. the prototype roundabout, connector
  2. T-junction, Priority rule
  3. crossroads where the fix is upstream
  4. two Junctions Revealed at once, spillback
  5. crossroads with two heavy crossing flows, Signal or a main-road swap
  6. a left turn blocks through traffic, remove a Connection
  7. finale where the Reveal re-jams Level 1's roundabout
- Constraints:
  - 2–5 minutes real time per Level, 5–8 Junctions per District.
  - Win is Flow ≥ 80 % for 60 sim-seconds.
  - Each Level jams untouched (Flow < 0.5 after 180 s) and its solution Wins within 300 s, with earlier solutions applied.
  - No lane changes, straight Roads, drivers route by free-flow time and never avoid Jams.
- Level 5 hangs on the Signal gate test (player-tools issue 02). Design both variants, or wait.

## To grill

- Layout shape: a linear chain, a branch, or a loop back to the roundabout for Level 7? Where are the Gateways?
- Road lengths between Junctions: how short a Road needs to be for Spillback to reach upstream within a Level.
- How each Reveal's Demand re-jams an upstream Junction (Levels 3, 4, 7) without breaking its earlier solution in a way that feels unfair.
- What each Level's broken initial configuration is, and whether any Level has more than one valid fix.
- The tuning loop: the seed sweep and Demand nudges, and who playtests each Level.

## Resolution produces

- A District 1 design (layout sketch plus a per-Level table) in a spec.
- Authoring issues for `levels/district-01.ts`, blocked by the road-network issues they need.

## Comments
