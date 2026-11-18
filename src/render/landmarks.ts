import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/demand'
import { middle, polyline, type Bounds, type Polyline, type Vec } from '../sim/geometry'
import { area, KERB, type Block } from './blocks'
import { inside, type Field } from './field'
import { spot, type Kit } from './kit'
import { raised } from './shapes'

// The park's deck was shrine vermilion, which is nearly the Jam red-orange: it is wood.
const [GRASS, STONE, CREAM, CORAL, DECK, PLAZA, TEAL] = ['#b0df88', '#ddd6c9', '#fbf6ef', '#f08a6e', '#bb5d0d', '#ece3d1', '#57c6b5']
const TAU = Math.PI * 2
/** How big a tree of a Zone's look grows at each Stage (#141), as a share of the size #136 gave it. */
export const GROW = [0.55, 1, 1.12]

/** The outlines `inset` m inside a Block's edge, laid on it as a thin layer of another colour. Not closed into a brick. */
function overlay(kit: Kit, field: Field, block: Block, inset: number, thickness: number, color: string) {
  for (const loop of field.outlines(inset, [block])) {
    if (inside(block.loop, loop[0].x, loop[0].y)) kit.push(raised(loop, thickness, thickness * 0.4).translate(0, KERB, 0), color)
  }
}

/** Whether a box `w` (east–west) by `d` centred on `(x, y)` stays at least `room` m clear of every point of `points`. */
const clearOf = (points: Vec[], x: number, y: number, w: number, d: number, room: number) =>
  !points.some((p) => Math.abs(p.x - x) < w / 2 + room && Math.abs(p.y - y) < d / 2 + room)

/**
 * The point nearest `near` (the middle of the Block's bounding box unless given) where a box `w` (east–west) by `d`
 * stands wholly on the Block, on a 2 m grid, at least `room` m clear of each point of `avoid`; null where no such
 * point exists.
 */
export function site(field: Field, block: Block, w: number, d: number, near = middle(block), avoid: Vec[] = [], room = 0): Vec | null {
  const on = (x: number, y: number) => field.sample(x, y) >= 1 && inside(block.loop, x, y)
  // Five by five points over the box: closer than a Road is wide, so no Road crosses the box between them.
  const fits = (x: number, y: number) =>
    [-2, -1, 0, 1, 2].every((i) => [-2, -1, 0, 1, 2].every((j) => on(x + (i * w) / 4, y + (j * d) / 4))) && clearOf(avoid, x, y, w, d, room)
  let [best, nearest]: [Vec | null, number] = [null, Infinity]
  for (let x = block.x0 + w / 2; x <= block.x1 - w / 2; x += 2) {
    for (let y = block.y0 + d / 2; y <= block.y1 - d / 2; y += 2) {
      const far = Math.hypot(x - near.x, y - near.y)
      if (far < nearest && fits(x, y)) [best, nearest] = [{ x, y }, far]
    }
  }
  return best
}

/**
 * A fountain at `(x, y)` at Stage `stage`, as one brick: a stone basin of water. From Stage 2 a column stands at its
 * middle, and at Stage 3 the column carries a second, smaller basin of water and a ball on top.
 */
function fountain(kit: Kit, x: number, y: number, stage = 2) {
  kit.drum(STONE, x, y, KERB, 4.8, 4.8, 1.12)
  kit.drum(kit.water, x, y, KERB + 0.2, 4.08, 4.08, 1)
  if (stage === 2) kit.drum(STONE, x, y, KERB, 0.72, 0.72, 3)
  if (stage === 3) {
    kit.drum(STONE, x, y, KERB, 0.72, 0.72, 3.6)
    kit.drum(STONE, x, y, KERB + 2.4, 2, 2, 0.6)
    kit.drum(kit.water, x, y, KERB + 2.52, 1.7, 1.7, 0.56)
    kit.ball(STONE, x, y, KERB + 3.9, 0.45)
  }
  kit.brick('building', x, y, KERB)
}

/** The ground a tower landmark at `(x, y)` keeps free of seeded lots: its podium, fountain and trees. */
export const towerGround = (x: number, y: number): Bounds => ({ x0: x - 18, y0: y - 20, x1: x + 20, y1: y + 28 })

/**
 * The tower landmark on Block `block`, as one brick: stacked cylinders in coral and cream with two glazed decks and a
 * beacon, on a podium. A fountain stands north of it and sakura around it, wherever the Block's pavement reaches.
 */
