import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Polyline, type Vec } from '../../sim/geometry'
import { area, KERB } from '../blocks'
import { WIND } from '../day'
import { inside } from '../field'
import { BENCH, CREAM, SHAPES, spot, to, type Kit, type TreeKind } from '../kit'
import { clearOf, GROW, overlay, scatter, site } from '../landmarks'
import { PATTERN } from '../pattern'
import { GLOWS, pavilionLantern, WOOD } from '../props'
import { ribbons } from '../ribbons'
import { aside, borderLengths, corners, near, nearPath, runs, stands, winding, type Look, type RowLot, type ZoneGround } from './ground'
import { facesRoad, placeScenes, sceneOrder, type Scene } from './scenes'

// Green: a meadow, or one Block in three allotments.
const GREEN = { allotments: 0.35 }

/** Green's look (`./index`), built to the Finish since #182. */
export const look: Look = {
  landmarks: false,
  finish: true,
  fill: (g) => (g.kit.chance(GREEN.allotments) ? allotments : meadow)(g),
}

// Green: a meadow's grass and its beds of flowers; allotments' trodden earth, the soil of their plots, the crops and
// flowers in them, and their sheds.
const MEADOW = '#b9e293'
const TAU = Math.PI * 2
const BEDS = ['#ffd1df', '#f6d36a', '#ffadc8', '#fff7e8', '#c7b8f0']
const [EARTH, SOIL, SHED, SHED_ROOF] = ['#d9c39c', '#a77f5a', '#c49a6c', '#5aa69b']
/**
 * Green to the Finish (#182). A meadow's: its worn path, the rise a kite is flown from, the leaves of a bed's rows, tall
 * grass and its seed heads, a stream's banks, logs, and beehives under their lids. A tent's canvases and its door; a
 * camp fire's stones and embers; what people wear, their skin and their hats. An allotments' fence, compost, a
 * wheelbarrow, a hose, and a glasshouse's frame and panes.
 */
const FINISH = {
  dirt: '#cdb489',
  rise: '#c6e9a2',
  rows: '#5aae58',
  tufts: ['#8fbf62', '#a3c96b', '#7fb35a'],
  heads: '#d9c98a',
  bank: '#b7b29f',
  logs: ['#a1714c', '#8a6446', '#b58a62'],
  hives: ['#f4e3a1', '#fbf8f2', '#cfe3c0'],
  lid: '#8e979f',
  tents: ['#f0d58a', '#b9d6b0', '#f2c9a0', '#e6dfc8'],
  door: '#8a6446',
  stones: '#a29d92',
  ember: '#ffb24a',
  shirts: ['#f6d36a', '#7fbf9d', '#ffadc8', '#c7b8f0', '#fbf8f2'],
  legs: '#4a525c',
  skin: '#f1d1b5',
  straw: '#e8cf7f',
  veil: '#fbf8f2',
  kites: ['#f6d36a', '#ffadc8', '#c7b8f0', '#7fbf9d', '#fbf8f2'],
  coats: ['#fbf8f2', '#c49a6c', '#4a525c', '#e8cf7f'],
  fence: '#c49a6c',
  post: '#a1714c',
  compost: '#6b5137',
  barrow: '#6f8f80',
  hose: '#5aa69b',
  frame: '#f4f1ea',
  panes: '#d6ece6',
}
/** m² of Block from which green has a second scene at Stage 3 (#173's rule 5), and how far apart its scenes stand (m). */
const SCENES = { second: 2500, apart: 16 }
const CROPS = ['#6fc35a', '#8fd46c', '#5aae58', '#b9dd6a']
const [BEANS, CANES] = ['#4f9f4a', '#c9b07a'] // a Stage 3 plot's, climbing
const BLOOMS = ['#ffd1df', '#f6d36a', '#ffadc8', '#fff7e8']
// Green details (#152), each drawn from where it stands, so that nothing else on its Block draws differently, on lots of
// their own from `DETAIL` on. Wildflowers lie in drifts through a meadow's grass, more of them at each Stage: drifts to
// every 1,000 m² of Block that each Stage adds, the flowers in a drift, how far it spreads and how far in from the
// Block's edge it keeps (m), and their colours, white and yellow leading.
const DETAIL = 100
const WILD = {
  drifts: [1.6, 3, 4],
  flowers: [12, 16, 20],
  spread: 2.6,
  clear: 2.6,
  colours: ['#ffffff', '#f6d36a', '#ffffff', '#a58ad8', '#ff9ab8', '#f6d36a', '#c7b8f0'],
}
/** A wildflower's head (#152): a five-petalled star 0.56 m across, lying flat. */
const FLOWER = (() => {
  const star = new THREE.Shape()
  for (let k = 0; k < 10; k++) {
    const [r, a] = [k % 2 ? 0.12 : 0.28, (k * Math.PI) / 5]
    if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else star.moveTo(r, 0)
  }
  return new THREE.ShapeGeometry(star).rotateX(-Math.PI / 2)
})()
// Butterflies over a meadow's beds (#152): one to every two beds from Stage 2 and one more to every three at Stage 3, at
// most `most` each; how long each rests on a bed (s), how far its flight weaves either side of its way (m) and how
// often (m a weave), and the paints its wings take.
const BUTTERFLIES = {
  two: 2,
  three: 3,
  most: 3,
  rest: [3, 9],
  weave: 0.7,
  wave: 3.4,
  paints: ['#ffffff', '#f6d36a', '#fbe3a2', '#ffadc8', '#c7b8f0', '#f0b43c'],
}
// Picnic blankets on a meadow's open grass (#152): one from Stage 2, a second at Stage 3 and a third then on a Block of
// at least `big` m²; how far each keeps from trees, beds and the rest (m).
const PICNICS = { big: 2500, room: 4 }
// Allotments' details (#152): the share of worked plots under cold frames from Stage 2 and from Stage 3, and a
// scarecrow from Stage 1 on this share of Blocks (from Stage 2 on the rest), a second at Stage 3 on a Block of this
// many plots.
const ALLOTTED = { frames: [0.16, 0.34], early: 0.5, second: 12 }
const ALLOTMENT = { w: 6.4, d: 4.6, path: 1.3 } // m: a plot, and the gravel path between plots

/** A meadow's tree, as its grove plants it: where, its size and kind, its grove, which of the grove's it is, and its stream's seed. */
interface Tree {
  p: Vec
  size: number
  kind: TreeKind
  grove: number
  k: number
  seed: number
}

/** A bed of flowers on a meadow: where it lies, how big it is and its colour. */
interface Bed {
  p: Vec
  w: number
  d: number
  colour: string
}

/** The scenes a meadow picks from (#182), and the ground each takes (m along its front and deep), largest first. */
type MeadowScene = 'kite' | 'campsite'
const MEADOW_SCENES: Record<MeadowScene, (readonly [number, number])[]> = {
  kite: [
    [7, 7],
    [5.6, 5.6],
  ],
  campsite: [
    [7.6, 6],
    [6.2, 5.2],
  ],
}
type MeadowGround = Scene<MeadowScene>
/**
 * A meadow's stream (#182): the m² of Block from which it has one, how wide its water and each bank, m between the
 * points of its middle line, and how far it strays. Its worn path: how wide, m between its points, how far it strays,
 * and the m² of Block from which there are two.
 */
const STREAM = { big: 2500, wide: 2, bank: 0.35, step: 1.5, strays: 4 }
const PATH = { wide: 1.3, step: 1.2, strays: 2.2, two: 1600 }
/** The way the wind blows, a metre of it: a kite flies down it. */
const DOWNWIND = { x: WIND.x / Math.hypot(WIND.x, WIND.y), y: WIND.y / Math.hypot(WIND.x, WIND.y) }
/** How far from a stream's middle its banks reach. */
const SHORE = STREAM.wide / 2 + STREAM.bank

/**
 * A meadow Block: open grass but for groves of trees, one to about every 700 m² and at least two, and a few beds of
 * flowers, all clear of the street trees. With the Stage:
 * - Stage 1: three saplings to a grove, and no beds.
 * - Stage 2: five trees to a grove, and the beds.
 * - Stage 3: the trees grown on, three more beds, and a pavilion by the first grove where there is room.
 * Built to the Finish (#182): the grass is mown in glades through the unmown, the beds are rows of flowers, and the
 * pavilion is tiled and hangs a lantern. Its groves and beds are planned as they always were, on the kit's stream; then,
 * on a stream of the Block's own, its scenes take their ground (`meadowScenes`) and on a large Block a stream winds across
 * (`meadowStream`), and the trees and beds in their way are not planted; worn paths lead in to the scenes
 * (`meadowPaths`), over the stream by a plank bridge. Its details: `meadowDetails`.
 */
