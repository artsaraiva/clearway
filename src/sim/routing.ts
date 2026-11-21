import type { Lane, Network } from './network'
import type { Vehicle } from './sim'

/** Free-flow seconds to drive a lane end to end. */
export const travelTime = (lane: Lane) => lane.length / lane.speedLimit

/** Per network and destination Gateway: `timesTo`, valid until the enabled Connections change. */
const cache = new WeakMap<Network, Map<string, Map<Lane, number>>>()

/**
 * The lanes a car can drive onto `lane` from. A vehicle already on a disabled Connection's lane still finishes it;
 * nothing new enters it.
 */
/**
 * PROTOTYPE (#303): where a trip to `dest` ends. A Gateway's Exit lanes, or, for a Tile named by its Junction's id, the
 * Road lanes that run into that Junction, on which the car turns off. None if `dest` is neither.
 */
const targets = (net: Network, dest: string): Lane[] =>
  net.gateways[dest]?.exit ?? net.junctions.find((j) => j.id === dest)?.arms.flatMap((a) => a.approach) ?? []

/** PROTOTYPE (#303): free-flow seconds from the start of `from` to the end of its trip to `dest`, or Infinity. */
export const timeTo = (net: Network, from: Lane, dest: string) => timesTo(net, dest).get(from) ?? Infinity

const entries = (lane: Lane) => (lane.conn ? (lane.conn.enabled ? [lane.conn.from] : []) : lane.feeders)

/**
 * Every lane from which a car can drive to an Exit lane of the Gateway `dest` over enabled Connections: the lanes
 * `timesTo` times, found without timing them.
 */
export function lanesTo(net: Network, dest: string): Set<Lane> {
  const reached = new Set(targets(net, dest))
  // A Set's iterator visits what is added while it runs, so this walks back from the Exit lanes to every lane in reach.
  for (const lane of reached) for (const l of entries(lane)) reached.add(l)
  return reached
}

/**
 * Free-flow seconds from the start of each lane to the end of the nearest Exit lane of the Gateway `dest`, over
 * enabled Connections (Dijkstra backwards from the Exit lanes). A lane that can't reach `dest` has no entry.
 */
function timesTo(net: Network, dest: string): Map<Lane, number> {
  let byDest = cache.get(net)
  if (!byDest) cache.set(net, (byDest = new Map()))
  let times = byDest.get(dest)
  if (times) return times
  byDest.set(dest, (times = new Map()))
  const open = new Map(targets(net, dest).map((l) => [l, travelTime(l)]))
  // ponytail: the open set is scanned for its minimum, O(lanes²) per destination and Change; fine for a City of
  // a few hundred lanes, swap in a heap if re-planning shows up in `npm run bench`
  while (open.size) {
    let lane!: Lane
    let best = Infinity
    for (const [l, t] of open) {
      if (t < best) {
        lane = l
        best = t
      }
    }
    open.delete(lane)
    times.set(lane, best)
    for (const l of entries(lane)) {
      const t = best + travelTime(l)
      if (!times.has(l) && t < (open.get(l) ?? Infinity)) open.set(l, t)
    }
  }
  return times
}

/**
 * Lane path (excluding `from`) to an Exit lane of the Gateway `dest` with the shortest free-flow travel time over
 * enabled Connections. Ties go to the first lane in lane order.
 */
export function route(net: Network, from: Lane, dest: string): Lane[] | null {
  const times = timesTo(net, dest)
  if (!times.has(from)) return null
  const exits = targets(net, dest)
  const path: Lane[] = []
  for (let lane = from; !exits.includes(lane); path.push(lane)) {
    const nexts = lane.conn ? [lane.conn.to] : lane.next.filter((c) => c.enabled).map((c) => c.lane)
    lane = nexts.reduce((a, b) => ((times.get(b) ?? Infinity) < (times.get(a) ?? Infinity) ? b : a))
  }
  return path
}

/**
 * Re-plan every vehicle after the enabled Connections changed. A vehicle that can no longer reach its destination
 * heads for the nearest Gateway it can reach, so it doesn't block its lane for good; with none in reach it holds at
 * the end of its lane.
 */
export function replan(net: Network, vehicles: Vehicle[]) {
  cache.delete(net)
  const gateways = Object.keys(net.gateways)
  for (const v of vehicles) {
    const time = (dest: string) => timesTo(net, dest).get(v.lane) ?? Infinity
    const nearest = gateways.reduce((a, b) => (time(b) < time(a) ? b : a))
    v.path = route(net, v.lane, v.dest) ?? route(net, v.lane, nearest) ?? []
  }
}
