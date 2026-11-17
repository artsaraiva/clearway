import type { Zone } from '../city/city'
import { middle, overlaps, type Bounds, type Vec } from '../sim/geometry'
import { cellAt, cellBounds } from '../sim/tiles'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { Kit, OfficeStyle } from './kit'
import { allotments, farm, GROW, meadow, park, plaza, site } from './landmarks'

// What each Zone builds on a Block (#130 and #136, ported from the neighbourhoods prototype of #127): its building
// shapes, its palette (the kit's, under the rule above `WALLS`), its lot size and the gaps between its buildings. A look
// reads the Block, the ground it must leave free, the kit's random stream and one draw for its Tile, and nothing of
// where the Block lies in the City, so a Zone builds alike at the City's middle and at its edge.
//
// Every Zone builds at its Tile's Stage (#138, #141), through the kit's `staged` and `from`: every lot draws alike at
// every Stage, and each Stage builds the same lot, better. Every lot takes the same draws from the Block's stream
// whatever its Stage, so no lot changes with what another lot's Stage builds. Stage 2 is the look #130 and #136 ported;
// Stage 1 is humbler and Stage 3 goes beyond it, and no Stage builds another kind of building.

/** m a building keeps clear of a street tree, beyond its trunk. */
const TREE_ROOM = 2.4

// Low-density residential: lots at most 15.2 m on a side, 2.8 m in from the Block's bounding box. A lawn fills each
// lot but for 0.4 m on every side, at least 7 m across and 0.6 m in from the Block's edge, and a house of at most
// 10.5 m stands on it 1.2 m in from the lawn's edge.
const HOUSES = { lot: 15.2, margin: 2.8, gap: 0.4, least: 7, clear: 0.6, yard: 1.2, most: 10.5 }
// Medium-density residential is terraces on half its Tiles and courtyards on the other half, the same on every Block
// of a Tile. Terraces: rows of houses 4.4 to 6.8 m wide and 8 to 10 m deep along every edge, their fronts 2.2 m in from
// it, and up to four trees in the yards behind.
const TERRACES = { margin: 2.2, deep: [8, 10], wide: [4.4, 6.8], trees: 4 } as const
// Courtyards: lots at most 42 m on a side, 3.2 m in from the Block's bounding box, built over all but 1.6 m of the lot
// on every side and 1.5 m in from the Block's edge, at least 9 m across, in wings 7.5 to 9 m deep and 4 to 7 storeys
// tall. A lot with room for a court 5 m across between its wings takes an O or a U, one with room for an L takes an L,
// and a narrower one a bar.
const COURTYARDS = { lot: 42, margin: 3.2, gap: 1.6, clear: 1.5, least: 9, wing: [7.5, 9], floors: [4, 7.4], court: 5 } as const
// High-density residential: lots at most 30 m on a side, 3.4 m in from the Block's bounding box, each with one tower
// of at most 17 m east–west by 15 north–south and at least 9, 11 to 17 storeys tall, leaving 4.5 m of the lot open on
// every side. Its podium is 1.2 m wider all round and stands 1.5 m in from the Block's edge.
const TOWERS = { lot: 30, margin: 3.4, gap: 4.5, most: [17, 15], least: 9, podium: 1.2, clear: 1.5, floors: [11, 17] } as const
// Offices: lots at most 30 m on a side, 3.4 m in from the Block's bounding box, each with one tower of at most 20 m on
// a side and at least 8, leaving 3.6 m of the lot open on every side, 1.5 m in from the Block's edge.
const OFFICES = { lot: 30, margin: 3.4, gap: 3.6, least: 8, most: 20, clear: 1.5 }
// One tower in five stands tall above the rest. The storeys a tower stands at each Stage, most towers and the tall ones:
// Stage 2's are #130's.
const SKYLINE = { tall: 0.2 } as const
const FLOORS = [
  { low: [3, 5], high: [5, 7] },
  { low: [6, 9], high: [11, 14] },
  { low: [9, 13], high: [17, 22] },
] as const
// How big a lot left to a tree grows at each Stage, as a share of a full tree.
const SAPLING = [0.5, 0.75, 1]
// The storeys a terraced house, a shop, a courtyard building and a residential tower stand at each Stage, from the
// storeys it draws, which are its Stage 2 storeys.
const TERRACE_STOREYS = (s: number, stage: number) => [Math.max(1, s - 1), s, s + 1][stage - 1]
const SHOP_STOREYS = (s: number, stage: number) => [1, s, s + 1][stage - 1]
const COURT_FLOORS = (f: number, stage: number) => [Math.max(3, f - 2), f, f + 2][stage - 1]
const TOWER_FLOORS = (f: number, stage: number) => Math.round(f * [0.55, 1, 1.25][stage - 1])
const STYLES: OfficeStyle[] = ['curtain', 'curtain', 'fins', 'fins', 'stepped', 'round']
const PLANTER = '#ddd6c9' // a Stage 3 plaza's, round a tree
// Shops: rows of shops 6.5 to 10.5 m wide and 10 to 12 m deep along every edge, their fronts 2.4 m in from it, and up
// to three trees in the yards behind.
const SHOPS = { margin: 2.4, deep: [10, 12], wide: [6.5, 10.5], trees: 3 } as const
// Industrial: lots at most 34 m on a side, 3.2 m in from the Block's bounding box, the largest built first, each with
// a shed over all but 2.5 m of the lot on every side, 1.5 m in from the Block's edge and at least 9 m across. On some
// Blocks the first shed has a chimney.
const SHEDS = { lot: 34, margin: 3.2, gap: 2.5, clear: 1.5, least: 9, chimney: 0.45 }
// Parks: a park with a pond, or on a Block under 1,600 m² by its bounding box, one time in three, a plaza with a fountain.
const PARKS = { small: 1600, plaza: 0.35 }
// Green: a meadow, or one Block in three allotments.
const GREEN = { allotments: 0.35 }

