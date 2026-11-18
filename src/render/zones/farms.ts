import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Bounds, type Polyline, type Vec } from '../../sim/geometry'
import { KERB, type Block } from '../blocks'
import { inside, type Field } from '../field'
import { spot, type Kit } from '../kit'
import { clearOf, overlay, site } from '../landmarks'
import type { Look } from './ground'

/** Farms' look (`./index`). */
export const look: Look = { landmarks: false, fill: ({ kit, field, block, street }) => farm(kit, field, block, street) }

const TAU = Math.PI * 2
// Farms: ploughed ground, and the crops of its fields.
const FURROWS = '#cdb08a'
const FIELDS = ['#7bc35e', '#e3c76a', '#a6d36b', '#5aae58', '#d9b45c']
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
