import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Bounds } from '../../sim/geometry'
import { KERB } from '../blocks'
import { type Kit, type Look as KitLook, PLANT, SHAPES, spot, to } from '../kit'
import { TROLLEY } from '../movers'
import { PATTERN } from '../pattern'
import { corners, fit, lotsOf, near, overlap, runs, stands, turned, type Look, type RowLot, type Run, type ZoneGround } from './ground'
import { alongEdge, clearOfKerbside, clearOfScenes, placeScenes, sceneOrder, smaller, type Scene } from './scenes'
import { sawtooth } from '../shapes'

// Industrial: lots at most 34 m on a side, 3.2 m in from the Block's bounding box, the largest built first, each with
// a shed over all but 2.5 m of the lot on every side, 1.5 m in from the Block's edge and at least 9 m across. On some
// Blocks the first shed has a chimney.
const SHEDS = { lot: 34, margin: 3.2, gap: 2.5, clear: 1.5, least: 9, chimney: 0.45 }
// Industrial details (#150), each drawn from where it stands so that nothing else on the Block draws differently. A
// shed's doors face the long side with more room before it, and the shed stands back from that side as far as it must,
// up to `back` m and keeping at least `least` m deep, to leave a loading yard `deep` m deep before its doors.
const YARD = { deep: 12, back: 6, least: 10 }
// A truck backed up to a door: m long and wide (as `../movers` draws it), how far it pulls away at most and at least, how
// long it waits at the door and pulled away (s, a range from which each truck draws its own), and the paints it takes.
const TRUCKS = {
  long: 6.5,
  wide: 2.4,
  pull: [6, 3],
  dock: [24, 48],
  away: [8, 16],
  paints: ['#ffffff', '#e9eef2', '#fbe3a2', '#c0e9e0', '#d6e4d3'],
} as const
// A forklift shuttling between a door and a stack of pallets along the wall: m out from the wall it stands, the radius
// of its turns, how far its rear reaches behind its middle (as `../movers` draws it), how far out from the wall its stack
// stands and how far along the wall it may (the nearest that fits, so that a door beyond keeps room for a truck), and
// how long it waits (s) at the door or the stack (a range from which each forklift draws its own) and where it turns.
const FORKLIFT = { out: 3.2, turn: 1.8, rear: 1.9, stack: 0.95, apart: [3.4, 4.2, 5], lift: [1.6, 3.6], cusp: 0.4 }
// Containers along a shed's back and ends: m from the wall, the share of spots filled from Stage 2 and from Stage 3,
// and the share of them that a second container tops at Stage 3.
const CONTAINERS = { gap: 0.35, fill: [0.3, 0.65], double: 0.45 }
// Pallets' wood and the goods on them, cartons and shrink-wrap; and the paint marking a truck's bay (#150).
const PALLET = { wood: '#c49a6c', goods: ['#d8b98b', '#f4f1ea', '#d8b98b', '#e9eef2'] }
const BAY = '#f0c75e'

// Industrial built to the Finish (#181). Each Block's scenes are drawn from a stream of their own, so the kit's draws
// are as they were: one of `scenes` from Stage 2 and a second at Stage 3 on a Block of `second` m² or more, on ground
// along the Block's edge `in` m in from it, `clear` m on the Block, `ends` m from its run's ends, `lampRoom` m from the
// lamps and `poleRoom` from the utility poles, and `shedRoom` m clear of every shed and off every yard; each kind as
// long and deep as fits, down to its least (`sizes`).
type IndustrialScene = 'crane' | 'tanks' | 'rack'
const INDUSTRIAL_FINISH = {
  scenes: ['crane', 'tanks', 'rack'] as IndustrialScene[],
  second: 2500,
  ground: { in: 0.8, clear: 0.5, ends: 1.5, lampRoom: 1.2, poleRoom: 0.8, shedRoom: 0.6 },
  sizes: {
    crane: smaller([14, 4.6], [8, 4.4]),
    tanks: smaller([12, 4.4], [7, 3.9]),
    rack: smaller([16, 3.2], [9, 2.8]),
  } as Record<IndustrialScene, (readonly [number, number])[]>,
}
// A yard's ground (#181): tarmac darker than the pavement over all of it, kept `FENCE.in` m and a little in from the
// Block's edge where it meets the fence, and a line along its far edge; from Stage 2 a walkway along the door wall
// `walk` m out and hazard stripes before each door `hazard` m deep; the lines painted `line`, the stripes in the bays' paint.
const YARD_GROUND = { tarmac: '#a9a59e', line: '#f4f1ea', walk: 1.3, hazard: 0.55 }
// A fence along the Block's edge where it faces a Road (#181), `in` m in from it, behind the walkers on the pavement
// (`../walkers`' `INSET`, 1.6 m): mesh panels `tall` m tall between posts
// about `bay` m apart, in its paint with darker posts, broken where anything stands and `poles`, `lamps` and `trees` m
// from the kerbside's; no stretch under `least` m. Where it breaks for what stands in a yard (a truck's way out), a
// gate: taller posts, and its leaf slid open behind the fence beside it, `leaf` m long at most.
const FENCE = {
  in: 2.5,
  tall: 1.75,
  bay: 2.5,
  paint: '#7d9188',
  post: '#5c6b66',
  poles: 0.6,
  lamps: 0.9,
  trees: 1.2,
  least: 2,
  leaf: 7,
  step: 0.5,
}
// What stands in a yard (#181): a cluster of drums by the wall from Stage 1, in `drums`; a skip from Stage 2 in one of
// `skips` with its load; and a floodlight mast `mast` m tall at the yard's far corner from Stage 2, a second at
// Stage 3, its lamps glowing `glow` as bright as a lamp and leaving a pool over the yard. All keep `inside` m on the
// Block, so inside its fence.
const YARD_PIECES = {
  drums: ['#5aa69b', '#e8b84a', '#4a525c', '#d09c53'],
  skips: ['#5aa69b', '#d09c53', '#e8b84a'],
  load: '#8a7d6d',
  mast: 7.2,
  steel: '#6f7986',
  light: '#fff1d6',
  glow: 1.4,
  inside: 3.1,
}

/**
 * A shed as `industrial` lays it (#150): its footprint `w` (east–west) by `d` centred on `(x, y)`, the way its long
 * side runs (`ry`, 0 east–west), the long side its doors face (`side`, as `warehouse` takes it), and how
 * long it is along that side and how deep across it.
 */
interface Shed {
  x: number
  y: number
  w: number
  d: number
  ry: number
  side: number
  len: number
  wid: number
}

/** Where the point `u` m along shed `s`'s door wall from its middle and `o` m out from that wall lies on the map. */
const onShed = (s: Shed, u: number, o: number) => turned(s.x, s.y, s.ry, u, s.side * (s.wid / 2 + o))

/** The ground from `u0` to `u1` along shed `s`'s door wall and from `o0` to `o1` out from it, as a row lot. */
function yardLot(s: Shed, u0: number, u1: number, o0: number, o1: number): RowLot {
  const c = onShed(s, (u0 + u1) / 2, (o0 + o1) / 2)
  return { x: c.x, y: c.y, w: u1 - u0, d: o1 - o0, ry: s.ry, onRoad: false }
}

/** Where a shed stands as a row lot: its whole footprint, unturned. */
const footprint = (s: Shed): RowLot => ({ x: s.x, y: s.y, w: s.w, d: s.d, ry: 0, onRoad: false })

/**
 * Whether every point along the outline of `l`, about every 3 m, lies on the Block `clear` m in from its edge: `stands`
 * without its street trees, which a yard's tarmac runs under.
 */
