# UI/UX

Status: open. Grilled 2026-11-15 in [#15](https://github.com/artsaraiva/clearway/issues/15). Replaces the minimum screen of the tile sandbox (`.scratch/tile-sandbox/spec.md`, "The page").

## Goal

Give the tile sandbox its real screen: how the player places Tiles, uses the Tools, reads the money and the traffic, and comes back to a saved City. It also sets the look of the UI and a new direction for the world's colours.

Vocabulary in root `GLOSSARY.md`. The rules of the game are in `.scratch/tile-sandbox/spec.md`, the world's look in `.scratch/visual-style/spec.md`.

## Already built, and kept

- Drag a Layout from the bar; `R` or the wheel turns it; `Esc` drops it.
- The Tile in the hand shows the price when legal, "not enough yen" when too expensive, and ✕ with the reason when refused.
- Dropping on a placed Tile is a Swap. Undo shows while its window is open.
- Each Gateway is labelled with its trips a minute.
- Pause, 1×, 4× and 8×.

## Platform

Desktop only: mouse and keyboard. Touch is [#114](https://github.com/artsaraiva/clearway/issues/114).

## Look

The direction is cozy Japanese and oversaturated, for the world and the UI.

- **The world:** saturation goes into the palette colour by colour. There is no filter over the picture. Buildings, roofs, trees, water, sky and cars go vivid, at every time of day: a clear cyan noon, an orange and pink dusk, a deep blue night that stays bright.
- **What stays quiet:** the road plate and the pavement stay pale and near-neutral, so cars, paint and Tool overlays read against them. The visual style spec's rule stands: readability beats style.
- **Reserved colours:** blue for Tools and Inspectors, hot red-orange for Jams and refusals. Scenery and cars keep off both at full strength.
- **The UI:** neutral frosted-glass pills and round buttons with dark text. Saturated colour appears only in accents: the yen fill, the Flow fill, the selected button and the hints.
- **Type:** one rounded typeface with Japanese roots (Zen Maru Gothic or M PLUS Rounded 1c), shipped with the game, with fixed-width digits. The UI is in English. Japanese script stays in speech bubbles and decoration.
- **How strong:** the user picks by eye from a mock that shows the world and the screen together at three strengths, at noon, dusk and night ([#104](https://github.com/artsaraiva/clearway/issues/104)). The pick sets the world's recolour ([#105](https://github.com/artsaraiva/clearway/issues/105)) and the screen.

Sound is out of this spec: [#115](https://github.com/artsaraiva/clearway/issues/115).

## Layout

| Place | Holds |
| --- | --- |
| Top-left | Yen with its fill toward the Price, Income small beneath, Growth under them |
| Top-centre | The Flow gauge with the Holding state, trips a minute and the Record |
| Top-right | Pause, 1×, 4×, 8× |
| Bottom-centre | The bar of Layouts, with the Zones in a second row, the Price and Undo |
| Bottom-right | Compass, recenter, tilt toggle, Demand view toggle |
| Bottom-left | A menu button: New run, the Free run switch, the list of keys |

Money sits apart from traffic, and nothing covers the middle of the board.

## Readings

- **Yen** is the largest reading. It carries a fill that grows toward the Price and is full when the next Tile is affordable. Income is a small line under it.
- **Flow** keeps its gauge and its Holding bar. Holding shows as the gauge's state and the word "Holding". There is no separate banner.
- **Trips a minute** and the **Record** sit with Flow.
- **Growth** ([#138](https://github.com/artsaraiva/clearway/issues/138)) sits under the yen: the sum of the Stages, with how many Tiles are at each. Hovering a placed Tile shows a small bar below its middle, clear of a Jam marker: its Stage as stars and its trips toward the next, "held back by a Jam" while its Junction is jammed, and "fully grown" at Stage 3. A badge with the Stage's stars rises over a Tile as it reaches a Stage. Which Tiles a Jam holds back across the City is the Stage Inspector's ([#139](https://github.com/artsaraiva/clearway/issues/139)).
- No history charts.

## Placing

- **Click-to-pick:** clicking a Layout picks it up and clicking a cell drops it. The Layout stays in the hand after the drop, until `Esc` or a right click without movement. A drag still places one Tile and lets go.
- **The bar's pictures** turn with the camera: each is the top-down icon rotated by the camera's heading plus the Tile's rotation, so it shows the Tile as it will land on screen.
- **Zones** ([#130](https://github.com/artsaraiva/clearway/issues/130), [#136](https://github.com/artsaraiva/clearway/issues/136)): the bar's second row offers the nine Zones, then Roads only, as small pictures that span the Layouts above them. The divider between the two rows names the Zone under the pointer, or the one picked, so a long name never widens the bar. A click picks the Zone of the Tiles laid next; it never goes in the hand, stays until changed and is not saved, and every run opens on low-density residential. The ghost's caption names the Zone, or over a placed Tile that Tile's own. Dragging a Zone onto a placed Tile rezones it, and the caption says what the Tile will become.
- **Demand before a drop:** over a legal cell, a Gateway the Tile would close has its label struck through, a Gateway it would open shows its trips a minute, and the ghost's line gives the change in total Demand. There is no forecast of traffic.
- While a Layout is in the hand, Junctions and cars cannot be clicked: every click is a drop.

## Tools

There is no toolbar and no mode.

- **Hover** lifts a soft ring around a Junction and changes the cursor.
- **A click selects the whole Junction.** Every Approach's lane ends show at once.
- **Priority rule:** clicking an Arm's give-way paint, or the round marker at its line, flips it between main and yield.
- **Connection:** drag from an incoming lane end to an outgoing one. A blue tube follows the pointer and snaps to a legal lane. Dragging onto an existing Connection removes it. Click, then click, still works.
- **Reset** acts on the selected Junction. The city-wide button goes. Undo of a single Change is [#116](https://github.com/artsaraiva/clearway/issues/116).
- **Deselecting:** `Esc`, a click on empty board, or selecting something else. `Esc` drops a Tile in the hand first.

## Reading the traffic

- **Jam markers:** a Junction whose Approaches move under half their free speed carries a small round marker above it. Clicking it centres the camera there and selects the Junction. A marker for a Junction off screen sits at the screen edge and points toward it. No per-Junction gauges, heatmap or queue bars.
- **Route Inspector:** clicking a car shows its route, one car at a time. It is dismissed like a selection, replaced by selecting a Junction, and ends when the car leaves at its Gateway.

### Demand view

An Inspector that shows which parts of the City carry the most trips.

- It draws the trips a minute that want to use each stretch of road as the width of a line: one line per direction on each Road, and one per turn inside each Junction. It shows volume, not speed, and is drawn from Demand and its routes, so it holds steady.
- A round button beside the camera buttons and the `V` key turn it on and off. It is off by default and the choice is kept in the save.
- It stays on while the player uses Tools and places Tiles, and redraws on every Change and Rebuild.
- With the view on, a clicked car's route draws brighter on top and the view dims beneath.
- Hovering a line shows its trips a minute. There are no numbers otherwise.
- With a Tile in the hand it shows the City as it stands, not as it would be.

## Camera

This overturns the drag buttons of the visual style spec, which were set for a bounded slab.

- Left drag pans, right drag rotates, and the wheel zooms toward the pointer.
- After a Rebuild the camera stays where it is. It moves only when the new Tile is off screen.
- The compass turns north up when clicked. Recenter, and the `F` key, frame the whole City. The tilt toggle flips between the steepest tilt and the default.

## Keys

| Key | Does |
| --- | --- |
| `Space` | Pause, and back to the speed before |
| `1` `2` `3` | 1×, 4×, 8× |
| `R` | Turn the Tile in the hand |
| `Esc` | Drop the hand, then deselect |
| `F` | Frame the whole City |
| `V` | Demand view on and off |

No frame step.

## Teaching

Three one-line hints, each shown once when it becomes relevant and remembered in the save. No tutorial screen.

1. On a first run, at the bar: "Drag a tile onto the board".
2. When the first Jam marker appears: "Traffic is stuck here. Click the junction."
3. On the first Junction selected: "Click the paint to give a road priority. Drag between lane ends to connect them."

## Accessibility

- **Without colour:** every state differs by shape or text as well. The ghost shows the price, "not enough yen", or ✕ and the reason. A yielding Arm has give-way triangles and a main one has none. Incoming lane ends are circles and outgoing ones are rings. Holding has its mark and its word. A Jam has the marker's shape and the cars' faces.
- **Reduced motion:** when the browser asks for it, a Rebuild places its Tile at once, cars stop shaking and clouds stop drifting. Cars still drive. There is no setting for it.
- **Text:** the smallest is 13 px, Gateway labels and hints included. No text-size setting.

## Save

- One autosave in `localStorage` for a normal run and one for a Free run. No menu screen: the page opens straight into the saved City.
- It holds a version number, the seed, the Tiles with each one's Stage and progress, the Changes, yen, the Record, the hints seen and the Demand view's toggle. Vehicles are not saved: loading is a Rebuild with a Pre-warm.
- It is written on every Rebuild and Change, and every few seconds for yen and progress.
- New run asks first.
- A save from an older version, or a damaged one, starts a new run and says so in one line. The Record is kept if it can be read. There is no migration before release.

## Verification

By playing, per `CLAUDE.md`. Issues that add geometry (the recolour, Jam markers, the Demand view) record the frame time with 1,000 cars.

A loaded save joins the Economy test seam: the user agreed in [#111](https://github.com/artsaraiva/clearway/issues/111).

## Issues

- [#104](https://github.com/artsaraiva/clearway/issues/104) Mock the screen at three strengths of saturation
- [#105](https://github.com/artsaraiva/clearway/issues/105) Recolour the world, blocked by #104
- [#106](https://github.com/artsaraiva/clearway/issues/106) The screen layout and the readings, blocked by #104
- [#107](https://github.com/artsaraiva/clearway/issues/107) Select a Junction and use both Tools in the world, blocked by #106
- [#108](https://github.com/artsaraiva/clearway/issues/108) Click-to-pick, pictures that turn with the camera, Demand before a drop, blocked by #106
- [#109](https://github.com/artsaraiva/clearway/issues/109) A camera for a City with no bounds, blocked by #106
- [#110](https://github.com/artsaraiva/clearway/issues/110) Jam markers, blocked by #107
- [#111](https://github.com/artsaraiva/clearway/issues/111) Autosave and the menu, blocked by #106
- [#112](https://github.com/artsaraiva/clearway/issues/112) Hints, keys, reduced motion and reading without colour, blocked by #107, #110 and #111
- [#113](https://github.com/artsaraiva/clearway/issues/113) The Demand view, blocked by #107 and #110

## Not in this spec

- Touch controls: [#114](https://github.com/artsaraiva/clearway/issues/114).
- Sound: [#115](https://github.com/artsaraiva/clearway/issues/115).
- Undo for Changes: [#116](https://github.com/artsaraiva/clearway/issues/116).
- History on the gauges, per-Junction gauges, a heatmap and queue bars: backlog.
