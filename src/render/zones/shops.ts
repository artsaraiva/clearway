import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Vec } from '../../sim/geometry'
import { area, KERB } from '../blocks'
import { frontOf, SHAPES, spot, to, VENDING_MACHINE, type Kit, type ShopForm } from '../kit'
import { GROW } from '../landmarks'
import { BOARD, cafeTable, menuBoard, STALL, WOOD } from '../props'
import { planter } from '../streets'
import { besideRow, near, overlap, rows, stands, turned, walled, yards, type Look, type RowLot, type ZoneGround } from './ground'

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
// Shops to the level of finish (#175): each shop's form, picked so that no two neighbours share one, and the share of
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
 * storey at Stage 1 and a storey higher at Stage 3, built to the level of finish (#175, the kit's `shop`) as its lot's
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
    kit.staged((stage) => kit.shop(l.x, l.y, KERB, l.w, l.d, l.ry, { ...plan, stage, storeys: SHOP_STOREYS(storeys, stage) }))
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
  const kerbside = [...g.poles, ...g.lamps, ...g.street]
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

/** Pot plants either side of shop `l`'s door, Close-only, from Stage 1 (#175); or, if `outer`, on its outer side alone. */
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
 * edge, and clear of the lamps at its corners and the street trees. The bicycles, pots and menu board are Close-only.
 */
function shopFront(g: ZoneGround, l: RowLot, door: 1 | -1) {
  const { kit, field } = g
  const draw = mulberry32(spot(l.x, l.y))
  const half = l.w / 2
  /** Where the point `u` m along the front from its middle and `o` m out from it lies on the map. */
  const at = (u: number, o: number) => turned(l.x, l.y, l.ry, u, l.d / 2 + o)
  const others = [...g.lamps, ...g.street]
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
        kit.closeOnly(() => kit.bicycles(p.x, p.y, KERB, l.ry, n, FRONT.gap, FRONT.slant)),
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
    // Close-only.
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
      if (clear(FRONT.banner, p, p + 0.8)) from(k < 2 ? banners : 3, at(p, FRONT.banner), (q) => kit.nobori(q.x, q.y, KERB, l.ry, cloth))
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
      from(stage, at(t * l.w * 0.86, FRONT.lantern), (p) => kit.lantern(p.x, p.y, KERB + 1.95, amber))
  }
  doorPots(g, l, door)
}

// The shops' scenes and the small things before their fronts (#175), built from the kit's shapes. A scene is a focal
// piece larger than a car, seen from Street: a greengrocer's stand spilling onto the pavement, a florist's, a row of
// capsule machines, or a food stall with its lantern and steam. Pot plants, menu boards, crates and stools are Close-only
// (the kit's `closeOnly`), hidden beyond Street.

/** The scenes a shops Block picks from (#175). */
export type ShopScene = 'greengrocer' | 'florist' | 'capsules' | 'stall'

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
export function greengrocer(kit: Kit, x: number, y: number, ry: number, len: number, stage: number, free = Free) {
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
export function florist(kit: Kit, x: number, y: number, ry: number, len: number, stage: number, free = Free) {
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
export function capsules(kit: Kit, x: number, y: number, ry: number, len: number, stage: number, _free = Free) {
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
 * lantern at its corner that lights at dusk and leaves its pool, and stools before the counter, which are Close-only.
 * About 3.4 m long and 2.6 m deep with its stools.
 */
export function foodStall(kit: Kit, x: number, y: number, ry: number) {
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
  kit.closeOnly(() => {
    for (const lx of [-1, 0, 1]) kit.put(SHAPES.thin, STALL.stool, x, y, ry, lx * 0.95, 1.15, KERB, 0.2, 0.62, 0.2)
  })
  kit.pool('stall', ...to(x, y, ry, 0, 0.6), KERB, 4.6, 3.6, ry)
  kit.shadow(x, y, KERB, 3.8, 2.2, false, ry)
  kit.brick('building', x, y, KERB)
  kit.lantern(...to(x, y, ry, 1.5, 0.9), KERB + 2.05, true)
}

/** Pot plants about 0.7 m tall standing at `spots` on the pavement, as one Close-only brick (#175), each in a pot of its own colour. */
export function pots(kit: Kit, spots: [number, number][]) {
  if (!spots.length) return
  const draw = mulberry32(spot(...spots[0]))
  kit.closeOnly(() => {
    for (const [x, y] of spots) kit.pot(x, y, KERB, 0.7 * (0.75 + draw() * 0.5), draw)
  })
  kit.brick('building', ...spots[0], KERB)
}

/**
 * A plant stand at `(x, y)` against a shop front facing `ry`, as one Close-only brick (#175): two timber steps with pot
 * plants on them.
 */
export function plantStand(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.closeOnly(() => {
    for (let k = 0; k < 2; k++) {
      const [ly, z] = [0.2 - k * 0.32, KERB + 0.35 + k * 0.35]
      kit.put(kit.cuboid(1.3, z - KERB, 0.32), WOOD.stand, x, y, ry, 0, ly, KERB)
      for (const lx of [-0.42, 0, 0.42]) kit.pot(...to(x, y, ry, lx, ly), z, 0.42 + draw() * 0.18, draw)
    }
  })
  kit.brick('building', x, y, KERB)
}

/** Crates of produce at `(x, y)`, facing `ry`, as one Close-only brick (#175): two on the pavement and one on top. */
export function produce(kit: Kit, x: number, y: number, ry: number) {
  const draw = mulberry32(spot(x, y))
  kit.closeOnly(() => {
    for (const [lx, z] of [
      [-0.32, 0],
      [0.32, 0],
      [0, 0.32],
    ])
      crate(kit, x, y, ry, lx, 0, KERB + z, 0.08, draw)
  })
  kit.brick('building', x, y, KERB)
}