function onBlock({ field }: ZoneGround, l: RowLot, clear: number): boolean {
  const c = corners(l, 0)
  return c.every((a, i) => {
    const b = c[(i + 1) % c.length]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3))
    for (let k = 0; k < n; k++) if (field.sample(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n) < clear) return false
    return true
  })
}

/**
 * Shed `s`'s yard (#181): the ground before its doors along its whole length, as deep as a yard is (`YARD.deep`) or as
 * far as it stays inside the fence and off every other shed of `sheds`; null if that is under 3 m.
 */
function yardOf(g: ZoneGround, s: Shed, sheds: Shed[]): RowLot | null {
  for (let deep = YARD.deep; deep >= 3; deep -= 0.5) {
    const l = yardLot(s, -s.len / 2, s.len / 2, 0, deep)
    if (onBlock(g, l, FENCE.in + 0.3) && !sheds.some((o) => o !== s && overlap(footprint(o), l))) return l
  }
  return null
}

/** Industrial's look (`./index`). */
export const look: Look = { landmarks: false, finish: true, fill: industrial }

/**
 * Industrial: wide, low sheds with sawtooth roofs on big lots with yards between them, and now and then a chimney, each
 * with the size and finish its Stage gives it (`warehouse`). Each shed's doors open onto a loading yard
 * (#150), where trucks back up to the doors and a forklift shuttles to a stack of pallets, and containers stand along
 * its other walls (`loadingYard`). With the Stage:
 * - Stage 1: a stack of pallets by a door.
 * - Stage 2: a truck at a door in its painted bay, a forklift at work, containers along some walls, a lamp over each
 *   door, and smoke from the chimney.
 * - Stage 3: a second truck, more containers and some stacked two high, and a third layer on the pallets.
 */
function industrial(g: ZoneGround) {
  const { kit, field } = g
  let chimney = kit.chance(SHEDS.chimney)
  const area = (l: Bounds) => (l.x1 - l.x0) * (l.y1 - l.y0)
  const lots = lotsOf(g, SHEDS.margin, SHEDS.lot).sort((a, b) => area(b) - area(a))
  // Every shed's whole footprint first, so that each can see the room its neighbours leave before it.
  const whole = lots.map((lot): RowLot | null => {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const shed = fit(g, x, y, lot.x1 - lot.x0 - 2 * SHEDS.gap, lot.y1 - lot.y0 - 2 * SHEDS.gap, SHEDS.clear, SHEDS.least, 3, 3)
    return shed && { x, y, w: shed.w, d: shed.d, ry: 0, onRoad: false }
  })
  /**
   * How far out from `(x, y)` along `(dx, dy)` the ground stays open, up to a yard's depth and a little: on the Block a
   * metre in from its edge, and off every shed but `self`.
   */
  const room = (self: RowLot, x: number, y: number, dx: number, dy: number) => {
    let r = 0
    for (; r < YARD.deep + 2; r += 0.5) {
      const [px, py] = [x + dx * r, y + dy * r]
      if (field.sample(px, py) < 1 || whole.some((o) => o && o !== self && near(o, px, py, 0))) break
    }
    return r
  }
  /** The ground taken on the Block so far: the lamps at its corners, the sheds and their yards' details. */
  const taken: RowLot[] = g.lamps.map(({ x, y }) => ({ x, y, w: 1.4, d: 1.4, ry: 0, onRoad: false }))
  const laid: { shed: Shed; lot: number }[] = []
  for (const [i, f] of whole.entries()) {
    if (!f) continue
    const along = f.w >= f.d
    const [len, wid, ry] = along ? [f.w, f.d, 0] : [f.d, f.w, Math.PI / 2]
    // Its doors face the long side with more room before it, by the least of three looks out from the wall.
    const ahead = [1, -1].map((side) => {
      const out = turned(0, 0, ry, 0, side)
      const looks = [-0.3, 0, 0.3].map((t) => turned(f.x, f.y, ry, t * len, (side * wid) / 2))
      return Math.min(...looks.map((p) => room(f, p.x, p.y, out.x, out.y)))
    })
    const side = Math.abs(ahead[0] - ahead[1]) > 0.5 ? (ahead[0] > ahead[1] ? 1 : -1) : mulberry32(spot(f.x, f.y))() < 0.5 ? 1 : -1
    const back = Math.max(0, Math.min(YARD.back, wid - YARD.least, YARD.deep - Math.max(...ahead)))
    const c = turned(f.x, f.y, ry, 0, (-side * back) / 2)
    const shed = { x: c.x, y: c.y, w: along ? f.w : f.w - back, d: along ? f.d - back : f.d, ry, side, len, wid: wid - back }
    laid.push({ shed, lot: i })
    taken.push(footprint(shed))
    kit.stand(shed.x, shed.y, shed.w, shed.d)
    kit.lot(i, f)
    const first = chimney
    kit.staged((stage) => warehouse(kit, shed.x, shed.y, KERB, shed.w, shed.d, first, side, stage))
    chimney = false
  }
  // Each shed's yard, and the Block's scenes on ground left along its edge (#181), on a stream of their own.
  const sheds = laid.map((l) => l.shed)
  const yards = sheds.map((s) => yardOf(g, s, sheds))
  const centre = middle(g.block)
  kit.lot(-1)
  for (const { kind, ground: l, from } of sceneGrounds(g, mulberry32(spot(centre.x, centre.y) ^ 0x1d57), sheds, yards)) {
    taken.push(l)
    kit.stand(l.x, l.y, l.w, l.d, l.ry, from)
    kit.scene(kind, () => kit.staged((stage) => stage >= from && SCENES[kind](kit, l, stage), spot(l.x, l.y)))
  }
  // Then each yard, on its shed's lot, once every shed and scene has taken its ground.
  for (const [k, { shed, lot }] of laid.entries()) {
    kit.lot(lot)
    loadingYard(g, shed, taken, yards[k])
  }
  kit.lot(-1)
  fence(g, yards)
}

/**
 * The ground of an industrial Block's scenes (#181), drawn from `draw`, once its sheds have their ground and before
 * their yards are laid: one from Stage 2, and a second of another kind at Stage 3 on a Block of 2,500 m² or more,
 * away from the first. Each lies along a straight run of the Block's edge facing a Road (or any, on a Block with none),
 * as long and deep as there is room for between the edge and the sheds, clear of every shed and off every yard of
 * `yards`, the lamps, the utility poles and the street trees; a kind that finds no ground gives way to another.
 */
function sceneGrounds(g: ZoneGround, draw: () => number, sheds: Shed[], yards: (RowLot | null)[]): Scene<IndustrialScene>[] {
  const { scenes: kinds, second, ground, sizes } = INDUSTRIAL_FINISH
  const all = runs(g, ground.in)
  const blocked = [
    ...sheds.map((s) => ({ ...footprint(s), w: s.w + 2 * ground.shedRoom, d: s.d + 2 * ground.shedRoom })),
    ...yards.filter((y) => y !== null),
  ]
  const ok = (out: Scene<IndustrialScene>[]) => (l: RowLot) =>
    clearOfScenes(out, l) && !blocked.some((b) => overlap(b, l)) && g.poles.every((p) => !near(l, p.x, p.y, ground.poleRoom))
  const room = { lampRoom: ground.lampRoom, clear: ground.clear, ends: ground.ends, slide: true }
  return placeScenes<IndustrialScene, Scene<IndustrialScene>>(sceneOrder(g, draw, kinds, second), kinds, (kind, out) => {
    const l = alongEdge(g, draw, all, sizes[kind], room, ok(out))
    return l && { ground: l }
  })
}

/**
 * The details of shed `shed`'s yard (#150), each drawn from where it stands and laid where its ground is clear of
 * everything `taken`, which it then takes: a truck backed up to the first door with room for its bay, a forklift at the
 * next door with room to work, a second truck at a door left over, and containers along the shed's back and ends. To
 * the Finish (#181), over the yard's ground `yard` (`yardOf`): its tarmac, walkway, edge line and hazard stripes
 * (`yardGround`), and drums, a skip and floodlights where there is room (`yardPieces`).
 */
