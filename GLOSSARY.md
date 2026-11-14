# Clearway

A browser game about a city that grows by buying land. Traffic earns the money, growth causes traffic jams, and the player clears them by changing how junctions work. One context: the game and its simulation share this vocabulary.

## Language

### Play

**District**:
One whole map of Tiles, with its road network fixed before play. The player starts on one Tile and grows the District by buying the rest.
_Avoid_: Map, world, campaign, chapter, level

**Tile**:
One cell of a District's grid: a Junction and the Blocks around it. The unit the player buys. A Tile can be bought when it touches a Tile already owned.
_Avoid_: Plot, parcel, lot, cell, land

**Fog**:
The Tiles of a District not yet bought. Their Junctions do not exist in the simulation yet.
_Avoid_: Locked area, hidden area

**Reveal**:
Lifting Fog from a Tile the player has just bought. A Reveal adds the Tile's Junction to the simulation and changes the District's Demand.
_Avoid_: Unlock, expand

**Pre-warm**:
Simulating the District hidden from the player for a fixed stretch after a Reveal, so traffic has settled when the new Tile becomes visible. Nothing is earned during it.
_Avoid_: Warm-up

**Income**:
Yen earned per minute. Every trip that arrives at its Gateway pays the same amount, so Income falls when a Jam keeps trips from arriving. The game's measure of doing well.
_Avoid_: Revenue, profit, score, earnings

**Tool**:
Something the player can change about a Junction: a lane Connection or a Priority rule. Every Tool works on every Junction the player owns.
_Avoid_: Action, power-up, upgrade

**Inspector**:
A read-only aid that shows the player what traffic is doing, such as a car's route. Inspectors change nothing and are always available.
_Avoid_: Tool, overlay, debug view

**Change**:
One use of a Tool by the player.
_Avoid_: Move, edit, action

**Reset**:
Returning every Junction to its configuration at the last Reveal.
_Avoid_: Undo, restart

**Win**:
Owning every Tile of a District. A District cannot be lost: a jammed one earns slowly.
_Avoid_: Pass, clear, complete

### Network

**Junction**:
A place where Roads meet and vehicles cross, merge or turn: a roundabout or a Priority junction.
_Avoid_: Node, intersection

**Priority junction**:
A Junction without a ring, where Arms meet directly and Priority rules decide who goes. A T-junction has 3 Arms, a crossroads 4.
_Avoid_: Intersection, plain junction

**Ring**:
The circulating Lanes of a roundabout. The Ring belongs to its Junction: it is not a Road and has no Arms.
_Avoid_: Circle, loop, ring road

**Road**:
A straight stretch of Lanes in both directions between two Junctions, or between a Junction and the District edge. Each end of a Road is an Arm of the Junction there.
_Avoid_: Segment, edge, link, street

**Gateway**:
Where a Road leaves the simulated part of the District: at the District edge, or at the edge of a Tile still in Fog. Vehicles enter and leave the map only through Gateways.
_Avoid_: Spawn point, entrance, map edge

**Block**:
An area enclosed by Roads (and the District edge), filled with buildings, grass or a plaza. Blocks are scenery: traffic never enters them. A lot is one building's plot inside a Block.
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
How many vehicles want to travel between which Gateways of a District, over time. Each Tile brings its own Demand when it is bought, so Demand changes only on a Reveal.
_Avoid_: Traffic load, spawn rate, volume

**Flow**:
The measure of how well traffic is moving: the average of each vehicle's speed relative to the speed it could travel there unobstructed, including vehicles waiting to enter the map at zero. Shown to the player as a gauge.
_Avoid_: Score, efficiency, speed ratio, throughput

**Jam**:
Sustained low Flow caused by queues at a Junction. It lowers Income, and the player clears it with Changes.
_Avoid_: Congestion, traffic, gridlock
