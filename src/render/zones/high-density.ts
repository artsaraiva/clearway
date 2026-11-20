import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { type Bounds, middle, polyline, type Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { planter, type Footprint } from '../kerbside'
import { AERIAL, boxFace, CREAM, FACES, FRONTAGE, FUTONS, GARDEN, type Kit, LEAVES, PLANT, PLAY, SHAPES, spot, TANK, to } from '../kit'
import { PATTERN } from '../pattern'
import { FACET, STACKED } from '../prototype-look'
import { bedTree, bench, BLOOMS, GLOWS, railing, SETTS, STONE, waiting, WOOD } from '../props'
import { fit, lotsOf, overlap, PLANTER, stands, turned, type Look, type RowLot, type ZoneGround } from './ground'
import { facetTower } from './prototype-facet-tower'
import { beside, clearOfScenes, placeScenes, sceneOrder, type Scene, unlike } from './scenes'

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
  // The faces of a podium a foot tries in turn (of `FACES`): south, east, west, north, as the default camera sees them.
  sides: [1, 2, 3, 0],
} as const
const LAWN = '#a9db7f' // a garden's, as the kit's
// The storeys a residential tower stands at each Stage, from the floors it draws, which are its Stage 2 floors.
const TOWER_FLOORS = (f: number, stage: number) => Math.round(f * [0.55, 1, 1.25][stage - 1])
// High-density residential built to the Finish (#183). Each Block's plan is drawn from a stream of its own, so the kit's
// draws are as they were. Its scenes: a fountain court or a sculpture court beside a tower's podium, between two towers
// where two stand, of one of `sizes` (m along the podium and out from it), `off` m out; a second at Stage 3 on a Block
// of `second` m² or more; and where no court finds ground, a tower's playground or garden is the Block's scene. A
// tower's form, of `forms` by their shares, where its own is a neighbour's another. Its door opens under a canopy
// `canopy` (m along the podium and out from it) on the free face nearest the Block's edge; `store` of the towers keep a
// convenience store behind another face from Stage 2, and `ramp` of them a ramp down to parking (m wide and long) on
// another still. The tallest tower of a Block, of `lift` Stage 2 floors or more, has a glass lift up one face. Plaza
// paving reaches up to `plaza` m out from a podium in one of `paving`'s colours a Block, `edge` m in from the Block's
// edge. The share of balconies with string lights at each Stage.
const HIGH_FINISH = {
  scenes: ['fountain', 'sculpture'] as HighScene[],
  sizes: [
    [10, 5.6],
    [8, 5],
    [6.5, 4.6],
  ],
  off: 0.6,
  second: 2500,
  forms: ['slab', 'slab', 'stepped', 'core', 'corner'] as TowerForm[],
  canopy: [5, 2.6],
  store: 0.4,
  ramp: { share: 0.7, wide: 3.8, long: 5.2 },
  lift: 15,
  plaza: 3.5,
  edge: 0.9,
  paving: ['#ead9c6', '#e4d8dc', '#dde4d6'],
  strings: [0, 0.07, 0.12],
} as const
type HighScene = 'fountain' | 'sculpture'
/** A tower's form (#183): balconies up the middle of its long faces; that, its top floors set back; that, a lift core up one end; or balconies at its corners. */
type TowerForm = 'slab' | 'stepped' | 'core' | 'corner'
/** What a face of a tower's podium is given over to (#183), of `FACES`. */
type FaceUse = 'court' | 'foot' | 'door' | 'store' | 'ramp'

/** A playground or a garden at a tower's foot (#155): its ground, `l` m along the podium and `dep` out from it. */
interface Foot {
  ground: RowLot
  l: number
  dep: number
}

/** A tower as its Block's plan has it (#183): its lot, its body and podium, the kit's draws, and what its plan gives it. */
interface Tower {
  lot: number
  bounds: Bounds
  x: number
  y: number
  w: number
  d: number
  podium: RowLot
  /** Its podium with `HIGH.foot.apart` m round it, which other towers' ground keeps off. */
  own: RowLot
  /** Its Stage 2 floors, and the seed of its own stream, as the kit drew them. */
  floors: number
  seed: number
  faces: (FaceUse | undefined)[]
  form: TowerForm
  foot?: Foot
  door: number
  canopy: boolean
  store?: number
  ramp?: RowLot
  lift: boolean
}

/** High-density residential's look (`./index`). */
export const look: Look = { landmarks: true, finish: true, fill: towers }

/** Ground `l` m along face `k` (of `FACES`) of podium `p` and `dep` m out from it, from `off` m out, `along` m along it from its middle. */
function besideFace(p: RowLot, k: number, l: number, dep: number, off: number, along = 0): RowLot {
  const { ry, half } = boxFace(k, p.w, p.d)
  const c = turned(p.x, p.y, ry, along, half + off + dep / 2)
  return { x: c.x, y: c.y, w: l, d: dep, ry, onRoad: false }
}

/** Whether ground `l` stands on the Block `clear` m in from its edge, off everything `taken` but `own`. */
const free = (g: ZoneGround, l: RowLot, taken: RowLot[], own: RowLot, clear = 0.6) =>
  stands(g, l.x, l.y, l.w, l.d, clear, l.ry) && !taken.some((o) => o !== own && overlap(o, l))

/** Take ground `l`: later ground keeps off it (`taken`), and so does what the kit and the kerbside place (`kit.stand`). */
function claim(kit: Kit, taken: RowLot[], l: RowLot) {
  taken.push(l)
  kit.stand(l.x, l.y, l.w, l.d, l.ry)
}

/**
 * High-density residential: a pale residential tower on each large lot, with room around it. It stands at 55% of its
 * floors at Stage 1 and 125% at Stage 3, with the finish its Stage gives it (`residentialTower`).
 *
 * To the Finish (#183), as the Block's plan has it (`HIGH_FINISH`): once every podium has its ground, the Block reserves a
 * fountain court or a sculpture court beside one, and a second at Stage 3 on a Block of 2,500 m² or more; then each
 * tower takes a playground or a garden at its foot (#155), a door under a canopy on the free face nearest the Block's
 * edge, and some a convenience store and a ramp down to parking on other faces. No tower is its neighbour's form. Each
 * stands on patterned paving, with a letter-box bank and bicycles by its door, benches along its other faces, and trees
 * in planters at its podium's corners from Stage 2; the tallest of a Block has a glass lift up one face.
 */
