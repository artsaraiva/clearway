import { allotments, meadow } from '../landmarks'
import type { Look } from './ground'

// Green: a meadow, or one Block in three allotments.
const GREEN = { allotments: 0.35 }

/** Green's look (`./index`). */
export const look: Look = {
  landmarks: false,
  fill: ({ kit, field, block, street }) => (kit.chance(GREEN.allotments) ? allotments : meadow)(kit, field, block, street),
}
