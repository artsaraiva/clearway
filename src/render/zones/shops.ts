import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Vec } from '../../sim/geometry'
import { area, KERB } from '../blocks'
import { AIRCON, CREAM, FRONTAGE, type Kit, type Look as KitLook, pale, POOL, SHAPES, spot, to, VENDING_MACHINE } from '../kit'
import { GROW } from '../landmarks'
import { BOARD, cafeTable, menuBoard, STALL, WOOD } from '../props'
import { planter } from '../kerbside'
import { besideRow, near, overlap, rows, stands, turned, walled, yards, type Look, type RowLot, type ZoneGround } from './ground'
import { PATTERN } from '../pattern'
import type { Stage } from '../../game/game'

// The storeys a shop stands at each Stage, from the storeys it draws, which are its Stage 2 storeys.
const SHOP_STOREYS = (s: number, stage: number) => [1, s, s + 1][stage - 1]
// Shops: rows of shops 6.5 to 10.5 m wide and 10 to 12 m deep along every edge, their fronts 2.4 m in from it, and up
// to four trees in the yards behind.
const SHOPS = { margin: 2.4, deep: [10, 12], wide: [6.5, 10.5], trees: 4 } as const
// Shop details (#153), before the fronts that face a Road: the share of shops with each from Stages 1, 2 and 3 (one
// roll a shop for each detail, so a shop keeps its details as it grows), and the share of those with a vending machine
// that have a second at Stage 3. Parked bicycles stand `gap` m apart, `row` m out from the front to their middles and
// turned `slant` from facing out from it: nosed in to it, 23° off square; banners stand `banner` m out from the front and lanterns hang `lantern` m out under the awning. On the pavement, details keep
// `edge` m in from the Block's edge and `room` m from a lamp's post or a street tree's trunk. The banners' cloths are
// the shops' own colours.
const FRONT = {
  vending: [0.15, 0.35, 0.5],
  second: 0.5,
  nobori: [0, 0.35, 0.55],
  lanterns: [0, 0.35, 0.6],
  bikes: [0, 0.3, 0.5],
  wares: 0.6, // of the fronts with room before the window, the share with crates of produce or a plant stand (#175)
  gap: 0.7,
  row: 1,
  slant: Math.PI + 0.4,
  banner: 1.8,
  lantern: 1.3,
  edge: 0.55,
  room: 1.4,
  cloths: ['#2fb39a', '#f0b43c', '#ff9ab8', '#79c86a', '#a58ad8', '#e8925e', '#5cc0d6'],
} as const
// Shops built to the Finish (#175): each shop's form, picked so that no two neighbours share one, and the share of
// noodle shops, one in eight; the scenes a Block picks from, the narrowest lot a scene takes (m), so that it is longer than a car, or the
// widest on a Road where none is that wide, the shortest a stand may be (m), a car's length and a little, and the area (m²) from which a Block
// has a second at Stage 3; how deep the coloured paving before the fronts is (m) and its colours, one a Block; and how
// far out from the fronts shoppers walk (m), how long they stop at each (s), and their coats, the cars' colours.
const SHOP_FINISH = {
  forms: ['flat', 'facade', 'flat', 'setback'] as ShopForm[],
  noodle: 0.12,
  scenes: ['greengrocer', 'florist', 'capsules', 'stall'] as ShopScene[],
  wide: 8,
  stand: 4.5,
  second: 2500,
  paved: 1.7,
  paving: ['#efd3ad', '#ecd0c6', '#dde3c6', '#e5d6ec'],
  walk: 2.1,
  waits: [1.5, 5],
  coats: ['#ffffff', '#db6982', '#009dcb', '#ffc52d', '#64cb9f', '#bc9ef2', '#ff9cbb'],
}

/** Shops' look (`./index`). */
export const look: Look = { landmarks: false, finish: true, fill: shops }

/**
 * Shops: low shops shoulder to shoulder along every edge, each with its front, and trees behind. Every shop is one
 * storey at Stage 1 and a storey higher at Stage 3, built to the Finish (#175, `shop`) as its lot's
 * plan has it (`shopPlans`): a front colour and a form that differ from its neighbours', and one shop in eight a noodle
 * shop whose vent steams. From Stage 2 one lot on a Road holds the Block's scene, and at Stage 3 a second on a Block of
 * 2,500 m² or more (`sceneLots`). Coloured paving lies before the fronts from Stage 2, and shoppers walk the fronts on a
 * Road from Stage 2, stopping at each.
 */
function shops(g: ZoneGround) {
  const { kit, block } = g
  const lots = rows(
    g,
    SHOPS.margin,
    () => kit.range(...SHOPS.deep) * kit.deeper,
    () => kit.range(...SHOPS.wide),
  )
  const centre = middle(block)
  const plans = mulberry32(spot(centre.x, centre.y) ^ 0x51d5) // the plans' own stream: the kit's draws as they did
  const scenes = sceneLots(g, lots, plans)
  const paving = SHOP_FINISH.paving[Math.floor(plans() * SHOP_FINISH.paving.length)]
  const planned = shopPlans(lots, scenes, plans)
  for (const [i, l] of lots.entries()) {
    kit.lot(i, l)
    const storeys = kit.chance(0.45) ? 1 : 2
    const { front, form, noodle } = planned[i]
    const scene = scenes.get(i)
    // The end of its front its door is at, drawn from where it stands: the vending machines stand at the other.
    const door: 1 | -1 = mulberry32(spot(l.x, l.y))() < 0.5 ? -1 : 1
    g.kept.push({ ...turned(l.x, l.y, l.ry, 0, SHOPS.margin / 2), w: l.w, d: l.d + SHOPS.margin, ry: l.ry })
    if (scene?.kind === 'stall') {
      kit.scene('stall', () => kit.staged((stage) => stallCourt(g, l, stage, scene.from, paving)))
      continue
    }
    const plan = { front: FRONT.cloths[front], form, noodle, door, onRoad: l.onRoad }
    kit.staged((stage) => shop(kit, l.x, l.y, KERB, l.w, l.d, l.ry, { ...plan, stage, storeys: SHOP_STOREYS(storeys, stage) }))
    const paved = turned(l.x, l.y, l.ry, 0, l.d / 2 + SHOP_FINISH.paved / 2)
    kit.from(2, () => kit.paving(paved.x, paved.y, KERB, l.w, SHOP_FINISH.paved, l.ry, paving), spot(l.x, l.y) + 2)
    if (scene) sceneFront(g, l, door, scene)
    else if (l.onRoad) shopFront(g, l, door)
    else seamFront(g, l, door)
  }
  kit.lot(-1)
  shoppers(g, lots, scenes)
  backYard(g, lots, yards(g, lots, SHOPS.trees))
}

/**
 * Each shop's plan on lots `lots` (#175), drawn from `plans` lot by lot: its front's colour, another than the lot cut
 * before it has; its form, the one drawn or the next one that no shop beside it has, as round a row's corner (#193),
 * nor the lot cut before it unless that leaves none; and whether it is a noodle shop. Where the shops beside a lot
 * already have all three forms, one of them takes another its own neighbours leave it, so that the lot can have its
 * form. A food stall's court (`scenes`) has no form.
 */
function shopPlans(lots: RowLot[], scenes: Map<number, { kind: ShopScene }>, plans: () => number) {
  const { forms } = SHOP_FINISH
  const index: number[] = [] // each lot's form, as drawn and moved on
  const shop = (k: number) => scenes.get(k)?.kind !== 'stall'
  const beside = (i: number, j: number) => i !== j && shop(j) && besideRow(lots[Math.min(i, j)], lots[Math.max(i, j)])
  /** The forms of the shops beside lot `i` among the first `n`, but `but`. */
  const near = (i: number, n: number, but = -1) =>
    new Set(index.slice(0, n).flatMap((f, k) => (k !== but && beside(i, k) ? [forms[f]] : [])))
  let front = -1
  const drawn = lots.map((_, i) => {
    front = (front + 1 + Math.floor(plans() * (FRONT.cloths.length - 1))) % FRONT.cloths.length
    const around = near(i, i)
    const last = forms[index[i - 1]]
    const kept = forms.some((f) => !around.has(f) && f !== last) ? new Set([...around, last]) : around
    let form = Math.floor(plans() * forms.length)
    for (let n = 0; n < forms.length && kept.has(forms[form]); n++) form = (form + 1) % forms.length
    // Every form beside it: move one of those shops on to a form none of its own neighbours has, and take its old one.
    for (let j = 0; j < i && around.has(forms[form]) && shop(i); j++) {
      if (!beside(i, j) || near(i, i, j).has(forms[index[j]])) continue
      const theirs = near(j, i)
      const to = forms.findIndex((f) => f !== forms[index[j]] && !theirs.has(f))
      if (to < 0) continue
      ;[form, index[j]] = [index[j], to]
    }
    index.push(form)
    return { front, noodle: plans() < SHOP_FINISH.noodle }
  })
  return drawn.map((p, i) => ({ ...p, form: forms[index[i]] }))
}