function towers(g: ZoneGround) {
  const { kit, block } = g
  const { podium, most, gap } = TOWERS
  const centre = middle(block)
  const plans = mulberry32(spot(centre.x, centre.y) ^ 0x7e51de) // the plans' own stream: the kit's draws as they were
  const lots = lotsOf(g, TOWERS.margin, TOWERS.lot)
  const stood: Tower[] = []
  for (const [i, lot] of lots.entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [Math.min(most[0], lot.x1 - lot.x0 - 2 * gap), Math.min(most[1], lot.y1 - lot.y0 - 2 * gap)]
    const base = fit(g, x, y, w + 2 * podium, d + 2 * podium, TOWERS.clear, TOWERS.least + 2 * podium, 2.5, 2)
    if (!base) continue
    kit.lot(i, lot)
    // The kit's draws, as they were: its floors, then the seed of its own stream (`kit.staged`'s).
    const floors = Math.round(kit.range(...TOWERS.floors))
    const seed = (kit.rand() * 4294967296) >>> 0
    const p = { x, y, w: base.w, d: base.d, ry: 0, onRoad: false }
    const own = { ...p, w: p.w + 2 * HIGH.foot.apart, d: p.d + 2 * HIGH.foot.apart }
    stood.push({
      ...{ lot: i, bounds: lot, x, y, w: base.w - 2 * podium, d: base.d - 2 * podium, podium: p, own, floors, seed },
      ...{ faces: [], form: 'slab', door: 1, canopy: false, lift: false },
    })
  }
  kit.lot(-1)
  if (!stood.length) return
  const taken: RowLot[] = [...g.lamps.map(({ x, y }) => ({ x, y, w: 1.4, d: 1.4, ry: 0, onRoad: false })), ...stood.map((t) => t.own)]
  // The Block's courts, before anything else takes the ground beside a podium.
  const order = sceneOrder(g, plans, HIGH_FINISH.scenes, HIGH_FINISH.second)
  const courts = placeScenes<HighScene, Scene<HighScene>>(order, HIGH_FINISH.scenes, (_, out) => courtGround(g, plans, stood, taken, out))
  // Then a playground or a garden at each tower's foot (#155), on its tower's lot.
  for (const t of stood) towerFoot(g, t, taken)
  // Each tower's door, toward the Block's edge; a store and a ramp for some; its form, which no neighbour has.
  const nearEdge = (t: Tower) => (k: number) => {
    const l = besideFace(t.podium, k, 1, 1, 3.5)
    return g.field.sample(l.x, l.y)
  }
  const unused = (t: Tower) => [0, 1, 2, 3].filter((k) => !t.faces[k]).sort((a, b) => nearEdge(t)(a) - nearEdge(t)(b))
  for (const t of stood) {
    const canopyAt = (k: number) => besideFace(t.podium, k, HIGH_FINISH.canopy[0] + 0.6, HIGH_FINISH.canopy[1] + 0.4, 0)
    const open = (l: RowLot, clear: number) => free(g, l, taken, t.own, clear) && kit.unclaimed(l.x, l.y, l.w, l.d, l.ry)
    const spare = unused(t)
    const covered = spare.find((k) => open(canopyAt(k), 0.5))
    t.canopy = covered !== undefined
    t.door = covered ?? spare[0]
    t.faces[t.door] = 'door'
    if (t.canopy) claim(kit, taken, canopyAt(t.door))
    const [hasStore, hasRamp] = [plans() < HIGH_FINISH.store, plans() < HIGH_FINISH.ramp.share]
    if (hasStore) {
      t.store = unused(t).find((k) => open(besideFace(t.podium, k, 2, 1.4, 0), 0.3))
      if (t.store !== undefined) t.faces[t.store] = 'store'
    }
    if (hasRamp) {
      const found = unused(t)
        .map((k) => ({ k, l: besideFace(t.podium, k, HIGH_FINISH.ramp.wide, HIGH_FINISH.ramp.long, 0) }))
        .find(({ l }) => open(l, 0.5))
      if (found) {
        t.faces[found.k] = 'ramp'
        t.ramp = found.l
        claim(kit, taken, found.l)
      }
    }
  }
  const laid: Tower[] = []
  for (const t of stood) {
    t.form = HIGH_FINISH.forms[Math.floor(plans() * HIGH_FINISH.forms.length)]
    t.form = unlike(
      t.form,
      laid.filter((s) => beside(s.bounds, t.bounds)).map((s) => s.form),
      HIGH_FINISH.forms,
      plans,
    )
    laid.push(t)
  }
  const tallest = stood.reduce((a, t) => (t.floors > a.floors ? t : a))
  tallest.lift = tallest.floors >= HIGH_FINISH.lift
  const paving = HIGH_FINISH.paving[Math.floor(plans() * HIGH_FINISH.paving.length)]

  for (const t of stood) {
    kit.lot(t.lot, t.bounds)
    const { x, y, w, d, floors } = t
    // A helipad and beacons on the roofs of the tallest (#155), by the floors each tower draws for Stage 2.
    const high = (from: readonly number[], stage: number) => stage > 1 && floors >= from[stage - 2]
    kit.staged((stage) => {
      const rooftop = { pad: high(HIGH.pad, stage), beacon: high(HIGH.beacon, stage) }
      // PROTOTYPE (`../prototype-look`): the faceted tower in its place.
      const tower = STACKED ? facetTower : residentialTower
      tower(kit, x, y, KERB, w, d, TOWER_FLOORS(floors, stage), stage, { ...t, ...rooftop })
    }, t.seed)
    towerGround(g, t, taken, paving)
  }
  // A Block no court found ground on, or only one, counts a tower's playground or garden as its scene.
  // ponytail: no Block of seeds 1 to 5 needs it. Ceiling: a garden has nothing larger than a car before its Stage 3
  // tree, so such a Block would fail rule 5 at Stage 2. Upgrade: an arbour over the garden's bench from Stage 2.
  const feet = stood.filter((t) => t.foot)
  feet.forEach((t, n) => {
    kit.lot(t.lot)
    const play = () => footPieces(kit, t.foot!)
    if (n < order.length - courts.length) kit.scene(playground(t.foot!) ? 'playground' : 'garden', play)
    else play()
  })
  kit.lot(-1)
  for (const { kind, ground: s, from } of courts)
    kit.scene(kind, () => kit.staged((stage) => court(kit, kind, s, stage, from), spot(s.x, s.y)))
}

/**
 * Ground for a court of a high-density Block (#183), drawn from `draw`: beside the podium of one of `stood`, from one
 * drawn in turn, on a face that looks at another tower first, as large as `HIGH_FINISH.sizes` has room for, on the Block and
 * clear of everything `taken` and of the courts `out`. It takes its ground and its podium's face; null if none is free.
 */
