# The player chooses what runs a Junction

The Living City spec ([#270](https://github.com/artsaraiva/dioramania/issues/270)) gave every Priority junction of three Arms or more a Signal, and left to the Tool roster ([#55](https://github.com/artsaraiva/dioramania/issues/55)) whether the player chooses. On [#295](https://github.com/artsaraiva/dioramania/issues/295) the user decided, ahead of that Grill: the player chooses, Junction by Junction, from the Junction's note.

A Priority junction is run by signs or by a Signal, never both. Run by signs, each Arm has no sign, a yield sign or a stop sign: the Priority rule, with stop as its third value. Every Arm starts with no sign, where before every Arm started as yielding; Arms that all have no sign give way to the right, as Arms that all yielded did. Run by a Signal, the Signal says who goes and the signs are not read; they come back when the Signal goes. A Reset takes the Signal away with every other Change. Connections can be changed either way.

A selected Junction no longer draws every Connection it has on. It draws the Connections of the lanes the player has changed, each incoming lane in a colour of its own, and a lane's Connections while the pointer is on its lane end. The default is what the game does and is not drawn.

This settles what [ADR 0010](0010-traffic-stops-for-walkers-at-a-signal.md) left open, whether a Signal replaces the Priority rule or the player chooses, and narrows what it says of a vehicle at a red light (below).

## Consequences

- A Signal costs traffic: its Walk phase is 24 of every 57 seconds. Measured on #295 over ten minutes, one Crossroads between four Roads carried its Demand either way (22.0 trips a minute arrived of 23.3 with a Signal, 23.5 without). Three Crossroads in a row, all with Signals, jammed at 36 trips a minute and carried 33.4, where with no signs they carried all of it. Since the player puts a Signal there, the player can take it away, so a Signal causes no Jam the Tools cannot clear.
- A vehicle waiting its turn at a red light counts as moving freely, for Flow and for a Junction's Jam, when it stands within 45 m of the line: about what one green empties. One held further back does not, so a queue a Signal cannot carry still reads as a Jam, and its cars still grow angry.
- A vehicle that stood at its line through a green waiting for a gap, as one turning left across oncoming traffic does, goes on amber once the oncoming Approach is stopping. The cycle has no phase for left turns, so across a stream that fills the green about two turn each cycle.
- A stop sign slows every vehicle to the same crawl at its line that yielding to a main Arm does ([ADR 0003](0003-yielding-costs-time.md)), whoever is coming, and ranks under a yield sign.
- A save written before kept `yield` for every Arm of an untouched Junction. Such a Junction loads with no signs, which drives the same.
- Until Walkers cross on the Walk phase ([#296](https://github.com/artsaraiva/dioramania/issues/296)), the Walk phase stops traffic for nobody.
- The Tool roster Grill (#55) no longer decides this, and can build on it.