/**
 * A shops Block's back yard behind its rows (#175): a delivery kei truck parked alongside the nearest back wall from
 * Stage 2, and a second at Stage 3, where there is room clear of the shops and the yard's trees.
 */
function backYard(g: ZoneGround, lots: RowLot[], trees: Vec[]) {
  const { kit, block, field } = g
  const centre = middle(block)
  const draw = mulberry32(spot(centre.x, centre.y) ^ 0xbac4)
  const parked: Vec[] = []
  for (let tries = 0; tries < 40 && parked.length < 2 && lots.length; tries++) {
    const [x, y] = [block.x0 + draw() * (block.x1 - block.x0), block.y0 + draw() * (block.y1 - block.y0)]
    if (field.sample(x, y) < 4 || lots.some((l) => near(l, x, y, 1.4))) continue
    if ([...trees, ...parked].some((p) => Math.hypot(p.x - x, p.y - y) < 4.5)) continue
    const back = lots.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a))
    const ry = back.ry + Math.PI / 2 // its length along the wall
    if (!stands(g, x, y, 2.4, 5, 1.5, ry)) continue
    // Its whole length clear of every shop and what stands on its walls, not its middle alone (#193).
    const truck = { x, y, w: 2.8, d: 5.4, ry, onRoad: false }
    if (lots.some((l) => overlap(walled(l), truck, 0))) continue
    kit.from(parked.length ? 3 : 2, () => kit.keiTruck(x, y, KERB, ry), spot(x, y))
    parked.push({ x, y })
    g.kept.push(truck) // which the kerbside's planters keep off
  }
}

/**
 * The lots of a shops Block that hold its scenes (#175): from Stage 2 one, on a lot facing a Road wide enough for it,
 * of a kind picked from where the Block lies; at Stage 3 a second of another kind on a Block of 2,500 m² or more, not
 * beside the first. A stand or capsule machines go only where they are longer than a car, and a food stall's court
 * where they would not be (#193).
 */
function sceneLots(g: ZoneGround, lots: RowLot[], draw: () => number): Map<number, { kind: ShopScene; from: number }> {
  const scenes = new Map<number, { kind: ShopScene; from: number }>()
  // On lots facing a Road; or on any, on a Block whose fronts all face the seam with the next Tile (#193).
  const facing = lots.flatMap((l, i) => (l.onRoad ? [i] : []))
  const road = facing.length ? facing : lots.map((_, i) => i)
  const widest = Math.max(0, ...road.map((i) => lots[i].w))
  const fit = road.filter((i) => lots[i].w >= Math.min(SHOP_FINISH.wide, widest))
  const kinds = [...SHOP_FINISH.scenes]
  let [first, at] = [kinds.splice(Math.floor(draw() * kinds.length), 1)[0], Math.floor(draw() * fit.length)]
  let [second, other] = [kinds[Math.floor(draw() * kinds.length)], draw()]
  if (!fit.length) return scenes
  // A stand or a row of capsule machines only where it is longer than a car: on a lot too narrow, a food stall's
  // court, whose tree is taller than one (#193).
  const long = (i: number) => frontOf(lots[i].w, 1).glazed - 0.2 >= SHOP_FINISH.stand
  if (!long(fit[at]) && first !== 'stall') [first, second] = ['stall', second === 'stall' ? first : second]
  scenes.set(fit[at], { kind: first, from: 2 })
  // The second on a lot wide enough not beside the first; or else any on a Road not beside it, or any at all (#193).
  const apart = (pool: number[]) => pool.filter((i) => Math.abs(i - fit[at]) > 1)
  const rest = [apart(fit), apart(road), apart(lots.map((_, i) => i))].find((pool) => pool.length) ?? []
  if (area(g.block.loop) < SHOP_FINISH.second || !rest.length) return scenes
  const lot = rest[Math.floor(other * rest.length)]
  if (!long(lot)) second = 'stall'
  scenes.set(lot, { kind: second, from: 3 })
  return scenes
}

/**
 * A scene before shop `l`'s front (#175), from its Stage: a greengrocer's or a florist's stand, or a row of capsule
 * machines, along its window, and pot plants by its door. Before that Stage the front has the pots and a menu board.
 */
function sceneFront(g: ZoneGround, l: RowLot, door: 1 | -1, scene: { kind: ShopScene; from: number }) {
  const { kit } = g
  const { window: u, glazed: len } = frontOf(l.w, door)
  const at = (lu: number, o: number) => turned(l.x, l.y, l.ry, lu, l.d / 2 + o)
  const build = { greengrocer, florist, capsules }[scene.kind as Exclude<ShopScene, 'stall'>]
  const p = at(u, scene.kind === 'capsules' ? 0.32 : 0.85)
  // What its stand spills toward the kerb at Stage 3 keeps off the poles, the lamps and the street trees there (#193).
  const kerbside = [...g.poles, ...g.lamps, ...g.kerbsideTrees]
  const free = (x: number, y: number) => !kerbside.some((q) => Math.hypot(q.x - x, q.y - y) < 0.8)
  kit.scene(scene.kind, () =>
    kit.staged((stage) => stage >= scene.from && build(kit, p.x, p.y, l.ry, len - 0.2, stage, free), spot(p.x, p.y)),
  )
  const q = at(-door * (l.w / 2 - 2.5), 0.6)
  if (kit.unclaimed(q.x, q.y, MENU.w, MENU.d, l.ry))
    kit.staged((stage) => stage < scene.from && menuBoard(kit, q.x, q.y, l.ry), spot(q.x, q.y))
  doorPots(g, l, door, true) // the stand takes the window's side of the door (#193)
}

/** m: a menu board's ground on the pavement, its legs' spread along the front and across it. */
const MENU = { w: 0.7, d: 0.5 }

/**
 * Whether something on the pavement before shop `l`'s front, its door at end `door`, reaching `half` m either way of `u`
 * m along the front, keeps clear of the pot plants by its door (#193).
 */
const offPots = (l: RowLot, door: 1 | -1, u: number, half: number) => frontOf(l.w, door).pots.every((p) => Math.abs(p - u) > half + 0.45)

/**
 * A food stall's court on lot `l` (#175), at Stage `stage`: the lot left open and paved, a bench at its back facing the
 * Road and a tree in a back corner from Stage 1, and from Stage `from` the food stall near the front, planters along
 * the court's sides, and at Stage 3 a table under a parasol.
 */
function stallCourt(g: ZoneGround, l: RowLot, stage: number, from: number, paving: string) {
  const { kit } = g
  const at = (u: number, v: number) => turned(l.x, l.y, l.ry, u, v)
  const back = -l.d / 2 + 1.6
  const bench = at(0, back)
  kit.bench(bench.x, bench.y, KERB, l.ry)
  const tree = at((l.w / 2 - 1.6) * (spot(l.x, l.y) % 2 ? 1 : -1), back)
  kit.tree(tree.x, tree.y, KERB, GROW[stage - 1] * 0.6, 'round')
  if (stage < from) return
  const court = at(0, SHOP_FINISH.paved / 2)
  kit.paving(court.x, court.y, KERB, l.w, l.d + SHOP_FINISH.paved, l.ry, paving)
  const stall = at(0, l.d / 2 - 1.3)
  foodStall(kit, stall.x, stall.y, l.ry)
  for (const k of [-1, 1]) {
    const p = at(k * (l.w / 2 - 0.5), 0)
    planter(kit, p.x, p.y, l.ry + Math.PI / 2, Math.min(l.d - 4, 4))
  }
  if (stage === 3) {
    const t = at(-(l.w / 2 - 2), back + 2.2)
    cafeTable(kit, t.x, t.y, FRONT.cloths[spot(l.x, l.y) % FRONT.cloths.length])
  }
}

