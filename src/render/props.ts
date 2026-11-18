import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { polyline } from '../sim/geometry'
import { KERB } from './blocks'
import { SHAPES, spot, to, type Kit } from './kit'
import { PATTERN } from './pattern'

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

// Offices (#177): the scenes an offices Block picks from, each on ground it reserves along the Block's edge, `w` m along
// it and `d` deep, its front facing `ry` toward the Road; the piece on each tower's plaza; and a taxi bay at the kerb.
// Benches and planters are Close-only, as the street's furniture is. Before its Stage a scene's ground is paved, with a
// tree in a round bed, so that no ground stands empty.

/** The scenes an offices Block picks from (#177). */
export type OfficeScene = 'court' | 'sculpture' | 'truck'
/** What stands on an office tower's plaza from Stage 2 (#177). */
export type PlazaPiece = 'sculpture' | 'clock' | 'fountain'

// Colours: stone for a court's rim, its steps, its floor and a sculpture's plinth; sculptures in amber, teal, steel,
// violet or white; a clock's post and face; a taxi bay's tarmac, its lines and its sign's pole, board, band and marks;
// and a food truck's paints, the cars' colours but the taxis' yellow.
const STONE = { rim: '#d9d3c7', step: '#e8e2d6', floor: '#d6cec1', dark: '#bdb4a6' }
const ART = ['#f0b43c', '#2fb39a', '#c4ccd4', '#a58ad8', '#fbf8f2']
const CLOCK = { post: '#4a525c', face: '#fbf8f2', hands: '#2f3440' }
// Water in a court's pool or a fountain, painted on the soft-lit material: the kit's water would bring a mesh, and its
// shadow, to every offices build, which draws none of it otherwise.
const WATER = '#63d1f4'
const TAXI_BAY = { tarmac: '#bcc1c8', line: '#fbf8f2', pole: '#9aa3ad', board: '#fbf8f2', band: '#f6d36a', marks: '#2f3440' }
const FOOD_TRUCKS = ['#64cb9f', '#ff9cbb', '#ffffff', '#bc9ef2']
// A sculpture plaza's ring, standing on edge: 1 m across, its tube 0.16 m thick, scaled to its size.
const RING = new THREE.TorusGeometry(1, 0.16, 8, 24)
// A food truck (#177): m from where it parks to where it turns off the Road, and the s it waits there before it
// drives in, late in the morning, and parked before it leaves, after midday.
const FOOD_TRUCK = { drive: 6, waits: [30, 30] }
// How brightly a lit clock face, a court's low lights and a sculpture's uplights glow, for the lamps' glow.
const GLOWS = { clock: 0.8, low: 1.4 }

/** A tree of size `s` in a round stone bed `r` m across at `(x, y)`, as two bricks. */
function bedTree(kit: Kit, x: number, y: number, r: number, s: number) {
  kit.drum(STONE.rim, x, y, KERB, r, r, 0.5)
  kit.drum('#8a7560', x, y, KERB + 0.42, r - 0.18, r - 0.18, 0.1)
  kit.brick('building', x, y, KERB)
  kit.tree(x, y, KERB + 0.5, s, 'round')
}

/** A bench at `(x, y)` facing `ry`, Close-only (#177). */
const bench = (kit: Kit, x: number, y: number, ry: number) => kit.closeOnly(() => kit.bench(x, y, KERB, ry))

/**
 * A scene's ground before its Stage `from` (#177): paved, with a tree in a round bed in its middle and a bench either
 * side of it, Close-only.
 */
function sceneGround(kit: Kit, x: number, y: number, w: number, d: number, ry: number) {
  kit.paving(x, y, KERB, w, d, ry, STONE.floor, PATTERN.plaza, 0.02)
  bedTree(kit, x, y, 1.3, 0.5)
  for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * 2.8, 0), ry + (k * Math.PI) / 2)
}

/**
 * A sunken court at Stage `stage` (#177), from Stage `from`: three tiers of stone steps down on three sides to a paved
 * court open toward the Road, a tree in a round bed at its back and benches on its floor; at Stage 3 a long pool of
 * water across its front and two low lights at its open corners that leave their pools. Before `from`, its ground.
 */
