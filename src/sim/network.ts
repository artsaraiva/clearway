import type { Change, District, JunctionSpec, Priority } from './district'
import { arc, bezier, intersect, minRadius, polyline, type Polyline, type Vec } from './geometry'
import type { Vehicle } from './sim'

export type LaneKind = 'road' | 'ring' | 'connection'

export interface Lane {
  /** Stable across Reveals. */
  id: string
  kind: LaneKind
  /** A Road lane belongs to its Road and a direction (`forward` is from→to); Ring and Connection lanes belong to their Junction. */
  owner: { road: string; forward: boolean } | { junction: string }
  /** 0 = outermost / rightmost. */
  index: number
  line: Polyline
  length: number
  speedLimit: number
  /** Road lane ending at a Gateway: vehicles leave the map at its end. */
  toGateway: boolean
  /** Ordered front (largest s) to back. */
  vehicles: Vehicle[]
  /** Candidate Connections leaving this lane (Road and Ring lanes only). */
  next: Connection[]
  /** Connection lanes ending on this lane. */
  feeders: Lane[]
  /** Set on Connection lanes. */
  conn?: Connection
}

export interface Conflict {
  other: Connection
  /** Conflict point as arc length along this Connection's lane, and along the other's. */
  s: number
  otherS: number
}

export interface Connection {
  id: string
  /** Its ref at its Junction, e.g. `N.in1>N.ring0` (see `Change`). */
  ref: string
  arm: Arm
  from: Lane
  to: Lane
  lane: Lane
  enabled: boolean
  conflicts: Conflict[]
  /** Connections at the same Arm ending on the same lane. */
  merges: Connection[]
}

/** One Road's end at a Junction. */
export interface Arm {
  road: string
  junction: string
  /** Direction from the Junction's centre toward the Road's other end, radians counterclockwise from +x (east). */
  angle: number
  priority: Priority
  /** Where the Arm meets the Ring. */
  center: Vec
  approach: Lane[]
  exit: Lane[]
  /** Ring lanes arriving at this Arm, and departing from it. */
  ringIn: Lane[]
  ringOut: Lane[]
  /** Candidate Connections at this Arm. */
  connections: Connection[]
}

export interface Junction {
  id: string
  at: Vec
  /** Counterclockwise, the direction of circulation. */
  arms: Arm[]
}

export interface Network {
  lanes: Lane[]
  junctions: Junction[]
  /** By Road id: the Arm at the simulated end of each Road that leaves the map at its other end. */
  gateways: Record<string, Arm>
}

export const RING_SPEED = 9
const MAX_LATERAL_ACCEL = 3
const ENTRY_SETBACK = 15 // approach stop line distance outside the Ring's outer edge
const MIN_ROAD_LANE = 10 // m of lane a Road must keep between the footprints of its ends
const MIN_RING_ARC = Math.PI / 36 // 5° of Ring between the mouths of neighbouring Arms

const deg = (rad: number) => Math.round((rad * 180) / Math.PI)

function makeLane(
  id: string,
  kind: LaneKind,
  owner: Lane['owner'],
  index: number,
  pts: Vec[],
  speedLimit: number,
  toGateway = false,
): Lane {
  const line = polyline(pts)
  return { id, kind, owner, index, line, length: line.length, speedLimit, toGateway, vehicles: [], next: [], feeders: [] }
}

