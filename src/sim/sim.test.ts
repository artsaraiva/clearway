import { expect, it } from 'vitest'
import { City, LAYOUTS, type Layout } from '../city/city'
import { pointAt } from './geometry'
import { DT, Sim, type Vehicle } from './sim'
import type { Change, DemandSpec, NetworkSpec, RoadAttributes } from './spec'
import { CELL } from './tiles'

function run(sim: Sim, seconds: number, until = () => false) {
  for (let i = 0; i < seconds * 30 && !until(); i++) sim.step()
  return sim
}
const jams = (sim: Sim) => run(sim, 180).flow < 0.5
/** Whether, within five minutes, Flow stays at 80% or more for a whole minute: the traffic has cleared. */
const clears = (sim: Sim) => {
  let clear = 0
  run(sim, 300, () => (clear = sim.flow >= 0.8 ? clear + DT : 0) >= 60)
  return clear >= 60
}
const state = (sim: Sim) => sim.vehicles.map((v) => [v.id, v.lane.id, v.s])

/** A hand-built network with its Demand: `initial` is the configuration it starts in, `solution` the Changes that clear its Jam. */
interface Fixture {
  network: NetworkSpec
  demand: DemandSpec
  seed: number
  initial: Change[]
  solution: Change[]
}
/** The fixture as it starts, on top of the configuration `carried` over to it. */
const start = (f: Fixture, carried: Change[] = [], options?: { prewarm: boolean }) =>
  new Sim(f, [...carried, ...f.initial], f.seed, options)
const solved = (f: Fixture, carried: Change[] = []) => {
  const sim = start(f, carried)
  for (const change of f.solution) sim.apply(change)
  return sim
}

const NARROW: RoadAttributes = { speed: 13.9, laneWidth: 3.5, bikeBand: false, sidewalk: 0, median: 0 }
const WIDE: RoadAttributes = { ...NARROW, laneWidth: 7 }

/**
 * District 1 of the authored game, as far as it was built: the north-west corner of a street grid, columns 90 m apart
 * and rows 80 m. A Road that ran on to a Junction not built yet ends where that Junction's footprint would start.
 *
 *     W1 == J1 ====== J2 == R23
 *            |         |
 *           R18       R27
 */
const AVENUE = {
  W1: { from: [-175, 40], to: 'J1', lanes: [2, 2] },
  R18: { from: 'J1', to: [-135, -28], lanes: [1, 1] },
} satisfies NetworkSpec['roads']

/** Level 1: a heavy stream up the stem R18 turns right onto the avenue, which is nearly empty, and has to yield to it. */
const level1 = (): Fixture => ({
  network: {
    roadDefaults: WIDE,
    junctions: { J1: { type: 'priority', at: [-135, 40] } },
    roads: { W1: AVENUE.W1, R12: { from: 'J1', to: [-64, 40], lanes: [2, 2] }, R18: AVENUE.R18 },
  },
  demand: {
    R18: { rate: 13, to: { R12: 1 } },
    W1: { rate: 1, to: { R12: 1 } },
    R12: { rate: 2, to: { W1: 1 } },
  },
  seed: 5,
  initial: [{ at: 'J1', priority: { W1: 'main', R12: 'main' } }],
  // the main road follows the stream round the corner
  solution: [{ at: 'J1', priority: { R18: 'main', R12: 'main', W1: 'yield' } }],
})

/** Level 2: J2 joins, and a heavy stream from N2 turns right onto the avenue from one lane, which cannot carry it. */
const level2 = (): Fixture => ({
  network: {
    roadDefaults: WIDE,
    junctions: { J1: { type: 'priority', at: [-135, 40] }, J2: { type: 'priority', at: [-45, 40] } },
    roads: {
      W1: AVENUE.W1,
      R12: { from: 'J1', to: 'J2', lanes: [2, 2] },
      R23: { from: 'J2', to: [26, 40], lanes: [2, 2] },
      N2: { from: [-45, 105], to: 'J2', lanes: [2, 2] },
      R18: AVENUE.R18,
      R27: { from: 'J2', to: [-45, -21], lanes: [1, 2], speed: 11 },
    },
  },
  demand: {
    N2: { rate: 30, to: { W1: 1 } },
    R18: { rate: 13, to: { R27: 1 } },
    R27: { rate: 12, to: { R23: 1 } },
    W1: { rate: 1, to: { N2: 1 } },
    R23: { rate: 2, to: { W1: 1 } },
  },
  seed: 5,
  // only the kerb lane turns right, from N2 and from R27: the second lane of each stands unused
  initial: [{ at: 'J2', disable: ['N2.in1>R12.out1', 'R27.in1>R23.out1'] }],
  solution: [{ at: 'J2', enable: ['N2.in1>R12.out1'] }],
})
/** Level 1 as its reference solution left it: what Level 2 starts from. */
const level1Solved = () => [...level1().initial, ...level1().solution]

