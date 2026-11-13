import type { District } from '../src/sim/district'

export default {
  roadDefaults: { speed: 13.9, laneWidth: 3.5, bikeBand: true, sidewalk: 2, median: 0 },
  junctions: {
    J1: { type: 'roundabout', at: [0, 0], radius: 40, ringLanes: 2 },
  },
  roads: {
    // A point end is on the District edge: a Gateway. 178.5 m from J1's centre leaves 120 m of lane.
    N: { from: [0, 178.5], to: 'J1', lanes: [2, 2] },
    E: { from: [178.5, 0], to: 'J1', lanes: [2, 2] },
    S: { from: [0, -178.5], to: 'J1', lanes: [2, 2] },
    W: { from: [-178.5, 0], to: 'J1', lanes: [2, 2] },
  },
  levels: [
    {
      reveal: ['J1'],
      seed: 8,
      tools: ['connector'],
      // vehicles per minute per Gateway, and destination weights: a heavy N–S corridor, light side streets
      demand: {
        N: { rate: 22, to: { S: 0.8, E: 0.1, W: 0.1 } },
        S: { rate: 22, to: { N: 0.8, E: 0.1, W: 0.1 } },
        E: { rate: 4, to: { W: 0.5, N: 0.25, S: 0.25 } },
        W: { rate: 4, to: { E: 0.5, N: 0.25, S: 0.25 } },
      },
      // every approach lane feeds the outer Ring only; the inner Ring is unused
      initial: {
        J1: {
          disable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'],
          enable: ['*.in1>*.ring0', '*.ring0>*.out1'],
        },
      },
      // send approach lane 1 onto the inner Ring and out through exit lane 1 at every Arm
      solution: [{ at: 'J1', enable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], disable: ['*.in1>*.ring0'] }],
    },
  ],
} satisfies District