const endHeading = (l: Lane) => {
  const p = l.line.pts
  const a = p[p.length - 2]
  const b = p[p.length - 1]
  return Math.atan2(b.y - a.y, b.x - a.x)
}
const startHeading = (l: Lane) => {
  const [a, b] = l.line.pts
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/** Distance from a Junction's centre to where its Roads' lanes end. */
const footprint = (j: JunctionSpec, laneWidth: number) => j.radius + (j.ringLanes * laneWidth) / 2 + ENTRY_SETBACK

/**
 * The network of the Revealed Junctions, every Junction in its type's default configuration. A Road with one end
 * Revealed is a Gateway; a Road with neither is left out. Throws a readable error on a District file it can't build.
 */
export function buildNetwork(district: District, revealed: string[]): Network {
  const w = district.roadDefaults.laneWidth
  for (const id of revealed) if (!district.junctions[id]) throw new Error(`reveal names unknown Junction "${id}"`)
  const junctions: Junction[] = Object.entries(district.junctions)
    .filter(([id]) => revealed.includes(id))
    .map(([id, spec]) => ({ id, at: { x: spec.at[0], y: spec.at[1] }, arms: [] }))
  const lanes: Lane[] = []
  const gateways: Record<string, Arm> = {}

  for (const [id, road] of Object.entries(district.roads)) {
    const [a, b] = [road.from, road.to].map((end) => {
      if (typeof end !== 'string') return { at: { x: end[0], y: end[1] }, trim: 0, junction: undefined }
      const spec = district.junctions[end]
      if (!spec) throw new Error(`Road ${id} ends at unknown Junction "${end}"`)
      return { at: { x: spec.at[0], y: spec.at[1] }, trim: footprint(spec, w), junction: junctions.find((j) => j.id === end) }
    })
    if (typeof road.from !== 'string' && typeof road.to !== 'string') throw new Error(`Road ${id} joins no Junction`)
    if (!a.junction && !b.junction) continue // still in Fog
    const length = Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y)
    const laneLength = length - a.trim - b.trim
    if (laneLength < MIN_ROAD_LANE) {
      throw new Error(
        `Road ${id} is too short: ${length.toFixed(0)} m leaves ${laneLength.toFixed(0)} m of lane between the footprints of its ends (need ${MIN_ROAD_LANE} m)`,
      )
    }
    const u = { x: (b.at.x - a.at.x) / length, y: (b.at.y - a.at.y) / length }
    /** `t` m from `a` along the Road, `lat` m right of forward traffic. */
    const at = (t: number, lat: number) => ({ x: a.at.x + u.x * t + u.y * lat, y: a.at.y + u.y * t - u.x * lat })
    const laneWidth = road.laneWidth ?? w
    const speed = road.speed ?? district.roadDefaults.speed
    const [nForward, nBackward] = road.lanes
    const forward = Array.from({ length: nForward }, (_, i) => {
      const lat = (nForward - i - 0.5) * laneWidth
      return makeLane(
        `${id}/fwd/${i}`,
        'road',
        { road: id, forward: true },
        i,
        [at(a.trim, lat), at(length - b.trim, lat)],
        speed,
        !b.junction,
      )
    })
    const backward = Array.from({ length: nBackward }, (_, i) => {
      const lat = -(nBackward - i - 0.5) * laneWidth
      return makeLane(
        `${id}/back/${i}`,
        'road',
        { road: id, forward: false },
        i,
        [at(length - b.trim, lat), at(a.trim, lat)],
        speed,
        !a.junction,
      )
    })
    lanes.push(...forward, ...backward)

    const arm = (junction: Junction, angle: number, approach: Lane[], exit: Lane[]): Arm => {
      const arm: Arm = {
        road: id,
        junction: junction.id,
        angle: (angle + 2 * Math.PI) % (2 * Math.PI),
        priority: 'yield',
        center: junction.at,
        approach,
        exit,
        ringIn: [],
        ringOut: [],
        connections: [],
      }
      junction.arms.push(arm)
      return arm
    }
    const armA = a.junction && arm(a.junction, Math.atan2(u.y, u.x), backward, forward)
    const armB = b.junction && arm(b.junction, Math.atan2(-u.y, -u.x), forward, backward)
    if (!armA || !armB) gateways[id] = (armA ?? armB)!
  }

  for (const junction of junctions) lanes.push(...buildRoundabout(junction, district.junctions[junction.id], w))
  return { lanes, junctions, gateways }
}

