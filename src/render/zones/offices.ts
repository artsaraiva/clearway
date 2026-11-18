import { mulberry32 } from '../../sim/demand'
import { middle, type Bounds, type Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { TAXI } from '../cars'
import { WIND } from '../day'
import { inside } from '../field'
import { boxFace, FACES, LOBBY, spot, to, type OfficeStyle } from '../kit'
import { GROW } from '../landmarks'
import { PATTERN } from '../pattern'
import {
  foodTruck,
  officeScene,
  plazaPiece,
  taxiBay,
  TRUCK_TURNS,
  truckPath,
  truckTurn,
  type OfficeScene,
  type PlazaPiece,
  type TruckEntry,
} from '../props'
import { planter } from '../streets'
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
const STYLES: OfficeStyle[] = ['curtain', 'curtain', 'fins', 'fins', 'stepped', 'round']
// Offices to the level of finish (#177). Each Block's plan is drawn from a stream of its own, so the kit's draws are
// as they were: its scenes, on ground reserved along a Road before any tower is laid, which every tower's plinth keeps
// `clear` m from; its taxi bay; its plaza paving's colour; and a tower's style where its own is a neighbour's. A scene's
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
// the tower's middle past its face and apart, how far a flag flies from its pole (as the kit's `flag` draws it), and
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
 * tower gains floors and finish with each Stage (`FLOORS`, and the kit's `officeTower`), and at Stage 3 its plaza has
 * trees in planters at two corners.
 *
 * To the level of finish (#177), as the Block's plan has it (`OFFICE_FINISH`): before any tower is laid, the Block
 * reserves the ground of its scene along a Road, a sunken court, a sculpture plaza or a food truck's court, which every
 * tower stands back from; and of a second at Stage 3 on a Block of 2,500 m² or more. A taxi bay lies at the kerb, with
 * a taxi in it from Stage 2 and a second at Stage 3. No tower is its neighbour's style. Each tower opens its revolving
 * door on the face toward the Road, stands on a chequered plaza, has a bench either side of it, Close-only, with
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
  const styled: { lot: Bounds; style: OfficeStyle }[] = []
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
    // Its style: its own stream's third draw, after its height's two, as it always was; or, where a tower on a lot beside
    // it already has that style, one of the others by their shares, drawn from the plan.
    const own = mulberry32(seed)
    own()
    own()
    let style = STYLES[Math.floor(own() * STYLES.length)]
    const near = new Set(styled.filter((s) => beside(s.lot, lots[i])).map((s) => s.style))
    const others = STYLES.filter((s) => !near.has(s))
    if (near.has(style) && others.length) style = others[Math.floor(plans() * others.length)]
    styled.push({ lot: lots[i], style })
    // Its door opens on the face whose plaza lies nearest the Block's edge, toward the Road, where its canopy and the step
    // before its door keep off a scene's ground and the taxi bay (#193).
    const entrance = entranceOf(g, tower, taken)
    kit.staged((stage) => {
      const [t, tall] = [kit.range(0, 1), kit.chance(SKYLINE.tall)]
      kit.range(0, 1) // its style's draw, `style` above: still drawn, so that every draw after it stays
      const [low, high] = FLOORS[stage - 1][tall ? 'high' : 'low']
      const floors = Math.round(low + (high - low) * t)
      // The Block's first tower with a flat roof hangs its gondola (#154).
      const gondola = !hung.has(stage) && (style === 'curtain' || style === 'fins')
      if (gondola) hung.add(stage)
      const plate = stage > 1 && (tall || (stage === 3 && floors >= OFFICE_FINISH.plate))
      kit.officeTower(x, y, KERB, w, d, floors, style, stage, { gondola, plate, entrance })
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
 * street trees and what `taken` holds, with a bench by the first, Close-only, on whichever side of it the bench stands
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
    kit.from(1, () => kit.closeOnly(() => kit.bench(seat.x, seat.y, KERB, ry)), spot(x, y) + 2)
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
 * either side of the door a bench, Close-only, from Stage 1 and planters by it from Stage 2, on what `taken` leaves; at
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
    kit.from(1, () => kit.closeOnly(() => kit.bench(p.x, p.y, KERB, fr)), spot(p.x, p.y))
    for (const u of [-2.6, 2.6]) {
      const q = turned(x, y, fr, u, fh + 1.9)
      const box = { ...q, w: 2.2, d: 1, ry: fr, onRoad: false }
      if (!free(box)) continue
      placed.push(box)
      kit.from(2, () => kit.closeOnly(() => planter(kit, q.x, q.y, fr, 1.8)), spot(q.x, q.y))
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
      kit.from(first, () => kit.flag(p.x, p.y, KERB, FLAGS.cloths[Math.floor(colours[k] * FLAGS.cloths.length)]), spot(p.x, p.y))
    })
    return side
  }
  return 0
}
