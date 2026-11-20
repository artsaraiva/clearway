# Dioramania

A browser diorama city builder. The player lays road tiles and chooses what is built on them, and each tile grows as traffic serves it. Traffic earns the money, growth causes traffic jams, and the player clears them by changing how junctions work or by building around them. One context: the game and its simulation share this vocabulary.

## Language

### Play

**City**:
Every Tile the player has placed, those in their Assembly too, joined into one road network. It grows on a square grid with no bounds and cannot be finished or lost.
_Avoid_: District, map, world, town, level

**Tile**:
One Layout placed in one cell of the grid, at one rotation, built as one Zone or unzoned. A Tile holds exactly one Junction and the Blocks around it. A Tile cannot be removed or moved.
_Avoid_: Piece, cell, plot, parcel, land

**Layout**:
What a Tile's Roads are and how they meet, which the player picks: Straight, Curve, T-junction, Crossroads or Roundabout. Every Layout is always in the toolbar and can be placed any number of times.
_Avoid_: Tile type, shape, piece, card

**Zone**:
What every Block of a Tile is built as, which the player picks: low-, medium- or high-density residential, offices, shops, industrial, parks, green or farms. A Tile with no Zone is unzoned: roads only, its Blocks left as grass.
_Avoid_: Variation, character, use, kind, District

**Swap**:
Replacing a placed Tile's Layout with another by dropping it on top. A Swap costs the Price and keeps the Tile's Zone, and the swapped Tile's Changes return to defaults.
_Avoid_: Replace, upgrade, rebuild

**Rezoning**:
Giving a placed Tile another Zone, or none. It costs no yen and starts the Tile again at Stage 1.
_Avoid_: Swap, repaint, Rebuild

**Undo**:
Taking back the last placement, Swap or Rezoning for a full refund, allowed only for a short stretch after it.
_Avoid_: Remove, sell, Reset

**Assembly**:
The stretch from a Tile's drop, placed or swapped in, until it has landed and traffic can enter it. The Tile is part of the City meanwhile, but the City's traffic runs as it did before the drop. Tiles land in the order they were dropped. A Tile in its Assembly takes a neighbour on its open end, and refuses a Swap and a Rezoning.
_Avoid_: Build, Rebuild, construction, Reveal

**Pre-warm**:
Simulating the City hidden from the player for a fixed stretch when a run opens or loads, so traffic has settled when it becomes visible. Nothing is earned during it.
_Avoid_: Warm-up

**Price**:
What the next Tile costs, in yen. It is the same for every Layout and Zone and rises with the number of Tiles placed.
_Avoid_: Cost, fee

**Income**:
Yen earned per minute. Every trip that arrives at its Gateway pays the same amount, so Income falls when a Jam keeps trips from arriving. It never falls below a small floor.
_Avoid_: Revenue, profit, score, earnings

**Stage**:
How far a zoned Tile has grown: 1, 2 or 3. A Tile moves toward its next Stage as traffic serves it, and not while its Junction is in a Jam. A Stage makes the Tile's buildings better versions of themselves, never another Zone. A Swap keeps the Stage, and only Rezoning starts it again at 1.
_Avoid_: Level, tier, rank, upgrade

**Growth**:
The sum of the Stages of every Tile in the City. The game's measure of doing well.
_Avoid_: Score, population, size, level

**Record**:
The highest Growth reached in any run.
_Avoid_: Score, high score, Win

**Free run**:
A run in which the Price is ¥0, so every Tile and Swap costs nothing, for relaxed play and playtesting. Everything else plays as normal. Its Record is kept apart from a normal run's.
_Avoid_: Creative mode, cheat mode, free-money mode

**Tool**:
Something the player can change about a Junction: a lane Connection or a Priority rule. Every Tool works on every Junction, free and without limit.
_Avoid_: Action, power-up, upgrade

**Inspector**:
A read-only aid that shows the player what traffic is doing or what it does to the City, such as a car's route or the Tiles a Jam holds back. Inspectors change nothing and are always available.
_Avoid_: Tool, overlay, debug view

**Change**:
One use of a Tool by the player.
_Avoid_: Move, edit, action

**Demand view**:
An Inspector that draws Demand along its routes: the wider a line, the more trips a minute want that stretch of road. It shows how much traffic wants a road, not how well it moves.
_Avoid_: Traffic flow view, flow map, heatmap

**Stage Inspector**:
An Inspector that shows every zoned Tile's Stage on its ground and marks the Tiles a Jam holds back from their next Stage. It shows where the City grows, not how its traffic moves.
_Avoid_: Growth view, Stage map, heatmap

**Reset**:
Returning one Junction to its default configuration.
_Avoid_: Undo, restart

### Network

**Junction**:
A place where Roads meet and vehicles cross, merge or turn: a roundabout or a Priority junction. Every Tile has exactly one.
_Avoid_: Node, intersection

