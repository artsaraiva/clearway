import type { Lane, Network } from './network'
import type { Vehicle } from './sim'

/** Shortest lane path (excluding `from`) to any Exit lane of the Gateway `dest`, over enabled Connections. */
export function route(net: Network, from: Lane, dest: string): Lane[] | null {
  const targets = new Set(net.gateways[dest].exit)
  if (targets.has(from)) return []
  const prev = new Map<Lane, Lane>([[from, from]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const lane = queue[i]
    const nexts = lane.conn ? [lane.conn.to] : lane.next.filter((c) => c.enabled).map((c) => c.lane)
    for (const n of nexts) {
      if (prev.has(n)) continue
      prev.set(n, lane)
      if (targets.has(n)) {
        const path = [n]
        for (let l = lane; l !== from; l = prev.get(l)!) path.unshift(l)
        return path
      }
      queue.push(n)
    }
  }
  return null
}

/** No re-roll: a vehicle whose destination is unreachable holds at the end of its lane until a Change reconnects it. */
export function plan(net: Network, v: Vehicle) {
  v.path = route(net, v.lane, v.dest) ?? []
}
