import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { polyline, type Vec } from '../sim/geometry'
import { KERB } from './blocks'
import { PAINTS } from './cars'
import { GARDEN, SHAPES, spot, to, type Kit } from './kit'
import { PATTERN } from './pattern'
import type { Footprint } from './streets'

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
// and a food truck's paints, four of the cars' (`PAINTS`), never the taxis' yellow.
const STONE = { rim: '#d9d3c7', step: '#e8e2d6', floor: '#d6cec1', dark: '#bdb4a6' }
const ART = ['#f0b43c', '#2fb39a', '#c4ccd4', '#a58ad8', '#fbf8f2']
const CLOCK = { post: '#4a525c', face: '#fbf8f2', hands: '#2f3440' }
// Water in a court's pool or a fountain, painted on the soft-lit material: the kit's water would bring a mesh, and its
// shadow, to every offices build, which draws none of it otherwise.
const WATER = '#63d1f4'
const TAXI_BAY = { tarmac: '#bcc1c8', line: '#fbf8f2', pole: '#9aa3ad', board: '#fbf8f2', band: '#f6d36a', marks: '#2f3440' }
const FOOD_TRUCKS = [PAINTS.mint, PAINTS.pink, PAINTS.white, PAINTS.violet]
// A sculpture plaza's ring, standing on edge: 1 m across, its tube 0.16 m thick, scaled to its size.
const RING = new THREE.TorusGeometry(1, 0.16, 8, 24)
// A food truck (#177): where it parks on its court, m from the court's left end and in from its front; and the s it
// waits off the Road before it drives in, late in the morning, and parked before it backs out, after midday.
const FOOD_TRUCK = { park: [3, 1.6], waits: [30, 30] }
// How brightly each lit part glows, for the lamps' glow: a clock's face and a taxi stand's board, a court's low lights
// and a sculpture's uplights, a pergola's lamps and string lights, and a taxi stand's band.
const GLOWS = { face: 0.8, low: 1.4, string: 1.5, band: 0.33 }
// A truck court's pergola over its tables (#177): m up to its beams and deep at most, its steel, and its lamps' cream.
const PERGOLA = { tall: 2.86, deep: 3, steel: '#9aa3ad', lamp: '#fff1c7' }

/** A tree of size `s` in a round stone bed `r` m across at `(x, y)`, as two bricks, `coarse` (the kit's `tree`) if asked. */
function bedTree(kit: Kit, x: number, y: number, r: number, s: number, coarse = false) {
  kit.drum(STONE.rim, x, y, KERB, r, r, 0.5)
  kit.drum('#8a7560', x, y, KERB + 0.42, r - 0.18, r - 0.18, 0.1)
  kit.brick('building', x, y, KERB)
  kit.tree(x, y, KERB + 0.5, s, 'round', coarse)
}

/** A bench at `(x, y)` facing `ry`, Close-only (#177). */
const bench = (kit: Kit, x: number, y: number, ry: number) => kit.closeOnly(() => kit.bench(x, y, KERB, ry))

/**
 * A scene's ground before its Stage (#177, #178), facing `ry`: a tree of size `s` in a round bed `r` m across in its
 * middle, `coarse` (the kit's `tree`) if asked, and a bench either side of it `out` m from it, facing it, Close-only.
 */
function waiting(kit: Kit, { x, y, ry }: Footprint, r: number, s: number, out: number, coarse = false) {
  bedTree(kit, x, y, r, s, coarse)
  for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * out, 0), ry + (k * Math.PI) / 2)
}

/**
 * An offices Block's scene `kind` at Stage `stage` (#177), from Stage `from`, on its `ground`, its front facing the
 * Road: stone paving, and on it the scene, or before `from` a tree in a round bed in its
 * middle and a bench either side of it, Close-only.
 */
export function officeScene(kit: Kit, kind: OfficeScene, ground: Footprint, stage: number, from: number) {
  const { x, y, w, d, ry } = ground
  kit.paving(x, y, KERB, w, d, ry, STONE.floor, PATTERN.plaza, 0.02)
  if (stage >= from) return { court: sunkenCourt, sculpture: sculpturePlaza, truck: truckCourt }[kind](kit, x, y, w, d, ry, stage)
  waiting(kit, ground, 1.3, 0.5, 2.8)
}

