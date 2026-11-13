import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pointAt, type Vec } from '../sim/geometry'
import type { Lane, Network } from '../sim/network'
import type { Vehicle } from '../sim/sim'
import type { Glow } from './day'
import { roundedBox, tint } from './shapes'

// ponytail: cars past the cap are not drawn (the sim still moves them); the budget is 1,000, so raise it when a District holds more.
const CAP = 1500
const LENGTH = 4.3 // m: the model is drawn one unit long and scaled to this
const COLORS = ['#ffffff', '#f26d5b', '#4f8fe8', '#f6c85f', '#7cc6a4', '#b9a3e3', '#e9eef2', '#ff9db5'].map((c) => new THREE.Color(c))
const GROW = 8 // m of lane over which a car grows in, or shrinks out, at a Gateway
const STUCK_BELOW = 0.4 // m/s
const COOL = 1.5 // seconds of being stuck forgotten per second of moving
const [ANGRY_AFTER, ANGRY_RAMP] = [5, 3] // real seconds stuck before anger starts, and for it to reach full

/** A car angry enough to show it. */
export interface StuckCar {
  /** Where it is drawn, in Three coordinates. */
  at: THREE.Vector3
  /** 0–1. */
  anger: number
  /** Real seconds stuck. */
  stuck: number
}

/** Sim position of a car's centre (`s` is the front bumper). */
export function carCentre(v: Vehicle): Vec {
  const p = pointAt(v.lane.line, v.s)
  const back = v.type.length / 2
  return { x: p.x - Math.cos(p.heading) * back, y: p.y - Math.sin(p.heading) * back }
}

/** The stubby car: a chassis, a body and a cabin with a dark glass band. Its white parts take the instance's colour. */
function carModel(): THREE.BufferGeometry {
  const part = (w: number, h: number, d: number, r: number, b: number, color: string, x: number, y: number) =>
    tint(roundedBox(w, h, d, r, b).translate(x, y, 0), color)
  return mergeGeometries([
    part(0.84, 0.12, 0.46, 0.06, 0.03, '#3a3f47', 0, 0.02),
    part(1, 0.3, 0.52, 0.14, 0.08, '#ffffff', 0, 0.08),
    part(0.56, 0.24, 0.46, 0.12, 0.07, '#ffffff', -0.06, 0.34),
    part(0.58, 0.13, 0.48, 0.12, 0.02, '#41566c', -0.06, 0.39),
  ]).scale(LENGTH, LENGTH, LENGTH)
}

/** Head lights at the front and tail lights at the back, in metres. */
function lightsModel(): THREE.BufferGeometry {
  return mergeGeometries(
    [0.6, -0.6].flatMap((z) => [
      tint(new THREE.BoxGeometry(0.12, 0.3, 0.45).translate(2.13, 0.85, z), '#fff6d8'),
      tint(new THREE.BoxGeometry(0.12, 0.25, 0.45).translate(-2.13, 0.9, z), '#ff3030'),
    ]),
  )
}

/**
 * Every car as one instanced mesh, plus its head and tail lights as a second, placed from the sim each frame. Cars grow
 * in at a Gateway and shrink out at one, and shake once they have been stuck for a few real seconds.
 */
export function createCars(net: Network) {
  const body = new THREE.InstancedMesh(carModel(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), CAP)
  // Unlit: the lights glow by their own colour, scaled by the time of day.
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const lights = new THREE.InstancedMesh(lightsModel(), lit, CAP)
  body.castShadow = body.receiveShadow = true
  body.frustumCulled = lights.frustumCulled = false // instances move; the mesh's own bounds mean nothing
  body.count = lights.count = 0

  let entries = new Set<Lane>()
  let stuck = new Map<number, number>() // real seconds each car has been stuck, by id
  /** Follow the cars of a network, as after a Reveal: none has been stuck yet. */
  const reset = (on: Network) => {
    entries = new Set(Object.values(on.gateways).flatMap((arm) => arm.approach))
    stuck = new Map()
  }
  reset(net)
  let t = 0
  const [m, q, e, at, scale] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Euler(0, 0, 0, 'YXZ'),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]

  return {
    meshes: [body, lights],
    reset,

    /**
     * Place the cars, every one scaled by `grow` (0–1) as a Reveal shrinks the old ones out and grows the new ones in.
     * `dt` is the real seconds since the last frame, 0 while paused. Returns the angry ones, none until fully grown.
     */
    update(vehicles: Vehicle[], dt: number, grow = 1): StuckCar[] {
      t += dt
      const next = new Map<number, number>()
      const angry: StuckCar[] = []
      body.count = lights.count = Math.min(vehicles.length, CAP)
      for (let i = 0; i < body.count; i++) {
        const v = vehicles[i]
        const { heading } = pointAt(v.lane.line, v.s)
        const before = stuck.get(v.id) ?? 0
        const wait = v.v < STUCK_BELOW ? before + dt : Math.max(0, before - COOL * dt)
        next.set(v.id, wait)
        const anger = Math.min(1, Math.max(0, (wait - ANGRY_AFTER) / ANGRY_RAMP))
        const grown = entries.has(v.lane) ? v.s / GROW : v.lane.toGateway ? (v.lane.length - v.s) / GROW : 1
        const c = carCentre(v)
        // An angry car hops and rocks.
        at.set(c.x, anger && Math.abs(Math.sin(t * 11 + v.id)) * 0.3 * anger, -c.y)
        q.setFromEuler(e.set(anger && Math.sin(t * 34 + v.id) * 0.07 * anger, heading, 0))
        m.compose(at, q, scale.setScalar(Math.max(0.001, Math.min(1, grown) * grow)))
        body.setMatrixAt(i, m)
        lights.setMatrixAt(i, m)
        body.setColorAt(i, COLORS[v.id % COLORS.length])
        if (anger && grow >= 1) angry.push({ at: at.clone(), anger, stuck: wait })
      }
      stuck = next
      body.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = true
      if (body.instanceColor) body.instanceColor.needsUpdate = true
      return angry
    },

    /** Light the head and tail lights as the time of day has them. */
    setGlow({ carLights }: Glow) {
      lit.color.setScalar(carLights)
      lights.visible = carLights > 0.05
    },
  }
}