function loadingYard(g: ZoneGround, shed: Shed, taken: RowLot[], yard: RowLot | null) {
  const { kit } = g
  /**
   * Take `lot` for what stands there from Stage `from` if it stands on the Block `clear` m in from its edge, clear of
   * everything taken and unclaimed, and claim it (#181): whether it did.
   */
  const claim = (lot: RowLot, clear: number, from: number) => {
    if (!stands(g, lot.x, lot.y, lot.w, lot.d, clear, lot.ry) || taken.some((o) => overlap(o, lot))) return false
    if (!kit.unclaimed(lot.x, lot.y, lot.w, lot.d, lot.ry)) return false
    taken.push(lot)
    kit.stand(lot.x, lot.y, lot.w, lot.d, lot.ry, from)
    return true
  }
  /**
   * A truck backed up to the door `u` m along the wall from Stage `stage`, in a bay painted from Stage 2, where it has
   * room to pull away: whether one is. Each truck waits its own while at the door and pulled away.
   */
  const truck = (u: number, stage: number) => {
    const { long, wide, pull } = TRUCKS
    const dock = 0.3 + long / 2 // its middle, backed up to the door
    for (let p = pull[0]; p >= pull[1]; p -= 0.5) {
      if (!claim(yardLot(shed, u - wide / 2 - 0.4, u + wide / 2 + 0.4, 0, dock + p + long / 2 + 0.3), 1, stage)) continue
      const [at, away] = [onShed(shed, u, dock), onShed(shed, u, dock + p)]
      const draw = mulberry32(spot(at.x, at.y))
      const waits = [TRUCKS.dock, TRUCKS.away].map(([lo, hi]) => lo + draw() * (hi - lo))
      const paint = TRUCKS.paints[Math.floor(draw() * TRUCKS.paints.length)]
      const drive = { waits, reverse: [false, true], paint }
      // The bay runs from the wall a little past the truck's nose; the truck pulls away out of it.
      kit.from(2, () => bay(kit, at.x, at.y, KERB, shed.ry, 2 * dock, wide + 0.9), spot(at.x, at.y + 1))
      kit.from(stage, () => kit.mover('truck', polyline([at, away, at]), [0, p], 0, KERB, drive), spot(at.x, at.y))
      return true
    }
    return false
  }
  /**
   * A forklift from Stage 2 at the door `u` m along the wall, shuttling to a stack of pallets along the wall where it
   * has room to work: whether one is. It backs out of the door turning away from the stack, drives on along the wall
   * and turns into the stack, then does the same back.
   */
  const forklift = (u: number) => {
    const { out, turn: r, rear, stack: o } = FORKLIFT
    const door = onShed(shed, u, out)
    const draw = mulberry32(spot(door.x, door.y))
    const dirs = draw() < 0.5 ? [1, -1] : [-1, 1]
    for (const apart of FORKLIFT.apart) {
      for (const dir of dirs) {
        const s = u + dir * apart
        if (Math.abs(s) > shed.len / 2 - 1 || shedDoors(shed.w, shed.d).some((d) => d !== u && Math.abs(d - s) < 2.6)) continue
        // Where it turns it lies along the wall, its rear past the turn.
        if (!claim(yardLot(shed, Math.min(u, s) - r - rear, Math.max(u, s) + r + rear, 0, out + r + 1.4), 0.8, 1)) continue
        const pts: { u: number; o: number }[] = [{ u, o: out }]
        const ends = [0]
        /** A quarter turn about `(cu, out)`, from angle `from` to `to`, its `u` mirrored for `dir`, ending at a stop. */
        const quarter = (cu: number, from: number, to: number) => {
          for (let k = 1; k <= 6; k++) {
            const a = from + ((to - from) * k) / 6
            pts.push({ u: cu + dir * r * Math.cos(a), o: out + r * Math.sin(a) })
          }
          ends.push(pts.length - 1)
        }
        quarter(u - dir * r, 0, Math.PI / 2) // backing out of the door
        quarter(s - dir * r, Math.PI / 2, 0) // on along the wall and into the stack
        quarter(s + dir * r, Math.PI, Math.PI / 2) // backing out of the stack
        quarter(u + dir * r, Math.PI / 2, Math.PI) // back along the wall and into the door
        const loop = polyline(pts.map((p) => onShed(shed, p.u, p.o)))
        const stops = ends.slice(0, 4).map((i) => loop.cum[i])
        const { lift, cusp } = FORKLIFT
        const waits = [0, 1, 2, 3].map((k) => (k % 2 ? cusp : lift[0] + draw() * (lift[1] - lift[0])))
        const [drive, stack] = [{ waits, reverse: [true, false, true, false] }, onShed(shed, s, o)]
        kit.from(2, () => kit.mover('forklift', loop, stops, 0, KERB, drive), spot(door.x, door.y))
        kit.from(1, () => pallets(kit, stack.x, stack.y, KERB, shed.ry, 2), spot(stack.x, stack.y))
        kit.from(3, () => pallets(kit, stack.x, stack.y, KERB, shed.ry, 3, 2), spot(stack.x, stack.y + 1))
        return true
      }
    }
    return false
  }
  const doors = shedDoors(shed.w, shed.d)
  const take = (fits: (u: number) => boolean) => {
    const i = doors.findIndex(fits)
    if (i >= 0) doors.splice(i, 1)
  }
  take((u) => truck(u, 2))
  take(forklift)
  take((u) => truck(u, 3))
  // Containers lying along the back and the ends, a spot to every container's length and a little.
  const { long, wide } = CONTAINER
  const { gap, fill, double } = CONTAINERS
  const along = (len: number) => {
    const n = Math.floor(len / (long + 0.7))
    return Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * (long + 0.7))
  }
  const spots = [
    ...along(shed.len).map((u) => ({ p: onShed(shed, u, -shed.wid - gap - wide / 2), ry: shed.ry })),
    ...[-1, 1].flatMap((end) =>
      along(shed.wid + 2).map((o) => ({
        p: onShed(shed, end * (shed.len / 2 + gap + wide / 2), o - shed.wid / 2),
        ry: shed.ry + Math.PI / 2,
      })),
    ),
  ]
  for (const { p, ry } of spots) {
    const draw = mulberry32(spot(p.x, p.y))
    const [roll, two] = [draw(), draw() < double]
    const first = roll < fill[0] ? 2 : roll < fill[1] ? 3 : 0
    if (!first || !claim({ x: p.x, y: p.y, w: long + 0.3, d: wide + 0.3, ry, onRoad: false }, 0.6, first)) continue
    kit.from(first, () => containers(kit, p.x, p.y, KERB, ry, 1), spot(p.x, p.y))
    if (two) kit.from(3, () => containers(kit, p.x, p.y, KERB, ry, 2, 1), spot(p.x + 1, p.y))
  }
  if (!yard) return
  yardGround(kit, shed, yard)
  yardPieces(g, shed, yard, claim)
}

/**
 * A yard's ground (#181) before shed `shed`'s doors, over `yard`: tarmac and a line along its far edge from Stage 1,
 * and from Stage 2 a walkway line along the door wall broken at each door and hazard stripes before each door, as the
 * shed lays its doors from Stage 2 (`shedDoors`).
 */