/**
 * A sunken court at Stage `stage` (#177), on its paving: three tiers of stone steps down on three sides to a paved court
 * open toward the Road, a tree in a round bed at its back and benches on its floor; at Stage 3 a long pool of water
 * across its front and two low lights at its open corners that leave their pools.
 */
function sunkenCourt(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
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
 * A sculpture plaza at Stage `stage` (#177), on its paving: a round stone platform with a sculpture larger than a car on
 * it, picked from where it stands (a ring on edge, three cubes stacked askew, or a sphere on a drum); at Stage 3 two
 * uplights that leave their pools and benches facing it.
 */
function sculpturePlaza(kit: Kit, x: number, y: number, _w: number, d: number, ry: number, stage: number) {
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
 * Where a truck court's food truck turns in from the kerb (#177): `turn` m along the court's front from where it parks,
 * the first of `TRUCK_TURNS` its way in keeps clear of what stands at the kerb, and the Block's edge `kerb` m out from
 * the front there.
 */
export interface TruckEntry {
  turn: number
  kerb: number
}
/** m along a truck court's front from where its food truck parks that it may turn in from the kerb, the first that is clear (#177). */
export const TRUCK_TURNS = [7, 6, 8, 5.5, 9]

/** m along a truck court `w` m long from its middle, as its front runs, where its food truck turns in `turn` m from where it parks (#177). */
export const truckTurn = (w: number, turn: number) => -w / 2 + FOOD_TRUCK.park[0] + turn

/**
 * The way a truck court's food truck comes in (#177), on its court `w` by `d` at `(x, y)` facing `ry`: from the kerb at
 * `entry`, slanting in over the pavement, curving to park along the front, where it heads along it.
 */
export function truckPath({ x, y, w, d, ry }: Footprint, entry: TruckEntry): Vec[] {
  const [px, py] = [-w / 2 + FOOD_TRUCK.park[0], d / 2 - FOOD_TRUCK.park[1]]
  const [kx, ky] = [truckTurn(w, entry.turn), d / 2 + entry.kerb]
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    const [cx, cy] = to(x, y, ry, kx + (px - kx) * t, py + (ky - py) * (1 - t) ** 2)
    return { x: cx, y: cy }
  })
}

/**
 * A food truck's court at Stage `stage` (#177), on its paving: tables at its back under a pergola, its focal piece
 * whether or not the truck that parks at its front through the middle of the day (`foodTruck`) is there, and a menu
 * board, Close-only. Lamps hung under the pergola leave their pools; at Stage 3 a third table, and string lights under
 * it in the lamps' place, which leave a pool.
 */
function truckCourt(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
  kit.brick('ground', x, y, KERB)
  // The pergola: steel posts and beams under timber slats, `long` by `deep`, its back 0.4 m in from the court's, the
  // tables along its middle `v`, clear of the parked truck's awning.
  const [long, deep] = [w - 1.2, Math.min(PERGOLA.deep, d - 4)]
  const v = -d / 2 + 0.4 + deep / 2
  const tables = stage === 3 ? [-0.32, 0, 0.32] : [-0.25, 0.25]
  for (const t of tables) cafeTable(kit, ...to(x, y, ry, t * w, v))
  menuBoard(kit, ...to(x, y, ry, -w / 2 + 6.6, d / 2 - 2.9), ry + Math.PI / 2)
  for (const u of long >= 8.8 ? [-1, 0, 1] : [-1, 1])
    for (const s of [-1, 1])
      kit.put(kit.cuboid(0.14, PERGOLA.tall, 0.14), PERGOLA.steel, x, y, ry, (u * long) / 2, v + (s * deep) / 2, KERB)
  for (const s of [-1, 1]) kit.put(kit.cuboid(long + 0.3, 0.16, 0.12), PERGOLA.steel, x, y, ry, 0, v + (s * deep) / 2, KERB + PERGOLA.tall)
  const slats = Math.round(long / 0.6)
  for (let k = 0; k <= slats; k++)
    kit.put(kit.cuboid(0.1, 0.08, deep + 0.4), WOOD.stand, x, y, ry, -long / 2 + (k * long) / slats, v, KERB + PERGOLA.tall + 0.16)
  kit.brick('building', x, y, KERB)
  if (stage === 3) {
    kit.put(kit.cuboid(long, 0.03, 0.03), '#2f3440', x, y, ry, 0, v, KERB + PERGOLA.tall - 0.05)
    const n = Math.round(long / 0.7)
    for (let k = 0; k < n; k++)
      kit.put(
        kit.cuboid(0.16, 0.16, 0.16),
        kit.lit(PERGOLA.lamp, GLOWS.string),
        x,
        y,
        ry,
        -long / 2 + ((k + 0.5) * long) / n,
        v,
        KERB + PERGOLA.tall - 0.24,
      )
    kit.pool('string', ...to(x, y, ry, 0, v), KERB, w, 3.2, ry)
  } else {
    for (const t of tables) {
      kit.put(kit.cuboid(0.03, 0.5, 0.03), '#2f3440', x, y, ry, t * w, v, KERB + PERGOLA.tall - 0.5)
      kit.put(kit.cuboid(0.3, 0.2, 0.3), kit.lit(PERGOLA.lamp, GLOWS.string), x, y, ry, t * w, v, KERB + PERGOLA.tall - 0.7)
      kit.pool('cream', ...to(x, y, ry, t * w, v), KERB, 2.8, 2.8)
    }
  }
  kit.brick('building', x, y, KERB)
}

/**
 * The food truck of a truck court (#177), as a mover coming in from the kerb at `entry` (`truckPath`): it waits off the
 * Road through the morning, unseen, and late in the morning comes in over the kerb, growing as it leaves the Road as a
 * car does at a Gateway, and curves in to park along the front, its hatch toward the tables. After midday it backs out
 * the way it came and shrinks away at the kerb; one lap a day. Its paint is drawn from where it parks.
 */
export function foodTruck(kit: Kit, court: Footprint, entry: TruckEntry) {
  const curve = truckPath(court, entry)
  const parked = curve[curve.length - 1]
  const paint = FOOD_TRUCKS[spot(parked.x, parked.y) % FOOD_TRUCKS.length]
  const loop = polyline([...curve, ...curve.slice(0, -1).reverse()])
  kit.mover('foodtruck', loop, [0, loop.length / 2], 0, KERB, {
    waits: [...FOOD_TRUCK.waits],
    reverse: [false, true],
    paint,
    laps: true,
    away: 0,
  })
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
      kit.put(SHAPES.disc, kit.lit(CLOCK.face, GLOWS.face), x, y, ry + turn, 0, 0.18, KERB + 4, 0.4, 0.4, 1)
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
export function taxiBay(kit: Kit, { x, y, w, d, ry }: Footprint) {
  kit.put(kit.cuboid(w, 0.02, d), TAXI_BAY.tarmac, x, y, ry, 0, 0, KERB)
  kit.put(kit.cuboid(w, 0.03, 0.12), TAXI_BAY.line, x, y, ry, 0, -d / 2 + 0.06, KERB)
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.12, 0.03, d), TAXI_BAY.line, x, y, ry, k * (w / 2 - 0.06), 0, KERB)
  const [px, py] = to(x, y, ry, w / 2 - 0.5, -d / 2 - 0.4)
  kit.add(SHAPES.thin, TAXI_BAY.pole, px, py, KERB, 0, 0.05, 2.7, 0.05)
  kit.put(kit.cuboid(0.9, 0.6, 0.06), kit.lit(TAXI_BAY.board, GLOWS.face), px, py, ry, 0, 0, KERB + 2.1)
  kit.put(kit.cuboid(0.9, 0.14, 0.07), kit.lit(TAXI_BAY.band, GLOWS.band), px, py, ry, 0, 0, KERB + 2.56)
  for (const k of [-1, 0, 1]) kit.put(kit.cuboid(0.16, 0.16, 0.08), TAXI_BAY.marks, px, py, ry, k * 0.24, 0, KERB + 2.24)
  kit.pool('cream', px, py, KERB, 2.6, 2.6)
  kit.brick('ground', x, y, KERB)
}

