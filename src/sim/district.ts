import { applyChange, buildNetwork } from './network'

export type Priority = 'yield' | 'stop' | 'signal'
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
 * `priority` sets the Priority rule per Arm, keyed by Road id.
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
}

export interface District {
  roadDefaults: RoadAttributes
  junctions: Record<string, JunctionSpec>
  roads: Record<string, RoadSpec>
  levels: Level[]
}

/** Junctions out of the Fog in Level `index`: its own Reveal plus every earlier one. */
export const revealed = (district: District, index: number) => district.levels.slice(0, index + 1).flatMap((l) => l.reveal)

/** Check every Level of a District file, throwing a readable error on the first problem. */
export function validateDistrict(district: District) {
  district.levels.forEach((level, n) => {
    try {
      const net = buildNetwork(district, revealed(district, n))
      const gateways = Object.keys(net.gateways)
      for (const id of [...Object.keys(level.demand), ...Object.values(level.demand).flatMap((d) => Object.keys(d.to))]) {
        if (!net.gateways[id]) throw new Error(`Demand names "${id}", which is not a Gateway (Gateways: ${gateways.join(', ')})`)
      }
      for (const [at, initial] of Object.entries(level.initial)) applyChange(net, { at, ...initial })
      for (const change of level.solution) applyChange(net, change)
    } catch (e) {
      throw new Error(`Level ${n + 1}: ${(e as Error).message}`)
    }
  })
}
