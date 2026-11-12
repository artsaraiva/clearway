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

## Already decided (don't re-grill)

- Tools: connector, Priority rule as main/yield per Arm, Signal as Junction-wide on/off (02). No cost, budget, change limit or stars (01).
- Reset to the configuration at the Reveal; undo is backlog (01, 04).
- Speeds pause/1×/4×/8×, default 4× (01).
- On Win: banner, sim keeps running, player clicks next to Reveal (01).
- First playable has no menu, no level select and no save (01).
- Inspector: click a car, its route lights up. Heatmap, queue bars and desire lines are backlog (02).
- Camera: perspective free look with `MapControls`, 35° FOV, polar 10°–75°, a reset key (03).

## To grill

- **Tool interaction:** a toolbar (pick a tool, then click the world) vs a panel per Junction. Drag lane to lane to connect, or keep click-click? Click an in-world sign to flip main/yield? Where does the Signal toggle live?
- **Showing priority:** signs are illegible at block zoom (03). Exaggerate them 1.5–2×, or show priority in a UI overlay? Stop lines coloured white/red/green fail colourblind players.
- **Reading the traffic:** history on the Flow gauge, per-Junction gauges, showing progress toward the 60 s Win hold.
- **Reveal and Level flow:** how Fog looks from the UI side, camera framing on a Reveal, the next-level button, a Level intro or goal line, and how a Level teaches its new Tool (hint text, or nothing).
- **Reset:** confirm the snapshot-at-Reveal behaviour 04 assumed.
- **Route Inspector:** interaction and styling (02 left these to 05).
- **Time:** step one frame, keyboard shortcuts (Space to pause).
- **Camera:** focus on a Junction, behaviour on Reveal.
- **Platform:** desktop only, or touch too? (moved from the map's Fog)
- **Accessibility:** colour plus shape cues, readable text size, reduced motion.
- **Visual language of the UI** over the Apple-Maps-style scene: panel style, icons, type. Coordinate with `game/07`.

## Resolution produces

- Decisions in `map.md`.
- `.scratch/ui-ux/spec.md` plus implementation issues. Optionally a `/prototype` of the toolbar and drag-to-connect first.

## Comments