function meadow(g: ZoneGround) {
  const { kit, field, block, kerbsideTrees } = g
  overlay(kit, field, block, 2, 0.24, MEADOW, PATTERN.meadow)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.24
  /** The seed of a stream of its own, as `staged` and `from` would draw it here. */
  const seeded = () => (kit.range(0, 1) * 4294967296) >>> 0
  const groves = scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 700)), 6.5, Infinity, 16, [])
  const trees: Tree[] = []
  for (const [grove, at] of groves.entries()) {
    const nearby = { ...block, x0: at.x - 7, x1: at.x + 7, y0: at.y - 7, y1: at.y + 7 }
    for (const [k, p] of scatter(kit, field, nearby, 5, 4.5, Infinity, 3.4, kerbsideTrees).entries()) {
      const [size, kind] = [kit.range(0.75, 1.15), kit.chance(0.25) ? 'pine' : kit.chance(0.2) ? 'sakura' : 'round'] as const
      trees.push({ p, size, kind, grove, k, seed: seeded() })
    }
  }
  const beds: (Bed & { seed: number })[] = []
  for (const p of scatter(kit, field, block, 5, 4, Infinity, 7, kerbsideTrees))
    beds.push({ p, w: kit.range(3, 5.5), d: kit.range(1.6, 2.6), colour: kit.pick(BEDS), seed: seeded() })
  const lateSeed = seeded()

  const draw = mulberry32(spot(mid.x, mid.y) ^ 0x182a)
  const scenes = meadowScenes(g, draw, trees, beds)
  const stream = meadowStream(g, draw, scenes)
  /** Whether what would stand `r` m round `p` gives way to a scene or the stream. */
  const gone = (p: Vec, r: number) => scenes.some((s) => near(s.ground, p.x, p.y, r)) || (!!stream && nearPath(stream, p.x, p.y, SHORE + r))
  const reach = (b: Bed) => Math.max(b.w, b.d) / 2 + 0.4
  const standing = trees.filter((t) => !gone(t.p, 1.2))
  const kept = beds.filter((b) => !gone(b.p, reach(b)))
  for (const { ground: l, from } of scenes) kit.stand(l.x, l.y, l.w, l.d, l.ry, from)
  for (const t of trees) {
    kit.lot(t.grove)
    if (!standing.includes(t)) continue
    kit.stand(t.p.x, t.p.y, 1)
    kit.staged((stage) => {
      if (t.k < 3 || stage > 1) kit.tree(t.p.x, t.p.y, ground, GROW[stage - 1] * t.size, t.kind, true)
    }, t.seed)
  }
  for (const [k, b] of beds.entries()) {
    kit.lot(groves.length + k)
    if (!kept.includes(b)) continue
    kit.stand(b.p.x, b.p.y, b.w, b.d, 0, 2)
    kit.from(2, () => bed(kit, b, ground), b.seed)
  }
  kit.lot(-1)
  // Stage 3's beds and pavilion, drawn on the stream `from` seeds here, as it would have seeded it: known before they
  // are built, so that the details keep clear of them at every Stage (#152). The pavilion keeps off the beds drawn with
  // it, the scenes and the stream.
  const planted = trees.map((t) => t.p)
  const barred = [...scenes.flatMap((s) => [s.ground, ...corners(s.ground, 0)]), ...(stream ?? [])]
  const late = (range: (a: number, b: number) => number) => {
    const more = scatter({ range }, field, block, 3, 4, Infinity, 7, [...kerbsideTrees, ...beds.map((b) => b.p), ...planted]).map((p) => ({
      p,
      w: range(3, 5.5),
      d: range(1.6, 2.6),
      colour: BEDS[Math.floor(range(0, 1) * BEDS.length)],
    }))
    const avoid = [...kerbsideTrees, ...planted, ...beds.map((b) => b.p), ...more.map((b) => b.p), ...barred]
    return { more: more.filter((b) => !gone(b.p, reach(b))), pavilion: site(field, block, 7, 7, groves[0], avoid, 2.5) }
  }
  const drawLate = mulberry32(lateSeed)
  const third = late((a, b) => a + (b - a) * drawLate()) // as Stage 3 builds them
  for (const b of third.more) kit.stand(b.p.x, b.p.y, b.w, b.d, 0, 3)
  if (third.pavilion) kit.stand(third.pavilion.x, third.pavilion.y, 4.6, 4.6, 0, 3)
  kit.from(
    3,
    () => {
      const { more, pavilion } = late(kit.range)
      more.forEach((b) => bed(kit, b, ground))
      if (!pavilion) return
      kit.pavilion(pavilion.x, pavilion.y, ground, true)
      pavilionLantern(kit, pavilion.x, pavilion.y, ground)
    },
    lateSeed,
  )

  const laid = { trees: standing, beds: kept, more: third.more, pavilion: third.pavilion, scenes, stream }
  const paths = meadowPaths(g, draw, laid)
  if (stream) {
    kit.from(1, () => streamBed(kit, stream, ground), spot(stream[0].x, stream[0].y))
    // A plank bridge where each path crosses, or over the stream's middle where none does.
    const over = paths.map((path) => crossings(path, stream)[0]).filter((c) => !!c)
    const at = Math.floor(stream.length / 2)
    const [a, b] = [stream[at - 1], stream[at + 1]]
    for (const c of over.length ? over : [{ ...stream[at], ry: Math.atan2(b.y - a.y, b.x - a.x) }]) {
      kit.stand(c.x, c.y, 1.7, 2 * SHORE + 1.2, c.ry)
      kit.from(1, () => plankBridge(kit, c.x, c.y, c.ry, ground), spot(c.x, c.y))
    }
  }
  for (const path of paths) kit.from(1, () => dirtPath(kit, path, ground), spot(path[0].x, path[0].y))
  for (const { kind, ground: l, from } of scenes) {
    kit.scene(kind, () =>
      kit.staged(
        (stage) => {
          if (stage >= from) ({ kite: kiteRise, campsite })[kind](kit, l, stage, ground)
        },
        spot(l.x, l.y),
      ),
    )
  }
  meadowDetails(g, ground, { ...laid, groves, paths })
}

/**
 * A meadow's scenes (#182), drawn from `draw`: from Stage 2 one, a kite flown from a rise or a campsite, and the other
 * at Stage 3 on 2,500 m² or more, 16 m apart, each well in on the grass. Each takes the spot nearest a point drawn on
 * the Block that keeps clear of the `trees` and `beds`: clear of the grown trees' crowns, or else of their trunks, or
 * else wherever it stands, and what is in its way is not planted.
 */
function meadowScenes(g: ZoneGround, draw: () => number, trees: Tree[], beds: Bed[]): MeadowGround[] {
  const { block } = g
  const kinds: MeadowScene[] = ['kite', 'campsite']
  const order = sceneOrder(g, draw, kinds, SCENES.second)
  const anchor = {
    x: block.x0 + (0.25 + 0.5 * draw()) * (block.x1 - block.x0),
    y: block.y0 + (0.25 + 0.5 * draw()) * (block.y1 - block.y0),
  }
  const spots: Vec[] = []
  for (let x = block.x0 + 4; x <= block.x1 - 4; x += 2) for (let y = block.y0 + 4; y <= block.y1 - 4; y += 2) spots.push({ x, y })
  spots.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y))
  // How far it keeps from the trees' trunks, and whether from the beds: tried in turn.
  const rooms: [number | null, boolean][] = [
    [3.4, true],
    [2.2, true],
    [1.2, false],
    [null, false],
  ]
  return placeScenes<MeadowScene, MeadowGround>(order, kinds, (kind, out) => {
    for (const [room, offBeds] of rooms)
      for (const [w, d] of MEADOW_SCENES[kind])
        for (const q of spots) {
          if (out.some((o) => Math.hypot(o.ground.x - q.x, o.ground.y - q.y) < SCENES.apart)) continue
          const l = { x: q.x, y: q.y, w, d, ry: Math.PI, onRoad: false } // its front to the south, where the default camera stands
          if (!stands(g, q.x, q.y, w, d, 3.2, l.ry)) continue
          if (room !== null && trees.some((t) => near(l, t.p.x, t.p.y, room))) continue
          // A kite's way downwind keeps clear of the trees too, while there is such a spot.
          if (kind === 'kite' && room && trees.some((t) => Math.hypot(t.p.x - q.x - DOWNWIND.x * 5, t.p.y - q.y - DOWNWIND.y * 5) < 4))
            continue
          if (offBeds && beds.some((b) => near(l, b.p.x, b.p.y, Math.max(b.w, b.d) / 2 + 1))) continue
          return { ground: l }
        }
    return null
  })
}

/**
 * A meadow's stream (#182), drawn from `draw`, as its middle line: on a Block of 2,500 m² or more, winding from one
 * side of the grass to the other, across the Block's longer side more often than not, clear of the `scenes`; null on a
 * smaller Block or where no such way keeps to the grass.
 */
function meadowStream(g: ZoneGround, draw: () => number, scenes: MeadowGround[]): Vec[] | null {
  const { field, block } = g
  if (area(block.loop) < STREAM.big) return null
  const mid = middle(block)
  const [w, d] = [block.x1 - block.x0, block.y1 - block.y0]
  const onGrass = (p: Vec) => field.sample(p.x, p.y) >= 2 + SHORE + 0.4 && inside(block.loop, p.x, p.y)
  const eastWest = draw() < 0.7 === w >= d
  const offsets = [-0.28, -0.14, 0, 0.14, 0.28].map((f) => [f, draw()]).sort((a, b) => a[1] - b[1])
  const sides = draw() < 0.5 ? [1, -1] : [-1, 1]
  for (const [f] of offsets) {
    const at = (t: number): Vec => (eastWest ? { x: block.x0 + t * w, y: mid.y + f * d } : { x: mid.x + f * w, y: block.y0 + t * d })
    const ends = [0, 1].map((from) => {
      for (let k = 0; k <= 45; k++) if (onGrass(at(Math.abs(from - k / 100)))) return at(Math.abs(from - k / 100))
      return null
    })
    const [a, b] = ends
    if (!a || !b) continue
    for (const side of sides) {
      const pts = winding(a, b, side * STREAM.strays, 2, STREAM.step)
      if (pts.every(onGrass) && !pts.some((p) => scenes.some((s) => near(s.ground, p.x, p.y, SHORE + 1.5)))) return pts
    }
  }
  return null
}

/** What a meadow has laid before its paths and its details (#182): the trees and beds that stand, Stage 3's, the scenes and the stream. */
interface Laid {
  trees: Tree[]
  beds: Bed[]
  more: Bed[]
  pavilion: Vec | null
  scenes: MeadowGround[]
  stream: Vec[] | null
}

