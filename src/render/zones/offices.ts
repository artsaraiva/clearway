import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { type Bounds, middle, polyline, type Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { PAINTS, TAXI } from '../cars'
import { WIND } from '../day'
import { inside } from '../field'
import { boxFace, CREAM, DECK, FACES, FLAG, type Kit, type Look as KitLook, PLANT, SHAPES, spot, to } from '../kit'
import { GROW } from '../landmarks'
import { panel, PATTERN, wrap } from '../pattern'
import { bedTree, bench, cafeTable, GLOWS, menuBoard, STONE, waiting, WOOD } from '../props'
import { planter, type Footprint } from '../kerbside'
import { corners, fit, lotsOf, near, overlap, PLANTER, runs, stands, turned, type Look, type RowLot, type ZoneGround } from './ground'
import {
  alongEdge,
  beside,
  clearOfKerbside,
  clearOfScenes,
  facesRoad,
  kerbAhead,
  placeScenes,
  sceneOrder,
  smaller,
  type Scene,
} from './scenes'

// Offices: lots at most 30 m on a side, 3.4 m in from the Block's bounding box, each with one tower of at most 20 m on
// a side and at least 8, leaving 3.6 m of the lot open on every side, 1.5 m in from the Block's edge.
const OFFICES = { lot: 30, margin: 3.4, gap: 3.6, least: 8, most: 20, clear: 1.5 }
// One tower in five stands tall above the rest. The storeys a tower stands at each Stage, most towers and the tall ones:
// Stage 2's are #130's.
const SKYLINE = { tall: 0.2 } as const
const FLOORS = [
  { low: [3, 5], high: [5, 7] },
  { low: [6, 9], high: [11, 14] },
  { low: [9, 13], high: [17, 22] },
] as const
const FORMS: OfficeForm[] = ['curtain', 'curtain', 'fins', 'fins', 'stepped', 'round']
// Offices built to the Finish (#177). Each Block's plan is drawn from a stream of its own, so the kit's draws are
// as they were: its scenes, on ground reserved along a Road before any tower is laid, which every tower's plinth keeps
// `clear` m from; its taxi bay; its plaza paving's colour; and a tower's form where its own is a neighbour's. A scene's
// ground is `long` m along the Block's edge and `deep` m in from a line `in` m in from it, or at least `least`, `ends`
// m from its run's ends, where the zebras meet the kerb, and cuts no tower it stands back from under `keep` m across (a
// sculpture plaza down to `smallest` where nothing else fits); a
// Block of `second` m² or more has a second at Stage 3. A taxi bay is `long` m along the kerb, room for two taxis, and
// `deep` m, from `in` m in from the edge, `ends` m from its run's ends at least. Plaza paving reaches up to `plaza` m out
// from a tower's plinth, `edge` m in from the Block's edge, clear of the kerbstone line. At Stage 3 a tower of `plate`
// floors or more carries a lit name plate, as the tall ones do from Stage 2. The pieces a plaza picks from. The taxis
// take the cars' taxi's paints (`TAXI`).
const OFFICE_FINISH = {
  scenes: ['court', 'sculpture', 'truck'] as OfficeScene[],
  ground: { long: 12, deep: 7.5, in: 0.8, least: [8.5, 5.5], smallest: [6, 4.5], keep: 9, ends: 3 } as const,
  clear: 1.4,
  second: 2500,
  taxi: { long: 11, deep: 2.5, in: 0.75, ends: 5 },
  plaza: 4.5,
  edge: 0.9,
  paving: ['#e3ddd2', '#dde0de', '#e6dccc'],
  plate: 12,
  pieces: ['sculpture', 'clock', 'fountain'] as PlazaPiece[],
}
// Flags by an office tower's lobby (#154): the share of towers that fly them from Stage 2 and from Stage 3, m out from
// the tower's middle past its face and apart, how far a flag flies from its pole (as `flag` draws it), and
// their colours.
const FLAGS = {
  share: [0.34, 0.67],
  out: 2.2,
  apart: 2.6,
  fly: 2.3,
  cloths: ['#2fb39a', '#f0b43c', '#5cc0d6', '#a58ad8', '#79c86a', '#ff9ab8', '#fbf8f2'],
}

/** Offices' look (`./index`). */
export const look: Look = { landmarks: true, finish: true, fill: offices }

/**
 * Offices: a glass tower on each large lot with room around it, most of them low, and the odd lot left a grove. A
 * tower gains floors and finish with each Stage (`FLOORS`, and `officeTower`), and at Stage 3 its plaza has
 * trees in planters at two corners.
 *
 * To the Finish (#177), as the Block's plan has it (`OFFICE_FINISH`): before any tower is laid, the Block
 * reserves the ground of its scene along a Road, a sunken court, a sculpture plaza or a food truck's court, which every
 * tower stands back from; and of a second at Stage 3 on a Block of 2,500 m² or more. A taxi bay lies at the kerb, with
 * a taxi in it from Stage 2 and a second at Stage 3. No tower is its neighbour's form. Each tower opens its revolving
 * door on the face toward the Road, stands on a chequered plaza, has a bench either side of it, Block-zoom, with
 * planters by them from Stage 2, and from Stage 2 a sculpture, a clock or a fountain before its lobby; the tall ones,
 * and at Stage 3 the high ones, carry a lit name plate on their crowns.
 */
function offices(g: ZoneGround) {
  const { kit, block } = g
  const centre = middle(block)
  const plans = mulberry32(spot(centre.x, centre.y) ^ 0x0ff1ce) // the plans' own stream: the kit's draws as they did
  const lots = lotsOf(g, OFFICES.margin, OFFICES.lot)
  const bodies = lots.map((lot) => {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [lot.x1 - lot.x0 - 2 * OFFICES.gap, lot.y1 - lot.y0 - 2 * OFFICES.gap].map((side) => Math.min(OFFICES.most, side))
    const fits = fit(g, x, y, w, d, OFFICES.clear, OFFICES.least, 3, 2)
    return fits && { x, y, ...fits }
  })
  // A lot no tower fits, as at a rounded corner, takes the Block's scene, or else is left a grove.
  const open = lots.filter((_, i) => !bodies[i])
  const scenes = sceneGrounds(g, plans, bodies, open)
  const taxi = taxiGround(g, plans, [...scenes.map((s) => s.ground)], bodies)
  const taken = [...scenes.map((s) => s.ground), ...(taxi ? [taxi] : [])]
  const paving = OFFICE_FINISH.paving[Math.floor(plans() * OFFICE_FINISH.paving.length)]
  const hung = new Set<number>() // the Stages built whose gondola the Block has hung: one a Block
  const formsLaid: { lot: Bounds; form: OfficeForm }[] = []
  for (const [i, body] of bodies.entries()) {
    if (!body) continue
    kit.lot(i, lots[i])
    // Each lot draws from the kit's stream as it always has, whatever now stands on it, so that every lot after it keeps
    // its draws: whether it is left to trees, its tower's own stream (or where its tree drew its seed), and the seed of
    // its Stage 3 planters.
    const odd = kit.chance(0.06)
    const seed = (kit.range(0, 1) * 4294967296) >>> 0
    if (odd) {
      if (standBack(body, taken)) grove(g, lots[i], taken) // the odd lot left to trees
      continue
    }
    const planted = (kit.range(0, 1) * 4294967296) >>> 0
    const tower = standBack(body, taken)
    if (!tower) continue
    const { x, y, w, d } = tower
    // Its form: its own stream's third draw, after its height's two, as it always was; or, where a tower on a lot
    // beside it already has that form, one of the others by their shares, drawn from the plan.
    const own = mulberry32(seed)
    own()
    own()
    let form = FORMS[Math.floor(own() * FORMS.length)]
    const near = new Set(formsLaid.filter((s) => beside(s.lot, lots[i])).map((s) => s.form))
    const others = FORMS.filter((s) => !near.has(s))
    if (near.has(form) && others.length) form = others[Math.floor(plans() * others.length)]
    formsLaid.push({ lot: lots[i], form })
    // Its door opens on the face whose plaza lies nearest the Block's edge, toward the Road, where its canopy and the step
    // before its door keep off a scene's ground and the taxi bay (#193).
    const entrance = entranceOf(g, tower, taken)
    kit.staged((stage) => {
      const [t, tall] = [kit.range(0, 1), kit.chance(SKYLINE.tall)]
      kit.range(0, 1) // its form's draw, `form` above: still drawn, so that every draw after it stays
      const [low, high] = FLOORS[stage - 1][tall ? 'high' : 'low']
      const floors = Math.round(low + (high - low) * t)
      // The Block's first tower with a flat roof hangs its gondola (#154).
      const gondola = !hung.has(stage) && (form === 'curtain' || form === 'fins')
      if (gondola) hung.add(stage)
      const plate = stage > 1 && (tall || (stage === 3 && floors >= OFFICE_FINISH.plate))
      officeTower(kit, x, y, KERB, w, d, floors, form, stage, { gondola, plate, entrance }) // glossary-ok: main's name
    }, seed)
    officePlaza(g, tower, entrance, taken, paving, planted, body)
  }
  kit.lot(-1)
  for (const lot of open) if (!scenes.some((s) => inBounds(lot, s.ground))) grove(g, lot, taken)
  for (const { ground: s, kind, from, entry } of scenes) {
    kit.scene(kind, () => {
      kit.staged((stage) => officeScene(kit, kind, s, stage, from), spot(s.x, s.y))
      if (entry) kit.from(from, () => foodTruck(kit, s, entry), spot(s.x, s.y) + 1)
    })
    g.kept.push(s)
  }
  if (taxi) {
    kit.from(1, () => taxiBay(kit, taxi), spot(taxi.x, taxi.y))
    const cars = taxi.w >= OFFICE_FINISH.taxi.long - 0.5 ? [-1, 1] : [0]
    cars.forEach((k, n) => {
      const p = turned(taxi.x, taxi.y, taxi.ry, k * 2.6, 0.08)
      const paint = TAXI.paints[spot(p.x, p.y) % TAXI.paints.length]
      // Facing along the kerb with the pavement on its left, as a car stands at a Japanese kerb.
      kit.from(n ? 3 : 2, () => kit.parked(TAXI, p.x, p.y, KERB + 0.02, taxi.ry + Math.PI / 2, paint), spot(p.x, p.y))
    })
    g.kept.push(taxi)
  }
}

/** A tower's body as laid on its lot: `w` by `d` centred on `(x, y)`. */
interface Body {
  x: number
  y: number
  w: number
  d: number
}

/**
 * Body `b` standing back from all of `taken` (#177): its plinth, 0.8 m out, kept `OFFICE_FINISH.clear` m from each, cut
 * back on whichever side keeps it largest; null if that leaves it under `OFFICES.least` across.
 * ponytail: each of `taken` is stood back from by its bounds east–west and north–south. Ceiling: ground turned along a
 * diagonal run, as on a Curve's or a Roundabout's Blocks, has bounds up to 1.4 times its size each way, so a tower beside
 * it is cut back further than it need be, or left out when that leaves it under `OFFICES.least`. Upgrade: cut by the
 * turned ground's own sides, as `overlap` tests them.
 */
function standBack(b: Body, taken: RowLot[]): Body | null {
  let [x0, y0, x1, y1] = [b.x - b.w / 2, b.y - b.d / 2, b.x + b.w / 2, b.y + b.d / 2]
  let cut = false
  for (const t of taken) {
    const pad = 0.8 + OFFICE_FINISH.clear
    const pts = corners(t, 0)
    const [bx0, by0] = [Math.min(...pts.map((p) => p.x)) - pad, Math.min(...pts.map((p) => p.y)) - pad]
    const [bx1, by1] = [Math.max(...pts.map((p) => p.x)) + pad, Math.max(...pts.map((p) => p.y)) + pad]
    if (bx1 <= x0 || bx0 >= x1 || by1 <= y0 || by0 >= y1) continue
    cut = true
    const cuts: [number, number, number, number][] = [
      [Math.max(x0, bx1), y0, x1, y1],
      [x0, y0, Math.min(x1, bx0), y1],
      [x0, Math.max(y0, by1), x1, y1],
      [x0, y0, x1, Math.min(y1, by0)],
    ]
    ;[x0, y0, x1, y1] = cuts.reduce((a, c) => ((c[2] - c[0]) * (c[3] - c[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? c : a))
  }
  if (!cut) return b
  const [w, d] = [x1 - x0, y1 - y0]
  return Math.min(w, d) < OFFICES.least ? null : { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w, d }
}

/**
 * The ground of an offices Block's scenes (#177), drawn from `draw`, before any tower is laid: one from Stage 2, and a
 * second of another kind at Stage 3 on a Block of 2,500 m² or more, away from the first. Each lies along a straight run
 * of the Block's edge facing a Road (or any, on a Block with none), as long and deep as there is room for, on the Block,
 * clear of the lamps and the street trees, and where every tower of `bodies` that stands back from it keeps
 * `OFFICE_FINISH.ground.keep` m across, or what it had; a food truck's court only where a Road runs past the kerb its
 * truck turns in over, and a kind that finds no ground gives way to another.
 * Where no kind finds ground, a sculpture plaza takes the smallest (#193).
 */
function sceneGrounds(g: ZoneGround, draw: () => number, bodies: (Body | null)[], open: Bounds[]): OfficeGround[] {
  const { ground } = OFFICE_FINISH
  const all = runs(g, ground.in)
  const order = sceneOrder(g, draw, OFFICE_FINISH.scenes, OFFICE_FINISH.second)
  const ok = (kind: OfficeScene, out: OfficeGround[]) => (l: RowLot) => {
    if (!clearOfScenes(out, l)) return false
    // A food truck turns in over the kerb from a Road.
    if (kind === 'truck' && !truckEntry(g, l)) return false
    return bodies.every((b) => {
      if (!b) return true
      const kept = standBack(b, [l])
      return !!kept && Math.min(kept.w, kept.d) >= Math.min(ground.keep, b.w, b.d) - 1e-6
    })
  }
  // A kind that finds no ground gives way to one the Block has not taken, as a food truck's court where no Road runs.
  const room = { lampRoom: 1.2, clear: 0.5, ends: ground.ends }
  const out = placeScenes<OfficeScene, OfficeGround>(order, OFFICE_FINISH.scenes, (kind, out) => {
    const lot =
      inLot(g, open, ok(kind, out)) ?? alongEdge(g, draw, all, smaller([ground.long, ground.deep], ground.least), room, ok(kind, out))
    return lot && { ground: lot, entry: kind === 'truck' ? truckEntry(g, lot) : null }
  })
  if (out.length) return out
  // Where none fits, a sculpture plaza on the least ground it stands on: its sculpture is as tall as on any (#193).
  const least = alongEdge(g, draw, all, [ground.smallest], room, ok('sculpture', out))
  return least ? [{ kind: 'sculpture', ground: least, from: 2, entry: null }] : []
}

/** An offices Block's scene (#177), and for a truck court, where its truck turns in. */
type OfficeGround = Scene<OfficeScene> & { entry: TruckEntry | null }

/**
 * Where the food truck of a truck court on ground `l` turns in from the kerb (#177): the first of `TRUCK_TURNS` where a
 * Road runs past the kerb and its way in keeps clear of the utility poles, the lamps and the street trees; null if none.
 */
function truckEntry(g: ZoneGround, l: RowLot): TruckEntry | null {
  for (const turn of TRUCK_TURNS) {
    const kerb = kerbAhead(g, l, truckTurn(l.w, turn))
    if (kerb === null) continue
    if (clearOfKerbside(g, truckPath(l, { turn, kerb }), [1.5, 1.6, 1.8])) return { turn, kerb }
  }
  return null
}

/** The face of `FACES` whose point out from `(x, y)`, `ax` m east or west or `ay` m north or south, lies nearest the Block's edge. */
function nearestFace({ field }: ZoneGround, x: number, y: number, ax: number, ay: number): number {
  const edge = (k: number) => field.sample(x + FACES[k][0] * ax, y + FACES[k][1] * ay)
  return [1, 2, 3].reduce((best, k) => (edge(k) < edge(best) ? k : best), 0)
}

/**
 * The face of `FACES` tower `t` opens its door on (#177): the nearest the Block's edge (`nearestFace`) whose lobby, from
 * the plinth's face out past the canopy's posts and the step before the door, stands on the Block clear of `taken`
 * (#193); else the nearest whose lobby stands on the Block; else the nearest.
 */
function entranceOf({ field }: ZoneGround, t: Body, taken: RowLot[]): number {
  const edge = (k: number) => field.sample(t.x + FACES[k][0] * (t.w / 2 + 3), t.y + FACES[k][1] * (t.d / 2 + 3))
  const order = [0, 1, 2, 3].sort((a, b) => edge(a) - edge(b))
  const lobby = (k: number): RowLot => {
    const { ry, half } = boxFace(k, t.w, t.d)
    return { ...turned(t.x, t.y, ry, 0, half + 0.8 + 1.15), w: LOBBY.wide + 0.2, d: 2.3, ry, onRoad: false }
  }
  const on = (k: number) => corners(lobby(k), 0).every((p) => field.sample(p.x, p.y) > 0.2)
  const clear = (k: number) => !taken.some((o) => overlap(o, lobby(k), 0))
  return order.find((k) => on(k) && clear(k)) ?? order.find(on) ?? order[0]
}

/** Whether the middle of `l` lies within `b`. */
const inBounds = (b: Bounds, l: Vec) => l.x > b.x0 && l.x < b.x1 && l.y > b.y0 && l.y < b.y1

/**
 * A scene's ground on one of the lots `open` that no tower fits (#177), facing the nearest edge of the Block: as large
 * as stands there, on the Block and clear of the lamps, at the lot's middle or moved in from that edge, and as `ok`
 * has it; null if none fits.
 */
function inLot(g: ZoneGround, open: Bounds[], ok: (l: RowLot) => boolean): RowLot | null {
  for (const lot of open) {
    const [cx, cy] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const { ry } = boxFace(nearestFace(g, cx, cy, 6, 6), 0, 0)
    // Spots over the lot, the middle first: a lot at a rounded corner may have its middle near the Block's edge.
    const steps = [0, -0.15, 0.15, -0.3, 0.3]
    const spots = steps
      .flatMap((u) => steps.map((v) => [cx + u * (lot.x1 - lot.x0), cy + v * (lot.y1 - lot.y0)]))
      .sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
    for (const [w, d] of [
      [14, 10],
      [OFFICE_FINISH.ground.long, OFFICE_FINISH.ground.deep],
      [9, 6],
    ])
      for (const [x, y] of spots) {
        const l = { x, y, w, d, ry, onRoad: false }
        if (stands(g, x, y, w, d, 0.8, ry) && !g.lamps.some((p) => near(l, p.x, p.y, 1.2)) && ok(l)) return l
      }
  }
  return null
}

/**
 * A lot left a grove (#177), the odd one or one that no tower fits and no scene takes: paved as a plaza as far as the
 * Block lets it, and up to three trees in round beds, growing with the Stage, where they stand clear of the lamps, the
 * street trees and what `taken` holds, with a bench by the first, Block-zoom, on whichever side of it the bench stands
 * as clear, and of the other beds.
 */
function grove(g: ZoneGround, lot: Bounds, taken: RowLot[]) {
  const { kit } = g
  const [cx, cy] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
  const paved = fit(g, cx, cy, lot.x1 - lot.x0 + 3, lot.y1 - lot.y0 + 3, OFFICE_FINISH.edge, 6, 1, 8)
  if (paved) kit.from(1, () => kit.paving(cx, cy, KERB, paved.w, paved.d, 0, PLANTER, PATTERN.plaza), spot(cx, cy) + 5)
  const placed = [...taken]
  /** Whether ground `l` is free: on the Block, clear of the lamps and the street trees, and of all placed so far. */
  const free = (l: RowLot, clear: number) =>
    stands(g, l.x, l.y, l.w, l.d, clear, l.ry) && !g.lamps.some((p) => near(l, p.x, p.y, 1.4)) && !placed.some((o) => overlap(o, l))
  const beds: RowLot[] = []
  for (const [u, v] of [
    [0, 0],
    [-0.28, 0.24],
    [0.28, -0.24],
  ]) {
    const [px, py] = [cx + u * (lot.x1 - lot.x0), cy + v * (lot.y1 - lot.y0)]
    const bed = { x: px, y: py, w: 3, d: 3, ry: 0, onRoad: false }
    if (!free(bed, 1)) continue
    beds.push(bed)
    kit.from(
      1,
      () => {
        kit.drum(PLANTER, px, py, KERB, 1.2, 1.2, 0.5)
        kit.brick('building', px, py, KERB)
      },
      spot(px, py),
    )
    kit.staged((stage) => kit.tree(px, py, KERB + 0.5, GROW[stage - 1] * 0.55, 'round'), spot(px, py) + 1)
  }
  if (!beds.length) return
  placed.push(...beds.slice(1))
  const { x, y } = beds[0]
  for (const [ox, oy, ry] of [
    [0, -2.2, Math.PI],
    [0, 2.2, 0],
    [2.2, 0, -Math.PI / 2],
    [-2.2, 0, Math.PI / 2],
  ]) {
    const seat = { x: x + ox, y: y + oy, w: 2.4, d: 1.2, ry, onRoad: false }
    if (!free(seat, 0.6)) continue
    kit.from(1, () => kit.blockZoomProps(() => kit.bench(seat.x, seat.y, KERB, ry)), spot(x, y) + 2)
    break
  }
}

/**
 * The ground of the taxi bay at the kerb of an offices Block (#177), drawn from `draw`: along a straight run facing a
 * Road, long enough for two taxis or else one, clear of the run's ends, where the lamps and the zebras are, of the
 * scenes' ground `scenes` and the street trees, and taking no tower of `bodies` under `OFFICES.least` across; null if
 * none fits.
 */
function taxiGround(g: ZoneGround, draw: () => number, scenes: RowLot[], bodies: (Body | null)[]): RowLot | null {
  const { long, deep, ends } = OFFICE_FINISH.taxi
  const road = runs(g, OFFICE_FINISH.taxi.in).filter(facesRoad)
  return alongEdge(g, draw, road, smaller([long, deep], [5.6, deep]), { lampRoom: 1.6, clear: 0.5, ends }, (l) => {
    return !scenes.some((o) => overlap(o, l, 0)) && bodies.every((b) => !b || !!standBack(b, [l]))
  })
}

/**
 * What stands on tower `t`'s plaza (#177), its door on face `entrance` (of `FACES`), each drawn from where it stands:
 * chequered paving in the Block's `paving` from Stage 1, out to the plinth's reach or the Block's edge; the flags of
 * #154 beside the canopy; from Stage 2 a sculpture, a clock or a fountain on the canopy's other side; and on the faces
 * either side of the door a bench, Block-zoom, from Stage 1 and planters by it from Stage 2, on what `taken` leaves; at
 * Stage 3 trees in planters at two corners, drawn from `planted`, as they always were. Its flags are drawn from `stood`,
 * where its lot's tower stood before any scene, as they always were.
 */
function officePlaza(g: ZoneGround, t: Body, entrance: number, taken: RowLot[], paving: string, planted: number, stood: Vec) {
  const { kit, field, block } = g
  const { x, y, w, d } = t
  // The paving, as far out as the Block lets it, clear of the kerbstone line.
  const on = (pw: number, pd: number) => {
    const [nu, nv] = [Math.ceil(pw / 3), Math.ceil(pd / 3)]
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const [px, py] = [x - pw / 2 + (i * pw) / nu, y - pd / 2 + (j * pd) / nv]
        if (field.sample(px, py) < OFFICE_FINISH.edge || !inside(block.loop, px, py)) return false
      }
    return true
  }
  let [pw, pd] = [w + 1.6 + 2 * OFFICE_FINISH.plaza, d + 1.6 + 2 * OFFICE_FINISH.plaza]
  while (!on(pw, pd) && pw > w + 1.6) [pw, pd] = [pw - 0.5, pd - 0.5]
  if (on(pw, pd)) kit.from(1, () => kit.paving(x, y, KERB, pw, pd, 0, paving, PATTERN.plaza), spot(x, y) + 11)

  const placed: RowLot[] = [...taken]
  /** Whether ground `l` is free: on the Block, clear of the lamps and the street trees, and of all placed so far. */
  const free = (l: RowLot) =>
    stands(g, l.x, l.y, l.w, l.d, 0.7, l.ry) && !g.lamps.some((p) => near(l, p.x, p.y, 1.4)) && !placed.some((o) => overlap(o, l, 0))
  const { ry, half } = boxFace(entrance, w, d)
  // The canopy's ground, which nothing else takes.
  placed.push({ ...turned(x, y, ry, 0, half + 0.8 + LOBBY.canopy / 2), w: LOBBY.wide + 0.6, d: LOBBY.canopy + 0.4, ry, onRoad: false })
  const side = flags(g, x, y, w, d, entrance, free, placed, stood)
  for (const s of side ? [-side] : [1, -1]) {
    const p = turned(x, y, ry, s * (LOBBY.wide / 2 + 2), half + 2.8)
    const l = { ...p, w: 3, d: 3, ry, onRoad: false }
    if (!free(l)) continue
    placed.push(l)
    const kind = OFFICE_FINISH.pieces[spot(p.x, p.y) % OFFICE_FINISH.pieces.length]
    kit.from(2, () => plazaPiece(kit, p.x, p.y, ry, kind), spot(p.x, p.y))
    break
  }
  for (const k of [2, 3, 0, 1]) {
    if (k === entrance || (FACES[k][0] === -FACES[entrance][0] && FACES[k][1] === -FACES[entrance][1])) continue
    const { ry: fr, half: fh } = boxFace(k, w, d)
    const p = turned(x, y, fr, 0, fh + 1.9)
    const seat = { ...p, w: 2.4, d: 1.2, ry: fr, onRoad: false }
    if (!free(seat)) continue
    placed.push(seat)
    kit.from(1, () => kit.blockZoomProps(() => kit.bench(p.x, p.y, KERB, fr)), spot(p.x, p.y))
    for (const u of [-2.6, 2.6]) {
      const q = turned(x, y, fr, u, fh + 1.9)
      const box = { ...q, w: 2.2, d: 1, ry: fr, onRoad: false }
      if (!free(box)) continue
      placed.push(box)
      kit.from(2, () => kit.blockZoomProps(() => planter(kit, q.x, q.y, fr, 1.8)), spot(q.x, q.y))
    }
  }
  kit.from(
    3,
    () => {
      const flip = kit.chance(0.5) ? 1 : -1
      for (const k of [1, -1]) {
        const [px, py] = [x + k * (w / 2 + 2.2), y + k * flip * (d / 2 + 2.2)]
        if (!free({ x: px, y: py, w: 2.2, d: 2.2, ry: 0, onRoad: false })) continue
        kit.add(kit.box(1.9, 0.7, 1.9, 0.3, 0.1), PLANTER, px, py, KERB)
        kit.tree(px, py, KERB + 0.7, kit.range(0.36, 0.44), 'round')
      }
    },
    planted,
  )
}

/**
 * Three flagpoles by the lobby of the tower `w` by `d` at `(x, y)` (#154), drawn from `stood`, where its lot's tower
 * stood before any scene stood it back (#177), as they always were: a third of the towers from Stage 2 and two in three
 * at Stage 3, each flag in a colour of its own, in a row beside the canopy on its door's face `entrance` (#177), on
 * whichever side all three stand on ground `free` has free, or else, as before #177, in a row out from the middle of
 * another face, the one whose pavement lies nearest the Block's edge first; they then take their ground from `placed`.
 * Returns the side of the canopy they stand on (1 or -1, along the face as `to` runs), or 0 for neither.
 */
function flags(
  g: ZoneGround,
  x: number,
  y: number,
  w: number,
  d: number,
  entrance: number,
  free: (l: RowLot) => boolean,
  placed: RowLot[],
  stood: Vec,
): number {
  const { kit } = g
  const draw = mulberry32(spot(stood.x, stood.y + 3))
  const [roll, colours] = [draw(), [draw(), draw(), draw()]]
  const first = roll < FLAGS.share[0] ? 2 : roll < FLAGS.share[1] ? 3 : 0
  if (!first) return 0
  const len = Math.hypot(WIND.x, WIND.y)
  const fly = { x: (WIND.x / len) * FLAGS.fly, y: (WIND.y / len) * FLAGS.fly } // from a pole to its flag's free end
  const room = (p: Vec) =>
    free({ x: p.x, y: p.y, w: 0.8, d: 0.8, ry: 0, onRoad: false }) && stands(g, p.x + fly.x, p.y + fly.y, 0.4, 0.4, 0.2)
  /** Each face's way out (as a front faces) and m from the middle out to where its poles stand. */
  const faceOf = (k: number) => {
    const { ry, half } = boxFace(k, w, d)
    return { ry, out: half + FLAGS.out }
  }
  const { ry, out } = faceOf(entrance)
  const rows: { poles: Vec[]; side: number }[] = [1, -1].map((side) => ({
    poles: [0, 1, 2].map((k) => turned(x, y, ry, side * (LOBBY.wide / 2 + 0.9 + k * FLAGS.apart), out)),
    side,
  }))
  const others = [0, 1, 2, 3].filter((k) => k !== entrance).map(faceOf)
  for (const f of others.sort((a, b) => g.field.sample(...to(x, y, a.ry, 0, a.out)) - g.field.sample(...to(x, y, b.ry, 0, b.out))))
    rows.push({ poles: [-1, 0, 1].map((k) => turned(x, y, f.ry, k * FLAGS.apart, f.out)), side: 0 })
  for (const { poles, side } of rows) {
    if (!poles.every(room)) continue
    poles.forEach((p, k) => {
      placed.push({ x: p.x, y: p.y, w: 1, d: 1, ry: 0, onRoad: false })
      kit.from(first, () => flag(kit, p.x, p.y, KERB, FLAGS.cloths[Math.floor(colours[k] * FLAGS.cloths.length)]), spot(p.x, p.y))
    })
    return side
  }
  return 0
}

// Offices (#177): the scenes an offices Block picks from, each on ground it reserves along the Block's edge, `w` m along
// it and `d` deep, its front facing `ry` toward the Road; the piece on each tower's plaza; and a taxi bay at the kerb.
// Benches and planters are Block-zoom props, as the street's furniture is. Before its Stage a scene's ground is paved,
// with a tree in a round bed, so that no ground stands empty.

/** The scenes an offices Block picks from (#177). */
export type OfficeScene = 'court' | 'sculpture' | 'truck'
/** What stands on an office tower's plaza from Stage 2 (#177). */
export type PlazaPiece = 'sculpture' | 'clock' | 'fountain'

// Colours, beside the stone (`../props`): sculptures in amber, teal, steel, violet or white; a clock's post and face; a
// taxi bay's tarmac, its lines and its sign's pole, board, band and marks; and a food truck's paints, four of the cars'
// (`PAINTS`), never the taxis' yellow.
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
// A truck court's pergola over its tables (#177): m up to its beams and deep at most, its steel, and its lamps' cream.
const PERGOLA = { tall: 2.86, deep: 3, steel: '#9aa3ad', lamp: '#fff1c7' }

/**
 * An offices Block's scene `kind` at Stage `stage` (#177), from Stage `from`, on its `ground`, its front facing the
 * Road: stone paving, and on it the scene, or before `from` a tree in a round bed in its
 * middle and a bench either side of it, Block-zoom.
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
 * A food truck's court at Stage `stage` (#177), on its paving: tables at its back under a pergola, its standing piece
 * whether or not the truck that parks at its front through the middle of the day (`foodTruck`) is there, and a menu
 * board, Block-zoom. Lamps hung under the pergola leave their pools; at Stage 3 a third table, and string lights under
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
  kit.claim('taxi', x, y, w, d, ry)
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

/** A flagpole (#154, #210): how tall it stands, and how far above the road its flag is lowered to for the night (m). */
const FLAGPOLE = { tall: 8.5, low: 3 }

/**
 * A flagpole at `(x, y)`, `h` above the road, flying a flag in `colour` (`../movers`), as one brick that pops in like a
 * tree (#154): a pole and finial in the kit's `FLAG` colours. Pole and flag stand oversized a little, as the props do.
 */
function flag(kit: Kit, x: number, y: number, h: number, colour: string) {
  const { tall, low } = FLAGPOLE
  kit.add(SHAPES.thin, FLAG.pole, x, y, h, 0, 0.09, tall, 0.09)
  kit.add(SHAPES.bead, FLAG.finial, x, y, h + tall + 0.08, 0, 0.16, 0.16, 0.16)
  kit.fly('flag', x, y, h + tall - 0.12, h + low, colour)
  kit.brick('tree', x, y, h)
}

// The office tower: its palette, its plan and its builder, beside the fill that lays it (#207).
const { cylinder: CYLINDER, centred: DISC, pyramid: PYRAMID, sphere: SPHERE, thin: THIN } = SHAPES
const TAU = Math.PI * 2
const [m, q, up] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0)] // for shaping in place
// An office tower's curtain wall is one of these glasses, which the kit's one glass is tinted to, and its frame,
// fins and crown one of these trims.
const OFFICE_GLASS = ['#8fadc0', '#7b9db0', '#8cb5ae', '#5f778c', '#a6bfcb', '#c2b498']
const OFFICE_TRIM = ['#f2f4f6', '#dde3e8', '#e6cfa6', '#c4ccd4', '#68727f']
// Office details (#154): a cooling unit's fans, and an office helipad's grey pad, yellow ring and white H.
const FAN = '#5b6570'
const OFFICE_HELIPAD = { pad: '#68727f', ring: '#f0c75e', mark: '#f4f1ea' }
// Offices built to the Finish (#177): the curtain wall's bay (m); a flat roof's plant in colours of its own, sage
// cooling units, cream vents and a yellow duct, with steel railings and white satellite dishes; a name plate's board,
// one a tower, in a company's colour, with marks for lettering; a revolving door's dark frame; and how brightly each
// lit part glows, for the lamps' glow.
const TOWER_FINISH = {
  bay: 3.2,
  unit: '#a9cdb9',
  vent: '#efe6d2',
  duct: '#f0c75e',
  rail: '#9aa3ad',
  dish: '#f4f6f8',
  frame: '#4a525c',
  boards: ['#2fb39a', '#f0b43c', '#79c86a', '#a58ad8', '#fbf8f2', '#2f3440'],
  lit: { board: 0.33, soffit: 1, fascia: 1.4 },
}
/** An office lobby's canopy over its revolving door (#177): m out from the lobby and along it, and the door's radius. */
const LOBBY = { canopy: 2.6, wide: 4.6, door: 0.95 }
/** A satellite dish's bowl (#177), its rim 0.55 m across, tilted to face -z and up. */
const DISH = new THREE.CylinderGeometry(0.55, 0.3, 0.14, 10).rotateX(-0.9)
/**
 * A window cleaners' cradle (#154): how far down a face it works at most and how far it goes between stops (m), how
 * long it waits under its arms and at each stop on the way down (s, a range from which each stop draws its own), and,
 * as `../movers` draws it, how far out from the face it hangs, and how far along from its middle and in from it its
 * ropes are (m). A lap fits in the working day.
 */
