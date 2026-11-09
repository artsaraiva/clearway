# 01 Core loop

Type: grilling
Status: resolved
Blocked by:

## Question

What is the game? Decide the shape of play: how a level starts, what the player does, what counts as winning, what stops brute force, and how levels connect.

## Context

- Map: `.scratch/game/map.md` (read Notes and Fog first).
- Prototype spec and findings: `.scratch/traffic-prototype/spec.md`, especially `## Success rubric` and `## Comments`.
- The prototype rubric has not been answered formally. Start by answering its 4 questions. The user's verdict so far: "an ok prototype".

## To grill

- Rubric answers: did the jam read as a jam, did a connector change visibly matter, did the look feel right, do you want to build the chain?
- Progression shape: discrete levels, one growing city, or a chain of fogged areas where fixing one junction opens the next?
- Win condition: keep the speed ratio (`v / v_free`), or switch to throughput/demand or mean delay? Is the speed ratio gameable (for example by starving an arm)?
- Is there a score beyond win/lose, such as stars for flow, changes used or cost?
- Constraints against brute force: a budget per level, a limited tool set per level, a limited number of changes?
- Demand over time: fixed, or ramping like a growing city? Can the player lose? Is there time pressure?
- Feedback loop: how fast should a fix show? Is 4× the right default, does it need 8×, and does warm-up need to be shorter?
- Session shape: how long is a level, and how many levels for a first playable?
- What does the first playable slice contain? Smallest set of levels, tools and screens.

## Resolution produces

- Decisions appended to `map.md` under Decisions so far, with Fog items removed or narrowed.
- `GLOSSARY.md` started via `/domain-modeling` (Level, Junction, Arm, Lane, Connection, Flow, and so on).
- Unblocks 02 and 04.

## Answer

Grilled 2026-11-09, three rounds. Vocabulary in root `GLOSSARY.md`.

### Rubric

All four yes: the jam read as a jam, the connector fix visibly shrank the queue, the look direction is right (detail is 03's job), and the chain is worth building. Prototype phase closed.

### Decisions

1. **Progression.** One hand-authored District per map, revealed one Junction at a time. Fog is presentation; fogged junctions do not exist in the simulation. Every revealed junction keeps simulating, so spillback and upstream fixes matter. Upstream junctions stay editable.
2. **Demand per Level.** Each Reveal applies an authored demand table. Re-jamming an upstream junction after a reveal is a deliberate puzzle beat.
3. **Win.** Flow (`v / v_free`, queued spawns count 0) at or above 80 % for 60 sim-seconds, measured across the whole revealed network. Remove destination re-roll: a car whose destination is unreachable waits at spawn and counts 0. That closes the one known way to game the metric (cut every route to a hard exit and its demand vanishes). Throughput/demand and mean delay stay backlog.
4. **Pure puzzle.** Demand fixed within a level, no ramp, no clock, no lose state. A jam persists until fixed. Ramping only as an authored event if a specific level needs it.
5. **Feedback.** Pre-warm about 90 s hidden on each Reveal, so the jam is already formed when the level appears; the 60 s warm-up timer goes. Speeds pause/1×/4×/8×, default 4×. Win is 15 real seconds at 4×. On win: banner, sim keeps running, player clicks next to Reveal.
6. **Brute force.** First playable has no change limit and no budget. Each level lists its allowed tools. Change counts, budgets and stars are backlog, decided after one district plays end to end.
7. **Reset** to initial configuration per level. Undo is backlog.
8. **Pacing.** 2–5 minutes real time per level, 5–8 junctions per district.
9. **First playable slice.** One district, 4 levels: (1) the prototype roundabout, connector only; (2) a T-junction, priority rule; (3) a crossroads where the fix is upstream; (4) two junctions revealed at once, spillback. Tools: connector, yield/stop. Signals cut until 02 proves them. Screens: fogged map, gauge, win banner, next-level reveal. No menu, no save, no stars.

### Unblocks

02 Player tools and 04 Road network model. 04 should take: whole-network simulation, demand table per reveal, fogged junctions absent from the sim, pre-warm on reveal, no destination re-roll.

## Comments
