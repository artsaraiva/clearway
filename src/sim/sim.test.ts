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
        pieces: [{ x0: -150, y0: -150, x1: 150, y1: 150 }],
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

/** A T-junction Level: a road heavy from W to E and a light side road S, with the side road as the main road. */
function tJunction(): District {
  return {
    roadDefaults: { speed: 13.9, laneWidth: 3.5, bikeBand: false, sidewalk: 0, median: 0 },
    junctions: { T: { type: 'priority', at: [0, 0] } },
    roads: {
      W: { from: [-200, 0], to: 'T', lanes: [1, 1] },
      E: { from: [200, 0], to: 'T', lanes: [1, 1] },
      S: { from: [0, -200], to: 'T', lanes: [1, 1] },
    },
    levels: [
      {
        reveal: ['T'],
        seed: 4,
        tools: ['priority'],
        demand: {
          W: { rate: 24, to: { E: 0.9, S: 0.1 } },
          E: { rate: 4, to: { W: 1 } },
          S: { rate: 8, to: { W: 0.5, E: 0.5 } },
        },
        initial: { T: { priority: { S: 'main' } } },
        solution: [{ at: 'T', priority: { W: 'main', E: 'main', S: 'yield' } }],
        pieces: [{ x0: -200, y0: -200, x1: 200, y1: 200 }],
      },
    ],
  }
}

it('jams a T-junction whose heavy road yields to its light road', () => {
  expect(run(new Sim(tJunction()), 180).flow).toBeLessThan(0.5)
})

it('clears the T-junction once the heavy road is main and the light road yields', () => {
  const district = tJunction()
  const sim = new Sim(district)
  for (const change of district.levels[0].solution) sim.apply(change)
  expect(run(sim, 300, () => sim.won).won).toBe(true)
})

it('gives the T-junction the same result every run', () => {
  const [a, b] = [0, 1].map(() => run(new Sim(tJunction()), 60))
  expect(b.flow).toBe(a.flow)
})

/**
 * Two Levels: the roundabout of District 1 with its east Road running into the Fog, then a crossroads Revealed on that
 * Road with every way in from the roundabout closed.
 */
function twoLevels(): District {
  const fromR = ['R.in0', 'R.in1'].flatMap((lane) => ['N2.out0', 'E2.out0', 'S2.out0'].map((out) => `${lane}>${out}`))
  const corridor = (rate: number, other: string, east: string) => ({ rate, to: { [other]: 0.8, [east]: 0.1, W: 0.1 } })
  return {
    roadDefaults: { speed: 13.9, laneWidth: 3.5, bikeBand: false, sidewalk: 0, median: 0 },
    junctions: {
      J1: { type: 'roundabout', at: [0, 0], radius: 40, ringLanes: 2 },
      J2: { type: 'priority', at: [400, 0] },
    },
    roads: {
      N: { from: [0, 178.5], to: 'J1', lanes: [2, 2] },
      S: { from: [0, -178.5], to: 'J1', lanes: [2, 2] },
      W: { from: [-178.5, 0], to: 'J1', lanes: [2, 2] },
      R: { from: 'J1', to: 'J2', lanes: [2, 2] },
      N2: { from: [400, 150], to: 'J2', lanes: [1, 1] },
      E2: { from: [550, 0], to: 'J2', lanes: [1, 1] },
      S2: { from: [400, -150], to: 'J2', lanes: [1, 1] },
    },
    levels: [
      {
        reveal: ['J1'],
        seed: 8,
        tools: ['connector'],
        demand: {
          N: corridor(22, 'S', 'R'),
          S: corridor(22, 'N', 'R'),
          R: { rate: 4, to: { W: 0.5, N: 0.25, S: 0.25 } },
          W: { rate: 4, to: { R: 0.5, N: 0.25, S: 0.25 } },
        },
        initial: {
          J1: { disable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], enable: ['*.in1>*.ring0', '*.ring0>*.out1'] },
        },
        solution: [
          { at: 'J1', enable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], disable: ['*.in1>*.ring0', '*.ring0>*.out1'] },
        ],
        // east to where Road R reaches the crossroads' footprint, in the Fog
        pieces: [{ x0: -178.5, y0: -178.5, x1: 388, y1: 178.5 }],
      },
      {
        reveal: ['J2'],
        seed: 8,
        tools: ['connector'],
        demand: {
          // lighter than Level 1, so the queues the closed crossroads held off the map can drain once it opens
          N: corridor(12, 'S', 'E2'),
          S: corridor(12, 'N', 'E2'),
          W: { rate: 4, to: { E2: 0.5, N: 0.25, S: 0.25 } },
          E2: { rate: 4, to: { W: 0.5, N2: 0.25, S2: 0.25 } },
          N2: { rate: 4, to: { S2: 1 } },
          S2: { rate: 4, to: { N2: 1 } },
        },
        initial: { J2: { disable: fromR } },
        solution: [{ at: 'J2', enable: fromR }],
        pieces: [{ x0: 388, y0: -150, x1: 550, y1: 150 }],
      },
    ],
  }
}

it('gives a Reveal Pre-warmed a few steps at a time the same result as one Pre-warmed at once', () => {
  const district = twoLevels()
  const carried = district.levels[0].solution
  const atOnce = new Sim(district, 1, carried)
  const spread = new Sim(district, 1, carried, { prewarm: false })
  for (let i = 0; !spread.prewarmed && i < 10_000; i++) spread.step()
  for (const sim of [atOnce, spread]) run(sim, 60)
  expect(spread.flow).toBe(atOnce.flow)
  expect(spread.vehicles.map((v) => [v.id, v.lane.id, v.s])).toEqual(atOnce.vehicles.map((v) => [v.id, v.lane.id, v.s]))
})

it('carries a won Level over a Reveal, which jams until its own reference solution', () => {
  const district = twoLevels()
  const first = new Sim(district)
  for (const change of district.levels[0].solution) first.apply(change)
  expect(run(first, 300, () => first.won).won).toBe(true)

  const reveal = () => new Sim(district, 1, first.configuration())
  expect(run(reveal(), 180).flow).toBeLessThan(0.5)
  const second = reveal()
  for (const change of district.levels[1].solution) second.apply(change)
  expect(run(second, 300, () => second.won).won).toBe(true)
})
