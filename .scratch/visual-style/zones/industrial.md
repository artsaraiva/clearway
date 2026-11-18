# Industrial

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Industrial: sheds on 80% of the footprint, 4.2 to 5.4 m tall, and no chimney; then as above, with a lamp over each door; then a metre taller, a two-storey office in the chimney's band colour at one end of the back with a band of windows a floor, vents along the roof, and the chimney 5 m taller with a second band.
  Since [#150](https://github.com/artsaraiva/clearway/issues/150) the footprint leaves room for a loading yard at every Stage.
  Their details are below.

### Details

- **Industrial details** ([#150](https://github.com/artsaraiva/clearway/issues/150), `src/render/zones.ts`), each drawn from where it stands, so nothing else on its Block changes:
  - A shed's doors face the long side with more room before it, and the shed stands back from that side as far as it must, up to 6 m and keeping at least 10 m deep, so that a loading yard about 12 m deep opens before its doors.
    Most sheds are 6 m shallower than before.
    What stands in a yard keeps clear of the other sheds, the street trees and the lamps at the Block's corners, and at least 0.6 m in from the Block's edge.
  - A truck backs up to the first door with room for its bay, from Stage 2, and a second to a door left over from Stage 3, which only the few sheds long enough for three doors have: a flat-fronted box truck 6.5 m long and oversized across as the cars are, in one of five pale paints, in a bay painted from Stage 2.
    Each waits 24 to 48 s at the door, pulls 3 to 6 m away at 2.2 m/s, waits 8 to 16 s and backs in again, about once a day.
  - A forklift works the next door with room, from Stage 2: it backs out of the door turning away from its stack of pallets, drives on along the wall and turns into the stack, waits 1.6 to 3.6 s, and does the same back, at 1.8 m/s.
    Its stack, two pallets of goods 3.4 to 5 m along the wall, stands from Stage 1, and a third pallet tops it at Stage 3.
  - Containers lie along a shed's back and ends, a spot to every 6.8 m: three spots in ten fill from Stage 2 and two in three from Stage 3, and nearly half of those are topped by a second container at Stage 3.
  - Each chimney smokes: soft spheres that rise from its top at about 1.5 m/s, swell from a radius of 0.7 m to 2.5 m and fade over 5.5 s, one every 0.6 s, all leaning one way on a light wind.
    It smokes once it has landed, through the working day only, and stops at dusk and while the game is paused.

## Colours

- **Sheds**: walls `#c9d1d6` `#b9c8b4` `#dccbaa` `#aebdcb` `#cfb39b` `#d9dcd2`, roofs `#8f9aa5` `#7f8c7c` `#9c8f80` `#6f7f8c`, roller doors `#f0c75e` `#e9eef2` `#79a7c3` `#7fbf9d`, chimneys `#a8604f` with a band of `#f4f1ea`
- **Industrial details ([#150](https://github.com/artsaraiva/clearway/issues/150))**: containers in the roofs' colours, brick `#d56454`, teal slate `#4d7d9c`, teal `#5aa69b`, tan `#d09c53`, violet `#8b7dbf` and persimmon `#ea8548`, and the sheds' green-grey `#7f8c7c`, each framed and ribbed in its own colour at 78%;
  pallets `#c49a6c` under cartons `#d8b98b` or shrink-wrap `#f4f1ea` `#e9eef2`;
  trucks painted `#ffffff` `#e9eef2` `#fbe3a2` `#c0e9e0` `#d6e4d3`, with trim and back doors `#c4ccd4`, glass `#41566c`, a chassis `#4a525c` and tyres `#2f3440`;
  forklifts `#f0c75e` with a mast, seat and guard `#4a525c` and forks `#9aa3ad`;
  truck bays painted `#f0c75e`;
  smoke `#f4f1ea`, lit a little by its own light so its shaded side stays soft.
  The lamps over the doors are the street lamps' bulbs

## Frame time

Industrial details ([#150](https://github.com/artsaraiva/clearway/issues/150)), every Tile of the 26-Tile City industrial at Stage 3, cost 0.73 ms (6.67 against `main`'s 5.93 over five rounds), for five more draw calls and 0.34 M more triangles.
Its 245 trucks and forklifts take about 0.2 ms to draw and its smoke, about 240 puffs, under 0.1 ms; placing both takes 0.15 ms a frame, and the rest is the yards' containers and pallets.

## Amended by [#150](https://github.com/artsaraiva/clearway/issues/150) (2026-11-17)

Industrial Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a loading yard before each shed's doors, which the shed stands back to leave, trucks backed up to the doors that now and then pull away and back in, forklifts shuttling to stacks of pallets, containers along the sheds' other walls, lamps over the doors, and smoke from the chimneys.
Moving details can now wait at their stops, drive a stretch in reverse, go round their loop many times a day and take a paint of their own (Block fill, below).
