# Trips run between Tiles, and a Tile grows by its Needs

Every trip ran Gateway to Gateway, at a rate that rose with the number of Tiles, and a Tile grew by the cars that passed through its Junction while it was clear. The simulation read neither a Tile's Zone nor its Stage. So the Zone the player picked changed nothing but the picture, and a zoned Tile off the path between two Gateways saw no cars and never grew. [ADR 0005](0005-a-diorama-city-builder.md) named the cure and left it to [#95](https://github.com/artsaraiva/dioramania/issues/95), which was grilled on 2026-11-20 and decided this:

- **Trips start and end at Tiles.** Each Zone has up to three Needs, and a trip goes out to meet one: a home's car to work, to the shops, to a park; a plant's truck to a shop. A car belongs to its home Tile, or a truck to its shop or plant. It drives out, stays a while and drives back.
- **A nearer partner is preferred**, by drive time, with some spread. A Need with no partner inside the City is met through a Gateway, as a long trip. Gateways are the rest of the world: they absorb whatever the City cannot match inside, and each keeps a small fixed base of through traffic that no longer grows with the number of Tiles.
- **A Tile grows by its Needs.** Each Need fills its own count of arrivals, and the Tile reaches its next Stage when every count is full. A higher Stage sends and draws more trips. The rule that a Jam freezes its Tile's progress goes: a Jam slows growth only because trips arrive late.
- **Trips lean with the time of day.** The simulation owns the clock, and the clock decides which Need a car goes out for: work in the morning, shops and parks in the afternoon, home at dusk. Trips a minute stay about level through the day.
- **An arriving car parks on a free Stand**, or turns off the Road into a drive and goes out of sight.
- **A Rezoning and a new Stage change trips at once.** Cars on the Road finish the trip they are on.
- **Yen comes from the buildings.** A zoned Tile pays an amount per minute for its Stage, and a trip pays nothing.

The Needs of each Zone:

| Zone | Needs |
|---|---|
| Residential, at every density | Work, shopping, leisure |
| Shops | Customers, deliveries |
| Offices | Workers |
| Industrial | Workers, an outlet for goods |
| Farms | An outlet for produce |
| Parks, green | Visitors |

## Considered options

- **Life only.** Cars visibly go home and to the shop, with totals tuned so the mix of Zones never matters. Rejected: the Zone would still be decoration to the simulation, which ADR 0005 rejected.
- **A planning puzzle**, where a bad mix of Zones jams the City. Rejected: it pulls the game back toward a traffic game. The mix matters here only through the length of trips: a mixed neighbourhood grows fast, and a City of one Zone still grows, more slowly, with busy Gateways.
- **A plain count of a Tile's own trips that arrive**, as #95 inherited from [#128](https://github.com/artsaraiva/dioramania/issues/128). Rejected: any trip would be as good as any other, so the mix would not matter. The pattern in Cities: Skylines and Anno 1800 is that a building grows when its own needs are met (`.scratch/city-builder/research-building-levels.md`).
- **One-way trips**, where a car appears at one Tile and is gone at the other. Rejected: a car that comes home is someone's day, which the Living City spec ([#270](https://github.com/artsaraiva/dioramania/issues/270)) asks for.
- **Rush hours**, with trips a minute rising and falling through the day. Rejected: a Jam would come on a timer, whatever the player built.

## Consequences

- The simulation reads the Zone and the Stage of every Tile, and a route can end on a Road of a Tile, not only at a Gateway.
- A car remembers its home, and cars that are away are saved with the City.
- Each Zone needs a drive where arriving cars go out of sight ([#274](https://github.com/artsaraiva/dioramania/issues/274)).
- The Stage Inspector shows a Tile's Needs and how full each is, so the player sees what to build next.
- Every Need is met by car for now. A Walker's arrival may count for a Need between neighbouring Tiles once Walkers walk between Tiles ([#294](https://github.com/artsaraiva/dioramania/issues/294)).
- ADR 0005 kept Income per arriving trip until Stages had been played. This replaces it. The rest of the economy (the Price curve, what yen buys, the floor) has its own Grill.
- The numbers are not decided here: the trips a Zone sends at each Stage, how long a car stays away, and the arrivals that fill a count. A prototype finds them. Its target is a mixed 12-Tile City that carries about the traffic it does today, whose first Tiles reach Stage 2 in about the time they do now.
- `GLOSSARY.md` and the test seams in `CLAUDE.md` change when the prototype passes, not before.
