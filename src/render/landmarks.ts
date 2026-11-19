import * as THREE from 'three'
import { middle, type Bounds, type Vec } from '../sim/geometry'
import { KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import type { Kit } from './kit'
import { raised } from './shapes'

// The park's deck was shrine vermilion, which is nearly the Jam red-orange: it is wood.
export const [GRASS, STONE, DECK, PLAZA] = ['#b0df88', '#ddd6c9', '#bb5d0d', '#ece3d1']
const [CREAM, CORAL, TEAL] = ['#fbf6ef', '#f08a6e', '#57c6b5']
const TAU = Math.PI * 2
/** How big a tree of a Zone's look grows at each Stage (#141), as a share of the size #136 gave it. */
export const GROW = [0.55, 1, 1.12]

/** The outlines `inset` m inside a Block's edge, laid on it as a thin layer of another colour. Not closed into a brick. */
export function overlay(kit: Kit, field: Field, block: Block, inset: number, thickness: number, color: string) {
  for (const loop of field.outlines(inset, [block])) {
    if (inside(block.loop, loop[0].x, loop[0].y)) kit.push(raised(loop, thickness, thickness * 0.4).translate(0, KERB, 0), color)
  }
}

/** Whether a box `w` (east–west) by `d` centred on `(x, y)` stays at least `room` m clear of every point of `points`. */
export const clearOf = (points: Vec[], x: number, y: number, w: number, d: number, room: number) =>
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

/**
 * A fountain at `(x, y)` at Stage `stage`, as one brick: a stone basin of water. From Stage 2 a column stands at its
 * middle, and at Stage 3 the column carries a second, smaller basin of water and a ball on top.
 */
export function fountain(kit: Kit, x: number, y: number, stage = 2) {
  kit.drum(STONE, x, y, KERB, 4.8, 4.8, 1.12)
  kit.drum(kit.water, x, y, KERB + 0.2, 4.08, 4.08, 1)
  if (stage === 2) kit.drum(STONE, x, y, KERB, 0.72, 0.72, 3)
  if (stage === 3) {
    kit.drum(STONE, x, y, KERB, 0.72, 0.72, 3.6)
    kit.drum(STONE, x, y, KERB + 2.4, 2, 2, 0.6)
    kit.drum(kit.water, x, y, KERB + 2.52, 1.7, 1.7, 0.56)
    kit.ball(STONE, x, y, KERB + 3.9, 0.45)
  }
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
  kit.beacon(x, y, base + 70, 0.62) // white, blinking at night (#154)
  kit.shadow(x, y, base, 20, 20, true)
  kit.brick('building', x, y, KERB, 3)

  const on = (px: number, py: number, clear: number) => field.sample(px, py) >= clear && inside(block.loop, px, py)
  if (on(x, y + 20.8, 6)) fountain(kit, x, y + 20.8)
  for (const dx of [-14.4, 16.4]) {
    for (const dy of [24.4, 4, -16.4]) if (on(x + dx, y + dy, 1.5)) kit.tree(x + dx, y + dy, KERB, 0.8, 'sakura')
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
 * Up to `count` points on the Block between `clear` and `most` m in from its edge, at least `apart` m from each other
 * and from every point of `avoid`.
 */
export function scatter(
  kit: Pick<Kit, 'range'>,
  field: Field,
  block: Block,
  count: number,
  clear: number,
  most: number,
  apart: number,
  avoid: Vec[],
): Vec[] {
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
