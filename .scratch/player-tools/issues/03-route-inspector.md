# 03 Route inspector

Type: task
Status: resolved
Blocked by:

## Goal

Click a car, its remaining route to its Exit lights up. Spec: `../spec.md`.

## Changes

- `src/ui/`: raycast a click to a car, highlight the lanes on its remaining path. Click elsewhere or Escape clears. Route data already exists on the vehicle (BFS path).
- Always available, not listed in `Level.tools`.
- Nothing else shown: no wait reason, origin or stats.

Built in the throwaway UI so Level 1 can be playtested with it. 05 redoes the UI anyway.

## Test

None. Per CLAUDE.md, `src/ui` is verified by running the game.

## Comments

- 2026-11-09: Built. `view.inspectCar(v)` in `src/render/scene.ts` draws a magenta ribbon from the car's current position along its remaining lanes, redrawn each frame and cleared when the car leaves. `src/ui/ui.ts` picks the nearest car within 3 m on click (after connector markers, before junction select); click elsewhere or Escape clears. Checked in the browser: clicking a queued south car lit its route around the ring to the north exit.
