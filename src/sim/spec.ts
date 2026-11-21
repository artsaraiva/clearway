export type Priority = 'main' | 'yield' | 'stop'
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
  /** Its 2–4 Arms meet directly, at the angles of their Roads. */
  | { type: 'priority'; at: Point }

/** A straight Road. An end is a Junction id, or the point where the Road leaves the map (a Gateway). Attributes override `roadDefaults`. */
interface RoadSpec extends Partial<RoadAttributes> {
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
 * `priority` sets the Priority rule per Arm of a Priority junction, keyed by Road id. Every Arm starts as `main`, with
 * no sign, and Arms that are all `main` or all `yield` make the same uncontrolled Junction. A `stop` Arm gives way to
 * `main` and `yield` Arms, and its vehicles stop at its line whoever is coming.
 *
 * `signal` gives a Priority junction of three Arms or more a Signal, or takes it away. While it has one its Signal
 * says who goes, and the Priority rules of its Arms wait, unread, for the Signal to go.
 */
export interface Change {
  at: string
  enable?: string[]
  disable?: string[]
  priority?: Record<string, Priority>
  signal?: boolean
}

/** The Junctions and Roads a network is built from. A Road with a point for an end is a Gateway. */
export interface NetworkSpec {
  roadDefaults: RoadAttributes
  junctions: Record<string, JunctionSpec>
  roads: Record<string, RoadSpec>
}

/** Per Gateway (by Road id): arrivals per minute and destination weights over the other Gateways. */
export type DemandSpec = Record<string, { rate: number; to: Record<string, number> }>

/**
 * A hand-built network with its own Demand. The game builds every Sim from a City; a Scenario is for the fixtures of
 * tests and benches, which need Roads and Demand no City has.
 */
export interface Scenario {
  network: NetworkSpec
  demand: DemandSpec
}
