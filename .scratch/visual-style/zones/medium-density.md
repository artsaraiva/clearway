# Medium-density residential

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Medium-density residential, terraces: each house a storey lower (one at least) and plain, with no eave; then as above; then a storey higher, with a pale cornice `#fbf6ef` under the roof, an eave over the ground floor of every house of two storeys or more, and a window box of flowers (`#ffadc8`, `#f6d36a`, `#fff7e8`, `#c7b8f0`) under each upper window.
  Their details are below.
- Medium-density residential, courtyards: two floors lower (three at least), with no water tank; then as above; then two floors higher, with a balcony slab and railing in the cap's white along every face at each floor above the ground, a plant room beside the tank, and a hedge round the court's lawn.
  Their details are below.

### Details

- **Medium-density details** ([#156](https://github.com/artsaraiva/dioramania/issues/156), `src/render/zones/medium-density.ts`, `src/render/kit.ts`), each drawn from where it stands, so nothing else on its Block changes.
  What stands on the ground keeps clear of the buildings, the yards' trees, the street trees and the lamps at the Block's corners, and at least 0.6 m in from the Block's edge:
  - From Stage 2 an open walkway runs along one long face of each wing of an apartment block, the north or west one on half the blocks and the south or east one on the rest, or the other long face where that one's middle is against another wing: a slab 1.3 m deep at every floor above the ground, the length of the face, behind a parapet 1 m tall with a steel rail on top, and a door between each two windows.
    Stage 3's balconies take the other faces.
  - Steel stairs stand at a free end of each walkway from Stage 2, where there is room and the walkway does not run into another wing there: beyond the wing's end and alongside its end wall, 4.2 m by 2.4 m, two flights a storey turning at a half-landing, up to a landing at each walkway, with posts at the corners and a railing up the outer side.
  - On terraced rows, steel stairs climb about half of the row ends left over, from Stage 2 where the end house stands two storeys or more: a straight flight 1.1 m out from the end wall, rising 3 m toward the front to a landing and a door on the upper floor, as up the end of a small apartment house.
  - Washing hangs from a pole 0.7 m out under the top floor's eaves on terraced houses of two storeys or more, 3 in 10 at Stage 2 and over half at Stage 3, on brackets from the wall, and on Stage 3's balconies in about one bay a window wide in five, on a pole under the slab above; a futon hangs over the balcony's rail in about one bay in eight.
    A line of washing is 2.6 m long, its four pieces 0.4 to 0.8 m across and up to a metre long, and a futon 1.7 m wide, all a little large so they read.
  - AC units, 1.05 m wide, stand by the door of a terraced house, below its ground-floor window, on one house in four at Stage 1, half at Stage 2 and three in four at Stage 3, when a second stands on the eave over the ground floor of almost half the houses of two storeys or more.
    An apartment block has 2, 3 and 6 at Stages 1 to 3, hung on a wall between two windows or standing on a walkway or a balcony where there is one.
  - A covered bike rack 4.4 m long, with four bicycles at Stage 2 and seven at Stage 3, stands against a wall with a vending machine beside it from Stage 2 and a second at Stage 3: at the first terraced row's end with room on each Block, beyond its end wall from the front back, and from Stage 3 at the next; and against the first stretch of each apartment block's outside wall with room.
    A vending machine is 1.1 m wide and 2 m tall, a little large as the props are, its front a panel of the lamps' bulb that lights at dusk.
  - Washing and futons hang and sway as the towers' do ([#155](https://github.com/artsaraiva/dioramania/issues/155), Moving details, below): the futons are the towers' futons in their own covers, and the washing a kind of its own, `washing`, the shorter line above, swinging up to 0.24 rad either way.
    Its towel and hand towel take the paint each line is given and its shirt and mint towel keep their colours: a swaying thing's model may say which of its parts take its paint.
- **Medium-density built to the Finish** ([#178](https://github.com/artsaraiva/dioramania/issues/178), `townhouse` and `apartment` in `src/render/zones/medium-density.ts`, `src/render/props.ts`, `src/render/pattern.ts`).
  Each Block's plan is drawn from a stream of its own, so the kit's draws, and with them every lot's house or building, its storeys, colours and windows, are as before but for what the plan sets; a lot a scene takes still draws as it did.
  Shown in the sheets of `npm run shots -- medium-density --times noon,night --run 30`, which the user approved on 2026-11-18:
  - Neighbours: a terraced house keeps the gable along the row it always had unless a house on a lot it touches stands as many storeys at Stage 1 under one, when it takes a hip, its ridge across the row, or a gable to the front, one that none of them has, drawn from the plan;
    houses of equal storeys at Stage 1 stand equal at every Stage, so no two houses side by side are the same building in another colour at any Stage.
    An apartment block keeps its flat roof unless a block of as many wings on a lot beside it stands as many floors at Stage 1 under one, when it takes a mansard.
    On the 26-Tile City `main` built 944 terraced houses, all under a gable along the row, and 487 of 721 pairs side by side shared a form at Stage 1 and 274 of 720 at Stages 2 and 3; the branch builds 824 (120 lots go to the scenes), of them at Stage 2 566 gables, 128 gables to the front and 130 hips, and 54 with a corner shop or laundry, and no pair side by side shares a form at any Stage.
    Its 45 apartment blocks are the same 45 (24 Ls, 10 Os, 9 Us and 2 bars, by wings), one under a mansard; none of their 18 pairs beside each other shares a form, on `main` or here.
  - A terraced house's walls: plaster on its front round the windows and the door it was built with, and on its back and its ends a window in every bay, its back door in the middle bay (Rendering recipe, above).
    Its roof in kawara tile rows under a darker ridge, its gable ends pale.
    On its roof, drawn from where it stands: a TV aerial at one end of the ridge on 35%, 50% and 60% of the houses at Stages 1 to 3, Block-zoom;
    from Stage 2 a steel laundry deck over the back slope by the ridge, its rails and pole Block-zoom, on 25% and 45% (washing on its pole on 60% of them at Stage 3, swaying);
    a solar water heater, a tank lying along the ridge over its collector, on 18% and 30%;
    and a skylight down the front slope on 22% and 40%, glowing a little at night.
  - Its back, Block-zoom: a downpipe at a back corner and, under a gable along the row, a gutter along the back eaves; a downpipe at the back of each row end; a meter by the back door with two pot plants beside it, an AC unit on the back wall on 30%, 50% and 70%, and on a row end of two storeys or more one high on the end wall as often.
  - A corner shop or a coin laundry (45% laundries) on 45% of the row ends facing a Road, at most two a Block: its ground floor's front a framed glass shop front with its door at the row's end, a signboard with marks for lettering and a sign standing out from the end wall, a shop's striped awning or a laundry's machines' round doors through its glass (Block-zoom), its signs lit from Stage 2 and its pools before the front and by the end wall.
    Its front windows are still drawn, and the racks and stairs of #156 keep off its end wall.
  - Behind each row, an alley in setts 1.7 m deep along the houses' backs, lined with a planter of greens 1 m long against each house's back beyond its meter (or beyond its pots on the door's other side), seen from Tile zoom, the small pots by the door Block-zoom;
    and beyond it, where there is room, a garden 2 m deep: soil under three rows of greens, taller from Stage 2, and from Stage 2 a steel shed at one end on a quarter of them or a pole of washing on another quarter.
  - An apartment block's walls in plaster with a line at each floor.
    Each wing's cap wears roofing sheets on its top, its sides a band of white, and along each face not against another wing stands a white parapet, or a mansard's skirt of tiles sloping out over the wall; on its first wing condensers along its far edge, 2, 3 and 5 at Stages 1 to 3, and a TV aerial, Block-zoom, beside #156's tank and plant room.
    A front door (rule 8), in place of the ground-floor window in the middle bay (the first of the two middle ones on an even face) of a face of its first wing that looks out of the building, its walkway face where that one does: glass doors lit at night under a canopy with a lamp and a step, which leave a pool.
    A lamp at every walkway door on the walkway's parapet, on its outer face under the rail, 1.2 m by 0.6 m, where it shows from outside (the wall behind the parapet is hidden from the camera), before the walkway's windows dimmed to 0.3 of the windows' glow;
    and one under each stair landing, with a pool at the stairs' foot;
    so that a block's walkways read as rows of pale dots on dark bands at night, at City zoom too.
    Washing on poles on its walkways in 12% of the bays at Stage 2 and 16% at Stage 3.
  - Round an apartment block, from Stage 1: a hedge 0.8 m deep along each outside wall, in lengths of 2 m or more, clear of its front door by 2 m either way of where the door stands, of its stairs and racks, the parking bays and the scooter's way;
    in an L's inner corner, a court in setts with a tree in a round bed and a bench (Block-zoom);
    an O's or a U's court laid in setts round its tree in a round bed, with a bench by it;
    by a bar, a pocket court 4.6 m by 4.4 m at its foot, setts, a tree in a round bed and a bench, where there is room;
    and on each courtyard Block, three parking bays along a run facing a Road (two where three do not fit), which take their ground so that nothing else stands on them, with a kei car (the cars' kei wagon in plain boxes, as the taxi is parked) in the first from Stage 2 and in the last at Stage 3.
  - What fills the paving left bare round the apartment blocks (rule 3), from Stage 1, once all else has taken its ground: wherever a stretch lies bare 2 m either way of its middle line for 11 m or more (read on a grid of 1 m cells), in its middle a car park of four bays with kei cars as the bays by the kerb have, or a pocket court in setts with a tree in a round bed and a bench, turn about, or a tree in a round bed where neither fits, facing the nearest run of the Block's edge and clear of the lamps, the poles, the street trees and the scooter's way.
    On the 26-Tile City that lays 25 car parks, 40 pocket courts and 53 trees in beds round the 45 blocks, and both bars have their pocket court;
    the stretches of plain paving 2 m clear either way of a middle line for 12 m or more (read from what is built, on a grid of half-metre cells, Block-zoom props left out) go from 32, 29 and 30 at Stages 1 to 3 to none at Stages 2 and 3 and at most two at Stage 1, beside ground the outside stairs and a rack take from Stage 2.
  - On every Block a bin store at the kerb, Block-zoom: bags under a green net in a steel frame, with its sign.
  - The trees medium-density lays itself, in the terraced yards, the courts, the scenes and on bare paving, are drawn coarse: spheres of 12 by 8 faces in place of 16 by 12, at under half the triangles, reading the same from Tile zoom.
    The street trees, every Zone's, are as before.
  - The scenes, a list of three picked from where the Block lies: one from Stage 2, and a second of another kind at Stage 3 on a Block of 2,500 m² or more.
    A scene does not reserve its ground before the lots are laid, as the wording of the ticket's How has it: on a terraced Block it takes a span of up to three lots side by side facing a Road once the rows are laid, as wide as it needs (5.2 m for a shrine, 7 m for a pocket park, 9.6 m for a bathhouse), not beside the first, and those lots are built as no house;
    the houses beside it close their rows with end walls.
    On a courtyard Block it takes ground left along a run facing a Road once the buildings are placed, clear of every building by a metre, sliding along each run a metre at a time, 18 m or more from the first.
    So the fill changed once, against `main`'s, where those lots held houses, and each lot is the same at every Stage.
    On the 26-Tile City the scenes take 120 of `main`'s 944 terraced-house lots, about one in eight: the density they cost.
    A kind that finds no ground gives way to another.
    Before its Stage the ground is setts with a tree in a round bed and a bench either side.
    A wayside shrine: a stone torii at its front, stepping stones to a timber shrine under a copper roof on a stone footing, a straw rope and paper across it, a stone lantern either side lit at dusk with its pool, and an old tree; at Stage 3 an offering box and a low stone fence.
    A pocket park: a lawn behind a low hedge, one swing over sand, a tree, a bench facing the swing (Block-zoom) and a lamp with its pool; at Stage 3 a spring rider and a bed of flowers.
    A bathhouse: one tall storey of plaster over a timber wainscot under a tiled hip, its high windows lit, a porch on timber posts under a big gable to the front over two noren, a lit signboard on the porch with its pool, and a brick chimney 18 m tall behind it under a white band, steaming through the working day; at Stage 3 a vending machine by its door.
    On the 26-Tile City every Block has its scene from Stage 2 and each of its 26 Blocks of 2,500 m² or more its second at Stage 3; and with every Layout at every rotation placed on each side of the starting Crossroads, none of the 274 Blocks built is left without its scene at Stage 2 or 3, nor one of 2,500 m² or more without its second at Stage 3.
  - A delivery scooter on each Block from Stage 2, to the first door (a house's; a corner shop's, where it stands beyond the row's end, clear of the shop's awning; a scene's front; or along an apartment block's face toward a Road) whose way keeps 1.2 m from the utility poles, 1.4 m from the lamps and 1.8 m from the street trees and stays on the Block clear of what stands there: it waits off down the Road, unseen, for 8 to 20 s;
    comes in over the kerb, growing over its first 3 m as a car grows at a Gateway;
    pulls up at the door facing along the front and waits 5 to 9 s;
    turns round on the pavement and goes back out over the kerb, shrinking away over its last 3 m.
    It drives at 2.6 m/s, as many laps as fit in the working day, and rests at a stop by night.
    On the 26-Tile City 63 of the 67 Blocks have one and every Tile at least one.
  - Night: windows lit on every face of every building (the lit mask on terraced houses' backs and ends), the walkways' dimmer;
    the walkways' and landings' lamps in rows, which at City zoom read as rows of pale dots on the walkway faces, medium-density's night signature;
    the corner shops' signs, the bathhouses' porches and the shrines' lanterns with their pools;
    #156's vending machines with theirs;
    the scenes' and the courts' trees and lawns under the lamps at the Blocks' corners.
  - Departures and gaps, which the user accepted with the sheets on 2026-11-18: a scene takes its ground after the lots are laid rather than before (the scenes, above).
    At Stage 1 up to two stretches of plain paving 12 m and more long stay bare round apartment blocks, beside ground where outside stairs and a rack stand from Stage 2 (rule 3).
    A scene on a terraced Block faces a Road only where a span of lots facing one is wide enough; on a Block with none it takes lots facing the seam (none on the 26-Tile City).
    The walkways' lamps are about a pixel at City zoom: their rows read on the walkway faces that look toward the camera, as pale dots over the dimmed windows, and not on the faces that look away.
  - Required by the rules rather than the menu: the apartment blocks' front doors (rule 8, a door at Stage 1; Stage 1 had none), and the hips, the gables to the front and the mansards (rule 10, no two neighbours the same building in another colour); the car parks, pocket courts and trees in beds on bare paving (rule 3).
    Beyond the menu of #178, each kept by the user with the sheets on 2026-11-18: the gardens behind the alleys, with their sheds and washing poles;
    the hedges along the apartment blocks' walls;
    the front doors' canopies and lamps;
    the washing on the walkways from Stage 2;
    the bathhouse's steam and its vending machine at Stage 3;
    the shrine's offering box and fence at Stage 3;
    the pocket park's hedge, lamp, spring rider and flower bed;
    the setts, tree in a round bed and benches on a scene's ground before its Stage;
    the benches in an O's or a U's court and the pocket court at a bar's foot;
    the lamps under the stair landings, with their pools at the stairs' foot;
    and the end-wall sign of a corner shop.

## Colours

- **Terraced houses ([#136](https://github.com/artsaraiva/dioramania/issues/136))**: walls `#fff4e2` `#f6dfb4` `#f3d2c4` `#ead9c2` `#dcc6a6` `#d6e4d3` `#f9e7c8`, roofs `#4d6575` `#5b6b7a` `#3f5866` `#7a5a46` `#b85a4c` `#5aa69b` `#8b7dbf` `#a8765a`, doors `#8a5a3c`
- **Apartment buildings round a court**: walls `#e0f2d4` `#cbebfc` `#e5dafb` `#fbe3a2` `#c0e9e0` `#fbd2dd` `#fdeed6`, caps `#fbfaf6`
- **Medium-density built to the Finish ([#178](https://github.com/artsaraiva/dioramania/issues/178))**: terraced houses in their own walls and tiles of [#136](https://github.com/artsaraiva/dioramania/issues/136), the pattern's plaster a shade either way of the paint, a floor line 20% darker, window frames, sills and hoods `#fbf8f2`, the pattern's glass as the shops';
  tile rows the roof's paint, ribs ±12% and row joints 28% darker, the ridge 22% darker, gable ends `#fbf8f2` in boards;
  aerials `#8e979f`;
  laundry decks' steel `#c4ccd4` and slats `#a7aeb6`;
  water heaters' tanks `#eef1f3` over collectors of the solar panels' cells `#2d3b55`, never lit, framed `#c4ccd4`;
  skylights in the kit's paler glass lit at 0.7, framed `#fbf8f2`;
  downpipes and gutters `#c4ccd4`;
  meters `#e9eef2` with a dial `#4a525c`;
  corner shops' signboards, end signs and awnings `#2fb39a` `#f0b43c` `#79c86a` `#e8925e` `#a58ad8`, coin laundries' `#5cc0d6` `#fbf8f2` `#79c86a`, lit at 0.33 from Stage 2, their marks as the shops', the laundries' glass the paler one lit at 1.35 with machines' doors `#4a525c`, the shops' frames `#4a525c` and sills `#fbf8f2`;
  alleys in setts `#ddd3c4`;
  gardens' soil `#8a7560` under greens `#6bc357` `#85cf61` `#5fbc51`, sheds `#d9dcd2` roofed `#8f9aa5`.
  Apartment blocks in their walls of [#136](https://github.com/artsaraiva/dioramania/issues/136), plaster as the houses';
  roofs of sheets `#9fb5a7` on the cap, its sides a band of the pattern's pale boards, behind a parapet in the cap's white `#fbfaf6`;
  mansards' tiles `#b85a4c` `#4d6575` `#7a5a46` `#5aa69b` `#a8765a`;
  condensers `#f2f3ef` with grilles `#8e979f`;
  front doors in the lobby glass lit at 1.2, framed `#4a525c`, under a canopy in the cap's white;
  lamps at stair landings and the front door the bulb's cream lit at 2, and on the walkways' parapets lit at 3, before the walkways' windows lit at 0.3 of the windows' glow;
  hedges `#4e9f49`;
  parking bays and car parks `#bcc1c8` lined `#fbf8f2`, kei cars in the cars' colours;
  courts in setts `#ddd3c4` with a tree in a bed `#ddd6c9`;
  the alleys' planters `#c49a6c` of the leaves' greens;
  bin stores' frames `#9aa3ad` under a net `#4f8a6e` over bags `#f4f1ea` `#e3ecd6` `#dfe7ee`, a sign `#fbf8f2`.
  Scenes: a shrine's stone `#d9d3c7`, footing and lanterns' bases `#bdb4a6`, stepping stones `#c9c1b3`, timber `#8a5a3c` with a door `#c49a6c`, a copper roof gone green `#6f9a8a`, a straw rope `#e8cf7f` and paper `#fbf8f2`, gravel in setts `#ddd6c9`, lanterns' fire boxes the bulb's cream lit at 1.4;
  a pocket park's lawn `#a9db7f` inside a hedge `#4e9f49`, sand `#e8d3a6` under the high-density playground's swing, a lamp as at a Block's corner;
  a bathhouse's plaster `#f6e6cb` over a timber wainscot `#8a5a3c` on a footing `#bdb4a6`, tiles `#4d6575`, noren `#3f4a5e` `#6c5a8a`, a signboard `#2f3440` lit at 0.33 with marks `#fbf8f2` lit at 1.6, its door's glass lit at 1.2, a chimney `#a8604f` under a band `#f4f1ea`;
  a scene's ground before its Stage setts `#ddd6c9`.
  The delivery scooter: its body in white, a box `#f0c75e`, a rider in `#3a4252` and a jacket `#55705f` under a helmet `#fbf8f2`, tyres `#2f3440`.
  Pools: a corner shop's `#ffb870` at Stage 1 and `#ffc27a` once its sign lights, a bathhouse's the signs'; an entrance's and a stair foot's `#ffd49a` at 0.7 of a lamp's strength; a shrine's lanterns' the cream lanterns' `#ffd49a`.
  Checked in OKLCH: within 30° of hue of the Tool blue or the Jam red-orange, nothing goes over 56% of its chroma (the brick tile `#b85a4c` and the persimmon sign `#e8925e`, both of the palette before), and none first used here over 6% (the bags' pale blue `#dfe7ee`)
- **Medium-density details ([#156](https://github.com/artsaraiva/dioramania/issues/156))**: outside stairs and walkway rails steel `#6f7986`, their treads `#a7aeb6`;
  walkways and their parapets in the cap's white `#fbfaf6`, with doors `#8a5a3c`;
  AC units `#f2f3ef` with a fan's grille `#8e979f`;
  washing on a pole `#c4ccd4`: a pink shirt `#ff9cbb`, a mint towel `#64cb9f`, and a towel and a hand towel in one of `#ffffff`, white leading, `#ffc52d` `#bc9ef2` `#a6dcef` `#fbe3a2` `#ff9cbb`;
  futons `#ff9ab8` `#f0b43c` `#a58ad8` `#79c86a` `#fff7e8` `#5cc0d6`;
  vending machines `#f4f6f8`, leading, `#2fb39a` `#f0b43c` `#79c86a` `#e8925e`, trimmed `#4a525c`, their fronts the lamps' bulb;
  bike racks' steel `#9aa3ad` under a roof `#d6e4d3`, and bicycles in the cars' colours, with tyres, saddles and bars `#2f3440` and baskets `#9aa3ad`

## Frame time

Medium-density details ([#156](https://github.com/artsaraiva/dioramania/issues/156)), every Tile of the 26-Tile City medium-density at Stage 3, cost 1.02 ms (7.68 against `main`'s 6.66 over five rounds), for two more draw calls, the instanced washing and futons, and 0.58 M more triangles.
The most are the bicycles, about 0.13 M with their shadows, and the outside stairs, 0.1 M.
A first cut drew 1 M more triangles, until the wheels and AC grilles became flat discs and the vending machines plain boxes; and while its washing and futons swayed on a material of their own, merged into each Tile's scenery, they cost a draw call a Tile.

Medium-density built to the Finish ([#178](https://github.com/artsaraiva/dioramania/issues/178)), every Tile of the 26-Tile City medium-density at Stage 3 with 1,000 cars, against `origin/main` (`c3dcb44`, with [#177](https://github.com/artsaraiva/dioramania/issues/177) in) over three interleaved rounds, after the review's fixes, the branch at `9aaf3b2`: at City zoom with the Block-zoom props hidden 9.36 ms against 8.46 at noon (+0.90) and 9.31 against 8.32 at night (+0.99), for three more draw calls, two of them the scooters' instanced mesh and its shadow, and 0.52 to 0.55 M more triangles (4.15 and 4.19 M against 3.63 and 3.64);
at Tile zoom on one Tile 7.12 against 6.38 at noon (+0.74) and 7.23 against 6.38 at night (+0.85), for 7 or 8 more draw calls, among them the Block-zoom mesh of every build in view, and 0.63 to 0.65 M more triangles: within the 12 ms budget.
That bench ran on a day `main` read about 13% slower than on the first, before the review (7.46 ms at City zoom at noon), which read +1.50 and +0.67 ms at City zoom and +0.48 and +1.12 at Tile zoom, for 0.74 to 0.76 M more triangles at City zoom.
The review's fixes add car parks, pocket courts and trees on the bare paving round the apartment blocks, paved courts, the alleys' planters and the walkways' lamps, about 0.4 M triangles at City zoom, and find 0.62 M back: the trees medium-density lays itself drawn coarse, and the terraced roofs' aerials and laundry decks' steel, the downpipes and gutters and the apartment blocks' aerials Block-zoom, which leaves Tile zoom as it was (0.29 M fewer there).
Against the branch before the review, on the same machine and day over a round each, City zoom reads 4.15 M triangles against 4.37 at noon (9.11 ms against 9.22) and Tile zoom 3.07 M against 3.11.
The pattern costs no triangles; the rest are the scenes' and the courts' trees, the terraced roofs' decks, water heaters and skylights, the gardens and hedges, counted twice with the shadow pass; the walkways' lamps and the front doors add no draw call, lit on the kit's bulb, and the scooters are one instanced mesh for the City, 63 of them.

## Amended by [#178](https://github.com/artsaraiva/dioramania/issues/178) (2026-11-18)

Medium-density residential is built to the ten rules of Finish of [#173](https://github.com/artsaraiva/dioramania/issues/173), held to the shops reference of [#175](https://github.com/artsaraiva/dioramania/issues/175), the whole of its menu built; the user approved its sheets on 2026-11-18.
A terraced house wears plaster on every face, round the windows of its front and with a window in every bay of its back and its row ends and a back door, under kawara tile rows and a ridge that are surface pattern on the shared material;
its roof is a gable along the row as before, or a hip or a gable to the front wherever a house beside it would otherwise be the same building in another colour, and carries a TV aerial from Stage 1 and from Stage 2 a steel laundry deck, a solar water heater and a skylight on some.
Downpipes and a gutter run down its back, a meter, pot plants and AC units stand at its back and row ends, Block-zoom, and some row ends facing a Road keep a corner shop or a coin laundry in their ground floor, its signs lit from Stage 2 with their pools.
Behind the rows an alley in setts, lined with a planter of greens at each house's back, runs past a garden of greens to each house, with a shed or a pole of washing on some.
An apartment block wears plaster with a line at each floor and, on its cap, a sage roof of sheets behind a white parapet, or a mansard of tiles where a block beside it would otherwise be its twin, with condensers and an aerial on it;
a front door under a lit canopy, a lamp on each walkway's parapet at every door, before the walkway's dimmed windows, and at every stair landing, so that its walkways read as rows of dots at night at City zoom, hedges along its walls, paved courts with a tree and a bench in an L's corner, in an O's or a U's court and at a bar's foot, parking bays with kei cars by it and washing on its walkways;
and the paving left bare round the blocks takes car parks, pocket courts and trees in beds (rule 3).
Each Block holds a scene from Stage 2 (a wayside shrine in stone and wood, a pocket park with one swing, or a bathhouse with a tall thin chimney that steams), and a second at Stage 3 on a Block of 2,500 m² or more; a bin store under a net stands at its kerb, Block-zoom, and a delivery scooter comes in over the kerb from Stage 2, waits at a door and goes.
Other Zones' fills are unchanged (Rendering recipe, Palette, Block fill, Budget and Verification, below).

## Amended by [#156](https://github.com/artsaraiva/dioramania/issues/156) (2026-11-17)

Medium-density Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: open walkways along the apartment blocks with steel stairs at their ends, and steel stairs up the end of some terraced rows too;
washing and futons hung out over poles and balcony rails, swaying, and taken in for the night;
pale AC units on walls, walkways and balconies;
and a covered bike rack with vending machines, lit at night, at a row's end or against each block.
Washing and futons hang and sway as the high-density towers' do ([#155](https://github.com/artsaraiva/dioramania/issues/155)), the washing a shorter, brighter line of its own (Block fill, below).
