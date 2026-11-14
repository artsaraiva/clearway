# District 1: Seven Levels on a street grid

Status: open (grilled 2026-11-14 in [#33](https://github.com/artsaraiva/clearway/issues/33); replaces the ladder grilled 2026-11-12 in `.scratch/game/issues/06-junction-chain.md`)

## Goal

Author `levels/district-01.ts`: eight Junctions on a small street grid, seven Levels, each with its Reveal, Demand, initial configuration, reference solution and slab pieces. Vocabulary in root `GLOSSARY.md`. File format and Reveal behaviour come from `.scratch/road-network/spec.md`, Tools from `.scratch/player-tools/spec.md`, the look and the slab from `.scratch/visual-style/spec.md`.

In this spec a **stream** is one origin–destination entry of Demand: vehicles per minute from one Gateway to another. (Not "flow": Flow is the metric.)

## Scale

- **Lanes are 7 m wide in the sim**, everywhere. Blocks, Junction mouths and turn curves are cut from the sim's lane geometry, so there is one geometry and no separate drawn width.
- **Speed limit 13.9 m/s.** The Priority rule needs the headroom between the yield ceiling (about 14 vehicles a minute) and a lane's own limit; at 8 m/s the two sit too close (`docs/adr/0003-yielding-costs-time.md`). If 13.9 m/s looks frantic in playtest, lower the default play speed to 2× and leave the sim speed alone.
- **A queued car takes 6.5 m** (4.5 m car, 2 m gap). Road lengths below are chosen by how many cars they hold.

## Layout

A grid of four columns and two rows, every Road axis-aligned. Revealed clockwise: the north row west to east, down the east side, back along the south row. J8 closes the last Block at J1.

```
                N2        N3        N4
                ‖         |         |
W1 == J1 ====== J2 ====== J3 ====== J4
      (T)       (+)       (+)       (T)
       |         |         |         ‖  R45, short
W8 -- J8 ------ J7 ------ J6 ====== J5 (RB) == E5
      (T)       (+)       (+)
                 |         |
                 S7        S6
```

`==` and `‖` are two lanes each way, `--` and `|` one.

- Loops appear only as Blocks close: J3-J4-J5-J6 in Level 5, J2-J3-J6-J7 in Level 6, J1-J2-J7-J8 in Level 7.
- 8 edge Gateways: W1, N2, N3, N4, E5, S6, S7, W8.
- 1 roundabout, 3 T-junctions, 4 crossroads.

### Starting coordinates (metres, tune freely)

Columns sit 90 m apart, rows 80 m apart. The slab is about 370 × 210 m: x from −175 to 195, y from −105 to 105.

| Junction | Type | At | Arms |
| --- | --- | --- | --- |
| J1 | priority (T) | (−135, 40) | W1, R12, R18 (stem) |
| J2 | priority (crossroads) | (−45, 40) | N2, R12, R23, R27 |
| J3 | priority (crossroads) | (45, 40) | N3, R23, R34, R36 |
| J4 | priority (T) | (135, 40) | N4, R34, R45 |
| J5 | roundabout, radius about 18, 2 Ring lanes | (135, −40) | R45, E5, R56 |
| J6 | priority (crossroads) | (45, −40) | R36, R56, R67, S6 |
| J7 | priority (crossroads) | (−45, −40) | R27, R67, R78, S7 |
| J8 | priority (T) | (−135, −40) | R18, R78, W8 |

### Roads

| Road | Lanes | Speed | Notes |
| --- | --- | --- | --- |
| W1, R12, R23, R34 (the north row) | `[2, 2]` | 13.9 | Sakura Avenue |
| N2 | `[2, 2]` | 13.9 | Level 2's dual right |
| R45, R56, E5 | `[2, 2]` | 13.9 | the path of Level 4's stream |
| R27 (J2–J7) | 1 southbound, 2 northbound | 11 | Level 3's dual right; Level 6's blocked lane |
| R36 (J3–J6) | `[1, 1]` | 8 | Tsuki-dori, the slow street |
| R18 (J1–J8) | `[1, 1]` | 13.9 | Level 1's stem |
| R67, R78, N3, N4, S6, S7, W8 | `[1, 1]` | 13.9 | |

- Edge Gateway Roads start at the slab edge: W1 from (−175, 40), N2 from (−45, 105), N3 from (45, 105), N4 from (135, 105), E5 from (195, −40), S6 from (45, −105), S7 from (−45, −105), W8 from (−175, −40).
- **Estimates, pin while authoring.** A Junction's footprint is about 12 m with one lane each way (measured on the street-grid fixture) and about 19 m where a two-lane Road meets it (estimated). So a two-lane Road between Junctions keeps about 52 m of lane, 8 cars per lane, and a one-lane cross street about 55 m. A Road needs at least 10 m of lane.
- **R45 is short on purpose:** tune the Ring radius so it keeps 30–35 m of lane, about 5 cars per lane, and J5's queue reaches J4 within the Pre-warm.
- **The cross-street speeds make the route shifts** of Levels 6 and 7 (see those Levels). Routing is lane length ÷ speed limit; the yield crawl is not in it, so the Priority rule never moves a route.

### Slab pieces

Each Level adds strips of slab that tile to a clean rectangle by Level 7. A seam sits just outside the footprint of the next Junction, where the Road into the Fog ends, so each Level's Roads stay on its own pieces. Starting numbers, pinned against the real footprints:

| Level | Pieces (x0, y0, x1, y1) |
| --- | --- |
| 1 | (−175, −28, −64, 105) |
| 2 | (−64, −28, 26, 105) |
| 3 | (26, −28, 116, 105) |
| 4 | (116, −105, 195, 105) and (64, −105, 116, −28), which carries R56 to its fogged end |
| 5 | (−33, −105, 64, −28) |
| 6 | (−123, −105, −33, −28) |
| 7 | (−175, −105, −123, −28) |

Level 1's piece is about 110 × 135 m: one T-junction, close up.

### Scenery

- Theme city. Sakura Avenue is the north row and is lined with street trees.
- Kumo Park sits north of the avenue on Level 1's piece, behind J1 from the opening camera, so nothing tall hides the first Jam.
- Hikari Tower stands north of the avenue between J2 and J3, near the slab's centre.
- R36 is Tsuki-dori.
- The roundabout island's tree is the south-east landmark. Everything else is seeded.

## Rules for every Level

- **Initial configuration** looks plausibly mis-set (a wrong main road, a lane unused), never absurd (a whole Arm cut off). Defaults are fine where the Demand is the puzzle.
- **Fixes.** The reference solution is the intended fix. Any configuration that Wins counts.
- **Tools.** Teaching Levels restrict `Level.tools` to the new Tool, across the whole network (see the table).
- **Continuity.** When a Fog Gateway's Junction is Revealed, a stream that left the map there continues through it to one of its new Gateways at the same rate; a stream that entered there now enters at one of them. New streams appear only at the new Junction's edge Gateways.
- **Re-jams.** Earlier Junctions keep working through Level 6 with their solutions applied. Only Level 7 re-jams one (J1), and only by shifting routes.

## Levels

| Lvl | Reveals | Jam | Reference solution | Tools |
| --- | --- | --- | --- | --- |
| 1 | J1 | Heavy stream up the R18 stem turns right (east); the stem is `yield`, W1 and R12 `main` | R18 and R12 `main`, W1 `yield` | Priority rule |
| 2 | J2 | Heavy stream from N2 turns right (west) on the kerb lane only; N2's second lane is unused | Enable N2's second right-turn lane at J2 | connector |
| 3 | J3 | The stem stream from R27 reaches J3 on R23 lane 0 only; J3's west Approach yields to heavy `main` N3–R36 and jams on one lane | Enable the dual right at J2 (`R27.in1>R23.out1`) | connector, Priority rule |
| 4 | J4, J5 | Heavy stream J3 → J4 → R45 → J5 → west; J5 starts with `R56.ring1>R56.out1` disabled, so it exits on one lane, the Ring queues, R45 fills, J4 locks | Enable `R56.ring1>R56.out1` at J5 | connector, Priority rule |
| 5 | J6 | Two heavy crossing streams at an uncontrolled crossroads (defaults) | Signal on at J6 | Signal |
| 6 | J7 | The path through J7 is faster, so streams to S6 / E5 shift onto R27 and turn left at J7; a heavy northbound stream leaves no gaps, and waiting left-turners block R27's single southbound lane | Disable the left-turn Connection R27 → R67 at J7 | connector |
| 7 | J8 | The shortcut through J8 shifts streams from the S7 side to W1 onto J1's stem, on top of Level 1's stream | Disable the Connection R78 → R18 at J8 | all |

Refs are illustrative; pin them while authoring.

### Level 1

The player's first Jam and first Change. The heavy stream enters at R18's fogged end (at J8), goes north and turns right onto R12; the main road should follow the stream, not the straight line. `initial` is `J1: { priority: { W1: 'main', R12: 'main' } }`, and the fix is one Change, which moves the give-way paint in the world. Keep W1 nearly empty: a busy yielding Arm cannot push through the heavy stream (ADR 0003). This is the priority-swap pattern measured in [#52](https://github.com/artsaraiva/clearway/issues/52).

### Level 2

A new heavy stream from N2 turns right onto the avenue and leaves at W1. Size it above what one turning lane carries and below what two do. Initially only the kerb lane's right turn is enabled; the fix enables the second. The turn conflicts with almost nothing, so the unused lane is the whole puzzle.

Two more things are authored here for later Levels:

- **The stem stream** enters at R27's fogged end (at J7) and turns right onto R23, at a rate one lane carries (above one lane's yield ceiling of about 14 a minute, below two lanes'). Its second right-turn lane, `R27.in1>R23.out1`, starts disabled. It does not jam here.
- **Level 1's stream** now leaves at N2, which keeps J3's west Approach for the stem stream alone. Its left turn at J2 crosses the lanes N2's right-turners enter; if the two fight, send it right down R27 instead and re-author it in Level 7.

### Level 3

The Jam shows at J3, the cause is at J2: Connections upstream decide which lane a car arrives in, because there are no lane changes. J3's N3–R36 stream is heavy and `main`, so swapping J3's Priority rule jams N3–R36 instead; J3 can't fix itself. The fix is the move Level 2 just taught, one Junction back. The stem stream goes only straight or right at J3: a left would need R23 lane 1, unreachable before the fix, and those cars would wait at spawn.

### Level 4

The Jam shows at J4, the cause is downstream at J5, the District's one roundabout. The fix is a connector move the player already knows; the lesson is where to look. Changing J4's Priority rule is the tempting wrong move. The stream is the continuation of the stem stream's straight part plus a new one from N4.

### Level 5

The two crossing streams are ones the player watched vanish into Fog in Levels 3–4: J3's `main` stream heading down R36, and Level 4's stream out of J5 heading west. Size both for Level 5 from the start, since continuity keeps their rates.

**Conditional on the Signal gate** ([#7](https://github.com/artsaraiva/clearway/issues/7)), run once at 7 m lanes and 13.9 m/s. If it fails: rework those upstream rates so one stream is heavy and one moderate, start the heavy one as `yield`, and make the fix a main-road swap at J6. Tools become Priority rule only. Levels 6 and 7 are unchanged either way.

### Level 6

The left-turn demand comes from a route shift, not new Demand. Streams from W1 / N2 to S6 / E5 took J2 → J3 → R36 in Level 5. R36 is 8 m/s and R27 is 11 m/s, so once J7 is Revealed the path J2 → R27 → J7 → left is about 2.7 s faster (80 m ÷ 8 against 80 m ÷ 11). Banning the left sends them back to R36, which carried them in Level 5, so the fix is sound by construction. Stranded cars already queued for the left re-plan to the nearest reachable Gateway. The oncoming northbound stream on R27 enters at S7; see hazard 2.

### Level 7

Level 6 teaches "remove a Connection to send traffic back the old way" at one Junction; Level 7 asks for it across the network, and ends the District where it began. Streams from the S7 side to W1 ran up R27 and through J2 in Level 6. R18 is 13.9 m/s, so through J8 they are about 1.5 s faster (170 m ÷ 13.9 against 80 m ÷ 11 plus 90 m ÷ 13.9) and arrive on J1's single stem lane. Streams to N2 do not shift: R27 stays shorter for them. Any reconfiguration of J1 that Wins also counts.

## Authoring hazards

1. **Route shifts on every Reveal.** Every vehicle re-plans by free-flow time, so a Reveal can move a stream onto a newly opened faster path. On a true grid many paths tie, and ties go to the first lane in lane order. Levels 6 and 7 are built on a shift; anywhere else it is a bug. After authoring each Level, check every stream's route with the route Inspector.
2. **Streams that collapse.** A stream whose two ends both sit behind the same fogged Junction collapses when that Junction is Revealed. The stem stream enters at R27's fogged end (at J7), and by Level 5 its continuation can leave at R67's fogged end (also at J7). At Level 6 it must be re-authored. So Level 6's oncoming northbound stream is most likely a new S7 → W1 stream, which is also the one Level 7 shifts onto J1. That ties Levels 6 and 7 together. Level 1's stream enters at R18's fogged end (at J8) and is re-authored in Level 7.
3. **Lane-locked routes.** With no lane changes, a car can only reach a turn whose lane its earlier Connections lead to. A single lane cannot usefully feed two: every car takes the same one. Check that no stream is unreachable in a Level's initial configuration unless that is the point (it never is in District 1).
4. **Short Roads.** Eight cars fill a lane between two Junctions, so any queue can reach the Junction behind it. Spillback is the lesson in Level 4 only; anywhere else, lower the Demand.

## Tuning loop

Author each Level in order. A Level is done when:

- the Level test passes on the shipped seed (Flow < 0.5 after 180 s untouched with earlier solutions applied; Win within 300 s after the reference solution)
- `npm run sweep` jams and clears on at least 7 of 10 seeds
- the user playtests it: 2–5 minutes real time, and the intended fix reads

Adjust Demand first, Road length second, geometry last.

## Verification

Per CLAUDE.md, outcomes only: `levels/levels.test.ts` runs every Level. No new test seams.

The single-roundabout Level that shipped before this spec is retired, not re-tuned. The determinism test in `src/sim/sim.test.ts` moves onto the new Level 1; the other sim tests keep their own fixtures. The street-grid dev fixture (`src/dev/street-grid.ts`) is deleted when Level 1 lands.

## Issues

- [#56](https://github.com/artsaraiva/clearway/issues/56) Road graph and Level 1: Priority rule on a T-junction
- [#57](https://github.com/artsaraiva/clearway/issues/57) Level 2: connector and the unused lane, blocked by #56
- [#58](https://github.com/artsaraiva/clearway/issues/58) Level 3: fix upstream, blocked by #57
- [#59](https://github.com/artsaraiva/clearway/issues/59) Level 4: Spillback and the roundabout, blocked by #58
- [#60](https://github.com/artsaraiva/clearway/issues/60) Level 5: Signal, blocked by #59 and [#7](https://github.com/artsaraiva/clearway/issues/7)
- [#61](https://github.com/artsaraiva/clearway/issues/61) Level 6: turn ban, blocked by #60
- [#62](https://github.com/artsaraiva/clearway/issues/62) Level 7: finale, blocked by #61

The ladder's Level issues ([#8](https://github.com/artsaraiva/clearway/issues/8)–[#14](https://github.com/artsaraiva/clearway/issues/14)) were closed as superseded.

## Out of scope

- Districts after 1, change counts, budgets, stars (map Fog).
- UI for Reveal, level intro and teaching hints ([#15](https://github.com/artsaraiva/clearway/issues/15)).
- Slanted Roads. Every Road stays axis-aligned so Blocks and slab pieces are rectangles, as the scaffolding tool ([#46](https://github.com/artsaraiva/clearway/issues/46)) will produce them.