function courtGround(g: ZoneGround, draw: () => number, stood: Tower[], taken: RowLot[], out: Scene<HighScene>[]) {
  const first = Math.floor(draw() * stood.length)
  /** Whether face `k` of `t`'s podium looks at another tower's, within 16 m. */
  const between = (t: Tower, k: number) => {
    const [fx, fy] = FACES[k]
    const { half, len } = boxFace(k, t.podium.w, t.podium.d)
    return stood.some((u) => {
      const [ox, oy] = [u.x - t.x, u.y - t.y]
      const [ahead, aside] = [ox * fx + oy * fy, Math.abs(ox * fy - oy * fx)]
      return u !== t && ahead > half && ahead < half + 16 + (fx ? u.podium.w : u.podium.d) / 2 && aside < len / 2
    })
  }
  for (const [l, dep] of HIGH_FINISH.sizes) {
    for (let n = 0; n < stood.length; n++) {
      const t = stood[(first + n) % stood.length]
      const spare = HIGH.sides.filter((k) => !t.faces[k])
      for (const k of [...spare.filter((k) => between(t, k)), ...spare.filter((k) => !between(t, k))]) {
        const ground = besideFace(t.podium, k, Math.min(l, boxFace(k, t.podium.w, t.podium.d).len + 2), dep, HIGH_FINISH.off)
        if (!free(g, ground, taken, t.own) || !clearOfScenes(out, ground)) continue
        t.faces[k] = 'court'
        claim(g.kit, taken, ground)
        return { ground }
      }
    }
  }
  return null
}

/**
 * Ground for a playground or a garden at the foot of tower `t` (#155): along the first free face of its podium with
 * room for one, the sides the default camera sees first, as large as there is room for, up to `HIGH.foot`'s, on the
 * Block and clear of everything `taken` but the podium's own ground, which it then takes.
 */
function towerFoot(g: ZoneGround, t: Tower, taken: RowLot[]) {
  const { long, deep, least, shallow, off } = HIGH.foot
  for (const k of HIGH.sides) {
    if (t.faces[k]) continue
    const { len } = boxFace(k, t.podium.w, t.podium.d)
    for (let dep = deep; dep >= shallow; dep -= 0.5) {
      for (let l = Math.min(long, len + 2); l >= least; l -= 1) {
        const ground = besideFace(t.podium, k, l, dep, off)
        if (!free(g, ground, taken, t.own)) continue
        taken.push(ground)
        t.faces[k] = 'foot'
        t.foot = { ground, l, dep }
        return
      }
    }
  }
}

/** Whether a tower's foot is a playground, or else a garden (#155): half the time each, drawn from where it lies. */
const playground = ({ ground: c }: Foot) => mulberry32(spot(c.x, c.y))() < 0.5

/**
 * The playground or garden on a tower's foot `foot` (#155). Which it is, and each piece of it, is drawn from where it
 * stands. With the Stage:
 * - Stage 1: a bench against the podium.
 * - Stage 2: a playground's soft ground, slide and swings, or a garden's lawn, a flower bed and a bench.
 * - Stage 3: a sandbox and a spring rider in the playground, or a tree, a second bed and a second bench in the garden.
 */
function footPieces(kit: Kit, foot: Foot) {
  const { ground: c, l, dep } = foot
  const { ry } = c
  const { paved } = HIGH.foot
  const piece = (stage: number, lx: number, ly: number, fn: (p: Vec) => void) => {
    const p = turned(c.x, c.y, ry, lx, ly)
    kit.from(stage, () => fn(p), spot(p.x, p.y))
  }
  // The soft ground or the lawn runs from `a` to `b` along the podium, and the last `paved` m stay paved.
  const [a, b] = [-l / 2, l / 2 - paved]
  const [mid, out, inner] = [(a + b) / 2, dep / 2, -dep / 2]
  piece(1, b + paved / 2, inner + 0.6, (p) => kit.bench(p.x, p.y, KERB, ry))
  if (playground(foot)) {
    const swings = b - a >= 6.2
    piece(2, mid, 0, (p) => kit.surface(p.x, p.y, KERB, b - a, dep, ry))
    piece(2, a + 2.3, out - 1.3, (p) => slide(kit, p.x, p.y, KERB + 0.1, ry))
    if (swings) piece(2, b - 2.1, -0.2, (p) => kit.swings(p.x, p.y, KERB + 0.1, ry))
    piece(3, a + 1.3, inner + 1, (p) => sandbox(kit, p.x, p.y, KERB + 0.1, 1.8, 1.4, ry))
    // The rider keeps off the slide's foot: beyond the swings, or by the podium where the ground is too short for them.
    piece(3, b - 0.8, swings ? out - 0.8 : inner + 0.9, (p) => kit.rider(p.x, p.y, KERB + 0.1, ry))
  } else {
    piece(2, mid, 0, (p) => kit.surface(p.x, p.y, KERB, b - a, dep, ry, LAWN))
    piece(2, a + 0.7, 0, (p) => kit.flowerBed(p.x, p.y, KERB + 0.1, 1, dep - 1.2, ry, kit.pick(BLOOMS)))
    piece(2, a + 2.4, out - 0.6, (p) => kit.bench(p.x, p.y, KERB + 0.1, ry + Math.PI))
    piece(3, mid + 0.5, -0.4, (p) => kit.tree(p.x, p.y, KERB + 0.1, kit.range(0.42, 0.5), kit.chance(0.4) ? 'sakura' : 'round'))
    piece(3, (a + 1.6 + b - 0.4) / 2, inner + 0.7, (p) => kit.flowerBed(p.x, p.y, KERB + 0.1, b - a - 2, 1, ry, kit.pick(BLOOMS)))
    piece(3, b - 1.2, out - 0.6, (p) => kit.bench(p.x, p.y, KERB + 0.1, ry + Math.PI))
  }
}

// What stands round a tower built to the Finish (#183): a ramp's portal, tarmac, header band and walls; a letter-box
// bank's steel and slots; a court's sculpture; and a store's sign boards, each with its stripes.
const RAMP = { portal: '#3a4048', tarmac: '#70757c', band: '#f0c75e', arm: '#fbf8f2' }
const LETTERS = { steel: '#c4ccd4', slot: '#4a525c' }
const FOUNTAIN = '#7fd0e2' // its water
const SCULPTURE = ['#5aa69b', '#f0c75e', '#fbf8f2', '#ff9cbb']
const STORES = [
  { board: '#fbf8f2', stripes: ['#3fa56b', '#f0b43c'] },
  { board: '#2f7d5b', stripes: ['#fbf8f2'] },
  { board: '#fbf8f2', stripes: ['#8a6fd1', '#f0b43c'] },
]

/**
 * The ground round tower `t` (#183): patterned paving out from its podium as far as the Block allows; by its door a
 * letter-box bank, Block-zoom, and bicycles from Stage 2; a bench, Block-zoom, toward each end of the faces nothing else has,
 * the second from Stage 2; a tree in a planter at a corner of its podium from Stage 2 and at a second at Stage 3; and its
 * ramp down to parking. Each on free, unclaimed ground, which it takes.
 */
