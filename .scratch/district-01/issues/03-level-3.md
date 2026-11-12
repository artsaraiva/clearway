# 03 Level 3: fix upstream

Type: task
Status: ready-for-agent
Blocked by: 02

## Goal

Author Level 3: Reveal J3, where the jam shows at J3 but the fix is at J2. Spec: `../spec.md` (Level 3).

## Changes

- J3's N–S stream (N3 ↔ R36) is heavy and `main`; J3's W approach (R23) yields. Size the R36 end for Level 5, where it is one of J6's crossing streams.
- The R27 stream reaches J3 in R23 lane 0 only and goes straight (toward J4) or right (down R36), never left.
- `tools: ['connector', 'priority']`.
- Solution: `{ at: 'J2', enable: ['R27.in1>R23.out1'] }` (dual right turn).
- Check that swapping J3's Priority rule does not Win: it should jam N–S instead.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
