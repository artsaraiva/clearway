import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { pointAt, type Vec } from '../sim/geometry'
import type { Vehicle } from '../sim/sim'
import { v3 } from './ribbons'

// ponytail: cars past the cap are not drawn (the sim still moves them); the budget is 1,000, so raise it when a District holds more.
const CAP = 1500
const COLORS = ['#ffffff', '#f26d5b', '#4f8fe8', '#f6c85f', '#7cc6a4', '#b9a3e3', '#e9eef2', '#ff9db5'].map((c) => new THREE.Color(c))

/** Sim position of a car's centre (`s` is the front bumper). */
export function carCentre(v: Vehicle): Vec {
  const p = pointAt(v.lane.line, v.s)
  const back = v.type.length / 2
  return { x: p.x - Math.cos(p.heading) * back, y: p.y - Math.sin(p.heading) * back }
}

/** Every car as one instanced mesh, placed from the sim each frame. A plain box until the car model lands (#28). */
export function createCars() {
  const mesh = new THREE.InstancedMesh(
    new RoundedBoxGeometry(4.3, 1.5, 1.9, 3, 0.45).translate(0, 0.75, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    CAP,
  )
  mesh.castShadow = mesh.receiveShadow = true
  mesh.frustumCulled = false // instances move; the mesh's own bounds mean nothing
  mesh.count = 0
  const [m, q, up, one] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 1)]

  return {
    mesh,
    update(vehicles: Vehicle[]) {
      mesh.count = Math.min(vehicles.length, CAP)
      for (let i = 0; i < mesh.count; i++) {
        const v = vehicles[i]
        q.setFromAxisAngle(up, pointAt(v.lane.line, v.s).heading)
        mesh.setMatrixAt(i, m.compose(v3(carCentre(v)), q, one))
        mesh.setColorAt(i, COLORS[v.id % COLORS.length])
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
  }
}
