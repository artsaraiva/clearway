import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { centre, type Bounds } from './slab'

const DISTANCE = 900
const TARGET_Y = -4 // a little below the road, so the slab's side sits in frame

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

  const half = Math.max(slab.x1 - slab.x0, slab.y1 - slab.y0) / 2
  return {
    camera,
    /** Fit the frustum to the canvas: the slab's diagonal stays in frame at zoom 1. */
    resize(width: number, height: number) {
      const h = Math.max(half, (1.5 * half * height) / width)
      Object.assign(camera, { left: (-h * width) / height, right: (h * width) / height, top: h, bottom: -h })
      camera.updateProjectionMatrix()
    },
    update: () => controls.update(),
  }
}
