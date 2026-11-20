import { mulberry32 } from '../../sim/demand'
import { middle, type Vec } from '../../sim/geometry'
import { area, KERB } from '../blocks'
import { SHAPES, spot } from '../kit'
import { overlay, scatter } from '../landmarks'
import { PATTERN } from '../pattern'
import { FLOWER, ROCKS, tufts, WOOD } from '../props'
import { runs, type ZoneGround } from './ground'

const TAU = Math.PI * 2
const VERGE = '#c8e8a6' // the grass of a Tile with roads only
/** m: how far in from the Block's edge the grass begins, how far it lies above the kerb, and the least a piece on it keeps in from the edge. */
const GRASS = { inset: 2.4, thick: 0.16, clear: 3.1 }
/**
 * An unzoned Tile to the Finish (#185), what lies on its grass, each kind drawn from a stream of its own.
 * A puddle: the share of Blocks with one, and its mud and its water, which mirrors the sky.
 * Rocks: m² of Block to a cluster. A stump: the share of Blocks with one, its bark and its rings (its cut face is the
 * props' pale timber).
 * Tufts of tall grass: m from one to the next along the Block's edge, least and most, and m² of Block to a clump of
 * them on the open grass.
 * Wildflowers: drifts to every 1,000 m² of Block, the flowers in one, how far it spreads (m), and their colours, white
 * and yellow leading.
 */