// Medium-density residential (#178): the scenes a Block picks from, each on ground it reserves before its lots are laid,
// `w` m along the Block's edge and `d` deep, its front facing `ry` toward the Road: a wayside shrine in stone and wood, a
// pocket park with one swing, or a bathhouse with a tall thin chimney. Before its Stage a scene's ground is laid in setts
// with a tree in a round bed and a bench either side, so that no ground stands empty.

/** The scenes a medium-density Block picks from (#178). */
export type MediumScene = 'shrine' | 'park' | 'bathhouse'
/** The ground each scene takes (#178), m along the Block's edge and deep: as much as it would have, and the least it fits on. */
export const MEDIUM_SCENES: Record<MediumScene, { most: [number, number]; least: [number, number] }> = {
  shrine: { most: [7.5, 7], least: [5.2, 5.2] },
  park: { most: [10, 8], least: [7, 5.6] },
  bathhouse: { most: [13, 10], least: [9.6, 7.6] },
}

// Colours (#178): a shrine's stone, its timber, its copper roof gone green, and the straw rope and the paper over it; a
// bathhouse's plaster, its stone footing, its slate tiles, its noren, its sign and its brick chimney under a white band;
// and the setts a scene's ground is laid in before its Stage, and a shrine's gravel.
const SHRINE = {
  stone: '#d9d3c7',
  dark: '#bdb4a6',
  step: '#c9c1b3',
  wood: '#8a5a3c',
  door: '#c49a6c',
  roof: '#6f9a8a',
  straw: '#e8cf7f',
  paper: '#fbf8f2',
}
const SETTS = '#ddd6c9'
const BATHHOUSE = {
  wall: '#f6e6cb',
  footing: '#bdb4a6',
  roof: '#4d6575',
  noren: ['#3f4a5e', '#6c5a8a'],
  sign: '#2f3440',
  chimney: '#a8604f',
  band: '#f4f1ea',
  tall: 18,
}

