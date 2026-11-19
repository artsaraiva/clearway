import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Polyline, type Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { inside } from '../field'
import { CREAM, DOOR, HARVEST, type Kit, type Look as KitLook, LEDGE, SHAPES, spot, STRAW, to } from '../kit'
import { clearOf, GRASS, overlay, site } from '../landmarks'
import { PATTERN } from '../pattern'
import { bench, GLOWS, menuBoard, STALL, STONE, WOOD } from '../props'
import { person, wheelbarrow } from './green'
import { corners, near, overlap, runs, stands, type Look, type RowLot, type ZoneGround } from './ground'
import { clearOfScenes, facesRoad, placeScenes, sceneOrder, type Scene } from './scenes'
import { nobori } from './shops'

/** Farms' look (`./index`), built to the Finish (#184). */
export const look: Look = { landmarks: false, finish: true, fill: farm }

const TAU = Math.PI * 2
// Farms: the trodden earth of a Block's headlands and its farmyard, a field's soil in two tones (worked pale, and
// freshly tilled or fallow dark), the stubble of a cut field, the crops of its fields.
const EARTH = '#d9c4a0'
const SOIL = { pale: '#cdb08a', dark: '#b8966c', stubble: '#dcc88e' }
const FIELDS = ['#7bc35e', '#e3c76a', '#a6d36b', '#5aae58', '#d9b45c']
// m between rows, a stretch of row and the gap between stretches; and the rows of a field. A stretch of crop row, here
// and in an allotment, is a plain box: rounded, it costs twenty times the triangles, and a farm Tile has hundreds. Rows
// stop `head` m short of the Block's ends, which leaves a headland a tractor turns on: its lane `lane` m beyond the
// rows' ends, on ground `clear` m or more in from the Block's edge.
const FARM = { row: 1.6, length: 5, gap: 0.4, rows: 5, head: 4.5, lane: 1.5, clear: 2.9 }
// m the rows keep from a farmyard or a scene: beyond their ends, where the lane runs, and beside them.
const ROOM = { end: 3, side: 2 }
// A farm's details (#149), each field's drawn from where it lies so that nothing else on its Block draws differently.
// A field is crops; or a paddy, flooded under rows of rice shoots at every Stage; or, from Stage 2 or from Stage 3,
// under vinyl greenhouses (shares of the fields). To the Finish (#184) a field of crops may instead be an orchard, a
// cut field of round bales, a cut field of rice drying on racks, or freshly tilled under low shoots, which a tractor
// works (shares of the fields of crops). A scarecrow stands in some paddies and in some fields of crops, from the
// Stage whose share its draw falls under.
const FIELD_KINDS = { paddy: 0.22, glass: [0.12, 0.1], orchard: 0.13, hay: 0.11, racks: 0.09, tilled: 0.2 }
const SCARECROWS = { paddy: [0.3, 0.55, 0.75], crops: [0, 0.06, 0.14] }
// A paddy's water, soft pale aqua rather than the ponds' glossy blue so that a flooded field never competes with the
// Tool blue (the user's pick on #149), and how deep it lies (m); its shoots at each Stage, their colour and how tall
// they stand above the water. Egrets (#184): the share of paddies with one from Stage 2, and with a second at Stage 3.
const PADDY = { water: '#a9d9d6', deep: 0.1, shoots: ['#8fd46c', '#8fd46c', '#7bc35e'], tall: [0.16, 0.34, 0.46], egrets: [0.75, 0.4] }
// Vinyl greenhouses: pale film over hoops, a door at each end, lit from inside at night (#184). m: the longest house,
// the gap between houses, half a house's width, its height, how far apart its hoops are, and how far in from the ends
// of a field's rows it stops.
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
// m: the radius of a tractor's turns, how far short of a row's end it stops, half the room it takes, with a little to
// spare, and the longest loop it works in whole laps, so that it ends each day where it set out.
const TRACTOR = { turn: 0.6, short: 1, half: 1.4, most: 180 }
// To the Finish (#184). An irrigation channel: its concrete, how wide it and its water are (m), and how far it lies
// from the first row's place. A round bale, lying on its side along x, and one wrapped in film. A fruit tree's trunk,
// leaves and fruit, its crown and a fruit as shapes. A drying rack's timber and its sheaves. A sluice's timber and iron.
const CHANNEL = { bank: '#cfc8ba', wide: 1, water: 0.6, off: 0.3, least: 10 }
const BALE = new THREE.CylinderGeometry(0.75, 0.75, 1.25, 10).rotateZ(Math.PI / 2).translate(0, 0.75, 0)
const WRAPPED = '#eef1ee'
const FRUIT_TREE = { trunk: '#a1714c', leaves: ['#6bc357', '#5fbc51', '#85cf61'], fruit: ['#f0b43c', '#e8925e', '#f6d36a'], grass: GRASS }
const CROWN = new THREE.SphereGeometry(1, 8, 6)
const FRUIT = new THREE.IcosahedronGeometry(1, 0)
const RACK = { pole: WOOD.dark, sheaf: '#e3c76a', cut: '#cfae58' }
const SLUICE = { post: WOOD.dark, gate: '#8e979f' }
// An orchard ladder, standing on y = 0 and leaning toward its front (-z): two rails and their rungs.
const LADDER = mergeGeometries([
  ...[-0.3, 0.3].map((x) => new THREE.BoxGeometry(0.07, 3.3, 0.07).translate(x, 1.65, 0)),
  ...[0.5, 1, 1.5, 2, 2.5, 3].map((y) => new THREE.BoxGeometry(0.6, 0.05, 0.05).translate(0, y, 0)),
]).rotateX(-0.3)
// The people of a farm's scenes: their shirts.
const SHIRTS = ['#f6d36a', '#7fbf9d', '#fbf8f2', '#c7b8f0']
/** The scenes a farm Block without a farmstead picks from (#184), the farmstead being the first of one that has it. */
type FarmScene = 'orchard' | 'stand'
const KINDS: readonly FarmScene[] = ['orchard', 'stand']
// m² of Block from which a farm has a second scene at Stage 3 (#173's rule 5), and the ground each takes: m along its
// front and deep.
const SCENES = { second: 2500, size: { orchard: [12, 9], stand: [7, 4.2] } as Record<FarmScene, [number, number]> }
// The farmyard: m along the Block and across it; in its frame (x to the right of one who faces the fields, y toward
// them), where the farmhouse, the barn, the well, the chicken run, the kei truck and its crates stand, the barn's door
// and where a tractor parks inside it: just inside the door, where it shows from the yard.
const YARD = {
  along: 22,
  across: 16,
  house: [-4, -6.5],
  barn: [3.5, 5.5],
  well: [2.4, -8.5],
  run: [5.85, -8.5],
  truck: [4.75, -4.2],
  crates: [6.8, -4.2],
  door: [3.5, 10],
  parked: [3.5, 7.7],
} as const

/**
 * One row of a farm's field: `t` across the Block, from `a` to `b` along it (its longest unbroken run of crop), every
 * unbroken run of it, and the field it belongs to.
 */
interface Row {
  t: number
  a: number
  b: number
  runs: [number, number][]
  plot: number
}

/** What a field is (`FIELD_KINDS`). */
type FieldKind = 'paddy' | 'glass' | 'orchard' | 'hay' | 'racks' | 'tilled' | 'crops'

/** A field: its rows, where its brick lands, its crop, whether it lies fallow at Stage 1, its stream's seed and its lot. */
interface Plot {
  rows: Row[]
  bx: number
  by: number
  crop: string
  fallow: boolean
  seed: number
  lot: number
}

