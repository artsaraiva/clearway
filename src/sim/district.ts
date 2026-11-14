import { overlaps, type Bounds, type Vec } from './geometry'
import { applyChange, buildNetwork, type Lane, type Network } from './network'

export type Priority = 'main' | 'yield'
export type Tool = 'connector' | 'priority'
/** Metres, x east and y north. */
export type Point = [number, number]

/** `speed` is the limit in m/s. The edge attributes (`bikeBand`, `sidewalk`, `median`) are for the renderer; the sim never reads them. */
export interface RoadAttributes {
  speed: number
  laneWidth: number
  bikeBand: boolean
  sidewalk: number
  median: number
}

export type JunctionSpec =
  | {
      type: 'roundabout'
      at: Point
      /** Radius of the Ring's centreline. */
      radius: number
      ringLanes: number
    }
  /** A T-junction or crossroads: its 3–4 Arms meet directly, at the angles of their Roads. */
  | { type: 'priority'; at: Point }

/** A straight Road. An end is a Junction id, or a point on the District edge (a Gateway). Attributes override `roadDefaults`. */
export interface RoadSpec extends Partial<RoadAttributes> {
  from: Point | string
  to: Point | string
  /** Lanes per direction: [from→to, to→from]. */
  lanes: [number, number]
}

/**
 * One use of a Tool at a Junction, in the player's vocabulary.
 *
 * `enable` and `disable` take Connection refs, `<lane>><lane>`, with lanes named relative to the Junction:
 * `R1.in0` is incoming lane 0 of Road R1, `R1.out1` its outgoing lane 1, and `R1.ring0` Ring lane 0 at R1's Arm
 * (arriving there on the left of `>`, departing on the right). Lane 0 is the rightmost. On a roundabout both lanes
 * of a Connection sit at the same Arm, and `*` as the Road id on both sides names that Connection at every Arm. On a
 * Priority junction a Connection runs from one Arm to another: `R1.in0>R2.out0`.
 *
 * `priority` sets the Priority rule per Arm of a Priority junction, keyed by Road id. Every Arm starts as `yield`, and
 * Arms that are all `main` or all `yield` make the same uncontrolled Junction.
 */
export interface Change {
  at: string
  enable?: string[]
  disable?: string[]
  priority?: Record<string, Priority>
}

export interface Level {
  /** Junctions this Level lifts out of the Fog. */
  reveal: string[]
  seed: number
  /** Tools the player may use in this Level. */
  tools: Tool[]
  /** Per Gateway (by Road id): arrivals per minute and destination weights over the other Gateways. */
  demand: Record<string, { rate: number; to: Record<string, number> }>
  /** Per Junction: deviations from its type's default configuration. */
  initial: Record<string, Omit<Change, 'at'>>
  /** Reference solution. */
  solution: Change[]
  /**
   * The pieces of slab this Level's Reveal adds, as road plate: rectangles that never overlap each other or an earlier
   * Level's. A Reveal only ever adds slab: the Level's Blocks are cut within its own pieces, so no later Reveal changes
   * them, and its new Roads must stay on them. The slab Revealed so far carries every Road, and a Road that leaves the
   * District ends at its edge. A Road into the Fog may stop short of it (see `fogReach`). For the renderer; the sim
   * never reads it.
   */
  pieces: Bounds[]
}

/** Authored scenery standing at a point. `name` is its label on the map. */
export interface Landmark {
  type: 'tower'
  name: string
  at: Point
}

/** A Block that is not split into lots: the one around `at`. A park has its pond at `at`. */
export interface SpecialBlock {
  type: 'plaza' | 'park'
  name?: string
  at: Point
}

/** What stands on a District's Blocks. It is for the renderer; the sim never reads it. */
export interface Scenery {
  /** The first theme is a city; countryside and harbor join the type when their fills exist. */
  theme: 'city'
  /** Seed of the Block fill: the same seed gives the same town. */
  seed: number
  landmarks: Landmark[]
  blocks: SpecialBlock[]
  /** Street names by Road id. Roads that share a name are one street. */
  streets: Record<string, string>
  /** Roads lined with street trees. */
  avenues: string[]
}

export interface District {
  roadDefaults: RoadAttributes
  junctions: Record<string, JunctionSpec>
  roads: Record<string, RoadSpec>
  levels: Level[]
  /** Without it the Blocks stay bare pavement. */
  scenery?: Scenery
}

/** Junctions out of the Fog in Level `index`: its own Reveal plus every earlier one. */
export const revealed = (district: District, index: number) => district.levels.slice(0, index + 1).flatMap((l) => l.reveal)

/** Check every Level of a District file, throwing a readable error on the first problem. */
export function validateDistrict(district: District) {
  let before: Network | null = null
  district.levels.forEach((level, n) => {
    try {
      const net = buildNetwork(district, revealed(district, n))
      const gateways = Object.keys(net.gateways)
      if (level.tools.includes('priority') && !net.junctions.some((j) => j.type === 'priority')) {
        throw new Error('the Priority rule Tool needs a Revealed Priority junction')
      }
      for (const id of [...Object.keys(level.demand), ...Object.values(level.demand).flatMap((d) => Object.keys(d.to))]) {
        if (!net.gateways[id]) throw new Error(`Demand names "${id}", which is not a Gateway (Gateways: ${gateways.join(', ')})`)
      }
      for (const [at, initial] of Object.entries(level.initial)) applyChange(net, { at, ...initial })
      for (const change of level.solution) applyChange(net, change)
      checkPieces(district, n, net, before)
      before = net
    } catch (e) {
      throw new Error(`Level ${n + 1}: ${(e as Error).message}`)
    }
  })
}

