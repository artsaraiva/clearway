import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/demand'
import { middle, type Bounds, type Vec } from '../sim/geometry'
import type { Sim } from '../sim/sim'
import type { Point } from '../sim/spec'
import { block, pavement, wide } from './blocks'
import type { Field } from './field'
import { blockSeed, fillBlock } from './fill'
import { createKit, type Brick, type Kit, type Materials, type Part } from './kit'
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
 * material. It only ever adds: the Blocks of a piece are cut within it from the network as it stands when the piece is
 * laid, and each Block is filled from its own seed, so nothing laid later changes them. A Tile's Roads all end at its
 * cell's edge, so its cell comes out the same whenever it is laid. `whole` is the ground the slab may grow to cover.
 * ponytail: each build adds about six meshes, which is nothing for a handful of them; past a dozen or so, merge the
 * builds' meshes of each material.
 */
export function createScenery(scenery: Scenery, field: Field, materials: Materials, whole: Bounds) {
  const laid: Bounds[] = []

  /** Build the pieces of slab `pieces` under `sim`'s network, a step at a time: the field, the slab, each Block, then each material's mesh. */
  function* build({ net, spec }: Sim, pieces: Bounds[], tagged: boolean): Building {
    const earlier = [...laid]
    laid.push(...pieces)
    field.lay(net, spec, pieces, earlier)
    yield

    const parts: Part[] = []
    const bricks: BuiltBrick[] = []
    /** Take over what a kit built, its bricks standing on Block `index`. */
    const take = (kit: Kit, index: number) => {
      const done = kit.done()
      for (const part of done.parts) parts.push({ ...part, brick: part.brick + bricks.length })
      bricks.push(...done.bricks.map((brick) => ({ ...brick, block: index })))
    }
    const slab = createKit(mulberry32(0), materials)
    pieces.forEach((piece, i) => laySlab(slab, piece, [...earlier, ...pieces.slice(0, i)]))
    take(slab, -1)
    const blocks = field.outlines(0, pieces).map(block).filter(wide)
    yield

    const surroundings = { net, spec, scenery, field, extent: whole }
    for (const [i, b] of blocks.entries()) {
      const kit = createKit(mulberry32(blockSeed(scenery, b)), materials)
      pavement(kit, b)
      fillBlock(kit, b, surroundings)
      take(kit, i)
      yield
    }

    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
    for (const { geometry, material, brick } of parts) {
      if (tagged)
        geometry.setAttribute('brick', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(brick), 1))
      ;(byMaterial.get(material) ?? byMaterial.set(material, []).get(material)!).push(geometry)
    }
    const meshes: THREE.Mesh[] = []
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

  return {
    /** Lay `pieces` under `sim`'s network, all at once. Returns their meshes. */
    lay(sim: Sim, pieces: Bounds[]): THREE.Mesh[] {
      return finish(build(sim, pieces, false)).meshes
    },

    /**
     * Build what the pieces a Rebuild adds bring, for its animation, a step at a time. It lays their part of the field
     * as it goes.
     */
    add(sim: Sim, pieces: Bounds[]): Building {
      return build(sim, pieces, true)
    },
  }
}
