import { mulberry32 } from '../../sim/demand'
import { middle, type Vec } from '../../sim/geometry'
import { area, KERB } from '../blocks'
import { SHAPES, spot } from '../kit'
import { overlay, scatter } from '../landmarks'
import { PATTERN } from '../pattern'
import { drift, pointIn, ROCKS, tufts, tuftSpots, WOOD } from '../props'
import { runs, type ZoneGround } from './ground'

const TAU = Math.PI * 2
const VERGE = '#c8e8a6' // the grass of a Tile with roads only
/** m: how far in from the Block's edge the grass begins, how far it lies above the kerb, and the least a piece on it keeps in from the edge. */
const TURF = { inset: 2.4, thick: 0.16, clear: 3.1 }
/**
 * An unzoned Tile to the Finish (#185), what lies on its grass, each kind drawn from a stream of its own (`salt`).
 * A puddle: the share of Blocks with one, and its mud and its water, which mirrors the sky.
 * Rocks: m² of Block to a cluster.
 * A stump: the share of Blocks with one, its bark and its rings (its cut face is the props' pale timber).
 * Clumps of tufts of tall grass on the open grass: m² of Block to one.
 * Wildflowers: drifts to every 1,000 m² of Block, the flowers in one, how far it spreads (m), and their colours, white
 * and yellow leading.
 */
const PIECES = {
  puddle: { salt: 0x9dd1, share: 0.55, mud: '#b9a57f', water: '#b5d5dd' },
  rocks: { salt: 0x70c4, every: 600 },
  stump: { salt: 0x57a4, share: 0.6, bark: '#8a6446', rings: '#c49a6c' },
  clumps: { salt: 0x7f71, every: 400 },
  flowers: {
    salt: 0xf10e,
    drifts: 3.5,
    count: 16,
    spread: 2.4,
    colours: ['#ffffff', '#f6d36a', '#ffffff', '#c7b8f0', '#f6d36a', '#ff9ab8'],
  },
}

/** A verge being laid: its Block's ground, how far above the road its grass lies, and where its pieces may go. */
interface Verge {
  g: ZoneGround
  /** m above the road the grass lies. */
  h: number
  /** A stream for one kind of piece, seeded from where the Block lies and the kind's `salt`. */
  stream: (salt: number) => () => number
  /** Whether something taking `r` m round `(x, y)` lies on the grass `clear` m in, off what is laid and off a landmark's ground. */
  free: (x: number, y: number, r: number, clear?: number) => boolean
  /** A point of the Block's box from `draw` where something taking `r` m round it may stand, which it then takes; none after 14 tries, as `scatter` gives up. */
  place: (draw: () => number, r: number, clear?: number) => Vec | null
  /** Take `r` m round `p`, which what is laid after keeps off. */
  take: (p: Vec, r: number) => void
}

/**
 * A Block of an unzoned Tile, roads only, and nothing built: rough grass in two tones (surface pattern, on every Tile
 * whatever its Zone's Finish), with a few bushes along its edge, one to about every 500 m², clear of the street trees.
 * To the Finish (#185) a puddle and a stump on some Blocks, clusters of rocks, tufts of tall grass along its edge and in
 * clumps on the open grass, and drifts of wildflowers. It has no Stage: nothing moves, nothing is lit. The bushes draw
 * from the kit's stream as they did; every other piece draws from where the Block lies, keeps off what is laid before
 * it and off a landmark's ground, and what stands claims its ground.
 */
export function verge(g: ZoneGround) {
  const { kit, field, block, kerbsideTrees, reserved } = g
  // The grass wears its pattern though an unzoned Tile has no look to ask for the Finish, and nothing else here does.
  const patterned = kit.patterned
  kit.finish(true)
  overlay(kit, field, block, TURF.inset, TURF.thick, VERGE, PATTERN.rough)
  kit.finish(patterned)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const h = KERB + TURF.thick
  /** What stands or lies on the grass so far, each with the room it takes (m round it). */
  const taken: (Vec & { r: number })[] = kerbsideTrees.map((t) => ({ ...t, r: 1.4 }))
  for (const p of scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 500)), 3.4, 7, 9, kerbsideTrees)) {
    kit.stand(p.x, p.y, 2.2)
    kit.tree(p.x, p.y, h, kit.range(0.3, 0.45), 'round')
    taken.push({ ...p, r: 1.7 })
  }

  const free: Verge['free'] = (x, y, r, clear = TURF.clear) =>
    kit.onGround(x, y, clear) &&
    taken.every((t) => Math.hypot(t.x - x, t.y - y) >= t.r + r) &&
    !reserved.some((b) => x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r)
  const v: Verge = {
    g,
    h,
    stream: (salt) => mulberry32(spot(block.x0, block.y0) ^ salt),
    free,
    take: (p, r) => taken.push({ ...p, r }),
    place: (draw, r, clear) => {
      for (let tries = 0; tries < 14; tries++) {
        const p = pointIn(block, draw)
        if (!free(p.x, p.y, r, clear) || !kit.unclaimed(p.x, p.y, 2 * r, 2 * r)) continue
        taken.push({ ...p, r })
        return p
      }
      return null
    },
  }
  puddle(v)
  rocks(v)
  stump(v)
  edgeTufts(v)
  clumps(v)
  wildflowers(v)
}

