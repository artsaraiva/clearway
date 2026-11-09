# Traffic Puzzle Game: Map

The parent for everything after the prototype. Child tickets live in `issues/`; each topic that resolves into build work gets its own `.scratch/<topic>/spec.md` + `issues/`.

## Vision

A browser puzzle game: the player fixes traffic jams by changing how junctions work (lane connections, right of way, signals, and more), then watches the jam clear. Look: Apple Maps 3D. That means a white/off-white ground, gray roads with curbs and sidewalks, rounded corners, lane markings, crosswalks, grass, blobby low-poly trees, light-gray extruded buildings, and in-world signs. See `reference/apple-maps-roundabout.png`. Later: a chain of junctions and roundabouts, where fixing one opens the next.

## Notes

- Prototype: `.scratch/traffic-prototype/spec.md`, built in commit `9ea74dd`. Run with `npm run dev`; test with `npm test`.
- What the prototype has: `src/sim/` (seed-quality, pure TS) with a 4-arm roundabout generator, IDM car-following, gap acceptance, BFS routing, yield/stop/signal, a flow metric and a seeded RNG. `src/render/` and `src/ui/` are throwaway.
- Prototype findings (details in the spec's `## Comments`):
  - The jam and the inner-ring connector fix read well visually.
  - Fixed-cycle signals on the side arms never beat plain yield. Fixed signals can't add ring capacity, and red time adds stopped cars to the metric. Signals are unproven as a tool.
  - The headless result is seed-sensitive: about 8 of 10 seeds pass each scenario.
  - The flow metric needed `v_free` redefined (free speed at that spot) and a 60 s warm-up before the win timer.
- Code review open items:
  - `Sim` does spawn, routing, driving, rules and metric in one class.
  - Ports are plain strings (`approach1>ring0`).
  - `Lane.arm` means three things.
  - No direct tests for geometry or network.
- User verdict on the prototype: "an ok prototype". 1× was too slow, so 4× is now the default.
- Workflow: grilling ticket, then `spec.md`, then split into `issues/NN-*.md`, then `/implement` each one (it ends with code review and a commit). Start `GLOSSARY.md` via `/domain-modeling` during the first grilling.

## Decisions so far

- Platform stays browser, Three.js + TypeScript + Vite, no game engine. (prototype grilling)
- Simulation stays microscopic and deterministic: IDM, gap acceptance, seeded RNG. `src/sim/` has no Three.js import. (prototype grilling)
- Prototype closed 2026-11-09: rubric 4 of 4 yes (jam read as a jam, connector change visibly mattered, look direction right, build the chain). Spec marked done.
- Core loop (01, 2026-11-09). Details in `issues/01-core-loop.md` under Answer. Vocabulary in root `GLOSSARY.md`.
  - Progression: one hand-authored District per map, revealed one Junction at a time. Fog is presentation; fogged junctions don't exist in the sim. All revealed junctions simulate together. Upstream junctions stay editable.
  - Demand is authored per Level and changes on each Reveal. Re-jamming an upstream junction is a deliberate puzzle beat.
  - Win: Flow (`v / v_free`, queued spawns count 0) ≥ 80 % for 60 sim-seconds across the whole revealed network. Unreachable destinations no longer re-roll; the car waits at spawn and counts 0, so cutting routes can't delete demand.
  - Pure puzzle: fixed demand within a level, no ramp, no clock, no lose state. Ramping only as an authored event if a level needs it.
  - Feedback: Pre-warm each level ~90 s hidden on Reveal, so the jam is visible at once and the 60 s warm-up goes. Speeds pause/1×/4×/8×, default 4×. Win banner, sim keeps running, player clicks next to Reveal.
  - Brute force: first playable has no change limit and no budget. Each level lists its allowed tools. Change counts, budgets and stars are backlog, decided after a district plays end to end.
  - Reset-to-initial per level. Undo is backlog.
  - Pacing target: 2–5 min per level, 5–8 junctions per district.
  - First playable: one district, 4 levels: (1) prototype roundabout, connector only; (2) T-junction, priority rule; (3) crossroads where the fix is upstream; (4) two junctions revealed at once, spillback. Tools: connector, yield/stop. Signals cut until 02 proves them. Screens: fogged map, gauge, win banner, next-level reveal. No menu, no save.
- Order of work (proposed 2026-11-09, confirmed in 01):
  1. Core loop first (01). It decides tools, metric and chain structure.
  2. Look-dev prototype in parallel (03). It's independent of the gameplay decisions.
  3. Road network model (04) before the visuals become production code. Curbs, blocks and buildings derive from the road graph, so they must not be built on the roundabout-only generator.
  4. Player tools (02) and UI/UX (05).
  5. Junction chain content last. Its data model is settled in 04.

## Fog

- Brute-force limit after the first district: change count, budget currency, or stars only? (deferred in 01)
- Which tools make v1 beyond connector and yield/stop? Can signals be made worth using (timing editor, smart signals)?
- How does the player diagnose a jam: heatmap, car inspector, queue bars?
- Do pedestrians and bikes get simulated, or are they decoration?
- Do drivers pick routes by travel time (rerouting around jams) or keep fixed routes?
- Can Three.js hit the Apple Maps look cheaply? Curbs, rounded corners, ambient occlusion, trees and buildings at a good frame rate.
- Levels: hand-authored files, a level editor, or procedural generation?
- Desktop only, or touch too?
- Junction chain design needs its own ticket once 01 and 04 resolve.

## Tickets

| # | Ticket | Type | Blocked by |
| --- | --- | --- | --- |
| 01 | [Core loop](issues/01-core-loop.md) | grilling (resolved) | |
| 02 | [Player tools](issues/02-player-tools.md) | grilling | 01 (resolved) |
| 03 | [Look-dev](issues/03-look-dev.md) | prototype | |
| 04 | [Road network model](issues/04-road-network-model.md) | grilling | 01 (resolved) |
| 05 | [UI/UX](issues/05-ui-ux.md) | grilling | 02 |
