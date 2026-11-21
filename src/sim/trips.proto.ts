// PROTOTYPE for #303, throwaway: trips between Tiles and growth by Needs (ADR 0008), to find the numbers and see how it
// plays. Nothing here is saved, tested or meant to be kept. Open it with `?trips` on the dev page.
//
// The model: every vehicle belongs somewhere. A home Tile owns cars and a plant or farm owns trucks; each waits at
// home, drives out to meet one of its Tile's Needs at a partner Tile, stays a while and drives home. With no partner in
// the City it leaves by a Gateway and is away longer. A Need that waits for arrivals (workers, customers, visitors,
// deliveries) has a number of places; the places no vehicle of the City is filling are filled by outsiders, who come in
// by a Gateway, stay and leave again. Every arrival fills the count of the Need it meets, at both ends of the trip.

import type { Zone } from '../city/city'
import { mulberry32, VEHICLE_TYPES, type VehicleType } from './demand'
import { yieldSpeed } from './driving'
import { PREWARM } from './metric'
import type { Lane, Network } from './network'
import { route, timeTo } from './routing'
import type { Sim, Vehicle } from './sim'

type ZoneId = Zone['id']
export type NeedId = 'work' | 'shopping' | 'leisure' | 'customers' | 'deliveries' | 'workers' | 'outlet' | 'visitors'

/** The numbers the prototype is there to find. Indexed by Stage − 1 where a list. */
export const TRIPS = {
  /** Sim-seconds in a day: the clock the simulation now owns. */
  day: 180,
  /** Through trips a minute from each Gateway, whatever the size of the City. */
  through: 1.5,
  /** Vehicles a Tile owns at each Stage: a home's cars, a plant's or a farm's trucks. */
  fleet: {
    'low-density': [2, 4, 6],
    'medium-density': [3, 6, 9],
    'high-density': [4, 8, 12],
    industrial: [1, 2, 3],
    farms: [1, 2, 2],
  } as Partial<Record<ZoneId, number[]>>,
  /** Places a Tile has at each Stage for the arrivals of a Need: outsiders fill those the City does not. */
  places: { workers: [2, 4, 6], customers: [2, 4, 6], visitors: [1, 2, 3], deliveries: [1, 1, 2] } as Partial<Record<NeedId, number[]>>,
  /** Mean sim-seconds a vehicle rests at home between trips. */
  dwell: 25,
  /** Mean sim-seconds a vehicle stays where its trip took it. */
  stay: { work: 45, workers: 45, shopping: 15, customers: 15, leisure: 25, visitors: 25, outlet: 12, deliveries: 12 } as Record<
    NeedId,
    number
  >,
  /** Mean sim-seconds a vehicle is off the map on a trip through a Gateway, on top of the stay. */
  beyond: 50,
  // Demand, as in Cities: Skylines: three bars for the whole City, worked out from what its Tiles hold.
  /** Jobs a Tile offers at each Stage. */
  jobs: { offices: [3, 6, 9], industrial: [3, 6, 9], shops: [1, 2, 3], farms: [1, 2, 2] } as Partial<Record<ZoneId, number[]>>,
  /** Shoppers a shops Tile has room for at each Stage. */
  shopping: [4, 8, 12],
  /** What each car of a home Tile, a household, wants of the City: this share of a job and of a place at the shops. */
  wants: { jobs: 0.5, shopping: 0.4 },
  /** The least a demand falls to: the world beyond the Gateways always wants a little of everything. */
  floor: 0.25,
  /** The pace of parks and green, which no demand drives yet. */
  leisure: 0.6,
  /**
   * Trips that take a Tile to Stage 2 and to Stage 3 with its demand full. A trip counts when it arrives at the Tile, or
   * when the Tile's own vehicle arrives where it was going, and it counts for as much as the Tile's demand stands at.
   */
  grow: {
    'low-density': [3, 13],
    'medium-density': [4, 20],
    'high-density': [5, 26],
    shops: [10, 31],
    offices: [8, 26],
    industrial: [6, 20],
    farms: [2, 7],
    parks: [10, 29],
    green: [5, 14],
  } as Record<ZoneId, number[]>,
  /** Sim-seconds of drive that make a partner e times less likely to be picked. */
  spread: 15,
}

