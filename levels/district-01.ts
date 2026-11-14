import type { District } from '../src/sim/district'

// A 4 × 2 street grid, Revealed clockwise from its north-west corner (.scratch/district-01/spec.md):
//
//                 N2        N3        N4
//                 ‖         |         |
// W1 == J1 ====== J2 ====== J3 ====== J4
//        |         |         |         ‖
// W8 -- J8 ------ J7 ------ J6 ====== J5 -- E5
//                  |         |
//                  S7        S6
//
// Columns are 90 m apart and rows 80 m. A Priority junction's footprint is 19 m where a two-lane Road meets it and
// 12 m where none does, so a Road of the north row keeps 52 m of lane (8 queued cars) and R18 keeps 49 m.
const district: District = {
  roadDefaults: { speed: 13.9, laneWidth: 7, bikeBand: false, sidewalk: 0, median: 0 },
  junctions: {
    J1: { type: 'priority', at: [-135, 40] },
    J2: { type: 'priority', at: [-45, 40] },
    J3: { type: 'priority', at: [45, 40] },
    J4: { type: 'priority', at: [135, 40] },
    J5: { type: 'priority', at: [135, -40] },
    J6: { type: 'priority', at: [45, -40] },
    J7: { type: 'priority', at: [-45, -40] },
    J8: { type: 'priority', at: [-135, -40] },
  },
  roads: {
    // The north row, Sakura Avenue. A point end is on the District edge: a Gateway.
    W1: { from: [-175, 40], to: 'J1', lanes: [2, 2] },
    R12: { from: 'J1', to: 'J2', lanes: [2, 2] },
    R23: { from: 'J2', to: 'J3', lanes: [2, 2] },
    R34: { from: 'J3', to: 'J4', lanes: [2, 2] },
    N2: { from: [-45, 105], to: 'J2', lanes: [2, 2] },
    N3: { from: [45, 105], to: 'J3', lanes: [1, 1] },
    N4: { from: [135, 105], to: 'J4', lanes: [1, 1] },
    // Down the east side.
    R45: { from: 'J4', to: 'J5', lanes: [2, 2] },
    E5: { from: [180, -40], to: 'J5', lanes: [1, 1] },
    R56: { from: 'J5', to: 'J6', lanes: [2, 2] },
    // The cross streets. R27 has one lane southbound and two northbound; R36 is Tsuki-dori, the slow street. Their
    // speeds make the route shifts of Levels 6 and 7.
    R18: { from: 'J1', to: 'J8', lanes: [1, 1] },
    R27: { from: 'J2', to: 'J7', lanes: [1, 2], speed: 11 },
    R36: { from: 'J3', to: 'J6', lanes: [1, 1], speed: 8 },
    // The south row.
    R67: { from: 'J6', to: 'J7', lanes: [1, 1] },
    R78: { from: 'J7', to: 'J8', lanes: [1, 1] },
    S6: { from: [45, -105], to: 'J6', lanes: [1, 1] },
    S7: { from: [-45, -105], to: 'J7', lanes: [1, 1] },
    W8: { from: [-175, -40], to: 'J8', lanes: [1, 1] },
  },
  // Kumo Park is the Block in front of J1 from the opening camera, so nothing tall hides the stem's queue.
  scenery: {
    theme: 'city',
    seed: 20261113,
    landmarks: [{ type: 'tower', name: 'Hikari Tower', at: [0, 80] }],
    blocks: [{ type: 'park', name: 'Kumo Park', at: [-96, -1] }],
    streets: { W1: 'Sakura Avenue', R12: 'Sakura Avenue', R23: 'Sakura Avenue', R34: 'Sakura Avenue', R36: 'Tsuki-dori' },
    avenues: ['W1', 'R12', 'R23', 'R34'],
  },
  levels: [
    {
      reveal: ['J1'],
      seed: 5,
      tools: ['priority'],
      // vehicles per minute per Gateway: a heavy stream up the stem turns right onto the avenue, which is nearly empty.
      // 13 a minute is the middle of a narrow window: under 12 the yielding stem does not always jam, and from 15 its
      // right turn, driven at 4.3 m/s, holds Flow under the Win even as the main road.
      demand: {
        R18: { rate: 13, to: { R12: 1 } },
        W1: { rate: 1, to: { R12: 1 } },
        R12: { rate: 2, to: { W1: 1 } },
      },
      // the avenue is the main road, so the heavy stream yields to almost nobody
      initial: { J1: { priority: { W1: 'main', R12: 'main' } } },
      // the main road follows the stream round the corner
      solution: [{ at: 'J1', priority: { R18: 'main', R12: 'main', W1: 'yield' } }],
      // south to where R18 reaches J8's footprint and east to where R12 reaches J2's, both in the Fog
      pieces: [{ x0: -175, y0: -28, x1: -64, y1: 105 }],
    },
    {
      reveal: ['J2'],
      seed: 5,
      tools: ['connector'],
      // A heavy stream from N2 turns right onto the avenue: more than one turning lane carries, less than two do.
      // 30 a minute is the middle of the window: at 28 one seed in ten does not jam, and at 32 two lanes do not
      // always Win.
      // Level 1's stream turns right again down R27: its turn at J1 puts it in R12's kerb lane, which cannot turn left
      // to N2. The stem stream up R27 turns right onto R23 at a rate one turning lane carries; it jams J3 in Level 3.
      demand: {
        N2: { rate: 30, to: { W1: 1 } },
        R18: { rate: 13, to: { R27: 1 } },
        R27: { rate: 12, to: { R23: 1 } },
        W1: { rate: 1, to: { N2: 1 } },
        R23: { rate: 2, to: { W1: 1 } },
      },
      // only the kerb lane turns right, from N2 and from R27: the second lane of each stands unused
      initial: { J2: { disable: ['N2.in1>R12.out1', 'R27.in1>R23.out1'] } },
      solution: [{ at: 'J2', enable: ['N2.in1>R12.out1'] }],
      // East to where R23 reaches J3's footprint, in the Fog. South it ends in line with Level 1's piece: R27 stops
      // 7 m short of that edge, at J7's deeper footprint, and runs on to it as plate.
      pieces: [{ x0: -64, y0: -28, x1: 26, y1: 105 }],
    },
  ],
}

export default district
