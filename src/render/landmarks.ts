import * as THREE from 'three'
import { middle, type Bounds, type Vec } from '../sim/geometry'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { Kit } from './kit'
import { raised } from './shapes'

// The park's deck was shrine vermilion, which is nearly the Jam red-orange: it is wood.
const [GRASS, STONE, CREAM, CORAL, DECK, PLAZA, TEAL] = ['#b0df88', '#ddd6c9', '#fbf6ef', '#f08a6e', '#bb5d0d', '#ece3d1', '#57c6b5']
const TAU = Math.PI * 2

/** The outlines `inset` m inside a Block's edge, laid on it as a thin layer of another colour. Not closed into a brick. */
function overlay(kit: Kit, field: Field, block: Block, inset: number, thickness: number, color: string) {
  for (const loop of field.outlines(inset, [block])) {
    if (inside(block.loop, loop[0].x, loop[0].y)) kit.push(raised(loop, thickness, thickness * 0.4).translate(0, KERB, 0), color)
  }
}

function area(loop: Vec[]): number {
  let twice = 0
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length]
    twice += p.x * q.y - q.x * p.y
  })
  return Math.abs(twice) / 2
}

/** Whether a box `w` (east–west) by `d` centred on `(x, y)` stays at least `room` m clear of every point of `points`. */
const clearOf = (points: Vec[], x: number, y: number, w: number, d: number, room: number) =>
  !points.some((p) => Math.abs(p.x - x) < w / 2 + room && Math.abs(p.y - y) < d / 2 + room)

/**
 * The point nearest `near` (the middle of the Block's bounding box unless given) where a box `w` (east–west) by `d`
 * stands wholly on the Block, on a 2 m grid, at least `room` m clear of each point of `avoid`; null where no such
 * point exists.
 */
export function site(field: Field, block: Block, w: number, d: number, near = middle(block), avoid: Vec[] = [], room = 0): Vec | null {
  const on = (x: number, y: number) => field.sample(x, y) >= 1 && inside(block.loop, x, y)
  // Five by five points over the box: closer than a Road is wide, so no Road crosses the box between them.
  const fits = (x: number, y: number) =>
    [-2, -1, 0, 1, 2].every((i) => [-2, -1, 0, 1, 2].every((j) => on(x + (i * w) / 4, y + (j * d) / 4))) && clearOf(avoid, x, y, w, d, room)
  let [best, nearest]: [Vec | null, number] = [null, Infinity]
  for (let x = block.x0 + w / 2; x <= block.x1 - w / 2; x += 2) {
    for (let y = block.y0 + d / 2; y <= block.y1 - d / 2; y += 2) {
      const far = Math.hypot(x - near.x, y - near.y)
      if (far < nearest && fits(x, y)) [best, nearest] = [{ x, y }, far]
    }
  }
  return best
}

/** A fountain at `(x, y)`, as one brick: a stone basin of water with a column at its middle. */
function fountain(kit: Kit, x: number, y: number) {
  kit.drum(STONE, x, y, KERB, 4.8, 4.8, 1.12)
  kit.drum(kit.water, x, y, KERB + 0.2, 4.08, 4.08, 1)
  kit.drum(STONE, x, y, KERB, 0.72, 0.72, 3)
  kit.brick('building', x, y, KERB)
}

/** The ground a tower landmark at `(x, y)` keeps free of seeded lots: its podium, fountain and trees. */
export const towerGround = (x: number, y: number): Bounds => ({ x0: x - 18, y0: y - 20, x1: x + 20, y1: y + 28 })

/**
 * The tower landmark on Block `block`, as one brick: stacked cylinders in coral and cream with two glazed decks and a
 * beacon, on a podium. A fountain stands north of it and sakura around it, wherever the Block's pavement reaches.
 */
