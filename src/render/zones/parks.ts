import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { middle, polyline, type Vec } from '../../sim/geometry'
import { area, KERB, type Block } from '../blocks'
import { inside, type Field } from '../field'
import { type Kit, SHAPES, spot, to } from '../kit'
import { clearOf, DECK, fountain, GRASS, GROW, overlay, PLAZA, site, STONE } from '../landmarks'
import { PATTERN } from '../pattern'
import { BLOOMS, bench, GLOWS, pavilionLantern, shrine, STONE as STONES, stoneLantern, WOOD } from '../props'
import { ribbons } from '../ribbons'
import {
  alongRun,
  aside,
  borderLengths,
  distance,
  nearPath,
  offRun,
  runs,
  stands,
  turned,
  winding,
  type Look,
  type RowLot,
  type ZoneGround,
} from './ground'
import { clearOfKerbside, facesRoad, placeScenes, sceneOrder, type Scene } from './scenes'

// Parks: a park with a pond, or on a Block under 1,600 m² by its bounding box, one time in three, a plaza with a fountain.
const PARKS = { small: 1600, plaza: 0.35 }

/** Parks' look (`./index`), built to the Finish since #180. */
export const look: Look = { landmarks: false, finish: true, fill: parks }

/** Parks: a park with a pond and trees, or on a small Block now and then a plaza with a fountain. */
function parks(g: ZoneGround) {
  const { kit, field, block, kerbsideTrees } = g
  const small = (block.x1 - block.x0) * (block.y1 - block.y0) < PARKS.small
  const fountain = small && kit.chance(PARKS.plaza) ? site(field, block, 12, 12, middle(block), kerbsideTrees, 1) : null
  if (fountain) plaza(kit, field, block, fountain, kerbsideTrees, g)
  else park(kit, field, block, undefined, kerbsideTrees, g)
}

const TAU = Math.PI * 2

/**
 * A park built to the Finish (#180): how high its lawn stands over the kerb; its border of azaleas along a Road, its
 * middle m in from the Block's edge, how thick and how tall at each Stage, the gap where a path comes in, its leaves and
 * its bloom at Stage 3; its gravel paths, how wide, the stone edge either side and how far that stands proud, m between
 * the points of a path's middle line, and how far a winding one strays at most; how far apart its trees stand, and from
 * a path's middle; and on how large a Block (m²) it lays three paths, and four.
 */
const PARK = {
  lawn: 0.24,
  border: { in: 2.7, thick: 0.8, tall: [0.45, 0.6, 0.7], gap: 2.6, leaves: '#4f8f45', bloom: '#f2b6c9' },
  path: { wide: 1.7, edge: 0.16, proud: 0.05, step: 1.2, strays: 2.4, gravel: '#ddd2b9' },
  trees: { apart: 2.8, path: 2.3 },
  paths: [1600, 3500],
}
/** m in from the Block's edge inside the border, where what stands on the lawn may stand. */
const INNER = PARK.border.in + PARK.border.thick / 2 + 0.5

/**
 * A park's pond to the Finish (#180): the stones round its rim, reeds and their tips, lily pads and their flowers, its
 * island's stepping stones and the wooden bridge to it (wood, never vermilion).
 */
const POND = {
  rocks: ['#8f8a80', '#a29d92', '#7f7b73'],
  reeds: ['#7f9a4e', '#8fa65a'],
  tips: '#b39a62',
  pad: '#5f9f52',
  flower: '#fbe4ec',
  stone: '#c9c2b5',
  wood: '#b98a5a',
  rail: '#9c7048',
}

/**
 * What a park's and a plaza's scenes and pieces are built of (#180): a verdigris roof, a tea house's plaster, posts and
 * shoji (lit at night), a bandstand's and a clock tower's cream, and the clock's hands. Their stone footings and the
 * paths' edges are the props' darker stone.
 */
const BUILT = {
  roof: '#6f8f80',
  plaster: '#efe6d3',
  post: '#8a6446',
  shoji: '#fff4dc',
  cream: '#f1ead9',
  hands: '#3a4252',
}

/** The scenes a park picks from (#180), and the ground each takes (m along its front and deep). */
type ParkScene = 'shrine' | 'teahouse' | 'bandstand'
// A small park's pond leaves a strip of lawn 4.8 m deep beside it, which each fits, the shrine turned along it.
const PARK_SCENES: Record<ParkScene, [number, number]> = { shrine: [4.2, 9.2], teahouse: [6.4, 4.6], bandstand: [5.6, 5.6] }
/** The scenes a plaza picks from (#180), and the ground each takes. */
type PlazaScene = 'clock' | 'bandstand'
const PLAZA_SCENES: Record<PlazaScene, [number, number]> = { clock: [2.6, 2.6], bandstand: [5.6, 5.6] }
/** m² of Block from which a park has a second scene at Stage 3 (#173's rule 5). */
const SECOND = 2500

/**
 * A plaza Block: paved in a warmer stone, and open, or with a fountain at `centre` and four trees around it where they
 * stand clear of the street trees `kerbsideTrees`. The fountain grows with the Stage (`fountain`), and so do the trees,
 * which at Stage 3 stand in round stone planters. Built to the Finish (#180, a Zone's Block `g`), the paving is laid in
 * rings round the fountain, which throws up spray, and the plaza takes a scene, beds, benches, a kiosk, lanterns,
 * planters along its Roads and pigeons (`plazaFinish`).
 */