it('jams District 1 Level 1 when left untouched', () => {
  expect(jams(start(level1()))).toBe(true)
})

it('clears District 1 Level 1 with its reference solution', () => {
  expect(clears(solved(level1()))).toBe(true)
})

it('jams District 1 Level 2 when left untouched', () => {
  expect(jams(start(level2(), level1Solved()))).toBe(true)
})

it('clears District 1 Level 2 with its reference solution', () => {
  expect(clears(solved(level2(), level1Solved()))).toBe(true)
})

it('is deterministic for a seed', () => {
  const [a, b] = [0, 1].map(() => run(start(level1()), 60))
  expect(b.flow).toBe(a.flow)
  expect(state(b)).toEqual(state(a))
})

/** One Priority junction between four Gateways: two lanes each way north–south, one east–west. */
function crossroads(initial: Change[] = []): Fixture {
  const others = (gateway: string) => Object.fromEntries(['N', 'E', 'S', 'W'].filter((g) => g !== gateway).map((g) => [g, 1]))
  return {
    network: {
      roadDefaults: NARROW,
      junctions: { X: { type: 'priority', at: [0, 0] } },
      roads: {
        N: { from: [0, 150], to: 'X', lanes: [2, 2] },
        E: { from: [150, 0], to: 'X', lanes: [1, 1] },
        S: { from: [0, -150], to: 'X', lanes: [2, 2] },
        W: { from: [-150, 0], to: 'X', lanes: [1, 1] },
      },
    },
    demand: Object.fromEntries(['N', 'E', 'S', 'W'].map((g) => [g, { rate: 4, to: others(g) }])),
    seed: 1,
    initial,
    solution: [],
  }
}
/** Every Connection from the crossroads' north Arm, disabled. */
const NORTH_CLOSED: Change = {
  at: 'X',
  disable: ['N.in0', 'N.in1'].flatMap((lane) => ['E.out0', 'S.out0', 'S.out1', 'W.out0'].map((out) => `${lane}>${out}`)),
}

it('keeps a crossroads with default Connections and moderate Demand clear', () => {
  expect(clears(start(crossroads()))).toBe(true)
})

it('jams a crossroads with every Connection from one Arm disabled', () => {
  expect(jams(start(crossroads([NORTH_CLOSED])))).toBe(true)
})

it('clears that crossroads on a Reset, which returns it to its default configuration', () => {
  const sim = start(crossroads([NORTH_CLOSED]))
  sim.reset('X')
  expect(clears(sim)).toBe(true)
})

/** A T-junction: a road heavy from W to E and a nearly empty side road S, with the side road as the main road. */
const tJunction = (): Fixture => ({
  network: {
    roadDefaults: NARROW,
    junctions: { T: { type: 'priority', at: [0, 0] } },
    roads: {
      W: { from: [-200, 0], to: 'T', lanes: [1, 1] },
      E: { from: [200, 0], to: 'T', lanes: [1, 1] },
      S: { from: [0, -200], to: 'T', lanes: [1, 1] },
    },
  },
  demand: {
    W: { rate: 17, to: { E: 1 } },
    S: { rate: 1, to: { W: 0.5, E: 0.5 } },
  },
  seed: 4,
  initial: [{ at: 'T', priority: { S: 'main' } }],
  solution: [{ at: 'T', priority: { W: 'main', E: 'main', S: 'yield' } }],
})

it('jams a T-junction whose heavy road yields, even to a light road that is nearly empty', () => {
  expect(jams(start(tJunction()))).toBe(true)
})

it('clears the T-junction once the heavy road is main and the light road yields', () => {
  expect(clears(solved(tJunction()))).toBe(true)
})

it('gives the T-junction the same result every run', () => {
  const [a, b] = [0, 1].map(() => run(start(tJunction()), 60))
  expect(b.flow).toBe(a.flow)
})

const corridor = (rate: number, other: string, east: string) => ({ rate, to: { [other]: 0.8, [east]: 0.1, W: 0.1 } })
const RING_ROADS = {
  N: { from: [0, 178.5], to: 'J1', lanes: [2, 2] },
  S: { from: [0, -178.5], to: 'J1', lanes: [2, 2] },
  W: { from: [-178.5, 0], to: 'J1', lanes: [2, 2] },
} satisfies NetworkSpec['roads']

