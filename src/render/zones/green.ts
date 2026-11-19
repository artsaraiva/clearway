import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Polyline, type Vec } from '../../sim/geometry'
import { area, KERB, type Block } from '../blocks'
import { inside, type Field } from '../field'
import { BENCH, SHAPES, spot, to, type Kit } from '../kit'
import { clearOf, GROW, overlay, scatter, site } from '../landmarks'
import type { Look } from './ground'

// Green: a meadow, or one Block in three allotments.
const GREEN = { allotments: 0.35 }

/** Green's look (`./index`). */
export const look: Look = {
  landmarks: false,
  fill: ({ kit, field, block, kerbsideTrees }) => (kit.chance(GREEN.allotments) ? allotments : meadow)(kit, field, block, kerbsideTrees),
}

// Green: a meadow's grass and its beds of flowers; allotments' gravel paths, the soil of their plots, the crops and
// flowers in them, and their sheds.
const MEADOW = '#b9e293'
const TAU = Math.PI * 2
const BEDS = ['#ffd1df', '#f6d36a', '#ffadc8', '#fff7e8', '#c7b8f0']
const [GRAVEL, SOIL, SHED, SHED_ROOF] = ['#e6dccb', '#a77f5a', '#c49a6c', '#5aa69b']
const CROPS = ['#6fc35a', '#8fd46c', '#5aae58', '#b9dd6a']
const [BEANS, CANES] = ['#4f9f4a', '#c9b07a'] // a Stage 3 plot's, climbing
const BLOOMS = ['#ffd1df', '#f6d36a', '#ffadc8', '#fff7e8']
// Green details (#152), each drawn from where it stands, so that nothing else on its Block draws differently, on lots of
// their own from `DETAIL` on. Wildflowers lie in drifts through a meadow's grass, more of them at each Stage: drifts to
// every 1,000 m² of Block that each Stage adds, the flowers in a drift, how far it spreads and how far in from the
// Block's edge it keeps (m), and their colours, white and yellow leading.
const DETAIL = 100
const WILD = {
  drifts: [1.6, 3, 4],
  flowers: [12, 16, 20],
  spread: 2.6,
  clear: 2.6,
  colours: ['#ffffff', '#f6d36a', '#ffffff', '#a58ad8', '#ff9ab8', '#f6d36a', '#c7b8f0'],
}
/** A wildflower's head (#152): a five-petalled star 0.56 m across, lying flat. */
const FLOWER = (() => {
  const star = new THREE.Shape()
  for (let k = 0; k < 10; k++) {
    const [r, a] = [k % 2 ? 0.12 : 0.28, (k * Math.PI) / 5]
    if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else star.moveTo(r, 0)
  }
  return new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2)
})()
// Butterflies over a meadow's beds (#152): one to every two beds from Stage 2 and one more to every three at Stage 3, at
// most `most` each; how long each rests on a bed (s), how far its flight weaves either side of its way (m) and how
// often (m a weave), and the paints its wings take.
const BUTTERFLIES = {
  two: 2,
  three: 3,
  most: 3,
  rest: [3, 9],
  weave: 0.7,
  wave: 3.4,
  paints: ['#ffffff', '#f6d36a', '#fbe3a2', '#ffadc8', '#c7b8f0', '#f0b43c'],
}
// Picnic blankets on a meadow's open grass (#152): one from Stage 2, a second at Stage 3 and a third then on a Block of
// at least `big` m²; how far each keeps from trees, beds and the rest (m).
const PICNICS = { big: 2500, room: 4 }
// Allotments' details (#152): the share of worked plots under cold frames from Stage 2 and from Stage 3, and a
// scarecrow from Stage 1 on this share of Blocks (from Stage 2 on the rest), a second at Stage 3 on a Block of this
// many plots.
const ALLOTTED = { frames: [0.16, 0.34], early: 0.5, second: 12 }
const ALLOTMENT = { w: 6.4, d: 4.6, path: 1.3 } // m: a plot, and the gravel path between plots

/**
 * A meadow Block: open grass but for groves of trees, one to about every 700 m² and at least two, and a few beds of
 * flowers, all clear of the street trees `kerbsideTrees`. Its details (`meadowDetails`, #152): wildflowers, benches,
 * picnic blankets and butterflies. With the Stage:
 * - Stage 1: three saplings to a grove, and no beds.
 * - Stage 2: five trees to a grove, and the beds.
 * - Stage 3: the trees grown on, three more beds, and a pavilion by the first grove where there is room.
 */
