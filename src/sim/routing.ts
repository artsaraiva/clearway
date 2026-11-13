import type { Lane, Network } from './network'
import type { Vehicle } from './sim'

/** Free-flow seconds to drive a lane end to end. */
export const travelTime = (lane: Lane) => lane.length / lane.speedLimit

/** Per network and destination Gateway: `timesTo`, valid until the enabled Connections change. */
const cache = new WeakMap<Network, Map<string, Map<Lane, number>>>()

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
  const open = new Map(net.gateways[dest].exit.map((l) => [l, travelTime(l)]))
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
    // A vehicle already on a disabled Connection's lane still finishes it; nothing new enters it.
    const before = lane.conn ? (lane.conn.enabled ? [lane.conn.from] : []) : lane.feeders
    for (const l of before) {
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
  const exits = net.gateways[dest].exit
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
