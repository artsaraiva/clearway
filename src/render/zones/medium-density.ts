import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Bounds, type Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { KEI } from '../cars'
import { inside } from '../field'
import {
  BIKE_RACK,
  doorOf,
  FACES,
  GARDEN,
  spot,
  STAIR,
  stairAt,
  VENDING_MACHINE,
  WALKWAY,
  WALL_STAIR,
  wingBounds,
  type ApartmentPlan,
  type TerracePlan,
  type TerraceRoof,
  type Walks,
} from '../kit'
import { GROW } from '../landmarks'
import { PATTERN } from '../pattern'
import { BAY_WIDTH, binStore, MEDIUM_SCENES, mediumScene, parkingBays, type MediumScene } from '../props'
import {
  besideRow,
  corners,
  distance,
  fit,
  lotsOf,
  near,
  overlap,
  PLANTER,
  rows,
  runs,
  stands,
  turned,
  walled,
  yards,
  type Look,
  type RowLot,
  type Run,
  type ZoneGround,
} from './ground'
import { alongEdge, beside, clearOfKerbside, clearOfScenes, kerbAhead, placeScenes, sceneOrder, smaller, type Scene } from './scenes'

// Medium-density residential is terraces on half its Tiles and courtyards on the other half, the same on every Block
// of a Tile. Terraces: rows of houses 4.4 to 6.8 m wide and 8 to 10 m deep along every edge, their fronts 2.2 m in from
// it, and up to four trees in the yards behind; steel stairs up the end walls of about half the row ends where there
// is room and no bike rack stands (#156).
const TERRACES = { margin: 2.2, deep: [8, 10], wide: [4.4, 6.8], trees: 4, stairs: 0.45 } as const
// Courtyards: lots at most 42 m on a side, 3.2 m in from the Block's bounding box, built over all but 1.6 m of the lot
// on every side and 1.5 m in from the Block's edge, at least 9 m across, in wings 7.5 to 9 m deep and 4 to 7 storeys
// tall. A lot with room for a court 5 m across between its wings takes an O or a U, one with room for an L takes an L,
// and a narrower one a bar.
const COURTYARDS = { lot: 42, margin: 3.2, gap: 1.6, clear: 1.5, least: 9, wing: [7.5, 9], floors: [4, 7.4], court: 5 } as const
// Medium-density residential to the level of finish (#178). Each Block's plan is drawn from a stream of its own, so the
// kit's draws, and with them every lot's house or building, are as before but for what the plan sets. A terraced
// house's roof: a gable along the row, as before, or one of the others where a house beside it would otherwise be the
// same building in another colour. At most `corners` corner shops or coin laundries a Block, at a row's end facing a
// Road, on `corner` of those ends, a laundry `laundry` of the time. The alley behind the rows, `alley` m deep, in setts.
const MEDIUM_FINISH = {
  roofs: ['gable', 'front', 'hip'] as TerraceRoof[],
  corners: 2,
  corner: 0.45,
  laundry: 0.45,
  alley: { deep: 1.7, paving: '#ddd3c4' },
  // The scenes a Block picks from, and the area (m²) from which it has a second at Stage 3; and the ground of a shrine
  // where none fits otherwise (#193), along the edge and shallow, m.
  scenes: ['shrine', 'park', 'bathhouse'] as MediumScene[],
  second: 2500,
  shallow: [5.6, 3.4] as const,
  // An apartment block's mansard over a flat roof where a block beside it would otherwise be the same building.
  mansard: ['#b85a4c', '#4d6575', '#7a5a46', '#5aa69b', '#a8765a'],
  // Parking bays by an apartment block, m in from the Block's edge and deep, and how many fit at most and at least.
  bays: { in: 0.75, deep: 5.2, most: 3, least: 2 },
  // The garden behind a terraced house, beyond its alley: m deep; its soil and its rows of greens, the leaves'; the share
  // with a steel shed from Stage 2, and the share with one or a pole of washing.
  garden: {
    deep: 2,
    soil: '#8a7560',
    greens: ['#6bc357', '#85cf61', '#5fbc51'],
    shed: { wall: '#d9dcd2', roof: '#8f9aa5' },
    sheds: 0.25,
    washing: 0.5,
  },
  // A low hedge along an apartment block's walls, m deep and tall, in the gardens' hedge's green.
  hedge: { deep: 0.8, tall: 0.55, colour: GARDEN.hedge },
  // A delivery scooter's waits (s), off down the Road and at the door, at least and at most.
  scooter: { away: [8, 20], door: [5, 9] },
}
// The storeys a terraced house and a courtyard building stand at each Stage, from the storeys it draws, which are its
// Stage 2 storeys.
const TERRACE_STOREYS = (s: number, stage: number) => [Math.max(1, s - 1), s, s + 1][stage - 1]
const COURT_FLOORS = (f: number, stage: number) => [Math.max(3, f - 2), f, f + 2][stage - 1]

/** Medium-density residential's look (`./index`): terraces on half its Tiles and courtyards on the other half. */
export const look: Look = { landmarks: false, finish: true, fill: (g) => (g.tileDraw < 0.5 ? terraces(g) : courtyards(g)) }

/**
 * Medium-density residential, terraces: rows of narrow houses that share their walls, one to three storeys at Stage 2,
 * along every edge, with yards behind. Each house stands a storey lower at Stage 1 (one at least) and a storey higher
 * at Stage 3, with the finish its Stage gives it (the kit's `townhouse`, which also hangs its AC units and washing).
 * Its details (#156), each drawn from where it stands:
 * - Stage 2: a covered bike rack and a vending machine at the first row's end with room (`cornerStore`), and steel
 *   stairs up the end wall of some others to a door on the upper floor of an end house of two storeys or more.
 * - Stage 3: a second machine and more bicycles there, and a second rack and machine at the next row's end with room.
 */
