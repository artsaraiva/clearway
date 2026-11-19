import { mulberry32 } from '../../sim/demand'
import type { Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { FACES, FUTONS, GARDEN, type Kit, LEAVES, PLANT, SHAPES, spot, TANK, to } from '../kit'
import { fit, lotsOf, overlap, stands, turned, type Look, type RowLot, type ZoneGround } from './ground'

// High-density residential: lots at most 30 m on a side, 3.4 m in from the Block's bounding box, each with one tower
// of at most 17 m east–west by 15 north–south and at least 9, 11 to 17 storeys tall, leaving 4.5 m of the lot open on
// every side. Its podium is 1.2 m wider all round and stands 1.5 m in from the Block's edge.
const TOWERS = { lot: 30, margin: 3.4, gap: 4.5, most: [17, 15], least: 9, podium: 1.2, clear: 1.5, floors: [11, 17] } as const
// High-density residential details (#155): the Stage 2 floors from which a tower has a helipad and beacons at Stages 2
// and 3; and the playground or garden at its foot.
const HIGH = {
  pad: [16, 14],
  beacon: [15, 13],
  // m along the podium at most and at least, m out from it at most and at least, how far out it starts, how much of its
  // far end stays paved for the bench that stands there from Stage 1, and how far it keeps from another podium.
  foot: { long: 12, least: 8, deep: 7, shallow: 4, off: 0.6, paved: 3.2, apart: 1 },
} as const
const LAWN = '#a9db7f' // a garden's, as the kit's
// The storeys a residential tower stands at each Stage, from the floors it draws, which are its Stage 2 floors.
const TOWER_FLOORS = (f: number, stage: number) => Math.round(f * [0.55, 1, 1.25][stage - 1])

/** High-density residential's look (`./index`). */
export const look: Look = { landmarks: true, fill: towers }

/**
 * High-density residential: a pale residential tower on each large lot, with room around it. It stands at 55% of its
 * floors at Stage 1 and 125% at Stage 3, with the finish its Stage gives it (`residentialTower`).
 */
function towers(g: ZoneGround) {
  const { kit } = g
  const { podium, most, gap } = TOWERS
  const stood: { lot: number; podium: RowLot }[] = []
  for (const [i, lot] of lotsOf(g, TOWERS.margin, TOWERS.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [Math.min(most[0], lot.x1 - lot.x0 - 2 * gap), Math.min(most[1], lot.y1 - lot.y0 - 2 * gap)]
    const base = fit(g, x, y, w + 2 * podium, d + 2 * podium, TOWERS.clear, TOWERS.least + 2 * podium, 2.5, 2)
    if (!base) continue
    kit.lot(i, lot)
    const floors = Math.round(kit.range(...TOWERS.floors))
    // A helipad and beacons on the roofs of the tallest (#155), by the floors each tower draws for Stage 2.
    const tallest = (from: readonly number[], stage: number) => stage > 1 && floors >= from[stage - 2]
    const rooftop = (stage: number) => ({ pad: tallest(HIGH.pad, stage), beacon: tallest(HIGH.beacon, stage) })
    kit.staged((stage) =>
      residentialTower(kit, x, y, KERB, base.w - 2 * podium, base.d - 2 * podium, TOWER_FLOORS(floors, stage), stage, rooftop(stage)),
    )
    stood.push({ lot: i, podium: { x, y, w: base.w, d: base.d, ry: 0, onRoad: false } })
  }
  // Then a playground or a garden at each tower's foot, on its tower's lot, once every podium has taken its ground.
  const taken: RowLot[] = [
    ...g.lamps.map(({ x, y }) => ({ x, y, w: 1.4, d: 1.4, ry: 0, onRoad: false })),
    ...stood.map(({ podium: p }) => ({ ...p, w: p.w + 2 * HIGH.foot.apart, d: p.d + 2 * HIGH.foot.apart })),
  ]
  for (const [k, { lot, podium }] of stood.entries()) {
    kit.lot(lot)
    towerFoot(g, podium, taken, taken[g.lamps.length + k])
  }
  kit.lot(-1)
}

/**
 * A playground or a garden at the foot of the tower whose podium is `podium` (#155): along the first side of the
 * podium with room for one, the sides the default camera sees first, as large as there is room for, up to
 * `HIGH.foot`'s, on the Block and clear of everything `taken` but the podium's own ground `own`, which it then takes.
 * Which it is, and each piece of it, is drawn from where it stands. With the Stage:
 * - Stage 1: a bench against the podium.
 * - Stage 2: a playground's soft ground, slide and swings, or a garden's lawn, a flower bed and a bench.
 * - Stage 3: a sandbox and a spring rider in the playground, or a tree, a second bed and a second bench in the garden.
 */
function towerFoot(g: ZoneGround, podium: RowLot, taken: RowLot[], own: RowLot) {
  const { kit } = g
  const { x, y, w, d } = podium
  const { long, deep, least, shallow, off, paved } = HIGH.foot
  // Each side: the way out of it (as a front faces), how far out the podium's edge is, and how long the side is.
  const sides = [
    { ry: Math.PI, edge: d / 2, len: w },
    { ry: -Math.PI / 2, edge: w / 2, len: d },
    { ry: Math.PI / 2, edge: w / 2, len: d },
    { ry: 0, edge: d / 2, len: w },
  ]
  /** The ground `l` along side `side`'s podium edge and `dep` out from it, if it is free. */
  const room = (side: (typeof sides)[number], l: number, dep: number): RowLot | null => {
    const c = turned(x, y, side.ry, 0, side.edge + off + dep / 2)
    const ground = { x: c.x, y: c.y, w: l, d: dep, ry: side.ry, onRoad: false }
    if (!stands(g, c.x, c.y, l, dep, 0.6, side.ry)) return null
    return taken.some((o) => o !== own && overlap(o, ground)) ? null : ground
  }
  for (const side of sides) {
    for (let dep = deep; dep >= shallow; dep -= 0.5) {
      for (let l = Math.min(long, side.len + 2); l >= least; l -= 1) {
        const c = room(side, l, dep)
        if (!c) continue
        taken.push(c)
        const { ry } = side
        const piece = (stage: number, lx: number, ly: number, fn: (p: Vec) => void) => {
          const p = turned(c.x, c.y, ry, lx, ly)
          kit.from(stage, () => fn(p), spot(p.x, p.y))
        }
        // The soft ground or the lawn runs from `a` to `b` along the podium, and the last `paved` m stay paved.
        const [a, b] = [-l / 2, l / 2 - paved]
        const [mid, out, inner] = [(a + b) / 2, dep / 2, -dep / 2]
        const playground = mulberry32(spot(c.x, c.y))() < 0.5
        piece(1, b + paved / 2, inner + 0.6, (p) => kit.bench(p.x, p.y, KERB, ry))
        if (playground) {
          piece(2, mid, 0, (p) => kit.surface(p.x, p.y, KERB, b - a, dep, ry))
          piece(2, a + 2.3, out - 1.3, (p) => kit.slide(p.x, p.y, KERB + 0.1, ry))
          if (b - a >= 5.8) piece(2, b - 2.1, -0.2, (p) => kit.swings(p.x, p.y, KERB + 0.1, ry))
          piece(3, a + 1.3, inner + 1, (p) => kit.sandbox(p.x, p.y, KERB + 0.1, 1.8, 1.4, ry))
          piece(3, b - 0.8, out - 0.8, (p) => kit.rider(p.x, p.y, KERB + 0.1, ry))
        } else {
          const blooms = ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0']
          piece(2, mid, 0, (p) => kit.surface(p.x, p.y, KERB, b - a, dep, ry, LAWN))
          piece(2, a + 0.7, 0, (p) => kit.flowerBed(p.x, p.y, KERB + 0.1, 1, dep - 1.2, ry, kit.pick(blooms)))
          piece(2, a + 2.4, out - 0.6, (p) => kit.bench(p.x, p.y, KERB + 0.1, ry + Math.PI))
          piece(3, mid + 0.5, -0.4, (p) => kit.tree(p.x, p.y, KERB + 0.1, kit.range(0.42, 0.5), kit.chance(0.4) ? 'sakura' : 'round'))
          piece(3, (a + 1.6 + b - 0.4) / 2, inner + 0.7, (p) => kit.flowerBed(p.x, p.y, KERB + 0.1, b - a - 2, 1, ry, kit.pick(blooms)))
          piece(3, b - 1.2, out - 0.6, (p) => kit.bench(p.x, p.y, KERB + 0.1, ry + Math.PI))
        }
        return
      }
    }
  }
}

// The residential tower: its palette and its builder, beside the fill that lays it (#207).
const { bush: BUSH, cone12: CONE, cylinder: CYLINDER, sphere: SPHERE } = SHAPES
const TAU = Math.PI * 2
// High-density residential: pale walls, so the towers read as homes beside the offices' glass, and white or stone trim.
const FLATS = { walls: ['#fbf3e6', '#eef5f0', '#f4eefb', '#fdf0e2', '#eaf3f8', '#f8eef0'], trims: ['#ffffff', '#e9e4da', '#d9e3ea'] }
const POTS = ['#d09c53', '#c49a6c', '#e9e4da'] // balcony plants' pots (#155)
const BEACON = { mast: 2.2, r: 0.85 } // a roof beacon's mast, m tall, and its bulb's radius

/**
 * A residential tower at Stage `stage`, of `floors` storeys on a footprint `w` (east–west) by `d`, centred on
 * `(x, y)`, as one brick: a podium with a lit lobby, a pale wall with windows lit or dark one by one, a stack of
 * balconies up the middle of its two long faces, and on its roof a water tank. The caller gives each Stage its floors,
 * and says whether its roof is a helipad and has beacons (#155). Some balconies have plants in pots, washing on a
 * pole or a futon over the railing (#155), each balcony's drawn from where it stands; washing and futons sway in the
 * wind (`../movers`) and ride its brick.
 * - Stage 1: a bare roof but for the tank, and plants on a few balconies.
 * - Stage 2: a little garden on the roof; plants on more balconies, and washing out on some.
 * - Stage 3: a band of trim round the wall every four floors, a crown of lit glass under a deeper cap, and a bigger
 *   roof garden; more plants and washing, and futons aired on a few balconies.
 *
 * A helipad takes the whole roof, with no tank or garden, and a beacon stands at a corner, or at two opposite ones
 * round a helipad.
 */
function residentialTower(
  kit: Kit,
  x: number,
  y: number,
  h: number,
  w: number,
  d: number,
  floors: number,
  stage = 2,
  rooftop: { pad?: boolean; beacon?: boolean } = {},
) {
  const [colour, trim] = [kit.pick(FLATS.walls), kit.pick(FLATS.trims)]
  kit.formed('tower')
  // Its balconies' plants, washing and futons (#155), each balcony's drawn from where it stands, so the tower's own
  // stream is untouched: the share of balconies with each at this Stage.
  const [plants, washing, futons] = [
    [0.12, 0.3, 0.4],
    [0, 0.16, 0.24],
    [0, 0, 0.1],
  ].map((shares) => shares[stage - 1])
  const STOREY = 3.1
  const base = h + 4.2
  const top = base + floors * STOREY
  kit.add(kit.box(w + 2.4, 4.2, d + 2.4, 1, 0.2), trim, x, y, h)
  for (const side of [-1, 1])
    kit.add(kit.cuboid(w * 0.55, 2.6, 0.3), { material: kit.glass, tint: kit.windows[0] }, x, y + side * (d / 2 + 1.2), h + 0.5)
  kit.add(kit.box(w, floors * STOREY, d, 0.9, 0.2), colour, x, y, base)
  const long = w >= d // the balconies go up the middle of the long faces
  for (const [nx, ny] of FACES) {
    const balconied = (nx === 0) === long
    const n = Math.floor(((nx === 0 ? w : d) - 2) / 3)
    const ry = Math.atan2(-nx, ny)
    for (let i = 0; i < n; i++) {
      const t = -(n - 1) * 1.5 + i * 3
      if (balconied && Math.abs(t) < 2.6) continue
      const [fx, fy] = nx === 0 ? [x + t, y + (ny * d) / 2] : [x + (nx * w) / 2, y + t]
      for (let f = 0; f < floors; f++) kit.add(kit.cuboid(1.3, 1.6, 0.3), kit.pane(0.6), fx, fy, base + 0.8 + f * STOREY, ry)
    }
    if (!balconied) continue
    // On every floor, from the middle of the face: a balcony's floor, the railing at its edge, and a glass door.
    const [mx, my] = [x + (nx * w) / 2, y + (ny * d) / 2]
    for (let f = 0; f < floors; f++) {
      const at = base + f * STOREY + 0.1
      kit.local(kit.cuboid(4.6, 0.24, 1.5), trim, mx, my, ry, 0, 0.75, at)
      kit.local(kit.cuboid(4.6, 1, 0.14), trim, mx, my, ry, 0, 1.45, at + 0.24)
      kit.local(kit.cuboid(3.6, 2.2, 0.3), kit.pane(0.55), mx, my, ry, 0, 0, at + 0.3)
      const draw = mulberry32(spot(mx, my) ^ Math.imul(f + 1, 0x2c1b3c6d))
      const [green, wash, airing, side, kind] = [draw(), draw(), draw(), draw() < 0.5 ? 1 : -1, draw()]
      if (green < plants) {
        // A plant or two in pots by the railing, peeping over it.
        for (const k of green < plants / 3 ? [side, -side] : [side]) {
          const [px, py] = to(mx, my, ry, k * 1.75, 1.0)
          kit.add(kit.cuboid(0.56, 0.5, 0.56), POTS[Math.floor(kind * 3)], px, py, at + 0.24)
          kit.add(BUSH, LEAVES.round[Math.floor(kind * 5)], px, py, at + 1.05, kind * TAU, 0.5, 0.48, 0.5)
        }
      }
      if (wash < washing) kit.sway('laundry', ...to(mx, my, ry, 0, 1.25), at + 2.75, ry + (kind < 0.5 ? 0 : Math.PI))
      if (airing < futons)
        kit.sway('futon', ...to(mx, my, ry, -side * 1.2, 1.45), at + 1.24, ry, { paint: FUTONS[Math.floor(kind * FUTONS.length)] })
    }
  }
  if (stage === 3) {
    // A band of trim every four floors, and a crown: the top floor's glass all round, lit at night.
    for (let f = 4; f < floors - 1; f += 4) kit.add(kit.cuboid(w + 0.5, 0.5, d + 0.5), trim, x, y, base + f * STOREY - 0.25)
    kit.add(kit.box(w + 0.16, 1.8, d + 0.16, 0.9, 0.08), { material: kit.glass, tint: kit.windows[1] }, x, y, top - 2.3)
  }
  // A cap over the roof, and on it a water tank and a garden.
  const cap = stage === 3 ? 2 : 1.2
  kit.add(kit.box(w + 0.3, cap, d + 0.3, 1, 0.12), trim, x, y, top)
  const roof = top + cap - 0.3
  // A beacon at a corner of the roof (#155), and at the opposite one too round a helipad.
  if (rooftop.beacon) {
    for (const k of rooftop.pad ? [1, -1] : [1]) {
      const [bx, by] = [x + k * (w / 2 - 0.75), y + k * (d / 2 - 0.75)]
      kit.add(CYLINDER, PLANT, bx, by, roof, 0, 0.1, BEACON.mast, 0.1)
      kit.beacon(bx, by, roof + BEACON.mast + 0.8 * BEACON.r, BEACON.r)
    }
  }
  if (rooftop.pad) {
    // The helipad takes the whole roof (#155).
    kit.helipad(x, y, roof + 0.25, Math.min(w, d) / 2 - 1.3)
    kit.shadow(x, y, h, w * 1.4 + 3, d * 1.4 + 3)
    return kit.brick('building', x, y, h)
  }
  kit.add(CYLINDER, TANK.body, x - w * 0.22, y + d * 0.2, roof, 0, 1.3, 2.4, 1.3)
  kit.add(CONE, TANK.lid, x - w * 0.22, y + d * 0.2, roof + 2.4, 0, 1.4, 0.9, 1.4)
  if (stage > 1) {
    const [gw, gd] = stage === 3 ? [w * 0.5, d * 0.5] : [w * 0.36, d * 0.3]
    kit.add(kit.box(gw, 0.5, gd, 0.3, 0.1), GARDEN.lawn, x + w * 0.18, y - d * 0.16, roof)
    const bushes = stage === 3 ? [-1.5, -0.5, 0.5, 1.5] : [-1, 1]
    for (const k of bushes) kit.add(SPHERE, LEAVES.round[1], x + w * (0.18 + 0.08 * k), y - d * 0.16, roof + 0.6, 0, 0.9, 0.8, 0.9)
  }
  kit.shadow(x, y, h, w * 1.4 + 3, d * 1.4 + 3)
  kit.brick('building', x, y, h)
}