export function plaza(kit: Kit, field: Field, block: Block, centre?: Vec, kerbsideTrees: Vec[] = [], g?: ZoneGround) {
  const finish = !!g && kit.finished
  overlay(kit, field, block, 0.4, 0.08, PLAZA, finish ? PATTERN.radial : undefined, centre)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  if (!centre) return
  kit.staged((stage) => {
    if (finish) kit.plume('spray', centre.x, centre.y, KERB + [1.25, 3, 4.35][stage - 1])
    fountain(kit, centre.x, centre.y, stage)
  })
  const trees: Vec[] = []
  for (const [dx, dy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const [x, y] = [centre.x + dx * 8.4, centre.y + dy * 8.4]
    if (field.sample(x, y) < 2 || !inside(block.loop, x, y) || !clearOf(kerbsideTrees, x, y, 0, 0, 3)) continue
    trees.push({ x, y })
    if (finish) kit.stand(x, y, 1.8, 1.8)
    kit.staged((stage) => {
      if (stage === 3) kit.drum(STONE, x, y, KERB + 0.08, 1.7, 1.7, 0.6)
      kit.tree(x, y, KERB + (stage === 3 ? 0.68 : 0.08), GROW[stage - 1] * 0.7, 'round')
    })
  }
  if (finish) plazaFinish(g, centre)
}

/**
 * A plaza to the Finish (#180), round its fountain at `centre` (radius 4.8 m): from Stage 2 a scene on one of the four
 * ways out from the fountain, a clock tower or a bandstand, and beds on the others; benches round the fountain facing it,
 * two at Stage 1, four at Stage 2 and six at Stage 3; a kiosk and stone lanterns from Stage 2; low planters along its
 * Roads at every Stage; and pigeons pecking round the fountain and flying off now and then. Drawn from its own stream.
 */
function plazaFinish(g: ZoneGround, centre: Vec) {
  const { kit } = g
  const draw = mulberry32(spot(centre.x, centre.y) ^ 0x9a2a)
  const h = KERB + 0.08
  const ways = [0, 1, 2, 3].map((k) => (k * Math.PI) / 2 + Math.floor(draw() * 4) * (Math.PI / 2))
  /** The point `r` m out from the fountain at angle `a`, and the turn that faces back to it. */
  const out = (a: number, r: number) => ({ x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, ry: a - Math.PI / 2 + Math.PI })
  const free = (x: number, y: number, w: number, d: number, ry: number, room: number, clear = 1) =>
    stands(g, x, y, w, d, clear, ry) &&
    kit.unclaimed(x, y, w, d, ry, room) &&
    Math.hypot(x - centre.x, y - centre.y) > 4.8 + Math.max(w, d) / 2
  // The scene, on the first way out where it fits, as near the fountain as it does.
  const taken: number[] = []
  const order = sceneOrder(g, draw, ['clock', 'bandstand'] as PlazaScene[], SECOND)
  placeScenes<PlazaScene, Scene<PlazaScene>>(order, ['clock', 'bandstand'], (kind) => {
    const [w, d] = PLAZA_SCENES[kind]
    for (const a of ways) {
      for (let r = 5.6 + d / 2; r < 16; r += 0.5) {
        const p = out(a, r)
        if (!free(p.x, p.y, w, d, p.ry, 0.6)) continue
        taken.push(a)
        return { ground: { x: p.x, y: p.y, w, d, ry: p.ry, onRoad: false } }
      }
    }
    return null
  }).forEach(({ kind, ground: l, from }) => {
    kit.stand(l.x, l.y, l.w, l.d, l.ry, from)
    kit.scene(kind, () =>
      kit.staged(
        (stage) => {
          if (stage < from) return
          if (kind === 'clock') clockTower(kit, l, stage, h)
          else bandstand(kit, l, stage, h)
        },
        spot(l.x, l.y),
      ),
    )
  })
  // Beds on the other ways out, with a stone lantern at each end, from Stage 2.
  for (const a of ways.filter((w) => !taken.includes(w)).slice(0, 2)) {
    const p = out(a, 7.4)
    if (!free(p.x, p.y, 3.4, 1.4, p.ry, 0.4)) continue
    const bloom = BLOOMS[spot(p.x, p.y) % BLOOMS.length]
    standAndBuild(kit, p.x, p.y, 3.4, 1.4, p.ry, 2, () => kit.flowerBed(p.x, p.y, h, 3.2, 1.2, p.ry, bloom))
    for (const side of [-1, 1]) {
      const [lx, ly] = to(p.x, p.y, p.ry, side * 2.9, 0)
      if (free(lx, ly, 0.8, 0.8, 0, 0.3)) standAndBuild(kit, lx, ly, 0.8, 0.8, 0, 2, () => stoneLantern(kit, lx, ly, p.ry, h))
    }
  }
  // Benches round the fountain, facing it, between the ways out.
  let n = 0
  for (const k of [0, 2, 1, 3, 0.5, 2.5]) {
    for (const off of [0.42, -0.42]) {
      const p = out(ways[0] + (k * Math.PI) / 2 + off + Math.PI / 4, 6.7)
      if (!free(p.x, p.y, 2.2, 1, p.ry, 0.3)) continue
      standAndBuild(kit, p.x, p.y, 2.2, 1, p.ry, n < 2 ? 1 : n < 4 ? 2 : 3, () => bench(kit, p.x, p.y, p.ry, h))
      n++
      break
    }
    if (n >= 6) break
  }
  // Stage 3 lights the plaza more: two stone lanterns on the ring of benches, where they find room.
  for (let k = 0, lit = 0; k < 8 && lit < 2; k++) {
    const p = out(ways[0] + (k * Math.PI) / 4 + Math.PI / 8, 6.9)
    if (!free(p.x, p.y, 0.8, 0.8, 0, 0.3)) continue
    standAndBuild(kit, p.x, p.y, 0.8, 0.8, 0, 3, () => stoneLantern(kit, p.x, p.y, p.ry, h))
    lit++
  }
  // A kiosk toward a corner, beside the tree there, facing the fountain, from Stage 2.
  kiosk: for (let k = 0; k < 4; k++) {
    for (const [off, r] of [
      [0.42, 11.5],
      [-0.42, 11.5],
      [0.3, 13.5],
      [-0.3, 13.5],
    ]) {
      const p = out(ways[k] + Math.PI / 4 + off, r)
      if (!free(p.x, p.y, 2.6, 2.4, p.ry, 0.5)) continue
      standAndBuild(kit, p.x, p.y, 2.6, 2.4, p.ry, 2, () => kiosk(kit, p.x, p.y, p.ry, h))
      break kiosk
    }
  }
  edgePlanters(g, h, draw)
  // Pigeons: each pecking at a few stops round the fountain, and flying from one to the next.
  for (let k = 0; k < 3; k++) {
    const r = 5.5 + 0.4 * k
    const pts = Array.from({ length: 25 }, (_, i) => ({
      x: centre.x + Math.cos((i / 24) * TAU + k) * r,
      y: centre.y + Math.sin((i / 24) * TAU + k) * r,
    }))
    const loop = polyline(pts)
    const stops = [0, 0.27, 0.55, 0.8].map((f) => loop.length * f)
    const waits = stops.map(() => 6 + draw() * 10)
    kit.from(2, () => kit.mover('pigeon', loop, stops, k, h + 0.1, { waits }), spot(pts[0].x, pts[0].y) + k)
  }
}

/**
 * Low planters along a plaza's Roads (#180), so that no 12 m of its pavement stands empty: one every 9 m or so where
 * the ground is free, in bloom from Stage 2.
 */
function edgePlanters(g: ZoneGround, h: number, draw: () => number) {
  const { kit } = g
  for (const run of runs(g, 1.4).filter(facesRoad)) {
    const n = Math.max(1, Math.round(run.len / 9))
    for (let k = 0; k < n; k++) {
      const s = ((k + 0.5) * run.len) / n
      const [x, y] = [run.a.x + run.ux * s, run.a.y + run.uy * s]
      const ry = run.ry
      if (!stands(g, x, y, 2.4, 0.9, 0.6, ry) || !kit.unclaimed(x, y, 2.4, 0.9, ry, 0.4)) continue
      if (
        !clearOfKerbside(
          g,
          [
            { x, y },
            { x, y },
          ],
          [2.2, 2.2, 0],
        )
      )
        continue
      kit.stand(x, y, 2.4, 0.9, ry)
      const bloom = BLOOMS[Math.floor(draw() * BLOOMS.length)]
      kit.staged((stage) => kit.flowerBed(x, y, h, 2.4, 0.9, ry, stage > 1 ? bloom : PARK.border.leaves), spot(x, y))
    }
  }
}

/** A park's pond (#180): its water's middle and radii, how much it grows with the Block (`s`), and the lawn's top. */
interface Pond {
  x: number
  y: number
  rx: number
  ry: number
  s: number
  h: number
  /** Its stone rim's radii, a metre out from the water's for its size. */
  rim: { rx: number; ry: number }
  /** Its island, from Stage 2. */
  island: { x: number; y: number; rx: number; ry: number }
  /** The x of its deck's middle, from Stage 2, at whose end its pavilion stands at Stage 3. */
  deck: number
  /** Where its stepping stones cross from the island to the shore, from Stage 2, and its bridge, at Stage 3. */
  stones: [Vec, Vec] | null
  bridge: [Vec, Vec] | null
}

/**
 * Lay claim to ground `w` by `d` at `(x, y)` turned `ry` for a piece standing from Stage `from` (#180), and build it
 * there on a stream seeded from where it stands.
 */
function standAndBuild(kit: Kit, x: number, y: number, w: number, d: number, ry: number, from: number, build: () => void) {
  kit.stand(x, y, w, d, ry, from)
  kit.from(from, build, spot(x, y))
}

/** Under 1 inside the ellipse at `(cx, cy)` of radii `rx` and `ry`, 1 on it, and over 1 outside. */
const ellipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2

/** How far along `u` from `p`, inside the ellipse at `(cx, cy)` of radii `rx` and `ry`, the ellipse lies. */
function exit(p: Vec, u: Vec, cx: number, cy: number, rx: number, ry: number): number {
  const [px, py, ux, uy] = [(p.x - cx) / rx, (p.y - cy) / ry, u.x / rx, u.y / ry]
  const [a, b, c] = [ux * ux + uy * uy, 2 * (px * ux + py * uy), px * px + py * py - 1]
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a)
}

