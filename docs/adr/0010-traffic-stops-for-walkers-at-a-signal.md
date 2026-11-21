# Traffic stops for Walkers at a Signal

A Walker was decoration: one walked the pavement round its own Block, never crossed a Road, and the glossary said traffic never meets one. In the Living City ([#270](https://github.com/artsaraiva/dioramania/issues/270)) a Walker is someone with a home and somewhere to be, which means reaching the Block across the Road. The user approved traffic lights at Junctions, and the spec has Walkers cross by them: a Priority junction gets a Signal, and its cycle has a Walk phase in which every Arm is red. Walkers cross a Road only in the Walk phase, and only when it has time enough left to reach the far kerb.

So Walkers and vehicles meet at one place, a Signal, and are never in the Road together. A vehicle stops for the red light, not for a Walker it has seen: in the prototype's cycle the Walk phase comes round whether or not anyone waits.

## Consequences

- Walkers now cost traffic something: the Walk phase is time in which no vehicle enters the Junction. In the prototype vehicles have green for 24 of every 57 seconds. Jams with Signals on have not been measured, and a Signal must not cause a Jam the Tools cannot clear.
- A vehicle held at a red light does not grow angry, so anger still means a Jam.
- A Walker who has crossed belongs to the Block they reach.
- A Ring has no Signal, so how Walkers cross at a roundabout is not decided.
- Whether a Signal replaces the Priority rule on a Junction or the player chooses between them is not decided here. That is an ADR of its own, which waits for the Tool roster ([#55](https://github.com/artsaraiva/dioramania/issues/55)).
- What a Walker decides becomes something to test: a Walker starts across a Road only in the Walk phase with time enough left. A Walkers test seam was agreed with the user on 2026-11-20, and `CLAUDE.md`'s list of seams is to gain it.