function yardGround(kit: Kit, shed: Shed, yard: RowLot) {
  const { tarmac, line, walk, hazard } = YARD_GROUND
  const deep = yard.d
  kit.from(1, () => kit.paving(yard.x, yard.y, KERB, yard.w, deep, yard.ry, tarmac, PATTERN.tarmac), spot(yard.x, yard.y) + 3)
  // The line along its far edge, from Stage 1.
  const edge = onShed(shed, 0, deep - 0.2)
  kit.from(
    1,
    () => {
      kit.add(kit.cuboid(shed.len, 0.02, 0.12), line, edge.x, edge.y, KERB, shed.ry)
      kit.brick('ground', edge.x, edge.y, KERB)
    },
    spot(edge.x, edge.y),
  )
  kit.from(
    2,
    () => {
      const doors = shedDoors(shed.w, shed.d)
      /** A line 0.12 m wide from `u0` to `u1` along the wall, `o` m out from it. */
      const paint = (u0: number, u1: number, o: number) => {
        const c = onShed(shed, (u0 + u1) / 2, o)
        kit.add(kit.cuboid(u1 - u0, 0.02, 0.12), line, c.x, c.y, KERB, shed.ry)
      }
      // The walkway's line, from door to door.
      const gaps = [-shed.len / 2, ...doors.flatMap((u) => [u - 2.1, u + 2.1]), shed.len / 2]
      for (let k = 0; k < gaps.length; k += 2) if (gaps[k + 1] - gaps[k] > 0.6) paint(gaps[k], gaps[k + 1], walk)
      kit.brick('ground', yard.x, yard.y, KERB)
      for (const u of doors) {
        const c = onShed(shed, u, hazard / 2 + 0.05)
        kit.paving(c.x, c.y, KERB, 3.8, hazard, shed.ry, BAY, PATTERN.hazard, 0.024)
      }
    },
    spot(yard.x, yard.y) + 4,
  )
}

/**
 * What stands in a yard (#181) before shed `shed`'s doors, over `yard`, each where `claim` finds its ground clear and
 * takes it: a cluster of drums by the wall from Stage 1, a Block-zoom prop; a skip from Stage 2; and a floodlight mast at
 * the yard's far corner from Stage 2, and a second at the other from Stage 3, each leaving a pool over the yard.
 */
function yardPieces(g: ZoneGround, shed: Shed, yard: RowLot, claim: (lot: RowLot, clear: number, from: number) => boolean) {
  const { kit } = g
  const { inside } = YARD_PIECES
  const ends = (u: number) => [u, -u]
  const ry = shed.ry
  // Drums by the wall, near one end of it or the other.
  for (const u of ends(shed.len / 2 - 1.3)) {
    const p = onShed(shed, u, 0.95)
    if (!claim({ x: p.x, y: p.y, w: 1.6, d: 1.5, ry, onRoad: false }, inside, 1)) continue
    kit.from(1, () => kit.blockZoomProps(() => drums(kit, p.x, p.y, KERB, ry)), spot(p.x, p.y))
    break
  }
  // A skip, along the wall or out by the yard's edge.
  const skip = [...ends(shed.len / 2 - 2.4).map((u) => ({ u, o: 1.3 })), ...ends(shed.len / 2 - 2.4).map((u) => ({ u, o: yard.d - 1.6 }))]
  for (const { u, o } of skip) {
    const p = onShed(shed, u, o)
    if (!claim({ x: p.x, y: p.y, w: 4, d: 2.2, ry, onRoad: false }, inside, 2)) continue
    kit.from(2, () => skipBin(kit, p.x, p.y, KERB, ry), spot(p.x, p.y))
    break
  }
  // Floodlights at the yard's far corners, facing back across it.
  let masts = 0
  for (const u of ends(shed.len / 2 - 0.6)) {
    const p = onShed(shed, u, yard.d - 1.1)
    if (!claim({ x: p.x, y: p.y, w: 0.7, d: 0.7, ry, onRoad: false }, inside, masts ? 3 : 2)) continue
    const aim = onShed(shed, u - Math.sign(u) * Math.min(4, shed.len / 4), yard.d / 2)
    const face = Math.atan2(aim.y - p.y, aim.x - p.x) - Math.PI / 2 // its lamps' front toward the yard
    const w = Math.min(10, shed.len / 2 + 2)
    kit.from(masts ? 3 : 2, () => floodlight(kit, p.x, p.y, KERB, face, aim, w, Math.min(yard.d, 10), ry), spot(p.x, p.y))
    if (++masts === 2) break
  }
}

/** A cylinder coarser than the kit's (#181), for what stands by the hundred: an oil drum, a pipe turning down into the ground. */
const COARSE = new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)

/** A cluster of three oil drums at `(x, y)` (#181), turned `ry`, in colours drawn from the kit's stream, as one brick. */
function drums(kit: Kit, x: number, y: number, h: number, ry: number) {
  for (const [u, v] of [
    [-0.36, -0.3],
    [0.36, -0.3],
    [0, 0.34],
  ]) {
    const [dx, dy] = to(x, y, ry, u, v)
    kit.add(COARSE, kit.pick(YARD_PIECES.drums), dx, dy, h, 0, 0.3, 0.88, 0.3)
  }
  kit.brick('building', x, y, h)
}

/** A skip at `(x, y)` (#181), its length along `ry` (0 east–west), in a paint drawn from the kit's stream, with its load, as one brick. */
function skipBin(kit: Kit, x: number, y: number, h: number, ry: number) {
  const paint = kit.pick(YARD_PIECES.skips)
  const rim = `#${new THREE.Color(paint).multiplyScalar(0.8).getHexString()}`
  kit.put(kit.cuboid(3.2, 1.2, 1.6), paint, x, y, ry, 0, 0, h)
  kit.put(kit.cuboid(3.7, 0.16, 1.8), rim, x, y, ry, 0, 0, h + 1.14) // its rim
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.12, 0.5, 1.7), rim, x, y, ry, k * 1.1, 0, h + 0.3) // the lugs it is lifted by
  kit.put(kit.cuboid(3.3, 0.3, 1.5), YARD_PIECES.load, x, y, ry, 0, 0, h + 1.02) // its load, heaped a little over the rim
  kit.shadow(x, y, h, 4.4, 2.4, false, ry)
  kit.brick('building', x, y, h)
}

/**
 * A floodlight mast at `(x, y)` (#181), its two lamps on a crossarm facing `face`, glowing at night and leaving a pool
 * `w` by `d` at `aim` on the yard, turned `ry`, as one brick.
 */
function floodlight(
  kit: Kit,
  x: number,
  y: number,
  h: number,
  face: number,
  aim: { x: number; y: number },
  w: number,
  d: number,
  ry: number,
) {
  const { mast, steel, light, glow } = YARD_PIECES
  kit.add(kit.cuboid(0.24, mast, 0.24), steel, x, y, h)
  kit.add(kit.cuboid(0.5, 0.3, 0.5), steel, x, y, h) // its foot
  kit.put(kit.cuboid(1.6, 0.12, 0.12), steel, x, y, face, 0, 0, h + mast - 0.3)
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.55, 0.38, 0.3), kit.lit(light, glow), x, y, face, k * 0.55, 0.12, h + mast - 0.65)
  kit.pool('flood', aim.x, aim.y, h, w, d, ry)
  kit.brick('building', x, y, h)
}

/**
 * Pallets stacked at `(x, y)`, turned `ry`, each with its load of goods, as one brick (#150): the layers from `first`
 * up to `layers`. The forklifts' work, oversized a little as the props are.
 */
function pallets(kit: Kit, x: number, y: number, h: number, ry: number, layers: number, first = 0) {
  const [P, T, G] = [1.4, 0.18, 0.95] // the pallet's side, its thickness and the height of its load
  for (let k = first; k < layers; k++) {
    const at = h + k * (T + G)
    kit.add(kit.cuboid(P, T, P), PALLET.wood, x, y, at, ry)
    kit.add(kit.cuboid(P - 0.12, G, P - 0.12), kit.pick(PALLET.goods), x, y, at + T, ry)
  }
  if (!first) kit.shadow(x, y, h, P + 0.8, P + 0.8, false, ry)
  kit.brick('building', x, y, h + first * (T + G))
}

