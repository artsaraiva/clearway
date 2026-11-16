# Clearway is a diorama city builder, and traffic is its one deep system

Clearway began as a traffic-management game: the measure of a run was the most trips a minute the City carried while Holding, and Blocks were scenery. After the neighbourhoods prototype ([#127](https://github.com/artsaraiva/clearway/issues/127)) the user chose to refocus it ([#132](https://github.com/artsaraiva/clearway/issues/132)): the player manages a diorama City, growing it is the goal, and traffic is the mechanic that decides how well it grows. A Tile grows through Stages as the roads serve it ([#128](https://github.com/artsaraiva/clearway/issues/128)), and the sum of Stages, the City's Growth, replaces trips a minute as the measure.

## Considered options

- **Stay a traffic game with richer scenery.** Buildings would vary and even grow, but nothing would read them. Rejected: the player now chooses what each Tile is built as ([#130](https://github.com/artsaraiva/clearway/issues/130)), and a choice the game ignores is decoration.
- **A full city builder.** Cities: Skylines grows buildings from land value, education and service coverage. Each is a system to build, tune and explain. Rejected: the traffic sim is the one deep system this project has, and no builder found in the research (`.scratch/city-builder/research-building-levels.md`) grows buildings from traffic alone.
- **Buildings that decline.** Cities: Skylines abandons buildings that are badly served. Rejected for now: a Jam already lowers Income, and a diorama that decays is the wrong mood. A Jam stops growth and takes nothing away.

## Consequences

- A Stage is game state. It is saved with its Tile, covered by tests, and may be read by Demand and Income later. "Blocks are scenery" no longer holds.
- Trips are to start and end at Tiles according to what is built there, where today every trip runs Gateway to Gateway. That is the largest change to the sim ahead, and [#95](https://github.com/artsaraiva/clearway/issues/95) designs it. Until it lands, a Tile's progress stands in with the trips through its Junction.
- Yen, the Price and Income per arriving trip stay as they are. Whether buildings should pay is decided after Stages have been played, so the economy is retuned once.
- Holding is retired with the trips Record. Flow and Jam markers remain the traffic readings.
- Tools and Changes do not change. Their purpose does: the player clears a Jam so a neighbourhood can grow.
- The City still cannot be finished or lost, and nothing built is ever taken away.
