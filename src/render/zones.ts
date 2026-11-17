import type { Zone } from '../city/city'
import { mulberry32 } from '../sim/demand'
import { middle, overlaps, polyline, type Bounds, type Vec } from '../sim/geometry'
import { cellAt, cellBounds } from '../sim/tiles'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import { CONTAINER, shedDoors, spot, type Kit, type OfficeStyle } from './kit'
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
// Shop details (#153), before the fronts that face a Road: the share of shops with each from Stages 1, 2 and 3 (one
// roll a shop for each detail, so a shop keeps its details as it grows), and the share of those with a vending machine
// that have a second at Stage 3. Parked bicycles stand `gap` m apart, turned `slant` off square to the front; banners
// stand `banner` m out from the front and lanterns hang `lantern` m out under the awning. On the pavement, details keep
// `edge` m in from the Block's edge and `room` m from a lamp's post or a street tree's trunk. The banners' cloths are
// the shops' own colours.
const FRONT = {
  vending: [0.15, 0.35, 0.5],
  second: 0.5,
  nobori: [0, 0.35, 0.55],
  lanterns: [0, 0.35, 0.6],
  bikes: [0, 0.3, 0.5],
  gap: 0.7,
  slant: 0.4,
  banner: 1.8,
  lantern: 1.3,
  edge: 0.55,
  room: 1.4,
  cloths: ['#2fb39a', '#f0b43c', '#ff9ab8', '#79c86a', '#a58ad8', '#e8925e', '#5cc0d6'],
} as const
// Industrial: lots at most 34 m on a side, 3.2 m in from the Block's bounding box, the largest built first, each with
// a shed over all but 2.5 m of the lot on every side, 1.5 m in from the Block's edge and at least 9 m across. On some
// Blocks the first shed has a chimney.
const SHEDS = { lot: 34, margin: 3.2, gap: 2.5, clear: 1.5, least: 9, chimney: 0.45 }
// Industrial details (#150), each drawn from where it stands so that nothing else on the Block draws differently. A
// shed's doors face the long side with more room before it, and the shed stands back from that side as far as it must,
// up to `back` m and keeping at least `least` m deep, to leave a loading yard `deep` m deep before its doors.
const YARD = { deep: 12, back: 6, least: 10 }
// A truck backed up to a door: m long and wide (as `./movers` draws it), how far it pulls away at most and at least, how
// long it waits at the door and pulled away (s, a range from which each truck draws its own), and the paints it takes.
const TRUCKS = {
  long: 6.5,
  wide: 2.4,
  pull: [6, 3],
  dock: [24, 48],
  away: [8, 16],
  paints: ['#ffffff', '#e9eef2', '#fbe3a2', '#c0e9e0', '#d6e4d3'],
} as const
// A forklift shuttling between a door and a stack of pallets along the wall: m out from the wall it stands, the radius
// of its turns, how far its rear reaches behind its middle (as `./movers` draws it), how far out from the wall its stack
// stands and how far along the wall it may (the nearest that fits, so that a door beyond keeps room for a truck), and
// how long it waits (s) at the door or the stack (a range from which each forklift draws its own) and where it turns.
const FORKLIFT = { out: 3.2, turn: 1.8, rear: 1.9, stack: 0.95, apart: [3.4, 4.2, 5], lift: [1.6, 3.6], cusp: 0.4 }
// Containers along a shed's back and ends: m from the wall, the share of spots filled from Stage 2 and from Stage 3,
// and the share of them that a second container tops at Stage 3.
const CONTAINERS = { gap: 0.35, fill: [0.3, 0.65], double: 0.45 }
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
  /** The lamps at the Block's corners, which what stands on the ground keeps clear of (#150). */
  lamps: Vec[]
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
    if (l.onRoad) shopFront(g, l)
  }
  kit.lot(-1)
  yards(g, lots, SHOPS.trees)
}

/**
 * The details before shop `l`'s front (#153), each drawn from where the shop stands, so that nothing else on the Block
 * changes: a vending machine or two at one end, a row of bicycles at the other, nobori banners at the pavement's edge
 * between them, and paper lanterns under the awning. Each stands from the Stage its roll gives it (`FRONT`), and more
 * come at Stage 3: a second vending machine on half the fronts with one, two more bicycles, a third banner and two
 * more lanterns. What stands on the pavement keeps on the Block, 0.6 m in from its edge, and clear of the lamps at its
 * corners and the street trees.
 */
