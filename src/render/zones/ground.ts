import { middle, overlaps, type Bounds, type Vec } from '../../sim/geometry'
import { cellAt, cellBounds } from '../../sim/tiles'
import { KERB, twiceArea, type Block } from '../blocks'
import { inside, type Field } from '../field'
import { to, type Kit } from '../kit'
import { GROW } from '../landmarks'

// What a Zone's look builds on, and how the Zones share to cut it up: lots split from the Block, rows of lots and runs
// along its edge, and whether a footprint stands on it clear of what must stay free (`./index` has each Zone's look).

/** m a building keeps clear of a street tree, beyond its trunk. */
const TREE_ROOM = 2.4
export const PLANTER = '#ddd6c9' // a Stage 3 plaza's, round a tree

/** What a Zone's look builds on: one Block, and the ground on it that must stay free. */
export interface ZoneGround {
  kit: Kit
  block: Block
  field: Field
  /** Landmarks' ground, which no building may stand on. */
  reserved: Bounds[]
  /** The Block's street trees, which buildings keep clear of. */
  kerbsideTrees: Vec[]
  /** The lamps at the Block's corners, which what stands on the ground keeps clear of (#150). */
  lamps: Vec[]
  /** The utility poles round the Block (`../poles`), which a food truck turning in over the kerb keeps clear of (#177). */
  poles: Vec[]
  /** A number in [0, 1) the seed draws for the Block's Tile, the same for each of its Blocks: for what a look picks once a Tile. */
  tileDraw: number
}

