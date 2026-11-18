# Farms

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Farms: a cottage and a barn with one bale and no silo, low shoots in most fields and about a third left fallow; then as above; then a two-storey farmhouse, a second, shorter silo and a lean-to, fuller rows 45% wider that hide most of the furrows, and a few pines behind the house where there is room.
  Their details are below.

### Details

- **Farm details** ([#149](https://github.com/artsaraiva/clearway/issues/149), `src/render/zones/farms.ts`), each field's drawn from where it lies, so no other field and nothing else on its Block changes:
  - About one field in five is a rice paddy at every Stage: pale aqua water inside a low bank, under two rows of shoots to each row of crop, 0.16, 0.34 and 0.46 m tall at Stages 1 to 3.
    A paddy left fallow at Stage 1 is flooded and bare.
  - About one field in eight goes under vinyl greenhouses at Stage 2, and one in five at Stage 3: long pale arched tunnels, 3.5 m across and 2.3 m high, two side by side over a field and at most 26 m long, with a hoop every 2.4 m and a door at each end.
    They stop a metre short of the rows' ends.
  - A scarecrow stands in a paddy, three in ten from Stage 1, more than half from Stage 2 and three in four at Stage 3, and in a few fields of crops from Stage 2 (one in twenty) and Stage 3 (one in seven): a post with outstretched arms in a bright shirt, a cloth head and a wide straw hat, about 3 m tall.
  - A kei truck stands in a farmstead's yard from Stage 2, on the side the default camera sees, with two crates on its flat bed; at Stage 3 the bed is full, and a stack of four crates stands beside it.
  - Tractors work the fields of crops that have no scarecrow and never go under greenhouses: one a Block from Stage 2, and a second at Stage 3 on a Block with two fields or more, half its loop ahead.
    A tractor drives up and down each row in turn, straddling it, turns on the headland beyond the rows' ends, skirting the greenhouses and the farmyard, moves on field by field, and comes back along the headland to start again.
    It drives at 2.8 m/s, oversized as the cars are, and bobs a little as it goes.

## Colours

- **Farms**: ploughed ground `#cdb08a`, crops `#7bc35e` `#e3c76a` `#a6d36b` `#5aae58` `#d9b45c`, barns `#7e9aab` `#b85a4c` `#8aa58b` under `#5b6b7a`, silos `#e9eef2` with domes `#9aa7b2`, straw `#e8cf7f`
- **Farm details ([#149](https://github.com/artsaraiva/clearway/issues/149))**: paddy water `#a9d9d6` under shoots `#8fd46c` (`#7bc35e` at Stage 3);
  greenhouses' film `#eef5f2`, hoops `#d3ddda` and doors `#c9d6d2`;
  tractors persimmon `#ea8548` with a canopy `#f4f1ea`, tyres `#2f3440` and a grille and seat `#4a525c`;
  the kei truck `#f4f6f8` on a chassis `#4a525c`, its crates `#f0c75e` `#7fbf9d` `#e9eef2`;
  scarecrows' posts `#a1714c`, cloth heads `#f4ead2`, straw hats `#e8cf7f`, and shirts in the cars' colours

## Frame time

Farm details ([#149](https://github.com/artsaraiva/clearway/issues/149)), every Tile of the 26-Tile City a farm at Stage 3, cost 0.46 ms (6.72 against `main`'s 6.26), for six more draw calls and 0.34 M more triangles.
Their 106 tractors take 0.04 ms a frame to place and about 0.1 ms to draw: the rest is the greenhouses and the paddies' shoots.

## Amended by [#149](https://github.com/artsaraiva/clearway/issues/149) (2026-11-17)

Farms carry details of their own, picked by the user from a sheet of Stages 1 to 3: rice paddies, vinyl greenhouses, scarecrows, a kei truck in the farmyard, and tractors that work the fields.
The tractors are the first moving details, and build the machinery every Zone's will use: drawn instanced outside the merged scenery, arriving with a Rebuild's bricks and leaving with their Tile, at work through the day and at rest by night (Block fill, below).