/** Where path `path` crosses the line `over` (#182), in order along it, each with the turn of a front that looks along the path there. */
function crossings(path: Vec[], over: Vec[]): { x: number; y: number; ry: number }[] {
  const out: { x: number; y: number; ry: number }[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [p, r] = [path[i], { x: path[i + 1].x - path[i].x, y: path[i + 1].y - path[i].y }]
    for (let j = 0; j + 1 < over.length; j++) {
      const [q, s] = [over[j], { x: over[j + 1].x - over[j].x, y: over[j + 1].y - over[j].y }]
      const cross = r.x * s.y - r.y * s.x
      if (Math.abs(cross) < 1e-9) continue
      const [t, u] = [((q.x - p.x) * s.y - (q.y - p.y) * s.x) / cross, ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / cross]
      if (t >= 0 && t < 1 && u >= 0 && u < 1) out.push({ x: p.x + r.x * t, y: p.y + r.y * t, ry: Math.atan2(-r.x, r.y) })
    }
  }
  return out
}

/**
 * A meadow's worn paths (#182), drawn from `draw`, as their middle lines: one, or two on a Block of 1,600 m² or more,
 * each from a corner of the Block winding in to a scene (or the pavilion, or the Block's middle), straight where a
 * winding one will not keep to the grass, off the trees, the beds and the pavilion, and crossing the stream once at most.
 */
function meadowPaths(g: ZoneGround, draw: () => number, { trees, beds, more, pavilion, scenes, stream }: Laid): Vec[][] {
  const { field, block } = g
  const mid = middle(block)
  const room = PATH.wide / 2 + 0.5
  const open = (q: Vec) =>
    trees.every((t) => Math.hypot(t.p.x - q.x, t.p.y - q.y) >= room + 0.6) &&
    [...beds, ...more].every((b) => Math.abs(b.p.x - q.x) > b.w / 2 + room || Math.abs(b.p.y - q.y) > b.d / 2 + room) &&
    (!pavilion || Math.hypot(pavilion.x - q.x, pavilion.y - q.y) >= 3.2 + room)
  const targets: (RowLot | Vec)[] = [...scenes.map((s) => s.ground), ...(pavilion ? [pavilion] : []), mid]
  /** Whether a path along `pts` to `target` keeps to the grass and off what stands, past its first 2.4 m. */
  const keeps = (pts: Vec[], target: RowLot | Vec) => {
    if (stream && (crossings(pts, stream).length > 1 || pts.filter((q) => nearPath(stream, q.x, q.y, SHORE)).length > 4)) return false
    return pts.every((q, i) => {
      if (i * PATH.step < 2.4) return true
      if (field.sample(q.x, q.y) < 2 + room || !inside(block.loop, q.x, q.y)) return false
      if (scenes.some((s) => s.ground !== target && near(s.ground, q.x, q.y, 0.8))) return false
      return i >= pts.length - 3 || open(q)
    })
  }
  const out: Vec[][] = []
  const boxCorners = [
    { x: block.x0, y: block.y0 },
    { x: block.x1, y: block.y0 },
    { x: block.x1, y: block.y1 },
    { x: block.x0, y: block.y1 },
  ]
  const start = Math.floor(draw() * 4)
  const most = area(block.loop) < PATH.two ? 1 : 2
  for (let k = 0; k < 4 && out.length < most; k++) {
    const c = boxCorners[(start + k) % 4]
    // Walk in from the corner of the Block's box to the grass.
    const len = Math.hypot(mid.x - c.x, mid.y - c.y)
    let e: Vec | null = null
    for (let t = 0; t < len * 0.6 && !e; t += 0.5) {
      const q = { x: c.x + ((mid.x - c.x) / len) * t, y: c.y + ((mid.y - c.y) / len) * t }
      if (field.sample(q.x, q.y) >= 2.1 && inside(block.loop, q.x, q.y)) e = q
    }
    if (!e) continue
    const target = targets[Math.min(out.length, targets.length - 1)]
    // To the edge of a scene's ground or the pavilion's floor, on the side it comes from.
    const far = Math.hypot(target.x - e.x, target.y - e.y)
    const short = 'w' in target ? Math.min(target.w, target.d) / 2 : target === pavilion ? 2.4 : 0
    if (far < short + 4) continue
    const end = { x: target.x + ((e.x - target.x) / far) * short, y: target.y + ((e.y - target.y) / far) * short }
    const strays = (draw() < 0.5 ? -1 : 1) * PATH.strays
    const waves = draw() < 0.6 ? 1 : 2
    const path = [strays, -strays, 0].map((a) => winding(e, end, a, waves, PATH.step)).find((pts) => keeps(pts, target))
    if (path) out.push(path)
  }
  return out
}

/**
 * A meadow's details (#152), each drawn from where it stands: benches by the groves, picnic blankets on the open grass,
 * drifts of wildflowers through it, and butterflies over the beds; and to the Finish (#182) a log pile and beehives by
 * the groves, tufts of tall grass along its edges and its stream, and a dog that runs between the blankets. Each keeps
 * off the scenes, the stream and the paths. With the Stage:
 * - Stage 1: a few drifts of wildflowers, the tufts and the log pile.
 * - Stage 2: more drifts, a bench by the first grove, a picnic blanket with its basket, two beehives, a butterfly to
 *   every two beds, and the dog.
 * - Stage 3: the most drifts, a bench by every grove, more blankets, one under a parasol, a third hive and more butterflies.
 */