/**
 * The paint marking a truck's bay, a line down each side `l` m long and `w` apart, its length across a shed whose
 * long side runs `ry` (0 east–west), as a brick (#150).
 */
function bay(kit: Kit, x: number, y: number, h: number, ry: number, l: number, w: number) {
  for (const k of [-1, 1]) kit.put(kit.cuboid(0.14, 0.02, l), BAY, x, y, ry, (k * w) / 2, 0, h)
  kit.brick('ground', x, y, h)
}

// The scenes (#181): a gantry crane over a stack of containers, its girders high enough that the spreader its trolley
// carries (`TROLLEY`) clears the stack by `clear` m and a little, two high at Stage 2 and three at Stage 3, in the crane's yellow with dark bogies and a cab, its trolley waiting
// `waits` s (a range each draws its own from) over each end of the stack; a tank farm, its tanks `tall` m tall at Stage
// 2 and `taller` at Stage 3, in pale paints under a band, in a concrete bund behind `walk` m left along the ground's
// front for the walkers on the pavement, a catwalk over their tops at Stage 3; and a
// pipe rack, its bents about `bay` m apart and `tall` m tall (`taller` at Stage 3, with a second row of pipes lower down), carrying pipes in
// `pipes`' paints.
const CRANE = { clear: 0.4, paint: '#e8b84a', dark: '#4a525c', cab: '#f4f1ea', glass: '#41566c', waits: [5, 12], girders: 1.65 }
const TANKS = {
  walk: 1.3,
  tall: 5.6,
  taller: 7.2,
  paints: ['#eef0ee', '#e6dfcf', '#d9e2dc'],
  bands: ['#5aa69b', '#d09c53', '#8b7dbf'],
  bund: '#d9d4ca',
  steel: '#6f7986',
}
const RACK = { bay: 4.5, tall: 4.6, taller: 5.6, steel: '#7a8590', pipes: ['#d9dee3', '#e8b84a', '#5aa69b', '#f4f1ea', '#8b7dbf'] }
/** m in from the kerb clear of the walkers on the pavement (`../walkers`' `INSET`, 1.6 m, and their width) (#181). */
const WALKERS = 2.1
/** The scenes' builders (#181), each on its ground at a Stage. */
const SCENES: Record<IndustrialScene, (kit: Kit, l: RowLot, stage: number) => void> = { crane, tanks, rack }

/** Add a shape at `(u, v)` in the frame of ground `l`, `h` above the road, as the kit's `local` does in a building's (#181). */
const onGround = (kit: Kit, l: RowLot) => (geo: THREE.BufferGeometry, look: KitLook, u: number, v: number, h: number) =>
  kit.local(geo, look, l.x, l.y, l.ry, u, v, h)

/**
 * A ladder `tall` m tall at `(x, y)`, `h` above the road, its rungs along `ry`'s x (#181): two rails and a rung every
 * `step` m.
 */
function ladder(kit: Kit, look: KitLook, x: number, y: number, ry: number, h: number, tall: number, step: number) {
  for (const k of [-1, 1]) kit.local(kit.cuboid(0.08, tall, 0.08), look, x, y, ry, k * 0.23, 0, h)
  for (let z = step * 0.8; z < tall - 0.2; z += step) kit.local(kit.cuboid(0.5, 0.05, 0.05), look, x, y, ry, 0, 0, h + z)
}

/** A pipe of radius `r` and `len` m along x in the frame of something at `(x, y)` facing `ry`, its middle at `(lx, ly)`, its foot `h` above the road (#181). */
function pipe(kit: Kit, look: KitLook, x: number, y: number, ry: number, lx: number, ly: number, h: number, len: number, r: number) {
  const g = new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2).translate(0, r, 0)
  kit.local(g, look, x, y, ry, lx, ly, h)
  g.dispose()
}

/**
 * A gantry crane over a stack of containers on ground `l` at Stage `stage` (#181): a portal frame at each end of the
 * ground, two girders between them, a cab under one, and its trolley shuttling along the girders over the stack, which
 * lies along the ground one or two containers long and stands one or two high, and a third at Stage 3, under girders
 * that rise to clear it.
 */
function crane(kit: Kit, l: RowLot, stage: number) {
  const on = onGround(kit, l)
  const { paint, dark, cab, glass, girders } = CRANE
  const tall = (stage === 3 ? 3 : 2) * CONTAINER.tall + TROLLEY.drop + CRANE.clear
  const [ends, span] = [l.w / 2 - 0.3, l.d / 2 - 0.3]
  for (const u of [-ends, ends]) {
    for (const k of [-1, 1]) {
      on(kit.cuboid(0.4, tall, 0.4), paint, u, k * span, KERB)
      on(kit.cuboid(0.6, 0.55, 0.62), dark, u, k * span, KERB) // its bogie
    }
    on(kit.cuboid(0.5, 0.6, l.d - 0.2), paint, u, 0, KERB + tall - 0.6) // the frame's head
    on(kit.cuboid(0.22, 0.22, l.d - 0.6), paint, u, 0, KERB + tall * 0.45) // its tie
  }
  for (const k of [-1, 1]) on(kit.cuboid(l.w, 0.7, 0.4), paint, 0, k * girders, KERB + tall)
  on(kit.cuboid(1.3, 1.4, 1.1), cab, ends - 1.2, girders + 0.2, KERB + tall - 1.4)
  on(kit.cuboid(1.32, 0.6, 1.12), { material: kit.glass, tint: kit.glassOf(glass) }, ends - 1.2, girders + 0.2, KERB + tall - 0.7)
  kit.shadow(l.x, l.y, KERB, l.w + 1, l.d + 1, false, l.ry)
  kit.brick('building', l.x, l.y, KERB)
  // The stack, a container's length and a little to each spot along the ground, against the back legs so that the
  // walkers on the pavement pass between it and the front legs; each spot on a stream of its own, so that Stage 3's
  // third container changes none of the others.
  const { long, wide } = CONTAINER
  const row = -span + 0.25 + wide / 2
  const n = Math.max(1, Math.floor((l.w - 1) / (long + 0.3)))
  const draw = mulberry32(spot(l.x, l.y) + 5)
  for (let k = 0; k < n; k++) {
    const u = (k - (n - 1) / 2) * (long + 0.3)
    const p = turned(l.x, l.y, l.ry, u, row)
    const high = 1 + (draw() < 0.6 ? 1 : 0) + (stage === 3 ? 1 : 0)
    kit.seeded(spot(p.x, p.y), () => containers(kit, p.x, p.y, KERB, l.ry, high))
  }
  // The trolley, over each end of the stack in turn.
  const reach = Math.max(1.2, ((n - 1) * (long + 0.3)) / 2)
  const [a, b] = [turned(l.x, l.y, l.ry, -reach, row), turned(l.x, l.y, l.ry, reach, row)]
  const waits = [0, 1].map(() => CRANE.waits[0] + draw() * (CRANE.waits[1] - CRANE.waits[0]))
  kit.mover('trolley', polyline([a, b, a]), [0, 2 * reach], 0, KERB + tall + 0.7, { waits, paint })
}

/**
 * A tank farm on ground `l` at Stage `stage` (#181): two to four tanks in a row in a low concrete bund on a concrete pad,
 * each in a pale paint under a band, with a hatch on its top and a pipe out of its foot, a ladder up the first; taller
 * at Stage 3, with a catwalk over their tops.
 */