export function tower(kit: Kit, field: Field, block: Block, x: number, y: number) {
  const base = KERB + 1.4
  kit.add(kit.box(20, 1.4, 20, 2.4, 0.32), '#e2d8c6', x, y, KERB)
  // Each segment: from and to (m above the podium), radius at its foot and at its top.
  const SEGMENTS = [
    [0, 12, 6.4, 4.6],
    [12, 24, 4.6, 3.4],
    [24, 36, 3.4, 2.5],
    [39.6, 51.2, 2.2, 1.28],
    [53.2, 57.2, 1.2, 0.88],
  ]
  SEGMENTS.forEach(([from, to, foot, top], i) =>
    kit.push(
      new THREE.CylinderGeometry(top, foot, to - from, 16).toNonIndexed().translate(x, base + (from + to) / 2, -y),
      i % 2 ? CREAM : CORAL,
    ),
  )
  kit.drum(CREAM, x, y, base + 36, 5.4, 5.4, 3.6)
  kit.drum(kit.glass, x, y, base + 36.6, 5.52, 5.52, 2)
  kit.drum(CORAL, x, y, base + 51.2, 2.88, 2.88, 2)
  kit.drum(kit.glass, x, y, base + 51.52, 2.96, 2.96, 1.2)
  kit.drum(CREAM, x, y, base + 57.2, 0.28, 0.28, 12.8)
  kit.ball(kit.bulb, x, y, base + 70, 0.52)
  kit.shadow(x, y, base, 20, 20, true)
  kit.brick('building', x, y, KERB, 3)

  const on = (px: number, py: number, clear: number) => field.sample(px, py) >= clear && inside(block.loop, px, py)
  if (on(x, y + 20.8, 6)) fountain(kit, x, y + 20.8)
  for (const dx of [-14.4, 16.4]) {
    for (const dy of [24.4, 4, -16.4]) if (on(x + dx, y + dy, 1.5)) kit.tree(x + dx, y + dy, KERB, 0.8, 'sakura')
  }
}

/**
 * A plaza Block: paved in a warmer stone, and open, or with a fountain at `centre` and four trees around it where they
 * stand clear of the street trees `street`.
 */
export function plaza(kit: Kit, field: Field, block: Block, centre?: Vec, street: Vec[] = []) {
  overlay(kit, field, block, 0.4, 0.08, PLAZA)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  if (!centre) return
  fountain(kit, centre.x, centre.y)
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const [x, y] = [centre.x + dx * 8.4, centre.y + dy * 8.4]
    if (field.sample(x, y) >= 2 && inside(block.loop, x, y) && clearOf(street, x, y, 0, 0, 3)) kit.tree(x, y, KERB + 0.08, 0.7, 'round')
  }
}

const BIKE = { rim: 1.6, dash: 2.4, gap: 2.4, line: 0.3 } // m: pavement left each side of the lane, and its centre line

/**
 * A Block too narrow for lots, such as the strip a seam leaves beside a Road: a bike lane along it, in teal with a
 * dashed centre line, between two rims of pavement.
 */
export function bikeLane(kit: Kit, field: Field, block: Block) {
  overlay(kit, field, block, BIKE.rim, 0.08, TEAL)
  const mid = middle(block)
  const upright = block.y1 - block.y0 > block.x1 - block.x0
  const [from, to] = upright ? [block.y0, block.y1] : [block.x0, block.x1]
  for (let t = from + BIKE.rim + BIKE.gap; t + BIKE.dash < to - BIKE.rim - BIKE.gap; t += BIKE.dash + BIKE.gap) {
    const [x, y] = upright ? [mid.x, t + BIKE.dash / 2] : [t + BIKE.dash / 2, mid.y]
    if (field.sample(x, y) < BIKE.rim + BIKE.line) continue
    kit.add(
      upright ? kit.box(BIKE.line, 0.04, BIKE.dash, 0.02, 0.01) : kit.box(BIKE.dash, 0.04, BIKE.line, 0.02, 0.01),
      CREAM,
      x,
      y,
      KERB + 0.08,
    )
  }
  kit.brick('ground', mid.x, mid.y, KERB)
}

/**
 * A park Block: a lawn, a pond with a little wooden deck, and trees over the rest. Pond and tree count grow with the
 * Block. The pond lies at `pond`; without one, nearest the Block's middle where it fits, or nowhere if it fits nowhere.
 * Pond and trees keep clear of the street trees `street`.
 */
export function park(kit: Kit, field: Field, block: Block, pond?: Vec, street: Vec[] = []) {
  overlay(kit, field, block, 2, 0.24, GRASS)
  const ground = KERB + 0.24
  const size = area(block.loop)
  const s = Math.min(1.7, Math.max(0.75, Math.sqrt(size / 1760)))
  const at = pond ?? site(field, block, 29.2 * s, 21.2 * s, middle(block), street, 1)
  if (at) {
    kit.drum(STONE, at.x, at.y, ground, 13.6 * s, 9.6 * s, 0.32)
    kit.drum(kit.water, at.x, at.y, ground + 0.08, 12.6 * s, 8.8 * s, 0.32)
    kit.add(kit.box(6.4, 0.48, 2, 0.4, 0.12), DECK, at.x - 10.8 * s, at.y, ground + 0.32)
  }
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const trees = Math.min(70, Math.max(12, Math.round(size / 60)))
  for (let tries = 0, n = 0; tries < trees * 8 && n < trees; tries++) {
    const [tx, ty] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(tx, ty) < 5 || !inside(block.loop, tx, ty) || !clearOf(street, tx, ty, 0, 0, 3)) continue
    if (at && ((tx - at.x) / (17.2 * s)) ** 2 + ((ty - at.y) / (12.8 * s)) ** 2 < 1) continue
    kit.tree(tx, ty, ground, kit.range(0.75, 1.2), kit.chance(0.2) ? 'sakura' : kit.chance(0.15) ? 'pine' : 'round')
    n++
  }
}