/** Pot plants either side of shop `l`'s door, Block-zoom, from Stage 1 (#175); or, if `outer`, on its outer side alone. */
function doorPots(g: ZoneGround, l: RowLot, door: 1 | -1, outer = false) {
  const spots = frontOf(l.w, door)
    .pots.slice(0, outer ? 1 : 2)
    .map((u) => turned(l.x, l.y, l.ry, u, l.d / 2 + 0.35))
  g.kit.from(
    1,
    () =>
      pots(
        g.kit,
        spots.map((p) => [p.x, p.y]),
      ),
    spot(spots[0].x, spots[0].y),
  )
}

/** Before a shop's front that faces the seam with the next Tile (#175): pot plants by its door and, on half, a menu board. */
function seamFront(g: ZoneGround, l: RowLot, door: 1 | -1) {
  doorPots(g, l, door)
  const q = turned(l.x, l.y, l.ry, -door * (l.w / 2 - 2.6), l.d / 2 + 0.6)
  if (spot(q.x, q.y) % 2 && g.kit.unclaimed(q.x, q.y, MENU.w, MENU.d, l.ry) && offPots(l, door, -door * (l.w / 2 - 2.6), MENU.w / 2))
    g.kit.from(1, () => menuBoard(g.kit, q.x, q.y, l.ry), spot(q.x, q.y))
}

/**
 * Shoppers walking each run of fronts on a Road (#175): one from Stage 2 and, on a run of three shops or more, a
 * second at Stage 3, setting out half its loop ahead. Each walks along the run `SHOP_FINISH.walk` m out from the fronts,
 * stopping a few seconds at each front's middle and turning at the run's ends, past a scene's lot as past any other but
 * a greengrocer's or a florist's, where a run ends (#193): their stands reach to the kerb at Stage 3.
 */
