# Traffic Puzzles

A browser puzzle game where the player clears traffic jams by changing how junctions work, then watches the traffic flow. One context: the game and its simulation share this vocabulary.

## Language

### Play

**District**:
One map holding a chain of Junctions. The unit of a play session; the player works through a District one Level at a time.
_Avoid_: Map, world, campaign, chapter

**Level**:
One step in a District: a newly Revealed Junction (or small group of Junctions) with its own Demand, allowed Tools and win check. All Revealed Junctions in the District keep simulating during a Level.
_Avoid_: Stage, puzzle, scenario, mission

**Fog**:
The unrevealed part of a District. Fogged Junctions do not exist in the simulation yet.
_Avoid_: Locked area, hidden area

**Reveal**:
Lifting Fog from the next Junction after the player wins the current Level. A Reveal changes the District's Demand and starts a new Level.
_Avoid_: Unlock, expand

**Pre-warm**:
Simulating a Level hidden from the player for a fixed stretch after a Reveal, so the jam is already formed when the Level becomes visible.
_Avoid_: Warm-up

**Tool**:
Something the player can change about a Junction: a lane Connection, a Priority rule or a Signal. Each Level lists which Tools are allowed.
_Avoid_: Action, power-up, upgrade

**Inspector**:
A read-only aid that shows the player what traffic is doing, such as a car's route. Inspectors change nothing and are always available.
_Avoid_: Tool, overlay, debug view

**Change**:
One use of a Tool by the player.
_Avoid_: Move, edit, action

**Reset**:
Returning every Junction in the current Level to its initial configuration.
_Avoid_: Undo, restart

**Win**:
Flow held at or above the Level's threshold for a sustained stretch across the whole Revealed network. Winning enables the next Reveal. Levels cannot be lost.
_Avoid_: Pass, clear, complete

### Network

**Junction**:
A place where Roads meet and vehicles cross, merge or turn: a roundabout or a Priority junction.
_Avoid_: Node, intersection

**Priority junction**:
A Junction without a ring, where Arms meet directly and Priority rules or a Signal decide who goes. A T-junction has 3 Arms, a crossroads 4.
_Avoid_: Intersection, plain junction

**Ring**:
The circulating Lanes of a roundabout. The Ring belongs to its Junction: it is not a Road and has no Arms.
_Avoid_: Circle, loop, ring road

**Road**:
A straight stretch of Lanes in both directions between two Junctions, or between a Junction and the District edge. Each end of a Road is an Arm of the Junction there.
_Avoid_: Segment, edge, link, street

**Gateway**:
Where a Road leaves the simulated part of the District: at the District edge, or at a Junction still in Fog. Vehicles enter and leave the map only through Gateways.
_Avoid_: Spawn point, entrance, map edge

**Block**:
An area enclosed by Roads (and the District edge), filled with buildings, grass or a plaza. Blocks are scenery: traffic never enters them.
_Avoid_: Plot, lot, parcel

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
Whether an Arm is a main road or must yield to the other Arms of its Junction. Equal Arms give way to the right. On a roundabout the ring is always main.
_Avoid_: Right of way setting, control, stop sign

**Signal**:
A Junction-wide mode that gives each Arm green in turn, replacing the Priority rules of that Junction while on.
_Avoid_: Traffic light, phase

**Spillback**:
A queue at one Junction growing back along a road until it blocks the Junction upstream.
_Avoid_: Backup, gridlock

### Traffic

**Demand**:
How many vehicles want to travel between which Gateways of a District, over time. Demand is fixed within a Level and changes only on a Reveal.
_Avoid_: Traffic load, spawn rate, volume

**Flow**:
The game's single measure of how well traffic is moving: the average of each vehicle's speed relative to the speed it could travel there unobstructed, including vehicles waiting to enter the map at zero. Shown to the player as a gauge.
_Avoid_: Score, efficiency, speed ratio, throughput

**Jam**:
Sustained low Flow caused by queues at a Junction. What the player is asked to fix.
_Avoid_: Congestion, traffic, gridlock