/** Whether `(x, y)` lies within `pad` m of a pond's stone rim, or on it. */
const onPond = (p: Pond, x: number, y: number, pad: number) => ellipse(x, y, p.x, p.y, p.rim.rx + pad, p.rim.ry + pad) < 1

/** Where a pond's bridge and stepping stones meet its shore, if it has them: what else on its rim keeps clear of. */
const shoreEnds = (p: Pond) => [p.bridge?.[1], p.stones?.[1]].filter((e): e is Vec => !!e)

/**
 * Whether `(x, y)` lies on a pond's open water `margin` m clear of its edge, its island and, unless the thing passes
 * `under` them, its stepping stones and what stands on the water, claimed on the kit: the deck, the pavilion, the bridge
 * and the reeds.
 */
function openWater(kit: Kit, p: Pond, x: number, y: number, margin: number, under = false): boolean {
  if (ellipse(x, y, p.x, p.y, p.rx - margin, p.ry - margin) >= 1) return false
  const i = p.island
  if (ellipse(x, y, i.x, i.y, i.rx + margin, i.ry + margin) < 1) return false
  if (under) return true
  return (!p.stones || distance({ x, y }, ...p.stones) >= 0.9 + margin) && kit.unclaimed(x, y, 0, 0, 0, margin)
}

/**
 * A loop round a pond's open water `margin` m clear (`openWater`), wobbling by `wobble` of its radius: from the ellipses
 * tried largest first, their middles in the order `draw` shuffles them; null where none fits.
 */
function waterLoop(kit: Kit, p: Pond, margin: number, draw: () => number, under = false, wobble = 0): Vec[] | null {
  const offsets = [-0.4, -0.2, 0, 0.2, 0.4].flatMap((fx) => [-0.4, -0.2, 0, 0.2, 0.4].map((fy) => [fx, fy, draw()]))
  offsets.sort((a, b) => a[2] - b[2])
  const phase = draw() * TAU
  for (const k of [0.62, 0.5, 0.4, 0.3, 0.22]) {
    for (const [fx, fy] of offsets) {
      const [cx, cy] = [p.x + fx * p.rx, p.y + fy * p.ry]
      const pts = Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * TAU
        const w = 1 + wobble * Math.sin(3 * a + phase)
        return { x: cx + Math.cos(a) * k * p.rx * w, y: cy + Math.sin(a) * k * p.ry * w }
      })
      if (pts.every((q) => openWater(kit, p, q.x, q.y, margin, under))) return [...pts, pts[0]]
    }
  }
  return null
}

/**
 * Where a pond's stepping stones and bridge cross to its island (#180): each from the island's edge to the shore along
 * the first way out, of those that keep off the deck's end, whose water is as wide as it takes for the pond's size; the
 * bridge and the stones on different ways.
 */
function crossings(p: Omit<Pond, 'stones' | 'bridge'>): Pick<Pond, 'stones' | 'bridge'> {
  const { island: i } = p
  const ways = [90, 45, 135, 0, -45, -90, -135].map((d) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) }))
  const span = (u: Vec) => {
    const c = { x: i.x, y: i.y }
    const [from, to] = [exit(c, u, i.x, i.y, i.rx, i.ry), exit(c, u, p.x, p.y, p.rx, p.ry)]
    const end = { x: c.x + u.x * to, y: c.y + u.y * to }
    return { from: { x: c.x + u.x * (from - 0.3), y: c.y + u.y * (from - 0.3) }, end, wide: to - from }
  }
  const bridgeWay = ways.find((u) => {
    const { wide, end } = span(u)
    return wide >= 2 && wide <= 7.5 * Math.max(1, p.s) && end.x > p.deck + 8
  })
  const bridge = bridgeWay ? span(bridgeWay) : null
  const stoneWay = ways.find((u) => {
    const { wide, end } = span(u)
    return (
      u !== bridgeWay &&
      wide >= 1.2 &&
      wide <= 6 * Math.max(1, p.s) &&
      end.x > p.deck + 8 &&
      (!bridgeWay || u.x * bridgeWay.x + u.y * bridgeWay.y < 0.3)
    )
  })
  const stones = stoneWay ? span(stoneWay) : null
  const reach = (c: { from: Vec; end: Vec } | null, past: number): [Vec, Vec] | null => {
    if (!c) return null
    const [dx, dy] = [c.end.x - c.from.x, c.end.y - c.from.y]
    const len = Math.hypot(dx, dy)
    return [c.from, { x: c.end.x + (dx / len) * past, y: c.end.y + (dy / len) * past }]
  }
  return { bridge: reach(bridge, 1.2 * p.s + 0.4), stones: reach(stones, 0) }
}

/**
 * A park Block: a lawn, a pond with a little wooden deck, and trees over the rest. Pond and tree count grow with the
 * Block. The pond lies at `pond`; without one, nearest the Block's middle where it fits, or nowhere if it fits nowhere.
 * Pond and trees keep clear of the street trees `kerbsideTrees`. With the Stage:
 * - Stage 1: a young park, half its trees planted, as saplings, and a pond with no deck.
 * - Stage 2: every tree, and the deck.
 * - Stage 3: the trees grown on, a pavilion over the water at the end of the deck, and an island with a pine.
 * Built to the Finish (#180, a Zone's Block `g`), the lawn is mown in stripes, the pond has its rocks, reeds, lily pads,
 * island, stepping stones, bridge, a tiled roof on its pavilion and what moves on it (`pondFinish`), the park has its
 * scenes, gravel paths from its corners, a border of azaleas along its Roads, stone lanterns and benches (`parkFinish`),
 * and its trees are coarse, stand apart and keep off what the rest claimed; from Stage 2 the round ones drop leaves.
 */