/** A roundabout squeezed onto its outer Ring lane, with its east Road R running off the map. */
const ring = (): Fixture => ({
  network: {
    roadDefaults: NARROW,
    junctions: { J1: { type: 'roundabout', at: [0, 0], radius: 40, ringLanes: 2 } },
    roads: { ...RING_ROADS, R: { from: 'J1', to: [388, 0], lanes: [2, 2] } },
  },
  demand: {
    N: corridor(22, 'S', 'R'),
    S: corridor(22, 'N', 'R'),
    R: { rate: 4, to: { W: 0.5, N: 0.25, S: 0.25 } },
    W: { rate: 4, to: { R: 0.5, N: 0.25, S: 0.25 } },
  },
  seed: 8,
  initial: [{ at: 'J1', disable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], enable: ['*.in1>*.ring0', '*.ring0>*.out1'] }],
  solution: [{ at: 'J1', enable: ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1'], disable: ['*.in1>*.ring0', '*.ring0>*.out1'] }],
})

/** The same roundabout in a City grown since: a crossroads now stands on Road R, with every way in from the roundabout closed. */
function ringAndCrossroads(): Fixture {
  const fromR = ['R.in0', 'R.in1'].flatMap((lane) => ['N2.out0', 'E2.out0', 'S2.out0'].map((out) => `${lane}>${out}`))
  return {
    network: {
      roadDefaults: NARROW,
      junctions: {
        J1: { type: 'roundabout', at: [0, 0], radius: 40, ringLanes: 2 },
        J2: { type: 'priority', at: [400, 0] },
      },
      roads: {
        ...RING_ROADS,
        R: { from: 'J1', to: 'J2', lanes: [2, 2] },
        N2: { from: [400, 150], to: 'J2', lanes: [1, 1] },
        E2: { from: [550, 0], to: 'J2', lanes: [1, 1] },
        S2: { from: [400, -150], to: 'J2', lanes: [1, 1] },
      },
    },
    demand: {
      // lighter than before the City grew, so the queues the closed crossroads held off the map can drain once it opens
      N: corridor(12, 'S', 'E2'),
      S: corridor(12, 'N', 'E2'),
      W: { rate: 4, to: { E2: 0.5, N: 0.25, S: 0.25 } },
      E2: { rate: 4, to: { W: 0.5, N2: 0.25, S2: 0.25 } },
      N2: { rate: 4, to: { S2: 1 } },
      S2: { rate: 4, to: { N2: 1 } },
    },
    seed: 8,
    initial: [{ at: 'J2', disable: fromR }],
    solution: [{ at: 'J2', enable: fromR }],
  }
}

it('gives a Sim Pre-warmed a few steps at a time the same result as one Pre-warmed at once', () => {
  const carried = [...ring().initial, ...ring().solution]
  const atOnce = start(ringAndCrossroads(), carried)
  const spread = start(ringAndCrossroads(), carried, { prewarm: false })
  for (let i = 0; !spread.prewarmed && i < 10_000; i++) spread.step()
  for (const sim of [atOnce, spread]) run(sim, 60)
  expect(spread.flow).toBe(atOnce.flow)
  expect(state(spread)).toEqual(state(atOnce))
})

it('carries a cleared roundabout’s Changes over to the Sim of a City grown since, which jams until its own Changes', () => {
  const first = solved(ring())
  expect(clears(first)).toBe(true)
  expect(jams(start(ringAndCrossroads(), first.configuration()))).toBe(true)
  expect(clears(solved(ringAndCrossroads(), first.configuration()))).toBe(true)
})

/**
 * A roundabout the size of one Block on 7 m lanes: a Ring 60 m across with two lanes, between four Gateways on two-lane
 * Roads, heavy north–south. It starts with both Approach lanes feeding the outer Ring lane and the inner one closed.
 */
function roundabout(): Fixture {
  const inner = ['*.in1>*.ring1', '*.ring1>*.ring1', '*.ring1>*.out1']
  const outer = ['*.in1>*.ring0', '*.ring0>*.out1']
  const through = (other: string) => ({ rate: 22, to: { [other]: 0.8, E: 0.1, W: 0.1 } })
  const side = (other: string) => ({ rate: 4, to: { [other]: 0.5, N: 0.25, S: 0.25 } })
  return {
    network: {
      roadDefaults: WIDE,
      junctions: { J: { type: 'roundabout', at: [0, 0], radius: 23, ringLanes: 2 } },
      roads: {
        N: { from: [0, 90], to: 'J', lanes: [2, 2] },
        E: { from: [90, 0], to: 'J', lanes: [2, 2] },
        S: { from: [0, -90], to: 'J', lanes: [2, 2] },
        W: { from: [-90, 0], to: 'J', lanes: [2, 2] },
      },
    },
    demand: { N: through('S'), S: through('N'), E: side('W'), W: side('E') },
    seed: 8,
    initial: [{ at: 'J', disable: inner, enable: outer }],
    solution: [{ at: 'J', enable: inner, disable: outer }],
  }
}

it('jams a one-Block roundabout squeezed onto its outer Ring lane, and clears it once the inner lane opens', () => {
  expect(jams(start(roundabout()))).toBe(true)
  expect(clears(solved(roundabout()))).toBe(true)
})

/** The one-Block roundabout in its default configuration, with most trips from every Gateway turning left, three quarters of the way round the Ring. */
function leftTurnRoundabout(seed: number): Fixture {
  const gateways = ['N', 'W', 'S', 'E'] // counterclockwise, the way the Ring turns
  const demand = Object.fromEntries(
    gateways.map((g, i) => [g, { rate: 14, to: { [gateways[(i + 3) % 4]]: 0.8, [gateways[(i + 2) % 4]]: 0.2 } }]),
  )
  return { ...roundabout(), seed, demand, initial: [], solution: [] }
}

it.each([2, 3])('keeps a full roundabout moving: trips still arrive after ten minutes (seed %i)', (seed) => {
  const sim = run(start(leftTurnRoundabout(seed)), 600)
  const arrived = sim.completed
  expect(run(sim, 60).completed).toBeGreaterThan(arrived)
})

// Cities. A Layout unrotated: a Straight runs east–west, a Curve joins east and north, a T-junction lacks its south side.
const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
function cityOf(...tiles: [id: Layout['id'], rotation: number, x: number, y: number][]) {
  const [[id, rotation, x, y], ...rest] = tiles
  const city = new City([{ cell: { x, y }, layout: layout(id), rotation }])
  for (const [id, rotation, x, y] of rest) expect(city.place(layout(id), rotation, { x, y }).legal).toBe(true)
  return city
}

it('keeps a City of a Curve and a Straight clear, with trips driving through both', () => {
  // The Curve's north end and the Straight's east end are the only Gateways, so every trip crosses both Tiles.
  const sim = new Sim(cityOf(['curve', 0, 0, 0], ['straight', 0, 1, 0]), [], 1)
  expect(clears(sim)).toBe(true)
  expect(sim.completed).toBeGreaterThan(0)
})

it('carries trips through a City with one of every Layout', () => {
  const city = cityOf(['crossroads', 0, 0, 0], ['straight', 0, 1, 0], ['tee', 2, 0, 1], ['roundabout', 0, -1, 0], ['curve', 1, 1, 1])
  const sim = new Sim(city, [], 1)
  const arrived = sim.completed
  expect(run(sim, 120).completed).toBeGreaterThan(arrived)
})

it('gives a City the same result every run of a seed', () => {
  const [a, b] = [0, 1].map(() => run(new Sim(cityOf(['crossroads', 0, 0, 0], ['roundabout', 0, 1, 0]), [], 3), 60))
  expect(b.flow).toBe(a.flow)
  expect(state(b)).toEqual(state(a))
})

it('keeps a Change made before a placement in force after it', () => {
  const NORTH = 'v0_0' // the Gateway on the north side of the Crossroads
  /** Whether any trip sets out for the north Gateway in two minutes. */
  const headsNorth = (sim: Sim) => {
    let seen = false
    run(sim, 120, () => (seen ||= sim.vehicles.some((v) => v.dest === NORTH)))
    return seen
  }
  const city = cityOf(['crossroads', 0, 0, 0], ['straight', 0, 1, 0])
  const before = new Sim(city, [], 1)
  // The Change: close every Connection of the Crossroads that leads out to the north.
  const crossroads = before.net.junctions.find((j) => j.id === 'c0_0')!
  const north = crossroads.arms.find((a) => a.road === NORTH)!
  const closed = crossroads.arms.flatMap((a) => a.connections.filter((c) => north.exit.includes(c.to)).map((c) => c.ref))
  before.apply({ at: 'c0_0', disable: closed })

  expect(city.place(layout('straight'), 1, { x: 0, y: -1 }).legal).toBe(true)
  expect(headsNorth(new Sim(city, [], 1))).toBe(true)
  expect(headsNorth(new Sim(city, before.configuration(), 1))).toBe(false)
})

/**
 * A Crossroads and a Straight with their traffic running, then a Straight placed on the Crossroads' south Gateway:
 * `before` is the Sim of the City before the placement, and `after()` the Sim of the grown City its traffic drives on in.
 */
function placement() {
  const city = cityOf(['crossroads', 0, 0, 0], ['straight', 0, 1, 0])
  const closed = 'v0_-1'
  // Until a vehicle bound for the Gateway the placement closes is on the map.
  const before = new Sim(city, [], 1)
  run(before, 300, () => before.vehicles.some((v) => v.dest === closed))
  const after = () => {
    expect(city.place(layout('straight'), 1, { x: 0, y: -1 }).legal).toBe(true)
    return new Sim(city, before.configuration(), 1, { traffic: before })
  }
  return { before, after, closed }
}
/** Where each vehicle is on the map, to the centimetre. */
const spots = (sim: Sim) =>
  sim.vehicles.map((v) => {
    const p = pointAt(v.lane.line, v.s)
    return [v.id, Math.round(p.x * 100) + 0, Math.round(p.y * 100) + 0]
  })

it('keeps a vehicle driving before a placement driving after it', () => {
  const { before, after } = placement()
  const driving = spots(before)
  expect(driving.length).toBeGreaterThan(0)
  const sim = after()
  // Every one is where it was, and the grown City needs no Pre-warm.
  expect(spots(sim)).toEqual(driving)
  expect(sim.prewarmed).toBe(true)
  // And every one drives on to a Gateway and leaves.
  run(sim, 120)
  const left = new Set(sim.vehicles.map((v) => v.id))
  expect(driving.filter(([id]) => left.has(id))).toEqual([])
})

it('gives a vehicle bound for a Gateway the placement closed a Gateway it can reach', () => {
  const { before, after, closed } = placement()
  expect(before.vehicles.some((v) => v.dest === closed)).toBe(true)
  const sim = after()
  expect(sim.vehicles.length).toBe(before.vehicles.length)
  for (const v of sim.vehicles) {
    expect(Object.keys(sim.net.gateways)).toContain(v.dest)
    expect(sim.route(v.lane, v.dest)).not.toBeNull()
  }
  // Nor does an arrival wait off-screen at the closed Gateway, or for it.
  expect(Object.keys(sim.queues)).not.toContain(closed)
  expect(
    Object.values(sim.queues)
      .flat()
      .map((a) => a.dest),
  ).not.toContain(closed)
})

// A T-junction on the Crossroads' cell has some of its Lane ids, with the north side gone. A Roundabout's Ring ends
// every Road further out than the Crossroads did.
it.each([
  ['T-junction', 'tee', 2],
  ['Roundabout', 'roundabout', 0],
] as const)('keeps a vehicle driving outside the swapped Tile driving after a Swap for a %s', (_, id, rotation) => {
  const city = cityOf(['straight', 0, -1, 0], ['crossroads', 0, 0, 0], ['straight', 0, 1, 0])
  const before = new Sim(city, [], 1)
  const onCrossroads = (v: Vehicle) => 'junction' in v.lane.owner && v.lane.owner.junction === 'c0_0'
  const away = ([, x, y]: number[]) => Math.max(Math.abs(x), Math.abs(y)) > (CELL / 2) * 100 // cm
  // Until cars are crossing the Crossroads, queuing on the Roads up to it, and driving on the Straights.
  const count = (where: (spot: number[], v: Vehicle) => boolean) => spots(before).filter((s, i) => where(s, before.vehicles[i])).length
  run(before, 600, () => count((_, v) => onCrossroads(v)) >= 2 && count((s, v) => !away(s) && !onCrossroads(v)) >= 2 && count(away) >= 2)
  const driving = spots(before).filter(away)
  const crossing = new Set(before.vehicles.filter(onCrossroads).map((v) => v.id))
  expect(driving.length).toBeGreaterThan(0)

  expect(city.place(layout(id), rotation, { x: 0, y: 0 }).legal).toBe(true)
  const changes = before.configuration().filter((c) => c.at !== 'c0_0')
  const sim = new Sim(city, changes, 1, { traffic: before })
  expect(sim.prewarmed).toBe(true)
  // Every one outside the Tile is where it was.
  const after = spots(sim)
  for (const spot of driving) expect(after).toContainEqual(spot)
  // The ones on the Crossroads are gone, and none is left standing off the road, where the new Junction is.
  expect(sim.vehicles.filter((v) => crossing.has(v.id))).toEqual([])
  for (const v of sim.vehicles) {
    expect(v.s).toBeGreaterThanOrEqual(0)
    expect(v.s).toBeLessThanOrEqual(v.lane.length)
  }
})
