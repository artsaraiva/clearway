import { beyond, DIRECTIONS, hasRoad, type Cell, type City, type Direction } from '../city/city'
import { GATEWAY_DEMAND } from '../tuning'
import type { Bounds } from './geometry'
import type { Network } from './network'
import { route } from './routing'
import type { DemandSpec, NetworkSpec, Point, RoadAttributes } from './spec'

// How a City becomes a network (ADR 0004): every Tile is one Junction at its cell's centre, every road edge two Tiles
// share is one Road between their Junctions, and a road edge with no Tile beyond is a Road to the cell's edge, whose
// end is a Gateway.

/** Side of a cell, m. */
export const CELL = 100
const ROADS: RoadAttributes = { speed: 13.9, laneWidth: 7, bikeBand: false, sidewalk: 0, median: 0 }
/** Every Road is two lanes each way. */
const LANES: [number, number] = [2, 2]
// The widest Ring that leaves a Road to the cell's edge the 10 m of lane a Road needs.
const ROUNDABOUT = { radius: 23, ringLanes: 2 }

const centre = (cell: Cell): Point => [cell.x * CELL, cell.y * CELL]

/** The ground a cell covers. */
export function cellBounds(cell: Cell): Bounds {
  const [x, y] = centre(cell)
  return { x0: x - CELL / 2, y0: y - CELL / 2, x1: x + CELL / 2, y1: y + CELL / 2 }
}

/** The cell a point lies on. */
export const cellAt = (p: { x: number; y: number }): Cell => ({ x: Math.round(p.x / CELL), y: Math.round(p.y / CELL) })

/** The id of the Junction of the Tile on `cell`. It never changes, whatever is placed around the Tile. */
export const junctionId = (cell: Cell) => `c${cell.x}_${cell.y}`

/**
 * The Road across side `d` of `cell`, named by that cell edge: `h` across the east side of the cell it is named
 * after, `v` across its north side. It runs west to east or south to north, so its id and its lanes' ids stay the
 * same whether its far end is a Gateway or a Tile.
 */
function roadAcross(cell: Cell, d: Direction) {
  const [from, to] = d < 2 ? [cell, beyond(cell, d)] : [beyond(cell, d), cell]
  return { id: `${d % 2 ? 'v' : 'h'}${from.x}_${from.y}`, from, to }
}

/** The Junctions and Roads of a City. */
export function networkSpec(city: City): NetworkSpec {
  const placed = new Set(city.tiles.map((t) => junctionId(t.cell)))
  const spec: NetworkSpec = { roadDefaults: ROADS, junctions: {}, roads: {} }
  for (const tile of city.tiles) {
    const at = centre(tile.cell)
    spec.junctions[junctionId(tile.cell)] =
      tile.layout.id === 'roundabout' ? { type: 'roundabout', at, ...ROUNDABOUT } : { type: 'priority', at }
    for (const d of DIRECTIONS) {
      if (!hasRoad(tile, d)) continue
      const road = roadAcross(tile.cell, d)
      const [nx, ny] = centre(beyond(tile.cell, d))
      const edge: Point = [(at[0] + nx) / 2, (at[1] + ny) / 2]
      const end = (cell: Cell) => (placed.has(junctionId(cell)) ? junctionId(cell) : edge)
      spec.roads[road.id] = { from: end(road.from), to: end(road.to), lanes: LANES }
    }
  }
  return spec
}

/** A Gateway's weight, drawn by its Road's id: fixed by where the Gateway is, whatever is placed elsewhere. */
function weight(road: string, weights: number[]) {
  let h = 2166136261
  for (const ch of road) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return weights[(h >>> 8) % weights.length]
}

/**
 * The Demand of a City on its network `net`: each Gateway sends its own rate, split evenly between the other Gateways
 * a car can drive to with the Connections as they stand. A Gateway that reaches no other sends nothing.
 */
export function gatewayDemand(city: City, net: Network, tuning = GATEWAY_DEMAND): DemandSpec {
  const gateways = Object.keys(net.gateways)
  const growth = 1 + tuning.growth * (city.tiles.length - 1)
  const demand: DemandSpec = {}
  for (const from of gateways) {
    const reached = gateways.filter((to) => to !== from && net.gateways[from].approach.some((lane) => route(net, lane, to)))
    if (!reached.length) continue
    demand[from] = { rate: tuning.base * weight(from, tuning.weights) * growth, to: Object.fromEntries(reached.map((to) => [to, 1])) }
  }
  return demand
}
