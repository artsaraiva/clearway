# Parks

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Parks: half the trees, as saplings, and a pond with no deck; then every tree and the deck; then the trees grown on, a pavilion (posts `#a1714c`, a slate roof `#4d6575`) over the water at the deck's end, and an island with a pine.
  A plaza's fountain is a basin alone, then with its column, then with a second basin and a ball on the column, and its trees stand in round stone planters at Stage 3.

### Built to the Finish

- **Parks built to the Finish** ([#180](https://github.com/artsaraiva/clearway/issues/180), `src/render/zones/parks.ts`, `src/render/pattern.ts`, `src/render/movers.ts`), the whole of its menu, which takes over [#151](https://github.com/artsaraiva/clearway/issues/151).
  What it adds is drawn from streams of its own (the pond's, the park's and the plaza's, each seeded from where it lies), so the kit's draws are as on `main` as far as the trees: the pond, the deck and the pavilion are where they were, and the trees are tried at the same spots, but a tree that would stand on something new is left out, as a tree off the lawn always was, and every tree after the first left out draws differently from `main`'s.
  An authored park or plaza (`src/render/fill.ts`), which is not built to the Finish, builds as before.
  - Ground: the lawn mown in stripes 2 m wide in two tones, and the plaza paved in rings 0.6 m apart round its fountain, stones about 0.75 m long, each a shade of its own; both surface pattern on the shared material, no triangles.
  - Paths: two, three or four gravel paths a park by its size (under 1,600 m², under 3,500 m², more), from its corners to the pond's rim, winding in one or two arcs where they keep to the lawn and straight where only that does, and a straight one from each scene's front to the nearest path or the pond; gravel on the pattern, a stone edge either side standing 5 cm proud. 78 on the 26-Tile City.
  - A border of azaleas, 0.8 m thick, 2.7 m in from the edge along every Road, open where a path comes in and round each lamp, pole and street tree: 0.45, 0.6 and 0.7 m tall at Stages 1 to 3, in bloom at Stage 3. It keeps a park's pavement from standing empty (rule 3).
  - The pond: low stones round its rim at every Stage; from Stage 2 four clumps of reeds round its edge, two drifts of lily pads with pale flowers, its island with a young pine (the island was Stage 3's), to the north or the south of the pond's middle as the pond lies, and stepping stones out to it; at Stage 3 the pine grown, a wooden bridge arching from the island to the shore on another side, and the pavilion's roof in tile rows with a lantern hung in it that lights its floor at night. Every pond of the 26-Tile City has its stones and its bridge.
    The pond lies a little lower in its brick so that it is ground, which the deck, the bridge and the scenes may stand on the edge of.
  - The scenes, from three, picked from where the Block lies: one from Stage 2, and a second of another kind at Stage 3 on a Block of 2,500 m² or more, each reserved before the paths and trees, on the lawn inside the border, nearest the pond, facing it or, where only that fits, turned along the strip beside a small park's pond (4.8 m deep on a Block of 1,155 m²).
    A shrine: medium-density's wayside shrine of [#178](https://github.com/artsaraiva/clearway/issues/178), now shared from `src/render/props.ts` and laid on the lawn: setts, a stone torii, stepping stones to a timber shrine under a copper roof with its straw rope and paper, a stone lantern either side and an old tree; at Stage 3 an offering box and a low stone fence.
    A tea house: plaster walls between wooden posts on a stone footing, shoji on all four sides that glow at night and leave their light round it, a veranda along its front and a hipped roof in tiles, and a stone lantern by it; at Stage 3 a parasol beside it.
    A bandstand: an eight-sided stone platform with steps, cream posts and rails round it, open at the steps, under an eight-sided roof in tile rows with a finial, and a lantern hung in its middle that lights the floor; at Stage 3 four more lanterns round its eaves.
    On the 26-Tile City: 37 bandstands (5 of them on plazas), 33 shrines and 22 tea houses for 41 parks, every one with its scene from Stage 2 and each of 2,500 m² or more its second at Stage 3.
  - Stone lanterns, #178's, each leaving its pool: from Stage 2 one beside each path where it meets the pond and where it comes in, at Stage 3 one midway along it. Benches, Block-zoom: one beside each path's middle from Stage 1, from Stage 2 two on the lawn round the pond facing the water, and at Stage 3 one more along each path.
  - Trees drawn coarse, as low- and medium-density's are, 2.8 m or more apart and 2.3 m from a path's middle; leaves fallen under the round ones from Stage 2, and from one sakura in two petals drifting down from its crown.
  - What moves, from Stage 2: a swan boat gliding round the open water (a second at Stage 3 on a large pond), two ducks paddling and resting, three koi as dark shadows under the surface (four at Stage 3), and by night four fireflies over the pond's edge (six at Stage 3), each round a little loop of its own. 51 swan boats, 82 ducks, 164 koi and 246 fireflies at Stage 3.
    Fireflies are the first mover that works by night: they drift round their loops by the run's clock whatever the hour, come out as the lamps come on and glow as brightly, and are unseen by day.
  - A plaza: its fountain throws up spray through the working day, from its basin, its column or its ball by the Stage; from Stage 2 a scene on one of the four ways out from the fountain, a clock tower (its four faces lit at night, under a cap in tile rows, taller at Stage 3) or a bandstand, beds in bloom on two of the others with a stone lantern at each end, and a kiosk toward a corner under a hipped roof in tile rows, its window lit at night; benches round the fountain facing it, two at Stage 1, four at Stage 2 and six at Stage 3, and at Stage 3 two stone lanterns among them, so that a plaza is lit more at Stage 3 whatever its scene; low planters along its Roads every 9 m or so at every Stage, in bloom from Stage 2; and three pigeons pecking round the fountain and flying from one spot to the next.
  - Night: the stone lanterns' pools along the paths and round the pond, parks' night signature, with the pavilion and the bandstands lit, the tea houses' shoji, the kiosks' windows, the clocks' faces, and fireflies over the water.

### Departures, gaps and what is beyond the menu

For the user to accept or drop with the images:

- Departures and gaps: the park trees are coarse (as low- and medium-density's, under half the triangles) and fewer, since scenes, paths, lanterns and benches take ground and no two trees stand closer than 2.8 m (on `main` some trunks overlapped); the island and its pine come at Stage 2, not Stage 3; drifting petals fall from parks' sakura alone, not from every Zone's as #151 asked, so that no other Zone changes in this ticket; petals and spray are the plumes' round puffs, pink and white; the second swan boat comes only on a large pond (more than 1.1 of the pond's size); the mesh ceiling for parks rises from 130 to 160, for the lanterns' bulbs and the Block-zoom benches, a material each new to its builds.
- Required by the rules rather than the menu: the azalea border along the Roads and the plaza's planters (rule 3); the shrine's, tea house's and plaza beds' stone lanterns, and the hung lanterns' pools (rule 7); the pond lowered in its brick to be ground, so that what stands on its edge keeps clear (rule 4's check); the bandstand as a park scene and the clock tower as a plaza's, each larger than a car (rule 5).
- Beyond the menu: the shrine's tree, offering box and stone fence (#178's), the tea house's parasol and the bandstand's eaves lanterns at Stage 3; the plaza's stone lanterns at its beds and among its benches; the lily pads' flowers; the reeds' brown heads.

## Colours

- **Parks built to the Finish ([#180](https://github.com/artsaraiva/clearway/issues/180))**: the lawn `#b0df88` in stripes 3–9% lighter and 5–11% darker; the plaza's `#ece3d1` in rings of stones 8% either side and dark joints; gravel `#ddd2b9` with an edge of the props' darker stone `#bdb4a6`; the border's leaves `#4f8f45` and bloom `#f2b6c9`;
  the pond's rocks `#8f8a80`, `#a29d92` and `#7f7b73`, reeds `#7f9a4e` and `#8fa65a` with heads `#b39a62`, lily pads `#5f9f52` and their flowers `#fbe4ec`, stepping stones `#c9c2b5`, the bridge's planks `#b98a5a` and rails `#9c7048` (wood, never vermilion);
  fallen leaves `#9cc95a`, `#c3c65a` and `#d3b05c` (the kit's `tree`, as a sakura's petals), drifting petals `#ffc4d6`, spray `#f3f8f8`;
  the tea house's, bandstand's, clock tower's and kiosks' roofs verdigris `#6f8f80` in tile rows, the pavilion's slate `#4d6575` in tile rows, the tea house's plaster `#efe6d3`, posts `#8a6446` and shoji `#fff4dc` (lit at 0.33 of the lamps' glow), the bandstand's and clock tower's cream `#f1ead9` on a footing of the props' darker stone `#bdb4a6`, the clock's hands `#3a4252`, the shrine in #178's colours, the beds' blooms the borders' `#ffadc8`, `#f6d36a`, `#fff7e8` and `#c7b8f0`;
  the swan boat white with a beak `#f0b24e` and a seat `#e8dcc0`, ducks `#b9b2a4` with a breast `#7a5c46`, a head `#2f6447` and a beak `#e3bd4a`, koi shadows `#33434a`, `#3f4f55` and `#56656b`, pigeons `#9a9ea6` with a head `#6f7480` and wings `#b8bcc2`, and fireflies `#3d4436` by day lit `#d9f27a` at 1.6 times the lamps' glow.

## Frame time

### Built to the Finish ([#180](https://github.com/artsaraiva/clearway/issues/180))

Every Tile of the 26-Tile City parks at Stage 3 with 1,000 cars, against `origin/main` (`6694426`), medians of three interleaved rounds:

| View | Time | `origin/main` | This branch | Change | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | --- | --- |
| City zoom, Block-zoom props hidden | noon | 10.64 ms | 10.11 ms | −0.54 ms | 259 → 292 | 7.46 → 4.92 M |
| City zoom, Block-zoom props hidden | night | 11.50 ms | 9.69 ms | −1.81 ms | 339 → 374 | 7.46 → 5.09 M |
| Tile zoom, one Tile | noon | 7.06 ms | 7.05 ms | −0.00 ms | 169 → 183 | 4.91 → 3.30 M |
| Tile zoom, one Tile | night | 7.22 ms | 6.86 ms | −0.36 ms | 179 → 195 | 4.92 → 3.47 M |

Within the 12 ms budget, which parks broke before: the coarse trees more than pay for everything added, and the static scenery is 2.39 M triangles at Stage 3 against 3.67 M on `main` (the scene check's ceiling is now 2.6 M).
`main`'s noon at City zoom read 11.47 ms on a bench before the review's fixes, against 10.64 here: the noon gain is within that noise, the night's is not.
The new draw calls are the lanterns' bulbs and the Block-zoom benches, a mesh each a Tile, and the movers' meshes.


### Benched with the Kerbside of [#176](https://github.com/artsaraiva/clearway/issues/176)

Parks is over the 12 ms budget at City zoom: on the first bench, 13.11 ms at noon and 13.20 at night with this ticket, 12.85 and 12.92 on `origin/main` before it, and 12.22 at noon on `253bec3`, the last commit before [#174](https://github.com/artsaraiva/clearway/issues/174) (against this ticket's 13.14 over two rounds); on the second, with the machine faster, it read 10.52 and 10.63.
This ticket adds about a quarter of a millisecond to it.
The cost is the trees, which the open [#143](https://github.com/artsaraiva/clearway/issues/143) (draw trees instanced) takes on, before [#180](https://github.com/artsaraiva/clearway/issues/180) brings parks built to the Finish.
