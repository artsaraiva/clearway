import type { Cell, Zone } from '../city/city'
import { mulberry32 } from '../sim/demand'
import { middle, pointAt, type Bounds, type Vec } from '../sim/geometry'
import type { Lane, Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { CELL, cellAt } from '../sim/tiles'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { Kit } from './kit'
import { bikeLane, island, park, plaza, site, tower, towerGround, verge } from './landmarks'
import type { Scenery } from './scenery'
import { LOOKS } from './zones'

const NARROW = 12 // m: a Block narrower than this has no room for lots and carries a bike lane
// m along an avenue and in from the kerb, and the trees' size.
export const STREET_TREES = { spacing: 13.6, inset: 3.4, size: 0.55 }
const CORNER = 0.32 // of a cell, east or west and north or south of its centre: the middle of one of its corners

/** What a Block's fill reads besides the Block itself. */
export interface Surroundings {
  net: Network
  /** What `net` was built from. */
  spec: NetworkSpec
  scenery: Scenery
  field: Field
  /** The Zone of the Tile the Block lies on. None: the Tile is unzoned, roads only. */
  zone?: Zone
}

/**
 * Where the seed stands a landmark on a Block, if anywhere. Each square of `every` × `every` cells draws one point from
 * the seed, in the middle of one corner of one of its cells, where no Layout runs a Road; the Block it lies on gets the
 * landmark.
 */
function seededLandmark(seed: number, block: Block, every: number): Vec | null {
  const cell = cellAt(middle(block))
  const [sx, sy] = [Math.floor(cell.x / every), Math.floor(cell.y / every)]
  const draw = mulberry32(Math.imul(seed ^ Math.imul(sx, 0x85ebca6b), 0x9e3779b1) ^ Math.imul(sy, 0xc2b2ae35))
  const [x, y, east, north] = [Math.floor(draw() * every), Math.floor(draw() * every), draw() < 0.5, draw() < 0.5]
  if (cell.x !== sx * every + x || cell.y !== sy * every + y) return null
  const at = { x: (cell.x + (east ? CORNER : -CORNER)) * CELL, y: (cell.y + (north ? CORNER : -CORNER)) * CELL }
  return inside(block.loop, at.x, at.y) ? at : null
}

/**
 * Whether the seed lines a Road with street trees, the Road read from a line of its lane: by the row of cells an east–west
 * Road runs along, or the column a north–south one does, so that a whole avenue runs straight across the City whatever
 * order its Tiles are laid in. `chance` of the rows and columns are avenues.
 */
function seededAvenue(seed: number, pts: Vec[], chance: number): boolean {
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const across = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const line = Math.round((across ? a.y + b.y : a.x + b.x) / 2 / CELL)
  return mulberry32(Math.imul(seed ^ (across ? 0x5bd1e995 : 0x1b873593), 0x9e3779b1) ^ Math.imul(line, 0x85ebca6b))() < chance
}

/** Whether the Road a lane belongs to is an avenue, lined with street trees: authored as one, or drawn by the seed. */
export function avenue(scenery: Scenery, lane: Lane): boolean {
  if (!('road' in lane.owner)) return false
  if (scenery.avenues.includes(lane.owner.road)) return true
  return !!scenery.seeded && seededAvenue(scenery.seed, lane.line.pts, scenery.seeded.avenue)
}

/** Where a Block's lamps stand: near each corner of its bounding box that lies on it. */
export function lampSpots(block: Block, field: Field): Vec[] {
  const spots: Vec[] = []
  for (const x of [block.x0 + 2, block.x1 - 2]) {
    for (const y of [block.y0 + 2, block.y1 - 2]) if (field.sample(x, y) >= 0.5 && inside(block.loop, x, y)) spots.push({ x, y })
  }
  return spots
}

/** A number in [0, 1) the seed draws for the Tile on `cell`: the same for each of its Blocks, whenever they are built. */
function tileDraw(seed: number, cell: Cell): number {
  return mulberry32(Math.imul(seed ^ 0x27d4eb2f ^ Math.imul(cell.x, 0x85ebca6b), 0x9e3779b1) ^ Math.imul(cell.y, 0xc2b2ae35))()
}

/** The seed of one Block's fill: the scenery's, mixed with where the Block lies, so that no other Block changes it. */
export function blockSeed(scenery: Scenery, { x0, y0, x1, y1 }: Bounds): number {
  let seed = scenery.seed
  for (const v of [x0, y0, x1, y1]) seed = Math.imul(seed ^ Math.round(v * 100), 0x9e3779b1)
  return seed >>> 0
}

/**
 * What stands on one Block, added to `kit` brick by brick: a roundabout's island, a landmark or special Block from
 * the scenery, a bike lane on a narrow Block, and otherwise what its Tile's Zone builds (`./zones`), or grass on an
 * unzoned Tile, with lamps at its corners and trees along the avenues. It reads only the Block, its surroundings and
 * the scenery, so a Block that a Rebuild leaves alone comes out the same. Where the Block lies seeds its random
 * choices and nothing more: a Zone builds alike anywhere in the City. A District with no scenery leaves its Blocks bare.
 */
export function fillBlock(kit: Kit, block: Block, { net, spec, scenery, field, zone }: Surroundings) {
  const at = (p: [number, number]) => inside(block.loop, ...p)
  const roundabout = net.junctions.find((j) => j.type === 'roundabout' && inside(block.loop, j.at.x, j.at.y))
  if (roundabout) return island(kit, field, block, roundabout.at)

  for (const { x, y } of lampSpots(block, field)) kit.lamp(x, y, KERB)
  for (const landmark of scenery.landmarks) if (at(landmark.at)) tower(kit, field, block, ...landmark.at)
  const authored = scenery.blocks.find((s) => at(s.at))
  if (authored) {
    if (authored.type === 'park') park(kit, field, block, { x: authored.at[0], y: authored.at[1] })
    else plaza(kit, field, block)
    return
  }
  if (Math.min(block.x1 - block.x0, block.y1 - block.y0) < NARROW) return bikeLane(kit, field, block)

  // Every landmark's ground, on the slab yet or not, so that no Rebuild changes which lots are left.
  const reserved = scenery.landmarks.map((l) => towerGround(...l.at))
  const look = zone && LOOKS[zone.id]
  // The seed stands a coral tower here and there, on a Tile whose Zone takes one. A seeded landmark stands wholly on
  // its own Block and reserves ground only there, so no other Block changes with it.
  if (scenery.seeded && look?.landmarks) {
    const point = seededLandmark(scenery.seed, block, scenery.seeded.landmarks)
    const ground = point && site(field, block, 22, 22, point)
    if (ground) {
      tower(kit, field, block, ground.x, ground.y)
      reserved.push(towerGround(ground.x, ground.y))
    }
  }
  // Street trees along the avenues, whatever the Zone: on the pavement, just in from the kerb. They are planted last,
  // and what is built keeps clear of them.
  const street: Vec[] = []
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.index !== 0 || !avenue(scenery, lane)) continue
    const side = (spec.roads[lane.owner.road].laneWidth ?? spec.roadDefaults.laneWidth) / 2 + STREET_TREES.inset
    for (let s = STREET_TREES.spacing / 2; s < lane.length; s += STREET_TREES.spacing) {
      const p = pointAt(lane.line, s)
      const [x, y] = [p.x + Math.sin(p.heading) * side, p.y - Math.cos(p.heading) * side] // lane 0 is the rightmost
      if (inside(block.loop, x, y) && field.sample(x, y) >= 1) street.push({ x, y })
    }
  }

  if (look) look.fill({ kit, block, field, reserved, street, tileDraw: tileDraw(scenery.seed, cellAt(middle(block))) })
  else verge(kit, field, block, street)
  for (const t of street) kit.tree(t.x, t.y, KERB, STREET_TREES.size, 'round')
}
