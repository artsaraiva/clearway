import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/demand'
import { revealed, type District } from '../sim/district'
import { extent, middle, type Bounds, type Vec } from '../sim/geometry'
import { buildNetwork } from '../sim/network'
import { block, pavement, wide } from './blocks'
import type { Field } from './field'
import { blockSeed, fillBlock } from './fill'
import { createKit, type Brick, type Kit, type Materials, type Part } from './kit'
import { laySlab } from './slab'

/** A brick of a build, with the Block it stands on: its index in the build's `blocks`, or -1 for the slab itself. */
export interface BuiltBrick extends Brick {
  block: number
}

/** What one Level adds to the static scenery: its pieces of slab and the Blocks on them. */
export interface Build {
  /** One mesh per material. In a build for the Reveal animation, each vertex carries its brick's index as attribute `brick`. */
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
 * The static scenery, one Level at a time: each Level's pieces of slab and the Blocks on them, merged into one mesh per
 * material. A Reveal only ever adds: a Level's Blocks are cut within its own pieces from the network as that Level has
 * it, and each Block is filled from its own seed, so no later Level changes an earlier one's, and a Level comes out the
 * same whether it is Revealed in place or opened directly.
 * ponytail: each Level adds about six meshes, which is nothing for a handful of Levels; past a dozen or so, merge the
 * Levels' meshes of each material.
 */
export function createScenery(district: District, field: Field, materials: Materials) {
  const nets = district.levels.map((_, n) => buildNetwork(district, revealed(district, n)))
  const whole = extent(district.levels.flatMap((level) => level.pieces))

  /** Build Level `level`'s part, a step at a time: the field, the slab, each Block, then each material's mesh. */
  function* build(level: number, tagged: boolean): Building {
    const { pieces } = district.levels[level]
    const earlier = district.levels.slice(0, level).flatMap((l) => l.pieces)
    const net = nets[level]
    field.lay(net, pieces, earlier)
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

    const surroundings = { net, district, field, extent: whole }
    for (const [i, b] of blocks.entries()) {
      const kit = createKit(mulberry32(blockSeed(district, b)), materials)
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
    /** Lay the slab Revealed up to Level `level` from scratch, all at once. Returns its meshes. */
    lay(level: number): THREE.Mesh[] {
      return district.levels.slice(0, level + 1).flatMap((_, n) => finish(build(n, false)).meshes)
    },

    /**
     * Build what the Reveal of Level `level` adds, for the Reveal animation, a step at a time, so that it can be made
     * ahead while the earlier Level plays. It lays the Level's part of the field as it goes.
     */
    reveal(level: number): Building {
      return build(level, true)
    },
  }
}
