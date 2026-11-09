# 03 Look-dev

Type: prototype
Status: open
Blocked by:

## Question

Can Three.js reach the Apple Maps 3D look cheaply enough for a game? Build a throwaway static scene of one roundabout block and judge it against the reference.

## Context

- Reference: `.scratch/game/reference/apple-maps-roundabout.png`.
- Map: `.scratch/game/map.md`.
- The current renderer (`src/render/scene.ts`) is throwaway. It draws a separate ribbon per lane, an orthographic camera at 45°, one directional light with a PCF shadow map, and instanced rounded-box cars.
- This is a style reference only. Build our own look; copy no Apple assets or icons.

## Elements to try (hardest first)

- **Road surface:** each road and junction as one polygon, a raised curb with a sidewalk band, rounded corners at junction mouths, and a raised central island.
- **Lighting:** soft ambient occlusion. Try a post-processing pass (such as N8AO or SSAO) against faked contact shadows or baked vertex colours.
- **Ground:** grass areas with soft edges, plazas, and an off-white base.
- **Trees:** 2–3 blobby low-poly variants (noise-displaced icosphere canopy on a trunk, plus a conifer), drawn as instances.
- **Buildings:** extruded footprints, light gray, flat roofs.
- **Markings:** dashed lane lines, turn arrows, zebra crossings, yield triangles, stop lines, a bike lane strip.
- **Signs in the world:** yield/stop signs and signal poles at the stop line.
- **Cars:** brake lights when slowing down, and maybe windows.
- **Camera:** perspective with tilt; pan, rotate and zoom (`MapControls`).
- Optional: street names along the roads.

## To answer

- Which techniques give the look, and what does each cost in frames per second? Target 60 fps on a laptop with about 1,000 cars.
- Can the road surface and curbs be generated from lane/road geometry, or do they need a separate road-outline model? (This feeds 04.)
- Post-processing: is it worth adding? The prototype spec excluded it.
- Orthographic or perspective camera?

## Resolution produces

- A throwaway scene (a separate entry point or branch; it doesn't touch `src/sim/`) plus screenshots compared to the reference.
- Verdict and chosen techniques in `map.md`.
- Input to `.scratch/visual-style/spec.md`, written once 04 settles the road model.

## Comments
