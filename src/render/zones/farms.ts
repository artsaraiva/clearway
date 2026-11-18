import { farm } from '../landmarks'
import type { Look } from './ground'

/** Farms' look (`./index`). */
export const look: Look = { landmarks: false, fill: ({ kit, field, block, street }) => farm(kit, field, block, street) }
