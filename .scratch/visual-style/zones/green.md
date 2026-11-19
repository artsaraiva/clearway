# Green

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Green: a meadow's groves are three saplings each, with no beds; then five trees and the beds; then the trees grown on, three more beds and a pavilion by the first grove.
  Allotments have half their plots bare, shorter crops and no sheds; then as above; then every plot worked, taller crops, and beans `#4f9f4a` up canes `#c9b07a` on some.
  Their details are below.

### Built to the Finish

- **Green built to the Finish** ([#182](https://github.com/artsaraiva/clearway/issues/182), `src/render/zones/green.ts`, `src/render/pattern.ts`, `src/render/movers.ts`), the whole of its menu.
  The groves, the beds, Stage 3's beds and pavilion, and the plots are planned on the kit's stream as on `main`; what the Finish adds is drawn from a stream of the Block's own, seeded from where it lies.
  A tree or a bed in the way of a scene or the stream is not planted, and benches, blankets and wildflowers keep off the scenes, the stream and the paths, so some stand elsewhere than on `main`.
  - **Meadow**
    - Ground: unmown grass, each 25 cm a shade of its own with a pale seed head here and there, mown paler in glades and a way that winds between them, over a repeat of 16 m; surface pattern on the shared material, no triangles.
    - Beds are rows of flowers: soil, rows of leaves 0.7 m apart, and star flowers along each in the bed's colour, cream on every third row.
    - A worn path of trodden earth, 1.3 m wide, from a corner of the Block winding in to the scene; a second, to the second scene, the pavilion or the Block's middle, on a Block of 1,600 m² or more. 37 on the 26-Tile City.
    - On a Block of 2,500 m² or more a stream 2 m wide between stony banks winds from one side of the grass to the other, across the Block's longer side more often than not, clear of the scenes, with a round pool at each end. A plank bridge crosses it where a path does, or over its middle where none does. 15 streams and 16 bridges.
    - Tufts of tall grass, Block-zoom, every 5 to 7 m along the meadow's edges and either side of the stream, from Stage 1: they keep a meadow's pavement from standing empty (rule 3).
    - A log pile by the second grove from Stage 1, and beehives by the last, two from Stage 2 and a third at Stage 3; both Block-zoom.
    - The scenes, one from Stage 2 and the other at Stage 3 on a Block of 2,500 m² or more, 16 m apart, each on the spot nearest a point drawn on the Block that keeps clear of the trees and beds.
      A kite flown from a rise: a mown mound about 6.4 m across and a metre high, a flyer in a straw hat on its top facing downwind, and a kite on its string; at Stage 3 a child beside them flies a second. The rise stands where the kite's way downwind is clear of trees, while there is such a spot.
      A campsite: a ridge tent 4.5 m long on a groundsheet, a fire in a ring of stones that steams, a log to sit on and a camper; at Stage 3 a second, smaller tent.
      35 kite rises and 36 campsites on the 26-Tile City.
    - The pavilion's roof is in tile rows, and a lantern hangs in it.
  - **Allotments**
    - Ground: trodden earth for the paths between plots, on the gravel pattern, and each plot's soil in furrows 0.4 m apart, on a pattern of its own.
    - A fence 1.9 m in from the Block's edge on every side: posts a metre tall every 2 m and a rail, two rails from Stage 2, open round each lamp, pole and street tree. A gate at the middle of a run on a Road: two taller posts and a leaf ajar, and from Stage 2 a bar over it. It keeps the allotments' pavement from standing empty (rule 3).
    - The plot nearest the gate is the yard, Block-zoom: a compost bin, and from Stage 2 three in a row, a wheelbarrow and a hose reel on a post with its hose run out. Only on a Block that keeps four plots or more beside it.
    - The scenes each take a plot near the Block's middle, bare soil until their Stage.
      A gardener at work: a glasshouse 4.4 m long along the plot's back, a row of seedlings before it, the gardener with a spade, and a wheelbarrow; at Stage 3 its glazing bars and a second row.
      An apiary: four beehives on a long stand before a clipped screen, a fifth at Stage 3, and a beekeeper in white.
      14 gardeners and 12 apiaries on the 26-Tile City.
  - What moves, from Stage 2: the kite, which swings about the flyer's hand on the wind through the working day and is taken in for the night, as washing is (a new thing that sways); a dog, a new mover, which runs at 3.4 m/s from picnic blanket to picnic blanket, where Stage 3 lays the rest, waits 4 to 11 s at each and goes back the way it came, round the trees, beds and benches and never through the stream; the camp fire's steam; and over the allotments one butterfly, or two over seven plots or more, round the four plots nearest its own, of those in flower. 47 dogs.
  - Night: the tents glow from inside and leave their light round them, with the embers' amber pool by them: green's night signature. The pavilion's lantern lights its floor, a glasshouse's panes glow, and from Stage 2 a lantern on the gate's post lights the way in.
  - Blankets and water butts are Block-zoom props now, as small props are on a finished Zone.

### Departures, gaps and what is beyond the menu

For the user to accept or drop with the images:

- Departures and gaps: the meadow's trees are coarse (as parks', under half the triangles), which pays for everything above; trees and beds give way to a scene or the stream; the stream's bridge stands apart from the path where the path does not cross it; a kite on a small Block may fly among the crowns; the dog runs from Stage 2 to where Stage 3's blankets will lie; the furrows read faintly from Tile zoom.
- Required by the rules rather than the menu: allotments' second scene kind, the apiary, and a piece larger than a car for the gardener, the glasshouse (rule 5); butterflies over the allotments (rule 6); the lantern on the gate, so that allotments are lit at night, and the embers', tents' and glasshouses' pools (rule 7); the rise, the tent and the hive stand as the pieces larger than a car.
- Beyond the menu: the beekeeper, the camper, the child with a second kite and the second tent at Stage 3; the camp fire and its log; the round pools at the stream's ends; the gardener's seedlings; the bar over the gate.

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

- **Green to the Finish ([#182](https://github.com/artsaraiva/clearway/issues/182))**: allotments' trodden earth `#d9c39c` in place of the gravel `#e6dccb`; the meadow's worn path `#cdb489`, the rise `#c6e9a2`, a bed's rows of leaves `#5aae58`, tall grass `#8fbf62` `#a3c96b` `#7fb35a` with seed heads `#d9c98a`, the stream's banks `#b7b29f` under the ponds' water, logs `#a1714c` `#8a6446` `#b58a62`, beehives `#f4e3a1` `#fbf8f2` `#cfe3c0` under lids `#8e979f`, the bridge's planks `#c49a6c` and `#d8b98b` on beams `#a1714c`;
  tents `#f0d58a` `#b9d6b0` `#f2c9a0` `#e6dfc8`, lit from inside, with a door and groundsheet `#8a6446`; the fire's stones `#a29d92` and embers `#ffb24a`;
  people in shirts `#f6d36a` `#7fbf9d` `#ffadc8` `#c7b8f0` `#fbf8f2`, legs `#4a525c`, skin `#f1d1b5` and straw hats `#e8cf7f`; kites in `#f6d36a` `#ffadc8` `#c7b8f0` `#7fbf9d` `#fbf8f2` on spars `#4a525c` with bows `#fbf8f2`; dogs' coats `#fbf8f2` `#c49a6c` `#4a525c` `#e8cf7f`, ears and nose `#4a3a30`;
  the fence's rails `#c49a6c` on posts `#a1714c`, compost `#6b5137`, a wheelbarrow `#6f8f80`, a hose `#5aa69b`, a glasshouse's frame `#f4f1ea` and panes `#d6ece6`, and the gate's lantern `#fff4dc`
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

Green built to the Finish ([#182](https://github.com/artsaraiva/clearway/issues/182)), every Tile of the 26-Tile City green at Stage 3 with 1,000 cars, medians of three rounds against `main` in the same run:

| View | Time | `main` | #182 | Draw calls | Triangles |
| --- | --- | ---: | ---: | --- | --- |
| City zoom | noon | 8.52 ms | 7.80 ms | 216 → 248 | 4.59 → 3.63 M |
| City zoom | night | 8.48 ms | 7.67 ms | 298 → 328 | 4.63 → 3.69 M |
| Tile zoom | noon | 6.32 ms | 5.95 ms | 141 → 164 | 3.08 → 2.66 M |
| Tile zoom | night | 6.16 ms | 6.05 ms | 156 → 172 | 3.12 → 2.73 M |

The coarse trees save more than the Finish costs. The static scenery is 1.90 M triangles in 118 meshes at Stage 3 (2.23 M in 104 on `main`): the lanterns' bulbs, the streams' water and the Block-zoom props are a mesh each on a Tile that has them.

Green details ([#152](https://github.com/artsaraiva/clearway/issues/152)), every Tile of the 26-Tile City green at Stage 3, cost 0.32 ms (7.58 against `main`'s 7.26 over five rounds), for no more draw calls and 0.32 M more triangles, most of them wildflowers, with 281 butterflies.
A first cut cost 53 more draw calls: cold frames in the kit's glass and square contact shadows each brought a material no green build drew before, and so a mesh to every green Tile.

## Amended by [#152](https://github.com/artsaraiva/clearway/issues/152) (2026-11-17)

Green Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: in a meadow, drifts of wildflowers through the grass, a bench by each grove, picnic blankets, one under a parasol, and butterflies that flit between the flower beds by day; in the allotments, scarecrows, water butts by the sheds and glass cold frames.
Butterflies are the first moving details that fly: they rise off their path between stops and beat their wings, and every mover's bob now keeps a phase of its own (Block fill, below).
