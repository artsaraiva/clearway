import type { Zone } from '../city/city'
import { mulberry32 } from '../sim/demand'
import { middle, overlaps, polyline, type Bounds, type Vec } from '../sim/geometry'
import { cellAt, cellBounds } from '../sim/tiles'
import { area, KERB, twiceArea, type Block } from './blocks'
import { KEI, TAXI } from './cars'
import { WIND } from './day'
import { inside, type Field } from './field'
import {
  BIKE_RACK,
  CONTAINER,
  boxFace,
  doorOf,
  FACES,
  frontOf,
  GARDEN,
  LOBBY,
  shedDoors,
  spot,
  STAIR,
  stairAt,
  to,
  VENDING_MACHINE,
  WALL_STAIR,
  WALKWAY,
  wingBounds,
  type ApartmentPlan,
  type Hung,
  type Kit,
  type TerracePlan,
  type TerraceRoof,
  type OfficeStyle,
  type ShopForm,
  type Walks,
} from './kit'
import { allotments, farm, GROW, meadow, park, plaza, site } from './landmarks'
import {
  BAY_WIDTH,
  binStore,
  cafeTable,
  capsules,
  florist,
  foodStall,
  foodTruck,
  greengrocer,
  MEDIUM_SCENES,
  mediumScene,
  menuBoard,
  officeScene,
  parkingBays,
  plantStand,
  plazaPiece,
  pots,
  produce,
  taxiBay,
  truckPath,
  truckTurn,
  TRUCK_TURNS,
  type MediumScene,
  type OfficeScene,
  type PlazaPiece,
  type ShopScene,
  type TruckEntry,
} from './props'
import { PATTERN } from './pattern'
import { planter, type Footprint } from './streets'

// What each Zone builds on a Block (#130 and #136, ported from the neighbourhoods prototype of #127): its building
// shapes, its palette (the kit's, under the rule above `WALLS`), its lot size and the gaps between its buildings. A look
// reads the Block, the ground it must leave free, the kit's random stream and one draw for its Tile, and nothing of
// where the Block lies in the City, so a Zone builds alike at the City's middle and at its edge.
//
// Every Zone builds at its Tile's Stage (#138, #141), through the kit's `staged` and `from`: every lot draws alike at
// every Stage, and each Stage builds the same lot, better. Every lot takes the same draws from the Block's stream
// whatever its Stage, so no lot changes with what another lot's Stage builds. Stage 2 is the look #130 and #136 ported;
// Stage 1 is humbler and Stage 3 goes beyond it, and no Stage builds another kind of building.

/** m a building keeps clear of a street tree, beyond its trunk. */
const TREE_ROOM = 2.4

// Low-density residential: lots at most 15.2 m on a side, 2.8 m in from the Block's bounding box. A lawn fills each
// lot but for 0.4 m on every side, at least 7 m across and 0.6 m in from the Block's edge, and a house of at most
// 10.5 m stands on it 1.2 m in from the lawn's edge.
const HOUSES = { lot: 15.2, margin: 2.8, gap: 0.4, least: 7, clear: 0.6, yard: 1.2, most: 10.5 }
// Low-density details (#157), each lot's drawn from where it stands, so that nothing else on the Block draws
// differently. A house's front, with its door, faces the nearest edge of its Block. Some lots have a kei car, which
// parks nose to the front from Stage 2 or 3, and some gardens a laundry pole, more with each Stage. Where the lawn spans
// `room` m or more, the house stands aside for them, leaving a side yard on the side the default camera sees, `wide` m
// across for a car's drive and `narrow` for a laundry pole alone. Some roofs carry solar panels.
const HOMES = {
  drive: 0.5,
  wide: 3.1,
  narrow: 2.5,
  room: 12.2,
  car: 0.6, // of the drives, the share with a car from Stage 2; the rest have theirs from Stage 3
  solar: [0.22, 0.5], // of the roofs, the share with panels from Stage 2, and from Stage 3
  laundry: [0.12, 0.3, 0.5], // of the gardens, the share with a laundry pole from Stage 1, from 2, and from 3
  futon: 0.45, // of the laundry poles, the share that airs a futon at Stage 3
  half: 1.7, // m: half a kei car's length
} as const
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
// High-density residential: lots at most 30 m on a side, 3.4 m in from the Block's bounding box, each with one tower
// of at most 17 m east–west by 15 north–south and at least 9, 11 to 17 storeys tall, leaving 4.5 m of the lot open on
// every side. Its podium is 1.2 m wider all round and stands 1.5 m in from the Block's edge.
const TOWERS = { lot: 30, margin: 3.4, gap: 4.5, most: [17, 15], least: 9, podium: 1.2, clear: 1.5, floors: [11, 17] } as const
// High-density residential details (#155): the Stage 2 floors from which a tower has a helipad and beacons at Stages 2
// and 3; and the playground or garden at its foot.
const HIGH = {
  pad: [16, 14],
  beacon: [15, 13],
  // m along the podium at most and at least, m out from it at most and at least, how far out it starts, how much of its
  // far end stays paved for the bench that stands there from Stage 1, and how far it keeps from another podium.
  foot: { long: 12, least: 8, deep: 7, shallow: 4, off: 0.6, paved: 3.2, apart: 1 },
} as const
const LAWN = '#a9db7f' // a garden's, as the kit's
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
// How big a lot left to a tree grows at each Stage, as a share of a full tree.
const SAPLING = [0.5, 0.75, 1]
// The storeys a terraced house, a shop, a courtyard building and a residential tower stand at each Stage, from the
// storeys it draws, which are its Stage 2 storeys.
const TERRACE_STOREYS = (s: number, stage: number) => [Math.max(1, s - 1), s, s + 1][stage - 1]
const SHOP_STOREYS = (s: number, stage: number) => [1, s, s + 1][stage - 1]
const COURT_FLOORS = (f: number, stage: number) => [Math.max(3, f - 2), f, f + 2][stage - 1]
const TOWER_FLOORS = (f: number, stage: number) => Math.round(f * [0.55, 1, 1.25][stage - 1])
const STYLES: OfficeStyle[] = ['curtain', 'curtain', 'fins', 'fins', 'stepped', 'round']
const PLANTER = '#ddd6c9' // a Stage 3 plaza's, round a tree
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
// widest on a Road where none is that wide, and the area (m²) from which a Block
// has a second at Stage 3; how deep the coloured paving before the fronts is (m) and its colours, one a Block; and how
// far out from the fronts shoppers walk (m), how long they stop at each (s), and their coats, the cars' colours.
const SHOP_FINISH = {
  forms: ['flat', 'facade', 'flat', 'setback'] as ShopForm[],
  noodle: 0.12,
  scenes: ['greengrocer', 'florist', 'capsules', 'stall'] as ShopScene[],
  wide: 8,
  second: 2500,
  paved: 1.7,
  paving: ['#efd3ad', '#ecd0c6', '#dde3c6', '#e5d6ec'],
  walk: 2.1,
  waits: [1.5, 5],
  coats: ['#ffffff', '#db6982', '#009dcb', '#ffc52d', '#64cb9f', '#bc9ef2', '#ff9cbb'],
}
// Industrial: lots at most 34 m on a side, 3.2 m in from the Block's bounding box, the largest built first, each with
// a shed over all but 2.5 m of the lot on every side, 1.5 m in from the Block's edge and at least 9 m across. On some
// Blocks the first shed has a chimney.
const SHEDS = { lot: 34, margin: 3.2, gap: 2.5, clear: 1.5, least: 9, chimney: 0.45 }
// Industrial details (#150), each drawn from where it stands so that nothing else on the Block draws differently. A
// shed's doors face the long side with more room before it, and the shed stands back from that side as far as it must,
// up to `back` m and keeping at least `least` m deep, to leave a loading yard `deep` m deep before its doors.
const YARD = { deep: 12, back: 6, least: 10 }
// A truck backed up to a door: m long and wide (as `./movers` draws it), how far it pulls away at most and at least, how
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
// of its turns, how far its rear reaches behind its middle (as `./movers` draws it), how far out from the wall its stack
// stands and how far along the wall it may (the nearest that fits, so that a door beyond keeps room for a truck), and
// how long it waits (s) at the door or the stack (a range from which each forklift draws its own) and where it turns.
const FORKLIFT = { out: 3.2, turn: 1.8, rear: 1.9, stack: 0.95, apart: [3.4, 4.2, 5], lift: [1.6, 3.6], cusp: 0.4 }
// Containers along a shed's back and ends: m from the wall, the share of spots filled from Stage 2 and from Stage 3,
// and the share of them that a second container tops at Stage 3.
const CONTAINERS = { gap: 0.35, fill: [0.3, 0.65], double: 0.45 }
// Parks: a park with a pond, or on a Block under 1,600 m² by its bounding box, one time in three, a plaza with a fountain.
const PARKS = { small: 1600, plaza: 0.35 }
// Green: a meadow, or one Block in three allotments.
const GREEN = { allotments: 0.35 }

