import * as THREE from 'three'
import { centre, type Bounds } from './slab'

// ponytail: one fixed late-afternoon light (the prototype's opening state), so the look is never checked at night or
// noon; the day cycle (#29) replaces these constants with keyframes.
const SUN = { color: '#ffe0b3', intensity: 2.9, azimuth: 1.05, elevation: 0.66 }
const HEMI = { sky: '#cfe2ff', ground: '#f4dcc0', intensity: 1.1 }
const SKY = ['#9ccff3', '#d9ecf3', '#ffe4c4']

/** One directional light with a soft shadow map covering the slab, a hemisphere light, and the sky gradient behind the transparent canvas. */
export function createLights(canvas: HTMLCanvasElement, slab: Bounds): THREE.Object3D[] {
  const hemi = new THREE.HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity)
  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity)
  const [cx, cz] = centre(slab)
  const reach = 0.8 * Math.max(slab.x1 - slab.x0, slab.y1 - slab.y0) // the slab's diagonal, with room for tall buildings
  const { azimuth: az, elevation: el } = SUN
  sun.position.set(cx + Math.sin(az) * Math.cos(el) * 500, Math.sin(el) * 500, cz + Math.cos(az) * Math.cos(el) * 500)
  sun.target.position.set(cx, 0, cz)
  sun.castShadow = true
  // If shadows break the frame budget, this shrinks before any look decision changes.
  sun.shadow.mapSize.set(4096, 4096)
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 1000 })
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.16
  sun.shadow.radius = 3

  canvas.style.background = `linear-gradient(180deg,${SKY.map((c, i) => `${c} ${i * 50}%`).join(',')})`
  return [hemi, sun, sun.target]
}
