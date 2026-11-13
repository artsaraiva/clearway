import type { District, Point, RoadSpec } from '../sim/district'

// ponytail: a dev fixture, not a playable District. It is the visual-style prototype's 3×3 street grid with 7 m lanes,
// opened with `?district=grid` to check the renderer on Priority junctions while District 1 is a single roundabout.
// Each Level Reveals one column of Junctions, west to east, to check the Reveal animation; `?level=3` opens the whole
// grid. Its Levels are not tuned and have no solutions, so `N` Reveals the next one without a Win. Delete it when #33
// settles a real street-grid District.
const VX = [-88, -32, 24] // the three north–south streets
const HY = [80, 16, -48] // the three east–west streets
const EDGE = 130
// By Level: the Gateways once its column is Revealed. The Roads into the next column end at a Gateway until then.
const GATEWAYS = [
  ['N0', 'S0', 'W0', 'W1', 'W2', 'H0a', 'H1a', 'H2a'],
  ['N0', 'N1', 'S0', 'S1', 'W0', 'W1', 'W2', 'H0b', 'H1b', 'H2b'],
  ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'W0', 'W1', 'W2', 'E0'],
]
// Where each column's piece of slab meets the next: where the Roads into the next column end, 12 m short of its
// Junctions (their footprint, with 7 m lanes).
const SEAMS = [-EDGE, VX[1] - 12, VX[2] - 12, EDGE]
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
  // The prototype's authored scenery: Hikari Tower on its plaza, Kumo Park, and Sakura Avenue down the middle.
  scenery: {
    theme: 'city',
    seed: 20261113,
    landmarks: [{ type: 'tower', name: 'Hikari Tower', at: [-4, -20] }],
    blocks: [
      { type: 'plaza', at: [-4, -16] },
      { type: 'park', name: 'Kumo Park', at: [-58, -96] },
    ],
    streets: {
      ...Object.fromEntries(
        ['Hoshi-dori', 'Sakura Avenue', 'Kawabata St'].flatMap((name, i) => [`N${i}`, `V${i}a`, `V${i}b`, `S${i}`].map((r) => [r, name])),
      ),
      ...Object.fromEntries(
        ['Asagiri Rd', 'Tsuki-dori', 'Midori St'].flatMap((name, j) => [`W${j}`, `H${j}a`, `H${j}b`].map((r) => [r, name])),
      ),
      E0: 'Asagiri Rd',
    },
    avenues: ['N1', 'V1a', 'V1b', 'S1'],
  },
  levels: VX.map((_, i) => ({
    reveal: junctions.filter((junction) => junction.i === i).map(({ id }) => id),
    seed: 8,
    tools: [],
    demand: Object.fromEntries(
      GATEWAYS[i].map((g) => [g, { rate: 7, to: Object.fromEntries(GATEWAYS[i].filter((o) => o !== g).map((o) => [o, 1])) }]),
    ),
    initial: Object.fromEntries(
      junctions
        .filter((junction) => junction.i === i)
        .map(({ id, j }) => [id, { priority: Object.fromEntries(MAIN[j].map((r) => [r[0] + i + r.slice(1), 'main' as const])) }]),
    ),
    solution: [],
    slab: { x0: SEAMS[i], y0: -EDGE, x1: SEAMS[i + 1], y1: EDGE },
  })),
} satisfies District
