import type { Zone } from '../city/city'
import { overlaps, type Bounds, type Vec } from '../sim/geometry'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { Kit, OfficeStyle } from './kit'

// What each Zone builds on a Block (#130, ported from the neighbourhoods prototype of #127): its building shapes, its
// palette (the kit's, under the rule above `WALLS`), its lot size and the gaps between its buildings. A look reads
// the Block, the ground it must leave free and the kit's random stream, and nothing of where the Block lies in the
// City, so a Zone builds alike at the City's middle and at its edge.

/** m a building keeps clear of a street tree, beyond its trunk. */
const TREE_ROOM = 2.4

// Low-density residential: lots at most 15.2 m on a side, 2.8 m in from the Block's bounding box. A lawn fills each
// lot but for 0.4 m on every side, at least 7 m across and 0.6 m in from the Block's edge, and a house of at most
// 10.5 m stands on it 1.2 m in from the lawn's edge.
const HOUSES = { lot: 15.2, margin: 2.8, gap: 0.4, least: 7, clear: 0.6, yard: 1.2, most: 10.5 }
// Offices: lots at most 30 m on a side, 3.4 m in from the Block's bounding box, each with one tower of at most 20 m on
// a side and at least 8, leaving 3.6 m of the lot open on every side, 1.5 m in from the Block's edge.
const OFFICES = { lot: 30, margin: 3.4, gap: 3.6, least: 8, most: 20, clear: 1.5 }
// Most towers stand 7 to 11 storeys, and one in five stands 16 to 21 above them.
const SKYLINE = { tall: 0.2, low: [7, 11], high: [16, 21] } as const
const STYLES: OfficeStyle[] = ['curtain', 'curtain', 'fins', 'fins', 'stepped', 'round']

/** What a Zone's look builds on: one Block, and the ground on it that must stay free. */
export interface ZoneGround {
  kit: Kit
  block: Block
  field: Field
  /** Landmarks' ground, which no building may stand on. */
  reserved: Bounds[]
  /** The Block's street trees, which buildings keep clear of. */
  street: Vec[]
}

/** How a Zone builds on its Blocks. */
export interface Look {
  /** Whether the seed may stand its coral tower landmark on a Tile of this Zone. */
  landmarks: boolean
  fill(ground: ZoneGround): void
}

/** Each Zone's look. An unzoned Tile has none: its Blocks are left as grass (`verge`). */
export const LOOKS: Record<Zone['id'], Look> = {
  'low-density': { landmarks: false, fill: houses },
  offices: { landmarks: true, fill: offices },
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

/** A lot with its edge nearest each street tree moved back behind the tree's crown. */
function backFromTrees(cut: Bounds, street: Vec[]): Bounds {
  const lot = { ...cut }
  for (const t of street) {
    if (t.x < lot.x0 - TREE_ROOM || t.x > lot.x1 + TREE_ROOM || t.y < lot.y0 - TREE_ROOM || t.y > lot.y1 + TREE_ROOM) continue
    const inward = [t.x - lot.x0, lot.x1 - t.x, t.y - lot.y0, lot.y1 - t.y]
    const edge = inward.indexOf(Math.min(...inward))
    if (edge === 0) lot.x0 = Math.max(lot.x0, t.x + TREE_ROOM)
    else if (edge === 1) lot.x1 = Math.min(lot.x1, t.x - TREE_ROOM)
    else if (edge === 2) lot.y0 = Math.max(lot.y0, t.y + TREE_ROOM)
    else lot.y1 = Math.min(lot.y1, t.y - TREE_ROOM)
  }
  return lot
}

/** The Block's lots: its bounding box `margin` m in, split into lots no longer than `max`, each back from the street trees. */
function lotsOf({ kit, block, street }: ZoneGround, margin: number, max: number): Bounds[] {
  const lots: Bounds[] = []
  split({ x0: block.x0 + margin, y0: block.y0 + margin, x1: block.x1 - margin, y1: block.y1 - margin }, max, kit.range, lots)
  return lots.map((lot) => backFromTrees(lot, street))
}

/**
 * Whether a footprint `w` (east–west) by `d` centred on `(x, y)` stands on the Block at least `clear` m in from its
 * edge, off any landmark's ground and clear of the street trees. Its outline is sampled about every 3 m, closer than a
 * Road is wide, so no Road crosses it unseen.
 */
function stands({ block, field, reserved, street }: ZoneGround, x: number, y: number, w: number, d: number, clear: number): boolean {
  const [nu, nv] = [Math.max(1, Math.ceil(w / 3)), Math.max(1, Math.ceil(d / 3))]
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const edge = i === 0 || i === nu || j === 0 || j === nv
      if (edge && field.sample(x - w / 2 + (i * w) / nu, y - d / 2 + (j * d) / nv) < clear) return false
    }
  }
  if (!inside(block.loop, x, y)) return false
  const box = { x0: x - w / 2, y0: y - d / 2, x1: x + w / 2, y1: y + d / 2 }
  if (reserved.some((r) => overlaps(box, r))) return false
  return !street.some((t) => t.x > box.x0 - TREE_ROOM && t.x < box.x1 + TREE_ROOM && t.y > box.y0 - TREE_ROOM && t.y < box.y1 + TREE_ROOM)
}