function shoppers(g: ZoneGround, lots: RowLot[], scenes: Map<number, { kind: ShopScene }>) {
  const { kit } = g
  const runs: RowLot[][] = []
  let run: RowLot[] = []
  for (const [i, l] of lots.entries()) {
    const last = run[run.length - 1]
    // A greengrocer's or a florist's stand, whose crates and tall plants spill to the kerb at Stage 3, ends a run (#193).
    const kind = scenes.get(i)?.kind
    const walked = l.onRoad && kind !== 'greengrocer' && kind !== 'florist'
    if (walked && last && Math.abs(last.ry - l.ry) < 1e-6 && Math.hypot(l.x - last.x, l.y - last.y) < (l.w + last.w) / 2 + 0.6) run.push(l)
    else {
      if (run.length >= 2) runs.push(run)
      run = walked ? [l] : []
    }
  }
  if (run.length >= 2) runs.push(run)
  for (const r of runs) {
    const out = (l: RowLot, u: number) => turned(l.x, l.y, l.ry, u, l.d / 2 + SHOP_FINISH.walk)
    const [first, last] = [r[0], r[r.length - 1]]
    const there = [out(first, -first.w / 2 + 0.5), ...r.map((l) => out(l, 0)), out(last, last.w / 2 - 0.5)]
    const pts = [...there, ...there.slice(0, -1).reverse()]
    const stops = [0]
    for (let i = 1; i < pts.length - 1; i++) stops.push(stops[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
    const draw = mulberry32(spot(first.x, first.y) ^ 0x5b0b)
    const [lo, hi] = SHOP_FINISH.waits
    const waits = stops.map(() => lo + draw() * (hi - lo))
    const paints = [0, 1].map(() => SHOP_FINISH.coats[Math.floor(draw() * SHOP_FINISH.coats.length)])
    const loop = polyline(pts)
    kit.from(2, () => kit.mover('shopper', loop, stops, 0, KERB, { waits, paint: paints[0] }), spot(pts[0].x, pts[0].y))
    if (r.length >= 3)
      kit.from(
        3,
        () => kit.mover('shopper', loop, stops, Math.floor(stops.length / 2), KERB, { waits, paint: paints[1] }),
        spot(pts[1].x, pts[1].y),
      )
  }
}

/**
 * The details before shop `l`'s front on a Road (#153), each drawn from where the shop stands, so that nothing else on
 * the Block changes: a vending machine or two at the end away from the door, a row of bicycles beside them, nobori
 * banners at the pavement's edge along the rest, paper lanterns under the awning, and pot plants by the door. Each stands
 * from the Stage its roll gives it (`FRONT`), and more come at Stage 3: a second vending machine on half the fronts with
 * one, two more bicycles where there is room before the door, a third banner and two more lanterns. A front with no
 * vending machine has a menu board on the pavement. What stands on the pavement keeps on the Block, 0.6 m in from its
 * edge, and clear of the lamps at its corners and the street trees. The bicycles, pots and menu board are Block-zoom
 * props.
 */
function shopFront(g: ZoneGround, l: RowLot, door: 1 | -1) {
  const { kit, field } = g
  const draw = mulberry32(spot(l.x, l.y))
  const half = l.w / 2
  /** Where the point `u` m along the front from its middle and `o` m out from it lies on the map. */
  const at = (u: number, o: number) => turned(l.x, l.y, l.ry, u, l.d / 2 + o)
  const others = [...g.lamps, ...g.kerbsideTrees]
  /** Whether the pavement `o` m out from the front at each of `us` along it is clear. */
  const clear = (o: number, ...us: number[]) =>
    us.every((u) => {
      const p = at(u, o)
      return field.sample(p.x, p.y) >= FRONT.edge && !others.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < FRONT.room)
    })
  /** The Stage from which a detail stands, by a roll against its shares of the shops from Stages 1, 2 and 3; 0 for none. */
  const first = (shares: readonly number[]) => {
    const roll = draw()
    return shares.findIndex((s) => roll < s) + 1
  }
  draw() // the door's end, which `shops` drew from where the shop stands, as this stream's first draw
  const side = -door // the end the vending machines stand at
  const [vending, banners, lanterns, bikes] = [first(FRONT.vending), first(FRONT.nobori), first(FRONT.lanterns), first(FRONT.bikes)]
  const [second, count, cloth, amber, wares] = [
    draw() < FRONT.second,
    2 + Math.floor(draw() * 3),
    FRONT.cloths[Math.floor(draw() * FRONT.cloths.length)],
    draw() < 0.5,
    draw(),
  ]
  /** Build `fn` at `p` from Stage `stage`, on a stream of its own from where it stands. */
  const from = (stage: number, p: Vec, fn: (p: Vec) => void) => stage && kit.from(stage, () => fn(p), spot(p.x, p.y))
  /** Along the front, `t` m in from the vending machines' end. */
  const u = (t: number) => side * (half - t)
  const doorFrame = frontOf(l.w, door).clear // where the door's frame begins, in from that end
  let free = 0.3 // where the stretch left for the banners begins, in from that end
  let board = 0 // where the menu board's stretch ends, in from that end, which the wares keep clear of (#193)
  /** Whether a vending machine at `p` keeps off the step before a door (#193). */
  const unclaimed = (p: Vec) => kit.unclaimed(p.x, p.y, VENDING_MACHINE.wide, VENDING_MACHINE.deep, l.ry)
  if (vending) {
    // Backed up to the front at its end, and a second beside it at Stage 3.
    const [a, b] = [u(0.85), u(2.15)]
    if (clear(0.5, a - 0.6, a + 0.6) && clear(1, a) && unclaimed(at(a, 0.5)) && offPots(l, door, a, 0.6)) {
      from(vending, at(a, 0.5), (p) => kit.vendingMachine(p.x, p.y, KERB, l.ry))
      if (second && clear(0.5, b - 0.6, b + 0.6) && unclaimed(at(b, 0.5)) && offPots(l, door, b, 0.6))
        from(3, at(b, 0.5), (p) => kit.vendingMachine(p.x, p.y, KERB, l.ry))
      free = second ? 2.85 : 1.55
    }
  } else {
    const q = at(u(1.1), 0.6)
    if (kit.unclaimed(q.x, q.y, MENU.w, MENU.d, l.ry) && offPots(l, door, u(1.1), MENU.w / 2)) {
      kit.from(1, () => menuBoard(kit, q.x, q.y, l.ry), spot(q.x, q.y))
      board = 1.55
    }
  }
  if (bikes) {
    // A row in from the vending machines, nosed in to the front, as many as fit before the door, and two more on its
    // end at Stage 3 where there is room.
    const t0 = free + 0.3
    const room = Math.floor((doorFrame - 0.35 - t0) / FRONT.gap) + 1
    const n = Math.min(count, room)
    const extra = Math.min(2, room - n)
    const t = (k: number) => t0 + k * FRONT.gap
    /** `n` bicycles on from the `k`-th, from Stage `stage`. */
    const row = (stage: number, k: number, n: number) =>
      from(stage, at(u(t(k + (n - 1) / 2)), FRONT.row), (p) =>
        kit.blockZoomProps(() => kit.bicycles(p.x, p.y, KERB, l.ry, n, FRONT.gap, FRONT.slant)),
      )
    const reach = [FRONT.row - 0.15, FRONT.row + 0.85] // the pavement the row stands on
    if (n >= 2 && reach.every((o) => clear(o, u(t(0)), u(t(n - 1))))) {
      row(bikes, 0, n)
      const more = extra > 0 && reach.every((o) => clear(o, u(t(n + extra - 1))))
      if (more) row(3, n, extra)
      free = t(more ? n + extra : n)
    }
  }
  const ware = Math.max(free, board)
  if (ware < doorFrame - 1.8 && wares < FRONT.wares) {
    // Before the window where no bicycles or menu board stand, from Stage 2: crates of produce, or a plant stand,
    // Block-zoom.
    const q = at(u(ware + 0.9), 0.45)
    if (clear(0.45, u(ware + 0.2), u(ware + 1.6)) && offPots(l, door, u(ware + 0.9), 0.7))
      kit.from(2, () => (wares < FRONT.wares / 2 ? produce : plantStand)(kit, q.x, q.y, l.ry), spot(q.x, q.y))
  }
  if (banners) {
    // Up to three along what is left of the front, at the pavement's edge, each cloth hung to the right of its pole.
    const len = l.w - 0.3 - free
    const n = Math.min(3, Math.floor(len / 1.3))
    for (let k = 0; k < n; k++) {
      const p = u(free + ((k + 0.5) * len) / n) - 0.4
      if (clear(FRONT.banner, p, p + 0.8)) from(k < 2 ? banners : 3, at(p, FRONT.banner), (q) => nobori(kit, q.x, q.y, KERB, l.ry, cloth))
    }
  }
  if (lanterns) {
    // Two hung under the awning's span, and two more between them at Stage 3.
    for (const [t, stage] of [
      [-0.3, lanterns],
      [0.3, lanterns],
      [-0.1, 3],
      [0.1, 3],
    ])
      from(stage, at(t * l.w * 0.86, FRONT.lantern), (p) => lantern(kit, p.x, p.y, KERB + 1.95, amber))
  }
  doorPots(g, l, door)
}

// The shops' scenes and the small things before their fronts (#175), built from the kit's shapes. A scene is a
// standing piece larger than a car, seen from Tile zoom: a greengrocer's stand spilling onto the pavement, a florist's,
// a row of capsule machines, or a food stall with its lantern and steam. Pot plants, menu boards, crates and stools are
// Block-zoom props (the kit's `blockZoomProps`), hidden beyond Tile zoom.

/** The scenes a shops Block picks from (#175). */
type ShopScene = 'greengrocer' | 'florist' | 'capsules' | 'stall'

// Colours, beside the stands' timber, the food stall's and the menu board's (`../props`): produce (cabbages, oranges,
// lemons, aubergines, daikon and apples in the cars' raspberry, under the cap on the Jam's red-orange); flowers and
// buckets; capsule machines and their lit tops.
const PRODUCE = ['#9fd36b', '#f0a43c', '#f6d36a', '#7a5aa8', '#f4f1ea', '#db6982', '#79c86a', '#e8925e']
const FLOWERS = ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0', '#ff9ab8', '#f0b43c', '#ffffff']
const LEAF = '#5fbc51'
const BUCKET = '#e9eef2'
const TAU = Math.PI * 2
const CAPSULE = { bodies: ['#ff9ab8', '#5cc0d6', '#f0b43c', '#79c86a', '#a58ad8', '#f4f6f8'], top: '#f4f6f8', trim: '#4a525c' }

/**
 * A timber crate of produce at `(lx, ly)` in the frame of something at `(x, y)` facing `ry`, its foot `z` above the road,
 * heaped `heap` m, its produce's colour from `draw`.
 */
function crate(kit: Kit, x: number, y: number, ry: number, lx: number, ly: number, z: number, heap: number, draw: () => number) {
  kit.put(kit.cuboid(0.58, 0.3, 0.42), WOOD.pale, x, y, ry, lx, ly, z)
  kit.put(kit.cuboid(0.52, heap, 0.36), PRODUCE[Math.floor(draw() * PRODUCE.length)], x, y, ry, lx, ly, z + 0.3)
}

/**
 * A stand of three timber steps `len` long, stepping up to the shop front behind it, its middle at `(x, y)` and its
 * front facing `ry`, with what each step carries laid by `fill(lx, ly, z)` at each place along it, `pitch` m apart.
 */
function stand(kit: Kit, x: number, y: number, ry: number, len: number, pitch: number, fill: (lx: number, ly: number, z: number) => void) {
  for (let k = 0; k < 3; k++) {
    const [ly, z] = [0.45 - k * 0.42, KERB + 0.25 + k * 0.3]
    kit.put(kit.cuboid(len, z - KERB, 0.42), WOOD.stand, x, y, ry, 0, ly, KERB)
    const n = Math.max(1, Math.floor(len / pitch))
    for (let i = 0; i < n; i++) fill(-len / 2 + (i + 0.5) * (len / n), ly, z)
  }
}

/** Whether a stand's Stage 3 spill may stand at a point (#193): anywhere, unless its shop says otherwise. */
const Free = (_x: number, _y: number) => true

/**
 * A greengrocer's stand before a shop front, as one brick (#175): produce heaped on three steps along the front, `len`
 * long, with a price board at one end; at Stage 3 crates more spill to the kerb. Its middle at `(x, y)`, 0.6 m out from
 * the front facing `ry`.
 */
function greengrocer(kit: Kit, x: number, y: number, ry: number, len: number, stage: number, free = Free) {
  const draw = mulberry32(spot(x, y))
  stand(kit, x, y, ry, len, 0.7, (lx, ly, z) =>
    kit.put(kit.cuboid(0.62, 0.16, 0.36), PRODUCE[Math.floor(draw() * PRODUCE.length)], x, y, ry, lx, ly, z),
  )
  kit.put(kit.cuboid(0.7, 0.5, 0.05), BOARD.chalk, x, y, ry, len / 2 - 0.4, 0.68, KERB + 0.6)
  if (stage === 3)
    for (let i = 0; i < 4; i++) {
      const lx = -len / 2 + 0.5 + i * 0.7
      if (free(...to(x, y, ry, lx, 1.05))) crate(kit, x, y, ry, lx, 1.05, KERB, 0.1, draw)
    }
  kit.shadow(x, y, KERB, len + 0.6, 1.8, false, ry)
  kit.brick('building', x, y, KERB)
}

/**
 * A florist's stand before a shop front, as one brick (#175): buckets of flowers on three steps along the front, `len`
 * long, and pot plants by it; at Stage 3 a row of tall plants at the kerb's side.
 */
function florist(kit: Kit, x: number, y: number, ry: number, len: number, stage: number, free = Free) {
  const draw = mulberry32(spot(x, y))
  stand(kit, x, y, ry, len, 0.62, (lx, ly, z) => {
    kit.put(kit.cuboid(0.34, 0.34, 0.3), BUCKET, x, y, ry, lx, ly, z)
    const [bx, by] = to(x, y, ry, lx, ly)
    kit.add(SHAPES.bush, FLOWERS[Math.floor(draw() * FLOWERS.length)], bx, by, z + 0.5, draw() * TAU, 0.3, 0.26, 0.3)
  })
  if (stage === 3)
    for (let i = 0; i < 3; i++) {
      const [px, py] = to(x, y, ry, -len / 2 + 0.6 + i * 1.1, 1.05)
      if (!free(px, py)) continue
      kit.add(SHAPES.pot, '#e9e4da', px, py, KERB, 0, 0.32, 0.5, 0.32)
      kit.add(SHAPES.sphere, LEAF, px, py, KERB + 1.05, 0, 0.42, 0.62, 0.42)
    }
  kit.shadow(x, y, KERB, len + 0.6, 1.8, false, ry)
  kit.brick('building', x, y, KERB)
}

/**
 * A row of capsule machines before a shop front, two high, `len` long, as one brick (#175): each a body in a bright
 * colour under a clear top full of capsules that lights at dusk as a vending machine's front does, and leaves a pool.
 * Stage 3 tops each pile with a sign.
 */
function capsules(kit: Kit, x: number, y: number, ry: number, len: number, stage: number, _free = Free) {
  const draw = mulberry32(spot(x, y))
  const n = Math.max(4, Math.floor(len / 0.66))
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (i + 0.5) * (len / n)
    for (let k = 0; k < 2; k++) {
      const z = KERB + k * 1.02
      kit.put(kit.cuboid(0.6, 0.56, 0.52), CAPSULE.bodies[Math.floor(draw() * CAPSULE.bodies.length)], x, y, ry, lx, 0, z)
      kit.put(kit.cuboid(0.52, 0.4, 0.44), kit.lit(CAPSULE.top, 0.5), x, y, ry, lx, 0, z + 0.56)
      kit.put(kit.cuboid(0.6, 0.06, 0.52), CAPSULE.trim, x, y, ry, lx, 0, z + 0.96)
    }
  }
  if (stage === 3) kit.put(kit.cuboid(len * 0.7, 0.5, 0.1), kit.lit('#ff9ab8', 0.33), x, y, ry, 0, -0.1, KERB + 2.08)
  kit.pool('vending', ...to(x, y, ry, 0, 1), KERB, len + 1, 1.8, ry)
  kit.shadow(x, y, KERB, len + 0.6, 1.4, false, ry)
  kit.brick('building', x, y, KERB)
}

