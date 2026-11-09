# 05 UI/UX

Type: grilling
Status: open
Blocked by: 02

## Question

How does the player use the tools, read the traffic, and move through the game? Decide the interaction model and the screens.

## Context

- Map: `.scratch/game/map.md`. The tool list comes from 02; level flow comes from 01.
- Prototype UI (`src/ui/ui.ts`, throwaway):
  - Flow gauge, Pause/1×/4× (4× default).
  - Click a junction to open a panel with Yield/Stop/Signal.
  - Click a blue lane end, then an orange one, to toggle a connection. Esc closes.
- Prototype stop lines show the rule by colour alone (white/red/green), which fails for colourblind players.

## To grill

- **Tools:** a toolbar (pick a tool, then click the world) vs a panel per junction. Drag from lane to lane to connect? Click an in-world sign to cycle the rule?
- **Editing:** undo, redo, reset. Is the budget/cost shown before a change is committed?
- **Reading the traffic:** history on the flow gauge, mini gauges per junction, heatmap and inspector overlays (from 02), brake lights.
- **Level flow:** level intro (goal), win screen (stars), level select or world map, tutorial levels that teach one tool each.
- **Time:** Pause/1×/4×/8×, step one frame, keyboard shortcuts (Space to pause).
- **Camera:** pan, rotate, zoom, focus on junction, framing when a hidden area is revealed.
- **Platform:** desktop only, or touch too?
- **Accessibility:** colour plus shape cues, readable text size, reduced motion.
- **Persistence:** saved progress (localStorage).
- **Visual language of the UI** over the Apple-Maps-style scene: panel style, icons, type.

## Resolution produces

- Decisions in `map.md`.
- `.scratch/ui-ux/spec.md` plus implementation issues. Optionally a `/prototype` of the toolbar and drag-to-connect first.

## Comments
