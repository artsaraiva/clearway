import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { pointAt, type Bounds, type Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import { SHAPES, spot, type Kit } from './kit'
import { ZEBRA } from './roads'

// The streets round a Tile built to the level of finish (#173, #175; #176 takes them to every Tile). On each Block: a
// darker kerbstone line along its edge, a yellow tactile strip where each zebra meets its kerb, a guard rail round each
// corner, a convex mirror on a pole at some corners, tree pits round the street trees, drain grates along the kerb, and
// planters or bollards to break long runs of pavement. On the road plate: manhole covers and patches of newer tarmac, in
// tones within 6% of the plate's lightness, so that paint and cars read as before. No new paint: paint carries Priority.

// The kerbstone line, m in from the Block's edge (past its bevel) to its inner edge, and its colour; tactile paving, its
// pad along a zebra's end and the guide strip in from it; a guard rail's height, how far it reaches round a corner each
// way, how far in from the edge it stands and how far it keeps from a tactile pad; a convex mirror's pole and its share
// of corners; tree pits; drain grates, one every `every` m of straight kerb; and the longest run of pavement left bare
// before a planter or a pair of bollards breaks it.
const KERBSTONE = { from: 0.26, to: 0.62, colour: '#d6cfc3' }
const TACTILE = { colour: '#f2c744', deep: 0.6, guide: 1.6, wide: 0.3 }
const RAIL = { tall: 0.9, reach: 7.5, in: 0.45, gap: 2.6, colour: '#f4f6f8' }
const MIRROR = { tall: 3.3, r: 0.4, share: 3, pole: '#f0b43c', face: '#d8e6ee' }
const PIT = { grate: '#8c949e', soil: '#8a7560', size: 1.5 }
const GRATE = { every: 9, colour: '#9aa0a8' }
const RUN = { most: 10, in: 0.95 }
const PLANTER = { body: '#d9d3c7', leaves: ['#5fbc51', '#7bcd5d', '#6bc357'] }
const BOLLARD = '#9aa3ad'
// Road plate marks: manhole covers and patches of newer tarmac on the plate `#c3c7ce`, at most 6% of its lightness
// apart, a mark every `every` m of lane on average, kept `ends` m from a lane's ends, clear of zebras and give-way paint.
const PLATE = { manhole: '#b7bcc4', rim: '#ccd0d6', patch: '#bcc0c7', every: 26, ends: 12, y: 0.022 }
const FLAT_DISC = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2)

/** Something that stands on a Block near its edge, as a look lays it: what the street's furniture keeps off. */
export interface Footprint {
  x: number
  y: number
  w: number
  d: number
  ry: number
}

/** A Block's outline, its inward direction at each point, and how far along it each point lies. */
function walk(loop: Vec[]) {
  let twice = 0
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length]
    twice += p.x * q.y - q.x * p.y
  })
  const turn = twice > 0 ? 1 : -1 // counterclockwise, the inside is to the left of the way round
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

/** The kerbstone line along a Block's edge, as one brick: a ribbon on the pavement just in from its bevel. */
function kerbLine(kit: Kit, loop: Vec[], inward: Vec[]) {
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
    kit.add(SHAPES.bush, PLANTER.leaves[(spot(x, y) + k) % 3], x + o * Math.cos(ry), y + o * Math.sin(ry), KERB + 0.72, k, 0.48, 0.42, 0.42)
  }
  kit.shadow(x, y, KERB, len + 0.6, 1.2, false, ry)
  kit.brick('building', x, y, KERB)
}

/** Two bollards across a run of pavement at `(x, y)`, along `ry`, as one brick (#175). */
function bollards(kit: Kit, x: number, y: number, ry: number) {
  for (const o of [-0.7, 0.7]) {
    const [bx, by] = [x + o * Math.cos(ry), y + o * Math.sin(ry)]
    kit.add(SHAPES.thin, BOLLARD, bx, by, KERB, 0, 0.11, 0.82, 0.11)
    kit.add(SHAPES.thin, '#f4f6f8', bx, by, KERB + 0.62, 0, 0.115, 0.08, 0.115)
  }
  kit.brick('building', x, y, KERB)
}

