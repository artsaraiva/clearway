# Low-density residential

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Low-density residential: a one-storey cottage on 70% of the footprint, on a bare lawn, and a sapling on a lot left to a tree; then the house above, with most gardens given a tree; then two storeys with a ledge between them, a chimney, a hedge round the garden and a second tree in half the gardens.
  Since [#157](https://github.com/artsaraiva/clearway/issues/157) some houses stand aside for a side yard at every Stage, and since [#179](https://github.com/artsaraiva/clearway/issues/179) every house on a lawn wide enough.
  Their details and their finish are below.

### Details

- **Low-density details** ([#157](https://github.com/artsaraiva/clearway/issues/157), `src/render/zones/low-density.ts`), each house's drawn from where its lawn lies, so nothing else on its Block changes:
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
- **Low-density to the level of finish** ([#179](https://github.com/artsaraiva/clearway/issues/179), the kit's `house` with a plan, `src/render/zones/low-density.ts`, `src/render/pattern.ts`, `src/render/movers.ts`).
  Each Block's plan is drawn from a stream of its own, so the kit's draws, and with them every lot's house, its colours and its Stage heights, are as before but for what the plan sets; a lot a scene takes still draws as it did.
  Shown in the sheets of `npm run shots -- low-density --times noon,night --run 30`:
  - Houses stand 1.6 m in from their lawn's edge and at most 10 m across (1.2 m and 10.5 m before), so that they no longer nearly touch at their corners and their gardens have room; every house on a lawn 12.2 m across or more stands aside for a side yard, a garden where it has no car or laundry.
  - Neighbours: a house keeps the gable along its long side it always had unless a house on a lot beside it has one, when it takes a gable turned across it, a hip, or an L (a wing along its front and a wing down one side of its back, each under a gable), one that none of them has, drawn from the plan.
    On the 26-Tile City the 505 houses stand under 265 gables, 75 turned gables, 80 hips and 85 Ls, and no two side by side share a form at any Stage.
  - Walls: lap siding and in every bay of about 2.6 m a framed window 0.9 m wide between louvred shutters in a deeper shade of the paint, on all four faces of every wing, a foundation along the foot and the shadow of the eaves along the top; the front's middle bay on the ground floor is siding alone where its bays are odd, behind the door.
    Windows light at night through the pattern's lit mask, on every face.
  - Roofs in flat tiles, 0.5 m wide in rows 0.25 m deep in a running bond, each a shade of its own, under a darker ridge, their gable ends pale boards; a TV aerial on the ridge on 40%, 55% and 65% at Stages 1 to 3, Close-only; #157's solar panels on the sunny slope of each form, and Stage 3's chimney on the other.
  - A porch roof over every door, a little gable in the roof's tiles on two brackets, and a porch light by the door that lights at dusk and leaves its pool on the stepping stones.
    At Stage 3 half the houses have a balcony along their front's upper storey instead, a slab behind a pale parapet under a steel rail, a futon over it on some, which shelters the door; and three in ten of the rest a dormer in the slope over the front (or the other, where the panels lie), its window lit at night.
  - At the back, Close-only: an AC unit on the ground, a gas meter on the wall and a downpipe at a corner.
  - Before every lawn, from Stage 1, a low wall of concrete blocks with a cap, open at a gate before the door between two posts, a letter box on one, and across the drive; stepping stones from the gate to the door, as far as the door stands at each Stage.
    A lot left to a tree and a scene's lot have the wall too, their gate in the middle.
  - From Stage 2: a flower border inside the wall along its longest stretch the step, the pots and the drive leave (230 houses on the 26-Tile City); a vegetable patch 2 m by 1 m where a yard has room (72); a steel shed, #178's, in a back corner on four houses in ten where one fits, facing the front or, in a side yard too narrow, the house (123); a carp streamer's pole, 11.5 m tall, flying a black, a rose and a teal carp, largest at the top, on 18% where a pole fits, as far downwind on the lawn as there is room (86); and a cat walking the top of the wall's longest run and back on 22%, sitting at each end a while (96).
  - At Stage 3 a carport over each car's drive: a pale roof at 2.8 m, over the kei wagon, on two steel posts along its outer side; the cars are the traffic's kei wagon in the cars' paints, as medium-density parks them.
  - The garden's trees stand in the corners they always took where the ground there is clear of the house and the rest, or else in the clear ground nearest it, drawn coarse as medium-density's are: 476 at Stage 2 and 652 at Stage 3 on the 26-Tile City, against trees that stood in the houses' corners on `main`.
    Stage 3's hedge opens along the front, where the wall runs, along the drive, and wherever a tree, a shed, a patch or a carp pole stands at the lawn's edge.
  - The scenes, a list of five picked from where the Block lies: one from Stage 2, and a second of another kind at Stage 3 on a Block of 2,500 m² or more, each on a lot of its own whose lawn is wide enough for its kind and faces a Road, the second not beside the first.
    Each takes its lot whole before the houses are built, so the lots are the same at every Stage; on the 26-Tile City the scenes take 81 of `main`'s 586 house lots, about one in seven: the density they cost.
    Before its Stage a scene's lot is a lawn with a young tree behind its wall.
    A koi pond: a pond with a rim of stones and koi in it (Close-only), a pine, and a stone lantern that lights at dusk and leaves its pool; at Stage 3 a wooden bridge over its narrow end and a second lantern.
    A paddling pool: an inflatable ring of water half under a striped sunshade on four poles that stand clear of it, two folding chairs in the shade (Close-only); at Stage 3 a float and a third chair.
    A kennel: a low timber fence round three sides of a run, a kennel under a little gable with a shiba sitting before it and its bowl (Close-only), and a tree in the run; at Stage 3 a puppy.
    A persimmon tree in fruit: a broad tree with its fruit orange among its leaves, a ladder against it, a basket of fruit and a bench in its shade (Close-only); at Stage 3 a rack of persimmons strung up to dry, and fruit fallen on the lawn.
    A garden with a barbecue: a patio of setts under a pergola over 3 m tall hung with string lights, which light at dusk and leave their pool, a table and chairs (Close-only), and a stone barbecue whose flue smokes through the working day; at Stage 3 a second table.
    On the 26-Tile City every Block has its scene from Stage 2 and each of 2,500 m² or more its second at Stage 3: 27 paddling pools, 22 persimmon trees, 17 barbecues, 16 koi ponds and 15 kennels.
  - Night: windows lit on every face of every house; a porch light at every door with its pool on the stepping stones, low-density's night signature, the lamps at the corners and the scenes' lanterns and string lights with theirs.
  - Departures, for the user to accept or drop: Stage 2 houses are one storey, so the upstairs balcony comes at Stage 3, as the menu's "balcony or dormer at Stage 3"; the houses are smaller than `main`'s (1.6 m from the lawn's edge, at most 10 m), so that the gardens have room; the scenes cost about one house lot in seven; and the trees that stood inside the houses' corners on `main` (808 overlaps at Stages 2 and 3) stand clear of them or are not planted.
  - Required by the rules rather than the menu: the turned gable, as a fourth form, so that no two neighbours share one (rule 10); the porch light's pool (rule 7).
    Beyond the menu of #179: the side gardens of houses with no car or laundry; the block wall's pattern and the gates' letter boxes on scene lots and tree lots; the koi pond's bridge and second lantern; the paddling pool's chairs and float; the kennel's puppy and bowl; the persimmon's ladder, basket, bench, drying rack and fallen fruit; the barbecue's patio, string lights, smoke and tables; the balcony's futons.

## Colours

- **Low-density to the level of finish ([#179](https://github.com/artsaraiva/clearway/issues/179))**: houses in their walls and roofs of the palette (Palette, in the spec), the pattern's siding a board every 0.2 m or so, its shadow 19% darker and its top 6% lighter, shutters 33% darker with louvres, window frames, sills and gable boards `#fbf8f2`, the pattern's glass as the shops', a foundation 24% darker and the eaves' shadow 30%;
  roofs' tiles each 9% darker to 6% lighter than the paint, the top of each row 30% darker, the ridge 22% darker;
  porch roofs in the roof's tiles on brackets `#fbf6ef`, porch lights the bulb's cream lit at 1.6 over a pool `#ffd49a` at 0.7 of a lamp's strength;
  balconies' parapets `#fbf6ef` under a rail `#9aa3ad`; dormers in the walls' paint, framed `#fbf8f2`; aerials `#8e979f`;
  gas meters `#e9eef2` with a dial `#4a525c`, downpipes `#c4ccd4`, AC units #156's;
  block walls `#d6d0c5` in blocks each 8% darker to 5% lighter with joints 25% darker, capped `#e8e3da`, gate posts `#c2bbaf`, letter boxes `#4a525c`; stepping stones `#c9c1b3`;
  flower borders' soil `#8a7560` under the hedge's green `#4e9f49` and blooms `#ffadc8` `#f6d36a` `#fff7e8` `#c7b8f0`; vegetable patches' soil `#8a7560` under greens `#6bc357` `#85cf61` `#5fbc51`; sheds #178's;
  carports' steel `#9aa3ad` under a roof `#e3e9ee`; kei cars the kei wagon in the cars' paints;
  carp `#3a3f4b`, `#e8919c` and `#2fb39a` with a belly and eyes `#fbf8f2`, pupils `#2f3440`, on a pole `#e9eef2` under a ball `#f0c75e`; cats' coats `#e3a35e` `#9aa0a8` `#3a3a40` `#f4f1ea` `#c9b393`, eyes `#2f3440`.
  Scenes: a pond's water `#63c9e0` on the glass, never lit, in stones `#bdb4a6` `#d9d3c7` `#a9a092`, koi `#fbf3e6` `#f0b43c` `#ea8548` `#3a3f4b`, a bridge's deck `#a1714c` and rails `#8a5a3c`, stone lanterns as #178's shrine's;
  a paddling pool's ring `#8fd8d0` under a band `#fbf8f2`, a sunshade `#f4ead2` striped `#79c86a` on poles `#c4ccd4`, chairs `#f0b43c` `#79c86a` `#a58ad8`;
  a kennel's timber `#c49a6c` with a doorway `#4a3a30` under a roof `#5aa69b`, a shiba `#d9a066` with a chest `#fbf3e6`, a fence `#e8e2d6`, a bowl `#9aa3ad`;
  a persimmon tree's leaves `#5fbc51` `#6bc357` `#4f9f45`, fruit `#ec8f4a`, trunk `#8a6a4c`, a ladder and a rack `#c49a6c`, a basket `#a1714c`;
  a barbecue's pergola `#a1714c`, its stone `#bdb4a6` and grill `#3a3f4b`, a table `#e8e2d6`, chairs `#c49a6c`, a patio in setts `#d9d1c3`, string lights the bulb's cream lit at 1.5 over the string lights' pool.
  Checked in OKLCH: within 30° of hue of the Tool blue or the Jam red-orange, nothing goes over 65% of its chroma (the persimmon roof `#ea8548`, of the palette before, and koi in it), and none first used here over 63% (the fruit `#ec8f4a`)
- **Low-density details ([#157](https://github.com/artsaraiva/clearway/issues/157))**: front doors `#8a5a3c` under a canopy `#fbf6ef`;
  solar panels' cells `#2d3b55`, glossy and never lit, in frames `#c4ccd4`;
  kei cars in the cars' colours, a cabin of the cars' dark glass `#41566c`, bumpers `#c4ccd4` and the kei truck's chassis and tyres, on drives `#d9d5cc`;
  laundry's cloths in white and the cars' colours, and futons' covers `#fbd2dd` `#cbebfc` `#fbe3a2` `#e5dafb` `#c0e9e0`, on poles `#aab3bd`;
  the medium-density bicycles ([#156](https://github.com/artsaraiva/clearway/issues/156));
  pots `#c49a6c` `#e9e4da` `#5aa69b` `#b85a4c` of the leaves' greens, some in flower `#ffadc8` `#f6d36a` `#fff7e8` `#c7b8f0`

## Frame time

Low-density to the level of finish ([#179](https://github.com/artsaraiva/clearway/issues/179)), every Tile of the 26-Tile City low-density at Stage 3 with 1,000 cars, against `origin/main` (`ceed790`) over three interleaved rounds on an M4 Pro: at Framed with the Close-only props hidden 8.78 ms against 9.71 at noon (−0.93) and 8.65 against 9.84 at night (−1.19), for four more draw calls (the carp and the cats, each with its shadow) and 1.77 M fewer triangles (3.68 against 5.45 M);
at Street on one Tile 6.77 against 7.14 at noon (−0.37) and 6.80 against 7.04 at night (−0.24), for up to six more draw calls and 0.88 M fewer triangles (2.76 against 3.64 M): within the 12 ms budget.
The pattern costs no triangles; the trees low-density lays itself are drawn coarse, the glass bands are gone, and the gardens' walls, stones, beds, sheds, carports and scenes are plain boxes, so the static scenery is 1.97 M triangles at Stage 3 against 2.67 M on `main`, and the scene check's ceiling for the Zone comes down from 2.9 M to 2.2 M.
Stage 1 builds one mesh fewer a Tile than `main`, as no house has glass before Stage 2.

Low-density details ([#157](https://github.com/artsaraiva/clearway/issues/157)), every Tile of the 26-Tile City low-density at Stage 3, cost 0.63 ms (9.05 against `main`'s 8.41 over five rounds, with [#153](https://github.com/artsaraiva/clearway/issues/153)'s to [#156](https://github.com/artsaraiva/clearway/issues/156)'s details in), for two more draw calls, the instanced cloths and futons, and 0.47 M more triangles.
A first cut swung its laundry in a shader of its own and cast its shadow, for four more draw calls and 0.6 M more triangles; the laundry now hangs on [#155](https://github.com/artsaraiva/clearway/issues/155)'s sways.

## Amended by [#179](https://github.com/artsaraiva/clearway/issues/179) (2026-11-18)

Low-density residential is built to the ten rules of the level of finish of [#173](https://github.com/artsaraiva/clearway/issues/173), held to the shops reference of [#175](https://github.com/artsaraiva/clearway/issues/175), the whole of its menu built.
A house wears lap siding with a shuttered window in every bay on every face, under flat tiles and a darker ridge, a foundation at its foot and the eaves' shadow at its top, which are surface pattern on the shared material; its roof is the gable it always had, or a gable turned across it, a hip or an L wherever a house beside it would otherwise be the same building in another colour.
A porch roof and a porch light, its pool on the stepping stones, at every door; an aerial on some ridges; at Stage 3 a balcony along the front's upper storey or a dormer on some; and at the back an AC unit, a gas meter and a downpipe, Close-only.
Houses stand further in from their lawn's edge, so that they no longer nearly touch, and every lawn has a low block wall along its front with gate posts and a letter box; flower borders, vegetable patches, sheds, carp streamers on tall poles and cats walking the wall tops come from Stage 2, and a carport over each kei wagon at Stage 3.
Each Block holds a scene from Stage 2 (a koi pond, a paddling pool, a kennel with a dog, a persimmon tree in fruit or a barbecue under a pergola) on a lot of its own, and a second at Stage 3 on a Block of 2,500 m² or more.
Other Zones' fills are unchanged.

## Amended by [#157](https://github.com/artsaraiva/clearway/issues/157) (2026-11-17)

Low-density residential Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a front door with a bicycle and pot plants by it, a kei car in a side yard that the house stands aside for, laundry and futons on a pole, swaying in the wind, and solar panels on the sunny slope of some roofs.
The bicycle is the medium-density one ([#156](https://github.com/artsaraiva/clearway/issues/156)), and the laundry and futons hang and sway as the towers' do ([#155](https://github.com/artsaraiva/clearway/issues/155)), each piece of laundry a cloth of its own in its own size and colour (Block fill, below).
