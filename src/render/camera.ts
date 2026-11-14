import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Bounds } from '../sim/geometry'
import { centre } from './slab'

const DISTANCE = 900
const TARGET_Y = -4 // a little below the road, so the slab's side sits in frame
const FIT = 1.2 // s to move onto a slab that has grown

/** Orthographic camera: grab (left drag) rotates, the wheel zooms, right drag pans. Opens from the south-east with the whole slab in frame. */
export function createCamera(canvas: HTMLCanvasElement, slab: Bounds) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000)
  const controls = new OrbitControls(camera, canvas)
  // Polar angle is measured from straight above, so this clamps the tilt to about 24°–72° above the horizon.
  Object.assign(controls, { enableDamping: true, minZoom: 0.6, maxZoom: 8, minPolarAngle: 0.32, maxPolarAngle: 1.15 })
  canvas.style.cursor = 'grab'

  const [az, el] = [0.62, 0.72]
  const [cx, cz] = centre(slab)
  controls.target.set(cx, TARGET_Y, cz)
  camera.position.set(
    cx + Math.sin(az) * Math.cos(el) * DISTANCE,
    TARGET_Y + Math.sin(el) * DISTANCE,
    cz + Math.cos(az) * Math.cos(el) * DISTANCE,
  )
  controls.update()

  /** Half the slab's longer side: the frustum is fitted to it. */
  let half = Math.max(slab.x1 - slab.x0, slab.y1 - slab.y0) / 2
  let [width, height] = [1, 1]
  /** Fit the frustum to the canvas: the slab's diagonal stays in frame at zoom 1. */
  const frame = () => {
    const h = Math.max(half, (1.5 * half * height) / width)
    Object.assign(camera, { left: (-h * width) / height, right: (h * width) / height, top: h, bottom: -h })
    camera.updateProjectionMatrix()
  }
  let fit: { from: number[]; to: number[]; t: number } | null = null

  return {
    camera,
    /** The canvas is now `w` by `h` CSS pixels. */
    resize(w: number, h: number) {
      ;[width, height] = [w, h]
      frame()
    },
    /** Move onto a slab that has grown, from whatever angle the camera has, with all of it in frame. */
    fit(next: Bounds) {
      const [x, z] = centre(next)
      fit = {
        from: [controls.target.x, controls.target.z, half, camera.zoom],
        to: [x, z, Math.max(next.x1 - next.x0, next.y1 - next.y0) / 2, 1],
        t: 0,
      }
    },
    /** `dt` is the real seconds since the last frame. */
    update(dt: number) {
      if (fit) {
        fit.t = Math.min(1, fit.t + dt / FIT)
        const k = fit.t * fit.t * (3 - 2 * fit.t)
        const [x, z, h, zoom] = fit.from.map((a, i) => a + (fit!.to[i] - a) * k)
        // Pan: the camera keeps its angle and distance to the target.
        camera.position.x += x - controls.target.x
        camera.position.z += z - controls.target.z
        controls.target.x = x
        controls.target.z = z
        ;[half, camera.zoom] = [h, zoom]
        frame()
        if (fit.t === 1) fit = null
      }
      controls.update()
    },
  }
}
