# 02 Level 2: T-junction, Priority rule

Type: task
Status: ready-for-agent
Blocked by: 01, player-tools 01

## Goal

Author Level 2: Reveal J2, a T-junction whose heavy stream turns. Spec: `../spec.md` (Level 2).

## Changes

- Heavy stream enters at R27's fogged end and turns right onto R23. Continuity for Level 1's R12 stream.
- `initial`: `J2: { priority: { R27: 'yield' } }`. If the District format has no Priority in `initial` yet, add it (it belongs with `player-tools/01`).
- `tools: ['priority']`.
- Solution: `{ at: 'J2', priority: { R27: 'main', R23: 'main', R12: 'yield' } }`.
- Size the R27 stream for Level 3 too: it is the stream that jams J3's W approach once J3 is Revealed. At J3 it may go only straight or right.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