export function tower(kit: Kit, field: Field, block: Block, x: number, y: number) {
  const base = KERB + 1.4
  kit.add(kit.box(20, 1.4, 20, 2.4, 0.32), '#e2d8c6', x, y, KERB)
  // Each segment: from and to (m above the podium), radius at its foot and at its top.
  const SEGMENTS = [
    [0, 12, 6.4, 4.6],
    [12, 24, 4.6, 3.4],
    [24, 36, 3.4, 2.5],
    [39.6, 51.2, 2.2, 1.28],
    [53.2, 57.2, 1.2, 0.88],
  ]
  SEGMENTS.forEach(([from, to, foot, top], i) =>
    kit.push(
      new THREE.CylinderGeometry(top, foot, to - from, 16).toNonIndexed().translate(x, base + (from + to) / 2, -y),
      i % 2 ? CREAM : CORAL,
    ),
  )
  kit.drum(CREAM, x, y, base + 36, 5.4, 5.4, 3.6)
  kit.drum(kit.glass, x, y, base + 36.6, 5.52, 5.52, 2)
  kit.drum(CORAL, x, y, base + 51.2, 2.88, 2.88, 2)
  kit.drum(kit.glass, x, y, base + 51.52, 2.96, 2.96, 1.2)
  kit.drum(CREAM, x, y, base + 57.2, 0.28, 0.28, 12.8)
  kit.beacon(x, y, base + 70, 0.62) // white, blinking at night (#154)
  kit.shadow(x, y, base, 20, 20, true)
  kit.brick('building', x, y, KERB, 3)

  const on = (px: number, py: number, clear: number) => field.sample(px, py) >= clear && inside(block.loop, px, py)
  if (on(x, y + 20.8, 6)) fountain(kit, x, y + 20.8)
  for (const dx of [-14.4, 16.4]) {
    for (const dy of [24.4, 4, -16.4]) if (on(x + dx, y + dy, 1.5)) kit.tree(x + dx, y + dy, KERB, 0.8, 'sakura')
  }
}

/**
 * A plaza Block: paved in a warmer stone, and open, or with a fountain at `centre` and four trees around it where they
 * stand clear of the street trees `street`. The fountain grows with the Stage (`fountain`), and so do the trees, which
 * at Stage 3 stand in round stone planters.
 */
export function plaza(kit: Kit, field: Field, block: Block, centre?: Vec, street: Vec[] = []) {
  overlay(kit, field, block, 0.4, 0.08, PLAZA)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  if (!centre) return
  kit.staged((stage) => fountain(kit, centre.x, centre.y, stage))
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const [x, y] = [centre.x + dx * 8.4, centre.y + dy * 8.4]
    if (field.sample(x, y) < 2 || !inside(block.loop, x, y) || !clearOf(street, x, y, 0, 0, 3)) continue
    kit.staged((stage) => {
      if (stage === 3) kit.drum(STONE, x, y, KERB + 0.08, 1.7, 1.7, 0.6)
      kit.tree(x, y, KERB + (stage === 3 ? 0.68 : 0.08), GROW[stage - 1] * 0.7, 'round')
    })
  }
}

const BIKE = { rim: 1.6, dash: 2.4, gap: 2.4, line: 0.3 } // m: pavement left each side of the lane, and its centre line

/**
 * A Block too narrow for lots, such as the strip a seam leaves beside a Road: a bike lane along it, in teal with a
 * dashed centre line, between two rims of pavement.
 */
export function bikeLane(kit: Kit, field: Field, block: Block) {
  overlay(kit, field, block, BIKE.rim, 0.08, TEAL)
  const mid = middle(block)
  const upright = block.y1 - block.y0 > block.x1 - block.x0
  const [from, to] = upright ? [block.y0, block.y1] : [block.x0, block.x1]
  for (let t = from + BIKE.rim + BIKE.gap; t + BIKE.dash < to - BIKE.rim - BIKE.gap; t += BIKE.dash + BIKE.gap) {
    const [x, y] = upright ? [mid.x, t + BIKE.dash / 2] : [t + BIKE.dash / 2, mid.y]
    if (field.sample(x, y) < BIKE.rim + BIKE.line) continue
    kit.add(
      upright ? kit.box(BIKE.line, 0.04, BIKE.dash, 0.02, 0.01) : kit.box(BIKE.dash, 0.04, BIKE.line, 0.02, 0.01),
      CREAM,
      x,
      y,
      KERB + 0.08,
    )
  }
  kit.brick('ground', mid.x, mid.y, KERB)
}

/**
 * A park Block: a lawn, a pond with a little wooden deck, and trees over the rest. Pond and tree count grow with the
 * Block. The pond lies at `pond`; without one, nearest the Block's middle where it fits, or nowhere if it fits nowhere.
 * Pond and trees keep clear of the street trees `street`. With the Stage:
 * - Stage 1: a young park, half its trees planted, as saplings, and a pond with no deck.
 * - Stage 2: every tree, and the deck.
 * - Stage 3: the trees grown on, a pavilion over the water at the end of the deck, and an island with a pine.
 */