/**
 * A food stall (yatai) at `(x, y)`, its counter facing `ry`, as one brick (#175): a timber cart on wheels under a roof on
 * four posts, a noren along the roof's edge, a pot on the counter whose steam rises through the working day, an amber
 * lantern at its corner that lights at dusk and leaves its pool, and stools before the counter, which are Block-zoom
 * props. About 3.4 m long and 2.6 m deep with its stools.
 */
function foodStall(kit: Kit, x: number, y: number, ry: number) {
  const roof = STALL.roofs[spot(x, y) % STALL.roofs.length]
  kit.put(kit.cuboid(3, 0.95, 1.2), STALL.cart, x, y, ry, 0, 0, KERB + 0.32)
  kit.put(kit.cuboid(3.3, 0.08, 1.45), STALL.counter, x, y, ry, 0, 0.1, KERB + 1.27)
  for (const lx of [-1, 1]) {
    kit.put(SHAPES.disc, '#2f3440', x, y, ry, lx * 0.95, 0.61, KERB + 0.36, 0.34, 0.34, 1)
    for (const ly of [-0.55, 0.55]) kit.put(kit.cuboid(0.08, 1.35, 0.08), STALL.cart, x, y, ry, lx * 1.45, ly, KERB + 1.35)
  }
  kit.put(kit.cuboid(3.5, 0.12, 1.8), roof, x, y, ry, 0, 0.05, KERB + 2.7)
  for (const k of [-1, 0, 1]) kit.put(kit.cuboid(1.1, 0.5, 0.03), STALL.noren, x, y, ry, k * 1.15, 0.94, KERB + 2.2)
  const [px, py] = to(x, y, ry, -0.7, -0.15)
  kit.add(SHAPES.thin, '#9aa3ad', px, py, KERB + 1.35, 0, 0.32, 0.4, 0.32)
  kit.steam(px, py, KERB + 1.9)
  kit.blockZoomProps(() => {
    for (const lx of [-1, 0, 1]) kit.put(SHAPES.thin, STALL.stool, x, y, ry, lx * 0.95, 1.15, KERB, 0.2, 0.62, 0.2)
  })
  kit.pool('stall', ...to(x, y, ry, 0, 0.6), KERB, 4.6, 3.6, ry)
  kit.shadow(x, y, KERB, 3.8, 2.2, false, ry)
  kit.brick('building', x, y, KERB)
  lantern(kit, ...to(x, y, ry, 1.5, 0.9), KERB + 2.05, true)
}

/** Pot plants about 0.7 m tall standing at `spots` on the pavement, as one Block-zoom brick (#175), each in a pot of its own colour. */
function pots(kit: Kit, spots: [number, number][]) {
  if (!spots.length) return
  const draw = mulberry32(spot(...spots[0]))
  kit.blockZoomProps(() => {
    for (const [x, y] of spots) kit.pot(x, y, KERB, 0.7 * (0.75 + draw() * 0.5), draw)
  })
  kit.brick('building', ...spots[0], KERB)
}

/**
 * A plant stand at `(x, y)` against a shop front facing `ry`, as one Block-zoom brick (#175): two timber steps with pot
 * plants on them.
 */
function plantStand(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.blockZoomProps(() => {
    for (let k = 0; k < 2; k++) {
      const [ly, z] = [0.2 - k * 0.32, KERB + 0.35 + k * 0.35]
      kit.put(kit.cuboid(1.3, z - KERB, 0.32), WOOD.stand, x, y, ry, 0, ly, KERB)
      for (const lx of [-0.42, 0, 0.42]) kit.pot(...to(x, y, ry, lx, ly), z, 0.42 + draw() * 0.18, draw)
    }
  })
  kit.brick('building', x, y, KERB)
}

/** Crates of produce at `(x, y)`, facing `ry`, as one Block-zoom brick (#175): two on the pavement and one on top. */
function produce(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.blockZoomProps(() => {
    for (const [lx, z] of [
      [-0.32, 0],
      [0.32, 0],
      [0, 0.32],
    ])
      crate(kit, x, y, ry, lx, 0, KERB + z, 0.08, draw)
  })
  kit.brick('building', x, y, KERB)
}

// Nobori banners and paper lanterns: their palette, shapes and builders, beside the fill that lays them (#153, #210). A
// banner's pole (its cloth and lettering are `../movers`'); a lantern's amber and its dark caps, the cream one the
// bulb's own. A cream lantern glows at twice a lamp's strength, so it burns whiter than the lit window behind it, and an
// amber one at a third of it, so it keeps its colour.
const NOBORI = { pole: '#c4ccd4' }
const LANTERN = { amber: '#f6b04a', caps: '#4a525c', glows: { cream: 2, amber: 0.33 } }
// A paper lantern's body, a barrel a metre tall turned on a lathe, open at the ends its caps cover.
const PAPER = new THREE.LatheGeometry(
  [
    [0.2, -0.5],
    [0.31, -0.36],
    [0.36, -0.12],
    [0.36, 0.12],
    [0.31, 0.36],
    [0.2, 0.5],
  ].map(([r, y]) => new THREE.Vector2(r, y)),
  10,
)
const CAP = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)

/**
 * A nobori banner at `(x, y)`, its cloth facing `ry` (0 north, π/2 west) and hung to the right of its pole from a rod
 * across its top, as one brick (#153): the pole and rod stand still, and the cloth, a tall narrow one in `colour` with a
 * pale band of lettering down it, flutters in the wind and is furled for the night as a flag is (`../movers`).
 * Oversized a little, as the props are.
 */
function nobori(kit: Kit, x: number, y: number, h: number, ry: number, colour: string) {
  kit.add(kit.cuboid(0.07, 3.7, 0.07), NOBORI.pole, x, y, h)
  kit.local(kit.cuboid(0.8, 0.05, 0.05), NOBORI.pole, x, y, ry, 0.4, 0, h + 3.5)
  kit.fly('nobori', x, y, h + 3.48, h + 3.48, colour, { ry })
  kit.brick('tree', x, y, h)
}

/**
 * A paper lantern hung on a short cord at `(x, y)`, its middle `h` above the road, as one brick (#153): cream or amber,
 * lit at dusk as the lamps are, with dark caps, a metre tall and oversized as the props are.
 */
