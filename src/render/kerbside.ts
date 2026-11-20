import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { pointAt, type Bounds, type Polyline, type Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { KERB, twiceArea, type Block } from './blocks'
import { inside, type Field } from './field'
import { SHAPES, spot, to, type Kit } from './kit'
import { moverWidth, type MoverKind } from './movers'
import { ZEBRA } from './roads'

// The kerbside of every Tile, dressed (#173; #175 dressed it round a finished Tile, #176 round every Tile, whatever its
// Zone, unzoned too). On each Block: a darker kerbstone line along its edge, a yellow tactile strip where each zebra
// meets its kerb, a guard rail round each corner, a convex mirror on a pole at some corners, tree pits round the street
// trees, drain grates along the kerb, and planters, bollards and benches to break long runs of pavement. On the road
// plate: manhole covers and patches of newer tarmac, in tones within 6% of the plate's lightness, so that paint and cars
// read as before. No new paint: paint carries Priority. What stands up from the pavement (rails, mirrors, planters,
// bollards, benches) is Block-zoom furniture, drawn from Tile zoom inward; what lies flat on it is drawn at every zoom.

// The kerbstone line, m in from the Block's edge (past its bevel) to its inner edge, and its colour; tactile paving, its
// pad along a zebra's end and the guide strip in from it; a guard rail's height, how far it reaches round a corner each
// way, how far in from the edge it stands and how far it keeps from a tactile pad; a convex mirror's pole and its share
// of corners; tree pits; drain grates, one every `every` m of straight kerb; and the longest run of pavement left bare
// before a planter, a pair of bollards or a bench breaks it, on a curve how much further before a pair of bollards does,
// and how far each keeps off the ground a Zone claimed (#218).
const KERBSTONE = { from: 0.26, to: 0.62, colour: '#cbc3b5' }
const TACTILE = { colour: '#f2c744', deep: 0.6, guide: 1.6, wide: 0.3 }
const RAIL = { tall: 0.9, reach: 7.5, in: 0.45, gap: 2.6, colour: '#f4f6f8' }
const MIRROR = { tall: 3.3, r: 0.4, share: 3, pole: '#f0b43c', face: '#d8e6ee' }
const PIT = { grate: '#8c949e', soil: '#8a7560', size: 1.5 }
const GRATE = { every: 9, colour: '#9aa0a8' }
const RUN = { most: 10, in: 0.95, curve: 1, claimed: 1.1 }
const PLANTER = { body: '#d9d3c7', leaves: ['#5fbc51', '#7bcd5d', '#6bc357'] }
// A pair of bollards' colour, and how far each stands from the pair's middle.
const BOLLARD = { colour: '#9aa3ad', apart: 0.7 }
// m a utility pole keeps from the street's furniture, and from a drain grate on the kerb line it stands by (#176).
const POLE_ROOM = { furniture: 1.2, grate: 0.9 }
// Road plate marks: manhole covers and patches of newer tarmac on the plate `#c3c7ce`, at most 6% of its lightness
// apart, a mark every `every` m of lane on average, kept `ends` m from a lane's ends, clear of zebras and give-way paint.
const PLATE = { manhole: '#b7bcc4', rim: '#ccd0d6', patch: '#bcc0c7', every: 26, ends: 12, y: 0.022 }
const FLAT_DISC = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2)
// What stands on a Block near its edge, read from what its Zone built (#176), so that the street's furniture keeps off
// it whatever the Zone: a grid of cells `cell` m across over the band `band` m in from the edge, where a part counts
// once it rises `low` m over the pavement and stands tall once it rises `tall` m; what stands tall is kept `clear` m
// further off. A mover's loop stands as wide as its kind (`./movers`), but for what works a wall or flies. A part that
// rises `tall` m over the pavement, `rise` m from its lowest point to its highest, its lowest within `foot` m of the
// pavement, stands on it, as the scene check's feet do: not a crown, nor a shadow or a pool laid on a raised bed.
const STANDS = { cell: 0.5, band: 4, low: 0.06, tall: 0.4, clear: 0.5, rise: 0.15, foot: 0.7 }
// A run of pavement as the scene check reads it (rule 3, #195; `EMPTY` and `KERBSIDE` in `scripts/visual/scene`): the
// kerb where a lane runs within `road` m of it, bare at a point where nothing stands on the ground within `reach` m
// (its probe's octagon reaches 3.7 to 4 m), nor a bay lies at it. The most of the check's points a run may hold before a
// pair of bollards breaks it (it fails at 12), and how far the pair keeps from a rail's posts.
const BARE = { road: 6, reach: 3.6, most: 11, rail: 1.5 }
// The claims the scene check reads as no pavement, a lay-by off the Road (#193).
const BAYS = ['bay', 'taxi'] as const

