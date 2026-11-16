import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Cell, Zone } from '../city/city'
import { mulberry32 } from '../sim/demand'
import { middle, sameBounds, type Bounds, type Vec } from '../sim/geometry'
import type { Sim } from '../sim/sim'
import type { Point } from '../sim/spec'
import { cellAt } from '../sim/tiles'
import { block, pavement, wide } from './blocks'
import type { Field } from './field'
import { blockSeed, fillBlock } from './fill'
import { createKit, type Brick, type Kit, type Materials, type Part, type Stages } from './kit'
import { laySlab } from './slab'

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

/** A brick of a build, with the Block it stands on: its index in the build's `blocks`, or -1 for the slab itself. */
export interface BuiltBrick extends Brick {
  block: number
}

/** What one placement adds to the static scenery: its pieces of slab and the Blocks on them. */
export interface Build {
  /** One mesh per material. In a build for the Rebuild animation, each vertex carries its brick's index as attribute `brick`. */
  meshes: THREE.Mesh[]
  bricks: BuiltBrick[]
  /** The middle of each Block built. */
  blocks: { middle: Vec }[]
  pieces: Bounds[]
}

/** A build in progress: each call of `next` takes one step of it, and the last returns the build. */
export type Building = Generator<void, Build>

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
  stageOf: (cell: Cell) => number,
) {
  /** The pieces laid, in order, each with the meshes of the build that laid it. Pieces laid together share them. */
  const laid: { piece: Bounds; meshes: THREE.Mesh[] }[] = []
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
    /** Take over what a kit built, its bricks standing on Block `index`. */
    const take = (kit: Kit, index: number) => {
      const done = kit.done()
      for (const part of done.parts) parts.push({ ...part, brick: part.brick + bricks.length })
      bricks.push(...done.bricks.map((brick) => ({ ...brick, block: index })))
    }
    const slab = createKit(mulberry32(0), materials)
    pieces.forEach((piece, i) => laySlab(slab, piece, [...before, ...pieces.slice(0, i)]))
    take(slab, -1)
    const blocks = field.outlines(0, pieces).map(block).filter(wide)
    yield

    for (const [i, b] of blocks.entries()) {
      const kit = createKit(mulberry32(blockSeed(scenery, b)), materials)
      const cell = cellAt(middle(b))
      kit.stages(stages ?? { from: stageOf(cell), to: stageOf(cell) })
      pavement(kit, b)
      fillBlock(kit, b, { net, spec, scenery, field, zone: zoneOf(cell) })
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
      const merged = mergeGeometries(geometries)
      if (!merged) throw new Error(`parts of one material do not share their vertex attributes (${material.type})`)
      for (const g of geometries) g.dispose()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = !material.transparent
      mesh.receiveShadow = true
      if (material.transparent) mesh.renderOrder = 2
      meshes.push(mesh)
      yield
    }
    return { meshes, bricks, blocks: blocks.map((b) => ({ middle: middle(b) })), pieces }
  }

  /** Start a build of `pieces` as the last pieces laid. */
  const append = (sim: Sim, pieces: Bounds[], tagged: boolean) => {
    const [before, meshes] = [laid.map((l) => l.piece), [] as THREE.Mesh[]]
    laid.push(...pieces.map((piece) => ({ piece, meshes })))
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
    laid[at] = { piece, meshes }
    const before = laid.slice(0, at).map((l) => l.piece)
    return { old, building: build(sim, [piece], true, before, meshes, relay, stages) }
  }

  return {
    /** Lay `pieces` under `sim`'s network, all at once. Returns their meshes. */
    lay(sim: Sim, pieces: Bounds[]): THREE.Mesh[] {
      return finish(append(sim, pieces, false)).meshes
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

    /** Free the meshes of a build that is out of the scene. Their materials are the kit's, which stay. */
    discard(meshes: THREE.Mesh[]) {
      for (const mesh of meshes) mesh.geometry.dispose()
    },
  }
}