export function park(kit: Kit, field: Field, block: Block, pond?: Vec, kerbsideTrees: Vec[] = [], g?: ZoneGround) {
  const finish = !!g && kit.finished
  overlay(kit, field, block, 2, PARK.lawn, GRASS, finish ? PATTERN.lawn : undefined)
  const ground = KERB + PARK.lawn
  const size = area(block.loop)
  const s = Math.min(1.7, Math.max(0.75, Math.sqrt(size / 1760)))
  const at = pond ?? site(field, block, 29.2 * s, 21.2 * s, middle(block), kerbsideTrees, 1)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  // To the Finish, the island lies to the north or the south of the pond's middle, as the pond lies (#180).
  const side = finish && at && spot(at.x, at.y) % 2 ? -1 : 1
  const water: Pond | null = at
    ? (() => {
        const shape = {
          x: at.x,
          y: at.y,
          rx: 12.6 * s,
          ry: 8.8 * s,
          s,
          h: ground,
          rim: { rx: 13.6 * s, ry: 9.6 * s },
          island: { x: at.x + 5 * s, y: at.y + side * 2.2 * s, rx: 2.6 * s, ry: 2 * s },
          deck: at.x - 10.8 * s,
        }
        return { ...shape, ...crossings(shape) }
      })()
    : null
  if (water) {
    const { deck, island } = water
    if (finish) {
      kit.stand(deck, water.y, 6.4, 2.2, 0, 2)
      kit.stand(deck + 5.3, water.y, 4.4, 4.4, 0, 3)
    }
    kit.drum(STONE, water.x, water.y, ground, water.rim.rx, water.rim.ry, 0.32)
    kit.drum(kit.water, water.x, water.y, ground + 0.08, water.rx, water.ry, 0.32)
    if (finish) rocks(kit, water)
    kit.brick('ground', water.x, water.y, ground + 0.08) // as low as the rim: ground what stands may reach over
    kit.from(2, () => {
      kit.add(kit.box(6.4, 0.48, 2, 0.4, 0.12), DECK, deck, water.y, ground + 0.32)
      kit.brick('ground', deck, water.y, ground)
    })
    kit.from(3, () => {
      kit.pavilion(deck + 5.3, water.y, ground + 0.5, finish)
      if (finish) return pavilionLantern(kit, deck + 5.3, water.y, ground + 0.5)
      kit.drum(GRASS, island.x, island.y, ground + 0.08, island.rx, island.ry, 0.6)
      kit.brick('ground', island.x, island.y, ground)
      kit.tree(island.x, island.y, ground + 0.68, 0.55, 'pine')
    })
  }
  const paths = finish && g ? parkFinish(g, water) : []
  if (finish && water) pondFinish(kit, water)
  const trees = Math.min(70, Math.max(12, Math.round(size / 60)))
  const planted: Vec[] = []
  for (let tries = 0, n = 0; tries < trees * 8 && n < trees; tries++) {
    const [tx, ty] = [kit.range(block.x0, block.x1), kit.range(block.y0, block.y1)]
    if (field.sample(tx, ty) < 5 || !inside(block.loop, tx, ty) || !clearOf(kerbsideTrees, tx, ty, 0, 0, 3)) continue
    if (at && ellipse(tx, ty, at.x, at.y, 17.2 * s, 12.8 * s) < 1) continue
    if (finish && !roomForTree(kit, planted, paths, tx, ty)) continue
    const [tree, kind] = [kit.range(0.75, 1.2), kit.chance(0.2) ? 'sakura' : kit.chance(0.15) ? 'pine' : 'round'] as const
    const young = n % 2 === 0 // planted at Stage 1
    planted.push({ x: tx, y: ty })
    if (finish) kit.stand(tx, ty, 1, 1)
    kit.lot(n)
    kit.staged((stage) => {
      if (!young && stage === 1) return
      const grown = GROW[stage - 1] * tree
      kit.tree(tx, ty, ground, grown, kind, finish, finish && stage > 1)
    })
    n++
  }
  kit.lot(-1)
}

/** Whether a park's tree may stand at `(x, y)` (#180): apart from the trees `planted`, off the `paths` and every claim. */
function roomForTree(kit: Kit, planted: Vec[], paths: Vec[][], x: number, y: number): boolean {
  if (planted.some((p) => Math.hypot(p.x - x, p.y - y) < PARK.trees.apart)) return false
  if (paths.some((path) => nearPath(path, x, y, PARK.trees.path))) return false
  return kit.unclaimed(x, y, 1, 1, 0, 0.6)
}

/**
 * The stones round a pond's rim (#180), at every Stage: low enough to lie as part of its rim's ground, and none on the
 * deck's claim or where the bridge or the stepping stones meet the shore. Drawn from the pond's own stream.
 */
function rocks(kit: Kit, p: Pond) {
  const draw = mulberry32(spot(p.x, p.y) ^ 0x50c5)
  const ends = shoreEnds(p)
  const count = Math.round((TAU * Math.sqrt((p.rx ** 2 + p.ry ** 2) / 2)) / 2.2)
  for (let i = 0; i < count; i++) {
    const a = ((i + draw() * 0.6) / count) * TAU
    const [x, y] = [p.x + Math.cos(a) * (p.rx + 0.1), p.y + Math.sin(a) * (p.ry + 0.1)]
    const [w, d, tall] = [0.6 + draw() * 0.4, 0.5 + draw() * 0.35, 0.22 + draw() * 0.08]
    const colour = POND.rocks[Math.floor(draw() * POND.rocks.length)]
    if (!kit.unclaimed(x, y, w, d, 0) || ends.some((e) => Math.hypot(e.x - x, e.y - y) < 1.8)) continue // the deck's foot
    kit.add(SHAPES.bush, colour, x, y, p.h + 0.1, draw() * TAU, w, tall, d)
  }
}

/**
 * A pond's pieces to the Finish (#180), each on a stream of its own: from Stage 2 reeds round its edge, lily pads, its
 * island with a young pine and stepping stones out to it, and on the water a swan boat, ducks and the shadows of koi,
 * and by night fireflies over its edge; at Stage 3 the pine grown, a wooden bridge to the island, a second swan boat on
 * a large pond, and more koi and fireflies.
 */
