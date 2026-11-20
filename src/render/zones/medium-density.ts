import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { type Bounds, middle, polyline, type Vec } from '../../sim/geometry'
import { KERB } from '../blocks'
import { KEI } from '../cars'
import { inside } from '../field'
import {
  AERIAL,
  AIRCON,
  baysOf,
  BAYS_AND_DOORS,
  BIKES,
  BIKE_RACK,
  boxFace,
  CREAM,
  DOOR,
  DOOR_LIGHT,
  FACES,
  FRONTAGE,
  GARDEN,
  HOME,
  type Kit,
  type Look as KitLook,
  LEAVES,
  LEDGE,
  POOL,
  SHAPES,
  spot,
  STAIR,
  stairAt,
  TANK,
  to,
  VENDING_MACHINE,
  type Walks,
  WALKWAY,
  wingBounds,
} from '../kit'
import { GROW } from '../landmarks'
import { PATTERN } from '../pattern'
import { bench, gardenShed, SETTS, SHRINE, shrine, waiting } from '../props'
import { type Footprint } from '../kerbside'
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
// Medium-density residential built to the Finish (#178). Each Block's plan is drawn from a stream of its own, so the
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
 * at Stage 3, with the finish its Stage gives it (`townhouse`, which also hangs its AC units and washing).
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
    kit.staged((stage) => townhouse(kit, l.x, l.y, KERB, l.w, l.d, l.ry, TERRACE_STOREYS(s, stage), stage, plan))
  }
  kit.lot(-1)
  yards(g, lots, TERRACES.trees, kit.finished)
  // The houses with what stands on their walls (#193), the lamps' room and the corner shops' end walls (#198); the
  // yard's trees claim their own.
  for (const l of [...lots.map(walled), ...g.lamps.map(around(1.4)), ...signs]) kit.stand(l.x, l.y, l.w, l.d, l.ry)
  // A corner by a row's end (#156), beyond its end wall from its front back: one from Stage 2, a second from Stage 3.
  let from = 2
  for (const [i, l] of lots.entries()) {
    for (const s of from > 3 || open.has(i) ? [] : [1, -1]) {
      const [u0, u1] = [l.w / 2 + 0.1, l.w / 2 + 0.3 + CORNER.wide]
      const c = turned(l.x, l.y, l.ry, (s * (u0 + u1)) / 2, l.d / 2 - CORNER.long / 2)
      const ry = l.ry - (s * Math.PI) / 2 // facing out of the end wall, the corner's rack along it
      if (cornerStore(g, { x: c.x, y: c.y, w: CORNER.long, d: u1 - u0, ry, onRoad: false }, from, -s)) from++
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
      if (mulberry32(spot(c.x, c.y))() > TERRACES.stairs) continue
      const free = kit.unclaimed(c.x, c.y, L, W + 0.1, ry, 0, ['stand']) && kit.unclaimed(c.x, c.y, L, W, ry, 0, BAYS_AND_DOORS)
      if (!stands(g, c.x, c.y, L, W, 0.6, ry) || !free) continue
      kit.stand(c.x, c.y, L, W + 0.1, ry, 2)
      kit.lot(i)
      kit.staged(
        (stage) => {
          if (stage > 1 && TERRACE_STOREYS(storeys[i], stage) > 1) wallStairs(kit, c.x, c.y, KERB, ry, rise, -s)
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
    kit.stand(ground.x, ground.y, ground.w, ground.d, ground.ry)
  }
  gardens(
    g,
    lots.filter((_, i) => !open.has(i)),
  )
  bins(g, plans)
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
  // The scooter keeps out from under the corner shops' awnings, which reach 1.65 m out along the glazing: the last
  // ground claimed, which nothing else on the pavement asks after.
  for (const [i, l] of lots.entries()) {
    if (planned[i].corner?.kind !== 'shop' || open.has(i)) continue
    const a = turned(l.x, l.y, l.ry, 0, l.d / 2 + 0.85)
    kit.stand(a.x, a.y, l.w - 0.5, 1.6, l.ry)
  }
  deliveryScooter(g, plans, doors)
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
 * A garden behind each terraced house of `lots`, beyond its alley (#178), where it lies on the Block on unclaimed
 * ground, which it then claims (#198): a bed of soil under rows of greens, taller from Stage 2; and from Stage 2 a steel shed at one end
 * on some, and a pole of washing, which sways, on others. Each is drawn from where it lies.
 */
function gardens(g: ZoneGround, lots: RowLot[]) {
  const { kit } = g
  const { deep, soil, greens } = MEDIUM_FINISH.garden
  for (const l of lots) {
    const p = turned(l.x, l.y, l.ry, 0, -l.d / 2 - MEDIUM_FINISH.alley.deep - 0.25 - deep / 2)
    const bed = { ...p, w: l.w - 0.6, d: deep, ry: l.ry, onRoad: false }
    if (bed.w < 3 || !stands(g, p.x, p.y, bed.w, deep, 0.8, l.ry) || !kit.unclaimed(p.x, p.y, bed.w, deep, l.ry)) continue
    kit.stand(p.x, p.y, bed.w, deep, l.ry)
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
          gardenShed(kit, at.x, at.y, KERB, ry)
        }
        const pole = turned(p.x, p.y, ry, 0, deep / 2 + 0.15)
        if (washes) washingPole(kit, pole.x, pole.y, KERB, ry)
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
 * The scenes of a courtyard Block (#178), drawn from `draw` once its buildings have claimed their ground, and the metre
 * `round` them: each along a run of its edge facing a Road where there is room clear of the buildings,
 * sliding along each run a metre at a time, the second 18 m or more from the first (`sceneOrder`, `placeScenes`); where
 * none finds room, a shrine on shallow ground (#193).
 */
function courtScenes(g: ZoneGround, draw: () => number, round: RowLot[]): MediumGround[] {
  const order = sceneOrder(g, draw, MEDIUM_FINISH.scenes, MEDIUM_FINISH.second)
  const room = { lampRoom: 1.2, clear: 0.4, ends: 3, slide: true }
  /**
   * Whether ground `l` keeps off the scenes `out`, the bays and the door steps, and what stands with both grown `by` m
   * each side (shrunk, if below 0), and as `clear` has it (#198).
   */
  const ok =
    (out: MediumGround[], by: number, clear = (_: RowLot) => true) =>
    (l: RowLot) =>
      clearOfScenes(out, l) &&
      g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry, by, ['stand']) &&
      g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry, 0, BAYS_AND_DOORS) &&
      clear(l)
  // Clear of the buildings' room round them.
  const roomy = (l: RowLot) => !round.some((o) => overlap(o, l))
  const out = placeScenes<MediumScene, MediumGround>(order, MEDIUM_FINISH.scenes, (kind, out) => {
    const { most, least } = MEDIUM_SCENES[kind]
    const ground = alongEdge(g, draw, runs(g, 0.8), smaller(most, least), room, ok(out, -0.15, roomy))
    return ground && { ground, lots: [] }
  })
  // Where no kind finds ground, as on a small Block an O fills, a shrine on the shallow band between the edge and the
  // building, half a metre from its walls, its torii just before it (#193); a second shrine, if need be, on a long
  // Block whose buildings leave nothing else room.
  while (out.length < order.length) {
    const ground = alongEdge(g, draw, runs(g, 0.8), [MEDIUM_FINISH.shallow], room, ok(out, 0.25))
    if (!ground) break
    out.push({ kind: 'shrine', ground, lots: [], from: out.length ? 3 : 2 })
  }
  return out
}

/** A bin store at the kerb of a medium-density Block (#178), Block-zoom, on unclaimed ground, which it then claims. */
function bins(g: ZoneGround, draw: () => number) {
  const room = { lampRoom: 1.2, clear: 0.4, ends: 4, slide: true }
  // Clear of what stands but for a sliver (0.02 m in from each side of both), and of the bays and door steps.
  const ok = (l: RowLot) =>
    g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry, -0.02, ['stand']) && g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry, 0, BAYS_AND_DOORS)
  const l = alongEdge(g, draw, runs(g, 0.65), [[2.1, 1.1]], room, ok)
  if (!l) return
  g.kit.stand(l.x, l.y, l.w, l.d, l.ry)
  g.kit.from(1, () => binStore(g.kit, l.x, l.y, l.ry + Math.PI), spot(l.x, l.y))
}

/**
 * The delivery scooter of a medium-density Block (#178), from Stage 2: to the first of `doors` (a point on the pavement
 * before a front, its front's facing, and the side it turns round to if it must: 1 its right, -1 its left), in an order
 * drawn from `draw`, whose way in and out lies on the Block across a
 * pavement facing a Road, clear of the utility poles, the lamps, the street trees and the ground claimed, though it
 * crosses bays and door steps. It waits off down the
 * Road, unseen; comes in over the kerb, growing as it leaves the Road as a car does at a Gateway; pulls up at the door
 * and waits; turns round on the pavement and goes back out over the kerb, shrinking away as it rejoins the Road. Returns
 * its way, or none if no door has room.
 * ponytail: a Block where no door's way keeps clear has no scooter, and none says so: 4 of the 26-Tile City's 67
 * Blocks, while every Tile keeps one. Ceiling: rule 6 (something moving on every Tile from Stage 2) fails on a Tile
 * whose every Block misses. Upgrade: try a tighter turn on the pavement, or a stop at the kerb itself.
 */
function deliveryScooter(g: ZoneGround, draw: () => number, doors: (Vec & { ry: number; side?: number })[]): Vec[] {
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
          free = (atKerb || field.sample(p.x, p.y) > 0.05) && kit.unclaimed(p.x, p.y, 0, 0, 0, 0.35, ['stand'])
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
 * and its front facing `corner.ry`, if it stands on the Block on unclaimed ground, which it then claims: whether it
 * did. The machines stand at the corner's end `toward` (1: its right, -1: its left) and the rack at the other, all
 * facing out from the wall. From Stage `from` (2 or 3), a rack and one machine, and at Stage 3 a second machine and
 * more bicycles. Each is drawn from where it stands.
 */
function cornerStore(g: ZoneGround, corner: RowLot, from: number, toward: number): boolean {
  if (!stands(g, corner.x, corner.y, corner.w, corner.d, 0.6, corner.ry)) return false
  if (!g.kit.unclaimed(corner.x, corner.y, corner.w, corner.d, corner.ry)) return false // nor before a door (#193)
  g.kit.stand(corner.x, corner.y, corner.w, corner.d, corner.ry, from)
  const { kit } = g
  const { x, y, ry } = corner
  const [L, W] = [CORNER.long, CORNER.wide]
  const { wide: VW, deep: VD } = VENDING_MACHINE
  const rack = turned(x, y, ry, -toward * (L / 2 - BIKE_RACK.long / 2 - 0.1), 0)
  kit.staged(
    (stage) => {
      if (stage >= from) bikeRack(kit, rack.x, rack.y, KERB, ry, BIKE_RACK.long, CORNER.bikes[stage - 1])
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
 * 1 (three at least) and two higher at Stage 3, with the finish its Stage gives it (`apartment`). The court's
 * tree grows with the Stage, and at Stage 3 a hedge runs round the court's lawn. Its details (#156), each drawn from
 * where it stands:
 * - Stage 2: an open walkway along one long face of each wing (`walksOf`, drawn by `apartment`, which also
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
      // Its court: a lawn; or, to the Finish (#178), setts with its tree in a round bed.
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
    kit.staged((stage) => apartment(kit, wings, KERB, COURT_FLOORS(floors, stage), stage, walks, plan))
    built.push({ lot: i, bounds: lot, x, y, wings, floors, walks, plan })
  }
  // Then, once every building has taken its ground, its scenes (#178) on ground clear of every building, and each
  // building's outside stairs and the corner where its bike rack and vending machines stand (#156), on its lot.
  // The lamps' room and the wings claimed (#198); and a metre round each wing, which the scenes and the parking keep off
  // though the stairs and the racks stand in it.
  for (const l of [...g.lamps.map(around(1.4)), ...built.flatMap((b) => b.wings.map(wingLot))]) kit.stand(l.x, l.y, l.w, l.d, l.ry)
  const aroundWings = built.flatMap((b) => b.wings.map((w) => ({ ...wingLot(w), w: w.x1 - w.x0 + 2, d: w.y1 - w.y0 + 2 })))
  const scenes = kit.finished ? courtScenes(g, plans, aroundWings) : []
  for (const { ground: s } of scenes) kit.stand(s.x, s.y, s.w, s.d, s.ry)
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
        if (walkwayBlocked(b.wings, k, face, end) || !stands(g, s.x, s.y, lot.w, lot.d, 0.6, s.ry)) continue
        // Not in an O's or a U's court, round its tree and inside its Stage 3 hedge, nor before a door (#193).
        if ((b.wings.length >= 3 && inCourt(s.x, s.y)) || !kit.unclaimed(lot.x, lot.y, lot.w, lot.d, lot.ry)) continue
        kit.stand(lot.x, lot.y, lot.w, lot.d, lot.ry, 2)
        kit.staged(
          (stage) => {
            if (stage > 1) outsideStairs(kit, s.x, s.y, s.ry, floorTops(COURT_FLOORS(b.floors, stage)))
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
    tries.some((t) => cornerStore(g, { ...t, w: CORNER.long, d: CORNER.wide, onRoad: false }, 2, toward))
  }
  kit.lot(-1)
  if (!kit.finished) return
  for (const { kind, ground, from } of scenes) {
    kit.scene(kind, () => kit.staged((stage) => mediumScene(kit, kind, ground, stage, from), spot(ground.x, ground.y)))
  }
  for (const b of built) courtGround(g, b)
  parking(g, plans, aroundWings)
  bins(g, plans)
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
  const way = deliveryScooter(g, plans, doors)
  for (const b of built) plantings(g, b, way)
  bareGround(g, built, way)
}

/**
 * A pocket court on ground `l` (#178), from Stage 1: setts, a tree in a round bed in its middle that grows with the
 * Stage, and a bench beside the bed facing it, Block-zoom. Each is drawn from where it stands.
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
      kit.blockZoomProps(() => kit.bench(seat.x, seat.y, KERB, l.ry + Math.PI / 2))
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
 * from Stage 1, once all else has claimed its ground (`kit.claimed`, the buildings `built` and the scooter's `way`), what
 * stands only from Stage 2 left bare: while a
 * stretch lies bare `BARE.half` m either way of its middle line for `BARE.long` m or more, in its middle a car park of
 * four bays or a pocket court, turn about, or a tree in a round bed where neither fits, facing the nearest run of the Block's edge and standing clear of
 * the lamps, the street trees, the poles and the scooter's way, on unclaimed ground, which each claims. Read on a grid of
 * `BARE.cell` m.
 * ponytail: a stretch where none fits stays bare, as does any left after `BARE.most` fillings. On the 26-Tile City none
 * is left at Stages 2 and 3; at Stage 1 two are, beside ground where outside stairs and a rack stand from Stage 2,
 * which no filling takes. Ceiling: rule 3 fails there. Upgrade: a smaller filling, such as a planter.
 */
function bareGround(g: ZoneGround, built: Built[], way: Vec[]) {
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
  for (const c of g.kit.claimed(1)) cover({ ...c, onRoad: false }, 0.25) // the stairs and racks leave it bare at Stage 1
  for (const p of g.lamps) cover(around(1.6)(p), 0)
  for (const p of g.kerbsideTrees) cover(around(3.6)(p), 0)
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
    g.kit.unclaimed(l.x, l.y, l.w + 0.6, l.d + 0.6, l.ry, -0.15, ['stand']) && // grown 0.3 m, but for a sliver
    g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry, 0, BAYS_AND_DOORS) && // nor before a door or on a bay (#193)
    !buildings.some((b) => overlap({ ...b, w: b.w + 1, d: b.d + 1 }, l)) &&
    ![...g.lamps, ...g.poles].some((p) => near(l, p.x, p.y, 1)) &&
    !passing.some((p) => near(l, p.x, p.y, keep))
  for (let filled = 0; filled < most; filled++) {
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
    for (const [w, deep] of filled % 2 ? [court, park, bed] : [park, court, bed])
      for (const q of cells) {
        if (done) break
        const p = at(q)
        const off = (r: Run) => distance(p, r.a, { x: r.a.x + r.ux * r.len, y: r.a.y + r.uy * r.len })
        const run = edges.length ? edges.reduce((best, r) => (off(r) < off(best) ? r : best)) : null
        const l = { ...p, w, d: deep, ry: run?.ry ?? 0, onRoad: false }
        if (!clear(l)) continue
        g.kit.stand(l.x, l.y, l.w, l.d, l.ry)
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
 * lengths of 2 m or more where it stands on the Block on unclaimed ground (by any amount, #193), which it then claims,
 * clear of its front door and of the scooter's `way`; none round an O's or a U's court.
 */
function plantings(g: ZoneGround, b: Built, way: Vec[]) {
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
        const ok =
          !(at !== null && Math.abs(u - at) < 2) &&
          stands(g, p.x, p.y, 1, deep, 0.4, ry) &&
          kit.unclaimed(p.x, p.y, 1, deep, ry) &&
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
          kit.stand(p.x, p.y, u1 - u0, deep, ry)
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
 * The ground of apartment building `b` (#178), from Stage 1, on unclaimed ground, which it claims: in an L's inner corner, a
 * court in setts with a tree in a round bed and a bench, Block-zoom; in an O's or a U's court, which `courtyards`
 * paves, a bench by its tree; and by a bar, a pocket court (`pocketCourt`) at its foot where there is ground.
 */
function courtGround(g: ZoneGround, b: Built) {
  const { kit } = g
  const { x0, y0, x1, y1 } = wingBounds(b.wings)
  if (b.wings.length >= 3) {
    if (Math.min(x1 - x0, y1 - y0) - 2 * (b.wings[0].y1 - b.wings[0].y0) >= 5.4)
      kit.from(1, () => kit.blockZoomProps(() => kit.bench(b.x + 1.9, b.y, KERB, -Math.PI / 2)), spot(b.x + 1.9, b.y))
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
        if (!stands(g, l.x, l.y, l.w, l.d, 0.6, ry) || g.lamps.some((p) => near(l, p.x, p.y, 1.2))) continue
        // Clear of what stands but for a sliver (0.15 m in from each side of both), nor before a door (#193).
        if (!kit.unclaimed(l.x, l.y, l.w, l.d, ry, -0.15, ['stand']) || !kit.unclaimed(l.x, l.y, l.w, l.d, ry, 0, BAYS_AND_DOORS)) continue
        kit.stand(l.x, l.y, l.w, l.d, ry)
        return pocketCourt(g, l)
      }
    }
    return
  }
  const [a, c] = b.wings // the wing along the north or south, and the other
  const [ix0, ix1] = c.x0 <= x0 + 0.01 ? [c.x1, x1] : [x0, c.x0]
  const [iy0, iy1] = a.y0 <= y0 + 0.01 ? [a.y1, y1] : [y0, a.y0]
  const court = { x: (ix0 + ix1) / 2, y: (iy0 + iy1) / 2, w: ix1 - ix0 - 1, d: iy1 - iy0 - 1, ry: 0, onRoad: false }
  if (Math.min(court.w, court.d) < 4 || !stands(g, court.x, court.y, court.w, court.d, 0.6)) return
  // Clear of what stands but for a sliver, as above, nor before a door (#193).
  if (!kit.unclaimed(court.x, court.y, court.w, court.d, 0, -0.15, ['stand'])) return
  if (!kit.unclaimed(court.x, court.y, court.w, court.d, 0, 0, BAYS_AND_DOORS)) return
  kit.stand(court.x, court.y, court.w, court.d)
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
      kit.blockZoomProps(() => kit.bench(tx + out * 2.4, ty, KERB, (out * Math.PI) / 2))
    },
    spot(tx, ty),
  )
  kit.staged((stage) => kit.tree(tx, ty, KERB + 0.45, GROW[stage - 1] * 0.55, 'round', true), spot(tx, ty) + 1)
}

/**
 * Parking bays by an apartment block (#178), from Stage 1: three bays, or two where three do not fit, along a run of
 * the Block's edge facing a Road, open to it, on unclaimed ground clear of the buildings' room round them (`room`),
 * with a kei car (the cars' `KEI`) nosed into one from Stage 2 and into another at Stage 3, in the cars' colours. The
 * bays and their cars then claim their ground.
 */
function parking(g: ZoneGround, draw: () => number, room: RowLot[]) {
  const { most, least, deep } = MEDIUM_FINISH.bays
  const sizes: [number, number][] = [
    [most * BAY_WIDTH, deep],
    [least * BAY_WIDTH, deep],
  ]
  // Clear of what stands; its bays are paint, and its cars keep off the door steps.
  const clear = (l: RowLot) => l.onRoad && g.kit.unclaimed(l.x, l.y, l.w, l.d, l.ry, 0, ['stand']) && !room.some((o) => overlap(o, l))
  const l = alongEdge(g, draw, runs(g, MEDIUM_FINISH.bays.in), sizes, { lampRoom: 1.2, clear: 0.4, ends: 3, slide: true }, clear)
  if (!l) return
  const m = turned(l.x, l.y, l.ry, 0, -0.2)
  g.kit.stand(m.x, m.y, l.w + 0.4, l.d + 0.4, l.ry) // and a margin, so no hedge stands on its lines
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

// Medium-density residential (#178): the scenes a Block picks from, each on ground it reserves before its lots are laid,
// `w` m along the Block's edge and `d` deep, its front facing `ry` toward the Road: a wayside shrine in stone and wood, a
// pocket park with one swing, or a bathhouse with a tall thin chimney. Before its Stage a scene's ground is laid in setts
// with a tree in a round bed and a bench either side, so that no ground stands empty.

/** The scenes a medium-density Block picks from (#178). */
type MediumScene = 'shrine' | 'park' | 'bathhouse'
/** The ground each scene takes (#178), m along the Block's edge and deep: as much as it would have, and the least it fits on. */
const MEDIUM_SCENES: Record<MediumScene, { most: [number, number]; least: [number, number] }> = {
  shrine: { most: [7.5, 7], least: [5.2, 5.2] },
  park: { most: [10, 8], least: [7, 5.6] },
  bathhouse: { most: [13, 10], least: [9.6, 7.6] },
}

// Colours (#178): a shrine's stone, its timber, its copper roof gone green, and the straw rope and the paper over it; a
// bathhouse's plaster, its stone footing, its slate tiles, its noren, its sign and its brick chimney under a white band;
// and the setts a scene's ground is laid in before its Stage, and a shrine's gravel.
const BATHHOUSE = {
  wall: '#f6e6cb',
  footing: '#bdb4a6',
  roof: '#4d6575',
  noren: ['#3f4a5e', '#6c5a8a'],
  sign: '#2f3440',
  chimney: '#a8604f',
  band: '#f4f1ea',
  tall: 18,
}

/**
 * A medium-density Block's scene `kind` at Stage `stage` (#178), from Stage `from`, on its `ground`, its front facing
 * the Road: the scene, or before `from` setts with a tree in a round bed in its middle and a bench either side of it,
 * Block-zoom.
 */
function mediumScene(kit: Kit, kind: MediumScene, ground: Footprint, stage: number, from: number) {
  const { x, y, w, d, ry } = ground
  if (stage >= from) return { shrine, park: pocketPark, bathhouse }[kind](kit, x, y, w, d, ry, stage)
  kit.paving(x, y, KERB, w - 0.4, d - 0.4, ry, SETTS, PATTERN.setts, 0.02)
  waiting(kit, ground, 1.1, 0.46, Math.min(2.7, w / 2 - 0.9), true)
}

/**
 * A pocket park at Stage `stage` (#178): a lawn behind a low hedge, one swing over sand, a tree, a bench facing the
 * swing, Block-zoom, and a lamp at its front corner that leaves its pool; at Stage 3 a spring rider and a bed of
 * flowers.
 */
function pocketPark(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
  const at = (u: number, v: number) => to(x, y, ry, u, v)
  const side = spot(x, y) % 2 ? 1 : -1 // the side its swing stands
  kit.surface(x, y, KERB, w - 0.4, d - 0.4, ry, GARDEN.lawn)
  for (const s of [-1, 1]) kit.put(kit.cuboid(0.5, 0.65, d - 1.4), GARDEN.hedge, x, y, ry, s * (w / 2 - 0.45), -0.5, KERB)
  kit.put(kit.cuboid(w - 0.9, 0.65, 0.5), GARDEN.hedge, x, y, ry, 0, -d / 2 + 0.45, KERB)
  kit.brick('ground', x, y, KERB)
  const swing = at(side * (w / 2 - 2.4), -0.6)
  kit.surface(...swing, KERB + 0.02, 3.4, 2.8, ry, GARDEN.sand)
  kit.swings(...swing, KERB + 0.12, ry, true)
  kit.tree(...at(-side * (w / 2 - 1.8), -d / 2 + 1.9), KERB + 0.1, 0.58, 'round', true)
  bench(kit, ...at(-side * (w / 2 - 2.2), 0.6), ry + (side * Math.PI) / 2)
  kit.lamp(...at(-side * (w / 2 - 0.9), d / 2 - 0.9), KERB + 0.1) // on the lawn, its pool over it
  if (stage < 3) return
  kit.rider(...at(side * (w / 2 - 2.4), d / 2 - 1.6), KERB + 0.1, ry)
  kit.flowerBed(...at(0, -d / 2 + 1.3), KERB + 0.1, Math.min(3, w - 4.6), 0.9, ry, '#ffadc8')
}

/**
 * A bathhouse at Stage `stage` (#178): one tall storey of plaster over a timber wainscot on a stone footing, its high
 * windows lit at night, under a tiled hip along its front; a porch on timber posts under a big gable to the front over
 * its door, two noren across the door and a signboard with marks for lettering lit at night on the porch, which leave a
 * pool; and a tall thin brick chimney behind it under a white band, whose steam rises through the working day. At Stage
 * 3 a vending machine by the door.
 */
function bathhouse(kit: Kit, x: number, y: number, w: number, d: number, ry: number, stage: number) {
  const [bw, bd] = [Math.min(w - 1, 11), Math.min(d - 1.8, 8)]
  const v = -d / 2 + 0.5 + bd / 2 // its middle, out from the ground's
  const face = v + bd / 2
  const seed = spot(x, y)
  const [cx, cy] = to(x, y, ry, 0, v)
  kit.put(kit.cuboid(bw + 0.4, 0.45, bd + 0.4), BATHHOUSE.footing, x, y, ry, 0, v, KERB)
  const walls = { front: PATTERN.plaster, back: PATTERN.house, sides: PATTERN.house, storey: 4.6, bay: 2.8 }
  kit.cladded(kit.box(bw, 4.6, bd, 0.2, 0.08), BATHHOUSE.wall, cx, cy, KERB + 0.45, ry, walls, seed)
  kit.put(kit.cuboid(bw + 0.1, 1.05, bd + 0.1), SHRINE.wood, x, y, ry, 0, v, KERB + 0.45) // a timber wainscot round it
  // A hipped roof along its front, and over its door a porch on timber posts under a big gable to the front.
  kit.tiled(kit.hip(bw + 0.8, bd + 1.4, Math.min(3, bd * 0.38)), BATHHOUSE.roof, cx, cy, KERB + 5.05, ry + Math.PI / 2, seed + 1)
  for (const s of [-1, 1]) kit.put(kit.cuboid(0.24, 3.3, 0.24), SHRINE.wood, x, y, ry, s * 1.75, face + 1.5, KERB + 0.45)
  kit.put(kit.cuboid(4, 0.24, 0.3), SHRINE.wood, x, y, ry, 0, face + 1.5, KERB + 3.6)
  kit.tiled(kit.gable(2.2, 4.4, 1.6), BATHHOUSE.roof, ...to(x, y, ry, 0, face + 0.95), KERB + 3.8, ry, seed + 2)
  kit.put(
    kit.cuboid(2, 2.3, 0.1),
    { material: kit.glass, tint: new THREE.Color(1, 1, 1), glow: 1.2 },
    x,
    y,
    ry,
    0,
    face + 0.04,
    KERB + 0.45,
  )
  BATHHOUSE.noren.forEach((colour, k) => kit.put(kit.cuboid(0.92, 0.9, 0.03), colour, x, y, ry, (k - 0.5) * 0.98, face + 0.2, KERB + 1.85))
  kit.put(kit.cuboid(2.4, 0.8, 0.14), kit.lit(BATHHOUSE.sign, 0.33), x, y, ry, 0, face + 2.06, KERB + 4.2)
  for (let k = 0; k < 3; k++)
    kit.put(kit.cuboid(0.4, 0.4, 0.04), kit.lit('#fbf8f2', 1.6), x, y, ry, (k - 1) * 0.66, face + 2.14, KERB + 4.4)
  kit.pool('sign', ...to(x, y, ry, 0, face + 1.6), KERB, 4.4, 2.8, ry)
  // The chimney against its back wall, on its ground (#193), under a white band, steaming.
  const [hx, hy] = to(x, y, ry, (seed % 2 ? 1 : -1) * Math.min(2, bw / 2 - 1), v - bd / 2 + 0.2)
  kit.drum(BATHHOUSE.chimney, hx, hy, KERB, 0.5, 0.5, BATHHOUSE.tall)
  kit.drum(BATHHOUSE.band, hx, hy, KERB + BATHHOUSE.tall - 1.6, 0.54, 0.54, 0.9)
  kit.drum(BATHHOUSE.chimney, hx, hy, KERB + BATHHOUSE.tall, 0.6, 0.6, 0.3)
  kit.steam(hx, hy, KERB + BATHHOUSE.tall + 0.4)
  kit.shadow(cx, cy, KERB, bw * 1.3 + 1, bd * 1.3 + 1, false, ry)
  kit.brick('building', cx, cy, KERB)
  if (stage === 3) kit.vendingMachine(...to(x, y, ry, bw / 2 - 1.2, face + 0.5), KERB, ry)
}

// A bin store (#178): bags of rubbish under a green net in a steel frame, and a little sign; Block-zoom, as the small
// props are. Parking bays by an apartment block (#178): tarmac set into the pavement, white lines between the bays.
const BINS = { frame: '#9aa3ad', net: '#4f8a6e', bags: ['#f4f1ea', '#e3ecd6', '#f4f1ea', '#dfe7ee'], sign: '#fbf8f2' }
const TAU = Math.PI * 2
const BAYS = { tarmac: '#bcc1c8', line: '#fbf8f2', each: 2.5 }

/** A bin store against a wall at `(x, y)`, facing `ry`, as one Block-zoom brick (#178): bags under a green net in a frame, and its sign. */
function binStore(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.blockZoomProps(() => {
    for (const u of [-0.95, 0.95]) kit.put(kit.cuboid(0.06, 0.9, 1), BINS.frame, x, y, ry, u, 0, KERB)
    kit.put(kit.cuboid(1.96, 0.05, 1), BINS.frame, x, y, ry, 0, 0, KERB + 0.88)
    for (let k = 0; k < 4; k++) {
      const [bx, by] = to(x, y, ry, -0.62 + k * 0.42, (k % 2) * 0.16 - 0.08)
      kit.add(SHAPES.bush, BINS.bags[Math.floor(draw() * BINS.bags.length)], bx, by, KERB + 0.3, draw() * TAU, 0.32, 0.3, 0.32)
    }
    kit.put(kit.cuboid(1.9, 0.5, 0.95), BINS.net, x, y, ry, 0, 0, KERB + 0.38)
    kit.put(kit.cuboid(0.5, 0.36, 0.03), BINS.sign, x, y, ry, 0.5, -0.52, KERB + 1.05)
  })
  kit.brick('building', x, y, KERB)
}

/** Parking bays on `ground` (#178), `bays` of them side by side across its width, open to its front, as one brick. */
function parkingBays(kit: Kit, { x, y, w, d, ry }: Footprint, bays: number) {
  kit.claim('bay', x, y, w, d, ry)
  kit.put(kit.cuboid(w, 0.02, d), BAYS.tarmac, x, y, ry, 0, 0, KERB)
  kit.put(kit.cuboid(w, 0.03, 0.12), BAYS.line, x, y, ry, 0, -d / 2 + 0.06, KERB)
  for (let k = 0; k <= bays; k++)
    kit.put(kit.cuboid(0.12, 0.03, d - 0.4), BAYS.line, x, y, ry, -w / 2 + 0.06 + (k * (w - 0.12)) / bays, -0.2, KERB)
  kit.brick('ground', x, y, KERB)
}

/** m across a parking bay (#178). */
const BAY_WIDTH = BAYS.each

// The props only medium-density lays: their palette, sizes and builders, beside the fill that lays them (#210). The
// paints a line of washing's white pieces take, and the bright covers of futons on a balcony's rail (brighter than the
// towers', so they read against pale walls and white balconies); the steel of outside stairs and walkways, with their
// treads, and of a pole of washing; and a covered bike rack's pale roof (its posts and rail the bicycles' steel).
const WASHING = ['#ffffff', '#ffffff', '#ffc52d', '#bc9ef2', '#a6dcef', '#fbe3a2', '#ff9cbb']
const STEEL = { frame: '#6f7986', tread: '#a7aeb6', pole: '#c4ccd4' }
const RACK_ROOF = '#d6e4d3'
/** Stairs up a wall (#156): m out from the wall, and how much longer than their rise their flight runs. */
const WALL_STAIR = { wide: 1.1, run: 1.2 }

/**
 * A pole of washing standing at `(x, y)`, its line along `ry`'s right, as one brick (#178): a steel pole on a stand at
 * each end, as a garden's laundry pole stands (#157), and a line of washing (`../movers`' `washing`) in a paint from the
 * kit's stream, which sways.
 */
function washingPole(kit: Kit, x: number, y: number, h: number, ry: number) {
  const top = kit.poleStand(x, y, h, ry, 2.8, STEEL.pole)
  kit.sway('washing', x, y, h + top, ry, { paint: kit.pick(WASHING) })
  kit.brick('tree', x, y, h)
}

/**
 * Steel outside stairs centred on `(x, y)`, their flights running along `ry`'s right, as one brick (#156): two flights a
 * storey from the first of `tops` (m above the road) to each of the others, as an apartment block has up one end of its
 * walkways.
 */
function outsideStairs(kit: Kit, x: number, y: number, ry: number, tops: number[]) {
  stairs(kit, x, y, ry, tops)
  if (kit.finished) {
    // A light at each landing, under the next or on a post over the top one, and a pool at their foot (#178).
    const { long: L, landing: D } = STAIR
    for (const at of tops.slice(1)) kit.put(kit.cuboid(0.24, 0.14, 0.24), kit.lit(CREAM, DOOR_LIGHT), x, y, ry, (L - D) / 2, 0, at + 2.1)
    kit.pool('door', ...to(x, y, ry, 0, 0), tops[0], STAIR.long + 1.6, STAIR.wide + 1.6, ry)
  }
  kit.shadow(x, y, tops[0], STAIR.long + 1, STAIR.wide + 1, false, ry)
  kit.brick('building', x, y, tops[0])
}

/**
 * Steel outside stairs' flights (#156), centred on `(x, y)`, running along their front `ry`: two flights a storey in two
 * lanes, turning at a landing half-way, from the first of `tops` (m above the road) to each of the rest, with a landing
 * at each, posts at the corners and a railing up the outer side. They join the next brick.
 */
function stairs(kit: Kit, x: number, y: number, ry: number, tops: number[]) {
  const { long: L, wide: W, landing: D } = STAIR
  const [run, lane] = [L - 2 * D, (W - 0.1) / 2]
  for (let f = 0; f + 1 < tops.length; f++) {
    const [lo, hi] = [tops[f], tops[f + 1]]
    const half = (hi - lo) / 2
    // Out along one lane to the half-landing at the far end, and back along the other to the next floor.
    kit.put(kit.flight(-run, half, lane, 0.14), STEEL.tread, x, y, ry, 0, (W - lane) / 2, lo + half / 2)
    kit.put(kit.flight(-run, half, 0.05, 0.9), STEEL.frame, x, y, ry, 0, W / 2 - 0.03, lo + half / 2 + 0.5)
    kit.put(kit.cuboid(D, 0.14, W), STEEL.tread, x, y, ry, -(L - D) / 2, 0, lo + half - 0.14)
    kit.put(kit.cuboid(0.05, 0.9, W), STEEL.frame, x, y, ry, -L / 2 + 0.03, 0, lo + half)
    kit.put(kit.flight(run, half, lane, 0.14), STEEL.tread, x, y, ry, 0, -(W - lane) / 2, lo + 1.5 * half)
    kit.put(kit.flight(run, half, 0.05, 0.9), STEEL.frame, x, y, ry, 0, -W / 2 + 0.03, lo + 1.5 * half + 0.5)
    kit.put(kit.cuboid(D, 0.14, W), STEEL.tread, x, y, ry, (L - D) / 2, 0, hi - 0.14)
    kit.put(kit.cuboid(0.05, 0.9, W), STEEL.frame, x, y, ry, L / 2 - 0.03, 0, hi)
  }
  const top = tops[tops.length - 1] + 0.9
  for (const lx of [-1, 1])
    for (const ly of [-1, 1])
      kit.put(kit.cuboid(0.14, top - tops[0], 0.14), STEEL.frame, x, y, ry, lx * (L / 2 - 0.07), ly * (W / 2 - 0.07), tops[0])
}

/**
 * A straight flight of steel stairs up a wall, centred on `(x, y)` with its flight along `ry`'s right and the wall at
 * its back, rising `rise` m toward its end `toward` (1: its right, -1: its left) to a landing there with a door in the
 * wall, as one brick (#156): the stairs up the end of a small apartment house's row.
 */
function wallStairs(kit: Kit, x: number, y: number, h: number, ry: number, rise: number, toward: number) {
  const { landing: D } = STAIR
  const W = WALL_STAIR.wide
  const run = rise * WALL_STAIR.run
  const L = run + D
  kit.put(kit.flight(toward * run, rise, W - 0.1, 0.14), STEEL.tread, x, y, ry, (-toward * D) / 2, 0, h + rise / 2)
  kit.put(kit.flight(toward * run, rise, 0.05, 0.9), STEEL.frame, x, y, ry, (-toward * D) / 2, W / 2 - 0.03, h + rise / 2 + 0.5)
  const end = toward * (L / 2 - D / 2) // the landing's middle
  kit.put(kit.cuboid(D, 0.14, W), STEEL.tread, x, y, ry, end, 0, h + rise - 0.14)
  kit.put(kit.cuboid(D, 0.9, 0.05), STEEL.frame, x, y, ry, end, W / 2 - 0.03, h + rise)
  kit.put(kit.cuboid(0.05, 0.9, W), STEEL.frame, x, y, ry, toward * (L / 2 - 0.03), 0, h + rise)
  for (const lx of [end - D / 2 + 0.06, end + D / 2 - 0.06])
    kit.put(kit.cuboid(0.12, rise, 0.12), STEEL.frame, x, y, ry, lx, W / 2 - 0.06, h)
  kit.put(kit.cuboid(0.9, 2.05, 0.12), DOOR, x, y, ry, end, -W / 2 - 0.02, h + rise)
  kit.shadow(x, y, h, L + 0.8, W + 0.8, false, ry)
  kit.brick('building', x, y, h)
}

/**
 * A covered bike rack `len` long centred on `(x, y)`, open to its front `ry`, with `bikes` bicycles in it, as one brick
 * (#156): steel posts and a pale roof, a rail along the back, and the bicycles side by side facing out.
 */
function bikeRack(kit: Kit, x: number, y: number, h: number, ry: number, len: number, bikes: number) {
  const D = BIKE_RACK.deep
  for (const lx of [-1, 1])
    for (const ly of [-1, 1]) kit.put(kit.cuboid(0.1, 2.25, 0.1), BIKES.steel, x, y, ry, lx * (len / 2 - 0.08), ly * (D / 2 - 0.08), h)
  kit.put(kit.cuboid(len + 0.3, 0.08, D + 0.3), RACK_ROOF, x, y, ry, 0, 0, h + 2.25)
  kit.put(kit.cuboid(len - 0.2, 0.08, 0.08), BIKES.steel, x, y, ry, 0, -D / 2 + 0.25, h + 0.55)
  const n = Math.min(bikes, Math.floor((len - 0.3) / BIKE_RACK.per))
  kit.row(...to(x, y, ry, -len / 2 + 0.15 + (BIKE_RACK.per * n) / 2, -0.05), h, ry, n, BIKE_RACK.per)
  kit.shadow(x, y, h, len + 1, D + 1, false, ry)
  kit.brick('building', x, y, h)
}

// The terraced house and the apartment block: their palettes, plans and builders, beside the fill that lays them (#207).
const { awning: AWNING, bush: BUSH, cone12: CONE, cylinder: CYLINDER, disc: FACING_DISC, thin: THIN } = SHAPES
// Medium-density's part of the palette, under the rule at the top of `../kit` (#136). The house's brick roof and its
// persimmon one (`./low-density`) sit right at the cap, so the reds here keep below them. A terraced row's walls, roof
// tiles and doors, and an apartment building's walls and cap.
const TERRACE = {
  walls: ['#fff4e2', '#f6dfb4', '#f3d2c4', '#ead9c2', '#dcc6a6', '#d6e4d3', '#f9e7c8'],
  roofs: ['#4d6575', '#5b6b7a', '#3f5866', '#7a5a46', '#b85a4c', '#5aa69b', '#8b7dbf', '#a8765a'],
  door: DOOR,
  blooms: ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0'], // a Stage 3 house's window boxes
}
const COURTYARD = { walls: ['#e0f2d4', '#cbebfc', '#e5dafb', '#fbe3a2', '#c0e9e0', '#fbd2dd', '#fdeed6'], cap: '#fbfaf6' }
const COVERS = ['#ff9ab8', '#f0b43c', '#a58ad8', '#79c86a', '#fff7e8', '#5cc0d6']
// Medium-density residential built to the Finish (#178). A terraced house: a bay of its back and its ends (m); how
// steeply a hip or a gable to the front climbs, as a share of its half-span (32°); on its roof, a TV aerial, a steel
// laundry deck, a solar water heater and a skylight, each on the share of the houses from Stages 1, 2 and 3 that the
// roll drawn where it stands gives it; its downpipes and gutter, and the meter and the share with an AC unit at its back;
// a corner shop's signs or a coin laundry's, the laundry's glass lit brighter, and its machines' round doors.
const TERRACE_FINISH = {
  bay: 2.4,
  pitch: 0.62,
  aerial: { share: [0.35, 0.5, 0.6], steel: AERIAL },
  deck: { share: [0, 0.25, 0.45], steel: STEEL.pole, slats: STEEL.tread },
  heater: { share: [0, 0.18, 0.3], tank: '#eef1f3' },
  skylight: { share: [0, 0.22, 0.4], frame: '#fbf8f2', glow: 0.7 },
  pipe: '#c4ccd4',
  meter: { box: '#e9eef2', dial: '#4a525c' },
  planter: '#c49a6c',
  ac: [0.3, 0.5, 0.7],
  corner: {
    shop: ['#2fb39a', '#f0b43c', '#79c86a', '#e8925e', '#a58ad8'],
    laundry: ['#5cc0d6', '#fbf8f2', '#79c86a'],
    glow: 1.35,
    drum: '#4a525c',
  },
}
// An apartment block built to the Finish (#178): its roof's deck of sheets, sage green under a white parapet; how
// steeply a mansard's skirt of tiles slopes (rad), in the tiles its plan gives it; the condensers on its roof at Stages 1
// to 3; how brightly the lights over its doors and at its stairs' landings glow, for the lamps' glow; and the lamps on its
// walkways' parapets, `lamp` m wide and tall and brighter, before the walkways' windows dimmed to `dim` of the windows' glow, so
// that its walkways read as rows of dots at night at City zoom.
const APARTMENT_FINISH = {
  deck: '#9fb5a7',
  mansard: { tip: 0.9 },
  condensers: [2, 3, 5],
  light: DOOR_LIGHT,
  walkway: { lamp: [1.2, 0.6], light: 3, dim: 0.3 },
  frame: '#4a525c',
  washing: [0, 0.12, 0.16], // of a walkway's bays at Stages 1 to 3
}
// A cylinder lying along x, centred on its middle: a solar water heater's tank (#178).
const LYING = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2)
/**
 * An apartment block's front door (#178): on the face (of `FACES`) of its first wing that is its walkway face (`walks`)
 * if that one looks out of the building, neither into its court nor onto another wing, or else the first face that
 * does, in its middle bay (`baysOf`), or the first of the two middle ones where the bays are even; where it stands;
 * null if no face looks out. `apartment` builds it there, and the Zone's fill keeps its hedges off it.
 */
function doorOf(wings: Bounds[], walks: Walks): { face: number; bay: number; x: number; y: number } | null {
  const [w] = wings
  const { x0, y0, x1, y1 } = wingBounds(wings)
  const out = (face: number) => {
    const [nx, ny] = FACES[face]
    const [px, py] = [(w.x0 + w.x1) / 2 + nx * ((w.x1 - w.x0) / 2 + 0.4), (w.y0 + w.y1) / 2 + ny * ((w.y1 - w.y0) / 2 + 0.4)]
    return px < x0 || px > x1 || py < y0 || py > y1
  }
  const face = [walks[0] ?? -1, 0, 1, 2, 3].find((face) => face >= 0 && out(face)) ?? -1
  if (face < 0) return null
  const { n, at } = baysOf(w, face)
  const bay = Math.floor((n - 1) / 2)
  const [x, y] = at(bay)
  return { face, bay, x, y }
}
/** A terraced house's roof (#178): a gable along the row, as the rows always had; a hip; or a gable to the front. */
type TerraceRoof = 'gable' | 'hip' | 'front'
/**
 * A terraced house's roof as the kit cuts it (#178): it climbs `pitch` over `span` m from its eaves to its ridge; its
 * `shape`, turned `turn` from the house's front; `ridge`, how far the way its ridge runs is turned from the front's, and
 * `half` the ridge's length; and whether a gutter runs along its back eaves.
 */
interface Pitched {
  span: number
  pitch: number
  shape: THREE.BufferGeometry
  turn: number
  ridge: number
  half: number
  gutter: boolean
}
/** A corner shop or a coin laundry in the ground floor of a terraced house at a row's end, its door at end `end` (#178). */
interface Corner {
  kind: 'shop' | 'laundry'
  /** 1 its right, -1 its left, as `local`'s x runs. */
  end: 1 | -1
}
/** What a terraced house's lot gives it besides its storeys, the same at every Stage (#178). */
interface TerracePlan {
  roof: TerraceRoof
  /** Its side walls that close a row, open to the Block (1 its right, -1 its left): their details stand there. */
  ends: (1 | -1)[]
  corner?: Corner
}
/** An apartment block's roof (#178): flat behind a parapet, or under a mansard's skirt of tiles in `tiles`. */
type ApartmentPlan = { roof: 'flat' } | { roof: 'mansard'; tiles: string }

/**
 * A line of washing (`../movers`' `washing`, 2.6 m) on a pole `out` m from a wall at `(x, y)` that faces `ry`, `h` above
 * the road (#156), its white pieces in a paint from the kit's stream: on two brackets from the wall if `brackets`
 * (under a balcony's slab it hangs from hooks too small to draw). The line rides the next brick closed and sways;
 * the brackets join that brick.
 */
function washing(kit: Kit, x: number, y: number, h: number, ry: number, out: number, brackets: boolean) {
  if (brackets) for (const k of [-1, 1]) kit.put(kit.cuboid(0.05, 0.05, out), STEEL.pole, x, y, ry, k * 1.25, out / 2, h)
  kit.sway('washing', ...to(x, y, ry, 0, out), h, ry, { paint: kit.pick(WASHING) })
}

/** A futon over a rail `h` above the road, `out` m from a wall at `(x, y)` facing `ry`, in a bright cover (#156): it rides the next brick closed and sways. */
function futon(kit: Kit, x: number, y: number, h: number, ry: number, out: number) {
  return kit.sway('futon', ...to(x, y, ry, 0, out), h, ry, { paint: kit.pick(COVERS) })
}

/**
 * Each terraced roof (#178) over a house `w` along its row and `d` deep: a gable along the row, as the rows always had,
 * or a hip or a gable to the front, which climb `TERRACE_FINISH.pitch` across it (`Pitched`).
 */
const terraceRoofs = (kit: Kit): Record<TerraceRoof, (w: number, d: number) => Pitched> => ({
  gable: (w, d) => {
    const [span, pitch] = [(d + 1) / 2, Math.min(4.2, d * 0.34)]
    return { span, pitch, shape: kit.gable(w + 0.2, d + 1, pitch), turn: Math.PI / 2, ridge: 0, half: (w + 0.2) / 2, gutter: true }
  },
  front: (w, d) => {
    const span = (w + 0.2) / 2
    const pitch = span * TERRACE_FINISH.pitch
    return { span, pitch, shape: kit.gable(d + 1, w + 0.2, pitch), turn: 0, ridge: Math.PI / 2, half: (d + 1) / 2, gutter: false }
  },
  hip: (w, d) => {
    const span = (w + 0.2) / 2
    const pitch = span * TERRACE_FINISH.pitch
    const half = Math.max(0.9, (d + 1) / 2 - span)
    return { span, pitch, shape: kit.hip(d + 1, w + 0.2, pitch), turn: 0, ridge: Math.PI / 2, half, gutter: false }
  },
})

/**
 * What stands on the roof `roof` of a terraced house standing on `f` (#178), on the kit's stream as the caller has it,
 * its eaves `top` above the road. A TV aerial on the ridge at one end from Stage 1; from Stage 2 a steel laundry deck
 * over the back slope by the ridge (washing on its pole at Stage 3), a solar water heater on the ridge with its
 * collector on the front slope, and a skylight, each on the share of the houses `TERRACE_FINISH` gives its Stage.
 */
function terraceRoof(kit: Kit, { x, y, ry }: Footprint, top: number, roof: Pitched, stage: number) {
  const { aerial, deck, heater, skylight } = TERRACE_FINISH
  const [aerialRoll, deckRoll, heaterRoll, skyRoll, end, turn, wash] = [
    kit.rand(),
    kit.rand(),
    kit.rand(),
    kit.rand(),
    kit.rand() < 0.5 ? 1 : -1,
    kit.rand(),
    kit.rand(),
  ]
  const { span, pitch, half } = roof
  const rf = ry + roof.ridge // the frame whose x runs along the ridge
  const tip = Math.atan2(pitch, span)
  const ridge = top + pitch
  /** How high the roof stands `down` m out from its ridge. */
  const at = (down: number) => top + pitch * (1 - down / span)
  /** Add `geo` `u` m along the ridge and `down` m out from it over the slope facing `side` (1 front, -1 back, as the frame's), `z` up. */
  const on = (geo: THREE.BufferGeometry, look: KitLook, u: number, down: number, side: number, z: number, sx = 1, sy = 1, sz = 1) =>
    kit.put(geo, look, x, y, rf + (side < 0 ? Math.PI : 0), u * side, down, z, sx, sy, sz)
  // Its thin steel, the aerial and the deck's posts and rails, is Block-zoom: under a pixel at City zoom.
  if (aerialRoll < aerial.share[stage - 1]) {
    const [px, py] = to(x, y, rf, end * (half - 0.45), 0)
    kit.blockZoomProps(() => {
      kit.add(kit.cuboid(0.07, 2.7, 0.07), TERRACE_FINISH.aerial.steel, px, py, ridge - 0.3) // plain boxes: aerials come by the hundred
      for (const [k, len] of [1.4, 0.9].entries())
        kit.add(kit.cuboid(len, 0.04, 0.05), TERRACE_FINISH.aerial.steel, px, py, ridge + 1.6 + k * 0.4, rf + turn * Math.PI)
    })
  }
  if (deckRoll < deck.share[stage - 1] && span > 2.2) {
    // Over the back slope by the ridge, at the end away from the aerial: a deck on posts behind a rail, and a pole.
    const L = Math.min(2.2, 2 * half - 0.6)
    const [u, D] = [-end * (half - L / 2 - 0.3), Math.min(1.6, span - 0.5)]
    const floor = ridge + 0.1
    const mid = 0.15 + D / 2
    on(kit.cuboid(L, 0.08, D), deck.slats, u, mid, -1, floor - 0.08)
    kit.blockZoomProps(() => {
      for (const k of [-1, 1]) {
        on(kit.cuboid(0.07, floor - at(0.15 + D) + 1, 0.07), deck.steel, u + k * (L / 2 - 0.04), 0.15 + D - 0.04, -1, at(0.15 + D) - 0.05)
        on(kit.cuboid(0.05, 0.05, D), deck.steel, u + k * (L / 2 - 0.03), mid, -1, floor + 0.9)
        on(kit.cuboid(0.05, 1.75, 0.05), deck.steel, u + k * (L / 2 - 0.12), mid, -1, floor)
      }
      for (const z of [0.45, 0.9]) on(kit.cuboid(L, 0.05, 0.05), deck.steel, u, 0.15 + D - 0.03, -1, floor + z)
      on(kit.cuboid(L, 0.04, 0.04), deck.steel, u, mid, -1, floor + 1.72)
    })
    if (stage === 3 && wash < 0.6)
      kit.sway('washing', ...to(x, y, rf + Math.PI, -u, mid), floor + 1.72, rf + Math.PI, { paint: kit.pick(WASHING) })
  }
  if (heaterRoll < heater.share[stage - 1] && 2 * half > 3.2) {
    // On the ridge toward the aerial's end, a tank lying along it, and its collector down the front slope.
    const u = end * (half - 1.45)
    kit.add(LYING, heater.tank, ...to(x, y, rf, u, 0), ridge + 0.32, rf, 1.5, 0.3, 0.3)
    on(kit.tipped(1.6, 0.07, 1.3, tip), { material: kit.glass, tint: kit.glassOf(HOME.cells), glow: 0 }, u, 1.05, 1, at(1.05) + 0.08)
    on(kit.tipped(1.7, 0.05, 1.4, tip), HOME.trim, u, 1.05, 1, at(1.05) + 0.03)
  }
  if (skyRoll < skylight.share[stage - 1]) {
    // Down the front slope at the other end: glass that glows a little at night, in a pale frame.
    const [u, down] = [-end * Math.min(half - 0.9, 1), span * 0.55]
    on(kit.tipped(1.1, 0.05, 1.3, tip), skylight.frame, u, down, 1, at(down) + 0.04)
    on(kit.tipped(0.9, 0.06, 1.1, tip), { material: kit.glass, tint: kit.windows[1], glow: skylight.glow }, u, down, 1, at(down) + 0.08)
  }
}

/**
 * A terraced house's back and its ends that close a row (#178), on the kit's stream as the caller has it: a downpipe
 * at a back corner (and a gutter along the back eaves under a gable along the row) and one at the back of each end
 * wall; and, Block-zoom, a meter by the back door, pot plants beside it, an AC unit on the back wall on some and one
 * high on an end wall on some, more with each Stage; and a planter of greens along the alley, seen from Tile zoom.
 */
function terraceBack(kit: Kit, f: Footprint, h: number, wall: number, storeys: number, stage: number, roof: Pitched, ends: (1 | -1)[]) {
  const { x, y, w, d, ry } = f
  const { pipe, meter, ac } = TERRACE_FINISH
  const [low, high] = [kit.rand(), kit.rand()]
  const back = -d / 2
  // The downpipes and the gutter are Block-zoom props: under a pixel at City zoom.
  kit.blockZoomProps(() => {
    kit.local(kit.cuboid(0.12, wall - 0.3, 0.12), pipe, x, y, ry, w / 2 - 0.3, back - 0.08, h)
    if (roof.gutter) kit.local(kit.cuboid(w + 0.2, 0.12, 0.16), pipe, x, y, ry, 0, -(d + 1) / 2 - 0.08, h + wall - 0.12)
    for (const end of ends) kit.local(kit.cuboid(0.12, wall - 0.3, 0.12), pipe, x, y, ry, end * (w / 2 + 0.08), back + 0.35, h)
  })
  const bays = Math.max(1, Math.round(w / TERRACE_FINISH.bay))
  const door = -w / 2 + (Math.floor(bays / 2) + 0.5) * (w / bays) // as the pattern lays the back door
  const side = door + 0.85 < w / 2 - 0.4 ? 1 : -1 // the meter's side of the door, where it fits
  kit.blockZoomProps(() => {
    kit.local(kit.cuboid(0.36, 0.46, 0.16), meter.box, x, y, ry, door + side * 0.85, back - 0.08, h + 1.15)
    kit.put(FACING_DISC, meter.dial, x, y, ry + Math.PI, -(door + side * 0.85), -back + 0.17, h + 1.45, 0.08, 0.08, 1)
    // The pots and the AC unit stand before its own back wall, short of the next house's (#193).
    for (const k of [0, 1]) {
      const u = door - side * (0.75 + k * 0.5)
      if (Math.abs(u) + 0.4 <= w / 2) kit.pot(...to(x, y, ry, u, back - 0.35), h, 0.55 + 0.2 * kit.rand(), () => kit.rand())
    }
    const unit = door - side * 1.9
    if (low < ac[stage - 1] && Math.abs(unit) + 0.6 <= w / 2) kit.airCon(...to(x, y, ry, unit, back), h + 0.02, ry + Math.PI)
    for (const end of ends)
      if (storeys > 1 && high < ac[stage - 1])
        kit.airCon(...to(x, y, ry, end * (w / 2), back + d * 0.35), h + 3.42, ry - (end * Math.PI) / 2)
  })
  // A planter of greens against the back wall, past the meter, or else past the pots and the AC unit on the door's
  // other side, where it fits: the pot plants that line the alley as seen from Tile zoom.
  const along = [door + side * 1.7, door - side * 2.85].find((u) => Math.abs(u) + 0.5 < w / 2 - 0.45)
  if (along === undefined) return
  kit.local(kit.cuboid(1, 0.4, 0.42), TERRACE_FINISH.planter, x, y, ry, along, back - 0.3, h)
  for (const k of [-1, 1])
    kit.add(BUSH, kit.pick(LEAVES.round), ...to(x, y, ry, along + k * 0.24, back - 0.3), h + 0.55, kit.rand() * TAU, 0.34, 0.3, 0.3)
}

/**
 * A corner shop or a coin laundry in the ground floor of a terraced house at a row's end (#178), on the kit's stream
 * as the caller has it: a glass front over the ground floor, framed, its door at the row's end, under a signboard
 * with marks for lettering, and a shop's striped awning or a laundry's machines seen through its glass, Block-zoom; a
 * sign on the end wall by the front; its signs lit from Stage 2, and a pool before the front and by the end wall.
 */
function cornerShop(kit: Kit, { x, y, w, d, ry }: Footprint, h: number, stage: number, corner: Corner) {
  const { kind, end } = corner
  const laundry = kind === 'laundry'
  const sign = kit.pick(laundry ? TERRACE_FINISH.corner.laundry : TERRACE_FINISH.corner.shop)
  const marks = 3 + Math.floor(kit.rand() * 2)
  const lights = stage >= 2
  const face = d / 2
  const [frame, glazed] = [FRONTAGE.frames[0], w - 0.5]
  const tall = laundry ? 2.15 : 2
  kit.local(
    kit.cuboid(glazed, tall, 0.12),
    { material: kit.glass, tint: kit.windows[laundry ? 1 : 0], glow: laundry ? TERRACE_FINISH.corner.glow : 1 },
    x,
    y,
    ry,
    0,
    face + 0.02,
    h + 0.15,
  )
  kit.local(kit.cuboid(glazed + 0.16, 0.12, 0.22), FRONTAGE.trim, x, y, ry, 0, face + 0.07, h + 0.03)
  kit.local(kit.cuboid(glazed + 0.16, 0.1, 0.16), frame, x, y, ry, 0, face + 0.05, h + 0.15 + tall)
  const bars = Math.max(2, Math.round(glazed / 1.3))
  for (let k = 1; k < bars; k++)
    kit.local(kit.cuboid(0.07, tall, 0.16), frame, x, y, ry, -glazed / 2 + (k * glazed) / bars, face + 0.05, h + 0.15)
  kit.local(kit.cuboid(0.06, 2.1, 0.16), frame, x, y, ry, end * (w / 2 - 0.25 - glazed / bars / 2), face + 0.06, h + 0.15) // the door's edge
  const board = (colour: string): KitLook => (lights ? kit.lit(colour, FRONTAGE.lit.board) : colour)
  kit.local(kit.cuboid(w - 0.2, 0.5, 0.14), board(sign), x, y, ry, 0, face + 0.08, h + 2.44)
  for (let k = 0; k < marks; k++)
    kit.local(kit.cuboid(0.3, 0.3, 0.04), kit.markOf(sign, lights), x, y, ry, (k - (marks - 1) / 2) * 0.46, face + 0.16, h + 2.54)
  // On the end wall by the front, a sign standing out from it, its marks down it.
  kit.local(kit.cuboid(0.12, 1.6, 0.8), board(sign), x, y, ry, end * (w / 2 + 0.07), face - 0.75, h + 1.05)
  for (let k = 0; k < 3; k++)
    kit.local(kit.cuboid(0.04, 0.3, 0.3), kit.markOf(sign, lights), x, y, ry, end * (w / 2 + 0.14), face - 0.75, h + 1.25 + k * 0.45)
  if (laundry)
    kit.blockZoomProps(() => {
      // Its machines, a round door each, seen through the glass.
      const n = Math.floor((glazed - 1.4) / 0.72)
      for (let k = 0; k < n; k++)
        kit.put(
          FACING_DISC,
          TERRACE_FINISH.corner.drum,
          x,
          y,
          ry,
          end * (k * 0.72 - glazed / 2 + 0.5),
          face + 0.09,
          h + 0.72,
          0.24,
          0.24,
          1,
        )
    })
  else {
    const stripes = Math.max(3, Math.round(glazed / 1.1))
    for (let i = 0; i < stripes; i++)
      kit.local(
        AWNING,
        board(i % 2 ? FRONTAGE.stripe : sign),
        x,
        y,
        ry,
        -glazed / 2 + (i + 0.5) * (glazed / stripes),
        face + 0.85,
        h + 2.1,
        glazed / stripes,
      )
  }
  kit.pool(lights ? 'sign' : 'window', ...to(x, y, ry, 0, face + POOL.front.window), h, w + 0.4, POOL.deep.window, ry)
  kit.pool(lights ? 'sign' : 'window', ...to(x, y, ry, end * (w / 2 + 1.1), face - 0.75), h, 2.2, 2.6, ry)
}

/**
 * The roof of an apartment wing standing on `f` (#178), the `k`th of its block, its cap `top` above the road: the cap,
 * wearing roofing sheets on its top where the kit builds patterned, in the deck's sage, round a band of the cap's white;
 * and along each face not against another wing (`against`), a parapet on it, or for a block whose plan has one, a
 * mansard's skirt of tiles sloping out over the wall.
 */
function apartmentRoof(
  kit: Kit,
  f: Footprint,
  top: number,
  plan: ApartmentPlan,
  k: number,
  against: (px: number, py: number) => boolean,
  seed: number,
) {
  const { x: cx, y: cy, w, d } = f
  const { deck, mansard } = APARTMENT_FINISH
  const band = { top: PATTERN.sheets, front: PATTERN.gable, back: PATTERN.gable, sides: PATTERN.gable, storey: 4.8 }
  kit.cladded(kit.box(w + 0.24, 0.6, d + 0.24, 0.68, 0.1), kit.patterned ? deck : COURTYARD.cap, cx, cy, top, 0, band, seed + 10 + k)
  top += 0.6
  for (const [face, [nx, ny]] of FACES.entries()) {
    const { ry, half, len } = boxFace(face, w, d)
    if (against(cx + nx * (half + 0.4), cy + ny * (half + 0.4))) continue
    if (plan.roof === 'mansard')
      kit.tiled(
        kit.tipped(len + 0.6, 0.14, 1.7, mansard.tip),
        plan.tiles,
        ...to(cx, cy, ry, 0, half + 0.3),
        top + 0.32,
        ry,
        seed + 20 + face,
      )
    else kit.local(kit.cuboid(len + 0.24, 0.45, 0.24), COURTYARD.cap, cx, cy, ry, 0, half, top)
  }
}

/**
 * The plant on an apartment block's roof (#178), on its first wing at `top`, on the kit's stream as the caller has it:
 * AC condensers in a row along its far edge, more with each Stage, and a TV aerial at a corner.
 */
function apartmentPlant(kit: Kit, wing: Bounds, top: number, stage: number) {
  const [w, d] = [wing.x1 - wing.x0, wing.y1 - wing.y0]
  const long = w >= d
  const n = Math.min(APARTMENT_FINISH.condensers[stage - 1], Math.floor(((long ? w : d) - 2.4) / 1.3))
  for (let k = 0; k < n; k++) {
    const [ux, uy] = long ? [wing.x1 - 1.2 - k * 1.3, wing.y1 - 0.9] : [wing.x1 - 0.9, wing.y1 - 1.2 - k * 1.3]
    const ry = long ? Math.PI : Math.PI / 2 // facing in from the edge
    kit.put(kit.cuboid(1, 0.72, 0.5), AIRCON.body, ux, uy, ry, 0, 0, top)
    kit.put(FACING_DISC, AIRCON.grille, ux, uy, ry, -0.16, 0.26, top + 0.36, 0.24, 0.24, 1)
  }
  const [px, py] = [wing.x0 + 1, wing.y0 + 1]
  const turn = kit.rand() * Math.PI
  kit.blockZoomProps(() => {
    kit.add(THIN, TERRACE_FINISH.aerial.steel, px, py, top, 0, 0.05, 3.2, 0.05)
    for (const [k, len] of [1.6, 1.3, 1].entries())
      kit.add(kit.cuboid(len, 0.04, 0.05), TERRACE_FINISH.aerial.steel, px, py, top + 2 + k * 0.35, turn)
  })
}

/**
 * A house of a terraced row at Stage `stage`, as one brick: `w` along the row and `d` deep, its front facing `ry` (0
 * north, π/2 west), `storeys` high, as many as the caller gives its Stage. It shares its side walls with the houses
 * beside it, under a gable roof whose ridge runs along the row, with a window or two a storey on its front and a
 * wooden door. Its colours and whether it has an eave are drawn before anything a Stage changes:
 * - Stage 1: plain, with no eave.
 * - Stage 2: an eave over the ground floor on some.
 * - Stage 3: an eave on every house of two storeys or more, a pale cornice under the roof, and a window box of
 *   flowers under each upper window.
 * Its details (#156) draw from where it stands: an AC unit by the door on one house in four at Stage 1, half at
 * Stage 2 and three in four at Stage 3, with a second on the eave of some; washing under the top floor's eaves on
 * some houses of two storeys or more from Stage 2, more at Stage 3.
 */
function townhouse(
  kit: Kit,
  x: number,
  y: number,
  h: number,
  w: number,
  d: number,
  ry: number,
  storeys: number,
  stage = 2,
  plan: TerracePlan = { roof: 'gable', ends: [] },
) {
  const wall = storeys * 3 + 0.6
  kit.formed(`terrace ${plan.roof} ${storeys}`)
  const [tile, walls, eave, bloom] = [kit.pick(TERRACE.roofs), kit.pick(TERRACE.walls), kit.rand() < 0.55, kit.pick(TERRACE.blooms)]
  const seed = spot(x, y) + 23 // which patterned windows light, and the finish's own draws, so the kit's stream is untouched
  const { corner } = plan
  // Its walls: plaster on the front, round the windows it is built with, and on the back and the ends a window in
  // every bay, and the back door (#178).
  const cladding = { front: PATTERN.plaster, back: PATTERN.rear, sides: PATTERN.house, storey: 3, bay: TERRACE_FINISH.bay }
  kit.cladded(kit.box(w, wall, d, 0.16, 0.08), walls, x, y, h, ry, cladding, seed)
  // Its roof: a gable along the row, as the rows always had, or a hip or a gable to the front, so that no house is
  // the next one's in another colour (#178), in tile rows under a ridge.
  const roof = terraceRoofs(kit)[plan.roof](w, d)
  kit.tiled(roof.shape, tile, x, y, h + wall, ry + roof.turn, seed + 1)
  if (stage === 3) kit.local(kit.cuboid(w + 0.06, 0.42, 0.5), LEDGE, x, y, ry, 0, d / 2 + 0.05, h + wall - 0.42)
  const across = w >= 5.6 ? 2 : 1 // windows a storey
  for (let s = 0; s < storeys; s++) {
    for (let k = 0; k < across; k++) {
      const lx = across === 1 ? 0 : (k ? 1 : -1) * w * 0.23
      const door = s === 0 && k === across - 1
      const look = door ? null : kit.pane(0.7) // drawn whether or not a corner's shop front takes its place
      if (corner && s === 0) continue
      if (door) kit.local(kit.cuboid(1.2, 2.2, 0.3), TERRACE.door, x, y, ry, lx, d / 2, h)
      if (door) kit.doorway(...to(x, y, ry, lx, d / 2), ry, 1.2, 0.15)
      else kit.local(kit.cuboid(1.1, 1.3, 0.3), look!, x, y, ry, lx, d / 2, h + 1 + s * 3)
      if (stage === 3 && s > 0) kit.local(kit.cuboid(1.4, 0.34, 0.55), bloom, x, y, ry, lx, d / 2 + 0.2, h + 0.7 + s * 3)
    }
  }
  if (storeys > 1 && (stage === 3 || (stage === 2 && eave)))
    kit.local(kit.cuboid(w + 0.1, 0.22, 1.1), tile, x, y, ry, 0, d / 2 + 0.5, h + 3.1)
  // Its details (#156), drawn from where it stands: an AC unit by the door on some, and on Stage 3's eave a second;
  // washing on a pole under the top floor's eaves.
  kit.seeded(spot(x, y), () => {
    const [ac, high, wash] = [kit.rand(), kit.rand(), kit.rand()]
    const wall = (lx: number) => to(x, y, ry, lx, d / 2)
    // Under the ground floor's window, or beside the door of a house one window wide.
    if (ac < [0.25, 0.5, 0.75][stage - 1] && !corner) kit.airCon(...wall(across === 2 ? -w * 0.23 : -1.3), h + 0.02, ry)
    if (stage === 3 && storeys > 1 && high < 0.45) kit.airCon(...wall(across === 2 ? 0 : 1.3), h + 3.34, ry)
    if (storeys > 1 && wash < [0, 0.3, 0.55][stage - 1]) washing(kit, ...wall(0), h + storeys * 3 - 0.45, ry, 0.7, true)
  })
  const f = { x, y, w, d, ry }
  if (kit.patterned) {
    kit.seeded(seed + 2, () => terraceRoof(kit, f, h + wall, roof, stage))
    kit.seeded(seed + 3, () => terraceBack(kit, f, h, wall, storeys, stage, roof, plan.ends))
  }
  if (corner) kit.seeded(seed + 4, () => cornerShop(kit, f, h, stage, corner))
  kit.shadow(x, y, h, w * 1.25 + 1, d * 1.25 + 1, false, ry)
  kit.brick('building', x, y, h)
}

/**
 * An apartment building at Stage `stage`, of `floors` storeys over the wings `wings`, rectangles that meet at their
 * edges in an O, a U, an L or a bar, as one brick: one wall colour, with a row of windows a storey, lit or dark one
 * by one, on every face not against another wing, and a cap on each wing. The caller gives each Stage its floors.
 * - Stage 1: plain, with no water tank.
 * - Stage 2: a water tank on the first wing, and an open walkway along the face each wing walks (`walks`), with a
 *   door between each two windows (#156).
 * - Stage 3: a balcony slab along every other face at each floor, with washing and futons hung out in some bays, and
 *   a plant room beside the water tank.
 * A few AC units (#156), more with each Stage, stand on its walls, walkways and balconies.
 */
function apartment(
  kit: Kit,
  wings: Bounds[],
  h: number,
  floors: number,
  stage = 2,
  walks: Walks = [],
  plan: ApartmentPlan = { roof: 'flat' },
) {
  const colour = kit.pick(COURTYARD.walls)
  kit.formed(`apartment ${plan.roof} ${wings.length} ${floors}`)
  const height = floors * 3.2 + 0.8
  const seed = spot(wings[0].x0, wings[0].y0) + 29 // which patterned windows light, and the finish's own draws
  const frontDoor = (ex: number, ey: number, ry: number) => {
    kit.put(kit.cuboid(1.9, 2.5, 0.12), APARTMENT_FINISH.frame, ex, ey, ry, 0, 0.1, h)
    kit.doorway(ex, ey, ry, 1.6, 0.16)
    kit.put(kit.cuboid(1.6, 2.3, 0.14), { material: kit.glass, tint: kit.windows[0], glow: 1.2 }, ex, ey, ry, 0, 0.12, h)
    kit.put(kit.cuboid(0.06, 2.3, 0.18), APARTMENT_FINISH.frame, ex, ey, ry, 0, 0.13, h)
    kit.put(kit.cuboid(2.8, 0.18, 1.5), COURTYARD.cap, ex, ey, ry, 0, 0.75, h + 2.62)
    kit.put(kit.cuboid(0.4, 0.08, 0.4), kit.lit(CREAM, APARTMENT_FINISH.light), ex, ey, ry, 0, 0.9, h + 2.56)
    kit.put(kit.cuboid(2.4, 0.16, 0.9), COURTYARD.cap, ex, ey, ry, 0, 0.45, h)
    kit.pool('door', ...to(ex, ey, ry, 0, 1.6), h, 3.4, 2.6, ry)
  }
  /** Whether `(px, py)` lies on a wing other than wing `self`. */
  const against = (px: number, py: number, self: number) =>
    wings.some((o, k) => k !== self && px > o.x0 - 0.05 && px < o.x1 + 0.05 && py > o.y0 - 0.05 && py < o.y1 + 0.05)
  // Its front door (#178), in the middle of a face of its first wing that looks out of the building, not into its
  // court or onto another wing: its walkway face if that one does, or else the first that does. Glass doors lit at
  // night under a canopy with a lamp, which leaves a pool.
  const door = kit.finished ? doorOf(wings, walks) : null
  // Where an AC unit may stand (#156): on the wall between two windows, or before a window on a walkway, and whether
  // a slab is there to stand on.
  const spots: { x: number; y: number; ry: number; slab: boolean }[] = []
  wings.forEach((wing, k) => {
    const [cx, cy, w, d] = [(wing.x0 + wing.x1) / 2, (wing.y0 + wing.y1) / 2, wing.x1 - wing.x0, wing.y1 - wing.y0]
    const plastered = { front: PATTERN.plaster, back: PATTERN.plaster, sides: PATTERN.plaster, storey: 3.2 }
    kit.cladded(kit.box(w, height, d, 0.6, 0.2), colour, cx, cy, h, 0, plastered, seed + k)
    apartmentRoof(kit, { x: cx, y: cy, w, d, ry: 0 }, h + height, plan, k, (px, py) => against(px, py, k), seed)
    for (const [face, [nx, ny]] of FACES.entries()) {
      const { n, at: bay } = baysOf(wing, face)
      const ry = Math.atan2(-nx, ny)
      const len = nx === 0 ? w : d
      const [mx, my] = [cx + (nx * w) / 2, cy + (ny * d) / 2]
      // From Stage 2 an open walkway runs along the face its wing walks (#156), and Stage 3's balconies take the rest.
      const walk = stage > 1 && walks[k] === face
      const balcony = stage === 3 && !walk && !against(mx + nx * 0.4, my + ny * 0.4, k)
      /** Whether a window or a door at `(px, py)` would look into the next wing, by just out of the face across its width. */
      const blind = (px: number, py: number) => [-0.9, 0, 0.9].some((a) => against(px + nx * 0.4 + ny * a, py + ny * 0.4 + nx * a, k))
      for (let i = 0; i < n; i++) {
        const [fx, fy] = bay(i)
        if (blind(fx, fy)) continue
        for (let f = 0; f < floors; f++) {
          const look = kit.pane(0.65) // drawn whether or not the front door takes its place
          const dim = walk && f > 0 && kit.finished // behind a walkway's lamps
          if (f === 0 && k === 0 && face === door?.face && i === door.bay) frontDoor(fx, fy, ry)
          else
            kit.add(kit.cuboid(1.5, 1.6, 0.3), dim ? { ...look, glow: APARTMENT_FINISH.walkway.dim } : look, fx, fy, h + 1.1 + f * 3.2, ry)
        }
        if (walk) spots.push({ x: fx, y: fy, ry, slab: true })
        // Between this window and the next: a door onto the walkway at each floor, or a wall for an AC unit.
        const [gx, gy] = nx === 0 ? [fx + 1.6, fy] : [fx, fy + 1.6]
        if (i === n - 1 || blind(gx, gy)) continue
        if (walk)
          for (let f = 1; f < floors; f++) {
            kit.add(kit.cuboid(0.95, 2.05, 0.16), TERRACE.door, gx, gy, h + 0.94 + f * 3.2, ry)
            // A lamp for each door on the walkway's parapet, on its outer face under the rail, where it shows from
            // outside as the wall behind the parapet does not, so that a block's walkways read as rows of dots at night
            // (#178).
            const { lamp, light } = APARTMENT_FINISH.walkway
            const { deep, parapet } = WALKWAY
            const top = h + 0.94 + parapet + f * 3.2 // under the rail
            if (kit.finished) kit.put(kit.cuboid(lamp[0], lamp[1], 0.1), kit.lit(CREAM, light), gx, gy, ry, 0, deep + 0.05, top - lamp[1])
          }
        else spots.push({ x: gx, y: gy, ry, slab: balcony })
      }
      if (walk) {
        // A slab the length of the face at each floor above the ground, behind a parapet with a steel rail on top.
        // Where it runs into another wing it stays hidden inside it.
        const { deep, parapet } = WALKWAY
        for (let f = 1; f < floors; f++) {
          const at = h + 0.7 + f * 3.2
          kit.add(kit.cuboid(len - 0.1, 0.24, deep), COURTYARD.cap, mx + (nx * deep) / 2, my + (ny * deep) / 2, at, ry)
          kit.add(kit.cuboid(len - 0.1, parapet, 0.14), COURTYARD.cap, mx + nx * (deep - 0.07), my + ny * (deep - 0.07), at + 0.24, ry)
          kit.add(kit.cuboid(len - 0.1, 0.07, 0.2), STEEL.frame, mx + nx * (deep - 0.07), my + ny * (deep - 0.07), at + 0.24 + parapet, ry)
        }
        // Washing hung out on the walkways, on a pole under the slab above, in some bays (#178).
        if (kit.finished)
          kit.seeded(seed + 50 + face + 4 * k, () => {
            for (let f = 1; f < floors - 1; f++)
              for (let i = 0; i < n; i++) {
                const [fx, fy] = bay(i)
                if (kit.rand() < APARTMENT_FINISH.washing[stage - 1] && !blind(fx, fy))
                  washing(kit, fx, fy, h + 0.7 + (f + 1) * 3.2 - 0.4, ry, 0.75, false)
              }
          })
      }
      // Stage 3's balconies: a slab and its railing along the face at every floor above the ground, unless the
      // face's middle is against another wing. Where a slab runs into another wing it stays hidden inside it. Washing
      // hangs on poles in some of their bays and futons over the rail in others, drawn from where the face stands.
      if (!balcony) continue
      for (let f = 1; f < floors; f++) {
        kit.add(kit.cuboid(len - 0.8, 0.24, 1.1), COURTYARD.cap, mx + nx * 0.55, my + ny * 0.55, h + 0.7 + f * 3.2, ry)
        kit.add(kit.cuboid(len - 0.8, 0.8, 0.12), COURTYARD.cap, mx + nx * 1.05, my + ny * 1.05, h + 0.94 + f * 3.2, ry)
      }
      kit.seeded(spot(mx, my), () => {
        for (let f = 1; f < floors; f++) {
          for (let i = 0; i < n; i++) {
            const [fx, fy] = bay(i)
            const r = kit.rand()
            if (blind(fx, fy)) continue
            if (r < 0.2) washing(kit, fx, fy, h + 0.7 + (f + 1) * 3.2 - 0.4, ry, 0.62, false)
            else if (r < 0.33) futon(kit, fx, fy, h + 1.76 + f * 3.2, ry, 1.05)
          }
        }
      })
    }
    kit.shadow(cx, cy, h, w * 1.2 + 2, d * 1.2 + 2)
  })
  // A few AC units (#156), drawn from where the building stands: on a slab where there is one, else on the wall.
  kit.seeded(spot(wings[0].x0, wings[0].y0), () => {
    for (let k = 0; k < [2, 3, 6][stage - 1] && spots.length && floors > 1; k++) {
      const [s] = spots.splice(Math.floor(kit.rand() * spots.length), 1)
      const f = 1 + Math.floor(kit.rand() * (floors - 1))
      kit.airCon(s.x, s.y, h + (s.slab ? 0.94 : 0.42) + f * 3.2, s.ry)
    }
  })
  const [first] = wings
  const [tx, ty] = [first.x0 + (first.x1 - first.x0) * 0.3, (first.y0 + first.y1) / 2]
  if (kit.finished) kit.seeded(seed + 40, () => apartmentPlant(kit, first, h + height + 0.65, stage))
  if (stage > 1) {
    kit.add(CYLINDER, TANK.body, tx, ty, h + height + 0.6, 0, 1.12, 2.2, 1.12)
    kit.add(CONE, TANK.lid, tx, ty, h + height + 2.8, 0, 1.2, 0.8, 1.2)
  }
  if (stage === 3) {
    // A plant room, roofed as the building's own roof is where the kit builds patterned (#216): sheets in the deck's
    // sage inside its white rim.
    const [pw, pd, tall] = [(first.x1 - first.x0) * 0.3, (first.y1 - first.y0) * 0.5, 2.6]
    const [sx, foot] = [first.x0 + (first.x1 - first.x0) * 0.68, h + height + 0.6]
    kit.add(kit.box(pw, tall, pd, 0.3, 0.1), COURTYARD.cap, sx, ty, foot)
    if (kit.patterned)
      kit.cladded(
        kit.box(pw - 0.4, 0.1, pd - 0.4, 0.1, 0.04),
        APARTMENT_FINISH.deck,
        sx,
        ty,
        foot + tall,
        0,
        { top: PATTERN.sheets },
        seed + 30,
      )
  }
  const { x0, y0, x1, y1 } = wingBounds(wings)
  kit.brick('building', (x0 + x1) / 2, (y0 + y1) / 2, h)
}