const GONDOLA = { drop: 26, every: 6.4, waits: { top: 5, floor: [1.6, 2.6] }, reach: 0.85, ropes: 2.4, rope: 0.375 }
const ROUND = new THREE.CylinderGeometry(1, 1, 1, 28).translate(0, 0.5, 0) // smoother, for a round tower's glass
/** An office tower: a framed curtain wall, fins up its faces, tiers set back, or round. */
type OfficeForm = 'curtain' | 'fins' | 'stepped' | 'round'

/** A cooling unit `w` by `d` at `(x, y)` on a roof `h` above the road (#154): a box with a fan or two on top. */
function cooler(kit: Kit, x: number, y: number, h: number, w: number, d: number) {
  kit.add(kit.cuboid(w, 1.1, d), TOWER_FINISH.unit, x, y, h)
  const fans = w >= 1.8 * d ? 2 : 1
  const r = Math.min(d, w / fans) * 0.34
  for (let k = 0; k < fans; k++) kit.add(DISC, FAN, x + (fans === 2 ? (k - 0.5) * w * 0.5 : 0), y, h + 1.12, 0, r, 0.04, r)
}

/** A vent on a roof at `(x, y)`, `h` above the road (#154): a stub under a wider cap. */
function vent(kit: Kit, x: number, y: number, h: number) {
  kit.add(THIN, TOWER_FINISH.vent, x, y, h, 0, 0.22, 0.8, 0.22)
  kit.add(THIN, TOWER_FINISH.vent, x, y, h + 0.8, 0, 0.42, 0.18, 0.42)
}