function pondFinish(kit: Kit, p: Pond) {
  const draw = mulberry32(spot(p.x, p.y) ^ 0x7e3d)
  const surface = p.h + 0.4
  const { island: i } = p
  // The island and its pine, from Stage 2.
  kit.staged(
    (stage) => {
      if (stage < 2) return
      kit.drum(GRASS, i.x, i.y, p.h + 0.08, i.rx, i.ry, 0.6)
      kit.brick('ground', i.x, i.y, surface)
      kit.tree(i.x, i.y, p.h + 0.68, stage === 2 ? 0.4 : 0.55, 'pine', true)
    },
    spot(i.x, i.y),
  )
  // Stepping stones from the island to the shore, from Stage 2.
  const stones = p.stones
  if (stones) {
    kit.from(
      2,
      () => {
        const [a, b] = stones
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
        for (let t = 0.5, k = 0; t < len - 0.2; t += 0.85, k++) {
          const side = (k % 2 ? 1 : -1) * 0.16
          kit.drum(POND.stone, a.x + ux * t - uy * side, a.y + uy * t + ux * side, p.h + 0.3, 0.36, 0.3, 0.14)
        }
        kit.brick('ground', a.x, a.y, surface)
      },
      spot(stones[0].x, stones[0].y),
    )
  }
  // The bridge to the island, at Stage 3.
  const span = p.bridge
  if (span) {
    const [a, b] = span
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const ry = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2
    kit.stand(mid.x, mid.y, 1.8, len, ry, 3)
    kit.from(3, () => bridge(kit, a, b, p.h), spot(mid.x, mid.y))
  }
  // Reeds in clumps round the edge, from Stage 2, clear of what is claimed and of where the crossings meet the shore.
  const ends = shoreEnds(p)
  for (let k = 0, tries = 0; k < 4 && tries < 16; tries++) {
    const a = draw() * TAU
    const [x, y] = [p.x + Math.cos(a) * (p.rx - 0.4), p.y + Math.sin(a) * (p.ry - 0.4)]
    if (ends.some((e) => Math.hypot(e.x - x, e.y - y) < 2.6) || !kit.unclaimed(x, y, 1.3, 1.3, 0, 0.4)) continue
    kit.stand(x, y, 1.3, 1.3, 0, 2)
    kit.from(2, () => reeds(kit, x, y, p.h), spot(x, y))
    k++
  }
  // Lily pads in two drifts on open water, from Stage 2.
  for (let k = 0, tries = 0; k < 2 && tries < 20; tries++) {
    const [x, y] = [p.x + (draw() - 0.5) * 1.6 * p.rx, p.y + (draw() - 0.5) * 1.6 * p.ry]
    if (!openWater(kit, p, x, y, 1.4)) continue
    kit.from(2, () => lilies(kit, x, y, surface), spot(x, y))
    k++
  }
  // What moves on the water: a swan boat, a second at Stage 3 on a large pond; ducks; koi.
  for (const [k, from] of (p.s > 1.1
    ? [
        [0, 2],
        [1, 3],
      ]
    : [[0, 2]]) as [number, number][]) {
    const pts = waterLoop(kit, p, 1.3, draw)
    if (!pts) continue
    const loop = polyline(pts)
    const stops = [0, loop.length / 2]
    kit.from(from, () => kit.mover('swanboat', loop, stops, k, surface - 0.02, { waits: [5, 5] }), spot(pts[0].x, pts[0].y) + k)
  }
  for (let k = 0; k < 2; k++) {
    const pts = waterLoop(kit, p, 0.9, draw, false, 0.08)
    if (!pts) continue
    const loop = polyline(pts)
    const stops = [0, 0.3, 0.65].map((f) => f * loop.length)
    const waits = stops.map(() => 8 + draw() * 14)
    kit.from(2, () => kit.mover('duck', loop, stops, k, surface, { waits }), spot(pts[0].x, pts[0].y) + 7 + k)
  }
  const shades = ['#33434a', '#3f4f55', '#56656b']
  for (let k = 0; k < 4; k++) {
    const pts = waterLoop(kit, p, 0.7, draw, true, 0.14)
    if (!pts) continue
    const loop = polyline(pts)
    const stops = [0, loop.length / 2]
    const paint = shades[k % shades.length]
    kit.from(k < 3 ? 2 : 3, () => kit.mover('koi', loop, stops, k % 2, surface + 0.01, { paint }), spot(pts[0].x, pts[0].y) + 13 + k)
  }
  // Fireflies by night over the pond's edge, each round a little loop of its own.
  for (let k = 0; k < 6; k++) {
    const a = draw() * TAU
    const [cx, cy, r, up] = [p.x + Math.cos(a) * p.rx * 0.95, p.y + Math.sin(a) * p.ry * 0.95, 1 + draw() * 1.4, 0.5 + draw() * 0.9]
    const pts = Array.from({ length: 13 }, (_, j) => ({ x: cx + Math.cos((j / 12) * TAU) * r, y: cy + Math.sin((j / 12) * TAU) * r * 0.7 }))
    const loop = polyline(pts)
    kit.from(k < 4 ? 2 : 3, () => kit.mover('firefly', loop, [0], 0, surface + up), spot(cx, cy) + 19 + k)
  }
}

/** A clump of reeds at a pond's edge at `(x, y)`, the lawn `h` up (#180): tapering blades of two greens, and a few brown heads. */
function reeds(kit: Kit, x: number, y: number, h: number) {
  const draw = mulberry32(spot(x, y))
  for (let i = 0; i < 12; i++) {
    const [a, r, tall] = [draw() * TAU, 0.1 + draw() * 0.5, 1 + draw() * 0.7]
    const [bx, by] = [x + Math.cos(a) * r, y + Math.sin(a) * r]
    kit.add(SHAPES.cone, POND.reeds[i % 2], bx, by, h + 0.3, 0, 0.09, tall, 0.09)
    if (i % 4 === 0) kit.add(SHAPES.thin, POND.tips, bx, by, h + 0.3 + tall * 0.6, 0, 0.08, 0.28, 0.08)
  }
  kit.brick('tree', x, y, h + 0.3)
}

/** A drift of lily pads on a pond's water at `(x, y)`, its surface `h` up (#180), and two pale flowers on them. */
function lilies(kit: Kit, x: number, y: number, h: number) {
  const draw = mulberry32(spot(x, y) ^ 0x1111)
  for (let i = 0; i < 6; i++) {
    const [a, r] = [draw() * TAU, Math.sqrt(draw()) * 1.4]
    const [px, py] = [x + Math.cos(a) * r, y + Math.sin(a) * r]
    kit.add(SHAPES.petal, POND.pad, px, py, h + 0.01, draw() * TAU, 1.5, 1, 1.5)
    if (i < 2) kit.add(SHAPES.bush, POND.flower, px, py, h + 0.04, 0, 0.14, 0.09, 0.14)
  }
  kit.brick('ground', x, y, h)
}

/**
 * A wooden bridge from `a` on a pond's island to `b` on its shore, the lawn `h` up (#180), as one brick: a deck arching
 * over the water in planks, and a rail either side on posts, in wood, never vermilion.
 */
function bridge(kit: Kit, a: Vec, b: Vec, h: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len]
  const turn = Math.atan2(uy, ux)
  const n = Math.max(4, Math.round(len / 0.9))
  const rise = (t: number) => h + 0.42 + Math.min(1, len / 8) * 0.7 * Math.sin(Math.PI * t)
  for (let k = 0; k < n; k++) {
    const [t0, t1] = [k / n, (k + 1) / n]
    const tm = (t0 + t1) / 2
    const [x, y] = [a.x + ux * len * tm, a.y + uy * len * tm]
    const tip = Math.atan2(rise(t1) - rise(t0), len * (t1 - t0))
    kit.add(kit.tipped(1.5, 0.1, len / n + 0.04, tip), POND.wood, x, y, rise(tm), turn + Math.PI / 2)
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k <= n; k += 2) {
      const t = Math.min(1, k / n)
      const [x, y] = [a.x + ux * len * t - uy * side * 0.7, a.y + uy * len * t + ux * side * 0.7]
      kit.add(kit.cuboid(0.1, 0.8, 0.1), POND.rail, x, y, rise(t) - 0.05)
    }
    for (let k = 0; k < n; k++) {
      const [t0, t1] = [k / n, (k + 1) / n]
      const tm = (t0 + t1) / 2
      const [x, y] = [a.x + ux * len * tm - uy * side * 0.7, a.y + uy * len * tm + ux * side * 0.7]
      const tip = Math.atan2(rise(t1) - rise(t0), len * (t1 - t0))
      kit.add(kit.tipped(0.12, 0.08, len / n + 0.06, tip), POND.rail, x, y, rise(tm) + 0.68, turn + Math.PI / 2)
    }
  }
  kit.brick('building', (a.x + b.x) / 2, (a.y + b.y) / 2, h)
}

/** A park's scene and the ground it takes (#180). */
type ParkGround = Scene<ParkScene>