/**
 * The largest footprint up to `w` by `d` that stands, shrinking by `step` m at most `tries` times; null if even that
 * is under `least` across or does not stand.
 */
function fit(g: ZoneGround, x: number, y: number, w: number, d: number, clear: number, least: number, step: number, tries: number) {
  for (let k = 0; k < tries && Math.min(w, d) >= least && !stands(g, x, y, w, d, clear); k++) [w, d] = [w - step, d - step]
  return Math.min(w, d) >= least && stands(g, x, y, w, d, clear) ? { w, d } : null
}

/** Low-density residential: a house on a lawn on each lot, most with a garden tree, and the odd lot left to a tree. */
function houses(g: ZoneGround) {
  const { kit } = g
  const ground = KERB + 0.16 // on the lawn
  for (const lot of lotsOf(g, HOUSES.margin, HOUSES.lot)) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const lawn = fit(g, x, y, lot.x1 - lot.x0 - 2 * HOUSES.gap, lot.y1 - lot.y0 - 2 * HOUSES.gap, HOUSES.clear, HOUSES.least, 1.6, 3)
    if (!lawn) continue
    const { w, d } = lawn
    kit.lawn(x, y, KERB, w, d)
    if (kit.chance(0.1)) {
      kit.tree(x, y, ground, kit.range(0.7, 0.95), 'round')
      continue
    }
    kit.house(x, y, ground, Math.min(w - 2 * HOUSES.yard, HOUSES.most), Math.min(d - 2 * HOUSES.yard, HOUSES.most))
    if (kit.chance(0.6)) {
      const [sx, sy] = [kit.chance(0.5) ? 1 : -1, kit.chance(0.5) ? 1 : -1]
      kit.tree(x + sx * (w / 2 - 1.4), y + sy * (d / 2 - 1.4), ground, kit.range(0.45, 0.65), kit.chance(0.2) ? 'sakura' : 'round')
    }
  }
}

/** Offices: a glass tower on each large lot with room around it, most of them low, and the odd lot left to a tree. */
function offices(g: ZoneGround) {
  const { kit } = g
  for (const lot of lotsOf(g, OFFICES.margin, OFFICES.lot)) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [lot.x1 - lot.x0 - 2 * OFFICES.gap, lot.y1 - lot.y0 - 2 * OFFICES.gap].map((side) => Math.min(OFFICES.most, side))
    const footprint = fit(g, x, y, w, d, OFFICES.clear, OFFICES.least, 3, 2)
    if (!footprint) continue
    if (kit.chance(0.06)) {
      kit.tree(x, y, KERB, kit.range(0.7, 1), 'round')
      continue
    }
    const floors = Math.round(kit.chance(SKYLINE.tall) ? kit.range(...SKYLINE.high) : kit.range(...SKYLINE.low))
    kit.officeTower(x, y, KERB, footprint.w, footprint.d, floors, kit.pick(STYLES))
  }
}