**Priority junction**:
A Junction without a ring, where Arms meet directly and Priority rules decide who goes. A Straight and a Curve have 2 Arms, a T-junction 3, a Crossroads 4.
_Avoid_: Intersection, plain junction

**Ring**:
The circulating Lanes of a roundabout. The Ring belongs to its Junction: it is not a Road and has no Arms.
_Avoid_: Circle, loop, ring road

**Road**:
A straight stretch of Lanes in both directions between the Junctions of two neighbouring Tiles, or between a Junction and an open edge of its Tile. Each end of a Road is an Arm of the Junction there.
_Avoid_: Segment, edge, link, street

**Gateway**:
An open road end of the City: where a Road reaches an edge of its Tile with no Tile beyond. Vehicles enter and leave only through Gateways. A Tile placed there closes the Gateway as it lands.
_Avoid_: Spawn point, entrance, map edge, open end

**Block**:
An area beside Roads filled with buildings, grass or a plaza. Traffic never enters a Block. Its buildings show the Zone and the Stage of its Tile.
_Avoid_: Plot, parcel

**Lot**:
The ground of one building inside a Block.
_Avoid_: Plot, parcel, site

**Arm**:
One Road's end at a Junction, carrying an Approach and an Exit. A Road between two Junctions is an Arm of both.
_Avoid_: Leg, branch, side

**Approach**:
The lanes on an Arm that carry vehicles into a Junction.
_Avoid_: Entry, inbound

**Exit**:
The lanes on an Arm that carry vehicles out of a Junction.
_Avoid_: Outbound, egress

**Lane**:
One directed strip of road that vehicles follow in single file.

**Connection**:
A permitted path inside a Junction from one incoming Lane to one outgoing Lane. The player turns Connections on and off.
_Avoid_: Link, turn, lane arrow

**Priority rule**:
Whether an Arm is a main road or must yield to the other Arms of its Junction. A vehicle that must yield to a main Arm slows to a crawl at its line even when nobody is coming, so a yielding Arm carries less traffic than a main one. Equal Arms give way to the right. On a roundabout the ring is always main.
_Avoid_: Right of way setting, control, stop sign

**Spillback**:
A queue at one Junction growing back along a road until it blocks the Junction upstream.
_Avoid_: Backup, gridlock

### Traffic

**Demand**:
How many vehicles want to travel between which Gateways, per minute. Each Gateway sends its own trips, split between the other Gateways a car can drive to. Demand changes only as an Assembly ends or a Tile is taken off, not at a drop.
_Avoid_: Traffic load, spawn rate, volume

**Flow**:
The measure of how well traffic is moving: the average of each vehicle's speed relative to the speed it could travel there unobstructed, including vehicles waiting to enter at zero. Shown to the player as a gauge.
_Avoid_: Score, efficiency, speed ratio, throughput

**Jam**:
Sustained low Flow caused by queues at a Junction. It lowers Income and keeps the Tile of that Junction from its next Stage. The player clears it with Changes or by building around it.
_Avoid_: Congestion, traffic, gridlock

### Look

**Finish**:
The standard a Zone's Blocks are built to, so that none looks unfinished from any side, at any Stage or at any zoom. Its rules are the rules of Finish.
_Avoid_: Level of finish, polish, detail, quality

**City zoom**:
The camera far enough out that the whole City fits the screen. A run opens at it.
_Avoid_: Framed, overview, zoomed out

**Tile zoom**:
The camera with one Tile filling the screen, where the game is played.
_Avoid_: Street, street level

**Block zoom**:
The camera with one Block filling the screen.
_Avoid_: Close, close-up, zoomed in

**Form**:
The shape a building takes within its Zone: a gable or a hip roof, a round or a stepped tower. Buildings on Lots side by side never share one.
_Avoid_: Style, kind, variant, type

**Scene**:
The one thing on a Block worth zooming in on, larger than a car and picked from its Zone's list: a shrine, a food stall, a sunken court.
_Avoid_: Landmark, focal piece, set piece, feature

**Landmark**:
A one-off building or feature that fills a Block, placed by the City's seed and not by a Zone: a tall tower, a park's pond.
_Avoid_: Scene, monument

**Kerbside**:
The strip of pavement along a Block's edge and the street furniture standing on it.
_Avoid_: Street, sidewalk, pavement edge

**Skin**:
One of the looks a vehicle is drawn in: a kei car, a taxi, a van. Every Skin is the same vehicle to the simulation.
_Avoid_: Vehicle type, model, variant

**Walker**:
A person drawn walking the pavements. Decoration only: traffic never meets one.
_Avoid_: Pedestrian, person, peg

## Retired

District, Level, Fog, Reveal and Win belonged to the authored game and the land game. They name nothing in the sandbox.

Rebuild, the simulation starting again from the City with no vehicle kept, happened on every placement, Swap and Undo. Since ADR 0006 the traffic drives on through every change to the City.

Holding, Flow staying above its bar for a sustained stretch, qualified the Record when the Record counted trips a minute. Growth needs no such test.
