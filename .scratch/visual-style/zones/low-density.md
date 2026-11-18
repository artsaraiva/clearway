# Low-density residential

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Low-density residential: a one-storey cottage on 70% of the footprint, on a bare lawn, and a sapling on a lot left to a tree; then the house above, with most gardens given a tree; then two storeys with a ledge between them, a chimney, a hedge round the garden and a second tree in half the gardens.
  Since [#157](https://github.com/artsaraiva/clearway/issues/157) some houses stand aside for a side yard at every Stage.
  Their details are below.

### Details

- **Low-density details** ([#157](https://github.com/artsaraiva/clearway/issues/157), `src/render/zones.ts`), each house's drawn from where its lawn lies, so nothing else on its Block changes:
  - A house's front faces the nearest edge of its Block, with a door in its middle under a little canopy from Stage 1.
    By the door stand a pot plant at Stage 1, two and the medium-density bicycle ([#156](https://github.com/artsaraiva/clearway/issues/156)) from Stage 2, standing along the wall, and a third pot in flower at Stage 3, true to size and seen only up close.
    At Stage 3 the hedge opens at the door.
  - Half the houses on a lawn 12.2 m or more across have a kei car: a small, tall car on the farm kei truck's chassis, its cabin dark glass under its roof, in one of the cars' colours and oversized as they are.
    It parks nose to the front on a concrete drive, from Stage 2 on three drives in five and from Stage 3 on the rest, and the hedge opens for it at Stage 3.
  - A house with a car or laundry on such a lawn stands aside at every Stage for a side yard on the side the default camera sees, across from its front: 3.1 m across for a drive, or 2.5 m for laundry alone.
    It is up to about 2 m narrower than before.
    A garden tree keeps off the drive and the laundry pole.
  - Laundry hangs on a pole in one garden in eight from Stage 1, three in ten from Stage 2 and half at Stage 3: behind the car in the side yard, in the yard's middle where there is no car, or, with no side yard, along the wall of the side the camera sees best that is not the front.
    A pole is up to 3.4 m long on stands 2.3 m tall, its pieces 0.55 to 0.78 m wide and hanging 0.75 to 1.15 m, oversized a little, each in a colour of its own.
    At Stage 3 the towers' futon ([#155](https://github.com/artsaraiva/clearway/issues/155)), 1.7 m wide, airs in the middle of nearly half of them in a pale cover, and the pieces it would touch come down.
  - Solar panels in two rows of cells cover about 60% of the slope the sun and the default camera see, the south one, or the east one where the ridge runs north–south, clear of a Stage 3 chimney: on one roof in five from Stage 2 and half of them at Stage 3.

## Colours

- **Low-density details ([#157](https://github.com/artsaraiva/clearway/issues/157))**: front doors `#8a5a3c` under a canopy `#fbf6ef`;
  solar panels' cells `#2d3b55`, glossy and never lit, in frames `#c4ccd4`;
  kei cars in the cars' colours, a cabin of the cars' dark glass `#41566c`, bumpers `#c4ccd4` and the kei truck's chassis and tyres, on drives `#d9d5cc`;
  laundry's cloths in white and the cars' colours, and futons' covers `#fbd2dd` `#cbebfc` `#fbe3a2` `#e5dafb` `#c0e9e0`, on poles `#aab3bd`;
  the medium-density bicycles ([#156](https://github.com/artsaraiva/clearway/issues/156));
  pots `#c49a6c` `#e9e4da` `#5aa69b` `#b85a4c` of the leaves' greens, some in flower `#ffadc8` `#f6d36a` `#fff7e8` `#c7b8f0`

## Frame time

Low-density details ([#157](https://github.com/artsaraiva/clearway/issues/157)), every Tile of the 26-Tile City low-density at Stage 3, cost 0.63 ms (9.05 against `main`'s 8.41 over five rounds, with [#153](https://github.com/artsaraiva/clearway/issues/153)'s to [#156](https://github.com/artsaraiva/clearway/issues/156)'s details in), for two more draw calls, the instanced cloths and futons, and 0.47 M more triangles.
A first cut swung its laundry in a shader of its own and cast its shadow, for four more draw calls and 0.6 M more triangles; the laundry now hangs on [#155](https://github.com/artsaraiva/clearway/issues/155)'s sways.

## Amended by [#157](https://github.com/artsaraiva/clearway/issues/157) (2026-11-17)

Low-density residential Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a front door with a bicycle and pot plants by it, a kei car in a side yard that the house stands aside for, laundry and futons on a pole, swaying in the wind, and solar panels on the sunny slope of some roofs.
The bicycle is the medium-density one ([#156](https://github.com/artsaraiva/clearway/issues/156)), and the laundry and futons hang and sway as the towers' do ([#155](https://github.com/artsaraiva/clearway/issues/155)), each piece of laundry a cloth of its own in its own size and colour (Block fill, below).
