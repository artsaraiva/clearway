import { mulberry32 } from '../../sim/demand'
import { polyline, type Bounds } from '../../sim/geometry'
import { KERB } from '../blocks'
import { CONTAINER, type Kit, type Look as KitLook, PLANT, SHAPES, spot, to } from '../kit'
import { fit, lotsOf, near, overlap, stands, turned, type Look, type RowLot, type ZoneGround } from './ground'
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

/** Industrial's look (`./index`). */
export const look: Look = { landmarks: false, fill: industrial }

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
    taken.push({ x: shed.x, y: shed.y, w: shed.w, d: shed.d, ry: 0, onRoad: false })
    kit.lot(i, f)
    const first = chimney
    kit.staged((stage) => warehouse(kit, shed.x, shed.y, KERB, shed.w, shed.d, first, side, stage))
    chimney = false
  }
  // Then each yard, on its shed's lot, once every shed has taken its ground.
  for (const { shed, lot } of laid) {
    kit.lot(lot)
    loadingYard(g, shed, taken)
  }
  kit.lot(-1)
}

/**
 * The details of shed `shed`'s yard (#150), each drawn from where it stands and laid where its ground is clear of
 * everything `taken`, which it then takes: a truck backed up to the first door with room for its bay, a forklift at the
 * next door with room to work, a second truck at a door left over, and containers along the shed's back and ends.
 */
function loadingYard(g: ZoneGround, shed: Shed, taken: RowLot[]) {
  const { kit } = g
  /** Take `lot` if it stands on the Block `clear` m in from its edge, clear of everything taken: whether it did. */
  const claim = (lot: RowLot, clear: number) => {
    if (!stands(g, lot.x, lot.y, lot.w, lot.d, clear, lot.ry) || taken.some((o) => overlap(o, lot))) return false
    taken.push(lot)
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
      if (!claim(yardLot(shed, u - wide / 2 - 0.4, u + wide / 2 + 0.4, 0, dock + p + long / 2 + 0.3), 1)) continue
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
        if (!claim(yardLot(shed, Math.min(u, s) - r - rear, Math.max(u, s) + r + rear, 0, out + r + 1.4), 0.8)) continue
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
    if (!first || !claim({ x: p.x, y: p.y, w: long + 0.3, d: wide + 0.3, ry, onRoad: false }, 0.6)) continue
    kit.from(first, () => kit.containers(p.x, p.y, KERB, ry, 1), spot(p.x, p.y))
    if (two) kit.from(3, () => kit.containers(p.x, p.y, KERB, ry, 2, 1), spot(p.x + 1, p.y))
  }
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

/**
 * A shed at Stage `stage` on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: low walls under
 * a sawtooth roof whose teeth follow one another along its long side, glazed up each tooth, roller doors along the
 * long side `side` (1 north or west, -1 south or east), and a brick chimney if `chimney`, which smokes. Its colours,
 * its glazing and its height within its Stage are drawn before anything a Stage changes:
 * - Stage 1: on 80% of the footprint, lower, and with no chimney.
 * - Stage 2: on the whole footprint, with a lamp over each door that lights at dusk (#150).
 * - Stage 3: a metre taller, with a two-storey office at one end of its back, vents along its roof, and a taller
 *   chimney with a second band.
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
  if (stage === 1) [w, d] = [w * 0.8, d * 0.8]
  const wall = [4.2 + 1.2 * tall, 5.4 + 2 * tall, 6.4 + 2 * tall][stage - 1]
  kit.add(kit.box(w, wall, d, 0.4, 0.14), walls, x, y, h)
  const along = w >= d
  const [len, wid, ry] = along ? [w - 0.4, d - 0.4, 0] : [d - 0.4, w - 0.4, Math.PI / 2]
  const n = Math.max(2, Math.round(len / 6))
  const rise = Math.min(3.4, (len / n) * 0.55)
  const teeth = sawtooth(len, wid, rise, n)
  kit.add(teeth, roofs, x, y, h + wall, ry)
  teeth.dispose()
  const glaze: KitLook = { material: kit.glass, tint: lit ? kit.windows[2] : kit.unlit }
  for (let i = 1; i < n; i++)
    kit.local(kit.cuboid(0.2, rise * 0.8, wid - 1.2), glaze, x, y, ry, -len / 2 + (i * len) / n - 0.12, 0, h + wall)
  for (const u of shedDoors(w, d)) {
    kit.local(kit.cuboid(3.6, 4, 0.3), doorColour, x, y, ry, u, (side * (wid + 0.4)) / 2, h)
    if (stage > 1) kit.local(kit.cuboid(0.7, 0.22, 0.5), kit.bulb, x, y, ry, u, side * (wid / 2 + 0.45), h + 4.5)
  }
  if (stage === 3) {
    // An office at the far end of the back, standing a storey clear of the walls, with a band of windows a floor.
    const [ow, od] = [Math.min(11, len * 0.32), Math.min(7, wid * 0.45)]
    const [ox, oy] = [-len / 2 + ow / 2 + 0.2, -side * (wid / 2 - od / 2 + 0.35)] // its face just out of the shed's
    const high = wall + 3.4
    kit.local(kit.box(ow, high, od, 0.3, 0.1), SHED.band, x, y, ry, ox, oy, h)
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
    kit.add(CYLINDER, SHED.chimney, cx, cy, h, 0, 1, high, 1)
    kit.add(CYLINDER, SHED.band, cx, cy, h + high - 2.4, 0, 1.06, 0.9, 1.06)
    if (stage === 3) kit.add(CYLINDER, SHED.band, cx, cy, h + high - 6, 0, 1.06, 0.6, 1.06)
    kit.smoke(cx, cy, h + high + 0.4)
  }
  kit.shadow(x, y, h, w * 1.3 + 2, d * 1.3 + 2)
  kit.brick('building', x, y, h)
}
