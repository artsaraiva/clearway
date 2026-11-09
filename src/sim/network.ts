import { arc, bezier, intersect, minRadius, polyline, type Polyline, type Vec } from './geometry'
import type { Vehicle } from './sim'

export interface RoundaboutSpec {
  radius: number
  laneWidth: number
  ringLanes: number
  approachLanes: number
  approachLength: number
  /** arm id → angle in degrees, counterclockwise from +x (east) */
  arms: Record<string, number>
}

export type LaneKind = 'approach' | 'exit' | 'ring' | 'connection'

export interface Lane {
  id: string
  kind: LaneKind
  /** Arm for approach/exit lanes; node arm for connection lanes; departing node for ring lanes. */
  arm: string
  /** 0 = outermost / rightmost. */
  index: number
  line: Polyline
  length: number
  speedLimit: number
  /** Ordered front (largest s) to back. */
  vehicles: Vehicle[]
  /** Candidate connections leaving this lane (segment lanes only). */
  next: Connection[]
  /** Connection lanes ending on this lane. */
  feeders: Lane[]
  /** Set on connection lanes. */
  conn?: Connection
}

export interface Conflict {
  other: Connection
  /** Conflict point as arc length along this connection's lane, and along the other's. */
  s: number
  otherS: number
}

export interface Connection {
  id: string
  node: string
  fromPort: string
  toPort: string
  from: Lane
  to: Lane
  lane: Lane
  enabled: boolean
  conflicts: Conflict[]
  /** Connections at the same node ending on the same lane. */
  merges: Connection[]
}

export interface Node {
  arm: string
  center: Vec
  inPorts: Record<string, Lane>
  outPorts: Record<string, Lane>
  connections: Connection[]
}

export interface Network {
  lanes: Lane[]
  nodes: Node[]
  approaches: Record<string, Lane[]>
  exits: Record<string, Lane[]>
}

export const ROAD_SPEED = 13.9 // 50 km/h on approaches and exits
export const RING_SPEED = 9
const MAX_LATERAL_ACCEL = 3
const ENTRY_SETBACK = 15 // approach stop line distance outside the ring's outer edge

function makeLane(id: string, kind: LaneKind, arm: string, index: number, pts: Vec[], speedLimit: number): Lane {
  const line = polyline(pts)
  return { id, kind, arm, index, line, length: line.length, speedLimit, vehicles: [], next: [], feeders: [] }
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

export function buildNetwork(rb: RoundaboutSpec): Network {
  const { radius: R, laneWidth: w, ringLanes, approachLanes, approachLength } = rb
  const arms = Object.entries(rb.arms)
    .map(([id, deg]) => ({ id, angle: (deg * Math.PI) / 180 }))
    .sort((a, b) => a.angle - b.angle) // counterclockwise = direction of circulation
  const rEntry = R + (ringLanes * w) / 2 + ENTRY_SETBACK
  const delta = Math.asin(Math.min(0.9, (approachLanes * w + 8) / R)) // node half-angle on the ring
  const ringR = (i: number) => R + (ringLanes / 2 - i - 0.5) * w

  const lanes: Lane[] = []
  const approaches: Record<string, Lane[]> = {}
  const exits: Record<string, Lane[]> = {}
  const ringOut: Record<string, Lane[]> = {} // ring segments departing each node

  arms.forEach(({ id, angle }, k) => {
    const u = { x: Math.cos(angle), y: Math.sin(angle) } // outward along the arm
    const n = { x: -u.y, y: u.x } // right-hand side of inbound traffic
    const at = (r: number, lat: number) => ({ x: u.x * r + n.x * lat, y: u.y * r + n.y * lat })
    approaches[id] = []
    exits[id] = []
    for (let i = 0; i < approachLanes; i++) {
      const lat = (approachLanes - i - 0.5) * w
      approaches[id].push(makeLane(`${id}/in/${i}`, 'approach', id, i, [at(rEntry + approachLength, lat), at(rEntry, lat)], ROAD_SPEED))
      exits[id].push(makeLane(`${id}/out/${i}`, 'exit', id, i, [at(rEntry, -lat), at(rEntry + approachLength, -lat)], ROAD_SPEED))
    }
    const nextAngle = k + 1 < arms.length ? arms[k + 1].angle : arms[0].angle + 2 * Math.PI
    ringOut[id] = []
    for (let i = 0; i < ringLanes; i++) {
      ringOut[id].push(makeLane(`ring${i}/${id}`, 'ring', id, i, arc(ringR(i), angle + delta, nextAngle - delta), RING_SPEED))
    }
    lanes.push(...approaches[id], ...exits[id], ...ringOut[id])
  })

  const nodes: Node[] = arms.map(({ id, angle }, k) => {
    const prev = arms[(k + arms.length - 1) % arms.length].id
    const inPorts: Record<string, Lane> = {}
    const outPorts: Record<string, Lane> = {}
    approaches[id].forEach((l, i) => (inPorts[`approach${i}`] = l))
    ringOut[prev].forEach((l, i) => (inPorts[`ring${i}`] = l))
    ringOut[id].forEach((l, i) => (outPorts[`ring${i}`] = l))
    exits[id].forEach((l, i) => (outPorts[`exit${i}`] = l))

    const connections: Connection[] = []
    for (const [fromPort, from] of Object.entries(inPorts)) {
      for (const [toPort, to] of Object.entries(outPorts)) {
        if (from.kind === 'approach' && to.kind === 'exit') continue // no U-turns at the node
        const pts = bezier(from.line.pts[from.line.pts.length - 1], endHeading(from), to.line.pts[0], startHeading(to))
        const lane = makeLane(`${id}:${fromPort}>${toPort}`, 'connection', id, 0, pts, 0)
        lane.speedLimit = Math.min(RING_SPEED, Math.sqrt(MAX_LATERAL_ACCEL * minRadius(lane.line)))
        const c: Connection = { id: lane.id, node: id, fromPort, toPort, from, to, lane, enabled: false, conflicts: [], merges: [] }
        lane.conn = c
        from.next.push(c)
        to.feeders.push(lane)
        connections.push(c)
        lanes.push(lane)
      }
    }
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
    return { arm: id, center: { x: Math.cos(angle) * R, y: Math.sin(angle) * R }, inPorts, outPorts, connections }
  })

  return { lanes, nodes, approaches, exits }
}
