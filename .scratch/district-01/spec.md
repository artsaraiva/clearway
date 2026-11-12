# District 1: Seven Levels

Status: open (grilled 2026-11-12 in `.scratch/game/issues/06-junction-chain.md`)

## Goal

Author `levels/district-01.ts`: eight Junctions, seven Levels, each with its Reveal, Demand, initial configuration and reference solution. Vocabulary in root `GLOSSARY.md`. File format and Reveal behaviour come from `.scratch/road-network/spec.md`, Tools from `.scratch/player-tools/spec.md`.

In this spec a **stream** is one origin–destination entry of Demand: vehicles per minute from one Gateway to another. (Not "flow": Flow is the metric.)

## Layout

A ladder of two rows, Revealed clockwise: the north row west to east, down the east side, back along the south row. J8 closes the last Block at J1.

```
        N1                    N3          N4
        |                     |           |
  W1 — J1 ======== J2 ======= J3 ======== J4
       (RB)        (T)        (+)         (T)
        |           |          |           |  R45, short
        |           |          |          J5 (RB) — E5
        |           |          |        /
  W8 — J8 ======== J7 ======= J6 ======
       (T)         (+)        (+)
                    |          |
                    S7         S6
```

- Loops appear only as Blocks close: J3-J4-J5-J6 in Level 5, J2-J3-J6-J7 in Level 6, J1-J2-J7-J8 in Level 7.
- 8 edge Gateways: N1, W1, N3, N4, E5, S6, S7, W8.
- 2 roundabouts, 3 T-junctions, 3 crossroads.

### Starting coordinates (metres, tune freely)

| Junction | Type | At | Arms |
| --- | --- | --- | --- |
| J1 | roundabout, radius 40, 2 Ring lanes | (0, 0) | N1, W1, R12, R18 |
| J2 | priority (T) | (240, 0) | R12, R23, R27 (stem) |
| J3 | priority (crossroads) | (480, 0) | N3, R23, R34, R36 |
| J4 | priority (T) | (720, 0) | N4, R34, R45 |
| J5 | roundabout, small (radius about 20), 3 Arms | (720, −110) | R45, E5, R56 |
| J6 | priority (crossroads) | (480, −240) | R36, R56, R67, S6 |
| J7 | priority (crossroads) | (300, −240) | R27, R67, R78, S7 |
| J8 | priority (T) | (60, −180) | R18, R78, W8 |

J7 and J8 sit off the grid on purpose. From J2, J2 → J7 → J6 is about 427 m against 480 m via J3 (11 % shorter), which drives Level 6. From J7, J7 → J8 → J1 is about 437 m against 487 m via J2 (10 % shorter), which drives Level 7. Free-flow time also counts curve speeds, so check the real routes after authoring.

### Roads