/** A box `w` by `d` centred on `(x, y)` and turned `ry`, as a look lays something on a Block. */
export interface Footprint {
  x: number
  y: number
  w: number
  d: number
  ry: number
}

/** What a Block's fill built (the kit's `since`): its parts' geometries in place (Three coordinates), and its movers' loops. */
export interface Built {
  geometries: THREE.BufferGeometry[]
  loops: { kind: MoverKind; loop: Polyline }[]
}

/** What stands on a Block near its edge (`standing`). */
export interface Stands {
  /** Whether anything stands within `r` m of `(x, y)`, or anything tall within `r` m and a little more. */
  (x: number, y: number, r: number, tall?: boolean): boolean
  /**
   * Whether a part that stands on the pavement and rises from it lies within `r` m of `(x, y)`, as the scene check reads
   * what breaks a run of pavement (#195): a trunk and not its crown, a mover's way not at all.
   */
  feet(x: number, y: number, r: number): boolean
}

/**
 * What stands on Block `block` near its edge, as `built` has it (#176): the edges of each triangle of its parts that
 * rises above the pavement and comes near the edge, laid on a grid of small cells point by point, and each mover's loop
 * as wide as its kind. Low ground (a lawn, soil, a bed) counts where it lies; what stands tall counts a little further
 * off.
 */