/** What a Zone's look builds on: one Block, and the ground on it that must stay free. */
export interface ZoneGround {
  kit: Kit
  block: Block
  field: Field
  /** Landmarks' ground, which no building may stand on. */
  reserved: Bounds[]
  /** The Block's street trees, which buildings keep clear of. */
  street: Vec[]
  /** A number in [0, 1) the seed draws for the Block's Tile, the same for each of its Blocks: for what a look picks once a Tile. */
  tileDraw: number
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
  'medium-density': { landmarks: false, fill: (g) => (g.tileDraw < 0.5 ? terraces(g) : courtyards(g)) },
  'high-density': { landmarks: true, fill: towers },
  offices: { landmarks: true, fill: offices },
  shops: { landmarks: false, fill: shops },
  industrial: { landmarks: false, fill: industrial },
  parks: { landmarks: false, fill: parks },
  green: {
    landmarks: false,
    fill: ({ kit, field, block, street }) => (kit.chance(GREEN.allotments) ? allotments : meadow)(kit, field, block, street),
  },
  farms: { landmarks: false, fill: ({ kit, field, block, street }) => farm(kit, field, block, street) },
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
 * Whether a footprint `w` by `d` centred on `(x, y)` and turned `ry` (unturned, `w` runs east–west) stands on the Block
 * at least `clear` m in from its edge, off any landmark's ground and clear of the street trees. Its outline is sampled
 * about every 3 m, closer than a Road is wide, so no Road crosses it unseen.
 */
function stands(
  { block, field, reserved, street }: ZoneGround,
  x: number,
  y: number,
  w: number,
  d: number,
  clear: number,
  ry = 0,
): boolean {
  const [c, s] = [Math.cos(ry), Math.sin(ry)]
  const [nu, nv] = [Math.max(1, Math.ceil(w / 3)), Math.max(1, Math.ceil(d / 3))]
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      if (i !== 0 && i !== nu && j !== 0 && j !== nv) continue
      const [u, v] = [-w / 2 + (i * w) / nu, -d / 2 + (j * d) / nv]
      if (field.sample(x + u * c - v * s, y + u * s + v * c) < clear) return false
    }
  }
  if (!inside(block.loop, x, y)) return false
  const [hw, hd] = [(Math.abs(c) * w + Math.abs(s) * d) / 2, (Math.abs(s) * w + Math.abs(c) * d) / 2]
  const box = { x0: x - hw, y0: y - hd, x1: x + hw, y1: y + hd }
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

/** A lot in a row along a Block's edge: `w` along the edge and `d` deep, centred on `(x, y)`, its front facing `ry` (0 north, π/2 west). */
interface RowLot {
  x: number
  y: number
  w: number
  d: number
  ry: number
  /** Whether its front faces a Road, rather than the seam with the next Tile. */
  onRoad: boolean
}