- Between Junctions: 180–200 m of lane. J6–J7 starts a little short; stretch it if queues spill by accident.
- R45 (J4–J5): 60–70 m of lane, about 10 cars per lane, so J5's queue reaches J4 within the Pre-warm.
- Edge Gateway Roads: 120 m of lane (N1 from (0, 170), W1 from (−170, 0), N3 from (480, 130), N4 from (720, 130), E5 from (870, −110), S6 from (480, −370), S7 from (300, −370), W8 from (−70, −180)).
- Lanes `[2, 2]` everywhere except R27 (J2–J7): 1 lane southbound (J2 → J7, for Level 6) and 2 lanes northbound (J7 → J2, for Level 3's dual right).

## Rules for every Level

- **Initial configuration** looks plausibly mis-set (a wrong main road, a lane unused), never absurd (a whole Arm cut off). Defaults are fine where the Demand is the puzzle.
- **Fixes.** The reference solution is the intended fix. Any configuration that Wins counts.
- **Tools.** Teaching Levels restrict `Level.tools` to the new Tool, across the whole network: Level 2 Priority rule only, Level 5 Signal only, Level 6 connector only. Levels 3–4 get connector and Priority rule; Level 1 connector; Level 7 everything.
- **Continuity.** When a Fog Gateway's Junction is Revealed, a stream that left the map there continues through it to one of its new Gateways at the same rate; a stream that entered there now enters at one of them. New streams appear only at the new Junction's edge Gateways.
- **Re-jams.** Earlier Junctions keep working through Level 6 with their solutions applied. Only Level 7 re-jams one (J1), and only by shifting routes.

## Levels

| Lvl | Reveals | Jam | Reference solution | Tools |
| --- | --- | --- | --- | --- |
| 1 | J1 | Prototype: approach lanes all feed Ring lane 0, inner Ring unused | Enable the inner Ring (the prototype's solution) | connector |
| 2 | J2 | Heavy stream up the R27 stem turns right (east); stem is `yield`, R12/R23 `main` | R27 and R23 `main`, R12 `yield` | Priority rule |
| 3 | J3 | J2 feeds R23 lane 0 only with that stream; J3's W approach yields to heavy `main` N–S and jams on one lane | Enable the dual right at J2 (`R27.in1>R23.out1`) | connector, Priority rule |
| 4 | J4, J5 | Heavy stream J3 → J4 → R45 → J5 → west; J5 starts with `R56.ring1>R56.out1` disabled, so it exits on one lane, the Ring queues, R45 fills, J4 locks | Enable `R56.ring1>R56.out1` at J5 | connector, Priority rule |
| 5 | J6 | Two heavy crossing streams at an uncontrolled crossroads (defaults) | Signal on at J6 | Signal |
| 6 | J7 | New path via J7 is faster, so streams to S6/E5 shift onto R27 and turn left at J7; a heavy northbound stream leaves no gaps, and waiting left-turners block R27's single southbound lane | Disable the left-turn Connection(s) R27 → R67 at J7 | connector |
| 7 | J8 | Shortcut via J8 shifts streams from S7 and the J8 side to N1/W1 onto J1's south approach, on top of the N–S corridor | Disable the Connection(s) R78 → R18 at J8 | all |

Refs are illustrative; pin them while authoring.

### Level 1

J1 keeps the prototype roundabout and Demand: the N1–R18 corridor at 22 per minute each way, side Arms (W1, R12) at 4 per minute, the same initial configuration and inner-Ring solution. R12 and R18 are Fog Gateways at about 200 m (the prototype had 120 m), and R18 leaves J1 at about 288° instead of 270°. Re-check Level 1 with the sweep.

### Level 2

The main road follows the heavy stream, not the straight line. The stream enters at R27's fogged end (at J7), goes north and turns right onto R23. With the default 2-lane Connections, the right turn uses stem lane 0 only, which is fine here and becomes Level 3's problem. `initial` needs a Priority entry (`J2: { priority: { R27: 'yield' } }`); add that to the format in `player-tools/01` if it's missing.

### Level 3

The jam shows at J3, the cause is at J2: Connections upstream decide which lane a car arrives in, because there are no lane changes. J3's N–S stream is heavy and `main`, so swapping J3's Priority rule jams N–S instead; J3 can't fix itself. The R27 stream goes only straight or right at J3: a left would need R23 lane 1, unreachable before the fix, and those cars would wait at spawn.

### Level 4

The jam shows at J4, the cause is downstream at J5. The fix is a connector move the player already knows; the lesson is where to look. Changing J4's Priority rule is the tempting wrong move.

### Level 5

The two crossing streams are ones the player watched vanish into Fog in Levels 3–4: J3's `main` N–S stream heading down R36, and Level 4's stream out of J5 heading west. Size both for Level 5 from the start, since continuity keeps their rates.

**Fallback if the Signal fails its gate** (`player-tools/02`): rework those upstream rates so one stream is heavy and one moderate, start the heavy one as `yield`, and make the fix a main-road swap at J6. Tools become Priority rule only.

### Level 6

The left-turn demand comes from a route shift, not new Demand: streams from W1/N1 to S6/E5 that took J2 → J3 → R36 in Level 5 now take J2 → R27 → J7 → left. Banning the left sends them back to the J3 route, which carried them in Level 5, so the fix is sound by construction. Stranded cars already queued for the left re-plan to the nearest reachable Gateway (`road-network/04`). The oncoming northbound stream on R27 enters at S7; see hazard 2 for which stream that is.

### Level 7

Level 6 teaches "remove a Connection to send traffic back the old way" at one Junction; Level 7 asks for it across the network. The N1–R18 corridor continues through J8 (to W8 or J7). The streams that shift are S7 / J8-side → N1 / W1, which ran up R27 and through J2 in Level 6. Any reconfiguration of J1 that Wins also counts.

## Authoring hazards

1. **Route shifts on every Reveal.** Every vehicle re-plans by free-flow time, so a Reveal can move a stream onto a newly opened shorter path. Levels 6 and 7 are built on this; anywhere else it is a bug. After authoring each Level, check every stream's route with the route Inspector.
2. **Streams that collapse.** A stream whose two ends both sit behind the same fogged Junction collapses when that Junction is Revealed. Level 2's stream enters at R27's fogged end (at J7), and by Level 5 its continuation leaves at R67's fogged end (also at J7). At Level 6 it must be re-authored, and from S7 any eastern destination is faster along the south row. So Level 6's oncoming northbound stream is most likely a new S7 → W1/N1 stream, which is also the one Level 7 shifts onto J1. That ties Levels 6 and 7 together.
3. **Lane-locked routes.** With no lane changes, a car can only reach a turn whose lane its earlier Connections lead to. Check that no stream is unreachable in a Level's initial configuration unless that is the point (it never is in District 1).

## Tuning loop

Author each Level when the sim work it needs lands. A Level is done when:

- the Level test passes on the shipped seed (Flow < 0.5 after 180 s untouched with earlier solutions applied; Win within 300 s after the reference solution)
- `npm run sweep` jams and clears on at least 7 of 10 seeds
- the user playtests it: 2–5 minutes real time, and the intended fix reads

Adjust Demand first, Road length second, geometry last.

## Verification

Per CLAUDE.md, outcomes only: `levels/levels.test.ts` (from `road-network/02`) runs every Level. No new test seams.

## Issues

- [01 Road graph and Level 1](issues/01-level-1.md), blocked by road-network 05
- [02 Level 2: T-junction, Priority rule](issues/02-level-2.md), blocked by 01, player-tools 01
- [03 Level 3: fix upstream](issues/03-level-3.md), blocked by 02
- [04 Level 4: Spillback](issues/04-level-4.md), blocked by 03
- [05 Level 5: Signal](issues/05-level-5.md), blocked by 04, player-tools 02
- [06 Level 6: turn ban](issues/06-level-6.md), blocked by 05
- [07 Level 7: finale](issues/07-level-7.md), blocked by 06

## Out of scope

- Districts after 1, change counts, budgets, stars (map Fog).
- UI for Reveal, level intro and teaching hints (`game/05`); Fog look (`game/07`).
