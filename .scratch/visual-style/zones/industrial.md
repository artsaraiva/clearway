# Industrial

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Industrial: sheds on 80% of the footprint, 4.2 to 5.4 m tall, and no chimney; then as above, with a lamp over each door; then a metre taller, a two-storey office in the chimney's band colour at one end of the back with a band of windows a floor, vents along the roof, and the chimney 5 m taller with a second band.
  Since [#150](https://github.com/artsaraiva/dioramania/issues/150) the footprint leaves room for a loading yard at every Stage.
  Their details are below, and since [#181](https://github.com/artsaraiva/dioramania/issues/181) they are built to the Finish (next).

### Built to the Finish

- **Industrial built to the Finish** ([#181](https://github.com/artsaraiva/dioramania/issues/181), `src/render/zones/industrial.ts`, `src/render/pattern.ts`, `src/render/movers.ts`), the whole of its menu, which the user picked on 2026-11-19.
  What it adds is drawn from streams of its own (each shed's from where it stands, each Block's scenes from its middle), so the kit's draws are as on `main` and every shed stands where it stood.
  - Walls: corrugated steel, ribs 0.2 m apart, over a concrete plinth, with a high strip of windows across every bay on all four sides at every Stage, lit at night as the windows are (surface pattern, `PATTERN.corrugated`); a band 0.5 m deep in the shed's company colour under the eaves.
    From Stage 2 a pipe run along the back, dropping to the ground at one end and rising to the roof at the other, and a ladder up the end away from the chimney.
  - Roofs: the sawtooth in ribbed steel sheet, ribs 0.25 m apart down the slope and a lap every 2 m (`PATTERN.ribbed`), up its steep faces too, with glass on the steep face of every tooth.
    From Stage 2 a row of galvanised vents a third of the way down each tooth, and at Stage 3 a galvanised duct along the roof over the ridges; the office's flat roof in ribbed sheet behind a parapet, with a plant box.
    The office wears the shed's corrugated steel, and the chimney brick courses (the garden walls' `PATTERN.blocks`, wrapped round it).
  - Ground: each yard in tarmac darker than the pavement (`PATTERN.tarmac`), from the door wall to 12 m out or the fence, with a line along its far edge from Stage 1; from Stage 2 a walkway line along the door wall broken at each door and yellow-and-black hazard stripes before each door (`PATTERN.hazard`).
    A cluster of three drums by the wall from Stage 1, a Block-zoom prop, and a skip with its load from Stage 2, where the yard has room.
  - A fence along every edge that faces a Road, 2.5 m in from it, behind the walkers on the pavement: mesh panels 1.75 m tall (`PATTERN.mesh`) between posts about 2.5 m apart, broken round the lamps, poles and street trees and by what stands at that Stage, so that it closes before ground that stands empty until later.
    Where it breaks for a truck's way out of a yard, a gate: taller posts either side, and the gate's leaf slid open behind the fence beside it.
  - The scenes, from three, picked from where the Block lies: one from Stage 2, and a second of another kind at Stage 3 on a Block of 2,500 m² or more, each on ground along an edge facing a Road between the kerb and the sheds, clear of every shed and yard, the lamps, the poles and the street trees.
    A gantry crane: a yellow portal frame at each end, two girders, a cab, and its trolley shuttling along the girders with a spreader hung under it, over a stack of containers one or two long and one or two high, three at Stage 3, when the girders rise to clear it.
    A tank farm: two to four tanks in plate steel (`PATTERN.plates`, wrapped round each) in a pale paint under a band, each with its hatch and a pipe out of its foot, in a concrete bund, a ladder up the first, taller at Stage 3 with a catwalk over their tops.
    A pipe rack: steel bents about 4.5 m apart carrying four pipes in five paints, which turn down into the ground at its far end; taller at Stage 3 with a second row of three pipes lower down.
    The stack and the tanks stand behind the walkers' line, and the crane's front legs and the rack's posts in front of it, so that the walkers pass between; on the 26-Tile City (seed 3): 33 cranes, 33 tank farms and 31 pipe racks, every Block with its scene from Stage 2 and each of 2,500 m² or more its second at Stage 3.
  - What moves: the trucks, forklifts and smoke of #150, and from Stage 2 the cranes' trolleys (a new mover, `trolley`, on no ground), each waiting 5 to 12 s over either end of its stack.
  - Night, industrial's signature: every shed's sawtooth glass glows from Stage 2 (half the sheds' at Stage 1, as before); the window strips light on every side; a floodlight mast 7.2 m tall at the yard's far corner from Stage 2, and a second at the other at Stage 3, each leaving a pool over the yard; a pool under each door's lamp; and an amber beacon on the chimney's rim.
  - The containers along the sheds (#150) wear ribbed roofs, and each stack under a crane keeps its colours at the Stage-up.

### Departures, gaps and what is beyond the menu

For the user to accept or drop with the images:

- Departures: the scene check's ceiling for industrial rises from 1.05 M to 1.3 M triangles (1.21 M at Stage 3 on the heaviest seed, 1.10 M on seed 3 against `main`'s 0.94 M); every shed's glazing lights from Stage 2, where `main` lit half; the office is corrugated steel rather than plain cream; the crane's spreader hangs at a fixed drop under its trolley rather than lowering onto the stack.
- Required by the rules rather than the menu: ribbed roofs on the containers and the office, the office's parapet and plant box, and the brick courses on the chimney (rules 1 and 2); the pools under the doors' lamps (rule 7); the second floodlight at Stage 3 (rule 9).
- Beyond the menu: the tanks' hatches and the catwalk at Stage 3, the rack's second row of pipes at Stage 3, the crane's cab, and the gate's leaf.
- Walkers still pass under the crane's girders and the rack between their legs, as they pass every scene that stands along a Block's edge.

### Details

- **Industrial details** ([#150](https://github.com/artsaraiva/dioramania/issues/150), `src/render/zones/industrial.ts`), each drawn from where it stands, so nothing else on its Block changes:
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

- **Built to the Finish ([#181](https://github.com/artsaraiva/dioramania/issues/181))**: company bands in the containers' paints but their green-grey (`#d56454` `#4d7d9c` `#5aa69b` `#d09c53` `#8b7dbf` `#ea8548`), drawn from where each shed stands;
  vents and ducts galvanised `#e6eaed`, pipes `#7d8b96`, ladders `#5c6670`;
  yard tarmac `#a9a59e`, its lines `#f4f1ea`, hazard stripes the bays' `#f0c75e` and near-black;
  fence `#7d9188` on posts and gate `#5c6b66`;
  drums `#5aa69b` `#e8b84a` `#4a525c` `#d09c53`, skips `#5aa69b` `#d09c53` `#e8b84a` with a load `#8a7d6d`, floodlight masts `#6f7986` with lamps lit `#fff1d6` and pools `#ffe6bf`, door lamps' pools the kit's door pool `#ffd49a`, the beacon amber;
  cranes `#e8b84a` with bogies `#4a525c`, a cab `#f4f1ea` and glass `#41566c`, the trolley taking the crane's paint;
  tanks `#eef0ee` `#e6dfcf` `#d9e2dc` under bands `#5aa69b` `#d09c53` `#8b7dbf`, in a bund `#d9d4ca`, their steelwork `#6f7986`;
  pipe racks `#7a8590` carrying pipes `#d9dee3` `#e8b84a` `#5aa69b` `#f4f1ea` `#8b7dbf`.

- **Sheds**: walls `#c9d1d6` `#b9c8b4` `#dccbaa` `#aebdcb` `#cfb39b` `#d9dcd2`, roofs `#8f9aa5` `#7f8c7c` `#9c8f80` `#6f7f8c`, roller doors `#f0c75e` `#e9eef2` `#79a7c3` `#7fbf9d`, chimneys `#a8604f` with a band of `#f4f1ea`
- **Industrial details ([#150](https://github.com/artsaraiva/dioramania/issues/150))**: containers in the roofs' colours, brick `#d56454`, teal slate `#4d7d9c`, teal `#5aa69b`, tan `#d09c53`, violet `#8b7dbf` and persimmon `#ea8548`, and the sheds' green-grey `#7f8c7c`, each framed and ribbed in its own colour at 78%;
  pallets `#c49a6c` under cartons `#d8b98b` or shrink-wrap `#f4f1ea` `#e9eef2`;
  trucks painted `#ffffff` `#e9eef2` `#fbe3a2` `#c0e9e0` `#d6e4d3`, with trim and back doors `#c4ccd4`, glass `#41566c`, a chassis `#4a525c` and tyres `#2f3440`;
  forklifts `#f0c75e` with a mast, seat and guard `#4a525c` and forks `#9aa3ad`;
  truck bays painted `#f0c75e`;
  smoke `#f4f1ea`, lit a little by its own light so its shaded side stays soft.
  The lamps over the doors are the street lamps' bulbs

## Frame time

### Built to the Finish ([#181](https://github.com/artsaraiva/dioramania/issues/181))

Every Tile of the 26-Tile City industrial at Stage 3 with 1,000 cars, against `origin/main` (`1bb3cf5`), medians of three interleaved rounds:

| View | Time | `origin/main` | This branch | Change | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | --- | --- |
| City zoom, Block-zoom props hidden | noon | 6.98 ms | 7.73 ms | +0.75 ms | 289 → 290 | 2.12 → 2.45 M |
| City zoom, Block-zoom props hidden | night | 6.80 ms | 7.35 ms | +0.55 ms | 369 → 372 | 2.17 → 2.50 M |
| Tile zoom, one Tile | noon | 5.67 ms | 6.13 ms | +0.46 ms | 176 → 179 | 1.58 → 1.79 M |
| Tile zoom, one Tile | night | 5.72 ms | 6.15 ms | +0.44 ms | 190 → 192 | 1.63 → 1.85 M |

Well within the 12 ms budget. The static scenery is 1.10 M triangles at Stage 3 on seed 3 against 0.94 M on `main` (the scene check's ceiling is now 1.3 M), in the same 147 meshes.
The one to three new draw calls are the movers': the cranes' trolleys are an instanced mesh of their own.

### Industrial details ([#150](https://github.com/artsaraiva/dioramania/issues/150))

Industrial details ([#150](https://github.com/artsaraiva/dioramania/issues/150)), every Tile of the 26-Tile City industrial at Stage 3, cost 0.73 ms (6.67 against `main`'s 5.93 over five rounds), for five more draw calls and 0.34 M more triangles.
Its 245 trucks and forklifts take about 0.2 ms to draw and its smoke, about 240 puffs, under 0.1 ms; placing both takes 0.15 ms a frame, and the rest is the yards' containers and pallets.

## Amended by [#181](https://github.com/artsaraiva/dioramania/issues/181) (2026-11-19)

Industrial is built to the Finish of [#173](https://github.com/artsaraiva/dioramania/issues/173), the whole of its menu: sheds of corrugated steel with a high strip of windows and a band in their company's colour, ribbed sawtooth roofs glazed on every tooth with vents and a duct, pipe runs and a ladder; tarmac yards with lines and hazard stripes, drums, a skip and floodlights; a fence with gates along the Roads; a gantry crane with its trolley, a tank farm or a pipe rack on every Block; and at night the sawtooth glass, the floodlights' pools and an amber beacon on each chimney.

## Amended by [#150](https://github.com/artsaraiva/dioramania/issues/150) (2026-11-17)

Industrial Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a loading yard before each shed's doors, which the shed stands back to leave, trucks backed up to the doors that now and then pull away and back in, forklifts shuttling to stacks of pallets, containers along the sheds' other walls, lamps over the doors, and smoke from the chimneys.
Moving details can now wait at their stops, drive a stretch in reverse, go round their loop many times a day and take a paint of their own (Block fill, below).