function terraces(g: ZoneGround) {
  const { kit, block } = g
  const lots = rows(
    g,
    TERRACES.margin,
    () => kit.range(...TERRACES.deep),
    () => kit.range(...TERRACES.wide),
  )
  const centre = middle(block)
  const plans = mulberry32(spot(centre.x, centre.y) ^ 0x7e44ace) // the plans' own stream: the kit's draws as they did
  const scenes = kit.finished ? terraceScenes(g, lots, plans) : []
  const open = new Set(scenes.flatMap((s) => s.lots)) // the lots the scenes take
  const storeys: number[] = []
  const planned: TerracePlan[] = []
  const signs: RowLot[] = [] // the corner shops' end walls, where no rack or stairs stand
  let corners = 0
  for (const [i, l] of lots.entries()) {
    kit.lot(i, l)
    const s = kit.chance(0.3) ? 1 : kit.chance(0.72) ? 2 : 3
    storeys.push(s)
    if (open.has(i)) {
      kit.range(0, 1) // the draw its house's own stream took, so that every lot after it keeps its draws
      planned.push({ roof: 'gable', ends: [] })
      continue
    }
    const plan = terracePlan(lots, i, storeys, planned, plans, corners < MEDIUM_FINISH.corners, open)
    planned.push(plan)
    if (plan.corner) {
      corners++
      signs.push({ ...turned(l.x, l.y, l.ry, plan.corner.end * (l.w / 2 + 0.8), l.d / 2 - 1.3), w: 1.6, d: 2.8, ry: l.ry, onRoad: false })
    }
    kit.staged((stage) => kit.townhouse(l.x, l.y, KERB, l.w, l.d, l.ry, TERRACE_STOREYS(s, stage), stage, plan))
  }
  kit.lot(-1)
  const trees = yards(g, lots, TERRACES.trees, kit.finished)
  // The houses with what stands on their walls (#193), the lamps, the trees and the corner shops' end walls.
  const taken: RowLot[] = [...lots.map(walled), ...g.lamps.map(around(1.4)), ...trees.map(around(3)), ...signs]
  // A corner by a row's end (#156), beyond its end wall from its front back: one from Stage 2, a second from Stage 3.
  let from = 2
  for (const [i, l] of lots.entries()) {
    for (const s of from > 3 || open.has(i) ? [] : [1, -1]) {
      const [u0, u1] = [l.w / 2 + 0.1, l.w / 2 + 0.3 + CORNER.wide]
      const c = turned(l.x, l.y, l.ry, (s * (u0 + u1)) / 2, l.d / 2 - CORNER.long / 2)
      const ry = l.ry - (s * Math.PI) / 2 // facing out of the end wall, the corner's rack along it
      if (cornerStore(g, taken, { x: c.x, y: c.y, w: CORNER.long, d: u1 - u0, ry, onRoad: false }, from, -s)) from++
    }
  }
  // Steel stairs up some other row ends (#156), to a door on the upper floor of an end house of two storeys or more.
  const { landing } = STAIR
  const [W, rise] = [WALL_STAIR.wide, 3.04]
  const L = rise * WALL_STAIR.run + landing
  for (const [i, l] of lots.entries()) {
    for (const s of open.has(i) ? [] : [1, -1]) {
      const c = turned(l.x, l.y, l.ry, s * (l.w / 2 + 0.05 + W / 2), l.d / 2 - 0.2 - L / 2)
      const ry = l.ry - (s * Math.PI) / 2 // the wall at its back, its flight along the house's depth
      const stair = { x: c.x, y: c.y, w: L, d: W + 0.1, ry, onRoad: false }
      if (mulberry32(spot(c.x, c.y))() > TERRACES.stairs) continue
      if (!stands(g, c.x, c.y, L, W, 0.6, ry) || taken.some((o) => overlap(o, stair, 0)) || !kit.unclaimed(c.x, c.y, L, W, ry)) continue
      taken.push(stair)
      kit.lot(i)
      kit.staged(
        (stage) => {
          if (stage > 1 && TERRACE_STOREYS(storeys[i], stage) > 1) kit.wallStairs(c.x, c.y, KERB, ry, rise, -s)
        },
        spot(c.x, c.y + 1),
      )
    }
  }
  kit.lot(-1)
  if (!kit.finished) return
  alleys(
    g,
    lots.filter((_, i) => !open.has(i)),
  )
  for (const { kind, ground, from } of scenes) {
    kit.scene(kind, () => kit.staged((stage) => mediumScene(kit, kind, ground, stage, from), spot(ground.x, ground.y)))
    g.kept.push(ground)
    taken.push(ground)
  }
  gardens(
    g,
    lots.filter((_, i) => !open.has(i)),
    taken,
  )
  bins(g, plans, taken)
  const doors = lots.flatMap((l, i) => {
    if (open.has(i) || !l.onRoad) return []
    // Before its door; or, for a corner shop, beyond the row's end, coming in and going from the far side, so that it
    // waits and turns round clear of the awning over its front, which reaches 1.65 m out and to 0.25 m short of the
    // row's end: the scooter is 2.6 m long, and turns round 1.9 m to the side it does not come in from. It stops 1.05 m
    // out, its 1.1 m width clear of an AC unit under the front window (#193).
    const corner = planned[i].corner
    const u = corner ? corner.end * (l.w / 2 + 3.2) : l.w >= 5.6 ? l.w * 0.23 : 0
    return [{ ...turned(l.x, l.y, l.ry, u, l.d / 2 + 1.05), ry: l.ry, ...(corner ? { side: -corner.end } : {}) }]
  })
  for (const { ground: s } of scenes) doors.push({ ...turned(s.x, s.y, s.ry, 0, s.d / 2 + 0.9), ry: s.ry }) // a scene's front too
  // The scooter keeps out from under the corner shops' awnings, which reach 1.65 m out along the glazing.
  const awnings = lots.flatMap((l, i) =>
    planned[i].corner?.kind === 'shop' && !open.has(i)
      ? [{ ...turned(l.x, l.y, l.ry, 0, l.d / 2 + 0.85), w: l.w - 0.5, d: 1.6, ry: l.ry, onRoad: false }]
      : [],
  )
  deliveryScooter(g, plans, doors, [...taken, ...awnings])
}

/**
 * A terraced house's plan (#178), lot `i` of `lots` with its Stage 2 `storeys`, drawn from `plans` as the lots before it
 * were `planned`: its roof, a gable along the row as the rows always had unless a house on a lot it touches, or one
 * side by side with it across a bend or a corner of the row (`besideRow`, #193), stands as many storeys at Stage 1 under
 * one, when it takes a hip or a gable to the front, one that none of them has; its ends that close the row; and, if
 * `shop` and its front faces a Road at a row's end, on some a corner shop or a coin laundry in its ground floor. No two
 * houses side by side are then the same building in another colour at any Stage.
 * ponytail: a house beside houses of its storeys under all three roofs keeps a gable. Ceiling: it matches one of them;
 * none does over five seeds of the 26-Tile City (the scene check's rule 10). Upgrade: a fourth roof, such as a flat one
 * behind a parapet.
 */
function terracePlan(
  lots: RowLot[],
  i: number,
  storeys: number[],
  planned: TerracePlan[],
  plans: () => number,
  shop: boolean,
  open: Set<number>,
): TerracePlan {
  const l = lots[i]
  const first = (k: number) => TERRACE_STOREYS(storeys[k], 1)
  const grown = { ...l, w: l.w + 0.8, d: l.d + 0.8 }
  // The lots it touches, and those side by side with it across a bend or a corner of the row (#193).
  const nextTo = (k: number) => overlap(grown, lots[k]) || besideRow(lots[k], l)
  const near = planned.flatMap((p, k) => (!open.has(k) && first(k) === first(i) && nextTo(k) ? [p.roof] : []))
  const free = MEDIUM_FINISH.roofs.filter((r) => !near.includes(r))
  const roof = free.includes('gable') ? 'gable' : (free[Math.floor(plans() * free.length)] ?? 'gable')
  const ends = ([1, -1] as const).filter((end) => {
    const p = turned(l.x, l.y, l.ry, end * (l.w / 2 + 0.4), 0)
    return !lots.some((o, k) => k !== i && !open.has(k) && inside(corners(o, -0.1), p.x, p.y))
  })
  const roll = plans()
  const kind = plans() < MEDIUM_FINISH.laundry ? 'laundry' : ('shop' as const)
  if (!shop || !l.onRoad || !ends.length || roll >= MEDIUM_FINISH.corner) return { roof, ends }
  return { roof, ends, corner: { kind, end: ends[0] } }
}

/**
 * The alley behind each terraced row (#178): setts `MEDIUM_FINISH.alley.deep` m deep along the back of each house of
 * `lots`, where it lies on the Block clear of its edge; the pot plants along it are the houses' own.
 */
function alleys(g: ZoneGround, lots: RowLot[]) {
  const { kit } = g
  const { deep, paving } = MEDIUM_FINISH.alley
  for (const l of lots) {
    const p = turned(l.x, l.y, l.ry, 0, -l.d / 2 - deep / 2)
    if (!stands(g, p.x, p.y, l.w, deep, 0.6, l.ry)) continue
    kit.from(1, () => kit.paving(p.x, p.y, KERB, l.w, deep, l.ry, paving, PATTERN.setts), spot(p.x, p.y))
  }
}

/**
 * A garden behind each terraced house of `lots`, beyond its alley (#178), where it lies on the Block clear of `taken`,
 * which it then takes: a bed of soil under rows of greens, taller from Stage 2; and from Stage 2 a steel shed at one end
 * on some, and a pole of washing, which sways, on others. Each is drawn from where it lies.
 */
