import { middle, type Vec } from '../../sim/geometry'
import { area, KERB, type Block } from '../blocks'
import type { Field } from '../field'
import type { Kit } from '../kit'
import { overlay, scatter } from '../landmarks'

const VERGE = '#c8e8a6' // the grass of a Tile with roads only

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