/** How a Zone builds on its Blocks. */
export interface Look {
  /** Whether the seed may stand its coral tower landmark on a Tile of this Zone. */
  landmarks: boolean
  /**
   * Whether it is built to the Finish (#173): wearing surface pattern and leaving pools of light at night
   * (the kit's `finish`). Shops since the prototype (#174), and offices since #177.
   */
  finish?: boolean
  /** Builds on the Block; where it paves over the kerbside, returns the m of pavement that shows at the edge (`Kerbside.unpaved`, #187). */
  fill(ground: ZoneGround): number | void
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
function backFromTrees(cut: Bounds, kerbsideTrees: Vec[]): Bounds {
  const lot = { ...cut }
  for (const t of kerbsideTrees) {
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
export function lotsOf({ kit, block, kerbsideTrees }: ZoneGround, margin: number, max: number): Bounds[] {
  const lots: Bounds[] = []
  split({ x0: block.x0 + margin, y0: block.y0 + margin, x1: block.x1 - margin, y1: block.y1 - margin }, max, kit.range, lots)
  return lots.map((lot) => backFromTrees(lot, kerbsideTrees))
}

/**
 * Whether a footprint `w` by `d` centred on `(x, y)` and turned `ry` (unturned, `w` runs east–west) stands on the Block
 * at least `clear` m in from its edge, off any landmark's ground and clear of the street trees. Its outline is sampled
 * about every 3 m, closer than a Road is wide, so no Road crosses it unseen.
 */
export function stands(
  { block, field, reserved, kerbsideTrees }: ZoneGround,
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
  return !kerbsideTrees.some(
    (t) => t.x > box.x0 - TREE_ROOM && t.x < box.x1 + TREE_ROOM && t.y > box.y0 - TREE_ROOM && t.y < box.y1 + TREE_ROOM,
  )
}

/**
 * The largest footprint up to `w` by `d` that stands, shrinking by `step` m at most `tries` times; null if even that
 * is under `least` across or does not stand.
 */
export function fit(g: ZoneGround, x: number, y: number, w: number, d: number, clear: number, least: number, step: number, tries: number) {
  for (let k = 0; k < tries && Math.min(w, d) >= least && !stands(g, x, y, w, d, clear); k++) [w, d] = [w - step, d - step]
  return Math.min(w, d) >= least && stands(g, x, y, w, d, clear) ? { w, d } : null
}

/** A lot in a row along a Block's edge: `w` along the edge and `d` deep, centred on `(x, y)`, its front facing `ry` (0 north, π/2 west). */
export interface RowLot {
  x: number
  y: number
  w: number
  d: number
  ry: number
  /** Whether its front faces a Road, rather than the seam with the next Tile. */
  onRoad: boolean
}

/** A row lot's corners, `shrink` m in from its outline. */
export function corners(lot: RowLot, shrink: number): Vec[] {
  const [c, s] = [Math.cos(lot.ry), Math.sin(lot.ry)]
  const [hw, hd] = [lot.w / 2 - shrink, lot.d / 2 - shrink]
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([u, v]) => ({ x: lot.x + u * c - v * s, y: lot.y + u * s + v * c }))
}

/** Whether two row lots overlap by more than a sliver (`shrink` m in from each), by their separating axes. */
export function overlap(a: RowLot, b: RowLot, shrink = 0.15): boolean {
  const [pa, pb] = [corners(a, shrink), corners(b, shrink)]
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
export function near(lot: RowLot, x: number, y: number, pad: number): boolean {
  const [c, s] = [Math.cos(lot.ry), Math.sin(lot.ry)]
  const [dx, dy] = [x - lot.x, y - lot.y]
  return Math.abs(dx * c + dy * s) < lot.w / 2 + pad && Math.abs(-dx * s + dy * c) < lot.d / 2 + pad
}

/**
 * Whether row lots `a` and `b` lie side by side (#193), as `beside` has it for boxes: in `a`'s frame, within 1.5 m of
 * each other one way, as across a bend or a corner of a row, and sharing more than 1 m of side the other.
 */
export function besideRow(a: RowLot, b: RowLot): boolean {
  const [c, s] = [Math.cos(a.ry), Math.sin(a.ry)]
  const local = corners(b, 0).map((p) => [(p.x - a.x) * c + (p.y - a.y) * s, -(p.x - a.x) * s + (p.y - a.y) * c])
  const [u0, u1] = [Math.min(...local.map((p) => p[0])), Math.max(...local.map((p) => p[0]))]
  const [v0, v1] = [Math.min(...local.map((p) => p[1])), Math.max(...local.map((p) => p[1]))]
  const [gu, gv] = [Math.max(-a.w / 2 - u1, u0 - a.w / 2), Math.max(-a.d / 2 - v1, v0 - a.d / 2)] // gaps: below 0, an overlap
  return (gu <= 1.5 && gv < -1) || (gv <= 1.5 && gu < -1)
}

/** How far `p` lies from the segment from `a` to `b`. */
export function distance(p: Vec, a: Vec, b: Vec): number {
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
 * each `width()` wide, and a whole side of a row `depth()` deep. A lot that would overlap one placed already by more
 * than a sliver, or not stand on the Block, is left out, so corners stay open; one that overlaps by a sliver, as at a
 * row's corner, is cut back at an end until it and the step before its front keep clear (`cutBack`, #193).
 */
export function rows(g: ZoneGround, margin: number, depth: () => number, width: () => number): RowLot[] {
  const lots: RowLot[] = []
  for (const { a, len, ux, uy, nx, ny, ry, onRoad } of runs(g, margin)) {
    const d = depth()
    for (let s = 0.3; s < len - 0.3;) {
      const w = Math.min(width(), len - 0.3 - s)
      if (w < ROW_LEAST) break
      const [fx, fy] = [a.x + ux * (s + w / 2), a.y + uy * (s + w / 2)]
      const lot = { x: fx - (nx * d) / 2, y: fy - (ny * d) / 2, w, d, ry, onRoad: onRoad(fx, fy) }
      const kept = stands(g, lot.x, lot.y, w - 0.3, d - 0.3, 0.4, ry) && !lots.some((o) => overlap(o, lot)) && cutBack(lots, lot)
      if (kept) lots.push(kept)
      s += w
    }
  }
  return lots
}

/**
 * m: the narrowest row lot (`rows`); how far before a row lot's front its step reaches, where its door opens; and how
 * far its back wall's pipes, meter and AC units stand out behind it.
 */
const [ROW_LEAST, ROW_STEP, ROW_BACK] = [3.6, 1.4, 0.75]

/** Row lot `l` with what stands on its walls: on its back (`ROW_BACK`), and the AC unit under a front window. */
export const walled = (l: RowLot): RowLot => ({ ...l, ...turned(l.x, l.y, l.ry, 0, (0.45 - ROW_BACK) / 2), d: l.d + ROW_BACK + 0.45 })

/** Row lot `l` with the step before its front (`ROW_STEP`) and what stands on its back wall (`ROW_BACK`). */
const stepped = (l: RowLot): RowLot => ({ ...l, ...turned(l.x, l.y, l.ry, 0, (ROW_STEP - ROW_BACK) / 2), d: l.d + ROW_STEP + ROW_BACK })

/**
 * Row lot `lot` cut back at one end, 0.1 m at a time, until it, its step and its back wall keep clear of each of `lots`
 * and theirs (#193); null if that leaves it under `ROW_LEAST` wide.
 */
function cutBack(lots: RowLot[], lot: RowLot): RowLot | null {
  for (let cut = 0; lot.w - cut >= ROW_LEAST; cut += 0.1)
    for (const end of [1, -1]) {
      const l = { ...lot, ...turned(lot.x, lot.y, lot.ry, (end * cut) / 2, 0), w: lot.w - cut }
      if (!lots.some((o) => overlap(stepped(o), stepped(l), 0.02))) return l
    }
  return null
}

/** A straight run of a Block's outline `margin` m in from its edge, as `runs` walks them. */
export interface Run {
  /** Where it starts, and its length (m). */
  a: Vec
  len: number
  /** Along it, and out of the Block. */
  ux: number
  uy: number
  nx: number
  ny: number
  /** The way out of the Block, as a front faces (0 north, π/2 west). */
  ry: number
  /** Whether the point `(x, y)` on it faces a Road across the pavement, rather than the seam at its cell's edge. */
  onRoad: (x: number, y: number) => boolean
}

/** The straight runs of the Block's outline `margin` m in from its edge, 5 m or longer, in order round each loop. */
export function runs(g: ZoneGround, margin: number): Run[] {
  const out: Run[] = []
  const cell = cellBounds(cellAt(middle(g.block)))
  for (const loop of g.field.outlines(margin, [g.block])) {
    if (loop.length < 4 || !inside(g.block.loop, loop[0].x, loop[0].y)) continue
    const line = sides(loop, 0.7)
    const turn = twiceArea(line) > 0 ? 1 : -1 // counterclockwise, the outside is to the right of the way round
    for (let i = 0; i < line.length; i++) {
      const [a, b] = [line[i], line[(i + 1) % line.length]]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 5) continue
      const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
      const [nx, ny] = [turn * uy, -turn * ux] // out of the Block
      /** Across the pavement from `(x, y)`: on a Road, or on the seam at the cell's edge. */
      const onRoad = (x: number, y: number) => {
        const [px, py] = [x + nx * (margin + 3), y + ny * (margin + 3)]
        return px > cell.x0 + 1 && px < cell.x1 - 1 && py > cell.y0 + 1 && py < cell.y1 - 1
      }
      out.push({ a, len, ux, uy, nx, ny, ry: Math.atan2(-nx, ny), onRoad })
    }
  }
  return out
}

/** m: the square of ground a yard's tree claims, which what is laid after it keeps off. */
const YARD_TREE = 3

/**
 * Up to `count` trees in the yards behind the rows `lots`, where there is room, growing with the Stage (`GROW`), and
 * `coarse` (the kit's `tree`) if asked, each claiming a square `YARD_TREE` m across (#198).
 */
export function yards(g: ZoneGround, lots: RowLot[], count: number, coarse = false) {
  const { kit, block, field } = g
  // The trees planted, held 6 m apart centre to centre: a circle, which their claims' squares cannot hold (#218).
  const planted: Vec[] = []
  for (let tries = 0; tries < count * 12 && planted.length < count; tries++) {
    const [x, y] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(x, y) < 4 || !inside(block.loop, x, y)) continue
    if (lots.some((l) => near(l, x, y, 2.6)) || planted.some((p) => Math.hypot(p.x - x, p.y - y) < 6)) continue
    if (!stands(g, x, y, 3, 3, 2)) continue
    const [size, kind] = [kit.range(0.55, 0.85), kit.chance(0.25) ? 'sakura' : 'round'] as const
    kit.stand(x, y, YARD_TREE)
    kit.staged((stage) => kit.tree(x, y, KERB, GROW[stage - 1] * size, kind, coarse))
    planted.push({ x, y })
  }
}

/** Where `(lx, ly)` in the frame of something at `(x, y)` turned `ry` lies, as the kit's `to` has it, as a point. */
export const turned = (x: number, y: number, ry: number, lx: number, ly: number): Vec => {
  const [px, py] = to(x, y, ry, lx, ly)
  return { x: px, y: py }
}

/** How far along run `r` the point `q` lies from its start (m), and how far off its line. */
export const alongRun = (r: Run, q: Vec) => (q.x - r.a.x) * r.ux + (q.y - r.a.y) * r.uy
export const offRun = (r: Run, q: Vec) => Math.abs((q.x - r.a.x) * r.nx + (q.y - r.a.y) * r.ny)

/**
 * The lengths of run `run` of a Block's outline that a border `thick` m thick takes, as [from, to] in m along it (#180
 * a park's azaleas, #182 an allotments' fence): open a metre at each end, round each lamp, pole and street tree, and
 * over each of `gaps`; each cut back where it would meet what is claimed, as another run's at a shallow corner; and
 * 1.2 m or longer. Each claims its ground.
 */
export function borderLengths(g: ZoneGround, run: Run, thick: number, gaps: [number, number][]): [number, number][] {
  const { kit } = g
  // Where along the run to leave open, as [from, to] in m.
  const open: [number, number][] = [[-1, 1], [run.len - 1, run.len + 1], ...gaps]
  for (const q of [...g.lamps, ...g.poles, ...g.kerbsideTrees])
    if (offRun(run, q) < 1.3) open.push([alongRun(run, q) - 1, alongRun(run, q) + 1])
  open.sort((a, b) => a[0] - b[0])
  const lengths: [number, number][] = []
  let from = 0
  for (const [a, b] of open) {
    if (a - from >= 1.2) lengths.push([from, a])
    from = Math.max(from, b)
  }
  /** The length from `a` to `b` m along the run, as ground. */
  const piece = (a: number, b: number): RowLot => {
    const m = (a + b) / 2
    return { x: run.a.x + run.ux * m, y: run.a.y + run.uy * m, w: b - a, d: thick, ry: run.ry, onRoad: true }
  }
  const free = (l: RowLot) => kit.unclaimed(l.x, l.y, l.w, l.d, l.ry)
  for (const length of lengths) {
    // Cut back the end that meets a claim, and if both do, both.
    while (length[1] - length[0] >= 1.2 && !free(piece(length[0], length[1]))) {
      if (!free(piece(length[0], length[0] + 0.6))) length[0] += 0.2
      if (!free(piece(length[1] - 0.6, length[1]))) length[1] -= 0.2
      else if (free(piece(length[0], length[0] + 0.6))) length[0] += 0.2 // a claim along its middle: shrink until it clears
    }
  }
  const kept = lengths.filter(([a, b]) => b - a >= 1.2)
  for (const [a, b] of kept) {
    const l = piece(a, b)
    kit.stand(l.x, l.y, l.w, l.d, l.ry)
  }
  return kept
}

/** Whether `(x, y)` lies within `room` m of a path's middle line `path`. */
export const nearPath = (path: Vec[], x: number, y: number, room: number) =>
  path.some((a, i) => i > 0 && distance({ x, y }, path[i - 1], a) < room)

/** The middle line of a path from `a` to `b`, straying `strays` m to one side in `waves` arcs, a point every `step` m. */
export function winding(a: Vec, b: Vec, strays: number, waves: number, step: number): Vec[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(2, Math.ceil(len / step))
  const [nx, ny] = [-(b.y - a.y) / len, (b.x - a.x) / len]
  const amp = Math.sign(strays) * Math.min(Math.abs(strays), 0.12 * len)
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n
    const off = amp * Math.sin(Math.PI * u * waves)
    return { x: a.x + (b.x - a.x) * u + nx * off, y: a.y + (b.y - a.y) * u + ny * off }
  })
}