function gardens(g: ZoneGround, lots: RowLot[], taken: RowLot[]) {
  const { kit } = g
  const { deep, soil, greens, shed } = MEDIUM_FINISH.garden
  for (const l of lots) {
    const p = turned(l.x, l.y, l.ry, 0, -l.d / 2 - MEDIUM_FINISH.alley.deep - 0.25 - deep / 2)
    const bed = { ...p, w: l.w - 0.6, d: deep, ry: l.ry, onRoad: false }
    if (bed.w < 3 || !stands(g, p.x, p.y, bed.w, deep, 0.8, l.ry) || taken.some((o) => overlap(o, bed, 0))) continue
    taken.push(bed)
    const draw = mulberry32(spot(p.x, p.y))
    const [extra, side] = [draw(), draw() < 0.5 ? 1 : -1]
    const ry = l.ry + Math.PI // facing the house's back, across its alley
    kit.staged(
      (stage) => {
        const sheds = stage > 1 && extra < MEDIUM_FINISH.garden.sheds && bed.w >= 3.6
        const washes = stage > 1 && !sheds && extra < MEDIUM_FINISH.garden.washing
        kit.put(kit.cuboid(bed.w, 0.12, deep), soil, p.x, p.y, ry, 0, 0, KERB)
        const long = bed.w - (sheds ? 2.1 : 0.5)
        for (let r = 0; r < 3; r++)
          kit.put(
            kit.cuboid(long, 0.1 + 0.12 * stage, 0.3),
            greens[r],
            p.x,
            p.y,
            ry,
            sheds ? -side * 0.8 : 0,
            -deep / 2 + 0.45 + r * 0.6,
            KERB + 0.12,
          )
        kit.brick('ground', p.x, p.y, KERB)
        if (sheds) {
          const at = turned(p.x, p.y, ry, side * (bed.w / 2 - 0.75), 0)
          kit.put(kit.cuboid(1.3, 1.7, 1.1), shed.wall, at.x, at.y, ry, 0, 0, KERB)
          kit.put(kit.cuboid(1.5, 0.1, 1.3), shed.roof, at.x, at.y, ry, 0, 0, KERB + 1.7)
          kit.put(kit.cuboid(0.04, 1.4, 0.04), shed.roof, at.x, at.y, ry, 0, 0.57, KERB + 0.1)
          kit.shadow(at.x, at.y, KERB, 1.9, 1.7, false, ry)
          kit.brick('building', at.x, at.y, KERB)
        }
        const pole = turned(p.x, p.y, ry, 0, deep / 2 + 0.15)
        if (washes) kit.washingPole(pole.x, pole.y, KERB, ry)
      },
      spot(p.x, p.y) + 1,
    )
  }
}

/** A medium-density Block's scene (#178), and on a terraced Block the lots it takes, whose houses are not built. */
type MediumGround = Scene<MediumScene> & { lots: number[] }

/**
 * The scenes of a terraced Block (#178), drawn from `draw` before its houses are built (`sceneOrder`, `placeScenes`):
 * each on a span of up to three lots side by side facing a Road (any lots, on a Block with none), as wide as its kind
 * needs at least, the second not on or beside the first. Each takes its lots whole, whose houses are not built.
 * ponytail: a Block with no span of lots for even a shrine (5.2 m by 5.2 m) has no scene, and none says so. None does on
 * the 26-Tile City or among the 274 Blocks of every Layout at every rotation on each side of the starting Crossroads.
 * Ceiling: rule 5 (a scene on every Block from Stage 2) fails there. Upgrade: let a shrine take ground along the Block's
 * edge off the lots, as a courtyard Block's scenes do (`alongEdge`).
 */
function terraceScenes(g: ZoneGround, lots: RowLot[], draw: () => number): MediumGround[] {
  const order = sceneOrder(g, draw, MEDIUM_FINISH.scenes, MEDIUM_FINISH.second)
  const start = draw()
  const nextTo = (a: RowLot, b: RowLot) => Math.abs(a.ry - b.ry) < 1e-6 && Math.hypot(a.x - b.x, a.y - b.y) < (a.w + b.w) / 2 + 0.6
  return placeScenes<MediumScene, MediumGround>(order, MEDIUM_FINISH.scenes, (kind, out) => {
    const [wide, deep] = MEDIUM_SCENES[kind].least
    // On lots facing a Road, or else on any.
    for (let n = 0; n < 2 * lots.length; n++) {
      const road = n < lots.length
      const i = (Math.floor(start * lots.length) + n) % lots.length
      const span = [i]
      let width = lots[i].w
      while (width < wide && span.length < 3) {
        const j = span[span.length - 1] + 1
        if (j >= lots.length || !nextTo(lots[j - 1], lots[j])) break
        span.push(j)
        width += lots[j].w
      }
      if (width < wide || lots[i].d < deep || (road && !span.every((k) => lots[k].onRoad))) continue
      if (out.some((o) => o.lots.some((k) => span.some((j) => Math.abs(j - k) <= 1)))) continue
      const [a, b] = [lots[span[0]], lots[span[span.length - 1]]]
      const [p, q] = [turned(a.x, a.y, a.ry, -a.w / 2, 0), turned(b.x, b.y, b.ry, b.w / 2, 0)]
      return { ground: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, w: width, d: a.d, ry: a.ry, onRoad: true }, lots: span }
    }
    return null
  })
}

/**
 * The scenes of a courtyard Block (#178), drawn from `draw` once its buildings have taken their ground (`taken`, and
 * the metre `round` them): each along a run of its edge facing a Road where there is room clear of the buildings,
 * sliding along each run a metre at a time, the second 18 m or more from the first (`sceneOrder`, `placeScenes`); where
 * none finds room, a shrine on shallow ground (#193).
 */
function courtScenes(g: ZoneGround, draw: () => number, taken: RowLot[], round: RowLot[]): MediumGround[] {
  const order = sceneOrder(g, draw, MEDIUM_FINISH.scenes, MEDIUM_FINISH.second)
  const room = { lampRoom: 1.2, clear: 0.4, ends: 3, slide: true }
  const ok = (out: MediumGround[], clear: (l: RowLot) => boolean) => (l: RowLot) =>
    clearOfScenes(out, l) && clear(l) && g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry)
  const roomy = (l: RowLot) => ![...taken, ...round].some((o) => overlap(o, l))
  const out = placeScenes<MediumScene, MediumGround>(order, MEDIUM_FINISH.scenes, (kind, out) => {
    const { most, least } = MEDIUM_SCENES[kind]
    const ground = alongEdge(g, draw, runs(g, 0.8), smaller(most, least), room, ok(out, roomy))
    return ground && { ground, lots: [] }
  })
  // Where no kind finds ground, as on a small Block an O fills, a shrine on the shallow band between the edge and the
  // building, half a metre from its walls, its torii just before it (#193); a second shrine, if need be, on a long
  // Block whose buildings leave nothing else room.
  const near = (l: RowLot) => !taken.some((o) => overlap(o, l, -0.25))
  while (out.length < order.length) {
    const ground = alongEdge(g, draw, runs(g, 0.8), [MEDIUM_FINISH.shallow], room, ok(out, near))
    if (!ground) break
    out.push({ kind: 'shrine', ground, lots: [], from: out.length ? 3 : 2 })
  }
  return out
}