/** A row lot's corners, `shrink` m in from its outline. */
function corners(lot: RowLot, shrink: number): Vec[] {
  const [c, s] = [Math.cos(lot.ry), Math.sin(lot.ry)]
  const [hw, hd] = [lot.w / 2 - shrink, lot.d / 2 - shrink]
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([u, v]) => ({ x: lot.x + u * c - v * s, y: lot.y + u * s + v * c }))
}

/** Whether two row lots overlap by more than a sliver, by their separating axes. */
function overlap(a: RowLot, b: RowLot): boolean {
  const [pa, pb] = [corners(a, 0.15), corners(b, 0.15)]
  for (const ry of [a.ry, b.ry]) {
    for (const [ax, ay] of [
      [Math.cos(ry), Math.sin(ry)],
      [-Math.sin(ry), Math.cos(ry)],
    ]) {
      const [ra, rb] = [pa.map((p) => p.x * ax + p.y * ay), pb.map((p) => p.x * ax + p.y * ay)]
      if (Math.max(...ra) <= Math.min(...rb) || Math.max(...rb) <= Math.min(...ra)) return false
    }
  }
  return true
}

/** Whether `(x, y)` lies within `pad` m of a row lot. */
function near(lot: RowLot, x: number, y: number, pad: number): boolean {
  const [c, s] = [Math.cos(lot.ry), Math.sin(lot.ry)]
  const [dx, dy] = [x - lot.x, y - lot.y]
  return Math.abs(dx * c + dy * s) < lot.w / 2 + pad && Math.abs(-dx * s + dy * c) < lot.d / 2 + pad
}

/** How far `p` lies from the segment from `a` to `b`. */
function distance(p: Vec, a: Vec, b: Vec): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** An open polyline without the points that stray less than `tolerance` from it (Douglas–Peucker). */
function simplified(pts: Vec[], tolerance: number): Vec[] {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let [index, worst] = [0, 0]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distance(pts[i], a, b)
    if (d > worst) [index, worst] = [i, d]
  }
  if (worst <= tolerance) return [a, b]
  return [...simplified(pts.slice(0, index + 1), tolerance).slice(0, -1), ...simplified(pts.slice(index), tolerance)]
}

/** A closed outline as a few straight sides, its corners in order: the field's outlines step every 1.25 m. */
function sides(loop: Vec[], tolerance: number): Vec[] {
  let far = 0
  loop.forEach((p, i) => {
    if (Math.hypot(p.x - loop[0].x, p.y - loop[0].y) > Math.hypot(loop[far].x - loop[0].x, loop[far].y - loop[0].y)) far = i
  })
  const there = simplified(loop.slice(0, far + 1), tolerance)
  const back = simplified([...loop.slice(far), loop[0]], tolerance)
  return [...there.slice(0, -1), ...back.slice(0, -1)]
}

/**
 * Rows of lots along the Block's edge, whatever its shape: their fronts `margin` m in from the edge and facing out,
 * each `width()` wide, and a whole side of a row `depth()` deep. A lot that would overlap one placed already, or not
 * stand on the Block, is left out, so corners stay open.
 */
function rows(g: ZoneGround, margin: number, depth: () => number, width: () => number): RowLot[] {
  const lots: RowLot[] = []
  const cell = cellBounds(cellAt(middle(g.block)))
  for (const loop of g.field.outlines(margin, [g.block])) {
    if (loop.length < 4 || !inside(g.block.loop, loop[0].x, loop[0].y)) continue
    const line = sides(loop, 0.7)
    let twice = 0
    line.forEach((p, i) => {
      const q = line[(i + 1) % line.length]
      twice += p.x * q.y - q.x * p.y
    })
    const turn = twice > 0 ? 1 : -1 // counterclockwise, the outside is to the right of the way round
    for (let i = 0; i < line.length; i++) {
      const [a, b] = [line[i], line[(i + 1) % line.length]]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 5) continue
      const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
      const [nx, ny] = [turn * uy, -turn * ux] // out of the Block
      const ry = Math.atan2(-nx, ny)
      const d = depth()
      for (let s = 0.3; s < len - 0.3;) {
        const w = Math.min(width(), len - 0.3 - s)
        if (w < 3.6) break
        const [fx, fy] = [a.x + ux * (s + w / 2), a.y + uy * (s + w / 2)]
        // Across the pavement from the front: on a Road, or on the seam at the cell's edge.
        const [px, py] = [fx + nx * (margin + 3), fy + ny * (margin + 3)]
        const lot = {
          x: fx - (nx * d) / 2,
          y: fy - (ny * d) / 2,
          w,
          d,
          ry,
          onRoad: px > cell.x0 + 1 && px < cell.x1 - 1 && py > cell.y0 + 1 && py < cell.y1 - 1,
        }
        if (stands(g, lot.x, lot.y, w - 0.3, d - 0.3, 0.4, ry) && !lots.some((o) => overlap(o, lot))) lots.push(lot)
        s += w
      }
    }
  }
  return lots
}

