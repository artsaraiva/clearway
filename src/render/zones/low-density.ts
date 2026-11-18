import { mulberry32 } from '../../sim/demand'
import type { Bounds } from '../../sim/geometry'
import { KERB } from '../blocks'
import { spot, type Hung, type Kit } from '../kit'
import { distance, fit, lotsOf, turned, type Look, type ZoneGround } from './ground'

// Low-density residential: lots at most 15.2 m on a side, 2.8 m in from the Block's bounding box. A lawn fills each
// lot but for 0.4 m on every side, at least 7 m across and 0.6 m in from the Block's edge, and a house of at most
// 10.5 m stands on it 1.2 m in from the lawn's edge.
const HOUSES = { lot: 15.2, margin: 2.8, gap: 0.4, least: 7, clear: 0.6, yard: 1.2, most: 10.5 }
// Low-density details (#157), each lot's drawn from where it stands, so that nothing else on the Block draws
// differently. A house's front, with its door, faces the nearest edge of its Block. Some lots have a kei car, which
// parks nose to the front from Stage 2 or 3, and some gardens a laundry pole, more with each Stage. Where the lawn spans
// `room` m or more, the house stands aside for them, leaving a side yard on the side the default camera sees, `wide` m
// across for a car's drive and `narrow` for a laundry pole alone. Some roofs carry solar panels.
const HOMES = {
  drive: 0.5,
  wide: 3.1,
  narrow: 2.5,
  room: 12.2,
  car: 0.6, // of the drives, the share with a car from Stage 2; the rest have theirs from Stage 3
  solar: [0.22, 0.5], // of the roofs, the share with panels from Stage 2, and from Stage 3
  laundry: [0.12, 0.3, 0.5], // of the gardens, the share with a laundry pole from Stage 1, from 2, and from 3
  futon: 0.45, // of the laundry poles, the share that airs a futon at Stage 3
  half: 1.7, // m: half a kei car's length
} as const
// How big a lot left to a tree grows at each Stage, as a share of a full tree.
const SAPLING = [0.5, 0.75, 1]

/** Low-density residential's look (`./index`). */
export const look: Look = { landmarks: false, fill: houses }

/**
 * Low-density residential: a house on a lawn on each lot, and the odd lot left to a tree. Stage 1 builds a cottage on
 * a bare lawn, and a sapling on a lot left to a tree; from Stage 2 most gardens have a tree; Stage 3 adds a storey, a
 * chimney, a hedge round the garden and, in half the gardens, a second tree. Each house has its details (#157, `homeOf`
 * and `homeDetails`), more with each Stage:
 * - Stage 1: a front door, a pot plant by it, and laundry in a few gardens.
 * - Stage 2: a bicycle and a second pot by the door, kei cars on most drives, solar panels on some roofs, and laundry in
 *   more gardens.
 * - Stage 3: a third pot in flower, a car on every drive, panels on half the roofs, laundry in half the gardens and a
 *   futon airing on some of it, and the hedge open at the door and the drive.
 */