/** A bin store at the kerb of a medium-density Block (#178), Close-only, on ground clear of `taken`, which it then takes. */
function bins(g: ZoneGround, draw: () => number, taken: RowLot[]) {
  const room = { lampRoom: 1.2, clear: 0.4, ends: 4, slide: true }
  const ok = (l: RowLot) => !taken.some((o) => overlap(o, l, 0.02)) && g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry)
  const l = alongEdge(g, draw, runs(g, 0.65), [[2.1, 1.1]], room, ok)
  if (!l) return
  taken.push(l)
  g.kept.push(l)
  g.kit.from(1, () => binStore(g.kit, l.x, l.y, l.ry + Math.PI), spot(l.x, l.y))
}

/**
 * The delivery scooter of a medium-density Block (#178), from Stage 2: to the first of `doors` (a point on the pavement
 * before a front, its front's facing, and the side it turns round to if it must: 1 its right, -1 its left), in an order
 * drawn from `draw`, whose way in and out lies on the Block across a
 * pavement facing a Road, clear of the utility poles, the lamps, the street trees and `taken`. It waits off down the
 * Road, unseen; comes in over the kerb, growing as it leaves the Road as a car does at a Gateway; pulls up at the door
 * and waits; turns round on the pavement and goes back out over the kerb, shrinking away as it rejoins the Road. Returns
 * its way, or none if no door has room.
 * ponytail: a Block where no door's way keeps clear has no scooter, and none says so: 4 of the 26-Tile City's 67
 * Blocks, while every Tile keeps one. Ceiling: rule 6 (something moving on every Tile from Stage 2) fails on a Tile
 * whose every Block misses. Upgrade: try a tighter turn on the pavement, or a stop at the kerb itself.
 */
function deliveryScooter(g: ZoneGround, draw: () => number, doors: (Vec & { ry: number; side?: number })[], taken: RowLot[]): Vec[] {
  const { kit, field } = g
  const [away, wait] = [MEDIUM_FINISH.scooter.away, MEDIUM_FINISH.scooter.door]
  const waits = [away[0] + draw() * (away[1] - away[0]), wait[0] + draw() * (wait[1] - wait[0])]
  const shift = Math.floor(draw() * Math.max(1, doors.length))
  const side0 = draw() < 0.5 ? 1 : -1
  for (let n = 0; n < doors.length; n++) {
    const door = doors[(n + shift) % doors.length]
    const k = kerbAhead(g, { ...door, w: 0, d: 0, onRoad: true }, 0)
    if (k === null || k < 0.9 || k > 9) continue
    for (const s of door.side ? [door.side] : [side0, -side0]) {
      // In the door's frame, along its front and out of it: in from the kerb, up to the door, round, and out.
      const way = [
        [-s * 4.2, k - 0.12],
        [-s * 2.7, k * 0.55],
        [-s * 1.2, 0.08],
        [0, 0],
        [s * 1.1, 0],
        [s * 1.9, Math.min(0.45, k * 0.3)],
        [s * 1.8, k * 0.72],
        [s * 0.8, k - 0.42],
        [-s * 1.5, k - 0.42],
        [-s * 4.2, k - 0.12],
      ].map(([u, v]) => turned(door.x, door.y, door.ry, u, v))
      if (!clearOfKerbside(g, way, [1.2, 1.4, 1.8])) continue
      // Every half metre of it on the Block and clear of what stands there, but where it meets the kerb.
      const loop = polyline(way)
      let free = true
      for (let i = 1; i < way.length && free; i++) {
        const [a, b] = [way[i - 1], way[i]]
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5)
        for (let j = 0; j <= steps && free; j++) {
          const p = { x: a.x + ((b.x - a.x) * j) / steps, y: a.y + ((b.y - a.y) * j) / steps }
          const atKerb = (i === 1 && j === 0) || (i === way.length - 1 && j === steps)
          free = (atKerb || field.sample(p.x, p.y) > 0.05) && !taken.some((o) => near(o, p.x, p.y, 0.35))
        }
      }
      if (!free) continue
      kit.from(2, () => kit.mover('scooter', loop, [0, loop.cum[3]], 0, KERB, { waits, away: 0 }), spot(door.x, door.y) + 7)
      return way
    }
  }
  return []
}

/** A square `side` m across round a point, as a row lot. */
const around =
  (side: number) =>
  ({ x, y }: Vec): RowLot => ({ x, y, w: side, d: side, ry: 0, onRoad: false })

// Medium-density details (#156): a corner where a covered bike rack stands with vending machines beside it, against a
// wall: m along the wall and out from it, and the bicycles in the rack at Stages 2 and 3.
const CORNER = { long: BIKE_RACK.long + 0.3 + 2 * VENDING_MACHINE.wide + 0.25, wide: BIKE_RACK.deep + 0.2, bikes: [0, 4, 7] }

/**
 * A covered bike rack with vending machines beside it in the corner `corner` (#156), its length along a wall behind it
 * and its front facing `corner.ry`, if it stands on the Block clear of everything `taken`, which it then takes: whether
 * it did. The machines stand at the corner's end `toward` (1: its right, -1: its left) and the rack at the other, all
 * facing out from the wall. From Stage `from` (2 or 3), a rack and one machine, and at Stage 3 a second machine and
 * more bicycles. Each is drawn from where it stands.
 */
function cornerStore(g: ZoneGround, taken: RowLot[], corner: RowLot, from: number, toward: number): boolean {
  if (!stands(g, corner.x, corner.y, corner.w, corner.d, 0.6, corner.ry) || taken.some((o) => overlap(o, corner, 0))) return false
  if (!g.kit.unclaimed(corner.x, corner.y, corner.w, corner.d, corner.ry)) return false // nor before a door (#193)
  taken.push(corner)
  const { kit } = g
  const { x, y, ry } = corner
  const [L, W] = [CORNER.long, CORNER.wide]
  const { wide: VW, deep: VD } = VENDING_MACHINE
  const rack = turned(x, y, ry, -toward * (L / 2 - BIKE_RACK.long / 2 - 0.1), 0)
  kit.staged(
    (stage) => {
      if (stage >= from) kit.bikeRack(rack.x, rack.y, KERB, ry, BIKE_RACK.long, CORNER.bikes[stage - 1])
    },
    spot(rack.x, rack.y),
  )
  for (let k = 0; k < 2; k++) {
    const m = turned(x, y, ry, toward * (L / 2 - 0.1 - VW / 2 - k * (VW + 0.05)), -W / 2 + 0.1 + VD / 2)
    kit.from(k ? 3 : from, () => kit.vendingMachine(m.x, m.y, KERB, ry), spot(m.x, m.y))
  }
  return true
}

/**
 * Medium-density residential, courtyards: on each lot an apartment building round a court with a tree, an O or a U,
 * where the lot is large enough; an L where it is not, and a bar on a narrow lot. It stands two floors lower at Stage
 * 1 (three at least) and two higher at Stage 3, with the finish its Stage gives it (the kit's `apartment`). The court's
 * tree grows with the Stage, and at Stage 3 a hedge runs round the court's lawn. Its details (#156), each drawn from
 * where it stands:
 * - Stage 2: an open walkway along one long face of each wing (`walksOf`, drawn by the kit's `apartment`, which also
 *   hangs its AC units and washing), steel stairs at a free end of each where there is room, and a covered bike rack
 *   and a vending machine against an outside wall.
 * - Stage 3: a second machine and more bicycles.
 */