function meadowDetails(
  g: ZoneGround,
  ground: number,
  { trees, groves, beds, more, pavilion, scenes, stream, paths }: Laid & { groves: Vec[]; paths: Vec[][] },
) {
  const { kit, block, kerbsideTrees } = g
  const all = [...beds, ...more]
  /** Whether `p` lies `pad` m clear of the scenes, the stream and the paths. */
  const off = (p: Vec, pad: number) =>
    !scenes.some((s) => near(s.ground, p.x, p.y, pad)) &&
    !(stream && nearPath(stream, p.x, p.y, SHORE + pad)) &&
    !paths.some((path) => nearPath(path, p.x, p.y, PATH.wide / 2 + pad))
  const clear = (p: Vec, room: number, apart = 1.8, pad = 1.4) =>
    kit.onGround(p.x, p.y, room) &&
    trees.every((t) => Math.hypot(t.p.x - p.x, t.p.y - p.y) >= apart) &&
    kerbsideTrees.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= 3.4) &&
    all.every((b) => Math.abs(b.p.x - p.x) > b.w / 2 + 1.6 || Math.abs(b.p.y - p.y) > b.d / 2 + 1.6) &&
    (!pavilion || Math.hypot(pavilion.x - p.x, pavilion.y - p.y) >= 5.5) &&
    off(p, pad)
  const taken: Vec[] = [] // benches, blankets, the log pile and the hives, which the rest keep off
  let lot = DETAIL
  /** The first spot by grove `grove` round from the angle `from`, 7 or 8.5 m out, where a piece `apart` m from the trees stands. */
  const by = (grove: Vec, from: number): (Vec & { a: number }) | null => {
    for (const out of [7, 8.5])
      for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2]) {
        const a = from + turn
        const p = { x: grove.x + Math.cos(a) * out, y: grove.y + Math.sin(a) * out, a }
        if (clear(p, 3.2, 3.6) && !taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 4)) return p
      }
    return null
  }
  // A bench by each grove, the first's from Stage 2 and the rest's at Stage 3, on the side the default camera sees
  // where there is room, facing out from the trees.
  // It keeps clear of a grown tree's crown, which reaches about 3 m out from its trunk at Stage 3.
  for (const [k, grove] of groves.entries()) {
    const p = by(grove, -Math.PI / 4)
    if (!p) continue
    taken.push(p)
    kit.stand(p.x, p.y, 2.2, 1, p.a - Math.PI / 2, k ? 3 : 2)
    kit.lot(lot++)
    kit.from(k ? 3 : 2, () => kit.bench(p.x, p.y, ground, p.a - Math.PI / 2), spot(p.x, p.y))
  }
  // Picnic blankets: the first from Stage 2, the rest at Stage 3, each where it lands on open grass.
  const blankets: Vec[] = []
  const lay = mulberry32(spot(block.x0, block.y0))
  for (let tries = 0; blankets.length < (area(block.loop) >= PICNICS.big ? 3 : 2) && tries < 60; tries++) {
    const p = { x: block.x0 + lay() * (block.x1 - block.x0), y: block.y0 + lay() * (block.y1 - block.y0) }
    if (!clear(p, 3.8, PICNICS.room, 1.9) || taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < PICNICS.room + 1)) continue
    taken.push(p)
    const [ry, k] = [(lay() - 0.5) * 0.9, blankets.push(p) - 1]
    kit.stand(p.x, p.y, 2.8, 2.2, ry, k ? 3 : 2)
    kit.lot(lot++)
    kit.from(k ? 3 : 2, () => kit.blockZoomProps(() => blanket(kit, p.x, p.y, ground, ry, true, k === 1)), spot(p.x, p.y))
  }
  // A log pile by the second grove, from Stage 1, and beehives by the last, two from Stage 2 and a third at Stage 3, on
  // the side away from the default camera where there is room.
  const logs = by(groves[Math.min(1, groves.length - 1)] ?? middle(block), (3 * Math.PI) / 4)
  if (logs) {
    taken.push(logs)
    kit.stand(logs.x, logs.y, 1.8, 1.3, logs.a)
    kit.lot(lot++)
    kit.from(1, () => logPile(kit, logs.x, logs.y, ground, logs.a), spot(logs.x, logs.y))
  }
  const apiary = by(groves[groves.length - 1] ?? middle(block), Math.PI / 4)
  if (apiary) {
    taken.push(apiary)
    kit.stand(apiary.x, apiary.y, 3.2, 0.9, apiary.a - Math.PI / 2, 2)
    kit.lot(lot++)
    kit.staged(
      (stage) => {
        if (stage > 1) hives(kit, apiary.x, apiary.y, ground, apiary.a - Math.PI / 2, stage)
      },
      spot(apiary.x, apiary.y),
    )
  }
  // Tufts of tall grass, from Stage 1: along the meadow's edges, and either side of its stream.
  const lines: Vec[][] = runs(g, 2.7).map((run) => [run.a, { x: run.a.x + run.ux * run.len, y: run.a.y + run.uy * run.len }])
  if (stream) for (const side of [1, -1]) lines.push(aside(stream, side * (SHORE + 0.35)))
  for (const line of lines) {
    const along = polyline(line)
    const sow = mulberry32(spot(line[0].x, line[0].y) ^ 0x7f7)
    const spots: Vec[] = []
    for (let s = 1.5 + sow() * 2; s < along.length - 1; s += 4.5 + sow() * 2.5) {
      const i = Math.max(
        1,
        along.cum.findIndex((c) => c >= s),
      )
      const k = (s - along.cum[i - 1]) / (along.cum[i] - along.cum[i - 1] || 1)
      const q = { x: line[i - 1].x + (line[i].x - line[i - 1].x) * k, y: line[i - 1].y + (line[i].y - line[i - 1].y) * k }
      if (!kit.onGround(q.x, q.y, 2.2) || !kit.unclaimed(q.x, q.y, 0.9, 0.9, 0, 0.3)) continue
      if (
        kerbsideTrees.some((t) => Math.hypot(t.x - q.x, t.y - q.y) < 2.6) ||
        paths.some((path) => nearPath(path, q.x, q.y, PATH.wide / 2 + 0.6))
      )
        continue
      if (taken.some((t) => Math.hypot(t.x - q.x, t.y - q.y) < 2.4)) continue
      kit.stand(q.x, q.y, 0.8)
      spots.push(q)
    }
    if (!spots.length) continue
    kit.lot(lot++)
    kit.from(1, () => tufts(kit, spots, ground), spot(spots[0].x, spots[0].y))
  }
  // The dog, from Stage 2: it runs from blanket to blanket, where Stage 3 lays the rest, and waits a while at each.
  const run = dogRun(
    blankets,
    mulberry32(spot(block.x1, block.y0) ^ 0xd06),
    (q) =>
      kit.onGround(q.x, q.y, 3.4) &&
      trees.every((t) => Math.hypot(t.p.x - q.x, t.p.y - q.y) >= 1.3) &&
      all.every((b) => Math.abs(b.p.x - q.x) > b.w / 2 + 0.7 || Math.abs(b.p.y - q.y) > b.d / 2 + 0.7) &&
      (!pavilion || Math.hypot(pavilion.x - q.x, pavilion.y - q.y) >= 3.6) &&
      !scenes.some((s) => near(s.ground, q.x, q.y, 0.7)) &&
      !(stream && nearPath(stream, q.x, q.y, SHORE + 0.5)) &&
      taken.every((t) => Math.hypot(t.x - q.x, t.y - q.y) >= 2),
  )
  if (run) {
    kit.lot(lot++)
    kit.from(2, () => kit.mover('dog', run.loop, run.stops, 0, ground, { waits: run.waits, paint: run.paint }), spot(block.x1, block.y0))
  }
  // Drifts of wildflowers, the layers each Stage adds: each drift mostly of one colour, off the benches and blankets.
  for (const stage of [1, 2, 3]) {
    const n = Math.round((WILD.drifts[stage - 1] * area(block.loop)) / 1000)
    kit.lot(lot++)
    kit.from(
      stage,
      () => {
        const sow = mulberry32(spot(block.x0 + stage, block.y1))
        for (let d = 0; d < n; d++) {
          const c = { x: block.x0 + sow() * (block.x1 - block.x0), y: block.y0 + sow() * (block.y1 - block.y0) }
          const [main, count] = [WILD.colours[Math.floor(sow() * WILD.colours.length)], WILD.flowers[stage - 1]]
          let laid = 0
          for (let f = 0; f < count; f++) {
            const [a, r] = [sow() * TAU, Math.sqrt(sow()) * WILD.spread]
            const [colour, lift, turn] = [sow() < 0.8 ? main : WILD.colours[0], 0.08 + sow() * 0.14, sow() * TAU]
            const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
            if (!kit.onGround(p.x, p.y, WILD.clear) || taken.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < 2) || !off(p, 0.3)) continue
            kit.add(FLOWER, colour, p.x, p.y, ground + lift, turn)
            laid++
          }
          if (laid) kit.brick('tree', c.x, c.y, ground)
        }
      },
      spot(block.x0 + stage, block.y1),
    )
  }
  // Butterflies, each round a tour of the beds from one of them, from Stage 2 over Stage 2's beds and at Stage 3 over
  // all of them, alighting on each.
  const fleets: [number, Bed[]][] = [
    [2, beds],
    [3, all],
  ]
  for (const [stage, over] of fleets) {
    if (!over.length) continue
    const n = Math.min(BUTTERFLIES.most, Math.ceil(over.length / (stage === 2 ? BUTTERFLIES.two : BUTTERFLIES.three)))
    for (let k = 0; k < n; k++) {
      const from = over[(k * 2 + stage) % over.length]
      kit.lot(lot++)
      kit.from(
        stage,
        () => {
          const plan = flutter(over, from, mulberry32(spot(from.p.x + k, from.p.y + stage)))
          kit.mover('butterfly', plan.loop, plan.stops, 0, ground + 0.5, { waits: plan.waits, paint: plan.paint })
        },
        spot(from.p.x + k, from.p.y + stage),
      )
    }
  }
  kit.lot(-1)
}

/**
 * The dog's run between the picnic blankets at `blankets` (#182), drawn from `draw`: a stop beside each, a leg from each
 * to the next where `ok` has every point of it, straight or round by one side, and back the way it came; with one
 * blanket, or no leg between them, out over the grass and back. Null where it has nowhere to run.
 */
function dogRun(blankets: Vec[], draw: () => number, ok: (q: Vec) => boolean) {
  const line = (a: Vec, b: Vec): Vec[] => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5))
    return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }))
  }
  const leg = (a: Vec, b: Vec): Vec[] | null => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    for (const round of [0, 3, -3, 6, -6]) {
      const m = { x: (a.x + b.x) / 2 - ((b.y - a.y) / len) * round, y: (a.y + b.y) / 2 + ((b.x - a.x) / len) * round }
      const pts = round ? [...line(a, m), ...line(m, b).slice(1)] : line(a, b)
      if (pts.every(ok)) return pts
    }
    return null
  }
  const ring = (c: Vec, r: number, from: number) =>
    Array.from({ length: 8 }, (_, k) => ({ x: c.x + Math.cos(from + (k * TAU) / 8) * r, y: c.y + Math.sin(from + (k * TAU) / 8) * r }))
  const turn = draw() * TAU
  const beside = blankets.map((c) => ring(c, 2.3, turn).find(ok)).filter((p) => !!p)
  if (!beside.length) return null
  const [pts, at] = [[beside[0]], [0]] // the way out, and where along it each stop lies
  for (const next of beside.slice(1)) {
    const way = leg(pts[pts.length - 1], next)
    if (!way) continue
    pts.push(...way.slice(1))
    at.push(pts.length - 1)
  }
  if (at.length === 1) {
    const way = [9, 6]
      .flatMap((r) => ring(beside[0], r, turn))
      .map((p) => leg(beside[0], p))
      .find((w) => !!w)
    if (!way) return null
    pts.push(...way.slice(1))
    at.push(pts.length - 1)
  }
  const loop = polyline([...pts, ...pts.slice(0, -1).reverse()])
  const stops = at.map((i) => loop.cum[i])
  return { loop, stops, waits: stops.map(() => 4 + draw() * 7), paint: FINISH.coats[Math.floor(draw() * FINISH.coats.length)] }
}

/**
 * A butterfly's round over the beds `beds` (#152): from `first` to the nearest bed it has not visited, and on, weaving
 * either side of its way, and back to `first`; it alights on each bed, somewhere on it, and rests there a while. On one
 * bed alone, it flies out over the grass and back.
 */
function flutter(beds: Bed[], first: Bed, draw: () => number): { loop: Polyline; stops: number[]; waits: number[]; paint: string } {
  const order = [first]
  while (order.length < beds.length) {
    const at = order[order.length - 1].p
    const next = beds
      .filter((b) => !order.includes(b))
      .sort((u, v) => Math.hypot(u.p.x - at.x, u.p.y - at.y) - Math.hypot(v.p.x - at.x, v.p.y - at.y))[0]
    order.push(next)
  }
  const lands = order.map((b) => ({ x: b.p.x + (draw() - 0.5) * (b.w - 1), y: b.p.y + (draw() - 0.5) * (b.d - 0.8) }))
  if (lands.length === 1) {
    const a = draw() * TAU
    lands.push({ x: lands[0].x + Math.cos(a) * 5, y: lands[0].y + Math.sin(a) * 5 })
  }
  const [pts, starts] = [[] as Vec[], [] as number[]] // the points, and where each landing's stretch starts among them
  const { weave, wave } = BUTTERFLIES
  lands.forEach((a, i) => {
    starts.push(pts.length)
    const b = lands[(i + 1) % lands.length]
    const [len, phase] = [Math.hypot(b.x - a.x, b.y - a.y), draw() * TAU]
    const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
    const n = Math.max(2, Math.ceil(len / 0.5))
    for (let j = 0; j < n; j++) {
      const t = j / n
      const side = weave * Math.sin((TAU * t * len) / wave + phase) * Math.sin(Math.PI * t)
      pts.push({ x: a.x + ux * len * t - uy * side, y: a.y + uy * len * t + ux * side })
    }
  })
  pts.push(lands[0])
  const loop = polyline(pts)
  // A stop on each bed: on one bed alone, not where it turns back over the grass.
  const stops = starts.slice(0, order.length).map((i) => loop.cum[i])
  const [lo, hi] = BUTTERFLIES.rest
  return {
    loop,
    stops,
    waits: stops.map(() => lo + draw() * (hi - lo)),
    paint: BUTTERFLIES.paints[Math.floor(draw() * BUTTERFLIES.paints.length)],
  }
}

