import { mulberry32 } from '../sim/demand'
import { KERB } from './blocks'
import { SHAPES, spot, to, type Kit } from './kit'

// The shops' scenes and the small things before their fronts (#175), built from the kit's shapes. A scene is a focal
// piece larger than a car, seen from Street: a greengrocer's stand spilling onto the pavement, a florist's, a row of
// capsule machines, or a food stall with its lantern and steam. Pot plants, menu boards, crates and stools are Close-only
// (the kit's `closeOnly`), hidden beyond Street.

/** The scenes a shops Block picks from (#175). */
export type ShopScene = 'greengrocer' | 'florist' | 'capsules' | 'stall'

// Colours: a stand's timber and its price boards; produce (cabbages, oranges, lemons, aubergines, daikon and apples in
// the cars' raspberry, under the cap on the Jam's red-orange); flowers and buckets; capsule machines and their lit tops;
// a food stall's cart, counter, roof, noren and stools; a menu board.
const WOOD = { stand: '#c49a6c', dark: '#a1714c', pale: '#d8b98b' }
const PRODUCE = ['#9fd36b', '#f0a43c', '#f6d36a', '#7a5aa8', '#f4f1ea', '#db6982', '#79c86a', '#e8925e']
const FLOWERS = ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0', '#ff9ab8', '#f0b43c', '#ffffff']
const LEAF = '#5fbc51'
const BUCKET = '#e9eef2'
const CAPSULE = { bodies: ['#ff9ab8', '#5cc0d6', '#f0b43c', '#79c86a', '#a58ad8', '#f4f6f8'], top: '#f4f6f8', trim: '#4a525c' }
const STALL = { cart: '#a1714c', counter: '#d8b98b', roofs: ['#55705f', '#3f4a5e', '#8a5a3c'], noren: '#f4ead2', stool: '#e8925e' }
const BOARD = { face: '#2f3440', frame: '#a1714c', chalk: '#fbf8f2' }
const TAU = Math.PI * 2

/**
 * A timber crate of produce at `(lx, ly)` in the frame of something at `(x, y)` facing `ry`, its foot `z` above the road,
 * heaped `heap` m, its produce's colour from `draw`.
 */
function crate(kit: Kit, x: number, y: number, ry: number, lx: number, ly: number, z: number, heap: number, draw: () => number) {
  kit.put(kit.cuboid(0.58, 0.3, 0.42), WOOD.pale, x, y, ry, lx, ly, z)
  kit.put(kit.cuboid(0.52, heap, 0.36), PRODUCE[Math.floor(draw() * PRODUCE.length)], x, y, ry, lx, ly, z + 0.3)
}

/**
 * A stand of three timber steps `len` long, stepping up to the shop front behind it, its middle at `(x, y)` and its
 * front facing `ry`, with what each step carries laid by `fill(lx, ly, z)` at each place along it, `pitch` m apart.
 */
function stand(kit: Kit, x: number, y: number, ry: number, len: number, pitch: number, fill: (lx: number, ly: number, z: number) => void) {
  for (let k = 0; k < 3; k++) {
    const [ly, z] = [0.45 - k * 0.42, KERB + 0.25 + k * 0.3]
    kit.put(kit.cuboid(len, z - KERB, 0.42), WOOD.stand, x, y, ry, 0, ly, KERB)
    const n = Math.max(1, Math.floor(len / pitch))
    for (let i = 0; i < n; i++) fill(-len / 2 + (i + 0.5) * (len / n), ly, z)
  }
}

/**
 * A greengrocer's stand before a shop front, as one brick (#175): produce heaped on three steps along the front, `len`
 * long, with a price board at one end; at Stage 3 crates more spill to the kerb. Its middle at `(x, y)`, 0.6 m out from
 * the front facing `ry`.
 */
export function greengrocer(kit: Kit, x: number, y: number, ry: number, len: number, stage: number) {
  const draw = mulberry32(spot(x, y))
  stand(kit, x, y, ry, len, 0.7, (lx, ly, z) =>
    kit.put(kit.cuboid(0.62, 0.16, 0.36), PRODUCE[Math.floor(draw() * PRODUCE.length)], x, y, ry, lx, ly, z),
  )
  kit.put(kit.cuboid(0.7, 0.5, 0.05), BOARD.chalk, x, y, ry, len / 2 - 0.4, 0.68, KERB + 0.6)
  if (stage === 3) for (let i = 0; i < 4; i++) crate(kit, x, y, ry, -len / 2 + 0.5 + i * 0.7, 1.05, KERB, 0.1, draw)
  kit.shadow(x, y, KERB, len + 0.6, 1.8, false, ry)
  kit.brick('building', x, y, KERB)
}

