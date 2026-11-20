// PROTOTYPE, throwaway (`../render/prototype-look`): traffic lights. Off unless `SIGNALS.on` is set before a Sim is
// stepped, so the game and its tests drive as they always did. With it on, every Priority junction of three Arms or
// more runs a cycle: one pair of facing Arms goes, then the other, then every Arm stops while people cross. A car
// that can still stop for a red light does (`./driving`'s `mustStop`); one too close goes through, as on amber.
// Not for main: a signalled Junction as the game would have it needs its own rules, tests and a place in the glossary.
import type { Network } from './network'

export const SIGNALS = { on: false }

/** What a signalled Junction's lights show: each Arm's group, each group's light, and whether people may cross, with the seconds of it left. */
export interface Signal {
  groups: number[]
  shows: ('green' | 'amber' | 'red')[]
  walk: boolean
  walkLeft: number
}

// The cycle, in s: a group's green, the amber and all-red after it, the walk, and the all-red after the walk.
const [GO, CLEAR, AMBER, WALK, AFTER] = [12, 3.5, 2.5, 24, 2] // the walk long enough to cross four lanes and more
const CYCLE = 2 * (GO + CLEAR) + WALK + AFTER

/** Set every signalled Junction's lights for the Sim's `time`, each a little out of step with the others. */
export function signal(net: Network, time: number) {
  net.junctions.forEach((junction, index) => {
    if (junction.type !== 'priority' || junction.arms.length < 3) return
    if (!junction.signal) {
      // The two Arms most nearly facing each other go together; the rest go together after them.
      const arms = junction.arms
      let [best, pair] = [-Infinity, [0, 1]]
      for (let i = 0; i < arms.length; i++)
        for (let j = i + 1; j < arms.length; j++) {
          const facing = -Math.cos(arms[i].angle - arms[j].angle)
          if (facing > best) [best, pair] = [facing, [i, j]]
        }
      junction.signal = { groups: arms.map((_, i) => (pair.includes(i) ? 0 : 1)), shows: ['red', 'red'], walk: false, walkLeft: 0 }
    }
    const s = junction.signal
    const t = (time + index * 7.3) % CYCLE
    const second = GO + CLEAR
    const walkAt = 2 * second
    s.shows = [
      t < GO ? 'green' : t < GO + AMBER ? 'amber' : 'red',
      t >= second && t < second + GO ? 'green' : t >= second + GO && t < second + GO + AMBER ? 'amber' : 'red',
    ]
    s.walk = t >= walkAt && t < walkAt + WALK
    s.walkLeft = s.walk ? walkAt + WALK - t : 0
    junction.arms.forEach((arm, i) => (arm.signal = s.shows[s.groups[i]] === 'green' ? 'go' : 'stop'))
  })
}

// ---- Parking: cars that have somewhere to be. -------------------------------------------------------------------
// A spot is a place off the Road where a car can stand (a house's carport, a shop's bay), with the point of the
// outermost lane it is reached from. The render says where they are (`PARKING.spots`). Some of the cars that come down
// a lane with a free spot ahead take it: they slow, stop beside it, and leave the lane for it. A parked car is out of
// the traffic until it is told to leave, or has stood long enough; then it waits for a gap and joins its lane again,
// on the way it was going. Not a Trip that ends at a Tile, which the game would need (#95): the same Trip, paused.
import type { Lane } from './network'
import type { Sim, Vehicle } from './sim'

export interface Spot {
  kind: 'home' | 'shop'
  lane: Lane
  s: number
  /** Where the car stands, and the way it faces (radians counterclockwise from east). */
  x: number
  y: number
  heading: number
  car?: Vehicle
  reserved?: Vehicle
}
export interface Parked {
  car: Vehicle
  spot: Spot
  since: number
  /** Set by whoever drove it, when they are back. */
  leave: boolean
}
export const PARKING = { spots: [] as Spot[], parked: [] as Parked[], arrivals: [] as Parked[], now: 0 }
const [SHARE, LONGEST] = [0.4, 240] // of the cars that could take a spot, those that do; and the longest one stands, s

export function parking(sim: Sim) {
  PARKING.now = sim.time
  if (!PARKING.spots.length) return
  const off = new Set<Vehicle>()
  for (const v of sim.vehicles) {
    const spot = v.park
    if (spot) {
      if (v.lane !== spot.lane || v.s > spot.s + 4) [spot.reserved, v.park] = [undefined, undefined]
      else if (v.v < 0.5 && spot.s - v.s < 4) {
        // Off the lane and onto the spot.
        v.lane.vehicles.splice(v.lane.vehicles.indexOf(v), 1)
        off.add(v)
        ;[v.v, v.acc, v.park, v.parked, spot.car, spot.reserved] = [0, 0, undefined, true, v, undefined]
        v.bay = { x: spot.x, y: spot.y, heading: spot.heading, since: sim.time, out: false }
        const entry = { car: v, spot, since: sim.time, leave: false }
        PARKING.parked.push(entry)
        PARKING.arrivals.push(entry)
      }
    } else if (!v.parked && v.asked !== v.lane) {
      v.asked = v.lane
      if (Math.random() > SHARE) continue
      const free = PARKING.spots.find((s) => s.lane === v.lane && !s.car && !s.reserved && s.s > v.s + 14)
      if (free) [free.reserved, v.park] = [v, free]
    }
  }
  if (off.size) sim.vehicles = sim.vehicles.filter((v) => !off.has(v))
  for (const entry of [...PARKING.parked]) {
    const { car, spot } = entry
    if (!entry.leave && sim.time - entry.since < LONGEST) continue
    const lane = spot.lane
    if (lane.vehicles.some((u) => u.s > spot.s - 28 && u.s < spot.s + 10)) continue // no gap yet
    ;[car.lane, car.s, car.v, car.vFree, car.vFreeIn] = [lane, spot.s, 0, 0, 0]
    let i = lane.vehicles.length
    while (i > 0 && lane.vehicles[i - 1].s < car.s) i--
    lane.vehicles.splice(i, 0, car)
    sim.vehicles.push(car)
    car.bay = { x: spot.x, y: spot.y, heading: spot.heading, since: sim.time, out: true }
    spot.car = undefined
    PARKING.parked.splice(PARKING.parked.indexOf(entry), 1)
  }
}