function courtyards(g: ZoneGround) {
  const { kit, block } = g
  const centre = middle(block)
  const plans = mulberry32(spot(centre.x, centre.y) ^ 0xc0a7) // the plans' own stream: the kit's draws as they did
  const built: Built[] = []
  for (const [i, lot] of lotsOf(g, COURTYARDS.margin, COURTYARDS.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w0, d0] = [lot.x1 - lot.x0 - 2 * COURTYARDS.gap, lot.y1 - lot.y0 - 2 * COURTYARDS.gap]
    const room = fit(g, x, y, w0, d0, COURTYARDS.clear, COURTYARDS.least, 5, 2)
    if (!room) continue
    const { w, d } = room
    kit.lot(i, lot)
    const [x0, y0, x1, y1] = [x - w / 2, y - d / 2, x + w / 2, y + d / 2]
    const deep = kit.range(...COURTYARDS.wing)
    const floors = Math.round(kit.range(...COURTYARDS.floors))
    const [north, south] = [
      { x0, y0: y1 - deep, x1, y1 },
      { x0, y0, x1, y1: y0 + deep },
    ]
    let wings: Bounds[]
    if (Math.min(w, d) >= 2 * deep + COURTYARDS.court) {
      wings = [north, south, { x0, y0: y0 + deep, x1: x0 + deep, y1: y1 - deep }, { x0: x1 - deep, y0: y0 + deep, x1, y1: y1 - deep }]
      if (kit.chance(0.4)) wings.splice(Math.floor(kit.range(0, 4)), 1)
      const [cw, cd] = [w - 2 * deep, d - 2 * deep]
      // Its court: a lawn; or, to the level of finish (#178), setts with its tree in a round bed.
      const lift = kit.finished ? 0.45 : 0.16 // the lawn's top, or the bed's
      if (kit.finished) {
        kit.paving(x, y, KERB, cw, cd, 0, MEDIUM_FINISH.alley.paving, PATTERN.setts)
        kit.drum(PLANTER, x, y, KERB, 1.3, 1.3, lift)
      } else kit.lawn(x, y, KERB, cw, cd)
      kit.brick('ground', x, y, KERB)
      const [size, kind] = [kit.range(0.7, 0.95), kit.chance(0.3) ? 'sakura' : 'round'] as const
      kit.staged((stage) => kit.tree(x, y, KERB + lift, GROW[stage - 1] * size, kind, kit.finished))
      kit.from(3, () => kit.hedge(x, y, KERB + (kit.finished ? 0 : 0.16), cw - 1.2, cd - 1.2, Math.floor(kit.range(0, 4))))
    } else if (Math.min(w, d) >= deep + 6) {
      const [top, left] = [kit.chance(0.5), kit.chance(0.5)]
      const [from, to] = top ? [y0, y1 - deep] : [y0 + deep, y1]
      wings = [top ? north : south, left ? { x0, y0: from, x1: x0 + deep, y1: to } : { x0: x1 - deep, y0: from, x1, y1: to }]
    } else wings = [{ x0, y0, x1, y1 }]
    const walks = walksOf(wings, mulberry32(spot(x, y))() < 0.5)
    const plan = courtPlan(built, lot, wings.length, floors, plans)
    kit.staged((stage) => kit.apartment(wings, KERB, COURT_FLOORS(floors, stage), stage, walks, plan))
    built.push({ lot: i, bounds: lot, x, y, wings, floors, walks, plan })
  }
  // Then, once every building has taken its ground, its scenes (#178) on ground clear of every building, and each
  // building's outside stairs and the corner where its bike rack and vending machines stand (#156), on its lot.
  const taken: RowLot[] = [...g.lamps.map(around(1.4)), ...built.flatMap((b) => b.wings.map(wingLot))]
  const aroundWings = built.flatMap((b) => b.wings.map((w) => ({ ...wingLot(w), w: w.x1 - w.x0 + 2, d: w.y1 - w.y0 + 2 }))) // a metre round each
  const scenes = kit.finished ? courtScenes(g, plans, taken, aroundWings) : []
  taken.push(...scenes.map((s) => s.ground))
  const stage1 = taken.length // what is taken from here on stands from Stage 2: the stairs and the racks
  for (const b of built) {
    kit.lot(b.lot)
    const draw = mulberry32(spot(b.x, b.y + 1))
    const { x0, y0, x1, y1 } = wingBounds(b.wings)
    const inCourt = (px: number, py: number) => px > x0 && px < x1 && py > y0 && py < y1
    b.wings.forEach((wing, k) => {
      const face = b.walks[k]
      if (face < 0) return
      for (const end of draw() < 0.5 ? [1, -1] : [-1, 1]) {
        const s = stairAt(wing, face, end)
        const lot = { x: s.x, y: s.y, w: STAIR.long + 0.3, d: STAIR.wide + 0.3, ry: s.ry, onRoad: false }
        if (walkwayBlocked(b.wings, k, face, end) || !stands(g, s.x, s.y, lot.w, lot.d, 0.6, s.ry) || taken.some((o) => overlap(o, lot, 0)))
          continue
        // Not in an O's or a U's court, round its tree and inside its Stage 3 hedge, nor before a door (#193).
        if ((b.wings.length >= 3 && inCourt(s.x, s.y)) || !kit.unclaimed(lot.x, lot.y, lot.w, lot.d, lot.ry)) continue
        taken.push(lot)
        kit.staged(
          (stage) => {
            if (stage > 1) kit.outsideStairs(s.x, s.y, s.ry, floorTops(COURT_FLOORS(b.floors, stage)))
          },
          spot(s.x, s.y),
        )
        break
      }
    })
    // Its rack and machines along the first stretch of outside wall with room, looking along each face in turn.
    const court = inCourt
    const tries = b.wings.flatMap((wing) =>
      FACES.flatMap(([nx, ny], face) => {
        const [len, mx, my] = faceOf(wing, face)
        if (court(mx + nx * 2, my + ny * 2) || len < CORNER.long + 1) return []
        const room = len / 2 - CORNER.long / 2 - 0.5
        return [0, room, -room].map((u) => ({
          x: mx + ny * u + nx * (0.15 + CORNER.wide / 2),
          y: my - nx * u + ny * (0.15 + CORNER.wide / 2),
          ry: Math.atan2(-nx, ny),
        }))
      }),
    )
    for (let k = tries.length - 1; k > 0; k--) {
      const j = Math.floor(draw() * (k + 1))
      ;[tries[k], tries[j]] = [tries[j], tries[k]]
    }
    const toward = draw() < 0.5 ? 1 : -1
    tries.some((t) => cornerStore(g, taken, { ...t, w: CORNER.long, d: CORNER.wide, onRoad: false }, 2, toward))
  }
  kit.lot(-1)
  const later = new Set(taken.slice(stage1))
  if (!kit.finished) return
  for (const { kind, ground, from } of scenes) {
    kit.scene(kind, () => kit.staged((stage) => mediumScene(kit, kind, ground, stage, from), spot(ground.x, ground.y)))
    g.kept.push(ground)
  }
  for (const b of built) courtGround(g, b, taken)
  parking(g, plans, taken, aroundWings)
  bins(g, plans, taken)
  // The scooter calls at a door along a building's face toward a Road.
  const doors = built.flatMap((b) =>
    b.wings.flatMap((wing, k) =>
      FACES.flatMap(([nx, ny], face) => {
        const [, mx, my] = faceOf(wing, face)
        if (!looksOut(b.wings, k, face)) return []
        const len = nx ? wing.y1 - wing.y0 : wing.x1 - wing.x0
        return [0, -len / 4, len / 4].map((u) => ({ x: mx + nx * 1.1 + ny * u, y: my + ny * 1.1 - nx * u, ry: Math.atan2(-nx, ny) }))
      }),
    ),
  )
  const way = deliveryScooter(g, plans, doors, taken)
  for (const b of built) plantings(g, b, taken, way)
  bareGround(g, built, taken, way, later)
}

/**
 * A pocket court on ground `l` (#178), from Stage 1: setts, a tree in a round bed in its middle that grows with the
 * Stage, and a bench beside the bed facing it, Close-only. Each is drawn from where it stands.
 */
