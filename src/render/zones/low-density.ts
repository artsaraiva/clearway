import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Bounds } from '../../sim/geometry'
import { KERB } from '../blocks'
import { KEI } from '../cars'
import { GARDEN, SHAPES, spot, to, type HousePlan, type HouseRoof, type Hung, type Kit } from '../kit'
import { PATTERN } from '../pattern'
import { bench, gardenShed, stoneLantern } from '../props'
import type { Footprint } from '../streets'
import { distance, fit, lotsOf, turned, type Look, type RowLot, type ZoneGround } from './ground'
import { beside, kerbAhead, placeScenes, sceneOrder, type Scene } from './scenes'

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
// Low-density residential to the level of finish (#179). Each Block's plan is drawn from a stream of its own, so the
// kit's draws, and with them every lot's house, its colours and its size, are as before but for what the plan sets: a
// house's roof, a gable along its long side as before unless a house on a lot beside it has one, when it takes another
// that none of them has; and the lots the Block's scenes take, whose houses are not built.
const LOW_FINISH = {
  roofs: ['gable', 'front', 'hip', 'L'] as HouseRoof[],
  scenes: ['koi', 'paddling', 'kennel', 'persimmon', 'barbecue'] as LowScene[],
  second: 2500,
  // A low wall of concrete blocks along each lawn's front, m tall and thick, with its cap; the gap at its gate, the
  // gate's posts and its letter box; and the stepping stones from the gate to the door.
  wall: { tall: 0.8, thick: 0.18, colour: '#d6d0c5', cap: '#e8e3da', gate: 1.2, post: '#c2bbaf', box: '#4a525c' },
  stones: '#c9c1b3',
  // A flower border inside the wall from Stage 2, m deep, its soil and blooms; and a vegetable patch where a yard has
  // room, its soil and its rows of greens.
  border: { deep: 0.55, soil: '#8a7560', blooms: ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0'] },
  patch: { soil: '#8a7560', greens: ['#6bc357', '#85cf61', '#5fbc51'] },
  // Of the houses from Stage 2, the share with a shed where one fits, flying carp where a pole fits (largest first,
  // in these colours), and with a cat walking its wall, in one of these coats.
  sheds: 0.4,
  carp: 0.18,
  carps: ['#3a3f4b', '#e8919c', '#2fb39a'],
  cats: 0.22,
  coats: ['#e3a35e', '#9aa0a8', '#3a3a40', '#f4f1ea', '#c9b393'],
  // A carport over a car's drive at Stage 3: its steel and its pale roof.
  carport: { steel: '#9aa3ad', roof: '#e3e9ee' },
}

/** Low-density residential's look (`./index`). */
export const look: Look = { landmarks: false, finish: true, fill: houses }

/** A lawn on a lot (#179): `w` (east–west) by `d`, centred on `(x, y)`. */
interface Lawn {
  x: number
  y: number
  w: number
  d: number
}

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
 * To the level of finish (#179), each house is built to its plan (`housePlan`) and its garden laid out round it
 * (`garden`); a low block wall runs along every lawn's front, and each Block has its scenes (`lowScenes`).
 */
function houses(g: ZoneGround) {
  const { kit, block } = g
  const ground = KERB + 0.16 // on the lawn
  const lots = lotsOf(g, HOUSES.margin, HOUSES.lot)
  const lawns = lots.map((lot): Lawn | null => {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const lawn = fit(g, x, y, lot.x1 - lot.x0 - 2 * HOUSES.gap, lot.y1 - lot.y0 - 2 * HOUSES.gap, HOUSES.clear, HOUSES.least, 1.6, 3)
    return lawn && { x, y, ...lawn }
  })
  const centre = middle(block)
  const plans = mulberry32(spot(centre.x, centre.y) ^ 0x51d0e9) // the plans' own stream: the kit's draws as they did
  const scenes = kit.finished ? lowScenes(g, lots, lawns, plans) : []
  const sceneOn = new Map(scenes.map((s) => [s.lot, s]))
  const roofs: (HouseRoof | null)[] = [] // each lot's house's roof, null for none
  for (const [i, lot] of lots.entries()) {
    const lawn = lawns[i]
    if (!lawn) {
      roofs.push(null)
      continue
    }
    const { x, y, w, d } = lawn
    kit.lot(i, lot)
    kit.from(1, () => {
      kit.lawn(x, y, KERB, w, d)
      kit.brick('ground', x, y, KERB)
    })
    const tree = kit.chance(0.1)
    const scene = sceneOn.get(i)
    if (scene || tree) roofs.push(null)
    if (scene) {
      for (let k = tree ? 1 : 6; k > 0; k--) kit.range(0, 1) // the draws its tree or house took, so every lot after keeps its draws
      const { kind, ground: l, from } = scene
      kit.scene(kind, () => kit.staged((stage) => lowScene(kit, kind, l, stage, from), spot(l.x, l.y)))
      frontage(kit, l, ground, 0, null)
      continue
    }
    if (tree) {
      kit.staged((stage) => kit.tree(x, y, ground, SAPLING[stage - 1] * kit.range(0.7, 0.95), 'round', kit.finished))
      if (kit.finished) frontage(kit, groundOf(g, lawn), ground, 0, null)
      continue
    }
    const home = homeOf(g, x, y, w, d)
    const plan = kit.finished ? housePlan(lots, i, home.front, roofs, plans) : undefined
    roofs.push(plan?.roof ?? null)
    kit.staged((stage) => kit.house(home.x, home.y, ground, home.w, home.d, stage, { front: home.front, solar: stage >= home.solar, plan }))
    const [sx, sy] = [kit.chance(0.5) ? 1 : -1, kit.chance(0.5) ? 1 : -1]
    // The seeds of the garden's trees, drawn as `kit.from` draws them, so that where each stands is known at every Stage.
    const seeds = [kit.range(0, 1), kit.range(0, 1)].map((r) => (r * 4294967296) >>> 0)
    // A garden tree keeps off the house, its drive and the laundry pole on it; where the garden is finished, it stands
    // in the corner it always took if the ground there is clear of the house, the hedge and the rest by 1.3 m, or else
    // in the clear ground nearest it.
    const plot = kit.finished ? plotOf(home, lawn) : null
    const { pad, pole } = home
    const free = (px: number, py: number) => {
      if (home.car < 4 && px > pad.x0 - 1.2 && px < pad.x1 + 1.2 && py > pad.y0 - 1.2 && py < pad.y1 + 1.2) return false
      if (!pole || home.laundry > 3) return true
      const [a, b] = [turned(pole.x, pole.y, pole.ry, -pole.len / 2, 0), turned(pole.x, pole.y, pole.ry, pole.len / 2, 0)]
      return distance({ x: px, y: py }, a, b) > 1.4
    }
    const corners = [
      { x: x + sx * (w / 2 - 1.4), y: y + sy * (d / 2 - 1.4) },
      { x: x - sx * (w / 2 - 1.4), y: y - sy * (d / 2 - 1.4) },
    ]
    const trees = corners.map((c, k) => {
      if (mulberry32(seeds[k])() >= [0.6, 0.5][k]) return null // as the tree's own stream first draws
      if (!plot) return free(c.x, c.y) ? c : null
      const [cu, cv] = plot.local(c.x, c.y)
      const near = plot.clear(c.x, c.y, 1.2, 1.2, 0.5) ? c : ((s) => s && plot.at(s.u, s.v))(spotIn(plot, 1.2, 1.2, 0.5, cu, cv))
      if (near) plot.take(plot.around(near.x, near.y, 0.7))
      return near
    })
    kit.from(
      2,
      () => {
        const t = trees[0]
        if (kit.chance(0.6) && t) kit.tree(t.x, t.y, ground, kit.range(0.45, 0.65), kit.chance(0.2) ? 'sakura' : 'round', kit.finished)
      },
      seeds[0],
    )
    kit.from(
      3,
      () => {
        const t = trees[1]
        if (kit.chance(0.5) && t) kit.tree(t.x, t.y, ground, kit.range(0.4, 0.55), kit.chance(0.3) ? 'sakura' : 'round', kit.finished)
      },
      seeds[1],
    )
    // The hedge opens on the front, at the door and at the drive; where the garden is finished, a low wall runs along
    // the front instead, and the hedge opens along the drive.
    const along = (px: number, py: number) => (home.front % 2 ? px - x : py - y)
    const gaps = [{ side: home.front, at: along(home.x, home.y), wide: 2.4 }]
    if (home.car < 4) {
      const wide = home.front % 2 ? pad.x1 - pad.x0 : pad.y1 - pad.y0
      gaps.push({ side: home.front, at: along((pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2), wide: wide + 0.3 })
    }
    if (plot) {
      gaps.splice(0, gaps.length, { side: home.front, at: 0, wide: 2 * Math.max(w, d) })
      // The hedges down the sides, which run the lawn's whole depth when it faces north or south, stop short of the wall.
      if (home.front % 2) for (const side of [0, 2]) gaps.push({ side, at: (home.front === 1 ? 1 : -1) * (d / 2 - 0.3), wide: 0.66 })
      if (home.car < 4) {
        const side = home.front % 2 ? 0 : 3 // the side yard's side
        const long = side % 2 ? pad.x1 - pad.x0 : pad.y1 - pad.y0
        gaps.push({ side, at: side % 2 ? (pad.x0 + pad.x1) / 2 - x : (pad.y0 + pad.y1) / 2 - y, wide: long + 0.6 })
      }
    }
    kit.from(3, () => kit.hedge(x, y, ground, w, d, gaps))
    homeDetails(kit, home, ground)
    if (plot) garden(kit, home, lawn, plot, ground)
  }
  kit.lot(-1)
}

/** The way the wall on a side of a lawn or a house faces, as the kit turns things: sides 0 east, 1 north, 2 west, 3 south. */
const facing = (side: number) => ((side - 1) * Math.PI) / 2

/** The side of a lawn `w` by `d` centred on `(x, y)` that faces the nearest edge of its Block (#157): 0 east, 1 north, 2 west, 3 south. */
function frontOf({ field }: ZoneGround, x: number, y: number, w: number, d: number): number {
  const near = [field.sample(x + w / 2, y), field.sample(x, y + d / 2), field.sample(x - w / 2, y), field.sample(x, y - d / 2)]
  return [3, 0, 1, 2].reduce((best, n) => (near[n] < near[best] - 0.5 ? n : best))
}

/** A lawn as ground facing its front (#179): `w` along its front, `d` deep. */
function groundOf(g: ZoneGround, { x, y, w, d }: Lawn): RowLot {
  const front = frontOf(g, x, y, w, d)
  return { x, y, w: front % 2 ? w : d, d: front % 2 ? d : w, ry: facing(front), onRoad: false }
}

/**
 * A house's plan (#179), on lot `i` of `lots`, its front facing `front`, the houses on the lots before it under `roofs`
 * (null where none stands): a gable along its long side, as the houses always had, unless a house on a lot beside it
 * (`beside`) has one, when it takes one of the others that none of them has, drawn from `plans`; and for an L, the side
 * of its back its second wing stands on. No two houses side by side are then the same building in another colour.
 * ponytail: a house beside houses under all four roofs keeps a gable. Ceiling: it matches one of them (the scene check's
 * rule 10). Upgrade: a fifth roof, such as a hip turned across the house.
 */
function housePlan(lots: Bounds[], i: number, front: number, roofs: (HouseRoof | null)[], plans: () => number): HousePlan {
  const near = roofs.flatMap((r, k) => (r && beside(lots[k], lots[i]) ? [r] : []))
  const free = LOW_FINISH.roofs.filter((r) => !near.includes(r))
  const pick = plans()
  const wing: 1 | -1 = plans() < 0.5 ? 1 : -1
  const roof = free.includes('gable') ? 'gable' : (free[Math.floor(pick * free.length)] ?? 'gable')
  return { front, roof, wing }
}

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
function homeOf(g: ZoneGround, x: number, y: number, w: number, d: number): Home {
  const draw = mulberry32(spot(x, y))
  const [driving, parking, solar, washing, futon] = [draw(), draw(), draw(), draw(), draw()]
  const [s, l] = [HOMES.solar, HOMES.laundry]
  const laundry = washing < l[0] ? 1 : washing < l[1] ? 2 : washing < l[2] ? 3 : 4
  const front = frontOf(g, x, y, w, d)
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
 * the wall of a free side, moving out with it too. To the level of finish (#179) the car is the cars' kei wagon in their
 * paints, and the pots and the bicycle are Close-only.
 */
function homeDetails(kit: Kit, home: Home, ground: number) {
  const { x, y, w, d, front, pad, park } = home
  if (home.car < 4) {
    kit.from(
      home.car,
      () => {
        kit.drive((pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2, ground, pad.x1 - pad.x0, pad.y1 - pad.y0)
        kit.parked(KEI, park.x, park.y, ground + 0.02, park.ry, KEI.paints[spot(park.x, park.y) % KEI.paints.length])
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
      kit.closeOnly(() => kit.porch(at.x, at.y, ground, facing(front), stage))
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
      const quilt = 1.7 // m wide: `../movers`' futon
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

/** A box on a lawn in the frame of its front (#179): `u` along the front from its middle, `v` out of the front. */
interface Patch {
  u0: number
  u1: number
  v0: number
  v1: number
}

/**
 * A house's garden as the ground left on its lawn (#179), in the frame of the lawn's front: the lawn's half-width along
 * its front and half-depth, the house's middle and its half-sizes in the same frame, and what stands on the lawn so far,
 * which `clear` keeps new things off and `take` adds to. A point in the frame is `at`'s on the map.
 */
interface Plot {
  ry: number
  hu: number
  hv: number
  house: Patch
  /** The drive, if the house has a car. */
  drive: Patch | null
  taken: Patch[]
  at: (u: number, v: number) => { x: number; y: number }
  /** The frame's `(u, v)` of the point `(px, py)` on the map. */
  local: (px: number, py: number) => [number, number]
  /** A square `side` m across round the point `(px, py)` on the map, in the frame. */
  around: (px: number, py: number, side: number) => Patch
  /** Whether a box `w` across by `d` deep round the point `(px, py)` on the map stands on the lawn clear of what is taken by `pad` m. */
  clear: (px: number, py: number, w: number, d: number, pad: number) => boolean
  take: (p: Patch) => void
}

/**
 * The ground a house leaves on its lawn (#179): the house at its largest, with the step before its door, its porch's
 * pots and bicycle and its back's AC unit; its drive and its laundry pole; the low wall along the front; and from Stage
 * 3 the hedge round the rest.
 */
function plotOf(home: Home, lawn: Lawn): Plot {
  const ry = facing(home.front)
  const [cu, cv] = [Math.cos(ry), Math.sin(ry)]
  /** The frame's `(u, v)` of a point on the map. */
  const local = (px: number, py: number) => [(px - lawn.x) * cu + (py - lawn.y) * cv, -(px - lawn.x) * cv + (py - lawn.y) * cu]
  const [hu, hv] = home.front % 2 ? [lawn.w / 2, lawn.d / 2] : [lawn.d / 2, lawn.w / 2]
  const [mu, mv] = local(home.x, home.y)
  const [au, av] = home.front % 2 ? [home.w / 2, home.d / 2] : [home.d / 2, home.w / 2]
  const house = { u0: mu - au, u1: mu + au, v0: mv - av, v1: mv + av }
  const boxOf = (b: Bounds): Patch => {
    const [p, q] = [local(b.x0, b.y0), local(b.x1, b.y1)]
    return { u0: Math.min(p[0], q[0]), u1: Math.max(p[0], q[0]), v0: Math.min(p[1], q[1]), v1: Math.max(p[1], q[1]) }
  }
  const taken: Patch[] = [
    { u0: house.u0 - 0.2, u1: house.u1 + 0.2, v0: house.v0 - 0.75, v1: house.v1 + 0.2 }, // its walls and its back's AC unit
    { u0: mu - 2.5, u1: mu + 2.5, v0: house.v1, v1: house.v1 + 1.1 }, // the step, the pots and the bicycle by its door
    { u0: -hu, u1: hu, v0: hv - 0.3, v1: hv }, // the wall along the front
    { u0: -hu, u1: -hu + 0.75, v0: -hv, v1: hv }, // the hedge round the rest, from Stage 3
    { u0: hu - 0.75, u1: hu, v0: -hv, v1: hv },
    { u0: -hu, u1: hu, v0: -hv, v1: -hv + 0.75 },
  ]
  const drive = home.car < 4 ? boxOf(home.pad) : null
  if (drive) taken.push({ u0: drive.u0 - 0.3, u1: drive.u1 + 0.3, v0: drive.v0 - 0.3, v1: drive.v1 + 0.3 })
  if (home.laundry < 4) {
    if (home.pole) {
      const { x, y, ry: r, len } = home.pole
      const [a, b] = [turned(x, y, r, -len / 2 - 0.3, -0.45), turned(x, y, r, len / 2 + 0.3, 0.45)]
      taken.push(boxOf({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }))
    } else {
      // Along the wall on side `line`, `out` m out from it, as long as the wall.
      const out = home.out + 0.5
      const [lu, lv] = [Math.cos(facing(home.line) - ry), Math.sin(facing(home.line) - ry)] // the line side's way out, in the frame
      if (Math.abs(lu) > 0.5)
        taken.push(
          lu < 0
            ? { u0: house.u0 - out, u1: house.u0, v0: house.v0, v1: house.v1 }
            : { u0: house.u1, u1: house.u1 + out, v0: house.v0, v1: house.v1 },
        )
      else if (Math.abs(lv) > 0.5)
        taken.push(
          lv < 0
            ? { u0: house.u0, u1: house.u1, v0: house.v0 - out, v1: house.v0 }
            : { u0: house.u0, u1: house.u1, v0: house.v1, v1: house.v1 + out },
        )
    }
  }
  return {
    ry,
    hu,
    hv,
    house,
    drive,
    taken,
    at: (u, v) => turned(lawn.x, lawn.y, ry, u, v),
    local: (px, py) => local(px, py) as [number, number],
    around(px, py, side) {
      const [u, v] = local(px, py)
      return { u0: u - side / 2, u1: u + side / 2, v0: v - side / 2, v1: v + side / 2 }
    },
    clear(px, py, w, d, pad) {
      const [u, v] = local(px, py)
      const box = { u0: u - w / 2 - pad, u1: u + w / 2 + pad, v0: v - d / 2 - pad, v1: v + d / 2 + pad }
      const inside = u - w / 2 >= -hu + 0.3 && u + w / 2 <= hu - 0.3 && v - d / 2 >= -hv + 0.3 && v + d / 2 <= hv - 0.3
      return inside && !taken.some((t) => meets(box, t))
    },
    take(p) {
      taken.push(p)
    },
  }
}

/** Whether two boxes in a lawn's frame overlap. */
const meets = (a: Patch, b: Patch) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1

/**
 * The first spot of `plot` for a box `w` across by `d` deep, clear by `pad`, on a grid of half-metre steps, nearest
 * first to the point `(pu, pv)` in its frame; null if none.
 */
function spotIn(plot: Plot, w: number, d: number, pad: number, pu: number, pv: number): { u: number; v: number } | null {
  const spots: { u: number; v: number }[] = []
  for (let u = -plot.hu + w / 2 + 0.3; u <= plot.hu - w / 2 - 0.3; u += 0.5)
    for (let v = -plot.hv + d / 2 + 0.3; v <= plot.hv - d / 2 - 0.3; v += 0.5) spots.push({ u, v })
  spots.sort((a, b) => Math.hypot(a.u - pu, a.v - pv) - Math.hypot(b.u - pu, b.v - pv))
  return (
    spots.find((s) => {
      const p = plot.at(s.u, s.v)
      return plot.clear(p.x, p.y, w, d, pad)
    }) ?? null
  )
}

/**
 * A house's garden to the level of finish (#179), round the house, its drive and its laundry as `plot` has them, each
 * drawn from where the lawn lies: a low block wall along the lawn's front with gate posts and a letter box at its gate
 * and stepping stones from the gate to the door (`frontage`); from Stage 2 a flower border inside the wall, a vegetable
 * patch where a yard has room, a steel shed on some, carp flying from a tall pole in some gardens and a cat walking the
 * wall on some; and at Stage 3 a carport over the car.
 */
function garden(kit: Kit, home: Home, lawn: Lawn, plot: Plot, ground: number) {
  const { ry, hu, hv, house } = plot
  const draw = mulberry32(spot(lawn.x, lawn.y) ^ 0x6a8d)
  const [shedRoll, carpRoll, catRoll, catSide] = [draw(), draw(), draw(), draw()]
  const l: RowLot = { x: lawn.x, y: lawn.y, w: 2 * hu, d: 2 * hv, ry, onRoad: false }
  const door = (house.u0 + house.u1) / 2
  const runs = frontage(kit, l, ground, door, plot.drive, house)
  // A flower border inside the wall from Stage 2, along the longest stretch of a run the step, the pots and the rest
  // leave clear.
  const [v0, v1] = [hv - 0.3 - LOW_FINISH.border.deep, hv - 0.3]
  const stretches = runs.flatMap((r) => {
    let parts = [{ u0: r.u0 + 0.2, u1: r.u1 - 0.2 }]
    for (const t of plot.taken)
      if (t.v0 < v1 && v0 < t.v1)
        parts = parts.flatMap((p) =>
          p.u1 <= t.u0 || t.u1 <= p.u0
            ? [p]
            : [
                { u0: p.u0, u1: t.u0 },
                { u0: t.u1, u1: p.u1 },
              ],
        )
    return parts.filter((p) => p.u1 - p.u0 >= 1.6)
  })
  const stretch = stretches.sort((a, b) => b.u1 - b.u0 - (a.u1 - a.u0))[0]
  if (stretch) {
    plot.take({ ...stretch, v0, v1 })
    const p = plot.at((stretch.u0 + stretch.u1) / 2, (v0 + v1) / 2)
    kit.from(2, () => flowerBorder(kit, p, stretch.u1 - stretch.u0, ry, ground), spot(p.x, p.y))
  }
  const run = [...runs].sort((a, b) => b.u1 - b.u0 - (a.u1 - a.u0))[0]
  // A vegetable patch where a yard has room for one, from Stage 2.
  const patch = spotIn(plot, 2.4, 1.2, 0.2, 0, -hv)
  if (patch) {
    plot.take({ u0: patch.u - 1.4, u1: patch.u + 1.4, v0: patch.v - 0.8, v1: patch.v + 0.8 })
    const p = plot.at(patch.u, patch.v)
    kit.from(2, () => vegetables(kit, p.x, p.y, ry, ground), spot(p.x, p.y))
  }
  // A steel shed in a back corner of the garden, on some, from Stage 2.
  if (shedRoll < LOW_FINISH.sheds) {
    const shed = spotIn(plot, 1.5, 1.3, 0.25, (catSide < 0.5 ? -1 : 1) * hu, -hv)
    if (shed) {
      plot.take({ u0: shed.u - 1, u1: shed.u + 1, v0: shed.v - 0.9, v1: shed.v + 0.9 })
      const p = plot.at(shed.u, shed.v)
      kit.from(2, () => gardenShed(kit, p.x, p.y, ground, ry), spot(p.x, p.y))
    }
  }
  // Carp flying from a tall pole, on some, from Stage 2: as far downwind on the lawn as there is room, so that they fly
  // out over its edge.
  if (carpRoll < LOW_FINISH.carp) {
    const [wu, wv] = [Math.cos(ry) * 0.84 + Math.sin(ry) * 0.54, -Math.sin(ry) * 0.84 + Math.cos(ry) * 0.54] // downwind, in the frame
    const pole = spotIn(plot, 0.4, 0.4, 0.9, wu * hu, wv * hv)
    if (pole) {
      plot.take({ u0: pole.u - 0.6, u1: pole.u + 0.6, v0: pole.v - 0.6, v1: pole.v + 0.6 })
      const p = plot.at(pole.u, pole.v)
      kit.from(2, () => kit.carpPole(p.x, p.y, ground, LOW_FINISH.carps), spot(p.x, p.y))
    }
  }
  // A cat walking the top of the wall's longest run and back, sitting at each end a while, on some, from Stage 2.
  if (catRoll < LOW_FINISH.cats && run && run.u1 - run.u0 >= 3) {
    const v = hv - 0.15
    const [a, b] = [plot.at(run.u0 + 0.35, v), plot.at(run.u1 - 0.35, v)]
    const loop = polyline([a, b, a])
    const waits = [4 + catRoll * 30, 3 + catSide * 6]
    const coat = LOW_FINISH.coats[Math.floor(catSide * LOW_FINISH.coats.length)]
    const top = KERB + LOW_FINISH.wall.tall + 0.06
    kit.from(2, () => kit.mover('cat', loop, [0, loop.cum[1]], 0, top, { waits, paint: coat }), spot(a.x, a.y) + 9)
  }
  // A carport over the car's drive at Stage 3: a pale roof on two steel posts along its outer side.
  if (home.car < 4) {
    const { pad } = home
    const [cx, cy] = [(pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2]
    const [pw, pd] = [pad.x1 - pad.x0, pad.y1 - pad.y0]
    const out = home.front % 2 ? [1, 0] : [0, -1] // the side yard's outer side, east or south
    kit.from(3, () => carport(kit, cx, cy, pw, pd, out, ground), spot(cx, cy) + 5)
  }
}

/**
 * The low block wall along the front of the ground `l` (#179), from Stage 1, with its gate `door` m along the front from
 * its middle, between two gate posts, a letter box on one; open across `drive`, if given; and stepping stones from the
 * gate to the door of `house`, if given, which move with its front wall as it grows. Returns the runs of the wall, in
 * the frame of `l`'s front.
 */
function frontage(
  kit: Kit,
  l: RowLot,
  ground: number,
  door: number,
  drive: { u0: number; u1: number } | null,
  house?: Patch,
): { u0: number; u1: number }[] {
  const { tall, thick, colour, cap, gate, post, box } = LOW_FINISH.wall
  const [hu, hv] = [l.w / 2, l.d / 2]
  const v = hv - 0.12 - thick / 2 // the wall's middle, just in from the lawn's front edge
  const cuts = [{ u0: door - gate / 2, u1: door + gate / 2 }, ...(drive ? [drive] : [])].sort((a, b) => a.u0 - b.u0)
  const runs: { u0: number; u1: number }[] = []
  let from = -hu + 0.35
  for (const c of cuts) {
    if (c.u0 - from >= 0.4) runs.push({ u0: from, u1: c.u0 })
    from = Math.max(from, c.u1)
  }
  if (hu - 0.35 - from >= 0.4) runs.push({ u0: from, u1: hu - 0.35 })
  const at = (u: number, vv: number) => to(l.x, l.y, l.ry, u, vv)
  const blocks = { front: PATTERN.blocks, back: PATTERN.blocks, sides: PATTERN.blocks, storey: tall, bay: 1.6 }
  kit.from(
    1,
    () => {
      for (const r of runs) {
        const len = r.u1 - r.u0
        const [px, py] = at((r.u0 + r.u1) / 2, v)
        kit.cladded(kit.cuboid(len, tall, thick), colour, px, py, KERB, l.ry, blocks, spot(px, py))
        kit.put(kit.cuboid(len + 0.04, 0.06, thick + 0.06), cap, px, py, l.ry, 0, 0, KERB + tall)
      }
      // The gate's posts, a letter box on the one on the left.
      for (const s of [-1, 1]) {
        const [px, py] = at(door + s * (gate / 2 + 0.17), v)
        kit.put(kit.cuboid(0.34, tall + 0.35, 0.34), post, px, py, l.ry, 0, 0, KERB)
        kit.put(kit.cuboid(0.4, 0.06, 0.4), cap, px, py, l.ry, 0, 0, KERB + tall + 0.35)
      }
      const [bx, by] = at(door - gate / 2 - 0.17, v)
      kit.put(kit.cuboid(0.3, 0.26, 0.1), box, bx, by, l.ry, 0, 0.22, KERB + tall - 0.05)
      kit.shadow(...at(0, v), KERB, 2 * hu, 0.6, false, l.ry)
      kit.brick('building', ...at(0, v), KERB)
    },
    spot(l.x, l.y) + 1,
  )
  // Stepping stones from the gate to the door, as far as the door stands at each Stage.
  if (house)
    kit.staged(
      (stage) => {
        const k = stage === 1 ? 0.7 : 1
        const doorV = (house.v0 + house.v1) / 2 + ((house.v1 - house.v0) / 2) * k
        for (let sv = v - 0.55, n = 0; sv > doorV + 0.45; sv -= 0.62, n++) {
          const [px, py] = at(door + (n % 2 ? 0.08 : -0.08), sv)
          kit.put(kit.cuboid(0.56, 0.05, 0.42), LOW_FINISH.stones, px, py, l.ry + (n % 2 ? 0.12 : -0.1), 0, 0, ground - 0.01)
        }
        kit.brick('ground', ...at(door, v - 1), ground)
      },
      spot(l.x, l.y) + 2,
    )
  return runs
}

/** A flower border `len` m long at `(x, y)` facing `ry`, as one brick (#179): soil under low leaves and blooms in a few colours. */
function flowerBorder(kit: Kit, { x, y }: { x: number; y: number }, len: number, ry: number, h: number) {
  const { deep, soil, blooms } = LOW_FINISH.border
  const draw = mulberry32(spot(x, y))
  kit.put(kit.cuboid(len, 0.14, deep), soil, x, y, ry, 0, 0, h)
  kit.put(kit.cuboid(len - 0.1, 0.22, deep - 0.15), GARDEN.hedge, x, y, ry, 0, 0, h + 0.1)
  const n = Math.max(2, Math.round(len / 0.55))
  for (let k = 0; k < n; k++) {
    const [px, py] = to(x, y, ry, -len / 2 + 0.3 + (k * (len - 0.6)) / Math.max(1, n - 1), (draw() - 0.5) * 0.2)
    kit.add(SHAPES.bush, blooms[Math.floor(draw() * blooms.length)], px, py, h + 0.36, draw() * 6.28, 0.22, 0.17, 0.22)
  }
  kit.brick('ground', x, y, h)
}

/** A vegetable patch at `(x, y)` facing `ry`, as one brick (#179): a bed of soil under three rows of greens. */
function vegetables(kit: Kit, x: number, y: number, ry: number, h: number) {
  const { soil, greens } = LOW_FINISH.patch
  kit.put(kit.cuboid(2.4, 0.14, 1.2), soil, x, y, ry, 0, 0, h)
  for (let r = 0; r < 3; r++) kit.put(kit.cuboid(2.1, 0.3, 0.24), greens[r], x, y, ry, 0, -0.38 + r * 0.38, h + 0.12)
  kit.brick('ground', x, y, h)
}

/**
 * A carport over a drive `w` (east–west) by `d` centred on `(x, y)` (#179), as one brick: a pale roof of panels in a
 * steel frame on two posts along the drive's side `out` (its way out, east or south), and a beam along them.
 */
function carport(kit: Kit, x: number, y: number, w: number, d: number, out: number[], h: number) {
  const { steel, roof } = LOW_FINISH.carport
  const [ox, oy] = out
  const long = ox ? d : w // along the drive
  const ry = ox ? 0 : Math.PI / 2 // the drive's length along the frame's z
  const top = h + 2.35
  for (const s of [-1, 1]) {
    const [px, py] = [x + ox * (w / 2 - 0.15) + (oy ? s * (long / 2 - 0.3) : 0), y + oy * (d / 2 - 0.15) + (ox ? s * (long / 2 - 0.3) : 0)]
    kit.add(kit.cuboid(0.12, top - h, 0.12), steel, px, py, h)
  }
  const [bx, by] = [x + ox * (w / 2 - 0.15), y + oy * (d / 2 - 0.15)]
  kit.add(kit.cuboid(0.14, 0.18, long - 0.3), steel, bx, by, top - 0.18, ry)
  kit.add(kit.cuboid((ox ? w : d) + 0.3, 0.06, long + 0.3), roof, x, y, top, ry)
  kit.add(kit.cuboid((ox ? w : d) + 0.36, 0.1, 0.1), steel, ...to(x, y, ry, 0, (long + 0.3) / 2), top - 0.02, ry)
  kit.add(kit.cuboid((ox ? w : d) + 0.36, 0.1, 0.1), steel, ...to(x, y, ry, 0, -(long + 0.3) / 2), top - 0.02, ry)
  kit.shadow(x, y, h, w + 0.6, d + 0.6)
  kit.brick('building', x, y, h)
}

// The scenes of a low-density Block (#179), each a garden on a lot of its own: a koi pond under a pine with a stone
// lantern, a paddling pool under a sunshade, a dog's kennel in its run, a persimmon tree in fruit, or a barbecue under a
// pergola with string lights. Before its Stage a scene's lot is a lawn with a young tree.

/** The scenes a low-density Block picks from (#179). */
export type LowScene = 'koi' | 'paddling' | 'kennel' | 'persimmon' | 'barbecue'
/** The least each scene's lawn measures across, m. */
const LOW_SCENES: Record<LowScene, number> = { koi: 8, paddling: 7.4, kennel: 7.6, persimmon: 7, barbecue: 7.8 }
/** A low-density Block's scene (#179), and the lot it takes, whose house is not built. */
type LowGround = Scene<LowScene> & { lot: number }

/**
 * The scenes of a low-density Block (#179), drawn from `draw` before its houses are built (`sceneOrder`, `placeScenes`):
 * each on a lot whose lawn is wide enough for its kind and faces a Road (any lot, on a Block with none), the second not
 * on or beside the first. Each takes its lot whole, whose house is not built.
 * ponytail: a Block with no lawn wide enough for even a persimmon tree (7 m) has no scene, and none says so. Ceiling: rule
 * 5 fails there; every lawn is 7 m across or more, so none does. Upgrade: a scene that fits a narrower lawn.
 */
function lowScenes(g: ZoneGround, lots: Bounds[], lawns: (Lawn | null)[], draw: () => number): LowGround[] {
  const order = sceneOrder(g, draw, LOW_FINISH.scenes, LOW_FINISH.second)
  const start = draw()
  return placeScenes<LowScene, LowGround>(order, LOW_FINISH.scenes, (kind, out) => {
    for (let n = 0; n < 2 * lots.length; n++) {
      const road = n < lots.length
      const i = (Math.floor(start * lots.length) + n) % lots.length
      const lawn = lawns[i]
      if (!lawn || Math.min(lawn.w, lawn.d) < LOW_SCENES[kind]) continue
      if (out.some((o) => o.lot === i || beside(lots[o.lot], lots[i]))) continue
      const ground = groundOf(g, lawn)
      if (road && kerbAhead(g, ground, 0) === null) continue
      return { ground: { ...ground, onRoad: road }, lot: i }
    }
    return null
  })
}

/**
 * A low-density Block's scene `kind` at Stage `stage` (#179), from Stage `from`, on its lawn `ground`, its front facing
 * the nearest edge of the Block: the scene, or before `from` a young tree in the middle of the lawn.
 */
function lowScene(kit: Kit, kind: LowScene, ground: Footprint, stage: number, from: number) {
  const h = KERB + 0.16
  if (stage < from) return kit.tree(ground.x, ground.y, h, 0.42, 'round', true)
  const at = (u: number, v: number) => to(ground.x, ground.y, ground.ry, u, v)
  const side = spot(ground.x, ground.y) % 2 ? 1 : -1
  ;({ koi, paddling, kennel, persimmon, barbecue })[kind](kit, ground, at, side, stage, h)
}

/** A point in the frame of a scene's ground, on the map: `u` along its front from its middle, `v` out of the front. */
type At = (u: number, v: number) => [number, number]

// Colours: a pond's water and its rim of stones; koi; a wooden bridge's deck and rails; a paddling pool's ring, its
// sunshade and poles, and folding chairs; a kennel's timber and its dark doorway, a dog's coat and its cream chest, and
// a run's fence; a persimmon tree's leaves, fruit and trunk, a ladder and a basket; a barbecue's pergola, its grill, its
// table and chairs, and a patio's paving.
const POND = { water: '#63c9e0', stones: ['#bdb4a6', '#d9d3c7', '#a9a092'], koi: ['#fbf3e6', '#f0b43c', '#ea8548', '#3a3f4b'] }
const BRIDGE = { deck: '#a1714c', rail: '#8a5a3c' }
const POOL = {
  ring: '#8fd8d0',
  band: '#fbf8f2',
  shade: '#f4ead2',
  stripe: '#79c86a',
  pole: '#c4ccd4',
  chairs: ['#f0b43c', '#79c86a', '#a58ad8'],
}
const KENNEL = { wood: '#c49a6c', door: '#4a3a30', roof: '#5aa69b', coat: '#d9a066', chest: '#fbf3e6', fence: '#e8e2d6' }
const PERSIMMON = { leaves: ['#5fbc51', '#6bc357', '#4f9f45'], fruit: '#ec8f4a', trunk: '#8a6a4c', ladder: '#c49a6c', basket: '#a1714c' }
const BARBECUE = { wood: '#a1714c', stone: '#bdb4a6', grill: '#3a3f4b', table: '#e8e2d6', chairs: '#c49a6c', patio: '#d9d1c3' }

/**
 * A koi pond (#179): a pond with a rim of stones, koi in it, Close-only; a pine beside it and a stone lantern that lights
 * at dusk and leaves its pool; at Stage 3 a wooden bridge over its narrow end and a second lantern.
 */
function koi(kit: Kit, l: Footprint, at: At, side: number, stage: number, h: number) {
  const [rx, rz] = [Math.min(2.6, l.w / 2 - 1.6), Math.min(1.8, l.d / 2 - 1.9)]
  const [cu, cv] = [-side * 0.5, -0.5]
  const [px, py] = at(cu, cv)
  const draw = mulberry32(spot(px, py))
  kit.add(SHAPES.cylinder, { material: kit.glass, tint: kit.glassOf(POND.water), glow: 0 }, px, py, h - 0.12, l.ry, rx, 0.14, rz)
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2
    const [sx, sy] = to(px, py, l.ry, Math.cos(a) * (rx + 0.15), Math.sin(a) * (rz + 0.15))
    kit.add(SHAPES.bush, POND.stones[Math.floor(draw() * 3)], sx, sy, h - 0.05, draw() * 6.28, 0.32 + 0.12 * draw(), 0.22, 0.3)
  }
  kit.brick('ground', px, py, h)
  kit.closeOnly(() => {
    for (let k = 0; k < 5; k++) {
      const [fx, fy] = to(px, py, l.ry, (draw() - 0.5) * rx * 1.2, (draw() - 0.5) * rz * 1.1)
      kit.add(kit.cuboid(0.5, 0.04, 0.17), POND.koi[k % 4], fx, fy, h + 0.03, draw() * 6.28)
    }
    kit.brick('ground', px, py, h)
  })
  // A pine at the back on the far side, and a stone lantern at the pond's front corner.
  kit.tree(...at(side * (l.w / 2 - 1.6), -l.d / 2 + 1.7), h, 0.62, 'pine', true)
  stoneLantern(kit, ...at(cu + side * rx * 0.75, cv + rz + 0.75), l.ry, h)
  if (stage < 3) return
  stoneLantern(kit, ...at(cu - side * rx * 0.6, cv - rz - 0.7), l.ry, h)
  // A wooden bridge over the pond's narrow end: two ramps and a deck, with rails.
  const [bx, by] = to(px, py, l.ry, -side * rx * 0.55, 0)
  const span = 2 * rz + 0.9
  const turn = l.ry + Math.PI / 2
  kit.put(kit.cuboid(span * 0.4, 0.12, 0.9), BRIDGE.deck, bx, by, turn, 0, 0, h + 0.42)
  for (const s of [-1, 1]) {
    const ramp = new THREE.BoxGeometry(span * 0.34, 0.12, 0.9).rotateZ(s * 0.42)
    kit.put(ramp, BRIDGE.deck, bx, by, turn, s * span * 0.34, 0, h + 0.24)
    ramp.dispose()
    kit.put(kit.cuboid(span, 0.08, 0.06), BRIDGE.rail, bx, by, turn, 0, s * 0.45, h + 0.95)
    for (const u of [-span / 2 + 0.1, 0, span / 2 - 0.1])
      kit.put(kit.cuboid(0.07, 0.8, 0.07), BRIDGE.rail, bx, by, turn, u, s * 0.45, h + 0.15)
  }
  kit.brick('building', bx, by, h)
}

/**
 * A paddling pool (#179): an inflatable ring of water on the lawn, half under a striped sunshade on four poles that stand
 * clear of it, two folding chairs in the shade, Close-only; at Stage 3 a float on the water and a third chair.
 */
function paddling(kit: Kit, l: Footprint, at: At, side: number, stage: number, h: number) {
  const r = 1.45
  const [px, py] = at(side * 0.9, -0.3)
  kit.add(SHAPES.cylinder, POOL.ring, px, py, h, 0, r, 0.48, r)
  kit.add(SHAPES.cylinder, POOL.band, px, py, h + 0.48, 0, r + 0.02, 0.06, r + 0.02)
  kit.add(SHAPES.cylinder, { material: kit.glass, tint: kit.glassOf(POND.water), glow: 0 }, px, py, h + 0.08, 0, r - 0.2, 0.44, r - 0.2)
  kit.shadow(px, py, h, 3.4, 3.4, true)
  kit.brick('building', px, py, h)
  // The sunshade over the pool's near half and the chairs: stripes on four poles, each beyond the pool's edge.
  const [sw, sd] = [4.5, 2 * r + 0.4]
  const [sx, sy] = at(-side * 0.6, -0.3)
  for (const u of [-1, 1])
    for (const v of [-1, 1]) kit.put(kit.cuboid(0.07, 2.4, 0.07), POOL.pole, sx, sy, l.ry, (u * sw) / 2, (v * sd) / 2, h)
  const stripes = 5
  for (let k = 0; k < stripes; k++)
    kit.put(
      kit.cuboid(sw / stripes, 0.05, sd + 0.2),
      k % 2 ? POOL.stripe : POOL.shade,
      sx,
      sy,
      l.ry,
      -sw / 2 + (k + 0.5) * (sw / stripes),
      0,
      h + 2.4,
    )
  kit.shadow(sx, sy, h, sw + 1, sd + 1, false, l.ry)
  kit.brick('building', sx, sy, h)
  kit.closeOnly(() => {
    const chairs = stage === 3 ? [-0.9, 0.9, 0] : [-0.9, 0.9]
    for (const [k, v] of chairs.entries()) {
      const [cx, cy] = to(sx, sy, l.ry, -side * (1.4 + (k === 2 ? 0.8 : 0)), v)
      const turn = l.ry + (side * Math.PI) / 2 // facing the pool
      kit.put(kit.cuboid(0.55, 0.06, 0.6), POOL.chairs[k], cx, cy, turn, 0, 0, h + 0.38)
      kit.put(kit.cuboid(0.5, 0.38, 0.5), POOL.pole, cx, cy, turn, 0, 0, h)
      kit.put(kit.cuboid(0.55, 0.5, 0.06), POOL.chairs[k], cx, cy, turn, 0, -0.3, h + 0.44)
    }
    kit.brick('building', sx, sy, h)
    if (stage < 3) return
    kit.add(SHAPES.cylinder, POOL.chairs[2], ...to(px, py, l.ry, side * 0.4, 0.3), h + 0.5, 0, 0.45, 0.12, 0.45) // a float
    kit.brick('ground', px, py, h)
  })
}

/**
 * A dog's kennel in its run (#179): a low timber fence round three sides of a run at the back of the lawn, a kennel
 * under a little gable with the dog sitting before it, Close-only, and a tree for shade; at Stage 3 a puppy by it.
 */
function kennel(kit: Kit, l: Footprint, at: At, side: number, stage: number, h: number) {
  const [rw, rd] = [Math.min(5.4, l.w - 2.2), Math.min(3.8, l.d / 2)]
  const [cx, cy] = at(0, -l.d / 2 + 0.9 + rd / 2)
  // The run's fence: posts and two rails along its back and sides, open to the garden.
  const rails: [number, number, number, number][] = [
    [0, -rd / 2, rw, 0],
    [-rw / 2, 0, rd, Math.PI / 2],
    [rw / 2, 0, rd, Math.PI / 2],
  ]
  for (const [u, v, len, turn] of rails) {
    const [fx, fy] = to(cx, cy, l.ry, u, v)
    for (const z of [0.35, 0.75]) kit.add(kit.cuboid(len, 0.08, 0.06), KENNEL.fence, fx, fy, h + z, l.ry + turn)
    const posts = Math.max(2, Math.round(len / 1.2) + 1)
    for (let k = 0; k < posts; k++) {
      const [qx, qy] = to(fx, fy, l.ry + turn, -len / 2 + (k * len) / (posts - 1), 0)
      kit.add(kit.cuboid(0.1, 0.95, 0.1), KENNEL.fence, qx, qy, h)
    }
  }
  kit.shadow(cx, cy, h, rw + 0.6, rd + 0.6, false, l.ry)
  kit.brick('building', cx, cy, h)
  // The kennel at the back of the run, facing the garden, under a little gable.
  const [kx, ky] = to(cx, cy, l.ry, side * (rw / 2 - 1.1), -rd / 2 + 0.8)
  kit.put(kit.cuboid(1.2, 0.85, 1.05), KENNEL.wood, kx, ky, l.ry, 0, 0, h)
  kit.put(kit.cuboid(0.46, 0.55, 0.04), KENNEL.door, kx, ky, l.ry, 0, 0.53, h + 0.06)
  kit.put(kit.gable(1.35, 1.4, 0.5), KENNEL.roof, kx, ky, l.ry, 0, 0, h + 0.85)
  kit.shadow(kx, ky, h, 1.7, 1.5, false, l.ry)
  kit.brick('building', kx, ky, h)
  kit.closeOnly(() => {
    dog(kit, ...to(kx, ky, l.ry, 0.1, 1.15), l.ry, h, 1)
    kit.add(SHAPES.cylinder, '#9aa3ad', ...to(kx, ky, l.ry, 0.75, 0.9), h, 0, 0.17, 0.08, 0.17) // its bowl
    if (stage === 3) dog(kit, ...to(kx, ky, l.ry, -0.85, 1.4), l.ry + 0.6, h, 0.62)
    kit.brick('building', kx, ky, h)
  })
  kit.tree(...at(-side * (l.w / 2 - 1.6), -l.d / 2 + 1.8), h, 0.5, 'round', true)
}

/** A dog sitting at `(x, y)` facing `ry`, `s` times a shiba's size, oversized as the props are (#179). */
function dog(kit: Kit, x: number, y: number, ry: number, h: number, s: number) {
  const { coat, chest } = KENNEL
  kit.put(kit.cuboid(0.34 * s, 0.32 * s, 0.6 * s), coat, x, y, ry, 0, -0.08 * s, h)
  kit.put(kit.cuboid(0.3 * s, 0.42 * s, 0.26 * s), coat, x, y, ry, 0, 0.16 * s, h + 0.12 * s)
  kit.put(kit.cuboid(0.2 * s, 0.24 * s, 0.06 * s), chest, x, y, ry, 0, 0.3 * s, h + 0.2 * s)
  kit.put(kit.cuboid(0.26 * s, 0.24 * s, 0.28 * s), coat, x, y, ry, 0, 0.28 * s, h + 0.52 * s)
  kit.put(kit.cuboid(0.14 * s, 0.1 * s, 0.12 * s), chest, x, y, ry, 0, 0.46 * s, h + 0.56 * s)
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.07 * s, 0.1 * s, 0.05 * s), coat, x, y, ry, k * 0.08 * s, 0.26 * s, h + 0.76 * s)
  kit.put(kit.cuboid(0.07 * s, 0.07 * s, 0.22 * s), coat, x, y, ry, 0, -0.42 * s, h + 0.3 * s)
}

/**
 * A persimmon tree in fruit (#179): a broad tree with its fruit orange among its leaves, a ladder against it, a basket of
 * fruit and a bench in its shade, Close-only; at Stage 3 a rack of persimmons strung up to dry, and fruit fallen on the
 * lawn.
 */
function persimmon(kit: Kit, l: Footprint, at: At, side: number, stage: number, h: number) {
  const [tx, ty] = at(side * 0.5, -0.6)
  const s = Math.min(0.95, (Math.min(l.w, l.d) - 2) / 7.4)
  const draw = mulberry32(spot(tx, ty))
  kit.add(SHAPES.cylinder, PERSIMMON.trunk, tx, ty, h, 0, 0.42 * s, 3.4 * s, 0.42 * s)
  // Its crown: a broad sphere and four round it, each with its fruit on the side facing out.
  const crown: [number, number, number, number][] = [[0, 0, 4.6, 2.5]]
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + draw()
    crown.push([Math.cos(a) * 1.5, Math.sin(a) * 1.5, 3.9 + draw() * 0.8, 1.7 + draw() * 0.3])
  }
  for (const [k, [ox, oy, oz, r]] of crown.entries()) {
    const [cx, cy, cz, cr] = [tx + ox * s, ty + oy * s, h + oz * s, r * s]
    kit.add(SHAPES.sphere, PERSIMMON.leaves[k % 3], cx, cy, cz, 0, cr, cr * 0.88, cr)
    for (let f = 0; f < 6; f++) {
      const [a, b] = [draw() * Math.PI * 2, (draw() - 0.2) * 1.1] // round it, and up from its middle
      const [fx, fy, fz] = [
        cx + Math.cos(a) * Math.cos(b) * cr * 0.98,
        cy + Math.sin(a) * Math.cos(b) * cr * 0.98,
        cz + Math.sin(b) * cr * 0.86,
      ]
      kit.add(SHAPES.bush, PERSIMMON.fruit, fx, fy, fz, draw() * 6.28, 0.2, 0.18, 0.2)
    }
  }
  kit.shadow(tx, ty, h, 7.5 * s, 7.5 * s, true)
  kit.brick('tree', tx, ty, h)
  kit.closeOnly(() => {
    // A ladder against the tree, a basket of fruit at its foot, and a bench in its shade.
    const [lx, ly] = to(tx, ty, l.ry, -side * 0.9, 0.9)
    const ladder = new THREE.BoxGeometry(0.06, 3, 0.06).rotateX(-0.32)
    for (const k of [-1, 1]) kit.put(ladder, PERSIMMON.ladder, lx, ly, l.ry - side * 0.8, k * 0.22, 0, h + 1.42)
    ladder.dispose()
    for (let r = 0; r < 5; r++)
      kit.put(kit.cuboid(0.44, 0.05, 0.05), PERSIMMON.ladder, lx, ly, l.ry - side * 0.8, 0, 0.45 - r * 0.2, h + 0.3 + r * 0.55)
    const [bx, by] = to(tx, ty, l.ry, side * 1.2, 1.3)
    kit.add(kit.cuboid(0.55, 0.3, 0.4), PERSIMMON.basket, bx, by, h, l.ry)
    for (let f = 0; f < 4; f++)
      kit.add(SHAPES.bush, PERSIMMON.fruit, bx + (f % 2 ? 0.12 : -0.12), by + (f < 2 ? 0.07 : -0.07), h + 0.34, f, 0.12, 0.11, 0.12)
    kit.brick('building', bx, by, h)
  })
  bench(kit, ...at(-side * (l.w / 2 - 1.6), 0.8), l.ry + (side * Math.PI) / 2, h)
  if (stage < 3) return
  // A rack of persimmons strung up to dry: a timber frame and five strings of fruit.
  const [qx, qy] = at(-side * (l.w / 2 - 1.5), -l.d / 2 + 1.4)
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.12, 2.2, 0.12), PERSIMMON.ladder, qx, qy, l.ry, k * 1.1, 0, h)
  kit.put(kit.cuboid(2.5, 0.12, 0.14), PERSIMMON.ladder, qx, qy, l.ry, 0, 0, h + 2.1)
  for (let k = 0; k < 5; k++)
    for (let f = 0; f < 6; f++) kit.put(SHAPES.bush, PERSIMMON.fruit, qx, qy, l.ry, -0.8 + k * 0.4, 0, h + 1.85 - f * 0.24, 0.1, 0.1, 0.1)
  kit.shadow(qx, qy, h, 2.8, 1, false, l.ry)
  kit.brick('building', qx, qy, h)
  kit.closeOnly(() => {
    for (let f = 0; f < 5; f++)
      kit.add(SHAPES.bush, PERSIMMON.fruit, ...to(tx, ty, l.ry, (draw() - 0.5) * 4, (draw() - 0.5) * 3 + 1.2), h + 0.08, f, 0.12, 0.1, 0.12)
    kit.brick('ground', tx, ty, h)
  })
}

/**
 * A garden with a barbecue (#179): a paved patio under a pergola hung with string lights, which light at dusk and leave
 * their pool, a table and chairs under it, Close-only, and a grill whose smoke rises through the working day; at Stage
 * 3 a second table.
 */
function barbecue(kit: Kit, l: Footprint, at: At, side: number, stage: number, h: number) {
  const [pw, pd] = [Math.min(5.6, l.w - 2), Math.min(4.6, l.d - 3)]
  const [cx, cy] = at(0, -0.4)
  kit.paving(cx, cy, h, pw, pd, l.ry, BARBECUE.patio, PATTERN.setts, 0.02)
  // The pergola: four posts, two beams along it and rafters across them, over 3 m at its top.
  const [gw, gd] = [pw - 1.6, pd - 1.8]
  for (const u of [-1, 1])
    for (const v of [-1, 1]) kit.put(kit.cuboid(0.16, 2.8, 0.16), BARBECUE.wood, cx, cy, l.ry, (u * gw) / 2, (v * gd) / 2, h)
  for (const v of [-1, 1]) kit.put(kit.cuboid(gw + 0.6, 0.2, 0.14), BARBECUE.wood, cx, cy, l.ry, 0, (v * gd) / 2, h + 2.8)
  const rafters = Math.max(4, Math.round(gw / 0.7))
  for (let k = 0; k < rafters; k++)
    kit.put(kit.cuboid(0.1, 0.16, gd + 0.6), BARBECUE.wood, cx, cy, l.ry, -gw / 2 + (k * gw) / (rafters - 1), 0, h + 3)
  // String lights along the beams, lit at dusk, and their pool on the patio.
  for (const v of [-1, 1])
    for (let k = 0; k < 6; k++)
      kit.put(
        kit.cuboid(0.12, 0.12, 0.12),
        kit.lit('#fff4dc', 1.5),
        cx,
        cy,
        l.ry,
        -gw / 2 + 0.3 + (k * (gw - 0.6)) / 5,
        (v * gd) / 2,
        h + 2.62,
      )
  kit.pool('string', cx, cy, h, gw + 0.8, gd + 0.8, l.ry)
  kit.shadow(cx, cy, h, gw + 0.6, gd + 0.6, false, l.ry)
  kit.brick('building', cx, cy, h)
  // A stone barbecue at the patio's front corner, out from under the pergola: a hearth with its grill, and a flue at
  // its back whose smoke rises through the working day.
  const [gx, gy] = to(cx, cy, l.ry, side * (pw / 2 - 0.8), pd / 2 - 0.6)
  kit.put(kit.cuboid(1.3, 0.85, 0.8), BARBECUE.stone, gx, gy, l.ry, 0, 0, h)
  kit.put(kit.cuboid(1.06, 0.05, 0.56), BARBECUE.grill, gx, gy, l.ry, 0, 0.02, h + 0.85)
  kit.put(kit.cuboid(0.36, 1, 0.3), BARBECUE.stone, gx, gy, l.ry, side * 0.42, -0.24, h + 0.85)
  kit.steam(...to(gx, gy, l.ry, side * 0.42, -0.24), h + 2)
  kit.shadow(gx, gy, h, 1.8, 1.3, false, l.ry)
  kit.brick('building', gx, gy, h)
  const tables = stage === 3 ? [-0.8, 0.9] : [0]
  kit.closeOnly(() => {
    for (const u of tables) {
      const [tx, ty] = to(cx, cy, l.ry, u, 0.2)
      kit.add(kit.cuboid(1.3, 0.06, 0.8), BARBECUE.table, tx, ty, h + 0.72, l.ry)
      kit.add(kit.cuboid(0.1, 0.72, 0.1), BARBECUE.grill, tx, ty, h)
      for (const s of [-1, 1]) {
        const [qx, qy] = to(tx, ty, l.ry, 0, s * 0.75)
        kit.add(kit.cuboid(0.45, 0.45, 0.45), BARBECUE.chairs, qx, qy, h, l.ry)
      }
    }
    kit.brick('building', cx, cy, h)
  })
}
