import { Demand, type VehicleType } from './demand'
import { accel } from './driving'
import { measure, PREWARM } from './metric'
import { buildNetwork, type Connection, type Lane, type Network, type RoundaboutSpec } from './network'
import { plan, route } from './routing'

export { VEHICLE_TYPES, type VehicleType } from './demand'
export { PREWARM, WIN_FLOW, WIN_TIME } from './metric'

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
const SIGNAL_GREEN = 15 // s of green per arm, in turn

export class Sim {
  readonly net: Network
  time = 0
  flow = 1
  won = false
  completed = 0
  vehicles: Vehicle[] = []
  priority: Record<string, Priority> = {}
  /** Sim-seconds the flow has stayed at or above WIN_FLOW. */
  sustained = 0
  private demand: Demand

  constructor(readonly level: Level) {
    this.net = buildNetwork(level.roundabout)
    this.reset()
    this.demand = new Demand(level.demand, level.seed)
    while (this.time < PREWARM) this.step()
  }

  /** Off-screen spawn queues per arm. */
  get queues() {
    return this.demand.queues
  }

  /** Every Junction back to the Level's initial configuration; traffic keeps running. */
  reset() {
    this.sustained = 0 // ponytail: Flow's moving average lags ~20 s, so a long-held hold could still finish; fine while Win latches
    this.priority = { ...this.level.initial.priority }
    for (const node of this.net.nodes) {
      for (const c of node.connections) c.enabled = this.level.initial.connections.includes(`${c.fromPort}>${c.toPort}`)
    }
    for (const v of this.vehicles) plan(this.net, v)
  }

  connection(node: string, fromPort: string, toPort: string): Connection | undefined {
    return this.net.nodes.find((n) => n.arm === node)?.connections.find((c) => c.fromPort === fromPort && c.toPort === toPort)
  }

  setConnection(node: string, fromPort: string, toPort: string, on: boolean) {
    const c = this.connection(node, fromPort, toPort)
    if (!c) throw new Error(`no connection ${node}:${fromPort}>${toPort}`)
    c.enabled = on
    for (const v of this.vehicles) plan(this.net, v)
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
    this.vehicles.push(...this.demand.spawn(this.net, this.time))
    for (const v of this.vehicles) v.acc = accel(v, this)
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

    measure(this, this.vehicles, Object.values(this.queues).reduce((n, q) => n + q.length, 0), this.time, DT)
    this.time += DT
  }

  /** Shortest lane path (excluding `from`) to any exit lane of `dest`, over enabled connections. */
  route(from: Lane, dest: string): Lane[] | null {
    return route(this.net, from, dest)
  }
}
