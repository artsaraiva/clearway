import { KERB } from './blocks'
import { SHAPES, spot, to, type Kit } from './kit'
import { PATTERN } from './pattern'
import type { Footprint } from './kerbside'

// The props the Zones' scenes share (#175, #177, #178), built from the kit's shapes: a café table, a menu board, a tree
// in a round stone bed, a bench, and the ground a scene stands on before its Stage. Each Zone's own scenes and props
// are in its module (`./zones/shops`, `./zones/offices`, `./zones/medium-density`).

// Colours: a stand's timber and its price boards; a food stall's cart, counter, roof, noren and stools; a menu board.
export const WOOD = { stand: '#c49a6c', dark: '#a1714c', pale: '#d8b98b' }
export const STALL = { cart: '#a1714c', counter: '#d8b98b', roofs: ['#55705f', '#3f4a5e', '#8a5a3c'], noren: '#f4ead2', stool: '#e8925e' }
export const BOARD = { face: '#2f3440', frame: '#a1714c', chalk: '#fbf8f2' }

/**
 * A café table at `(x, y)` with two stools, under a parasol in `colour` if given (none under a pergola, #177), as one
 * brick (#175): the stools Block-zoom.
 */
export function cafeTable(kit: Kit, x: number, y: number, colour?: string) {
  kit.add(kit.cuboid(0.9, 0.05, 0.9), '#fbf8f2', x, y, KERB + 0.78)
  kit.add(kit.cuboid(0.08, 0.78, 0.08), '#4a525c', x, y, KERB)
  if (colour) {
    kit.add(SHAPES.thin, '#4a525c', x, y, KERB + 0.83, 0, 0.04, 1.3, 0.04)
    kit.add(SHAPES.cone, colour, x, y, KERB + 2.05, 0, 1.4, 0.5, 1.4)
  }
  kit.blockZoomProps(() => {
    for (const o of [-0.8, 0.8]) kit.add(SHAPES.thin, STALL.stool, x + o, y, KERB, 0, 0.2, 0.62, 0.2)
  })
  kit.shadow(x, y, KERB, colour ? 2.6 : 1.4, colour ? 2.6 : 1.4, true)
  kit.brick('building', x, y, KERB)
}

