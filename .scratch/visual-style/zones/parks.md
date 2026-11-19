# Parks

Part of the [visual-style spec](../spec.md), which keeps this Zone's one-line description (Block fill) and everything the Zones share.

## What it builds

### Stages 1 to 3

- Parks: half the trees, as saplings, and a pond with no deck; then every tree and the deck; then the trees grown on, a pavilion (posts `#a1714c`, a slate roof `#4d6575`) over the water at the deck's end, and an island with a pine.
  A plaza's fountain is a basin alone, then with its column, then with a second basin and a ball on the column, and its trees stand in round stone planters at Stage 3.

## Frame time

### Benched with the Kerbside of [#176](https://github.com/artsaraiva/clearway/issues/176)

Parks is over the 12 ms budget at City zoom: on the first bench, 13.11 ms at noon and 13.20 at night with this ticket, 12.85 and 12.92 on `origin/main` before it, and 12.22 at noon on `253bec3`, the last commit before [#174](https://github.com/artsaraiva/clearway/issues/174) (against this ticket's 13.14 over two rounds); on the second, with the machine faster, it read 10.52 and 10.63.
This ticket adds about a quarter of a millisecond to it.
The cost is the trees, which the open [#143](https://github.com/artsaraiva/clearway/issues/143) (draw trees instanced) takes on, before [#180](https://github.com/artsaraiva/clearway/issues/180) brings parks built to the Finish.
