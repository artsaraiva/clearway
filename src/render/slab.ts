import * as THREE from 'three'
import type { Bounds } from '../sim/geometry'
import type { Kit, Stage } from './kit'
import { canvasTexture, roundedBox } from './shapes'

const RIM = 4 // m of grass showing around the road plate
const TILE = 44 // the layers are laid as tiles about this size, whose rounded corners give the slab its seams
const PLATE_TILE = 64 // the road plate is laid in tiles too, so that a Reveal can drop it in brick by brick
const ROAD = '#c3c7ce'
const PLATE = 0.6 // m thick, its surface at height 0
// Top of each layer (m, road surface = 0), thickness and colour: soil, sand, grass.
const LAYERS: [number, number, string, Stage][] = [
  [-10, 8.8, '#c9a37a', 'soil'],
  [-2.8, 8, '#dcc19a', 'sand'],
  [-0.6, 2.2, '#a5d38a', 'grass'],
]
const UNDER = -21.2 // height of the soft shadow in the air beneath the slab
const EASE = 2.5 // per second: how fast the soft shadow grows to a new slab

/** A road plate's rectangle with its grass rim around it. */
export const slabBounds = (plate: Bounds): Bounds => ({ x0: plate.x0 - RIM, y0: plate.y0 - RIM, x1: plate.x1 + RIM, y1: plate.y1 + RIM })

/** The middle of a rectangle, as Three (x, z). */
export const centre = (b: Bounds): [number, number] => [(b.x0 + b.x1) / 2, -(b.y0 + b.y1) / 2]

/** The parts of `r` that none of `cuts` covers, as rectangles. */
function subtract(r: Bounds, cuts: Bounds[]): Bounds[] {
  let left = [r]
  for (const c of cuts) {
    left = left.flatMap((p) => {
      if (c.x0 >= p.x1 || c.x1 <= p.x0 || c.y0 >= p.y1 || c.y1 <= p.y0) return [p]
      const [x0, x1] = [Math.max(p.x0, c.x0), Math.min(p.x1, c.x1)]
      return [
        { ...p, x1: c.x0 },
        { ...p, x0: c.x1 },
        { x0, x1, y0: p.y0, y1: c.y0 },
        { x0, x1, y0: c.y1, y1: p.y1 },
      ].filter((q) => q.x1 - q.x0 > 1e-6 && q.y1 - q.y0 > 1e-6)
    })
  }
  return left
}

/** Cut a rectangle into tiles about `size` across: the middle (sim) and size of each. */
function tiles(r: Bounds, size: number): [x: number, y: number, w: number, d: number][] {
  const [w, d] = [r.x1 - r.x0, r.y1 - r.y0]
  const [nx, ny] = [Math.max(1, Math.round(w / size)), Math.max(1, Math.round(d / size))]
  return Array.from({ length: nx * ny }, (_, k) => [
    r.x0 + ((k % nx) + 0.5) * (w / nx),
    r.y0 + (Math.floor(k / nx) + 0.5) * (d / ny),
    w / nx,
    d / ny,
  ])
}

/**
 * Lay a Level's piece of slab with `kit`, a tile per brick: soil, sand and grass layers under the road plate and its
 * grass rim, then the plate, its surface at height 0. `earlier` are the pieces already laid: the layers fill in around
 * them, and the plate covers their rim where the new piece meets them.
 */
export function laySlab(kit: Kit, plate: Bounds, earlier: Bounds[]) {
  const ground = subtract(slabBounds(plate), earlier.map(slabBounds))
  for (const [top, h, color, stage] of LAYERS) {
    for (const r of ground) {
      for (const [x, y, w, d] of tiles(r, TILE)) {
        kit.push(roundedBox(w, h, d, 2, 0.4).translate(x, top - h, -y), color)
        kit.brick(stage, x, y, top - h, 3)
      }
    }
  }
  for (const [x, y, w, d] of tiles(plate, PLATE_TILE)) {
    kit.push(roundedBox(w, PLATE, d, 0.16, 0.08).translate(x, -PLATE, -y), ROAD)
    kit.brick('plate', x, y, -PLATE, 2)
  }
}

/** The soft shadow in the air beneath the slab. */
export function createUnderShadow() {
  const fade = canvasTexture(256, 256, (g) => {
    const gradient = g.createRadialGradient(128, 128, 30, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(40,50,80,0.45)')
    gradient.addColorStop(1, 'rgba(40,50,80,0)')
    g.fillStyle = gradient
    g.fillRect(0, 0, 256, 256)
  })
  fade.colorSpace = THREE.NoColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: fade, transparent: true, depthWrite: false, toneMapped: false }),
  )
  const [position, scale] = [new THREE.Vector3(), new THREE.Vector3(1, 1, 1)]

  return {
    mesh,
    /** Lie under the slab `slab` (plate and rim): at once, or growing there over the next second or so. */
    fit(slab: Bounds, ease = false) {
      const [w, d] = [slab.x1 - slab.x0, slab.y1 - slab.y0]
      const [cx, cz] = centre(slab)
      position.set(cx + 0.06 * w, UNDER, cz + 0.06 * d)
      scale.set(w * 1.67, 1, d * 1.67)
      if (ease) return
      mesh.position.copy(position)
      mesh.scale.copy(scale)
    },
    /** `dt` is the real seconds since the last frame. */
    update(dt: number) {
      const k = 1 - Math.exp(-EASE * dt)
      mesh.position.lerp(position, k)
      mesh.scale.lerp(scale, k)
    },
  }
}
