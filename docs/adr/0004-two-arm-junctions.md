# A Straight and a Curve are two-Arm Junctions

In the tile sandbox every Tile is exactly one Junction, and a Priority junction may have two Arms. A Straight is a two-Arm Priority junction with its Arms opposite; a Curve is one with its Arms at a right angle. Roads stay straight and run from one Tile's centre to the next, or to the cell edge at an open end.

The alternative was a Road that bends, with Straight and Curve Tiles holding only Road. That needs curved lane geometry in the sim, the renderer and the Block cutter, and it makes Tiles of two kinds: some with a Junction and Tools, some without. The prototype ([#82](https://github.com/artsaraiva/clearway/issues/82)) needed one condition changed in `buildPriority` to allow two Arms, and the user played the result and accepted it ([#83](https://github.com/artsaraiva/clearway/issues/83)).

## Consequences

- The City maps to the network one to one: a Tile is a Junction, a shared road edge is a Road. Junction and Road ids come from cells, so Changes carry over a Rebuild (ADR 0002).
- Both Tools work on a Straight and a Curve. Their Connections let a car change lane there, which Roads do not allow.
- A two-Arm Junction has a Priority rule that rarely matters, and a vehicle still slows to turn through a Curve. The prototype saw late Curves jam themselves; tuning has to watch for it.
- A long straight street is a chain of Junctions, not one Road. Routing and the per-car sim do more work per metre than on one long Road.
