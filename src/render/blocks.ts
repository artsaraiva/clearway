import { around, middle, type Bounds, type Vec } from '../sim/geometry'
import type { Kit } from './kit'
import { raised } from './shapes'

export const KERB = 1.2 // m a Block stands above the road: chunky on purpose, it is the toy look
const BEVEL = 0.24
/** The pavement's colour, which the surface pattern picks the pavement out by to lay its paving joints (`./pattern`, #176). */
export const PAVEMENT = '#f1ede5'
const SLIVER = 5 // m: an outline narrower than this on average is left as road plate, not raised as a Block

/** A Block's outline, with its bounding box. */
export interface Block extends Bounds {
  loop: Vec[]
}

/** A Block from an outline of the field. */
export const block = (loop: Vec[]): Block => ({ loop, ...around(loop) })

/** Twice the area inside an outline (m², the shoelace formula): positive if it runs counterclockwise. */
export function twiceArea(loop: Vec[]): number {
  let twice = 0
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length]
    twice += p.x * q.y - q.x * p.y
  })
  return twice
}

/** The area inside an outline, m². */
export const area = (loop: Vec[]) => Math.abs(twiceArea(loop)) / 2

/**
 * Whether an outline is wide enough to be a Block rather than a sliver: twice its area over its perimeter is its width,
 * on average. A seam between two pieces of slab can leave a sliver between a Road and the seam.
 */
export function wide({ loop }: Block): boolean {
  let [twice, perimeter] = [0, 0]
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length]
    twice += p.x * q.y - q.x * p.y
    perimeter += Math.hypot(q.x - p.x, q.y - p.y)
  })
  return Math.abs(twice) / perimeter >= SLIVER
}

/**
 * A Block's pavement as one brick: a bevelled slab raised from its outline, which the surface pattern paves (#174, on
 * every Tile since #176). A roundabout's island is one too.
 */
export function pavement(kit: Kit, b: Block) {
  const { x, y } = middle(b)
  kit.pavement(raised(b.loop, KERB, BEVEL), PAVEMENT)
  kit.brick('block', x, y, 0, 3)
}
