# Zones at work

**Type:** task

This is the spec for the whole effort. It is meant to be split into tickets before anyone builds from it. It was grilled in [#274](https://github.com/artsaraiva/dioramania/issues/274) on 2026-11-21 and has not been prototyped.

It builds on two specs. Trips between Tiles ([#308](https://github.com/artsaraiva/dioramania/issues/308), `.scratch/trips/spec.md`, ADR 0008) says which vehicles a Tile owns and where they go. The Living City ([#270](https://github.com/artsaraiva/dioramania/issues/270)) gives Walkers Places and gives cars Stands. This spec says what the player sees of both on each Zone.

Vocabulary in root `GLOSSARY.md`; the terms this spec adds or changes are under "Glossary changes".

## Problem Statement

#308 makes every vehicle belong to a Tile, and #270 gives homes, shops and industry Walkers with a door of their own. Neither says what that looks like on a Block.

- A car that arrives "turns off the Road into a drive and goes out of sight", and no Zone has a drive.
- A plant has a truck in its yard and a farm a kei truck in its farmyard. Both are decoration: they never leave, and the truck the simulation sends to the shops comes from nowhere.
- Every car wears a Skin by chance, so nothing on the Road says whose it is.
- Offices, parks, green and the denser homes have nothing a Walker does there that they do nowhere else.
- #299 gives a shop a truck of its own, and #308 says a shop sends nothing.

## Solution

Every Zone takes part in the City in three ways the player can see.

- **A Drive on every Block.** One gap in the kerb where vehicles turn off the Road, dressed by its Zone: a yard gate, a basement ramp, a farm track.
- **Vehicles that are someone's.** A Skin says whose a vehicle is. The truck in the plant's yard is the plant's truck: the yard is empty while it is out, and it is seen driving back in. A house's car stands at its house.
- **Places of its own.** Each Zone has two things its Walkers do there and nowhere else, and they lean with the time of day.

Nothing here adds a trip, a vehicle or a count to the simulation beyond the Drive as a place a route ends.

## User Stories

Drives

1. As a player, I want every Block of a zoned Tile to have a Drive, so that every arriving car has somewhere to turn in.
2. As a player, I want each Zone's Drive to look like that Zone's way in, so that I can tell a yard gate from a basement ramp.
3. As a player, I want a Drive to be there from Stage 1 and never move, so that a Block's plan holds as it grows.
4. As a player, I want a Drive to sit away from the Junction, so that a car turning in does not stop the queue.
5. As a player, I want a car to turn into a Drive from the lane beside it only, so that nobody waits mid-Road to cross the oncoming lanes.
6. As a player, I want a second car to wait at the kerb while the first clears the Drive, so that two never pass through each other.

Vehicles

7. As a player, I want a household's car to keep one Skin and one paint, so that I know it on the Road and at home.
8. As a player, I want a plant's truck drawn as a box truck and a farm's as a kei truck, so that I can tell where a delivery came from.
9. As a player, I want some of the outsiders who come to an office to arrive by taxi, so that offices have their own traffic.
10. As a player, I want an outsider's delivery drawn as a van, so that I can tell it from one my own City sent.
11. As a player, I want the truck in a plant's yard to be the plant's truck, so that the yard is empty while it is out.
12. As a player, I want to see that truck drive out through the gate and later drive back in, so that the plant works for its living.
13. As a player, I want the farm's kei truck to leave with crates on its bed and come back empty, so that produce goes somewhere.
14. As a player, I want a low-density house's car to stand at its house, and be gone while the household is out, so that homes are lived in.
15. As a player, I want the cars of flats and towers to go down the Drive out of sight, so that their Blocks are not car parks.
16. As a player, I want shoppers, park visitors, a delivery and a taxi to park in view, so that a visit is something to watch.
17. As a player, I want a truck to pull up at a shop's bay and its driver to carry stock in, so that shops are supplied.
18. As a player, I want a Walker on a Block to wait for a vehicle crossing it, so that nobody is driven through.

Walkers

19. As a player, I want each Zone to have things its Walkers do there and nowhere else, so that Zones differ at Block zoom.
20. As a player, I want plant workers going in at the door in the morning, the office plaza full at noon and houses' car places filling at dusk, so that the day shows on the Blocks.
21. As a player, I want no burst of cars at any hour, so that no Jam comes on a timer.

Stages

22. As a player, I want a higher Stage to add Stands, a fuller load on the truck and more of the Zone's Places, so that growth is seen in how busy a Block is.

## Implementation Decisions

What the simulation gains, and what it does not

- **No new trips.** Everything on the Road is one of #308's trips: a Tile's own vehicle, an outsider filling a place, or through traffic. Shops, offices, parks and green own no vehicle. There are no buses, bin lorries or other vehicles that #308 does not send.
- **Goods are picture only.** Stock, produce and crates are drawn and never counted. No shop runs out. Counting them would make the supply chain ADR 0008 rejected as a planning puzzle.
- **Every Skin stays one car long.** The plant's truck is a short box truck, 4.3 m like every Skin. A longer vehicle would be a second vehicle type in the simulation.
- **The simulation's vehicle ends at the Drive.** #308's stand-in ("the car slows and leaves its lane at a point on its Tile's Road") becomes: at a Drive. From the Drive to its place on the Block and back, the picture alone moves the vehicle.

The Drive

- Every Block of a zoned Tile has exactly one, from Stage 1, in the same place at every Stage. An unzoned Tile has none, since no trip ends there.
- It sits on the Block's longest Road frontage, as far from the Junction as the Block allows.
- A Block too small for its Zone's mouth gets a plain one: a dropped kerb and a gate. A Block filled by a Landmark gets a plain one too.
- It is entered and left by the lane beside it only. No vehicle turns across oncoming lanes. A vehicle cannot turn back at a Priority junction, so a Drive is reachable from one direction of travel.
- When two vehicles want one Drive, the second waits at the kerb, still in its lane, until the first is clear.
- After a Swap the Blocks are new and so are their Drives. A vehicle that is out comes home to the new one, as #308 sends a vehicle home when its Lane is gone.

Each Zone's Drive, and who is seen parked

| Zone | The Drive's mouth | Seen parked on Stands |
|---|---|---|
| Low-density | a short shared lane between houses | each house's own car |
| Medium-density | a gated passage under the building | none |
| High-density | a basement ramp | none |
| Offices | a basement ramp with a barrier arm | a taxi rank of one or two at the kerb |
| Shops | a service lane to the back | customers on bays out front; the delivery bay |
| Industrial | the yard gate | the plant's own truck in the yard; workers go through to a car park out of sight |
| Farms | the farm track to the barn | the farm's kei truck in the farmyard |
| Parks | the mouth of a small car park behind a hedge | two or three visitors' cars |
| Green | a gravel lay-by under trees | one or two visitors' cars |

The rule behind the table: a visit worth watching parks in view, and a long stay goes out of sight. Homes draw no arrivals in #308, so a house's Drive serves only its own cars. This widens Stands ([#297](https://github.com/artsaraiva/dioramania/issues/297)) from houses, shops and plants to seven Zones.

Skins

| Vehicle | Skin |
|---|---|
| A home's car | hatchback or kei car, one fixed Skin and paint per household |
| A plant's truck | a box truck (new Skin) |
| A farm's truck | kei truck, crates on the bed going out |
| An outsider coming to work or to shop | hatchback or kei car |
| An outsider coming to an office | taxi, for about a third of them |
| An outsider's delivery | van |
| Through traffic | any Skin, as today |

A vehicle with a place of its own

- A low-density house's car, a plant's truck and a farm's truck each have a place in view on one Block. The place is empty while the vehicle is out.
- The plant's truck and the farm's kei truck that the Blocks draw today as decoration become these vehicles. The forklift, tractor, scooter and food truck stay decoration and never leave their Block.
- The route home aims for the Drive of the vehicle's own Block, going round through a neighbouring Tile when the City allows. When it cannot be reached, the vehicle takes another Drive of its Tile and is out of sight until its next trip, so its place stands empty though it is home.
- A vehicle with no place in view (flats, towers, workers, anyone bound for a Drive that hides them) takes the first Drive of the Tile it can reach.

The shop's bay

- A shop owns no truck. [#299](https://github.com/artsaraiva/dioramania/issues/299) becomes "a delivery at the shop's bay": a plant's or a farm's truck, or an outsider's van when the City has neither, stops at the bay, its driver carries stock in ([#298](https://github.com/artsaraiva/dioramania/issues/298)), and it leaves. The bay is empty the rest of the time.

Places of a Zone

Built on Places ([#288](https://github.com/artsaraiva/dioramania/issues/288)), with no system of their own.

| Zone | Its Places |
|---|---|
| Low-density | waters the pots at the door; washes the car on its car place |
| Medium-density | parks a bicycle at the rack; hangs washing on a balcony (needs [#293](https://github.com/artsaraiva/dioramania/issues/293)) |
| High-density | watches a child at the play corner; waits at the lobby door |
| Offices | eats lunch on the plaza; queues at the food truck |
| Shops | none of its own: #288's shop doors, windows and benches are already this Zone's |
| Industrial | loads at the dock beside the truck; takes a break at the yard gate |
| Farms | tends a row in a field; stacks crates at the farmyard |
| Parks | feeds the ducks at the pond's edge; sits on the grass |
| Green | walks the dog run; stops at the flowers |

- A Zone's Places lean with the simulation's clock: the plant's door in the morning, the office plaza at noon, the houses at dusk. This is where the time of day is seen. There is no shift of cars: ADR 0008 rejects rush hours.
- A Walker on a Block waits for a vehicle crossing it. The vehicle never waits for a Walker.

Stages

- The Drive does not change. A higher Stage adds Stands, a fuller load on the truck and more of the Zone's Places. #308 already adds vehicles.

The order

1. **Industrial, in its smallest form:** the yard gate as its Drive, and the plant's box truck standing in the yard, driving out through the gate and back in. No Stands for workers, no Places, no cargo. It needs [#311](https://github.com/artsaraiva/dioramania/issues/311).
2. **Farms:** the same case with the kei truck.
3. **Low-density:** each household's car at its house.
4. **Shops:** customer bays and the delivery bay.
5. **Parks and green:** visitors' cars.
6. **Offices:** the ramp and the taxi rank.
7. **Medium- and high-density:** the passage and the ramp.

Places for every Zone are a separate run of tickets after #288, in the same order.

Glossary changes

- New: **Drive**. Reworded: **Block** ("Traffic leaves the Road only at a Drive"). Both are in `GLOSSARY.md` with this spec.
- **Stand** is #270's term and is added by [#272](https://github.com/artsaraiva/dioramania/issues/272).
- No ADR is owed. ADR 0008 already carries the reasons for no new trips and for goods that are not counted.

## Testing Decisions

Two additions to the agreed seams, and nothing else. `CLAUDE.md` is edited with the first ticket that needs each.

- **Simulation outcomes:** a vehicle bound for a Tile leaves the Road at a Drive of that Tile, and one whose Drive a Swap removed still gets home.
- **Scene check** (`npm run check:scene`): every Block of a zoned Tile has exactly one Drive, at every Stage, in the same place.

Everything else is verified by playing: the mouths, the vehicles standing in view, the truck crossing the yard, Places and Skins.

## Out of Scope

- How many vehicles a Tile owns, where trips go and how a Tile grows: #308.
- How a car parks on a Stand and leaves it: #297. Drivers who get out: #298.
- Walking between Tiles: [#294](https://github.com/artsaraiva/dioramania/issues/294). The seams between Tiles: [#275](https://github.com/artsaraiva/dioramania/issues/275).
- A vehicle longer than a car, a vehicle that turns across oncoming lanes, and any vehicle #308 does not send.
- Stock as a number.

## Further Notes

- **An empty place with its vehicle home.** Accepted as the price of no turn across the Road. If it shows often once built, the cure to look at first is where the Drive sits on its Block, not a new manoeuvre.
- **Small Blocks.** A plain Drive hides the Zone's mouth. How often that happens on each Layout is not measured.
- **Frontage.** Every Zone gives up a strip of each Block's Road frontage from Stage 1. Each Zone's plan has to find it, and that is the main cost per Zone.
- **Rarer taxis and vans.** With Skins by owner, both appear less than today.