function tanks(kit: Kit, l: RowLot, stage: number) {
  const on = onGround(kit, l)
  const { paints, bands, bund, steel, walk } = TANKS
  // The bund behind the walkers' way along the front of the ground.
  const [deep, back] = [l.d - walk, -walk / 2]
  const c = turned(l.x, l.y, l.ry, 0, back)
  kit.paving(c.x, c.y, KERB, l.w, deep, l.ry, bund, PATTERN.paving)
  for (const k of [-1, 1]) {
    on(kit.cuboid(l.w, 0.55, 0.22), bund, 0, back + k * (deep / 2 - 0.11), KERB)
    on(kit.cuboid(0.22, 0.55, deep - 0.44), bund, k * (l.w / 2 - 0.11), back, KERB)
  }
  const r = Math.min(1.75, deep / 2 - 0.4)
  const n = Math.max(2, Math.min(4, Math.floor((l.w - 0.6) / (2 * r + 0.7))))
  const gap = (l.w - 0.6) / n
  const tall = stage === 3 ? TANKS.taller : TANKS.tall
  const [paint, band] = [kit.pick(paints), kit.pick(bands)]
  for (let k = 0; k < n; k++) {
    const u = -l.w / 2 + 0.3 + (k + 0.5) * gap
    const p = turned(l.x, l.y, l.ry, u, back)
    const high = tall - 0.5 * (k % 2)
    kit.wrapped(CYLINDER, paint, p.x, p.y, KERB, r, high, { kind: PATTERN.plates, bay: 2, storey: 1.2 }, spot(p.x, p.y))
    kit.add(CYLINDER, band, p.x, p.y, KERB + high - 1.1, 0, r + 0.04, 0.5, r + 0.04)
    kit.add(kit.cuboid(0.7, 0.35, 0.7), steel, p.x, p.y, KERB + high) // its hatch
    on(kit.cuboid(0.3, 0.3, deep / 2 - r), steel, u, back - (r + deep / 2) / 2, KERB + 0.3) // its pipe out the back
  }
  // A ladder up the first tank's front.
  const first = -l.w / 2 + 0.3 + gap / 2
  ladder(kit, steel, ...to(l.x, l.y, l.ry, first, back + r + 0.12), l.ry, KERB, tall, 0.6)
  if (stage === 3) {
    const span = (n - 1) * gap
    on(kit.cuboid(span, 0.1, 0.8), steel, first + span / 2, back, KERB + tall + 0.05)
    for (const k of [-1, 1]) on(kit.cuboid(span, 0.05, 0.05), steel, first + span / 2, back + k * 0.4, KERB + tall + 1)
  }
  kit.shadow(l.x, l.y, KERB, l.w + 1, l.d + 1, false, l.ry)
  kit.brick('building', l.x, l.y, KERB)
}

/**
 * A pipe rack on ground `l` at Stage `stage` (#181): steel bents about `RACK.bay` m apart carrying pipes along the
 * ground's length, which turn down into the ground at one end; taller at Stage 3, with a second row of pipes lower down.
 */
function rack(kit: Kit, l: RowLot, stage: number) {
  const on = onGround(kit, l)
  const { steel, pipes } = RACK
  const tall = stage === 3 ? RACK.taller : RACK.tall
  const bents = Math.max(2, Math.round((l.w - 0.6) / RACK.bay) + 1)
  const [span, post] = [(l.w - 0.6) / (bents - 1), l.d / 2 - 0.25]
  const heights = stage === 3 ? [tall, tall - 1.5] : [tall]
  for (let k = 0; k < bents; k++) {
    const u = -l.w / 2 + 0.3 + k * span
    for (const v of [-post, post]) on(kit.cuboid(0.3, tall + 0.3, 0.3), steel, u, v, KERB)
    for (const t of heights) on(kit.cuboid(0.3, 0.3, l.d - 0.1), steel, u, 0, KERB + t - 0.3)
  }
  const draw = mulberry32(spot(l.x, l.y))
  heights.forEach((t, row) => {
    const count = row ? 3 : 4
    for (let i = 0; i < count; i++) {
      const v = -post + 0.45 + ((i + 0.5) * (2 * post - 0.9)) / count
      const r = 0.14 + draw() * 0.12
      const look = pipes[Math.floor(draw() * pipes.length)]
      pipe(kit, look, l.x, l.y, l.ry, 0, v, KERB + t, l.w - 0.2, r)
      // The top row's pipes turn down into the ground just inside the rack's far end, those behind the walkers' line.
      if (!row && v <= l.d / 2 - (WALKERS - INDUSTRIAL_FINISH.ground.in)) {
        const p = turned(l.x, l.y, l.ry, l.w / 2 - 0.9, v)
        kit.add(COARSE, look, p.x, p.y, KERB, 0, r, t + r, r)
      }
    }
  })
  kit.shadow(l.x, l.y, KERB, l.w + 1, l.d + 1, false, l.ry)
  kit.brick('building', l.x, l.y, KERB)
}

/** What a fence does at a step along the Block's edge (#181): stands, opens as a gate, or breaks. */
type FenceStep = 'fence' | 'gate' | null

/**
 * A fence along the Block's edge where it faces a Road (#181), `FENCE.in` m in from it: mesh panels between posts,
 * broken wherever anything claimed stands and by the kerbside's lamps, utility poles and street trees. Where
 * it breaks within a yard of `yards` for what stands there, the gap is a gate: taller posts either side, and its leaf
 * slid open behind the longer stretch of fence beside it. Each stretch is one brick, and claims its ground.
 */
function fence(g: ZoneGround, yards: (RowLot | null)[]) {
  const { kit } = g
  const { step, least } = FENCE
  for (const run of runs(g, FENCE.in)) {
    const at = (s: number) => ({ x: run.a.x + run.ux * s, y: run.a.y + run.uy * s })
    /** Whether the fence may stand `s` m along the run at all: facing a Road, clear of the kerbside's furniture. */
    const open = (s: number) => {
      const p = at(s)
      return run.onRoad(p.x, p.y) && clearOfKerbside(g, [at(s - step / 2), at(s + step / 2)], [FENCE.poles, FENCE.lamps, FENCE.trees])
    }
    const opens = Array.from({ length: Math.floor(run.len / step) }, (_, k) => open((k + 0.5) * step))
    /**
     * The run's stretches at Stage `stage`, one kind to each: where the fence stands, opens as a gate, or breaks, a step
     * at a time, broken by what stands at that Stage, so that it closes before ground that stands empty until later.
     */
    const stretchesAt = (stage: number) => {
      const claims = kit.claimed(stage).map((c) => ({ ...c, onRoad: false }))
      const stretches: Stretch[] = []
      opens.forEach((free, k) => {
        const [s, p] = [(k + 0.5) * step, at((k + 0.5) * step)]
        const lot = { x: p.x, y: p.y, w: step, d: 0.3, ry: run.ry, onRoad: true }
        const kind: FenceStep = !free
          ? null
          : !claims.some((c) => overlap(c, lot, 0))
            ? 'fence'
            : yards.some((y) => y && near(y, p.x, p.y, 1))
              ? 'gate'
              : null
        const last = stretches[stretches.length - 1]
        if (last && last.kind === kind) last.s1 = s + step / 2
        else stretches.push({ kind, s0: s - step / 2, s1: s + step / 2 })
      })
      return stretches.map((f) => (f.kind === 'fence' && f.s1 - f.s0 < least ? { ...f, kind: null } : f))
    }
    // Each Stage's stretches before the fence claims its ground, as it stands at Stage 3, where it stands at every
    // Stage: what stands later only breaks it.
    const stretches = [1, 2, 3].map(stretchesAt)
    for (const f of stretches[2]) {
      if (f.kind !== 'fence') continue
      const c = at((f.s0 + f.s1) / 2)
      kit.stand(c.x, c.y, f.s1 - f.s0 - 0.2, 0.8, run.ry)
    }
    kit.staged((stage) => layFence(kit, run, at, stretches[stage - 1]), spot(run.a.x, run.a.y))
  }
}