export function standing(block: Block, field: Field, built: Built): Stands {
  const { cell, band } = STANDS
  const [x0, y0] = [block.x0 - 1, block.y0 - 1]
  const [nx, ny] = [Math.ceil((block.x1 - block.x0 + 2) / cell) + 1, Math.ceil((block.y1 - block.y0 + 2) / cell) + 1]
  const grid = new Uint8Array(nx * ny) // 0 nothing, 1 low ground, 2 something tall
  const feet = new Uint8Array(nx * ny) // whether a part standing on the pavement comes there
  const near = new Uint8Array(nx * ny) // whether a cell lies within the band
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) near[j * nx + i] = field.sample(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell) < band ? 1 : 0
  const at = (x: number, y: number) => {
    const [i, j] = [Math.floor((x - x0) / cell), Math.floor((y - y0) / cell)]
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i
  }
  const mark = (x: number, y: number, v: number, foot = false) => {
    const k = at(x, y)
    if (k >= 0 && grid[k] < v) grid[k] = v
    if (k >= 0 && foot) feet[k] = 1
  }
  /** Whether any cell over the box `x0`–`x1` by `y0`–`y1` lies within the band. */
  const reaches = (bx0: number, by0: number, bx1: number, by1: number) => {
    const [i0, i1] = [Math.max(0, Math.floor((bx0 - x0) / cell)), Math.min(nx - 1, Math.floor((bx1 - x0) / cell))]
    const [j0, j1] = [Math.max(0, Math.floor((by0 - y0) / cell)), Math.min(ny - 1, Math.floor((by1 - y0) / cell))]
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (near[j * nx + i]) return true
    return false
  }
  const step = cell * 0.9 // points no more than a cell apart
  /**
   * Mark a triangle's edge from `(ax, ay)` to `(bx, by)` point by point. Its edges are enough: the street's furniture
   * stands within a metre or so of the Block's edge, so anything under it has an edge nearer still.
   * ponytail: furniture stood deeper than about 1.5 m in could stand inside a part whose edges all lie beyond its
   * reach. Fill each triangle's cells within the band, as well as its edges, if street furniture ever stands deeper.
   */
  const edge = (ax: number, ay: number, bx: number, by: number, v: number, foot: boolean) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step)
    for (let i = 0; i <= n; i++) mark(ax + ((bx - ax) * i) / (n || 1), ay + ((by - ay) * i) / (n || 1), v, foot)
  }
  for (const g of built.geometries) {
    const a = g.attributes.position.array
    const index = g.index?.array
    // A part is a single shape: one that rises nowhere over the pavement, or lies wholly away from the edge, is skipped.
    let [lx, ly, hx, hy, top, bottom] = [Infinity, Infinity, -Infinity, -Infinity, -Infinity, Infinity]
    for (let i = 0; i < a.length; i += 3) {
      lx = Math.min(lx, a[i])
      hx = Math.max(hx, a[i])
      top = Math.max(top, a[i + 1])
      bottom = Math.min(bottom, a[i + 1])
      ly = Math.min(ly, -a[i + 2])
      hy = Math.max(hy, -a[i + 2])
    }
    if (top < KERB + STANDS.low || !reaches(lx, ly, hx, hy)) continue
    const foot = top - bottom >= STANDS.rise && top >= KERB + STANDS.tall && bottom < KERB + STANDS.foot
    const n = index ? index.length : a.length / 3
    for (let t = 0; t + 2 < n; t += 3) {
      const [ia, ib, ic] = index ? [3 * index[t], 3 * index[t + 1], 3 * index[t + 2]] : [3 * t, 3 * t + 3, 3 * t + 6]
      const high = Math.max(a[ia + 1], a[ib + 1], a[ic + 1])
      if (high < KERB + STANDS.low) continue
      const [ax, ay, bx, by, cx, cy] = [a[ia], -a[ia + 2], a[ib], -a[ib + 2], a[ic], -a[ic + 2]]
      if (!reaches(Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.max(ax, bx, cx), Math.max(ay, by, cy))) continue
      const v = high < KERB + STANDS.tall ? 1 : 2
      edge(ax, ay, bx, by, v, foot)
      edge(bx, by, cx, cy, v, foot)
      edge(cx, cy, ax, ay, v, foot)
    }
  }
  for (const { kind, loop } of built.loops) {
    const r = moverWidth(kind) / 2
    if (!r) continue
    for (let seg = 1; seg < loop.pts.length; seg++) {
      const [a, b] = [loop.pts[seg - 1], loop.pts[seg]]
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
      for (let i = 0; i <= n; i++) {
        const [qx, qy] = [a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n]
        const k = at(qx, qy)
        if (k < 0 || !near[k]) continue
        for (let dx = -r; dx <= r; dx += step)
          for (let dy = -r; dy <= r; dy += step) if (dx * dx + dy * dy <= r * r) mark(qx + dx, qy + dy, 2)
      }
    }
  }
  /** Whether a cell within `reach` m of `(x, y)` passes `test(k, d)`, `k` its index and `d` m to its middle. */
  const someCell = (x: number, y: number, reach: number, test: (k: number, d: number) => boolean) => {
    const [i0, i1] = [Math.floor((x - reach - x0) / cell), Math.floor((x + reach - x0) / cell)]
    const [j0, j1] = [Math.floor((y - reach - y0) / cell), Math.floor((y + reach - y0) / cell)]
    for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++)
        if (test(j * nx + i, Math.hypot(x0 + (i + 0.5) * cell - x, y0 + (j + 0.5) * cell - y))) return true
    }
    return false
  }
  const corner = cell * 0.71 // from a cell's middle to its corners
  const stands = (x: number, y: number, r: number, tall = false) =>
    someCell(x, y, r + STANDS.clear, (k, d) => {
      const v = grid[k]
      return !!v && (!tall || v >= 2) && d - cell * 0.7 <= (v === 2 ? r + STANDS.clear : r) // its nearest point within
    })
  // A foot counts only where its whole cell lies within `r`, so that what the check would not see is never seen.
  return Object.assign(stands, { feet: (x: number, y: number, r: number) => someCell(x, y, r, (k, d) => !!feet[k] && d + corner <= r) })
}

/** A Block's outline, its inward direction at each point, and how far along it each point lies. */
function walk(loop: Vec[]) {
  const turn = twiceArea(loop) > 0 ? 1 : -1 // counterclockwise, the inside is to the left of the way round
  const n = loop.length
  const inward = loop.map((_, i) => {
    const [a, b] = [loop[(i + n - 1) % n], loop[(i + 1) % n]]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const len = Math.hypot(dx, dy) || 1
    return { x: (-dy / len) * turn, y: (dx / len) * turn }
  })
  const along = [0]
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y))
  return { inward, along, length: along[n - 1] + Math.hypot(loop[0].x - loop[n - 1].x, loop[0].y - loop[n - 1].y) }
}