/**
 * A medium-density Block's scene `kind` at Stage `stage` (#178), from Stage `from`, on its `ground`, its front facing
 * the Road: the scene, or before `from` setts with a tree in a round bed in its middle and a bench either side of it,
 * Close-only.
 */
export function mediumScene(kit: Kit, kind: MediumScene, ground: Footprint, stage: number, from: number) {
  const { x, y, w, d, ry } = ground
  if (stage >= from) return { shrine, park: pocketPark, bathhouse }[kind](kit, x, y, w, d, ry, stage)
  kit.paving(x, y, KERB, w - 0.4, d - 0.4, ry, SETTS, PATTERN.setts, 0.02)
  waiting(kit, ground, 1.1, 0.46, Math.min(2.7, w / 2 - 0.9), true)
}

/** A stone lantern at `(x, y)` facing `ry` (#178): a footing, a post, a fire box that lights at dusk and leaves its pool, and a cap. */
function stoneLantern(kit: Kit, x: number, y: number, ry: number) {
  kit.add(kit.cuboid(0.62, 0.22, 0.62), SHRINE.dark, x, y, KERB, ry)
  kit.add(kit.cuboid(0.24, 0.85, 0.24), SHRINE.stone, x, y, KERB + 0.22, ry)
  kit.add(kit.cuboid(0.5, 0.12, 0.5), SHRINE.stone, x, y, KERB + 1.07, ry)
  kit.add(kit.cuboid(0.36, 0.34, 0.36), kit.lit('#fff4dc', GLOWS.low), x, y, KERB + 1.19, ry)
  kit.add(SHAPES.cone, SHRINE.stone, x, y, KERB + 1.53, ry, 0.5, 0.34, 0.5)
  kit.pool('cream', x, y, KERB, 2.6, 2.6)
  kit.shadow(x, y, KERB, 1, 1, true)
  kit.brick('building', x, y, KERB)
}

/**
 * A wayside shrine at Stage `stage` (#178), on gravel: a stone torii at its front, stepping stones to a timber shrine
 * under a copper roof on a stone footing, a straw rope and paper across its front, a stone lantern either side that
 * lights at dusk and leaves its pool, and an old tree beside it; at Stage 3 an offering box before it and a low stone
 * fence along its sides.
 */