function lantern(kit: Kit, x: number, y: number, h: number, amber: boolean) {
  const paper: KitLook = amber
    ? kit.lit(LANTERN.amber, LANTERN.glows.amber)
    : { material: kit.bulb, tint: new THREE.Color(1, 1, 1), glow: LANTERN.glows.cream }
  kit.add(PAPER, paper, x, y, h)
  for (const at of [h + 0.46, h - 0.54]) kit.add(CAP, LANTERN.caps, x, y, at, 0, 0.22, 0.08, 0.22)
  kit.add(kit.cuboid(0.03, 0.5, 0.03), LANTERN.caps, x, y, h + 0.54) // its cord
  kit.pool(amber ? 'amber' : 'cream', x, y, KERB, POOL.lantern, POOL.lantern) // on the pavement it hangs over
  kit.brick('lamp', x, y, h)
}

// The shop: its palette, its plan and its builder, beside the fill that lays it (#207).
const { awning: AWNING, cone: CONE8, disc: FACING_DISC, thin: THIN } = SHAPES
// Shops: a ground floor in a bold colour, which the awning and the signs take too, under pale storeys, so that it leads.
const SHOP = {
  fronts: ['#2fb39a', '#f0b43c', '#ff9ab8', '#79c86a', '#a58ad8', '#e8925e', '#5cc0d6'],
  uppers: ['#fff7e8', '#ffe9d2', '#fde2e4', '#e3f4dc', '#fff1c7', '#e6f0fb'],
  stripe: FRONTAGE.stripe,
}
// Shops built to the Finish (#175). A front: a glass door in a frame under a shop curtain (noren) of three panels
// with a crest, a shop window over a sill, a signboard over the awning with marks for lettering, and a tall sign
// standing out from the wall; the marks pale on a dark board and dark on a pale one. A roof: a parapet in stone round a
// flat roof, AC condensers, a panel water tank on a steel stand, a billboard on two posts, a stair house on a setback
// shop of one storey, and at Stage 3 a timber terrace with tables, a parasol and string lights. A Stage 3 front on a
// Road lies under the row's arcade: a pale roof on steel posts, glowing at night as if lit from under it, with a lit
// fascia. How brightly each lit part glows, for the lamps' glow.
const SHOPFRONT = {
  door: { wide: 1.5, tall: 2.3, frames: FRONTAGE.frames },
  noren: ['#3f4a5e', '#fbf8f2', '#8a5a3c', '#55705f', '#6c5a8a', '#3f4a5e'],
  trim: FRONTAGE.trim,
  marks: FRONTAGE.marks,
  boards: ['#2fb39a', '#f0b43c', '#ff9ab8', '#79c86a', '#a58ad8', '#e8925e', '#5cc0d6', '#fbf8f2', '#2f3440', '#fff1c7'],
  parapet: '#efe6d8',
  steel: '#9aa3ad',
  tank: '#dde6ec',
  deck: '#c49a6c',
  arcade: '#f4f1ea',
  balcony: '#e6e2da',
  goods: [
    ['#f6d36a', '#ffadc8', '#fbf8f2', '#79c86a'],
    ['#e8925e', '#f0b43c', '#fbe3a2', '#c49a6c'],
    ['#5cc0d6', '#a58ad8', '#fbf8f2', '#ff9ab8'],
    ['#79c86a', '#2fb39a', '#f6d36a', '#fbf8f2'],
  ],
  lit: { board: FRONTAGE.lit.board, marks: FRONTAGE.lit.marks, strip: 1.2, string: 1.5, arcade: 0.48, awning: 0.3 },
}
// Crates at a shop's back door, and the pots of plants by its front (#175).
const CRATES = ['#f0c75e', '#79c86a', '#e9eef2', '#5cc0d6', '#ff9ab8']
/** m a setback shop's upper storeys stand back from its front, behind a balcony (#175). */
const SETBACK = 1.6
/** How deep a shop's arcade reaches over the pavement, m out from its front (#175): short of the banners. */
const ARCADE = 1.45
/** A shop's stone parapet round its roof, m wide and tall (#175). */
const PARAPET = { wide: 0.26, tall: 0.42 }
/**
 * A shop's form (#175): a flat roof inside a parapet, a false front raised over the roof's front edge carrying its
 * signboard, or upper storeys set back behind a balcony over the ground floor.
 */
type ShopForm = 'flat' | 'facade' | 'setback'
/** What a shop's lot gives it, the same at every Stage but `storeys` and `stage` (#175). */
interface ShopPlan {
  /** Its storeys at the Stage built. */
  storeys: number
  stage: Stage
  /** Whether its front faces a Road, rather than the seam with the next Tile: only a Road's has signs above its roof. */
  onRoad: boolean
  /** The end of its front its door is at: 1 its right, -1 its left (as `local`'s x runs). */
  door: 1 | -1
  /** Its ground floor's colour, picked so that no shop shares its neighbour's. */
  front: string
  form: ShopForm
  /** Whether its vent steams, as a noodle shop's does, from Stage 2. */
  noodle: boolean
}
/**
 * Where the parts of a shop's front `w` m wide lie along it (#175), its door at end `door` (as `ShopPlan`'s), each m
 * from the front's middle as `local`'s x runs: the door's middle; the window's middle and its length (`glazed`), from
 * 0.35 m in from the other end to short of the door's frame; and a pot plant either side of the door. `clear` is how far
 * the front runs in from the window's end before the door's frame. `shop` and the fill laying the pavement before
 * it both read it.
 */
function frontOf(w: number, door: 1 | -1) {
  const [a, b] = [-door * (w / 2 - 0.35), door * (w / 2 - 2.25)]
  return {
    door: door * (w / 2 - 1.15),
    window: (a + b) / 2,
    glazed: Math.abs(b - a),
    pots: [door * (w / 2 - 0.15), door * (w / 2 - 2.2)],
    clear: w - 2.1,
  }
}

/**
 * A shop at Stage `plan.stage`, as one brick: `w` along its front and `d` deep, its front facing `ry`, built to the
 * Finish (#175) as its lot plans it. A ground floor in its front's colour under pale storeys, the walls and
 * roof wearing surface pattern where the kit builds patterned (#174): panels and high windows on the ground floor's
 * back and ends, a service door in the middle of its back, siding and a window in every bay of each upper storey all
 * round, and tile rows inside a stone parapet on its flat roof. Its front: a glass door in a frame under a noren, a
 * shop window showing goods over a sill, a signboard over a striped awning, and on a Road a tall sign standing out
 * from the wall and a billboard on the roof. Its roof: AC condensers, a panel water tank and, on some, a terrace. At
 * its back: gas cylinders, a pipe, crates and an AC unit, which are Block-zoom props. Its colours and which signs it
 * would have are drawn before anything a Stage changes:
 * - Stage 1: one storey, a narrower shop window, a signboard unlit, one condenser.
 * - Stage 2: its storeys; the signboard lit; on a Road, on some, a tall sign and a billboard; on some, a water tank.
 * - Stage 3: a storey more and a pale cornice over the ground floor; on a Road, both signs and an arcade over the
 *   pavement in place of the awning; more tanks, and a timber terrace with tables, a parasol and string lights on
 *   some roofs.
 * Its lit front throws a pool of light on the pavement before it, out to the kerb, and a terrace's string lights one
 * on the terrace.
 */
