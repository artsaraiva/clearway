import { KERB } from './blocks'
import { SHAPES, to, type Kit } from './kit'
import type { Footprint } from './streets'

// The props the Zones' scenes share (#175, #177, #178), built from the kit's shapes: a café table, a menu board, a tree
// in a round stone bed, a bench, and the ground a scene stands on before its Stage. Each Zone's own scenes and props
// are in its module (`./zones/shops`, `./zones/offices`, `./zones/medium-density`).

// Colours: a stand's timber and its price boards; a food stall's cart, counter, roof, noren and stools; a menu board.
export const WOOD = { stand: '#c49a6c', dark: '#a1714c', pale: '#d8b98b' }
export const STALL = { cart: '#a1714c', counter: '#d8b98b', roofs: ['#55705f', '#3f4a5e', '#8a5a3c'], noren: '#f4ead2', stool: '#e8925e' }
export const BOARD = { face: '#2f3440', frame: '#a1714c', chalk: '#fbf8f2' }

/**
 * A café table at `(x, y)` with two stools, under a parasol in `colour` if given (none under a pergola, #177), as one
 * brick (#175): the stools Close-only.
 */
export function cafeTable(kit: Kit, x: number, y: number, colour?: string) {
  kit.add(kit.cuboid(0.9, 0.05, 0.9), '#fbf8f2', x, y, KERB + 0.78)
  kit.add(kit.cuboid(0.08, 0.78, 0.08), '#4a525c', x, y, KERB)
  if (colour) {
    kit.add(SHAPES.thin, '#4a525c', x, y, KERB + 0.83, 0, 0.04, 1.3, 0.04)
    kit.add(SHAPES.cone, colour, x, y, KERB + 2.05, 0, 1.4, 0.5, 1.4)
  }
  kit.closeOnly(() => {
    for (const o of [-0.8, 0.8]) kit.add(SHAPES.thin, STALL.stool, x + o, y, KERB, 0, 0.2, 0.62, 0.2)
  })
  kit.shadow(x, y, KERB, colour ? 2.6 : 1.4, colour ? 2.6 : 1.4, true)
  kit.brick('building', x, y, KERB)
}

/** A menu board standing on the pavement at `(x, y)`, facing `ry`, as one Close-only brick (#175): chalk on a dark board. */
export function menuBoard(kit: Kit, x: number, y: number, ry: number) {
  kit.closeOnly(() => {
    kit.put(kit.cuboid(0.62, 0.86, 0.1), BOARD.frame, x, y, ry, 0, 0, KERB + 0.12)
    kit.put(kit.cuboid(0.5, 0.7, 0.04), BOARD.face, x, y, ry, 0, 0.05, KERB + 0.2)
    for (const k of [0, 1, 2]) kit.put(kit.cuboid(0.36, 0.05, 0.02), BOARD.chalk, x, y, ry, 0, 0.08, KERB + 0.72 - k * 0.16)
    for (const lx of [-0.26, 0.26]) kit.put(kit.cuboid(0.05, 0.14, 0.4), BOARD.frame, x, y, ry, lx, 0, KERB)
  })
  kit.brick('building', x, y, KERB)
}

// Colours: stone for a court's rim, its steps, its floor and a sculpture's plinth.
export const STONE = { rim: '#d9d3c7', step: '#e8e2d6', floor: '#d6cec1', dark: '#bdb4a6' }
// How brightly each lit part glows, for the lamps' glow: a clock's face and a taxi stand's board, a court's low lights
// and a sculpture's uplights, a pergola's lamps and string lights, and a taxi stand's band.
export const GLOWS = { face: 0.8, low: 1.4, string: 1.5, band: 0.33 }

/** A tree of size `s` in a round stone bed `r` m across at `(x, y)`, as two bricks, `coarse` (the kit's `tree`) if asked. */
export function bedTree(kit: Kit, x: number, y: number, r: number, s: number, coarse = false) {
  kit.drum(STONE.rim, x, y, KERB, r, r, 0.5)
  kit.drum('#8a7560', x, y, KERB + 0.42, r - 0.18, r - 0.18, 0.1)
  kit.brick('building', x, y, KERB)
  kit.tree(x, y, KERB + 0.5, s, 'round', coarse)
}

/** A bench at `(x, y)` facing `ry`, Close-only (#177). */
export const bench = (kit: Kit, x: number, y: number, ry: number) => kit.closeOnly(() => kit.bench(x, y, KERB, ry))

/**
 * A scene's ground before its Stage (#177, #178), facing `ry`: a tree of size `s` in a round bed `r` m across in its
 * middle, `coarse` (the kit's `tree`) if asked, and a bench either side of it `out` m from it, facing it, Close-only.
 */
export function waiting(kit: Kit, { x, y, ry }: Footprint, r: number, s: number, out: number, coarse = false) {
  bedTree(kit, x, y, r, s, coarse)
  for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * out, 0), ry + (k * Math.PI) / 2)
}