export function meadow(kit: Kit, field: Field, block: Block, kerbsideTrees: Vec[]) {
  overlay(kit, field, block, 2, 0.24, MEADOW)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.24
  const [groves, planted]: Vec[][] = [
    scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 700)), 6.5, Infinity, 16, []),
    [],
  ]
  for (const [g, grove] of groves.entries()) {
    const near = { ...block, x0: grove.x - 7, x1: grove.x + 7, y0: grove.y - 7, y1: grove.y + 7 }
    for (const [k, p] of scatter(kit, field, near, 5, 4.5, Infinity, 3.4, kerbsideTrees).entries()) {
      const [size, kind] = [kit.range(0.75, 1.15), kit.chance(0.25) ? 'pine' : kit.chance(0.2) ? 'sakura' : 'round'] as const
      kit.lot(g)
      kit.staged((stage) => {
        if (k < 3 || stage > 1) kit.tree(p.x, p.y, ground, GROW[stage - 1] * size, kind)
      })
      planted.push(p)
    }
  }
  /** A bed of flowers on `p`, as a brick. */
  const bed = ({ p, w, d, colour }: Bed) => {
    kit.add(kit.box(w, 0.45, d, 0.6, 0.18), colour, p.x, p.y, ground)
    kit.brick('tree', p.x, p.y, ground)
  }
  const beds: Bed[] = []
  for (const [k, p] of scatter(kit, field, block, 5, 4, Infinity, 7, kerbsideTrees).entries()) {
    const it = { p, w: kit.range(3, 5.5), d: kit.range(1.6, 2.6), colour: kit.pick(BEDS) }
    kit.lot(groves.length + k)
    kit.from(2, () => bed(it))
    beds.push(it)
  }
  kit.lot(-1)
  // Stage 3's beds and pavilion, drawn on the stream `from` seeds here, as it would have seeded it: known before they
  // are built, so that the details keep clear of them at every Stage (#152).
  const late = (range: (a: number, b: number) => number) => {
    const more = scatter({ range }, field, block, 3, 4, Infinity, 7, [...kerbsideTrees, ...beds.map((b) => b.p), ...planted]).map((p) => ({
      p,
      w: range(3, 5.5),
      d: range(1.6, 2.6),
      colour: BEDS[Math.floor(range(0, 1) * BEDS.length)],
    }))
    return { more, pavilion: site(field, block, 7, 7, groves[0], [...kerbsideTrees, ...planted, ...beds.map((b) => b.p)], 2.5) }
  }
  const seed = (kit.range(0, 1) * 4294967296) >>> 0
  const draw = mulberry32(seed)
  const third = late((a, b) => a + (b - a) * draw()) // as Stage 3 builds them
  kit.from(
    3,
    () => {
      const { more, pavilion } = late(kit.range)
      more.forEach(bed)
      if (pavilion) kit.pavilion(pavilion.x, pavilion.y, ground)
    },
    seed,
  )
  meadowDetails(kit, block, ground, { kerbsideTrees, groves, planted, beds, more: third.more, pavilion: third.pavilion })
}

/** A bed of flowers on a meadow: where it lies, how big it is and its colour. */
interface Bed {
  p: Vec
  w: number
  d: number
  colour: string
}

/**
 * A meadow's details (#152), each drawn from where it stands: benches by the groves, picnic blankets on the open grass,
 * drifts of wildflowers through it, and butterflies over the beds. With the Stage:
 * - Stage 1: a few drifts of wildflowers.
 * - Stage 2: more drifts, a bench by the first grove, a picnic blanket with its basket, and a butterfly to every two beds.
 * - Stage 3: the most drifts, a bench by every grove, more blankets, one under a parasol, and more butterflies.
 */