/** A puddle on some Blocks, well in from the edge: a few rounds of water run together, each on a rim of mud. */
function puddle({ g: { kit }, h, stream, place }: Verge) {
  const { salt, share, mud, water } = PIECES.puddle
  const draw = stream(salt)
  const at = draw() < share ? place(draw, 2.6, 5.6) : null
  if (!at) return
  const rounds = [{ x: at.x, y: at.y, rx: 1.2 + draw() * 0.6, ry: 0.8 + draw() * 0.5, turn: draw() * TAU }]
  for (let k = 0; k < 2; k++) {
    const [a, out, r] = [draw() * TAU, 0.8 + draw() * 0.5, 0.55 + draw() * 0.4]
    rounds.push({ x: at.x + Math.cos(a) * out, y: at.y + Math.sin(a) * out, rx: r, ry: r * (0.7 + draw() * 0.3), turn: draw() * TAU })
  }
  for (const p of rounds) kit.add(SHAPES.centred, mud, p.x, p.y, h + 0.012, p.turn, p.rx + 0.16, 0.02, p.ry + 0.16)
  for (const p of rounds) kit.add(SHAPES.centred, water, p.x, p.y, h + 0.03, p.turn, p.rx, 0.02, p.ry)
  kit.stand(at.x, at.y, 4.8)
  kit.brick('ground', at.x, at.y, h)
}

/** Rocks in clusters: a boulder half sunk in the grass and a stone or two beside it. */
function rocks({ g: { kit, block }, h, stream, place }: Verge) {
  const draw = stream(PIECES.rocks.salt)
  /** A rock `w` by `d`, its middle a quarter of `tall` above the grass, so that it sits sunk in it. */
  const rock = (x: number, y: number, w: number, d: number, tall: number) =>
    kit.add(SHAPES.bush, ROCKS[Math.floor(draw() * ROCKS.length)], x, y, h + tall * 0.25, draw() * TAU, w / 2, tall, d / 2)
  for (let n = Math.max(1, Math.round(area(block.loop) / PIECES.rocks.every)); n > 0; n--) {
    const at = place(draw, 1.8)
    if (!at) continue
    rock(at.x, at.y, 1.3 + draw() * 0.7, 1 + draw() * 0.5, 0.5 + draw() * 0.3)
    for (let k = draw() < 0.5 ? 1 : 2; k > 0; k--) {
      const [a, out] = [draw() * TAU, 0.95 + draw() * 0.35]
      rock(at.x + Math.cos(a) * out, at.y + Math.sin(a) * out, 0.55 + draw() * 0.3, 0.45 + draw() * 0.25, 0.24 + draw() * 0.14)
    }
    kit.stand(at.x, at.y, 3.6)
    kit.brick('tree', at.x, at.y, h)
  }
}

/** A stump on some Blocks, a Block-zoom prop: bark, its cut face and the rings at its heart. */
function stump({ g: { kit }, h, stream, place }: Verge) {
  const { salt, share, bark, rings } = PIECES.stump
  const draw = stream(salt)
  const at = draw() < share ? place(draw, 0.9) : null
  if (!at) return
  const [r, tall] = [0.34 + draw() * 0.1, 0.32 + draw() * 0.16]
  kit.stand(at.x, at.y, 1)
  kit.blockZoomProps(() => {
    kit.add(SHAPES.cylinder, bark, at.x, at.y, h, 0, r, tall, r)
    kit.add(SHAPES.cylinder, WOOD.pale, at.x, at.y, h + tall, 0, r - 0.05, 0.02, r - 0.05)
    kit.add(SHAPES.cylinder, rings, at.x + 0.03, at.y - 0.02, h + tall + 0.02, 0, r * 0.45, 0.01, r * 0.45)
    kit.brick('tree', at.x, at.y, h)
  })
}

/** Tufts of tall grass along each straight side of the Block, so that no pavement beside the grass stands empty (rule 3). */
function edgeTufts({ g, h, free, take }: Verge) {
  for (const run of runs(g, TURF.clear)) {
    const line = [run.a, { x: run.a.x + run.ux * run.len, y: run.a.y + run.uy * run.len }]
    const spots = tuftSpots(g.kit, line, (q) => free(q.x, q.y, 0.5, TURF.clear - 0.3))
    for (const q of spots) take(q, 0.5)
    if (spots.length) tufts(g.kit, spots, h)
  }
}

/** Tufts of tall grass in clumps of two to four on the open grass. */
function clumps({ g: { kit, block }, h, stream, place }: Verge) {
  const draw = stream(PIECES.clumps.salt)
  for (let n = Math.round(area(block.loop) / PIECES.clumps.every); n > 0; n--) {
    const at = place(draw, 1.6, 4)
    if (!at) continue
    const spots = [at]
    for (let k = 1 + Math.floor(draw() * 3); k > 0; k--) {
      const [a, out] = [draw() * TAU, 0.6 + draw() * 0.5]
      spots.push({ x: at.x + Math.cos(a) * out, y: at.y + Math.sin(a) * out })
    }
    for (const q of spots) kit.stand(q.x, q.y, 0.8)
    tufts(kit, spots, h)
  }
}

/** Drifts of wildflowers through the grass, each mostly of one colour, round what stands and off the water. */
function wildflowers({ g: { kit, block }, h, stream, free }: Verge) {
  const draw = stream(PIECES.flowers.salt)
  for (let n = Math.round((PIECES.flowers.drifts * area(block.loop)) / 1000); n > 0; n--)
    drift(kit, draw, block, h, PIECES.flowers, (p) => free(p.x, p.y, 0.3, TURF.inset + 0.4))
}