/** Ring lanes and candidate Connections of a roundabout whose Arms already carry their Road lanes. Returns the new lanes. */
function buildRoundabout(junction: Junction, spec: JunctionSpec, w: number): Lane[] {
  const { radius: R, ringLanes } = spec
  const arms = junction.arms.sort((a, b) => a.angle - b.angle)
  if (arms.length < 3 || arms.length > 6) throw new Error(`Junction ${junction.id} is a roundabout with ${arms.length} Arms (takes 3 to 6)`)
  const mouth = (arm: Arm) => Math.asin(Math.min(0.9, (Math.max(arm.approach.length, arm.exit.length) * w + 8) / R)) // half-angle on the Ring
  const ringR = (i: number) => R + (ringLanes / 2 - i - 0.5) * w
  const shift = (p: Vec) => ({ x: p.x + junction.at.x, y: p.y + junction.at.y })
  const lanes: Lane[] = []

  arms.forEach((arm, k) => {
    const next = arms[(k + 1) % arms.length]
    const gap = next.angle - arm.angle + (k + 1 < arms.length ? 0 : 2 * Math.PI)
    const need = mouth(arm) + mouth(next) + MIN_RING_ARC
    if (gap < need) {
      throw new Error(
        `Junction ${junction.id}: Arms ${arm.road} and ${next.road} are too close in angle (${deg(gap)}° apart, need ${deg(need)}°)`,
      )
    }
    arm.center = shift({ x: Math.cos(arm.angle) * R, y: Math.sin(arm.angle) * R })
    for (let i = 0; i < ringLanes; i++) {
      const pts = arc(ringR(i), arm.angle + mouth(arm), arm.angle + gap - mouth(next)).map(shift)
      const lane = makeLane(`${junction.id}/ring/${i}/${arm.road}`, 'ring', { junction: junction.id }, i, pts, RING_SPEED)
      arm.ringOut.push(lane)
      next.ringIn.push(lane)
      lanes.push(lane)
    }
  })

  for (const arm of arms) {
    const named = (ls: Lane[], name: string) => ls.map((l, i) => [`${arm.road}.${name}${i}`, l] as const)
    for (const [fromRef, from] of [...named(arm.approach, 'in'), ...named(arm.ringIn, 'ring')]) {
      for (const [toRef, to] of [...named(arm.ringOut, 'ring'), ...named(arm.exit, 'out')]) {
        if (from.kind === 'road' && to.kind === 'road') continue // no straight back out the same Arm
        const ref = `${fromRef}>${toRef}`
        const pts = bezier(from.line.pts[from.line.pts.length - 1], endHeading(from), to.line.pts[0], startHeading(to))
        const lane = makeLane(`${junction.id}:${ref}`, 'connection', { junction: junction.id }, 0, pts, 0)
        lane.speedLimit = Math.min(RING_SPEED, Math.sqrt(MAX_LATERAL_ACCEL * minRadius(lane.line)))
        // Default enabled set: approach lane i to Ring lane i, Ring i stays on Ring i, Ring i leaves to exit lane i.
        const c: Connection = { id: lane.id, ref, arm, from, to, lane, enabled: from.index === to.index, conflicts: [], merges: [] }
        lane.conn = c
        from.next.push(c)
        to.feeders.push(lane)
        arm.connections.push(c)
        lanes.push(lane)
      }
    }
    const { connections } = arm
    for (let i = 0; i < connections.length; i++) {
      for (let j = i + 1; j < connections.length; j++) {
        const a = connections[i]
        const b = connections[j]
        if (a.from === b.from) continue // diverge: car-following handles it
        if (a.to === b.to) {
          a.merges.push(b)
          b.merges.push(a)
          a.conflicts.push({ other: b, s: a.lane.length, otherS: b.lane.length })
          b.conflicts.push({ other: a, s: b.lane.length, otherS: a.lane.length })
          continue
        }
        const hit = intersect(a.lane.line, b.lane.line)
        if (!hit) continue
        a.conflicts.push({ other: b, s: hit[0], otherS: hit[1] })
        b.conflicts.push({ other: a, s: hit[1], otherS: hit[0] })
      }
    }
  }
  return lanes
}

/** Apply a Change to the network. Throws on a Junction, Road or Connection ref the network doesn't have. */
export function applyChange(net: Network, { at, enable = [], disable = [], priority = {} }: Change) {
  const junction = net.junctions.find((j) => j.id === at)
  if (!junction) throw new Error(`"${at}" is not a Revealed Junction`)
  const all = junction.arms.flatMap((a) => a.connections)
  const set = (refs: string[], on: boolean) => {
    for (const ref of refs) {
      // `*` names the same Connection at every Arm: match the ref with each Arm's own Road id starred out.
      const named = all.filter((c) => c.ref === ref || c.ref.replaceAll(`${c.arm.road}.`, '*.') === ref)
      if (!named.length) throw new Error(`Junction ${at} has no Connection "${ref}" (refs look like "${all[0].ref}")`)
      for (const c of named) c.enabled = on
    }
  }
  set(disable, false)
  set(enable, true)
  for (const [road, rule] of Object.entries(priority)) {
    const arm = junction.arms.find((a) => a.road === road)
    if (!arm) throw new Error(`Junction ${at} has no Arm on Road "${road}"`)
    arm.priority = rule
  }
}