function meadowDetails(
  kit: Kit,
  block: Block,
  ground: number,
  {
    kerbsideTrees,
    groves,
    planted,
    beds,
    more,
    pavilion,
  }: { kerbsideTrees: Vec[]; groves: Vec[]; planted: Vec[]; beds: Bed[]; more: Bed[]; pavilion: Vec | null },
) {
  const all = [...beds, ...more]
  const clear = (p: Vec, room: number, trees = 1.8) =>
    kit.onGround(p.x, p.y, room) &&
    planted.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= trees) &&
    kerbsideTrees.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= 3.4) &&
    all.every((b) => Math.abs(b.p.x - p.x) > b.w / 2 + 1.6 || Math.abs(b.p.y - p.y) > b.d / 2 + 1.6) &&
    (!pavilion || Math.hypot(pavilion.x - p.x, pavilion.y - p.y) >= 5.5)
  const taken: Vec[] = [] // benches and blankets, which the rest keep off
  let lot = DETAIL
  // A bench by each grove, the first's from Stage 2 and the rest's at Stage 3, on the side the default camera sees
  // where there is room, facing out from the trees.
  // It keeps clear of a grown tree's crown, which reaches about 3 m out from its trunk at Stage 3.
  const sites = [7, 8.5].flatMap((out) => [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2].map((turn) => ({ out, turn })))
  for (const [g, grove] of groves.entries()) {
    for (const { out, turn } of sites) {
      const a = -Math.PI / 4 + turn
      const p = { x: grove.x + Math.cos(a) * out, y: grove.y + Math.sin(a) * out }
      if (!clear(p, 3.2, 3.6) || taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 4)) continue
      taken.push(p)
      kit.lot(lot++)
      kit.from(g ? 3 : 2, () => kit.bench(p.x, p.y, ground, a - Math.PI / 2), spot(p.x, p.y))
      break
    }
  }
  // Picnic blankets: the first from Stage 2, the rest at Stage 3, each where it lands on open grass.
  const blankets = area(block.loop) >= PICNICS.big ? 3 : 2
  const lay = mulberry32(spot(block.x0, block.y0))
  for (let k = 0, tries = 0; k < blankets && tries < 60; tries++) {
    const p = { x: block.x0 + lay() * (block.x1 - block.x0), y: block.y0 + lay() * (block.y1 - block.y0) }
    if (!clear(p, 3.8, PICNICS.room) || taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < PICNICS.room + 1)) continue
    taken.push(p)
    const [ry, parasol] = [(lay() - 0.5) * 0.9, k === 1]
    kit.lot(lot++)
    kit.from(k ? 3 : 2, () => blanket(kit, p.x, p.y, ground, ry, true, parasol), spot(p.x, p.y))
    k++
  }
  // Drifts of wildflowers, the layers each Stage adds: each drift mostly of one colour, off the benches and blankets.
  for (const stage of [1, 2, 3]) {
    const n = Math.round((WILD.drifts[stage - 1] * area(block.loop)) / 1000)
    kit.lot(lot++)
    kit.from(
      stage,
      () => {
        const sow = mulberry32(spot(block.x0 + stage, block.y1))
        for (let d = 0; d < n; d++) {
          const c = { x: block.x0 + sow() * (block.x1 - block.x0), y: block.y0 + sow() * (block.y1 - block.y0) }
          const [main, count] = [WILD.colours[Math.floor(sow() * WILD.colours.length)], WILD.flowers[stage - 1]]
          let laid = 0
          for (let f = 0; f < count; f++) {
            const [a, r] = [sow() * TAU, Math.sqrt(sow()) * WILD.spread]
            const [colour, lift, turn] = [sow() < 0.8 ? main : WILD.colours[0], 0.08 + sow() * 0.14, sow() * TAU]
            const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
            if (!kit.onGround(p.x, p.y, WILD.clear) || taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 2)) continue
            kit.add(FLOWER, colour, p.x, p.y, ground + lift, turn)
            laid++
          }
          if (laid) kit.brick('tree', c.x, c.y, ground)
        }
      },
      spot(block.x0 + stage, block.y1),
    )
  }
  // Butterflies, each round a tour of the beds from one of them, from Stage 2 over Stage 2's beds and at Stage 3 over
  // all of them, alighting on each.
  const fleets: [number, Bed[]][] = [
    [2, beds],
    [3, all],
  ]
  for (const [stage, over] of fleets) {
    if (!over.length) continue
    const n = Math.min(BUTTERFLIES.most, Math.ceil(over.length / (stage === 2 ? BUTTERFLIES.two : BUTTERFLIES.three)))
    for (let k = 0; k < n; k++) {
      const from = over[(k * 2 + stage) % over.length]
      kit.lot(lot++)
      kit.from(
        stage,
        () => {
          const plan = flutter(over, from, mulberry32(spot(from.p.x + k, from.p.y + stage)))
          kit.mover('butterfly', plan.loop, plan.stops, 0, ground + 0.5, { waits: plan.waits, paint: plan.paint })
        },
        spot(from.p.x + k, from.p.y + stage),
      )
    }
  }
}

