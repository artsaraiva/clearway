import { Demand, type VehicleType } from './demand'
import { validateDistrict, revealed, type Change, type District, type Level, type Priority } from './district'
import { accel } from './driving'
import { measure, PREWARM } from './metric'
import { applyChange, buildNetwork, type Arm, type Connection, type Lane, type Network } from './network'
import { replan, route } from './routing'

export { VEHICLE_TYPES, type VehicleType } from './demand'
export { PREWARM, WIN_FLOW, WIN_TIME } from './metric'

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
  /** Held at the end of its lane this step. */
  waiting: boolean
}

export const DT = 1 / 30

export class Sim {
  readonly net: Network
  readonly level: Level
  time = 0
  flow = 1
  won = false
  completed = 0
  vehicles: Vehicle[] = []
  /** Sim-seconds the flow has stayed at or above WIN_FLOW. */
  sustained = 0
  private demand: Demand
  /** The configuration at the Reveal, which Reset returns to. */
  private atReveal: { enabled: Set<Connection>; priority: Map<Arm, Priority> }

  /**
   * Reveal Level `levelIndex` of a District and Pre-warm it. `carried` is the configuration brought over from earlier
   * Levels, as Changes on top of their initial configurations: the earlier Sim's `configuration()`, or reference
   * solutions.
   */
  constructor(
    readonly district: District,
    levelIndex = 0,
    carried: Change[] = [],
  ) {
    validateDistrict(district)
    const levels = district.levels.slice(0, levelIndex + 1)
    this.level = levels[levelIndex]
    this.net = buildNetwork(district, revealed(district, levelIndex))
    const initial = (level: Level) => Object.entries(level.initial).map(([at, initial]) => ({ at, ...initial }))
    // Earlier Levels' Junctions as the player left them, then this Level's initial configuration on top.
    for (const change of [...levels.slice(0, -1).flatMap(initial), ...carried, ...initial(this.level)]) applyChange(this.net, change)
    const arms = this.arms()
    this.atReveal = {
      enabled: new Set(arms.flatMap((a) => a.connections).filter((c) => c.enabled)),
      priority: new Map(arms.map((a) => [a, a.priority])),
    }
    this.demand = new Demand(this.level.demand, this.level.seed)
    while (this.time < PREWARM) this.step()
  }

  /** Off-screen spawn queues per Gateway. */
  get queues() {
    return this.demand.queues
  }

  /** Every Junction back to its configuration at the Reveal; traffic keeps running. */
  reset() {
    this.sustained = 0 // ponytail: Flow's moving average lags ~20 s, so a long-held hold could still finish; fine while Win latches
    for (const arm of this.arms()) {
      arm.priority = this.atReveal.priority.get(arm)!
      for (const c of arm.connections) c.enabled = this.atReveal.enabled.has(c)
    }
    replan(this.net, this.vehicles)
  }

  /**
   * The configuration of every Junction as it stands, as Changes: what the next Reveal carries over. Connection refs
   * and Road ids are stable across Reveals.
   */
  configuration(): Change[] {
    return this.net.junctions.map((j) => {
      const refs = (on: boolean) => j.arms.flatMap((a) => a.connections.filter((c) => c.enabled === on).map((c) => c.ref))
      const priority = Object.fromEntries(j.arms.map((a) => [a.road, a.priority]))
      return { at: j.id, enable: refs(true), disable: refs(false), ...(j.type === 'priority' && { priority }) }
    })
  }

  /** Make a Change; every vehicle re-plans. */
  apply(change: Change) {
    applyChange(this.net, change)
    replan(this.net, this.vehicles)
  }

  private arms(): Arm[] {
    return this.net.junctions.flatMap((j) => j.arms)
  }

  step() {
    this.vehicles.push(...this.demand.spawn(this.net, this.time))
    for (const v of this.vehicles) v.acc = accel(v)
    for (const v of this.vehicles) {
      const nv = Math.max(0, v.v + v.acc * DT)
      v.s += ((v.v + nv) / 2) * DT
      v.v = nv
    }
    const gone = new Set<Vehicle>()
    for (const lane of this.net.lanes) {
      while (lane.vehicles.length && lane.vehicles[0].s > lane.length) {
        const v = lane.vehicles[0]
        const next = v.path.shift()
        if (!next && !lane.toGateway) {
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
        v.vFreeIn = v.vFree
        let i = next.vehicles.length
        while (i > 0 && next.vehicles[i - 1].s < v.s) i--
        next.vehicles.splice(i, 0, v)
      }
    }
    if (gone.size) this.vehicles = this.vehicles.filter((v) => !gone.has(v))

    measure(
      this,
      this.vehicles,
      Object.values(this.queues).reduce((n, q) => n + q.length, 0),
      this.time,
      DT,
    )
    this.time += DT
  }

  /** Fastest free-flow lane path (excluding `from`) to an Exit lane of the Gateway `dest`, over enabled Connections. */
  route(from: Lane, dest: string): Lane[] | null {
    return route(this.net, from, dest)
  }
}