function shrine(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
  const at = (u: number, v: number) => to(x, y, ry, u, v)
  const side = spot(x, y) % 2 ? 1 : -1 // the side its tree stands
  kit.paving(x, y, KERB, w - 0.4, d - 0.4, ry, SETTS, PATTERN.setts, 0.02)
  const [front, back] = [d / 2 - 0.8, -d / 2 + 1.3]
  for (let v = front - 1; v > back + 1.2; v -= 0.95) kit.put(kit.cuboid(0.9, 0.06, 0.6), SHRINE.step, x, y, ry, 0, v, KERB + 0.02)
  // The torii, in stone: two pillars, a lintel and a tie beam with a strut between.
  const span = Math.min(1.35, w / 2 - 0.7)
  for (const s of [-1, 1]) kit.drum(SHRINE.stone, ...at(s * span, front), KERB, 0.17, 0.17, 3.1)
  kit.put(kit.cuboid(2 * span + 0.9, 0.24, 0.4), SHRINE.stone, x, y, ry, 0, front, KERB + 3.1)
  kit.put(kit.cuboid(2 * span + 0.3, 0.18, 0.2), SHRINE.stone, x, y, ry, 0, front, KERB + 2.5)
  kit.put(kit.cuboid(0.18, 0.42, 0.14), SHRINE.dark, x, y, ry, 0, front, KERB + 2.68)
  kit.shadow(...at(0, front), KERB, 2 * span + 1.2, 1, false, ry)
  kit.brick('building', ...at(0, front), KERB)
  // The shrine on its footing at the back, under a copper roof, its straw rope and paper across its front.
  kit.put(kit.cuboid(2, 0.7, 1.7), SHRINE.dark, x, y, ry, 0, back, KERB)
  kit.put(kit.cuboid(1.2, 1.05, 1), SHRINE.wood, x, y, ry, 0, back, KERB + 0.7)
  kit.put(kit.cuboid(0.72, 0.78, 0.05), SHRINE.door, x, y, ry, 0, back + 0.5, KERB + 0.82)
  kit.put(kit.gable(1.7, 1.9, 0.62), SHRINE.roof, x, y, ry + Math.PI / 2, 0, back, KERB + 1.75)
  kit.put(kit.cuboid(1.5, 0.1, 0.1), SHRINE.straw, x, y, ry, 0, back + 0.62, KERB + 1.68)
  for (const u of [-0.32, 0.32]) kit.put(kit.cuboid(0.12, 0.3, 0.02), SHRINE.paper, x, y, ry, u, back + 0.66, KERB + 1.36)
  kit.shadow(...at(0, back), KERB, 2.6, 2.4, false, ry)
  kit.brick('building', ...at(0, back), KERB)
  for (const s of [-1, 1]) stoneLantern(kit, ...at(s * Math.min(1.7, w / 2 - 0.6), back + 1.6), ry)
  kit.tree(...at(side * (w / 2 - 1.2), back + 0.2), KERB, 0.62, 'round', true)
  if (stage < 3) return
  kit.put(kit.cuboid(0.9, 0.5, 0.45), SHRINE.wood, x, y, ry, 0, back + 1.25, KERB)
  for (let k = 0; k < 4; k++) kit.put(kit.cuboid(0.8, 0.03, 0.06), SHRINE.door, x, y, ry, 0, back + 1.08 + k * 0.1, KERB + 0.5)
  for (const s of [-1, 1]) {
    const u = s * (w / 2 - 0.35)
    for (let v = front - 1.4; v > back - 0.4; v -= 1.1) kit.put(kit.cuboid(0.18, 0.55, 0.18), SHRINE.stone, x, y, ry, u, v, KERB)
    kit.put(kit.cuboid(0.1, 0.1, front - back - 0.6), SHRINE.stone, x, y, ry, u, (front - 1.4 + back) / 2, KERB + 0.5)
  }
  kit.brick('building', x, y, KERB)
}

/**
 * A pocket park at Stage `stage` (#178): a lawn behind a low hedge, one swing over sand, a tree, a bench facing the
 * swing, Close-only, and a lamp at its front corner that leaves its pool; at Stage 3 a spring rider and a bed of flowers.
 */
