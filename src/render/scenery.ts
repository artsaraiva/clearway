import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Cell, Zone } from '../city/city'
import type { Stage } from '../game/game'
import { mulberry32 } from '../sim/demand'
import { middle, sameBounds, type Bounds, type Vec } from '../sim/geometry'
import type { Sim } from '../sim/sim'
import type { Point } from '../sim/spec'
import { cellAt } from '../sim/tiles'
import { block, pavement, wide, type Block } from './blocks'
import { inside, type Field } from './field'
import { blockSeed, fillBlock } from './fill'
import { createKit, type Brick, type Kit, type Materials, type Part, type Stages } from './kit'
import { standPoles, stringWires, type LineEnd } from './poles'
import type { Beacon, Flag, Mover, Plume, Pool, Sway } from './movers'
import { laySlab } from './slab'
import { markPlate } from './streets'
import { LOOKS } from './zones'

/** Authored scenery standing at a point. `name` is its label on the map. */
export interface Landmark {
  type: 'tower'
  name: string
  at: Point
}

/** A Block that is not split into lots: the one around `at`. A park has its pond at `at`. */
export interface SpecialBlock {
  type: 'plaza' | 'park'
  name?: string
  at: Point
}

/** What the seed adds where the scenery authors nothing. It is drawn from the seed and where things lie, never from what is laid. */
export interface Seeded {
  /**
   * Cells on a side of the squares the map is cut into. Each square has one tower landmark, in one corner of one of its
   * cells: it stands once a Tile laid there, of a Zone that takes landmarks, leaves a Block in that corner with room
   * for it.
   */
  landmarks: number
  /** The chance a row or column of cells is an avenue, its Roads lined with street trees. */
  avenue: number
}

/** What the seed adds to a City built from Tiles, which authors nothing. */
export const SEEDED: Seeded = { landmarks: 4, avenue: 0.3 }

// m beyond a Block's bounds within which a utility pole stands round it (#176): more than the street furniture, which
// stands within a metre of the Block's edge, keeps off a pole (`./streets`), so a pole farther out never matters to it.
const POLES_ROUND = 3

/** What stands on the Blocks. */
export interface Scenery {
  /** The first theme is a city; countryside and harbor join the type when their fills exist. */
  theme: 'city'
  /** Seed of the Block fill: the same seed gives the same town. */
  seed: number
  landmarks: Landmark[]
  blocks: SpecialBlock[]
  /** Street names by Road id. Roads that share a name are one street. */
  streets: Record<string, string>
  /** Roads lined with street trees. */
  avenues: string[]
  /** What the seed adds. None: only what is authored. */
  seeded?: Seeded
}

/**
 * What the scene check (#191) reads of a build, as each kit is done: a label for each brick of what built it, and every
 * kit's output with the Block it filled (none for the slab's, the poles' and the wires' kits). Nothing drawn changes.
 */
export interface Watch {
  label: () => string
  took: (built: ReturnType<Kit['done']>, block: Block | null) => void
}

/** A brick of a build, with the Block it stands on: its index in the build's `blocks`, or -1 for the slab itself. */
export interface BuiltBrick extends Brick {
  block: number
}

/** What one placement adds to the static scenery: its pieces of slab and the Blocks on them. */
export interface Build {
  /** One mesh per material. In a build for the Rebuild animation, each vertex carries its brick's index as attribute `brick`. */
  meshes: THREE.Mesh[]
  bricks: BuiltBrick[]
  /** What moves on its own, each riding one of `bricks` (`./movers`). */
  movers: Mover[]
  /** The chimneys' smoke, each riding its chimney's brick (`./movers`). */
  plumes: Plume[]
  /** The roof beacons, each riding its building's brick (`./movers`). */
  beacons: Beacon[]
  /** What hangs and sways in the wind, each riding its building's brick (`./movers`). */
  sways: Sway[]
  /** The flags, each riding its pole's brick (`./movers`). */
  flags: Flag[]
  /** The pools of light on the ground, each riding the brick of what lights it (`./movers`, #174). */
  pools: Pool[]
  /** The middle of each Block built. */
  blocks: { middle: Vec }[]
  pieces: Bounds[]
}