/**
 * A florist's stand before a shop front, as one brick (#175): buckets of flowers on three steps along the front, `len`
 * long, and pot plants by it; at Stage 3 a row of tall plants at the kerb's side.
 */
export function florist(kit: Kit, x: number, y: number, ry: number, len: number, stage: number) {
  const draw = mulberry32(spot(x, y))
  stand(kit, x, y, ry, len, 0.62, (lx, ly, z) => {
    kit.put(kit.cuboid(0.34, 0.34, 0.3), BUCKET, x, y, ry, lx, ly, z)
    const [bx, by] = to(x, y, ry, lx, ly)
    kit.add(SHAPES.bush, FLOWERS[Math.floor(draw() * FLOWERS.length)], bx, by, z + 0.5, draw() * TAU, 0.3, 0.26, 0.3)
  })
  if (stage === 3)
    for (let i = 0; i < 3; i++) {
      const [px, py] = to(x, y, ry, -len / 2 + 0.6 + i * 1.1, 1.05)
      kit.add(SHAPES.pot, '#e9e4da', px, py, KERB, 0, 0.32, 0.5, 0.32)
      kit.add(SHAPES.sphere, LEAF, px, py, KERB + 1.05, 0, 0.42, 0.62, 0.42)
    }
  kit.shadow(x, y, KERB, len + 0.6, 1.8, false, ry)
  kit.brick('building', x, y, KERB)
}

/**
 * A row of capsule machines before a shop front, two high, `len` long, as one brick (#175): each a body in a bright
 * colour under a clear top full of capsules that lights at dusk as a vending machine's front does, and leaves a pool.
 * Stage 3 tops each pile with a sign.
 */
export function capsules(kit: Kit, x: number, y: number, ry: number, len: number, stage: number) {
  const draw = mulberry32(spot(x, y))
  const n = Math.max(4, Math.floor(len / 0.66))
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / n)
    for (let k = 0; k < 2; k++) {
      const z = KERB + k * 1.02
      kit.put(kit.cuboid(0.6, 0.56, 0.52), CAPSULE.bodies[Math.floor(draw() * CAPSULE.bodies.length)], x, y, ry, lx, 0, z)
      kit.put(kit.cuboid(0.52, 0.4, 0.44), kit.lit(CAPSULE.top, 0.5), x, y, ry, lx, 0, z + 0.56)
      kit.put(kit.cuboid(0.6, 0.06, 0.52), CAPSULE.trim, x, y, ry, lx, 0, z + 0.96)
    }
  }
  if (stage === 3) kit.put(kit.cuboid(len * 0.7, 0.5, 0.1), kit.lit('#ff9ab8', 0.33), x, y, ry, 0, -0.1, KERB + 2.08)
  kit.pool('vending', ...to(x, y, ry, 0, 1), KERB, len + 1, 1.8, ry)
  kit.shadow(x, y, KERB, len + 0.6, 1.4, false, ry)
  kit.brick('building', x, y, KERB)
}

/**
 * A food stall (yatai) at `(x, y)`, its counter facing `ry`, as one brick (#175): a timber cart on wheels under a roof on
 * four posts, a noren along the roof's edge, a pot on the counter whose steam rises through the working day, an amber
 * lantern at its corner that lights at dusk and leaves its pool, and stools before the counter, which are Close-only.
 * About 3.4 m long and 2.6 m deep with its stools.
 */
