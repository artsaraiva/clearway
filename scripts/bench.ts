// Dev script, not a test: ms of simulation per frame at 8× with 1,000 vehicles on a 4-Junction District.
// The gate (.scratch/road-network/spec.md): within 4 ms per frame on the main thread, or the sim moves to a web worker.
import type { District } from '../src/sim/district'
import { DT, Sim } from '../src/sim/sim'

const VEHICLES = 1000
const STEPS_PER_FRAME = 8 / 60 / DT // 8 sim-seconds per second, drawn at 60 Hz
const FRAMES = 300

const GATEWAYS = ['AW', 'AS', 'BE', 'BS', 'CW', 'CN', 'DE', 'DN']
const others = (gateway: string) => Object.fromEntries(GATEWAYS.filter((g) => g !== gateway).map((g) => [g, 1]))

/** A 2 × 2 grid, roundabouts and crossroads on opposite corners, with enough Demand to fill its Roads. */
const district: District = {
  roadDefaults: { speed: 13.9, laneWidth: 3.5, bikeBand: false, sidewalk: 0, median: 0 },
  junctions: {
    A: { type: 'roundabout', at: [0, 0], radius: 40, ringLanes: 2 },
    B: { type: 'priority', at: [500, 0] },
    C: { type: 'priority', at: [0, 500] },
    D: { type: 'roundabout', at: [500, 500], radius: 40, ringLanes: 2 },
  },
  roads: {
    AB: { from: 'A', to: 'B', lanes: [2, 2] },
    AC: { from: 'A', to: 'C', lanes: [2, 2] },
    BD: { from: 'B', to: 'D', lanes: [2, 2] },
    CD: { from: 'C', to: 'D', lanes: [2, 2] },
    AW: { from: [-500, 0], to: 'A', lanes: [2, 2] },
    AS: { from: [0, -500], to: 'A', lanes: [2, 2] },
    BE: { from: [1000, 0], to: 'B', lanes: [2, 2] },
    BS: { from: [500, -500], to: 'B', lanes: [2, 2] },
    CW: { from: [-500, 500], to: 'C', lanes: [2, 2] },
    CN: { from: [0, 1000], to: 'C', lanes: [2, 2] },
    DE: { from: [1000, 500], to: 'D', lanes: [2, 2] },
    DN: { from: [500, 1000], to: 'D', lanes: [2, 2] },
  },
  levels: [
    {
      reveal: ['A', 'B', 'C', 'D'],
      seed: 1,
      tools: [],
      demand: Object.fromEntries(GATEWAYS.map((g) => [g, { rate: 40, to: others(g) }])),
      initial: {},
      solution: [],
      slab: { x0: -500, y0: -500, x1: 1000, y1: 1000 },
    },
  ],
}

const sim = new Sim(district)
while (sim.vehicles.length < VEHICLES && sim.time < 3600) sim.step()
const vehicles = sim.vehicles.length
const start = performance.now()
for (let i = 0; i < FRAMES * STEPS_PER_FRAME; i++) sim.step()
const ms = (performance.now() - start) / FRAMES
console.log(`${ms.toFixed(2)} ms per frame at 8× (${vehicles}–${sim.vehicles.length} vehicles, ${sim.net.junctions.length} Junctions)`)
if (vehicles < VEHICLES) console.log(`the District only filled to ${vehicles} vehicles: raise its Demand to bench ${VEHICLES}`)