/** What a Zone's look builds on: one Block, and the ground on it that must stay free. */
export interface ZoneGround {
  kit: Kit
  block: Block
  field: Field
  /** Landmarks' ground, which no building may stand on. */
  reserved: Bounds[]
  /** The Block's street trees, which buildings keep clear of. */
  street: Vec[]
  /** The lamps at the Block's corners, which what stands on the ground keeps clear of (#150). */
  lamps: Vec[]
  /** The utility poles round the Block (`./poles`), which a food truck turning in over the kerb keeps clear of (#177). */
  poles: Vec[]
  /** A number in [0, 1) the seed draws for the Block's Tile, the same for each of its Blocks: for what a look picks once a Tile. */
  tileDraw: number
  /** What the look stands near the Block's edge, which the street's furniture keeps off (`./streets`, #175). */
  kept: Footprint[]
}

/** How a Zone builds on its Blocks. */
export interface Look {
  /** Whether the seed may stand its coral tower landmark on a Tile of this Zone. */
  landmarks: boolean
  /**
   * Whether it is built to the level of finish (#173): wearing surface pattern and leaving pools of light at night
   * (the kit's `finish`). Shops since the prototype (#174), and offices since #177.
   */
  finish?: boolean
  fill(ground: ZoneGround): void
}

/** Each Zone's look. An unzoned Tile has none: its Blocks are left as grass (`verge`). */
export const LOOKS: Record<Zone['id'], Look> = {
  'low-density': { landmarks: false, fill: houses },
  'medium-density': { landmarks: false, finish: true, fill: (g) => (g.tileDraw < 0.5 ? terraces(g) : courtyards(g)) },
  'high-density': { landmarks: true, fill: towers },
  offices: { landmarks: true, finish: true, fill: offices },
  shops: { landmarks: false, finish: true, fill: shops },
  industrial: { landmarks: false, fill: industrial },
  parks: { landmarks: false, fill: parks },
  green: {
    landmarks: false,
    fill: ({ kit, field, block, street }) => (kit.chance(GREEN.allotments) ? allotments : meadow)(kit, field, block, street),
  },
  farms: { landmarks: false, fill: ({ kit, field, block, street }) => farm(kit, field, block, street) },
}

/** Split a rectangle into lots no longer than `max` on either side, cutting the long side near its middle. */
function split(lot: Bounds, max: number, range: (a: number, b: number) => number, out: Bounds[]) {
  const [w, d] = [lot.x1 - lot.x0, lot.y1 - lot.y0]
  if (w <= max && d <= max) out.push(lot)
  else if (w >= d) {
    const x = lot.x0 + w * range(0.38, 0.62)
    split({ ...lot, x1: x }, max, range, out)
    split({ ...lot, x0: x }, max, range, out)
  } else {
    const y = lot.y0 + d * range(0.38, 0.62)
    split({ ...lot, y1: y }, max, range, out)
    split({ ...lot, y0: y }, max, range, out)
  }
}

/** A lot with its edge nearest each street tree moved back behind the tree's crown. */
function backFromTrees(cut: Bounds, street: Vec[]): Bounds {
  const lot = { ...cut }
  for (const t of street) {
    if (t.x < lot.x0 - TREE_ROOM || t.x > lot.x1 + TREE_ROOM || t.y < lot.y0 - TREE_ROOM || t.y > lot.y1 + TREE_ROOM) continue
    const inward = [t.x - lot.x0, lot.x1 - t.x, t.y - lot.y0, lot.y1 - t.y]
    const edge = inward.indexOf(Math.min(...inward))
    if (edge === 0) lot.x0 = Math.max(lot.x0, t.x + TREE_ROOM)
    else if (edge === 1) lot.x1 = Math.min(lot.x1, t.x - TREE_ROOM)
    else if (edge === 2) lot.y0 = Math.max(lot.y0, t.y + TREE_ROOM)
    else lot.y1 = Math.min(lot.y1, t.y - TREE_ROOM)
  }
  return lot
}

/** The Block's lots: its bounding box `margin` m in, split into lots no longer than `max`, each back from the street trees. */
function lotsOf({ kit, block, street }: ZoneGround, margin: number, max: number): Bounds[] {
  const lots: Bounds[] = []
  split({ x0: block.x0 + margin, y0: block.y0 + margin, x1: block.x1 - margin, y1: block.y1 - margin }, max, kit.range, lots)
  return lots.map((lot) => backFromTrees(lot, street))
}

/**
 * Whether a footprint `w` by `d` centred on `(x, y)` and turned `ry` (unturned, `w` runs east–west) stands on the Block
 * at least `clear` m in from its edge, off any landmark's ground and clear of the street trees. Its outline is sampled
 * about every 3 m, closer than a Road is wide, so no Road crosses it unseen.
 */
