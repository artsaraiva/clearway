# 04 Level 4: Spillback

Type: task
Status: ready-for-agent
Blocked by: 03

## Goal

Author Level 4: Reveal J4 and J5 together. J5's queue spills up R45 and locks J4; the fix is at J5. Spec: `../spec.md` (Level 4).

## Changes

- Heavy stream J3 → J4 → R45 → J5 → west into R56's Fog. Size it for Level 5, where it is J6's E–W crossing stream.
- J5 `initial`: disable `R56.ring1>R56.out1`, so westbound cars exit on one lane.
- `tools: ['connector', 'priority']`.
- Solution: `{ at: 'J5', enable: ['R56.ring1>R56.out1'] }`.
- Check the spill reaches J4 within the Pre-warm, and that changing J4's Priority rule does not Win.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
