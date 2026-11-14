# Player Tools: District 1

Status: open (grilled 2026-11-09 in `.scratch/game/issues/02-player-tools.md`)

## Goal

Give the player three Tools and one Inspector, enough for a seven-Level District. Each Tool is the intended answer to at least one Level. Vocabulary in root `GLOSSARY.md`.

## Tools

| Tool | What the player changes | Junction types | Teaches in | Sim work |
| --- | --- | --- | --- | --- |
| Connector | Turns a Connection on or off | all | Level 2 | none, exists |
| Priority rule | Per Arm: `main` or `yield` | crossroads, T | Level 1 | rework ([#6](https://github.com/artsaraiva/clearway/issues/6)) |
| Signal | Per Junction: on or off | crossroads, T | Level 5 | rework + gate test ([#7](https://github.com/artsaraiva/clearway/issues/7)) |

### Connector

Unchanged from the prototype. Removing Connections is also how turn bans, one-way streets and closures are done; there are no separate network tools. Level 6 teaches removal.

### Priority rule

Replaces the prototype's yield/stop/signal per Arm. Stop is gone: it is yield with a penalty and never the intended answer.

Conflict rules at a crossroads or T-junction:

- A `yield` Arm yields to every `main` Arm.
- Arms of equal priority give way to the right.
- A left turn yields to oncoming straight traffic of equal priority.
- All-`yield` and all-`main` are the same uncontrolled junction.

On a roundabout the ring is always main and the tool is not offered.

### Signal

A Junction-wide mode. While on, every Arm gets green in turn with a fixed equal split, and the Junction's Priority rules are ignored. Off restores them. No timing editor, phases or actuation in District 1.

**Conditional.** The prototype showed fixed signals never beat yield on a roundabout. Signal enters the roster only when the gate test in [#7](https://github.com/artsaraiva/clearway/issues/7) passes on a crossroads: two heavy crossing flows, main/yield `< 0.50`, Signal `≥ 0.80`. If it fails, Signal leaves v1 and Level 5 becomes a main-road swap puzzle.

## Inspector

Read-only, always available, never listed in `Level.tools`.

- **Route**: click a car, its remaining route to its Exit lights up. Nothing else is shown. Interaction and styling are 05's job.

Backlog: congestion heatmap, queue length per Arm, desire lines.

## Availability

`Level.tools` lists the Tools allowed in a Level. Convention: cumulative, a Tool stays once taught. A Level may restrict for a puzzle. No cost, budget or change limit (decided in 01).

## District 1 outline

Content is in `.scratch/district-01/spec.md` (grilled in [#33](https://github.com/artsaraiva/clearway/issues/33)). Level 1 is Priority rule only, Level 2 connector only, Level 5 Signal only, Level 6 connector only. The Tool each Level teaches:

1. T-junction: Priority rule, swap the main road.
2. Crossroads with an unused lane: connector.
3. Crossroads where the fix is upstream: connector and Priority rule.
4. Two Junctions revealed at once, one a roundabout: Spillback.
5. Crossroads with two heavy crossing flows: Signal (or main-road swap).
6. A left turn blocks through traffic: remove a Connection.
7. Finale: the Reveal re-jams the Level 1 T-junction, every Tool allowed.

## Verification

Per CLAUDE.md, outcomes only. Each Tool issue carries a headless test: a Level jams with its initial configuration and the Tool's Change clears it. Levels 2–7 need 04's junction model before their tests can exist.

## Issues

- [#6](https://github.com/artsaraiva/clearway/issues/6) Priority rule, blocked by #3
- [#7](https://github.com/artsaraiva/clearway/issues/7) Signal, blocked by #3, #6
- [03 Route inspector](issues/03-route-inspector.md), done 2026-11-09

## Backlog

- Lane arrows, signal timing editor, actuated signals.
- Add or remove a lane, junction type swap (crossroads, roundabout, turbo roundabout).
- Heatmap, queue bars, desire lines.
- Change counts, budgets, stars (01).
