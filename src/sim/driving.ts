import type { Connection } from './network'
import type { Vehicle } from './sim'

const GAP_AFTER = 1.5 // s: a priority vehicle must reach the conflict point this long after me...
const GAP_BEFORE = 1.0 // ...or this long before me
const DECISION_DIST = 60
const HARD_BRAKE = 4 // closer to the line than this braking allows, a vehicle proceeds
const LOOKAHEAD = 150
const HELD = 0.5 // m/s: slower than this, a vehicle is standing in a queue or at its line
// A vehicle giving way to a `main` Arm reaches its line at YIELD_CRAWL m/s, slowing at YIELD_SLOWING m/s² however clear
// the road is. That is gentle enough to hold it under the limit along a whole Road of a few hundred metres, and the
// crawl is no faster than HELD, so it arrives as good as standing and waits for a gap in everything that moves.
const YIELD_CRAWL = 0.5
const YIELD_SLOWING = 0.35
const ONCOMING = Math.PI / 4 // an Arm within this of straight ahead is the oncoming one

/** IDM against the nearest leader along the path, a merging committed vehicle, or the stop line. */
export function accel(v: Vehicle): number {
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
  v0 = Math.min(v0, yieldSpeed(v))
  v.vFree = Math.min(v0, Math.sqrt(v.vFreeIn ** 2 + 2 * t.accel * Math.max(0, v.s)))
  v.waiting = mustStop(v)
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

/**
 * The fastest a vehicle may drive where it is while slowing to a crawl for the end of its lane, or Infinity when it
 * need not: it slows when its next Connection leaves a `yield` Arm and meets an enabled one from a `main` Arm, unless
 * a Signal is on there. Giving
 * way costs time even when nobody is coming, so a `yield` Arm carries less than a `main` one, and which Arm is main
 * changes what the Junction can carry (see ADR 0003). The crawl is part of the vehicle's free speed, so Flow counts a
 * vehicle that keeps to it as moving freely.
 */
export function yieldSpeed(v: Vehicle): number {
  const next = v.lane.conn ? undefined : v.path[0]?.conn // on a Connection it is already past its line
  const yields =
    next &&
    !next.arm.light &&
    next.arm.priority === 'yield' &&
    next.conflicts.some(({ other }) => other.enabled && other.arm.priority === 'main')
  return yields ? Math.sqrt(YIELD_CRAWL ** 2 + 2 * YIELD_SLOWING * Math.max(0, v.lane.length - v.s)) : Infinity
}

/** Whether the front vehicle of a segment lane must hold at the line before entering its next connection. */
function mustStop(v: Vehicle): boolean {
  const lane = v.lane
  if (lane.conn || lane.vehicles[0] !== v) return false
  const next = v.path[0]
  if (!next) return !lane.toGateway
  const c = next.conn!
  const dist = lane.length - v.s
  if (dist > DECISION_DIST || dist < (v.v * v.v) / (2 * HARD_BRAKE)) return false
  return c.arm.light === 'red' || conflicting(v, c, dist) || !hasRoom(c, v)
}

/**
 * Gap acceptance: is a higher-priority vehicle due at any conflict point of `c` too close to my own arrival?
 *
 * Connections of one Arm rank by lane. Between the Arms of a Priority junction nobody enters ahead of a vehicle inside
 * the Junction that won't have cleared the conflict point by then, so vehicles inside don't wait on each other in a
 * circle. Of the vehicles still approaching, a `main` Arm ignores the `yield` Arms. Otherwise a moving vehicle gives
 * way as its Priority rule says (see `givesWay`) and one standing at its line waits for a gap in everything that moves.
 * Vehicles standing at the lines of several Arms would each wait for the next, so among them one goes first (see
 * `goesFirst`).
 *
 * With the Signal on, only the vehicles still inside the Junction count: the other Arms are held at red.
 */
function conflicting(v: Vehicle, c: Connection, dist: number): boolean {
  const signalled = !!c.arm.light
  const held = v.v < HELD
  if (!signalled && held && !goesFirst(v, c)) return true
  for (const { other: o, s, otherS } of c.conflicts) {
    const tMe = eta(dist + s, v.v, v.type.accel, c.lane.speedLimit)
    if (o.arm === c.arm) {
      if (rank(o) >= rank(c)) continue
    } else {
      const clearsLate = (u: Vehicle) => {
        const tail = otherS - u.s + u.type.length
        return tail > 0 && (u.v < HELD || eta(tail, u.v, u.type.accel, o.lane.speedLimit) > tMe - GAP_BEFORE)
      }
      if (o.lane.vehicles.some(clearsLate)) return true
      if (signalled || outranks(c, o)) continue
      if (!held) {
        if (!givesWay(c, o)) continue
        const first = o.from.vehicles[0]
        if (first && standing(first, o) && goesFirst(first, o)) return true
      }
    }
    const near = (u: Vehicle, d: number) => {
      if (u.v < HELD) return false // held in a queue; crossing occupancy covers it if it moves off
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

/** Standing at its line, ready to enter `c` once it has right of way. */
const standing = (u: Vehicle, c: Connection) => u.v < HELD && u.path[0] === c.lane && hasRoom(c, u)

/** A `main` Arm over a `yield` Arm. */
const outranks = (c: Connection, o: Connection) => c.arm.priority === 'main' && o.arm.priority === 'yield'

/**
 * The Priority rule between two Connections from different Arms of a Priority junction: a `yield` Arm gives way to a
 * `main` Arm. Equal Arms give way to the right, and a left turn to oncoming traffic going straight on.
 */
function givesWay(c: Connection, o: Connection): boolean {
  if (c.arm.priority !== o.arm.priority) return outranks(o, c)
  const bearing = (o.arm.angle - c.arm.angle + 2 * Math.PI) % (2 * Math.PI) // of `o`'s Arm, counterclockwise from `c`'s
  if (bearing < Math.PI - 1e-6) return true // from the right
  return c.turn === 'left' && o.turn === 'straight' && bearing - Math.PI < ONCOMING
}

/**
 * Whether `u`, standing at its line, is next into `c` among the vehicles standing at the lines of a Priority junction:
 * none that crosses or merges with it from another Arm and goes first itself is on a `main` Arm while `u` yields, or
 * on an equal Arm and longer on the map (lower id). Vehicles that don't meet go together.
 *
 * ponytail: between equal Arms only time on the map orders standing vehicles, so a standing left turn can go before a
 * standing oncoming vehicle that arrived later (it still waits for a gap in moving traffic). Ordering by `givesWay`
 * here needs a cycle guard: right-hand and left-turn rules can each make three standing vehicles wait in a circle.
 */
function goesFirst(u: Vehicle, c: Connection): boolean {
  return !c.conflicts.some(({ other: o }) => {
    const w = o.from.vehicles[0]
    const ahead = outranks(o, c) || (!outranks(c, o) && w?.id < u.id)
    return o.arm !== c.arm && w && ahead && standing(w, o) && goesFirst(w, o)
  })
}

/** Don't block the box: enter only if the outgoing lane has room for us behind whoever is already headed there. */
function hasRoom(c: Connection, v: Vehicle): boolean {
  const r = c.to.vehicles.at(-1)
  if (r && r.v > 2) return true
  let free = r ? r.s - r.type.length : Infinity
  for (const u of c.lane.vehicles) free -= u.type.length + u.type.minGap
  for (const m of c.merges) for (const u of m.lane.vehicles) free -= u.type.length + u.type.minGap
  return free >= v.type.length + v.type.minGap
}

const occupies = (u: Vehicle, at: number) => u.s > at - 1 && u.s - u.type.length < at + 1

/** Lower rank has priority among the Connections of one Arm: ring beats entering traffic; within each, the outer (lower index) lane wins. */
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
