# Shops

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Shops: every shop one storey, its shop window narrower, its signboard unlit; then as above, its signboard and awning lit at night, and on a Road on some a tall sign and a billboard; then a storey higher, a pale cornice over the ground floor, both signs on every shop facing a Road and the row's arcade over its pavement, and a terrace on some roofs.
  Their details are below.

### Details

- **Shop details** ([#153](https://github.com/artsaraiva/clearway/issues/153), `src/render/zones/shops.ts`) stand before each shop front that faces a Road, drawn from where the shop stands, so nothing else on its Block changes.
  A shop rolls once for each detail against the detail's share of the fronts from Stages 1, 2 and 3, so it keeps its details as it grows, and Stage 1 is nearly bare.
  What stands on the pavement keeps 0.55 m in from the Block's edge and 1.4 m from a lamp's post or a street tree:
  - The medium-density vending machine ([#156](https://github.com/artsaraiva/clearway/issues/156)) backs onto the front at one end, its front lit at dusk with the lamps: on 15% of the fronts from Stage 1, 35% from Stage 2 and half at Stage 3, and half of those have a second beside it at Stage 3.
  - A row of two to four of the medium-density bicycles ([#156](https://github.com/artsaraiva/clearway/issues/156)) stands at the other end, 0.7 m apart, nosed in to the front and slanted 23° off square: on 30% of the fronts from Stage 2 and half at Stage 3, when two more join each row.
  - Up to three nobori banners stand at the pavement's edge, 1.8 m out from the front, along what the vending machines and the bicycles leave: a cloth 0.72 m wide and 2.4 m tall in one of the shops' colours, with a pale band of lettering down it, hung to the right of a 3.7 m pole from a rod across its top.
    Two stand from Stage 2 on 35% of the fronts, and a third joins them at Stage 3, on 55%.
    They fly as flags do, turned to the street by their rods, and are furled for the night (Moving details, below).
  - Two paper lanterns a metre tall hang on short cords under the awning, 1.3 m out and low enough to show below its edge, cream or amber, lit at dusk with the lamps: on 35% of the fronts from Stage 2 and 60% at Stage 3, when two more hang between them.
- **Shop finish** ([#174](https://github.com/artsaraiva/clearway/issues/174), `shop` in `src/render/zones/shops.ts`, `src/render/pattern.ts`): a Zone's look says whether it is built to the level of finish, and shops alone are, so far.
  Every shop wears surface pattern at every Stage, and which of its windows light is drawn from where it stands, so nothing else on its Block changes:
  - Its ground floor's back and ends: panels 0.75 m wide over a plinth, a line under the eaves, and a high window 0.9 m wide in every bay of about 3 m, framed, sliding and silled; at the back, a service door in the middle bay instead, with a lit pane and a hood.
    Its front stays as it was: the shop window, the awning and the signs.
  - Each upper storey, on all four sides: siding boards, a floor line at its foot, and a window 1.3 m wide and 1.4 m tall 0.9 m up in every bay, in place of the front's windows that were shapes.
    A Stage 1 shop has no upper storey; its ground floor and roof wear their pattern.
  - Its flat roof: tile rows 0.5 m deep in a bond, inside a pale parapet 0.45 m wide that throws a shadow 0.25 m in; inside it the roof is greyer and darker than its walls.
  - Its Block's pavement: slabs 0.6 m square in a running bond, each a shade of its own, with darker joints.
  - Pools of light at night: round each lamp on a shops Block, as far as the pavement goes round its post, 4.8 to 8 m across; under each paper lantern, 3 m across; and on the pavement before each vending machine's lit front and each shop's lit window, out to the kerb.
- **Shops to the level of finish** ([#175](https://github.com/artsaraiva/clearway/issues/175), `shop` in `src/render/zones/shops.ts`, `src/render/props.ts`), the reference: each lot's plan is drawn from a stream of its Block's own, so the kit's draws, and with them every lot's size and storeys, are as before.
  Shown in the sheets of `npm run shots -- shops --times noon,night --run 20`, which the user approved on 2026-11-17:
  - Each shop's front colour is never its neighbour's, nor is its form: a flat roof, a false front raised over the street carrying its signboard, or upper storeys set back 1.6 m behind a balcony (a stair house on the roof of one of a single storey).
    One shop in eight is a noodle shop whose vent steams from Stage 2.
  - Its front, on a Road or on the seam with the next Tile alike: a glass door 1.5 m wide at the end away from the vending machines, lit at night, in a frame under a noren of three panels with a crest;
    a shop window over the rest of the front, framed, silled and mullioned, with goods on its sill, Close-only;
    a signboard over the striped awning with two to four marks for lettering;
    on a Road, a tall sign standing out from the wall at the window's end (on some from Stage 2, on all at Stage 3) and a billboard on two posts behind the roof's front edge (likewise).
    At Stage 3 a front on a Road lies under the row's arcade, 1.45 m deep, short of the banners, on steel posts, its fascia the signboard; the lots of a row meet, so the arcade runs along the whole row.
  - Its roof: a stone parapet 0.26 m wide and 0.42 m tall round the lid, as geometry, since the pattern's rim did not read with the City framed (#174);
    one to three AC condensers along the back, by Stage;
    a panel tank on a stand on 55% of the roofs at Stage 2 and 80% at Stage 3;
    at Stage 3 a timber terrace on 45% of them, with two tables, a parasol and string lights on four posts that leave a pool of light.
    Its back, Close-only: two gas cylinders, a pipe up the wall and along it, crates from Stage 2 and an AC unit at Stage 3; the pattern draws the service door.
  - Before the fronts: coloured paving from Stage 2, bricks in a basket weave 1.7 m deep, one colour a Block;
    pot plants either side of every door and a menu board where no vending machine stands, Close-only;
    on 60% of the fronts with room before the window, crates of produce or a plant stand from Stage 2, Close-only;
    the bicycles of #153 are Close-only and park beside the vending machines, as many as fit before the door.
  - A scene on each Block from Stage 2, on a lot facing a Road at least 8 m wide (or the widest there is), its kind picked from where the Block lies: a greengrocer's stand of three timber steps heaped with produce along the window, crates spilling to the kerb at Stage 3;
    a florist's, buckets of flowers on the steps and tall pot plants at Stage 3;
    two tiers of capsule machines whose tops light and leave a pool;
    or a food stall's court, the lot left open and paved, with a bench and a tree from Stage 1 and from Stage 2 a timber cart on wheels under a roof and a noren, a pot on the counter whose steam rises, an amber lantern, stools and planters, and at Stage 3 a table under a parasol.
    A Block of 2,500 m² or more has a second scene of another kind at Stage 3, not beside the first.
  - Shoppers walk each run of two or more fronts on a Road from Stage 2, a second on a run of three or more at Stage 3 setting out half its loop ahead: 2.1 m out from the fronts, stopping 1.5 to 5 s at each front's middle and turning at the run's ends, on the movers' machinery (#149), so they rest at a stop by night.
  - A delivery kei truck (#149's) parks in the back yard alongside the nearest back wall from Stage 2, and a second at Stage 3, where there is room; the yard keeps up to four trees.
  - Night: windows lit on every face (#174's lit mask), every signboard, tall sign and billboard lit from Stage 2, the awnings glowing from Stage 2 and the arcade's roof at Stage 3, so that with the City framed a shops Tile reads as rows of light along its streets, coloured at Stage 2 and warm white at Stage 3.
    A front leaves a pool out to the kerb, brighter once its signboard lights and under an arcade; a lamp's pool stays on the pavement, its faint rim at most past the kerb.

## Colours

- **Shops**: ground floors, awnings and signs `#2fb39a` `#f0b43c` `#ff9ab8` `#79c86a` `#a58ad8` `#e8925e` `#5cc0d6`, storeys above `#fff7e8` `#ffe9d2` `#fde2e4` `#e3f4dc` `#fff1c7` `#e6f0fb`, the awnings' other stripe `#fbf8f2`
- **Shop details ([#153](https://github.com/artsaraiva/clearway/issues/153))**: the medium-density vending machines and bicycles ([#156](https://github.com/artsaraiva/clearway/issues/156));
  nobori banners in the shops' colours `#2fb39a` `#f0b43c` `#ff9ab8` `#79c86a` `#a58ad8` `#e8925e` `#5cc0d6` with a band of lettering `#fbf8f2`, on poles `#c4ccd4`;
  paper lanterns in the street lamps' cream `#fff4dc` or an amber `#f6b04a` (39° of hue from the red-orange), with caps and cords `#4a525c`, each glowing in its own colour at dusk: the cream at twice a lamp's strength, so it burns whiter than the lit shop window behind it, and the amber at a third, so it keeps its colour
- **Shop finish ([#174](https://github.com/artsaraiva/clearway/issues/174))**: the pattern shades a wall's or a roof's own paint, darker in joints, seams, a plinth and the shadows under sills and in a door, and paler on a roof's parapet, inside which the roof takes 15% grey and 90% of its paint;
  window frames, sills and a door's hood `#fbf8f2`;
  the pattern's glass by day `#b4d6e3` `#9cc7df` `#7aa9c9`, or `#56738a` for a window left dark, lit as the windows are.
  Pools of light under lamps `#ffbe6a`, cream lanterns `#ffd49a`, amber lanterns `#f6a848`, vending machines `#ffe2b0` and lit shop windows `#ffb870`
- **Shops reference ([#175](https://github.com/artsaraiva/clearway/issues/175))**: door frames `#4a525c` `#a1714c` `#fbf8f2`;
  noren `#3f4a5e` `#fbf8f2` `#8a5a3c` `#55705f` `#6c5a8a`, their crests `#fbf8f2` or `#2f3440`;
  window trim and sills `#fbf8f2`, goods `#f6d36a` `#ffadc8` `#fbf8f2` `#79c86a`, `#e8925e` `#f0b43c` `#fbe3a2` `#c49a6c`, `#5cc0d6` `#a58ad8` `#ff9ab8`, or `#2fb39a` `#79c86a` `#f6d36a`, one set a shop;
  signboards, billboards and arcade fascias `#2fb39a` `#f0b43c` `#ff9ab8` `#79c86a` `#a58ad8` `#e8925e` `#5cc0d6` `#fbf8f2` `#2f3440` `#fff1c7`, marked `#fbf8f2`, lit, on a dark board and `#2f3440` on a pale one;
  tall signs in the shops' colours;
  parapets and stair houses `#efe6d8`;
  AC condensers `#f2f3ef` with grilles `#8e979f`;
  panel tanks `#dde6ec` on stands `#9aa3ad`;
  billboard and arcade posts `#9aa3ad`;
  arcade roofs `#f4f1ea`;
  setback balconies `#e6e2da`;
  terraces' decks `#c49a6c`, tables `#fbf8f2` on legs `#2f3440`, parasols in the shops' colours, string lights `#fff1c7`;
  gas cylinders `#b6c3cc`, pipes `#c4ccd4`, crates `#f0c75e` `#79c86a` `#e9eef2` `#5cc0d6` `#ff9ab8`;
  coloured paving `#efd3ad` `#ecd0c6` `#dde3c6` `#e5d6ec`, one a Block;
  menu boards `#2f3440` framed `#a1714c`, chalk `#fbf8f2`.
  Scenes: stands' timber `#c49a6c`, produce `#9fd36b` `#f0a43c` `#f6d36a` `#7a5aa8` `#f4f1ea` `#db6982` `#79c86a` `#e8925e` in crates `#d8b98b`;
  flowers `#ffadc8` `#f6d36a` `#fff7e8` `#c7b8f0` `#ff9ab8` `#f0b43c` `#ffffff` in buckets `#e9eef2`;
  capsule machines `#ff9ab8` `#5cc0d6` `#f0b43c` `#79c86a` `#a58ad8` `#f4f6f8` under lit tops `#f4f6f8`, trimmed `#4a525c`;
  a food stall's cart `#a1714c`, counter `#d8b98b`, roof `#55705f` `#3f4a5e` or `#8a5a3c`, noren `#f4ead2`, stools `#e8925e`.
  Shoppers' coats in the cars' colours, legs `#3a4252`, hair `#3a3330`, bags `#f4ead2`.
  Glows, as a share of a lamp's: signboards and billboards 0.33, their pale marks 1.6, awnings 0.3 from Stage 2, the arcade's roof 0.48 and the strip under it 1.2, string lights 1.5, capsule tops 0.5.
  Pools: a front's `#ffb870` at Stage 1, `#ffc27a` once its signboard lights, `#ffcf8f` under an arcade; string lights `#ffc46e`; a street light `#ffd08f`; a food stall `#f8b25a`

## Frame time

Shop details ([#153](https://github.com/artsaraiva/clearway/issues/153)), every Tile of the 26-Tile City shops at Stage 3, cost 0.48 ms (8.26 against `main`'s 7.78 over five rounds, with [#154](https://github.com/artsaraiva/clearway/issues/154)'s, [#155](https://github.com/artsaraiva/clearway/issues/155)'s and [#156](https://github.com/artsaraiva/clearway/issues/156)'s details in), for three more draw calls, two of them the banners', and 0.36 M more triangles, counting the shadow pass.
A first cut, with a vending machine, bicycles and a cloth material of its own, cost 0.52 M more triangles; the banners now fly as [#154](https://github.com/artsaraiva/clearway/issues/154)'s flags, and the vending machines and bicycles are [#156](https://github.com/artsaraiva/clearway/issues/156)'s.

Surface pattern and light pools ([#174](https://github.com/artsaraiva/clearway/issues/174)), every Tile of the 26-Tile City shops at Stage 3, cost 0.30 ms at noon (7.03 against `main`'s 6.73 over five rounds; a second bench, with other work on the machine and `main`'s own rounds spread from 6.75 to 7.11, read 0.40) for no more draw calls and 0.07 M fewer triangles: the pattern's windows take the place of the upper storeys' front windows that were shapes.
Benched apart over five rounds, at noon and at night, the pattern alone costs 0.30 and 0.35 ms (7.05 and 7.09 against 6.75 and 6.74), the same by day as by night, and the pools, 1,897 decals, nothing the bench can see at noon, when they are hidden, and 0.03 ms at night for one more draw call; with both turned off the branch benches as `main` does.
The pattern's cost is in carrying it, about 4 M vertices in 26 meshes with a `pattern` attribute each, and not in sampling its texture, which costs nothing the bench can see.
A first cut passed the pattern in a flat varying, which ANGLE on Metal turns into a rework of every draw for GL's provoking vertex: 0.5 ms.

Shops to the level of finish, with the streets round them ([#175](https://github.com/artsaraiva/clearway/issues/175)), every Tile of the 26-Tile City shops at Stage 3, cost 1.33 ms at Framed with the Close-only props hidden (9.58 against `main`'s 8.26 over five rounds; 9.44 against 8.26 at night) for three more draw calls and 0.9 M more triangles, and 1.47 ms at Street on one Tile (7.54 against 6.07; 7.53 against 6.11 at night) for 36 to 39 more draw calls, among them each build's Close-only mesh, and 1 M more triangles: within the 12 ms budget.
That bench followed the review's fixes, on a day `main` read 20% slower than at the first (6.76 ms at Framed); against the branch before them, the fixes cost nothing the bench can see (−0.03 to +0.19 ms), and the marks every Road's plate now carries add 0.01 M triangles.
The triangles are mostly the fronts', roofs' and arcades' boxes, counted twice with the shadow pass.
The City holds 79 shoppers at Stage 3, about 60 of them walking at any moment, and 436 puffs of steam; a first cut, steaming from one shop in five every 0.35 s, kept 1,145 in the air.

## Amended by [#175](https://github.com/artsaraiva/clearway/issues/175) (2026-11-17)

Shops are built to all ten rules of the level of finish of [#173](https://github.com/artsaraiva/clearway/issues/173), with the streets round them, as the reference every later Zone is held to: the user approved its sheets on 2026-11-17 (noon [Framed](https://raw.githubusercontent.com/artsaraiva/clearway/eab2fb4dfec4cbf86f1d6fb9407a82fd1c677685/.scratch/visual-style/pr-175/reference-noon-framed.jpg), [Street](https://raw.githubusercontent.com/artsaraiva/clearway/eab2fb4dfec4cbf86f1d6fb9407a82fd1c677685/.scratch/visual-style/pr-175/reference-noon-street.jpg), [Close](https://raw.githubusercontent.com/artsaraiva/clearway/eab2fb4dfec4cbf86f1d6fb9407a82fd1c677685/.scratch/visual-style/pr-175/reference-noon-close.jpg); night [Framed](https://raw.githubusercontent.com/artsaraiva/clearway/eab2fb4dfec4cbf86f1d6fb9407a82fd1c677685/.scratch/visual-style/pr-175/reference-night-framed.jpg), [Street](https://raw.githubusercontent.com/artsaraiva/clearway/eab2fb4dfec4cbf86f1d6fb9407a82fd1c677685/.scratch/visual-style/pr-175/reference-night-street.jpg), [Close](https://raw.githubusercontent.com/artsaraiva/clearway/eab2fb4dfec4cbf86f1d6fb9407a82fd1c677685/.scratch/visual-style/pr-175/reference-night-close.jpg)).
Every front is a shop of its own: a glass door under a noren, a window showing goods, a signboard over the awning and, on a Road, a tall sign and a billboard, lit from Stage 2.
Roofs carry a stone parapet, AC condensers, a panel water tank, a stair house on some, and at Stage 3 a terrace with a parasol and string lights; a Stage 3 front on a Road lies under the row's arcade.
Each Block holds a scene from Stage 2 (a greengrocer's or a florist's stand, capsule machines, or a food stall with its lantern and steam), noodle shops' vents steam, and shoppers walk the fronts, stopping at each.
At night the awnings, then the arcades, glow along the rows.
The streets round a finished Tile gain a kerbstone line, tactile strips at the zebras, guard rails and mirrors at the corners, tree pits, drain grates, planters, bollards and benches, manholes and tarmac patches on the plate, and a street light on every third pole.
Small props are Close-only, drawn apart and hidden beyond Street.
Shot sheets show every distance from four quarter-turns, at noon, dusk and night (Rendering recipe, Palette, Block fill, Budget and Verification, below).

## Amended by [#174](https://github.com/artsaraiva/clearway/issues/174) (2026-11-17)

Shops are built to the level of finish of [#173](https://github.com/artsaraiva/clearway/issues/173) as far as its first step goes, a prototype that asks whether surface pattern holds up with the whole City framed and what it and light pools cost.
The scenery's soft-lit material lays a pattern drawn on canvas over its vertex colours, at no cost in triangles or meshes: panels, high windows and a service door on a shop's ground floor, siding and a window in every bay of its upper storeys on all four sides, tile rows inside a parapet on its roof, and paving joints on its Block.
The pattern's windows light at night, its lit mask.
Lamps, paper lanterns, vending machines and lit shop windows leave warm pools of light on the ground at night, one instanced decal mesh for the City.
With the City framed, the windows read, as specks by day and lit all round by night, and the parapets give each roof an outline that parts it from the next; the tile rows and the paving do not read from there (Rendering recipe, Block fill and Budget, below).

## Amended by [#153](https://github.com/artsaraiva/clearway/issues/153) (2026-11-17)

Shops carry details of their own, picked by the user from a sheet of Stages 1 to 3: vending machines, nobori banners, paper lanterns and parked bicycles before the fronts that face a Road.
The vending machines and the bicycles are the medium-density ones ([#156](https://github.com/artsaraiva/clearway/issues/156)), and the banners fly as the offices' flags do ([#154](https://github.com/artsaraiva/clearway/issues/154)), turned to the street by the rod they hang from.
A lamp's bulb can now take a tint and glow in its colour, as the amber lanterns do (Block fill, below).