function pocketPark(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
  const at = (u: number, v: number) => to(x, y, ry, u, v)
  const side = spot(x, y) % 2 ? 1 : -1 // the side its swing stands
  kit.surface(x, y, KERB, w - 0.4, d - 0.4, ry, GARDEN.lawn)
  for (const s of [-1, 1]) kit.put(kit.cuboid(0.5, 0.65, d - 1.4), GARDEN.hedge, x, y, ry, s * (w / 2 - 0.45), -0.5, KERB)
  kit.put(kit.cuboid(w - 0.9, 0.65, 0.5), GARDEN.hedge, x, y, ry, 0, -d / 2 + 0.45, KERB)
  kit.brick('ground', x, y, KERB)
  const swing = at(side * (w / 2 - 2.4), -0.6)
  kit.surface(...swing, KERB + 0.02, 3.4, 2.8, ry, GARDEN.sand)
  kit.swings(...swing, KERB + 0.12, ry, true)
  kit.tree(...at(-side * (w / 2 - 1.8), -d / 2 + 1.9), KERB + 0.1, 0.58, 'round', true)
  bench(kit, ...at(-side * (w / 2 - 2.2), 0.6), ry + (side * Math.PI) / 2)
  kit.lamp(...at(-side * (w / 2 - 0.9), d / 2 - 0.9), KERB + 0.1) // on the lawn, its pool over it
  if (stage < 3) return
  kit.rider(...at(side * (w / 2 - 2.4), d / 2 - 1.6), KERB + 0.1, ry)
  kit.flowerBed(...at(0, -d / 2 + 1.3), KERB + 0.1, Math.min(3, w - 4.6), 0.9, ry, '#ffadc8')
}

/**
 * A bathhouse at Stage `stage` (#178): one tall storey of plaster over a timber wainscot on a stone footing, its high
 * windows lit at night, under a tiled hip along its front; a porch on timber posts under a big gable to the front over
 * its door, two noren across the door and a signboard with marks for lettering lit at night on the porch, which leave a
 * pool; and a tall thin brick chimney behind it under a white band, whose steam rises through the working day. At Stage
 * 3 a vending machine by the door.
 */
function bathhouse(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
  const [bw, bd] = [Math.min(w - 1, 11), Math.min(d - 1.8, 8)]
  const v = -d / 2 + 0.5 + bd / 2 // its middle, out from the ground's
  const face = v + bd / 2
  const seed = spot(x, y)
  const [cx, cy] = to(x, y, ry, 0, v)
  kit.put(kit.cuboid(bw + 0.4, 0.45, bd + 0.4), BATHHOUSE.footing, x, y, ry, 0, v, KERB)
  const walls = { front: PATTERN.plaster, back: PATTERN.house, sides: PATTERN.house, storey: 4.6, bay: 2.8 }
  kit.cladded(kit.box(bw, 4.6, bd, 0.2, 0.08), BATHHOUSE.wall, cx, cy, KERB + 0.45, ry, walls, seed)
  kit.put(kit.cuboid(bw + 0.1, 1.05, bd + 0.1), SHRINE.wood, x, y, ry, 0, v, KERB + 0.45) // a timber wainscot round it
  // A hipped roof along its front, and over its door a porch on timber posts under a big gable to the front.
  kit.tiled(kit.hip(bw + 0.8, bd + 1.4, Math.min(3, bd * 0.38)), BATHHOUSE.roof, cx, cy, KERB + 5.05, ry + Math.PI / 2, seed + 1)
  for (const s of [-1, 1]) kit.put(kit.cuboid(0.24, 3.3, 0.24), SHRINE.wood, x, y, ry, s * 1.75, face + 1.5, KERB + 0.45)
  kit.put(kit.cuboid(4, 0.24, 0.3), SHRINE.wood, x, y, ry, 0, face + 1.5, KERB + 3.6)
  kit.tiled(kit.gable(2.2, 4.4, 1.6), BATHHOUSE.roof, ...to(x, y, ry, 0, face + 0.95), KERB + 3.8, ry, seed + 2)
  kit.put(
    kit.cuboid(2, 2.3, 0.1),
    { material: kit.glass, tint: new THREE.Color(1, 1, 1), glow: 1.2 },
    x,
    y,
    ry,
    0,
    face + 0.04,
    KERB + 0.45,
  )
  BATHHOUSE.noren.forEach((colour, k) => kit.put(kit.cuboid(0.92, 0.9, 0.03), colour, x, y, ry, (k - 0.5) * 0.98, face + 0.2, KERB + 1.85))
  kit.put(kit.cuboid(2.4, 0.8, 0.14), kit.lit(BATHHOUSE.sign, 0.33), x, y, ry, 0, face + 2.06, KERB + 4.2)
  for (let k = 0; k < 3; k++)
    kit.put(kit.cuboid(0.4, 0.4, 0.04), kit.lit('#fbf8f2', 1.6), x, y, ry, (k - 1) * 0.66, face + 2.14, KERB + 4.4)
  kit.pool('sign', ...to(x, y, ry, 0, face + 1.6), KERB, 4.4, 2.8, ry)
  // The chimney behind it, under a white band, steaming.
  const [hx, hy] = to(x, y, ry, (seed % 2 ? 1 : -1) * Math.min(2, bw / 2 - 1), v - bd / 2 - 0.2)
  kit.drum(BATHHOUSE.chimney, hx, hy, KERB, 0.5, 0.5, BATHHOUSE.tall)
  kit.drum(BATHHOUSE.band, hx, hy, KERB + BATHHOUSE.tall - 1.6, 0.54, 0.54, 0.9)
  kit.drum(BATHHOUSE.chimney, hx, hy, KERB + BATHHOUSE.tall, 0.6, 0.6, 0.3)
  kit.steam(hx, hy, KERB + BATHHOUSE.tall + 0.4)
  kit.shadow(cx, cy, KERB, bw * 1.3 + 1, bd * 1.3 + 1, false, ry)
  kit.brick('building', cx, cy, KERB)
  if (stage === 3) kit.vendingMachine(...to(x, y, ry, bw / 2 - 1.2, face + 0.5), KERB, ry)
}