function shop(kit: Kit, x: number, y: number, h: number, w: number, d: number, ry: number, plan: ShopPlan) {
  const { storeys, stage, onRoad, door, front, form, noodle } = plan
  kit.formed(`shop ${form} ${storeys}`)
  const [upper, stripe, roofSign, hung, board, billboard, tallSign] = [
    kit.pick(SHOP.uppers),
    kit.pick(SHOP.fronts),
    kit.rand() < 0.45,
    kit.rand() < 0.45,
    kit.pick(SHOPFRONT.boards),
    kit.pick(SHOPFRONT.boards),
    kit.pick(SHOP.fronts),
  ]
  const [frame, noren, goods, tank, terrace, parasol] = [
    kit.pick(SHOPFRONT.door.frames),
    kit.pick(SHOPFRONT.noren),
    kit.pick(SHOPFRONT.goods),
    kit.rand(),
    kit.rand() < 0.45,
    kit.pick(SHOP.fronts),
  ]
  const seed = spot(x, y) // which patterned windows light, and the small things' draws, so the kit's stream is untouched
  const draw = mulberry32(seed + 5)
  const face = d / 2 // the front's face, out from the middle
  const glazing: KitLook = { material: kit.glass, tint: kit.windows[0] }
  const arcade = stage === 3 && onRoad
  const boardOf = (colour: string, on: boolean, glow = SHOPFRONT.lit.board): KitLook => (on ? kit.lit(colour, glow) : colour)
  /** A board `bw` by `bh` on a face at `v`, its foot `z`, with `n` marks across it. */
  const signboard = (colour: string, on: boolean, bw: number, bh: number, v: number, z: number, n: number) => {
    kit.local(kit.cuboid(bw, bh, 0.14), boardOf(colour, on), x, y, ry, 0, v, z)
    const size = Math.min(bh * 0.62, 0.5)
    for (let k = 0; k < n; k++)
      kit.local(
        kit.cuboid(size, size, 0.04),
        kit.markOf(colour, on),
        x,
        y,
        ry,
        (k - (n - 1) / 2) * size * 1.45,
        v + 0.08,
        z + (bh - size) / 2,
      )
  }

  kit.cladded(kit.box(w, 3.8, d, 0.24, 0.1), front, x, y, h, ry, { back: PATTERN.back, sides: PATTERN.wall, storey: 3.8 }, seed)

  // The door at one end, its glass lit at night, under a noren of three panels with a crest on a rod.
  const layout = frontOf(w, door)
  const doorAt = layout.door
  kit.local(kit.cuboid(SHOPFRONT.door.wide + 0.22, SHOPFRONT.door.tall + 0.16, 0.1), frame, x, y, ry, doorAt, face + 0.01, h)
  kit.doorway(...to(x, y, ry, doorAt, face), ry, SHOPFRONT.door.wide, 0.1)
  kit.local(kit.cuboid(SHOPFRONT.door.wide, SHOPFRONT.door.tall, 0.12), glazing, x, y, ry, doorAt, face + 0.03, h + 0.04)
  kit.local(kit.cuboid(0.06, SHOPFRONT.door.tall, 0.16), frame, x, y, ry, doorAt, face + 0.04, h + 0.04)
  kit.local(kit.cuboid(1.66, 0.05, 0.05), frame, x, y, ry, doorAt, face + 0.2, h + 2.36)
  for (const k of [-1, 0, 1]) kit.local(kit.cuboid(0.47, 0.8, 0.03), noren, x, y, ry, doorAt + k * 0.5, face + 0.2, h + 1.56)
  kit.local(
    kit.cuboid(0.22, 0.22, 0.05),
    pale(noren) ? SHOPFRONT.marks.dark : SHOPFRONT.marks.pale,
    x,
    y,
    ry,
    doorAt,
    face + 0.21,
    h + 1.86,
  )

  // The shop window over the rest of the front, narrower at Stage 1, framed and silled, with goods on its sill.
  const ww = layout.glazed * (stage === 1 ? 0.72 : 1)
  const windowAt = layout.window
  kit.local(kit.cuboid(ww, 2, 0.12), glazing, x, y, ry, windowAt, face + 0.02, h + 0.8)
  kit.local(kit.cuboid(ww + 0.16, 0.08, 0.3), SHOPFRONT.trim, x, y, ry, windowAt, face + 0.1, h + 0.72)
  kit.local(kit.cuboid(ww + 0.16, 0.1, 0.16), SHOPFRONT.trim, x, y, ry, windowAt, face + 0.04, h + 2.8)
  const bars = Math.max(1, Math.round(ww / 1.7))
  for (let k = 1; k < bars; k++)
    kit.local(kit.cuboid(0.06, 2, 0.16), frame, x, y, ry, windowAt - ww / 2 + (k * ww) / bars, face + 0.04, h + 0.8)
  kit.blockZoomProps(() => {
    for (let u = windowAt - ww / 2 + 0.3; u < windowAt + ww / 2 - 0.25; u += 0.42 + draw() * 0.2) {
      const tall = 0.18 + draw() * 0.3
      kit.local(kit.cuboid(0.3, tall, 0.2), goods[Math.floor(draw() * goods.length)], x, y, ry, u, face + 0.15, h + 0.76)
    }
  })

  // Over the ground floor: a signboard over the awning, or at Stage 3 on a Road the arcade with the board on its
  // fascia. A false front carries its board above the roof instead.
  if (form !== 'facade' && !arcade) signboard(board, stage >= 2, w * 0.88, stage === 1 ? 0.4 : 0.48, face + 0.07, h + 3.28, 2 + (seed % 3))
  if (!arcade) {
    const span = w * 0.86
    const stripes = Math.max(3, Math.round(span / 1.2))
    for (let i = 0; i < stripes; i++)
      kit.local(
        AWNING,
        boardOf(i % 2 ? SHOP.stripe : stripe, stage >= 2, SHOPFRONT.lit.awning),
        x,
        y,
        ry,
        -span / 2 + (i + 0.5) * (span / stripes),
        face + 0.85,
        h + 3,
        span / stripes,
      )
  } else {
    kit.local(kit.cuboid(w + 0.02, 0.16, ARCADE), kit.lit(SHOPFRONT.arcade, SHOPFRONT.lit.arcade), x, y, ry, 0, face + ARCADE / 2, h + 3.44)
    signboard(board, true, w + 0.02, 0.5, face + ARCADE, h + 3.04, 2 + (seed % 3))
    for (const k of [-1, 1]) kit.local(kit.cuboid(0.12, 3.44, 0.12), SHOPFRONT.steel, x, y, ry, k * (w / 2 - 0.08), face + ARCADE - 0.12, h)
    kit.local(kit.cuboid(w * 0.8, 0.05, 0.16), kit.lit(CREAM, SHOPFRONT.lit.strip), x, y, ry, 0, face + ARCADE * 0.5, h + 3.39)
  }
  if (stage === 3) kit.local(kit.cuboid(w + 0.06, 0.4, 0.4), SHOP.stripe, x, y, ry, 0, face + 0.04, h + 3.7)

  // Upper storeys, set back behind a balcony on a setback shop, and the roof's lid over the top one.
  let top = h + 3.8
  let [tw, td, tv] = [w + 0.1, d + 0.1, 0] // the lid's footprint and how far out of the front its middle lies
  if (storeys > 1) {
    const tallness = (storeys - 1) * 3.1
    const back = form === 'setback' ? SETBACK : 0
    const storey = PATTERN.storey
    const cladding = { front: storey, back: storey, sides: storey, storey: 3.1 }
    kit.cladded(kit.box(w - 0.3, tallness, d - 0.6 - back, 0.24, 0.1), upper, ...to(x, y, ry, 0, -back / 2), top, ry, cladding, seed + 1)
    if (back) {
      kit.local(kit.cuboid(w - 0.1, 0.1, back + 0.3), SHOPFRONT.balcony, x, y, ry, 0, face - (back + 0.3) / 2, top)
      kit.local(kit.cuboid(w - 0.1, 0.9, 0.12), upper, x, y, ry, 0, face - 0.1, top + 0.1)
      kit.blockZoomProps(() => {
        for (const k of [-0.3, 0.3]) kit.pot(...to(x, y, ry, k * w, face - 0.55), top + 0.1, 0.32, draw)
      })
    }
    top += tallness
    ;[tw, td, tv] = back ? [w - 0.2, d - 0.5 - back, -back / 2] : [w + 0.1, d + 0.1, 0]
  }
  kit.cladded(kit.cuboid(tw, 0.5, td), storeys > 1 ? upper : front, ...to(x, y, ry, 0, tv), top, ry, { top: PATTERN.roof }, seed + 2)
  const roof = top + 0.5 // the lid's top
  const [roofFront, roofBack] = [tv + td / 2, tv - td / 2] // the roof's front and back edges, out of the front

  // The parapet, or on a false front a wall raised over the roof's front edge with the signboard on it.
  /** A length of the parapet `pw` by `pd` on the roof, its middle at `(u, v)` in the shop's frame. */
  const parapet = (pw: number, pd: number, u: number, v: number) =>
    kit.local(kit.cuboid(pw, PARAPET.tall, pd), SHOPFRONT.parapet, x, y, ry, u, v, roof)
  if (form === 'facade') {
    kit.local(kit.cuboid(tw, 1.6, 0.3), storeys > 1 ? upper : front, x, y, ry, 0, roofFront - 0.15, roof)
    signboard(board, stage >= 2, tw * 0.8, 0.95, roofFront + 0.06, roof + 0.32, 2 + (seed % 3))
  } else parapet(tw, PARAPET.wide, 0, roofFront - PARAPET.wide / 2)
  parapet(tw, PARAPET.wide, 0, roofBack + PARAPET.wide / 2)
  for (const k of [-1, 1]) parapet(PARAPET.wide, td - 2 * PARAPET.wide, k * (tw / 2 - PARAPET.wide / 2), tv)

  // A stair house on a setback shop of one storey, so that its roof differs from a flat neighbour's.
  if (form === 'setback' && storeys === 1) {
    const [u, v] = [-door * (tw / 2 - 1.5), tv - td * 0.12]
    kit.local(kit.cuboid(2.2, 2.3, 2.6), SHOPFRONT.parapet, x, y, ry, u, v, roof)
    kit.local(kit.cuboid(2.4, 0.16, 2.8), SHOPFRONT.steel, x, y, ry, u, v, roof + 2.3)
    kit.local(kit.cuboid(0.9, 1.9, 0.06), frame, x, y, ry, u, v + 1.31, roof)
  }
  // On the roof: condensers along the back, a tank on its stand, a noodle shop's vent, a billboard and a terrace.
  const units = Math.min(stage, Math.floor((tw - 1.2) / 1.25))
  for (let k = 0; k < units; k++) {
    const u = -door * (tw / 2 - 0.95 - k * 1.25)
    kit.local(kit.cuboid(1, 0.72, 0.5), AIRCON.body, x, y, ry, u, roofBack + 0.75, roof)
    kit.put(FACING_DISC, AIRCON.grille, x, y, ry, u - 0.16, roofBack + 1.01, roof + 0.36, 0.24, 0.24, 1)
  }
  if (stage >= 2 && tank < (stage === 2 ? 0.55 : 0.8)) {
    const [u, v] = [door * (tw / 2 - 1.25), roofBack + td * 0.42]
    kit.local(kit.cuboid(1.6, 0.5, 1.6), SHOPFRONT.steel, x, y, ry, u, v, roof)
    kit.local(kit.cuboid(1.5, 1.3, 1.5), SHOPFRONT.tank, x, y, ry, u, v, roof + 0.5)
  }
  if (noodle) {
    const [u, v] = [door * (tw / 2 - 0.55), roofBack + 0.6]
    kit.put(THIN, SHOPFRONT.steel, x, y, ry, u, v, roof, 0.18, 1.6, 0.18)
    kit.put(THIN, SHOPFRONT.steel, x, y, ry, u, v, roof + 1.6, 0.3, 0.14, 0.3)
    const [px, py] = to(x, y, ry, u, v)
    if (stage >= 2) kit.steam(px, py, roof + 1.8)
  }
  const billboarded = onRoad && form !== 'facade' && (stage === 3 || (stage === 2 && roofSign))
  if (billboarded) {
    const bw = Math.min(tw * 0.62, 5.6)
    const v = roofFront - 0.9
    for (const k of [-1, 1]) kit.local(kit.cuboid(0.12, 2.9, 0.12), SHOPFRONT.steel, x, y, ry, k * bw * 0.36, v - 0.16, roof)
    signboard(billboard, true, bw, 1.8, v, roof + 1.05, 3 + (seed % 2))
  }
  if (stage === 3 && terrace && storeys > 1 && td > 7) {
    const [dw, dd] = [Math.min(tw * 0.5, 4.2), Math.min(td * 0.42, 4.4)]
    const [u, v] = [-door * (tw / 2 - 0.35 - dw / 2), roofFront - (billboarded ? 1.7 : 0.45) - dd / 2]
    kit.local(kit.cuboid(dw, 0.1, dd), SHOPFRONT.deck, x, y, ry, u, v, roof)
    for (const [i, j] of [
      [-0.22, -0.18],
      [0.22, 0.2],
    ]) {
      kit.local(kit.cuboid(0.8, 0.05, 0.8), SHOPFRONT.trim, x, y, ry, u + i * dw, v + j * dd, roof + 0.82)
      kit.local(kit.cuboid(0.08, 0.8, 0.08), SHOPFRONT.marks.dark, x, y, ry, u + i * dw, v + j * dd, roof + 0.05)
    }
    kit.put(CONE8, parasol, x, y, ry, u - 0.22 * dw, v - 0.18 * dd, roof + 1.95, 1.3, 0.5, 1.3)
    kit.put(THIN, SHOPFRONT.marks.dark, x, y, ry, u - 0.22 * dw, v - 0.18 * dd, roof + 0.86, 0.04, 1.1, 0.04)
    // String lights on four posts at the deck's corners, along its two long sides.
    for (const i of [-1, 1])
      for (const j of [-1, 1]) kit.local(kit.cuboid(0.07, 2.45, 0.07), SHOPFRONT.steel, x, y, ry, u + (i * dw) / 2, v + (j * dd) / 2, roof)
    for (const j of [-1, 1]) {
      kit.local(kit.cuboid(dw, 0.03, 0.03), SHOPFRONT.marks.dark, x, y, ry, u, v + (j * dd) / 2, roof + 2.38)
      const n = Math.max(3, Math.round(dw / 0.6))
      for (let k = 0; k < n; k++)
        kit.local(
          kit.cuboid(0.16, 0.16, 0.16),
          kit.lit('#fff1c7', SHOPFRONT.lit.string),
          x,
          y,
          ry,
          u - dw / 2 + ((k + 0.5) * dw) / n,
          v + (j * dd) / 2,
          roof + 2.2,
        )
    }
    kit.pool('string', ...to(x, y, ry, u, v), roof + 0.1, dw + 1.2, dd + 1.2, ry)
  }

  // A tall sign standing out from the wall at the window's end, on a Road: on the upper storey, or on the roof's
  // front corner over a shop of one storey.
  if (onRoad && (stage === 3 || (stage === 2 && hung))) {
    const [signAt, z] = [-door * (w / 2 - 0.4), storeys > 1 ? h + 3.95 : roof]
    kit.local(kit.cuboid(0.22, 2.7, 1.05), boardOf(tallSign, true), x, y, ry, signAt, face + 0.3, z)
    for (let k = 0; k < 3; k++)
      kit.local(kit.cuboid(0.26, 0.44, 0.62), kit.markOf(tallSign, true), x, y, ry, signAt, face + 0.36, z + 0.32 + k * 0.72)
  }

  // At the back, Block-zoom: gas cylinders, a pipe up the wall, crates from Stage 2, and an AC unit at Stage 3.
  kit.blockZoomProps(() => {
    for (const k of [0, 1]) kit.put(THIN, '#b6c3cc', x, y, ry, door * (w / 2 - 0.6 - k * 0.44), -face - 0.26, h, 0.18, 1.15, 0.18)
    kit.local(kit.cuboid(0.1, 3.6, 0.1), '#c4ccd4', x, y, ry, -door * (w / 2 - 0.45), -face - 0.07, h)
    kit.local(kit.cuboid(1.4, 0.1, 0.1), '#c4ccd4', x, y, ry, -door * (w / 2 - 1.1), -face - 0.07, h + 3.2)
    if (stage >= 2)
      for (let k = 0; k < 3; k++)
        kit.local(
          kit.cuboid(0.48, 0.3, 0.36),
          CRATES[Math.floor(draw() * CRATES.length)],
          x,
          y,
          ry,
          -door * (w / 2 - 1.5),
          -face - 0.3,
          h + k * 0.31,
        )
    if (stage === 3) kit.airCon(...to(x, y, ry, door * (w / 2 - 2.4), -face), h + 2.2, ry + Math.PI)
  })

  kit.pool(
    stage === 1 ? 'window' : arcade ? 'arcade' : 'sign',
    ...to(x, y, ry, 0, face + POOL.front.window),
    h,
    w + 0.4,
    POOL.deep.window,
    ry,
  )
  kit.shadow(x, y, h, w * 1.25 + 1, d * 1.25 + 1, false, ry)
  kit.brick('building', x, y, h)
}