const WILD = {
  puddle: { share: 0.55, mud: '#b9a57f', water: '#b5d5dd' },
  rocks: 600,
  stump: { share: 0.6, bark: '#8a6446', rings: '#c49a6c' },
  tufts: { along: [4.5, 7], clump: 400 },
  flowers: { drifts: 3.5, count: 16, spread: 2.4, colours: ['#ffffff', '#f6d36a', '#ffffff', '#c7b8f0', '#f6d36a', '#ff9ab8'] },
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
  const patterned = kit.patterned
  kit.finish(true) // the grass wears its pattern, though an unzoned Tile has no look to ask for the Finish
  overlay(kit, field, block, GRASS.inset, GRASS.thick, VERGE, PATTERN.rough)
  kit.finish(patterned)
  const mid = middle(block)
  kit.brick('ground', mid.x, mid.y, KERB)
  const ground = KERB + GRASS.thick
  /** What stands or lies on the grass so far, each with the room it takes (m round it). */
  const taken: (Vec & { r: number })[] = kerbsideTrees.map((t) => ({ ...t, r: 1.4 }))
  for (const p of scatter(kit, field, block, Math.max(2, Math.round(area(block.loop) / 500)), 3.4, 7, 9, kerbsideTrees)) {
    kit.stand(p.x, p.y, 2.2)
    kit.tree(p.x, p.y, KERB + GRASS.thick, kit.range(0.3, 0.45), 'round')
    taken.push({ ...p, r: 1.7 })
  }

  const stream = (salt: number) => mulberry32(spot(block.x0, block.y0) ^ salt)
  /** Whether something taking `r` m round `(x, y)` lies on the grass `clear` m in, off what is laid and off a landmark's ground. */
  const free = (x: number, y: number, r: number, clear = GRASS.clear) =>
    kit.onGround(x, y, clear) &&
    taken.every((t) => Math.hypot(t.x - x, t.y - y) >= t.r + r) &&
    !reserved.some((b) => x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r)
  /** A point of the Block's box from `draw` where something taking `r` m round it may stand, which it then takes; none after 14 tries. */
  const place = (draw: () => number, r: number, clear = GRASS.clear): Vec | null => {
    for (let tries = 0; tries < 14; tries++) {
      const [x, y] = [block.x0 + draw() * (block.x1 - block.x0), block.y0 + draw() * (block.y1 - block.y0)]
      if (!free(x, y, r, clear) || !kit.unclaimed(x, y, 2 * r, 2 * r)) continue
      taken.push({ x, y, r })
      return { x, y }
    }
    return null
  }

  // A puddle on some Blocks, well in from the edge: a few rounds of water run together, each on a rim of mud.
  {
    const draw = stream(0x9dd1)
    const at = draw() < WILD.puddle.share ? place(draw, 2.6, 5.6) : null
    if (at) {
      const rounds = [{ x: at.x, y: at.y, rx: 1.2 + draw() * 0.6, ry: 0.8 + draw() * 0.5, turn: draw() * TAU }]
      for (let k = 0; k < 2; k++) {
        const [a, out, r] = [draw() * TAU, 0.8 + draw() * 0.5, 0.55 + draw() * 0.4]
        rounds.push({ x: at.x + Math.cos(a) * out, y: at.y + Math.sin(a) * out, rx: r, ry: r * (0.7 + draw() * 0.3), turn: draw() * TAU })
      }
      for (const p of rounds) kit.add(SHAPES.centred, WILD.puddle.mud, p.x, p.y, ground + 0.012, p.turn, p.rx + 0.16, 0.02, p.ry + 0.16)
      for (const p of rounds) kit.add(SHAPES.centred, WILD.puddle.water, p.x, p.y, ground + 0.03, p.turn, p.rx, 0.02, p.ry)
      kit.stand(at.x, at.y, 4.8)
      kit.brick('ground', at.x, at.y, ground)
    }
  }

  // Rocks in clusters: a boulder half sunk in the grass and a stone or two beside it.
  {
    const draw = stream(0x70c4)
    for (let n = Math.max(1, Math.round(area(block.loop) / WILD.rocks)); n > 0; n--) {
      const at = place(draw, 1.6)
      if (!at) continue
      const rock = (x: number, y: number, w: number, d: number, tall: number) =>
        kit.add(SHAPES.bush, ROCKS[Math.floor(draw() * ROCKS.length)], x, y, ground + tall * 0.25, draw() * TAU, w / 2, tall, d / 2)
      rock(at.x, at.y, 1.3 + draw() * 0.7, 1 + draw() * 0.5, 0.5 + draw() * 0.3)
      for (let k = draw() < 0.5 ? 1 : 2; k > 0; k--) {
        const [a, out] = [draw() * TAU, 0.95 + draw() * 0.35]
        rock(at.x + Math.cos(a) * out, at.y + Math.sin(a) * out, 0.55 + draw() * 0.3, 0.45 + draw() * 0.25, 0.24 + draw() * 0.14)
      }
      kit.stand(at.x, at.y, 3)
      kit.brick('tree', at.x, at.y, ground)
    }
  }

  // A stump on some Blocks, a Block-zoom prop: bark, its cut face and the rings at its heart.
  {
    const draw = stream(0x57a4)
    const at = draw() < WILD.stump.share ? place(draw, 0.9) : null
    if (at) {
      const [r, tall] = [0.34 + draw() * 0.1, 0.32 + draw() * 0.16]
      kit.stand(at.x, at.y, 1)
      kit.blockZoomProps(() => {
        kit.add(SHAPES.cylinder, WILD.stump.bark, at.x, at.y, ground, 0, r, tall, r)
        kit.add(SHAPES.cylinder, WOOD.pale, at.x, at.y, ground + tall, 0, r - 0.05, 0.02, r - 0.05)
        kit.add(SHAPES.cylinder, WILD.stump.rings, at.x + 0.03, at.y - 0.02, ground + tall + 0.02, 0, r * 0.45, 0.01, r * 0.45)
        kit.brick('tree', at.x, at.y, ground)
      })
    }
  }

  // Tufts of tall grass along the Block's edge, so that no pavement beside the grass stands empty (rule 3).
  const [least, most] = WILD.tufts.along
  for (const run of runs(g, GRASS.clear)) {
    const draw = mulberry32(spot(run.a.x, run.a.y) ^ 0x7f7)
    const spots: Vec[] = []
    for (let s = 1.5 + draw() * 2; s < run.len - 1; s += least + draw() * (most - least)) {
      const q = { x: run.a.x + run.ux * s, y: run.a.y + run.uy * s }
      if (!free(q.x, q.y, 0.5, GRASS.clear - 0.3) || !kit.unclaimed(q.x, q.y, 0.9, 0.9, 0, 0.3)) continue
      taken.push({ ...q, r: 0.5 })
      kit.stand(q.x, q.y, 0.8)
      spots.push(q)
    }
    if (spots.length) tufts(kit, spots, ground)
  }
  // And in clumps of two to four on the open grass.
  {
    const draw = stream(0x7f71)
    for (let n = Math.round(area(block.loop) / WILD.tufts.clump); n > 0; n--) {
      const at = place(draw, 1.2, 4)
      if (!at) continue
      const spots = [at]
      for (let k = 1 + Math.floor(draw() * 3); k > 0; k--) {
        const [a, out] = [draw() * TAU, 0.6 + draw() * 0.5]
        spots.push({ x: at.x + Math.cos(a) * out, y: at.y + Math.sin(a) * out })
      }
      for (const q of spots) kit.stand(q.x, q.y, 0.8)
      tufts(kit, spots, ground)
    }
  }

  // Drifts of wildflowers through the grass, each mostly of one colour, round what stands and off the water.
  {
    const draw = stream(0xf10e)
    const { drifts, count, spread, colours } = WILD.flowers
    for (let n = Math.round((drifts * area(block.loop)) / 1000); n > 0; n--) {
      const c = { x: block.x0 + draw() * (block.x1 - block.x0), y: block.y0 + draw() * (block.y1 - block.y0) }
      const main = colours[Math.floor(draw() * colours.length)]
      let laid = 0
      for (let f = 0; f < count; f++) {
        const [a, r] = [draw() * TAU, Math.sqrt(draw()) * spread]
        const [colour, lift, turn] = [draw() < 0.8 ? main : colours[0], 0.08 + draw() * 0.14, draw() * TAU]
        const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }
        if (!free(p.x, p.y, 0.3, GRASS.inset + 0.4)) continue
        kit.add(FLOWER, colour, p.x, p.y, ground + lift, turn)
        laid++
      }
      if (laid) kit.brick('tree', c.x, c.y, ground)
    }
  }
}