function pocketCourt(g: ZoneGround, l: RowLot) {
  const { kit } = g
  const seat = turned(l.x, l.y, l.ry, Math.min(2.2, l.w / 2 - 0.35), 0)
  kit.from(
    1,
    () => {
      kit.paving(l.x, l.y, KERB, l.w, l.d, l.ry, MEDIUM_FINISH.alley.paving, PATTERN.setts)
      kit.drum(PLANTER, l.x, l.y, KERB, 1.1, 1.1, 0.45)
      kit.brick('building', l.x, l.y, KERB)
      kit.closeOnly(() => kit.bench(seat.x, seat.y, KERB, l.ry + Math.PI / 2))
    },
    spot(l.x, l.y),
  )
  kit.staged((stage) => kit.tree(l.x, l.y, KERB + 0.45, GROW[stage - 1] * 0.55, 'round', true), spot(l.x, l.y) + 1)
}

/** A tree in a round bed at `(x, y)` (#178), from Stage 1, growing with the Stage, drawn from where it stands. */
function bedTree(g: ZoneGround, x: number, y: number) {
  const { kit } = g
  kit.from(
    1,
    () => {
      kit.drum(PLANTER, x, y, KERB, 1.2, 1.2, 0.5)
      kit.brick('building', x, y, KERB)
    },
    spot(x, y),
  )
  kit.staged((stage) => kit.tree(x, y, KERB + 0.5, GROW[stage - 1] * 0.5, 'round', true), spot(x, y) + 1)
}

// What fills the bare paving round a courtyard Block's buildings (#178): m a cell of the grid it is read on; how far
// either way of its middle line a stretch lies bare, and how long it runs, to be filled; how far each filling keeps
// from what stands there; and how many a Block takes at most.
const BARE = { cell: 1, half: 2, long: 11, keep: 1, most: 40 }

/**
 * What fills the bare paving left round a courtyard Block's buildings (#178; rule 3, no 12 m of pavement stands empty),
 * from Stage 1, once all else has taken its ground (`taken`, the buildings `built` and the scooter's `way`), what is
 * `later` (from Stage 2) left bare: while a
 * stretch lies bare `BARE.half` m either way of its middle line for `BARE.long` m or more, in its middle a car park of
 * four bays or a pocket court, turn about, or a tree in a round bed where neither fits, facing the nearest run of the Block's edge and standing clear of
 * the lamps, the street trees, the poles and the scooter's way. Each takes its ground in `taken`. Read on a grid of
 * `BARE.cell` m.
 * ponytail: a stretch where none fits stays bare, as does any left after `BARE.most` fillings. On the 26-Tile City none
 * is left at Stages 2 and 3; at Stage 1 two are, beside ground where outside stairs and a rack stand from Stage 2,
 * which no filling takes. Ceiling: rule 3 fails there. Upgrade: a smaller filling, such as a planter.
 */
function bareGround(g: ZoneGround, built: Built[], taken: RowLot[], way: Vec[], later: Set<RowLot>) {
  const { block, field } = g
  const { cell: C, half, long, keep, most } = BARE
  const [x0, y0] = [block.x0, block.y0]
  const [nx, ny] = [Math.ceil((block.x1 - x0) / C), Math.ceil((block.y1 - y0) / C)]
  const at = (c: number) => ({ x: x0 + ((c % nx) + 0.5) * C, y: y0 + (Math.floor(c / nx) + 0.5) * C })
  const free = new Uint8Array(nx * ny)
  // On the Block: cells well in from its edge, flooded from its buildings' middles, so none of a Block next door counts.
  const stack = built.map((b) => Math.floor((b.y - y0) / C) * nx + Math.floor((b.x - x0) / C)).filter((c) => c >= 0 && c < nx * ny)
  for (const c of stack) free[c] = 1
  while (stack.length) {
    const c = stack.pop()!
    const [i, j] = [c % nx, Math.floor(c / nx)]
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const [ii, jj] = [i + di, j + dj]
      const n = jj * nx + ii
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny || free[n]) continue
      const p = at(n)
      if (field.sample(p.x, p.y) > 0.5) {
        free[n] = 1
        stack.push(n)
      }
    }
  }
  /** Mark bare no longer the cells within `pad` m of row lot `l`. */
  const cover = (l: RowLot, pad: number) => {
    const r = Math.hypot(l.w, l.d) / 2 + pad
    for (let j = Math.max(0, Math.floor((l.y - r - y0) / C)); j <= Math.min(ny - 1, Math.floor((l.y + r - y0) / C)); j++)
      for (let i = Math.max(0, Math.floor((l.x - r - x0) / C)); i <= Math.min(nx - 1, Math.floor((l.x + r - x0) / C)); i++) {
        const p = at(j * nx + i)
        if (near(l, p.x, p.y, pad)) free[j * nx + i] = 0
      }
  }
  // The buildings: an L's wings and a bar, and an O or a U whole, round its paved court.
  const buildings = built.flatMap((b) => (b.wings.length >= 3 ? [wingLot(wingBounds(b.wings))] : b.wings.map(wingLot)))
  for (const b of buildings) cover(b, 0.5)
  for (const l of taken) if (!later.has(l)) cover(l, 0.25) // the stairs and racks leave it bare at Stage 1
  for (const p of g.lamps) cover(around(1.6)(p), 0)
  for (const p of g.street) cover(around(3.6)(p), 0)
  for (const p of g.poles) cover(around(0.8)(p), 0)
  const edges = runs(g, 1)
  const passing = way.flatMap((a, i) => {
    if (!i) return []
    const b = way[i - 1]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5)
    return Array.from({ length: n + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }))
  })
  /** Whether ground `l` is clear to fill. */
  const clear = (l: RowLot) =>
    stands(g, l.x, l.y, l.w, l.d, 0.5, l.ry) &&
    !taken.some((o) => overlap(o, { ...l, w: l.w + 0.6, d: l.d + 0.6 })) &&
    !buildings.some((b) => overlap({ ...b, w: b.w + 1, d: b.d + 1 }, l)) &&
    ![...g.lamps, ...g.poles].some((p) => near(l, p.x, p.y, 1)) &&
    !passing.some((p) => near(l, p.x, p.y, keep)) &&
    g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry) // nor before a door or on a bay (#193)
  for (let placed = 0; placed < most; placed++) {
    // Each bare cell's distance to the nearest cell that is not, in two passes.
    const dist = new Float32Array(nx * ny)
    for (let c = 0; c < nx * ny; c++) dist[c] = free[c] ? 1e9 : 0
    const d = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : dist[j * nx + i])
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (dist[j * nx + i])
          dist[j * nx + i] = Math.min(
            dist[j * nx + i],
            d(i - 1, j) + 1,
            d(i, j - 1) + 1,
            d(i - 1, j - 1) + Math.SQRT2,
            d(i + 1, j - 1) + Math.SQRT2,
          )
    for (let j = ny - 1; j >= 0; j--)
      for (let i = nx - 1; i >= 0; i--)
        if (dist[j * nx + i])
          dist[j * nx + i] = Math.min(
            dist[j * nx + i],
            d(i + 1, j) + 1,
            d(i, j + 1) + 1,
            d(i + 1, j + 1) + Math.SQRT2,
            d(i - 1, j + 1) + Math.SQRT2,
          )
    // The longest stretch bare `half` m either way of its middle line.
    const seen = new Uint8Array(nx * ny)
    let worst: { cells: number[]; length: number } | null = null
    for (let c = 0; c < nx * ny; c++) {
      if (seen[c] || dist[c] * C < half) continue
      const cells = [c]
      seen[c] = 1
      for (let k = 0; k < cells.length; k++) {
        const [i, j] = [cells[k] % nx, Math.floor(cells[k] / nx)]
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const n = (j + dj) * nx + i + di
            if (i + di < 0 || j + dj < 0 || i + di >= nx || j + dj >= ny || seen[n] || dist[n] * C < half) continue
            seen[n] = 1
            cells.push(n)
          }
      }
      const far = (from: number) =>
        cells.reduce(
          (best, q) =>
            Math.hypot(at(q).x - at(from).x, at(q).y - at(from).y) > Math.hypot(at(best).x - at(from).x, at(best).y - at(from).y)
              ? q
              : best,
          from,
        )
      const a = far(cells[0])
      const b = far(a)
      const length = Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y) + 2 * half
      if (length >= long && (!worst || length > worst.length)) worst = { cells, length }
    }
    if (!worst) break
    // In its middle, as near as a filling fits, facing the nearest run of the Block's edge.
    const { cells } = worst
    const [mx, my] = [cells.reduce((s, q) => s + at(q).x, 0) / cells.length, cells.reduce((s, q) => s + at(q).y, 0) / cells.length]
    cells.sort((p, q) => Math.hypot(at(p).x - mx, at(p).y - my) - Math.hypot(at(q).x - mx, at(q).y - my))
    // A car park of four bays, a pocket court or a tree in a bed; on every other filling a court before a car park.
    const [park, court, bed] = [
      [4 * BAY_WIDTH, MEDIUM_FINISH.bays.deep],
      [5.2, 5.2],
      [3, 3],
    ]
    let done = false
    for (const [w, deep] of placed % 2 ? [court, park, bed] : [park, court, bed])
      for (const q of cells) {
        if (done) break
        const p = at(q)
        const off = (r: Run) => distance(p, r.a, { x: r.a.x + r.ux * r.len, y: r.a.y + r.uy * r.len })
        const run = edges.length ? edges.reduce((best, r) => (off(r) < off(best) ? r : best)) : null
        const l = { ...p, w, d: deep, ry: run?.ry ?? 0, onRoad: false }
        if (!clear(l)) continue
        taken.push(l)
        g.kept.push(l)
        if (w === park[0]) parkedBays(g, l)
        else if (w === court[0]) pocketCourt(g, l)
        else bedTree(g, l.x, l.y)
        cover(l, keep)
        done = true
      }
    if (!done) for (const q of cells) free[q] = 0 // nothing fits there: leave it
  }
}

