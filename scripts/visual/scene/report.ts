// The scene report (#191): what a City's Blocks were built with, as data, for the rules of finish (`./rules`) to read.
// Plain numbers only, so that a test can write one by hand.

/** A point on the map, m: `x` east, `y` north. */
export interface Pt {
  x: number
  y: number
}

/** A convex outline on the map, counterclockwise. */
export type Hull = Pt[]

/** A box on the map. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** How a thing is drawn: on the soft-lit scenery (`solid`), or as a Close-only prop, hidden beyond Street (`close`). */
export type Layer = 'solid' | 'close'

/** One brick of the build: a thing that stands on a Block, or on the slab between them. */
export interface Thing {
  id: number
  /** The cell of the Tile it stands on, as `x,y`. */
  tile: string
  /** Its Block's index in the report's `blocks`; -1 for the slab, the utility poles and their wires. */
  block: number
  /** The brick's kind, as the kit has it: building, tree, ground, lamp, pole, mover... */
  kind: string
  /** The kit's method that built it (house, keiTruck, bench), else the fill's function (truckCourt); `unknown` if neither. */
  what: string
  /** The first named function outside the kit that built it: the Zone's fill, the kerbside's, the poles'. */
  fill: string
  /** The lot of its Block it stands on, -1 for none. */
  lot: number
  /** Its scene's index in the report's `scenes`, -1 for none. */
  scene: number
  layer: Layer
  /** m above the road: what it stands on, its highest point, and its lowest drawn point. */
  base: number
  top: number
  low: number
  /**
   * Its feet: the outline of each of its parts that stands on its base (whose foot is within `FOOT` of it) and rises
   * from it, so a tree's trunk and not its crown, a table's legs and not its parasol. Flat parts (paving, paint, lawn)
   * and what stands on a roof are not feet.
   */
  feet: Hull[]
  /** The box round its feet, or round all of it if it has none. */
  box: Box
  /** m² of the outline round all of its parts that rise from the ground, for "larger than a car". */
  area: number
  /** Whether it lies flat: paving, paint, a lawn, soil. */
  flat: boolean
  /** Triangles drawn, shadows included. */
  tris: number
  /** Its lit parts (the bulb's): how many, and the lowest one's height above its base. */
  bulbs: number
  bulbLow: number
  /** Pools of light it leaves. */
  pools: number
}

/** Ground a fill laid to be kept clear: a parking bay, a taxi bay, the step before a door. */
export interface Claim {
  kind: 'bay' | 'taxi' | 'door'
  tile: string
  block: number
  hull: Hull
  /** The thing it was laid with. */
  thing: number
}

/** A scene (rule 5): its kind, as its Zone names it, and its things. */
export interface Scene {
  kind: string
  tile: string
  block: number
  things: number[]
}

/** A lot of a Block, with the box round what stands on it and its building form, if the kit knows one. */
export interface Lot {
  tile: string
  block: number
  index: number
  box: Box
  form?: string
  /** Its ground as its Zone cut it, if the Zone told the kit: a box, turned as the lot is. */
  ground?: Hull
}

/** Something that moves on its own along a path on the ground (or a wall, or in the air). */
export interface Mover {
  kind: string
  tile: string
  block: number
  /** Its loop, on the map. */
  path: Pt[]
  /** m of ground it takes either side of its path: 0 for one that works a wall or flies. */
  wide: number
  /** Whether it goes away (off down a Road) part of the day. */
  away: boolean
  thing: number
}

/** A Block of the City. */
export interface Block {
  tile: string
  /** Its Zone's id, or none: an unzoned Tile. */
  zone?: string
  /** Whether its Zone is built to the level of finish (#173). */
  finished: boolean
  stage: number
  loop: Pt[]
  /** m². */
  area: number
  /**
   * Its edge where it faces a Road, as runs of points a metre apart: its kerb, where its pavement lies. None if not
   * known, and then its whole edge is taken for kerb.
   */
  kerb?: Pt[][]
}

/** A model of a vehicle: a car skin, a mover's model, a parked car's brick. */
export interface Vehicle {
  name: string
  /** m its lowest point stands above the ground it drives on. */
  low: number
}

/** What one City built, all of one Zone at one Stage from one seed. */
export interface Report {
  zone: string
  stage: number
  seed: number
  blocks: Block[]
  things: Thing[]
  claims: Claim[]
  scenes: Scene[]
  lots: Lot[]
  movers: Mover[]
  /** Pools of light on the ground: where each lies and how far it reaches. */
  pools: { x: number; y: number; r: number }[]
  /** Things that sway, fly or smoke, by Tile: washing, flags, banners, chimneys' plumes. */
  moving: Record<string, number>
  /** Each colour painted on the scenery (hex), with the triangles that wear it. */
  colours: Record<string, number>
  vehicles: Vehicle[]
  /** The static scenery's triangles and meshes (one draw call each, before the shadow pass). */
  triangles: number
  meshes: number
  /** A hash of every mesh drawn, which any change to what the Zone draws changes. */
  hash: string
  /** ms the build took. */
  ms: number
}

/** A rule that failed: where, what and by how much. */
export interface Failure {
  rule: string
  zone: string
  stage: number
  seed: number
  /** The Tile, as `x,y`, and the Block's index on the report, if it is about one. */
  tile?: string
  block?: number
  what: string
  by: string
}