function houses(g: ZoneGround) {
  const { kit } = g
  const ground = KERB + 0.16 // on the lawn
  for (const [i, lot] of lotsOf(g, HOUSES.margin, HOUSES.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const lawn = fit(g, x, y, lot.x1 - lot.x0 - 2 * HOUSES.gap, lot.y1 - lot.y0 - 2 * HOUSES.gap, HOUSES.clear, HOUSES.least, 1.6, 3)
    if (!lawn) continue
    kit.lot(i, lot)
    const { w, d } = lawn
    kit.from(1, () => {
      kit.lawn(x, y, KERB, w, d)
      kit.brick('ground', x, y, KERB)
    })
    if (kit.chance(0.1)) {
      kit.staged((stage) => kit.tree(x, y, ground, SAPLING[stage - 1] * kit.range(0.7, 0.95), 'round'))
      continue
    }
    const home = homeOf(g, x, y, w, d)
    kit.staged((stage) => kit.house(home.x, home.y, ground, home.w, home.d, stage, { front: home.front, solar: stage >= home.solar }))
    const [sx, sy] = [kit.chance(0.5) ? 1 : -1, kit.chance(0.5) ? 1 : -1]
    // A garden tree keeps off the drive and the laundry pole on it.
    const { pad, pole } = home
    const free = (px: number, py: number) => {
      if (home.car < 4 && px > pad.x0 - 1.2 && px < pad.x1 + 1.2 && py > pad.y0 - 1.2 && py < pad.y1 + 1.2) return false
      if (!pole || home.laundry > 3) return true
      const [a, b] = [turned(pole.x, pole.y, pole.ry, -pole.len / 2, 0), turned(pole.x, pole.y, pole.ry, pole.len / 2, 0)]
      return distance({ x: px, y: py }, a, b) > 1.4
    }
    kit.from(2, () => {
      const [px, py] = [x + sx * (w / 2 - 1.4), y + sy * (d / 2 - 1.4)]
      if (kit.chance(0.6) && free(px, py)) kit.tree(px, py, ground, kit.range(0.45, 0.65), kit.chance(0.2) ? 'sakura' : 'round')
    })
    kit.from(3, () => {
      const [px, py] = [x - sx * (w / 2 - 1.4), y - sy * (d / 2 - 1.4)]
      if (kit.chance(0.5) && free(px, py)) kit.tree(px, py, ground, kit.range(0.4, 0.55), kit.chance(0.3) ? 'sakura' : 'round')
    })
    // The hedge opens on the front, at the door and at the drive.
    const along = (px: number, py: number) => (home.front % 2 ? px - x : py - y)
    const gaps = [{ side: home.front, at: along(home.x, home.y), wide: 2.4 }]
    if (home.car < 4) {
      const wide = home.front % 2 ? pad.x1 - pad.x0 : pad.y1 - pad.y0
      gaps.push({ side: home.front, at: along((pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2), wide: wide + 0.3 })
    }
    kit.from(3, () => kit.hedge(x, y, ground, w, d, gaps))
    homeDetails(kit, home, ground)
  }
  kit.lot(-1)
}

/** The way the wall on a side of a lawn or a house faces, as the kit turns things: sides 0 east, 1 north, 2 west, 3 south. */
const facing = (side: number) => ((side - 1) * Math.PI) / 2

/** A house's plan on its lawn (#157), drawn from where the lawn lies. */
interface Home {
  /** The house's footprint, `w` by `d` centred on `(x, y)`. */
  x: number
  y: number
  w: number
  d: number
  /** The side its front door is on. */
  front: number
  /** The Stage its kei car comes at (4: none), parked at `park` on the drive `pad`. */
  car: number
  pad: Bounds
  park: { x: number; y: number; ry: number }
  /** The Stage its solar panels come at (4: none). */
  solar: number
  /**
   * The Stage its laundry pole comes at (4: none), and whether a futon airs there at Stage 3. The pole stands at `pole`
   * in the side yard, or else along the wall on side `line`, `out` m out from it.
   */
  laundry: number
  pole: { x: number; y: number; ry: number; len: number } | null
  line: number
  out: number
  futon: boolean
}

/**
 * The plan of a house on a lawn `w` by `d` centred on `(x, y)` (#157), drawn from where the lawn lies. Its front faces
 * the nearest edge of the Block. Where it has a kei car or a laundry pole and the lawn has room, the house stands aside
 * for a side yard on the side the default camera sees: the car parks at its front end, and the pole stands behind the
 * car or, with no car, in the middle. A laundry pole with no side yard stands along the wall of the side the camera sees
 * best that is not the front.
 */
function homeOf({ field }: ZoneGround, x: number, y: number, w: number, d: number): Home {
  const draw = mulberry32(spot(x, y))
  const [driving, parking, solar, washing, futon] = [draw(), draw(), draw(), draw(), draw()]
  const [s, l] = [HOMES.solar, HOMES.laundry]
  const laundry = washing < l[0] ? 1 : washing < l[1] ? 2 : washing < l[2] ? 3 : 4
  const near = [field.sample(x + w / 2, y), field.sample(x, y + d / 2), field.sample(x - w / 2, y), field.sample(x, y - d / 2)]
  const front = [3, 0, 1, 2].reduce((best, n) => (near[n] < near[best] - 0.5 ? n : best))
  let [hx, hy, hw, hd] = [x, y, Math.min(w - 2 * HOUSES.yard, HOUSES.most), Math.min(d - 2 * HOUSES.yard, HOUSES.most)]
  const side = front % 2 ? 0 : 3
  const room = (side % 2 ? d : w) >= HOMES.room
  const car = driving < HOMES.drive && room ? (parking < HOMES.car ? 2 : 3) : 4
  const aside = room && (car < 4 || laundry < 4)
  const wide = car < 4 ? HOMES.wide : HOMES.narrow
  // The side yard, from the front of the lawn to its back.
  let strip: Bounds | null = null
  if (aside && side === 0) {
    hw = Math.min(hw, w - HOUSES.yard - wide - 0.3)
    hx = Math.min(x, x + w / 2 - wide - 0.3 - hw / 2)
    strip = { x0: hx + hw / 2 + 0.15, x1: x + w / 2 - 0.15, y0: y - d / 2, y1: y + d / 2 }
  } else if (aside) {
    hd = Math.min(hd, d - HOUSES.yard - wide - 0.3)
    hy = Math.max(y, y - d / 2 + wide + 0.3 + hd / 2)
    strip = { x0: x - w / 2, x1: x + w / 2, y0: y - d / 2 + 0.15, y1: hy - hd / 2 - 0.15 }
  }
  const ry = facing(front)
  const span = (front % 2 ? d : w) / 2 // the lawn's half depth, front to back
  let [pad, park] = [{ x0: x, y0: y, x1: x, y1: y } as Bounds, { x, y, ry }]
  let pole: Home['pole'] = null
  if (strip) {
    const mid = { x: (strip.x0 + strip.x1) / 2, y: (strip.y0 + strip.y1) / 2 }
    /** The point in the middle of the side yard `back` m in from the front of the lawn. */
    const inFrom = (back: number) => turned(mid.x, mid.y, ry, 0, span - back)
    if (car < 4) {
      const [a, b] = [inFrom(0), inFrom(4.8)]
      pad =
        front % 2
          ? { ...strip, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }
          : { ...strip, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) }
      park = { ...inFrom(0.5 + HOMES.half), ry }
    }
    const [from, to] = car < 4 ? [5.2, 2 * span - 0.6] : [0.6, 2 * span - 0.6]
    if (to - from >= 1.6) pole = { ...inFrom((from + to) / 2), ry: ry + Math.PI / 2, len: Math.min(3.4, to - from) }
  }
  const line = [3, 0, 1, 2].find((n) => n !== front && !(strip && n === side))!
  const gap = [x + w / 2 - hx - hw / 2, y + d / 2 - hy - hd / 2, hx - hw / 2 - x + w / 2, hy - hd / 2 - y + d / 2][line]
  return {
    ...{ x: hx, y: hy, w: hw, d: hd, front, car, pad, park, pole, laundry, line },
    out: Math.max(0.7, gap / 2),
    solar: solar < s[0] ? 2 : solar < s[1] ? 3 : 4,
    futon: futon < HOMES.futon,
  }
}

/**
 * A house's details (#157), each drawn from where it stands: its kei car on its drive; pot plants and a bicycle by its
 * front door, which move out with the wall as the house grows; and a laundry pole in its side yard or, with none, along
 * the wall of a free side, moving out with it too.
 */
function homeDetails(kit: Kit, home: Home, ground: number) {
  const { x, y, w, d, front, pad, park } = home
  if (home.car < 4) {
    kit.from(
      home.car,
      () => {
        kit.drive((pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2, ground, pad.x1 - pad.x0, pad.y1 - pad.y0)
        kit.keiCar(park.x, park.y, ground + 0.05, park.ry)
      },
      spot(park.x, park.y),
    )
  }
  /** Where the middle of the house's wall on side `side` stands at Stage `stage`, `out` m out from it. */
  const wall = (side: number, stage: number, out: number) => {
    const k = stage === 1 ? 0.7 : 1
    return turned(x, y, facing(side), 0, ((side % 2 ? d : w) / 2) * k + out)
  }
  kit.staged(
    (stage) => {
      const at = wall(front, stage, 0)
      kit.porch(at.x, at.y, ground, facing(front), stage)
    },
    spot(x, y + 0.5),
  )
  if (home.laundry > 3) return
  kit.staged(
    (stage) => {
      const washing = kit.washing()
      if (stage < home.laundry) return
      const k = stage === 1 ? 0.7 : 1
      const along = home.pole ?? { ...wall(home.line, stage, home.out), ry: facing(home.line), len: (home.line % 2 ? w : d) * k - 0.8 }
      const len = Math.min(3.4, along.len)
      if (len < 1.6) return
      const futon = stage === 3 && home.futon
      const quilt = 1.7 // m wide: `./movers`' futon
      const n = Math.floor(len / 0.85)
      const hung: Hung[] = []
      for (let j = 0; j < n; j++) {
        const at = -len / 2 + ((j + 0.5) * len) / n
        if (futon && Math.abs(at) - washing.items[j].w / 2 < quilt / 2) continue
        hung.push({ at, ...washing.items[j] })
      }
      if (futon) hung.push({ at: 0, w: quilt, tall: 1.05, colour: washing.futon, futon: true })
      kit.laundry(along.x, along.y, ground, along.ry, len, hung)
    },
    spot(x + 0.5, y),
  )
}