/**
 * A low hedge along each outside face of apartment building `b` (#178), from Stage 1, 0.5 m out from its wall, in
 * lengths of 2 m or more where it stands on the Block clear of `taken` (by any amount, #193), of its front door and of
 * the scooter's `way`; none round an O's or a U's court.
 */
function plantings(g: ZoneGround, b: Built, taken: RowLot[], way: Vec[]) {
  const { kit } = g
  const { deep, tall, colour } = MEDIUM_FINISH.hedge
  const door = doorOf(b.wings, b.walks)
  const { x0, y0, x1, y1 } = wingBounds(b.wings)
  b.wings.forEach((wing, k) =>
    FACES.forEach(([nx, ny], face) => {
      if (!looksOut(b.wings, k, face)) return
      const [len, mx, my] = faceOf(wing, face)
      // Not into an O's or a U's court, which has its own hedge at Stage 3 (#193).
      const [cx, cy] = [mx + nx * 2, my + ny * 2]
      if (b.wings.length >= 3 && cx > x0 && cx < x1 && cy > y0 && cy < y1) return
      const ry = Math.atan2(-nx, ny)
      // How far along the face its front door stands, as `turned` runs: its canopy and step span 1.4 m either way.
      const at = door && k === 0 && face === door.face ? (door.x - mx) * Math.cos(ry) + (door.y - my) * Math.sin(ry) : null
      const free: number[] = [] // the metres along the face, from its left, where a length of hedge may stand
      for (let u = -len / 2 + 1; u <= len / 2 - 1; u += 1) {
        const p = turned(mx, my, ry, u, 0.5 + deep / 2)
        const slot = { ...p, w: 1, d: deep, ry, onRoad: false }
        const ok =
          !(at !== null && Math.abs(u - at) < 2) &&
          stands(g, p.x, p.y, 1, deep, 0.4, ry) &&
          !taken.some((o) => overlap(o, slot, 0)) &&
          !way.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1.4)
        if (ok) free.push(u)
      }
      for (let i = 0; i < free.length;) {
        let j = i
        while (j + 1 < free.length && free[j + 1] - free[j] < 1.01) j++
        if (j > i) {
          const [u0, u1] = [free[i] - 0.5, free[j] + 0.5]
          const p = turned(mx, my, ry, (u0 + u1) / 2, 0.5 + deep / 2)
          kit.from(
            1,
            () => {
              kit.add(kit.cuboid(u1 - u0, tall, deep), colour, p.x, p.y, KERB, ry)
              kit.brick('ground', p.x, p.y, KERB)
            },
            spot(p.x, p.y),
          )
          taken.push({ ...p, w: u1 - u0, d: deep, ry, onRoad: false })
          g.kept.push({ ...p, w: u1 - u0, d: deep, ry })
        }
        i = j + 1
      }
    }),
  )
}

/** An apartment building as `courtyards` lays it (#178): its lot, by index and bounds, its middle, wings, floors at Stage 2, walkways and plan. */
interface Built {
  lot: number
  bounds: Bounds
  x: number
  y: number
  wings: Bounds[]
  floors: number
  walks: Walks
  plan: ApartmentPlan
}

/**
 * An apartment building's plan (#178), on `lot`, with `shape` wings and `floors` at Stage 2, as the buildings `built`
 * before it have theirs: a flat roof behind a parapet, as before, unless a building of as many wings on a lot beside it
 * (`beside`) stands as many floors at Stage 1 under one, when it takes a mansard of tiles drawn from `plans`; so that no
 * two buildings side by side are the same building in another colour at any Stage.
 * ponytail: where buildings beside it already have both roofs, it keeps a flat one. Ceiling: a lot between two of the
 * same shape and floors, one flat and one under a mansard, matches one of them; none does on the 26-Tile City. Upgrade:
 * a third roof (a setback top floor) for that lot.
 */
function courtPlan(built: Built[], lot: Bounds, shape: number, floors: number, plans: () => number): ApartmentPlan {
  const first = COURT_FLOORS(floors, 1)
  const roofs = built
    .filter((b) => b.wings.length === shape && COURT_FLOORS(b.floors, 1) === first && beside(b.bounds, lot))
    .map((b) => b.plan.roof)
  const tiles = MEDIUM_FINISH.mansard[Math.floor(plans() * MEDIUM_FINISH.mansard.length)]
  return roofs.includes('flat') && !roofs.includes('mansard') ? { roof: 'mansard', tiles } : { roof: 'flat' }
}

/**
 * The ground of apartment building `b` (#178), from Stage 1, where it stands clear of `taken`: in an L's inner corner, a
 * court in setts with a tree in a round bed and a bench, Close-only; in an O's or a U's court, which `courtyards` paves,
 * a bench by its tree; and by a bar, a pocket court (`pocketCourt`) at its foot where there is ground.
 */