function shopFront(g: ZoneGround, l: RowLot) {
  const { kit, field } = g
  const draw = mulberry32(spot(l.x, l.y))
  const half = l.w / 2
  /** Where the point `u` m along the front from its middle and `o` m out from it lies on the map. */
  const at = (u: number, o: number) => turned(l.x, l.y, l.ry, u, l.d / 2 + o)
  const others = [...g.lamps, ...g.street]
  /** Whether the pavement `o` m out from the front at each of `us` along it is clear. */
  const clear = (o: number, ...us: number[]) =>
    us.every((u) => {
      const p = at(u, o)
      return field.sample(p.x, p.y) >= FRONT.edge && !others.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < FRONT.room)
    })
  /** The Stage from which a detail stands, by a roll against its shares of the shops from Stages 1, 2 and 3; 0 for none. */
  const first = (shares: readonly number[]) => {
    const roll = draw()
    return shares.findIndex((s) => roll < s) + 1
  }
  const side = draw() < 0.5 ? 1 : -1 // the end the vending machines stand at; the bicycles take the other
  const [vending, banners, lanterns, bikes] = [first(FRONT.vending), first(FRONT.nobori), first(FRONT.lanterns), first(FRONT.bikes)]
  const [second, count, cloth, amber] = [
    draw() < FRONT.second,
    2 + Math.floor(draw() * 3),
    FRONT.cloths[Math.floor(draw() * FRONT.cloths.length)],
    draw() < 0.5,
  ]
  /** Build `fn` at `p` from Stage `stage`, on a stream of its own from where it stands. */
  const from = (stage: number, p: Vec, fn: (p: Vec) => void) => stage && kit.from(stage, () => fn(p), spot(p.x, p.y))
  let [left, right] = [-half + 0.3, half - 0.3] // the stretch of the front left for the banners
  if (vending) {
    // Backed up to the front at its end, and a second beside it at Stage 3.
    const [u, v] = [side * (half - 0.85), side * (half - 2.15)]
    if (clear(0.5, u - 0.6, u + 0.6) && clear(1, u)) {
      from(vending, at(u, 0.5), (p) => kit.vending(p.x, p.y, KERB, l.ry))
      if (second && clear(0.5, v - 0.6, v + 0.6)) from(3, at(v, 0.5), (p) => kit.vending(p.x, p.y, KERB, l.ry))
      ;[left, right] = side > 0 ? [left, v - 0.8] : [v + 0.8, right]
    }
  }
  if (bikes) {
    // A row from the other end, nosed in to the front, and two more bicycles on its end at Stage 3.
    const [start, step] = [-side * (half - 0.55), side * FRONT.gap]
    const end = (n: number) => start + step * (n - 1)
    if (clear(0.85, start, end(count)) && clear(1.7, start, end(count))) {
      from(bikes, at(start, 0.85), (p) => kit.bicycles(p.x, p.y, KERB, l.ry, count, step, FRONT.slant))
      const more = clear(0.85, end(count + 2)) && clear(1.7, end(count + 2))
      if (more) from(3, at(end(count + 1), 0.85), (p) => kit.bicycles(p.x, p.y, KERB, l.ry, 2, step, FRONT.slant))
      const last = end(more ? count + 2 : count) + step
      ;[left, right] = side > 0 ? [last, right] : [left, last]
    }
  }
  if (banners) {
    // Up to three along what is left of the front, at the pavement's edge, each cloth hung to the right of its pole.
    const n = Math.min(3, Math.floor((right - left) / 1.3))
    for (let k = 0; k < n; k++) {
      const u = left + ((k + 0.5) * (right - left)) / n - 0.4
      if (clear(FRONT.banner, u, u + 0.8)) from(k < 2 ? banners : 3, at(u, FRONT.banner), (p) => kit.nobori(p.x, p.y, KERB, l.ry, cloth))
    }
  }
  if (lanterns) {
    // Two hung under the awning's span, and two more between them at Stage 3.
    for (const [t, stage] of [
      [-0.3, lanterns],
      [0.3, lanterns],
      [-0.1, 3],
      [0.1, 3],
    ])
      from(stage, at(t * l.w * 0.86, FRONT.lantern), (p) => kit.lantern(p.x, p.y, KERB + 1.95, amber))
  }
}

