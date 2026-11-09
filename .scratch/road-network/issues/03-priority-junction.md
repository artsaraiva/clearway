# 03 Priority junction

Type: task
Status: ready-for-agent
Blocked by: 02

## Goal

Add the second Junction type: a T-junction or crossroads with 3–4 Arms at any angle. Player-tools issues 01 (Priority rule) and 02 (Signal gate test) build on it. Spec: `../spec.md` (Junction types).

## Changes

- `priority` Junction generator. Lane ends come from the Roads. Connection lanes are curves from every incoming lane to every outgoing lane on a different Arm, with no U-turns. Geometric conflicts are detected as now.
- Default enabled set: 1 lane takes all turns; with 2 lanes, the right lane takes right and straight and the left lane takes left and straight.
- Uncontrolled resolution: equal Arms give way to the right. Break the four-way standoff deterministically (for example, the vehicle that has waited longest goes), or an all-equal crossroads can lock. Main/yield and left-turn-yields-to-oncoming are player-tools issue 01's job.

## Test (outcome only, fixture District in `src/sim`)

- A crossroads with default Connections and moderate Demand from all four Gateways Wins.
- The same crossroads with every Connection from one Arm disabled jams, because that Arm's cars wait at spawn.

## Comments