/** A build in progress: each call of `next` takes one step of it, and the last returns the build. */
export type Building = Generator<void, Build>

/**
 * Give every geometry of one material each vertex attribute that any of them has, zero where it had none, so that they
 * merge: on a Tile built to the level of finish only what wears a pattern carries `pattern` (#174). A build with no
 * pattern carries none, and its vertices read none: WebGL reads an attribute a geometry lacks as zero, and nothing in
 * the game sets another default (three would only for a ShaderMaterial's `defaultAttributeValues`).
 */
function wearAlike(geometries: THREE.BufferGeometry[]) {
  const sizes = new Map<string, number>()
  for (const g of geometries) for (const [name, a] of Object.entries(g.attributes)) sizes.set(name, a.itemSize)
  for (const g of geometries) {
    for (const [name, size] of sizes)
      if (!g.getAttribute(name)) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * size), size))
  }
}

/** Take every step of a build that is left, at once. */
export function finish(building: Building): Build {
  for (;;) {
    const step = building.next()
    if (step.done) return step.value
  }
}

/**
 * The static scenery, a few pieces of slab at a time: the pieces and the Blocks on them, merged into one mesh per
 * material. The Blocks of a piece are cut within it from the network as it stands when the piece is laid, and each
 * Block is filled from its own seed as the Zone and the Stage of its Tile have it, which `zoneOf` and `stageOf` read
 * from the game as it stands when the piece is built, so nothing laid later changes them. A Tile's Roads all end at its
 * cell's edge, so its cell comes out the same whenever it is laid, and a Swap, a Rezoning, an Undo or a Stage-up can
 * lift one piece and leave the rest.
 * ponytail: each build adds about six meshes, which is nothing for a handful of them; past a few dozen Tiles, merge
 * the builds' meshes of each material (and split them again for the piece a Swap lifts).
 */
