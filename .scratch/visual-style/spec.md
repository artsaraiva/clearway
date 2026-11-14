# Visual Style: the diorama renderer

Status: open (grilled 2026-11-13 in [#16](https://github.com/artsaraiva/clearway/issues/16))

## Goal

Replace the throwaway `src/render/scene.ts` with a renderer that draws a District as an anime-flavoured miniature diorama: a small Japanese-style town on a floating slab, readable as a traffic puzzle first. Vocabulary in root `GLOSSARY.md`.

The target is the user's "Anime Map Diorama" design. Its proof on the real sim was the prototype at `/diorama.html` (`src/lookdev/diorama.ts`, deleted from `main` in #32), kept with the three rejected looks on the local branch `16-visual-style-prototype`. Reference screenshots: `.scratch/game/reference/diorama-grid-golden.png`, `diorama-grid-noon.png`, `diorama-night.png`, `diorama-close.png`, `diorama-reveal.png`.

This overturns three look-dev (03) decisions: the perspective camera, static AO in place of shadows, and the baked distance-field ground.

## The rule

Readability beats style. Roads, markings, cars and jam feedback must stay as legible at night, zoomed out and mid-Reveal as they are at noon. Any effect that softens them is cut before any gameplay signal is.

## Rendering recipe

- Three.js on WebGL, standard soft-lit materials (roughness about 0.85), neutral tone mapping.
- One directional light with a 4096² soft shadow map, plus a hemisphere light. Blurred dark decals under every building and tree give the contact shadow.
- No cel bands, no outlines, no ink, no painterly filter. The only post-processing allowed was one bloom pass for night lights, and only if it cost under 2 ms per frame. It was measured in [#29](https://github.com/artsaraiva/clearway/issues/29) at 6.2 ms and cut, so there is no post-processing.
- Everything is procedural geometry and canvas-drawn textures. No authored 3D models, no image files.
- Static scenery is merged into one mesh per material. Cars and walkers are instanced.

The style comes from shape, palette and proportion:

- **Shape:** every box is rounded and bevelled; buildings are a wall box with a glass band per floor; houses have gable roofs; trees are clusters of spheres (round, sakura) or stacked cones (pine).
- **Palette:** pastel walls, terracotta / slate / teal roofs, pale grey road, off-white pavement, fresh greens, pink sakura. The prototype's constants are the starting point.
- **Proportion:** lanes about 7 m wide and Blocks roughly 40–60 m across, so a car reads as a toy and each building as an object. This was the single biggest difference between the first port (a 360 m roundabout District, rejected as "not the same") and the accepted one.

## Camera

Orthographic. Grab (left drag) rotates, the wheel zooms, right drag pans; tilt is clamped between roughly 24° and 72° above the horizon. Default view looks from the south-east at about 41° tilt with the whole slab in frame.

## The slab

- A District is drawn as a finite slab floating in open sky: soil, sand and grass layers, then a road-coloured plate. A soft shadow sits in the air beneath it. The sky is a three-stop gradient behind a transparent canvas.
- **Fog has no visual.** Unrevealed parts of a District are simply not there. Fog stays in the glossary as the rule that fogged Junctions do not exist in the sim.
- Each Level authors one or more rectangles in the District file: the pieces of slab its Reveal adds (harder Levels can add more). The slab is every piece Revealed so far.
- A Reveal only ever adds slab, next to the slab already there. A Level's Blocks are cut within its own pieces and keep clear of their outline, so a seam between two Levels' pieces is road plate and no later Reveal changes an earlier Level's Blocks. A Level's new Roads stay on its own pieces. (Settled with the user after the first Reveal playtest, 2026-11-14.)
- Roads run to the slab edge and stop. Cars grow in at a Gateway and shrink out at one. No tunnels, ramps or bridges off the slab.

## Roads and Blocks

- The road is the plate. A **Block** is a raised slab (about 1.2 m, bevelled) standing on it, coloured as pavement.
- Block outlines are cut from the lane geometry, not authored: a distance field over Road lanes at full width, the mouth of each Junction, and a car's width along every turning Connection (which rounds the corners), contoured with marching squares. The same field gives pavement centre lines for walkers and inset outlines for lawns. This handles a roundabout and a street grid with the same code. The ground bake from look-dev is retired, and its kerb-wave artefact with it.
- The prototype computes the field by brute force (1.3 s for nine Junctions). The real renderer needs a spatial grid over lane segments, and only computes the newly Revealed pieces.
- First version edges: the pavement is the rim of the Block, and a roundabout island is a raised slab with a tree. Bike bands, medians and splitter islands are cut. The `bikeBand`, `sidewalk` and `median` Road attributes stay unread.
- **Paint:** a dashed centre line per Road, lane dividers where a direction has more than one lane, and zebra stripes at Junction mouths (decoration until pedestrians become a mechanic).
- **Priority** is shown in the world as road paint (give-way triangles on a yielding Arm) and is re-read from the sim on every Change. No in-world signs. Signal lamps are designed when the Signal Tool ([#7](https://github.com/artsaraiva/clearway/issues/7)) passes its gate test.

## Block fill

- **Authored:** landmarks and special Blocks (a tower plaza, a park with a pond, a shrine on a hill, a river with a bridge). They live in the District file.
- **Seeded:** every other Block is split into lots from the District's seed. A lot becomes a tower, a mid-rise or a house by its distance from the District's centre, with the odd lot left as a tree. Lots that would overhang a rounded corner are dropped.
- Lamps stand at Block corners. Street trees line the main avenue.
- Districts are themed (city, countryside, harbor). The first is a city.

## Vehicles and jam feedback

- Cars only, in mixed colours, with a dark glass band. A bus skin arrives when the sim has a longer vehicle type.
- **Jam emotion is the main jam signal in the world.** A car that has been stuck for a few real seconds starts to shake and gets an anger mark; stuck longer, it steams and may pop a speech bubble. Marks go to the longest-stuck cars first. Bubble text is flavour only and never carries information.
- Clicking a car lights its remaining route as a glowing blue line above the road. Tool overlays (the Connection editor) use the same language: blue tubes and round markers.

## Day cycle

- A full day (morning, noon, dusk, night) loops on its own clock, a few minutes per day. It is cosmetic: it does not touch Demand, Levels or the sim, and the player cannot control it in the first version.
- One light is the sun by day and the moon by night; it goes dark for a moment at each handover so the jump across the sky is never seen. The hemisphere fill is raised through each handover, so roads are no darker there than at dusk.
- Night is a bright moonlit blue, not dark. Windows, lamps and car head and tail lights glow through emissive materials only; there are no per-object light sources.

## Reveal animation

On a Reveal the Level's pieces assemble brick by brick next to the slab already there: slab layers, road plate, Blocks, buildings (drop with a squash), trees and lamps (pop in), with dust where large pieces land. When it finishes the pieces are merged into the static meshes, cars grow in, and confetti fires. Decoration and labels for the new pieces appear after they land. Nothing already on the slab disappears or is rebuilt.

## Sky and ambient life

All of this is decoration outside the sim.

- Clouds drift across and cast shadows. They fade out as the camera zooms in, so they never sit between the player and a jam.
- One or two propeller planes cross the sky on near-straight lines with a slight curve, vanish at the edge, and start a new line.
- Walkers follow the pavement centre lines and never cross a road. Boats run the river.
- Labels are DOM overlays: romanised street names rotated along their Road with a white halo, and landmark names with a coloured dot. Japanese script appears only in speech bubbles and decoration.

## Interface style

Frosted-glass pills and round buttons (compass, recenter, tilt toggle), as in the design. This spec fixes the style only; the controls are built under [#15](https://github.com/artsaraiva/clearway/issues/15).

## District file additions

The renderer needs, per District: a theme, the seed for Block fill, authored landmarks and special Blocks, street names, and one or more pieces of slab per Level. `roadDefaults.laneWidth` becomes about 7 m.

## Budget

60 frames per second with 1,000 cars on an M4 Pro with the day cycle running. The prototype measures 9.9 ms per frame with 1,000 cars at 2× pixel density, about 1.06 M triangles. If shadows break the budget, the shadow map shrinks before any look decision changes.

## Verification

Visuals are verified by running the game, not by tests. Each issue is done when its part matches the reference screenshots and the prototype side by side, and the frame budget still holds with 1,000 cars.

## Issues

Each ports its part from the prototype rather than importing it.

1. [#25](https://github.com/artsaraiva/clearway/issues/25) Renderer skeleton, the slab and camera.
2. [#26](https://github.com/artsaraiva/clearway/issues/26) Blocks cut from lane geometry. Blocked by #25.
3. [#27](https://github.com/artsaraiva/clearway/issues/27) Block fill, landmarks and seeded lots. Blocked by #26.
4. [#28](https://github.com/artsaraiva/clearway/issues/28) Cars, jam emotion and Priority paint. Blocked by #26.
5. [#29](https://github.com/artsaraiva/clearway/issues/29) Day cycle. Blocked by #27 and #28.
6. [#30](https://github.com/artsaraiva/clearway/issues/30) Reveal animation. Blocked by #27.
7. [#31](https://github.com/artsaraiva/clearway/issues/31) Sky, ambient life and labels. Blocked by #27.
8. [#32](https://github.com/artsaraiva/clearway/issues/32) Delete `src/lookdev`. Blocked by #29, #30 and #31.

Follow-ups outside this effort:

- [#33](https://github.com/artsaraiva/clearway/issues/33) Grill: District 1 on the diorama. The grilling chose a small street grid as the first playable District, with the roundabout later, and 7 m lanes. That contradicts `.scratch/district-01/spec.md` (a ladder that opens on the roundabout); its Level issues [#8](https://github.com/artsaraiva/clearway/issues/8)–[#14](https://github.com/artsaraiva/clearway/issues/14) were closed as superseded. The existing roundabout Level and its tests need re-tuning for the new lane width.
- [#34](https://github.com/artsaraiva/clearway/issues/34) Research: procedural Districts.
- [#35](https://github.com/artsaraiva/clearway/issues/35) Grill: pedestrians as a mechanic.

## Out of scope

Bike bands, medians, splitter islands, buses and other vehicle types, in-world signs, signal lamps, weather, player control of the time of day, and Demand that follows the time of day.