/**
 * An office tower of `floors` storeys on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: a
 * plinth with a lit lobby, then a curtain wall in one glass that pales toward the top where it catches the sky, and a
 * crown. `form` shapes it:
 * - `curtain`: framed by corner posts, under a parapet, a penthouse and sometimes a mast.
 * - `fins`: fins up every face that rise past the roof as its crown, round a penthouse.
 * - `stepped`: tiers set back, each framed and topped by a ledge, under a pointed cap and a spire.
 * - `round`: a drum under a parapet ring, a dome and a spire.
 *
 * At Stage `stage`, whose floors the caller picks: Stage 1 builds the plain body, with no penthouse, spire or dome,
 * one tier, and fewer floors lit at night. Stage 2 builds it as above. Stage 3 puts a spire on every form and a
 * third tier on a stepped one, and lights more floors. Its glass, its trim and how busy it is are drawn before
 * anything a Stage changes, so each Stage builds the same tower, better.
 *
 * Its details (#154), drawn from where it stands so that its own draws are untouched: plant on a flat roof, a
 * couple of vents at Stage 1, cooling units from Stage 2 and more at Stage 3, when a tall tower and one in four of
 * the rest carry a helipad on the penthouse; a white strobe on every spire, and amber lamps blinking on the roof's
 * corners of a tall tower from Stage 2 and of every flat roof at Stage 3. With `more.gondola`, from Stage 2 a
 * flat-roofed tower hangs a window cleaners' cradle on its south or east face, which creeps down it and climbs back.
 *
 * To the Finish (#177): where the kit builds patterned, its curtain wall is surface pattern, a line at
 * every floor and two panes to a bay in three tones paling toward the top, lit floor by floor at night (the
 * pattern's lit mask), round a round tower too; laid floor by floor in the kit's glass otherwise, as before. Its roof
 * wears square pavers and carries its plant in colours of its own, a yellow duct from Stage 2, railings and
 * satellite dishes, and a penthouse wears panels and high windows. With `more.plate`, a name plate lit at night
 * crowns it on all four sides. With `more.entrance`, a revolving door opens on that face (of `FACES`) under a canopy
 * with a lit soffit, steps up to it from the plaza; the lobby's glow leaves a pool before each face, and the canopy
 * a brighter one.
 */
