# Offices

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Offices: 3 to 5 storeys (5 to 7 for the one tower in five that stands tall), a plain body with no penthouse, dome or spire, one tier and fewer floors lit; then 6 to 9 (11 to 14) as above; then 9 to 13 (17 to 22), a spire on every form, a third tier on a stepped tower, more floors lit and trees in planters on the plaza.

### Details

- **Office details** ([#154](https://github.com/artsaraiva/clearway/issues/154), `officeTower` in `src/render/zones/offices.ts`), each drawn from where its tower stands, so nothing else on its Block changes:
  - A flat roof, a framed or a finned tower's, carries two vents at Stage 1.
    From Stage 2 a cooling unit with a fan or two on top stands on its east side, and a second on six roofs in ten; at Stage 3 both stand, and a long third unit on the north side.
    The round and stepped towers' roofs carry none.
  - At Stage 3, of the framed and finned towers, every tall one and one in four of the rest carry a helipad on the penthouse's roof: the high-density towers' mark ([#155](https://github.com/artsaraiva/clearway/issues/155)) as wide as the roof allows, painted a grey pad, a yellow ring and a white H.
    Its spire stands at the roof's back corner instead of at its middle.
  - Every spire's tip carries a white beacon, and so does the coral tower landmark's.
    The corners of a tall tower's roof carry amber beacons from Stage 2, and those of every flat roof at Stage 3.
    They are the high-density towers' beacons ([#155](https://github.com/artsaraiva/clearway/issues/155), above), blinking as those do, each on a beat of its own, but small: 0.8 m across on a corner and about 1 m on a spire, a lit point at Block zoom and barely there from the default zoom.
  - The first framed or finned tower of each Block hangs a gondola from Stage 2, on its south or east face, the faces the default camera sees: a yellow cradle 5 m long with two cleaners in it, on two ropes from two arms reaching over the roof's edge.
    Each morning it waits 5 s under the arms, then works down the face a stop every two floors, 6.4 m, waiting 1.6 to 2.6 s at each, as far as 26 m or the lobby's canopy, and climbs straight back, at 1 m/s.
    That is one lap a day, done by about 70 s of the 90 s working day, and it waits under the arms until the next morning.
  - Three flagpoles stand in a row by the lobby of a third of the towers from Stage 2 and two in three at Stage 3, on the face whose pavement lies nearest the Block's edge, where all three poles and their flags stand on the Block clear of the lamps and the street trees.
    Since [#177](https://github.com/artsaraiva/clearway/issues/177) they stand beside the canopy over the door, on whichever side they fit, or where neither side has room on another face as before.
    Which towers fly them is drawn from where each lot's tower stood before a scene stood it back, so the same towers fly them as before: 53 at Stage 2 and 101 at Stage 3 on the 26-Tile City, as on `main`, all beside the canopy.
    Each pole is 8.5 m tall, its flag 2.3 by 1.45 m in a colour of its own.
    The flags fly downwind on the wind that leans the chimneys' smoke, a wave running along each from the pole, are raised through the first moments of the working day and lowered and furled as it ends, so no flag flies at night.
- **Offices built to the Finish** ([#177](https://github.com/artsaraiva/clearway/issues/177), `officeTower` in `src/render/zones/offices.ts`, `src/render/props.ts`, `src/render/pattern.ts`).
  Each Block's plan is drawn from a stream of its own, so the kit's draws, and with them every lot and its tower's floors, glass and trim, are as before but for what the plan sets.
  Shown in the sheets of `npm run shots -- offices --times noon,night --run 45`, which the user approved on 2026-11-18:
  - Each tower keeps the form it always drew, from its own stream as before, unless a tower on a lot beside it already has that form (their lots within 1.5 m of each other one way and sharing more than 1 m of side the other), when it takes one of the others by their shares, drawn from the plan;
    so no two towers side by side are the same building in another colour, and the mix of forms stays as it was.
    Every lot draws from the kit's stream as it always has, whatever now stands on it, so that the lots after it keep their draws.
    On the 26-Tile City the 152 towers are 48 framed, 40 finned, 31 stepped and 33 round, against `main`'s 51, 37, 31 and 33, where 20 of the 78 pairs of towers side by side shared a form; none does now.
  - Its curtain wall, where the kit builds patterned: the tower's glass as before, as one box a tier (a cylinder for a round tower, in place of its floors and its ribs) wearing the curtain pattern, a pane 1.6 m wide, two to a bay of about 3.2 m, a storey 3.2 m, a pale line at each floor over a spandrel 0.5 m deep and mullions at the bays and between the panes.
    Its glass pales toward the sky a third of its height at a time, each pane a tone of its own.
    A framed tower keeps its corner posts and loses its fine mullions, which the pattern draws; a stepped tower's tiers pale as its floors did.
    Unpatterned (`?finish=none`), it is laid floor by floor in the kit's glass, as before.
  - Its roof: square pavers 1 m across on the deck; two vents and a dish at Stage 1, then sage cooling units, a yellow duct along the south side and a second dish from Stage 2, a third at Stage 3 on half; a railing round a finned tower's roof inside its fins, round a penthouse's roof, and along each ledge of a stepped tower.
    A penthouse's walls wear panels and high windows, which light.
    A round tower's dome and a stepped tower's cap wear pavers, converging to the top.
    A round tower of Stage 1 has two vents and a dish on its deck.
    Every ledge left in sight round what stands on it wears pavers too, in the tower's trim or the deck's grey ([#216](https://github.com/artsaraiva/clearway/issues/216)): a penthouse's deck, a round tower's band over the lobby and its crown round the dome (its roof at Stage 1), and each ledge of a stepped tower round the tier or the cap on it.
  - A name plate crowns the tall towers from Stage 2, and at Stage 3 every tower of 12 floors or more: a board 0.95 m tall and up to 9 m long on each face, on a framed tower's parapet, across a finned tower's fins, on a stepped tower's top tier or tangent to a round tower's ring, in a company's colour with three to five marks for lettering, lit at night as a shop's signboard is;
    but, high on a tower's crown, it leaves no pool on the ground (a departure from rule 7, below).
  - Its lobby: a revolving door, a drum of the lobby's glass 1.9 m across under a dark cap, on the face toward the Road, the face whose plaza lies nearest the Block's edge, on a landing with a step up from the plaza, under a canopy 4.6 m wide reaching 2.6 m out on two posts, its soffit and its edge lit.
    The lobby's glow leaves a pool 2.8 m deep before each face, and the canopy a brighter one.
  - Its plaza, from Stage 1: chequered paving, slabs 0.6 m square in light and dark squares of four, in one of three colours a Block, out to 4.5 m beyond the plinth or 0.9 m from the Block's edge, clear of the kerbstone line.
    On the canopy's other side from the flags a sculpture (two blocks askew on a plinth), a clock on a post whose faces light, or a fountain whose spray rises as steam does, from Stage 2; a bench on each face either side of the door, Block-zoom, from Stage 1, and planters by it from Stage 2, Block-zoom; #154's trees in planters at Stage 3, where nothing else stands.
  - A taxi bay at the kerb of each Block, on a run facing a Road, 11 m long for two taxis (5.6 m for one where that is all there is room for) and 2.5 m deep from 0.75 m in from the edge, 5 m clear of its run's ends: tarmac lined along its back and ends, and a stand's sign on a post that lights and leaves a pool, from Stage 1;
    a taxi in it from Stage 2 and a second at Stage 3, the cars' taxi in plain boxes, facing along the kerb with the pavement on its left, its roof lamp lit at night.
  - The scenes, a list of three picked from where the Block lies, on ground the Block reserves before any tower is laid, from which every tower stands back, its plinth 1.4 m clear, cut back on whichever side keeps it largest and never under 9 m across: first a lot no tower fits, as at a rounded corner, which the Block left bare before, and otherwise a run of its edge facing a Road (or any run), 12 m along it and 7.5 m deep from 0.8 m in, or smaller, 3 m from the run's ends, where the zebras meet the kerb.
    One from Stage 2, and a second of another kind at Stage 3 on a Block of 2,500 m² or more, 18 m or more from the first.
    Before its Stage the ground is paved with a tree in a round bed and a bench either side.
    A sunken court: three tiers of stone steps down on three sides to a paved court open toward the Road, a tree in a round bed and benches, and at Stage 3 a long pool of water across its front and two low lights with their pools.
    A sculpture plaza: a round stone platform under a ring 4.6 m across on edge, three cubes stacked askew or a sphere on a drum, and at Stage 3 two uplights with their pools and benches facing it.
    A food truck's court, only where a Road runs past its kerb: tables at its back under a pergola, steel posts and beams 2.9 m up under timber slats, which is its standing piece whenever the truck is away, with two lamps hung under it that leave their pools, and a menu board, Block-zoom; at Stage 3 a third table, and string lights under the pergola in the lamps' place, with a pool.
    Its food truck waits off the Road through the morning, unseen.
    About 0.2 of the day it comes in over the kerb, 5.5 to 9 m along the front from where it parks, wherever its way in keeps clear of the utility poles, the lamps and the street trees, growing over its first 3 m as a car grows at a Gateway, and curves in to park along the court's front, its hatch toward the tables.
    After midday, about 0.37, it backs out the way it came and shrinks away over its last 3 m to the kerb.
    A kind that finds no ground gives way to another the Block has not taken, as a food truck's court does where no Road runs.
    With every Layout at every rotation placed on each side of the starting Crossroads, and on the 26-Tile City, the only Block left without a scene is one that the seed's coral tower fills, which is its Landmark; every Block of 2,500 m² or more has its second at Stage 3.
  - A lot no tower fits that no scene takes is left a grove, as is one lot in seventeen where a tower would stand: paved, with up to three trees in round beds, growing with the Stage, and a bench by the first, Block-zoom, on whichever side of it the bench stands on the Block clear of the lamps, the street trees, the scenes, the taxi bay and the other beds.
  - Night: windows lit in bands of floors on every face, darker glass dimmer, as the kit's glass dims, but never under a third of its glow; the name plates and the canopies' edges lit; pools before every lobby and under every canopy, a clock, a taxi sign, a court's lights, a sculpture's uplights, a pergola's lamps and the string lights; the beacons of #154.
    At City zoom an offices Tile reads as towers banded with lit floors over glowing feet.
  - Departures and gaps, which the user accepted with the sheets on 2026-11-18: a name plate is lit as a shop's signboard is but leaves no pool on the ground, as a signboard does, because it hangs at a tower's crown, 20 to 70 m up, too far from the ground for its light to fall there; rule 7 says every lit sign leaves a warm pool, and this departs from its wording.
    The coral tower landmark, which the seed stands on offices Tiles as on high-density ones (`src/render/landmarks.ts`), kept its tiers of flat coral and cream 12 m tall, a gap against rule 1 that [#189](https://github.com/artsaraiva/clearway/issues/189) closed: see Block fill in `../spec.md`.
  - Beyond the menu of #177, each kept by the user with the sheets on 2026-11-18: the groves, on lots no tower fits and no scene takes and on the odd lot;
    the pergola over a truck court's tables, with its hung lamps and their pools;
    the string lights over those tables at Stage 3;
    the sunken court's pool and low lights at Stage 3, with their pools;
    the sculpture plaza's uplights at Stage 3, with their pools;
    the clock's pool;
    the taxi stand's lit sign, with its pool;
    the lit edge of the canopy over the door;
    and the landing and the step up to the door.

## Colours

- **Office towers' glass, paling toward `#e9f4fb` up each tower ([#130](https://github.com/artsaraiva/clearway/issues/130))**: `#8fadc0` `#7b9db0` `#8cb5ae` `#5f778c` `#a6bfcb` `#c2b498`
- **Office towers' frames, fins and crowns**: `#f2f4f6` `#dde3e8` `#e6cfa6` `#c4ccd4` `#68727f`
- **Office details ([#154](https://github.com/artsaraiva/clearway/issues/154))**: cooling units and vents in the plant boxes' `#cfd5dc`, the units' fans `#5b6570`;
  a helipad's pad `#68727f`, ring `#f0c75e` and H `#f4f1ea`;
  gondolas `#f0c75e` with a rail by the wall `#9aa3ad`, ropes `#4a525c`, and cleaners in mint `#64cb9f` with white hard hats `#ffffff` and faces `#f4ead2`, the arms they hang from `#cfd5dc`;
  flagpoles `#e9eef2` under a finial `#f0c75e`, their flags in the shops' colours `#2fb39a` `#f0b43c` `#5cc0d6` `#a58ad8` `#79c86a` `#ff9ab8` and white `#fbf8f2`.
  Beacons are the high-density towers' lights, white `#fff3e2` or amber `#ffb24a` (37° of hue from the hot red-orange), never red
- **Offices built to the Finish ([#177](https://github.com/artsaraiva/clearway/issues/177))**: curtain walls in the towers' own glass of [#130](https://github.com/artsaraiva/clearway/issues/130), 6% of the way to the sky's `#e9f4fb` at the foot and 12% more a third of the height, each pane 7% lighter or darker or as it is, a floor line and mullions `#fbf8f2` over a spandrel at 67% of the glass's shade;
  lit floors 0.45 to 0.85 of the windows' glow, dimmed for a darker glass with the square of its green beside the kit's glass `#9cc7df`, to no less than 35%;
  roof decks `#dfe3e7` in pavers;
  cooling units `#a9cdb9` with fans `#5b6570`, vents `#efe6d2`, ducts `#f0c75e`, railings and dishes' stubs `#9aa3ad`, dishes `#f4f6f8`;
  penthouses, domes and caps in the tower's trim;
  name plates `#2fb39a` `#f0b43c` `#79c86a` `#a58ad8` `#fbf8f2` `#2f3440`, lit at 0.33 of a lamp, their marks `#fbf8f2` lit at 1.6 on a dark or coloured board, `#2f3440` on a pale one;
  revolving doors in the lobby's glass lit at 1.4, framed `#4a525c`;
  canopies in the trim, their soffit and edge the bulb's cream lit at 1 and 1.4;
  plaza paving `#e3ddd2` `#dde0de` `#e6dccc`, one a Block, a grove's `#ddd6c9`;
  scenes' stone, rims `#d9d3c7`, steps `#e8e2d6`, floors `#d6cec1` and plinths `#bdb4a6`, beds of soil `#8a7560`;
  sculptures `#f0b43c` `#2fb39a` `#c4ccd4` `#a58ad8` `#fbf8f2`;
  clocks `#4a525c` with faces `#fbf8f2` lit at 0.8 and hands `#2f3440`;
  fountains and a court's pool the water's;
  low lights and uplights the bulb's cream lit at 1.4;
  taxi bays `#bcc1c8` lined `#fbf8f2`, their sign `#fbf8f2` lit at 0.8 under a band `#f6d36a` lit at 0.33, marks `#2f3440`, on a pole `#9aa3ad`;
  taxis yellow `#ffc52d` twice as often as mint `#64cb9f`, glass `#41566c`, lamps `#f4efe0` and `#a84a52`, a roof lamp the bulb's cream lit at 1.2;
  food trucks `#64cb9f` `#ff9cbb` `#ffffff` `#bc9ef2`, never the taxis' yellow, a hatch `#5a4a3c` over a counter `#ffe2b0` under an awning `#fbf8f2`;
  café tables the shops', without their parasols, under a pergola of steel `#9aa3ad` and timber slats `#c49a6c`, its hung lamps and string lights `#fff1c7` lit at 1.5.
  Pools: before a lobby `#ffc98a` at 0.95 of a lamp's strength, under a canopy `#ffd49a` at 1.1; a clock's, a taxi sign's, a court's low lights', a sculpture's uplights' and a pergola's hung lamps' the cream lanterns' `#ffd49a`; string lights `#ffc46e`.
  Checked in OKLCH: within 30° of hue of the Tool blue or the Jam red-orange, nothing goes over 22% of its chroma (the towers' glass and the cars' dark glass, as before) but the taxis' tail lamp, #176's, at 55%

## Frame time

Office details ([#154](https://github.com/artsaraiva/clearway/issues/154)), every Tile of the 26-Tile City offices at Stage 3, cost 0.37 ms (8.33 against `main`'s 7.96 over five rounds, with #155's and #156's details in), for six more draw calls and 0.19 M more triangles, with 50 gondolas, 303 flags and 506 beacons.
A first cut cost 105 more draw calls: a cloth material for the flags and a material for the beacons each brought a mesh, and its shadow, to every office Tile.
The flags now fly as one instanced mesh for the whole City, and the beacons are the high-density towers' instanced bulbs.

Offices built to the Finish ([#177](https://github.com/artsaraiva/clearway/issues/177)), every Tile of the 26-Tile City offices at Stage 3 with 1,000 cars, against `origin/main` (`dc464ac`, with [#176](https://github.com/artsaraiva/clearway/issues/176) in) over five interleaved rounds, after the review's fixes, the branch at `a74f21d`: at City zoom with the Block-zoom props hidden 8.36 ms against 8.34 at noon (+0.02) and 8.63 against 8.34 at night (+0.29), for three more draw calls, the food trucks' instanced mesh and its shadow, and 0.29 to 0.33 M more triangles;
at Tile zoom on one Tile 6.23 against 6.15 at noon (+0.09) and 6.46 against 5.98 at night (+0.49), for up to three more draw calls and 0.31 to 0.33 M more triangles: within the 12 ms budget.
That bench ran on a day `main` read about 12% slower than on the first, before the review (7.43 ms at City zoom at noon), which read +0.39 and +0.40 ms at City zoom and +0.23 and +0.32 at Tile zoom, for 0.36 to 0.41 M more triangles.
The curtain walls cost no triangles, and save some: a tier is one box wearing the pattern in place of a box of glass a floor, and a framed tower loses its mullions.
The triangles are the roof kit (railings, dishes, ducts, name plates), the canopies and revolving doors, the scenes and the plazas' pieces, counted twice with the shadow pass.
A first cut painted the courts' pools and the fountains in the kit's water, which no offices build drew before, and so brought a mesh and its shadow to every build: 49 more draw calls at City zoom and 1.07 ms at noon (8.91 against 7.84 on a bench that day); the water is now painted on the soft-lit material.

## Amended by [#177](https://github.com/artsaraiva/clearway/issues/177) (2026-11-18)

Offices are built to the ten rules of Finish of [#173](https://github.com/artsaraiva/clearway/issues/173), held to the shops reference of [#175](https://github.com/artsaraiva/clearway/issues/175), whose sheets the user approved on 2026-11-18.
A tower's curtain wall is surface pattern on the shared material, round a round tower too: a line at every floor over a darker spandrel and two panes to a bay in three tones paling toward the top, so that a tower reads as storeys of glass, and at night its floors lit in bands, some dark, through the pattern's lit mask.
Its flat roof wears square pavers and carries its plant in colours of its own, sage cooling units, cream vents and a yellow duct, with railings and satellite dishes; a penthouse wears panels and high windows, and a dome or a pointed cap panels.
A tall tower, and at Stage 3 a high one, wears a name plate on its crown on all four sides, lit at night.
A revolving door opens on the face toward the Road under a canopy whose edge lights, and the lobby's glow leaves a pool before each face.
Every tower stands on a chequered plaza, with a bench either side, planters by them and from Stage 2 a sculpture, a clock or a fountain before its lobby;
every Block has a taxi bay at the kerb, with a taxi from Stage 2 and a second at Stage 3, and from Stage 2 a scene, a sunken court, a sculpture plaza or a food truck's court whose truck turns in late in the morning and leaves after midday, and a second at Stage 3 on a Block of 2,500 m² or more, on ground reserved before any tower is laid.
No tower is its neighbour's form, and a lot no tower fits, left bare before, takes the scene or is left a grove.
Other Zones' fills are unchanged (Rendering recipe, Palette, Block fill, Day cycle, Budget and Verification, below).

## Amended by [#154](https://github.com/artsaraiva/clearway/issues/154) (2026-11-17)

Office Tiles carry details of their own, picked by the user from a sheet of Stages 1 to 3: a window cleaners' gondola that creeps down one tower's face and climbs back, vents, cooling units and a helipad on the flat roofs, white and amber beacons blinking on spires and roofs at night, and three flags by a lobby, flapping in the wind.
Moving details can now work a wall's face, hang from ropes and work whole laps a day.
Flags fly on the wind that leans the chimneys' smoke and are taken in at dusk (Block fill, below).
