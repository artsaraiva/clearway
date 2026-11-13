import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import type { District, SpecialBlock } from '../sim/district'
import { pointAt } from '../sim/geometry'
import type { Network } from '../sim/network'
import { KERB } from './blocks'
import { inside, type Field } from './field'
import { createKit, type BuildingKind } from './kit'
import { island, park, plaza, tower, towerGround, type Block } from './landmarks'
import type { Bounds } from './slab'

const MARGIN = 3.2 // m of open pavement between a Block's bounding box and its lots
const GAP = 1 // m of each lot left open on every side of its building
const MIN_FOOTPRINT = 4 // m: a lot narrower than this stays empty
const CLEAR = 1.5 // m a building keeps from the Block's edge; a lot that cannot is dropped
// As fractions of the distance from the District's centre to its far edge: where lots are large, and where the
// towers and then the mid-rises give way.
const [LARGE_LOTS, TOWERS, MID_RISES] = [0.55, 0.42, 0.73]
const LOT = { large: 20, small: 15.2 } // m: a lot is split until it is no longer than this
const STREET_TREES = { spacing: 13.6, inset: 3.4 } // m along an avenue, and in from the kerb

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
 * What stands on the Blocks, as one mesh per material: the District file's landmarks and special Blocks, then every
 * other Block split into lots from the fill seed, with lamps at Block corners and trees along the avenues. A District
 * with no scenery gets nothing.
 */
export function createBlockFill(net: Network, district: District, field: Field, plate: Bounds) {
  const group = new THREE.Group()
  const { scenery } = district
  if (!scenery) return { group, setNight() {} }
  const kit = createKit(mulberry32(scenery.seed))

  const blocks: Block[] = field.outlines(0).map((loop) => {
    const [xs, ys] = [loop.map((p) => p.x), loop.map((p) => p.y)]
    return { loop, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  })
  const blockAt = (x: number, y: number) => blocks.find((b) => inside(b.loop, x, y))

  // Scenery whose point is on no Block is skipped: it is still in the Fog, or it was authored on a Road.
  const islands = new Map(net.junctions.filter((j) => j.type === 'roundabout').map((j) => [blockAt(j.at.x, j.at.y), j.at]))
  const special = new Map<Block | undefined, SpecialBlock>(scenery.blocks.map((s) => [blockAt(...s.at), s]))
  const towers = scenery.landmarks.filter((l) => blockAt(...l.at))
  for (const { at } of towers) tower(kit, field, ...at)
  const reserved = towers.map((l) => towerGround(...l.at))

  const [cx, cy] = [(plate.x0 + plate.x1) / 2, (plate.y0 + plate.y1) / 2]
  const reach = Math.max(plate.x1 - plate.x0, plate.y1 - plate.y0) / 2
  /** How far out a point is: 0 at the District's centre, 1 at its far edge. */
  const out = (x: number, y: number) => Math.hypot(x - cx, y - cy) / reach

  for (const block of blocks) {
    const centre = islands.get(block)
    if (centre) {
      island(kit, field, block, centre)
      continue
    }
    for (const x of [block.x0 + 2, block.x1 - 2]) {
      for (const y of [block.y0 + 2, block.y1 - 2]) if (field.sample(x, y) >= 0.5 && inside(block.loop, x, y)) kit.lamp(x, y, KERB)
    }
    const authored = special.get(block)
    if (authored) {
      if (authored.type === 'park') park(kit, field, block, ...authored.at)
      else plaza(kit, field, block)
      continue
    }

    const lots: Bounds[] = []
    const large = out((block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2) < LARGE_LOTS
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
      if (reserved.some((r) => lot.x0 < r.x1 && lot.x1 > r.x0 && lot.y0 < r.y1 && lot.y1 > r.y0)) continue
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
  }

  // Street trees along the avenues: on the pavement of ordinary Blocks, just in from the kerb.
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.index !== 0 || !scenery.avenues.includes(lane.owner.road)) continue
    const side = (district.roads[lane.owner.road].laneWidth ?? district.roadDefaults.laneWidth) / 2 + STREET_TREES.inset
    for (let s = STREET_TREES.spacing / 2; s < lane.length; s += STREET_TREES.spacing) {
      const p = pointAt(lane.line, s)
      const [x, y] = [p.x + Math.sin(p.heading) * side, p.y - Math.cos(p.heading) * side] // lane 0 is the rightmost
      const block = blockAt(x, y)
      if (block && !islands.has(block) && !special.has(block) && field.sample(x, y) >= 1) kit.tree(x, y, KERB, 0.5, 'round')
    }
  }

  group.add(...kit.meshes())
  return { group, setNight: kit.setNight }
}