/** Ground along the Block from `s0` to `s1` and across it from `t0` to `t1`. */
interface Patch {
  s0: number
  s1: number
  t0: number
  t1: number
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

/**
 * A polyline with each corner rounded to a curve about `r` m in from it; points where it runs straight on stay, as do
 * those where it turns straight back, where a tractor stops and sets out the way it came (#184).
 */
function rounded(pts: Vec[], r: number): Vec[] {
  const out = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, p, b] = [pts[i - 1], pts[i], pts[i + 1]]
    const [la, lb] = [Math.hypot(p.x - a.x, p.y - a.y), Math.hypot(b.x - p.x, b.y - p.y)]
    const [ux, uy, vx, vy] = [(p.x - a.x) / la, (p.y - a.y) / la, (b.x - p.x) / lb, (b.y - p.y) / lb]
    if (Math.abs(ux * vy - uy * vx) < 1e-3) {
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
 * A tractor's barn, as its loop needs it (#184), along the Block and across it: where it parks, its door's `t`, the `t`
 * it backs out to, and how far along the Block the lane past its door runs.
 */
interface Shelter {
  parked: [number, number]
  door: number
  back: number
  lane: number
}

/**
 * The loop a tractor works on a farm Block (#149, #184): up the row `first` and back down the row beside it, `second`,
 * turning on the headlands beyond their ends, then along the lane at its `home` end (-1 the low end of the rows, 1 the
 * high) to where it set out. Its stops are the ends of the rows, where it may stop for the night. With a barn `shelter`
 * it sets out from inside it, backs out of its door onto the lane past it and turns there, and drives back in at the
 * end of the loop: its first stop is the barn, and its first stretch is driven in reverse.
 */
function tour(first: Row, second: Row, home: number, along: boolean, shelter?: Shelter) {
  const { lane } = FARM
  const end = (r: Row, side: number) => (side < 0 ? r.a : r.b)
  const far = -home
  const pts: Vec[] = []
  const marks = new Set<Vec>()
  const at = (s: number, t: number, stop = false) => {
    const p = onMap(along, s, t)
    pts.push(p)
    if (stop) marks.add(p)
  }
  // The lane at the home end: beyond the end of both rows.
  const out = shelter ? shelter.lane : home < 0 ? Math.min(first.a, second.a) - lane : Math.max(first.b, second.b) + lane
  if (shelter) {
    at(...shelter.parked, true)
    at(out, shelter.door)
    at(out, shelter.back, true)
    at(out, shelter.door)
    at(out, first.t)
  }
  at(end(first, home), first.t)
  at(end(first, far) - far * TRACTOR.short, first.t, true)
  at(end(first, far), first.t)
  at(end(first, far) + far * lane, first.t)
  at(end(second, far) + far * lane, second.t)
  at(end(second, far), second.t)
  at(end(second, home) - home * TRACTOR.short, second.t, true)
  at(end(second, home), second.t)
  at(out, second.t)
  at(out, shelter ? shelter.door : first.t)
  pts.push(pts[0])
  const kept = pts.filter((p, i) => i === 0 || marks.has(p) || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-6)
  const loop = polyline(rounded(kept, TRACTOR.turn))
  const stops = loop.pts.flatMap((p, i) => (marks.has(p) && i < loop.pts.length - 1 ? [loop.cum[i]] : []))
  return {
    loop,
    stops,
    more: {
      ...(loop.length <= TRACTOR.most && { laps: true }),
      ...(shelter && { reverse: stops.map((_, i) => i === 0), waits: stops.map((_, i) => (i === 1 ? 1.5 : 0)) }),
    },
  }
}

/** The loop an egret keeps to in a paddy (#184), drawn from `draw`: it stands, takes a step or two, and flies to another spot. */
function wade(rows: Row[], along: boolean, draw: () => number): { loop: Polyline; stops: number[]; waits: number[] } | null {
  const wide = rows.filter((r) => r.b - r.a > 8)
  if (!wide.length) return null
  const spotIn = () => {
    const r = wide[Math.floor(draw() * wide.length)]
    return [r.a + 2 + draw() * (r.b - r.a - 5.4), r.t + (draw() - 0.5) * 0.5] as const
  }
  const [[s0, t0], [s1, t1]] = [spotIn(), spotIn()]
  const pts = [
    onMap(along, s0, t0),
    onMap(along, s0 + 1.1, t0 + 0.1),
    onMap(along, s0 + 2.3, t0 - 0.1),
    onMap(along, s1, t1),
    onMap(along, s1 + 1.2, t1),
    onMap(along, s0, t0),
  ]
  const loop = polyline(pts)
  const stops = loop.cum.slice(0, -1)
  return { loop, stops, waits: stops.map(() => 5 + draw() * 10) }
}

/**
 * Ground for a scene `w` m along its front and `d` deep (#184), drawn from `draw`: at an end of the Block or in a
 * corner of it, so that the rows behind it only start later, its front along a straight run of the Block's edge, on a
 * Road if `road`, standing on the Block clear of the lamps and the street trees, and as `ok` has it. Null if none.
 */
function sceneGround(
  g: ZoneGround,
  draw: () => number,
  [w, d]: [number, number],
  along: boolean,
  road: boolean,
  ok: (l: RowLot) => boolean,
) {
  const all = runs(g, 1.8)
  const shift = Math.floor(draw() * Math.max(1, all.length))
  const turned = all.map((_, k) => all[(k + shift) % all.length])
  for (const run of [...turned.filter(facesRoad), ...(road ? [] : turned.filter((r) => !facesRoad(r)))]) {
    const beside = Math.abs(along ? run.ux : run.uy) > 0.7 // it runs with the rows: only its ends are the Block's
    for (const s of beside ? [w / 2 + 0.6, run.len - w / 2 - 0.6] : [run.len / 2, w / 2 + 0.6, run.len - w / 2 - 0.6]) {
      if (s < w / 2 + 0.5 || s > run.len - w / 2 - 0.5) continue
      const [fx, fy] = [run.a.x + run.ux * s, run.a.y + run.uy * s]
      const l: RowLot = { x: fx - (run.nx * d) / 2, y: fy - (run.ny * d) / 2, w, d, ry: run.ry, onRoad: run.onRoad(fx, fy) }
      if (road && !l.onRoad) continue
      if (stands(g, l.x, l.y, w, d, 1.7, l.ry) && !g.lamps.some((p) => near(l, p.x, p.y, 1.5)) && ok(l)) return l
    }
  }
  return null
}

/**
 * A farm Block: trodden earth under fields of crop rows that run along the Block, five rows to a field of one crop,
 * and on some Blocks a farmstead near one end. Rows and farmstead keep clear of the street trees. The farmstead and
 * each field are a lot, and each field is a brick. Its details (#149): some fields are rice paddies, some go under
 * vinyl greenhouses, scarecrows stand in some, a kei truck stands in the farmyard, and a tractor works a tilled field.
 * With the Stage:
 * - Stage 1: a cottage and a barn with no silo, shoots in most fields and the rest left fallow, a fallow paddy flooded
 *   and bare; a scarecrow in some paddies.
 * - Stage 2: a farmhouse with a veranda, a silo, every field grown; a tractor, the kei truck with two crates, the first
 *   greenhouses and more scarecrows.
 * - Stage 3: a two-storey farmhouse and a barn with two silos and a lean-to, fuller, taller rows, and a windbreak of
 *   pines behind the house; a second tractor, more greenhouses and scarecrows, the truck's bed full and a stack of
 *   crates beside it.
 * Built to the Finish (#184): each field lies on soil of its own in furrows, pale or dark; an irrigation channel with a
 * sluice takes the place of the first row; a field of crops may be an orchard, a cut field of round bales or of rice
 * drying on racks, or tilled; the farmstead (`farmstead`) is its Block's scene, and a Block without one has an orchard
 * or a roadside produce stand (`orchard`, `produceStand`), as a large Block has for its second; a tractor works two
 * rows of a tilled field in whole laps and parks in the barn; egrets stand in the paddies and chickens peck about
 * their run; and the greenhouses glow from inside at night.
 */
function farm(g: ZoneGround) {
  const { kit, field, block, kerbsideTrees } = g
  overlay(kit, field, block, 1.6, 0.14, EARTH, PATTERN.gravel)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.14
  const along = block.x1 - block.x0 >= block.y1 - block.y0
  /** A point on the map, along the Block and across it. */
  const st = (x: number, y: number): [number, number] => (along ? [x, y] : [y, x])
  /** The ground a box turned as a row lot is takes, along the Block and across it. */
  const patchOf = (l: RowLot): Patch => {
    const pts = corners(l, 0).map((p) => st(p.x, p.y))
    return {
      s0: Math.min(...pts.map((p) => p[0])),
      s1: Math.max(...pts.map((p) => p[0])),
      t0: Math.min(...pts.map((p) => p[1])),
      t1: Math.max(...pts.map((p) => p[1])),
    }
  }
  // A farmstead on some Blocks only, so that the fields lead: near the Block's low end where it runs east–west and its
  // high end where it runs north–south, its barn's door toward the fields. Its streams' seeds are drawn here, as #149
  // drew them.
  const end = along ? { x: block.x0 + 12, y: mid.y } : { x: mid.x, y: block.y1 - 12 }
  const [yw, yd] = along ? [YARD.along, YARD.across] : [YARD.across, YARD.along]
  const yard = kit.chance(0.45) ? site(field, block, yw, yd, end, kerbsideTrees, 1) : null
  const yardRy = along ? -Math.PI / 2 : Math.PI
  const home = along ? -1 : 1
  const seeds = yard ? [kit.rand(), kit.rand(), kit.rand()].map((v) => (v * 4294967296) >>> 0) : []
  const yardLot: RowLot | null = yard && { x: yard.x, y: yard.y, w: yw, d: yd, ry: 0, onRoad: false }
  // To the Finish, on a stream of the Block's own: its scenes take their ground before the fields are laid. A
  // farmstead is its Block's first scene, so a Block with one draws only a second.
  const draw = mulberry32(spot(mid.x, mid.y) ^ 0xfa12)
  const order = sceneOrder(g, draw, KINDS, SCENES.second)
  const scenes = placeScenes<FarmScene, Scene<FarmScene>>(yard ? order.slice(1) : order, KINDS, (kind, out) => {
    const ok = (l: RowLot) => clearOfScenes(out, l) && !(yardLot && overlap({ ...yardLot, w: yw + 6, d: yd + 6 }, l))
    const found =
      (kind === 'stand' ? sceneGround(g, draw, SCENES.size[kind], along, true, ok) : null) ??
      sceneGround(g, draw, SCENES.size[kind], along, false, ok)
    return found && { ground: found }
  })
  if (yard) for (const s of scenes) s.from = 3
  const keeps = [...(yardLot ? [yardLot] : []), ...scenes.map((s) => s.ground)].map(patchOf)

  // Rows across the Block, cut into lengths that stand clear of its edge, of the farmyard and of the scenes, with a
  // headland beyond their ends; five rows to a field. The first row's place is the irrigation channel's.
  const { row: apart, length, gap, rows: perField, head, lane, clear } = FARM
  const [from, upTo] = along ? [block.y0 + 3, block.y1 - 3] : [block.x0 + 3, block.x1 - 3]
  const [start, stop] = along ? [block.x0 + head, block.x1 - head] : [block.y0 + head, block.y1 - head]
  const on = (s: number, t: number) => {
    const p = onMap(along, s, t)
    return inside(block.loop, p.x, p.y) ? field.sample(p.x, p.y) : -1
  }
  const kept = (s: number, t: number) =>
    !keeps.some((k) => t > k.t0 - ROOM.side && t < k.t1 + ROOM.side && s + length / 2 > k.s0 - ROOM.end && s - length / 2 < k.s1 + ROOM.end)
  const plots: Plot[] = []
  let [crop, open, channel] = [kit.pick(FIELDS), [] as Row[], null as Row | null]
  /** Close the field of the rows gathered, its brick landing on `(bx, by)`. */
  const close = (bx: number, by: number) => {
    if (!open.length) return
    const plot = { rows: open, bx, by, crop, fallow: kit.chance(0.35), seed: (kit.rand() * 4294967296) >>> 0, lot: plots.length + 1 }
    for (const r of open) r.plot = plots.length
    plots.push(plot)
    open = []
  }
  for (let t = from, row = 0; t <= upTo; t += apart, row++) {
    if (row % perField === 0) crop = kit.pick(FIELDS)
    const here: [number, number][] = [] // this row's lengths
    for (let s = start + length / 2 + 0.1; s <= stop - length / 2 - 0.1; s += length + gap) {
      const p = onMap(along, s, t)
      const [w, d] = along ? [length, 0.8] : [0.8, length]
      const ends = [-1, 1].map((k) => s + k * (length / 2 + lane))
      if (
        Math.min(on(s - length / 2, t), on(s, t), on(s + length / 2, t)) < 1.6 ||
        Math.min(...ends.map((e) => on(e, t))) < clear ||
        !kept(s, t) ||
        !clearOf(kerbsideTrees, p.x, p.y, w, d, 1) ||
        ends.some((e) => !clearOf(kerbsideTrees, onMap(along, e, t).x, onMap(along, e, t).y, 0, 0, 2.2))
      )
        continue
      here.push([s - length / 2, s + length / 2])
    }
    // Its unbroken runs, and the longest, which a greenhouse covers and a tractor drives.
    const unbroken: [number, number][] = []
    for (const [a, b] of here) {
      const last = unbroken[unbroken.length - 1]
      if (last && a - last[1] < gap + 0.05) last[1] = b
      else unbroken.push([a, b])
    }
    const best = unbroken.reduce<[number, number] | null>((m, r) => (!m || r[1] - r[0] > m[1] - m[0] ? r : m), null)
    const made: Row | null = best && { t, a: best[0], b: best[1], runs: unbroken, plot: -1 }
    if (row === 0 && made && made.b - made.a >= CHANNEL.least) channel = { ...made, runs: [best!] }
    else if (made) open.push(made)
    if (row % perField === perField - 1) {
      const p = onMap(along, along ? mid.x : mid.y, t)
      close(p.x, p.y)
    }
  }
  close(mid.x, mid.y)
  const every = plots.flatMap((p) => p.rows)

  // What each field is, drawn from where it lies (#149), and the first Stage it is under greenhouses.
  const drawn = plots.map((plot) => {
    const own = mulberry32(spot(plot.bx, plot.by))
    const [what, scare, where, turn, more, egret] = [own(), own(), own(), own(), own(), own()]
    const { paddy, glass, orchard, hay, racks, tilled } = FIELD_KINDS
    const houses = what < paddy ? [] : greenhouses(plot.rows)
    const under = !houses.length ? 0 : what < paddy + glass[0] ? 2 : what < paddy + glass[0] + glass[1] ? 3 : 0
    const roomy = plot.rows.length >= 3 && Math.min(...plot.rows.map((r) => r.b - r.a)) >= 10
    const kind: FieldKind =
      what < paddy
        ? 'paddy'
        : under
          ? 'glass'
          : more < orchard && roomy
            ? 'orchard'
            : more < orchard + hay && roomy
              ? 'hay'
              : more < orchard + hay + racks && roomy
                ? 'racks'
                : more < orchard + hay + racks + tilled
                  ? 'tilled'
                  : 'crops'
    return { kind, houses, under, scare, where, turn, egret }
  })

  // The tractors (#149, #184). One works two rows side by side of a tilled field, with nothing beside them or beyond
  // their ends but that field's low shoots, and on a farmstead's Block rows it reaches from the barn, where it parks; a
  // field is tilled for it where no tilled one will do. A second works another tilled field at Stage 3.
  /** Whether anything grows or stands on the patch: a row of a field other than `but`, or a scene. */
  const busy = (q: Patch, but: number) =>
    every.some((r) => r.plot !== but && r.t + 0.6 > q.t0 && r.t - 0.6 < q.t1 && r.runs.some(([a, b]) => b > q.s0 && a < q.s1)) ||
    scenes.some(({ ground: l }) => {
      const k = patchOf(l)
      return k.s1 > q.s0 && k.s0 < q.s1 && k.t1 > q.t0 && k.t0 < q.t1
    })
  /** Whether a tractor may turn at each of `turns`, along the Block and across it: clear of the lamps and the street trees. */
  const turnable = (turns: [number, number][]) =>
    turns.every(([s, t]) => {
      const c = onMap(along, s, t)
      return clearOf(g.lamps, c.x, c.y, 0, 0, 1.9) && clearOf(kerbsideTrees, c.x, c.y, 0, 0, 2.2)
    })
  const yardPatch = yardLot && patchOf(yardLot)
  const inYard = (lx: number, ly: number) => st(...to(yard!.x, yard!.y, yardRy, lx, ly))
  /**
   * The pairs of rows of field `i` a tractor may work, and the end of them its lane home lies at; if `sheltered`, those
   * it reaches from the barn, by the lane past the barn's door, with the barn each parks in.
   */
  function* pairs(i: number, sheltered: boolean): Generator<{ first: Row; second: Row; home: number; shelter?: Shelter }> {
    const { rows } = plots[i]
    for (let k = 0; k + 1 < rows.length; k++) {
      const [p, q] = [rows[k], rows[k + 1]]
      if (p.runs.length !== 1 || q.runs.length !== 1 || Math.abs(q.t - p.t - apart) > 0.01) continue
      if (Math.abs(p.a - q.a) > 0.3 || Math.abs(p.b - q.b) > 0.3 || p.b - p.a < 12) continue
      const [a, b] = [Math.min(p.a, q.a), Math.max(p.b, q.b)]
      const reach = lane + TRACTOR.half
      if (busy({ s0: a - reach, s1: b + reach, t0: p.t - TRACTOR.half - 0.35, t1: q.t + TRACTOR.half + 0.35 }, i)) continue
      if (!turnable([a - lane, b + lane].flatMap((s) => [p.t, q.t].map((t): [number, number] => [s, t])))) continue
      if (!sheltered) {
        yield { first: p, second: q, home }
        continue
      }
      // From the barn: out of its door to the lane past it, back along the lane away from the rows, then forward to
      // them. The lane lies beyond the rows' ends at either end of them, and beyond the yard on its door's side.
      const [, door] = inYard(...YARD.door)
      const toward = -home // the way the door faces along the Block, as the yard's frame has it
      const edge = toward > 0 ? yardPatch!.s1 : yardPatch!.s0
      const dir = (p.t + q.t) / 2 >= door ? 1 : -1
      const [first, second] = dir > 0 ? [q, p] : [p, q]
      const back = door - dir * 2.6
      const ts = [back, door, p.t, q.t]
      const [lo, hi] = [Math.min(...ts), Math.max(...ts)]
      for (const side of [-1, 1]) {
        const rowsEnd = side < 0 ? a : b
        const out = side * Math.max(side * (rowsEnd + side * lane), side * (edge + toward * lane))
        if ((out - edge) * toward < lane - 0.01) continue
        const way = {
          s0: Math.min(edge, out - TRACTOR.half),
          s1: Math.max(edge, out + TRACTOR.half),
          t0: lo - TRACTOR.half,
          t1: hi + TRACTOR.half,
        }
        // The way keeps on the Block's earth all along, off the yard beside it and clear of the lamps and the trees.
        const passed = Array.from({ length: Math.ceil(hi - lo) + 1 }, (_, n): [number, number] => [out, Math.min(hi, lo + n)])
        if (busy(way, i) || passed.some(([s, t]) => on(s, t) < clear - 0.1) || !turnable(passed)) continue
        yield { first, second, home: side, shelter: { parked: inYard(...YARD.parked), door, back, lane: out } }
      }
    }
  }
  const workable = (kinds: FieldKind[], sheltered: boolean, but = -1) => {
    for (const kind of kinds)
      for (const [i, d] of drawn.entries()) {
        if (d.kind !== kind || i === but) continue
        for (const pair of pairs(i, sheltered)) return { plot: i, ...pair }
      }
    return null
  }
  // The field by the barn is tilled whatever it drew; elsewhere only a field of crops is tilled for a tractor.
  const worked =
    (yard ? workable(['tilled', 'crops', 'hay', 'racks', 'orchard', 'glass', 'paddy'], true) : null) ?? workable(['tilled', 'crops'], false)
  if (worked) drawn[worked.plot].kind = 'tilled'
  const second = worked && workable(['tilled'], false, worked.plot)

  // The farmstead, the Block's first scene: `farmstead`.
  if (yard)
    kit.scene('farmstead', () => {
      kit.lot(0)
      farmstead(g, yard, yardRy, ground, seeds, !!worked?.shelter)
    })

  /** A slab of ground over the patch `q`, `lift` m up, in `colour`, wearing `kind` along the rows; it joins the next brick. */
  const lay = (q: Patch, colour: string, kind: (typeof PATTERN)[keyof typeof PATTERN], lift = 0, tall = 0.05) => {
    const [w, d] = along ? [q.s1 - q.s0, q.t1 - q.t0] : [q.t1 - q.t0, q.s1 - q.s0]
    const p = onMap(along, (q.s0 + q.s1) / 2, (q.t0 + q.t1) / 2)
    const box = kit.cuboid(w, tall, d)
    kit.laid((box.index ? box.toNonIndexed() : box.clone()).translate(p.x, ground + lift, -p.y), colour, kind, undefined, !along)
  }
  /** The ground under a field's rows, as few patches as cover them: rows with the same runs share theirs. */
  const beds = (rows: Row[]): Patch[] => {
    const out: Patch[] = []
    let [key, last, mine] = ['', NaN, [] as Patch[]]
    for (const r of rows) {
      const k = r.runs.map(([a, b]) => `${a.toFixed(2)}:${b.toFixed(2)}`).join()
      if (k === key && Math.abs(r.t - last - apart) < 0.01) for (const q of mine) q.t1 = r.t + apart / 2
      else out.push(...(mine = r.runs.map(([a, b]) => ({ s0: a - 0.2, s1: b + 0.2, t0: r.t - apart / 2, t1: r.t + apart / 2 }))))
      ;[key, last] = [k, r.t]
    }
    return out
  }
  /** Each stretch of a field's rows: its middle and its length. */
  const stretches = (rows: Row[]) =>
    rows.flatMap((r) =>
      r.runs.flatMap(([a, b]) =>
        Array.from({ length: Math.round((b - a + gap) / (length + gap)) }, (_, k) => ({ s: a + length / 2 + k * (length + gap), t: r.t })),
      ),
    )
  /** A row of something `wide` across and `tall` high over each stretch of `rows`, `len` long, in `colour`, `up` m above the ground. */
  const sown = (rows: Row[], wide: number, tall: number, colour: string, len = length, up = 0) => {
    for (const { s, t } of stretches(rows)) {
      const p = onMap(along, s, t)
      kit.add(kit.cuboid(along ? len : wide, tall, along ? wide : len), colour, p.x, p.y, ground + up)
    }
  }
  /**
   * A paddy at Stage `stage`: water over each stretch of its rows, the stretches meeting along a row and across it but
   * for a low bank round the field, and two rows of shoots to each stretch unless it lies fallow.
   */
  const flood = (stage: number, fallow: boolean, rows: Row[]) => {
    const [first, last] = [rows[0].t, rows[rows.length - 1].t]
    for (const { s, t } of stretches(rows)) {
      const [lo, hi] = [t - (t - first < 0.01 ? 0.55 : apart / 2), t + (last - t < 0.01 ? 0.55 : apart / 2)]
      const [len, wide] = [length + gap, hi - lo]
      const p = onMap(along, s, (lo + hi) / 2)
      kit.add(kit.cuboid(along ? len : wide, PADDY.deep, along ? wide : len), PADDY.water, p.x, p.y, ground)
      if (stage === 1 && fallow) continue
      for (const k of [-1, 1]) {
        const q = onMap(along, s, t + k * 0.4)
        const shoots = kit.cuboid(along ? len - 1 : 0.2, PADDY.tall[stage - 1], along ? 0.2 : len - 1)
        kit.add(shoots, PADDY.shoots[stage - 1], q.x, q.y, ground + 0.04)
      }
    }
  }
  /** Greenhouses over a field, `houses`, lit from inside at night and leaving their light round them (#184). */
  const cover = (houses: ReturnType<typeof greenhouses>) => {
    const ry = along ? 0 : Math.PI / 2
    const { film, hoops, door, tall, hoop } = TUNNELS
    for (const { s, t, len, half } of houses) {
      const p = onMap(along, s, t)
      kit.add(TUNNEL, kit.lit(film, GLOWS.band), p.x, p.y, ground, ry, len, tall, half)
      for (let h = -len / 2 + hoop / 2; h < len / 2; h += hoop) {
        const q = onMap(along, s + h, t)
        kit.add(HOOP, hoops, q.x, q.y, ground, ry, 0.14, tall * 1.03, half * 1.03)
      }
      for (const k of [-1, 1]) {
        const q = onMap(along, s + k * (len / 2 + 0.02), t)
        kit.add(kit.cuboid(0.06, 1.8, 1.1), door, q.x, q.y, ground, ry)
      }
      kit.pool('window', p.x, p.y, ground, len + 2, 2 * half + 2.4, ry)
    }
  }
  /** A cut field's round bales at Stage `stage` (#184): two, four, then six, two of the six wrapped. */
  const bales = (stage: number, rows: Row[], own: () => number) => {
    const spots = stretches(rows.slice(1, -1)).filter((_, k) => k % 2 === 0)
    for (let k = 0; k < Math.min([2, 4, 6][stage - 1], spots.length); k++) {
      const { s, t } = spots.splice(Math.floor(own() * spots.length), 1)[0]
      const p = onMap(along, s + (own() - 0.5) * 2, t)
      kit.add(BALE, k >= 4 ? WRAPPED : STRAW, p.x, p.y, ground, (along ? 0 : Math.PI / 2) + (own() < 0.5 ? 0 : Math.PI / 2))
    }
  }
  /** A cut field's drying racks at Stage `stage` (#184): one, two, then three, each a pole on crossed legs hung with sheaves. */
  const racks = (stage: number, rows: Row[], own: () => number) => {
    const spots = stretches(rows.slice(1, -1))
    const ry = along ? 0 : Math.PI / 2
    for (let k = 0; k < Math.min(stage, spots.length); k++) {
      const { s, t } = spots.splice(Math.floor(own() * spots.length), 1)[0]
      const p = onMap(along, s, t)
      kit.put(kit.cuboid(4.6, 0.09, 0.09), RACK.pole, p.x, p.y, ry, 0, 0, ground + 1.5)
      for (const u of [-2.1, 0, 2.1])
        for (const v of [-0.3, 0.3]) kit.put(kit.cuboid(0.09, 1.6, 0.09), RACK.pole, p.x, p.y, ry, u, v, ground)
      kit.put(kit.cuboid(4, 0.8, 0.42), RACK.sheaf, p.x, p.y, ry, 0, 0, ground + 0.72)
      kit.put(kit.cuboid(4.04, 0.16, 0.46), RACK.cut, p.x, p.y, ry, 0, 0, ground + 1.42)
    }
  }
  plots.forEach((plot, i) => {
    const { rows, bx, by, crop: colour, fallow } = plot
    const { kind, houses, under, scare, where, turn, egret } = drawn[i]
    const tractors = worked?.plot === i || second?.plot === i
    kit.lot(plot.lot)
    kit.staged((stage) => {
      const own = mulberry32(plot.seed ^ 0x51ed)
      if (kind === 'paddy') flood(stage, fallow, rows)
      else if (kind === 'glass' && stage >= under) {
        for (const q of beds(rows)) lay(q, SOIL.pale, PATTERN.soil)
        cover(houses)
      } else if (kind === 'orchard') {
        for (const q of beds(rows)) lay(q, FRUIT_TREE.grass, PATTERN.lawn)
        const lines = rows.filter((_, k) => k % 2 === 1)
        for (const r of lines)
          for (let s = r.a + 2; s <= r.b - 2; s += 4.5) {
            const p = onMap(along, s, r.t)
            fruitTree(kit, p.x, p.y, ground, [0.3, 0.42, 0.5][stage - 1] + own() * 0.05, stage === 3, own)
          }
      } else if (kind === 'hay' || kind === 'racks') {
        for (const q of beds(rows)) lay(q, SOIL.stubble, PATTERN.soil)
        sown(rows, 0.5, 0.1, kind === 'hay' ? STRAW : RACK.cut, length - 0.4, 0.05)
        ;(kind === 'hay' ? bales : racks)(stage, rows, own)
      } else if (kind === 'tilled') {
        // Freshly tilled: dark soil, bare at Stage 1 and then under low shoots a tractor straddles.
        for (const q of beds(rows)) lay(q, SOIL.dark, PATTERN.soil)
        if (stage > 1) sown(rows, 0.5, [0, 0.16, 0.28][stage - 1], colour, length, 0.02)
      } else {
        const bare = stage === 1 && fallow
        for (const q of beds(rows)) lay(q, bare ? SOIL.dark : SOIL.pale, PATTERN.soil)
        if (!bare) sown(rows, stage === 3 ? 1.16 : 0.8, [0.22, 0.5, 0.66][stage - 1], colour) // fuller at Stage 3
      }
      kit.brick(kind === 'glass' && stage >= under ? 'building' : 'tree', bx, by, ground, kind === 'glass' && stage >= under ? 2 : 0)
    }, plot.seed)
    const shares = kind === 'paddy' ? SCARECROWS.paddy : kind === 'crops' && !tractors ? SCARECROWS.crops : null
    const first = shares ? shares.findIndex((share) => scare < share) + 1 : 0 // the first Stage it has a scarecrow
    const centre = rows[Math.floor(rows.length / 2)]
    if (first && centre && centre.b - centre.a > 8) {
      const paddy = kind === 'paddy'
      const p = onMap(along, centre.a + 4 + where * (centre.b - centre.a - 8), centre.t + (paddy ? 0 : FARM.row / 2))
      kit.from(first, () => kit.scarecrow(p.x, p.y, ground + (paddy ? PADDY.deep : 0), turn * TAU), spot(p.x, p.y))
    }
    // Egrets in a paddy (#184): one from Stage 2 in most, and a second at Stage 3 in some.
    if (kind === 'paddy')
      PADDY.egrets.forEach((share, k) => {
        const plan = egret < share ? wade(rows, along, mulberry32(spot(bx, by) + 31 + k)) : null
        if (plan)
          kit.from(k + 2, () => kit.mover('egret', plan.loop, plan.stops, k, ground + 0.85, { waits: plan.waits }), spot(bx + k, by + 3))
      })
  })
  kit.lot(-1)

  // The irrigation channel (#184), in the place of the first row: a concrete trough of pale water, and a sluice across it.
  if (channel) {
    const { t, a, b } = { ...channel, t: channel.t - CHANNEL.off }
    const at = onMap(along, (a + b) / 2, t)
    kit.from(
      1,
      () => {
        lay({ s0: a, s1: b, t0: t - CHANNEL.wide / 2, t1: t + CHANNEL.wide / 2 }, CHANNEL.bank, PATTERN.paving, 0, 0.12)
        lay({ s0: a + 0.2, s1: b - 0.2, t0: t - CHANNEL.water / 2, t1: t + CHANNEL.water / 2 }, PADDY.water, PATTERN.paving, 0.11, 0.02)
        kit.brick('ground', at.x, at.y, ground)
        kit.blockZoomProps(() => {
          const ry = along ? 0 : Math.PI / 2
          for (const v of [-0.38, 0.38]) kit.put(kit.cuboid(0.1, 1.1, 0.1), SLUICE.post, at.x, at.y, ry, 0, v, ground)
          kit.put(kit.cuboid(0.1, 0.1, 0.86), SLUICE.post, at.x, at.y, ry, 0, 0, ground + 1.1)
          kit.put(kit.cuboid(0.06, 0.6, 0.62), SLUICE.gate, at.x, at.y, ry, 0, 0, ground + 0.1)
          kit.put(kit.cuboid(0.05, 0.5, 0.05), SLUICE.gate, at.x, at.y, ry, 0, 0, ground + 0.7)
          kit.put(kit.cuboid(0.3, 0.05, 0.3), SLUICE.gate, at.x, at.y, ry, 0, 0, ground + 1.2)
          kit.brick('building', at.x, at.y, ground)
        })
      },
      spot(at.x, at.y),
    )
  }

  // The Block's other scenes: bare until their Stage.
  for (const { kind, ground: l, from } of scenes) {
    kit.stand(l.x, l.y, l.w, l.d, l.ry, from)
    kit.scene(kind, () =>
      kit.staged((stage) => ({ orchard, stand: produceStand })[kind](kit, l, stage, ground, stage >= from), spot(l.x, l.y)),
    )
  }

  // A tractor works its rows from Stage 2 on, and a second another tilled field at Stage 3 (#149).
  for (const [k, plan] of [worked, second].entries()) {
    if (!plan) continue
    const { loop, stops, more } = tour(plan.first, plan.second, plan.home, along, plan.shelter)
    const { x, y } = loop.pts[0]
    kit.from(k + 2, () => kit.mover('tractor', loop, stops, 0, ground, more), spot(x, y) + k)
  }
}

// The farmstead's palettes (#184): a farmhouse's plaster, its tiles, timber and deck; a barn's walls, roof and doors,
// the silo and its dome; a well's stone and roof; a chicken run's wire, its coop and the coop's roof.
const HOUSE = { walls: ['#f4ead2', '#efe6d6', '#e9dcc0'], roofs: ['#56636f', '#5f6a63', '#6b5f58'], timber: '#8a6446', deck: '#c49a6c' }
const BARN = {
  walls: ['#7e9aab', '#b85a4c', '#8aa58b'],
  roof: '#5b6b7a',
  door: '#f4f1ea',
  rail: '#9aa7b2',
  silo: '#e9eef2',
  dome: '#9aa7b2',
}
const WELL = { roof: '#6b5f58', bucket: '#8e979f' }
const RUN = { wire: '#aab3ad', coop: '#d8b98b', roof: '#8a5a3c' }
const { cylinder: CYLINDER, sphere: SPHERE } = SHAPES

/**
 * A farmstead in its yard at `yard`, whose frame is turned `ry` so that its front faces the fields (#184), on the earth
 * `h` up, each piece a brick: a farmhouse and a barn (`farmhouse`, `barn`), a well and a chicken run with its chickens
 * (`well`, `chickenRun`), a kei truck from Stage 2 and at Stage 3 a stack of crates beside it (#149), and a windbreak
 * of pines behind the house at Stage 3. `seeds` are its house's, its barn's and its pines' streams'. The barn stands
 * `open` to a tractor that parks in it.
 */
function farmstead(g: ZoneGround, yard: Vec, ry: number, h: number, seeds: number[], open: boolean) {
  const { kit, field, block, kerbsideTrees } = g
  const at = ([lx, ly]: readonly [number, number]) => to(yard.x, yard.y, ry, lx, ly)
  const [hx, hy] = at(YARD.house)
  kit.staged((stage) => farmhouse(kit, hx, hy, h, ry - Math.PI / 2, stage), seeds[0])
  const [bx, by] = at(YARD.barn)
  kit.staged((stage) => barn(kit, bx, by, h, ry, stage, open), seeds[1])
  const [wx, wy] = at(YARD.well)
  kit.from(1, () => well(kit, wx, wy, h), spot(wx, wy))
  chickenRun(kit, ...at(YARD.run), h, ry)
  const [truck, stack] = [at(YARD.truck), at(YARD.crates)]
  kit.staged((stage) => stage > 1 && kit.keiTruck(...truck, h, ry, stage), spot(...truck))
  kit.from(3, () => crates(kit, ...stack, h, ry, 4), spot(...stack))
  // The windbreak: a line of pines along the back of the house, on the Block.
  kit.from(
    3,
    () => {
      for (let k = 0; k < 4; k++) {
        const [px, py] = at([-8.7, -10.2 + k * 2.6])
        if (field.sample(px, py) >= 1.6 && inside(block.loop, px, py) && clearOf(kerbsideTrees, px, py, 0, 0, 3))
          kit.tree(px, py, h, kit.range(0.5, 0.62), 'pine')
      }
    },
    seeds[2],
  )
}

/**
 * A farmhouse at Stage `stage`, its front facing `ry`, as one brick (#184): plaster walls with a window in every bay,
 * lit at night, under a hipped roof of tiles, and a lantern by its door. Its colours are drawn before anything a Stage
 * changes:
 * - Stage 1: a cottage, one storey on a smaller footprint.
 * - Stage 2: the house, with a veranda along its front: a timber deck under a lean-to roof on posts.
 * - Stage 3: a second storey, a ledge between the two.
 */
function farmhouse(kit: Kit, x: number, y: number, h: number, ry: number, stage: number) {
  const [walls, roofs] = [kit.pick(HOUSE.walls), kit.pick(HOUSE.roofs)]
  const seed = spot(x, y)
  const [w, d] = stage === 1 ? [6.2, 5] : [8, 6]
  const wall = stage === 3 ? 6 : 3
  const put = (geo: THREE.BufferGeometry, look: KitLook, lx: number, ly: number, z: number) => kit.local(geo, look, x, y, ry, lx, ly, h + z)
  const cladding = { front: PATTERN.plaster, back: PATTERN.house, sides: PATTERN.house, storey: 3, bay: 2.6 }
  kit.cladded(kit.box(w, wall, d, 0.16, 0.08), walls, x, y, h, ry, cladding, seed)
  kit.tiled(kit.hip(w + 1.2, d + 1.2, stage === 1 ? 1.5 : 1.9), roofs, x, y, h + wall, ry + Math.PI / 2, seed + 1)
  const deck = stage > 1 ? 0.3 : 0
  if (stage > 1) {
    put(kit.cuboid(w, deck, 1.4), HOUSE.deck, 0, d / 2 + 0.7, 0)
    for (const k of [-1, -1 / 3, 1 / 3, 1]) put(kit.cuboid(0.12, 2.5, 0.12), HOUSE.timber, k * (w / 2 - 0.12), d / 2 + 1.28, deck)
    put(kit.tipped(w + 0.4, 0.12, 1.9, 0.24), roofs, 0, d / 2 + 0.78, 2.98)
  }
  if (stage === 3) put(kit.cuboid(w + 0.3, 0.2, d + 0.3), LEDGE, 0, 0, 2.95)
  // Its door and the windows it is built with, on its front.
  put(kit.cuboid(1.1, 2.1, 0.14), DOOR, -w / 4, d / 2 + 0.03, deck)
  kit.doorway(...to(x, y, ry, -w / 4, d / 2), ry, 1.1, stage > 1 ? 1.4 : 0)
  for (let s = 0; s < wall / 3; s++)
    for (const lx of s ? [-w / 4, w / 5] : [w / 5])
      put(kit.cuboid(stage === 1 ? 1.5 : 2.2, 1.4, 0.12), kit.pane(0.75), lx, d / 2 + 0.03, 0.9 + s * 3)
  put(kit.cuboid(0.26, 0.34, 0.26), kit.lit(CREAM, GLOWS.low), -w / 4 + 0.95, d / 2 + (stage > 1 ? 1.2 : 0.2), 2.05)
  kit.pool('cream', ...to(x, y, ry, -w / 4 + 0.6, d / 2 + 1.5), h, 4, 3.2, ry)
  kit.shadow(x, y, h, w + 3, d + 3.6, false, ry)
  kit.brick('building', x, y, h)
}

/**
 * A barn at Stage `stage`, its door facing `ry`, as one brick: corrugated walls with a high strip of windows, lit at
 * night, under a ribbed gable roof, a hay loft at its back, a lamp over its door, and round bales behind it. With room
 * for a tractor inside (#184) when `open`: its door leaves folded back against its front, where they are shut otherwise.
 * Its colour is drawn before anything a Stage changes:
 * - Stage 1: the barn and a bale.
 * - Stage 2: a silo beside it, and three bales.
 * - Stage 3: a second, shorter silo, and a lean-to over the bales, five of them.
 */
function barn(kit: Kit, x: number, y: number, h: number, ry: number, stage: number, open: boolean) {
  kit.formed('barn')
  const walls = kit.pick(BARN.walls)
  const seed = spot(x, y)
  const [W, D, T, thick, door] = [7, 9, 5, 0.3, 3.6]
  const sheet = PATTERN.corrugated
  const put = (geo: THREE.BufferGeometry, look: KitLook, lx: number, ly: number, z: number) => kit.local(geo, look, x, y, ry, lx, ly, h + z)
  const wall = (w: number, d: number, lx: number, ly: number, k: number) =>
    kit.cladded(kit.cuboid(w, T, d), walls, ...to(x, y, ry, lx, ly), h, ry, { front: sheet, back: sheet, sides: sheet, bay: 3 }, seed + k)
  wall(W, thick, 0, -D / 2 + thick / 2, 0)
  for (const k of [-1, 1]) wall(thick, D - 2 * thick, k * (W / 2 - thick / 2), 0, 1)
  for (const k of [-1, 1]) wall((W - door) / 2, thick, k * (door / 2 + (W - door) / 4), D / 2 - thick / 2, 2)
  put(kit.cuboid(door, T - 3.8, thick), walls, 0, D / 2 - thick / 2, 3.8)
  kit.tiled(kit.gable(D + 0.8, W + 1, 2.6), BARN.roof, x, y, h + T, ry, seed + 3, PATTERN.ribbed)
  put(kit.cuboid(W - 2 * thick, 0.07, D - 2 * thick), CHANNEL.bank, 0, 0, 0) // its floor, over its contact shadow
  // Its door's two leaves, each with its rails: folded back, or shut.
  for (const k of [-1, 1]) {
    const lx = k * (open ? door / 2 + 0.88 : 0.9)
    put(kit.cuboid(1.76, 3.7, 0.1), BARN.door, lx, D / 2 + 0.06, 0.05)
    for (const z of [0.5, 3.1]) put(kit.cuboid(1.76, 0.14, 0.04), BARN.rail, lx, D / 2 + 0.13, z)
  }
  // The hay loft across its back, and the lamp over its door.
  put(kit.cuboid(W - 2 * thick, 0.14, 3.2), WOOD.dark, 0, -D / 2 + thick + 1.6, 2.9)
  for (const lx of [-2, -0.7, 1.4]) put(kit.cuboid(1.1, 0.7, 0.8), STRAW, lx, -D / 2 + thick + 1, 3.04)
  put(kit.cuboid(0.3, 0.3, 0.24), kit.lit(CREAM, GLOWS.low), 0, D / 2 + 0.13, 4.15)
  kit.pool('cream', ...to(x, y, ry, 0, D / 2 + 2.2), h, 5, 4.4, ry)
  const silo = (lx: number, ly: number, r: number, tall: number, k: number) => {
    const [sx, sy] = to(x, y, ry, lx, ly)
    kit.wrapped(CYLINDER, BARN.silo, sx, sy, h, r, tall, { kind: PATTERN.plates, bay: 2, storey: 1.2 }, seed + 4 + k)
    kit.add(SPHERE, BARN.dome, sx, sy, h + tall, 0, r + 0.05, r * 0.72, r + 0.05)
    kit.add(kit.cuboid(0.4, tall - 0.3, 0.08), BARN.dome, ...to(sx, sy, ry, 0, r + 0.05), h + 0.3, ry)
  }
  if (stage > 1) silo(-7, 2, 1.9, 9.5, 0)
  if (stage === 3) silo(-6.7, -1.6, 1.5, 7, 1)
  // Round bales behind it, and at Stage 3 a lean-to over them.
  const back = -D / 2 - 1.2
  const stacked = stage === 1 ? [[0, 0]] : stage === 2 ? [-1.7, 0, 1.7].map((u) => [u, 0]) : [[-1.7, 0], [0, 0], [1.7, 0], [-0.85, 1.3], [0.85, 1.3]] // prettier-ignore
  for (const [lx, z] of stacked) kit.add(BALE, STRAW, ...to(x, y, ry, lx, back), h + z, ry)
  if (stage === 3) {
    for (const lx of [-3, 3])
      for (const ly of [-0.25, -2.7]) put(kit.cuboid(0.16, ly < -1 ? 2.5 : 3.1, 0.16), WOOD.dark, lx, -D / 2 + ly, 0)
    kit.add(kit.tipped(6.5, 0.14, 3.3, 0.22), BARN.roof, ...to(x, y, ry, 0, -D / 2 - 1.5), h + 2.9, ry + Math.PI)
  }
  kit.shadow(x, y, h, W + 2.4, D + 2.4, false, ry)
  kit.brick('building', x, y, h)
}

/** A well at `(x, y)` on the earth `h` up, as one brick (#184): a ring of stone over water, and a bucket under a little tiled roof on two posts. */
function well(kit: Kit, x: number, y: number, h: number) {
  kit.drum(STONE.rim, x, y, h, 0.8, 0.8, 0.8)
  kit.drum(PADDY.water, x, y, h + 0.7, 0.58, 0.58, 0.12)
  for (const k of [-1, 1]) kit.add(kit.cuboid(0.12, 2.2, 0.12), WOOD.dark, x + k * 0.9, y, h)
  kit.add(kit.cuboid(1.9, 0.08, 0.08), WOOD.dark, x, y, h + 1.9)
  kit.add(kit.gable(1.5, 2.4, 0.6), WELL.roof, x, y, h + 2.2)
  kit.add(kit.cuboid(0.03, 0.7, 0.03), WOOD.dark, x, y, h + 1.2)
  kit.add(kit.cuboid(0.3, 0.3, 0.3), WELL.bucket, x, y, h + 0.95)
  kit.shadow(x, y, h, 2.6, 2.6, true)
  kit.brick('building', x, y, h)
}

/**
 * A chicken run at `(x, y)`, turned `ry` as its yard is, on the earth `h` up (#184), as one brick: a fence of wire mesh
 * on posts round trodden straw, and a coop on legs under a little roof, with its ramp. From Stage 2 two chickens peck
 * about it, and a third at Stage 3.
 */
function chickenRun(kit: Kit, x: number, y: number, h: number, ry: number) {
  const [w, d] = [3.3, 4.2]
  kit.from(
    1,
    () => {
      const put = (geo: THREE.BufferGeometry, look: KitLook, lx: number, ly: number, z: number) =>
        kit.local(geo, look, x, y, ry, lx, ly, h + z)
      put(kit.cuboid(w - 0.1, 0.07, d - 0.1), STRAW, 0, 0, 0) // over the run's contact shadow
      for (const [len, lx, ly, turn] of [
        [w, 0, d / 2, 0],
        [w, 0, -d / 2, 0],
        [d, w / 2, 0, Math.PI / 2],
        [d, -w / 2, 0, Math.PI / 2],
      ])
        kit.cladded(
          kit.cuboid(len, 1.2, 0.05),
          RUN.wire,
          ...to(x, y, ry, lx, ly),
          h,
          ry + turn,
          { front: PATTERN.mesh, back: PATTERN.mesh, bay: len / 2 },
          spot(x + lx, y + ly),
        )
      for (const i of [-1, 0, 1]) for (const j of [-1, 1]) put(kit.cuboid(0.1, 1.35, 0.1), WOOD.dark, (i * w) / 2, (j * d) / 2, 0)
      for (const i of [-1, 1]) put(kit.cuboid(0.1, 1.35, 0.1), WOOD.dark, (i * w) / 2, 0, 0)
      // The coop, in a back corner.
      const [cx, cy] = [w / 2 - 0.95, -d / 2 + 0.85]
      for (const i of [-1, 1]) for (const j of [-1, 1]) put(kit.cuboid(0.08, 0.5, 0.08), WOOD.dark, cx + i * 0.6, cy + j * 0.45, 0)
      put(kit.cuboid(1.5, 0.9, 1.2), RUN.coop, cx, cy, 0.5)
      kit.add(kit.gable(1.4, 1.8, 0.45), RUN.roof, ...to(x, y, ry, cx, cy), h + 1.4, ry)
      put(kit.cuboid(0.36, 0.4, 0.04), WOOD.dark, cx, cy + 0.61, 0.55)
      kit.shadow(x, y, h, w + 0.6, d + 0.6, false, ry)
      kit.brick('building', x, y, h)
    },
    spot(x, y),
  )
  for (let k = 0; k < 3; k++) {
    const draw = mulberry32(spot(x, y) + 7 + k)
    // Round the run's open half, clear of the coop.
    const pts = Array.from({ length: 4 }, () => to(x, y, ry, -w / 2 + 0.5 + draw() * (w - 2.4), -d / 2 + 0.5 + draw() * (d - 1)))
    const loop = polyline([...pts, pts[0]].map(([px, py]) => ({ x: px, y: py })))
    const stops = loop.cum.slice(0, -1)
    const waits = stops.map(() => 2 + draw() * 6)
    kit.from(k < 2 ? 2 : 3, () => kit.mover('chicken', loop, stops, k % stops.length, h + 0.04, { waits }), spot(x, y) + 11 + k)
  }
}

/**
 * Crates stacked on the ground at `(x, y)`, `count` of them two to a layer, turned `ry`, as one brick, in the colours of
 * those on a kei truck's bed (`HARVEST`): a farmyard's harvest waiting to go (#149, #210).
 */
function crates(kit: Kit, x: number, y: number, h: number, ry: number, count: number) {
  stack(kit, x, y, h, ry, count)
  kit.shadow(x, y, h, 2.2, 1.6, false, ry)
  kit.brick('building', x, y, h)
}

/** `count` crates at `(x, y)`, two to a layer, turned `ry`, in the brick being built. */
function stack(kit: Kit, x: number, y: number, h: number, ry: number, count: number) {
  for (let k = 0; k < count; k++)
    kit.local(kit.cuboid(0.74, 0.44, 0.58), kit.pick(HARVEST), x, y, ry, k % 2 ? 0.4 : -0.4, 0, h + Math.floor(k / 2) * 0.46)
}

/**
 * A fruit tree of size `s` (1 is about 5.6 m tall) at `(x, y)`, `h` up, in the brick being built (#184): a slim trunk
 * under two crowns of a few faces, since an orchard has dozens, and fruit on them if `fruit`, drawn from `draw`.
 */
function fruitTree(kit: Kit, x: number, y: number, h: number, s: number, fruit: boolean, draw: () => number) {
  const pick = <T>(from: T[]) => from[Math.floor(draw() * from.length)]
  kit.add(SHAPES.thin, FRUIT_TREE.trunk, x, y, h, 0, 0.22 * s, 2.6 * s, 0.22 * s)
  const a = draw() * TAU
  const crowns = [
    [x, y, 3.7 * s, 1.9 * s],
    [x + Math.cos(a) * 1.1 * s, y + Math.sin(a) * 1.1 * s, 3.1 * s, 1.4 * s],
  ]
  for (const [cx, cy, up, r] of crowns) kit.add(CROWN, pick(FRUIT_TREE.leaves), cx, cy, h + up, 0, r, r * 0.85, r)
  if (!fruit) return
  const colour = pick(FRUIT_TREE.fruit)
  for (let k = 0; k < 3; k++) {
    const [b, lift] = [a + 1 + k * 2.1, 0.2 + draw() * 0.5]
    const out = 1.9 * s * Math.sqrt(1 - lift * lift)
    kit.add(
      FRUIT,
      colour,
      x + Math.cos(b) * out,
      y + Math.sin(b) * out,
      h + 3.7 * s + lift * 1.9 * s * 0.85,
      0,
      0.24 * s,
      0.24 * s,
      0.24 * s,
    )
  }
}

/**
 * An orchard on its ground `l` (#184), facing its front, the earth `h` up: mown grass under two rows of fruit trees,
 * saplings until it is `on`; then in fruit, a picker up a ladder against one, crates of the harvest and a wheelbarrow,
 * and a lantern on a post that lights at dusk; at Stage 3 taller trees, a second ladder and more crates.
 */
function orchard(kit: Kit, l: RowLot, stage: number, h: number, on: boolean) {
  const draw = mulberry32(spot(l.x, l.y) ^ 0x0c4a)
  const at = (lx: number, ly: number) => to(l.x, l.y, l.ry, lx, ly)
  kit.paving(l.x, l.y, h, l.w - 0.4, l.d - 0.4, l.ry, FRUIT_TREE.grass, PATTERN.lawn, 0.02)
  const s = on ? (stage === 3 ? 0.62 : 0.56) : 0.26
  for (const ly of [-2.2, 2.2]) for (const lx of [-4.5, -1.5, 1.5, 4.5]) fruitTree(kit, ...at(lx, ly), h, s + draw() * 0.05, on, draw)
  if (on) {
    const ladders = stage === 3 ? [[-1.5, 2.2], [4.5, -2.2]] : [[-1.5, 2.2]] // prettier-ignore
    for (const [lx, ly] of ladders) kit.add(LADDER, WOOD.pale, ...at(lx + 0.2, ly + 1.5), h, l.ry + Math.PI)
    person(kit, ...at(-2.6, 3.3), h, l.ry + Math.PI, SHIRTS[Math.floor(draw() * SHIRTS.length)])
    stack(kit, ...at(1.6, 3.6), h, l.ry, stage === 3 ? 6 : 3)
    wheelbarrow(kit, ...at(3.4, 3.4), h, l.ry + 0.6)
    const [px, py] = at(-5.4, 3.9)
    kit.add(kit.cuboid(0.12, 1.5, 0.12), WOOD.dark, px, py, h)
    kit.add(kit.cuboid(0.3, 0.34, 0.3), kit.lit(CREAM, GLOWS.low), px, py, h + 1.5)
    kit.pool('cream', px, py, h, 3.6, 3.6)
  }
  kit.shadow(l.x, l.y, h, l.w - 1, l.d - 1, true, l.ry)
  kit.brick('tree', l.x, l.y, h)
}

/**
 * A roadside produce stand on its ground `l` (#184), facing the Road, the earth `h` up: a timber counter on gravel, bare
 * until it is `on`; then under a tiled roof on posts, crates of produce on the counter and before it, a lantern that
 * lights at dusk, a nobori, a price board and an honesty box on a post; at Stage 3 a second nobori, more crates,
 * pumpkins and a bench.
 */
function produceStand(kit: Kit, l: RowLot, stage: number, h: number, on: boolean) {
  const draw = mulberry32(spot(l.x, l.y) ^ 0x57a4)
  const put = (geo: THREE.BufferGeometry, look: KitLook, lx: number, ly: number, z: number) =>
    kit.put(geo, look, l.x, l.y, l.ry, lx, ly, h + z)
  const at = (lx: number, ly: number) => to(l.x, l.y, l.ry, lx, ly)
  kit.paving(l.x, l.y, h, l.w - 0.4, l.d - 0.4, l.ry, EARTH, PATTERN.setts, 0.02)
  put(kit.cuboid(4.8, 0.12, 1.1), WOOD.pale, 0, 0.2, 0.85)
  put(kit.cuboid(4.8, 0.7, 0.08), WOOD.stand, 0, 0.71, 0.15)
  for (const u of [-2.3, 2.3]) for (const v of [-0.25, 0.65]) put(kit.cuboid(0.1, 0.85, 0.1), WOOD.dark, u, v, 0)
  if (on) {
    for (const u of [-2.6, 2.6]) for (const v of [-0.7, 1.1]) put(kit.cuboid(0.12, 2.5, 0.12), WOOD.dark, u, v, 0)
    const roof = STALL.roofs[Math.floor(draw() * STALL.roofs.length)]
    kit.tiled(kit.gable(5.8, 2.8, 0.7), roof, ...at(0, 0.2), h + 2.5, l.ry + Math.PI / 2, spot(l.x, l.y))
    for (let k = 0; k < (stage === 3 ? 6 : 4); k++)
      put(kit.cuboid(0.7, 0.3, 0.56), HARVEST[Math.floor(draw() * HARVEST.length)], -2 + k * 0.8, 0.2, 0.97)
    put(kit.cuboid(0.3, 0.36, 0.3), kit.lit(CREAM, GLOWS.low), 1.9, 0.9, 1.95)
    kit.pool('stall', ...at(0, 1.1), h, 6.4, 4, l.ry)
  }
  kit.shadow(...at(0, 0.2), h, 6.4, 3.4, false, l.ry)
  kit.brick('building', l.x, l.y, h)
  if (!on) return
  nobori(kit, ...at(-3.1, 1.2), h, l.ry, '#7fbf9d')
  if (stage === 3) nobori(kit, ...at(3.1, -0.9), h, l.ry, '#f6d36a')
  menuBoard(kit, ...at(3, 1.5), l.ry)
  kit.blockZoomProps(() => {
    // The honesty box on its post, a slot in its lid.
    put(kit.cuboid(0.1, 1, 0.1), WOOD.dark, -2.2, 1.5, 0)
    put(kit.cuboid(0.36, 0.3, 0.3), CREAM, -2.2, 1.5, 1)
    put(kit.cuboid(0.2, 0.02, 0.05), WOOD.dark, -2.2, 1.5, 1.3)
    kit.brick('building', ...at(-2.2, 1.5), h)
    if (stage < 3) return
    for (const [k, u] of [-0.9, -0.3, 0.4].entries()) kit.add(SPHERE, '#f0b43c', ...at(u, 1.4 + (k % 2) * 0.3), h, 0, 0.26, 0.2, 0.26)
    kit.brick('building', ...at(-0.3, 1.5), h)
  })
  if (stage === 3) bench(kit, ...at(1.2, -1.5), l.ry + Math.PI, h)
}
