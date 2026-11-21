import { City } from '../city/city'
import { Demand, type VehicleType } from './demand'
import { accel } from './driving'
import { measure, measureJams, PREWARM, type Approaches } from './metric'
import { applyChange, buildNetwork, type Arm, type Connection, type Junction, type Lane, type Network } from './network'
import { lanesTo, replan, route } from './routing'
import type { Change, DemandSpec, NetworkSpec, Priority, Scenario } from './spec'
import { gatewayDemand, networkSpec } from './tiles'
import { TRIPS, type Trips } from './trips.proto'

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
  /** PROTOTYPE (#303): the share of its last lane's length at which the car turns off the Road and is gone. */
  parkAt?: number
  /** PROTOTYPE (#303): how large the car is drawn, 0-1, as it pulls out or turns off. */
  scale?: number
}

export const DT = 1 / 30

/** How far along the straight `lane` the point `p` lies, from the lane's start: negative before it. */
function along(lane: Lane, p: { x: number; y: number }) {
  const [from, to] = lane.line.pts
  return ((p.x - from.x) * (to.x - from.x) + (p.y - from.y) * (to.y - from.y)) / Math.hypot(to.x - from.x, to.y - from.y)
}

export class Sim {
  /** The Junctions and Roads the network was built from. */
  readonly spec: NetworkSpec
  readonly net: Network
  /** Trips per minute from each Gateway, fixed for the Sim: worked out again whenever the City changes. */
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
  /** PROTOTYPE (#303): the trips between Tiles, when the run plays them. It outlives the Sim. */
  readonly trips?: Trips
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
   *
   * With `traffic`, the Sim before, there is no Pre-warm: that Sim's traffic drives on in this one (ADR 0006, see
   * `carry`), and that Sim must not be stepped again.
   */
  constructor(
    source: City | Scenario,
    carried: Change[] = [],
    seed = 1,
    { prewarm = true, conflicts = true, traffic, trips }: { prewarm?: boolean; conflicts?: boolean; traffic?: Sim; trips?: Trips } = {},
  ) {
    this.spec = source instanceof City ? networkSpec(source) : source.network
    this.net = buildNetwork(this.spec, { conflicts })
    const arms = this.arms()
    this.defaults = {
      enabled: new Set(arms.flatMap((a) => a.connections).filter((c) => c.enabled)),
      priority: new Map(arms.map((a) => [a, a.priority])),
    }
    for (const change of carried) applyChange(this.net, change)
    // After the Changes: a Gateway only sends trips to the Gateways it can reach as the Connections stand.
    this.trips = trips
    // PROTOTYPE (#303): with trips between Tiles, a Gateway keeps a fixed base of through traffic.
    const through = trips && { base: TRIPS.through, weights: [1], growth: 0 }
    this.rates = source instanceof City ? gatewayDemand(source, this.net, through) : source.demand
    for (const id of [...Object.keys(this.rates), ...Object.values(this.rates).flatMap((d) => Object.keys(d.to))]) {
      if (!this.net.gateways[id])
        throw new Error(`Demand names "${id}", which is not a Gateway (Gateways: ${Object.keys(this.net.gateways).join(', ')})`)
    }
    this.demand = new Demand(this.rates, seed, traffic && { from: traffic.demand, time: traffic.time })
    this.approaches = this.net.junctions.map((junction) => ({
      junction,
      lanes: junction.arms.flatMap((a) => a.approach),
      flow: 1,
      jammed: false,
      hold: 0,
    }))
    this.served = new Uint32Array(this.net.junctions.length)
    this.junctionIndex = new Map(this.net.junctions.map((j, i) => [j.id, i]))
    if (traffic) this.carry(traffic)
    trips?.bind(this)
    if (!traffic && prewarm) while (!this.prewarmed) this.step()
  }

  /**
   * Take over from the Sim `before`, whose City this one's grew or changed from (ADR 0006): a Tile landed, a Swap
   * landed or a Tile was taken off. The clock and Flow run on. A vehicle whose Lane still exists drives on from the same
   * spot of the map, found again by its Lane's id. One whose Lane is gone is removed, and so is one whose spot is off
   * its Lane now: a Road whose end is a Roundabout now, or a cell edge, ends sooner, and its vehicles past the end stood
   * on the Junction or the Tile that changed. A Junction whose type or Roads changed, as a Swap's do, is a new one: its
   * vehicles are removed even where a Lane id repeats. A vehicle bound for a Gateway that closed draws a new
   * destination, evenly among the Gateways it can reach from where it is, and is removed if it can reach none. A
   * Junction that is the same in both keeps its Jam reading. `completed` and `served` start again from nothing.
   */
  private carry(before: Sim) {
    this.time = before.time
    this.flow = before.flow
    const shape = (j: Junction) => `${j.type}:${j.arms.map((a) => a.road).sort()}`
    const was = new Map(before.net.junctions.map((j) => [j.id, shape(j)]))
    const same = new Set(this.net.junctions.filter((j) => was.get(j.id) === shape(j)).map((j) => j.id))
    const readings = new Map(before.approaches.map((a) => [a.junction.id, a]))
    for (const a of this.approaches) {
      const read = same.has(a.junction.id) && readings.get(a.junction.id)
      if (read) [a.flow, a.jammed, a.hold] = [read.flow, read.jammed, read.hold]
    }
    const lanes = new Map(this.net.lanes.filter((l) => !('junction' in l.owner) || same.has(l.owner.junction)).map((l) => [l.id, l]))
    const gateways = Object.keys(this.net.gateways)
    const toward = new Map<string, Set<Lane>>()
    const reaches = (lane: Lane, gateway: string) => {
      if (!toward.has(gateway)) toward.set(gateway, lanesTo(this.net, gateway))
      return toward.get(gateway)!.has(lane)
    }
    const gone = new Set<Vehicle>()
    for (const old of before.net.lanes) {
      const lane = lanes.get(old.id)
      for (const v of old.vehicles) {
        // The Lane may start further back than it did, as a Road to a cell edge does once a Tile lands on that edge, or
        // further forward, as one to a Roundabout does.
        const s = lane ? v.s + along(lane, old.line.pts[0]) : NaN
        if (!lane || !(s >= 0 && s <= lane.length)) {
          gone.add(v)
          continue
        }
        if (!this.net.gateways[v.dest] && !this.junctionIndex.has(v.dest)) {
          const reached = gateways.filter((g) => reaches(lane, g))
          if (!reached.length) {
            gone.add(v)
            continue
          }
          v.dest = this.demand.draw(reached)
          v.parkAt = undefined
        }
        v.s = s
        v.lane = lane
        lane.vehicles.push(v)
      }
    }
    this.vehicles = before.vehicles.filter((v) => !gone.has(v))
    replan(this.net, this.vehicles)
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
   * The configuration of every Junction as it stands, as Changes: what the next Sim of the City carries over.
   * Connection refs and Road ids are stable from one Sim to the next.
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
    const entered = this.demand.spawn(this.net, this.time)
    this.vehicles.push(...entered)
    if (this.trips) {
      for (const v of entered) this.trips.entered(v.lane, this.time)
      this.trips.step(this)
    }
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
          this.trips?.left(v, lane, this.time)
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
    this.trips?.park(this, gone)
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