/**
 * The kerbstone line along Block `block`'s edge, as one brick: a ribbon on the pavement just in from its bevel. Every
 * Block has one (#176), a roundabout's island and a narrow Block's bike lane too.
 */
export function kerbLine(kit: Kit, { loop }: Block) {
  const { inward } = walk(loop)
  const pos: number[] = []
  const y = KERB + 0.008
  const point = (i: number, o: number) => [loop[i].x + inward[i].x * o, y, -(loop[i].y + inward[i].y * o)]
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length
    const [a, b, c, d] = [point(i, KERBSTONE.from), point(j, KERBSTONE.from), point(j, KERBSTONE.to), point(i, KERBSTONE.to)]
    // Both windings, so that it faces up whichever way the outline runs.
    pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  const normal = g.attributes.normal
  for (let i = 0; i < normal.count; i++) if (normal.getY(i) < 0) normal.setXYZ(i, 0, 1, 0) // the underside faces up too: it lies flat
  kit.push(g, KERBSTONE.colour)
  kit.brick('ground', loop[0].x, loop[0].y, KERB)
}

/** A flat slab `w` by `d` lying on the pavement at `(x, y)` turned `ry` (0 along x), `lift` m up. */
const slab = (kit: Kit, look: string, x: number, y: number, w: number, d: number, ry: number, lift: number, tall = 0.025) =>
  kit.add(kit.cuboid(w, tall, d), look, x, y, KERB + lift, ry)

/** A planter `len` m long at `(x, y)`, along `ry` (0 along x), as one brick (#175): a concrete trough of shrubs. */
export function planter(kit: Kit, x: number, y: number, ry: number, len: number) {
  kit.add(kit.cuboid(len, 0.55, 0.62), PLANTER.body, x, y, KERB, ry)
  const n = Math.max(2, Math.round(len / 0.9))
  for (let k = 0; k < n; k++) {
    const o = -len / 2 + ((k + 0.5) * len) / n
    kit.add(SHAPES.bush, PLANTER.leaves[(spot(x, y) + k) % 3], ...to(x, y, ry, o, 0), KERB + 0.72, k, 0.48, 0.42, 0.42)
  }
  kit.shadow(x, y, KERB, len + 0.6, 1.2, false, ry)
  kit.brick('building', x, y, KERB)
}

/** Where each of a pair of bollards across a run of pavement at `(x, y)`, along `ry`, stands. */
const pairAt = (x: number, y: number, ry: number): Vec[] =>
  [-BOLLARD.apart, BOLLARD.apart].map((o) => {
    const [bx, by] = to(x, y, ry, o, 0)
    return { x: bx, y: by }
  })

/** Two bollards across a run of pavement at `(x, y)`, along `ry`, as one brick (#175). */
function bollards(kit: Kit, x: number, y: number, ry: number) {
  for (const b of pairAt(x, y, ry)) {
    kit.add(SHAPES.thin, BOLLARD.colour, b.x, b.y, KERB, 0, 0.11, 0.82, 0.11)
    kit.add(SHAPES.thin, '#f4f6f8', b.x, b.y, KERB + 0.62, 0, 0.115, 0.08, 0.115)
  }
  kit.brick('building', x, y, KERB)
}

/** What a Block's street furniture keeps off besides what its Zone built: what stands at its corners and along its kerb. */
export interface Kerbside {
  /** The lamps at its corners. */
  lamps: Vec[]
  /** Its street trees. */
  trees: Vec[]
  /** The utility poles along its Roads, street lights among them (`./poles`). */
  poles: Vec[]
  /** What its Zone built (`standing`). */
  stands: Stands
}

/**
 * The street furniture round Block `block` (#175, on every Tile since #176), each piece a brick: see the module's head.
 * It keeps clear of what `kerbside` says stands there, and of the ground its Zone claimed (`kit.unclaimed`, #218). The
 * kerbstone line is `kerbLine`'s.
 */