/** A stretch of a fence along a run of the Block's edge (#181): what it does, from `s0` m along the run to `s1`. */
interface Stretch {
  kind: FenceStep
  s0: number
  s1: number
}

/**
 * Lay the fence's `stretches` along `run`, a point `at(s)` m along it (#181): each stretch that stands as one brick of
 * mesh panels between posts, and beside a gate, a taller post and the gate's leaf slid open behind the longer stretch.
 */
function layFence(kit: Kit, run: Run, at: (s: number) => { x: number; y: number }, stretches: Stretch[]) {
  stretches.forEach((f, i) => {
    if (f.kind !== 'fence') return
    const len = f.s1 - f.s0 - 0.2
    const c = at((f.s0 + f.s1) / 2)
    const ry = run.ry
    const bays = Math.max(1, Math.round(len / FENCE.bay))
    kit.cladded(
      kit.cuboid(len, FENCE.tall, 0.05),
      FENCE.paint,
      c.x,
      c.y,
      KERB + 0.06,
      ry,
      { front: PATTERN.mesh, back: PATTERN.mesh, bay: len / bays },
      spot(c.x, c.y),
    )
    for (let b = 0; b <= bays; b++)
      kit.put(kit.cuboid(0.09, FENCE.tall + 0.15, 0.09), FENCE.post, c.x, c.y, ry, -len / 2 + (b * len) / bays, 0, KERB)
    // A gate beside it: its posts, and its leaf slid open behind this stretch if this is the longer beside it.
    for (const [j, end] of [
      [i - 1, -1],
      [i + 1, 1],
    ]) {
      const gate = stretches[j]
      if (gate?.kind !== 'gate') continue
      const edge = end < 0 ? f.s0 + 0.1 : f.s1 - 0.1
      const p = at(edge)
      kit.add(kit.cuboid(0.22, FENCE.tall + 0.5, 0.22), FENCE.post, p.x, p.y, KERB, ry)
      const other = stretches[j + end]
      const longer = !other || other.kind !== 'fence' || other.s1 - other.s0 <= f.s1 - f.s0
      const leaf = Math.min(FENCE.leaf, gate.s1 - gate.s0, len - 0.4)
      if (!longer || leaf <= 1) continue
      const q = at(edge - end * (leaf / 2 + 0.15))
      const [lx, ly] = [q.x - run.nx * 0.22, q.y - run.ny * 0.22] // behind the fence, on the Block's side
      const bay = leaf / Math.max(1, Math.round(leaf / FENCE.bay))
      kit.cladded(
        kit.cuboid(leaf, FENCE.tall - 0.1, 0.06),
        FENCE.post,
        lx,
        ly,
        KERB + 0.08,
        ry,
        { front: PATTERN.mesh, back: PATTERN.mesh, bay },
        spot(lx, ly),
      )
    }
    kit.brick('building', c.x, c.y, KERB)
    kit.stand(c.x, c.y, len, 0.8, ry)
  })
}

// Shipping containers: their paints and size, and their builder, beside the fill that lays them (#150, #210). Their
// paints are the roofs' colours, their frames and ribs a shade darker.
const CONTAINER_PAINTS = ['#d56454', '#4d7d9c', '#5aa69b', '#d09c53', '#8b7dbf', '#ea8548', '#7f8c7c']
/** A shipping container's size (m): long, wide and tall (#150). */
const CONTAINER = { long: 6.1, wide: 2.45, tall: 2.6 }

/**
 * Shipping containers stacked on the ground at `(x, y)`, their length along `ry` (0 east–west), as one brick (#150): the
 * layers from `first` up to `layers`, each a box in its own colour with its frame and ribs a shade darker.
 */
function containers(kit: Kit, x: number, y: number, h: number, ry: number, layers: number, first = 0) {
  const { long: L, wide: W, tall: H } = CONTAINER
  for (let k = first; k < layers; k++) {
    const colour = kit.pick(CONTAINER_PAINTS)
    const frame = `#${new THREE.Color(colour).multiplyScalar(0.78).getHexString()}`
    const at = h + k * H
    kit.cladded(kit.cuboid(L - 0.24, H - 0.12, W - 0.1), colour, x, y, at + 0.06, ry, { top: PATTERN.ribbed }, spot(x, y) + k) // its roof ribbed (#181)
    for (const end of [-1, 1]) kit.local(kit.cuboid(0.14, H, W), frame, x, y, ry, end * (L / 2 - 0.07), 0, at)
    for (let r = 1; r < 6; r++) kit.local(kit.cuboid(0.1, H - 0.3, W + 0.04), frame, x, y, ry, -L / 2 + (r * L) / 6, 0, at + 0.15)
  }
  if (!first) kit.shadow(x, y, h, L + 1.2, W + 1.2, false, ry)
  kit.brick('building', x, y, h + first * H)
}

// The shed: its palette and its builder, beside the fill that lays it (#207).
const { cylinder: CYLINDER } = SHAPES
// Industrial: a shed's walls, its roof sheets and its roller doors, and a chimney's brick under a white band.
const SHED = {
  walls: ['#c9d1d6', '#b9c8b4', '#dccbaa', '#aebdcb', '#cfb39b', '#d9dcd2'],
  roofs: ['#8f9aa5', '#7f8c7c', '#9c8f80', '#6f7f8c'],
  doors: ['#f0c75e', '#e9eef2', '#79a7c3', '#7fbf9d'],
  chimney: '#a8604f',
  band: '#f4f1ea',
}
/**
 * Where a shed `w` by `d` has its roller doors, as `warehouse` lays them (#150): m along its long side from its middle,
 * about one to every 9 m.
 */
function shedDoors(w: number, d: number): number[] {
  const len = Math.max(w, d) - 0.4
  const n = Math.max(1, Math.floor(len / 9))
  return Array.from({ length: n }, (_, k) => -len / 2 + ((k + 0.5) * len) / n)
}

// A shed to the Finish (#181): its company's colour, drawn from where it stands, for the band under its eaves; the band
// `band` m deep; its roof's vents and ducting in galvanised steel against the roof, its pipes and ladder; the pool under
// each door's lamp, `pool` m out and its size; and the chimney's amber beacon.
const SHED_FINISH = {
  company: CONTAINER_PAINTS.slice(0, 6), // the containers' paints but their green-grey
  band: 0.5,
  galvanised: '#e6eaed',
  pipe: '#7d8b96',
  ladder: '#5c6670',
  pool: { out: 1.9, w: 4, d: 3.2 },
}

/**
 * A shed at Stage `stage` on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: low walls under
 * a sawtooth roof whose teeth follow one another along its long side, glazed up each tooth, roller doors along the
 * long side `side` (1 north or west, -1 south or east), and a brick chimney if `chimney`, which smokes. Its colours,
 * its glazing and its height within its Stage are drawn before anything a Stage changes:
 * - Stage 1: on 80% of the footprint, lower, and with no chimney.
 * - Stage 2: on the whole footprint, with a lamp over each door that lights at dusk (#150).
 * - Stage 3: a metre taller, with a two-storey office at one end of its back, vents along its roof, and a taller
 *   chimney with a second band.
 * To the Finish (#181), at every Stage: walls of corrugated steel with a high strip of windows on every side, a band in
 * its company's colour under the eaves, and a roof of ribbed steel sheet. With the Stage, its glazing lights from
 * Stage 2 where only half the sheds' did at Stage 1; from Stage 2 a row of vents down each tooth, a pipe run along its
 * back, a ladder up one end, a pool under each door's lamp and an amber beacon on the chimney; at Stage 3 a duct along
 * the roof.
 */