export function park(kit: Kit, field: Field, block: Block, pond?: Vec, street: Vec[] = []) {
  overlay(kit, field, block, 2, 0.24, GRASS)
  const ground = KERB + 0.24
  const size = area(block.loop)
  const s = Math.min(1.7, Math.max(0.75, Math.sqrt(size / 1760)))
  const at = pond ?? site(field, block, 29.2 * s, 21.2 * s, middle(block), street, 1)
  if (at) {
    kit.drum(STONE, at.x, at.y, ground, 13.6 * s, 9.6 * s, 0.32)
    kit.drum(kit.water, at.x, at.y, ground + 0.08, 12.6 * s, 8.8 * s, 0.32)
  }
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  if (at) {
    const deck = at.x - 10.8 * s
    kit.from(2, () => {
      kit.add(kit.box(6.4, 0.48, 2, 0.4, 0.12), DECK, deck, at.y, ground + 0.32)
      kit.brick('ground', deck, at.y, ground)
    })
    kit.from(3, () => {
      kit.pavilion(deck + 5.3, at.y, ground + 0.5)
      const [ix, iy] = [at.x + 5 * s, at.y + 2.2 * s]
      kit.drum(GRASS, ix, iy, ground + 0.08, 2.6 * s, 2 * s, 0.6)
      kit.brick('ground', ix, iy, ground)
      kit.tree(ix, iy, ground + 0.68, 0.55, 'pine')
    })
  }
  const trees = Math.min(70, Math.max(12, Math.round(size / 60)))
  for (let tries = 0, n = 0; tries < trees * 8 && n < trees; tries++) {
    const [tx, ty] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(tx, ty) < 5 || !inside(block.loop, tx, ty) || !clearOf(street, tx, ty, 0, 0, 3)) continue
    if (at && ((tx - at.x) / (17.2 * s)) ** 2 + ((ty - at.y) / (12.8 * s)) ** 2 < 1) continue
    const [tree, kind] = [kit.range(0.75, 1.2), kit.chance(0.2) ? 'sakura' : kit.chance(0.15) ? 'pine' : 'round'] as const
    const young = n % 2 === 0 // planted at Stage 1
    kit.lot(n)
    kit.staged((stage) => {
      if (young || stage > 1) kit.tree(tx, ty, ground, GROW[stage - 1] * tree, kind)
    })
    n++
  }
  kit.lot(-1)
}

const VERGE = '#c8e8a6' // the grass of a Tile with roads only

/**
 * Up to `count` points on the Block between `clear` and `most` m in from its edge, at least `apart` m from each other
 * and from every point of `avoid`.
 */
function scatter(
  kit: Pick<Kit, 'range'>,
  field: Field,
  block: Block,
  count: number,
  clear: number,
  most: number,
  apart: number,
  avoid: Vec[],
): Vec[] {
  const points: Vec[] = []
  for (let tries = 0; tries < count * 14 && points.length < count; tries++) {
    const [x, y] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    const room = field.sample(x, y)
    if (room < clear || room > most || !inside(block.loop, x, y)) continue
    if ([...points, ...avoid].some((p) => Math.hypot(p.x - x, p.y - y) < apart)) continue
    points.push({ x, y })
  }
  return points
}

/**
 * A Block of an unzoned Tile, roads only: grass with a few bushes along its edge, one to about every 500 m², clear of
 * the street trees `street`, and nothing built.
 */
export function verge(kit: Kit, field: Field, block: Block, street: Vec[]) {
  overlay(kit, field, block, 2.4, 0.16, VERGE)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  for (const p of scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 500)), 3.4, 7, 9, street)) {
    kit.tree(p.x, p.y, KERB + 0.16, kit.range(0.3, 0.45), 'round')
  }
}