/** An allotments' plot: where, what its roll made it, the seed of its own stream, and the lot it stands on. */
interface Plot {
  x: number
  y: number
  roll: number
  seed: number
  lot: number
}
/** The scenes allotments pick from (#182), each on a plot's ground. */
type AllotmentScene = 'gardener' | 'apiary'
type AllotmentGround = Scene<AllotmentScene> & { plot: Plot }
/** An allotments' fence (#182): m in from the Block's edge, how thick its ground, how tall its posts, and how wide its gate. */
const FENCE = { in: 1.9, thick: 0.3, tall: 1, gate: 2.4 }

/**
 * An allotments Block: trodden earth cut into plots on a grid, each bare soil with rows of crops or flowers, a shed, or
 * nothing, where it stands clear of the street trees. Each plot is a brick and a lot. Its details (#152): a scarecrow,
 * water butts and cold frames, each on the lot of its plot. With the Stage:
 * - Stage 1: half the plots still bare, shorter crops, and no sheds; a scarecrow on half the Blocks.
 * - Stage 2: as above; a scarecrow on every Block, a water butt by each shed, and cold frames on some plots.
 * - Stage 3: every plot worked, taller crops, and beans climbing canes on some; a second scarecrow on a big Block, and
 *   cold frames on twice as many plots.
 * Built to the Finish (#182): the earth is trodden paths between plots of furrowed soil, a fence runs round the Block
 * with a gate on a Road (`fence`), its scenes each take a plot (`allotmentScenes`), another by the gate is its yard, with
 * compost bins, a wheelbarrow and a hose reel (`yard`), and from Stage 2 butterflies work its flowers.
 */
function allotments(g: ZoneGround) {
  const { kit, field, block, kerbsideTrees } = g
  overlay(kit, field, block, 1.6, 0.12, EARTH, PATTERN.gravel)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + 0.12
  const { w, d, path } = ALLOTMENT
  const plots: Plot[] = []
  for (let x = block.x0 + 3 + w / 2; x + w / 2 <= block.x1 - 3; x += w + path) {
    for (let y = block.y0 + 3 + d / 2; y + d / 2 <= block.y1 - 3; y += d + path) {
      const edges = [-1, 1].flatMap((i) => [-1, 1].map((j) => field.sample(x + (i * w) / 2, y + (j * d) / 2)))
      if (Math.min(...edges) < 1.8 || !inside(block.loop, x, y) || !clearOf(kerbsideTrees, x, y, w, d, 0.8)) continue
      // Its roll, and the seed of its own stream, which `staged` would draw here.
      const [roll, seed] = [kit.range(0, 1), (kit.range(0, 1) * 4294967296) >>> 0]
      plots.push({ x, y, roll, seed, lot: plots.length })
    }
  }
  // To the Finish, on a stream of the Block's own: the fence and its gate, the scenes' plots, and the yard's, by the gate.
  const draw = mulberry32(spot(mid.x, mid.y) ^ 0xa110)
  const gate = fence(g, ground, draw)
  const scenes = allotmentScenes(g, draw, plots)
  const given = new Set(scenes.map((s) => s.plot))
  const by = gate ?? mid
  const service =
    plots.length - given.size >= 4
      ? plots.filter((p) => !given.has(p)).sort((u, v) => Math.hypot(u.x - by.x, u.y - by.y) - Math.hypot(v.x - by.x, v.y - by.y))[0]
      : null
  if (service) given.add(service)
  /** A plot's soil at `(x, y)`, furrowed where the kit builds patterned. */
  const soil = (x: number, y: number) => {
    const box = kit.box(w, 0.22, d, 0.3, 0.06)
    kit.laid((box.index ? box.toNonIndexed() : box.clone()).translate(x, ground, -y), SOIL, PATTERN.soil)
  }
  // Which plots carry a detail (#152), each drawn from where the plot lies: a scarecrow in a plot of crops worked from
  // Stage 1, the one nearest the Block's middle, and at Stage 3 a second, farthest from it, on a big Block; cold frames
  // over the back row of some plots of crops or flowers, facing south, which no scarecrow stands in.
  const early = plots.filter((p) => p.roll >= 0.14 && p.roll < 0.5 && !given.has(p))
  const nearest = (to: Vec, sign: number) =>
    early.slice().sort((u, v) => sign * (Math.hypot(u.x - to.x, u.y - to.y) - Math.hypot(v.x - to.x, v.y - to.y)))[0]
  const scared = new Map<Plot, number>() // plot → the first Stage it has a scarecrow
  const first = nearest(mid, 1)
  if (first) scared.set(first, mulberry32(spot(first.x, first.y))() < ALLOTTED.early ? 1 : 2)
  if (first && plots.length >= ALLOTTED.second) {
    const second = nearest(first, -1)
    if (second && second !== first) scared.set(second, 3)
  }
  for (const plot of plots) {
    const { x, y, roll, seed } = plot
    kit.lot(plot.lot)
    if (given.has(plot)) continue
    // The first Stage the plot has cold frames, drawn from where it lies; none on a shed's plot or a scarecrow's.
    const frames = mulberry32(spot(x, y) ^ 0x5bd1e995)()
    const framed = scared.has(plot) || roll < 0.14 ? 0 : frames < ALLOTTED.frames[0] ? 2 : frames < ALLOTTED.frames[1] ? 3 : 0
    kit.stand(x, y, w, d)
    kit.staged((stage) => {
      soil(x, y)
      const tall = [0.3, 0.5, 0.62][stage - 1]
      if (roll < 0.14) {
        if (stage > 1) {
          kit.add(kit.box(2.4, 2.2, 2, 0.12, 0.06), SHED, x + w / 2 - 1.7, y, ground + 0.22)
          kit.add(kit.box(2.8, 0.3, 2.4, 0.12, 0.06), SHED_ROOF, x + w / 2 - 1.7, y, ground + 2.42)
        }
        kit.add(kit.box(w - 3.6, tall, d - 1.2, 0.3, 0.12), kit.pick(CROPS), x - 1.4, y, ground + 0.22)
      } else if ((stage > 1 || roll < 0.5) && (roll < 0.86 || stage === 3)) {
        const colours = roll < 0.64 || roll >= 0.86 ? CROPS : BLOOMS
        for (let r = 0; r < 3; r++) {
          const colour = kit.pick(colours)
          // Under cold frames from their Stage, the back row is drawn but not grown (#152).
          if (r === 2 && framed && stage >= framed) continue
          kit.add(kit.cuboid(w - 0.9, tall, 0.7), colour, x, y - d / 2 + 0.9 + r * 1.4, ground + 0.22)
        }
        if (stage === 3 && roll < 0.36) {
          // Beans up a row of canes, over the first row.
          const row = y - d / 2 + 0.9
          kit.add(kit.cuboid(w - 1.6, 1.5, 0.34), BEANS, x, row, ground + 0.22)
          for (const k of [-1, 1]) kit.add(kit.cuboid(0.1, 1.9, 0.1), CANES, x + k * (w / 2 - 0.7), row, ground + 0.22)
        }
      }
      kit.brick('tree', x, y, ground)
    }, seed)
    // Its details (#152): a water butt at the front corner of a shed, from Stage 2 as the shed; cold frames; a scarecrow.
    if (roll < 0.14)
      kit.from(2, () => kit.blockZoomProps(() => waterButt(kit, x + w / 2 - 0.95, y - d / 2 + 0.62, ground + 0.22)), spot(x + 1, y))
    if (framed) kit.from(framed, () => coldFrames(kit, x, y + d / 2 - 0.9, ground + 0.22, Math.PI, w - 1.2), spot(x, y + 1))
    const scare = scared.get(plot)
    if (scare) {
      const turn = (mulberry32(spot(x, y))() - 0.5) * 0.6
      kit.from(scare, () => kit.scarecrow(x + (spot(x, y) % 2 ? 1 : -1) * 1.2, y + 0.7, ground + 0.22, turn), spot(x, y - 1))
    }
  }
  kit.lot(-1)
  for (const { kind, ground: l, from } of scenes) {
    kit.stand(l.x, l.y, l.w, l.d, l.ry, from)
    kit.scene(kind, () =>
      kit.staged(
        (stage) => {
          // Bare soil until its Stage, as the plots not yet worked are.
          soil(l.x, l.y)
          kit.brick('ground', l.x, l.y, ground)
          if (stage >= from) ({ gardener, apiary })[kind](kit, l, stage, ground + 0.22)
        },
        spot(l.x, l.y),
      ),
    )
  }
  if (service) {
    kit.stand(service.x, service.y, w, d)
    kit.staged((stage) => yard(kit, service.x, service.y, ground, stage), spot(service.x, service.y))
  }
  // Butterflies from Stage 2 (#182): one, or two over seven plots or more, each round the four plots nearest its own, of
  // those in flower, or of the crops where none is.
  const grown = plots.filter((p) => !given.has(p) && p.roll >= 0.14 && p.roll < 0.86)
  const flowers = grown.filter((p) => p.roll >= 0.64)
  const over = (flowers.length ? flowers : grown).map((p): Bed => ({ p: { x: p.x, y: p.y }, w: w - 0.9, d: d - 1.4, colour: '' }))
  for (let k = 0; k < Math.min(over.length, over.length >= 7 ? 2 : 1); k++) {
    const from = over[(k * 3) % over.length]
    const tour = over
      .slice()
      .sort((u, v) => Math.hypot(u.p.x - from.p.x, u.p.y - from.p.y) - Math.hypot(v.p.x - from.p.x, v.p.y - from.p.y))
      .slice(0, 4)
    const seed = spot(from.p.x + k, from.p.y + 2)
    kit.from(
      2,
      () => {
        const plan = flutter(tour, from, mulberry32(seed))
        kit.mover('butterfly', plan.loop, plan.stops, 0, ground + 0.9, { waits: plan.waits, paint: plan.paint })
      },
      seed,
    )
  }
}

