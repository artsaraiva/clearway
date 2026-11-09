import { buildNetwork, type Connection, type Lane, type Network, type RoundaboutSpec } from './network'

export type Priority = 'yield' | 'stop' | 'signal'
export type Tool = 'connector' | 'priority'

export interface Level {
  seed: number
  /** Tools the player may use in this Level. */
  tools: Tool[]
  roundabout: RoundaboutSpec
  /** Per arm: arrivals per minute and destination weights. */
  demand: Record<string, { rate: number; to: Record<string, number> }>
  initial: {
    /** `fromPort>toPort` pairs enabled at every ring node. */
    connections: string[]
    priority: Record<string, Priority>
  }
}

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

export interface Vehicle {
  id: number
  type: VehicleType
  lane: Lane
  /** Front bumper position along the lane. */
  s: number
  v: number
  acc: number
  /** Speed the vehicle would drive here with no other traffic: braking for limits ahead, accelerating out of slow curves. */
  vFree: number
  /** vFree when it entered the current lane. */
  vFreeIn: number
  /** Lanes after the current one. */
  path: Lane[]
  dest: string
  /** Has made its full stop at a stop line. */
  stopped: boolean
  /** Held at the end of its lane this step. */
  waiting: boolean
}

export const DT = 1 / 30
export const WIN_FLOW = 0.8
export const WIN_TIME = 60
export const PREWARM = 90 // s the constructor simulates, so the jam has formed before anyone sees the Level; the win timer can't run during it (an empty map starts at full flow)
const FLOW_WINDOW = 20
const GAP_AFTER = 1.5 // s: a priority vehicle must reach the conflict point this long after me...
const GAP_BEFORE = 1.0 // ...or this long before me
const DECISION_DIST = 60
const HARD_BRAKE = 4 // closer to the line than this braking allows, a vehicle proceeds
const LOOKAHEAD = 150
const SIGNAL_GREEN = 15 // s of green per arm, in turn
const SPAWN_GAP = 3
const QUEUE_COST = 6.5 // m of trip length per vehicle already on an approach lane

export class Sim {
  readonly net: Network
  time = 0
  flow = 1
  won = false
  completed = 0
  vehicles: Vehicle[] = []
  /** Off-screen spawn queues per arm (destinations). */
  queues: Record<string, string[]> = {}
  priority: Record<string, Priority> = {}
  /** Sim-seconds the flow has stayed at or above WIN_FLOW. */
  sustained = 0
  private nextArrival: Record<string, number> = {}
  private rng: () => number
  private nextId = 1

  constructor(readonly level: Level) {
    this.net = buildNetwork(level.roundabout)
    this.rng = mulberry32(level.seed)
    this.reset()
    for (const arm of Object.keys(level.demand)) {
      this.queues[arm] = []
      this.nextArrival[arm] = this.interArrival(arm)
    }
    while (this.time < PREWARM) this.step()
  }

  /** Every Junction back to the Level's initial configuration; traffic keeps running. */
  reset() {
    this.sustained = 0 // ponytail: Flow's moving average lags ~20 s, so a long-held hold could still finish; fine while Win latches
    this.priority = { ...this.level.initial.priority }
    for (const node of this.net.nodes) {
      for (const c of node.connections) c.enabled = this.level.initial.connections.includes(`${c.fromPort}>${c.toPort}`)
    }
    for (const v of this.vehicles) this.plan(v)
  }

  connection(node: string, fromPort: string, toPort: string): Connection | undefined {
    return this.net.nodes.find((n) => n.arm === node)?.connections.find((c) => c.fromPort === fromPort && c.toPort === toPort)
  }

  setConnection(node: string, fromPort: string, toPort: string, on: boolean) {
    const c = this.connection(node, fromPort, toPort)
    if (!c) throw new Error(`no connection ${node}:${fromPort}>${toPort}`)
    c.enabled = on
    for (const v of this.vehicles) this.plan(v)
  }

  setPriority(arm: string, p: Priority) {
    this.priority[arm] = p
  }

  /** Fixed cycle: each arm of the junction gets green in turn (only signalized arms obey it). */
  isGreen(arm: string): boolean {
    const cycle = Object.keys(this.level.roundabout.arms)
    return cycle[Math.floor(this.time / SIGNAL_GREEN) % cycle.length] === arm
  }