function stands(
  { block, field, reserved, street }: ZoneGround,
  x: number,
  y: number,
  w: number,
  d: number,
  clear: number,
  ry = 0,
): boolean {
  const [c, s] = [Math.cos(ry), Math.sin(ry)]
  const [nu, nv] = [Math.max(1, Math.ceil(w / 3)), Math.max(1, Math.ceil(d / 3))]
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      if (i !== 0 && i !== nu && j !== 0 && j !== nv) continue
      const [u, v] = [-w / 2 + (i * w) / nu, -d / 2 + (j * d) / nv]
      if (field.sample(x + u * c - v * s, y + u * s + v * c) < clear) return false
    }
  }
  if (!inside(block.loop, x, y)) return false
  const [hw, hd] = [(Math.abs(c) * w + Math.abs(s) * d) / 2, (Math.abs(s) * w + Math.abs(c) * d) / 2]
  const box = { x0: x - hw, y0: y - hd, x1: x + hw, y1: y + hd }
  if (reserved.some((r) => overlaps(box, r))) return false
  return !street.some((t) => t.x > box.x0 - TREE_ROOM && t.x < box.x1 + TREE_ROOM && t.y > box.y0 - TREE_ROOM && t.y < box.y1 + TREE_ROOM)
}

/**
 * The largest footprint up to `w` by `d` that stands, shrinking by `step` m at most `tries` times; null if even that
 * is under `least` across or does not stand.
 */
function fit(g: ZoneGround, x: number, y: number, w: number, d: number, clear: number, least: number, step: number, tries: number) {
  for (let k = 0; k < tries && Math.min(w, d) >= least && !stands(g, x, y, w, d, clear); k++) [w, d] = [w - step, d - step]
  return Math.min(w, d) >= least && stands(g, x, y, w, d, clear) ? { w, d } : null
}

/** A lot in a row along a Block's edge: `w` along the edge and `d` deep, centred on `(x, y)`, its front facing `ry` (0 north, π/2 west). */
interface RowLot {
  x: number
  y: number
  w: number
  d: number
  ry: number
  /** Whether its front faces a Road, rather than the seam with the next Tile. */
  onRoad: boolean
}

/** A row lot's corners, `shrink` m in from its outline. */
function corners(lot: RowLot, shrink: number): Vec[] {
  const [c, s] = [Math.cos(lot.ry), Math.sin(lot.ry)]
  const [hw, hd] = [lot.w / 2 - shrink, lot.d / 2 - shrink]
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([u, v]) => ({ x: lot.x + u * c - v * s, y: lot.y + u * s + v * c }))
}

/** Whether two row lots overlap by more than a sliver (`shrink` m in from each), by their separating axes. */
function overlap(a: RowLot, b: RowLot, shrink = 0.15): boolean {
  const [pa, pb] = [corners(a, shrink), corners(b, shrink)]
  for (const ry of [a.ry, b.ry]) {
    for (const [ax, ay] of [
      [Math.cos(ry), Math.sin(ry)],
      [-Math.sin(ry), Math.cos(ry)],
    ]) {
      const [ra, rb] = [pa.map((p) => p.x * ax + p.y * ay), pb.map((p) => p.x * ax + p.y * ay)]
      if (Math.max(...ra) <= Math.min(...rb) || Math.max(...rb) <= Math.min(...ra)) return false
    }
  }
  return true
}

/** Whether `(x, y)` lies within `pad` m of a row lot. */
function near(lot: RowLot, x: number, y: number, pad: number): boolean {
  const [c, s] = [Math.cos(lot.ry), Math.sin(lot.ry)]
  const [dx, dy] = [x - lot.x, y - lot.y]
  return Math.abs(dx * c + dy * s) < lot.w / 2 + pad && Math.abs(-dx * s + dy * c) < lot.d / 2 + pad
}

/**
 * Whether row lots `a` and `b` lie side by side (#193), as `beside` has it for boxes: in `a`'s frame, within 1.5 m of
 * each other one way, as across a bend or a corner of a row, and sharing more than 1 m of side the other.
 */
function besideRow(a: RowLot, b: RowLot): boolean {
  const [c, s] = [Math.cos(a.ry), Math.sin(a.ry)]
  const local = corners(b, 0).map((p) => [(p.x - a.x) * c + (p.y - a.y) * s, -(p.x - a.x) * s + (p.y - a.y) * c])
  const [u0, u1] = [Math.min(...local.map((p) => p[0])), Math.max(...local.map((p) => p[0]))]
  const [v0, v1] = [Math.min(...local.map((p) => p[1])), Math.max(...local.map((p) => p[1]))]
  const [gu, gv] = [Math.max(-a.w / 2 - u1, u0 - a.w / 2), Math.max(-a.d / 2 - v1, v0 - a.d / 2)] // gaps: below 0, an overlap
  return (gu <= 1.5 && gv < -1) || (gv <= 1.5 && gu < -1)
}

/** How far `p` lies from the segment from `a` to `b`. */
function distance(p: Vec, a: Vec, b: Vec): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** An open polyline without the points that stray less than `tolerance` from it (Douglas–Peucker). */
function simplified(pts: Vec[], tolerance: number): Vec[] {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let [index, worst] = [0, 0]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distance(pts[i], a, b)
    if (d > worst) [index, worst] = [i, d]
  }
  if (worst <= tolerance) return [a, b]
  return [...simplified(pts.slice(0, index + 1), tolerance).slice(0, -1), ...simplified(pts.slice(index), tolerance)]
}

/** A closed outline as a few straight sides, its corners in order: the field's outlines step every 1.25 m. */
function sides(loop: Vec[], tolerance: number): Vec[] {
  let far = 0
  loop.forEach((p, i) => {
    if (Math.hypot(p.x - loop[0].x, p.y - loop[0].y) > Math.hypot(loop[far].x - loop[0].x, loop[far].y - loop[0].y)) far = i
  })
  const there = simplified(loop.slice(0, far + 1), tolerance)
  const back = simplified([...loop.slice(far), loop[0]], tolerance)
  return [...there.slice(0, -1), ...back.slice(0, -1)]
}

/**
 * Rows of lots along the Block's edge, whatever its shape: their fronts `margin` m in from the edge and facing out,
 * each `width()` wide, and a whole side of a row `depth()` deep. A lot that would overlap one placed already by more
 * than a sliver, or not stand on the Block, is left out, so corners stay open; one that overlaps by a sliver, as at a
 * row's corner, is cut back at an end until it and the step before its front keep clear (`cutBack`, #193).
 */
function rows(g: ZoneGround, margin: number, depth: () => number, width: () => number): RowLot[] {
  const lots: RowLot[] = []
  for (const { a, len, ux, uy, nx, ny, ry, onRoad } of runs(g, margin)) {
    const d = depth()
    for (let s = 0.3; s < len - 0.3;) {
      const w = Math.min(width(), len - 0.3 - s)
      if (w < ROW_LEAST) break
      const [fx, fy] = [a.x + ux * (s + w / 2), a.y + uy * (s + w / 2)]
      const lot = { x: fx - (nx * d) / 2, y: fy - (ny * d) / 2, w, d, ry, onRoad: onRoad(fx, fy) }
      const kept = stands(g, lot.x, lot.y, w - 0.3, d - 0.3, 0.4, ry) && !lots.some((o) => overlap(o, lot)) && cutBack(lots, lot)
      if (kept) lots.push(kept)
      s += w
    }
  }
  return lots
}

/**
 * m: the narrowest row lot (`rows`); how far before a row lot's front its step reaches, where its door opens; and how
 * far its back wall's pipes, meter and AC units stand out behind it.
 */
const [ROW_LEAST, ROW_STEP, ROW_BACK] = [3.6, 1.4, 0.75]

