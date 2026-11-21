import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Bounds } from '../sim/geometry'
import { centre } from './slab'

// Where each cloud starts, in slab half-widths east and half-depths south of the slab's centre, and its height in m.
const CLOUDS = [
  [-0.9, 0.73, 64],
  [0.18, 1.03, 70],
  [0.85, -0.73, 66],
]
const DRIFT = 3 // m/s, eastward
const WRAP = 1.8 // half-widths east of the centre where a cloud leaves, to come back as far to the west
const CLEAR_ZOOM = 1.9 // camera zoom from which no cloud is visible; they are solid at 1 less
// In a showcase, half-widths at each end of a cloud's drift over which it puffs in or out, rather than jumping back.
const PUFF = 0.6

/** A cloud: a row of puffs, fattest in the middle. */
function cloudModel(): THREE.BufferGeometry {
  const puff = new THREE.SphereGeometry(1, 16, 12)
  const puffs = Array.from({ length: 7 }, (_, i) => {
    const k = (6 + Math.random() * 5) * (1 - Math.abs(i - 3.5) / 7)
    return puff
      .clone()
      .scale(k * 1.2, k * 0.85, k)
      .translate((i - 3.5) * 6.5, Math.random() * 3, Math.random() * 8 - 4)
  })
  return mergeGeometries(puffs)
}

/**
 * The sky over the slab: clouds that drift east and cast shadows. Decoration: nothing in the sim reads it. In a
 * `showcase`, as the title screen's, which is looked at close up and never played, the clouds stay solid however close
 * the camera comes, and puff in and out at the ends of their drift, where they would otherwise jump back in sight.
 * ponytail: three clouds whatever the slab's size, so the sky thins out over a City much larger than today's; scale
 * the count with the slab's area then.
 */
export function createSky(slab: Bounds, showcase = false) {
  // Where the clouds start is spread over the first slab. After that they only drift east, so a new slab changes
  // just the centre and half-width they wrap round.
  const [x, cz] = centre(slab)
  const halfDepth = (slab.y1 - slab.y0) / 2
  let cx = x
  let halfWidth = (slab.x1 - slab.x0) / 2
  const group = new THREE.Group()

  const vapour = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    emissive: '#ffffff',
    emissiveIntensity: 0.3,
    transparent: true,
  })
  const clouds = CLOUDS.map(([east, south, height]) => {
    const cloud = new THREE.Mesh(cloudModel(), vapour)
    cloud.position.set(cx + east * halfWidth, height, cz + south * halfDepth)
    cloud.castShadow = true
    return cloud
  })
  group.add(...clouds)

  return {
    group,

    /** Drift over a new slab, as after a Tile lands or is taken off. Clouds carry on from where they are. */
    fit(next: Bounds) {
      cx = centre(next)[0]
      halfWidth = (next.x1 - next.x0) / 2
    },

    /**
     * `dt` is the real seconds since the last frame, 0 while paused; `zoom` is the camera's. `calm`, as reduced motion
     * asks, holds the clouds where they are.
     */
    update(dt: number, zoom: number, calm = false) {
      // Clouds fade out as the camera zooms in, so they never sit between the player and a Jam. Their shadows stay.
      vapour.opacity = showcase ? 1 : THREE.MathUtils.clamp(CLEAR_ZOOM - zoom, 0, 1)
      vapour.colorWrite = vapour.depthWrite = vapour.opacity > 0
      for (const cloud of clouds) {
        if (!calm) cloud.position.x += DRIFT * dt
        if (cloud.position.x > cx + WRAP * halfWidth) cloud.position.x = cx - WRAP * halfWidth
        if (showcase) {
          const left = WRAP * halfWidth - Math.abs(cloud.position.x - cx)
          cloud.scale.setScalar(THREE.MathUtils.clamp(left / (PUFF * halfWidth), 0.001, 1))
        }
      }
    },
  }
}