export function sunkenCourt(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number, from: number) {
  if (stage < from) return sceneGround(kit, x, y, w, d, ry)
  kit.paving(x, y, KERB, w, d, ry, STONE.floor, PATTERN.plaza, 0.02)
  for (let k = 0; k < 3; k++) {
    const [half, back, tall] = [w / 2 - 0.5 * k, -d / 2 + 0.5 * k, 0.9 - 0.3 * k]
    const look = k ? STONE.step : STONE.rim
    kit.put(kit.cuboid(2 * half, tall, 0.5), look, x, y, ry, 0, back + 0.25, KERB)
    for (const s of [-1, 1])
      kit.put(kit.cuboid(0.5, tall, d / 2 - back - 0.5), look, x, y, ry, s * (half - 0.25), (back + 0.5 + d / 2) / 2, KERB)
  }
  kit.brick('building', x, y, KERB) // no contact shadow: the tiers are low, and it would darken the court
  bedTree(kit, ...to(x, y, ry, 0, -d / 2 + 2.6), 1.1, stage === 3 ? 0.55 : 0.46)
  for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * (w / 2 - 2.6), 0.4), ry + (k * Math.PI) / 2)
  if (stage === 3) {
    kit.put(kit.cuboid(w - 4, 0.36, 1.3), STONE.rim, x, y, ry, 0, d / 2 - 1, KERB)
    kit.put(kit.cuboid(w - 4.3, 0.06, 1), WATER, x, y, ry, 0, d / 2 - 1, KERB + 0.32)
    for (const k of [-1, 1]) {
      const [lx, ly] = to(x, y, ry, k * (w / 2 - 1.8), d / 2 - 0.4)
      kit.add(kit.cuboid(0.22, 0.7, 0.22), STONE.dark, lx, ly, KERB)
      kit.add(kit.cuboid(0.26, 0.2, 0.26), kit.lit('#fff4dc', GLOWS.low), lx, ly, KERB + 0.7)
      kit.pool('cream', lx, ly, KERB, 2.6, 2.6)
    }
    kit.brick('building', x, y, KERB)
  }
}

/**
 * A sculpture plaza at Stage `stage` (#177), from Stage `from`: a round stone platform with a sculpture larger than a
 * car on it, picked from where it stands (a ring on edge, three cubes stacked askew, or a sphere on a drum); at Stage 3
 * two uplights that leave their pools and benches facing it. Before `from`, its ground.
 */
export function sculpturePlaza(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number, from: number) {
  if (stage < from) return sceneGround(kit, x, y, w, d, ry)
  kit.paving(x, y, KERB, w, d, ry, STONE.floor, PATTERN.plaza, 0.02)
  const draw = mulberry32(spot(x, y))
  const [kind, colour, other] = [Math.floor(draw() * 3), ART[Math.floor(draw() * ART.length)], ART[Math.floor(draw() * ART.length)]]
  const r = Math.min(d / 2 - 0.4, 3.4)
  kit.drum(STONE.rim, x, y, KERB, r, r, 0.22)
  kit.drum(STONE.dark, x, y, KERB + 0.2, r - 0.5, r - 0.5, 0.04)
  const top = KERB + 0.22
  if (kind === 0) {
    kit.add(kit.cuboid(1.8, 0.5, 1.1), STONE.dark, x, y, top, ry)
    kit.add(RING, colour, x, y, top + 0.5 + 2.3, ry, 2.3, 2.3, 2.3)
  } else if (kind === 1) {
    for (const [s, z, turn, look] of [
      [2.1, 0, 0.3, colour],
      [1.6, 2.1, -0.25, other],
      [1.15, 3.7, 0.55, colour],
    ] as const)
      kit.add(kit.cuboid(s, s, s), look, x, y, top + z, ry + turn)
  } else {
    kit.drum(STONE.dark, x, y, top, 0.9, 0.9, 1.3)
    kit.ball(colour, x, y, top + 1.3 + 1.5, 1.6)
  }
  kit.shadow(x, y, top, 3.6, 3.6, true) // under the sculpture alone, not the platform
  kit.brick('building', x, y, KERB)
  if (stage === 3) {
    for (const k of [-1, 1]) {
      const [lx, ly] = to(x, y, ry, k * (r - 0.6), r - 0.9)
      kit.add(kit.cuboid(0.3, 0.16, 0.3), kit.lit('#fff4dc', GLOWS.low), lx, ly, top)
      kit.pool('cream', lx, ly, KERB, 2.8, 2.8)
    }
    kit.brick('building', x, y, KERB)
    for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * (r + 1.3), 0), ry + (k * Math.PI) / 2)
  }
}

