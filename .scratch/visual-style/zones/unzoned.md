# Unzoned Tiles

Part of the [visual-style spec](../spec.md), which keeps its one-line description (Block fill) and everything the Zones share.
An unzoned Tile is not a Zone and has no Stage: its Blocks are a verge, the same whatever the game's Stage would be.

## What it builds

### Built to the Finish

- **Unzoned Tiles built to the Finish** ([#185](https://github.com/artsaraiva/clearway/issues/185), `src/render/zones/unzoned.ts`, `src/render/pattern.ts`), the whole of its menu, which takes over [#158](https://github.com/artsaraiva/clearway/issues/158).
  The bushes draw from the kit's stream as on `main` and stand where they stood; every other piece draws from a stream of its own, seeded from where its Block lies, keeps off what was laid before it and off a landmark's ground, and what stands claims its ground, so the kerbside keeps off it.
  - Ground: rough grass in two tones, surface pattern on the shared material and no triangles: pale where it is short and deeper in ragged clumps 1.5 to 5 m across where it grows long, each 25 cm a shade of its own, repeating every 16 m.
    The verge wears it on every unzoned Tile, though an unzoned Tile has no look to ask for the Finish.
  - A puddle on a little over half the Blocks (0.55), 5.6 m or more in from the edge: three rounds of water run together, 2.5 to 4.5 m across in all, each on a rim of mud. Flat colour that mirrors the sky; it is not the kit's water, which would bring a mesh to every Tile.
  - Rocks in clusters, one to about every 600 m² of Block and at least one: a boulder 1.3 to 2 m long and 0.6 to 1 m out of the grass, with one or two stones beside it. Drawn at every zoom.
  - A stump on six Blocks in ten, a Block-zoom prop: bark 0.7 to 0.9 m across and 0.3 to 0.5 m tall, its cut face and the rings at its heart.
  - Tufts of tall grass, green's of [#182](https://github.com/artsaraiva/clearway/issues/182) now shared from `src/render/props.ts`, Block-zoom props: one every 4.5 to 7 m along each straight side of the Block, 3.1 m in from its edge, so that no pavement beside the grass stands empty (rule 3); and in clumps of two to four on the open grass, one to about every 400 m².
  - Wildflowers, green's star of [#152](https://github.com/artsaraiva/clearway/issues/152) shared the same way: drifts of 16 through the grass, 3.5 to every 1,000 m² of Block, each mostly of one colour, round what stands and off the water. Drawn at every zoom.
  - Nothing moves and nothing is lit: an unzoned Tile's night is the kerbside's lamps alone.

On the 26-Tile City, all unzoned (seed 3): 73 Blocks, and 1.58 M triangles of static scenery against `main`'s 1.25 M, in the same 104 meshes.

### Departures, gaps and what is beyond the menu

For the user to accept or drop with the images:

- Departures and gaps: the rocks, the stones beside them and the wildflowers are drawn at every zoom, not as Block-zoom props, so that an unzoned Tile reads as more than flat grass at Tile and City zoom, as a meadow's wildflowers do; the bushes now claim their ground (2.2 m square), so a planter or a bench of the kerbside that stood within it on `main` stands elsewhere; the triangle ceiling for an unzoned City rises from 1.4 M to 1.85 M, about a tenth over the 1.7 M it builds on seed 2, the heaviest; most of what is added is tufts of tall grass (120 triangles each), which are Block-zoom props and not drawn at City zoom. A puddle and a stump are on some Blocks, not on every one, so a Tile may have neither. The scene check now reads an unzoned Block as built to the Finish, so its small props must be Block-zoom props.
- Required by the rules rather than the menu: the tufts along the Block's edge, which keep the pavement from standing empty (rule 3); unzoned's known row for that rule is gone from `scripts/visual/scene/known.ts`.
- Beyond the menu: the puddle's rim of mud; the stones beside each boulder; the stump's rings.
- Moved, not changed: the tufts, the wildflower's star and the rocks' greys are now in `src/render/props.ts`, shared with green and parks, whose meshes are as on `main`.

## Colours

- **Unzoned Tiles built to the Finish ([#185](https://github.com/artsaraiva/clearway/issues/185))**: the grass `#c8e8a6`, as before, within 2% darker and 5% lighter where short and 11 to 19% darker in its clumps; the puddle's water `#b5d5dd` on mud `#b9a57f`; rocks in the pond's greys `#8f8a80`, `#a29d92` and `#7f7b73`; the stump's bark `#8a6446`, its cut face the props' pale timber `#d8b98b` and its rings `#c49a6c`; tufts in green's `#8fbf62`, `#a3c96b` and `#7fb35a` with heads `#d9c98a`; wildflowers white `#ffffff` and yellow `#f6d36a` leading, lilac `#c7b8f0` and pink `#ff9ab8`.

## Frame time

### Built to the Finish ([#185](https://github.com/artsaraiva/clearway/issues/185))

Every Tile of the 26-Tile City unzoned with 1,000 cars, against `origin/main` (`20f0dde`), medians of three interleaved rounds:

| View | Time | `origin/main` | This branch | Change | Draw calls | Triangles |
| --- | --- | ---: | ---: | ---: | --- | --- |
| City zoom, Block-zoom props hidden | noon | 6.99 ms | 7.39 ms | +0.40 ms | 215 → 215 | 2.59 → 2.75 M |
| City zoom, Block-zoom props hidden | night | 7.06 ms | 7.38 ms | +0.32 ms | 295 → 294 | 2.60 → 2.76 M |
| Tile zoom, one Tile | noon | 5.65 ms | 6.14 ms | +0.49 ms | 140 → 142 | 1.80 → 2.22 M |
| Tile zoom, one Tile | night | 5.75 ms | 6.37 ms | +0.62 ms | 149 → 146 | 1.81 → 2.23 M |

Within the 12 ms budget, and still the cheapest City there is.

## Readability

`npm run readability -- unzoned --against origin/main` (2026-11-20): Tool aids, Jam markers and anger marks read as on `main` over the new grass at noon, dusk and night, 26 Jam markers for 26 Jams on both sides.