// A bin store (#178): bags of rubbish under a green net in a steel frame, and a little sign; Close-only, as the small
// props are. Parking bays by an apartment block (#178): tarmac set into the pavement, white lines between the bays.
const BINS = { frame: '#9aa3ad', net: '#4f8a6e', bags: ['#f4f1ea', '#e3ecd6', '#f4f1ea', '#dfe7ee'], sign: '#fbf8f2' }
const BAYS = { tarmac: '#bcc1c8', line: '#fbf8f2', each: 2.5 }

/** A bin store against a wall at `(x, y)`, facing `ry`, as one Close-only brick (#178): bags under a green net in a frame, and its sign. */
export function binStore(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.closeOnly(() => {
    for (const u of [-0.95, 0.95]) kit.put(kit.cuboid(0.06, 0.9, 1), BINS.frame, x, y, ry, u, 0, KERB)
    kit.put(kit.cuboid(1.96, 0.05, 1), BINS.frame, x, y, ry, 0, 0, KERB + 0.88)
    for (let k = 0; k < 4; k++) {
      const [bx, by] = to(x, y, ry, -0.62 + k * 0.42, (k % 2) * 0.16 - 0.08)
      kit.add(SHAPES.bush, BINS.bags[Math.floor(draw() * BINS.bags.length)], bx, by, KERB + 0.3, draw() * TAU, 0.32, 0.3, 0.32)
    }
    kit.put(kit.cuboid(1.9, 0.5, 0.95), BINS.net, x, y, ry, 0, 0, KERB + 0.38)
    kit.put(kit.cuboid(0.5, 0.36, 0.03), BINS.sign, x, y, ry, 0.5, -0.52, KERB + 1.05)
  })
  kit.brick('building', x, y, KERB)
}

/** Parking bays on `ground` (#178), `bays` of them side by side across its width, open to its front, as one brick. */
export function parkingBays(kit: Kit, { x, y, w, d, ry }: Footprint, bays: number) {
  kit.put(kit.cuboid(w, 0.02, d), BAYS.tarmac, x, y, ry, 0, 0, KERB)
  kit.put(kit.cuboid(w, 0.03, 0.12), BAYS.line, x, y, ry, 0, -d / 2 + 0.06, KERB)
  for (let k = 0; k <= bays; k++)
    kit.put(kit.cuboid(0.12, 0.03, d - 0.4), BAYS.line, x, y, ry, -w / 2 + 0.06 + (k * (w - 0.12)) / bays, -0.2, KERB)
  kit.brick('ground', x, y, KERB)
}

/** m across a parking bay (#178). */
export const BAY_WIDTH = BAYS.each