/** Row lot `l` with what stands on its walls: on its back (`ROW_BACK`), and the AC unit under a front window. */
const walled = (l: RowLot): RowLot => ({ ...l, ...turned(l.x, l.y, l.ry, 0, (0.45 - ROW_BACK) / 2), d: l.d + ROW_BACK + 0.45 })

/** Row lot `l` with the step before its front (`ROW_STEP`) and what stands on its back wall (`ROW_BACK`). */
const stepped = (l: RowLot): RowLot => ({ ...l, ...turned(l.x, l.y, l.ry, 0, (ROW_STEP - ROW_BACK) / 2), d: l.d + ROW_STEP + ROW_BACK })

/**
 * Row lot `lot` cut back at one end, 0.1 m at a time, until it, its step and its back wall keep clear of each of `lots`
 * and theirs (#193); null if that leaves it under `ROW_LEAST` wide.
 */
function cutBack(lots: RowLot[], lot: RowLot): RowLot | null {
  for (let cut = 0; lot.w - cut >= ROW_LEAST; cut += 0.1)
    for (const end of [1, -1]) {
      const l = { ...lot, ...turned(lot.x, lot.y, lot.ry, (end * cut) / 2, 0), w: lot.w - cut }
      if (!lots.some((o) => overlap(stepped(o), stepped(l), 0.02))) return l
    }
  return null
}

/** A straight run of a Block's outline `margin` m in from its edge, as `runs` walks them. */
interface Run {
  /** Where it starts, and its length (m). */
  a: Vec
  len: number
  /** Along it, and out of the Block. */
  ux: number
  uy: number
  nx: number
  ny: number
  /** The way out of the Block, as a front faces (0 north, π/2 west). */
  ry: number
  /** Whether the point `(x, y)` on it faces a Road across the pavement, rather than the seam at its cell's edge. */
  onRoad: (x: number, y: number) => boolean
}

/** The straight runs of the Block's outline `margin` m in from its edge, 5 m or longer, in order round each loop. */
function runs(g: ZoneGround, margin: number): Run[] {
  const out: Run[] = []
  const cell = cellBounds(cellAt(middle(g.block)))
  for (const loop of g.field.outlines(margin, [g.block])) {
    if (loop.length < 4 || !inside(g.block.loop, loop[0].x, loop[0].y)) continue
    const line = sides(loop, 0.7)
    const turn = twiceArea(line) > 0 ? 1 : -1 // counterclockwise, the outside is to the right of the way round
    for (let i = 0; i < line.length; i++) {
      const [a, b] = [line[i], line[(i + 1) % line.length]]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 5) continue
      const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
      const [nx, ny] = [turn * uy, -turn * ux] // out of the Block
      /** Across the pavement from `(x, y)`: on a Road, or on the seam at the cell's edge. */
      const onRoad = (x: number, y: number) => {
        const [px, py] = [x + nx * (margin + 3), y + ny * (margin + 3)]
        return px > cell.x0 + 1 && px < cell.x1 - 1 && py > cell.y0 + 1 && py < cell.y1 - 1
      }
      out.push({ a, len, ux, uy, nx, ny, ry: Math.atan2(-nx, ny), onRoad })
    }
  }
  return out
}

/**
 * Up to `count` trees in the yards behind the rows `lots`, where there is room, growing with the Stage (`GROW`), and
 * `coarse` (the kit's `tree`) if asked: where they stand.
 */
function yards(g: ZoneGround, lots: RowLot[], count: number, coarse = false): Vec[] {
  const { kit, block, field } = g
  const planted: Vec[] = []
  for (let tries = 0; tries < count * 12 && planted.length < count; tries++) {
    const [x, y] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(x, y) < 4 || !inside(block.loop, x, y)) continue
    if (lots.some((l) => near(l, x, y, 2.6)) || planted.some((p) => Math.hypot(p.x - x, p.y - y) < 6)) continue
    if (!stands(g, x, y, 3, 3, 2)) continue
    const [size, kind] = [kit.range(0.55, 0.85), kit.chance(0.25) ? 'sakura' : 'round'] as const
    kit.staged((stage) => kit.tree(x, y, KERB, GROW[stage - 1] * size, kind, coarse))
    planted.push({ x, y })
  }
  return planted
}

/**
 * Low-density residential: a house on a lawn on each lot, and the odd lot left to a tree. Stage 1 builds a cottage on
 * a bare lawn, and a sapling on a lot left to a tree; from Stage 2 most gardens have a tree; Stage 3 adds a storey, a
 * chimney, a hedge round the garden and, in half the gardens, a second tree. Each house has its details (#157, `homeOf`
 * and `homeDetails`), more with each Stage:
 * - Stage 1: a front door, a pot plant by it, and laundry in a few gardens.
 * - Stage 2: a bicycle and a second pot by the door, kei cars on most drives, solar panels on some roofs, and laundry in
 *   more gardens.
 * - Stage 3: a third pot in flower, a car on every drive, panels on half the roofs, laundry in half the gardens and a
 *   futon airing on some of it, and the hedge open at the door and the drive.
 */
