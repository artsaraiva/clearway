import { City } from '../city/city'
import { Demand, type VehicleType } from './demand'
import { accel } from './driving'
import { measure, measureJams, PREWARM, type Approaches } from './metric'
import { applyChange, buildNetwork, type Arm, type Connection, type Junction, type Lane, type Network } from './network'
import { replan, route } from './routing'
import type { Change, DemandSpec, NetworkSpec, Priority, Scenario } from './spec'
import { gatewayDemand, networkSpec } from './tiles'

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
  /** The Junctions and Roads the network was built from. */
  readonly spec: NetworkSpec
  readonly net: Network
  /** Trips per minute from each Gateway, fixed until the next Rebuild. */
  readonly rates: DemandSpec
  time = 0
  flow = 1
  completed = 0
  vehicles: Vehicle[] = []
  /**
   * The trips each Junction has served since the Sim was built, by its index in `net.junctions`: each trip that left a
   * Road for the Junction's own lanes while it had no Jam. A Tile grows on its Junction's (ADR 0005).
   */
  readonly served: Uint32Array
  private demand: Demand
  /** Every Junction's default configuration, which Reset returns to. */
  private defaults: { enabled: Set<Connection>; priority: Map<Arm, Priority> }
  /** How the traffic into each Junction moves, which says where the Jams are. */
  private approaches: Approaches[]
  /** Each Junction's index in `net.junctions`, by its id. */
  private junctionIndex: Map<string, number>

  /**
   * Build the simulation of a City and Pre-warm it (ADR 0002). `carried` is the configuration brought over from the
   * Sim before, as Changes on top of every Junction's default: that Sim's `configuration()`. Demand comes from the
   * City's Gateways, and `seed` picks the random stream. With `prewarm: false` the caller runs the Pre-warm, stepping
   * until `prewarmed`, so it can be spread over frames. A Scenario in place of the City brings its own Demand. With
   * `conflicts: false` the network leaves out where Connections meet, which only driving needs: such a Sim is built
   * quickly, to read its network and Demand, and must not be stepped.
   */
  constructor(source: City | Scenario, carried: Change[] = [], seed = 1, { prewarm = true, conflicts = true } = {}) {
    this.spec = source instanceof City ? networkSpec(source) : source.network
    this.net = buildNetwork(this.spec, { conflicts })
    const arms = this.arms()
    this.defaults = {
      enabled: new Set(arms.flatMap((a) => a.connections).filter((c) => c.enabled)),
      priority: new Map(arms.map((a) => [a, a.priority])),
    }
    for (const change of carried) applyChange(this.net, change)
    // After the Changes: a Gateway only sends trips to the Gateways it can reach as the Connections stand.
    this.rates = source instanceof City ? gatewayDemand(source, this.net) : source.demand
    for (const id of [...Object.keys(this.rates), ...Object.values(this.rates).flatMap((d) => Object.keys(d.to))]) {
      if (!this.net.gateways[id])
        throw new Error(`Demand names "${id}", which is not a Gateway (Gateways: ${Object.keys(this.net.gateways).join(', ')})`)
    }
    this.demand = new Demand(this.rates, seed)
    this.approaches = this.net.junctions.map((junction) => ({
      junction,
      lanes: junction.arms.flatMap((a) => a.approach),
      flow: 1,
      jammed: false,
      hold: 0,
    }))
    this.served = new Uint32Array(this.net.junctions.length)
    this.junctionIndex = new Map(this.net.junctions.map((j, i) => [j.id, i]))
    if (prewarm) while (!this.prewarmed) this.step()
  }

  /**
   * The Junctions with a Jam: their Approaches have moved under half their free speed for a stretch of time, which a
   * standing queue does and traffic that keeps moving does not. The reading is held, so a Junction does not flicker in
   * and out of the list. It runs through the Pre-warm, so a City's Jams are known as soon as its traffic shows.
   */
  get jams(): Junction[] {
    return this.approaches.filter((a) => a.jammed).map((a) => a.junction)
  }

  /** Whether the Pre-warm is done, so the traffic can be shown. */
  get prewarmed() {
    return this.time >= PREWARM
  }

  /** Off-screen spawn queues per Gateway. */
  get queues() {
    return this.demand.queues
  }

  /** The Junction `at` back to its default configuration. Every other Junction keeps its Changes, and traffic keeps running. */
  reset(at: string) {
    const junction = this.net.junctions.find((j) => j.id === at)
    if (!junction) throw new Error(`"${at}" is not a Junction of the network`)
    for (const arm of junction.arms) {
      arm.priority = this.defaults.priority.get(arm)!
      for (const c of arm.connections) c.enabled = this.defaults.enabled.has(c)
    }
    replan(this.net, this.vehicles)
  }

  /**
   * The configuration of every Junction as it stands, as Changes: what the next Rebuild carries over. Connection refs
   * and Road ids are stable across Rebuilds.
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
        // A trip a Junction serves: it leaves a Road for the Junction's own lanes while the Junction has no Jam. A
        // roundabout's Ring counts it once, as it comes on.
        // ponytail: trips run only Gateway to Gateway, so a Tile that no route passes through serves none and never
        // grows, a dead end or a quiet corner included. #95 makes trips start and end at Tiles, which gives every
        // Tile trips of its own to grow on.
        if ('junction' in next.owner && !('junction' in lane.owner)) {
          const k = this.junctionIndex.get(next.owner.junction)!
          if (!this.approaches[k].jammed) this.served[k]++
        }
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
      DT,
    )
    measureJams(this.approaches, DT)
    this.time += DT
  }

  /** Fastest free-flow lane path (excluding `from`) to an Exit lane of the Gateway `dest`, over enabled Connections. */
  route(from: Lane, dest: string): Lane[] | null {
    return route(this.net, from, dest)
  }
}
