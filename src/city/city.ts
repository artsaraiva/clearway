// The City: the Tiles the player has placed and the rules for placing one more. Pure data and rules: nothing here
// knows about the simulation or the renderer.

import { PRICE } from '../tuning'

/** A side of a cell: 0 east, 1 north, 2 west, 3 south. Counterclockwise, like a rotation. */
export type Direction = 0 | 1 | 2 | 3
export const DIRECTIONS: Direction[] = [0, 1, 2, 3]
const STEP = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const

/** A cell of the grid, which has no bounds. `x` grows east and `y` north. */
export interface Cell {
  x: number
  y: number
}

export interface Layout {
  id: 'straight' | 'curve' | 'tee' | 'crossroads' | 'roundabout'
  name: string
  /** Whether a Road leaves by each side of the cell, indexed by Direction, before rotation. */
  roads: readonly [boolean, boolean, boolean, boolean]
}

export const LAYOUTS: readonly Layout[] = [
  { id: 'straight', name: 'Straight', roads: [true, false, true, false] },
  { id: 'curve', name: 'Curve', roads: [true, true, false, false] },
  { id: 'tee', name: 'T-junction', roads: [true, true, true, false] },
  { id: 'crossroads', name: 'Crossroads', roads: [true, true, true, true] },
  { id: 'roundabout', name: 'Roundabout', roads: [true, true, true, true] },
]

/** What every Block of a Tile is built as, which the player picks. */
export interface Zone {
  id: 'low-density' | 'medium-density' | 'high-density' | 'offices' | 'shops' | 'industrial' | 'parks' | 'green' | 'farms'
  name: string
}

/** The Zones in the order the bar offers them. A Tile can also be unzoned: its Blocks are left as grass. */
export const ZONES: readonly Zone[] = [
  { id: 'low-density', name: 'Low-density residential' },
  { id: 'medium-density', name: 'Medium-density residential' },
  { id: 'high-density', name: 'High-density residential' },
  { id: 'offices', name: 'Offices' },
  { id: 'shops', name: 'Shops' },
  { id: 'industrial', name: 'Industrial' },
  { id: 'parks', name: 'Parks' },
  { id: 'green', name: 'Green' },
  { id: 'farms', name: 'Farms' },
]

/** The Zone a new run's first Tile is built as, and the one picked when a run opens. */
export const FIRST_ZONE = ZONES.find((z) => z.id === 'low-density')!

export interface Tile {
  cell: Cell
  layout: Layout
  /** Quarter turns counterclockwise. */
  rotation: number
  /** What every Block of the Tile is built as. None: the Tile is unzoned, roads only. */
  zone?: Zone
}

/** A Road end of the City with no Tile beyond it. */
export interface Gateway {
  cell: Cell
  direction: Direction
}

export type Refusal = 'cell taken' | 'no Tile to swap' | 'still assembling' | 'edge mismatch' | 'no road joins' | 'fewer than two Gateways'

/** Whether a drop or a Swap is legal. `joins` is how many placed Tiles it joins by road. */
export type Verdict = { legal: true; joins: number } | { legal: false; reason: Refusal }

const key = (cell: Cell) => `${cell.x},${cell.y}`
/** The cell on side `d` of `cell`. */
export const beyond = (cell: Cell, d: Direction): Cell => ({ x: cell.x + STEP[d][0], y: cell.y + STEP[d][1] })
const opposite = (d: Direction) => ((d + 2) % 4) as Direction

/** Whether a Road leaves `tile` by side `d`. */
export const hasRoad = (tile: Pick<Tile, 'layout' | 'rotation'>, d: Direction) => tile.layout.roads[(((d - tile.rotation) % 4) + 4) % 4]

export class City {
  /** The Tiles placed, in order, those in their Assembly too. A Swap keeps the Tile's position in the order. */
  readonly tiles: Tile[]
  private readonly at = new Map<string, Tile>()
  /** The Tiles of `tiles` in their Assembly, in the order dropped, each with the landed Tile it swaps out, if any. */
  private readonly landing = new Map<Tile, Tile | undefined>()

  /** A City of `tiles`. Those of them still in their Assembly in `from` are in it in this City too. */
  constructor(tiles: Tile[], from?: City) {
    this.tiles = [...tiles]
    for (const tile of this.tiles) this.at.set(key(tile.cell), tile)
    for (const [tile, old] of from?.landing ?? []) if (this.tiles.includes(tile)) this.landing.set(tile, old)
  }

  /** A new City: one Tile, its Layout and rotation drawn from `seed`, built as the first Zone. */
  static start(seed: number) {
    const random = mulberry32(seed)
    const layout = LAYOUTS[Math.floor(random() * LAYOUTS.length)]
    return new City([{ cell: { x: 0, y: 0 }, layout, rotation: Math.floor(random() * 4), zone: FIRST_ZONE }])
  }

  /** The Tile on `cell`, if one is placed there. */
  tileAt(cell: Cell): Tile | undefined {
    return this.at.get(key(cell))
  }