/** The line `off` m to the left of a middle line `pts` (below 0, its right). */
export function aside(pts: Vec[], off: number): Vec[] {
  return pts.map((p, i) => {
    const [q, r] = [pts[Math.max(0, i - 1)], pts[Math.min(pts.length - 1, i + 1)]]
    const len = Math.hypot(r.x - q.x, r.y - q.y) || 1
    return { x: p.x - ((r.y - q.y) / len) * off, y: p.y + ((r.x - q.x) / len) * off }
  })
}

/**
 * Where a path comes in to a Block's ground from each corner of its bounding box, in order round from corner `first`:
 * the first point on the way to the Block's middle that lies on it 2.1 m in from its edge, as a lawn begins; none for a
 * corner with no such point in the first 0.6 of the way.
 */
export function waysIn({ field, block }: Pick<ZoneGround, 'field' | 'block'>, first: number): Vec[] {
  const mid = middle(block)
  const boxCorners = [
    { x: block.x0, y: block.y0 },
    { x: block.x1, y: block.y0 },
    { x: block.x1, y: block.y1 },
    { x: block.x0, y: block.y1 },
  ]
  const out: Vec[] = []
  for (let k = 0; k < 4; k++) {
    const c = boxCorners[(first + k) % 4]
    const [ux, uy] = [mid.x - c.x, mid.y - c.y]
    const len = Math.hypot(ux, uy)
    for (let t = 0; t < len * 0.6; t += 0.5) {
      const q = { x: c.x + (ux / len) * t, y: c.y + (uy / len) * t }
      if (field.sample(q.x, q.y) < 2.1 || !inside(block.loop, q.x, q.y)) continue
      out.push(q)
      break
    }
  }
  return out
}