export function createScenery(
  scenery: Scenery,
  field: Field,
  materials: Materials,
  zoneOf: (cell: Cell) => Zone | undefined,
  stageOf: (cell: Cell) => Stage,
  watch?: Watch,
) {
  /**
   * The pieces laid, in order, each with the meshes of the build that laid it (pieces laid together share them) and the
   * poles at the ends of its Tile's lines of utility poles, which the wires across its seams hang from.
   */
  const laid: { piece: Bounds; meshes: THREE.Mesh[]; ends: LineEnd[] }[] = []
  const others = (pieces: Bounds[]) => laid.map((l) => l.piece).filter((p) => !pieces.some((q) => sameBounds(p, q)))

  /**
   * Build the pieces of slab `pieces` under `sim`'s network, a step at a time: the field, the slab, each Block, then
   * each material's mesh. `before` are the pieces whose slab was laid first: the new slab fills in around them.
   * `relay` lays the pieces' field again first, which only a change to the network needs. `stages`, for a Stage-up of
   * one Tile's piece, are the Stages it goes between, and the build holds both; otherwise each Block is built at its
   * Tile's Stage.
   */
  function* build(
    { net, spec }: Sim,
    pieces: Bounds[],
    tagged: boolean,
    before: Bounds[],
    meshes: THREE.Mesh[],
    relay = true,
    stages?: Stages,
  ): Building {
    if (relay) {
      field.lay(net, spec, pieces, others(pieces))
      yield
    }

    const parts: Part[] = []
    const bricks: BuiltBrick[] = []
    const movers: Mover[] = []
    const plumes: Plume[] = []
    const beacons: Beacon[] = []
    const sways: Sway[] = []
    const flags: Flag[] = []
    const pools: Pool[] = []
    /** Take over what a kit built, its bricks standing on Block `index`. */
    const take = (kit: Kit, index: number) => {
      const done = kit.done()
      watch?.took(done, index < 0 ? null : blocks[index])
      for (const part of done.parts) parts.push({ ...part, brick: part.brick + bricks.length })
      for (const mover of done.movers) movers.push({ ...mover, brick: mover.brick + bricks.length })
      for (const plume of done.plumes) plumes.push({ ...plume, brick: plume.brick + bricks.length })
      for (const beacon of done.beacons) beacons.push({ ...beacon, brick: beacon.brick + bricks.length })
      for (const sway of done.sways) sways.push({ ...sway, brick: sway.brick + bricks.length })
      for (const flag of done.flags) flags.push({ ...flag, brick: flag.brick + bricks.length })
      for (const pool of done.pools) pools.push({ ...pool, brick: pool.brick + bricks.length })
      bricks.push(...done.bricks.map((brick) => ({ ...brick, block: index })))
    }
    const slab = createKit(mulberry32(0), materials, watch?.label)
    pieces.forEach((piece, i) => laySlab(slab, piece, [...before, ...pieces.slice(0, i)]))
    take(slab, -1)
    const blocks = field.outlines(0, pieces).map(block).filter(wide)
    yield

    // Each Tile's utility poles and the wires between them, on a kit of their own so that no Block's stream changes.
    // Where the kerbside is dressed, every Tile has street lights and marks on its road plate (#175, #176), as its
    // Blocks' kerbsides have their street furniture, which keeps off the poles.
    const poles = createKit(mulberry32(0), materials, watch?.label)
    const posts: Vec[] = []
    for (const piece of pieces) {
      const stood = standPoles(poles, cellAt(middle(piece)), net, spec, field, blocks, scenery, poles.dressed)
      if (poles.dressed) markPlate(poles, piece, net)
      posts.push(...stood.posts)
      const entry = laid.find((l) => sameBounds(l.piece, piece))
      if (entry) entry.ends = stood.ends
    }
    take(poles, -1)
    yield

    for (const [i, b] of blocks.entries()) {
      const kit = createKit(mulberry32(blockSeed(scenery, b)), materials, watch?.label)
      const cell = cellAt(middle(b))
      kit.stages(stages ?? { from: stageOf(cell), to: stageOf(cell) })
      kit.ground((x, y, clear) => field.sample(x, y) >= clear && inside(b.loop, x, y))
      const zone = zoneOf(cell)
      kit.finish(!!(zone && LOOKS[zone.id].finish))
      pavement(kit, b)
      // Only the poles round the Block, so that its street furniture's checks scan a handful, not every pole of the build.
      const round = posts.filter(
        (p) => p.x > b.x0 - POLES_ROUND && p.x < b.x1 + POLES_ROUND && p.y > b.y0 - POLES_ROUND && p.y < b.y1 + POLES_ROUND,
      )
      fillBlock(kit, b, { net, spec, scenery, field, zone, poles: round })
      take(kit, i)
      yield
    }

    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const { geometry, material, brick } of parts) {
      if (tagged)
        geometry.setAttribute('brick', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(brick), 1))
      ;(byMaterial.get(material) ?? byMaterial.set(material, []).get(material)!).push(geometry)
    }
    for (const [material, geometries] of byMaterial) {
      wearAlike(geometries)
      const merged = mergeGeometries(geometries)
      if (!merged) throw new Error(`parts of one material do not share their vertex attributes (${material.type})`)
      for (const g of geometries) g.dispose()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = !material.transparent
      if (material === materials.close) mesh.customDepthMaterial = materials.closeDepth
      mesh.receiveShadow = true
      if (material.transparent) mesh.renderOrder = 2
      meshes.push(mesh)
      yield
    }
    return { meshes, bricks, movers, plumes, beacons, sways, flags, pools, blocks: blocks.map((b) => ({ middle: middle(b) })), pieces }
  }

  /** Start a build of `pieces` as the last pieces laid. */
  const append = (sim: Sim, pieces: Bounds[], tagged: boolean) => {
    const [before, meshes] = [laid.map((l) => l.piece), [] as THREE.Mesh[]]
    laid.push(...pieces.map((piece) => ({ piece, meshes, ends: [] })))
    return build(sim, pieces, tagged, before, meshes)
  }

  /**
   * Start a build of the piece of a placed Tile in the place of the build that laid it, for its animation. `old` are
   * that build's meshes: they come out of the scene whenever the caller likes, and then go to `discard`. `relay` lays
   * the piece's field again, as a Swap's new network needs, and `stages` are a Stage-up's.
   */
  const replace = (sim: Sim, piece: Bounds, relay: boolean, stages?: Stages): { old: THREE.Mesh[]; building: Building } => {
    const at = laid.findIndex((l) => sameBounds(l.piece, piece))
    const old = laid[at].meshes
    const meshes: THREE.Mesh[] = []
    laid[at] = { piece, meshes, ends: [] }
    const before = laid.slice(0, at).map((l) => l.piece)
    return { old, building: build(sim, [piece], true, before, meshes, relay, stages) }
  }

  return {
    /** Lay `pieces` under `sim`'s network, all at once. */
    lay(sim: Sim, pieces: Bounds[]): Build {
      return finish(append(sim, pieces, false))
    },

    /**
     * Build what the pieces a Rebuild adds bring, for its animation, a step at a time. It lays their part of the field
     * as it goes.
     */
    add(sim: Sim, pieces: Bounds[]): Building {
      return append(sim, pieces, true)
    },

    /** Build the piece of a Tile that a Swap replaced, under the Sim the Swap rebuilt, as `replace` does. */
    swap(sim: Sim, piece: Bounds): { old: THREE.Mesh[]; building: Building } {
      return replace(sim, piece, true)
    },

    /**
     * Build the piece of a Tile that a Rezoning changed, under `sim`, the Sim that runs on, as `replace` does. Its
     * network is the same, so its field and slab come out as they were and only its Blocks' fill changes.
     */
    rezone(sim: Sim, piece: Bounds): { old: THREE.Mesh[]; building: Building } {
      return replace(sim, piece, false)
    },

    /**
     * Build the piece of a Tile that went from Stage `stages.from` to `stages.to`, under `sim`, the Sim that runs on, as
     * `rezone` does. The build holds both Stages' buildings, each brick marked with its fate, so that the old can give
     * way to the new lot by lot.
     */
    stageUp(sim: Sim, piece: Bounds, stages: Stages): { old: THREE.Mesh[]; building: Building } {
      return replace(sim, piece, false, stages)
    },

    /** Take the piece of a Tile off the slab, as an Undo does. Returns its meshes, for the caller to take out of the scene and `discard`. */
    remove(piece: Bounds): THREE.Mesh[] {
      const at = laid.findIndex((l) => sameBounds(l.piece, piece))
      const [{ meshes }] = laid.splice(at, 1)
      field.lift([piece], others([piece]))
      return meshes
    },

    /**
     * The wires across the seams between the pieces laid, but for `except`'s, as one mesh: one span from each line's last
     * pole to the next Tile's, on each Road two pieces share. Null if there are none. Built from the poles as they
     * stand, so it is right whatever was laid, swapped or taken off since.
     * ponytail: every seam's wires are strung again each time, two tubes a seam, which is nothing at a few dozen
     * Tiles and a few ms at several hundred. Keep each piece's seams in a mesh of its own and string only the ones a
     * change touches if a big City's Rebuild hitches.
     */
    seams(except?: Bounds | null): THREE.Mesh | null {
      const kit = createKit(mulberry32(0), materials)
      const byRoad = new Map<string, LineEnd[]>()
      for (const { piece, ends } of laid) {
        if (except && sameBounds(piece, except)) continue
        for (const end of ends) byRoad.set(end.road, [...(byRoad.get(end.road) ?? []), end])
      }
      for (const [a, b] of byRoad.values()) if (b) stringWires(kit, a.post, b.post)
      const { parts } = kit.done()
      if (!parts.length) return null
      const mesh = new THREE.Mesh(mergeGeometries(parts.map((p) => p.geometry))!, materials.solid)
      for (const p of parts) p.geometry.dispose()
      mesh.castShadow = mesh.receiveShadow = true
      return mesh
    },

    /** Free the meshes of a build that is out of the scene. Their materials are the kit's, which stay. */
    discard(meshes: THREE.Mesh[]) {
      for (const mesh of meshes) mesh.geometry.dispose()
    },
  }
}
