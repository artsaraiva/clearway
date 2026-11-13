import { expect, it } from 'vitest'
import district from '../../levels/district-01'
import type { District, Level } from './district'
import { Sim } from './sim'

function run(sim: Sim, seconds: number, until = () => false) {
  for (let i = 0; i < seconds * 30 && !until(); i++) sim.step()
  return sim
}

/** One Priority junction between four Gateways: two lanes each way north–south, one east–west. */
function crossroads(initial: Level['initial'] = {}): District {
  const others = (gateway: string) => Object.fromEntries(['N', 'E', 'S', 'W'].filter((g) => g !== gateway).map((g) => [g, 1]))
  return {
    roadDefaults: { speed: 13.9, laneWidth: 3.5, bikeBand: false, sidewalk: 0, median: 0 },
    junctions: { X: { type: 'priority', at: [0, 0] } },
    roads: {
      N: { from: [0, 150], to: 'X', lanes: [2, 2] },
      E: { from: [150, 0], to: 'X', lanes: [1, 1] },
      S: { from: [0, -150], to: 'X', lanes: [2, 2] },
      W: { from: [-150, 0], to: 'X', lanes: [1, 1] },
    },
    levels: [
      {
        reveal: ['X'],
        seed: 1,
        tools: [],
        demand: Object.fromEntries(['N', 'E', 'S', 'W'].map((g) => [g, { rate: 4, to: others(g) }])),
        initial,
        solution: [],
      },
    ],
  }
}

it('is deterministic for a seed', () => {
  const a = run(new Sim(district), 60)
  const b = run(new Sim(district), 60)
  expect(b.flow).toBe(a.flow)
  expect(b.vehicles.map((v) => [v.id, v.lane.id, v.s])).toEqual(a.vehicles.map((v) => [v.id, v.lane.id, v.s]))
})

it('wins a crossroads with default Connections and moderate Demand', () => {
  const sim = new Sim(crossroads())
  expect(run(sim, 300, () => sim.won).won).toBe(true)
})

it('jams a crossroads with every Connection from one Arm disabled', () => {
  const fromN = ['N.in0', 'N.in1'].flatMap((lane) => ['E.out0', 'S.out0', 'S.out1', 'W.out0'].map((out) => `${lane}>${out}`))
  expect(run(new Sim(crossroads({ X: { disable: fromN } })), 180).flow).toBeLessThan(0.5)
})
