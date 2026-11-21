# Trips run between Tiles, and a Tile grows by demand

Every trip ran Gateway to Gateway, at a rate that rose with the number of Tiles, and a Tile grew by the cars that passed through its Junction while it was clear. The simulation read neither a Tile's Zone nor its Stage. So the Zone the player picked changed nothing but the picture, and a zoned Tile off the path between two Gateways saw no cars and never grew. [ADR 0005](0005-a-diorama-city-builder.md) named the cure and left it to [#95](https://github.com/artsaraiva/dioramania/issues/95), which was grilled on 2026-11-20. Its decision was prototyped twice in [#303](https://github.com/artsaraiva/dioramania/issues/303) on 2026-11-21, and the second prototype changed how a Tile grows. This is the decision as it stands:

- **Trips start and end at Tiles.** Each Zone has up to three Needs, and a trip goes out to meet one: a home's car to work, to the shops, to a park; a plant's truck to a shop. A car belongs to its home Tile, or a truck to its shop or plant. It drives out, stays a while and drives back.
- **A nearer partner is preferred**, by drive time, with some spread. A Need with no partner inside the City is met through a Gateway, as a long trip. Gateways are the rest of the world: they absorb whatever the City cannot match inside, so a shop, an office or a park with too few of the City's own cars coming draws the rest in through a Gateway, and each keeps a small fixed base of through traffic that no longer grows with the number of Tiles.
- **Demand drives growth.** The City has three demands, each a level for the whole City: for homes, for shops and for work. Demand for homes rises when the City's jobs outnumber the households to fill them; demand for shops when its households outnumber the room in its shops; demand for work when its households outnumber its jobs. Offices, industrial and farms grow with the demand for work. A demand never falls to nothing, since the world beyond the Gateways always wants a little of everything.
- **A Tile grows by its trips, at the pace of its demand.** Every trip that arrives at a Tile, or that the Tile's own vehicle completes, counts toward its next Stage for as much as the demand for its Zone stands at. A higher Stage holds more households, jobs or shop places, so it sends and draws more trips and shifts the demands for every other Tile. The rule that a Jam freezes its Tile's progress goes: a Jam slows growth only because trips arrive late.
- **Trips lean with the time of day.** The simulation owns the clock, and the clock decides which Need a car goes out for: work in the morning, shops and parks in the afternoon, home at dusk. Trips a minute stay about level through the day.
- **An arriving car parks on a free Stand**, or turns off the Road into a drive and goes out of sight.
- **A Rezoning and a new Stage change trips at once.** Cars on the Road finish the trip they are on.
- **Yen comes from the buildings.** A zoned Tile pays an amount per minute for its Stage, and a trip pays nothing.

The Needs of each Zone, which say where its trips go and who comes to it. They no longer say how it grows:

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
- **A planning puzzle**, where a bad mix of Zones jams the City. Rejected: it pulls the game back toward a traffic game. Here a bad mix never jams or stops the City: the demand for the Zone it has too much of rests at its floor, so a City of one Zone still grows, at its slowest, with busy Gateways, and the other demands say what to build next.
- **A count of arrivals for each Need**, filled one by one, with the Tile reaching its next Stage when every count is full. This was the Grill's decision and the first prototype. Rejected once played: a home showed three counts and a shop two, which read as statistics about the City and not as what drives its growth, and the last count to fill held a Tile back for reasons the player could not see.
- **A plain count of a Tile's own trips that arrive**, as #95 inherited from [#128](https://github.com/artsaraiva/dioramania/issues/128), with nothing setting its pace. Rejected: any trip would be as good as any other, so the mix would not matter. Demand is what makes it matter: the count is plain, and the mix of Zones sets how much each trip is worth. Cities: Skylines drives the growth of its zones by three demands the same way.
- **One-way trips**, where a car appears at one Tile and is gone at the other. Rejected: a car that comes home is someone's day, which the Living City spec ([#270](https://github.com/artsaraiva/dioramania/issues/270)) asks for.
- **Rush hours**, with trips a minute rising and falling through the day. Rejected: a Jam would come on a timer, whatever the player built.

## Consequences

- The simulation reads the Zone and the Stage of every Tile, and a route can end on a Road of a Tile, not only at a Gateway.
- A car remembers its home, and cars that are away are saved with the City.
- Each Zone needs a drive where arriving cars go out of sight ([#274](https://github.com/artsaraiva/dioramania/issues/274)).
- The screen shows the three demands as little bars, always in view, which open a detailed view on a click: each demand's level and why it stands there. That is how the player sees what to build next.
- A Tile's note opens on a click, not on hover, and adds the demand that drives the Tile, where its households are (at home, driving, at work, at the shops, at a park) and who is visiting it.
- `GLOSSARY.md` has a **Demand** already, the trips a minute between Gateways, and a **Demand view** that draws it. Both need new words or new meanings when the glossary changes, since the demands here are a different thing.
- Every Need is met by car for now. A Walker's arrival may count for a Need between neighbouring Tiles once Walkers walk between Tiles ([#294](https://github.com/artsaraiva/dioramania/issues/294)).
- ADR 0005 kept Income per arriving trip until Stages had been played. This replaces it. The rest of the economy (the Price curve, what yen buys, the floor) has its own Grill.
- The numbers the prototype found are in [#303](https://github.com/artsaraiva/dioramania/issues/303): the vehicles a Tile owns at each Stage, how long a car stays away, the trips that take each Zone to its next Stage, and what a household wants of jobs and shops. On them a mixed 12-Tile City puts about as many cars on the road as today's would if it flowed, and its first Tiles reach Stage 2 in about the time they do now.
- Most trips no longer touch a Gateway, so a Gateway is far quieter than today, and short trips between neighbours spread the load: the mixed City that is in gridlock today hardly has a Jam. How much the Tools still have to fix is not decided here.
- Not decided: whether parks and green get a demand of their own (in the prototype a visitor counts at a fixed pace), and whether shops and offices share one demand, as commercial does in Cities: Skylines.
- `GLOSSARY.md` and the test seams in `CLAUDE.md` change with the spec, not before.
