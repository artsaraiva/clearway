# Clearway

A browser sandbox about a small city the player builds from road tiles. Traffic earns the money, growth causes traffic jams, and the player clears them by changing how junctions work or by building around them. One context: the game and its simulation share this vocabulary.

## Language

### Play

**City**:
Every Tile the player has placed, joined into one road network. It grows on a square grid with no bounds and cannot be finished or lost.
_Avoid_: District, map, world, town, level

**Tile**:
One Layout placed in one cell of the grid, at one rotation. A Tile holds exactly one Junction and the Blocks around it. A Tile cannot be removed or moved.
_Avoid_: Piece, cell, plot, parcel, land

**Layout**:
A kind of Tile the player can place: Straight, Curve, T-junction, Crossroads or Roundabout. Every Layout is always in the bar and can be placed any number of times.
_Avoid_: Tile type, shape, piece, card

**Swap**:
Replacing a placed Tile with another Layout by dropping it on top. A Swap costs the Price, and the swapped Tile's Changes return to defaults.
_Avoid_: Replace, upgrade, rebuild

**Undo**:
Taking back the last placement or Swap for a full refund, allowed only for a short stretch after it.
_Avoid_: Remove, sell, Reset

**Rebuild**:
The simulation starting again from the City after a Tile is placed, a Swap or an Undo. Changes carry over; no vehicle does.
_Avoid_: Reveal, reload, restart

**Pre-warm**:
Simulating the City hidden from the player for a fixed stretch after a Rebuild, so traffic has settled when it becomes visible. Nothing is earned during it.
_Avoid_: Warm-up

**Price**:
What the next Tile costs, in yen. It is the same for every Layout and rises with the number of Tiles placed.
_Avoid_: Cost, fee

**Income**:
Yen earned per minute. Every trip that arrives at its Gateway pays the same amount, so Income falls when a Jam keeps trips from arriving. It never falls below a small floor.
_Avoid_: Revenue, profit, score, earnings

**Holding**:
Flow staying at or above its bar for a sustained stretch. A City that is Holding is carrying its Demand.
_Avoid_: Winning, stable, clear

**Record**:
The most trips per minute the City has carried while Holding. The game's measure of doing well.
_Avoid_: Score, high score, Win

**Tool**:
Something the player can change about a Junction: a lane Connection or a Priority rule. Every Tool works on every Junction, free and without limit.
_Avoid_: Action, power-up, upgrade

**Inspector**:
A read-only aid that shows the player what traffic is doing, such as a car's route. Inspectors change nothing and are always available.
_Avoid_: Tool, overlay, debug view

**Change**:
One use of a Tool by the player.
_Avoid_: Move, edit, action

**Reset**:
Returning every Junction to its default configuration.
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
An open road end of the City: where a Road reaches an edge of its Tile with no Tile beyond. Vehicles enter and leave only through Gateways. Placing a Tile there closes the Gateway.
_Avoid_: Spawn point, entrance, map edge, open end

**Block**:
An area beside Roads filled with buildings, grass or a plaza. Blocks are scenery: traffic never enters them and they do not change Demand. A lot is one building's plot inside a Block.
_Avoid_: Plot, parcel

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
How many vehicles want to travel between which Gateways, per minute. Each Gateway sends its own trips, split between the other Gateways a car can drive to. Demand changes only on a Rebuild.
_Avoid_: Traffic load, spawn rate, volume

**Flow**:
The measure of how well traffic is moving: the average of each vehicle's speed relative to the speed it could travel there unobstructed, including vehicles waiting to enter at zero. Shown to the player as a gauge.
_Avoid_: Score, efficiency, speed ratio, throughput

**Jam**:
Sustained low Flow caused by queues at a Junction. It lowers Income, and the player clears it with Changes or by building around it.
_Avoid_: Congestion, traffic, gridlock

## Retired

District, Level, Fog, Reveal and Win belonged to the authored game and the land game. They name nothing in the sandbox.