/**
 * An allotments' scenes (#182), drawn from `draw`: from Stage 2 one, a gardener at work by a glasshouse or an apiary, and
 * the other at Stage 3 on 2,500 m² or more, each on the ground of a plot near the Block's middle, its front to the
 * south, and the second 16 m from the first where a plot lies so far.
 */
function allotmentScenes(g: ZoneGround, draw: () => number, plots: Plot[]): AllotmentGround[] {
  const kinds: AllotmentScene[] = ['gardener', 'apiary']
  const order = sceneOrder(g, draw, kinds, SCENES.second)
  const mid = middle(g.block)
  const inward = plots.slice().sort((u, v) => Math.hypot(u.x - mid.x, u.y - mid.y) - Math.hypot(v.x - mid.x, v.y - mid.y))
  const shift = Math.floor(draw() * Math.min(4, inward.length))
  const tried = [...inward.slice(shift), ...inward.slice(0, shift)]
  return placeScenes<AllotmentScene, AllotmentGround>(order, kinds, (_kind, out) => {
    const free = tried.filter((p) => !out.some((o) => o.plot === p))
    const plot = free.find((p) => !out.some((o) => Math.hypot(o.plot.x - p.x, o.plot.y - p.y) < SCENES.apart)) ?? free[0]
    return plot ? { plot, ground: { x: plot.x, y: plot.y, w: ALLOTMENT.w, d: ALLOTMENT.d, ry: Math.PI, onRoad: false } } : null
  })
}

/**
 * An allotments' fence (#182), `FENCE.in` m in from the Block's edge on every side, on the earth `h` up: posts and a
 * rail, two rails from Stage 2, open round each lamp, pole and street tree, with a gate at the middle of a run on a
 * Road, drawn from `draw`: two taller posts and a leaf ajar, and from Stage 2 a bar over it and a lantern on a post,
 * lit at night. Gives where the gate stands, if it has one.
 */
function fence(g: ZoneGround, h: number, draw: () => number): Vec | null {
  const { kit } = g
  const all = runs(g, FENCE.in)
  const onRoad = all.filter((r) => facesRoad(r) && r.len > FENCE.gate + 4)
  const gated = onRoad[Math.floor(draw() * onRoad.length)]
  let gate: Vec | null = null
  for (const run of all) {
    const turn = Math.atan2(run.uy, run.ux)
    const at = (s: number, out = 0): [number, number] => [run.a.x + run.ux * s + run.nx * out, run.a.y + run.uy * s + run.ny * out]
    const half = run.len / 2
    const gap = run === gated && kit.unclaimed(...at(half), FENCE.gate + 0.4, 0.6, run.ry)
    if (gap) {
      const [x, y] = at(half)
      gate = { x, y }
      kit.stand(x, y, FENCE.gate + 0.4, 0.5, run.ry)
      kit.staged(
        (stage) => {
          for (const side of [-1, 1]) kit.add(kit.cuboid(0.18, 1.7, 0.18), FINISH.post, ...at(half + (side * FENCE.gate) / 2), h, turn)
          const hinge = at(half - FENCE.gate / 2 + 0.1)
          kit.add(kit.cuboid(1.1, 0.8, 0.06).clone().translate(0.55, 0, 0), FINISH.fence, ...hinge, h + 0.15, turn + 0.7)
          if (stage > 1) {
            kit.add(kit.cuboid(FENCE.gate + 0.5, 0.12, 0.14), FINISH.post, ...at(half), h + 1.7, turn)
            const lamp = at(half + FENCE.gate / 2)
            kit.add(kit.cuboid(0.28, 0.32, 0.28), kit.lit(CREAM, GLOWS.low), ...lamp, h + 1.82)
            kit.pool('cream', ...lamp, h, 3.4, 3.4)
          }
          kit.brick('building', x, y, h)
        },
        spot(x, y),
      )
    }
    /** Each length cut back to where both its ends stand on the Block. */
    const onBlock = (lengths: [number, number][]) =>
      lengths
        .map(([a, b]): [number, number] => {
          while (a < b && !kit.onGround(...at(a), 0.3)) a += 0.4
          while (a < b && !kit.onGround(...at(b), 0.3)) b -= 0.4
          return [a, b]
        })
        .filter(([a, b]) => b - a >= 1.2)
    const lengths = onBlock(borderLengths(g, run, FENCE.thick, gap ? [[half - FENCE.gate / 2 - 0.2, half + FENCE.gate / 2 + 0.2]] : []))
    if (!lengths.length) continue
    const start = at(lengths[0][0])
    kit.staged(
      (stage) => {
        for (const [a, b] of lengths) {
          for (const lift of stage === 1 ? [0.7] : [0.4, 0.8])
            kit.add(kit.cuboid(1, 0.09, 0.06), FINISH.fence, ...at((a + b) / 2), h + lift, turn, b - a)
          const n = Math.max(1, Math.round((b - a) / 2))
          for (let k = 0; k <= n; k++) kit.add(kit.cuboid(0.13, FENCE.tall, 0.13), FINISH.post, ...at(a + ((b - a) * k) / n), h, turn)
        }
        kit.brick('building', ...start, h)
      },
      spot(...start),
    )
  }
  return gate
}

// A picnic blanket's colours, its gingham's pale stripe and the basket (#152, #210); a parasol's pole is iron as a
// bench's ends are (the kit's `BENCH`).
const PICNIC = { blankets: ['#ffadc8', '#f6d36a', '#7fbf9d', '#c7b8f0', '#f0b43c'], stripe: '#fbf8f2', basket: '#c49a6c', lid: '#a1714c' }

/**
 * A picnic blanket laid at `(x, y)`, turned `ry`, as one brick (#152): gingham in one of the blankets' colours, with a
 * basket on it if `basket`, and a parasol over it in another colour if `parasol`. Oversized a little.
 */
function blanket(kit: Kit, x: number, y: number, h: number, ry: number, basket: boolean, parasol: boolean) {
  const [colour, shade] = [kit.pick(PICNIC.blankets), kit.pick(PICNIC.blankets)]
  kit.add(kit.cuboid(2.6, 0.04, 2), colour, x, y, h, ry)
  for (const k of [-1, 0, 1]) {
    kit.local(kit.cuboid(0.18, 0.012, 2), PICNIC.stripe, x, y, ry, k * 0.78, 0, h + 0.04)
    kit.local(kit.cuboid(2.6, 0.012, 0.18), PICNIC.stripe, x, y, ry, 0, k * 0.6, h + 0.04)
  }
  if (basket) {
    kit.local(kit.cuboid(0.62, 0.36, 0.42), PICNIC.basket, x, y, ry, 0.72, 0.5, h + 0.04)
    kit.local(kit.cuboid(0.66, 0.05, 0.46), PICNIC.lid, x, y, ry, 0.72, 0.5, h + 0.4)
    for (const k of [-1, 1]) kit.local(kit.cuboid(0.04, 0.26, 0.04), PICNIC.lid, x, y, ry, 0.72 + k * 0.24, 0.5, h + 0.45)
    kit.local(kit.cuboid(0.52, 0.04, 0.04), PICNIC.lid, x, y, ry, 0.72, 0.5, h + 0.71)
  }
  if (parasol) {
    const [px, py] = to(x, y, ry, -0.95, 0.7)
    kit.add(kit.cuboid(0.06, 2.3, 0.06), BENCH.iron, px, py, h)
    kit.add(SHAPES.cone12, shade, px, py, h + 1.95, 0, 1.4, 0.5, 1.4)
    kit.shadow(px, py, h, 3, 3, true)
  }
  kit.brick('ground', x, y, h)
}

// A water butt and its lid; and a cold frame's painted base and its glass, painted pale as the greenhouses' film is: the
// kit's glass would add a mesh to every green build, which never draws it (#152).
const BUTT = { body: '#4f8a6e', lid: '#3d6d57' }
const FRAME = { base: '#f4f1ea', glass: '#d6ece6' }
/** A cold frame's glass (#152): a box 1 m across, 1 m deep and 0.36 m tall at its back, its top sloping to 0.14 m at its front (-z). */
const LIGHT = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed()
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.5) pos.setY(i, pos.getZ(i) < 0 ? 0.14 : 0.36)
  g.computeVertexNormals()
  return g
})()

/** A water butt at `(x, y)`, as one brick that drops in (#152): a green barrel under a darker lid, oversized a little. */
function waterButt(kit: Kit, x: number, y: number, h: number) {
  kit.add(SHAPES.cylinder, BUTT.body, x, y, h, 0, 0.42, 1.1, 0.42)
  kit.add(SHAPES.cylinder, BUTT.lid, x, y, h + 1.1, 0, 0.45, 0.07, 0.45)
  kit.shadow(x, y, h, 1.3, 1.3, true)
  kit.brick('building', x, y, h)
}

/**
 * Cold frames in a row `w` m long at `(x, y)`, their fronts facing `ry`, as one brick that drops in (#152): glass
 * lights 1.1 m deep, sloping down to the front, on a low painted base, one to every 1.3 m or so.
 */
function coldFrames(kit: Kit, x: number, y: number, h: number, ry: number, w: number) {
  const n = Math.max(1, Math.round(w / 1.3))
  const each = w / n
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + (k + 0.5) * each
    kit.put(kit.cuboid(each - 0.08, 0.24, 1.1), FRAME.base, x, y, ry, lx, 0, h)
    kit.add(LIGHT, FRAME.glass, ...to(x, y, ry, lx, 0), h + 0.24, ry, each - 0.14, 1, 1.1)
  }
  kit.shadow(x, y, h, w + 1, 2, true, ry) // round, as a scarecrow's or a water butt's: allotments draw no other shadow
  kit.brick('building', x, y, h)
}