/** Where `(lx, ly)` in the frame of something at `(x, y)` turned `ry` lies on the map, as the kit's `local` places it. */
const turned = (x: number, y: number, ry: number, lx: number, ly: number): Vec => ({
  x: x + lx * Math.cos(ry) - ly * Math.sin(ry),
  y: y + lx * Math.sin(ry) + ly * Math.cos(ry),
})

/**
 * A shed as `industrial` lays it (#150): its footprint `w` (east–west) by `d` centred on `(x, y)`, the way its long
 * side runs (`ry`, 0 east–west), the long side its doors face (`side`, as the kit's `warehouse` takes it), and how
 * long it is along that side and how deep across it.
 */
interface Shed {
  x: number
  y: number
  w: number
  d: number
  ry: number
  side: number
  len: number
  wid: number
}

/** Where the point `u` m along shed `s`'s door wall from its middle and `o` m out from that wall lies on the map. */
const onShed = (s: Shed, u: number, o: number) => turned(s.x, s.y, s.ry, u, s.side * (s.wid / 2 + o))

/** The ground from `u0` to `u1` along shed `s`'s door wall and from `o0` to `o1` out from it, as a row lot. */
function yardLot(s: Shed, u0: number, u1: number, o0: number, o1: number): RowLot {
  const c = onShed(s, (u0 + u1) / 2, (o0 + o1) / 2)
  return { x: c.x, y: c.y, w: u1 - u0, d: o1 - o0, ry: s.ry, onRoad: false }
}

/**
 * Industrial: wide, low sheds with sawtooth roofs on big lots with yards between them, and now and then a chimney, each
 * with the size and finish its Stage gives it (the kit's `warehouse`). Each shed's doors open onto a loading yard
 * (#150), where trucks back up to the doors and a forklift shuttles to a stack of pallets, and containers stand along
 * its other walls (`loadingYard`). With the Stage:
 * - Stage 1: a stack of pallets by a door.
 * - Stage 2: a truck at a door in its painted bay, a forklift at work, containers along some walls, a lamp over each
 *   door, and smoke from the chimney.
 * - Stage 3: a second truck, more containers and some stacked two high, and a third layer on the pallets.
 */
function industrial(g: ZoneGround) {
  const { kit, field } = g
  let chimney = kit.chance(SHEDS.chimney)
  const area = (l: Bounds) => (l.x1 - l.x0) * (l.y1 - l.y0)
  const lots = lotsOf(g, SHEDS.margin, SHEDS.lot).sort((a, b) => area(b) - area(a))
  // Every shed's whole footprint first, so that each can see the room its neighbours leave before it.
  const whole = lots.map((lot): RowLot | null => {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const shed = fit(g, x, y, lot.x1 - lot.x0 - 2 * SHEDS.gap, lot.y1 - lot.y0 - 2 * SHEDS.gap, SHEDS.clear, SHEDS.least, 3, 3)
    return shed && { x, y, w: shed.w, d: shed.d, ry: 0, onRoad: false }
  })
  /**
   * How far out from `(x, y)` along `(dx, dy)` the ground stays open, up to a yard's depth and a little: on the Block a
   * metre in from its edge, and off every shed but `self`.
   */
  const room = (self: RowLot, x: number, y: number, dx: number, dy: number) => {
    let r = 0
    for (; r < YARD.deep + 2; r += 0.5) {
      const [px, py] = [x + dx * r, y + dy * r]
      if (field.sample(px, py) < 1 || whole.some((o) => o && o !== self && near(o, px, py, 0))) break
    }
    return r
  }
  /** The ground taken on the Block so far: the lamps at its corners, the sheds and their yards' details. */
  const taken: RowLot[] = g.lamps.map(({ x, y }) => ({ x, y, w: 1.4, d: 1.4, ry: 0, onRoad: false }))
  const laid: { shed: Shed; lot: number }[] = []
  for (const [i, f] of whole.entries()) {
    if (!f) continue
    const along = f.w >= f.d
    const [len, wid, ry] = along ? [f.w, f.d, 0] : [f.d, f.w, Math.PI / 2]
    // Its doors face the long side with more room before it, by the least of three looks out from the wall.
    const ahead = [1, -1].map((side) => {
      const out = turned(0, 0, ry, 0, side)
      const looks = [-0.3, 0, 0.3].map((t) => turned(f.x, f.y, ry, t * len, (side * wid) / 2))
      return Math.min(...looks.map((p) => room(f, p.x, p.y, out.x, out.y)))
    })
    const side = Math.abs(ahead[0] - ahead[1]) > 0.5 ? (ahead[0] > ahead[1] ? 1 : -1) : mulberry32(spot(f.x, f.y))() < 0.5 ? 1 : -1
    const back = Math.max(0, Math.min(YARD.back, wid - YARD.least, YARD.deep - Math.max(...ahead)))
    const c = turned(f.x, f.y, ry, 0, (-side * back) / 2)
    const shed = { x: c.x, y: c.y, w: along ? f.w : f.w - back, d: along ? f.d - back : f.d, ry, side, len, wid: wid - back }
    laid.push({ shed, lot: i })
    taken.push({ x: shed.x, y: shed.y, w: shed.w, d: shed.d, ry: 0, onRoad: false })
    kit.lot(i)
    const first = chimney
    kit.staged((stage) => kit.warehouse(shed.x, shed.y, KERB, shed.w, shed.d, first, side, stage))
    chimney = false
  }
  // Then each yard, on its shed's lot, once every shed has taken its ground.
  for (const { shed, lot } of laid) {
    kit.lot(lot)
    loadingYard(g, shed, taken)
  }
  kit.lot(-1)
}