  step() {
    this.spawn()
    for (const v of this.vehicles) v.acc = this.accel(v)
    for (const v of this.vehicles) {
      const nv = Math.max(0, v.v + v.acc * DT)
      v.s += ((v.v + nv) / 2) * DT
      v.v = nv
      if (v.waiting && v.v < 0.3 && v.lane.length - v.s < 2) v.stopped = true
    }
    const gone = new Set<Vehicle>()
    for (const lane of this.net.lanes) {
      while (lane.vehicles.length && lane.vehicles[0].s > lane.length) {
        const v = lane.vehicles[0]
        const next = v.path.shift()
        if (!next && lane.kind !== 'exit') {
          v.s = lane.length // dead end: hold at the end
          v.v = 0
          break
        }
        lane.vehicles.shift()
        if (!next) {
          gone.add(v)
          this.completed++
          continue
        }
        v.s -= lane.length
        v.lane = next
        v.stopped = false
        v.vFreeIn = v.vFree
        let i = next.vehicles.length
        while (i > 0 && next.vehicles[i - 1].s < v.s) i--
        next.vehicles.splice(i, 0, v)
      }
    }
    if (gone.size) this.vehicles = this.vehicles.filter((v) => !gone.has(v))

    let sum = 0
    let n = 0
    for (const v of this.vehicles) {
      sum += Math.min(1, v.v / v.vFree)
      n++
    }
    for (const q of Object.values(this.queues)) n += q.length // queued spawns count as speed 0
    this.flow += (((n ? sum / n : 1) - this.flow) * DT) / FLOW_WINDOW
    this.sustained = this.flow >= WIN_FLOW && this.time >= PREWARM ? this.sustained + DT : 0
    if (this.sustained >= WIN_TIME) this.won = true
    this.time += DT
  }

  /** Shortest lane path (excluding `from`) to any exit lane of `dest`, over enabled connections. */
  route(from: Lane, dest: string): Lane[] | null {
    const targets = new Set(this.net.exits[dest])
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
  private plan(v: Vehicle) {
    v.path = this.route(v.lane, v.dest) ?? []
  }

  private interArrival(arm: string) {
    return -Math.log(1 - this.rng()) / (this.level.demand[arm].rate / 60)
  }

  private spawn() {
    for (const [arm, { to }] of Object.entries(this.level.demand)) {
      const q = this.queues[arm]
      while (this.time >= this.nextArrival[arm]) {
        q.push(pick(Object.entries(to), this.rng))
        this.nextArrival[arm] += this.interArrival(arm)
      }
      while (q.length) {
        const lanes = this.net.approaches[arm]
        const options = lanes.flatMap((lane) => {
          const path = this.route(lane, q[0])
          return path ? [{ lane, path }] : []
        })
        // Unreachable destination: the car waits at spawn (counting 0) and holds the cars behind it.
        if (!options.length) break
        const free = options.filter(({ lane }) => {
          const r = lane.vehicles.at(-1)
          return !r || r.s - r.type.length >= SPAWN_GAP
        })
        if (!free.length) break
        // Shortest trip counting each vehicle already on the lane as queue length (gives natural lane discipline).
        const cost = (o: { lane: Lane; path: Lane[] }) => o.path.reduce((d, l) => d + l.length, 0) + QUEUE_COST * o.lane.vehicles.length
        const { lane, path } = free.reduce((a, b) => (cost(b) < cost(a) ? b : a))
        const type = pick(
          VEHICLE_TYPES.map((t) => [t, t.share]),
          this.rng,
        )
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
          dest: q.shift()!,
          stopped: false,
          waiting: false,
        }
        lane.vehicles.push(veh)
        this.vehicles.push(veh)
      }
    }
  }

  /** IDM against the nearest leader along the path, a merging committed vehicle, or the stop line. */
  private accel(v: Vehicle): number {
    const t = v.type
    const lanes = [v.lane, ...v.path]
    let v0 = Math.min(t.maxSpeed, v.lane.speedLimit)
    let gap = Infinity
    let lv = 0
    let base = -v.s
    for (let k = 0; k < lanes.length && base < LOOKAHEAD; k++) {
      const lane = lanes[k]
      if (k > 0) v0 = Math.min(v0, Math.sqrt(Math.min(t.maxSpeed, lane.speedLimit) ** 2 + 2 * t.decel * Math.max(0, base)))
      if (gap === Infinity) {
        const ahead = k === 0 ? lane.vehicles[lane.vehicles.indexOf(v) - 1] : lane.vehicles[lane.vehicles.length - 1]
        if (ahead) {
          gap = base + ahead.s - ahead.type.length
          lv = ahead.v
        }
        // Vehicles already inside the node on a lane merging into ours, closer to the merge point, go first.
        const dMe = base + lane.length
        for (const m of lane.conn?.merges ?? []) {
          for (const u of m.lane.vehicles) {
            const d2 = m.lane.length - u.s
            if (d2 > dMe || (d2 === dMe && u.id > v.id)) continue
            const g = dMe - d2 - u.type.length
            if (g < gap) {
              gap = g
              lv = u.v
            }
          }
        }
        // A vehicle standing in a crossing ahead blocks it, unless our front is already at or past it.
        for (const { other, s, otherS } of lane.conn?.conflicts ?? []) {
          if (other.to === lane.conn!.to || base + s < 1) continue
          if (other.lane.vehicles.some((u) => occupies(u, otherS)) && base + s - 1 < gap) {
            gap = base + s - 1
            lv = 0
          }
        }
      }
      base += lane.length
    }
    v.vFree = Math.min(v0, Math.sqrt(v.vFreeIn ** 2 + 2 * t.accel * Math.max(0, v.s)))
    v.waiting = this.mustStop(v)
    if (v.waiting) {
      const g = v.lane.length - v.s + t.minGap - 0.5
      if (g < gap) {
        gap = g
        lv = 0
      }
    }
    let a = t.accel * (1 - (v.v / v0) ** 4)
    if (gap < Infinity) {
      const sStar = t.minGap + Math.max(0, v.v * t.headway + (v.v * (v.v - lv)) / (2 * Math.sqrt(t.accel * t.decel)))
      a -= t.accel * (sStar / Math.max(gap, 0.1)) ** 2
    }
    return Math.max(a, -9)
  }