/**
 * A meadow's bed of flowers (#182), on the grass `h` up, as a brick: soil, and rows of leaves along it, each topped
 * with flowers in the bed's colour, or cream on every third row.
 */
function bed(kit: Kit, { p, w, d, colour }: Bed, h: number) {
  const draw = mulberry32(spot(p.x, p.y) ^ 0xbed)
  kit.add(kit.cuboid(1, 0.14, 1), SOIL, p.x, p.y, h, 0, w, 1, d)
  const rows = Math.max(2, Math.round(d / 0.7))
  for (let r = 0; r < rows; r++) {
    const y = p.y - d / 2 + ((r + 0.5) * d) / rows
    kit.add(kit.cuboid(1, 0.3, 0.34), FINISH.rows, p.x, y, h + 0.14, 0, w - 0.5)
    for (let x = p.x - w / 2 + 0.5 + (r % 2) * 0.22; x < p.x + w / 2 - 0.4; x += 0.48)
      kit.add(FLOWER, r % 3 === 1 ? BEDS[3] : colour, x, y + (draw() - 0.5) * 0.1, h + 0.46, draw() * TAU)
  }
  kit.brick('tree', p.x, p.y, h)
}

/** A meadow's stream along its middle line `pts` (#182), on the grass `h` up, as one brick: its banks, and its water over them. */
function streamBed(kit: Kit, pts: Vec[], h: number) {
  kit.push(ribbons([pts], 2 * SHORE, h + 0.02), FINISH.bank)
  kit.push(ribbons([pts], STREAM.wide, h + 0.035), kit.water)
  // A round pool at each end, where it rises and where it sinks away.
  for (const p of [pts[0], pts[pts.length - 1]]) {
    kit.drum(FINISH.bank, p.x, p.y, h, SHORE + 0.5, SHORE + 0.5, 0.02)
    kit.drum(kit.water, p.x, p.y, h, SHORE + 0.15, SHORE + 0.15, 0.035)
  }
  kit.brick('ground', pts[0].x, pts[0].y, h)
}

/** A meadow's worn path along its middle line `pts` (#182), on the grass `h` up, as one brick: trodden earth. */
function dirtPath(kit: Kit, pts: Vec[], h: number) {
  kit.laid(ribbons([pts], PATH.wide, h + 0.012), FINISH.dirt, PATTERN.gravel)
  kit.brick('ground', pts[0].x, pts[0].y, h)
}

/** A plank bridge over a stream at `(x, y)`, its way along a front facing `ry` (#182), as one brick: planks on two beams. */
function plankBridge(kit: Kit, x: number, y: number, ry: number, h: number) {
  const long = 2 * SHORE + 1
  for (const side of [-0.55, 0.55]) kit.put(kit.cuboid(0.14, 0.2, long), WOOD.dark, x, y, ry, side, 0, h)
  const n = Math.round(long / 0.42)
  for (let k = 0; k < n; k++)
    kit.put(kit.cuboid(1.5, 0.07, 0.34), k % 2 ? WOOD.stand : WOOD.pale, x, y, ry, 0, -long / 2 + (k + 0.5) * (long / n), h + 0.2)
  kit.brick('ground', x, y, h)
}

/** Tufts of tall grass at `spots` (#182), on the grass `h` up, as one brick of Block-zoom props: blades, and a seed head to each. */
function tufts(kit: Kit, spots: Vec[], h: number) {
  kit.blockZoomProps(() => {
    for (const { x, y } of spots) {
      const draw = mulberry32(spot(x, y) ^ 0x7f7)
      for (let i = 0; i < 4; i++) {
        const [a, r, tall] = [draw() * TAU, draw() * 0.3, 0.6 + draw() * 0.5]
        const [bx, by] = [x + Math.cos(a) * r, y + Math.sin(a) * r]
        kit.add(SHAPES.cone, FINISH.tufts[i % 3], bx, by, h, 0, 0.11, tall, 0.11)
        if (!i) kit.add(SHAPES.thin, FINISH.heads, bx, by, h + tall * 0.7, 0, 0.05, 0.3, 0.05)
      }
    }
    kit.brick('tree', spots[0].x, spots[0].y, h)
  })
}

/** A log 1.5 m long, lying along x on y = 0. */
const LOG = new THREE.CylinderGeometry(0.17, 0.17, 1.5, 7).rotateZ(Math.PI / 2).translate(0, 0.17, 0)

/** A pile of logs at `(x, y)`, lying along `ry`'s right (#182), as one brick of Block-zoom props: three, two on them and one on top. */
function logPile(kit: Kit, x: number, y: number, h: number, ry: number) {
  kit.blockZoomProps(() => {
    const rows = [[-0.36, 0, 0.36], [-0.18, 0.18], [0]]
    rows.forEach((row, j) =>
      row.forEach((out, i) => kit.put(LOG, FINISH.logs[(i + j) % FINISH.logs.length], x, y, ry, 0, out, h + j * 0.3)),
    )
    kit.shadow(x, y, h, 2.2, 1.8, true)
    kit.brick('building', x, y, h)
  })
}

/** A beehive at `(x, y)` facing `ry`, `h` up (#182): boxes in pale paints, the `k`-th of its row, under a lid, on a stand if `stood`. */
function hive(kit: Kit, x: number, y: number, h: number, ry: number, k: number, stood = true) {
  if (stood) kit.add(kit.cuboid(0.5, 0.22, 0.5), FINISH.post, x, y, h, ry)
  const [base, boxes] = [h + (stood ? 0.22 : 0), 2 + (k % 2)]
  for (let j = 0; j < boxes; j++)
    kit.add(kit.cuboid(0.56, 0.3, 0.56), FINISH.hives[(k + j) % FINISH.hives.length], x, y, base + j * 0.31, ry)
  kit.add(kit.cuboid(0.66, 0.08, 0.66), FINISH.lid, x, y, base + boxes * 0.31, ry)
}

/** Beehives in a row at `(x, y)` along `ry`'s right (#182), as one brick of Block-zoom props: two, and a third at Stage 3. */
function hives(kit: Kit, x: number, y: number, h: number, ry: number, stage: number) {
  kit.blockZoomProps(() => {
    for (let k = 0; k < stage; k++) hive(kit, ...to(x, y, ry, (k - 1) * 0.95, 0), h, ry, k)
    kit.shadow(x, y, h, 3.4, 1.6, true, ry)
    kit.brick('building', x, y, h)
  })
}

/**
 * A person standing at `(x, y)` facing `ry`, `h` up (#182), in the brick being built, `s` their size (a child's under
 * 1): legs, a shirt in `shirt`, a head, and a straw hat if `hat`.
 */
function person(kit: Kit, x: number, y: number, h: number, ry: number, shirt: string, hat = true, s = 1) {
  kit.add(kit.cuboid(0.34, 0.8, 0.26), FINISH.legs, x, y, h, ry, s, s, s)
  kit.add(kit.cuboid(0.46, 0.62, 0.3), shirt, x, y, h + 0.8 * s, ry, s, s, s)
  kit.add(SHAPES.sphere, FINISH.skin, x, y, h + 1.62 * s, 0, 0.19 * s, 0.2 * s, 0.19 * s)
  if (!hat) return
  kit.add(SHAPES.cylinder, FINISH.straw, x, y, h + 1.74 * s, 0, 0.36 * s, 0.04 * s, 0.36 * s)
  kit.add(SHAPES.cone, FINISH.straw, x, y, h + 1.76 * s, 0, 0.2 * s, 0.2 * s, 0.2 * s)
}

/**
 * A kite flown from a rise on its ground `l` (#182), the grass `h` up, as one brick: a mown mound, a flyer on its top
 * facing downwind, and their kite on its string, which swings on the wind through the working day and is taken in for
 * the night; at Stage 3 a child beside them flies a second.
 */
function kiteRise(kit: Kit, l: RowLot, stage: number, h: number) {
  const draw = mulberry32(spot(l.x, l.y) ^ 0x417e)
  const pick = (from: string[]) => from[Math.floor(draw() * from.length)]
  const [r, tall] = [Math.min(l.w, l.d) / 2 - 0.3, 1.1]
  kit.add(SHAPES.sphere, FINISH.rise, l.x, l.y, h - 0.04, 0, r, tall, r)
  const ry = Math.atan2(-WIND.x, WIND.y) // a front that looks downwind
  const flyers = [
    [0, 0, 1],
    [1.5, -0.8, 0.72],
  ].slice(0, stage === 3 ? 2 : 1)
  for (const [k, [lx, ly, s]] of flyers.entries()) {
    const [x, y] = to(l.x, l.y, ry, lx, ly)
    const up = h - 0.08 + tall * Math.sqrt(1 - (lx * lx + ly * ly) / (r * r))
    person(kit, x, y, up, ry, pick(FINISH.shirts), !k, s)
    kit.sway('kite', ...to(x, y, ry, 0.3 * s, 0.2), up + 1.45 * s, ry, {
      paint: pick(FINISH.kites),
      ...(k && { size: [0.7, 0.7] as [number, number] }),
    })
  }
  kit.shadow(l.x, l.y, h, 2 * r + 0.8, 2 * r + 0.8, true)
  kit.brick('tree', l.x, l.y, h)
}

/**
 * A campsite on its ground `l` (#182), facing its front, the grass `h` up, as one brick: a ridge tent on a groundsheet,
 * its canvas lit from inside at night and leaving its light round it, a fire in a ring of stones whose embers glow and
 * smoke, a log to sit on and a camper; at Stage 3 a second, smaller tent.
 */
