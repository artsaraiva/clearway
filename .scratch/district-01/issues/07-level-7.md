# 07 Level 7: finale

Type: task
Status: ready-for-agent
Blocked by: 06

## Goal

Author Level 7: Reveal J8, which opens a shortcut that floods J1. Spec: `../spec.md` (Level 7).

## Changes

- The N1–R18 corridor continues through J8 (to W8 or J7).
- Streams from S7 and the J8 side to N1/W1 shift from R27 → J2 → R12 onto R78 → J8 → R18 and enter J1 from the south, on top of the corridor.
- `tools: ['connector', 'priority', 'signal']` (minus Signal if it failed its gate).
- Solution: disable the Connection(s) R78 → R18 at J8. Any J1 reconfiguration that Wins also counts; note in Comments if playtesting finds one.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