function towerGround(g: ZoneGround, t: Tower, taken: RowLot[], paving: string) {
  const { kit } = g
  const { x, y, podium: p } = t
  for (let reach = HIGH_FINISH.plaza; reach >= 1; reach -= 0.5) {
    const [pw, pd] = [p.w + 2 * reach, p.d + 2 * reach]
    if (!stands(g, x, y, pw, pd, HIGH_FINISH.edge)) continue
    kit.from(1, () => kit.paving(x, y, KERB, pw, pd, 0, paving), spot(x, y) + 11)
    break
  }
  /** Take ground `l`, and say so, if it is free, 0.5 m in from the Block's edge, and unclaimed. */
  const takeIfFree = (l: RowLot) => {
    if (!free(g, l, taken, t.own, 0.5) || !kit.unclaimed(l.x, l.y, l.w, l.d, l.ry)) return false
    claim(kit, taken, l)
    return true
  }
  for (const k of [0, 1, 2, 3]) {
    const given = t.faces[k]
    if (given === 'court' || given === 'foot' || given === 'ramp' || given === 'store') continue
    const { ry, len } = boxFace(k, p.w, p.d)
    const end = len / 2 - 1.7
    if (given === 'door') {
      const post = besideFace(p, k, 1.7, 0.6, 0.05, end)
      if (takeIfFree(post)) kit.from(1, () => letterBoxes(kit, post.x, post.y, ry), spot(post.x, post.y))
      const rack = besideFace(p, k, 3.4, 2.1, 0.15, -end + 0.6)
      if (takeIfFree(rack)) kit.from(2, () => kit.bicycles(rack.x, rack.y, KERB, ry, kit.chance(0.5) ? 5 : 4), spot(rack.x, rack.y))
      continue
    }
    for (const [n, side] of [1, -1].entries()) {
      const seat = besideFace(p, k, 2.2, 0.8, 0.2, side * end)
      if (takeIfFree(seat)) kit.from(n + 1, () => bench(kit, seat.x, seat.y, ry), spot(seat.x, seat.y))
    }
  }
  // Trees in planters at the podium's corners: the south-east first, as the default camera sees it.
  let beds = 0
  for (const [i, j] of [
    [1, -1],
    [-1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const [bx, by] = [x + i * (p.w / 2 + 1.3), y + j * (p.d / 2 + 1.3)]
    if (beds === 2 || !takeIfFree({ x: bx, y: by, w: 2.1, d: 2.1, ry: 0, onRoad: false })) continue
    kit.from(beds++ ? 3 : 2, () => bedTree(kit, bx, by, 0.95, kit.range(0.34, 0.4), true), spot(bx, by))
  }
  if (t.ramp) kit.from(1, () => ramp(kit, t.ramp!), spot(t.ramp.x, t.ramp.y))
}

/**
 * A ramp down to parking on ground `l` before a podium's face (#183), as one brick: tarmac between two low walls that
 * rise toward a dark portal in the podium under a header band, and a barrier's arm across it.
 */
function ramp(kit: Kit, { x, y, w, d, ry }: Footprint) {
  kit.paving(x, y, KERB, w - 0.5, d, ry, RAMP.tarmac, PATTERN.tarmac, 0.02)
  kit.local(kit.cuboid(w - 0.6, 2.7, 0.3), RAMP.portal, x, y, ry, 0, -d / 2 + 0.15, KERB)
  kit.local(kit.cuboid(w, 0.5, 0.4), RAMP.band, x, y, ry, 0, -d / 2 + 0.2, KERB + 2.7)
  for (const k of [-1, 1]) {
    kit.local(kit.cuboid(0.25, 0.9, d * 0.5), STONE.rim, x, y, ry, (k * (w - 0.25)) / 2, -d / 4, KERB)
    kit.local(kit.cuboid(0.25, 0.5, d * 0.5), STONE.rim, x, y, ry, (k * (w - 0.25)) / 2, d / 4, KERB)
  }
  kit.local(kit.cuboid(0.3, 1.1, 0.3), RAMP.band, x, y, ry, w / 2 - 0.45, d / 2 - 0.6, KERB)
  kit.local(kit.cuboid(w - 1, 0.1, 0.1), RAMP.arm, x, y, ry, 0, d / 2 - 0.6, KERB + 1)
  kit.brick('building', x, y, KERB)
}

/** A letter-box bank at `(x, y)` against a wall, facing `ry`, as one Block-zoom brick (#183): a steel cabinet on legs, a slot to a flat. */
function letterBoxes(kit: Kit, x: number, y: number, ry: number) {
  kit.blockZoomProps(() => {
    kit.put(kit.cuboid(1.5, 1.0, 0.36), LETTERS.steel, x, y, ry, 0, 0, KERB + 0.45)
    for (const lx of [-0.65, 0.65]) kit.put(kit.cuboid(0.08, 0.45, 0.3), LETTERS.slot, x, y, ry, lx, 0, KERB)
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++)
        kit.put(kit.cuboid(0.24, 0.05, 0.02), LETTERS.slot, x, y, ry, (col - 1.5) * 0.34, 0.19, KERB + 0.68 + row * 0.3)
  })
  kit.brick('building', x, y, KERB)
}

/**
 * A high-density Block's court at Stage `stage` (#183), on its ground: a tree in a bed and two benches until the Stage
 * it stands `from`, then a fountain court or a sculpture court.
 */
function court(kit: Kit, kind: HighScene, ground: Footprint, stage: number, from: number) {
  if (stage < from) return waiting(kit, ground, 0.95, 0.4, 2.3, true)
  const { x, y, w, d, ry } = ground
  kit.paving(x, y, KERB, w, d, ry, SETTS, PATTERN.setts, 0.02)
  // Low lights at its corners, two and then four, each with its pool; a bench at each end at Stage 3, Block-zoom.
  const corners = [
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ].slice(0, stage === 3 ? 4 : 2)
  const lights = () => {
    for (const [i, j] of corners) {
      const [lx, ly] = to(x, y, ry, i * (w / 2 - 0.45), j * (d / 2 - 0.45))
      kit.add(kit.cuboid(0.24, 0.55, 0.24), STONE.dark, lx, ly, KERB)
      kit.add(kit.cuboid(0.28, 0.16, 0.28), kit.lit(CREAM, GLOWS.low), lx, ly, KERB + 0.55)
      kit.pool('cream', lx, ly, KERB, 2.6, 2.6)
    }
  }
  if (kind === 'fountain') {
    // A stone basin of water, a bowl on a column in its middle, and at Stage 3 a second bowl over it.
    const r = Math.min(2.4, d / 2 - 0.2)
    const water = { material: kit.glass, tint: kit.glassOf(FOUNTAIN), glow: 0 } // the glass, as a pond's water is
    kit.drum(STONE.rim, x, y, KERB, r, r, 0.55)
    kit.drum(water, x, y, KERB + 0.5, r - 0.28, r - 0.28, 0.08)
    kit.drum(STONE.step, x, y, KERB, 0.42, 0.42, 1.5)
    kit.drum(STONE.rim, x, y, KERB + 1.5, 1.15, 1.15, 0.22)
    kit.drum(water, x, y, KERB + 1.68, 0.98, 0.98, 0.06)
    kit.drum(STONE.step, x, y, KERB + 1.7, 0.26, 0.26, 1.3)
    if (stage === 3) {
      kit.drum(STONE.rim, x, y, KERB + 2.6, 0.62, 0.62, 0.18)
      kit.drum(water, x, y, KERB + 2.74, 0.5, 0.5, 0.06)
    }
    kit.ball(STONE.rim, x, y, KERB + 3.2, 0.3)
    lights()
    kit.shadow(x, y, KERB, 2 * r + 1, 2 * r + 1, true)
    kit.brick('building', x, y, KERB)
  } else {
    // Three blocks stacked askew on a plinth, and at Stage 3 a ball on top and a planter along its back.
    const own = mulberry32(spot(x, y) ^ 0x5c01d)
    const first = Math.floor(own() * SCULPTURE.length)
    kit.add(kit.cuboid(2, 0.5, 2), STONE.step, x, y, KERB, ry)
    for (let k = 0; k < 3; k++) {
      const s = [1.5, 1.2, 0.95][k]
      kit.add(kit.box(s, 1, s, 0.3, 0.08), SCULPTURE[(first + k) % SCULPTURE.length], x, y, KERB + 0.5 + k, ry + own() * Math.PI)
    }
    if (stage === 3) kit.ball(SCULPTURE[(first + 3) % SCULPTURE.length], x, y, KERB + 3.95, 0.45)
    lights()
    kit.shadow(x, y, KERB, 3.4, 3.4, true)
    kit.brick('building', x, y, KERB)
    if (stage === 3) planter(kit, ...to(x, y, ry, 0, -d / 2 + 0.5), ry, Math.min(4, w - 2.4))
  }
  if (stage < 3) return
  for (const k of [-1, 1]) bench(kit, ...to(x, y, ry, k * (w / 2 - 0.5), 0), ry - (k * Math.PI) / 2)
}

// The props only high-density lays: their palette and builders, beside the fill that lays them (#210). A slide's posts,
// deck and chute; a sandbox's sand and rim are the kit's playground colours (`PLAY`), as are the swings and the rider.
const SLIDE = { frame: '#5aa69b', deck: '#f4f1ea', chute: '#f0c75e' }

/**
 * A slide at `(x, y)`, running down along `ry`'s right (its chute toward +x when `ry` is 0), as a brick that pops in
 * (#155): a ladder to a deck on four posts, and the chute.
 */
function slide(kit: Kit, x: number, y: number, h: number, ry: number) {
  const deck = 1.7
  for (const i of [-0.55, 0.55])
    for (const j of [-0.55, 0.55]) kit.local(kit.cuboid(0.14, deck + 1, 0.14), SLIDE.frame, x, y, ry, -1 + i, j, h)
  kit.local(kit.cuboid(1.3, 0.12, 1.3), SLIDE.deck, x, y, ry, -1, 0, h + deck)
  for (let k = 1; k < 5; k++) kit.local(kit.cuboid(0.12, 0.08, 1.1), SLIDE.deck, x, y, ry, -1.85, 0, h + (k * deck) / 5) // the ladder
  const chute = new THREE.BoxGeometry(3.2, 0.12, 0.9).rotateZ(-Math.atan2(deck, 2.8)).translate(0.5, deck / 2 + 0.06, 0)
  kit.local(chute, SLIDE.chute, x, y, ry, 0, 0, h)
  chute.dispose()
  kit.shadow(x, y, h, 5, 2.2, false, ry)
  kit.brick('tree', x, y, h)
}

/** A sandbox `w` by `d` at `(x, y)`, turned `ry`, as a brick (#155): a wooden rim round the sand. */
function sandbox(kit: Kit, x: number, y: number, h: number, w: number, d: number, ry: number) {
  kit.local(kit.cuboid(w - 0.3, 0.2, d - 0.3), PLAY.sand, x, y, ry, 0, 0, h)
  for (const k of [-1, 1]) {
    kit.local(kit.cuboid(w, 0.34, 0.16), PLAY.rim, x, y, ry, 0, (k * (d - 0.16)) / 2, h)
    kit.local(kit.cuboid(0.16, 0.34, d - 0.32), PLAY.rim, x, y, ry, (k * (w - 0.16)) / 2, 0, h)
  }
  kit.brick('ground', x, y, h)
}

// The residential tower: its palette and its builder, beside the fill that lays it (#207).
const { bush: BUSH, cone12: CONE, cylinder: CYLINDER, sphere: SPHERE } = SHAPES
const TAU = Math.PI * 2
// High-density residential: pale walls, so the towers read as homes beside the offices' glass, and white or stone trim.
const FLATS = { walls: ['#fbf3e6', '#eef5f0', '#f4eefb', '#fdf0e2', '#eaf3f8', '#f8eef0'], trims: ['#ffffff', '#e9e4da', '#d9e3ea'] }
const POTS = ['#d09c53', '#c49a6c', '#e9e4da'] // balcony plants' pots (#155)
const BEACON = { mast: 2.2, r: 0.85 } // a roof beacon's mast, m tall, and its bulb's radius
// A tower built to the Finish (#183): its railings and its lift's rails, its door frames, how brightly its lobby and its
// store's window glow, and the glass lift's stops, in s.
const TOWER_FINISH = { rail: '#9aa3ad', frame: '#4a525c', lobby: 1.3, store: 1.5, soffit: 1, waits: [6, 14] }

/** What its Block's plan gives a residential tower (`residentialTower`): its roof's helipad and beacons (#155), and its `Tower`'s finish. */
type TowerPlan = { pad?: boolean; beacon?: boolean } & Partial<Pick<Tower, 'form' | 'door' | 'canopy' | 'store' | 'lift'>>

/**
 * A residential tower at Stage `stage`, of `floors` storeys on a footprint `w` (east–west) by `d`, centred on
 * `(x, y)`, as one brick: a podium with a lit lobby, a pale wall with windows lit or dark one by one, a stack of
 * balconies up the middle of its two long faces, and on its roof a water tank. The caller gives each Stage its floors,
 * and says whether its roof is a helipad and has beacons (#155). Some balconies have plants in pots, washing on a
 * pole or a futon over the railing (#155), each balcony's drawn from where it stands; washing and futons sway in the
 * wind (`../movers`) and ride its brick.
 * - Stage 1: a tank, a lift overrun and an antenna on its roof, and plants on a few balconies.
 * - Stage 2: a railing round the roof and a little garden on it; plants on more balconies, and washing out on some.
 * - Stage 3: a band of trim round the wall every four floors, a crown of lit glass under a deeper cap, and a bigger
 *   roof garden under a pergola; more plants and washing, and futons aired on a few balconies.
 *
 * A helipad takes the whole roof, with no tank or garden, and a beacon stands at a corner, or at two opposite ones
 * round a helipad.
 *
 * To the Finish (#183): where the kit builds patterned, its walls are surface pattern, plaster and a framed window in
 * every bay, lit window by window at night, and its podium's panels and high windows; its roof wears tile rows inside
 * a parapet. Its form (`more.form`) sets its top floors back behind a terrace at each end, stands a lift core up one
 * short face, or moves its balconies to its corners. On face `more.door` (of `FACES`) a glass lobby opens, under a
 * canopy with a lit soffit if `more.canopy`, its glow a pool before it; on face `more.store`, from Stage 2, a
 * convenience store's window under a lit sign band. From Stage 2 a few balconies hang string lights, and with
 * `more.lift` a glass lift climbs the short face the default camera sees, between two rails.
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
  more: TowerPlan = {},
) {
  const { pad = false, beacon = false, form = 'slab', door, canopy = false, store, lift = false } = more
  const [colour, trim] = [kit.pick(FLATS.walls), kit.pick(FLATS.trims)]
  kit.formed(form)
  // Its balconies' plants, washing and futons (#155), each balcony's drawn from where it stands, so the tower's own
  // stream is untouched: the share of balconies with each at this Stage.
  const [plants, washing, futons] = [
    [0.12, 0.3, 0.4],
    [0, 0.16, 0.24],
    [0, 0, 0.1],
  ].map((shares) => shares[stage - 1])
  const strings = HIGH_FINISH.strings[stage - 1]
  const STOREY = 3.1
  const base = h + 4.2
  const top = base + floors * STOREY
  const long = w >= d // the balconies go up the long faces
  const span = long ? w : d
  const seed = spot(x, y) + 17 // which of the pattern's windows light
  const own = mulberry32(spot(x, y) ^ 0x183f1a75)
  // A stepped tower's top floors, `up` of them, stand `back` m in from each short face.
  const up = form === 'stepped' ? Math.max(2, Math.round(floors * 0.25)) : 0
  const back = up ? Math.min(3, Math.max(1.2, (span - 8) / 2)) : 0
  const [rw, rd] = long ? [w - 2 * back, d] : [w, d - 2 * back] // its top floors, and its roof
  const lower = floors - up

  /** Walls `bw` by `bd` from `at`, `n` storeys: plaster and a framed window in every bay, an odd count of bays along the long faces, where the kit builds patterned. */
  const walls = (bw: number, bd: number, at: number, n: number, k: number, terrace = false) => {
    const geo = kit.box(bw, n * STOREY, bd, 0.9, 0.2)
    // PROTOTYPE (`../prototype-look`): the faceted look clads too, for the box windows the kit builds it.
    if (!kit.patterned && !FACET) return kit.add(geo, colour, x, y, at)
    const len = long ? bw : bd
    const bay = len / (2 * Math.round((len / 3 - 1) / 2) + 1)
    const flats = { front: PATTERN.house, back: PATTERN.house, sides: PATTERN.house, bay, storey: STOREY }
    kit.cladded(geo, colour, x, y, at, 0, terrace ? { ...flats, top: PATTERN.roof } : flats, seed + k)
  }

  // Its podium: panels and high windows; or, as it was, plain with its lobby's glass north and south.
  const [pw, pd] = [w + 2.4, d + 2.4]
  if (kit.patterned) {
    const panels = { front: PATTERN.wall, back: PATTERN.wall, sides: PATTERN.wall, bay: 3, storey: 4.2 }
    kit.cladded(kit.box(pw, 4.2, pd, 1, 0.2), trim, x, y, h, 0, panels, seed + 3)
  } else {
    kit.add(kit.box(pw, 4.2, pd, 1, 0.2), trim, x, y, h)
    for (const side of [-1, 1])
      kit.add(kit.cuboid(w * 0.55, 2.6, 0.3), { material: kit.glass, tint: kit.windows[0] }, x, y + side * (d / 2 + 1.2), h + 0.5)
  }
  if (kit.patterned && door !== undefined) {
    // The lobby: glass between frames, two doors in its middle, its glow a pool before it; and its canopy on two posts.
    const { ry, half, len } = boxFace(door, pw, pd)
    const wide = Math.min(len - 4.5, 8)
    kit.local(
      kit.cuboid(wide, 2.9, 0.3),
      { material: kit.glass, tint: kit.windows[0], glow: TOWER_FINISH.lobby },
      x,
      y,
      ry,
      0,
      half,
      h + 0.35,
    )
    for (const lx of [-wide / 2, -1, 0, 1, wide / 2])
      kit.local(kit.cuboid(0.1, 2.9, 0.38), TOWER_FINISH.frame, x, y, ry, lx, half, h + 0.35)
    kit.local(kit.cuboid(wide + 0.1, 0.12, 0.38), TOWER_FINISH.frame, x, y, ry, 0, half, h + 3.25)
    kit.doorway(x, y, ry, 2, half + 0.2)
    kit.pool('lobby', ...to(x, y, ry, 0, half + 1.7), h, wide + 2, 3, ry)
    if (canopy) {
      const [cw, cd] = HIGH_FINISH.canopy
      kit.local(kit.cuboid(cw, 0.22, cd), trim, x, y, ry, 0, half + cd / 2, h + 3.4)
      kit.local(kit.cuboid(cw - 0.4, 0.04, cd - 0.4), kit.lit(CREAM, TOWER_FINISH.soffit), x, y, ry, 0, half + cd / 2, h + 3.36)
      for (const k of [-1, 1]) kit.local(kit.cuboid(0.16, 3.4, 0.16), TOWER_FINISH.frame, x, y, ry, k * (cw / 2 - 0.2), half + cd - 0.2, h)
      kit.pool('canopy', ...to(x, y, ry, 0, half + cd / 2 + 0.4), h, cw + 2.4, cd + 2.2, ry)
    }
  }
  if (kit.patterned && store !== undefined && stage > 1) {
    // A convenience store behind its glass, its sliding doors in the middle, under a sign band lit at night: a board,
    // its stripes and a few marks for its name.
    const { ry, half, len } = boxFace(store, pw, pd)
    const wide = Math.min(len - 4, 10)
    const sign = STORES[Math.floor(own() * STORES.length)]
    kit.local(
      kit.cuboid(wide, 2.6, 0.3),
      { material: kit.glass, tint: kit.windows[1], glow: TOWER_FINISH.store },
      x,
      y,
      ry,
      0,
      half,
      h + 0.3,
    )
    for (const lx of [-wide / 2, -0.85, 0.85, wide / 2])
      kit.local(kit.cuboid(0.1, 2.6, 0.38), TOWER_FINISH.frame, x, y, ry, lx, half, h + 0.3)
    kit.local(kit.cuboid(wide + 0.5, 0.9, 0.3), kit.lit(sign.board, FRONTAGE.lit.board), x, y, ry, 0, half + 0.03, h + 2.95)
    sign.stripes.forEach((stripe, i) =>
      kit.local(kit.cuboid(wide + 0.5, 0.13, 0.32), kit.lit(stripe, FRONTAGE.lit.board), x, y, ry, 0, half + 0.03, h + 3.02 + i * 0.17),
    )
    for (const i of [-1, 0, 1])
      kit.local(kit.cuboid(0.3, 0.3, 0.04), kit.markOf(sign.board, true), x, y, ry, i * 0.48, half + 0.2, h + 3.45)
    kit.doorway(x, y, ry, 1.6, half + 0.2)
    kit.pool('sign', ...to(x, y, ry, 0, half + 1.5), h, wide + 1.5, 2.8, ry)
  }

  // Its walls: all its floors, or the lower ones under a terrace at each end and the top ones set back.
  walls(w, d, base, lower, 0, up > 0)
  if (up) {
    walls(rw, rd, base + lower * STOREY, up, 1)
    for (const end of [-1, 1]) {
      const [tx, ty] = long ? [x + end * (w / 2 - back / 2), y] : [x, y + end * (d / 2 - back / 2)]
      railing(kit, TOWER_FINISH.rail, tx, ty, long ? back - 0.3 : w - 0.5, long ? d - 0.5 : back - 0.3, base + lower * STOREY)
    }
  }
  if (form === 'core') {
    // A lift core up the short face the default camera sees last, a storey above the roof.
    const { ry, half } = boxFace(long ? 3 : 0, w, d)
    const [cx, cy] = to(x, y, ry, 0, half + 0.6)
    const tall = (floors + 1) * STOREY
    kit.cladded(
      kit.cuboid(4.4, tall, 1.3),
      trim,
      cx,
      cy,
      base,
      ry,
      { front: PATTERN.house, sides: PATTERN.plaster, bay: 4.4, storey: STOREY },
      seed + 5,
    )
    kit.add(kit.cuboid(4.7, 0.3, 1.6), PLANT, cx, cy, base + tall, ry)
    aerial(kit, cx, cy, base + tall + 0.3)
  }
  const stacks = form === 'corner' ? [-(span / 2 - 2.1), span / 2 - 2.1] : [0]
  const deck = form === 'corner' ? 3.4 : 4.6 // m a balcony is wide
  for (const [nx, ny] of FACES) {
    const balconied = (nx === 0) === long
    const ry = Math.atan2(-nx, ny)
    if (!kit.patterned && !FACET) {
      // As it was: a window a bay on every floor, but where the balconies are.
      const n = Math.floor(((nx === 0 ? w : d) - 2) / 3)
      for (let i = 0; i < n; i++) {
        const t = -(n - 1) * 1.5 + i * 3
        if (balconied && stacks.some((s) => Math.abs(t - s) < deck / 2 + 0.3)) continue
        const [fx, fy] = nx === 0 ? [x + t, y + (ny * d) / 2] : [x + (nx * w) / 2, y + t]
        // A stepped tower's top floors keep the windows of their long faces that the set-back leaves a wall behind.
        const most = balconied && Math.abs(t) < span / 2 - back - 0.8 ? floors : lower
        for (let f = 0; f < most; f++) kit.add(kit.cuboid(1.3, 1.6, 0.3), kit.pane(0.6), fx, fy, base + 0.8 + f * STOREY, ry)
      }
    }
    if (!balconied) continue
    // On every floor, from the middle of each stack: a balcony's floor, the railing at its edge, and a glass door.
    for (const s of stacks) {
      const [mx, my] = to(x + (nx * w) / 2, y + (ny * d) / 2, ry, s, 0)
      for (let f = 0; f < floors; f++) {
        const at = base + f * STOREY + 0.1
        kit.local(kit.cuboid(deck, 0.24, 1.5), trim, mx, my, ry, 0, 0.75, at)
        kit.local(kit.cuboid(deck, 1, 0.14), trim, mx, my, ry, 0, 1.45, at + 0.24)
        kit.local(kit.cuboid(deck - 1, 2.2, 0.3), kit.pane(0.55), mx, my, ry, 0, 0, at + 0.3)
        const draw = mulberry32(spot(mx, my) ^ Math.imul(f + 1, 0x2c1b3c6d))
        const [green, wash, airing, side, kind] = [draw(), draw(), draw(), draw() < 0.5 ? 1 : -1, draw()]
        const reach = deck / 2 - 0.55
        if (green < plants) {
          // A plant or two in pots by the railing, peeping over it.
          for (const k of green < plants / 3 ? [side, -side] : [side]) {
            const [px, py] = to(mx, my, ry, k * reach, 1.0)
            kit.add(kit.cuboid(0.56, 0.5, 0.56), POTS[Math.floor(kind * 3)], px, py, at + 0.24)
            kit.add(BUSH, LEAVES.round[Math.floor(kind * 5)], px, py, at + 1.05, kind * TAU, 0.5, 0.48, 0.5)
          }
        }
        if (wash < washing) kit.sway('laundry', ...to(mx, my, ry, 0, 1.25), at + 2.75, ry + (kind < 0.5 ? 0 : Math.PI))
        if (airing < futons)
          kit.sway('futon', ...to(mx, my, ry, (-side * reach) / 1.46, 1.45), at + 1.24, ry, {
            paint: FUTONS[Math.floor(kind * FUTONS.length)],
          })
        // String lights along the railing (#183), each balcony's drawn from where it stands.
        if (mulberry32(spot(mx, my) ^ Math.imul(f + 1, 0x51ed270b))() < strings) {
          for (let b = -2; b <= 2; b++)
            kit.local(kit.cuboid(0.14, 0.14, 0.14), kit.lit(CREAM, GLOWS.string), mx, my, ry, (b * (deck - 0.8)) / 4, 1.45, at + 1.28)
        }
      }
    }
  }
  if (stage === 3) {
    // A band of trim every four floors, and a crown: the top floor's glass all round, lit at night.
    for (let f = 4; f < lower - 1; f += 4) kit.add(kit.cuboid(w + 0.5, 0.5, d + 0.5), trim, x, y, base + f * STOREY - 0.25)
    kit.add(kit.box(rw + 0.16, 1.8, rd + 0.16, 0.9, 0.08), { material: kit.glass, tint: kit.windows[1] }, x, y, top - 2.3)
  }
  if (lift && stage > 1) {
    // A glass lift on the short face the default camera sees, between two rails: it climbs the floors under the
    // terrace, stopping halfway each way.
    const { ry, half } = boxFace(long ? 2 : 1, w, d)
    const [low, high] = [base - h + 0.2, base - h + lower * STOREY - 3.7]
    for (const k of [-1, 1]) kit.local(kit.cuboid(0.14, lower * STOREY, 0.14), TOWER_FINISH.rail, x, y, ry, k * 1.4, half + 0.12, base)
    const rise = high - low
    const loop = polyline([
      { x: 0, y: low },
      { x: 0, y: high },
      { x: 0, y: low },
    ])
    const stops = [0, rise / 2, rise, rise * 1.5]
    const waits = stops.map(() => TOWER_FINISH.waits[0] + own() * (TOWER_FINISH.waits[1] - TOWER_FINISH.waits[0]))
    const [fx, fy] = to(x, y, ry, 0, half + 0.95)
    kit.mover('lift', loop, stops, 0, h, { waits, face: { x: fx, y: fy, heading: ry + Math.PI / 2 }, laps: true })
  }
  // A cap over the roof, tiled inside its parapet, and on it a water tank and a garden.
  const cap = stage === 3 ? 2 : 1.2
  if (kit.patterned) kit.cladded(kit.box(rw + 0.3, cap, rd + 0.3, 1, 0.12), trim, x, y, top, 0, { top: PATTERN.roof }, seed + 7)
  else kit.add(kit.box(rw + 0.3, cap, rd + 0.3, 1, 0.12), trim, x, y, top)
  const roof = top + cap - 0.3
  if (stage > 1) railing(kit, TOWER_FINISH.rail, x, y, rw - 0.5, rd - 0.5, top + cap)
  // A beacon at a corner of the roof (#155), and at the opposite one too round a helipad.
  if (beacon) {
    for (const k of pad ? [1, -1] : [1]) {
      const [bx, by] = [x + k * (rw / 2 - 0.75), y + k * (rd / 2 - 0.75)]
      kit.add(CYLINDER, PLANT, bx, by, roof, 0, 0.1, BEACON.mast, 0.1)
      kit.beacon(bx, by, roof + BEACON.mast + 0.8 * BEACON.r, BEACON.r)
    }
  }
  if (pad) {
    // The helipad takes the whole roof (#155).
    kit.helipad(x, y, roof + 0.25, Math.min(rw, rd) / 2 - 1.3)
    kit.shadow(x, y, h, w * 1.4 + 3, d * 1.4 + 3)
    return kit.brick('building', x, y, h)
  }
  const [tx, ty] = [x - rw * 0.22, y + rd * 0.2]
  kit.add(CYLINDER, TANK.body, tx, ty, roof, 0, 1.3, 2.4, 1.3)
  kit.add(CONE, TANK.lid, tx, ty, roof + 2.4, 0, 1.4, 0.9, 1.4)
  if (form !== 'core') {
    // The lift overrun, a door in its south wall, under a lid with an antenna on it.
    const [ox, oy] = [x + Math.min(rw / 2 - 1.7, Math.max(rw * 0.24, 3.1 - rw * 0.22)), y + rd * 0.26]
    kit.add(kit.box(3, 2.4, 2.6, 0.3, 0.08), trim, ox, oy, roof)
    kit.add(kit.cuboid(3.3, 0.2, 2.9), PLANT, ox, oy, roof + 2.4)
    kit.add(kit.cuboid(0.9, 1.9, 0.08), TOWER_FINISH.frame, ox, oy - 1.3, roof + 0.3)
    aerial(kit, ox + 0.9, oy + 0.7, roof + 2.6)
  }
  if (stage > 1) {
    const [gw, gd] = stage === 3 ? [rw * 0.5, rd * 0.5] : [rw * 0.36, rd * 0.3]
    const [gx, gy] = [x + rw * 0.18, y - rd * 0.16]
    const lawn = roof + 0.5
    kit.add(kit.box(gw, 0.5, gd, 0.3, 0.1), GARDEN.lawn, gx, gy, roof)
    const bushes = stage === 3 ? [-1.5, -0.5, 0.5, 1.5] : [-1, 1]
    for (const k of bushes) kit.add(SPHERE, LEAVES.round[1], x + rw * (0.18 + 0.08 * k), gy - gd * 0.3, roof + 0.6, 0, 0.9, 0.8, 0.9)
    // A bench on the lawn, a planter at each end of it, and at Stage 3 a pergola over them (#183).
    const by = gy + gd * 0.22
    kit.add(kit.cuboid(1.5, 0.1, 0.45), WOOD.stand, gx, by, lawn + 0.4)
    kit.add(kit.cuboid(1.5, 0.4, 0.08), WOOD.stand, gx, by + 0.22, lawn + 0.55)
    const out = Math.max(gw / 2 - 0.5, 1.2) // the planters, clear of the bench's ends
    for (const k of [-1, 1]) {
      kit.add(kit.cuboid(0.1, 0.4, 0.4), WOOD.dark, gx + k * 0.65, by, lawn)
      kit.add(kit.cuboid(0.7, 0.5, 0.7), PLANTER, gx + k * out, by, lawn)
      kit.add(BUSH, LEAVES.round[k + 2], gx + k * out, by, lawn + 0.75, k, 0.5, 0.45, 0.5)
    }
    if (stage === 3) {
      const [lw, ld] = [Math.min(4.6, gw - 1.6), Math.min(2.6, gd * 0.5)]
      for (const i of [-1, 1]) {
        for (const j of [-1, 1]) kit.add(kit.cuboid(0.16, 2.4, 0.16), WOOD.dark, gx + (i * lw) / 2, by + (j * ld) / 2, lawn)
        kit.add(kit.cuboid(lw + 0.6, 0.14, 0.14), WOOD.dark, gx, by + (i * ld) / 2, lawn + 2.4)
      }
      const slats = Math.max(3, Math.round(lw / 0.7))
      for (let k = 0; k <= slats; k++) kit.add(kit.cuboid(0.1, 0.1, ld + 0.6), WOOD.pale, gx - lw / 2 + (k * lw) / slats, by, lawn + 2.54)
    }
  }
  kit.shadow(x, y, h, w * 1.4 + 3, d * 1.4 + 3)
  kit.brick('building', x, y, h)
}

/** A roof antenna at `(x, y)`, `h` above the road (#183): a mast and three bars across it. */
function aerial(kit: Kit, x: number, y: number, h: number) {
  kit.add(kit.cuboid(0.1, 3.4, 0.1), AERIAL, x, y, h)
  for (const [k, len] of [1.4, 1.1, 0.8].entries()) kit.add(kit.cuboid(len, 0.07, 0.07), AERIAL, x, y, h + 2.1 + k * 0.5)
}