// Green: a meadow's grass and its beds of flowers; allotments' gravel paths, the soil of their plots, the crops and
// flowers in them, and their sheds.
const MEADOW = '#b9e293'
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
// Farms: ploughed ground, and the crops of its fields.
const FURROWS = '#cdb08a'
const FIELDS = ['#7bc35e', '#e3c76a', '#a6d36b', '#5aae58', '#d9b45c']
const ALLOTMENT = { w: 6.4, d: 4.6, path: 1.3 } // m: a plot, and the gravel path between plots
// m between rows, a stretch of row and the gap between stretches; and the rows of a field. A stretch of crop row, here
// and in an allotment, is a plain box: rounded, it costs twenty times the triangles, and a farm Tile has hundreds.
const FARM = { row: 1.6, length: 5, gap: 0.4, rows: 5 }
// A farm's details (#149), each field's drawn from where it lies so that nothing else on its Block draws differently.
// A field is crops; or a paddy, flooded under rows of rice shoots at every Stage; or, from Stage 2 or from Stage 3,
// under vinyl greenhouses (shares of the fields). A scarecrow stands in some paddies and in some fields of crops, from
// the Stage whose share its draw falls under; a tractor never works those.
const FIELD_KINDS = { paddy: 0.22, glass: [0.12, 0.1] }
const SCARECROWS = { paddy: [0.3, 0.55, 0.75], crops: [0, 0.06, 0.14] }
// A paddy's water, soft pale aqua rather than the ponds' glossy blue so that a flooded field never competes with the
// Tool blue (the user's pick on #149), and how deep it lies (m); its shoots at each Stage, their colour and how tall
// they stand above the water.
const PADDY = { water: '#a9d9d6', deep: 0.1, shoots: ['#8fd46c', '#8fd46c', '#7bc35e'], tall: [0.16, 0.34, 0.46] }
// Vinyl greenhouses: pale film over hoops, a door at each end. m: the longest house, the gap between houses, half a
// house's width, its height, how far apart its hoops are, and how far in from the ends of a field's rows it stops.
const TUNNELS = { film: '#eef5f2', hoops: '#d3ddda', door: '#c9d6d2', most: 26, gap: 1.6, half: 1.75, tall: 2.3, hoop: 2.4, inset: 1 }
// A unit greenhouse: an arch 1 m long along x, 1 m high and 2 m across, closed at both ends; and a hoop over it, a
// short length of a coarser arch, since a house has a dozen.
const ARCH = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)
const HOOP = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)
const GABLE = new THREE.CircleGeometry(1, 12, 0, Math.PI)
const TUNNEL = mergeGeometries([
  ARCH.clone(),
  GABLE.clone()
    .rotateY(Math.PI / 2)
    .translate(0.5, 0, 0),
  GABLE.clone()
    .rotateY(-Math.PI / 2)
    .translate(-0.5, 0, 0),
])
// m: how far out from the ends of the rows a tractor turns, the radius of its turns, and how far short of a row's end it
// stops for the night, so that it stands clear of the pavement.
const TRACTOR = { headland: 0.8, turn: 0.6, short: 1 }

/** One row of a farm's field: `t` across the Block, from `a` to `b` along it (its longest unbroken run of crop). */
interface Row {
  t: number
  a: number
  b: number
}

/** A point `s` along a farm Block and `t` across it, on the map. */
const onMap = (along: boolean, s: number, t: number): Vec => (along ? { x: s, y: t } : { x: t, y: s })

/** The greenhouses that fit over a field's rows, two side by side where it is wide enough, each `len` long along the Block. */
function greenhouses(rows: Row[]): { s: number; t: number; len: number; half: number }[] {
  if (!rows.length) return []
  const { inset, most, gap } = TUNNELS
  const [a, b] = [Math.max(...rows.map((r) => r.a)) + inset, Math.min(...rows.map((r) => r.b)) - inset]
  const [lo, hi] = [rows[0].t - FARM.row / 2, rows[rows.length - 1].t + FARM.row / 2]
  if (b - a < 10 || hi - lo < 3.6) return []
  const two = hi - lo >= 7.4
  const half = two ? TUNNELS.half : Math.min(TUNNELS.half, (hi - lo) / 2 - 0.2)
  const across = two ? [(lo + hi) / 2 - half - 0.2, (lo + hi) / 2 + half + 0.2] : [(lo + hi) / 2]
  const n = Math.ceil((b - a + gap) / (most + gap))
  const len = (b - a - (n - 1) * gap) / n
  return across.flatMap((t) => Array.from({ length: n }, (_, k) => ({ s: a + len / 2 + k * (len + gap), t, len, half })))
}