/** A Need a Tile's own vehicle goes out for has `to`, the Zones that meet it, and `meets`, the Need it fills there. */
interface NeedSpec {
  need: NeedId
  to?: ZoneId[]
  meets?: NeedId
}
const HOME: NeedSpec[] = [
  { need: 'work', to: ['offices', 'industrial'], meets: 'workers' },
  { need: 'shopping', to: ['shops'], meets: 'customers' },
  { need: 'leisure', to: ['parks', 'green'], meets: 'visitors' },
]
const GOODS: NeedSpec = { need: 'outlet', to: ['shops'], meets: 'deliveries' }
/** ADR 0008's table. */
const NEEDS: Record<ZoneId, NeedSpec[]> = {
  'low-density': HOME,
  'medium-density': HOME,
  'high-density': HOME,
  shops: [{ need: 'customers' }, { need: 'deliveries' }],
  offices: [{ need: 'workers' }],
  industrial: [{ need: 'workers' }, GOODS],
  farms: [GOODS],
  parks: [{ need: 'visitors' }],
  green: [{ need: 'visitors' }],
}

/** How much a home's car leans to each Need by the clock (0 morning, 0.25 noon, 0.5 dusk, 0.75 night). */
const LEAN: Record<string, number>[] = [
  { work: 6, shopping: 1, leisure: 1 },
  { work: 1, shopping: 4, leisure: 4 },
  { work: 0, shopping: 3, leisure: 4 },
  { work: 1, shopping: 1, leisure: 1 },
]

/** The three demands, and the Zones each one grows. Parks and green have none yet. */
export type DemandId = 'homes' | 'shops' | 'work'
const DRIVEN: Partial<Record<ZoneId, DemandId>> = {
  'low-density': 'homes',
  'medium-density': 'homes',
  'high-density': 'homes',
  shops: 'shops',
  offices: 'work',
  industrial: 'work',
  farms: 'work',
}

const TRUCK: VehicleType = { id: 'truck', length: 7.5, accel: 1.3, decel: 2.2, headway: 1.2, minGap: 2.5, maxSpeed: 12, share: 0 }
const GROW = 5 // m over which a car pulling out or turning off is drawn growing or shrinking

interface TileTrips {
  id: string
  zone: ZoneId
  stage: number
  /** Trips counted toward the next Stage, each for as much as the Tile's demand stood at. */
  progress: number
}

type State = 'home' | 'leaving' | 'out' | 'staying' | 'returning' | 'back' | 'beyond' | 'entering'

/** A vehicle that belongs to the Tile `tile`. An outsider comes in from beyond a Gateway for its Need `outside`. */
interface Car {
  tile: string
  outside?: NeedId
  state: State
  until: number
  /** The Need this trip is for, and the one it fills where it arrives. */
  need?: NeedId
  meets?: NeedId
  /** Where the trip goes or went: a Tile's Junction id or a Gateway's Road id. */
  at?: string
  veh?: Vehicle
  /** Where it joined the road, to draw it growing. */
  joined?: { lane: Lane; s: number }
  /** Its Tile has no place for it any more: gone the next time it is home or beyond. */
  retired?: boolean
}

export class Trips {
  tiles = new Map<string, TileTrips>()
  /** Each demand, from `TRIPS.floor` to 1, and what it was worked out from. */
  demand: Record<DemandId, number> = { homes: 1, shops: 1, work: 1 }
  city = { households: 0, jobs: 0, shopping: 0 }
  cars: Car[] = []
  /** Road trips started and Gateway entries, as sim times over the last minute, and all of them counted. */
  starts: number[] = []
  entries: number[] = []
  total = { starts: 0, entries: 0, byQuarter: [0, 0, 0, 0], met: 0, metBeyond: 0 }
  private rng: () => number
  private nextId = 1_000_000
  private byVeh = new Map<Vehicle, Car>()
  private net!: Network
  private time = 0
  private counting = false
  /** Per Tile: the lanes a car pulls out on and the lanes it turns off. */
  private out = new Map<string, Lane[]>()
  private into = new Map<Lane, string>()

  constructor(seed: number) {
    this.rng = mulberry32(seed ^ 0x303)
  }

  /** The time of day, 0–1: 0 morning, 0.25 noon, 0.5 dusk, 0.75 night. */
  get clock() {
    return ((((this.time - PREWARM) / TRIPS.day) % 1) + 1) % 1
  }

