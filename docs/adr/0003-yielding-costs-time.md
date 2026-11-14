# Yielding costs time even when the main road is empty

A vehicle whose next Connection leaves a `yield` Arm and meets an enabled one from a `main` Arm slows to a crawl (0.5 m/s) at its line, whether or not anyone is coming. It slows gently (0.35 m/s²), so on a Road of a few hundred metres it drives under the limit the whole way: about 7 m/s at 72 m from the line. The crawl is part of the vehicle's free speed, so Flow counts a vehicle that keeps to it as moving freely. A vehicle that has to stand at the line still counts as stopped.

Before this, a `yield` Arm facing an empty main road carried as much as a `main` one, and each main vehicle took away about one yielding vehicle. A T-junction then carried about the same total whichever Arm was main, so swapping the Priority rule moved the queue and left Flow where it was. No Demand made a priority-swap Level jam and Win on more than 4 of 10 seeds ([#45](https://github.com/artsaraiva/clearway/issues/45), [#52](https://github.com/artsaraiva/clearway/issues/52)).

Larger or smaller gap-acceptance times did not help, and no single rule in `conflicting` was holding yielding vehicles back. The Priority rule needed a cost of its own.

## Consequences

- A heavy stream on a `yield` Arm jams by yielding at all, at about 14 vehicles a minute or more. Making it main clears it up to the lane's own limit.
- A priority-swap Level wants a nearly empty stem (a Level design choice, which the #45 script now makes). A busy stem cannot push through the heavy stream once it yields.
- The effect needs headroom between the yield ceiling and the lane's limit. At 13.9 m/s there is enough. At 8 m/s a lane carries about 25 vehicles a minute and the window is narrow.
- Arms that are all `main` or all `yield`, and roundabouts, are unchanged: no Connection there meets one from a `main` Arm while its own Arm yields.
- The crawl speed equals the speed under which a vehicle counts as standing in a queue. So a yielding vehicle reaches its line as good as standing, and waits for a gap in everything that moves.
- A Road that must yield looks slow along its whole length. Playtested on the street-grid fixture on 2026-11-14 and accepted.
- The two constants are tuning. Changing them means re-checking every Level that uses the Priority rule.
