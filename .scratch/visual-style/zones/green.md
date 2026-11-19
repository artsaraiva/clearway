# Green

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Green: a meadow's groves are three saplings each, with no beds; then five trees and the beds; then the trees grown on, three more beds and a pavilion by the first grove.
  Allotments have half their plots bare, shorter crops and no sheds; then as above; then every plot worked, taller crops, and beans `#4f9f4a` up canes `#c9b07a` on some.
  Their details are below.

### Details

- **Green details** ([#152](https://github.com/artsaraiva/clearway/issues/152), `src/render/zones/green.ts`), each drawn from where it stands, so nothing else on its Block changes.
  Benches and blankets keep clear of the trees, the beds, the street trees and the pavilion of every Stage, so none stands where a later Stage builds, and wildflowers keep off the benches and blankets:
  - Wildflowers lie in drifts through a meadow's grass: about two drifts to every 1,000 m² at Stage 1, three more at Stage 2 and four more at Stage 3, of 12, 16 and 20 flowers, each drift mostly of one colour and about 5 m across.
    A flower is a flat five-petalled star 0.56 m across, 0.08 to 0.22 m above the grass, true to size as the petals are, on the meadow's lawn only and well in from its edge.
  - A bench stands by the first grove from Stage 2 and by every grove at Stage 3, 7 to 8.5 m out from the grove's middle on the side the default camera sees where there is room, clear of the grown trees' crowns and facing out from them: wooden slats on iron ends, 2 m long.
  - A picnic blanket lies on the open grass from Stage 2, with a basket on it, and a second at Stage 3 under a parasol, with a third on a Block of 2,500 m² or more: gingham 2.6 m by 2 m, turned a little, at least 4 m from trees and beds.
  - Butterflies flit between the beds through the working day, one to every two beds from Stage 2 and one more to every three at Stage 3, at most three each: each goes round the beds from one of them, nearest first, weaving 0.7 m either side of its way, alights on each bed and rests there 3 to 9 s with its wings nearly closed and fanning.
    It flies at 1.4 m/s, rising about a metre off the beds and bobbing as it goes, its wings beating seven times a second.
    It is 0.85 m across, oversized so it reads at Block zoom, and seen only there.
    At night it rests on a bed with its wings closed.
  - In the allotments a scarecrow, the farms', stands in the plot of crops nearest the Block's middle, from Stage 1 on half the Blocks and from Stage 2 on the rest, and a second at Stage 3 in the plot farthest from it on a Block of 12 plots or more.
    A water butt stands at the front corner of every shed, from Stage 2 as the shed does.
    Cold frames take the back row of about one plot in six from Stage 2 and one in three at Stage 3, the row drawn but not grown: low glass lights 1.1 m deep on a pale base, sloping down to the south.

## Colours

- **Green**: the meadow `#b9e293`, flower beds `#ffd1df` `#f6d36a` `#ffadc8` `#fff7e8` `#c7b8f0`; allotments' gravel `#e6dccb`, soil `#a77f5a`, crops `#6fc35a` `#8fd46c` `#5aae58` `#b9dd6a`, flowers `#ffd1df` `#f6d36a` `#ffadc8` `#fff7e8`, sheds `#c49a6c` roofed `#5aa69b`
- **Green details ([#152](https://github.com/artsaraiva/clearway/issues/152))**: wildflowers `#ffffff` `#f6d36a` `#a58ad8` `#ff9ab8` `#c7b8f0`, white and yellow leading;
  butterflies' wings `#ffffff` `#f6d36a` `#fbe3a2` `#ffadc8` `#c7b8f0` `#f0b43c` with tips and a body `#4a525c`;
  benches' slats `#c49a6c` on iron ends `#6f7986`;
  picnic blankets `#ffadc8` `#f6d36a` `#7fbf9d` `#c7b8f0` `#f0b43c` checked with `#fbf8f2`, baskets `#c49a6c` under lids `#a1714c`, and parasols in the blankets' colours on a pole `#6f7986`;
  water butts `#4f8a6e` under lids `#3d6d57`;
  cold frames' glass `#d6ece6`, painted on the soft-lit material as the greenhouses' film is, on a base `#f4f1ea`;
  scarecrows as the farms'.
  Benches and cold frames cast round contact shadows, as the trees do, so a green Tile draws no other shadow

## Frame time

Green details ([#152](https://github.com/artsaraiva/clearway/issues/152)), every Tile of the 26-Tile City green at Stage 3, cost 0.32 ms (7.58 against `main`'s 7.26 over five rounds), for no more draw calls and 0.32 M more triangles, most of them wildflowers, with 281 butterflies.
A first cut cost 53 more draw calls: cold frames in the kit's glass and square contact shadows each brought a material no green build drew before, and so a mesh to every green Tile.

## Amended by [#152](https://github.com/artsaraiva/clearway/issues/152) (2026-11-17)

Green Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: in a meadow, drifts of wildflowers through the grass, a bench by each grove, picnic blankets, one under a parasol, and butterflies that flit between the flower beds by day; in the allotments, scarecrows, water butts by the sheds and glass cold frames.
Butterflies are the first moving details that fly: they rise off their path between stops and beat their wings, and every mover's bob now keeps a phase of its own (Block fill, below).
