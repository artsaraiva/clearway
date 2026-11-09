# 02 Player tools

Type: grilling
Status: open
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

## Comments