/**
 * The street furniture of Block `block` on a Tile built to the level of finish (#175), each piece a brick: see the
 * module's head. `kept` are what its Zone stood near the edge, and `lamps` and `trees` the lamps at its corners and its
 * street trees, which it all keeps clear of.
 */
export function dressStreet(
  kit: Kit,
  block: Block,
  field: Field,
  net: Network,
  spec: NetworkSpec,
  lamps: Vec[],
  trees: Vec[],
  kept: Footprint[],
) {
  const { loop } = block
  const { inward, along, length } = walk(loop)
  kerbLine(kit, loop, inward)
  const laneWidth = (road: string) => spec.roads[road]?.laneWidth ?? spec.roadDefaults.laneWidth

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
  // and keeps off the lamp; at some, a convex mirror on a pole facing the Junction.
  const corners: Vec[] = []
  const near = (p: Vec, q: Vec, d: number) => Math.hypot(p.x - q.x, p.y - q.y) < d
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
        return round(i) < RAIL.reach && !pads.some((q) => near(p, q, RAIL.gap)) && !lamps.some((q) => near(p, q, 0.6))
      })
    rail.sort((a, b) => ((along[a] - along[apex] + 1.5 * length) % length) - ((along[b] - along[apex] + 1.5 * length) % length))
    for (let k = 0; k < rail.length; k++) {
      const p = at(rail[k], RAIL.in)
      if (k % 2 === 0) kit.add(kit.cuboid(0.07, RAIL.tall, 0.07), RAIL.colour, p.x, p.y, KERB)
      const next = rail[k + 1]
      if (next === undefined || Math.abs(round(next) - round(rail[k])) > 2 || !near(loop[next], loop[rail[k]], 2)) continue
      const q = at(next, RAIL.in)
      const [mx, my, len, ry] = [(p.x + q.x) / 2, (p.y + q.y) / 2, Math.hypot(q.x - p.x, q.y - p.y), Math.atan2(q.y - p.y, q.x - p.x)]
      for (const z of [RAIL.tall - 0.06, 0.42]) kit.add(kit.cuboid(len + 0.04, 0.06, 0.05), RAIL.colour, mx, my, KERB + z, ry)
    }
    if (rail.length) kit.brick('building', loop[apex].x, loop[apex].y, KERB)
    if (spot(loop[apex].x, loop[apex].y) % MIRROR.share === 0) {
      const p = at(apex, 0.95)
      const [dx, dy] = [junction.at.x - p.x, junction.at.y - p.y]
      const ry = Math.atan2(-dx, dy) // its face toward the Junction
      kit.add(kit.cuboid(0.09, MIRROR.tall, 0.09), MIRROR.pole, p.x, p.y, KERB)
      kit.put(SHAPES.disc, MIRROR.pole, p.x, p.y, ry, 0, 0.08, KERB + MIRROR.tall - 0.1, MIRROR.r + 0.06, MIRROR.r + 0.06, 1)
      kit.put(SHAPES.disc, MIRROR.face, p.x, p.y, ry, 0, 0.1, KERB + MIRROR.tall - 0.1, MIRROR.r, MIRROR.r, 1)
      kit.brick('lamp', p.x, p.y, KERB)
    }
  }

  // Tree pits round the street trees.
  for (const t of trees) {
    slab(kit, PIT.grate, t.x, t.y, PIT.size, PIT.size, 0, 0.01)
    slab(kit, PIT.soil, t.x, t.y, PIT.size - 0.5, PIT.size - 0.5, 0, 0.015)
    kit.brick('ground', t.x, t.y, KERB)
  }

  // Along the edge, a point at a time: drain grates on the kerb line of the straight runs, and a planter or a pair of
  // bollards wherever the pavement has run bare for `RUN.most` m.
  const busy = (p: Vec) =>
    kept.some((f) => {
      const [c, s] = [Math.cos(f.ry), Math.sin(f.ry)]
      const [dx, dy] = [p.x - f.x, p.y - f.y]
      return Math.abs(dx * c + dy * s) < f.w / 2 + 0.6 && Math.abs(-dx * s + dy * c) < f.d / 2 + 0.6
    }) ||
    [...lamps, ...trees, ...pads].some((q) => near(p, q, 2.2)) ||
    corners.some((q) => near(p, q, RAIL.reach + 1))
  let [bare, grated, breaks] = [0, 0, 0]
  for (let i = 0; i < loop.length; i++) {
    const step = Math.hypot(loop[(i + 1) % loop.length].x - loop[i].x, loop[(i + 1) % loop.length].y - loop[i].y)
    const j = (i + 1) % loop.length
    const straight = inward[i].x * inward[j].x + inward[i].y * inward[j].y > 0.995
    const p = at(i, RUN.in)
    const ry = Math.atan2(-inward[i].x, inward[i].y) // along the edge
    grated += step
    if (straight && grated > GRATE.every && !corners.some((q) => near(p, q, RAIL.reach)) && !pads.some((q) => near(p, q, 2.6))) {
      const g = at(i, (KERBSTONE.from + KERBSTONE.to) / 2)
      slab(kit, GRATE.colour, g.x, g.y, 0.62, 0.3, ry, 0.012, 0.02)
      kit.brick('ground', g.x, g.y, KERB)
      grated = 0
    }
    bare = busy(p) || field.sample(p.x, p.y) < RUN.in - 0.2 ? 0 : bare + step
    if (bare > RUN.most && straight) {
      if (breaks++ % 2) bollards(kit, p.x, p.y, ry)
      else planter(kit, at(i, RUN.in + 0.2).x, at(i, RUN.in + 0.2).y, ry, 1.8)
      bare = 0
    }
  }
}