  /** Take up the Sim `sim`, which replaced the one before: vehicles it did not carry over are home again. */
  bind(sim: Sim) {
    this.net = sim.net
    this.time = sim.time
    this.out.clear()
    this.into.clear()
    for (const j of sim.net.junctions) {
      this.out.set(
        j.id,
        j.arms.flatMap((a) => a.exit),
      )
      for (const lane of j.arms.flatMap((a) => a.approach)) this.into.set(lane, j.id)
    }
    const driving = new Set(sim.vehicles)
    for (const car of this.cars) if (car.veh && !driving.has(car.veh)) this.rest(car)
  }

  /** The zoned Tiles as they stand. A Tile new, rezoned or at a new Stage starts its counts again, and its vehicles change at once. */
  sync(tiles: { id: string; zone: ZoneId; stage: number }[]) {
    const next = new Map<string, TileTrips>()
    for (const t of tiles) {
      const was = this.tiles.get(t.id)
      next.set(t.id, was && was.zone === t.zone && was.stage === t.stage ? was : { ...t, progress: 0 })
    }
    this.tiles = next
    // Demand: how short the City is of homes for its jobs, and of shops and of jobs for its households.
    let [households, jobs, shopping] = [0, 0, 0]
    for (const t of next.values()) {
      if (DRIVEN[t.zone] === 'homes') households += TRIPS.fleet[t.zone]![t.stage - 1]
      jobs += TRIPS.jobs[t.zone]?.[t.stage - 1] ?? 0
      if (t.zone === 'shops') shopping += TRIPS.shopping[t.stage - 1]
    }
    const short = (want: number, have: number) =>
      TRIPS.floor + (1 - TRIPS.floor) * (want > 0 ? Math.max(0, Math.min(1, (want - have) / want)) : 0)
    this.demand = {
      homes: short(jobs / TRIPS.wants.jobs, households),
      shops: short(households * TRIPS.wants.shopping, shopping),
      work: short(households * TRIPS.wants.jobs, jobs),
    }
    this.city = { households, jobs, shopping }
    // What each Tile should own: its fleet, and an outsider for each place of each Need that waits for arrivals.
    const wanted = new Map<string, number>()
    for (const t of next.values()) {
      wanted.set(`${t.id}|`, TRIPS.fleet[t.zone]?.[t.stage - 1] ?? 0)
      for (const { need, to } of NEEDS[t.zone]) if (!to) wanted.set(`${t.id}|${need}`, TRIPS.places[need]?.[t.stage - 1] ?? 0)
    }
    const key = (c: Car) => `${c.tile}|${c.outside ?? ''}`
    const have = new Map<string, Car[]>()
    for (const c of this.cars) have.set(key(c), [...(have.get(key(c)) ?? []), c])
    for (const [k, cars] of have) {
      const n = wanted.get(k) ?? 0
      const idle = (c: Car) => (c.state === 'home' || c.state === 'beyond' ? 0 : 1)
      cars.sort((a, b) => idle(b) - idle(a)) // the ones on a trip are kept first
      cars.forEach((c, i) => (c.retired = i >= n))
    }
    this.cars = this.cars.filter((c) => !(c.retired && (c.state === 'home' || c.state === 'beyond')))
    for (const [k, n] of wanted) {
      const [tile, outside] = k.split('|') as [string, NeedId | '']
      for (let i = have.get(k)?.filter((c) => !c.retired).length ?? 0; i < n; i++) {
        this.cars.push({ tile, outside: outside || undefined, state: outside ? 'beyond' : 'home', until: this.time + this.rng() * 20 })
      }
    }
  }

  /** The Tiles with trips enough for their next Stage. */
  ripe(): string[] {
    return [...this.tiles.values()].filter((t) => t.stage < 3 && t.progress >= TRIPS.grow[t.zone][t.stage - 1]).map((t) => t.id)
  }

  /** How the Tile `id` grows: its trips counted, how many take it to its next Stage, and the demand that drives it and its level. */
  growth(id: string) {
    const t = this.tiles.get(id)
    if (!t) return undefined
    const by = DRIVEN[t.zone]
    return { progress: t.progress, full: TRIPS.grow[t.zone][Math.min(t.stage, 2) - 1], by, pace: by ? this.demand[by] : TRIPS.leisure }
  }