const VERGE = '#c8e8a6' // the grass of a Tile with roads only

/**
 * Up to `count` points on the Block between `clear` and `most` m in from its edge, at least `apart` m from each other
 * and from every point of `avoid`.
 */
function scatter(kit: Kit, field: Field, block: Block, count: number, clear: number, most: number, apart: number, avoid: Vec[]): Vec[] {
  const points: Vec[] = []
  for (let tries = 0; tries < count * 14 && points.length < count; tries++) {
    const [x, y] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    const room = field.sample(x, y)
    if (room < clear || room > most || !inside(block.loop, x, y)) continue
    if ([...points, ...avoid].some((p) => Math.hypot(p.x - x, p.y - y) < apart)) continue
    points.push({ x, y })
  }
  return points
}

/**
 * A Block of an unzoned Tile, roads only: grass with a few bushes along its edge, one to about every 500 m², clear of
 * the street trees `street`, and nothing built.
 */
export function verge(kit: Kit, field: Field, block: Block, street: Vec[]) {
  overlay(kit, field, block, 2.4, 0.16, VERGE)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  for (const p of scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 500)), 3.4, 7, 9, street)) {
    kit.tree(p.x, p.y, KERB + 0.16, kit.range(0.3, 0.45), 'round')
  }
}

// Green: a meadow's grass and its beds of flowers; allotments' gravel paths, the soil of their plots, the crops and
// flowers in them, and their sheds.
const MEADOW = '#b9e293'
const BEDS = ['#ffd1df', '#f6d36a', '#ffadc8', '#fff7e8', '#c7b8f0']
const [GRAVEL, SOIL, SHED, SHED_ROOF] = ['#e6dccb', '#a77f5a', '#c49a6c', '#5aa69b']
const CROPS = ['#6fc35a', '#8fd46c', '#5aae58', '#b9dd6a']
const BLOOMS = ['#ffd1df', '#f6d36a', '#ffadc8', '#fff7e8']
// Farms: ploughed ground, and the crops of its fields.
const FURROWS = '#cdb08a'
const FIELDS = ['#7bc35e', '#e3c76a', '#a6d36b', '#5aae58', '#d9b45c']
const ALLOTMENT = { w: 6.4, d: 4.6, path: 1.3 } // m: a plot, and the gravel path between plots
// m between rows, a stretch of row and the gap between stretches; and the rows of a field.
const FARM = { row: 1.6, length: 5, gap: 0.4, rows: 5 }

/**
 * A meadow Block: open grass but for groves of trees, one to about every 700 m² and at least two, and a few beds of
 * flowers, all clear of the street trees `street`.
 */
export function meadow(kit: Kit, field: Field, block: Block, street: Vec[]) {
  overlay(kit, field, block, 2, 0.24, MEADOW)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.24
  for (const grove of scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 700)), 6.5, Infinity, 16, [])) {
    const near = { ...block, x0: grove.x - 7, x1: grove.x + 7, y0: grove.y - 7, y1: grove.y + 7 }
    for (const p of scatter(kit, field, near, 5, 4.5, Infinity, 3.4, street)) {
      kit.tree(p.x, p.y, ground, kit.range(0.75, 1.15), kit.chance(0.25) ? 'pine' : kit.chance(0.2) ? 'sakura' : 'round')
    }
  }
  for (const p of scatter(kit, field, block, 5, 4, Infinity, 7, street)) {
    kit.add(kit.box(kit.range(3, 5.5), 0.45, kit.range(1.6, 2.6), 0.6, 0.18), kit.pick(BEDS), p.x, p.y, ground)
    kit.brick('tree', p.x, p.y, ground)
  }
}

/**
 * An allotments Block: gravel cut into plots on a grid, each bare soil with rows of crops or flowers, a shed, or
 * nothing, where it stands clear of the street trees `street`. Each plot is a brick.
 */