/** A lane of a Road into the Fog, carried straight on from its Gateway (`from`) to `to`. `half` is half its width. */
export interface Reach {
  lane: Lane
  from: Vec
  to: Vec
  half: number
}

const REACH_STEP = 0.25 // m between the points tried along a lane carried on

/**
 * Where the lanes of each Road into the Fog would run on past their Gateway: straight on, as far as the slab Revealed
 * in `net` goes, and no further than the fogged Junction's centre. Such a Road may stop short of the slab's edge,
 * since Junctions differ in footprint. The stretch beyond it is road plate, kept for the Junction to come: the only
 * earlier slab a Reveal may run new lanes onto.
 */
export function fogReach(district: District, net: Network): Reach[] {
  const ids = new Set(net.junctions.map((j) => j.id))
  const slab = district.levels.filter((l) => l.reveal.every((id) => ids.has(id))).flatMap((l) => l.pieces)
  const on = (x: number, y: number) => slab.some((r) => x >= r.x0 - SLACK && x <= r.x1 + SLACK && y >= r.y0 - SLACK && y <= r.y1 + SLACK)
  return Object.entries(net.gateways).flatMap(([road, arm]) => {
    const spec = district.roads[road]
    const fogged = [spec.from, spec.to].find((end) => typeof end === 'string' && !ids.has(end))
    if (typeof spec.from !== 'string' || typeof spec.to !== 'string' || typeof fogged !== 'string') return [] // on the District edge
    const [cx, cy] = district.junctions[fogged].at
    const [ux, uy] = [Math.cos(arm.angle), Math.sin(arm.angle)]
    const half = (spec.laneWidth ?? district.roadDefaults.laneWidth) / 2
    const ends = [...arm.exit.map((lane) => ({ lane, from: lane.line.pts[lane.line.pts.length - 1] })), ...arm.approach.map((lane) => ({ lane, from: lane.line.pts[0] }))] // prettier-ignore
    return ends.map(({ lane, from }) => {
      const far = (cx - from.x) * ux + (cy - from.y) * uy
      let d = 0
      while (d + REACH_STEP <= far && on(from.x + ux * (d + REACH_STEP), from.y + uy * (d + REACH_STEP))) d += REACH_STEP
      return { lane, from, to: { x: from.x + ux * d, y: from.y + uy * d }, half }
    })
  })
}

const SLACK = 0.01 // m a lane may stand past the slab's edge, for rounding
const PAST = 0.5 // m past a Gateway that must already be off the slab

/**
 * Check Level `n`'s pieces of slab: each a rectangle overlapping no other, the slab so far carrying the Level's
 * network `net` with each Gateway at its edge, and every lane new since the network `before` on the Level's own pieces.
 */
function checkPieces(district: District, n: number, net: Network, before: Network | null) {
  const { pieces } = district.levels[n]
  if (!pieces.length) throw new Error('it adds no pieces of slab')
  const earlier = district.levels.slice(0, n).flatMap((level) => level.pieces)
  pieces.forEach((piece, i) => {
    if (!(piece.x0 < piece.x1 && piece.y0 < piece.y1)) throw new Error(`its piece ${i + 1} needs x0 < x1 and y0 < y1`)
    const clash = [...earlier, ...pieces.slice(0, i)].find((other) => overlaps(other, piece))
    if (clash)
      throw new Error(`its piece ${i + 1} overlaps a piece of Level ${district.levels.findIndex((l) => l.pieces.includes(clash)) + 1}`)
  })
  const on = (rects: Bounds[], x: number, y: number, slack = SLACK) =>
    rects.some((r) => x >= r.x0 - slack && x <= r.x1 + slack && y >= r.y0 - slack && y <= r.y1 + slack)
  const slab = [...earlier, ...pieces]
  const old = new Set(before?.lanes.map((lane) => lane.id))
  // Earlier slab kept for this Level's Junctions: where the Roads into the Fog were carried on.
  const kept = before ? fogReach(district, before) : []
  const reserved = (x: number, y: number) =>
    kept.some(({ from, to, half }) => {
      const [dx, dy] = [to.x - from.x, to.y - from.y]
      const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(x - from.x - dx * t, y - from.y - dy * t) <= half + SLACK
    })
  const where = (x: number, y: number) => `(${x.toFixed(1)}, ${y.toFixed(1)})`

  for (const lane of net.lanes) {
    const { pts } = lane.line
    // A Road lane at its full width; Ring and Connection lanes along their centre line.
    const half = 'road' in lane.owner ? (district.roads[lane.owner.road].laneWidth ?? district.roadDefaults.laneWidth) / 2 : 0
    const heading = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
    for (const p of pts) {
      for (const side of half ? [-half, half] : [0]) {
        const [x, y] = [p.x - Math.sin(heading) * side, p.y + Math.cos(heading) * side]
        if (!on(slab, x, y)) throw new Error(`lane ${lane.id} runs off the slab at ${where(x, y)}`)
        if (!old.has(lane.id) && !on(pieces, x, y) && !reserved(x, y)) {
          throw new Error(`lane ${lane.id} runs onto an earlier Level's slab at ${where(x, y)}: a Reveal only adds slab`)
        }
      }
    }
  }
  for (const [road, arm] of Object.entries(net.gateways)) {
    const { from, to } = district.roads[road]
    if (typeof from === 'string' && typeof to === 'string') continue // into the Fog: it may stop short of the edge
    for (const lane of arm.exit) {
      const { pts } = lane.line
      const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (on(slab, b.x + ((b.x - a.x) / len) * PAST, b.y + ((b.y - a.y) / len) * PAST, 0)) {
        throw new Error(`Road ${road} leaves the map at ${where(b.x, b.y)}, so the slab must end there`)
      }
    }
  }
}