  /** Where the vehicles of the Tile `id` are, and who is visiting it, each as a count by a plain name. */
  people(id: string) {
    const [own, here]: Record<string, number>[] = [{}, {}]
    const add = (to: Record<string, number>, k: string) => (to[k] = (to[k] ?? 0) + 1)
    const AT: Record<string, string> = { work: 'at work', shopping: 'at the shops', leisure: 'at a park', outlet: 'delivering' }
    const AS: Record<string, string> = { workers: 'workers', customers: 'shoppers', visitors: 'visitors', deliveries: 'trucks unloading' }
    for (const c of this.cars) {
      const visiting = c.state === 'staying' || c.state === 'returning'
      if (c.outside) {
        if (c.tile === id && visiting) add(here, AS[c.outside])
        continue
      }
      if (c.at === id && visiting && c.meets) add(here, AS[c.meets])
      if (c.tile !== id) continue
      if (c.state === 'home' || c.state === 'leaving') add(own, 'at home')
      else if (c.state === 'beyond' || c.state === 'entering' || (visiting && !this.tiles.has(c.at!))) add(own, 'outside the City')
      else if (visiting) add(own, AT[c.need!])
      else add(own, 'driving')
    }
    return { own, here }
  }

  /** A through vehicle or one of ours came in by a Gateway. */
  entered(_lane: Lane, time: number) {
    this.entries.push(time)
    this.total.entries++
    this.started(time)
  }

  private started(time: number) {
    this.starts.push(time)
    this.total.starts++
    this.total.byQuarter[Math.floor(this.clock * 4)]++
  }

  /** Before the vehicles move: every vehicle whose wait is over sets out, if the road has a gap for it. */
  step(sim: Sim) {
    this.time = sim.time
    this.counting = sim.prewarmed
    while (this.starts[0] < this.time - 60) this.starts.shift()
    while (this.entries[0] < this.time - 60) this.entries.shift()
    for (const car of this.cars) {
      if (car.veh || this.time < car.until) continue
      if (car.outside) this.outsider(car, sim)
      else this.own(car, sim)
    }
  }

  /** A vehicle of the City's own. */
  private own(car: Car, sim: Sim) {
    const tile = this.tiles.get(car.tile)
    if (car.state === 'home') {
      if (!tile) return
      const spec = this.pickNeed(tile)
      const partners = [...this.tiles.values()].filter((t) => t.id !== tile.id && spec.to!.includes(t.zone)).map((t) => t.id)
      const at =
        this.nearest(this.out.get(tile.id) ?? [], partners) ?? this.nearest(this.out.get(tile.id) ?? [], Object.keys(this.net.gateways))
      if (!at) return void (car.until = this.time + 5)
      Object.assign(car, { state: 'leaving', need: spec.need, meets: spec.meets, at })
    }
    if (car.state === 'leaving') {
      if (!this.out.has(car.tile) || !this.pullOut(car, sim, car.tile, car.at!)) car.until = this.time + 0.5
      else car.state = 'out'
    } else if (car.state === 'staying' || car.state === 'returning') {
      car.state = 'returning'
      if (!this.out.has(car.at!) || !this.out.has(car.tile)) this.rest(car)
      else if (this.pullOut(car, sim, car.at!, car.tile)) car.state = 'back'
      else car.until = this.time + 0.5
    } else if (car.state === 'beyond' || car.state === 'entering') {
      car.state = 'entering'
      if (!this.out.has(car.tile)) return this.rest(car)
      const lanes = (g: string) => this.net.gateways[g]?.approach ?? []
      // Back by the Gateway it left by, or the nearest that still reaches home.
      if (!lanes(car.at!).some((l) => timeTo(this.net, l, car.tile) < Infinity)) {
        const others = Object.keys(this.net.gateways).filter((g) => lanes(g).some((l) => timeTo(this.net, l, car.tile) < Infinity))
        if (!others.length) return this.rest(car)
        car.at = others[Math.floor(this.rng() * others.length)]
      }
      if (this.enter(car, sim, car.at!, car.tile)) car.state = 'back'
      else car.until = this.time + 0.5
    }
  }