/** A menu board standing on the pavement at `(x, y)`, facing `ry`, as one Block-zoom brick (#175): chalk on a dark board. */
export function menuBoard(kit: Kit, x: number, y: number, ry: number) {
  kit.blockZoomProps(() => {
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

/** A bench at `(x, y)` facing `ry`, Block-zoom (#177), standing `h` above the road: on the pavement unless told. */
export const bench = (kit: Kit, x: number, y: number, ry: number, h = KERB) => kit.blockZoomProps(() => kit.bench(x, y, h, ry))

/**
 * A stone lantern at `(x, y)` facing `ry`, `h` above the road (#178, a shrine's; a koi pond's since #179; a park's since #180): a footing, a
 * post, a fire box that lights at dusk and leaves its pool, and a cap.
 */
export function stoneLantern(kit: Kit, x: number, y: number, ry: number, h = KERB) {
  kit.add(kit.cuboid(0.62, 0.22, 0.62), STONE.dark, x, y, h, ry)
  kit.add(kit.cuboid(0.24, 0.85, 0.24), STONE.rim, x, y, h + 0.22, ry)
  kit.add(kit.cuboid(0.5, 0.12, 0.5), STONE.rim, x, y, h + 1.07, ry)
  kit.add(kit.cuboid(0.36, 0.34, 0.36), kit.lit('#fff4dc', GLOWS.low), x, y, h + 1.19, ry)
  kit.add(SHAPES.cone, STONE.rim, x, y, h + 1.53, ry, 0.5, 0.34, 0.5)
  kit.pool('cream', x, y, h, 2.6, 2.6)
  kit.shadow(x, y, h, 1, 1, true)
  kit.brick('building', x, y, h)
}

/** A wayside shrine's stone, footing, stepping stones, timber, doors, copper roof, straw rope and paper (#178). */
export const SHRINE = {
  stone: '#d9d3c7',
  dark: '#bdb4a6',
  step: '#c9c1b3',
  wood: '#8a5a3c',
  door: '#c49a6c',
  roof: '#6f9a8a',
  straw: '#e8cf7f',
  paper: '#fbf8f2',
}
/** Setts' colour (#178), round a shrine or a medium-density scene's ground. */
export const SETTS = '#ddd6c9'

/**
 * A wayside shrine at Stage `stage` (#178), on gravel: a stone torii at its front, stepping stones to a timber shrine
 * under a copper roof on a stone footing, a straw rope and paper across its front, a stone lantern either side that
 * lights at dusk and leaves its pool, and an old tree beside it; at Stage 3 an offering box before it and a low stone
 * fence along its sides. On ground `h` up: the kerb's, or a park's lawn (#180).
 */
export function shrine(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number, h = KERB) {
  const at = (u: number, v: number) => to(x, y, ry, u, v)
  const side = spot(x, y) % 2 ? 1 : -1 // the side its tree stands
  kit.paving(x, y, h, w - 0.4, d - 0.4, ry, SETTS, PATTERN.setts, 0.02)
  const [front, back] = [d / 2 - 0.8, -d / 2 + 1.3]
  for (let v = front - 1; v > back + 1.2; v -= 0.95) kit.put(kit.cuboid(0.9, 0.06, 0.6), SHRINE.step, x, y, ry, 0, v, h + 0.02)
  // The torii, in stone: two pillars, a lintel and a tie beam with a strut between.
  const span = Math.min(1.35, w / 2 - 0.7)
  for (const s of [-1, 1]) kit.drum(SHRINE.stone, ...at(s * span, front), h, 0.17, 0.17, 3.1)
  kit.put(kit.cuboid(2 * span + 0.9, 0.24, 0.4), SHRINE.stone, x, y, ry, 0, front, h + 3.1)
  kit.put(kit.cuboid(2 * span + 0.3, 0.18, 0.2), SHRINE.stone, x, y, ry, 0, front, h + 2.5)
  kit.put(kit.cuboid(0.18, 0.42, 0.14), SHRINE.dark, x, y, ry, 0, front, h + 2.68)
  kit.shadow(...at(0, front), h, 2 * span + 1.2, 1, false, ry)
  kit.brick('building', ...at(0, front), h)
  // The shrine on its footing at the back, under a copper roof, its straw rope and paper across its front.
  kit.put(kit.cuboid(2, 0.7, 1.7), SHRINE.dark, x, y, ry, 0, back, h)
  kit.put(kit.cuboid(1.2, 1.05, 1), SHRINE.wood, x, y, ry, 0, back, h + 0.7)
  kit.put(kit.cuboid(0.72, 0.78, 0.05), SHRINE.door, x, y, ry, 0, back + 0.5, h + 0.82)
  kit.put(kit.gable(1.7, 1.9, 0.62), SHRINE.roof, x, y, ry + Math.PI / 2, 0, back, h + 1.75)
  kit.put(kit.cuboid(1.5, 0.1, 0.1), SHRINE.straw, x, y, ry, 0, back + 0.62, h + 1.68)
  for (const u of [-0.32, 0.32]) kit.put(kit.cuboid(0.12, 0.3, 0.02), SHRINE.paper, x, y, ry, u, back + 0.66, h + 1.36)
  kit.shadow(...at(0, back), h, 2.6, 2.4, false, ry)
  kit.brick('building', ...at(0, back), h)
  for (const s of [-1, 1]) stoneLantern(kit, ...at(s * Math.min(1.7, w / 2 - 0.6), back + 1.6), ry)
  kit.tree(...at(side * (w / 2 - 1.2), back + 0.2), h, 0.62, 'round', true)
  if (stage < 3) return
  kit.put(kit.cuboid(0.9, 0.5, 0.45), SHRINE.wood, x, y, ry, 0, back + 1.25, h)
  for (let k = 0; k < 4; k++) kit.put(kit.cuboid(0.8, 0.03, 0.06), SHRINE.door, x, y, ry, 0, back + 1.08 + k * 0.1, h + 0.5)
  for (const s of [-1, 1]) {
    const u = s * (w / 2 - 0.35)
    for (let v = front - 1.4; v > back - 0.4; v -= 1.1) kit.put(kit.cuboid(0.18, 0.55, 0.18), SHRINE.stone, x, y, ry, u, v, h)
    kit.put(kit.cuboid(0.1, 0.1, front - back - 0.6), SHRINE.stone, x, y, ry, u, (front - 1.4 + back) / 2, h + 0.5)
  }
  kit.brick('building', x, y, h)
}

/** Flowers in bloom, as low- and medium-density lay them in borders and window boxes (#179), and a park's beds (#180). */
export const BLOOMS = ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0']

/** A steel garden shed's walls and its roof (#178). */
const SHED = { wall: '#d9dcd2', roof: '#8f9aa5' }

/**
 * A steel garden shed at `(x, y)` facing `ry`, `h` above the road, as one brick (#178, behind a terraced house; in a
 * house's garden since #179): its walls under a flat roof, and the line between its doors.
 */
export function gardenShed(kit: Kit, x: number, y: number, h: number, ry: number) {
  kit.put(kit.cuboid(1.3, 1.7, 1.1), SHED.wall, x, y, ry, 0, 0, h)
  kit.put(kit.cuboid(1.5, 0.1, 1.3), SHED.roof, x, y, ry, 0, 0, h + 1.7)
  kit.put(kit.cuboid(0.04, 1.4, 0.04), SHED.roof, x, y, ry, 0, 0.57, h + 0.1)
  kit.shadow(x, y, h, 1.9, 1.7, false, ry)
  kit.brick('building', x, y, h)
}

/**
 * A scene's ground before its Stage (#177, #178), facing `ry`: a tree of size `s` in a round bed `r` m across in its
 * middle, `coarse` (the kit's `tree`) if asked, and a bench either side of it `out` m from it, facing it, Block-zoom.
 */
export function waiting(kit: Kit, { x, y, ry }: Footprint, r: number, s: number, out: number, coarse = false) {
  bedTree(kit, x, y, r, s, coarse)
  for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * out, 0), ry + (k * Math.PI) / 2)
}

/** A lantern hung in a pavilion: its cord and its paper. */
const HUNG = { cord: '#8a6446', paper: '#fff4dc' }

/**
 * A lantern hung in a pavilion standing on its floor at `(x, y)`, `h` up (#180 a park's, #182 a meadow's), lit at night,
 * and its pool on the floor.
 */
export function pavilionLantern(kit: Kit, x: number, y: number, h: number) {
  kit.add(SHAPES.thin, HUNG.cord, x, y, h + 2.55, 0, 0.02, 0.35, 0.02)
  kit.add(kit.cuboid(0.42, 0.5, 0.42), kit.lit(HUNG.paper, GLOWS.low), x, y, h + 2.05)
  kit.pool('cream', x, y, h + 0.3, 4, 4)
  kit.brick('lamp', x, y, h)
}

/**
 * A railing in `look` round a box `w` by `d` centred on `(x, y)` at `at` (#177, an office roof's; a residential tower's
 * since #183): posts about 3 m apart under a top rail and a mid rail. It joins the next brick.
 */
export function railing(kit: Kit, look: string, x: number, y: number, w: number, d: number, at: number) {
  for (const side of [-1, 1]) {
    for (const z of [0.5, 0.96]) {
      kit.add(kit.cuboid(w, 0.06, 0.06), look, x, y + (side * d) / 2, at + z)
      kit.add(kit.cuboid(0.06, 0.06, d), look, x + (side * w) / 2, y, at + z)
    }
    for (const [len, eastWest] of [
      [w, true],
      [d, false],
    ] as const) {
      const n = Math.max(1, Math.round(len / 3))
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (i * len) / n
        if (eastWest) kit.add(kit.cuboid(0.06, 1, 0.06), look, x + t, y + (side * d) / 2, at)
        else kit.add(kit.cuboid(0.06, 1, 0.06), look, x + (side * w) / 2, y - t, at)
      }
    }
  }
}