/**
 * Manhole covers and patches of newer tarmac on the road plate of the cell `cell` bounds (#175), as one brick: along the
 * middle of each Road lane on it, kept off its ends, where the zebras and give-way paint lie, each drawn from where it
 * lies.
 */
export function markPlate(kit: Kit, cell: Bounds, net: Network) {
  let marked = false
  for (const lane of net.lanes) {
    if (!('road' in lane.owner) || lane.length < 2 * PLATE.ends + 4) continue
    const mid = pointAt(lane.line, lane.length / 2)
    if (mid.x < cell.x0 + 1 || mid.x > cell.x1 - 1 || mid.y < cell.y0 + 1 || mid.y > cell.y1 - 1) continue
    const draw = mulberry32(spot(mid.x, mid.y))
    for (let s = PLATE.ends + draw() * PLATE.every; s < lane.length - PLATE.ends; s += PLATE.every * (0.7 + draw() * 0.6)) {
      const p = pointAt(lane.line, s)
      const side = (draw() - 0.5) * 1.6 // m left of the lane's middle
      const [x, y] = [p.x - Math.sin(p.heading) * side, p.y + Math.cos(p.heading) * side]
      if (draw() < 0.6) {
        kit.add(FLAT_DISC, PLATE.rim, x, y, PLATE.y, 0, 0.5, 1, 0.5)
        kit.add(FLAT_DISC, PLATE.manhole, x, y, PLATE.y + 0.004, 0, 0.42, 1, 0.42)
      } else kit.add(kit.cuboid(2.2 + draw() * 1.8, 0.01, 1.6 + draw() * 1.2), PLATE.patch, x, y, PLATE.y - 0.008, p.heading)
      marked = true
    }
  }
  if (marked) kit.brick('plate', (cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2, 0)
}