function warehouse(kit: Kit, x: number, y: number, h: number, w: number, d: number, chimney: boolean, side: number, stage = 2) {
  kit.formed('shed')
  const [tall, walls, roofs, lit, doorColour, chimneyTall] = [
    kit.rand(),
    kit.pick(SHED.walls),
    kit.pick(SHED.roofs),
    kit.rand() < 0.5,
    kit.pick(SHED.doors),
    kit.range(15, 21),
  ]
  const own = mulberry32(spot(x, y) ^ 0x5bed) // the Finish's own draws, from where it stands
  const [company, seed] = [SHED_FINISH.company[Math.floor(own() * SHED_FINISH.company.length)], (own() * 4294967296) >>> 0]
  const { galvanised, band } = SHED_FINISH
  if (stage === 1) [w, d] = [w * 0.8, d * 0.8]
  const wall = [4.2 + 1.2 * tall, 5.4 + 2 * tall, 6.4 + 2 * tall][stage - 1]
  const sheet = PATTERN.corrugated
  kit.cladded(kit.box(w, wall, d, 0.4, 0.14), walls, x, y, h, 0, { front: sheet, back: sheet, sides: sheet, bay: 3 }, seed)
  kit.add(kit.cuboid(w + 0.08, band, d + 0.08), company, x, y, h + wall - band - 0.1)
  const along = w >= d
  const [len, wid, ry] = along ? [w - 0.4, d - 0.4, 0] : [d - 0.4, w - 0.4, Math.PI / 2]
  const n = Math.max(2, Math.round(len / 6))
  const rise = Math.min(3.4, (len / n) * 0.55)
  const teeth = sawtooth(len, wid, rise, n)
  kit.tiled(teeth, roofs, x, y, h + wall, ry, seed + 1, PATTERN.ribbed, PATTERN.ribbed)
  teeth.dispose()
  const glaze: KitLook = { material: kit.glass, tint: lit || stage > 1 ? kit.windows[2] : kit.unlit }
  for (let i = 0; i < n; i++)
    kit.local(kit.cuboid(0.2, rise * 0.8, wid - 1.2), glaze, x, y, ry, -len / 2 + (i * len) / n - 0.12, 0, h + wall)
  for (const u of shedDoors(w, d)) {
    kit.local(kit.cuboid(3.6, 4, 0.3), doorColour, x, y, ry, u, (side * (wid + 0.4)) / 2, h)
    if (stage > 1) {
      kit.local(kit.cuboid(0.7, 0.22, 0.5), kit.bulb, x, y, ry, u, side * (wid / 2 + 0.45), h + 4.5)
      const { out, w: pw, d: pd } = SHED_FINISH.pool
      kit.pool('door', ...to(x, y, ry, u, side * (wid / 2 + out)), h, pw, pd, ry)
    }
  }
  if (stage > 1) {
    // A row of vents a third of the way down each tooth, and a duct along the roof at Stage 3.
    const vents = Math.max(1, Math.floor((wid - 2) / 5))
    for (let i = 0; i < n; i++)
      for (let k = 0; k < vents; k++)
        kit.local(
          kit.cuboid(0.7, 0.8, 0.7),
          galvanised,
          x,
          y,
          ry,
          -len / 2 + ((i + 0.3) * len) / n,
          -wid / 2 + 1 + ((k + 0.5) * (wid - 2)) / vents,
          h + wall + rise * 0.7 - 0.25,
        )
    if (stage === 3) {
      const [dl, dv] = [len * 0.7, side * wid * 0.22]
      kit.local(kit.cuboid(dl, 0.65, 0.65), galvanised, x, y, ry, 0, dv, h + wall + rise + 0.15)
      for (const k of [-1, 1]) kit.local(kit.cuboid(0.65, rise + 0.8, 0.65), galvanised, x, y, ry, (k * dl) / 2, dv, h + wall)
    }
    // A pipe run along the back, dropping to the ground at one end and rising to the roof at the other.
    const [back, steel] = [-side * ((wid + 0.4) / 2 + 0.13), SHED_FINISH.pipe]
    const [p0, p1] = [0.5, len / 2 - 1]
    kit.local(kit.cuboid(p1 - p0, 0.18, 0.18), steel, x, y, ry, (p0 + p1) / 2, back, h + wall * 0.55)
    kit.local(kit.cuboid(0.18, wall * 0.55, 0.18), steel, x, y, ry, p1, back, h)
    kit.local(kit.cuboid(0.18, wall * 0.45 + 0.5, 0.18), steel, x, y, ry, p0, back, h + wall * 0.55)
    // A ladder up the end away from the chimney, on the doors' half.
    const [end, lv] = [-((len + 0.4) / 2 + 0.12), side * wid * 0.22]
    ladder(kit, SHED_FINISH.ladder, ...to(x, y, ry, end, lv), ry + Math.PI / 2, h, wall + 1, 0.75)
  }
  if (stage === 3) {
    // An office at the far end of the back, standing a storey clear of the walls, with a band of windows a floor.
    const [ow, od] = [Math.min(11, len * 0.32), Math.min(7, wid * 0.45)]
    const [ox, oy] = [-len / 2 + ow / 2 + 0.2, -side * (wid / 2 - od / 2 + 0.35)] // its face just out of the shed's
    const high = wall + 3.4
    kit.cladded(
      kit.box(ow, high, od, 0.3, 0.1),
      SHED.band,
      ...to(x, y, ry, ox, oy),
      h,
      ry,
      { top: PATTERN.ribbed, front: sheet, back: sheet, sides: sheet, bay: 2.4 },
      seed + 2,
    )
    // Its flat roof's parapet, and a plant box on it.
    for (const k of [-1, 1]) {
      kit.local(kit.cuboid(ow, 0.4, 0.2), SHED.band, x, y, ry, ox, oy + k * (od / 2 - 0.1), h + high)
      kit.local(kit.cuboid(0.2, 0.4, od - 0.4), SHED.band, x, y, ry, ox + k * (ow / 2 - 0.1), oy, h + high)
    }
    kit.local(kit.cuboid(1.6, 0.9, 1.1), PLANT, x, y, ry, ox + ow * 0.2, oy, h + high)
    for (const f of [0, 1])
      kit.local(
        kit.cuboid(ow - 1.2, 1.3, 0.3),
        { material: kit.glass, tint: kit.windows[0] },
        x,
        y,
        ry,
        ox,
        oy - side * (od / 2),
        h + high - 6.2 + f * 3.1,
      )
    for (let i = 0; i < n; i++) {
      const [vx, vy] = to(x, y, ry, -len / 2 + ((i + 0.5) * len) / n + 1.2, 0)
      kit.add(CYLINDER, PLANT, vx, vy, h + wall + rise * 0.5, 0, 0.5, rise * 0.5 + 1.2, 0.5)
    }
  }
  if (chimney && stage > 1) {
    const [cx, cy] = to(x, y, ry, len / 2 - 2.6, -side * (wid / 2 - 2.6))
    const high = chimneyTall + (stage === 3 ? 5 : 0)
    kit.wrapped(CYLINDER, SHED.chimney, cx, cy, h, 1, high, { kind: PATTERN.blocks, bay: 1.6, storey: 0.8 }, seed + 3)
    kit.add(CYLINDER, SHED.band, cx, cy, h + high - 2.4, 0, 1.06, 0.9, 1.06)
    if (stage === 3) kit.add(CYLINDER, SHED.band, cx, cy, h + high - 6, 0, 1.06, 0.6, 1.06)
    kit.smoke(cx, cy, h + high + 0.4)
    kit.beacon(cx + 0.8, cy, h + high + 0.2, 0.3, 'amber')
  }
  kit.shadow(x, y, h, w * 1.3 + 2, d * 1.3 + 2)
  kit.brick('building', x, y, h)
}