/**
 * A park to the Finish beyond its pond (#180), on its own stream: its scenes, reserved before the paths and the trees;
 * gravel paths from its corners to the pond, and from each scene's front to the nearest path or the pond; a border of
 * azaleas along its Roads, open where a path comes in; and stone lanterns and benches beside the paths and round the
 * pond. Gives the paths' middle lines, which the trees keep off.
 */
function parkFinish(g: ZoneGround, p: Pond | null): Vec[][] {
  const { kit, block } = g
  const mid = middle(block)
  const draw = mulberry32(spot(mid.x, mid.y) ^ 0x4a7c)
  const h = KERB + PARK.lawn
  const scenes = parkScenes(g, p, draw)
  for (const { kind, ground: l, from } of scenes) {
    kit.stand(l.x, l.y, l.w, l.d, l.ry, from)
    kit.scene(kind, () =>
      kit.staged(
        (stage) => {
          if (stage < from) return
          if (kind === 'shrine') shrine(kit, l.x, l.y, l.w, l.d, l.ry, stage, h)
          else ({ teahouse, bandstand })[kind](kit, l, stage, h)
        },
        spot(l.x, l.y),
      ),
    )
  }
  const paths = parkPaths(g, p, scenes, draw)
  paths.forEach((path) => {
    kit.from(1, () => gravelPath(kit, path, h), spot(path[0].x, path[0].y))
  })
  border(g, paths, h)
  lanternsAndBenches(g, p, paths, h)
  return paths
}

/**
 * A park's scenes (#180), drawn from `draw`: from Stage 2 one, and a second at Stage 3 on 2,500 m² or more, each on the
 * lawn inside the border, off the pond and what it claimed, and the second 14 m or more from the first; each nearest the
 * pond of the spots tried, from a few drawn to start, facing the pond (or the Block's middle) where it fits so, else
 * turned a quarter either way, as a shrine runs along the strip beside a small park's pond.
 */
function parkScenes(g: ZoneGround, p: Pond | null, draw: () => number): ParkGround[] {
  const { kit, block } = g
  const kinds: ParkScene[] = ['shrine', 'teahouse', 'bandstand']
  const order = sceneOrder(g, draw, kinds, SECOND)
  const target = p ?? middle(block)
  const spots: Vec[] = []
  for (let x = block.x0 + 4; x <= block.x1 - 4; x += 2) for (let y = block.y0 + 4; y <= block.y1 - 4; y += 2) spots.push({ x, y })
  spots.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
  const shift = Math.floor(draw() * Math.min(12, spots.length))
  const tried = [...spots.slice(shift), ...spots.slice(0, shift)]
  return placeScenes<ParkScene, ParkGround>(order, kinds, (kind, out) => {
    const [w, d] = PARK_SCENES[kind]
    for (const q of tried) {
      if (out.some((o) => Math.hypot(o.ground.x - q.x, o.ground.y - q.y) < 14)) continue
      const [dx, dy] = [target.x - q.x, target.y - q.y]
      const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : dy > 0 ? 0 : Math.PI
      for (const ry of [facing, facing + Math.PI / 2, facing - Math.PI / 2]) {
        if (!stands(g, q.x, q.y, w, d, INNER, ry) || !kit.unclaimed(q.x, q.y, w, d, ry, 1)) continue
        if (p && footprint(q, w, d, ry).some((c) => onPond(p, c.x, c.y, 0.5))) continue
        return { ground: { x: q.x, y: q.y, w, d, ry, onRoad: false } }
      }
    }
    return null
  })
}

/** Nine points over ground `w` by `d` at `q` turned `ry`: its corners, the middles of its sides and its middle. */
function footprint(q: Vec, w: number, d: number, ry: number): Vec[] {
  return [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => turned(q.x, q.y, ry, (i * w) / 2, (j * d) / 2)))
}

/**
 * A park's gravel paths (#180), drawn from `draw`: from two, three or four of its corners, by the Block's size, winding
 * to the pond's rim (or the Block's middle), each straight where a winding one will not keep to the lawn, off the pond
 * and off what is claimed; then from each scene's front to the nearest point of a path or the pond's rim, within 16 m.
 */
function parkPaths(g: ZoneGround, p: Pond | null, scenes: ParkGround[], draw: () => number): Vec[][] {
  const { kit, field, block } = g
  const size = area(block.loop)
  const most = size < PARK.paths[0] ? 2 : size < PARK.paths[1] ? 3 : 4
  const mid = middle(block)
  const rim = (q: Vec): Vec => {
    if (!p) return mid
    const k = Math.sqrt(ellipse(q.x, q.y, p.x, p.y, p.rim.rx + 0.3, p.rim.ry + 0.3))
    return { x: p.x + (q.x - p.x) / k, y: p.y + (q.y - p.y) / k }
  }
  /** Whether a path along `pts` keeps to the lawn, off the pond and what is claimed, past its first `from` m. */
  const keeps = (pts: Vec[], skip: number) =>
    pts.every((q, i) => {
      const along = i * PARK.path.step
      if (along < skip) return true
      const last = i === pts.length - 1
      if (field.sample(q.x, q.y) < INNER + PARK.path.wide / 2 - 0.4 || !inside(block.loop, q.x, q.y)) return false
      if (p && !last && onPond(p, q.x, q.y, 0.1)) return false
      return last || kit.unclaimed(q.x, q.y, 0, 0, 0, PARK.path.wide / 2 + 0.3)
    })
  const out: Vec[][] = []
  const boxCorners = [
    { x: block.x0, y: block.y0 },
    { x: block.x1, y: block.y0 },
    { x: block.x1, y: block.y1 },
    { x: block.x0, y: block.y1 },
  ]
  const start = Math.floor(draw() * 4)
  for (let k = 0; k < 4 && out.length < most; k++) {
    const c = boxCorners[(start + k) % 4]
    // Walk in from the corner of the Block's box to the lawn.
    const [ux, uy] = [mid.x - c.x, mid.y - c.y]
    const len = Math.hypot(ux, uy)
    let e: Vec | null = null
    for (let t = 0; t < len * 0.6; t += 0.5) {
      const q = { x: c.x + (ux / len) * t, y: c.y + (uy / len) * t }
      if (field.sample(q.x, q.y) >= 2.1 && inside(block.loop, q.x, q.y)) {
        e = q
        break
      }
    }
    if (!e) continue
    const strays = (draw() < 0.5 ? -1 : 1) * PARK.path.strays
    const waves = draw() < 0.6 ? 1 : 2
    const path = [strays, 0].map((a) => winding(e, rim(e), a, waves, PARK.path.step)).find((pts) => keeps(pts, 2.6))
    if (path) out.push(path)
  }
  for (const { ground: l } of scenes) {
    const f = turned(l.x, l.y, l.ry, 0, l.d / 2 + 0.2)
    const near = [...out.flat(), ...(p ? [rim(f)] : [])].sort(
      (a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y),
    )[0]
    if (!near || Math.hypot(near.x - f.x, near.y - f.y) > 16 || Math.hypot(near.x - f.x, near.y - f.y) < 1.5) continue
    const spur = winding(f, near, 0, 1, PARK.path.step)
    if (keeps(spur, 1)) out.push(spur)
  }
  return out
}