  /** A vehicle from beyond a Gateway, here for a Need of its Tile that waits for arrivals. */
  private outsider(car: Car, sim: Sim) {
    const tile = this.tiles.get(car.tile)
    if (car.state === 'beyond') {
      if (!tile) return
      const places = TRIPS.places[car.outside!]?.[tile.stage - 1] ?? 0
      const taken = this.cars.filter(
        (c) =>
          c !== car &&
          (c.outside
            ? c.tile === car.tile && c.outside === car.outside && ['entering', 'out', 'staying'].includes(c.state)
            : c.at === car.tile && c.meets === car.outside && ['leaving', 'out', 'staying'].includes(c.state)),
      ).length
      if (taken >= places) return void (car.until = this.time + 5)
      const gateways = Object.keys(this.net.gateways)
      const time = (g: string) => Math.min(...this.net.gateways[g].approach.map((l) => timeTo(this.net, l, car.tile)))
      const at = this.pick(gateways.map((g) => [g, time(g)]))
      if (!at) return void (car.until = this.time + 5)
      Object.assign(car, { state: 'entering', at, need: car.outside, meets: undefined })
    }
    if (car.state === 'entering') {
      if (this.enter(car, sim, car.at!, car.tile)) car.state = 'out'
      else car.until = this.time + 0.5
    } else if (car.state === 'staying' || car.state === 'returning') {
      car.state = 'returning'
      const at = this.out.has(car.tile) && this.nearest(this.out.get(car.tile)!, Object.keys(this.net.gateways))
      if (!at) return this.rest(car)
      if (this.pullOut(car, sim, car.tile, at)) car.state = 'back'
      else car.until = this.time + 0.5
    }
  }

  /** The Need a Tile's vehicle goes out for now: a home's by the clock. */
  private pickNeed(tile: TileTrips): NeedSpec {
    const lean = LEAN[Math.floor(this.clock * 4)]
    const sends = NEEDS[tile.zone].filter((n) => n.to)
    let r = this.rng() * sends.reduce((s, n) => s + (lean[n.need] ?? 1), 0)
    for (const n of sends) if ((r -= lean[n.need] ?? 1) < 0) return n
    return sends[sends.length - 1]
  }

  /** One of `dests` a car can drive to from `from`, a nearer one more likely. */
  private nearest(from: Lane[], dests: string[]): string | undefined {
    return this.pick(dests.map((d) => [d, Math.min(...from.map((l) => timeTo(this.net, l, d)))]))
  }

  private pick(timed: [string, number][]): string | undefined {
    const reach = timed.filter(([, t]) => t < Infinity)
    const best = Math.min(...reach.map(([, t]) => t))
    const weights = reach.map(([d, t]) => [d, Math.exp(-(t - best) / TRIPS.spread)] as const)
    let r = this.rng() * weights.reduce((s, [, w]) => s + w, 0)
    for (const [d, w] of weights) if ((r -= w) < 0) return d
    return weights.at(-1)?.[0]
  }

  /** Put `car` on the road from the Tile `from`, bound for `dest`, if a lane toward it has a gap. */
  private pullOut(car: Car, sim: Sim, from: string, dest: string): boolean {
    const lanes = [...this.out.get(from)!].sort((a, b) => timeTo(this.net, a, dest) - timeTo(this.net, b, dest))
    const type = this.typeOf(car)
    for (const lane of lanes) {
      const path = route(this.net, lane, dest)
      if (!path) return false
      const s = type.length + lane.length * (0.05 + 0.3 * this.rng())
      const clear = lane.vehicles.every((u) => (u.s >= s ? u.s - u.type.length - s > 3 : s - type.length - u.s > 4 + u.v * 2))
      if (!clear) continue
      this.drive(car, sim, lane, s, 2, path, dest)
      return true
    }
    return false
  }

  /** Bring `car` onto the map at the Gateway `gateway`, bound for `dest`. */
  private enter(car: Car, sim: Sim, gateway: string, dest: string): boolean {
    const type = this.typeOf(car)
    for (const lane of this.net.gateways[gateway]?.approach ?? []) {
      const path = route(this.net, lane, dest)
      const r = lane.vehicles.at(-1)
      if (!path || (r && r.s - r.type.length < 3)) continue
      const v = r
        ? Math.min(lane.speedLimit, r.v + Math.sqrt(2 * type.decel * Math.max(0, r.s - r.type.length - type.minGap)))
        : lane.speedLimit
      this.drive(car, sim, lane, 0, v, path, dest)
      this.entered(lane, this.time)
      return true
    }
    return false
  }