/**
 * A butterfly's round over the beds `beds` (#152): from `first` to the nearest bed it has not visited, and on, weaving
 * either side of its way, and back to `first`; it alights on each bed, somewhere on it, and rests there a while. On one
 * bed alone, it flies out over the grass and back.
 */
function flutter(beds: Bed[], first: Bed, draw: () => number): { loop: Polyline; stops: number[]; waits: number[]; paint: string } {
  const order = [first]
  while (order.length < beds.length) {
    const at = order[order.length - 1].p
    const next = beds
      .filter((b) => !order.includes(b))
      .sort((u, v) => Math.hypot(u.p.x - at.x, u.p.y - at.y) - Math.hypot(v.p.x - at.x, v.p.y - at.y))[0]
    order.push(next)
  }
  const lands = order.map((b) => ({ x: b.p.x + (draw() - 0.5) * (b.w - 1), y: b.p.y + (draw() - 0.5) * (b.d - 0.8) }))
  if (lands.length === 1) {
    const a = draw() * TAU
    lands.push({ x: lands[0].x + Math.cos(a) * 5, y: lands[0].y + Math.sin(a) * 5 })
  }
  const [pts, starts] = [[] as Vec[], [] as number[]] // the points, and where each landing's stretch starts among them
  const { weave, wave } = BUTTERFLIES
  lands.forEach((a, i) => {
    starts.push(pts.length)
    const b = lands[(i + 1) % lands.length]
    const [len, phase] = [Math.hypot(b.x - a.x, b.y - a.y), draw() * TAU]
    const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
    const n = Math.max(2, Math.ceil(len / 0.5))
    for (let j = 0; j < n; j++) {
      const t = j / n
      const side = weave * Math.sin((TAU * t * len) / wave + phase) * Math.sin(Math.PI * t)
      pts.push({ x: a.x + ux * len * t - uy * side, y: a.y + uy * len * t + ux * side })
    }
  })
  pts.push(lands[0])
  const loop = polyline(pts)
  // A stop on each bed: on one bed alone, not where it turns back over the grass.
  const stops = starts.slice(0, order.length).map((i) => loop.cum[i])
  const [lo, hi] = BUTTERFLIES.rest
  return {
    loop,
    stops,
    waits: stops.map(() => lo + draw() * (hi - lo)),
    paint: BUTTERFLIES.paints[Math.floor(draw() * BUTTERFLIES.paints.length)],
  }
}

/**
 * An allotments Block: gravel cut into plots on a grid, each bare soil with rows of crops or flowers, a shed, or
 * nothing, where it stands clear of the street trees `kerbsideTrees`. Each plot is a brick and a lot. Its details
 * (#152): a scarecrow, water butts and cold frames, each on the lot of its plot. With the Stage:
 * - Stage 1: half the plots still bare, shorter crops, and no sheds; a scarecrow on half the Blocks.
 * - Stage 2: as above; a scarecrow on every Block, a water butt by each shed, and cold frames on some plots.
 * - Stage 3: every plot worked, taller crops, and beans climbing canes on some; a second scarecrow on a big Block, and
 *   cold frames on twice as many plots.
 */
