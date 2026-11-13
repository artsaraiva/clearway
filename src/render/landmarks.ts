import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import { KERB } from './blocks'
import { inside, type Field } from './field'
import type { Kit } from './kit'
import { raised } from './shapes'
import type { Bounds } from './slab'

const [GRASS, STONE, CREAM, CORAL, VERMILION, PLAZA] = ['#b5dc95', '#ddd6c9', '#fbf6ef', '#f08a6e', '#e5583f', '#ece3d1']
const TAU = Math.PI * 2

/** A Block's outline, with its bounding box. */
export interface Block extends Bounds {
  loop: Vec[]
}

/** The outlines `inset` m inside a Block's edge, laid on it as a thin layer of another colour. */
function overlay(kit: Kit, field: Field, block: Block, inset: number, thickness: number, color: string) {
  for (const loop of field.outlines(inset)) {
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

/** The ground a tower landmark at `(x, y)` keeps free of seeded lots: its podium, fountain and trees. */
export const towerGround = (x: number, y: number): Bounds => ({ x0: x - 18, y0: y - 20, x1: x + 20, y1: y + 28 })

/**
 * The tower landmark: stacked cylinders in coral and cream with two glazed decks and a beacon, on a podium. A fountain
 * stands north of it and sakura around it, wherever the pavement reaches.
 */
export function tower(kit: Kit, field: Field, x: number, y: number) {
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

  const fountain = y + 20.8
  if (field.sample(x, fountain) >= 6) {
    kit.drum(STONE, x, fountain, KERB, 4.8, 4.8, 1.12)
    kit.drum(kit.water, x, fountain, KERB + 0.2, 4.08, 4.08, 1)
    kit.drum(STONE, x, fountain, KERB, 0.72, 0.72, 3)
  }
  for (const dx of [-14.4, 16.4]) {
    for (const dy of [24.4, 4, -16.4]) if (field.sample(x + dx, y + dy) >= 1.5) kit.tree(x + dx, y + dy, KERB, 0.8, 'sakura')
  }
}

/** A plaza Block: paved in a warmer stone, and left open. */
export function plaza(kit: Kit, field: Field, block: Block) {
  overlay(kit, field, block, 0.4, 0.08, PLAZA)
}

/** A park Block: a lawn, a pond at `(x, y)` with a little red deck, and trees over the rest. Pond and tree count grow with the Block. */
export function park(kit: Kit, field: Field, block: Block, x: number, y: number) {
  overlay(kit, field, block, 2, 0.24, GRASS)
  const ground = KERB + 0.24
  const size = area(block.loop)
  const s = Math.min(1.7, Math.max(1, Math.sqrt(size / 1760)))
  kit.drum(STONE, x, y, ground, 13.6 * s, 9.6 * s, 0.32)
  kit.drum(kit.water, x, y, ground + 0.08, 12.6 * s, 8.8 * s, 0.32)
  kit.add(kit.box(6.4, 0.48, 2, 0.4, 0.12), VERMILION, x - 10.8 * s, y, ground + 0.32)
  const trees = Math.min(70, Math.max(12, Math.round(size / 60)))
  for (let tries = 0, n = 0; tries < trees * 8 && n < trees; tries++) {
    const [tx, ty] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(tx, ty) < 5 || !inside(block.loop, tx, ty)) continue
    if (((tx - x) / (17.2 * s)) ** 2 + ((ty - y) / (12.8 * s)) ** 2 < 1) continue
    kit.tree(tx, ty, ground, kit.range(0.75, 1.2), kit.chance(0.2) ? 'sakura' : kit.chance(0.15) ? 'pine' : 'round')
    n++
  }
}

/** A roundabout's island: a lawn with one big sakura, ringed by small trees when there is room. */
export function island(kit: Kit, field: Field, block: Block, centre: Vec) {
  overlay(kit, field, block, 1.2, 0.5, GRASS)
  const ground = KERB + 0.5
  const r = Math.min(...block.loop.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
  kit.tree(centre.x, centre.y, ground, Math.min(2.6, Math.max(0.8, r / 12.7)), 'sakura')
  if (r < 20) return
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8
    kit.tree(centre.x + Math.cos(a) * r * 0.72, centre.y + Math.sin(a) * r * 0.72, ground, 0.8, i % 2 ? 'sakura' : 'round')
  }
}
