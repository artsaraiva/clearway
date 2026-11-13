import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import type { Arm, Lane } from '../sim/network'
import type { Sim, Vehicle } from '../sim/sim'
import { createCamera } from './camera'
import { carCentre, createCars } from './cars'
import { createBlocks } from './blocks'
import { createArmConnections } from './connections'
import { laneField } from './field'
import { createRouteInspector } from './inspector'
import { createLights } from './lights'
import { createRoads } from './roads'
import { createSlab, districtBounds, slabBounds } from './slab'

export type View = ReturnType<typeof createView>

/** Draws a Sim's District as a slab in open sky. */
export function createView(canvas: HTMLCanvasElement, sim: Sim) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setClearColor(0x000000, 0)

  const plate = districtBounds(sim.district)
  const slab = slabBounds(plate)
  const { camera, resize, update: updateCamera } = createCamera(canvas, slab)
  const field = laneField(sim.net, sim.district, plate)
  const roads = createRoads(sim.net, sim.district)
  const cars = createCars()
  const armConnections = createArmConnections()
  const route = createRouteInspector()
  const scene = new THREE.Scene().add(
    ...createLights(canvas, slab),
    ...createSlab(plate),
    createBlocks(field),
    roads.group,
    cars.mesh,
    armConnections.group,
    route.group,
  )

  const fit = () => {
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    resize(canvas.clientWidth, canvas.clientHeight)
  }
  window.addEventListener('resize', fit)
  fit()

  const raycaster = new THREE.Raycaster()
  const roadPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  let inspected: Vehicle | null = null

  return {
    /** Sim coordinates under a pointer event, on the road plane. */
    pick(e: PointerEvent): Vec | null {
      const r = canvas.getBoundingClientRect()
      raycaster.setFromCamera(
        new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
        camera,
      )
      const hit = raycaster.ray.intersectPlane(roadPlane, new THREE.Vector3())
      return hit ? { x: hit.x, y: -hit.z } : null
    },

    /** Show an Arm's Connections for the Connection Tool, with `armed` as the lane end picked first. `null` clears it. */
    showArm(arm: Arm | null, armed: Lane | null) {
      armConnections.show(arm, armed)
    },

    /** Highlight a car's remaining route. `null` clears it. */
    inspectCar(v: Vehicle | null) {
      inspected = v
    },

    carCentre,

    /** The distance field the Blocks are cut from, for scenery that stands on them. */
    field,

    render() {
      if (inspected && !sim.vehicles.includes(inspected)) inspected = null
      route.update(inspected)
      cars.update(sim.vehicles)
      roads.update()
      updateCamera()
      renderer.render(scene, camera)
    },
  }
}