  /** The Price: what the next Tile costs, whatever its Layout or Zone. A Swap costs it too, and does not raise it. */
  get price() {
    return Math.round((PRICE.base * PRICE.growth ** (this.tiles.length - 1)) / PRICE.round) * PRICE.round
  }

  /** Whether `layout`, turned `rotation`, may be dropped on the empty `cell`. */
  drop(layout: Layout, rotation: number, cell: Cell): Verdict {
    if (this.at.has(key(cell))) return { legal: false, reason: 'cell taken' }
    return this.fits({ cell, layout, rotation })
  }

  /** Whether `layout`, turned `rotation`, may replace the Tile on `cell`. Not until a Tile in its Assembly has landed. */
  swap(layout: Layout, rotation: number, cell: Cell): Verdict {
    const old = this.at.get(key(cell))
    if (!old) return { legal: false, reason: 'no Tile to swap' }
    if (this.landing.has(old)) return { legal: false, reason: 'still assembling' }
    return this.fits({ cell, layout, rotation })
  }

  /**
   * Drop a Tile built as `zone` (none: unzoned) on an empty cell, or swap the Layout of the Tile on a taken one, which
   * keeps its own Zone. The Tile starts its Assembly if `assembling` says so, and otherwise has landed at once. A refused
   * placement changes nothing.
   */
  place(layout: Layout, rotation: number, cell: Cell, zone?: Zone, { assembling = false } = {}): Verdict {
    const old = this.at.get(key(cell))
    const tile: Tile = { cell: { ...cell }, layout, rotation, zone: old ? old.zone : zone }
    const verdict = old ? this.swap(layout, rotation, cell) : this.fits(tile)
    if (!verdict.legal) return verdict
    this.put(tile, old)
    if (assembling) this.landing.set(tile, old)
    return verdict
  }

  /**
   * The Tiles in their Assembly, in the order they were dropped: placed, so the rules count them, but not yet open to
   * traffic.
   */
  get assembling(): Tile[] {
    return [...this.landing.keys()]
  }

  /** Land the first Tile in its Assembly, which opens it to traffic. None if no Tile is in its Assembly. */
  land(): Tile | undefined {
    const [first] = this.assembling
    if (first) this.landing.delete(first)
    return first
  }

  /**
   * The Tiles that have landed, as a City of their own: the roads the traffic drives. A Tile placed in its Assembly is
   * not there yet, and a Tile swapped in its Assembly is still the Tile it swaps out.
   */
  landed(): City {
    return new City(this.tiles.flatMap((t) => (!this.landing.has(t) ? [t] : (this.landing.get(t) ?? []))))
  }

  /**
   * Build the Tile on `cell` as `zone`, or unzone it. A Zone never makes a Tile illegal. False if no Tile is on `cell`,
   * or the Tile is in its Assembly.
   */
  rezone(cell: Cell, zone?: Zone): boolean {
    const old = this.at.get(key(cell))
    if (!old || this.landing.has(old)) return false
    this.put({ ...old, zone }, old)
    return true
  }

  /** Every Road end with no Tile beyond it, in the order the Tiles were placed. */
  gateways(): Gateway[] {
    return this.gatewaysWith()
  }

  /** The Gateways the City would have with `tile` on its cell, in place of whatever is there. */
  private gatewaysWith(tile?: Tile): Gateway[] {
    const taken = (cell: Cell) => this.at.has(key(cell)) || (tile !== undefined && key(cell) === key(tile.cell))
    const tiles = tile ? [...this.tiles.filter((t) => key(t.cell) !== key(tile.cell)), tile] : this.tiles
    return tiles.flatMap((t) =>
      DIRECTIONS.filter((d) => hasRoad(t, d) && !taken(beyond(t.cell, d))).map((direction) => ({ cell: { ...t.cell }, direction })),
    )
  }

  /** Put `tile` on its cell, in the place of `old` in the order if it replaces one. */
  private put(tile: Tile, old: Tile | undefined) {
    if (old) this.tiles[this.tiles.indexOf(old)] = tile
    else this.tiles.push(tile)
    this.at.set(key(tile.cell), tile)
  }

  /** The conditions a drop and a Swap share. The Tile already on the cell, if any, is ignored. */
  private fits(tile: Tile): Verdict {
    let joins = 0
    for (const d of DIRECTIONS) {
      const neighbour = this.at.get(key(beyond(tile.cell, d)))
      if (!neighbour) continue
      const road = hasRoad(neighbour, opposite(d))
      if (road !== hasRoad(tile, d)) return { legal: false, reason: 'edge mismatch' }
      if (road) joins++
    }
    if (!joins) return { legal: false, reason: 'no road joins' }
    if (this.gatewaysWith(tile).length < 2) return { legal: false, reason: 'fewer than two Gateways' }
    return { legal: true, joins }
  }
}

/** A random stream in [0, 1) that depends only on its seed. The same generator as the sim's, which this module cannot import. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
