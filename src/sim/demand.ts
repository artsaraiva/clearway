import type { Level } from './district'
import { yieldSpeed } from './driving'
import type { Lane, Network } from './network'
import { route, travelTime } from './routing'
import type { Vehicle } from './sim'

export interface VehicleType {
  id: string
  length: number
  accel: number
  decel: number
  headway: number
  minGap: number
  maxSpeed: number
  share: number
}

/** One row per vehicle type: adding types is data, not code. */
export const VEHICLE_TYPES: VehicleType[] = [
  { id: 'car', length: 4.5, accel: 2, decel: 2.5, headway: 1.0, minGap: 2, maxSpeed: 15, share: 1 },
]

/** A vehicle waiting off-screen to enter the map. */
export interface Arrival {
  dest: string
  type: VehicleType
}

const SPAWN_GAP = 3
const QUEUE_COST = 0.5 // s of trip time per vehicle already on an Approach lane

/** Arrivals at each Gateway and their spawn onto the map. Owns the Level's random stream. */
export class Demand {
  /** Off-screen spawn queues per Gateway. */
  readonly queues: Record<string, Arrival[]> = {}
  private nextArrival: Record<string, number> = {}
  private rng: () => number
  private nextId = 1

  constructor(
    private readonly demand: Level['demand'],
    seed: number,
  ) {
    this.rng = mulberry32(seed)
    for (const gateway of Object.keys(demand)) {
      this.queues[gateway] = []
      this.nextArrival[gateway] = this.interArrival(gateway)
    }
  }

  /** Queue every arrival due by `time`, then move queue heads onto free Approach lanes. Returns the vehicles that entered the map. */
  spawn(net: Network, time: number): Vehicle[] {
    const spawned: Vehicle[] = []
    for (const [gateway, { to }] of Object.entries(this.demand)) {
      const q = this.queues[gateway]
      while (time >= this.nextArrival[gateway]) {
        // Destination and type are drawn together, so the random stream depends only on time and seed.
        const dest = pick(Object.entries(to), this.rng)
        q.push({
          dest,
          type: pick(
            VEHICLE_TYPES.map((t) => [t, t.share]),
            this.rng,
          ),
        })
        this.nextArrival[gateway] += this.interArrival(gateway)
      }
      while (q.length) {
        const lanes = net.gateways[gateway].approach
        const options = lanes.flatMap((lane) => {
          const path = route(net, lane, q[0].dest)
          return path ? [{ lane, path }] : []
        })
        // Unreachable destination: the car waits at spawn (counting 0) and holds the cars behind it.
        if (!options.length) break
        const free = options.filter(({ lane }) => {
          const r = lane.vehicles.at(-1)
          return !r || r.s - r.type.length >= SPAWN_GAP
        })
        if (!free.length) break
        // Fastest trip counting each vehicle already on the lane as queue time (gives natural lane discipline).
        const cost = (o: { lane: Lane; path: Lane[] }) =>
          o.path.reduce((t, l) => t + travelTime(l), 0) + QUEUE_COST * o.lane.vehicles.length
        const { lane, path } = free.reduce((a, b) => (cost(b) < cost(a) ? b : a))
        const { type } = q[0]
        const r = lane.vehicles.at(-1)
        const v = r
          ? Math.min(lane.speedLimit, r.v + Math.sqrt(2 * type.decel * Math.max(0, r.s - r.type.length - type.minGap)))
          : lane.speedLimit
        const veh: Vehicle = {
          id: this.nextId++,
          type,
          lane,
          s: 0,
          v,
          acc: 0,
          vFree: lane.speedLimit,
          vFreeIn: lane.speedLimit,
          path,
          dest: q.shift()!.dest,
          waiting: false,
        }
        veh.v = Math.min(veh.v, yieldSpeed(veh)) // a Road that must yield is entered at the speed it is driven at
        lane.vehicles.push(veh)
        spawned.push(veh)
      }
    }
    return spawned
  }

  private interArrival(gateway: string) {
    return -Math.log(1 - this.rng()) / (this.demand[gateway].rate / 60)
  }
}

function pick<T>(entries: [T, number][], rng: () => number): T {
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [item, w] of entries) if ((r -= w) < 0) return item
  return entries[entries.length - 1][0]
}

/** A random stream in [0, 1) that depends only on its seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