/** A polyline with each corner rounded to a curve about `r` m in from it; points where it runs straight on stay. */
function rounded(pts: Vec[], r: number): Vec[] {
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, p, b] = [pts[i - 1], pts[i], pts[i + 1]]
    const [la, lb] = [Math.hypot(p.x - a.x, p.y - a.y), Math.hypot(b.x - p.x, b.y - p.y)]
    const [ux, uy, vx, vy] = [(p.x - a.x) / la, (p.y - a.y) / la, (b.x - p.x) / lb, (b.y - p.y) / lb]
    if (Math.abs(ux * vy - uy * vx) < 1e-3 && ux * vx + uy * vy > 0) {
      out.push(p)
      continue
    }
    const d = Math.min(r, la / 2, lb / 2)
    const [from, to] = [
      { x: p.x - ux * d, y: p.y - uy * d },
      { x: p.x + vx * d, y: p.y + vy * d },
    ]
    for (let k = 0; k <= 4; k++) {
      const t = k / 4
      const [u, v, w] = [(1 - t) ** 2, 2 * (1 - t) * t, t ** 2]
      out.push({ x: u * from.x + v * p.x + w * to.x, y: u * from.y + v * p.y + w * to.y })
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/**
 * The loop a tractor works on a farm Block (#149): up and down each of the rows `worked` in turn, turning on the
 * headland beyond their ends, then back along the headland at its `home` end (-1 the low end of the rows, 1 the high)
 * to where it set out. On the headland it keeps beyond the end of every row of `rows`, the whole Block's, so it skirts
 * the greenhouses and the farmyard. Its stops are the ends of the rows it works, where it may stop for the night. Null
 * with no rows to work.
 */
function furrows(worked: Row[], rows: Row[], home: number, along: boolean): { loop: Polyline; stops: number[] } | null {
  if (!worked.length) return null
  // An even number of passes ends at home: after an odd one, back along the furrow beside the last row.
  const last = worked[worked.length - 1]
  const passes = worked.length % 2 ? [...worked, { ...last, t: last.t - FARM.row / 2 }] : worked
  const end = (r: Row, side: number) => (side < 0 ? r.a : r.b)
  const pts: Vec[] = []
  const stops = new Set<Vec>()
  const at = (s: number, t: number) => {
    const p = onMap(along, s, t)
    pts.push(p)
    return p
  }
  /** Along the headland at `side`, from beyond the end of row `p` to beyond that of `q`, past the rows between. */
  const headland = (side: number, p: Row, q: Row) => {
    const between = rows.filter((r) => (r.t - p.t) * (r.t - q.t) < 0).sort((u, v) => (q.t > p.t ? u.t - v.t : v.t - u.t))
    for (const r of [p, ...between, q]) at(end(r, side) + side * TRACTOR.headland, r.t)
  }
  let side = home
  at(end(passes[0], side), passes[0].t)
  passes.forEach((r, i) => {
    side = -side
    stops.add(at(end(r, side) - side * TRACTOR.short, r.t))
    at(end(r, side), r.t)
    const next = passes[i + 1] ?? passes[0]
    headland(side, r, next)
    at(end(next, side), next.t)
  })
  const kept = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6)
  const loop = polyline(rounded(kept, TRACTOR.turn))
  return { loop, stops: loop.pts.flatMap((p, i) => (stops.has(p) ? [loop.cum[i]] : [])) }
}

/**
 * A meadow Block: open grass but for groves of trees, one to about every 700 m² and at least two, and a few beds of
 * flowers, all clear of the street trees `street`. Its details (`meadowDetails`, #152): wildflowers, benches, picnic
 * blankets and butterflies. With the Stage:
 * - Stage 1: three saplings to a grove, and no beds.
 * - Stage 2: five trees to a grove, and the beds.
 * - Stage 3: the trees grown on, three more beds, and a pavilion by the first grove where there is room.
 */
export function meadow(kit: Kit, field: Field, block: Block, street: Vec[]) {
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
    for (const [k, p] of scatter(kit, field, near, 5, 4.5, Infinity, 3.4, street).entries()) {
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
  for (const [k, p] of scatter(kit, field, block, 5, 4, Infinity, 7, street).entries()) {
    const it = { p, w: kit.range(3, 5.5), d: kit.range(1.6, 2.6), colour: kit.pick(BEDS) }
    kit.lot(groves.length + k)
    kit.from(2, () => bed(it))
    beds.push(it)
  }
  kit.lot(-1)
  // Stage 3's beds and pavilion, drawn on the stream `from` seeds here, as it would have seeded it: known before they
  // are built, so that the details keep clear of them at every Stage (#152).
  const late = (range: (a: number, b: number) => number) => {
    const more = scatter({ range }, field, block, 3, 4, Infinity, 7, [...street, ...beds.map((b) => b.p), ...planted]).map((p) => ({
      p,
      w: range(3, 5.5),
      d: range(1.6, 2.6),
      colour: BEDS[Math.floor(range(0, 1) * BEDS.length)],
    }))
    return { more, pavilion: site(field, block, 7, 7, groves[0], [...street, ...planted, ...beds.map((b) => b.p)], 2.5) }
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
  meadowDetails(kit, block, ground, { street, groves, planted, beds, more: third.more, pavilion: third.pavilion })
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
    street,
    groves,
    planted,
    beds,
    more,
    pavilion,
  }: { street: Vec[]; groves: Vec[]; planted: Vec[]; beds: Bed[]; more: Bed[]; pavilion: Vec | null },
) {
  const all = [...beds, ...more]
  const clear = (p: Vec, room: number, trees = 1.8) =>
    kit.onGround(p.x, p.y, room) &&
    planted.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= trees) &&
    street.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= 3.4) &&
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
    kit.from(k ? 3 : 2, () => kit.blanket(p.x, p.y, ground, ry, true, parasol), spot(p.x, p.y))
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
 * nothing, where it stands clear of the street trees `street`. Each plot is a brick and a lot. Its details (#152): a
 * scarecrow, water butts and cold frames, each on the lot of its plot. With the Stage:
 * - Stage 1: half the plots still bare, shorter crops, and no sheds; a scarecrow on half the Blocks.
 * - Stage 2: as above; a scarecrow on every Block, a water butt by each shed, and cold frames on some plots.
 * - Stage 3: every plot worked, taller crops, and beans climbing canes on some; a second scarecrow on a big Block, and
 *   cold frames on twice as many plots.
 */
export function allotments(kit: Kit, field: Field, block: Block, street: Vec[]) {
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
      if (Math.min(...corners) < 1.8 || !inside(block.loop, x, y) || !clearOf(street, x, y, w, d, 0.8)) continue
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
    if (roll < 0.14) kit.from(2, () => kit.waterButt(x + w / 2 - 0.95, y - d / 2 + 0.62, ground + 0.22), spot(x + 1, y))
    if (framed) kit.from(framed, () => kit.coldFrames(x, y + d / 2 - 0.9, ground + 0.22, Math.PI, w - 1.2), spot(x, y + 1))
    const scare = scared.get(plot)
    if (scare) {
      const turn = (mulberry32(spot(x, y))() - 0.5) * 0.6
      kit.from(scare, () => kit.scarecrow(x + (spot(x, y) % 2 ? 1 : -1) * 1.2, y + 0.7, ground + 0.22, turn), spot(x, y - 1))
    }
  }
  kit.lot(-1)
}

