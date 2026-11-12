# 05 Level 5: Signal

Type: task
Status: ready-for-agent
Blocked by: 04, player-tools 02 (Signal gate)

## Goal

Author Level 5: Reveal J6, an uncontrolled crossroads with two heavy crossing streams. Spec: `../spec.md` (Level 5).

## Changes

- The crossing streams are continuations: J3's N–S stream down R36 to S6, and Level 4's stream from J5 west through J6 into R67's Fog.
- J6 starts on defaults (uncontrolled).
- If the Signal passed its gate: `tools: ['signal']`, solution `{ at: 'J6', signal: true }`.
- If it failed: the spec's fallback. Rework the upstream rates in Levels 3–4 so one stream is heavy and one moderate, start the heavy one as `yield`, `tools: ['priority']`, and the solution is a main-road swap at J6.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
