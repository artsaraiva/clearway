import type { District, Point, RoadSpec } from '../sim/district'

// ponytail: a dev fixture, not a playable District. It is the visual-style prototype's 3×3 street grid with 7 m lanes,
// opened with `?district=grid` to check the renderer on Priority junctions while District 1 is a single roundabout.
// It has no jam and no solution, so it never wins. Delete it when #33 settles a real street-grid District.
const VX = [-88, -32, 24] // the three north–south streets
const HY = [80, 16, -48] // the three east–west streets
const EDGE = 130
const GATEWAYS = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'W0', 'W1', 'W2', 'E0']
// By row: the two north–south Roads meeting there, which have Priority.
const MAIN = [
  ['N', 'Va'],
  ['Va', 'Vb'],
  ['Vb', 'S'],
]

const roads: Record<string, RoadSpec> = { E0: { from: [EDGE, HY[0]], to: 'J20', lanes: [1, 1] } }
VX.forEach((x, i) => {
  roads[`N${i}`] = { from: [x, EDGE], to: `J${i}0`, lanes: [1, 1] }
  roads[`V${i}a`] = { from: `J${i}0`, to: `J${i}1`, lanes: [1, 1] }
  roads[`V${i}b`] = { from: `J${i}1`, to: `J${i}2`, lanes: [1, 1] }
  roads[`S${i}`] = { from: [x, -EDGE], to: `J${i}2`, lanes: [1, 1] }
})
HY.forEach((y, j) => {
  roads[`W${j}`] = { from: [-EDGE, y], to: `J0${j}`, lanes: [1, 1] }
  roads[`H${j}a`] = { from: `J0${j}`, to: `J1${j}`, lanes: [1, 1] }
  roads[`H${j}b`] = { from: `J1${j}`, to: `J2${j}`, lanes: [1, 1] }
})
const junctions = VX.flatMap((x, i) => HY.map((y, j) => ({ id: `J${i}${j}`, at: [x, y] as Point, i, j })))

export default {
  roadDefaults: { speed: 8, laneWidth: 7, bikeBand: false, sidewalk: 0, median: 0 },
  junctions: Object.fromEntries(junctions.map(({ id, at }) => [id, { type: 'priority', at }])),
  roads,
  levels: [
    {
      reveal: junctions.map(({ id }) => id),
      seed: 8,
      tools: [],
      demand: Object.fromEntries(
        GATEWAYS.map((g) => [g, { rate: 7, to: Object.fromEntries(GATEWAYS.filter((o) => o !== g).map((o) => [o, 1])) }]),
      ),
      initial: Object.fromEntries(
        junctions.map(({ id, i, j }) => [
          id,
          { priority: Object.fromEntries(MAIN[j].map((r) => [r[0] + i + r.slice(1), 'main' as const])) },
        ]),
      ),
      solution: [],
    },
  ],
} satisfies District