/**
 * A farm Block: ploughed ground under fields of crop rows that run along the Block, five rows to a field of one crop,
 * and on some Blocks a farmstead near one end: a farmhouse, and a barn with its silo. Rows and farmstead keep clear of
 * the street trees `street`. The farmstead and each field are a lot, and each field is a brick. Its details (#149):
 * some fields are rice paddies, some go under vinyl greenhouses, scarecrows stand in some, a kei truck stands in the
 * farmyard, and tractors work the fields of crops. With the Stage:
 * - Stage 1: a cottage and a barn with no silo (the kit's `house` and `barn`), shoots in most fields and the rest left
 *   fallow, a fallow paddy flooded and bare; a scarecrow in some paddies.
 * - Stage 2: as above, every field grown; a tractor, the kei truck with two crates, the first greenhouses and more
 *   scarecrows.
 * - Stage 3: a two-storey farmhouse and a barn with two silos and a lean-to, fuller, taller rows that hide most of
 *   the furrows, and a windbreak of pines behind the house; a second tractor, more greenhouses and scarecrows, the
 *   truck's bed full and a stack of crates beside it.
 */
export function farm(kit: Kit, field: Field, block: Block, street: Vec[]) {
  overlay(kit, field, block, 1.6, 0.14, FURROWS)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.14
  const along = block.x1 - block.x0 >= block.y1 - block.y0
  // A farmstead on some Blocks only, so that the fields lead.
  const end = along ? { x: block.x0 + 12, y: mid.y } : { x: mid.x, y: block.y1 - 12 }
  const yard = kit.chance(0.45) ? site(field, block, 22, 16, end, street, 1) : null
  if (yard) {
    kit.lot(0)
    const [hx, hy] = [yard.x - (along ? 0 : 6), yard.y + (along ? 5 : 0)]
    kit.staged((stage) => kit.house(hx, hy, ground, 8, 7, stage))
    kit.staged((stage) => kit.barn(yard.x + (along ? 0 : 5.5), yard.y - (along ? 4 : 0), ground, along ? 0 : -Math.PI / 2, stage))
    // In the yard (#149), on the side the default camera sees, clear of the silos and the tractors' turns: a kei truck
    // from Stage 2, and at Stage 3 a stack of crates beside it, each drawn from where it stands.
    const [truck, crates, facing] = along
      ? [{ x: yard.x + 7.6, y: yard.y + 4 }, { x: yard.x + 5.6, y: yard.y + 4.6 }, 0]
      : [{ x: yard.x + 8.6, y: yard.y - 6.8 }, { x: yard.x + 10, y: yard.y - 4.9 }, -Math.PI / 2]
    kit.staged((stage) => stage > 1 && kit.keiTruck(truck.x, truck.y, ground, facing, stage), spot(truck.x, truck.y))
    kit.from(3, () => kit.crates(crates.x, crates.y, ground, facing, 4), spot(crates.x, crates.y))
    // The windbreak: a line of pines along the back of the house, on the Block.
    kit.from(3, () => {
      for (let k = -1.5; k <= 1.5; k++) {
        const [px, py] = along ? [hx + k * 2.9, hy + 4.3] : [hx - 5.6, hy + k * 2.9]
        if (field.sample(px, py) >= 1.6 && inside(block.loop, px, py) && clearOf(street, px, py, 0, 0, 3))
          kit.tree(px, py, ground, kit.range(0.5, 0.62), 'pine')
      }
    })
  }
  const inYard = (x: number, y: number) => yard !== null && Math.abs(x - yard.x) < 13 && Math.abs(y - yard.y) < 10
  // Rows across the Block, cut into lengths that stand clear of its edge, each field's rows sown at once.
  const { row: apart, length, gap, rows } = FARM
  const [from, to] = along ? [block.y0 + 3, block.y1 - 3] : [block.x0 + 3, block.x1 - 3]
  const [start, stop] = along ? [block.x0 + 3, block.x1 - 3] : [block.y0 + 3, block.y1 - 3]
  let [row, crop, lengths, fields, runs] = [0, kit.pick(FIELDS), [] as Bounds[], 1, [] as Row[]]
  /** Every field's rows, and whether a tractor works them. */
  const sown: { rows: Row[]; worked: boolean }[] = []
  /** Sow the field of the rows `lengths`, its brick landing on `(bx, by)`. */
  const sow = (bx: number, by: number) => {
    if (!lengths.length) return
    const [these, colour, fallow, rows] = [lengths, crop, kit.chance(0.35), runs]
    ;[lengths, runs] = [[], []]
    kit.lot(fields++)
    // What the field is, drawn from where it lies (#149).
    const draw = mulberry32(spot(bx, by))
    const [what, scare, where, turn] = [draw(), draw(), draw(), draw()]
    const paddy = what < FIELD_KINDS.paddy
    const houses = paddy ? [] : greenhouses(rows)
    const [two, three] = [FIELD_KINDS.paddy + FIELD_KINDS.glass[0], FIELD_KINDS.paddy + FIELD_KINDS.glass[0] + FIELD_KINDS.glass[1]]
    const glass = !houses.length ? 0 : what < two ? 2 : what < three ? 3 : 0 // the first Stage it is under greenhouses
    kit.staged((stage) => {
      if (paddy) return flood(stage, fallow, these, bx, by)
      if (glass && stage >= glass) return cover(houses, bx, by)
      if (stage === 1 && fallow) return
      const [tall, full] = [[0.22, 0.5, 0.66][stage - 1], stage === 3 ? 1.45 : 1] // full: how much wider a row grows
      for (const { x0, y0, x1, y1 } of these) {
        const [x, y, w, d] = [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0]
        kit.add(kit.cuboid(along ? w : w * full, tall, along ? d * full : d), colour, x, y, ground)
      }
      kit.brick('tree', bx, by, ground)
    })
    const shares = paddy ? SCARECROWS.paddy : glass ? null : SCARECROWS.crops
    const first = shares ? shares.findIndex((share) => scare < share) + 1 : 0 // the first Stage it has a scarecrow
    const centre = rows[Math.floor(rows.length / 2)]
    if (first && centre && centre.b - centre.a > 8) {
      const p = onMap(along, centre.a + 4 + where * (centre.b - centre.a - 8), centre.t + (paddy ? 0 : FARM.row / 2))
      kit.from(first, () => kit.scarecrow(p.x, p.y, ground + (paddy ? PADDY.deep : 0), turn * TAU), spot(p.x, p.y))
    }
    sown.push({ rows, worked: !paddy && !glass && !first })
  }
  /**
   * A paddy at Stage `stage`: water over each stretch of its rows, the stretches meeting along a row and across it but
   * for a low bank round the field, and two rows of shoots to each stretch unless it lies fallow.
   */
  const flood = (stage: number, fallow: boolean, these: Bounds[], bx: number, by: number) => {
    const across = these.map(({ x0, y0, x1, y1 }) => (along ? (y0 + y1) / 2 : (x0 + x1) / 2))
    const [first, last] = [Math.min(...across), Math.max(...across)]
    these.forEach(({ x0, y0, x1, y1 }, i) => {
      const t = across[i]
      const [lo, hi] = [t - (t - first < 0.01 ? 0.55 : apart / 2), t + (last - t < 0.01 ? 0.55 : apart / 2)]
      const [len, wide] = [(along ? x1 - x0 : y1 - y0) + gap, hi - lo]
      const p = onMap(along, along ? (x0 + x1) / 2 : (y0 + y1) / 2, (lo + hi) / 2)
      kit.add(kit.cuboid(along ? len : wide, PADDY.deep, along ? wide : len), PADDY.water, p.x, p.y, ground)
      if (stage === 1 && fallow) return
      for (const k of [-1, 1]) {
        const q = onMap(along, along ? (x0 + x1) / 2 : (y0 + y1) / 2, t + k * 0.4)
        const shoots = kit.cuboid(along ? len - 1 : 0.2, PADDY.tall[stage - 1], along ? 0.2 : len - 1)
        kit.add(shoots, PADDY.shoots[stage - 1], q.x, q.y, ground + 0.04)
      }
    })
    kit.brick('tree', bx, by, ground)
  }
  /** Greenhouses over a field, `houses`, as one brick that drops in like a building. */
  const cover = (houses: ReturnType<typeof greenhouses>, bx: number, by: number) => {
    const ry = along ? 0 : Math.PI / 2
    const { film, hoops, door, tall, hoop } = TUNNELS
    for (const { s, t, len, half } of houses) {
      const p = onMap(along, s, t)
      kit.add(TUNNEL, film, p.x, p.y, ground, ry, len, tall, half)
      for (let h = -len / 2 + hoop / 2; h < len / 2; h += hoop) {
        const q = onMap(along, s + h, t)
        kit.add(HOOP, hoops, q.x, q.y, ground, ry, 0.14, tall * 1.03, half * 1.03)
      }
      for (const k of [-1, 1]) {
        const q = onMap(along, s + k * (len / 2 + 0.02), t)
        kit.add(kit.cuboid(0.06, 1.8, 1.1), door, q.x, q.y, ground, ry)
      }
    }
    kit.brick('building', bx, by, ground, 2)
  }
  for (let t = from; t <= to; t += apart, row++) {
    if (row % rows === 0) crop = kit.pick(FIELDS)
    const here: Bounds[] = [] // this row's lengths
    for (let s = start + length / 2 + 0.1; s <= stop - length / 2 - 0.1; s += length + gap) {
      const [x, y] = along ? [s, t] : [t, s]
      const [w, d] = along ? [length, 0.8] : [0.8, length]
      const ends = along
        ? [field.sample(x - length / 2, y), field.sample(x + length / 2, y)]
        : [field.sample(x, y - length / 2), field.sample(x, y + length / 2)]
      if (Math.min(...ends, field.sample(x, y)) < 1.6 || !inside(block.loop, x, y) || inYard(x, y) || !clearOf(street, x, y, w, d, 1))
        continue
      here.push({ x0: x - w / 2, y0: y - d / 2, x1: x + w / 2, y1: y + d / 2 })
    }
    lengths.push(...here)
    // The row's longest unbroken run, which a tractor drives.
    let best: Row | null = null
    for (let i = 0; i < here.length;) {
      let j = i
      const [a, b] = along ? (['x0', 'x1'] as const) : (['y0', 'y1'] as const)
      while (j + 1 < here.length && here[j + 1][a] - here[j][b] < gap + 0.05) j++
      if (!best || here[j][b] - here[i][a] > best.b - best.a) best = { t, a: here[i][a], b: here[j][b] }
      i = j + 1
    }
    if (best) runs.push(best)
    if (row % rows === rows - 1) sow(along ? mid.x : t, along ? t : mid.y)
  }
  sow(mid.x, mid.y)
  kit.lot(-1)
  // A tractor works the fields of crops from Stage 2 on, and a second one, half its loop ahead, at Stage 3 (#149).
  const plan = furrows(
    sown.filter((f) => f.worked).flatMap((f) => f.rows),
    sown.flatMap((f) => f.rows),
    along ? -1 : 1,
    along,
  )
  if (plan) {
    const [{ x, y }, n] = [plan.loop.pts[0], plan.stops.length]
    kit.from(2, () => kit.mover('tractor', plan.loop, plan.stops, 0, ground), spot(x, y))
    if (n >= 2 * rows) kit.from(3, () => kit.mover('tractor', plan.loop, plan.stops, Math.floor(n / 2), ground), spot(x, y))
  }
}

/** A roundabout's island: a lawn with one big sakura, ringed by small trees when there is room. */
export function island(kit: Kit, field: Field, block: Block, centre: Vec) {
  overlay(kit, field, block, 1.2, 0.5, GRASS)
  kit.brick('ground', centre.x, centre.y, KERB)
  const ground = KERB + 0.5
  const r = Math.min(...block.loop.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)))
  kit.tree(centre.x, centre.y, ground, Math.min(2.6, Math.max(0.8, r / 12.7)), 'sakura')
  if (r < 20) return
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8
    kit.tree(centre.x + Math.cos(a) * r * 0.72, centre.y + Math.sin(a) * r * 0.72, ground, 0.8, i % 2 ? 'sakura' : 'round')
  }
}
