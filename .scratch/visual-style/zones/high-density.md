# High-density residential

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- High-density residential: 55% of the floors and a bare roof but for the tank; then as above; then 125% of the floors, a band of trim round the wall every four floors, a deeper cap over a crown of glass lit at night, and a roof garden twice the size.
  Their details are below.

### Details

- **High-density residential details** ([#155](https://github.com/artsaraiva/clearway/issues/155), `src/render/zones/high-density.ts` and the kit's `residentialTower`), each drawn from where it stands, so nothing else on its Block changes:
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
- **High-density details ([#155](https://github.com/artsaraiva/clearway/issues/155))**: helipads `#4f7a62` painted `#f6d36a`;
  beacons white `#fff3e2` on masts `#cfd5dc`, lit as the lamps are;
  balcony plants as the leaves, in pots `#d09c53` `#c49a6c` `#e9e4da`;
  washing `#ffffff` `#fbd2dd` `#fbe3a2` `#d6efe6` on a pole `#c4ccd4`;
  futons `#fbd2dd` `#fff7e8` `#e0f2d4` `#fbe3a2` `#e5dafb` `#ffffff`;
  a playground's soft ground `#8fd1a8`, a slide on posts `#5aa69b` with a deck `#f4f1ea` and a chute `#f0c75e`, swings `#ea8548` with chains `#9aa3ad` and seats `#4a525c`, a sandbox `#e8d3a6` in a rim `#c49a6c` and a spring rider `#ff9cbb`;
  a garden's lawn as the gardens', flower beds `#4e9f49` in a rim `#c49a6c` blooming in the terraces' window boxes' colours, and the green details' benches

## Frame time

High-density details ([#155](https://github.com/artsaraiva/clearway/issues/155)), every Tile of the 26-Tile City high-density at Stage 3, cost 0.44 ms (7.19 against `main`'s 6.75 over five rounds), for eleven more draw calls and 0.49 M more triangles, with 1,193 lines of washing, 491 futons and 192 beacons.
Three of the draw calls are the washing's, the futons' and the beacons' instanced meshes; the rest are round contact shadows, under the benches and the gardens' trees, on Tiles that drew none before.
A first cut cost 0.83 M more triangles: rounded boxes under the playgrounds and the flower beds, and the washing's shadows.

## Amended by [#155](https://github.com/artsaraiva/clearway/issues/155) (2026-11-17)

High-density residential Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a helipad painted on the roofs of the tallest towers, white beacons on them that blink at night, a playground or a garden with benches at each tower's foot, and plants, washing and futons on the balconies.
Washing and futons are the first details that hang and sway in the wind, through the working day only, and beacons the first lights that blink (Block fill, below).