/**
 * A gravel path along its middle line `pts` on a lawn whose top is `h` up (#180), as one brick: the gravel, and its
 * stone edge either side, laid a little proud of the lawn.
 */
function gravelPath(kit: Kit, pts: Vec[], h: number) {
  const { wide, edge, proud, gravel } = PARK.path
  kit.laid(ribbons([pts], wide, h + 0.012), gravel, PATTERN.gravel)
  kit.push(ribbons([aside(pts, (wide + edge) / 2), aside(pts, -(wide + edge) / 2)], edge, h + proud), STONES.dark)
  kit.brick('ground', pts[0].x, pts[0].y, h)
}

/**
 * A border of azaleas along a park's Roads, `PARK.border.in` m in (#180): low clipped bushes, taller with each Stage
 * and in bloom at Stage 3, open where a path comes in and round each lamp, pole and street tree, and each length cut
 * back where it would meet what is claimed, as another run's at a shallow corner; each claims its ground.
 */
function border(g: ZoneGround, paths: Vec[][], h: number) {
  const { kit } = g
  const { thick, tall, gap, leaves, bloom } = PARK.border
  for (const run of runs(g, PARK.border.in).filter(facesRoad)) {
    // Open where a path comes in.
    const gaps = paths.flatMap((path) =>
      path.filter((q) => offRun(run, q) < 1.2).map((q): [number, number] => [alongRun(run, q) - gap / 2, alongRun(run, q) + gap / 2]),
    )
    const lengths = borderLengths(g, run, thick, gaps)
    if (!lengths.length) continue
    const turn = Math.atan2(run.uy, run.ux)
    const first = lengths[0]
    const start = { x: run.a.x + run.ux * first[0], y: run.a.y + run.uy * first[0] }
    kit.staged(
      (stage) => {
        for (const [a, b] of lengths) {
          const m = (a + b) / 2
          const [x, y] = [run.a.x + run.ux * m, run.a.y + run.uy * m]
          kit.add(kit.cuboid(b - a, tall[stage - 1], thick), leaves, x, y, h, turn)
          if (stage === 3) kit.add(kit.cuboid(b - a - 0.1, 0.08, thick - 0.12), bloom, x, y, h + tall[2], turn)
        }
        kit.brick('ground', start.x, start.y, h)
      },
      spot(start.x, start.y),
    )
  }
}

/**
 * A park's stone lanterns and benches (#180): from Stage 2 a lantern beside each path where it meets the pond and where
 * it comes in, and at Stage 3 one midway along it; a bench beside each path's middle facing it, from Stage 1, another
 * three quarters along it at Stage 3, and from Stage 2 two on the lawn round the pond, facing the water. Each where the
 * ground is free, inside the border and off the pond and the paths.
 */
function lanternsAndBenches(g: ZoneGround, p: Pond | null, paths: Vec[][], h: number) {
  const { kit, field } = g
  const free = (x: number, y: number, w: number, d: number, ry: number) =>
    field.sample(x, y) >= INNER &&
    inside(g.block.loop, x, y) &&
    (!p || !onPond(p, x, y, 0.5 + Math.max(w, d) / 2)) &&
    !paths.some((path) => nearPath(path, x, y, PARK.path.wide / 2 + PARK.path.edge + Math.max(w, d) / 2 + 0.05)) &&
    kit.unclaimed(x, y, w, d, ry, 0.4)
  /** The point beside path `path` at `t` (0 to 1) of the way along it, `off` m to its left (below 0, its right), and the turn facing the path. */
  const beside = (path: Vec[], t: number, off: number) => {
    const i = Math.min(path.length - 2, Math.max(0, Math.floor(t * (path.length - 1))))
    const [a, b] = [path[i], path[i + 1]]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const [nx, ny] = [-(b.y - a.y) / len, (b.x - a.x) / len]
    return { x: a.x + nx * off, y: a.y + ny * off, ry: Math.atan2(nx, -ny) + (off > 0 ? 0 : Math.PI) }
  }
  const lantern = (x: number, y: number, ry: number, from: number) => {
    if (!free(x, y, 0.8, 0.8, 0)) return false
    standAndBuild(kit, x, y, 0.8, 0.8, 0, from, () => stoneLantern(kit, x, y, ry, h))
    return true
  }
  const seat = (x: number, y: number, ry: number, from: number) => {
    if (!free(x, y, 2.2, 1, ry)) return false
    standAndBuild(kit, x, y, 2.2, 1, ry, from, () => bench(kit, x, y, ry, h))
    return true
  }
  const off = PARK.path.wide / 2 + PARK.path.edge + 0.75
  for (const path of paths) {
    const along = (path.length - 1) * PARK.path.step
    for (const side of [1, -1]) if (lantern(...pose(beside(path, Math.max(0, 1 - 1.6 / along), side * off)), 2)) break
    for (const side of [-1, 1]) if (lantern(...pose(beside(path, Math.min(1, 3.2 / along), side * off)), 2)) break
    for (const side of [1, -1]) if (lantern(...pose(beside(path, 0.5, side * off)), 3)) break
    for (const side of [-1, 1]) if (seat(...pose(beside(path, 0.4, side * (off + 0.1))), 1)) break
    for (const side of [1, -1]) if (seat(...pose(beside(path, 0.75, side * (off + 0.1))), 3)) break
  }
  if (!p) return
  for (let k = 0, placed = 0; k < 12 && placed < 2; k++) {
    const a = (k / 12) * TAU + 0.3
    const [x, y] = [p.x + Math.cos(a) * (p.rim.rx + 2.4), p.y + Math.sin(a) * (p.rim.ry + 2.4)]
    const ry = Math.atan2(-(p.x - x), p.y - y) // its front toward the water
    if (seat(x, y, ry, 2)) placed++
  }
}

const pose = (q: { x: number; y: number; ry: number }): [number, number, number] => [q.x, q.y, q.ry]

/**
 * A tea house on its ground `l` (#180), facing its front, the lawn `h` up, as one brick and its lantern: plaster walls
 * between wooden posts on a stone footing, shoji on every side that glow at night and leave their light round it, a
 * veranda along its front and a hipped roof in verdigris tiles; at Stage 3 a parasol beside it.
 */
