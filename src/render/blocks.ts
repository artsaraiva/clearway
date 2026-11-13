import { around, middle, type Bounds, type Vec } from '../sim/geometry'
import type { Kit } from './kit'
import { raised } from './shapes'

export const KERB = 1.2 // m a Block stands above the road: chunky on purpose, it is the toy look
const BEVEL = 0.24
const PAVEMENT = '#f1ede5'

/** A Block's outline, with its bounding box. */
export interface Block extends Bounds {
  loop: Vec[]
}

/** A Block from an outline of the field. */
export const block = (loop: Vec[]): Block => ({ loop, ...around(loop) })

/** A Block's pavement as one brick: a bevelled slab raised from its outline. A roundabout's island is one too. */
export function pavement(kit: Kit, b: Block) {
  const { x, y } = middle(b)
  kit.push(raised(b.loop, KERB, BEVEL), PAVEMENT)
  kit.brick('block', x, y, 0, 3)
}