export function allotments(kit: Kit, field: Field, block: Block, kerbsideTrees: Vec[]) {
  overlay(kit, field, block, 1.6, 0.12, GRAVEL)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.12
  const { w, d, path } = ALLOTMENT
  /** Every plot laid: where, what its roll made it, and the lot it stands on. */
  const plots: { x: number; y: number; roll: number; seed: number; lot: number }[] = []
  for (let x = block.x0 + 3 + w / 2; x + w / 2 <= block.x1 - 3; x += w + path) {
    for (let y = block.y0 + 3 + d / 2; y + d / 2 <= block.y1 - 3; y += d + path) {
      const corners = [-1, 1].flatMap((i) => [-1, 1].map((j) => field.sample(x + (i * w) / 2, y + (j * d) / 2)))
      if (Math.min(...corners) < 1.8 || !inside(block.loop, x, y) || !clearOf(kerbsideTrees, x, y, w, d, 0.8)) continue
      // Its roll, and the seed of its own stream, which `staged` would draw here.
      const [roll, seed] = [kit.range(0, 1), (kit.range(0, 1) * 4294967296) >>> 0]
      plots.push({ x, y, roll, seed, lot: plots.length })
    }
  }
  // Which plots carry a detail (#152), each drawn from where the plot lies: a scarecrow in a plot of crops worked from
  // Stage 1, the one nearest the Block's middle, and at Stage 3 a second, farthest from it, on a big Block; cold frames
  // over the back row of some plots of crops or flowers, facing south, which no scarecrow stands in.
  const early = plots.filter((p) => p.roll >= 0.14 && p.roll < 0.5)
  const nearest = (to: Vec, sign: number) =>
    early.slice().sort((u, v) => sign * (Math.hypot(u.x - to.x, u.y - to.y) - Math.hypot(v.x - to.x, v.y - to.y)))[0]
  const scared = new Map<(typeof plots)[number], number>() // plot → the first Stage it has a scarecrow
  const first = nearest(mid, 1)
  if (first) scared.set(first, mulberry32(spot(first.x, first.y))() < ALLOTTED.early ? 1 : 2)
  if (first && plots.length >= ALLOTTED.second) {
    const second = nearest(first, -1)
    if (second && second !== first) scared.set(second, 3)
  }
  for (const plot of plots) {
    const { x, y, roll, seed } = plot
    // The first Stage the plot has cold frames, drawn from where it lies; none on a shed's plot or a scarecrow's.
    const frames = mulberry32(spot(x, y) ^ 0x5bd1e995)()
    const framed = scared.has(plot) || roll < 0.14 ? 0 : frames < ALLOTTED.frames[0] ? 2 : frames < ALLOTTED.frames[1] ? 3 : 0
    kit.lot(plot.lot)
    kit.staged((stage) => {
      kit.add(kit.box(w, 0.22, d, 0.3, 0.06), SOIL, x, y, ground)
      const tall = [0.3, 0.5, 0.62][stage - 1]
      if (roll < 0.14) {
        if (stage > 1) {
          kit.add(kit.box(2.4, 2.2, 2, 0.12, 0.06), SHED, x + w / 2 - 1.7, y, ground + 0.22)
          kit.add(kit.box(2.8, 0.3, 2.4, 0.12, 0.06), SHED_ROOF, x + w / 2 - 1.7, y, ground + 2.42)
        }
        kit.add(kit.box(w - 3.6, tall, d - 1.2, 0.3, 0.12), kit.pick(CROPS), x - 1.4, y, ground + 0.22)
      } else if ((stage > 1 || roll < 0.5) && (roll < 0.86 || stage === 3)) {
        const colours = roll < 0.64 || roll >= 0.86 ? CROPS : BLOOMS
        for (let r = 0; r < 3; r++) {
          const colour = kit.pick(colours)
          // Under cold frames from their Stage, the back row is drawn but not grown (#152).
          if (r === 2 && framed && stage >= framed) continue
          kit.add(kit.cuboid(w - 0.9, tall, 0.7), colour, x, y - d / 2 + 0.9 + r * 1.4, ground + 0.22)
        }
        if (stage === 3 && roll < 0.36) {
          // Beans up a row of canes, over the first row.
          const row = y - d / 2 + 0.9
          kit.add(kit.cuboid(w - 1.6, 1.5, 0.34), BEANS, x, row, ground + 0.22)
          for (const k of [-1, 1]) kit.add(kit.cuboid(0.1, 1.9, 0.1), CANES, x + k * (w / 2 - 0.7), row, ground + 0.22)
        }
      }
      kit.brick('tree', x, y, ground)
    }, seed)
    // Its details (#152): a water butt at the front corner of a shed, from Stage 2 as the shed; cold frames; a scarecrow.
    if (roll < 0.14) kit.from(2, () => waterButt(kit, x + w / 2 - 0.95, y - d / 2 + 0.62, ground + 0.22), spot(x + 1, y))
    if (framed) kit.from(framed, () => coldFrames(kit, x, y + d / 2 - 0.9, ground + 0.22, Math.PI, w - 1.2), spot(x, y + 1))
    const scare = scared.get(plot)
    if (scare) {
      const turn = (mulberry32(spot(x, y))() - 0.5) * 0.6
      kit.from(scare, () => kit.scarecrow(x + (spot(x, y) % 2 ? 1 : -1) * 1.2, y + 0.7, ground + 0.22, turn), spot(x, y - 1))
    }
  }
  kit.lot(-1)
}

// A picnic blanket's colours, its gingham's pale stripe and the basket (#152, #210); a parasol's pole is iron as a
// bench's ends are (the kit's `BENCH`).
const PICNIC = { blankets: ['#ffadc8', '#f6d36a', '#7fbf9d', '#c7b8f0', '#f0b43c'], stripe: '#fbf8f2', basket: '#c49a6c', lid: '#a1714c' }

