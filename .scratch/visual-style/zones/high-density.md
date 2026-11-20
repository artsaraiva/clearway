# High-density residential

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- High-density residential: 55% of the floors, and on the roof a tank, a lift overrun and an antenna; then as above; then 125% of the floors, a band of trim round the wall every four floors, a deeper cap over a crown of glass lit at night, and a roof garden twice the size.
  Their details are below, and since [#183](https://github.com/artsaraiva/dioramania/issues/183) they are built to the Finish (next).

### Built to the Finish

- **High-density residential built to the Finish** ([#183](https://github.com/artsaraiva/dioramania/issues/183), `src/render/zones/high-density.ts`, `src/render/movers.ts`), the whole of its menu, which the user picked on 2026-11-19.
  What it adds is drawn from streams of its own (each Block's plan from its middle, each tower's from where it stands), so the kit's draws are as on `main`: every tower stands where it stood, as tall, in its colours.
  - Forms, so that no tower is its neighbour's (rule 10), drawn from the Block's plan, and another where a tower on a lot beside it has the same: a slab, as before, its balconies up the middle of its long faces (two in five); stepped, its top quarter of floors set 1.2 to 3 m back from each short face behind a railed terrace; a core, a lift core 4.4 m wide in the trim's colour up one short face, a storey above the roof; and corner, two narrower stacks of balconies at the ends of each long face.
    On the 26-Tile City (seed 3): 53 slabs, 39 stepped, 28 corner and 18 core.
  - Walls: plaster and a framed window in every bay on all four sides at every Stage, lit window by window at night (surface pattern, the terraces' `PATTERN.house`, in bays of about 3 m, an odd count along the long faces so that a balcony's door covers the middle one); the windows built one by one on `main` are gone.
    The podium wears panels and a high window in every bay (the shops' `PATTERN.wall`).
    On the free face nearest the Block's edge a glass lobby opens, 7 to 8 m of glass between dark frames with two doors in its middle, under a canopy 5 m by 2.6 m on two posts where the ground before it is free.
    Two towers in five keep a convenience store behind another face from Stage 2: a window up to 10 m wide with sliding doors, under a sign band lit at night, a board with one or two stripes and three marks for its name.
    By the door a letter-box bank, a Block-zoom prop, and from Stage 2 four or five bicycles where the ground is free (116 of 138 towers).
  - Roofs: tile rows inside a parapet (the shops' `PATTERN.roof`, in the tower's trim) from Stage 1, a stepped tower's terraces too; a lift overrun with a door under a lid, an antenna on it (a core tower's core and its antenna stand in for them), and the water tank; from Stage 2 a railing round the roof's edge, on a helipad's roof too, and the roof garden with a bench between two planters; at Stage 3 a timber pergola over the bench.
  - Ground: paving in a basket weave (`PATTERN.bricks`) out to 3.5 m from each podium, in one of three pale colours a Block; a tree in a round stone planter at a corner of the podium from Stage 2 and at a second at Stage 3; a bench, Block-zoom, toward each end of the open faces; and a ramp down to parking, drawn for seven towers in ten and built where a face is left with room for it (49 of 138 on the 26-Tile City): tarmac (`PATTERN.tarmac`) between two low walls to a dark portal under an amber band, with a barrier's arm.
  - The scenes: a fountain court or a sculpture court beside a podium, between two towers where two stand, 6.5 to 10 m by 4.6 to 5.6 m on setts, picked from where the Block lies: one from Stage 2 (a tree in a bed and two benches before that), and a second of the other kind at Stage 3 on a Block of 2,500 m² or more.
    A fountain: a stone basin up to 4.8 m across with a bowl on a column, and a second bowl over it at Stage 3. A sculpture: three blocks stacked askew on a plinth in teal, amber, cream and pink, a ball on top and a planter behind it at Stage 3.
    Each has two low lights with their pools, four at Stage 3, and a bench at each end at Stage 3.
    The courts are reserved first, so the playground or garden of [#155](https://github.com/artsaraiva/dioramania/issues/155) moves to another face where a court takes its own; where no court finds ground, a tower's playground or garden is the Block's scene.
    On the 26-Tile City (seed 3) every Block has a court: 49 fountains and 48 sculptures at Stage 3.
  - What moves: the washing and futons of #155, and from Stage 2 a glass lift (a new mover, `lift`, on the gondola's machinery) between two rails up the short face the default camera sees of each Block's tallest tower, where that has 15 floors or more at Stage 2: it climbs and comes down, waiting 6 to 14 s at the foot, the top and halfway each way. 42 on the 26-Tile City.
  - Night, high density's signature: windows lit one by one on every face; the lobby's glass and the canopy's soffit glow and leave pools before the door; the store's window and sign band leave theirs; the courts' low lights; and from Stage 2 string lights along the railing of 7% of the balconies, 12% at Stage 3.
  - A playground's spring rider stands by the podium where the ground is too short for swings, and swings need 6.2 m, so that no two pieces touch.

### Departures, gaps and what is beyond the menu

For the user to accept or drop with the images:

- Departures: the scene check's ceiling for high density rises from 1.95 M to 2.3 M triangles (2.08 M at Stage 3 against `main`'s 1.77 M, in the same 156 meshes); no new surface pattern, so the walls are the terraces' plaster, the podium the shops' panels and the roof the shops' tile rows, told from those Zones by colour and roof kit; a helipad still takes its whole roof, as #155 built it, so the towers that carry one, nearly three in five at Stage 3 and one in four at Stage 2, gain only the railing and the tiles, and the lift overrun, antenna, tank and roof garden are on the rest; the lobby's glass is on one face rather than north and south; the lift's car is pale opaque glass, as every mover is; a stepped tower's lift climbs to its terrace only.
- Required by the rules rather than the menu: the four forms (rule 10); pattern on the podium and the back and end walls (rule 1); the pools before the store and the courts' lights (rule 7).
- Beyond the menu: the courts' low lights, their benches at Stage 3, the fountain's second bowl and the sculpture's planter; the tree in a bed and two benches that wait on a court's ground before its Stage; the ramp's barrier.
- String lights are small lit cubes in the tower's own brick, drawn at every zoom as the balconies' plants are, not Block-zoom props: they are part of the night signature.
- Where no court finds ground the Block's scene is a tower's playground or garden; no Block of seeds 1 to 5 needs it, and a garden would have nothing larger than a car before Stage 3.
- One water tank a tower, where the menu says tanks. A foot's playground or garden may stand on another face than on `main`.

### Details

- **High-density residential details** ([#155](https://github.com/artsaraiva/dioramania/issues/155), `src/render/zones/high-density.ts` and its `residentialTower`), each drawn from where it stands, so nothing else on its Block changes:
  - A tower whose Stage 2 floors are 16 or more (about one in four) has a helipad on its roof at Stage 2, and one of 14 or more (more than half) at Stage 3: a dark green disc over the whole roof, with a yellow ring about 1.4 m in from the roof's edge and an H inside, in place of the water tank and the roof garden.
    It reads from the default zoom as a dark roof with a pale ring.
  - A tower whose Stage 2 floors are 15 or more (about two in five) has a beacon at Stage 2, and one of 13 or more (three in four) at Stage 3, on a 2.2 m mast at a roof corner, or at two opposite corners round a helipad: a white bulb 1.7 m across, oversized as the key props are, that blinks at night, lit when the lamps are and dark by day.
    It flashes for 0.8 s every 2 s and fades quickly, each beacon on its own beat, and stops blinking while the game is paused.
    Never red, which is the Jam's.
  - The balconies carry plants, washing and futons, each balcony's drawn from where it stands: a plant or two in pots by the railing, peeping over it, on 12%, 30% and 40% of the balconies at Stages 1 to 3; washing on a pole just inside the railing, four towels and shirts about 0.7 m across, oversized a little, on 16% at Stage 2 and 24% at Stage 3; and a futon aired over the railing on 10% at Stage 3.
    Washing and futons sway in the wind (Moving details, below).
  - At each tower's foot, along the first side of its podium with room for one, south, then east, west and north, a playground or a garden takes the free ground, as large as there is room for up to 12 m along the podium and 7 m out from it, and at least 8 m by 4 m, keeping 1 m from every other podium and clear of the lamps, the street trees and the other feet.
    A bench stands against the podium at its far end from Stage 1.
    From Stage 2 a playground has soft ground, a slide and, where it is 9 m long or more, a frame of two swings; at Stage 3 a sandbox and a spring rider join them.
    From Stage 2 a garden has a lawn, a flower bed at one end and a bench facing in; at Stage 3 a tree, a second bed along the podium and a second bench join them.
    Which it is, half the time each, is drawn from where it lies.

## Colours

- **Residential towers**: walls `#fbf3e6` `#eef5f0` `#f4eefb` `#fdf0e2` `#eaf3f8` `#f8eef0`, trim `#ffffff` `#e9e4da` `#d9e3ea`
- **Built to the Finish ([#183](https://github.com/artsaraiva/dioramania/issues/183))**: railings and the lift's rails `#9aa3ad`, door and window frames `#4a525c`, the lobby and canopy soffit lit cream `#fff4dc`;
  store boards `#fbf8f2` striped `#3fa56b` `#f0b43c` or `#8a6fd1` `#f0b43c`, or `#2f7d5b` striped `#fbf8f2`;
  plaza paving `#ead9c6` `#e4d8dc` `#dde4d6`, a court's setts `#ddd6c9`;
  ramps: tarmac `#70757c`, a portal `#3a4048`, a band `#f0c75e`, an arm `#fbf8f2`, walls the courts' stone `#d9d3c7`;
  letter boxes `#c4ccd4` with slots `#4a525c`;
  fountains in the courts' stone with water `#7fd0e2`; sculptures `#5aa69b` `#f0c75e` `#fbf8f2` `#ff9cbb`;
  the pergola and the roof bench in the props' wood `#c49a6c` `#a1714c` `#d8b98b`, roof planters `#ddd6c9`, antennas `#8e979f`;
  the lift's car `#b4d6e3` in a frame `#f4f6f8` on a floor `#4a525c`.
- **High-density details ([#155](https://github.com/artsaraiva/dioramania/issues/155))**: helipads `#4f7a62` painted `#f6d36a`;
  beacons white `#fff3e2` on masts `#cfd5dc`, lit as the lamps are;
  balcony plants as the leaves, in pots `#d09c53` `#c49a6c` `#e9e4da`;
  washing `#ffffff` `#fbd2dd` `#fbe3a2` `#d6efe6` on a pole `#c4ccd4`;
  futons `#fbd2dd` `#fff7e8` `#e0f2d4` `#fbe3a2` `#e5dafb` `#ffffff`;
  a playground's soft ground `#8fd1a8`, a slide on posts `#5aa69b` with a deck `#f4f1ea` and a chute `#f0c75e`, swings `#ea8548` with chains `#9aa3ad` and seats `#4a525c`, a sandbox `#e8d3a6` in a rim `#c49a6c` and a spring rider `#ff9cbb`;
  a garden's lawn as the gardens', flower beds `#4e9f49` in a rim `#c49a6c` blooming in the terraces' window boxes' colours, and the green details' benches

## Frame time

### Built to the Finish ([#183](https://github.com/artsaraiva/dioramania/issues/183))

Every Tile of the 26-Tile City high-density at Stage 3 with 1,000 cars, against `origin/main` (`4bbb1ec`), medians of three interleaved rounds:

| View | Time | `origin/main` | This branch | Change | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | --- | --- |
| City zoom, Block-zoom props hidden | noon | 7.29 ms | 8.00 ms | +0.71 ms | 297 → 299 | 3.81 → 4.35 M |
| City zoom, Block-zoom props hidden | night | 7.34 ms | 7.95 ms | +0.60 ms | 377 → 380 | 3.83 → 4.37 M |
| Tile zoom, one Tile | noon | 5.67 ms | 6.00 ms | +0.33 ms | 185 → 186 | 2.64 → 3.09 M |
| Tile zoom, one Tile | night | 5.62 ms | 6.04 ms | +0.42 ms | 193 → 191 | 2.65 → 3.11 M |

Well within the 12 ms budget. The static scenery is 2.08 M triangles at Stage 3 on seed 3 against 1.77 M on `main` (the scene check's ceiling is now 2.3 M), in the same 156 meshes: the fountains' water is the kit's glass, as a pond's is, so no Tile gains a material.
The windows that became surface pattern gave back about what the railings, canopies and courts cost; most of the rise is the trees in planters, about 900 triangles each, which is why a tower has two at most.
The new draw calls are the movers': the lifts are an instanced mesh of their own.

### High-density details ([#155](https://github.com/artsaraiva/dioramania/issues/155))

High-density details ([#155](https://github.com/artsaraiva/dioramania/issues/155)), every Tile of the 26-Tile City high-density at Stage 3, cost 0.44 ms (7.19 against `main`'s 6.75 over five rounds), for eleven more draw calls and 0.49 M more triangles, with 1,193 lines of washing, 491 futons and 192 beacons.
Three of the draw calls are the washing's, the futons' and the beacons' instanced meshes; the rest are round contact shadows, under the benches and the gardens' trees, on Tiles that drew none before.
A first cut cost 0.83 M more triangles: rounded boxes under the playgrounds and the flower beds, and the washing's shadows.

## Amended by [#183](https://github.com/artsaraiva/dioramania/issues/183) (2026-11-19)

High-density residential is built to the Finish of [#173](https://github.com/artsaraiva/dioramania/issues/173), the whole of its menu: towers in four forms, no two alike side by side, their walls plaster with a framed window in every bay on all four sides; a glass lobby under a canopy, a convenience store with a lit sign band in some, a letter-box bank and bicycles by the door; tiled roofs with a lift overrun, an antenna, railings and a roof garden under a pergola; patterned paving, trees in planters, benches and a ramp down to parking; a fountain court or a sculpture court on every Block; a glass lift up the tallest tower's face; and at night the lobby's glow and string lights on a few balconies.

## Amended by [#155](https://github.com/artsaraiva/dioramania/issues/155) (2026-11-17)

High-density residential Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a helipad painted on the roofs of the tallest towers, white beacons on them that blink at night, a playground or a garden with benches at each tower's foot, and plants, washing and futons on the balconies.
Washing and futons are the first details that hang and sway in the wind, through the working day only, and beacons the first lights that blink (Block fill, below).
