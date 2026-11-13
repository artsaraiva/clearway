import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/demand'
import { revealed, type District } from '../sim/district'
import { extent, middle, overlaps, type Bounds, type Vec } from '../sim/geometry'
import { buildNetwork, type Network } from '../sim/network'
import { block, pavement, type Block } from './blocks'
import { changedBy, sameLoop, type Field } from './field'
import { blockSeed, fillBlock } from './fill'
import { createKit, type Brick, type Kit, type Materials, type Part } from './kit'
import { laySlab } from './slab'

/** A brick of a build, with the Block it stands on: its index in the build's `blocks`, or -1 for the slab itself. */
export interface BuiltBrick extends Brick {
  block: number
}

/** What a Reveal's build made, for the Reveal animation to assemble. */
export interface Build {
  /** New meshes, one per material for each group, to add to the scene. Each vertex carries its brick's index as attribute `brick`. */
  meshes: THREE.Mesh[]
  bricks: BuiltBrick[]
  /**
   * The Blocks built: the middle of each, whether it replaces a Block that the Reveal cut again, and whether it comes out
   * just as that Block was (cut again only for lying within reach of the new piece).
   */
  blocks: { middle: Vec; replaces: boolean; unchanged: boolean }[]
  /** The old meshes that held the Blocks cut again, to take away (and dispose) once the new ones come in. */
  replaced: THREE.Mesh[]
  /** The area the Reveal changed: where the field was recomputed and Blocks were cut. */
  region: Bounds
  /** The Level's piece of slab. */
  plate: Bounds
}

/** One mesh per material from parts that share a group, which takes over their geometries. */
function merge(parts: Part[]): THREE.Mesh[] {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
  for (const { geometry, material } of parts) (byMaterial.get(material) ?? byMaterial.set(material, []).get(material)!).push(geometry)
  return [...byMaterial].map(([material, geometries]) => {
    const merged = mergeGeometries(geometries)
    if (!merged) throw new Error(`parts of one material do not share their vertex attributes (${material.type})`)
    for (const g of geometries) g.dispose()
    const mesh = new THREE.Mesh(merged, material)
    mesh.castShadow = !material.transparent
    mesh.receiveShadow = true
    if (material.transparent) mesh.renderOrder = 2
    return mesh
  })
}

/**
 * The static scenery: the slab, its Blocks and everything standing on them, merged into one mesh per material for
 * each group of Blocks that the same later Reveal will cut again. A Reveal lays its own piece of slab and cuts only
 * the Blocks within reach of it: the groups it cuts again are replaced, and the rest of the slab is left as it was.
 * ponytail: each Reveal adds a group or two of about six meshes, which is nothing for a handful of Levels; past a dozen
 * or so, merge the groups that no later Reveal will cut again.
 */
export function createScenery(district: District, field: Field, materials: Materials) {
  const plates = district.levels.map((level) => level.slab)
  const whole = extent(plates)
  const nets = district.levels.map((_, n) => buildNetwork(district, revealed(district, n)))
  // Where each Level's Reveal changes the field. The first Level is only ever laid from scratch.
  const changes = district.levels.map((level, n) => (n ? changedBy(district, nets[n - 1], nets[n], level.slab) : whole))
  /** The first Reveal after Level `level` whose change reaches a Block: it cuts that Block again. */
  const recutBy = (b: Bounds, level: number) => {
    for (let k = level + 1; k < changes.length; k++) if (overlaps(b, changes[k])) return k
    return Infinity
  }
  // The static meshes, by the Reveal that cuts their Blocks again (Infinity when none does), with those Blocks.
  let groups: { recut: number; meshes: THREE.Mesh[]; blocks: Block[] }[] = []

  /**
   * Build Level `level` on the network `net`: the pieces of slab from Level `from` on, and the Blocks that reach into
   * `region`, each brick tagged when `tagged`. Updates `field` there first. Returns the new meshes, their bricks and
   * Blocks.
   */
  const build = (net: Network, level: number, from: number, region: Bounds, tagged: boolean) => {
    field.update(net, plates.slice(0, level + 1), region)
    const parts: (Part & { recut: number })[] = []
    const bricks: BuiltBrick[] = []
    /** Take over what a kit built: its parts in group `recut`, its bricks standing on Block `index`. */
    const take = (kit: Kit, recut: number, index: number) => {
      const done = kit.done()
      for (const part of done.parts) parts.push({ ...part, brick: part.brick + bricks.length, recut })
      bricks.push(...done.bricks.map((brick) => ({ ...brick, block: index })))
    }

    const slab = createKit(mulberry32(0), materials)
    for (let n = from; n <= level; n++) laySlab(slab, plates[n], plates.slice(0, n))
    take(slab, Infinity, -1)
    const surroundings = { net, district, field, extent: whole }
    const blocks = field
      .outlines(0)
      .map(block)
      .filter((b) => overlaps(b, region))
    blocks.forEach((b, i) => {
      const kit = createKit(mulberry32(blockSeed(district, b)), materials)
      pavement(kit, b)
      fillBlock(kit, b, surroundings)
      take(kit, recutBy(b, level), i)
    })

    if (tagged) {
      for (const part of parts) {
        const index = new Float32Array(part.geometry.attributes.position.count).fill(part.brick)
        part.geometry.setAttribute('brick', new THREE.BufferAttribute(index, 1))
      }
    }
    const meshes: THREE.Mesh[] = []
    for (const recut of new Set(parts.map((part) => part.recut))) {
      const group = {
        recut,
        meshes: merge(parts.filter((part) => part.recut === recut)),
        blocks: blocks.filter((b) => recutBy(b, level) === recut),
      }
      groups.push(group)
      meshes.push(...group.meshes)
    }
    return { meshes, bricks, blocks }
  }

  return {
    /** Lay the whole slab Revealed up to Level `level`, on its network `net`, from scratch. Returns its meshes. */
    lay(net: Network, level: number): THREE.Mesh[] {
      return build(net, level, 0, whole, false).meshes
    },

    /** Build what the Reveal of Level `level` adds, on its network `net`: its piece of slab and the Blocks within reach of it. */
    reveal(net: Network, level: number): Build {
      const region = changes[level]
      const cut = groups.filter((g) => g.recut === level)
      groups = groups.filter((g) => !cut.includes(g))
      const old = cut.flatMap((g) => g.blocks)
      const { meshes, bricks, blocks } = build(net, level, level, region, true)
      return {
        meshes,
        bricks,
        blocks: blocks.map((b) => ({
          middle: middle(b),
          replaces: old.some((o) => overlaps(o, b)),
          unchanged: old.some((o) => sameLoop(o.loop, b.loop)),
        })),
        replaced: cut.flatMap((g) => g.meshes),
        region,
        plate: plates[level],
      }
    },
  }
}
