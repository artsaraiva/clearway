import { mulberry32 } from '../sim/demand'
import { middle, overlaps, pointAt, type Bounds, type Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { CELL, cellAt } from '../sim/tiles'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { BuildingKind, Kit } from './kit'
import { bikeLane, island, park, plaza, site, tower, towerGround } from './landmarks'
import type { Scenery } from './scenery'

const MARGIN = 3.2 // m of open pavement between a Block's bounding box and its lots
const GAP = 1 // m of each lot left open on every side of its building
const MIN_FOOTPRINT = 4 // m: a lot narrower than this stays empty
const NARROW = 12 // m: a Block narrower than this has no room for lots and carries a bike lane
const CLEAR = 1.5 // m a building keeps from the Block's edge; a lot that cannot is dropped
// As fractions of the distance from the ground's centre to its far edge: where lots are large, and where the
// towers and then the mid-rises give way.
const [LARGE_LOTS, TOWERS, MID_RISES] = [0.55, 0.42, 0.73]
const LOT = { large: 20, small: 15.2 } // m: a lot is split until it is no longer than this
// m along an avenue, in from the kerb, and kept clear of buildings beyond the trunk; and the trees' size.
const STREET_TREES = { spacing: 13.6, inset: 3.4, room: 2.4, size: 0.55 }
// The chance a tower stands tall: where the towers give way, and how much more at the ground's centre.
const SKYLINE = { tall: 0.08, core: 0.17 }
const CORNER = 0.32 // of a cell, east or west and north or south of its centre: the middle of one of its corners

/** What a Block's fill reads besides the Block itself. */
export interface Surroundings {
  net: Network
  /** What `net` was built from. */
  spec: NetworkSpec
  scenery: Scenery
  field: Field
  /** The ground the fill is graded over, towers at its centre and houses toward its edge: `out` is measured on it. */
  extent: Bounds
}

/** Split a rectangle into lots no longer than `max` on either side, cutting the long side near its middle. */
function split(lot: Bounds, max: number, range: (a: number, b: number) => number, out: Bounds[]) {
  const [w, d] = [lot.x1 - lot.x0, lot.y1 - lot.y0]
  if (w <= max && d <= max) out.push(lot)
  else if (w >= d) {
    const x = lot.x0 + w * range(0.38, 0.62)
    split({ ...lot, x1: x }, max, range, out)
    split({ ...lot, x0: x }, max, range, out)
  } else {
    const y = lot.y0 + d * range(0.38, 0.62)
    split({ ...lot, y1: y }, max, range, out)
    split({ ...lot, y0: y }, max, range, out)
  }
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

/** The seed of one Block's fill: the scenery's, mixed with where the Block lies, so that no other Block changes it. */
export function blockSeed(scenery: Scenery, { x0, y0, x1, y1 }: Bounds): number {
  let seed = scenery.seed
  for (const v of [x0, y0, x1, y1]) seed = Math.imul(seed ^ Math.round(v * 100), 0x9e3779b1)
  return seed >>> 0
}

/**
 * What stands on one Block, added to `kit` brick by brick: a landmark or special Block from the scenery or its seed,
 * or lots split from the kit's seed, with lamps at its corners and trees along the avenues. It reads only the Block,
 * its surroundings and the scenery, so a Block that a Rebuild leaves alone comes out the same. A District with no
 * scenery leaves its Blocks bare.
 */
export function fillBlock(kit: Kit, block: Block, { net, spec, scenery, field, extent }: Surroundings) {
  const at = (p: [number, number]) => inside(block.loop, ...p)
  const roundabout = net.junctions.find((j) => j.type === 'roundabout' && inside(block.loop, j.at.x, j.at.y))
  if (roundabout) return island(kit, field, block, roundabout.at)

  for (const x of [block.x0 + 2, block.x1 - 2]) {
    for (const y of [block.y0 + 2, block.y1 - 2]) if (field.sample(x, y) >= 0.5 && inside(block.loop, x, y)) kit.lamp(x, y, KERB)
  }
  for (const landmark of scenery.landmarks) if (at(landmark.at)) tower(kit, field, block, ...landmark.at)
  const authored = scenery.blocks.find((s) => at(s.at))
  if (authored) {
    if (authored.type === 'park') park(kit, field, block, { x: authored.at[0], y: authored.at[1] })
    else plaza(kit, field, block)
    return
  }
  if (Math.min(block.x1 - block.x0, block.y1 - block.y0) < NARROW) return bikeLane(kit, field, block)

  const centre = middle(extent)
  const reach = Math.max(extent.x1 - extent.x0, extent.y1 - extent.y0) / 2
  /** How far out a point is: 0 at the ground's centre, 1 at its far edge. */
  const out = (x: number, y: number) => Math.hypot(x - centre.x, y - centre.y) / reach
  // Every landmark's ground, on the slab yet or not, so that no Rebuild changes which lots are left.
  const reserved = scenery.landmarks.map((l) => towerGround(...l.at))
  const lots: Bounds[] = []
  const mid = middle(block)

  // The seed stands a landmark here and there, or turns the odd Block into a park or a plaza. A seeded landmark stands
  // wholly on its own Block and reserves ground only there, so no other Block changes with it.
  if (scenery.seeded) {
    const { park: parks, plaza: plazas, landmarks } = scenery.seeded
    const at = seededLandmark(scenery.seed, block, landmarks)
    const ground = at && site(field, block, 22, 22, at)
    if (ground) {
      tower(kit, field, block, ground.x, ground.y)
      reserved.push(towerGround(ground.x, ground.y))
    } else {
      const roll = kit.range(0, 1)
      if (roll < parks) return park(kit, field, block)
      if (roll < parks + plazas) return plaza(kit, field, block, site(field, block, 12, 12) ?? undefined)
    }
  }
  // Street trees along the avenues: on the pavement, just in from the kerb. They are planted last, and the lots stand
  // back from them.
  const street: Vec[] = []
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.index !== 0) continue
    if (!scenery.avenues.includes(lane.owner.road) && !(scenery.seeded && seededAvenue(scenery.seed, lane.line.pts, scenery.seeded.avenue)))
      continue
    const side = (spec.roads[lane.owner.road].laneWidth ?? spec.roadDefaults.laneWidth) / 2 + STREET_TREES.inset
    for (let s = STREET_TREES.spacing / 2; s < lane.length; s += STREET_TREES.spacing) {
      const p = pointAt(lane.line, s)
      const [x, y] = [p.x + Math.sin(p.heading) * side, p.y - Math.cos(p.heading) * side] // lane 0 is the rightmost
      if (inside(block.loop, x, y) && field.sample(x, y) >= 1) street.push({ x, y })
    }
  }

  const large = out(mid.x, mid.y) < LARGE_LOTS
  split(
    { x0: block.x0 + MARGIN, y0: block.y0 + MARGIN, x1: block.x1 - MARGIN, y1: block.y1 - MARGIN },
    large ? LOT.large : LOT.small,
    kit.range,
    lots,
  )
  for (const cut of lots) {
    const lot = { ...cut }
    // A lot moves its edge nearest a street tree back behind the tree's crown.
    for (const t of street) {
      if (t.x < lot.x0 - STREET_TREES.room || t.x > lot.x1 + STREET_TREES.room) continue
      if (t.y < lot.y0 - STREET_TREES.room || t.y > lot.y1 + STREET_TREES.room) continue
      const inward = [t.x - lot.x0, lot.x1 - t.x, t.y - lot.y0, lot.y1 - t.y]
      const edge = inward.indexOf(Math.min(...inward))
      if (edge === 0) lot.x0 = Math.max(lot.x0, t.x + STREET_TREES.room)
      else if (edge === 1) lot.x1 = Math.min(lot.x1, t.x - STREET_TREES.room)
      else if (edge === 2) lot.y0 = Math.max(lot.y0, t.y + STREET_TREES.room)
      else lot.y1 = Math.min(lot.y1, t.y - STREET_TREES.room)
    }
    const [x, y, w, d] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2, lot.x1 - lot.x0 - 2 * GAP, lot.y1 - lot.y0 - 2 * GAP]
    if (w < MIN_FOOTPRINT || d < MIN_FOOTPRINT) continue
    // Dropped: a lot that would overhang the Block's edge (a rounded corner, or a bounding box wider than the
    // Block), or that stands on a landmark's ground.
    const corners = [-1, 1].flatMap((i) => [-1, 1].map((j) => field.sample(x + (i * w) / 2, y + (j * d) / 2)))
    if (Math.min(...corners) < CLEAR || !inside(block.loop, x, y)) continue
    if (reserved.some((r) => overlaps(lot, r))) continue
    // The odd lot is left as a tree.
    if (kit.chance(0.08)) {
      kit.tree(x, y, KERB, kit.range(0.6, 0.9), 'round')
      continue
    }
    const far = out(x, y)
    const kind: BuildingKind =
      far < TOWERS
        ? kit.chance(0.7)
          ? 'tower'
          : 'mid-rise'
        : far < MID_RISES
          ? kit.chance(0.75)
            ? 'mid-rise'
            : 'house'
          : kit.chance(0.7)
            ? 'house'
            : 'mid-rise'
    // A skyline: most towers are low, and the odd one stands well above them, more often toward the centre.
    const core = Math.max(0, 1 - far / TOWERS)
    const floors =
      kind !== 'tower'
        ? Math.round(kit.range(3, 6))
        : kit.chance(SKYLINE.tall + SKYLINE.core * core)
          ? Math.round(kit.range(15, 19) + 3 * core)
          : Math.round(kit.range(5, 9) + 3 * core)
    kit.building(x, y, KERB, w, d, kind, floors)
    // A house on a long lot gets a garden tree at one end.
    if (kind === 'house' && Math.max(w, d) > 13.6) kit.tree(x + (w > d ? w / 2 - 2 : 0), y + (w > d ? 0 : d / 2 - 2), KERB, 0.6, 'round')
  }
  for (const t of street) kit.tree(t.x, t.y, KERB, STREET_TREES.size, 'round')
}
