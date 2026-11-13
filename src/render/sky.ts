import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Bounds } from '../sim/geometry'
import { roundedBox, tint } from './shapes'
import { centre } from './slab'

const TAU = Math.PI * 2
// Where each cloud starts, in slab half-widths east and half-depths south of the slab's centre, and its height in m.
const CLOUDS = [
  [-0.9, 0.73, 64],
  [0.18, 1.03, 70],
  [0.85, -0.73, 66],
]
const DRIFT = 3 // m/s, eastward
const WRAP = 1.8 // half-widths east of the centre where a cloud leaves, to come back as far to the west
const CLEAR_ZOOM = 1.9 // camera zoom from which no cloud is visible; they are solid at 1 less
const PLANES = [
  { height: 60, color: '#f26d5b' },
  { height: 76, color: '#4f8fe8' },
]
// A plane's line starts `far` half-widths from the slab's centre, aimed within `aim` half-widths of it, and bends by
// up to `turn` rad/s. The plane grows in and shrinks out over `fade` m at each end of the line.
const PLANE = { speed: 20, turn: 0.03, far: 1.9, aim: 0.75, fade: 24, bob: 1.6 }
const PLANE_LENGTH = 6.8 // m: the model is drawn 1.7 units long and scaled to this

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

/** A propeller plane, nose toward +x: the fuselage and everything fixed to it, with the wings in `color`. */
function planeModel(color: string): THREE.BufferGeometry {
  const part = (w: number, h: number, d: number, r: number, b: number, look: string, x: number, y: number) =>
    tint(roundedBox(w, h, d, r, b).translate(x, y, 0), look)
  const scale = PLANE_LENGTH / 1.7
  return mergeGeometries([
    part(1.7, 0.34, 0.36, 0.16, 0.08, '#fbf6ef', 0, 0),
    part(0.5, 0.2, 0.3, 0.12, 0.05, '#41566c', 0.2, 0.26), // canopy
    part(0.55, 0.06, 2.6, 0.12, 0.02, color, 0.15, 0.2), // wing
    part(0.32, 0.05, 0.9, 0.1, 0.02, color, -0.72, 0.22), // tailplane
    part(0.36, 0.42, 0.06, 0.02, 0.02, color, -0.72, 0.26), // fin
    part(0.16, 0.22, 0.22, 0.08, 0.04, color, 0.88, 0.06), // nose
  ]).scale(scale, scale, scale)
}

/**
 * The sky over the slab: clouds that drift east and cast shadows, and propeller planes that cross on near-straight
 * lines. Decoration: nothing in the sim reads it.
 * ponytail: three clouds and two planes whatever the slab's size, so the sky thins out over a District much larger
 * than today's; scale the counts with the slab's area then.
 */
export function createSky(slab: Bounds) {
  let [cx, cz] = centre(slab)
  let [halfWidth, halfDepth] = [(slab.x1 - slab.x0) / 2, (slab.y1 - slab.y0) / 2]
  let half = Math.max(halfWidth, halfDepth)
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

  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })
  const propeller = tint(new THREE.BoxGeometry(0.12, 3.6, 0.36), '#3a3f47')
  const planes = PLANES.map(({ height, color }) => {
    const body = new THREE.Mesh(planeModel(color), paint)
    const prop = new THREE.Mesh(propeller, paint)
    prop.position.set(3.96, 0.68, 0)
    body.castShadow = prop.castShadow = true
    // East and south of the slab's centre, in m. It starts past the end of a line, so the first frame gives it one.
    return { model: new THREE.Group().add(body, prop), prop, height, east: 0, south: Infinity, heading: 0, turn: 0 }
  })
  group.add(...clouds, ...planes.map((p) => p.model))
  let t = 0

  return {
    group,

    /** Fly over a new slab, as after a Reveal. Clouds and planes carry on from where they are. */
    fit(next: Bounds) {
      const [x, z] = centre(next)
      for (const p of planes) [p.east, p.south] = [p.east + cx - x, p.south + cz - z]
      ;[cx, cz, halfWidth, halfDepth] = [x, z, (next.x1 - next.x0) / 2, (next.y1 - next.y0) / 2]
      half = Math.max(halfWidth, halfDepth)
    },

    /** `dt` is the real seconds since the last frame, 0 while paused; `zoom` is the camera's. */
    update(dt: number, zoom: number) {
      t += dt
      // Clouds fade out as the camera zooms in, so they never sit between the player and a Jam. Their shadows stay.
      vapour.opacity = THREE.MathUtils.clamp(CLEAR_ZOOM - zoom, 0, 1)
      vapour.colorWrite = vapour.depthWrite = vapour.opacity > 0
      for (const cloud of clouds) {
        cloud.position.x += DRIFT * dt
        if (cloud.position.x > cx + WRAP * halfWidth) cloud.position.x = cx - WRAP * halfWidth
      }

      const far = PLANE.far * half
      planes.forEach((p, i) => {
        if (Math.hypot(p.east, p.south) > far) {
          // Gone at the edge: a new line from somewhere on the rim, aimed near the middle.
          const from = Math.random() * TAU
          const aim = () => (Math.random() - 0.5) * 2 * PLANE.aim * half
          ;[p.east, p.south] = [Math.cos(from) * far, Math.sin(from) * far]
          p.heading = Math.atan2(aim() - p.south, aim() - p.east)
          p.turn = (Math.random() - 0.5) * 2 * PLANE.turn
        }
        p.heading += p.turn * dt
        p.east += Math.cos(p.heading) * PLANE.speed * dt
        p.south += Math.sin(p.heading) * PLANE.speed * dt
        p.model.position.set(cx + p.east, p.height + Math.sin(t * 0.7 + i) * PLANE.bob, cz + p.south)
        p.model.rotation.set(p.turn * 5, -p.heading, 0, 'YXZ') // banking into its curve
        p.model.scale.setScalar(THREE.MathUtils.clamp((far - Math.hypot(p.east, p.south)) / PLANE.fade, 0.001, 1))
        p.prop.rotation.x += dt * 40
      })
    },
  }
}