function courtGround(g: ZoneGround, b: Built, taken: RowLot[]) {
  const { kit } = g
  const { x0, y0, x1, y1 } = wingBounds(b.wings)
  if (b.wings.length >= 3) {
    if (Math.min(x1 - x0, y1 - y0) - 2 * (b.wings[0].y1 - b.wings[0].y0) >= 5.4)
      kit.from(1, () => kit.closeOnly(() => kit.bench(b.x + 1.9, b.y, KERB, -Math.PI / 2)), spot(b.x + 1.9, b.y))
    return
  }
  if (b.wings.length === 1) {
    // A bar's small court at its foot: by the middle or a quarter of a long face, the south or the east one first.
    const [wing] = b.wings
    for (const face of wing.x1 - wing.x0 >= wing.y1 - wing.y0 ? [1, 0] : [2, 3]) {
      const [len, mx, my] = faceOf(wing, face)
      const ry = Math.atan2(-FACES[face][0], FACES[face][1])
      for (const u of [0, -len / 4, len / 4]) {
        const l = { ...turned(mx, my, ry, u, 2.6), w: 4.6, d: 4.4, ry, onRoad: false }
        if (!stands(g, l.x, l.y, l.w, l.d, 0.6, ry) || taken.some((o) => overlap(o, l)) || g.lamps.some((p) => near(l, p.x, p.y, 1.2)))
          continue
        if (!kit.unclaimed(l.x, l.y, l.w, l.d, ry)) continue // nor before a door (#193)
        taken.push(l)
        g.kept.push(l)
        return pocketCourt(g, l)
      }
    }
    return
  }
  const [a, c] = b.wings // the wing along the north or south, and the other
  const [ix0, ix1] = c.x0 <= x0 + 0.01 ? [c.x1, x1] : [x0, c.x0]
  const [iy0, iy1] = a.y0 <= y0 + 0.01 ? [a.y1, y1] : [y0, a.y0]
  const court = { x: (ix0 + ix1) / 2, y: (iy0 + iy1) / 2, w: ix1 - ix0 - 1, d: iy1 - iy0 - 1, ry: 0, onRoad: false }
  if (Math.min(court.w, court.d) < 4 || !stands(g, court.x, court.y, court.w, court.d, 0.6) || taken.some((o) => overlap(o, court))) return
  if (!kit.unclaimed(court.x, court.y, court.w, court.d)) return // nor before a door (#193)
  taken.push(court)
  // The tree in the corner the wings make, the bench facing it.
  const tx = c.x0 <= x0 + 0.01 ? ix0 + 1.6 : ix1 - 1.6
  const ty = a.y0 <= y0 + 0.01 ? iy1 - 1.6 : iy0 + 1.6
  const out = Math.sign(court.x - tx) || 1
  kit.from(
    1,
    () => {
      kit.paving(court.x, court.y, KERB, court.w, court.d, 0, MEDIUM_FINISH.alley.paving, PATTERN.setts)
      kit.drum(PLANTER, tx, ty, KERB, 1.1, 1.1, 0.45)
      kit.brick('building', tx, ty, KERB)
      kit.closeOnly(() => kit.bench(tx + out * 2.4, ty, KERB, (out * Math.PI) / 2))
    },
    spot(tx, ty),
  )
  kit.staged((stage) => kit.tree(tx, ty, KERB + 0.45, GROW[stage - 1] * 0.55, 'round', true), spot(tx, ty) + 1)
}

/**
 * Parking bays by an apartment block (#178), from Stage 1: three bays, or two where three do not fit, along a run of
 * the Block's edge facing a Road, open to it, where there is room clear of `taken` and the buildings' room round them
 * (`room`), with a kei car (the cars' `KEI`) nosed into one from Stage 2 and into another at Stage 3, in the cars'
 * colours. The bays and their cars then take their ground in `taken`.
 */
function parking(g: ZoneGround, draw: () => number, taken: RowLot[], room: RowLot[]) {
  const { most, least, deep } = MEDIUM_FINISH.bays
  const sizes: [number, number][] = [
    [most * BAY_WIDTH, deep],
    [least * BAY_WIDTH, deep],
  ]
  const clear = (l: RowLot) => l.onRoad && !taken.some((o) => overlap(o, l, 0)) && !room.some((o) => overlap(o, l))
  const l = alongEdge(g, draw, runs(g, MEDIUM_FINISH.bays.in), sizes, { lampRoom: 1.2, clear: 0.4, ends: 3, slide: true }, clear)
  if (!l) return
  taken.push({ ...l, ...turned(l.x, l.y, l.ry, 0, -0.2), w: l.w + 0.4, d: l.d + 0.4 }) // and a margin, so no hedge stands on its lines
  g.kept.push(l)
  parkedBays(g, l)
}

/** Parking bays on ground `l` (#178), as many as fit across it, open to its front, with a kei car in the first from Stage 2 and the last at Stage 3. */
function parkedBays(g: ZoneGround, l: RowLot) {
  const { kit } = g
  const bays = Math.round(l.w / BAY_WIDTH)
  kit.from(1, () => parkingBays(kit, l, bays), spot(l.x, l.y))
  ;[0, bays - 1].forEach((k, n) => {
    const p = turned(l.x, l.y, l.ry, -l.w / 2 + (k + 0.5) * BAY_WIDTH, -0.15)
    const paint = KEI.paints[spot(p.x, p.y) % KEI.paints.length]
    kit.from(n ? 3 : 2, () => kit.parked(KEI, p.x, p.y, KERB + 0.02, l.ry + Math.PI, paint), spot(p.x, p.y))
  })
}

/** A wing as a row lot. */
const wingLot = (w: Bounds): RowLot => ({
  x: (w.x0 + w.x1) / 2,
  y: (w.y0 + w.y1) / 2,
  w: w.x1 - w.x0,
  d: w.y1 - w.y0,
  ry: 0,
  onRoad: false,
})

/** Whether `(px, py)` lies on a wing of `wings` other than wing `self`. */
const onWing = (wings: Bounds[], px: number, py: number, self: number) =>
  wings.some((o, k) => k !== self && px > o.x0 - 0.05 && px < o.x1 + 0.05 && py > o.y0 - 0.05 && py < o.y1 + 0.05)

/** Whether face `face` (of `FACES`) of wing `k` of `wings` looks out of the building, its middle against no other wing. */
function looksOut(wings: Bounds[], k: number, face: number): boolean {
  const [, mx, my] = faceOf(wings[k], face)
  const [nx, ny] = FACES[face]
  return !onWing(wings, mx + nx * 0.4, my + ny * 0.4, k)
}

/** Face `face` (of `FACES`) of a wing: how long it is, and its middle. */
function faceOf(wing: Bounds, face: number): [len: number, x: number, y: number] {
  const [nx, ny] = FACES[face]
  const [cx, cy, w, d] = [(wing.x0 + wing.x1) / 2, (wing.y0 + wing.y1) / 2, wing.x1 - wing.x0, wing.y1 - wing.y0]
  return [nx === 0 ? w : d, cx + (nx * w) / 2, cy + (ny * d) / 2]
}

/**
 * Which face of each of an apartment building's wings its walkway runs along (#156): a long face, the north or west
 * one if `northWest`, else the south or east one, or the other long face where that one's middle is against another
 * wing, or none.
 */
function walksOf(wings: Bounds[], northWest: boolean): Walks {
  return wings.map((wing, k) => {
    const long = wing.x1 - wing.x0 >= wing.y1 - wing.y0
    const faces = long ? [0, 1] : [3, 2] // north and south, or west and east
    for (const face of northWest ? faces : faces.reverse()) if (looksOut(wings, k, face)) return face
    return -1
  })
}

/** Whether the walkway along face `face` of wing `k` runs into another wing at its end `end`, where no stair may meet it. */
function walkwayBlocked(wings: Bounds[], k: number, face: number, end: number): boolean {
  const [len, mx, my] = faceOf(wings[k], face)
  const [nx, ny] = FACES[face]
  const [u, v] = [end * (len / 2 - 0.3), WALKWAY.deep / 2]
  return onWing(wings, mx + ny * u + nx * v, my - nx * u + ny * v, k)
}

/** The heights above the road of the landings of a building's outside stairs, `floors` storeys tall: the ground, then each walkway. */
const floorTops = (floors: number) => [KERB, ...Array.from({ length: floors - 1 }, (_, f) => KERB + 0.94 + (f + 1) * 3.2)]
