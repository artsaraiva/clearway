# 06 Level 6: turn ban

Type: task
Status: ready-for-agent
Blocked by: 05

## Goal

Author Level 6: Reveal J7. A route shift creates a left turn that blocks R27's single southbound lane; the fix is banning it. Spec: `../spec.md` (Level 6, Authoring hazards 1–2).

## Changes

- Streams from W1/N1 to S6/E5 shift from J2 → J3 → R36 onto J2 → R27 → J7 → left (toward J6), because J7's placement makes that path faster.
- A heavy northbound stream on R27 from S7 leaves the left-turners no gaps. Level 2's stream collapses at this Reveal (both its ends were behind J7), so this is most likely a new S7 → W1/N1 stream. Level 7 shifts that same stream.
- `tools: ['connector']`.
- Solution: disable the left-turn Connection(s) R27 → R67 at J7. Cars already queued for it re-plan to the nearest reachable Gateway (`road-network/04`).
- Check that the banned streams return to the J3 route and J3, R36 and J6 keep up.

## Done when

- The Level test passes on the shipped seed: with earlier Levels' solutions applied, Flow < 0.5 after 180 s untouched, and a Win within 300 s after the reference solution.
- `npm run sweep` jams and clears on at least 7 of 10 seeds. Record the pass rate in Comments.
- Every stream takes its intended route (route Inspector). See the spec's Authoring hazards.
- The user has playtested it: 2–5 minutes real time, and the intended fix reads. Record the verdict in Comments.

Tune Demand first, Road length second, geometry last.

## Comments
