import type { Change, District, Priority } from './district'
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
  /** The Arm of its incoming lane (on a roundabout both its lanes sit there). */
  arm: Arm
  from: Lane
  to: Lane
  lane: Lane
  enabled: boolean
  conflicts: Conflict[]
  /** Connections ending on the same lane. */
  merges: Connection[]
}

/** One Road's end at a Junction. */
export interface Arm {
  road: string
  junction: string
  /** Direction from the Junction's centre toward the Road's other end, radians counterclockwise from +x (east). */
  angle: number
  priority: Priority
  /** Where the Arm meets the Ring, or the mouth of a Priority junction. */
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
  /** Counterclockwise: the direction of circulation on a roundabout, and each Arm's neighbour to its right. */
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
const CORNER = 5 // m from where the edges of a Priority junction's Roads meet back to their stop lines
const MIN_ARM_GAP = Math.PI / 6 // between neighbouring Arms of a Priority junction
const STRAIGHT = Math.PI / 4 // a Connection deflecting less than this goes straight on

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

/** Distance from a Junction's centre to where its Roads' lanes end. Throws if a Priority junction's Arms are too close in angle. */
function footprint(district: District, id: string): number {
  const spec = district.junctions[id]
  const w = district.roadDefaults.laneWidth
  if (spec.type === 'roundabout') return spec.radius + (spec.ringLanes * w) / 2 + ENTRY_SETBACK
  const ends = Object.entries(district.roads)
    .flatMap(([road, r]) => {
      const other = r.from === id ? r.to : r.to === id ? r.from : undefined
      const at = typeof other === 'string' ? district.junctions[other]?.at : other
      if (!at) return []
      return [{ road, angle: Math.atan2(at[1] - spec.at[1], at[0] - spec.at[0]), halfWidth: Math.max(...r.lanes) * (r.laneWidth ?? w) }]
    })
    .sort((a, b) => a.angle - b.angle)
  // Far enough out to clear the corners where the edges of neighbouring Roads meet.
  let corner = 0
  ends.forEach((end, k) => {
    const next = ends[(k + 1) % ends.length]
    const gap = next.angle - end.angle + (k + 1 < ends.length ? 0 : 2 * Math.PI)
    if (gap < MIN_ARM_GAP) {
      throw new Error(
        `Junction ${id}: Arms ${end.road} and ${next.road} are too close in angle (${deg(gap)}° apart, need ${deg(MIN_ARM_GAP)}°)`,
      )
    }
    if (gap < Math.PI) corner = Math.max(corner, Math.max(end.halfWidth, next.halfWidth) / Math.tan(gap / 2))
  })
  return corner + CORNER
}

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
      return { at: { x: spec.at[0], y: spec.at[1] }, trim: footprint(district, end), junction: junctions.find((j) => j.id === end) }
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

  for (const junction of junctions) {
    const spec = district.junctions[junction.id]
    junction.arms.sort((a, b) => a.angle - b.angle)
    lanes.push(
      ...(spec.type === 'roundabout'
        ? buildRoundabout(junction, spec.radius, spec.ringLanes, w)
        : buildPriority(junction, footprint(district, junction.id))),
    )
  }
  return { lanes, junctions, gateways }
}

/** A candidate Connection from `from` to `to`, entered at `arm`: a curve between the two lanes, driven at most at `maxSpeed`. Returns its lane. */
function connect(junction: Junction, arm: Arm, ref: string, from: Lane, to: Lane, maxSpeed: number, enabled: boolean): Lane {
  const pts = bezier(from.line.pts[from.line.pts.length - 1], endHeading(from), to.line.pts[0], startHeading(to))
  const lane = makeLane(`${junction.id}:${ref}`, 'connection', { junction: junction.id }, 0, pts, 0)
  lane.speedLimit = Math.min(maxSpeed, Math.sqrt(MAX_LATERAL_ACCEL * minRadius(lane.line)))
  const c: Connection = { id: lane.id, ref, arm, from, to, lane, enabled, conflicts: [], merges: [] }
  lane.conn = c
  from.next.push(c)
  to.feeders.push(lane)
  arm.connections.push(c)
  return lane
}

/** Record where the Connections that can meet do: merges share an outgoing lane, crossings come from their curves. */
function findConflicts(connections: Connection[]) {
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

/**
 * Candidate Connections of a Priority junction whose Arms already carry their Road lanes, which end `reach` m from
 * its centre: every incoming lane to every outgoing lane of another Arm. Returns the new lanes.
 */
function buildPriority(junction: Junction, reach: number): Lane[] {
  const { arms } = junction
  if (arms.length < 3 || arms.length > 4)
    throw new Error(`Junction ${junction.id} is a Priority junction with ${arms.length} Arms (takes 3 or 4)`)
  const lanes: Lane[] = []
  for (const arm of arms) {
    arm.center = { x: junction.at.x + Math.cos(arm.angle) * reach, y: junction.at.y + Math.sin(arm.angle) * reach }
    for (const from of arm.approach) {
      for (const out of arms) {
        if (out === arm) continue // no U-turns
        // How far the Connection deflects from straight on: negative to the right, positive to the left.
        const turn = Math.atan2(Math.sin(out.angle - arm.angle - Math.PI), Math.cos(out.angle - arm.angle - Math.PI))
        const [right, left] = [turn < -STRAIGHT, turn > STRAIGHT]
        // Default enabled set: the rightmost lane turns right into the rightmost lane, the leftmost turns left into the
        // leftmost, and every lane goes straight on into its own lane (so a single lane takes all turns).
        const takes = right ? from.index === 0 : left ? from.index === arm.approach.length - 1 : true
        const into = right ? 0 : left ? out.exit.length - 1 : Math.min(from.index, out.exit.length - 1)
        for (const to of out.exit) {
          const ref = `${arm.road}.in${from.index}>${out.road}.out${to.index}`
          lanes.push(connect(junction, arm, ref, from, to, Math.min(from.speedLimit, to.speedLimit), takes && to.index === into))
        }
      }
    }
  }
  findConflicts(arms.flatMap((a) => a.connections))
  return lanes
}

/** Ring lanes and candidate Connections of a roundabout whose Arms already carry their Road lanes. Returns the new lanes. */
function buildRoundabout(junction: Junction, R: number, ringLanes: number, w: number): Lane[] {
  const { arms } = junction
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
        // Default enabled set: approach lane i to Ring lane i, Ring i stays on Ring i, Ring i leaves to exit lane i.
        lanes.push(connect(junction, arm, `${fromRef}>${toRef}`, from, to, RING_SPEED, from.index === to.index))
      }
    }
    findConflicts(arm.connections)
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
