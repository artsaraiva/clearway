import type { District } from '../sim/district'
import { middle, overlaps, pointAt, type Bounds } from '../sim/geometry'
import type { Network } from '../sim/network'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { BuildingKind, Kit } from './kit'
import { island, park, plaza, tower, towerGround } from './landmarks'

const MARGIN = 3.2 // m of open pavement between a Block's bounding box and its lots
const GAP = 1 // m of each lot left open on every side of its building
const MIN_FOOTPRINT = 4 // m: a lot narrower than this stays empty
const CLEAR = 1.5 // m a building keeps from the Block's edge; a lot that cannot is dropped
// As fractions of the distance from the District's centre to its far edge: where lots are large, and where the
// towers and then the mid-rises give way.
const [LARGE_LOTS, TOWERS, MID_RISES] = [0.55, 0.42, 0.73]
const LOT = { large: 20, small: 15.2 } // m: a lot is split until it is no longer than this
const STREET_TREES = { spacing: 13.6, inset: 3.4 } // m along an avenue, and in from the kerb

/** What a Block's fill reads besides the Block itself. */
export interface Surroundings {
  net: Network
  district: District
  field: Field
  /** Every Level's piece of slab together: the District's centre and far edge are measured on it. */
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

/** The seed of one Block's fill: the District's, mixed with where the Block lies, so that no other Block changes it. */
export function blockSeed(district: District, { x0, y0, x1, y1 }: Bounds): number {
  let seed = district.scenery?.seed ?? 0
  for (const v of [x0, y0, x1, y1]) seed = Math.imul(seed ^ Math.round(v * 100), 0x9e3779b1)
  return seed >>> 0
}

/**
 * What stands on one Block, added to `kit` brick by brick: a landmark or special Block from the District file, or lots
 * split from the kit's seed, with lamps at its corners and trees along the avenues. It reads only the Block, its
 * surroundings and the District file, so a Block that a Reveal leaves alone comes out the same. A District with no
 * scenery leaves its Blocks bare.
 */
export function fillBlock(kit: Kit, block: Block, { net, district, field, extent }: Surroundings) {
  const { scenery } = district
  if (!scenery) return
  const at = (p: [number, number]) => inside(block.loop, ...p)
  const roundabout = net.junctions.find((j) => j.type === 'roundabout' && inside(block.loop, j.at.x, j.at.y))
  if (roundabout) return island(kit, field, block, roundabout.at)

  for (const x of [block.x0 + 2, block.x1 - 2]) {
    for (const y of [block.y0 + 2, block.y1 - 2]) if (field.sample(x, y) >= 0.5 && inside(block.loop, x, y)) kit.lamp(x, y, KERB)
  }
  for (const landmark of scenery.landmarks) if (at(landmark.at)) tower(kit, field, ...landmark.at)
  const authored = scenery.blocks.find((s) => at(s.at))
  if (authored) {
    if (authored.type === 'park') park(kit, field, block, ...authored.at)
    else plaza(kit, field, block)
    return
  }

  const centre = middle(extent)
  const reach = Math.max(extent.x1 - extent.x0, extent.y1 - extent.y0) / 2
  /** How far out a point is: 0 at the District's centre, 1 at its far edge. */
  const out = (x: number, y: number) => Math.hypot(x - centre.x, y - centre.y) / reach
  // Every landmark's ground, Revealed or not, so that no Reveal changes which lots are left.
  const reserved = scenery.landmarks.map((l) => towerGround(...l.at))
  const lots: Bounds[] = []
  const mid = middle(block)
  const large = out(mid.x, mid.y) < LARGE_LOTS
  split(
    { x0: block.x0 + MARGIN, y0: block.y0 + MARGIN, x1: block.x1 - MARGIN, y1: block.y1 - MARGIN },
    large ? LOT.large : LOT.small,
    kit.range,
    lots,
  )
  for (const lot of lots) {
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
    // Towers are tallest at the centre.
    const floors = kind === 'tower' ? Math.max(6, Math.round(14 - (7 * far) / TOWERS + kit.range(-2, 2))) : Math.round(kit.range(3, 6))
    kit.building(x, y, KERB, w, d, kind, floors)
    // A house on a long lot gets a garden tree at one end.
    if (kind === 'house' && Math.max(w, d) > 13.6) kit.tree(x + (w > d ? w / 2 - 2 : 0), y + (w > d ? 0 : d / 2 - 2), KERB, 0.6, 'round')
  }

  // Street trees along the avenues: on the pavement, just in from the kerb.
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.index !== 0 || !scenery.avenues.includes(lane.owner.road)) continue
    const side = (district.roads[lane.owner.road].laneWidth ?? district.roadDefaults.laneWidth) / 2 + STREET_TREES.inset
    for (let s = STREET_TREES.spacing / 2; s < lane.length; s += STREET_TREES.spacing) {
      const p = pointAt(lane.line, s)
      const [x, y] = [p.x + Math.sin(p.heading) * side, p.y - Math.cos(p.heading) * side] // lane 0 is the rightmost
      if (inside(block.loop, x, y) && field.sample(x, y) >= 1) kit.tree(x, y, KERB, 0.5, 'round')
    }
  }
}
