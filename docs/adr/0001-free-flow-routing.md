# Drivers route by free-flow travel time and never reroute around Jams

Each vehicle takes the shortest path by free-flow travel time (lane length ÷ speed limit) over the lane graph. It plans when it spawns and re-plans on every player Change, never in response to congestion. Congestion-aware route choice is more realistic, but it lets traffic dodge a Jam by itself, oscillate between routes, and hide the cause of a Jam from the player. In a puzzle the player must be the only thing that moves traffic, so a Jam persists until the player fixes it.

## Consequences

Puzzles built on drivers avoiding a jammed route (Braess-style) are impossible until this is revisited. Spawn lane choice still adds a queue-length cost, which gives natural lane discipline without making routes congestion-aware.
