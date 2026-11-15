# A Reveal rebuilds the simulation instead of extending it

On a Reveal the simulation is rebuilt from scratch. It builds a new network from every Revealed Junction, carries the player's configuration over by stable lane ids, applies the new Level's Demand and seed, then runs the hidden Pre-warm. No vehicle survives a Reveal. Migrating live vehicles onto a grown network is fiddly: cars headed for a Gateway that just became a Road would need re-routing, and queued spawns would need new destinations. It would also be invisible, because the Pre-warm already hides the first 90 s of every Level.

## Consequences

Level tuning assumes every Level starts from an empty network plus Pre-warm. Switching to migration later means re-tuning every Level.

## Since the tile sandbox (2026-11-15)

The same rebuild now runs whenever the City changes: a Tile placed, a Swap or an Undo ([#83](https://github.com/artsaraiva/clearway/issues/83)). The glossary calls it a Rebuild; Reveal and Level are retired. Demand comes from the City's open ends in place of a Level, and the swapped Tile's Changes are the one part of the configuration not carried over.