function campsite(kit: Kit, l: RowLot, stage: number, h: number) {
  const draw = mulberry32(spot(l.x, l.y) ^ 0xca4b)
  const first = Math.floor(draw() * FINISH.tents.length)
  const tent = (lx: number, ly: number, long: number, wide: number, tall: number, colour: string, turn: number) => {
    const [x, y] = to(l.x, l.y, l.ry, lx, ly)
    const ry = l.ry + turn
    kit.add(kit.cuboid(wide + 0.3, 0.05, long + 0.3), FINISH.door, x, y, h, ry)
    kit.add(kit.gable(long, wide, tall), kit.lit(colour, GLOWS.band), x, y, h + 0.05, ry)
    kit.put(kit.cuboid(wide * 0.3, tall * 0.7, 0.05), FINISH.door, x, y, ry, 0, long / 2 + 0.13, h + 0.05)
    kit.add(kit.cuboid(0.1, 0.06, long + 0.4), FINISH.door, x, y, h + tall + 0.1, ry)
    kit.pool('cream', x, y, h, wide + 2.6, long + 2.6, ry)
  }
  tent(-(l.w / 2 - 1.9), -(l.d / 2 - 2.6), 4.5, 2.9, 1.9, FINISH.tents[first], 0)
  if (stage === 3) tent(l.w / 2 - 1.5, -(l.d / 2 - 1.7), 2.6, 1.9, 1.25, FINISH.tents[(first + 1) % FINISH.tents.length], 0.4)
  const [fx, fy] = to(l.x, l.y, l.ry, l.w / 2 - 1.8, l.d / 2 - 1.9)
  kit.add(SHAPES.cylinder, FINISH.stones, fx, fy, h, 0, 0.55, 0.16, 0.55)
  kit.add(SHAPES.cone, kit.lit(FINISH.ember, GLOWS.low), fx, fy, h + 0.12, 0, 0.3, 0.42, 0.3)
  kit.pool('amber', fx, fy, h, 3.4, 3.4)
  kit.steam(fx, fy, h + 0.6)
  kit.put(kit.cuboid(1.3, 0.34, 0.36), FINISH.logs[0], l.x, l.y, l.ry, l.w / 2 - 1.8, l.d / 2 - 0.6, h)
  person(kit, ...to(l.x, l.y, l.ry, l.w / 2 - 3, l.d / 2 - 1.5), h, l.ry - Math.PI / 2, FINISH.shirts[first], false)
  kit.shadow(...to(l.x, l.y, l.ry, -(l.w / 2 - 1.9), -(l.d / 2 - 2.6)), h, 4.2, 5.6, true)
  kit.brick('tree', l.x, l.y, h)
}

/** A wheelbarrow at `(x, y)` facing `ry`, `h` up (#182), in the brick being built: a tray on a wheel and two legs, its handles behind. */
function wheelbarrow(kit: Kit, x: number, y: number, h: number, ry: number) {
  kit.put(kit.cuboid(0.62, 0.3, 0.9), FINISH.barrow, x, y, ry, 0, 0, h + 0.32)
  kit.put(kit.cuboid(0.1, 0.36, 0.36), FINISH.legs, x, y, ry, 0, 0.55, h)
  for (const side of [-0.26, 0.26]) {
    kit.put(kit.cuboid(0.05, 0.32, 0.05), FINISH.legs, x, y, ry, side, -0.3, h)
    kit.put(kit.cuboid(0.05, 0.05, 0.7), WOOD.stand, x, y, ry, side, -0.75, h + 0.5)
  }
}

/**
 * A gardener at work on their plot `l` (#182), its soil `h` up, as one brick: a glasshouse along its back on a pale
 * base, its panes lit at night and leaving their light round it; before it a row of seedlings, the gardener with a
 * spade, and a wheelbarrow; at Stage 3 its glazing bars and a second row.
 */
function gardener(kit: Kit, l: RowLot, stage: number, h: number) {
  const put = (geo: THREE.BufferGeometry, look: Parameters<Kit['add']>[1], lx: number, ly: number, z: number) =>
    kit.put(geo, look, l.x, l.y, l.ry, lx, ly, z)
  const [gx, gy, long, wide] = [-0.7, -0.95, 4.4, 2.1]
  const panes = kit.lit(FINISH.panes, GLOWS.band)
  put(kit.cuboid(long, 0.35, wide), FINISH.frame, gx, gy, h)
  put(kit.cuboid(long - 0.1, 1.3, wide - 0.1), panes, gx, gy, h + 0.35)
  kit.add(kit.gable(long - 0.24, wide, 0.75), panes, ...to(l.x, l.y, l.ry, gx, gy), h + 1.65, l.ry + Math.PI / 2)
  put(kit.cuboid(long + 0.1, 0.07, 0.07), FINISH.frame, gx, gy, h + 2.44)
  for (const i of [-1, 1]) {
    put(kit.cuboid(long + 0.1, 0.07, 0.07), FINISH.frame, gx, gy + (i * wide) / 2, h + 1.62)
    for (const j of [-1, 1])
      put(kit.cuboid(0.08, 1.3, 0.08), FINISH.frame, gx + (i * (long - 0.1)) / 2, gy + (j * (wide - 0.1)) / 2, h + 0.35)
  }
  put(kit.cuboid(0.8, 1.45, 0.06), FINISH.frame, gx, gy + wide / 2, h + 0.1)
  if (stage === 3)
    for (const i of [-1.5, -0.5, 0.5, 1.5]) put(kit.cuboid(0.06, 1.3, 0.06), FINISH.frame, gx + i * 1.05, gy + wide / 2 - 0.02, h + 0.35)
  for (let row = 0; row < (stage === 3 ? 2 : 1); row++)
    for (let k = 0; k < 7; k++)
      put(SHAPES.bush.clone().scale(0.2, 0.2, 0.2), CROPS[(k + row) % CROPS.length], -2.6 + k * 0.6, 1.1 + row * 0.7, h)
  person(kit, ...to(l.x, l.y, l.ry, 2.1, 1.3), h, l.ry + Math.PI / 2, FINISH.shirts[spot(l.x, l.y) % FINISH.shirts.length])
  put(kit.cuboid(0.06, 1.15, 0.06), WOOD.dark, 1.7, 1.45, h)
  put(kit.cuboid(0.2, 0.26, 0.04), FINISH.lid, 1.7, 1.45, h)
  wheelbarrow(kit, ...to(l.x, l.y, l.ry, 2.5, -0.6), h, l.ry + 0.5)
  kit.pool('window', ...to(l.x, l.y, l.ry, gx, gy), h, long + 2.4, wide + 2.4, l.ry)
  kit.shadow(...to(l.x, l.y, l.ry, gx, gy), h, long + 1, wide + 1.4, true)
  kit.brick('building', l.x, l.y, h)
}

/**
 * An apiary on a plot `l` (#182), its soil `h` up, as one brick: four beehives on a long stand before a screen of
 * clipped green, a fifth at Stage 3, and a beekeeper in white under a veiled hat.
 */
function apiary(kit: Kit, l: RowLot, stage: number, h: number) {
  const put = (geo: THREE.BufferGeometry, look: string, lx: number, ly: number, z: number) => kit.put(geo, look, l.x, l.y, l.ry, lx, ly, z)
  put(kit.cuboid(5.6, 1.3, 0.5), CROPS[2], 0, -(l.d / 2 - 0.6), h)
  put(kit.cuboid(5, 0.1, 0.7), FINISH.fence, 0, -0.4, h + 0.3)
  for (const lx of [-2.2, 0, 2.2]) put(kit.cuboid(0.12, 0.3, 0.6), FINISH.post, lx, -0.4, h)
  const count = stage === 3 ? 5 : 4
  for (let k = 0; k < count; k++) hive(kit, ...to(l.x, l.y, l.ry, (k - (count - 1) / 2) * 1, -0.4), h + 0.4, l.ry, k, false)
  const [x, y] = to(l.x, l.y, l.ry, 1.6, 1.2)
  person(kit, x, y, h, l.ry + Math.PI, FINISH.veil)
  kit.add(SHAPES.cylinder, FINISH.veil, x, y, h + 1.42, 0, 0.3, 0.32, 0.3)
  kit.shadow(...to(l.x, l.y, l.ry, 0, -0.6), h, 6, 2.4, true)
  kit.brick('building', l.x, l.y, h)
}

/**
 * An allotments' yard on the earth of a plot at `(x, y)` (#182), `h` up, as Block-zoom props: a compost bin, and from
 * Stage 2 three in a row with a wheelbarrow before them and a hose reel on a post, its hose run out.
 */
function yard(kit: Kit, x: number, y: number, h: number, stage: number) {
  kit.blockZoomProps(() => {
    for (let k = 0; k < (stage > 1 ? 3 : 1); k++) {
      const bx = x - 1.8 + k * 1.25
      kit.add(kit.cuboid(1.15, 0.9, 1.15), FINISH.fence, bx, y + 1.2, h)
      kit.add(kit.cuboid(0.95, 0.06, 0.95), FINISH.compost, bx, y + 1.2, h + 0.9)
    }
    kit.brick('building', x - 0.55, y + 1.2, h)
    if (stage === 1) return
    wheelbarrow(kit, x - 0.4, y - 0.8, h, 0.6)
    kit.brick('building', x - 0.4, y - 0.8, h)
    kit.add(kit.cuboid(0.1, 1, 0.1), FINISH.post, x + 2.3, y + 1.3, h)
    kit.add(kit.cuboid(0.5, 0.5, 0.14), FINISH.hose, x + 2.3, y + 1.2, h + 0.55)
    kit.add(kit.cuboid(0.08, 0.05, 1.5), FINISH.hose, x + 2.1, y + 0.4, h)
    kit.brick('building', x + 2.3, y + 1.3, h)
  })
}