/** Up to `count` trees in the yards behind the rows `lots`, where there is room, growing with the Stage (`GROW`). */
function yards(g: ZoneGround, lots: RowLot[], count: number) {
  const { kit, block, field } = g
  const planted: Vec[] = []
  for (let tries = 0; tries < count * 12 && planted.length < count; tries++) {
    const [x, y] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(x, y) < 4 || !inside(block.loop, x, y)) continue
    if (lots.some((l) => near(l, x, y, 2.6)) || planted.some((p) => Math.hypot(p.x - x, p.y - y) < 6)) continue
    if (!stands(g, x, y, 3, 3, 2)) continue
    const [size, kind] = [kit.range(0.55, 0.85), kit.chance(0.25) ? 'sakura' : 'round'] as const
    kit.staged((stage) => kit.tree(x, y, KERB, GROW[stage - 1] * size, kind))
    planted.push({ x, y })
  }
}

/**
 * Low-density residential: a house on a lawn on each lot, and the odd lot left to a tree. Stage 1 builds a cottage on
 * a bare lawn, and a sapling on a lot left to a tree; from Stage 2 most gardens have a tree; Stage 3 adds a storey, a
 * chimney, a hedge round the garden and, in half the gardens, a second tree.
 */
function houses(g: ZoneGround) {
  const { kit } = g
  const ground = KERB + 0.16 // on the lawn
  for (const [i, lot] of lotsOf(g, HOUSES.margin, HOUSES.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const lawn = fit(g, x, y, lot.x1 - lot.x0 - 2 * HOUSES.gap, lot.y1 - lot.y0 - 2 * HOUSES.gap, HOUSES.clear, HOUSES.least, 1.6, 3)
    if (!lawn) continue
    kit.lot(i)
    const { w, d } = lawn
    kit.from(1, () => {
      kit.lawn(x, y, KERB, w, d)
      kit.brick('ground', x, y, KERB)
    })
    if (kit.chance(0.1)) {
      kit.staged((stage) => kit.tree(x, y, ground, SAPLING[stage - 1] * kit.range(0.7, 0.95), 'round'))
      continue
    }
    kit.staged((stage) =>
      kit.house(x, y, ground, Math.min(w - 2 * HOUSES.yard, HOUSES.most), Math.min(d - 2 * HOUSES.yard, HOUSES.most), stage),
    )
    const [sx, sy] = [kit.chance(0.5) ? 1 : -1, kit.chance(0.5) ? 1 : -1]
    kit.from(2, () => {
      if (kit.chance(0.6))
        kit.tree(x + sx * (w / 2 - 1.4), y + sy * (d / 2 - 1.4), ground, kit.range(0.45, 0.65), kit.chance(0.2) ? 'sakura' : 'round')
    })
    kit.from(3, () => {
      if (kit.chance(0.5))
        kit.tree(x - sx * (w / 2 - 1.4), y - sy * (d / 2 - 1.4), ground, kit.range(0.4, 0.55), kit.chance(0.3) ? 'sakura' : 'round')
    })
    kit.from(3, () => kit.hedge(x, y, ground, w, d, Math.floor(kit.range(0, 4))))
  }
  kit.lot(-1)
}

/**
 * Medium-density residential, terraces: rows of narrow houses that share their walls, one to three storeys at Stage 2,
 * along every edge, with yards behind. Each house stands a storey lower at Stage 1 (one at least) and a storey higher
 * at Stage 3, with the finish its Stage gives it (the kit's `townhouse`).
 */
function terraces(g: ZoneGround) {
  const { kit } = g
  const lots = rows(
    g,
    TERRACES.margin,
    () => kit.range(...TERRACES.deep),
    () => kit.range(...TERRACES.wide),
  )
  for (const [i, l] of lots.entries()) {
    kit.lot(i)
    const storeys = kit.chance(0.3) ? 1 : kit.chance(0.72) ? 2 : 3
    kit.staged((stage) => kit.townhouse(l.x, l.y, KERB, l.w, l.d, l.ry, TERRACE_STOREYS(storeys, stage), stage))
  }
  kit.lot(-1)
  yards(g, lots, TERRACES.trees)
}

/**
 * Medium-density residential, courtyards: on each lot an apartment building round a court with a tree, an O or a U,
 * where the lot is large enough; an L where it is not, and a bar on a narrow lot. It stands two floors lower at Stage
 * 1 (three at least) and two higher at Stage 3, with the finish its Stage gives it (the kit's `apartment`). The court's
 * tree grows with the Stage, and at Stage 3 a hedge runs round the court's lawn.
 */
function courtyards(g: ZoneGround) {
  const { kit } = g
  for (const [i, lot] of lotsOf(g, COURTYARDS.margin, COURTYARDS.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w0, d0] = [lot.x1 - lot.x0 - 2 * COURTYARDS.gap, lot.y1 - lot.y0 - 2 * COURTYARDS.gap]
    const room = fit(g, x, y, w0, d0, COURTYARDS.clear, COURTYARDS.least, 5, 2)
    if (!room) continue
    const { w, d } = room
    kit.lot(i)
    const [x0, y0, x1, y1] = [x - w / 2, y - d / 2, x + w / 2, y + d / 2]
    const deep = kit.range(...COURTYARDS.wing)
    const floors = Math.round(kit.range(...COURTYARDS.floors))
    const [north, south] = [
      { x0, y0: y1 - deep, x1, y1 },
      { x0, y0, x1, y1: y0 + deep },
    ]
    let wings: Bounds[]
    if (Math.min(w, d) >= 2 * deep + COURTYARDS.court) {
      wings = [north, south, { x0, y0: y0 + deep, x1: x0 + deep, y1: y1 - deep }, { x0: x1 - deep, y0: y0 + deep, x1, y1: y1 - deep }]
      if (kit.chance(0.4)) wings.splice(Math.floor(kit.range(0, 4)), 1)
      const [cw, cd] = [w - 2 * deep, d - 2 * deep]
      kit.lawn(x, y, KERB, cw, cd)
      kit.brick('ground', x, y, KERB)
      const [size, kind] = [kit.range(0.7, 0.95), kit.chance(0.3) ? 'sakura' : 'round'] as const
      kit.staged((stage) => kit.tree(x, y, KERB + 0.16, GROW[stage - 1] * size, kind))
      kit.from(3, () => kit.hedge(x, y, KERB + 0.16, cw - 1.2, cd - 1.2, Math.floor(kit.range(0, 4))))
    } else if (Math.min(w, d) >= deep + 6) {
      const [top, left] = [kit.chance(0.5), kit.chance(0.5)]
      const [from, to] = top ? [y0, y1 - deep] : [y0 + deep, y1]
      wings = [top ? north : south, left ? { x0, y0: from, x1: x0 + deep, y1: to } : { x0: x1 - deep, y0: from, x1, y1: to }]
    } else wings = [{ x0, y0, x1, y1 }]
    kit.staged((stage) => kit.apartment(wings, KERB, COURT_FLOORS(floors, stage), stage))
  }
  kit.lot(-1)
}

/**
 * High-density residential: a pale residential tower on each large lot, with room around it. It stands at 55% of its
 * floors at Stage 1 and 125% at Stage 3, with the finish its Stage gives it (the kit's `residentialTower`).
 */
function towers(g: ZoneGround) {
  const { kit } = g
  const { podium, most, gap } = TOWERS
  for (const [i, lot] of lotsOf(g, TOWERS.margin, TOWERS.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [Math.min(most[0], lot.x1 - lot.x0 - 2 * gap), Math.min(most[1], lot.y1 - lot.y0 - 2 * gap)]
    const base = fit(g, x, y, w + 2 * podium, d + 2 * podium, TOWERS.clear, TOWERS.least + 2 * podium, 2.5, 2)
    if (!base) continue
    kit.lot(i)
    const floors = Math.round(kit.range(...TOWERS.floors))
    kit.staged((stage) => kit.residentialTower(x, y, KERB, base.w - 2 * podium, base.d - 2 * podium, TOWER_FLOORS(floors, stage), stage))
  }
  kit.lot(-1)
}

/**
 * Offices: a glass tower on each large lot with room around it, most of them low, and the odd lot left to a tree. A
 * tower gains floors and finish with each Stage (`FLOORS`, and the kit's `officeTower`), and at Stage 3 its plaza has
 * trees in planters at two corners.
 */
function offices(g: ZoneGround) {
  const { kit } = g
  for (const [i, lot] of lotsOf(g, OFFICES.margin, OFFICES.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [lot.x1 - lot.x0 - 2 * OFFICES.gap, lot.y1 - lot.y0 - 2 * OFFICES.gap].map((side) => Math.min(OFFICES.most, side))
    const footprint = fit(g, x, y, w, d, OFFICES.clear, OFFICES.least, 3, 2)
    if (!footprint) continue
    kit.lot(i)
    if (kit.chance(0.06)) {
      kit.staged((stage) => kit.tree(x, y, KERB, SAPLING[stage - 1] * kit.range(0.7, 1), 'round'))
      continue
    }
    kit.staged((stage) => {
      const [t, tall, style] = [kit.range(0, 1), kit.chance(SKYLINE.tall), kit.pick(STYLES)]
      const [low, high] = FLOORS[stage - 1][tall ? 'high' : 'low']
      kit.officeTower(x, y, KERB, footprint.w, footprint.d, Math.round(low + (high - low) * t), style, stage)
    })
    kit.from(3, () => {
      const flip = kit.chance(0.5) ? 1 : -1
      for (const k of [1, -1]) {
        const [px, py] = [x + k * (footprint.w / 2 + 2.2), y + k * flip * (footprint.d / 2 + 2.2)]
        if (!stands(g, px, py, 2.2, 2.2, 0.6)) continue
        kit.add(kit.box(1.9, 0.7, 1.9, 0.3, 0.1), PLANTER, px, py, KERB)
        kit.tree(px, py, KERB + 0.7, kit.range(0.36, 0.44), 'round')
      }
    })
  }
  kit.lot(-1)
}

/**
 * Shops: low shops shoulder to shoulder along every edge, each with an awning where it faces a Road, and trees behind.
 * Every shop is one storey at Stage 1 and a storey higher at Stage 3, with the finish its Stage gives it (the kit's
 * `shop`).
 */
function shops(g: ZoneGround) {
  const { kit } = g
  const lots = rows(
    g,
    SHOPS.margin,
    () => kit.range(...SHOPS.deep),
    () => kit.range(...SHOPS.wide),
  )
  for (const [i, l] of lots.entries()) {
    kit.lot(i)
    const storeys = kit.chance(0.45) ? 1 : 2
    kit.staged((stage) => kit.shop(l.x, l.y, KERB, l.w, l.d, l.ry, SHOP_STOREYS(storeys, stage), l.onRoad, stage))
  }
  kit.lot(-1)
  yards(g, lots, SHOPS.trees)
}

/**
 * Industrial: wide, low sheds with sawtooth roofs on big lots with yards between them, and now and then a chimney, each
 * with the size and finish its Stage gives it (the kit's `warehouse`).
 */
function industrial(g: ZoneGround) {
  const { kit } = g
  let chimney = kit.chance(SHEDS.chimney)
  const area = (l: Bounds) => (l.x1 - l.x0) * (l.y1 - l.y0)
  for (const [i, lot] of lotsOf(g, SHEDS.margin, SHEDS.lot)
    .sort((a, b) => area(b) - area(a))
    .entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const shed = fit(g, x, y, lot.x1 - lot.x0 - 2 * SHEDS.gap, lot.y1 - lot.y0 - 2 * SHEDS.gap, SHEDS.clear, SHEDS.least, 3, 3)
    if (!shed) continue
    kit.lot(i)
    const first = chimney
    kit.staged((stage) => kit.warehouse(x, y, KERB, shed.w, shed.d, first, stage))
    chimney = false
  }
  kit.lot(-1)
}

/** Parks: a park with a pond and trees, or on a small Block now and then a plaza with a fountain. */
function parks({ kit, field, block, street }: ZoneGround) {
  const small = (block.x1 - block.x0) * (block.y1 - block.y0) < PARKS.small
  const fountain = small && kit.chance(PARKS.plaza) ? site(field, block, 12, 12, middle(block), street, 1) : null
  if (fountain) plaza(kit, field, block, fountain, street)
  else park(kit, field, block, undefined, street)
}