export function allotments(kit: Kit, field: Field, block: Block, street: Vec[]) {
  overlay(kit, field, block, 1.6, 0.12, GRAVEL)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.12
  const { w, d, path } = ALLOTMENT
  for (let x = block.x0 + 3 + w / 2; x + w / 2 <= block.x1 - 3; x += w + path) {
    for (let y = block.y0 + 3 + d / 2; y + d / 2 <= block.y1 - 3; y += d + path) {
      const corners = [-1, 1].flatMap((i) => [-1, 1].map((j) => field.sample(x + (i * w) / 2, y + (j * d) / 2)))
      if (Math.min(...corners) < 1.8 || !inside(block.loop, x, y) || !clearOf(street, x, y, w, d, 0.8)) continue
      kit.add(kit.box(w, 0.22, d, 0.3, 0.06), SOIL, x, y, ground)
      const roll = kit.range(0, 1)
      if (roll < 0.14) {
        kit.add(kit.box(2.4, 2.2, 2, 0.12, 0.06), SHED, x + w / 2 - 1.7, y, ground + 0.22)
        kit.add(kit.box(2.8, 0.3, 2.4, 0.12, 0.06), SHED_ROOF, x + w / 2 - 1.7, y, ground + 2.42)
        kit.add(kit.box(w - 3.6, 0.5, d - 1.2, 0.3, 0.12), kit.pick(CROPS), x - 1.4, y, ground + 0.22)
      } else if (roll < 0.86) {
        const colours = roll < 0.64 ? CROPS : BLOOMS
        for (let r = 0; r < 3; r++)
          kit.add(kit.box(w - 0.9, 0.5, 0.7, 0.3, 0.12), kit.pick(colours), x, y - d / 2 + 0.9 + r * 1.4, ground + 0.22)
      }
      kit.brick('tree', x, y, ground)
    }
  }
}

/**
 * A farm Block: ploughed ground under fields of crop rows that run along the Block, five rows to a field of one crop,
 * and on some Blocks a farmstead near one end: a farmhouse, and a barn with its silo. Rows and farmstead keep clear of
 * the street trees `street`. Each field is a brick.
 */
export function farm(kit: Kit, field: Field, block: Block, street: Vec[]) {
  overlay(kit, field, block, 1.6, 0.14, FURROWS)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.14
  const along = block.x1 - block.x0 >= block.y1 - block.y0
  // A farmstead on some Blocks only, so that the fields lead.
  const end = along ? { x: block.x0 + 12, y: mid.y } : { x: mid.x, y: block.y1 - 12 }
  const yard = kit.chance(0.45) ? site(field, block, 22, 16, end, street, 1) : null
  if (yard) {
    kit.house(yard.x - (along ? 0 : 6), yard.y + (along ? 5 : 0), ground, 8, 7)
    kit.barn(yard.x + (along ? 0 : 5.5), yard.y - (along ? 4 : 0), ground, along ? 0 : -Math.PI / 2)
  }
  const inYard = (x: number, y: number) => yard !== null && Math.abs(x - yard.x) < 13 && Math.abs(y - yard.y) < 10
  // Rows across the Block, cut into lengths that stand clear of its edge.
  const { row: apart, length, gap, rows } = FARM
  const [from, to] = along ? [block.y0 + 3, block.y1 - 3] : [block.x0 + 3, block.x1 - 3]
  const [start, stop] = along ? [block.x0 + 3, block.x1 - 3] : [block.y0 + 3, block.y1 - 3]
  let [row, crop] = [0, kit.pick(FIELDS)]
  for (let t = from; t <= to; t += apart, row++) {
    if (row % rows === 0) crop = kit.pick(FIELDS)
    for (let s = start + length / 2 + 0.1; s <= stop - length / 2 - 0.1; s += length + gap) {
      const [x, y] = along ? [s, t] : [t, s]
      const [w, d] = along ? [length, 0.8] : [0.8, length]
      const ends = along
        ? [field.sample(x - length / 2, y), field.sample(x + length / 2, y)]
        : [field.sample(x, y - length / 2), field.sample(x, y + length / 2)]
      if (Math.min(...ends, field.sample(x, y)) < 1.6 || !inside(block.loop, x, y) || inYard(x, y) || !clearOf(street, x, y, w, d, 1))
        continue
      kit.add(kit.box(w, 0.5, d, 0.25, 0.12), crop, x, y, ground)
    }
    if (row % rows === rows - 1) kit.brick('tree', along ? mid.x : t, along ? t : mid.y, ground)
  }
  kit.brick('tree', mid.x, mid.y, ground)
}

/** A roundabout's island: a lawn with one big sakura, ringed by small trees when there is room. */
export function island(kit: Kit, field: Field, block: Block, centre: Vec) {
  overlay(kit, field, block, 1.2, 0.5, GRASS)
  kit.brick('ground', centre.x, centre.y, KERB)
  const ground = KERB + 0.5
  const r = Math.min(...block.loop.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
  kit.tree(centre.x, centre.y, ground, Math.min(2.6, Math.max(0.8, r / 12.7)), 'sakura')
  if (r < 20) return
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8
    kit.tree(centre.x + Math.cos(a) * r * 0.72, centre.y + Math.sin(a) * r * 0.72, ground, 0.8, i % 2 ? 'sakura' : 'round')
  }
}
