import type { Level } from '../src/sim/sim'

export default {
  seed: 8,
  tools: ['connector'],
  roundabout: {
    radius: 40,
    laneWidth: 3.5,
    ringLanes: 2,
    approachLanes: 2,
    approachLength: 120,
    arms: { E: 0, N: 90, W: 180, S: 270 },
  },
  demand: {
    // vehicles per minute per arm, and destination distribution: a heavy N–S corridor, light side streets
    N: { rate: 22, to: { S: 0.8, E: 0.1, W: 0.1 } },
    S: { rate: 22, to: { N: 0.8, E: 0.1, W: 0.1 } },
    E: { rate: 4, to: { W: 0.5, N: 0.25, S: 0.25 } },
    W: { rate: 4, to: { E: 0.5, N: 0.25, S: 0.25 } },
  },
  initial: {
    // applied at every ring node: all approach lanes → outer ring only; inner ring unused
    connections: ['approach0>ring0', 'approach1>ring0', 'ring0>ring0', 'ring0>exit0', 'ring0>exit1'],
    priority: { N: 'yield', S: 'yield', E: 'yield', W: 'yield' },
  },
} satisfies Level
