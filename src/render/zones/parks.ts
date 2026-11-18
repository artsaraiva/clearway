import { middle } from '../../sim/geometry'
import { park, plaza, site } from '../landmarks'
import type { Look, ZoneGround } from './ground'

// Parks: a park with a pond, or on a Block under 1,600 m² by its bounding box, one time in three, a plaza with a fountain.
const PARKS = { small: 1600, plaza: 0.35 }

/** Parks' look (`./index`). */
export const look: Look = { landmarks: false, fill: parks }

/** Parks: a park with a pond and trees, or on a small Block now and then a plaza with a fountain. */
function parks({ kit, field, block, street }: ZoneGround) {
  const small = (block.x1 - block.x0) * (block.y1 - block.y0) < PARKS.small
  const fountain = small && kit.chance(PARKS.plaza) ? site(field, block, 12, 12, middle(block), street, 1) : null
  if (fountain) plaza(kit, field, block, fountain, street)
  else park(kit, field, block, undefined, street)
}