export function dressKerbside(kit: Kit, block: Block, field: Field, net: Network, spec: NetworkSpec, kerbside: Kerbside) {
  const { lamps, trees, poles, stands } = kerbside
  const { loop } = block
  const { inward, along, length } = walk(loop)
  const laneWidth = (road: string) => spec.roads[road]?.laneWidth ?? spec.roadDefaults.laneWidth
  const near = (p: Vec, q: Vec, d: number) => Math.hypot(p.x - q.x, p.y - q.y) < d
  const byPole = (p: Vec, d: number) => poles.some((q) => near(p, q, d))

  // Tactile pads where each zebra meets this Block's kerb, with a guide strip in from each.
  const pads: Vec[] = []
  for (const junction of net.junctions) {
    for (const arm of junction.arms) {
      const first = arm.approach[0]
      if (!first) continue
      const end = pointAt(first.line, first.length)
      const [fx, fy, lx, ly] = [Math.cos(end.heading), Math.sin(end.heading), -Math.sin(end.heading), Math.cos(end.heading)]
      const w = laneWidth(arm.road)
      const across = (arm.approach.length + arm.exit.length) * w
      const mid = ZEBRA.setback + ZEBRA.length / 2
      for (const [o, out] of [
        [-w / 2, -1],
        [across - w / 2, 1],
      ]) {
        const [ex, ey] = [end.x + lx * o + fx * mid, end.y + ly * o + fy * mid] // the zebra's end on the kerb
        const [ox, oy] = [lx * out, ly * out] // out of the road, onto the pavement
        const pad = { x: ex + ox * (KERBSTONE.to + TACTILE.deep / 2 + 0.05), y: ey + oy * (KERBSTONE.to + TACTILE.deep / 2 + 0.05) }
        if (!inside(loop, pad.x, pad.y) || field.sample(pad.x, pad.y) < KERBSTONE.to) continue
        const ry = Math.atan2(fy, fx)
        slab(kit, TACTILE.colour, pad.x, pad.y, ZEBRA.length, TACTILE.deep, ry, 0.012, 0.03)
        const reach = TACTILE.deep / 2 + TACTILE.guide / 2
        const [gx, gy] = [pad.x + ox * reach, pad.y + oy * reach]
        if (field.sample(gx, gy) > 0.5) slab(kit, TACTILE.colour, gx, gy, TACTILE.wide, TACTILE.guide, ry, 0.012, 0.03)
        kit.brick('ground', pad.x, pad.y, KERB)
        pads.push(pad)
      }
    }
  }

  // Each corner's apex, the point of the edge nearest a Junction, and round it a guard rail that opens at the crossings
  // and keeps off the lamp, the poles and what stands there; at some, a convex mirror on a pole facing the Junction.
  const corners: Vec[] = []
  const railPosts: Vec[] = []
  const placed: Vec[] = [] // where the rest of the furniture stands: mirrors, planters, each bollard, benches
  const at = (i: number, o: number): Vec => ({ x: loop[i].x + inward[i].x * o, y: loop[i].y + inward[i].y * o })
  for (const junction of net.junctions) {
    let [apex, best] = [-1, 30]
    loop.forEach((p, i) => {
      const d = Math.hypot(p.x - junction.at.x, p.y - junction.at.y)
      if (d < best) [apex, best] = [i, d]
    })
    if (apex < 0) continue
    corners.push(loop[apex])
    const round = (i: number) => {
      const d = Math.abs(along[i] - along[apex])
      return Math.min(d, length - d)
    }
    const rail = loop
      .map((_, i) => i)
      .filter((i) => {
        const p = at(i, RAIL.in)
        return (
          round(i) < RAIL.reach &&
          !pads.some((q) => near(p, q, RAIL.gap)) &&
          !lamps.some((q) => near(p, q, 0.6)) &&
          !byPole(p, 0.5) &&
          !stands(p.x, p.y, 0.1)
        )
      })
    rail.sort((a, b) => ((along[a] - along[apex] + 1.5 * length) % length) - ((along[b] - along[apex] + 1.5 * length) % length))
    kit.furniture(() => {
      for (let k = 0; k < rail.length; k++) {
        const p = at(rail[k], RAIL.in)
        if (k % 2 === 0) {
          kit.add(kit.cuboid(0.07, RAIL.tall, 0.07), RAIL.colour, p.x, p.y, KERB)
          railPosts.push(p)
        }
        const next = rail[k + 1]
        if (next === undefined || Math.abs(round(next) - round(rail[k])) > 2 || !near(loop[next], loop[rail[k]], 2)) continue
        const q = at(next, RAIL.in)
        const [mx, my, len, ry] = [(p.x + q.x) / 2, (p.y + q.y) / 2, Math.hypot(q.x - p.x, q.y - p.y), Math.atan2(q.y - p.y, q.x - p.x)]
        for (const z of [RAIL.tall - 0.06, 0.42]) kit.add(kit.cuboid(len + 0.04, 0.06, 0.05), RAIL.colour, mx, my, KERB + z, ry)
      }
      if (rail.length) kit.brick('building', loop[apex].x, loop[apex].y, KERB)
      const p = at(apex, 0.95)
      const crowded = byPole(p, POLE_ROOM.furniture) || lamps.some((q) => near(p, q, POLE_ROOM.furniture)) || stands(p.x, p.y, 0.3)
      if (spot(loop[apex].x, loop[apex].y) % MIRROR.share !== 0 || crowded) return
      const [dx, dy] = [junction.at.x - p.x, junction.at.y - p.y]
      const ry = Math.atan2(-dx, dy) // its face toward the Junction
      placed.push(p)
      kit.add(kit.cuboid(0.09, MIRROR.tall, 0.09), MIRROR.pole, p.x, p.y, KERB)
      kit.put(SHAPES.disc, MIRROR.pole, p.x, p.y, ry, 0, 0.08, KERB + MIRROR.tall - 0.1, MIRROR.r + 0.06, MIRROR.r + 0.06, 1)
      kit.put(SHAPES.disc, MIRROR.face, p.x, p.y, ry, 0, 0.1, KERB + MIRROR.tall - 0.1, MIRROR.r, MIRROR.r, 1)
      kit.brick('building', p.x, p.y, KERB) // as the rails' and the rest of the furniture's, so it arrives with them
    })
  }

  // Tree pits round the street trees.
  for (const t of trees) {
    slab(kit, PIT.grate, t.x, t.y, PIT.size, PIT.size, 0, 0.01)
    slab(kit, PIT.soil, t.x, t.y, PIT.size - 0.5, PIT.size - 0.5, 0, 0.015)
    kit.brick('ground', t.x, t.y, KERB)
  }

  // Along the edge, a point at a time: drain grates on the kerb line of the straight runs, and a planter or a pair of
  // bollards wherever the pavement has run bare for `RUN.most` m. The ground a Zone claimed (#198) is kept clear by a
  // planter's half length and a little, so that one laid beside it stops short of it (#193, #218).
  const lampsAndTrees = [...lamps, ...trees]
  const alongEdge = (i: number) => Math.atan2(-inward[i].x, inward[i].y)
  const busy = (p: Vec) =>
    stands(p.x, p.y, 0.7, true) ||
    !kit.unclaimed(p.x, p.y, 0, 0, 0, RUN.claimed) ||
    lampsAndTrees.some((q) => near(p, q, 2.2)) ||
    byPole(p, POLE_ROOM.furniture) ||
    corners.some((q) => near(p, q, RAIL.reach + 1))
  // A crossing's tactile pads lie flat: the pavement by them runs on bare, but nothing stands on them; and what a Zone
  // lays low by the edge, paving or a bed, leaves it bare too, but takes only a pair of bollards (#193).
  const onPad = (p: Vec) => pads.some((q) => near(p, q, 2.2))
  const low = (p: Vec) => stands(p.x, p.y, 0.7)
  let [bare, grated, breaks] = [0, 0, 0]
  for (let i = 0; i < loop.length; i++) {
    const step = Math.hypot(loop[(i + 1) % loop.length].x - loop[i].x, loop[(i + 1) % loop.length].y - loop[i].y)
    const j = (i + 1) % loop.length
    const straight = inward[i].x * inward[j].x + inward[i].y * inward[j].y > 0.995
    const p = at(i, RUN.in)
    const ry = alongEdge(i)
    grated += step
    const g = at(i, (KERBSTONE.from + KERBSTONE.to) / 2)
    if (
      straight &&
      grated > GRATE.every &&
      !corners.some((q) => near(p, q, RAIL.reach)) &&
      !pads.some((q) => near(p, q, 2.6)) &&
      !byPole(g, POLE_ROOM.grate)
    ) {
      slab(kit, GRATE.colour, g.x, g.y, 0.62, 0.3, ry, 0.012, 0.02)
      kit.brick('ground', g.x, g.y, KERB)
      grated = 0
    }
    bare = busy(p) || field.sample(p.x, p.y) < RUN.in - 0.2 ? 0 : bare + step
    if (bare >= RUN.most && straight && !onPad(p) && !low(p)) {
      const q = at(i, RUN.in + 0.2)
      const kind = breaks++ % 3
      placed.push(...(kind === 1 ? pairAt(p.x, p.y, ry) : [q]))
      kit.furniture(() => {
        if (kind === 0) planter(kit, q.x, q.y, ry, 1.8)
        else if (kind === 1) bollards(kit, p.x, p.y, ry)
        else kit.bench(q.x, q.y, KERB, ry + Math.PI) // facing the road
      })
      bare = 0
    } else if (bare >= RUN.most + RUN.curve && !onPad(p)) {
      // Where the edge curves, as where a roundabout's arm flares into its ring, or a Zone's paving reaches it, a pair
      // of bollards, which neither crowds, once it has run bare a little further (#193).
      placed.push(...pairAt(p.x, p.y, ry))
      kit.furniture(() => bollards(kit, p.x, p.y, ry))
      bare = 0
    }
  }

  // Last, the pavement the walk still leaves bare as the scene check reads it (rule 3, #195): the walk keeps off more
  // than stands, the ground a Zone claimed for a later Stage, a crossing's pads, the way a mover drives, the corners
  // past their rails, so a run between two such can come out longer than the check allows with no point of it bare for
  // `RUN.most`. The kerb is read as the check reads it (`BARE`), at its points, as many on each piece of the edge as the
  // piece is metres long and one at least, broken by a bay at the kerb, the Zone's parts that stand on the ground, the
  // lamps, trees and poles, the rails' posts and the rest of the furniture. A run of more than `BARE.most` such points, the pieces at its
  // ends counted whole, takes a pair of bollards at its free point nearest its middle, at the walk's depth or else by
  // the kerb, until none does.
  // ponytail: a run with no free point is left bare, for the scene check to find; and `BARE` and the feet of `STANDS`
  // copy the check's numbers (`EMPTY`, `KERBSIDE`, `FOOT`, `FLAT`, `STEP`), so a change to those wants one here.
  const n = loop.length
  const steps = loop.map((p, i) => Math.hypot(loop[(i + 1) % n].x - p.x, loop[(i + 1) % n].y - p.y))
  const lanes: [Vec, Vec][] = []
  for (const { line } of net.lanes)
    for (let k = 0; k + 1 < line.pts.length; k++) {
      const [a, b] = [line.pts[k], line.pts[k + 1]]
      const r = BARE.road
      if (
        Math.min(a.x, b.x) < block.x1 + r &&
        Math.max(a.x, b.x) > block.x0 - r &&
        Math.min(a.y, b.y) < block.y1 + r &&
        Math.max(a.y, b.y) > block.y0 - r
      )
        lanes.push([a, b])
    }
  const toLane = (p: Vec, [a, b]: [Vec, Vec]) => {
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y)
  }
  const kerb = loop.map((q) => lanes.some((l) => toLane(q, l) < BARE.road)) // where the edge faces a Road
  const fixtures = [...lampsAndTrees, ...poles, ...railPosts]
  const broken = (i: number) => {
    const q = loop[i]
    return (
      !kerb[i] ||
      !kit.unclaimed(q.x, q.y, 1.9, 1.9, alongEdge(i), 0, BAYS) ||
      stands.feet(q.x, q.y, BARE.reach) ||
      [fixtures, placed].some((l) => l.some((s) => near(q, s, BARE.reach)))
    )
  }
  const free = (i: number): Vec | null => {
    for (const o of [RUN.in, RAIL.in]) {
      const p = at(i, o)
      if (
        field.sample(p.x, p.y) >= o - 0.2 &&
        kit.unclaimed(p.x, p.y, 0, 0, 0, RUN.claimed) &&
        !lampsAndTrees.some((q) => near(p, q, POLE_ROOM.furniture)) &&
        !byPole(p, POLE_ROOM.furniture) &&
        !railPosts.some((q) => near(p, q, BARE.rail)) &&
        pairAt(p.x, p.y, alongEdge(i)).every((b) => !onPad(b) && !stands(b.x, b.y, 0.1, true))
      )
        return p
    }
    return null
  }
  /** The runs of points none of which is broken, in order round the loop, one that passes its start whole. */
  const bareRuns = (stops: boolean[]) => {
    const first = stops.indexOf(true) // -1 if none: then the whole loop is one run
    const runs: number[][] = [[]]
    for (let k = 1; k <= n; k++) {
      const i = (first + k) % n
      if (stops[i]) runs.push([])
      else runs[runs.length - 1].push(i)
    }
    return runs.filter((r) => r.length)
  }
  /** The check's points on the pieces of the edge from each of run `r`'s points, and on the piece before it. */
  const points = (r: number[]) =>
    [...r, ...(r.length < n ? [(r[0] + n - 1) % n] : [])].reduce((sum, i) => sum + Math.max(1, Math.round(steps[i])), 0)
  const into = (r: number[], i: number) => (along[i] - along[r[0]] + length) % length // m along run `r` to its point `i`
  for (let stops = loop.map((_, i) => broken(i)), more = true; more;) {
    more = false
    for (const run of bareRuns(stops)) {
      if (points(run) <= BARE.most) continue
      const span = into(run, run[run.length - 1])
      const best = run
        .map((i) => ({ i, p: free(i), off: Math.abs(into(run, i) - span / 2) }))
        .filter((s) => s.p)
        .sort((a, b) => a.off - b.off)[0]
      if (!best) continue
      const [p, ry] = [best.p!, alongEdge(best.i)]
      placed.push(...pairAt(p.x, p.y, ry))
      kit.furniture(() => bollards(kit, p.x, p.y, ry))
      stops = loop.map((_, i) => broken(i))
      more = true
      break
    }
  }
}

