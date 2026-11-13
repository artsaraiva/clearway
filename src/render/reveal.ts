import * as THREE from 'three'
import { middle, type Bounds } from '../sim/geometry'
import type { Materials, Stage } from './kit'
import type { Build } from './scenery'
import { puff } from './shapes'
import { slabBounds } from './slab'

const DURATION = 0.62 // s a brick takes to fall in and settle, or to grow in
const FALL = 25 // m a dropping brick falls
const JITTER = 0.05 // s at random on each brick's start, so that a row of tiles never lands as one
// Per stage: when its first brick starts and how much later its farthest one does (s). The slab's stages count from
// the start of the Reveal, the rest from the start of their Block. The farthest brick is the one farthest from the
// middle of the new piece of slab.
const STARTS: Record<Stage, [at: number, spread: number]> = {
  soil: [0, 1.1],
  sand: [0.4, 1.1],
  grass: [0.8, 1.1],
  plate: [1.5, 0.9],
  block: [0, 0],
  ground: [0.3, 0],
  lamp: [0.3, 0],
  building: [0.45, 1.5],
  tree: [0.6, 1.5],
}
// When the Blocks start dropping, and how much later the farthest one does. A Block that replaces one the Reveal cut
// again drops first, the moment the old ones are taken away.
const BLOCKS: [at: number, spread: number] = [2.6, 2]
const POPS = new Set<Stage>(['lamp', 'tree']) // these grow in; everything else drops
const CONFETTI = ['#f26d5b', '#4f8fe8', '#f6c85f', '#7cc6a4', '#b9a3e3', '#ff9db5']
const ROW = 1024 // texels per row of the transforms texture, two per brick
// What a brick does once its start comes: drop in (or grow in), or simply appear, as a Block that comes out just as
// the one it replaces did.
const [MOVES, APPEARS] = [0, 1]
// A brick's state: waiting or on its way, down and settling (its dust thrown), or at rest for good.
const [ON_ITS_WAY, SETTLING, LANDED] = [0, 1, 2]

// Moves each vertex by its brick's transform: two texels per brick, its anchor (xyz), then its scale about the anchor
// (xyz) and how high above its place it is (w).
const MOVE = `#include <begin_vertex>
{
  int texel = 2 * int(brick);
  vec4 anchor = texelFetch(brickTransforms, ivec2(texel % ${ROW}, texel / ${ROW}), 0);
  vec4 scale = texelFetch(brickTransforms, ivec2((texel + 1) % ${ROW}, (texel + 1) / ${ROW}), 0);
  transformed = anchor.xyz + (transformed - anchor.xyz) * scale.xyz + vec3(0.0, scale.w, 0.0);
}`

/** What happens along the way, for the parts of the world that are not bricks. */
export interface Moments {
  /** The last tile of road plate has landed: its paint can show. */
  plate(): void
  /** The Blocks start dropping: the old ones they replace go. */
  blocks(): void
  /** Everything has landed and the build is static scenery again. */
  done(): void
}

/**
 * When each brick of a build starts, by its stage, its Block, and how far it lies from the middle of the new piece of
 * slab; and what it does then.
 */
function schedule({ bricks, blocks, plate }: Build) {
  const centre = middle(plate)
  const slab = slabBounds(plate)
  const reach = Math.hypot(slab.x1 - slab.x0, slab.y1 - slab.y0) / 2
  const far = (x: number, y: number) => Math.min(1, Math.hypot(x - centre.x, y - centre.y) / reach)
  const starts = blocks.map((b) => BLOCKS[0] + (b.replaces ? 0 : far(b.middle.x, b.middle.y) * BLOCKS[1]))
  const unchanged = (block: number) => block >= 0 && blocks[block].unchanged
  return {
    delays: new Float32Array(
      bricks.map((b) =>
        unchanged(b.block)
          ? BLOCKS[0]
          : (b.block < 0 ? 0 : starts[b.block]) + STARTS[b.stage][0] + far(b.at.x, -b.at.z) * STARTS[b.stage][1] + Math.random() * JITTER,
      ),
    ),
    moves: new Uint8Array(bricks.map((b) => (unchanged(b.block) ? APPEARS : MOVES))),
  }
}