/**
 * Where a food truck parks and the Road it turns off, on a truck court's ground (#177): it parks along the front,
 * its serving hatch toward the tables, and turns off the Road `FOOD_TRUCK.drive` m along.
 */
const truckSpots = (x: number, y: number, w: number, d: number, ry: number) => ({
  parked: to(x, y, ry, -w / 2 + 3, d / 2 - 1.6),
  road: to(x, y, ry, -w / 2 + 3 + FOOD_TRUCK.drive, d / 2 - 1.6),
})

/**
 * A food truck's court at Stage `stage` (#177), from Stage `from`: tables under parasols at its back for the truck that
 * parks at its front through the middle of the day (`foodTruck`), and a menu board, Close-only; at Stage 3 a third
 * table and string lights over them on two posts, which leave a pool. Before `from`, its ground.
 */
export function truckCourt(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number, from: number) {
  if (stage < from) return sceneGround(kit, x, y, w, d, ry)
  kit.paving(x, y, KERB, w, d, ry, STONE.floor, PATTERN.plaza, 0.02)
  kit.brick('ground', x, y, KERB)
  const tables = stage === 3 ? [-0.32, 0, 0.32] : [-0.25, 0.25]
  tables.forEach((t, i) => cafeTable(kit, ...to(x, y, ry, t * w, -d / 2 + 1.9), ART[(spot(x, y) + i) % 4]))
  menuBoard(kit, ...to(x, y, ry, -w / 2 + 6.6, d / 2 - 2.9), ry + Math.PI / 2)
  if (stage === 3) {
    const v = -d / 2 + 1.9
    for (const k of [-1, 1]) kit.put(kit.cuboid(0.08, 2.9, 0.08), '#9aa3ad', x, y, ry, k * (w / 2 - 0.6), v, KERB)
    kit.put(kit.cuboid(w - 1.2, 0.03, 0.03), '#2f3440', x, y, ry, 0, v, KERB + 2.85)
    const n = Math.round((w - 1.2) / 0.7)
    for (let k = 0; k < n; k++)
      kit.put(kit.cuboid(0.16, 0.16, 0.16), kit.lit('#fff1c7', 1.5), x, y, ry, -w / 2 + 0.6 + ((k + 0.5) * (w - 1.2)) / n, v, KERB + 2.66)
    kit.pool('string', ...to(x, y, ry, 0, v), KERB, w, 3.2, ry)
    kit.brick('building', x, y, KERB)
  }
}

/**
 * The food truck of a truck court (#177), as a mover: it waits off the Road through the morning, unseen, turns in
 * late in the morning and parks, its hatch toward the tables, through the middle of the day, and drives back out after
 * midday, shrinking as it leaves the Road, as a car does at a Gateway; one lap a day. Its paint is drawn from where
 * it parks.
 */
export function foodTruck(kit: Kit, x: number, y: number, w: number, d: number, ry: number) {
  const { parked, road } = truckSpots(x, y, w, d, ry)
  const [p, s] = [
    { x: parked[0], y: parked[1] },
    { x: road[0], y: road[1] },
  ]
  const paint = FOOD_TRUCKS[spot(...parked) % FOOD_TRUCKS.length]
  kit.mover('foodtruck', polyline([s, p, s]), [0, FOOD_TRUCK.drive], 0, KERB, { waits: [...FOOD_TRUCK.waits], paint, laps: true, away: 0 })
}

/**
 * The piece on an office tower's plaza at `(x, y)`, facing `ry`, as one brick (#177): a sculpture of two blocks askew
 * on a plinth, a clock on a post whose faces light at night and leave a pool, or a fountain whose spray rises through
 * the working day, as steam does.
 */
