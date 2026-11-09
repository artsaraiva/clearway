# 03 Look-dev

Type: prototype
Status: resolved
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

## Plan

Grilled 2026-11-09, two rounds. Build is a separate step.

### Observations from the reference

- Perspective camera, tilt about 55–60° from horizontal.
- No cast shadows. Flat ambient light plus soft darkening at curbs, tree bases and building feet.
- Roads are one dark gray surface with a lighter curb band, rounded junction mouths, teal bike strips, white dashes, zebras and arrows.
- Off-white ground, flat green grass, light gray extruded buildings, blobby trees on thin trunks.
- The prototype renderer is orthographic with PCF sun shadows: wrong on both counts.

### Decisions

1. **Where it lives.** Separate Vite entry `lookdev.html` plus `src/lookdev/`, on `main`, throwaway. Imports `src/sim/` geometry only, never `src/ui/`. Deleted once `.scratch/visual-style/spec.md` exists.
2. **Geometry input.** Roads come from the existing `buildNetwork` lane polylines. Grass polygons, building footprints with heights and tree positions are literal arrays in `src/lookdev/block.ts`, in sim metres, hand-written to echo the reference (park top-left, tower top-right, blocks south). Generating them from the road graph is 04's call.
3. **Road surface.** A signed distance field to the lane centrelines, baked once per level on the CPU over the level bounds plus a margin, at 0.5 m per texel (about 800² for the current block), into a bilinear `DataTexture`. One ground shader paints by distance: road inside `r`, curb band at `r..r+c`, bike teal band, contact AO band outside the curb, ground beyond. Junction mouths are rounded with a morphological close (dilate, erode) on the mask; fillet radius about 1.5 lane widths, tuned by eye. Curbs are flat paint, no height. Fallbacks, only if the rubric fails: 0.25 m texels, then raised curb geometry, then a polygon clipper.
4. **Camera.** Perspective, FOV about 35°. Free look via `MapControls`: left-drag pans on the ground, right-drag or two-finger rotates and tilts. Polar angle clamped to about 10°–75°, zoom clamped between whole-block and car-readable. One key resets to the reference framing (55° tilt). Signs and poles are 3D geometry because any angle is possible.
5. **Lighting.** No shadow map, no post-processing. Hemisphere light plus a weak directional for face shading. N8AO/SSAO only as a fallback if the result looks flat.
6. **AO.** Static layers only: distance-field bands at curbs and soft halos under building footprints and trees in the ground bake; a base-to-roof vertex gradient on buildings; a flat dark ellipse instanced under each car.
7. **Markings.** Reuse `ribbons` for dashes; zebra crossings as ribbon stripes; turn arrows and yield triangles as flat `ShapeGeometry`. No textures.
8. **Props.** Three instanced tree variants (noise-displaced icosphere canopy on a cylinder trunk, plus one conifer), `ExtrudeGeometry` buildings in light gray with flat roofs, flat grass polygons, one yield sign and one signal pole at a stop line to test legibility. No street names.
9. **Cars.** Keep the instanced rounded boxes. Add a second `InstancedMesh` for rear lights, red when `acc < -0.5` or `waiting` or `v < 0.3`, dark otherwise. No windows.
10. **Performance.** 60 fps with 1,000 cars placed statically along lanes (render cost only; sim cost is 04's budget). `setPixelRatio` capped at 2. A small rAF-timing overlay plus `renderer.info` draw calls.
11. **Palette.** Sample road, curb, ground, grass, bike teal and building gray from the reference, then tweak by eye. Keep the pastel car colours.
12. **Screenshots.** Key `S` downloads the canvas as PNG (`preserveDrawingBuffer` in the lookdev only), saved to `.scratch/game/reference/lookdev-NN.png`.

### Build order

Hardest first. 1 road bake and shader. 2 camera and lighting. 3 AO layers. 4 markings. 5 props. 6 cars and perf overlay. 7 screenshots and rubric. Stop and report after step 1 if the shader fails the eye test.

### Rubric

Four yes/no, judged against the reference:

1. A screenshot beside the reference reads as the same visual family at a glance.
2. Curb and junction-mouth shape are legible at game zoom.
3. 60 fps with 1,000 cars.
4. The road surface derives from lane polylines only, no hand-drawn outline.

Verdict and chosen techniques go to `map.md`; the plan feeds `.scratch/visual-style/spec.md` once 04 settles the road model.

## Answer

Built 2026-11-09. Run `npm run dev` and open `/lookdev.html`. Code is in `src/lookdev/` (throwaway). It reads `buildNetwork` lanes and runs the live `Sim` for cars; `src/render/scene.ts` only gained `export` on `ribbons`, `dashes`, `mid` and `CAR_COLORS`. Keys: R reset view, S screenshot, C toggle 1,000 static cars, 1–6 toggle layers. `window.lookdev.bench(n)` gives uncapped ms per frame.

Screenshots in `reference/`: `lookdev-06.png` is the reference framing, `lookdev-vs-reference.png` puts it beside the reference, `lookdev-03.png` is a close-up of a junction mouth, `lookdev-04.png` is a low-tilt driver's view with the give-way sign and brake lights, and `lookdev-05.png` is the 1,000-car stress view.

### Rubric: 4 of 4 yes (user confirmed the look 2026-11-09)

1. Same visual family at a glance: yes. The palette was sampled from the reference: dark gray road, teal bike band, light kerb, off-white base, saturated grass with a pale verge, pale blobby trees and light gray blocks. The remaining differences are framing and content (our arms are axis-aligned, the reference has sidewalks and labels), not technique.
2. Kerb and junction-mouth shape legible at game zoom: yes. Rounded mouths, the bike band wrapping the corners and the island kerb all read at the reference framing and hold up close (`lookdev-03`).
3. 60 fps with 1,000 cars: yes. Tested on an Apple M4 Pro (Chrome, ANGLE Metal) only. At 2800×2380, which is the retina pixel count of a 1400×1190 window, the full scene with 1,000 cars takes about 1.9 ms per frame. Clearing and syncing an empty frame alone takes 1.3 ms. 19 draw calls, 536k triangles. An integrated-GPU laptop 5–10× slower still fits in 16.7 ms.
4. Road surface from lane polylines only: yes. There is no hand-drawn outline. Islands are found by flood fill, not authored.

### Techniques and cost (2800×2380, M4 Pro)

| Technique | Cost |
| --- | --- |
| Ground bake: one RGBA16F texture, 794² at 0.5 m. R = road SDF, G = island flag, B = grass SDF, A = contact AO | 160 ms CPU once per level; about 0.15 ms GPU per frame; 1 draw |
| Ground shader paints road, edge line, bike band, kerb, kerb AO, verge, grass and AO halos by distance, antialiased with `fwidth` | included above |
| Static AO: kerb band and building/tree halos in the bake, base-to-roof vertex gradient on buildings, darker canopy undersides, alpha ellipse under each car | effectively free |
| Markings: dashes, centre line, give-way dashes, stop line, zebras, give-way triangles, turn arrows, merged into one mesh | 1 draw |
| Trees: 3 instanced variants (2 noise-displaced icospheres, 1 conifer) with vertex colours | 3 draws |
| Buildings: extruded footprints merged into one mesh | 1 draw |
| Cars: instanced body, rear lights and shadow ellipse | 3 draws; 1,000 cars add about 0.35 ms |
| Lighting: hemisphere light plus weak directional, Lambert materials, no shadow map | none measurable |

### The four questions

- **Which techniques give the look?** The distance-field ground shader does most of the work: road, kerb, bike band, rounded mouths and grass edges all come from one texture lookup. Static AO layers replace shadows. Everything else is instanced or merged. Nothing here threatens the frame budget. The sim, not rendering, will set the car budget.
- **Can the road surface come from lane geometry?** Yes. The road is the union of lane capsules (every lane, including all candidate connections, so editing connections never changes the asphalt) closed by a 5 m morphological close. The exact SDF is kept where the close adds nothing, so edges stay sub-texel smooth; the grid-quantised closed shape only fills fillets and slivers. 0.5 m texels are enough, so the 0.25 m fallback isn't needed. **Input for 04:** no separate road-outline model, but each road edge needs attributes the lanes don't carry. Bike band yes/no, sidewalk width, medians and splitter islands. The prototype fakes "bike band everywhere except islands". Grass, plazas and building plots need block polygons, which are faces of the road graph. Known artefact: a small wave in the kerb where a junction mouth meets the ring arc, from the outer connection curves. It reads as a natural flare.
- **Post-processing?** Not worth adding. Static AO reads like the reference, and N8AO/SSAO would cost fill rate at retina for little gain.
- **Orthographic or perspective?** Perspective, 35° FOV, free look via `MapControls`. Polar angle is clamped to 10°–75° and distance to 25–650 m. Low tilts look good (`lookdev-04`).

### Findings to carry into `.scratch/visual-style/spec.md`

- Three.js physical lights: Lambert divides by π, so hemisphere 2.6 and directional 1.0 match the reference's brightness. Lit materials go dark otherwise.
- Grass edges look right crisp (pixel antialiasing), not blurred. The pale verge between the kerb and the grass gives the softness.
- Signs at real size are illegible at block zoom but read well at low tilt or close up. Either exaggerate them 1.5–2× or show priority in a UI overlay (05).
- Plazas are flat meshes over the bake, so they get no AO halos. In production they belong in the bake (another channel, or a material ID).
- Brake lights driven by `acc < -0.5 || waiting || v < 0.3` read clearly in queues.
- Not built: street names, car windows and raised kerb geometry (all excluded by the plan), and N8AO (not needed).

## Comments