function houses(g: ZoneGround) {
  const { kit } = g
  const ground = KERB + 0.16 // on the lawn
  for (const [i, lot] of lotsOf(g, HOUSES.margin, HOUSES.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const lawn = fit(g, x, y, lot.x1 - lot.x0 - 2 * HOUSES.gap, lot.y1 - lot.y0 - 2 * HOUSES.gap, HOUSES.clear, HOUSES.least, 1.6, 3)
    if (!lawn) continue
    kit.lot(i, lot)
    const { w, d } = lawn
    kit.from(1, () => {
      kit.lawn(x, y, KERB, w, d)
      kit.brick('ground', x, y, KERB)
    })
    if (kit.chance(0.1)) {
      kit.staged((stage) => kit.tree(x, y, ground, SAPLING[stage - 1] * kit.range(0.7, 0.95), 'round'))
      continue
    }
    const home = homeOf(g, x, y, w, d)
    kit.staged((stage) => kit.house(home.x, home.y, ground, home.w, home.d, stage, { front: home.front, solar: stage >= home.solar }))
    const [sx, sy] = [kit.chance(0.5) ? 1 : -1, kit.chance(0.5) ? 1 : -1]
    // A garden tree keeps off the drive and the laundry pole on it.
    const { pad, pole } = home
    const free = (px: number, py: number) => {
      if (home.car < 4 && px > pad.x0 - 1.2 && px < pad.x1 + 1.2 && py > pad.y0 - 1.2 && py < pad.y1 + 1.2) return false
      if (!pole || home.laundry > 3) return true
      const [a, b] = [turned(pole.x, pole.y, pole.ry, -pole.len / 2, 0), turned(pole.x, pole.y, pole.ry, pole.len / 2, 0)]
      return distance({ x: px, y: py }, a, b) > 1.4
    }
    kit.from(2, () => {
      const [px, py] = [x + sx * (w / 2 - 1.4), y + sy * (d / 2 - 1.4)]
      if (kit.chance(0.6) && free(px, py)) kit.tree(px, py, ground, kit.range(0.45, 0.65), kit.chance(0.2) ? 'sakura' : 'round')
    })
    kit.from(3, () => {
      const [px, py] = [x - sx * (w / 2 - 1.4), y - sy * (d / 2 - 1.4)]
      if (kit.chance(0.5) && free(px, py)) kit.tree(px, py, ground, kit.range(0.4, 0.55), kit.chance(0.3) ? 'sakura' : 'round')
    })
    // The hedge opens on the front, at the door and at the drive.
    const along = (px: number, py: number) => (home.front % 2 ? px - x : py - y)
    const gaps = [{ side: home.front, at: along(home.x, home.y), wide: 2.4 }]
    if (home.car < 4) {
      const wide = home.front % 2 ? pad.x1 - pad.x0 : pad.y1 - pad.y0
      gaps.push({ side: home.front, at: along((pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2), wide: wide + 0.3 })
    }
    kit.from(3, () => kit.hedge(x, y, ground, w, d, gaps))
    homeDetails(kit, home, ground)
  }
  kit.lot(-1)
}

/** The way the wall on a side of a lawn or a house faces, as the kit turns things: sides 0 east, 1 north, 2 west, 3 south. */
const facing = (side: number) => ((side - 1) * Math.PI) / 2

/** A house's plan on its lawn (#157), drawn from where the lawn lies. */
interface Home {
  /** The house's footprint, `w` by `d` centred on `(x, y)`. */
  x: number
  y: number
  w: number
  d: number
  /** The side its front door is on. */
  front: number
  /** The Stage its kei car comes at (4: none), parked at `park` on the drive `pad`. */
  car: number
  pad: Bounds
  park: { x: number; y: number; ry: number }
  /** The Stage its solar panels come at (4: none). */
  solar: number
  /**
   * The Stage its laundry pole comes at (4: none), and whether a futon airs there at Stage 3. The pole stands at `pole`
   * in the side yard, or else along the wall on side `line`, `out` m out from it.
   */
  laundry: number
  pole: { x: number; y: number; ry: number; len: number } | null
  line: number
  out: number
  futon: boolean
}

/**
 * The plan of a house on a lawn `w` by `d` centred on `(x, y)` (#157), drawn from where the lawn lies. Its front faces
 * the nearest edge of the Block. Where it has a kei car or a laundry pole and the lawn has room, the house stands aside
 * for a side yard on the side the default camera sees: the car parks at its front end, and the pole stands behind the
 * car or, with no car, in the middle. A laundry pole with no side yard stands along the wall of the side the camera sees
 * best that is not the front.
 */
function homeOf({ field }: ZoneGround, x: number, y: number, w: number, d: number): Home {
  const draw = mulberry32(spot(x, y))
  const [driving, parking, solar, washing, futon] = [draw(), draw(), draw(), draw(), draw()]
  const [s, l] = [HOMES.solar, HOMES.laundry]
  const laundry = washing < l[0] ? 1 : washing < l[1] ? 2 : washing < l[2] ? 3 : 4
  const near = [field.sample(x + w / 2, y), field.sample(x, y + d / 2), field.sample(x - w / 2, y), field.sample(x, y - d / 2)]
  const front = [3, 0, 1, 2].reduce((best, n) => (near[n] < near[best] - 0.5 ? n : best))
  let [hx, hy, hw, hd] = [x, y, Math.min(w - 2 * HOUSES.yard, HOUSES.most), Math.min(d - 2 * HOUSES.yard, HOUSES.most)]
  const side = front % 2 ? 0 : 3
  const room = (side % 2 ? d : w) >= HOMES.room
  const car = driving < HOMES.drive && room ? (parking < HOMES.car ? 2 : 3) : 4
  const aside = room && (car < 4 || laundry < 4)
  const wide = car < 4 ? HOMES.wide : HOMES.narrow
  // The side yard, from the front of the lawn to its back.
  let strip: Bounds | null = null
  if (aside && side === 0) {
    hw = Math.min(hw, w - HOUSES.yard - wide - 0.3)
    hx = Math.min(x, x + w / 2 - wide - 0.3 - hw / 2)
    strip = { x0: hx + hw / 2 + 0.15, x1: x + w / 2 - 0.15, y0: y - d / 2, y1: y + d / 2 }
  } else if (aside) {
    hd = Math.min(hd, d - HOUSES.yard - wide - 0.3)
    hy = Math.max(y, y - d / 2 + wide + 0.3 + hd / 2)
    strip = { x0: x - w / 2, x1: x + w / 2, y0: y - d / 2 + 0.15, y1: hy - hd / 2 - 0.15 }
  }
  const ry = facing(front)
  const span = (front % 2 ? d : w) / 2 // the lawn's half depth, front to back
  let [pad, park] = [{ x0: x, y0: y, x1: x, y1: y } as Bounds, { x, y, ry }]
  let pole: Home['pole'] = null
  if (strip) {
    const mid = { x: (strip.x0 + strip.x1) / 2, y: (strip.y0 + strip.y1) / 2 }
    /** The point in the middle of the side yard `back` m in from the front of the lawn. */
    const inFrom = (back: number) => turned(mid.x, mid.y, ry, 0, span - back)
    if (car < 4) {
      const [a, b] = [inFrom(0), inFrom(4.8)]
      pad =
        front % 2
          ? { ...strip, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }
          : { ...strip, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) }
      park = { ...inFrom(0.5 + HOMES.half), ry }
    }
    const [from, to] = car < 4 ? [5.2, 2 * span - 0.6] : [0.6, 2 * span - 0.6]
    if (to - from >= 1.6) pole = { ...inFrom((from + to) / 2), ry: ry + Math.PI / 2, len: Math.min(3.4, to - from) }
  }
  const line = [3, 0, 1, 2].find((n) => n !== front && !(strip && n === side))!
  const gap = [x + w / 2 - hx - hw / 2, y + d / 2 - hy - hd / 2, hx - hw / 2 - x + w / 2, hy - hd / 2 - y + d / 2][line]
  return {
    ...{ x: hx, y: hy, w: hw, d: hd, front, car, pad, park, pole, laundry, line },
    out: Math.max(0.7, gap / 2),
    solar: solar < s[0] ? 2 : solar < s[1] ? 3 : 4,
    futon: futon < HOMES.futon,
  }
}

/**
 * A house's details (#157), each drawn from where it stands: its kei car on its drive; pot plants and a bicycle by its
 * front door, which move out with the wall as the house grows; and a laundry pole in its side yard or, with none, along
 * the wall of a free side, moving out with it too.
 */
function homeDetails(kit: Kit, home: Home, ground: number) {
  const { x, y, w, d, front, pad, park } = home
  if (home.car < 4) {
    kit.from(
      home.car,
      () => {
        kit.drive((pad.x0 + pad.x1) / 2, (pad.y0 + pad.y1) / 2, ground, pad.x1 - pad.x0, pad.y1 - pad.y0)
        kit.keiCar(park.x, park.y, ground + 0.05, park.ry)
      },
      spot(park.x, park.y),
    )
  }
  /** Where the middle of the house's wall on side `side` stands at Stage `stage`, `out` m out from it. */
  const wall = (side: number, stage: number, out: number) => {
    const k = stage === 1 ? 0.7 : 1
    return turned(x, y, facing(side), 0, ((side % 2 ? d : w) / 2) * k + out)
  }
  kit.staged(
    (stage) => {
      const at = wall(front, stage, 0)
      kit.porch(at.x, at.y, ground, facing(front), stage)
    },
    spot(x, y + 0.5),
  )
  if (home.laundry > 3) return
  kit.staged(
    (stage) => {
      const washing = kit.washing()
      if (stage < home.laundry) return
      const k = stage === 1 ? 0.7 : 1
      const along = home.pole ?? { ...wall(home.line, stage, home.out), ry: facing(home.line), len: (home.line % 2 ? w : d) * k - 0.8 }
      const len = Math.min(3.4, along.len)
      if (len < 1.6) return
      const futon = stage === 3 && home.futon
      const quilt = 1.7 // m wide: `./movers`' futon
      const n = Math.floor(len / 0.85)
      const hung: Hung[] = []
      for (let j = 0; j < n; j++) {
        const at = -len / 2 + ((j + 0.5) * len) / n
        if (futon && Math.abs(at) - washing.items[j].w / 2 < quilt / 2) continue
        hung.push({ at, ...washing.items[j] })
      }
      if (futon) hung.push({ at: 0, w: quilt, tall: 1.05, colour: washing.futon, futon: true })
      kit.laundry(along.x, along.y, ground, along.ry, len, hung)
    },
    spot(x + 0.5, y),
  )
}

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

/**
 * High-density residential: a pale residential tower on each large lot, with room around it. It stands at 55% of its
 * floors at Stage 1 and 125% at Stage 3, with the finish its Stage gives it (the kit's `residentialTower`).
 */
function towers(g: ZoneGround) {
  const { kit } = g
  const { podium, most, gap } = TOWERS
  const stood: { lot: number; podium: RowLot }[] = []
  for (const [i, lot] of lotsOf(g, TOWERS.margin, TOWERS.lot).entries()) {
    const [x, y] = [(lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2]
    const [w, d] = [Math.min(most[0], lot.x1 - lot.x0 - 2 * gap), Math.min(most[1], lot.y1 - lot.y0 - 2 * gap)]
    const base = fit(g, x, y, w + 2 * podium, d + 2 * podium, TOWERS.clear, TOWERS.least + 2 * podium, 2.5, 2)
    if (!base) continue
    kit.lot(i, lot)
    const floors = Math.round(kit.range(...TOWERS.floors))
    // A helipad and beacons on the roofs of the tallest (#155), by the floors each tower draws for Stage 2.
    const tallest = (from: readonly number[], stage: number) => stage > 1 && floors >= from[stage - 2]
    const rooftop = (stage: number) => ({ pad: tallest(HIGH.pad, stage), beacon: tallest(HIGH.beacon, stage) })
    kit.staged((stage) =>
      kit.residentialTower(x, y, KERB, base.w - 2 * podium, base.d - 2 * podium, TOWER_FLOORS(floors, stage), stage, rooftop(stage)),
    )
    stood.push({ lot: i, podium: { x, y, w: base.w, d: base.d, ry: 0, onRoad: false } })
  }
  // Then a playground or a garden at each tower's foot, on its tower's lot, once every podium has taken its ground.
  const taken: RowLot[] = [
    ...g.lamps.map(({ x, y }) => ({ x, y, w: 1.4, d: 1.4, ry: 0, onRoad: false })),
    ...stood.map(({ podium: p }) => ({ ...p, w: p.w + 2 * HIGH.foot.apart, d: p.d + 2 * HIGH.foot.apart })),
  ]
  for (const [k, { lot, podium }] of stood.entries()) {
    kit.lot(lot)
    towerFoot(g, podium, taken, taken[g.lamps.length + k])
  }
  kit.lot(-1)
}

/**
 * A playground or a garden at the foot of the tower whose podium is `podium` (#155): along the first side of the
 * podium with room for one, the sides the default camera sees first, as large as there is room for, up to
 * `HIGH.foot`'s, on the Block and clear of everything `taken` but the podium's own ground `own`, which it then takes.
 * Which it is, and each piece of it, is drawn from where it stands. With the Stage:
 * - Stage 1: a bench against the podium.
 * - Stage 2: a playground's soft ground, slide and swings, or a garden's lawn, a flower bed and a bench.
 * - Stage 3: a sandbox and a spring rider in the playground, or a tree, a second bed and a second bench in the garden.
 */
function towerFoot(g: ZoneGround, podium: RowLot, taken: RowLot[], own: RowLot) {
  const { kit } = g
  const { x, y, w, d } = podium
  const { long, deep, least, shallow, off, paved } = HIGH.foot
  // Each side: the way out of it (as a front faces), how far out the podium's edge is, and how long the side is.
  const sides = [
    { ry: Math.PI, edge: d / 2, len: w },
    { ry: -Math.PI / 2, edge: w / 2, len: d },
    { ry: Math.PI / 2, edge: w / 2, len: d },
    { ry: 0, edge: d / 2, len: w },
  ]
  /** The ground `l` along side `side`'s podium edge and `dep` out from it, if it is free. */
  const room = (side: (typeof sides)[number], l: number, dep: number): RowLot | null => {
    const c = turned(x, y, side.ry, 0, side.edge + off + dep / 2)
    const ground = { x: c.x, y: c.y, w: l, d: dep, ry: side.ry, onRoad: false }
    if (!stands(g, c.x, c.y, l, dep, 0.6, side.ry)) return null
    return taken.some((o) => o !== own && overlap(o, ground)) ? null : ground
  }
  for (const side of sides) {
    for (let dep = deep; dep >= shallow; dep -= 0.5) {
      for (let l = Math.min(long, side.len + 2); l >= least; l -= 1) {
        const c = room(side, l, dep)
        if (!c) continue
        taken.push(c)
        const { ry } = side
        const piece = (stage: number, lx: number, ly: number, fn: (p: Vec) => void) => {
          const p = turned(c.x, c.y, ry, lx, ly)
          kit.from(stage, () => fn(p), spot(p.x, p.y))
        }
        // The soft ground or the lawn runs from `a` to `b` along the podium, and the last `paved` m stay paved.
        const [a, b] = [-l / 2, l / 2 - paved]
        const [mid, out, inner] = [(a + b) / 2, dep / 2, -dep / 2]
        const playground = mulberry32(spot(c.x, c.y))() < 0.5
        piece(1, b + paved / 2, inner + 0.6, (p) => kit.bench(p.x, p.y, KERB, ry))
        if (playground) {
          piece(2, mid, 0, (p) => kit.surface(p.x, p.y, KERB, b - a, dep, ry))
          piece(2, a + 2.3, out - 1.3, (p) => kit.slide(p.x, p.y, KERB + 0.1, ry))
          if (b - a >= 5.8) piece(2, b - 2.1, -0.2, (p) => kit.swings(p.x, p.y, KERB + 0.1, ry))
          piece(3, a + 1.3, inner + 1, (p) => kit.sandbox(p.x, p.y, KERB + 0.1, 1.8, 1.4, ry))
          piece(3, b - 0.8, out - 0.8, (p) => kit.rider(p.x, p.y, KERB + 0.1, ry))
        } else {
          const blooms = ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0']
          piece(2, mid, 0, (p) => kit.surface(p.x, p.y, KERB, b - a, dep, ry, LAWN))
          piece(2, a + 0.7, 0, (p) => kit.flowerBed(p.x, p.y, KERB + 0.1, 1, dep - 1.2, ry, kit.pick(blooms)))
          piece(2, a + 2.4, out - 0.6, (p) => kit.bench(p.x, p.y, KERB + 0.1, ry + Math.PI))
          piece(3, mid + 0.5, -0.4, (p) => kit.tree(p.x, p.y, KERB + 0.1, kit.range(0.42, 0.5), kit.chance(0.4) ? 'sakura' : 'round'))
          piece(3, (a + 1.6 + b - 0.4) / 2, inner + 0.7, (p) => kit.flowerBed(p.x, p.y, KERB + 0.1, b - a - 2, 1, ry, kit.pick(blooms)))
          piece(3, b - 1.2, out - 0.6, (p) => kit.bench(p.x, p.y, KERB + 0.1, ry + Math.PI))
        }
        return
      }
    }
  }
}

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

/** A Block's scene (#177, #178): its kind, its ground, and the Stage it stands from. */
interface Scene<K> {
  kind: K
  ground: RowLot
  from: number
}

/** An offices Block's scene (#177), and for a truck court, where its truck turns in. */
type OfficeGround = Scene<OfficeScene> & { entry: TruckEntry | null }

/**
 * The kinds of a Block's scenes, drawn from `draw` (#177, #178): one of `kinds` from Stage 2, picked from where the
 * Block lies, and a second of another kind at Stage 3 on a Block of `second` m² or more. The second is drawn on any
 * Block, so that the draws after it stay.
 */
function sceneOrder<K>(g: ZoneGround, draw: () => number, kinds: readonly K[], second: number): K[] {
  const rest = [...kinds]
  const first = rest.splice(Math.floor(draw() * rest.length), 1)[0]
  return [first, rest[Math.floor(draw() * rest.length)]].slice(0, area(g.block.loop) >= second ? 2 : 1)
}

/**
 * A Block's scenes of the kinds `order` has (`sceneOrder`), the first from Stage 2 and the second at Stage 3 (#177,
 * #178), each on the ground `find` gives its kind as the scenes before it (`out`) leave room; a kind that finds none
 * gives way to another of `kinds` the Block has not taken.
 */
function placeScenes<K, S extends Scene<K>>(
  order: K[],
  kinds: readonly K[],
  find: (kind: K, out: S[]) => Omit<S, 'kind' | 'from'> | null,
): S[] {
  const out: S[] = []
  for (const drawn of order) {
    for (const kind of [drawn, ...kinds.filter((k) => k !== drawn)]) {
      if (out.some((o) => o.kind === kind)) continue
      const found = find(kind, out)
      if (!found) continue
      out.push({ ...found, kind, from: out.length ? 3 : 2 } as S)
      break
    }
  }
  return out
}

/** Whether ground `l` lies clear of the scenes `out` (#177, #178), 18 m or more from each. */
const clearOfScenes = (out: Scene<unknown>[], l: RowLot) =>
  !out.some((o) => overlap(o.ground, l) || Math.hypot(o.ground.x - l.x, o.ground.y - l.y) < 18)

/** Whether the way `way` keeps `room` m from each utility pole, lamp and street tree, in that order (#177, #178). */
function clearOfKerbside(g: ZoneGround, way: Vec[], [poles, lamps, trees]: [number, number, number]): boolean {
  const clear = (p: Vec, room: number) => way.every((a, i) => !i || distance(p, way[i - 1], a) >= room)
  return g.poles.every((p) => clear(p, poles)) && g.lamps.every((p) => clear(p, lamps)) && g.street.every((p) => clear(p, trees))
}

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

/**
 * How far out from the front of ground `l`, `along` m along it from its middle (as its front runs), the Block's edge
 * lies straight ahead, if a Road lies across the pavement there rather than the seam with the next Tile (#177); null if
 * not, or not within 12 m.
 */
function kerbAhead(g: ZoneGround, l: RowLot, along: number): number | null {
  const cell = cellBounds(cellAt(middle(g.block)))
  let last = g.field.sample(...to(l.x, l.y, l.ry, along, l.d / 2))
  for (let out = 0.25; out <= 12; out += 0.25) {
    const here = g.field.sample(...to(l.x, l.y, l.ry, along, l.d / 2 + out))
    if (here > 0) {
      last = here
      continue
    }
    const edge = out - 0.25 + (0.25 * Math.max(0, last)) / (Math.max(0, last) - here || 1)
    const [px, py] = to(l.x, l.y, l.ry, along, l.d / 2 + edge + 3)
    return px > cell.x0 + 1 && px < cell.x1 - 1 && py > cell.y0 + 1 && py < cell.y1 - 1 ? edge : null
  }
  return null
}

/** Whether a straight run of the Block's outline faces a Road at its middle, rather than the seam with the next Tile. */
const facesRoad = (r: Run) => r.onRoad(r.a.x + (r.ux * r.len) / 2, r.a.y + (r.uy * r.len) / 2)

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
 * Whether lots `a` and `b` lie side by side (#177): within 1.5 m of each other one way, as lots cut apart touch or a
 * street tree has moved an edge back, and sharing more than 1 m of side the other way, so not corner to corner.
 */
function beside(a: Bounds, b: Bounds): boolean {
  const [gx, gy] = [Math.max(a.x0 - b.x1, b.x0 - a.x1), Math.max(a.y0 - b.y1, b.y0 - a.y1)] // gaps: below 0, an overlap
  return (gx <= 1.5 && gy < -1) || (gy <= 1.5 && gx < -1)
}

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
 * Ground of each size of `sizes` in turn, m along a straight run of `candidates` (the Block's runs, `runs`) and in
 * from it: its middle at least `ends` m in from its run's ends, on a run facing a Road where one fits and any run where
 * none does, standing on the Block `clear` m in from its edge, clear of the street trees and `lampRoom` m clear of the
 * lamps, and as `ok` has it; null if none is found. Where along which run is drawn from `draw`: a few tries at random
 * (#177), or, if `slide`, every metre along every run from one drawn to start, for a Block whose buildings leave little
 * room (#178).
 */
function alongEdge(
  g: ZoneGround,
  draw: () => number,
  candidates: Run[],
  sizes: (readonly [number, number])[],
  { lampRoom, clear, ends, slide = false }: { lampRoom: number; clear: number; ends: number; slide?: boolean },
  ok: (l: RowLot) => boolean,
): RowLot | null {
  const shift = slide ? Math.floor(draw() * Math.max(1, candidates.length)) : 0
  const shifted = candidates.map((_, k) => candidates[(k + shift) % candidates.length])
  const ordered = [...shifted.filter(facesRoad), ...shifted.filter((r) => !facesRoad(r))]
  for (const [w, d] of sizes) {
    for (const [run, s] of slide ? slid(ordered, w, ends) : tried(candidates, w, ends, draw)) {
      const [fx, fy] = [run.a.x + run.ux * s, run.a.y + run.uy * s]
      const l = { x: fx - (run.nx * d) / 2, y: fy - (run.ny * d) / 2, w, d, ry: run.ry, onRoad: run.onRoad(fx, fy) }
      if (!stands(g, l.x, l.y, w, d, clear, l.ry) || g.lamps.some((p) => near(l, p.x, p.y, lampRoom))) continue
      if (ok(l)) return l
    }
  }
  return null
}

/** `size`, then halfway down to `least`, then `least`: the sizes `alongEdge` tries, largest first. */
const smaller = (size: readonly [number, number], least: readonly [number, number]): (readonly [number, number])[] => [
  size,
  [(size[0] + least[0]) / 2, (size[1] + least[1]) / 2],
  least,
]

/**
 * A few spots along `candidates` for ground `w` m long, its middle `ends` m in from its run's ends (#177): runs facing
 * a Road first where one fits, then any, eight tries on each, each run and spot drawn from `draw`.
 */
function* tried(candidates: Run[], w: number, ends: number, draw: () => number): Generator<[Run, number]> {
  const fits = candidates.filter((r) => r.len >= w + 2 * ends)
  const road = fits.filter(facesRoad)
  for (const pool of road.length ? [road, fits] : [fits]) {
    for (let tries = 0; tries < 8 && pool.length; tries++) {
      const run = pool[Math.floor(draw() * pool.length)]
      yield [run, w / 2 + ends + draw() * (run.len - w - 2 * ends)]
    }
  }
}

/** Every metre along each of `runs` in turn for ground `w` m long, its middle `ends` m in from the run's ends (#178). */
function* slid(runs: Run[], w: number, ends: number): Generator<[Run, number]> {
  for (const run of runs) for (let s = w / 2 + ends; s <= run.len - w / 2 - ends; s += 1) yield [run, s]
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

/**
 * Shops: low shops shoulder to shoulder along every edge, each with its front, and trees behind. Every shop is one
 * storey at Stage 1 and a storey higher at Stage 3, built to the level of finish (#175, the kit's `shop`) as its lot's
 * plan has it: a front colour and a form that differ from its neighbour's, and one shop in eight a noodle shop whose
 * vent steams. From Stage 2 one lot on a Road holds the Block's scene, and at Stage 3 a second on a Block of 2,500 m²
 * or more (`sceneLots`). Coloured paving lies before the fronts from Stage 2, and shoppers walk the fronts on a Road
 * from Stage 2, stopping at each.
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
  let [front, form] = [-1, -1]
  const built: (ShopForm | undefined)[] = [] // each lot's shop's form, none for a food stall's court
  for (const [i, l] of lots.entries()) {
    kit.lot(i, l)
    const storeys = kit.chance(0.45) ? 1 : 2
    front = (front + 1 + Math.floor(plans() * (FRONT.cloths.length - 1))) % FRONT.cloths.length
    // Its form: the one drawn, or the next one that no shop beside it has, as round a row's corner (#193), nor the lot
    // cut before it unless that leaves none.
    const { forms } = SHOP_FINISH
    const beside = new Set(built.flatMap((f, k) => (f && besideRow(lots[k], l) ? [f] : [])))
    const near = forms.some((f) => !beside.has(f) && f !== forms[form]) ? new Set([...beside, forms[form]]) : beside
    form = Math.floor(plans() * forms.length)
    for (let n = 0; n < forms.length && near.has(forms[form]); n++) form = (form + 1) % forms.length
    const noodle = plans() < SHOP_FINISH.noodle
    const scene = scenes.get(i)
    built.push(scene?.kind === 'stall' ? undefined : forms[form])
    // The end of its front its door is at, drawn from where it stands: the vending machines stand at the other.
    const door: 1 | -1 = mulberry32(spot(l.x, l.y))() < 0.5 ? -1 : 1
    g.kept.push({ ...turned(l.x, l.y, l.ry, 0, SHOPS.margin / 2), w: l.w, d: l.d + SHOPS.margin, ry: l.ry })
    if (scene?.kind === 'stall') {
      kit.scene('stall', () => kit.staged((stage) => stallCourt(g, l, stage, scene.from, paving)))
      continue
    }
    const plan = { front: FRONT.cloths[front], form: SHOP_FINISH.forms[form], noodle, door, onRoad: l.onRoad }
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
 * beside the first.
 */
function sceneLots(g: ZoneGround, lots: RowLot[], draw: () => number): Map<number, { kind: ShopScene; from: number }> {
  const scenes = new Map<number, { kind: ShopScene; from: number }>()
  const road = lots.flatMap((l, i) => (l.onRoad ? [i] : []))
  const widest = Math.max(0, ...road.map((i) => lots[i].w))
  const fit = road.filter((i) => lots[i].w >= Math.min(SHOP_FINISH.wide, widest))
  const kinds = [...SHOP_FINISH.scenes]
  const [first, at] = [kinds.splice(Math.floor(draw() * kinds.length), 1)[0], Math.floor(draw() * fit.length)]
  const [second, other] = [kinds[Math.floor(draw() * kinds.length)], draw()]
  if (!fit.length) return scenes
  scenes.set(fit[at], { kind: first, from: 2 })
  const rest = fit.filter((i) => Math.abs(i - fit[at]) > 1)
  if (area(g.block.loop) >= SHOP_FINISH.second && rest.length) scenes.set(rest[Math.floor(other * rest.length)], { kind: second, from: 3 })
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

/** Where `(lx, ly)` in the frame of something at `(x, y)` turned `ry` lies, as the kit's `to` has it, as a point. */
const turned = (x: number, y: number, ry: number, lx: number, ly: number): Vec => {
  const [px, py] = to(x, y, ry, lx, ly)
  return { x: px, y: py }
}

/**
 * A shed as `industrial` lays it (#150): its footprint `w` (east–west) by `d` centred on `(x, y)`, the way its long
 * side runs (`ry`, 0 east–west), the long side its doors face (`side`, as the kit's `warehouse` takes it), and how
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

/**
 * Industrial: wide, low sheds with sawtooth roofs on big lots with yards between them, and now and then a chimney, each
 * with the size and finish its Stage gives it (the kit's `warehouse`). Each shed's doors open onto a loading yard
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
    kit.staged((stage) => kit.warehouse(shed.x, shed.y, KERB, shed.w, shed.d, first, side, stage))
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
      kit.from(2, () => kit.bay(at.x, at.y, KERB, shed.ry, 2 * dock, wide + 0.9), spot(at.x, at.y + 1))
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
        kit.from(1, () => kit.pallets(stack.x, stack.y, KERB, shed.ry, 2), spot(stack.x, stack.y))
        kit.from(3, () => kit.pallets(stack.x, stack.y, KERB, shed.ry, 3, 2), spot(stack.x, stack.y + 1))
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

/** Parks: a park with a pond and trees, or on a small Block now and then a plaza with a fountain. */
function parks({ kit, field, block, street }: ZoneGround) {
  const small = (block.x1 - block.x0) * (block.y1 - block.y0) < PARKS.small
  const fountain = small && kit.chance(PARKS.plaza) ? site(field, block, 12, 12, middle(block), street, 1) : null
  if (fountain) plaza(kit, field, block, fountain, street)
  else park(kit, field, block, undefined, street)
}