/**
 * A picnic blanket laid at `(x, y)`, turned `ry`, as one brick (#152): gingham in one of the blankets' colours, with a
 * basket on it if `basket`, and a parasol over it in another colour if `parasol`. Oversized a little.
 */
function blanket(kit: Kit, x: number, y: number, h: number, ry: number, basket: boolean, parasol: boolean) {
  const [colour, shade] = [kit.pick(PICNIC.blankets), kit.pick(PICNIC.blankets)]
  kit.add(kit.cuboid(2.6, 0.04, 2), colour, x, y, h, ry)
  for (const k of [-1, 0, 1]) {
    kit.local(kit.cuboid(0.18, 0.012, 2), PICNIC.stripe, x, y, ry, k * 0.78, 0, h + 0.04)
    kit.local(kit.cuboid(2.6, 0.012, 0.18), PICNIC.stripe, x, y, ry, 0, k * 0.6, h + 0.04)
  }
  if (basket) {
    kit.local(kit.cuboid(0.62, 0.36, 0.42), PICNIC.basket, x, y, ry, 0.72, 0.5, h + 0.04)
    kit.local(kit.cuboid(0.66, 0.05, 0.46), PICNIC.lid, x, y, ry, 0.72, 0.5, h + 0.4)
    for (const k of [-1, 1]) kit.local(kit.cuboid(0.04, 0.26, 0.04), PICNIC.lid, x, y, ry, 0.72 + k * 0.24, 0.5, h + 0.45)
    kit.local(kit.cuboid(0.52, 0.04, 0.04), PICNIC.lid, x, y, ry, 0.72, 0.5, h + 0.71)
  }
  if (parasol) {
    const [px, py] = to(x, y, ry, -0.95, 0.7)
    kit.add(kit.cuboid(0.06, 2.3, 0.06), BENCH.iron, px, py, h)
    kit.add(SHAPES.cone12, shade, px, py, h + 1.95, 0, 1.4, 0.5, 1.4)
    kit.shadow(px, py, h, 3, 3, true)
  }
  kit.brick('ground', x, y, h)
}

// A water butt and its lid; and a cold frame's painted base and its glass, painted pale as the greenhouses' film is: the
// kit's glass would add a mesh to every green build, which never draws it (#152).
const BUTT = { body: '#4f8a6e', lid: '#3d6d57' }
const FRAME = { base: '#f4f1ea', glass: '#d6ece6' }
/** A cold frame's glass (#152): a box 1 m across, 1 m deep and 0.36 m tall at its back, its top sloping to 0.14 m at its front (-z). */
const LIGHT = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed()
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.5) pos.setY(i, pos.getZ(i) < 0 ? 0.14 : 0.36)
  g.computeVertexNormals()
  return g
})()

/** A water butt at `(x, y)`, as one brick that drops in (#152): a green barrel under a darker lid, oversized a little. */
function waterButt(kit: Kit, x: number, y: number, h: number) {
  kit.add(SHAPES.cylinder, BUTT.body, x, y, h, 0, 0.42, 1.1, 0.42)
  kit.add(SHAPES.cylinder, BUTT.lid, x, y, h + 1.1, 0, 0.45, 0.07, 0.45)
  kit.shadow(x, y, h, 1.3, 1.3, true)
  kit.brick('building', x, y, h)
}

/**
 * Cold frames in a row `w` m long at `(x, y)`, their fronts facing `ry`, as one brick that drops in (#152): glass
 * lights 1.1 m deep, sloping down to the front, on a low painted base, one to every 1.3 m or so.
 */
function coldFrames(kit: Kit, x: number, y: number, h: number, ry: number, w: number) {
  const n = Math.max(1, Math.round(w / 1.3))
  const each = w / n
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + (k + 0.5) * each
    kit.put(kit.cuboid(each - 0.08, 0.24, 1.1), FRAME.base, x, y, ry, lx, 0, h)
    kit.add(LIGHT, FRAME.glass, ...to(x, y, ry, lx, 0), h + 0.24, ry, each - 0.14, 1, 1.1)
  }
  kit.shadow(x, y, h, w + 1, 2, true, ry) // round, as a scarecrow's or a water butt's: allotments draw no other shadow
  kit.brick('building', x, y, h)
}