/**
 * The details of shed `shed`'s yard (#150), each drawn from where it stands and laid where its ground is clear of
 * everything `taken`, which it then takes: a truck backed up to the first door with room for its bay, a forklift at the
 * next door with room to work, a second truck at a door left over, and containers along the shed's back and ends.
 */
function loadingYard(g: ZoneGround, shed: Shed, taken: RowLot[]) {
  const { kit } = g
  /** Take `lot` if it stands on the Block `clear` m in from its edge, clear of everything taken: whether it did. */
  const claim = (lot: RowLot, clear: number) => {
    if (!stands(g, lot.x, lot.y, lot.w, lot.d, clear, lot.ry) || taken.some((o) => overlap(o, lot))) return false
    taken.push(lot)
    return true
  }
  /**
   * A truck backed up to the door `u` m along the wall from Stage `stage`, in a bay painted from Stage 2, where it has
   * room to pull away: whether one is. Each truck waits its own while at the door and pulled away.
   */
  const truck = (u: number, stage: number) => {
    const { long, wide, pull } = TRUCKS
    const dock = 0.3 + long / 2 // its middle, backed up to the door
    for (let p = pull[0]; p >= pull[1]; p -= 0.5) {
      if (!claim(yardLot(shed, u - wide / 2 - 0.4, u + wide / 2 + 0.4, 0, dock + p + long / 2 + 0.3), 1)) continue
      const [at, away] = [onShed(shed, u, dock), onShed(shed, u, dock + p)]
      const draw = mulberry32(spot(at.x, at.y))
      const waits = [TRUCKS.dock, TRUCKS.away].map(([lo, hi]) => lo + draw() * (hi - lo))
      const paint = TRUCKS.paints[Math.floor(draw() * TRUCKS.paints.length)]
      const drive = { waits, reverse: [false, true], paint }
      // The bay runs from the wall a little past the truck's nose; the truck pulls away out of it.
      kit.from(2, () => kit.bay(at.x, at.y, KERB, shed.ry, 2 * dock, wide + 0.9), spot(at.x, at.y + 1))
      kit.from(stage, () => kit.mover('truck', polyline([at, away, at]), [0, p], 0, KERB, drive), spot(at.x, at.y))
      return true
    }
    return false
  }
  /**
   * A forklift from Stage 2 at the door `u` m along the wall, shuttling to a stack of pallets along the wall where it
   * has room to work: whether one is. It backs out of the door turning away from the stack, drives on along the wall
   * and turns into the stack, then does the same back.
   */
  const forklift = (u: number) => {
    const { out, turn: r, rear, stack: o } = FORKLIFT
    const door = onShed(shed, u, out)
    const draw = mulberry32(spot(door.x, door.y))
    const dirs = draw() < 0.5 ? [1, -1] : [-1, 1]
    for (const apart of FORKLIFT.apart) {
      for (const dir of dirs) {
        const s = u + dir * apart
        if (Math.abs(s) > shed.len / 2 - 1 || shedDoors(shed.w, shed.d).some((d) => d !== u && Math.abs(d - s) < 2.6)) continue
        // Where it turns it lies along the wall, its rear past the turn.
        if (!claim(yardLot(shed, Math.min(u, s) - r - rear, Math.max(u, s) + r + rear, 0, out + r + 1.4), 0.8)) continue
        const pts: { u: number; o: number }[] = [{ u, o: out }]
        const ends = [0]
        /** A quarter turn about `(cu, out)`, from angle `from` to `to`, its `u` mirrored for `dir`, ending at a stop. */
        const quarter = (cu: number, from: number, to: number) => {
          for (let k = 1; k <= 6; k++) {
            const a = from + ((to - from) * k) / 6
            pts.push({ u: cu + dir * r * Math.cos(a), o: out + r * Math.sin(a) })
          }
          ends.push(pts.length - 1)
        }
        quarter(u - dir * r, 0, Math.PI / 2) // backing out of the door
        quarter(s - dir * r, Math.PI / 2, 0) // on along the wall and into the stack
        quarter(s + dir * r, Math.PI, Math.PI / 2) // backing out of the stack
        quarter(u + dir * r, Math.PI / 2, Math.PI) // back along the wall and into the door
        const loop = polyline(pts.map((p) => onShed(shed, p.u, p.o)))
        const stops = ends.slice(0, 4).map((i) => loop.cum[i])
        const { lift, cusp } = FORKLIFT
        const waits = [0, 1, 2, 3].map((k) => (k % 2 ? cusp : lift[0] + draw() * (lift[1] - lift[0])))
        const [drive, stack] = [{ waits, reverse: [true, false, true, false] }, onShed(shed, s, o)]
        kit.from(2, () => kit.mover('forklift', loop, stops, 0, KERB, drive), spot(door.x, door.y))
        kit.from(1, () => kit.pallets(stack.x, stack.y, KERB, shed.ry, 2), spot(stack.x, stack.y))
        kit.from(3, () => kit.pallets(stack.x, stack.y, KERB, shed.ry, 3, 2), spot(stack.x, stack.y + 1))
        return true
      }
    }
    return false
  }
  const doors = shedDoors(shed.w, shed.d)
  const take = (fits: (u: number) => boolean) => {
    const i = doors.findIndex(fits)
    if (i >= 0) doors.splice(i, 1)
  }
  take((u) => truck(u, 2))
  take(forklift)
  take((u) => truck(u, 3))
  // Containers lying along the back and the ends, a spot to every container's length and a little.
  const { long, wide } = CONTAINER
  const { gap, fill, double } = CONTAINERS
  const along = (len: number) => {
    const n = Math.floor(len / (long + 0.7))
    return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * (long + 0.7))
  }
  const spots = [
    ...along(shed.len).map((u) => ({ p: onShed(shed, u, -shed.wid - gap - wide / 2), ry: shed.ry })),
    ...[-1, 1].flatMap((end) =>
      along(shed.wid + 2).map((o) => ({
        p: onShed(shed, end * (shed.len / 2 + gap + wide / 2), o - shed.wid / 2),
        ry: shed.ry + Math.PI / 2,
      })),
    ),
  ]
  for (const { p, ry } of spots) {
    const draw = mulberry32(spot(p.x, p.y))
    const [roll, two] = [draw(), draw() < double]
    const first = roll < fill[0] ? 2 : roll < fill[1] ? 3 : 0
    if (!first || !claim({ x: p.x, y: p.y, w: long + 0.3, d: wide + 0.3, ry, onRoad: false }, 0.6)) continue
    kit.from(first, () => kit.containers(p.x, p.y, KERB, ry, 1), spot(p.x, p.y))
    if (two) kit.from(3, () => kit.containers(p.x, p.y, KERB, ry, 2, 1), spot(p.x + 1, p.y))
  }
}

/** Parks: a park with a pond and trees, or on a small Block now and then a plaza with a fountain. */
function parks({ kit, field, block, street }: ZoneGround) {
  const small = (block.x1 - block.x0) * (block.y1 - block.y0) < PARKS.small
  const fountain = small && kit.chance(PARKS.plaza) ? site(field, block, 12, 12, middle(block), street, 1) : null
  if (fountain) plaza(kit, field, block, fountain, street)
  else park(kit, field, block, undefined, street)
}