/**
 * Manhole covers and patches of newer tarmac on the road plate of the cell `cell` bounds (#175), as one brick: along the
 * middle of each Road lane, kept off its ends, where the zebras and give-way paint lie, each drawn from where its lane
 * lies. Only the marks lying wholly on the cell are laid, so that the two Tiles a Road runs between mark their halves of
 * it alike, and none spills onto the next Tile, whatever its Zone.
 */
export function markPlate(kit: Kit, cell: Bounds, net: Network) {
  let marked = false
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.length < 2 * PLATE.ends + 4) continue
    const [a, b] = [pointAt(lane.line, 0), pointAt(lane.line, lane.length)]
    if (Math.max(a.x, b.x) < cell.x0 || Math.min(a.x, b.x) > cell.x1 || Math.max(a.y, b.y) < cell.y0 || Math.min(a.y, b.y) > cell.y1)
      continue
    const mid = pointAt(lane.line, lane.length / 2)
    const draw = mulberry32(spot(mid.x, mid.y))
    for (let s = PLATE.ends + draw() * PLATE.every; s < lane.length - PLATE.ends; s += PLATE.every * (0.7 + draw() * 0.6)) {
      const p = pointAt(lane.line, s)
      const side = (draw() - 0.5) * 1.6 // m left of the lane's middle
      const [x, y] = [p.x - Math.sin(p.heading) * side, p.y + Math.cos(p.heading) * side]
      // Every mark draws alike on both Tiles, so that the next is the same on each, whichever of them lays it.
      const manhole = draw() < 0.6
      const [w, d] = manhole ? [1, 1] : [2.2 + draw() * 1.8, 1.6 + draw() * 1.2]
      const [c, n] = [Math.abs(Math.cos(p.heading)), Math.abs(Math.sin(p.heading))]
      const [reachX, reachY] = [(c * w + n * d) / 2, (n * w + c * d) / 2] // how far it reaches either way along x and y
      if (x - reachX < cell.x0 || x + reachX > cell.x1 || y - reachY < cell.y0 || y + reachY > cell.y1) continue
      if (manhole) {
        kit.add(FLAT_DISC, PLATE.rim, x, y, PLATE.y, 0, 0.5, 1, 0.5)
        kit.add(FLAT_DISC, PLATE.manhole, x, y, PLATE.y + 0.004, 0, 0.42, 1, 0.42)
      } else kit.add(kit.cuboid(w, 0.01, d), PLATE.patch, x, y, PLATE.y - 0.008, p.heading)
      marked = true
    }
  }
  if (marked) kit.brick('plate', (cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2, 0)
}
