# 06 Junction chain

Type: grilling
Status: resolved
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

## Answer

Grilled 2026-11-12, three rounds. Spec: `.scratch/district-01/spec.md` plus issues 01–07, one per Level.

### Decisions

1. **8 Junctions**, every Level Reveals one, Level 4 Reveals two.
2. **Layout: a ladder** of two rows of four, Revealed clockwise. Loops appear only as Blocks close (Levels 5, 6, 7). 8 edge Gateways. 2 roundabouts, 3 T-junctions, 3 crossroads.
3. **Initial configurations** look plausibly mis-set, never absurd. Any fix that Wins counts; the reference solution is the intended one.
4. **Teaching Levels restrict Tools** (Level 2 Priority rule, Level 5 Signal, Level 6 connector). No new test seam.
5. **Continuity**: streams carry on through a newly Revealed Junction at the same rate. Only Level 7 re-jams an earlier Junction, and only by shifting routes.
6. **Road lengths**: 180–200 m between Junctions, 60–70 m on Level 4's spillback rung, 120 m to edge Gateways.
7. **Level puzzles**:
   1. J1, the prototype roundabout, unchanged.
   2. J2, T: the main road follows the heavy turning stream, not the straight line.
   3. J3, crossroads: jam at J3, fix at J2 (dual right turn; no lane changes means upstream Connections pick the lane).
   4. J4 + J5: J5's single-lane exit spills up a short rung and locks J4; fix at J5.
   5. J6, crossroads: two heavy crossing streams foreshadowed through Fog; Signal (fallback: main-road swap).
   6. J7, crossroads: a route shift creates left turns that block a single lane; ban the left, traffic returns to the route that worked.
   7. J8, T: a shortcut floods J1's south approach; close it (Braess), or reconfigure J1.
8. **Sim change**: a car on the map whose destination becomes unreachable re-plans to the nearest reachable Gateway. Without it, Level 6's and 7's fixes strand queued cars for good. Added to `road-network/04`.
9. **Tuning loop**: author each Level when its sim work lands; Level test green, sweep at least 7 of 10 seeds, user playtest at 2–5 minutes. Demand first, Road length second, geometry last.

### Found while writing the spec

Level 2's stream enters and (by Level 5) leaves behind J7, so it collapses at Level 6's Reveal. Level 6's oncoming stream is most likely a new S7 → W1/N1 stream, the same one Level 7 shifts onto J1. Recorded as an authoring hazard in the spec.

## Comments