function teahouse(kit: Kit, l: RowLot, stage: number, h: number) {
  const put = (geo: THREE.BufferGeometry, look: Parameters<Kit['add']>[1], lx: number, ly: number, z: number) =>
    kit.put(geo, look, l.x, l.y, l.ry, lx, ly, z)
  const [w, d, tall, by] = [4.2, 3, 2.4, -0.45]
  const floor = h + 0.35
  put(kit.cuboid(w + 0.4, 0.35, d + 0.4), STONES.dark, 0, by, h)
  put(kit.cuboid(w, tall, d), BUILT.plaster, 0, by, floor)
  for (const i of [-1, 0, 1])
    for (const j of [-1, 1]) {
      put(kit.cuboid(0.16, tall, 0.16), BUILT.post, (i * w) / 2, by + (j * d) / 2, floor)
      put(kit.cuboid(0.16, tall, 0.16), BUILT.post, (j * w) / 2, by + (i * d) / 2, floor)
    }
  const shoji = kit.lit(BUILT.shoji, GLOWS.band)
  for (const j of [-1, 1]) {
    for (const i of [-1, 1]) put(kit.cuboid(w / 2 - 0.4, 1.7, 0.06), shoji, (i * w) / 4, by + j * (d / 2 + 0.03), floor + 0.3)
    for (const i of [-1, 1]) put(kit.cuboid(0.06, 1.7, d / 2 - 0.4), shoji, j * (w / 2 + 0.03), by + (i * d) / 4, floor + 0.3)
  }
  put(kit.cuboid(w + 0.4, 0.12, 0.9), WOOD.pale, 0, by + d / 2 + 0.45, floor - 0.12)
  kit.tiled(kit.hip(d + 1.2, w + 1.4, 1.3), BUILT.roof, ...to(l.x, l.y, l.ry, 0, by), floor + tall, l.ry, spot(l.x, l.y))
  if (stage === 3) {
    const [px, py] = to(l.x, l.y, l.ry, -2.75, 1.75)
    kit.add(SHAPES.thin, WOOD.dark, px, py, h, 0, 0.04, 2.3, 0.04)
    kit.add(SHAPES.cone, BUILT.cream, px, py, h + 1.9, 0, 0.9, 0.45, 0.9)
  }
  kit.pool('window', ...to(l.x, l.y, l.ry, 0, by), h, w + 3, d + 3, l.ry)
  kit.shadow(...to(l.x, l.y, l.ry, 0, by), h, w + 1.2, d + 1.2, false, l.ry)
  kit.brick('building', l.x, l.y, h)
  stoneLantern(kit, ...to(l.x, l.y, l.ry, 2.85, 1.6), l.ry, h)
}

/**
 * A bandstand on its ground `l` (#180), the ground `h` up, as one brick: an eight-sided stone platform with steps at its
 * front, cream posts and rails round it, open at the steps, under a roof of verdigris tiles with a finial, and a lantern
 * hung in its middle that lights the floor at night; at Stage 3 four more lanterns round its eaves.
 */
function bandstand(kit: Kit, l: RowLot, stage: number, h: number) {
  const r = 2.4
  const floor = h + 0.6
  kit.add(SHAPES.cylinder, POND.stone, l.x, l.y, h, l.ry, r, 0.6, r)
  kit.put(kit.cuboid(1.4, 0.3, 0.5), POND.stone, l.x, l.y, l.ry, 0, r + 0.15, h)
  // Its posts round the way its front faces, and a rail between each two but the two either side of its steps.
  const front = l.ry + Math.PI / 2
  for (let k = 0; k < 8; k++) {
    const a = front + ((k + 0.5) * Math.PI) / 4
    kit.add(SHAPES.thin, BUILT.cream, l.x + Math.cos(a) * (r - 0.25), l.y + Math.sin(a) * (r - 0.25), floor, 0, 0.09, 2.7, 0.09)
    if (k === 7) continue
    const b = front + ((k + 1) * Math.PI) / 4
    const [cx, cy] = [l.x + Math.cos(b) * (r - 0.35), l.y + Math.sin(b) * (r - 0.35)]
    kit.add(kit.cuboid(1.75, 0.07, 0.07), BUILT.cream, cx, cy, floor + 0.85, b + Math.PI / 2)
  }
  kit.tiled(SHAPES.cone.clone().scale(r + 0.5, 1.4, r + 0.5), BUILT.roof, l.x, l.y, floor + 2.7, front + Math.PI / 8, spot(l.x, l.y))
  kit.add(SHAPES.bead, BUILT.cream, l.x, l.y, floor + 4.2, 0, 0.18, 0.18, 0.18)
  const glow = kit.lit(BUILT.shoji, GLOWS.low)
  kit.add(kit.cuboid(0.4, 0.5, 0.4), glow, l.x, l.y, floor + 2)
  if (stage === 3)
    for (let k = 0; k < 4; k++) {
      const a = front + (k / 4) * TAU + Math.PI / 4
      kit.add(SHAPES.bead, glow, l.x + Math.cos(a) * (r + 0.2), l.y + Math.sin(a) * (r + 0.2), floor + 2.5, 0, 0.16, 0.2, 0.16)
    }
  kit.pool('cream', l.x, l.y, floor, 2 * r + 1.6, 2 * r + 1.6)
  kit.shadow(l.x, l.y, h, 2 * r + 1.4, 2 * r + 1.4, true)
  kit.brick('building', l.x, l.y, h)
}

/**
 * A clock tower on its ground `l` (#180), facing its front, the paving `h` up, as one brick: a cream shaft on a stone
 * base, a clock on each of its four sides, lit at night, under a cap of verdigris tiles and a finial; taller at Stage 3.
 */
function clockTower(kit: Kit, l: RowLot, stage: number, h: number) {
  const shaft = stage === 3 ? 4.4 : 3.6
  kit.put(kit.cuboid(1.8, 0.6, 1.8), POND.stone, l.x, l.y, l.ry, 0, 0, h)
  kit.put(kit.cuboid(1.05, shaft, 1.05), BUILT.cream, l.x, l.y, l.ry, 0, 0, h + 0.6)
  const top = h + 0.6 + shaft
  kit.put(kit.cuboid(1.5, 1.4, 1.5), BUILT.cream, l.x, l.y, l.ry, 0, 0, top)
  const face = kit.lit(BUILT.shoji, GLOWS.face)
  for (let k = 0; k < 4; k++) {
    const ry = l.ry + (k * Math.PI) / 2
    kit.put(SHAPES.disc, face, l.x, l.y, ry, 0, 0.76, top + 0.7, 0.5, 0.5, 1)
    kit.put(kit.cuboid(0.05, 0.36, 0.03), BUILT.hands, l.x, l.y, ry, 0, 0.78, top + 0.66)
    kit.put(kit.cuboid(0.26, 0.05, 0.03), BUILT.hands, l.x, l.y, ry, 0.11, 0.78, top + 0.68)
  }
  kit.tiled(SHAPES.pyramid.clone().scale(1.25, 1, 1.25), BUILT.roof, l.x, l.y, top + 1.4, l.ry + Math.PI / 4, spot(l.x, l.y))
  kit.add(SHAPES.bead, BUILT.cream, l.x, l.y, top + 2.45, 0, 0.12, 0.12, 0.12)
  kit.shadow(l.x, l.y, h, 2.2, 2.2, false, l.ry)
  kit.brick('building', l.x, l.y, h)
}

/**
 * A kiosk at `(x, y)` facing `ry`, the paving `h` up (#180), as one brick: a cream booth under a hipped roof of verdigris
 * tiles, a window along its front over a counter, lit at night, which leaves its light before it.
 */
function kiosk(kit: Kit, x: number, y: number, ry: number, h: number) {
  kit.put(kit.cuboid(2.2, 2.3, 1.8), BUILT.cream, x, y, ry, 0, 0, h)
  kit.put(kit.cuboid(1.7, 0.85, 0.05), kit.lit(BUILT.shoji, GLOWS.band), x, y, ry, 0, 0.92, h + 1.05)
  kit.put(kit.cuboid(2, 0.08, 0.4), WOOD.pale, x, y, ry, 0, 1.05, h + 0.95)
  kit.tiled(kit.hip(2.3, 2.7, 0.7), BUILT.roof, ...to(x, y, ry, 0, 0.1), h + 2.3, ry, spot(x, y))
  kit.pool('window', ...to(x, y, ry, 0, 1.8), h, 3, 2.2, ry)
  kit.shadow(x, y, h, 2.6, 2.2, false, ry)
  kit.brick('building', x, y, h)
}
