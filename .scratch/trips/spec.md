# Trips between Tiles, and growth by demand

**Type:** task

This is the spec for the whole effort. It is meant to be split into tickets before anyone builds from it. The decision is `docs/adr/0008-trips-between-tiles-and-growth-by-demand.md`. It was grilled in [#95](https://github.com/artsaraiva/dioramania/issues/95) and prototyped three times in [#303](https://github.com/artsaraiva/dioramania/issues/303), whose comments hold the reports, the measurements and the user's verdicts.

The prototype is on branch `303-trips-prototype`, behind the dev parameter `?trips`, in files named `*.proto.ts`. It is throwaway: build from this spec and read the prototype for how a thing was done, not as code to keep.

Vocabulary in root `GLOSSARY.md`; the terms this spec adds or changes are under "Glossary changes".

## Problem Statement

The player picks a Zone for every Tile, and the simulation ignores it. Every trip runs Gateway to Gateway, at a rate that rises with the number of Tiles. So:

- A home, a shop and a park send and draw the same traffic: none of their own. The choice of Zone changes the picture and nothing else.
- A zoned Tile off the path between two Gateways sees no car and never reaches Stage 2.
- Cars pass through. None belongs anywhere, goes anywhere or comes home.
- A 12-Tile City left alone is in gridlock, and a Jam freezes its Tile's growth outright. The game says it is a diorama city builder and still plays as a traffic game.
- Nothing on the screen tells the player what the City wants next.

## Solution

Every vehicle belongs somewhere, and the City says what it wants.

- **Trips between Tiles.** A home Tile owns cars, and a plant or a farm owns trucks. Each drives out to work, to the shops, to a park or with a delivery, stays a while and drives home. What the City cannot offer inside, the car finds beyond a Gateway.
- **Three demands.** The City wants homes, shops and work, each as a level the player can always see as a little bar. A bar above its middle says "build this".
- **Growth by trips, at the pace of demand.** A Tile grows by the trips that reach it and the trips its own vehicles complete. Each trip counts for as much as the demand for the Tile's Zone stands at. A Jam only slows this, because trips arrive late.
- **A Tile's note on a click.** It shows what drives the Tile, where its households are and who is visiting.
- **Yen from the buildings.** A zoned Tile pays by the minute for its Stage.

## User Stories

Trips

1. As a player, I want a home's car to drive out and later come home, so that a car is someone's day.
2. As a player, I want a home's car to go to work, to the shops and to a park, so that homes use the rest of the City.
3. As a player, I want a plant and a farm to send a truck to the shops, so that shops are supplied by what I built.
4. As a player, I want a car to prefer a nearer Tile, so that building a shop beside homes shortens their trips.
5. As a player, I want cars not to all pick the same nearest Tile, so that one shop does not take every customer.
6. As a player, I want a car with nowhere to go in the City to leave by a Gateway and come back by one, so that a City of one Zone still lives.
7. As a player, I want a shop, an office or a park with too few of the City's cars to draw the rest in through a Gateway, so that no Tile stands empty.
8. As a player, I want a car to stay a while where it went, so that an arrival is a visit and not a touch.
9. As a player, I want each Gateway to keep a little through traffic, so that a City of unzoned Roads still has cars.
10. As a player, I want through traffic not to grow with the number of Tiles, so that the City's traffic is its own.
11. As a player, I want a Tile at a higher Stage to own more vehicles, so that growth is seen on the Road.
12. As a player, I want a denser home Tile to own more cars, so that density is busier.
13. As a player, I want a home's car to lean to work in the morning and to the shops and parks later, so that the day has a shape.
14. As a player, I want about as many trips a minute at every time of day, so that no Jam comes on a timer.
15. As a player, I want the picture's light to follow the same clock as the trips, so that morning looks like morning.
16. As a player, I want a seed to give the same day every run, so that a City I share plays the same.
17. As a player, I want a car that turns off the Road to slow and leave its lane, so that arriving looks driven.
18. As a player, I want a truck drawn as a truck, so that deliveries read at a glance.

Change

19. As a player, I want a new Tile's cars to appear as it lands, so that building is answered at once.
20. As a player, I want a Rezoning to change a Tile's trips at once, so that I see what the new Zone does.
21. As a player, I want a car on the Road to finish its trip when I rezone its home, so that nothing vanishes in view.
22. As a player, I want a new Stage to add its vehicles at once, so that growth is immediate.
23. As a player, I want traffic to drive on through a placement, a Swap and an Undo, so that building never halts the City.
24. As a player, I want a car whose destination is gone to go home, so that nobody is stranded.

Demand

25. As a player, I want three small bars always in view, for homes, shops and work, so that I know what the City wants.
26. As a player, I want each bar in its own colour with no text beside it, so that they stay out of the way.
27. As a player, I want a bar to rest in its middle when the City has what it wants, so that a balanced City does not look dead.
28. As a player, I want a bar above its middle when the City is short, so that it reads as "build this".
29. As a player, I want a bar low only when there is a glut, so that I see what I have too much of.
30. As a player, I want a bar never to reach nothing, so that a City of one Zone still grows.
31. As a player, I want a click on the bars to open the detail, and a second click to close it, so that the reasons are one click away.
32. As a player, I want the detail to say why each demand stands where it does, in a sentence with the City's own numbers, so that I can act on it.
33. As a player, I want the detail to name what the City most wants, so that the next Tile is an easy choice.
34. As a player, I want the bars to move when a Tile reaches a new Stage, so that growth takes turns.
35. As a player, I want offices, industrial and farms to share the demand for work, so that I pick among them for the look.
36. As a player, I want parks and green to grow by their visitors with no bar of their own, so that a park is a choice of taste.

Growth

37. As a player, I want a Tile to grow by the trips that reach it and the trips its vehicles complete, so that a used Tile is a growing Tile.
38. As a player, I want a trip to count for more when the demand for that Zone is high, so that building what the City wants pays off.
39. As a player, I want a Tile off the path between Gateways to grow, so that where I build is free.
40. As a player, I want a Jam only to slow growth, so that nothing is frozen and nothing is taken away.
41. As a player, I want a mixed City's first Tiles to reach Stage 2 in about five minutes, so that the pace I know holds.
42. As a player, I want a City of one Zone to grow, more slowly, so that a City built for looks is not punished.
43. As a player, I want a Swap to keep a Tile's Stage and progress and a Rezoning to start it again, so that the rules I know hold.
44. As a player, I want the Stage Inspector to stop marking Tiles a Jam holds back, so that it does not show a rule that is gone.

A Tile's note

45. As a player, I want a click on a Tile to open its note, so that it does not flicker as I move the mouse.
46. As a player, I want the note to keep its Zone, stars and progress, so that nothing I read today is lost.
47. As a player, I want the note to name the demand that drives the Tile and its level, so that I know why it grows fast or slowly.
48. As a player, I want a home's note to say where its households are: at home, driving, at work, at the shops, at a park or outside the City, so that the Tile is people and not a number.
49. As a player, I want a note to say who is visiting: workers, shoppers, visitors, trucks unloading, so that I see who the Tile serves.
50. As a player, I want the note of a park or green Tile to say it grows by its visitors, so that the missing bar is explained.

Yen and saving

51. As a player, I want a zoned Tile to pay by the minute for its Stage, so that the City I grew is what earns.
52. As a player, I want a trip to pay nothing, so that through traffic is not worth farming.
53. As a player, I want a 12-Tile City to earn about what it does today, so that the Price I know is still reachable.
54. As a player, I want a save to bring back each Tile's progress, so that a session is not lost.
55. As a player, I want a save to bring back the cars that were away, so that homes do not all empty onto the Road at once.
56. As a player, I want a save from before this change to load, so that my City survives the update.
57. As a player, I want the Gateway labels to show what a Gateway carries now, so that they do not show a rate that is gone.

## Implementation Decisions

Trips, a module of the simulation

- A new module of the simulation owns every vehicle that belongs to a Tile. It sits beside the arrivals that Gateways send, and reads each zoned Tile's Zone and Stage. This is the first time the simulation reads either.
- Its interface is small: give it the zoned Tiles as they stand; step it; ask it for the demands, for a Tile's growth, for the Tiles ready for their next Stage, and for where a Tile's households and visitors are.
- A Tile owns a fleet by Zone and Stage. From the prototype:

  | Zone | Vehicles at Stage 1 / 2 / 3 |
  |---|---|
  | Low-density residential | 2 / 4 / 6 cars |
  | Medium-density residential | 3 / 6 / 9 cars |
  | High-density residential | 4 / 8 / 12 cars |
  | Industrial | 1 / 2 / 3 trucks |
  | Farms | 1 / 2 / 2 trucks |

  Shops, offices, parks and green own none. One car of a home Tile is a household.
- A Need that waits for arrivals has places by Stage: workers 2 / 4 / 6, customers 2 / 4 / 6, visitors 1 / 2 / 3, deliveries 1 / 1 / 2. Each place the City's own vehicles are not filling is filled by an outsider, a car that comes in by a Gateway, stays and leaves by one.
- Where trips go, from ADR 0008's table: a home's car to offices or industrial for work, to shops for shopping, to parks or green for leisure; a plant's or a farm's truck to shops with a delivery. A shop sends nothing.
- A vehicle's states, from the prototype: at home, leaving, out, staying, returning, back, beyond a Gateway, entering by a Gateway.
- Times, as means in sim-seconds: rest at home 25; stay 45 at work, 15 at the shops, 25 at a park, 12 for a delivery; 50 more beyond a Gateway.
- Choosing a partner: by drive time, each 15 seconds of extra drive making a partner e times less likely. With no partner inside, the nearest Gateway the car can reach.
- A route can end on a Road of a Tile, not only at a Gateway's Exit lanes. A vehicle carries the Tile it belongs to.
- Arriving and leaving: the car slows and leaves its lane at a point on its Tile's Road, and joins a lane again when there is a gap. This stands in until Stands ([#297](https://github.com/artsaraiva/dioramania/issues/297)) and a drive per Zone ([#274](https://github.com/artsaraiva/dioramania/issues/274)) are built; this spec does not draw either.
- Through traffic: each Gateway sends a fixed 1.5 trips a minute, split evenly over the Gateways it reaches. The rate formula that grew with the number of Tiles, and the weights by Road, go.
- Everything is drawn from the City's seed.

The clock

- The simulation owns the time of day. A day is 180 sim-seconds, and the picture's day cycle follows it instead of running a clock of its own.
- The clock sets how much a home's car leans to each Need (work, shopping, leisure): morning 6 / 1 / 1, noon 1 / 4 / 4, dusk 0 / 3 / 4, night 1 / 1 / 1. The first prototype made a car half as keen on a Need whose count was full. That belonged to counts per Need and is not carried over.
- "Home at dusk" is not enforced. Holding workers until dusk would make a rush hour, which ADR 0008 rejects.

Demand

- Three demands for the whole City: homes, shops, work. Each is a level from the floor to 1.
- Worked out from what the Tiles hold, whenever a Tile lands, is taken off, is rezoned or reaches a Stage:
  - Jobs by Stage: offices and industrial 3 / 6 / 9, shops 1 / 2 / 3, farms 1 / 2 / 2.
  - Shop places by Stage: 4 / 8 / 12.
  - A household wants 0.5 of a job and 0.4 of a shop place.
- The level, from the prototype:

  ```ts
  // want and have in the same unit; rest 0.55, floor 0.40
  const lean = want || have ? (want - have) / Math.max(want, have) : 0
  const level = rest + lean * (lean > 0 ? 1 - rest : rest - floor)
  // homes: want = jobs / 0.5,          have = households
  // shops: want = households * 0.4,     have = shop places
  // work:  want = households * 0.5,     have = jobs
  ```

- The rest point is 0.55. The floor is 0.40, by the user's verdict of 2026-11-21. The prototype measured 0.25, where a City of all homes reached Stage 2 at a median of 26.6 minutes against 6.5 for a mixed one; 0.40 was estimated at about 17 minutes and has not been measured. Measuring it is part of the build.
- Homes at every density grow with the demand for homes; shops with the demand for shops; offices, industrial and farms with the demand for work. Parks and green have no demand and grow at a fixed pace of 0.6.

Growth

- One count per Tile. A trip counts when it arrives at the Tile, or when the Tile's own vehicle arrives where it was going. It counts for the level of the Tile's demand at that moment.
- Trips to Stage 2 and then to Stage 3, with demand full, as measured at a rest point of 0.55:

  | Zone | To Stage 2 | To Stage 3 |
  |---|---|---|
  | Low-, medium-, high-density residential | 6, 8, 10 | 25, 38, 50 |
  | Shops | 19 | 60 |
  | Offices | 15 | 50 |
  | Industrial | 11 | 38 |
  | Farms | 4 | 13 |
  | Parks | 10 | 29 |
  | Green | 5 | 14 |

- The count of cars entering a Tile's Junction, its thresholds of 150 and 450, and the rule that a jammed Junction counts nothing all go. The per-Junction Jam reading stays, as a reading.
- A Swap keeps Stage and progress. A Rezoning starts the Tile at Stage 1 with no progress. Nothing is counted during the Pre-warm.

When things change

- A Tile's fleet and places follow its Zone and Stage at once. A vehicle the Tile no longer has room for finishes its trip and is gone the next time it is home or beyond a Gateway. Vehicles on a trip are kept before idle ones.
- Traffic drives on through every change to the City, as ADR 0006 has it. A vehicle whose Lane is gone, or whose destination Tile is gone or rezoned away, is home again.
- The Pre-warm of a run that opens or loads starts every vehicle at home or beyond, at a seeded moment of its rest.

Yen

- A zoned Tile pays an amount per minute for its Stage, and an arriving trip pays nothing. The Income floor and the Price are unchanged.
- The amounts are a stand-in until the economy Grill ([#304](https://github.com/artsaraiva/dioramania/issues/304)): tuned so that a mixed 12-Tile City at the Stages it holds after 15 minutes earns about what today's 12-Tile City does when it flows. Parks and green pay as other Zones do.

The screen

- Three small bars, always in view, one each for homes, shops and work, in their own colours, with no text. Each has a tick at the rest point. They follow the paper and stamp design of the rest of the screen.
- A click on the bars opens the Demand view and a second click closes it. It holds each demand's level, a sentence that says why with the City's own numbers ("16 households want 8 jobs; the City offers 9"), and what the City most wants. Nothing about a single Tile belongs in it.
- A Tile's paper note opens on a click on the Tile, not on hover. It keeps the Zone, the stars and the progress, and adds the demand that drives the Tile and its level, where its households are (at home, driving, at work, at the shops, at a park, outside the City), and who is visiting (workers, shoppers, visitors, trucks unloading).
- A click on a Junction still selects the Junction for the Tools. Where a click on a Tile and a click on its Junction would collide, the Junction wins on its footprint and the Tile's note takes the Blocks.
- The Stage Inspector keeps showing each Tile's Stage and drops the mark for Tiles a Jam holds back.
- A Gateway's label shows the trips a minute it carries, measured, in place of the rate it used to be given.
- The prototype's red panel is not the design and is not built.

Saving

- A save gains, per zoned Tile, its progress, and the vehicles that belong to it with their state and the time it ends; a vehicle on the Road is saved as away and comes home after its Pre-warm. It gains the time of day.
- A save from before this change loads: its Tiles keep their Stage, progress starts at nothing and every vehicle starts at home.

Glossary changes

- **Demand** is redefined: how much the City wants homes, shops or work, each a level for the whole City. The old meaning, trips a minute between Gateways, goes.
- **Demand view** is redefined: the detail that opens from the three bars. The Inspector of [#113](https://github.com/artsaraiva/dioramania/issues/113) that draws trips along routes becomes the **Trip view** and is not part of this spec.
- New: **Need** (what a Zone's vehicles go out for, or who comes to it; it says where trips go, not how a Tile grows), **Household** (one car that belongs to a home Tile), **Through traffic** (trips that run Gateway to Gateway and stop nowhere).
- Reworded: **Stage** and **Jam** lose the freeze. **Income** is paid by zoned Tiles. **Gateway** is also where the City meets the rest of the world. **Stage Inspector** loses the Jam marks. The opening paragraph of the glossary loses "Traffic earns the money, growth causes traffic jams".
- ADR 0008 already records the decision. No new ADR is owed.

## Testing Decisions

A good test asserts an outcome a player could see: a car got home, a Tile reached a Stage, a demand stands above or below its rest, yen was paid. It does not assert a vehicle's state names, the order of internal steps or a tuning number that the next retune would break. Pace is asserted as "sooner than" or within a generous bound, as today's Stage tests do.

No new seam. The three existing seams in `CLAUDE.md` change as follows, and `CLAUDE.md` is edited with the first ticket that needs each.

- **Simulation outcomes** (the simulation):
  - A car that leaves its home Tile arrives at a Tile that meets the Need it went for, and later arrives home.
  - With no partner in the City, it leaves by a Gateway and comes back in by one.
  - A seed gives the same day every run.
  - A car on a trip before a placement or a Rezoning still gets home.
  - Prior art: the tests that a seed gives the same result, and that a vehicle driving before a placement is still driving after it.
- **Stages** (the game):
  - A Tile reaches its next Stage by its trips, and sooner when its demand stands higher.
  - A City short of jobs has its demand for work above the rest point, and one with a glut of homes has its demand for homes at the floor.
  - A zoned Tile off the path between Gateways reaches Stage 2.
  - A Swap keeps the Stage and progress, and Rezoning starts the Tile again at Stage 1 (unchanged).
  - Removed: "one whose Junction is in a Jam does not".
  - Prior art: the test that a plus-shaped City reaches Stage 2 within a bound of earning time.
- **Economy** (the game):
  - A zoned Tile pays its amount per minute for its Stage, and a trip pays nothing.
  - A save loads back each Tile's progress and the cars that are away. A save from before this change loads, with its Stages kept.
  - Prior art: the Income and floor tests, and the save round-trip.

Everything visible is verified by playing: the bars and the Demand view, the Tile's note, cars pulling out and turning off, the day following the clock.

The measuring script of the prototype (mixed 12-Tile City, a City of all homes and a 4-Tile City, 30 sim-minutes, 3 seeds) is rebuilt as a script outside `npm test`, so each retune can be measured the same way. Targets: mixed, Stage 2 first at about 3 to 5 minutes and a median near 7; all homes, slower than mixed and under 20 minutes at the median.

## Out of Scope

- Stands and cars that park: [#297](https://github.com/artsaraiva/dioramania/issues/297). A drive per Zone and what each Zone's vehicles look like: [#274](https://github.com/artsaraiva/dioramania/issues/274).
- Drivers who get out, and their Storylets: [#298](https://github.com/artsaraiva/dioramania/issues/298). A shop's own truck: [#299](https://github.com/artsaraiva/dioramania/issues/299), which ADR 0008 leaves without an owner at the shop.
- A Need met on foot: after [#294](https://github.com/artsaraiva/dioramania/issues/294).
- The economy beyond a stand-in amount: [#304](https://github.com/artsaraiva/dioramania/issues/304).
- The Trip view: [#113](https://github.com/artsaraiva/dioramania/issues/113).
- Gateways as a system of their own: [#92](https://github.com/artsaraiva/dioramania/issues/92).
- A demand for parks and green, and a park speeding up the homes around it.
- What the Tools are for now that a mixed City hardly jams. ADR 0008 leaves it open, and nothing here removes a Tool or a Jam marker.
- Signals: [#295](https://github.com/artsaraiva/dioramania/issues/295).

## Further Notes

- **Jams.** In the prototype the mixed 12-Tile City ran with 0.16 Jams on average, where today's is in gridlock. Jams came back at two to three times the vehicles. This spec keeps the prototype's fleet and does not add cars to bring Jams back.
- **Gateways are quiet.** About 2.5 cars a minute come in by each Gateway, against 7 today. That is intended.
- **Lumpy counts.** A low-density home needs 6 trips to Stage 2, so luck spreads homes over several minutes. The first prototype saw 5 to 13 minutes. Accepted for now.
- **Not checked in the prototype:** how any of it feels at Block zoom, trucks up close, saving, and the floor at 0.40.
- **Undo and Swap** sent the cars they removed straight home with no drive. Acceptable here, since Delete replacing Undo is its own Grill ([#234](https://github.com/artsaraiva/dioramania/issues/234)).
- **The clock's lean could not be seen by eye** in the prototype, only in its panel. If it stays invisible once drives and Stands exist, it is a candidate to drop.

## Issues

The spec is [#308](https://github.com/artsaraiva/dioramania/issues/308). Its tickets, with what blocks each:

- [#309](https://github.com/artsaraiva/dioramania/issues/309) the simulation owns the clock
- [#310](https://github.com/artsaraiva/dioramania/issues/310) a home's car drives to work and home
- [#311](https://github.com/artsaraiva/dioramania/issues/311) every Zone's trips (after #310)
- [#312](https://github.com/artsaraiva/dioramania/issues/312) trips through every change to the City (after #311)
- [#313](https://github.com/artsaraiva/dioramania/issues/313) through traffic at a fixed rate (after #311)
- [#314](https://github.com/artsaraiva/dioramania/issues/314) demand, and growth by trips (after #311)
- [#315](https://github.com/artsaraiva/dioramania/issues/315) the demand bars and the Demand view (after #314)
- [#316](https://github.com/artsaraiva/dioramania/issues/316) a Tile's note on a click (after #314)
- [#317](https://github.com/artsaraiva/dioramania/issues/317) trips lean with the time of day (after #309, #311)
- [#318](https://github.com/artsaraiva/dioramania/issues/318) yen from the buildings (after #314)
- [#319](https://github.com/artsaraiva/dioramania/issues/319) saving trips (after #309, #312, #314)
- [#320](https://github.com/artsaraiva/dioramania/issues/320) measure, retune and the glossary (after #313, #315, #316, #317, #318)
