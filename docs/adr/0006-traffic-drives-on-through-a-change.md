# Traffic drives on through every change to the City

When the City changes (a Tile lands, a Swap lands, a Tile is taken off) the network is built again from the City, and the vehicles are carried onto it: a vehicle whose Lane still exists drives on from where it is, and one whose Lane is gone is removed. A vehicle bound for a Gateway that closed draws a new destination, evenly among the Gateways it can reach from where it is. Arrivals waiting off-screen at a closed Gateway are dropped. A Junction that exists before and after keeps its Jam reading and its Changes. Demand is worked out again, and no Pre-warm runs: the Pre-warm is only for a run that opens or loads.

This replaces [ADR 0002](0002-reveal-rebuilds-the-simulation.md), which threw every vehicle away and hid the restart behind a Pre-warm. That was invisible when it happened once per Level. In the sandbox it happened on every drop, and the player saw traffic halt each time they built. ADR 0002 called carrying vehicles over fiddly; since ADR 0004, Road and Lane ids come from cells and stay the same whether a Road ends at a Gateway or a Tile, so a vehicle is found again by its Lane.

The alternative considered was to keep ADR 0002 and let the old traffic run on until the new simulation was pre-warmed, then switch. It was smaller, but every vehicle changed position at the switch, and the Tools had to be locked meanwhile.

## Consequences

- A change takes effect when the Tile has landed, not at the drop: the City's traffic runs as before through the Tile's Assembly. Several Tiles can assemble at once, and they land in the order dropped.
- The Tools stay usable during an Assembly, since there is one simulation throughout.
- A new Tile starts empty and fills with traffic in view of the player.
- What a seed gives now depends on when each change landed, not only on the City. A run that loads starts from the City and a Pre-warm, so its traffic is not the traffic that was saved.