export function foodStall(kit: Kit, x: number, y: number, ry: number) {
  const roof = STALL.roofs[spot(x, y) % STALL.roofs.length]
  kit.put(kit.cuboid(3, 0.95, 1.2), STALL.cart, x, y, ry, 0, 0, KERB + 0.32)
  kit.put(kit.cuboid(3.3, 0.08, 1.45), STALL.counter, x, y, ry, 0, 0.1, KERB + 1.27)
  for (const lx of [-1, 1]) {
    kit.put(SHAPES.disc, '#2f3440', x, y, ry, lx * 0.95, 0.61, KERB + 0.36, 0.34, 0.34, 1)
    for (const ly of [-0.55, 0.55]) kit.put(kit.cuboid(0.08, 1.35, 0.08), STALL.cart, x, y, ry, lx * 1.45, ly, KERB + 1.35)
  }
  kit.put(kit.cuboid(3.5, 0.12, 1.8), roof, x, y, ry, 0, 0.05, KERB + 2.7)
  for (const k of [-1, 0, 1]) kit.put(kit.cuboid(1.1, 0.5, 0.03), STALL.noren, x, y, ry, k * 1.15, 0.94, KERB + 2.2)
  const [px, py] = to(x, y, ry, -0.7, -0.15)
  kit.add(SHAPES.thin, '#9aa3ad', px, py, KERB + 1.35, 0, 0.32, 0.4, 0.32)
  kit.steam(px, py, KERB + 1.9)
  kit.closeOnly(() => {
    for (const lx of [-1, 0, 1]) kit.put(SHAPES.thin, STALL.stool, x, y, ry, lx * 0.95, 1.15, KERB, 0.2, 0.62, 0.2)
  })
  kit.pool('stall', ...to(x, y, ry, 0, 0.6), KERB, 4.6, 3.6, ry)
  kit.shadow(x, y, KERB, 3.8, 2.2, false, ry)
  kit.brick('building', x, y, KERB)
  kit.lantern(...to(x, y, ry, 1.5, 0.9), KERB + 2.05, true)
}

/**
 * A café table under a parasol in `colour` at `(x, y)`, with two stools, as one brick (#175): the stools Close-only.
 */
export function cafeTable(kit: Kit, x: number, y: number, colour: string) {
  kit.add(kit.cuboid(0.9, 0.05, 0.9), '#fbf8f2', x, y, KERB + 0.78)
  kit.add(kit.cuboid(0.08, 0.78, 0.08), '#4a525c', x, y, KERB)
  kit.add(SHAPES.thin, '#4a525c', x, y, KERB + 0.83, 0, 0.04, 1.3, 0.04)
  kit.add(SHAPES.cone, colour, x, y, KERB + 2.05, 0, 1.4, 0.5, 1.4)
  kit.closeOnly(() => {
    for (const o of [-0.8, 0.8]) kit.add(SHAPES.thin, STALL.stool, x + o, y, KERB, 0, 0.2, 0.62, 0.2)
  })
  kit.shadow(x, y, KERB, 2.6, 2.6, true)
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

/** Pot plants about 0.7 m tall standing at `spots` on the pavement, as one Close-only brick (#175), each in a pot of its own colour. */
export function pots(kit: Kit, spots: [number, number][]) {
  if (!spots.length) return
  const draw = mulberry32(spot(...spots[0]))
  kit.closeOnly(() => {
    for (const [x, y] of spots) kit.pot(x, y, KERB, 0.7 * (0.75 + draw() * 0.5), draw)
  })
  kit.brick('building', ...spots[0], KERB)
}

/**
 * A plant stand at `(x, y)` against a shop front facing `ry`, as one Close-only brick (#175): two timber steps with pot
 * plants on them.
 */
export function plantStand(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.closeOnly(() => {
    for (let k = 0; k < 2; k++) {
      const [ly, z] = [0.2 - k * 0.32, KERB + 0.35 + k * 0.35]
      kit.put(kit.cuboid(1.3, z - KERB, 0.32), WOOD.stand, x, y, ry, 0, ly, KERB)
      for (const lx of [-0.42, 0, 0.42]) kit.pot(...to(x, y, ry, lx, ly), z, 0.42 + draw() * 0.18, draw)
    }
  })
  kit.brick('building', x, y, KERB)
}

/** Crates of produce at `(x, y)`, facing `ry`, as one Close-only brick (#175): two on the pavement and one on top. */
export function produce(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.closeOnly(() => {
    for (const [lx, z] of [
      [-0.32, 0],
      [0.32, 0],
      [0, 0.32],
    ])
      crate(kit, x, y, ry, lx, 0, KERB + z, 0.08, draw)
  })
  kit.brick('building', x, y, KERB)
}