  private typeOf = (car: Car) => ((!car.outside && car.need === 'outlet') || car.outside === 'deliveries' ? TRUCK : VEHICLE_TYPES[0])

  private drive(car: Car, sim: Sim, lane: Lane, s: number, v: number, path: Lane[], dest: string) {
    const veh: Vehicle = {
      id: this.nextId++,
      type: this.typeOf(car),
      lane,
      s,
      v,
      acc: 0,
      vFree: lane.speedLimit,
      vFreeIn: lane.speedLimit,
      path,
      dest,
      waiting: false,
      parkAt: this.net.gateways[dest] ? undefined : 0.6 + 0.3 * this.rng(),
      scale: s ? 0 : 1,
    }
    veh.v = Math.min(veh.v, yieldSpeed(veh))
    let i = lane.vehicles.length
    while (i > 0 && lane.vehicles[i - 1].s < s) i--
    lane.vehicles.splice(i, 0, veh)
    sim.vehicles.push(veh)
    car.veh = veh
    car.joined = s ? { lane, s } : undefined
    this.byVeh.set(veh, car)
    if (s) this.started(this.time)
  }

  /** A vehicle left the map at the Gateway of `lane`. */
  left(v: Vehicle, _lane: Lane, time: number) {
    const car = this.byVeh.get(v)
    if (!car) return
    this.byVeh.delete(v)
    car.veh = undefined
    if (car.outside) return void Object.assign(car, { state: 'beyond', until: time + TRIPS.beyond * (0.5 + this.rng()) })
    // One of the City's own: its Need is met out there, if that is where it was going, and it is back after a long while.
    if (car.state === 'out' && this.net.gateways[car.at!]) this.count(car.tile, car.need!, true)
    const stay = car.state === 'out' ? TRIPS.stay[car.need!] : 0
    Object.assign(car, { state: 'beyond', at: v.dest, until: time + (TRIPS.beyond + stay) * (0.5 + this.rng()) })
  }

  /** After the vehicles moved: those at their spot turn off the Road, into `gone`, and their arrivals count. */
  park(_sim: Sim, gone: Set<Vehicle>) {
    for (const [v, car] of this.byVeh) {
      const spot = v.parkAt !== undefined && !v.path.length && !v.lane.toGateway ? v.parkAt * v.lane.length : Infinity
      const grown = car.joined?.lane === v.lane ? (v.s - car.joined.s) / GROW : 1
      v.scale = Math.max(0, Math.min(1, grown, (spot - v.s) / GROW + 0.2))
      if (v.s < spot) continue
      v.lane.vehicles.splice(v.lane.vehicles.indexOf(v), 1)
      gone.add(v)
      this.byVeh.delete(v)
      car.veh = undefined
      const at = this.into.get(v.lane)
      if (at !== v.dest) this.rest(car)
      else if (car.state === 'back') this.rest(car)
      else {
        // It arrived where its trip was going: the Need is met at both ends.
        if (car.outside) this.count(car.tile, car.outside)
        else {
          this.count(car.tile, car.need!)
          this.count(at, car.meets!)
        }
        Object.assign(car, { state: 'staying', until: this.time + TRIPS.stay[car.need!] * (0.5 + this.rng()) })
      }
    }
  }

  /** A trip counts for the Tile `tile`, for as much as its demand stands at. */
  private count(tile: string, _need: NeedId, beyond = false) {
    const t = this.tiles.get(tile)
    if (!t || !this.counting) return
    t.progress += this.growth(tile)!.pace
    this.total.met++
    if (beyond) this.total.metBeyond++
  }

  /** `car` is where it belongs again, resting: at home, or beyond its Gateway. */
  private rest(car: Car) {
    if (car.veh) this.byVeh.delete(car.veh)
    Object.assign(car, {
      veh: undefined,
      state: car.outside ? 'beyond' : 'home',
      until: this.time + (car.outside ? TRIPS.beyond : TRIPS.dwell) * (0.5 + this.rng()),
    })
    if (car.retired) this.cars.splice(this.cars.indexOf(car), 1)
  }
}
