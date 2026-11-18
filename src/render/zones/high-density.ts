import { mulberry32 } from '../../sim/demand'
import type { Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { spot } from '../kit'
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
 * floors at Stage 1 and 125% at Stage 3, with the finish its Stage gives it (the kit's `residentialTower`).
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
      kit.residentialTower(x, y, KERB, base.w - 2 * podium, base.d - 2 * podium, TOWER_FLOORS(floors, stage), stage, rooftop(stage)),
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