export function plazaPiece(kit: Kit, x: number, y: number, ry: number, kind: PlazaPiece) {
  const draw = mulberry32(spot(x, y))
  if (kind === 'sculpture') {
    const [a, b] = [ART[Math.floor(draw() * ART.length)], ART[Math.floor(draw() * ART.length)]]
    kit.add(kit.cuboid(1.5, 0.45, 1.5), STONE.dark, x, y, KERB, ry)
    kit.add(kit.cuboid(1, 1.5, 1), a, x, y, KERB + 0.45, ry + 0.4)
    kit.add(kit.cuboid(0.8, 0.8, 0.8), b, x, y, KERB + 1.95, ry - 0.3)
    kit.shadow(x, y, KERB, 2.2, 2.2, true)
  } else if (kind === 'clock') {
    kit.add(kit.cuboid(0.6, 0.3, 0.6), STONE.dark, x, y, KERB, ry)
    kit.add(kit.cuboid(0.18, 3.5, 0.18), CLOCK.post, x, y, KERB + 0.3, ry)
    kit.add(kit.cuboid(1, 1, 0.34), CLOCK.post, x, y, KERB + 3.5, ry)
    for (const turn of [0, Math.PI]) {
      kit.put(SHAPES.disc, kit.lit(CLOCK.face, GLOWS.clock), x, y, ry + turn, 0, 0.18, KERB + 4, 0.4, 0.4, 1)
      kit.put(kit.cuboid(0.05, 0.3, 0.02), CLOCK.hands, x, y, ry + turn, 0, 0.19, KERB + 4)
      kit.put(kit.cuboid(0.22, 0.05, 0.02), CLOCK.hands, x, y, ry + turn, 0.1, 0.19, KERB + 3.98)
    }
    kit.pool('cream', x, y, KERB, 3, 3)
    kit.shadow(x, y, KERB, 1.4, 1.4, true)
  } else {
    kit.drum(STONE.rim, x, y, KERB, 1.5, 1.5, 0.5)
    kit.drum(WATER, x, y, KERB + 0.1, 1.3, 1.3, 0.36)
    kit.drum(STONE.dark, x, y, KERB, 0.22, 0.22, 1.1)
    kit.steam(x, y, KERB + 1.2)
    kit.shadow(x, y, KERB, 3.4, 3.4, true)
  }
  kit.brick('building', x, y, KERB)
}

/**
 * A taxi bay at the kerb, `w` m along it and `d` deep, its front facing `ry` toward the Road, as one brick (#177): a
 * strip of tarmac set into the pavement, lined along its back and ends, and a stand's sign on a post at one end whose
 * board lights at night and leaves a pool. The taxis waiting in it are the kit's.
 */
export function taxiBay(kit: Kit, x: number, y: number, w: number, d: number, ry: number) {
  kit.put(kit.cuboid(w, 0.02, d), TAXI_BAY.tarmac, x, y, ry, 0, 0, KERB)
  kit.put(kit.cuboid(w, 0.03, 0.12), TAXI_BAY.line, x, y, ry, 0, -d / 2 + 0.06, KERB)
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.12, 0.03, d), TAXI_BAY.line, x, y, ry, k * (w / 2 - 0.06), 0, KERB)
  const [px, py] = to(x, y, ry, w / 2 - 0.5, -d / 2 - 0.4)
  kit.add(SHAPES.thin, TAXI_BAY.pole, px, py, KERB, 0, 0.05, 2.7, 0.05)
  kit.put(kit.cuboid(0.9, 0.6, 0.06), kit.lit(TAXI_BAY.board, GLOWS.clock), px, py, ry, 0, 0, KERB + 2.1)
  kit.put(kit.cuboid(0.9, 0.14, 0.07), kit.lit(TAXI_BAY.band, 0.33), px, py, ry, 0, 0, KERB + 2.56)
  for (const k of [-1, 0, 1]) kit.put(kit.cuboid(0.16, 0.16, 0.08), TAXI_BAY.marks, px, py, ry, k * 0.24, 0, KERB + 2.24)
  kit.pool('cream', px, py, KERB, 2.6, 2.6)
  kit.brick('ground', x, y, KERB)
}
