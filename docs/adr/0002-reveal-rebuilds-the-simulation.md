# A Reveal rebuilds the simulation instead of extending it

On a Reveal the simulation is rebuilt from scratch. It builds a new network from every Revealed Junction, carries the player's configuration over by stable lane ids, applies the new Level's Demand and seed, then runs the hidden Pre-warm. No vehicle survives a Reveal. Migrating live vehicles onto a grown network is fiddly: cars headed for a Gateway that just became a Road would need re-routing, and queued spawns would need new destinations. It would also be invisible, because the Pre-warm already hides the first 90 s of every Level.

## Consequences

Level tuning assumes every Level starts from an empty network plus Pre-warm. Switching to migration later means re-tuning every Level.