/** A sprite puff's motion: velocity (m/s), gravity (m/s²), size as it starts and as it ends (m), how long it lasts (s), colour and opacity. */
const PUFF = { vx: 0, vy: 2.4, vz: 0, gravity: 0, from: 1.4, to: 5, lasts: 0.6, color: '#ffffff', opacity: 0.75 }

/**
 * The Reveal animation: a new piece of slab assembling brick by brick. Slab layers, road plate, Blocks and buildings
 * drop with a squash, trees and lamps pop in, dust flies where large bricks land, and confetti fires when it is done.
 * The build's meshes are drawn through copies of their materials that move each brick by its own transform, read
 * from a texture, so a build costs no more draw calls than the finished scenery.
 * ponytail: 140 puffs fly at once, and a landing past that throws no dust (the slab layers' dust lands inside the slab
 * anyway); grow the pool, or draw puffs as points, if a large piece's dust looks thin. And the whole transforms
 * texture goes to the GPU every frame, about 100 KB for a few thousand bricks; send only the rows that changed if
 * pieces ever reach tens of thousands of bricks.
 */
export function createReveal(materials: Materials) {
  const group = new THREE.Group()
  const transforms = { value: new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType) }
  const copy = <M extends THREE.Material>(material: M): M => {
    const moving = material.clone() as M
    moving.onBeforeCompile = (shader) => {
      shader.uniforms.brickTransforms = transforms
      shader.vertexShader = `attribute float brick;\nuniform highp sampler2D brickTransforms;\n${shader.vertexShader.replace('#include <begin_vertex>', MOVE)}`
    }
    return moving
  }
  // Made on the first Reveal and kept, so that later ones compile nothing.
  let moving: Map<THREE.Material, THREE.Material> | undefined
  let depth: THREE.MeshDepthMaterial | undefined

  const texture = puff()
  const puffs = Array.from({ length: 140 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
    sprite.visible = false
    sprite.renderOrder = 8
    group.add(sprite)
    return { sprite, left: 0, ...PUFF }
  })
  const spawn = (x: number, y: number, z: number, motion: Partial<typeof PUFF> = {}) => {
    const p = puffs.find((q) => q.left <= 0)
    if (!p) return
    Object.assign(p, PUFF, motion)
    p.left = p.lasts
    p.sprite.material.color.set(p.color)
    p.sprite.position.set(x, y, z)
    p.sprite.visible = true
  }

  let build: Build | null = null
  let moments: Moments
  let originals = new Map<THREE.Mesh, THREE.Material>()
  let { delays, moves } = { delays: new Float32Array(0), moves: new Uint8Array(0) }
  let state = new Uint8Array(0)
  let landed = 0
  let plateAt = 0
  let t = 0
  let [plated, blocked] = [false, false]

  /** Turn the build back into static scenery, and celebrate. A build that lands early still passes every moment. */
  const finish = (plate: Bounds) => {
    if (!plated) moments.plate()
    if (!blocked) moments.blocks()
    for (const [mesh, material] of originals) {
      mesh.material = material
      mesh.customDepthMaterial = undefined
      mesh.frustumCulled = true
    }
    originals = new Map()
    build = null
    for (let i = 0; i < 50; i++) {
      spawn(
        THREE.MathUtils.lerp(plate.x0, plate.x1, Math.random()),
        8 + Math.random() * 12,
        -THREE.MathUtils.lerp(plate.y0, plate.y1, Math.random()),
        {
          vx: (Math.random() - 0.5) * 20,
          vy: 30 + Math.random() * 24,
          vz: (Math.random() - 0.5) * 20,
          gravity: 48,
          from: 3,
          to: 2,
          lasts: 1.8,
          color: CONFETTI[i % CONFETTI.length],
          opacity: 1,
        },
      )
    }
    moments.done()
  }

  return {
    /** The dust and confetti. */
    group,

    /** Whether a build is still assembling. */
    get playing() {
      return build !== null
    },

    /** Start assembling a Reveal's build, whose meshes are already in the scene. `on` hears of the moments along the way. */
    play(next: Build, on: Moments) {
      ;[build, moments, t, plated, blocked, landed] = [next, on, 0, false, false, 0]
      moving ??= new Map(
        [materials.solid, materials.glass, materials.bulb, materials.water, materials.roundShadow, materials.squareShadow].map((m) => [
          m,
          copy(m),
        ]),
      )
      depth ??= copy(new THREE.MeshDepthMaterial())
      for (const mesh of next.meshes) {
        originals.set(mesh, mesh.material as THREE.Material)
        mesh.material = moving.get(mesh.material as THREE.Material)!
        if (mesh.castShadow) mesh.customDepthMaterial = depth
        mesh.frustumCulled = false // bricks move off the mesh's bounds
      }

      ;({ delays, moves } = schedule(next))
      state = new Uint8Array(next.bricks.length)
      plateAt = Math.max(0, ...next.bricks.flatMap((b, i) => (b.stage === 'plate' ? [delays[i] + DURATION / 2] : [])))
      // Every brick starts at its anchor, at no size at all.
      const rows = Math.max(1, Math.ceil((2 * next.bricks.length) / ROW))
      const data = new Float32Array(ROW * rows * 4)
      next.bricks.forEach((b, i) => data.set([b.at.x, b.at.y, b.at.z, 0], 8 * i))
      transforms.value.dispose()
      transforms.value = new THREE.DataTexture(data, ROW, rows, THREE.RGBAFormat, THREE.FloatType)
      transforms.value.needsUpdate = true
    },

    /** `dt` is the real seconds since the last frame. */
    update(dt: number) {
      for (const p of puffs) {
        if (p.left <= 0) continue
        p.left -= dt
        const q = 1 - Math.max(0, p.left) / p.lasts
        p.vy -= p.gravity * dt
        p.sprite.position.x += p.vx * dt
        p.sprite.position.y += p.vy * dt
        p.sprite.position.z += p.vz * dt
        p.sprite.scale.setScalar(p.from + (p.to - p.from) * q)
        p.sprite.material.opacity = Math.min(1, (1 - q) * 1.8) * p.opacity
        p.sprite.visible = p.left > 0
      }
      if (!build) return

      t += dt
      // The windows and lamps glow with the time of day, which is all of the materials that changes.
      for (const [original, copied] of moving!) {
        if ('emissiveIntensity' in original)
          (copied as THREE.MeshStandardMaterial).emissiveIntensity = (original as THREE.MeshStandardMaterial).emissiveIntensity
      }
      const data = transforms.value.image.data as Float32Array
      const { bricks } = build
      for (let i = 0; i < bricks.length; i++) {
        const u = (t - delays[i]) / DURATION
        // A brick that appears does so in the very update that takes away the Block it replaces.
        if (state[i] === LANDED || (moves[i] === APPEARS ? u < 0 : u <= 0)) continue
        let [sx, sy, lift] = [1, 1, 0]
        if (u >= 1 || moves[i] === APPEARS) {
          state[i] = LANDED
          landed++
        } else if (POPS.has(bricks[i].stage)) {
          sx = sy = Math.max(0.001, 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2) // back out: overshoot, then settle
        } else if (u < 0.5) {
          sx = sy = Math.min(1, 0.55 + u * 2)
          lift = FALL * (1 - (u * 2) ** 2)
        } else {
          // Down: a squash that rings out, and dust the moment it hits.
          const e = Math.exp(-4.5 * (u * 2 - 1)) * Math.cos((u * 2 - 1) * 9.5)
          ;[sx, sy] = [1 + 0.13 * e, 1 - 0.22 * e]
          if (state[i] === ON_ITS_WAY) {
            state[i] = SETTLING
            const { at, dust } = bricks[i]
            for (let k = 0; k < dust; k++) spawn(at.x + (Math.random() - 0.5) * 30, at.y + 2, at.z + (Math.random() - 0.5) * 30)
          }
        }
        const o = 8 * i + 4
        ;[data[o], data[o + 1], data[o + 2], data[o + 3]] = [sx, sy, sx, lift]
      }
      transforms.value.needsUpdate = true

      if (!plated && t >= plateAt) {
        plated = true
        moments.plate()
      }
      if (!blocked && t >= BLOCKS[0]) {
        blocked = true
        moments.blocks()
      }
      if (landed === bricks.length) finish(build.plate)
    },
  }
}