  /** Whether the front vehicle of a segment lane must hold at the line before entering its next connection. */
  private mustStop(v: Vehicle): boolean {
    const lane = v.lane
    if (lane.conn || lane.vehicles[0] !== v) return false
    const next = v.path[0]
    if (!next) return lane.kind !== 'exit'
    const c = next.conn!
    const dist = lane.length - v.s
    if (dist > DECISION_DIST || dist < (v.v * v.v) / (2 * HARD_BRAKE)) return false
    const rule = c.from.kind === 'approach' ? this.priority[c.from.arm] : 'yield'
    if (rule === 'signal') {
      // Green replaces the yield check: entrants force in and zip with ring traffic.
      if (!this.isGreen(c.from.arm)) return true
    } else {
      if (rule === 'stop' && !v.stopped) return true
      if (this.conflicting(v, c, dist)) return true
    }
    return !this.hasRoom(c, v)
  }

  /** Gap acceptance: is a higher-priority vehicle due at any conflict point of `c` too close to my own arrival? */
  private conflicting(v: Vehicle, c: Connection, dist: number): boolean {
    for (const { other: o, s, otherS } of c.conflicts) {
      if (rank(o) >= rank(c)) continue
      const tMe = eta(dist + s, v.v, v.type.accel, c.lane.speedLimit)
      const near = (u: Vehicle, d: number) => {
        if (u.v < 0.5) return false // held in a queue; crossing occupancy covers it if it moves off
        const tO = eta(d, u.v, u.type.accel, o.lane.speedLimit)
        return tO > tMe - GAP_BEFORE && tO < tMe + GAP_AFTER
      }
      for (const u of o.lane.vehicles) if (u.s < otherS && near(u, otherS - u.s)) return true
      for (const u of o.from.vehicles) if (u.path[0] === o.lane && near(u, o.from.length - u.s + otherS)) return true
      for (const f of o.from.feeders) {
        for (const u of f.vehicles) {
          if (u.path[0] === o.from && u.path[1] === o.lane && near(u, f.length - u.s + o.from.length + otherS)) return true
        }
      }
    }
    return false
  }

  /** Don't block the box: enter only if the outgoing lane has room for us behind whoever is already headed there. */
  private hasRoom(c: Connection, v: Vehicle): boolean {
    const r = c.to.vehicles.at(-1)
    if (r && r.v > 2) return true
    let free = r ? r.s - r.type.length : Infinity
    for (const u of c.lane.vehicles) free -= u.type.length + u.type.minGap
    for (const m of c.merges) for (const u of m.lane.vehicles) free -= u.type.length + u.type.minGap
    return free >= v.type.length + v.type.minGap
  }
}

const occupies = (u: Vehicle, at: number) => u.s > at - 1 && u.s - u.type.length < at + 1

/** Lower rank has priority: ring beats entering traffic; within each, the outer (lower index) lane wins. */
const rank = (c: Connection) => (c.from.kind === 'ring' ? 0 : 10) + c.from.index

/** Time to cover d starting at v, accelerating (or braking) at a towards vmax. */
function eta(d: number, v: number, a: number, vmax: number): number {
  if (v > vmax) {
    const dDec = (v * v - vmax * vmax) / (2 * a)
    if (d <= dDec) return (v - Math.sqrt(v * v - 2 * a * d)) / a
    return (v - vmax) / a + (d - dDec) / vmax
  }
  const tAcc = (vmax - v) / a
  const dAcc = v * tAcc + 0.5 * a * tAcc * tAcc
  if (d <= dAcc) return (Math.sqrt(v * v + 2 * a * d) - v) / a
  return tAcc + (d - dAcc) / vmax
}

function pick<T>(entries: [T, number][], rng: () => number): T {
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [item, w] of entries) if ((r -= w) < 0) return item
  return entries[entries.length - 1][0]
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
