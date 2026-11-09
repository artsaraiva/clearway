# 02 Player tools

Type: grilling
Status: resolved
Blocked by: 01

## Question

Which tools does the player get, how much does each cost, and in what order are they unlocked? Each tool should be the intended answer to at least one level.

## Context

- Map: `.scratch/game/map.md`. Core loop decisions come from 01.
- Prototype tools: a lane connector per ring node (TM:PE style) and a priority rule per approach (yield / stop / signal).
- Finding: fixed-cycle signals never beat plain yield in the prototype. As built, signals are not a useful tool.
- Prototype backlog: lane arrows, per-approach lane count, timed signal editing, speed limits, vehicle restrictions, junction restrictions, a tool budget.

## Candidates

- **Right of way:** a priority-road setting, a signal timing/phase editor, smart (actuated) signals.
- **Lane-level:** lane arrows (a simpler version of the connector), the connector as an advanced tool, adding or removing a lane.
- **Rebuilding a junction:** swap the type (crossroads, roundabout, turbo roundabout), add a right-turn slip lane.
- **Network-level (chains):** one-way streets, turn bans, road closures, speed limits, detour signs that divert part of the traffic.
- **Restrictions:** bus lanes and truck bans (need more vehicle types first), don't-block-the-junction, no U-turn.
- **Diagnosis (fixes nothing, but needed):** a congestion heatmap, click a car to see its route and why it's waiting, queue length per arm, lines showing where traffic comes from and goes to.

## To grill

- Which 3–4 tools make the first playable? Which level teaches each one?
- Cost model: a budget currency, a count of changes, or none?
- Does the connector stay, or do lane arrows replace it for most players?
- What would make signals worth using? A timing editor, phases, smart signals, or drop them?
- Which diagnosis tools are needed to make a jam understandable?
- Which tools need sim work (new conflict types, vehicle types, lane changes) and which are pure rules?

## Resolution produces

- Decisions in `map.md`.
- `.scratch/player-tools/spec.md` plus implementation issues, one per tool.
- Unblocks 05.

## Answer

Grilled 2026-11-09, three rounds. Vocabulary in root `GLOSSARY.md` (Priority rule redefined, Signal and Inspector added).

### Decisions

1. **Roster for District 1.** Three Tools: the connector (exists), the Priority rule as main/yield per Arm, and the Signal as a Junction-wide on/off with a fixed equal split. Stop signs are dropped: a stop is a yield with a penalty and is never the intended answer.
2. **Signal is conditional.** It enters the roster only when a headless test shows it winning on a crossroads with two heavy crossing flows (signal ≥ 0.80 where main/yield stays < 0.50). The test needs 04's crossroads, so it lands as a player-tools issue blocked by 04. If it fails there too, signals leave v1. Even if proven, District 1 has no timing editor, phases or actuation.
3. **Network tools are connector moves.** Turn bans, one-way streets and closures are Connection removals. No separate tools.
4. **Tools by Junction type.** Roundabouts take the connector only; the ring is always main. Priority rule and Signal apply to crossroads and T-junctions.
5. **Conflict rules (simulation, not Tools).** Equal Arms give way to the right. A left turn yields to oncoming straight traffic of equal priority. A yield Arm yields to every main Arm. All-yield and all-main are the same uncontrolled junction.
6. **Cost.** None, as 01 decided. `Level.tools` stays a per-Level list, cumulative by convention; a Level may restrict for a puzzle.
7. **Inspector.** A new kind of thing: read-only, always available, never in `Level.tools`. The first Inspector is click a car, its remaining route lights up. Heatmap, queue bars and desire lines are backlog.
8. **District 1 outline, 7 Levels.** 1–4 as 01 set. 5: crossroads with two heavy crossing flows, teaches Signal (or a main-road swap if the gate fails). 6: a left turn blocks through traffic, fix is removing a Connection. 7: finale, the Reveal re-jams the Level 1 roundabout, every Tool allowed. Level content is the chain ticket's job after 04.
9. **Backlog.** Lane arrows, signal timing editor, actuated signals, add/remove lane, junction type swap (crossroads, roundabout, turbo), heatmap, queue bars, desire lines.

### Sim work per Tool

- Connector: none.
- Priority rule: rework yield/stop/signal into main/yield plus the conflict rules above. Needs 04's generic junction.
- Signal: move from per-Arm to per-Junction; gate test. Needs 04's crossroads.
- Route Inspector: UI only, data exists (BFS path).

### Output

`.scratch/player-tools/spec.md` plus issues 01 priority rule (blocked by 04), 02 signal (blocked by 04), 03 route inspector (unblocked, build now in the throwaway UI). Unblocks 05.

## Comments
