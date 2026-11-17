# Visual Style: the diorama renderer

Status: open (grilled 2026-11-13 in [#16](https://github.com/artsaraiva/clearway/issues/16))

## Amended by [#148](https://github.com/artsaraiva/clearway/issues/148) (2026-11-17)

Coloured light, utility poles and petals, the three things the prototype in [#146](https://github.com/artsaraiva/clearway/issues/146) kept. Shadows are crisp and blue-violet at every time of day, under a stronger, warmer sun; contact shadows are violet too. Utility poles with two wires line one side of every Road, and fallen petals lie round every sakura. Each Zone's own details, still and moving, have a ticket each (Block fill, below). Sky reflections, catch-lights and cel bands were tried in [#146](https://github.com/artsaraiva/clearway/issues/146) and changed little in the real City.

## Amended by [#15](https://github.com/artsaraiva/clearway/issues/15) (2026-11-15)

The direction is now cozy Japanese and oversaturated. The palette below was recoloured in [#105](https://github.com/artsaraiva/clearway/issues/105) at the strength the user picked from the mock in [#104](https://github.com/artsaraiva/clearway/issues/104), "a little"; the road plate and the pavement stay pale. Blue is reserved for Tools and Inspectors and hot red-orange for Jams and refusals. The camera's drag buttons are swapped. Details in `.scratch/ui-ux/spec.md`.

## Goal

Replace the throwaway `src/render/scene.ts` with a renderer that draws a District as an anime-flavoured miniature diorama: a small Japanese-style town on a floating slab, readable as a traffic puzzle first. Vocabulary in root `GLOSSARY.md`.

The target is the user's "Anime Map Diorama" design. Its proof on the real sim was the prototype at `/diorama.html` (`src/lookdev/diorama.ts`, deleted from `main` in #32), kept with the three rejected looks on the local branch `16-visual-style-prototype`. Its screenshots, `.scratch/game/reference/diorama-*.png`, show the original design, whose tone the palette keeps.

Reference screenshots of the game, retaken in [#148](https://github.com/artsaraiva/clearway/issues/148): `.scratch/visual-style/reference/morning.png`, `noon.png`, `afternoon.png`, `dusk.png`, `night.png`, a Jam up close in `close-noon.png`, `close-dusk.png` and `close-night.png`, and a Rebuild half-way, a new Tile's piece of slab assembling, in `rebuild.png`. They show the #104 mock's twelve Tiles, laid one cell south-west of where the mock lays them, in a Free run (`?free&seed=3`), with its two Changes to Priority rules and its west Crossroads jammed. Each Tile is a Zone: the starting Crossroads shops, then low-, medium- and high-density residential, offices, industrial, parks, green and farms in the order they are laid, and round again.

This overturns three look-dev (03) decisions: the perspective camera, static AO in place of shadows, and the baked distance-field ground.

## The rule

Readability beats style. Roads, markings, cars and jam feedback must stay as legible at night, zoomed out and mid-Reveal as they are at noon. Any effect that softens them is cut before any gameplay signal is.

## Rendering recipe

- Three.js on WebGL, standard soft-lit materials (roughness about 0.85), neutral tone mapping.
- One directional light with a 4096² shadow map, plus a hemisphere light. A shadow's edge is blurred by one texel, so it is crisp ([#148](https://github.com/artsaraiva/clearway/issues/148)). Blurred decals under every building and tree give the contact shadow, in violet (`rgb(52, 44, 150)`) like the shadows the light casts.
- No cel bands, no outlines, no ink, no painterly filter. The only post-processing allowed was one bloom pass for night lights, and only if it cost under 2 ms per frame. It was measured in [#29](https://github.com/artsaraiva/clearway/issues/29) at 6.2 ms and cut, so there is no post-processing.
- Everything is procedural geometry and canvas-drawn textures. No authored 3D models, no image files.
- Static scenery is merged into one mesh per material. Cars and walkers are instanced.

The style comes from shape, palette and proportion:

- **Shape:** every box is rounded and bevelled; houses are a wall box with a glass band under a gable roof; office towers are curtain walls of glass with no band per floor; trees are clusters of spheres (round, sakura) or stacked cones (pine).
- **Palette:** gently oversaturated, with pastel walls and towers, brick / teal slate / teal / tan / violet / persimmon roofs, fresh greens, pink sakura, a pale grey road and an off-white pavement. Every colour is under Palette below.
- **Proportion:** lanes about 7 m wide and Blocks roughly 40–60 m across, so a car reads as a toy and each building as an object. This was the single biggest difference between the first port (a 360 m roundabout District, rejected as "not the same") and the accepted one.

## Palette

Set in [#105](https://github.com/artsaraiva/clearway/issues/105) at the strength the user picked in [#104](https://github.com/artsaraiva/clearway/issues/104), "a little", the gentlest of three. The user's reference for the tone is the original Anime Map Diorama design, which is the earlier palette under the morning light. Saturation goes into each colour: there is no filter and no post-processing. The road plate (`#c3c7ce`), the pavement (`#f1ede5`) and the white road paint stay pale and near-neutral, so cars, paint and Tool aids read against them.

**Reserved colours.** Two colours belong to the game's signals:

- Tool blue `#1f7aff`: the Tools in the world and the route Inspector. Since [#107](https://github.com/artsaraiva/clearway/issues/107) that covers the halo around a hovered or selected Junction, the Connections and the tube being drawn, the round markers at each Arm's line, and every lane end. The lane ends are circles where Connections start and rings where they end, both on white rims, which lift the blue off the moonlit road plate at night.
- Hot red-orange `#ff4a1f`: the anger marks, the speech bubbles' text, and the Tile in the hand when its drop is refused. That Tile takes 60% of the colour, and the tint glows (emissive 0.4) so it keeps its colour at dusk and at night. Since [#110](https://github.com/artsaraiva/clearway/issues/110) it also fills the Jam markers: a disc on a white rim over each Junction with a Jam, carrying the anger mark in white, with a tail that points at the Junction.

Within 30° of hue (OKLCH) of either colour, no scenery or car goes over 65% of that colour's chroma. That rule is why the park's deck is wood rather than shrine vermilion, why the cars are turquoise and raspberry rather than blue and coral, and why the roofs are brick, teal slate and persimmon rather than terracotta, slate and salmon.

**The world** (`src/render`):

| What | Colours |
| --- | --- |
| Walls of houses | `#fdeed6` `#ffd7b6` `#e0f2d4` `#cbebfc` `#fbe3a2` `#fbd2dd` `#e5dafb` `#fff7e8` `#c0e9e0` |
| Office towers' glass, paling toward `#e9f4fb` up each tower ([#130](https://github.com/artsaraiva/clearway/issues/130)) | `#8fadc0` `#7b9db0` `#8cb5ae` `#5f778c` `#a6bfcb` `#c2b498` |
| Office towers' frames, fins and crowns | `#f2f4f6` `#dde3e8` `#e6cfa6` `#c4ccd4` `#68727f` |
| Roofs | brick `#d56454`, teal slate `#4d7d9c`, teal `#5aa69b`, tan `#d09c53`, violet `#8b7dbf`, persimmon `#ea8548` |
| Terraced houses ([#136](https://github.com/artsaraiva/clearway/issues/136)) | walls `#fff4e2` `#f6dfb4` `#f3d2c4` `#ead9c2` `#dcc6a6` `#d6e4d3` `#f9e7c8`, roofs `#4d6575` `#5b6b7a` `#3f5866` `#7a5a46` `#b85a4c` `#5aa69b` `#8b7dbf` `#a8765a`, doors `#8a5a3c` |
| Apartment buildings round a court | walls `#e0f2d4` `#cbebfc` `#e5dafb` `#fbe3a2` `#c0e9e0` `#fbd2dd` `#fdeed6`, caps `#fbfaf6` |
| Residential towers | walls `#fbf3e6` `#eef5f0` `#f4eefb` `#fdf0e2` `#eaf3f8` `#f8eef0`, trim `#ffffff` `#e9e4da` `#d9e3ea` |
| Shops | ground floors, awnings and signs `#2fb39a` `#f0b43c` `#ff9ab8` `#79c86a` `#a58ad8` `#e8925e` `#5cc0d6`, storeys above `#fff7e8` `#ffe9d2` `#fde2e4` `#e3f4dc` `#fff1c7` `#e6f0fb`, the awnings' other stripe `#fbf8f2` |
| Sheds | walls `#c9d1d6` `#b9c8b4` `#dccbaa` `#aebdcb` `#cfb39b` `#d9dcd2`, roofs `#8f9aa5` `#7f8c7c` `#9c8f80` `#6f7f8c`, roller doors `#f0c75e` `#e9eef2` `#79a7c3` `#7fbf9d`, chimneys `#a8604f` with a band of `#f4f1ea` |
| Farms | ploughed ground `#cdb08a`, crops `#7bc35e` `#e3c76a` `#a6d36b` `#5aae58` `#d9b45c`, barns `#7e9aab` `#b85a4c` `#8aa58b` under `#5b6b7a`, silos `#e9eef2` with domes `#9aa7b2`, straw `#e8cf7f` |
| Green | the meadow `#b9e293`, flower beds `#ffd1df` `#f6d36a` `#ffadc8` `#fff7e8` `#c7b8f0`; allotments' gravel `#e6dccb`, soil `#a77f5a`, crops `#6fc35a` `#8fd46c` `#5aae58` `#b9dd6a`, flowers `#ffd1df` `#f6d36a` `#ffadc8` `#fff7e8`, sheds `#c49a6c` roofed `#5aa69b` |
| Leaves | `#7bcd5d` `#5fbc51` `#92d76e` `#6bc357` `#85cf61` |
| Sakura | `#ffbbd1` `#ffa1c1` `#ffd1df` `#ffadc8` |
| Pines | `#379e62` `#43ac6b` `#2e9358` |
| The slab's layers | grass `#9ed67d`, sand `#e3bf8c`, soil `#d2a069` |
| Lawns | the park's and islands' `#b0df88`, houses' gardens, courts and roof gardens `#a9db7f`, the grass of a Tile with roads only `#c8e8a6` |
| Utility poles ([#148](https://github.com/artsaraiva/clearway/issues/148)) | poles and crossbars `#6f7986`, transformer drums `#c4ccd4`, wires `#2a3142` |
| Fallen sakura petals | `#ffd1df` `#ffbbd1` `#ffe3ec` |
| Wood | trunks `#a1714c`, water tanks `#cea680` with lids `#b68b63`, the park's deck `#bb5d0d` |
| Bike lanes | `#57c6b5` |
| Water | `#63d1f4` |
| Window glass | `#9cc7df`, and a window left dark at night `#56738a` |
| Cars | white `#ffffff`, raspberry `#db6982`, turquoise `#009dcb`, yellow `#ffc52d`, mint `#64cb9f`, lavender `#bc9ef2`, pale grey `#e9eef2`, pink `#ff9cbb` |

Walkers' shirts, the planes' wings and the confetti take the cars' colours. The Tile in the hand takes the slab's. Greys, creams and stone (lamp posts, masts, rooftop boxes, the plaza, the tower landmark's cream) keep their earlier values, as does the tower landmark's coral `#f08a6e`, already under the cap at 59% of the red-orange's chroma. Head and tail lights, lit windows and lamps are lights that come on toward dusk, not paint, and stay as they were.

**Sky and light** (`src/render/day.ts`):

| Time | Sky, top to bottom | Sun or moon | Fill, sky / ground |
| --- | --- | --- | --- |
| Noon | `#68ccf5` `#beeaf9` `#e5f8f9` | `#fffaf0` at 3.45 | `#aec9fd` / `#e2d9e0` at 0.72 |
| Dusk | `#8d6cc2` `#d887ae` `#fcb17e` | `#fead7b` at 2.7 | `#9c78d7` / `#de989b` at 1.62 |
| Night | `#191c5b` `#31398e` `#5c61b5` | `#bfd0ff` at 2.55 | `#8697fb` / `#6f79c6` at 1.49 |

A clear cyan noon, an orange and pink dusk, and a deep blue night that stays bright. The day blends between these and the morning, the late afternoon and the handovers between sun and moon, whose values are in `day.ts`.

Since [#148](https://github.com/artsaraiva/clearway/issues/148) the light is coloured. A shadow shows the fill alone, so the fill's colour is the shadow's: the [#105](https://github.com/artsaraiva/clearway/issues/105) fill moved 70% of the way to a blue-violet at every time of day (half way at noon), and its ground bounce 30%, so walls stay warm. The sun is about 15–50% stronger and warmer in the morning, the afternoon and at dusk. Two rules set the values:

- **No road in shadow is darker than one in [#105](https://github.com/artsaraiva/clearway/issues/105)'s dusk shadow**, the darkest the game had and still read. Dusk's fill is raised until its shadow matches that, and noon's and the afternoon's are lowered to it, which gives the navy shadows by day. The handovers stay brighter than dusk.
- **Whites in the sun stay white at noon:** a white surface lit by noon's sun and fill is neutral within 1% on each channel. That is why noon's fill moves only half way to the blue-violet and noon's sun is not warmed.

## Camera

Orthographic. Left drag pans, right drag rotates and the wheel zooms toward the pointer, as set by [#15](https://github.com/artsaraiva/clearway/issues/15) and built in [#109](https://github.com/artsaraiva/clearway/issues/109); the camera buttons are in `.scratch/ui-ux/spec.md`. Tilt is clamped between roughly 24° and 72° above the horizon. Default view looks from the south-east at about 41° tilt with the whole slab in frame.

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
- First version edges: the pavement is the rim of the Block, and a roundabout island is a raised slab with a tree. Bike bands, medians and splitter islands are cut. A Block under 12 m wide, such as the strip a seam leaves beside a Road, has no room for lots and carries a bike lane instead. The `bikeBand`, `sidewalk` and `median` Road attributes stay unread.
- **Paint:** a dashed centre line per Road, lane dividers where a direction has more than one lane, and zebra stripes at Junction mouths (decoration until pedestrians become a mechanic).
- **Priority** is shown in the world as road paint (give-way triangles on a yielding Arm) and is re-read from the sim on every Change. No in-world signs. Signal lamps are designed when the Signal Tool ([#7](https://github.com/artsaraiva/clearway/issues/7)) passes its gate test.

## Block fill

- **Authored:** landmarks and special Blocks (a tower plaza, a park with a pond, a shrine on a hill, a river with a bridge). They live in the District file.
- **Seeded:** every other Block is built as its Tile's Zone ([#130](https://github.com/artsaraiva/clearway/issues/130), [#136](https://github.com/artsaraiva/clearway/issues/136), `src/render/zones.ts`), from the seed:
  - Low-density residential: houses on lawns with garden trees.
  - Medium-density residential: terraced rows of narrow houses that share walls, or apartment buildings round a court (an O, a U, an L or a bar). The seed picks one of the two for each Tile.
  - High-density residential: pale towers with windows lit one by one, a stack of balconies, a water tank and a roof garden.
  - Offices: glass towers lit floor by floor at night.
  - Shops: rows of low shops with coloured ground floors, and striped awnings and signs where they face a Road.
  - Industrial: wide, low sheds with sawtooth roofs and roller doors, a chimney now and then.
  - Parks: a park with a pond, or on a small Block, one time in three, a plaza with a fountain.
  - Green: a meadow with groves and flower beds, or allotments.
  - Farms: fields of crop rows, and on some Blocks a farmhouse and a barn with a silo.
  - An unzoned Tile: grass with a few bushes.

  Where a Block lies seeds its choices and nothing more, so a Zone builds alike anywhere. The odd lot is left as a tree, and lots that would overhang a rounded corner are dropped. A coral tower landmark stands on an offices or a high-density residential Tile where the seed puts one.
- **Stages** ([#138](https://github.com/artsaraiva/clearway/issues/138)): low-density residential and offices build at their Tile's Stage. The look above is Stage 2; Stage 1 is a humbler version of it and Stage 3 goes beyond it. Every lot draws from its own random stream, so each Stage builds the same building, better, and never another kind. The other Zones look the same at every Stage until [#141](https://github.com/artsaraiva/clearway/issues/141).
  - Low-density residential: a one-storey cottage on 70% of the footprint, on a bare lawn, and a sapling on a lot left to a tree; then the house above, with most gardens given a tree; then two storeys with a ledge between them, a chimney, a hedge round the garden and a second tree in half the gardens.
  - Offices: 3 to 5 storeys (5 to 7 for the one tower in five that stands tall), a plain body with no penthouse, dome or spire, one tier and fewer floors lit; then 6 to 9 (11 to 14) as above; then 9 to 13 (17 to 22), a spire on every style, a third tier on a stepped tower, more floors lit and trees in planters on the plaza.
  - A Tile that reaches a Stage changes lot by lot over about 3 s, in a random order. Each new building drops in as a Rebuild's bricks do while trees pop in, and the old one stands until the new one lands on it, then vanishes in the dust, so a lot is never bare. Confetti ends it.
- **The Stage Inspector** ([#139](https://github.com/artsaraiva/clearway/issues/139)) tints the ground of each zoned Tile, below a hand's height above the pavement, in the gold of a Stage's stars: `#fbeeb4`, `#f2c12e` and `#d29600` for Stages 1 to 3, in even steps of lightness (OKLCH 0.95, 0.83, 0.71) and all more than 45° of hue from the hot red-orange. Half the tinted ground's light is the tint itself, unlit, so it reads at dusk and at night. A Tile held back by a Jam is striped diagonally with a neutral grey `#7a7670`, 3 m stripes 6 m apart. It fades in and out over 0.2 s.
- Lamps stand at Block corners. Street trees line the avenues the seed picks, whatever the Zone, and what a Zone builds keeps clear of them: buildings, ponds, crop rows and allotment plots alike.
- **Utility poles** ([#148](https://github.com/artsaraiva/clearway/issues/148), `src/render/poles.ts`) line one side of every Road: the south side of a Road running east–west and the east side of one running north–south, so a line meets the next Tile's on the same side. They are 9 m tall, 0.45 m in from the kerb, with a crossbar across the road carrying two wires that sag about 6 cm for each metre of span, and a transformer drum on every other pole.
  - They stand six to a cell's width, half a spacing (8.3 m) in from each edge, whatever the Tiles around, so the spacing runs on unbroken across a seam and a seam's wire always finds its poles. On an avenue they stand between the street trees instead.
  - A line carries on across its Junction where its Road runs straight on, though not across a Roundabout, whose island and Ring stay clear. On a Curve both lines take the outside of the bend and turn the corner on a corner pole standing on the kerb of the bend; where that puts a line on the other side from the next Tile's, the wire across the seam crosses the Road. A T-junction's stem joins the line across it on a corner pole, where one can stand.
  - Poles move up to 3 m along the Road to keep clear of a lamp, or are left out. Standing just in from the kerb, with their crossbars set toward the road, poles and wires clear what every Zone builds, which keeps at least 0.6 m back from the kerb, and the Zones' fill is unchanged.
  - A wire across a seam belongs to neither Tile: all of them are strung again whenever a Tile lands or an Undo takes one off.
- **Fallen petals** lie round every sakura, as many to the square metre whatever its size, out to seven times its size, on the Block only and, on a raised lawn, well in from its edge. They are drawn from where the tree stands, so no Block's fill changes.
- **Every Zone's own details** ([#148](https://github.com/artsaraiva/clearway/issues/148)): each Tile type carries small details of its own, and some of them move. Each Zone's are in a ticket of their own, with the rules they share: they grow with the Stage, ignore Jams, follow the time of day, and are drawn a little oversized where they move or matter, while scatter on the ground stays true to size. Farms go first ([#149](https://github.com/artsaraiva/clearway/issues/149)), since their tractors build the machinery for every moving detail; then industrial ([#150](https://github.com/artsaraiva/clearway/issues/150)), parks ([#151](https://github.com/artsaraiva/clearway/issues/151)), green ([#152](https://github.com/artsaraiva/clearway/issues/152)), shops ([#153](https://github.com/artsaraiva/clearway/issues/153)), offices ([#154](https://github.com/artsaraiva/clearway/issues/154)), high-, medium- and low-density residential ([#155](https://github.com/artsaraiva/clearway/issues/155), [#156](https://github.com/artsaraiva/clearway/issues/156), [#157](https://github.com/artsaraiva/clearway/issues/157)) and a wilder verge on unzoned Tiles ([#158](https://github.com/artsaraiva/clearway/issues/158)).
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

On a Reveal the Level's pieces assemble brick by brick next to the slab already there: slab layers, road plate, Blocks, buildings (drop with a squash), trees and lamps (pop in), with dust where large pieces land. A Tile's utility poles pop in once the Blocks near them have landed, and each span of wire grows out from its middle just after; the wires across its seams appear once it has landed. A Rezoning leaves the poles standing. When it finishes the pieces are merged into the static meshes, cars grow in, and confetti fires. Decoration and labels for the new pieces appear after they land. Nothing already on the slab disappears or is rebuilt.

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

60 frames per second with 1,000 cars on an M4 Pro with the day cycle running. The prototype measures 9.9 ms per frame with 1,000 cars at 2× pixel density, about 1.06 M triangles. If shadows break the budget, the shadow map shrinks before any look decision changes. Coloured light, poles and petals ([#148](https://github.com/artsaraiva/clearway/issues/148)) cost no frame time the bench can see: 7.82 ms against `main`'s 7.57 on the twelve-Tile City and 8.68 against 8.58 on 26 Tiles, inside the noise, for two or three more draw calls and under 0.1 M more triangles.

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

Bike bands, medians, splitter islands, buses and other vehicle types, in-world signs, signal lamps, weather, player control of the time of day, and Demand that follows the time of day. Sky reflections on glass, water and cars, catch-lights, and cel bands, which [#146](https://github.com/artsaraiva/clearway/issues/146) tried and found changed little in the real City.