function officeTower(
  kit: Kit,
  x: number,
  y: number,
  h: number,
  w: number,
  d: number,
  floors: number,
  form: OfficeForm,
  stage = 2,
  more: { gondola?: boolean; plate?: boolean; entrance?: number } = {},
) {
  const { gondola = false, plate = false, entrance } = more
  kit.formed(`office ${form}`)
  const STOREY = 3.2
  const SKY = new THREE.Color('#e9f4fb')
  const [foot, trim, busy] = [new THREE.Color(kit.pick(OFFICE_GLASS)), kit.pick(OFFICE_TRIM), kit.rand()]
  const litShare = [0.2 + 0.25 * busy, 0.3 + 0.45 * busy, 0.45 + 0.4 * busy][stage - 1]
  /** Floor `f`'s glass: up to 30% of the way to the sky's colour at the top, and lit at night for `litShare` of the floors. */
  const storey = (f: number): KitLook => ({
    material: kit.glass,
    tint: kit.glassOf(foot.clone().lerp(SKY, (0.3 * f) / Math.max(1, floors - 1))),
    glow: kit.rand() < litShare ? kit.range(0.45, 0.8) : 0.04,
  })
  const base = h + 3.6
  const body = floors * STOREY
  const top = base + body
  const own = mulberry32(spot(x, y))
  own() // once the beacons' beat, which `../movers` now draws: still drawn, so that every draw after it stays
  const [padDraw, south, slide, busier] = [own(), own() < 0.5, own(), own() < 0.6]
  const [board, marks, dishes] = [TOWER_FINISH.boards[Math.floor(own() * TOWER_FINISH.boards.length)], 3 + Math.floor(own() * 3), own()]
  const pad = stage === 3 && (floors >= 17 || padDraw < 0.25)
  const lamps = stage === 3 || (stage === 2 && floors >= 14)
  const seed = spot(x, y) + 17 // which of the pattern's floors light
  /**
   * Glass `bw` by `bd` from `at`, `n` floors from floor `f0` of the tower: a curtain wall of surface pattern in the
   * tower's glass, paled for the floor it starts at, where the kit builds patterned, or a box of the kit's glass a
   * floor.
   */
  const curtain = (bw: number, bd: number, at: number, n: number, f0: number, k = 0) => {
    if (!kit.patterned) {
      for (let f = 0; f < n; f++) kit.add(kit.cuboid(bw, STOREY, bd), storey(f0 + f), x, y, at + f * STOREY)
      return
    }
    const paint = `#${foot
      .clone()
      .lerp(SKY, (0.3 * f0) / Math.max(1, floors - 1))
      .getHexString()}`
    const cladding = {
      front: PATTERN.curtain,
      back: PATTERN.curtain,
      sides: PATTERN.curtain,
      bay: TOWER_FINISH.bay,
      storey: STOREY,
      lit: litShare,
    }
    kit.cladded(kit.cuboid(bw, n * STOREY, bd), paint, x, y, at, 0, cladding, seed + k)
  }
  /**
   * A curved roof, `geo` (a sphere or a cone) at `(x, y)`, `at` high, turned `ry` and scaled, wearing pavers, `around`
   * of them round it and `rise` up it, where the kit builds patterned: a dome or a pointed cap.
   */
  const curved = (geo: THREE.BufferGeometry, at: number, ry: number, sx: number, sy: number, around: number, rise: number) => {
    if (!kit.patterned) return kit.add(geo, trim, x, y, at, ry, sx, sy, sx)
    const g = panel(geo.toNonIndexed(), PATTERN.deck, around, rise, mulberry32(seed + 11)())
    kit.push(g.applyMatrix4(m.compose(new THREE.Vector3(x, at, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(sx, sy, sx))), trim)
  }
  /** Corner posts up a box `pw` by `pd`, from `from` for `tall` m. */
  const posts = (pw: number, pd: number, from: number, tall: number) => {
    for (const i of [-1, 1]) {
      for (const j of [-1, 1]) kit.add(kit.box(1.2, tall, 1.2, 0.36, 0.1), trim, x + i * (pw / 2 - 0.45), y + j * (pd / 2 - 0.45), from)
    }
  }
  /** Fine mullions about 3.2 m apart up the faces of a box `mw` by `md`, between its corners, where no pattern draws them. */
  const mullions = (mw: number, md: number, from: number, tall: number) => {
    if (kit.patterned) return
    for (const [len, across, eastWest] of [
      [mw, md, true],
      [md, mw, false],
    ] as const) {
      const n = Math.max(2, Math.round(len / 3.2))
      for (let i = 1; i < n; i++) {
        const t = -len / 2 + (i * len) / n
        for (const side of [-1, 1]) {
          if (eastWest) kit.add(kit.cuboid(0.16, tall, 0.22), trim, x + t, y + (side * across) / 2, from)
          else kit.add(kit.cuboid(0.22, tall, 0.16), trim, x + (side * across) / 2, y + t, from)
        }
      }
    }
  }
  /** A flat roof `rw` by `rd` at `at`, wearing pavers, with a parapet round its edge if `parapet`. */
  const roof = (rw: number, rd: number, at: number, parapet: boolean) => {
    kit.cladded(kit.cuboid(rw - 0.2, 0.3, rd - 0.2), DECK, x, y, at, 0, { top: PATTERN.deck }, seed + 7)
    if (!parapet) return
    for (const side of [-1, 1]) {
      kit.add(kit.cuboid(rw, 1.3, 0.45), trim, x, y + side * (rd / 2 - 0.22), at)
      kit.add(kit.cuboid(0.45, 1.3, rd - 0.9), trim, x + side * (rw / 2 - 0.22), y, at)
    }
  }
  /** A railing round a box `rw` by `rd` centred on `(cx, cy)` at `at`: posts about 3 m apart under a top rail and a mid rail. */
  const railing = (rw: number, rd: number, at: number, cx = x, cy = y) => {
    for (const side of [-1, 1]) {
      for (const z of [0.5, 0.96]) {
        kit.add(kit.cuboid(rw, 0.06, 0.06), TOWER_FINISH.rail, cx, cy + (side * rd) / 2, at + z)
        kit.add(kit.cuboid(0.06, 0.06, rd), TOWER_FINISH.rail, cx + (side * rw) / 2, cy, at + z)
      }
      for (const [len, eastWest] of [
        [rw, true],
        [rd, false],
      ] as const) {
        const n = Math.max(1, Math.round(len / 3))
        for (let i = 0; i < n; i++) {
          const t = -len / 2 + (i * len) / n
          if (eastWest) kit.add(kit.cuboid(0.06, 1, 0.06), TOWER_FINISH.rail, cx + t, cy + (side * rd) / 2, at)
          else kit.add(kit.cuboid(0.06, 1, 0.06), TOWER_FINISH.rail, cx + (side * rw) / 2, cy - t, at)
        }
      }
    }
  }
  /** A satellite dish on a roof at `(dx, dy)`, `at` high, on a stub, turned to the south. */
  const dish = (dx: number, dy: number, at: number) => {
    kit.add(THIN, TOWER_FINISH.rail, dx, dy, at, 0, 0.07, 0.75, 0.07)
    kit.add(DISH, TOWER_FINISH.dish, dx, dy, at + 0.85, Math.PI)
  }
  /**
   * A penthouse with its own little roof on a roof `rw` by `rd` at `at`, its walls in panels and high windows, and a
   * plant box or two, with a helipad on it if the tower has one, and from Stage 2 a railing round its roof. Returns
   * its top.
   */
  const penthouse = (rw: number, rd: number, at: number) => {
    const [pw, pd] = [rw * 0.5, rd * 0.44]
    const [px, py] = [x - rw * 0.08, y + rd * 0.08]
    const walls = { front: PATTERN.wall, back: PATTERN.wall, sides: PATTERN.wall, storey: 3.4 }
    kit.cladded(kit.box(pw, 3.4, pd, 0.4, 0.12), trim, px, py, at, 0, walls, seed + 3)
    kit.add(kit.box(pw + 0.3, 0.4, pd + 0.3, 0.45, 0.08), DECK, px, py, at + 3.4)
    kit.add(kit.box(rw * 0.18, 1.3, rd * 0.16, 0.2, 0.08), TOWER_FINISH.unit, x + rw * 0.28, y - rd * 0.27, at)
    kit.add(kit.box(rw * 0.12, 1.1, rd * 0.22, 0.2, 0.08), TOWER_FINISH.unit, x - rw * 0.3, y - rd * 0.24, at)
    if (pad) kit.helipad(px, py, at + 3.86, Math.min(pw, pd) / 2 - 0.8, OFFICE_HELIPAD)
    railing(pw + 0.1, pd + 0.1, at + 3.8, px, py)
    return at + 3.8
  }
  /**
   * A spire `tall` m high from `at`, with a white strobe on its tip: off the middle of a helipad tower's roof `rw` by
   * `rd`, onto its back corner.
   */
  const spire = (at: number, tall: number, r: number, rw = 0, rd = 0) => {
    const [sx, sy] = pad && rw ? [x - rw * 0.4, y + rd * 0.4] : [x, y]
    kit.add(CYLINDER, PLANT, sx, sy, at, 0, r, tall, r)
    kit.beacon(sx, sy, at + tall, Math.max(0.42, r * 1.8), 'white')
  }
  /** Amber lamps on the corners of a roof `rw` by `rd`, `at` high, if the tower has them. */
  const corners = (rw: number, rd: number, at: number) => {
    if (!lamps) return
    for (const i of [-1, 1]) for (const j of [-1, 1]) kit.beacon(x + i * (rw / 2 - 0.3), y + j * (rd / 2 - 0.3), at + 0.25, 0.4, 'amber')
  }
  /**
   * Plant on a flat roof `rw` by `rd` at `at`, where no penthouse stands: two vents and a dish at Stage 1, cooling
   * units along its east side, a duct along its south side and a second dish from Stage 2, more at Stage 3.
   */
  const plant = (rw: number, rd: number, at: number) => {
    for (const u of [-0.12, 0.04]) vent(kit, x + rw * u, y - rd * 0.36, at)
    dish(x - rw * 0.41, y + rd * 0.2, at)
    if (stage === 1) return
    const [cw, cd] = [Math.max(1.6, rw * 0.2), Math.max(1.4, rd * 0.18)]
    cooler(kit, x + rw * 0.32, y + rd * 0.28, at, cw, cd)
    if (stage === 3 || busier) cooler(kit, x + rw * 0.32, y + rd * 0.04, at, cw, cd)
    if (stage === 3) cooler(kit, x - rw * 0.12, y + rd * 0.4, at, rw * 0.3, Math.max(1.2, rd * 0.1))
    kit.add(kit.cuboid(rw * 0.56, 0.4, 0.4), TOWER_FINISH.duct, x - rw * 0.06, y - rd * 0.44, at)
    if (dishes < [0, 0.6, 0.9][stage - 1]) dish(x - rw * 0.41, y - rd * 0.02, at)
    if (stage === 3 && dishes < 0.5) dish(x + rw * 0.12, y - rd * 0.22, at)
  }
  /**
   * A name plate lit at night on each face of the crown, `out` m from the middle of a box `bw` by `bd` (or the
   * body's), its foot `z` high: a board in a company's colour, its marks pale and lit on a dark or a coloured board
   * and dark on a pale one.
   */
  const namePlates = (bw: number, bd: number, z: number, out = 0.08) => {
    if (!plate) return
    const mark = kit.markOf(board, true)
    for (let k = 0; k < 4; k++) {
      const { ry, half, len } = boxFace(k, bw, bd)
      const pw = Math.min(len * 0.62, 9)
      kit.local(kit.cuboid(pw, 0.95, 0.14), kit.lit(board, TOWER_FINISH.lit.board), x, y, ry, 0, half + out, z)
      const size = 0.5
      for (let i = 0; i < marks; i++)
        kit.local(kit.cuboid(size, size, 0.04), mark, x, y, ry, (i - (marks - 1) / 2) * size * 1.5, half + out + 0.08, z + 0.22)
    }
  }

  // A plinth, a lit lobby and a band over it.
  kit.add(kit.box(w + 1.6, 0.8, d + 1.6, 1.4, 0.16), trim, x, y, h)
  kit.add(kit.box(w + 0.6, 2.4, d + 0.6, 1.2, 0.08), { material: kit.glass, tint: kit.windows[0] }, x, y, h + 0.8)
  kit.add(kit.box(w + 1.6, 0.4, d + 1.6, 1.4, 0.1), trim, x, y, h + 3.2)
  // Its glow on the plaza before each face, and the revolving door under a canopy on the face toward the Road.
  for (let k = 0; k < 4; k++) {
    const { ry, half, len } = boxFace(k, w, d)
    kit.pool('lobby', ...to(x, y, ry, 0, half + 2), h, len + 2, 2.8, ry)
  }
  if (entrance !== undefined) {
    const { ry, half } = boxFace(entrance, w, d)
    const { canopy, wide, door } = LOBBY
    const out = half + 0.8 // the plinth's face
    kit.local(kit.cuboid(3.4, 0.8, 0.6), trim, x, y, ry, 0, out + 0.3, h) // a landing before the door
    kit.local(kit.cuboid(3.4, 0.4, 0.5), trim, x, y, ry, 0, out + 0.85, h) // and a step up to it
    kit.doorway(x, y, ry, 2 * door, out + 1.1)
    const drum = to(x, y, ry, 0, half + 0.3)
    kit.add(CYLINDER, { material: kit.glass, tint: kit.windows[0], glow: 1.4 }, ...drum, h + 0.8, 0, door, 2.3, door)
    kit.add(CYLINDER, TOWER_FINISH.frame, ...drum, h + 3.05, 0, door + 0.08, 0.16, door + 0.08)
    kit.local(kit.cuboid(0.1, 2.3, 0.1), TOWER_FINISH.frame, x, y, ry, 0, half + 0.3 + door, h + 0.8)
    kit.local(kit.cuboid(wide, 0.22, canopy), trim, x, y, ry, 0, out + canopy / 2 - 0.5, h + 3.24)
    kit.local(
      kit.cuboid(wide - 0.4, 0.04, canopy - 0.5),
      kit.lit(CREAM, TOWER_FINISH.lit.soffit),
      x,
      y,
      ry,
      0,
      out + canopy / 2 - 0.5,
      h + 3.2,
    )
    kit.local(kit.cuboid(wide + 0.02, 0.1, 0.06), kit.lit(CREAM, TOWER_FINISH.lit.fascia), x, y, ry, 0, out + canopy - 0.5, h + 3.3)
    for (const k of [-1, 1]) kit.local(kit.cuboid(0.14, 3.24, 0.14), trim, x, y, ry, k * (wide / 2 - 0.15), out + canopy - 0.65, h)
    kit.pool('canopy', ...to(x, y, ry, 0, out + canopy / 2 + 0.4), h, wide + 2.4, canopy + 2.2, ry)
  }
  if (form === 'round') {
    const r = Math.min(w, d) / 2
    if (kit.patterned) {
      const g = wrap(ROUND.toNonIndexed(), TAU * r, body, TOWER_FINISH.bay, STOREY, litShare, mulberry32(seed)())
      kit.push(
        g.applyMatrix4(m.compose(new THREE.Vector3(x, base, -y), q.identity(), new THREE.Vector3(r, body, r))),
        `#${foot.getHexString()}`,
      )
    } else {
      for (let f = 0; f < floors; f++) kit.add(ROUND, storey(f), x, y, base + f * STOREY, 0, r, STOREY, r)
      const n = Math.max(10, Math.round((TAU * r) / 3.2))
      for (let i = 0; i < n; i++)
        kit.add(kit.cuboid(0.2, body, 0.2), trim, x + Math.cos((i * TAU) / n) * r, y + Math.sin((i * TAU) / n) * r, base)
    }
    kit.add(ROUND, trim, x, y, top, 0, r + 0.3, 1.4, r + 0.3)
    namePlates(2 * r + 0.6, 2 * r + 0.6, top + 0.22)
    if (stage === 1) {
      kit.add(ROUND, DECK, x, y, top + 0.2, 0, r - 0.2, 1, r - 0.2)
      for (const u of [-0.2, 0.15]) vent(kit, x + r * u, y - r * 0.35, top + 1.2)
      dish(x - r * 0.4, y + r * 0.2, top + 1.2)
    } else {
      curved(SPHERE, top + 1.4, 0, r * 0.78, r * 0.52, 16, 10)
      spire(top + 1.4 + r * 0.5, stage === 3 ? kit.range(9, 13) : kit.range(4, 6), 0.3)
    }
  } else if (form === 'stepped') {
    // Each tier takes its share of the floors and stands 70% the size of the one below.
    const shares = stage === 1 ? [1] : stage === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2]
    let [tw, td, at, left] = [w, d, base, floors]
    shares.forEach((share, i) => {
      const n = i === shares.length - 1 ? left : Math.max(1, Math.round(floors * share))
      curtain(tw - 0.2, td - 0.2, at, n, floors - left, i)
      left -= n
      posts(tw, td, at, n * STOREY)
      mullions(tw - 0.2, td - 0.2, at, n * STOREY)
      at += n * STOREY
      if (i === shares.length - 1) namePlates(tw, td, at - 1.3, 0.02)
      kit.add(kit.box(tw + 0.4, 0.7, td + 0.4, 1.3, 0.12), trim, x, y, at)
      at += 0.7
      if (i < shares.length - 1) {
        railing(tw + 0.2, td + 0.2, at)
        ;[tw, td] = [tw * 0.7, td * 0.7]
      }
    })
    const r = Math.min(tw, td) * 0.707
    const cap = stage === 1 ? Math.min(3.5, Math.min(tw, td) * 0.4) : Math.min(7, Math.min(tw, td) * 0.78)
    curved(PYRAMID, at, Math.PI / 4, r, cap, 4 * Math.max(2, Math.round(r)), Math.max(2, Math.round(cap / 0.9)))
    if (stage > 1) spire(at + cap - 0.4, stage === 3 ? kit.range(8, 12) : kit.range(5, 9), 0.24)
  } else if (form === 'fins') {
    curtain(w - 0.7, d - 0.7, base, floors, 0)
    for (const [len, across, eastWest] of [
      [w, d, true],
      [d, w, false],
    ] as const) {
      const n = Math.max(3, Math.round(len / 2.4))
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + 0.4 + (i * (len - 0.8)) / (n - 1)
        for (const side of [-1, 1]) {
          if (eastWest) kit.add(kit.cuboid(0.36, body + 2.6, 0.8), trim, x + t, y + side * (across / 2 - 0.4), base)
          else kit.add(kit.cuboid(0.8, body + 2.6, 0.36), trim, x + side * (across / 2 - 0.4), y + t, base)
        }
      }
    }
    roof(w - 0.7, d - 0.7, top, false)
    railing(w - 2.2, d - 2.2, top + 0.3)
    plant(w - 2, d - 2, top + 0.3)
    corners(w, d, top + 2.6)
    namePlates(w, d, top + 1.3)
    if (stage > 1) {
      const crown = penthouse(w - 2, d - 2, top + 0.3)
      if (stage === 3 || floors >= 14) spire(pad ? top + 0.3 : crown, stage === 3 ? kit.range(7, 11) : kit.range(5, 8), 0.3, w - 2, d - 2)
    }
  } else {
    curtain(w - 0.2, d - 0.2, base, floors, 0)
    posts(w, d, base, body)
    mullions(w - 0.2, d - 0.2, base, body)
    roof(w, d, top, true)
    plant(w - 1, d - 1, top + 0.3)
    corners(w, d, top + 1.3)
    namePlates(w, d, top + 0.2)
    if (stage > 1) {
      const crown = penthouse(w, d, top + 0.3)
      if (stage === 3 || floors >= 14 || kit.rand() < 0.4)
        spire(pad ? top + 0.3 : crown, stage === 3 ? kit.range(7, 11) : kit.range(5, 9), 0.18, w - 1, d - 1)
    }
  }
  if (gondola && stage > 1 && (form === 'curtain' || form === 'fins')) {
    // A cradle on the south or east face, hanging from two arms over the roof's edge, that works down the face a
    // couple of floors at a time, stopping at each to clean, and climbs back to wait under the arms.
    const { drop, every, waits } = GONDOLA
    const [len, across] = south ? [w, d] : [d, w]
    const out = across / 2 + GONDOLA.reach
    const heading = south ? -Math.PI / 2 : 0
    const [fx, fy] = south ? [x, y - out] : [x + out, y]
    const u = (slide * 2 - 1) * Math.max(0, len / 2 - 3.4)
    const [high, low] = [top - h - 2.1, base - h + 1.2]
    const fall = Math.min(drop, high - low)
    const stops = [0]
    for (let s = every; s < fall - 0.5; s += every) stops.push(s)
    stops.push(fall)
    const loop = polyline([
      { x: u, y: high },
      { x: u, y: high - fall },
      { x: u, y: high },
    ])
    const wait = stops.map((_, i) => (i === 0 ? waits.top : waits.floor[0] + own() * (waits.floor[1] - waits.floor[0])))
    // Each arm stands on the roof a little in from the face and reaches out over the cradle's rope at its end.
    const arm = top + 2.4
    const at = (along: number, o: number) => (south ? [x - along, y - o] : [x + o, y - along]) as [number, number]
    const [o0, o1] = [across / 2 - 0.9, out - GONDOLA.rope + 0.15]
    for (const k of [-1, 1]) {
      kit.add(kit.cuboid(0.3, 2.6, 0.3), PLANT, ...at(u + k * GONDOLA.ropes, o0), top)
      kit.add(
        kit.cuboid(0.26, 0.26, o1 - o0 + 0.15),
        PLANT,
        ...at(u + k * GONDOLA.ropes, (o0 + o1) / 2),
        arm - 0.2,
        south ? 0 : Math.PI / 2,
      )
    }
    kit.mover('gondola', loop, stops, 0, h, { waits: wait, face: { x: fx, y: fy, heading }, hang: arm - h, laps: true })
  }
  kit.shadow(x, y, h, w * 1.4 + 2.4, d * 1.4 + 2.4, form === 'round')
  kit.brick('building', x, y, h)
}
