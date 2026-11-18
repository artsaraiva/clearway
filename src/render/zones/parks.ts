import { middle, type Vec } from '../../sim/geometry'
import { area, KERB, type Block } from '../blocks'
import { inside, type Field } from '../field'
import type { Kit } from '../kit'
import { clearOf, DECK, fountain, GRASS, GROW, overlay, PLAZA, site, STONE } from '../landmarks'
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

/**
 * A plaza Block: paved in a warmer stone, and open, or with a fountain at `centre` and four trees around it where they
 * stand clear of the street trees `street`. The fountain grows with the Stage (`fountain`), and so do the trees, which
 * at Stage 3 stand in round stone planters.
 */
export function plaza(kit: Kit, field: Field, block: Block, centre?: Vec, street: Vec[] = []) {
  overlay(kit, field, block, 0.4, 0.08, PLAZA)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  if (!centre) return
  kit.staged((stage) => fountain(kit, centre.x, centre.y, stage))
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const [x, y] = [centre.x + dx * 8.4, centre.y + dy * 8.4]
    if (field.sample(x, y) < 2 || !inside(block.loop, x, y) || !clearOf(street, x, y, 0, 0, 3)) continue
    kit.staged((stage) => {
      if (stage === 3) kit.drum(STONE, x, y, KERB + 0.08, 1.7, 1.7, 0.6)
      kit.tree(x, y, KERB + (stage === 3 ? 0.68 : 0.08), GROW[stage - 1] * 0.7, 'round')
    })
  }
}

/**
 * A park Block: a lawn, a pond with a little wooden deck, and trees over the rest. Pond and tree count grow with the
 * Block. The pond lies at `pond`; without one, nearest the Block's middle where it fits, or nowhere if it fits nowhere.
 * Pond and trees keep clear of the street trees `street`. With the Stage:
 * - Stage 1: a young park, half its trees planted, as saplings, and a pond with no deck.
 * - Stage 2: every tree, and the deck.
 * - Stage 3: the trees grown on, a pavilion over the water at the end of the deck, and an island with a pine.
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
  }
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  if (at) {
    const deck = at.x - 10.8 * s
    kit.from(2, () => {
      kit.add(kit.box(6.4, 0.48, 2, 0.4, 0.12), DECK, deck, at.y, ground + 0.32)
      kit.brick('ground', deck, at.y, ground)
    })
    kit.from(3, () => {
      kit.pavilion(deck + 5.3, at.y, ground + 0.5)
      const [ix, iy] = [at.x + 5 * s, at.y + 2.2 * s]
      kit.drum(GRASS, ix, iy, ground + 0.08, 2.6 * s, 2 * s, 0.6)
      kit.brick('ground', ix, iy, ground)
      kit.tree(ix, iy, ground + 0.68, 0.55, 'pine')
    })
  }
  const trees = Math.min(70, Math.max(12, Math.round(size / 60)))
  for (let tries = 0, n = 0; tries < trees * 8 && n < trees; tries++) {
    const [tx, ty] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(tx, ty) < 5 || !inside(block.loop, tx, ty) || !clearOf(street, tx, ty, 0, 0, 3)) continue
    if (at && ((tx - at.x) / (17.2 * s)) ** 2 + ((ty - at.y) / (12.8 * s)) ** 2 < 1) continue
    const [tree, kind] = [kit.range(0.75, 1.2), kit.chance(0.2) ? 'sakura' : kit.chance(0.15) ? 'pine' : 'round'] as const
    const young = n % 2 === 0 // planted at Stage 1
    kit.lot(n)
    kit.staged((stage) => {
      if (young || stage > 1) kit.tree(tx, ty, ground, GROW[stage - 1] * tree, kind)
    })
    n++
  }
  kit.lot(-1)
}
