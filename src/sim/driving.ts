import type { Connection } from './network'
import type { Sim, Vehicle } from './sim'

/** The Junction configuration the driving rules obey. */
type Rules = Pick<Sim, 'isGreen'>

const GAP_AFTER = 1.5 // s: a priority vehicle must reach the conflict point this long after me...
const GAP_BEFORE = 1.0 // ...or this long before me
const DECISION_DIST = 60
const HARD_BRAKE = 4 // closer to the line than this braking allows, a vehicle proceeds
const LOOKAHEAD = 150

/** IDM against the nearest leader along the path, a merging committed vehicle, or the stop line. */
export function accel(v: Vehicle, rules: Rules): number {
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
  v.waiting = mustStop(v, rules)
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
function mustStop(v: Vehicle, rules: Rules): boolean {
  const lane = v.lane
  if (lane.conn || lane.vehicles[0] !== v) return false
  const next = v.path[0]
  if (!next) return !lane.toGateway
  const c = next.conn!
  const dist = lane.length - v.s
  if (dist > DECISION_DIST || dist < (v.v * v.v) / (2 * HARD_BRAKE)) return false
  const rule = c.from.kind === 'road' ? c.arm.priority : 'yield' // the Ring is always main
  if (rule === 'signal') {
    // Green replaces the yield check: entrants force in and zip with ring traffic.
    if (!rules.isGreen(c.arm)) return true
  } else {
    if (rule === 'stop' && !v.stopped) return true
    if (conflicting(v, c, dist)) return true
  }
  return !hasRoom(c, v)
}

/** Gap acceptance: is a higher-priority vehicle due at any conflict point of `c` too close to my own arrival? */
function conflicting(v: Vehicle, c: Connection, dist: number): boolean {
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
function hasRoom(c: Connection, v: Vehicle): boolean {
  const r = c.to.vehicles.at(-1)
  if (r && r.v > 2) return true
  let free = r ? r.s - r.type.length : Infinity
  for (const u of c.lane.vehicles) free -= u.type.length + u.type.minGap
  for (const m of c.merges) for (const u of m.lane.vehicles) free -= u.type.length + u.type.minGap
  return free >= v.type.length + v.type.minGap
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
