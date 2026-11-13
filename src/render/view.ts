import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import type { Arm, Lane } from '../sim/network'
import type { Sim, Vehicle } from '../sim/sim'
import { createCamera } from './camera'
import { carCentre, createCars } from './cars'
import { createBlocks } from './blocks'
import { createArmConnections } from './connections'
import { createDay } from './day'
import { createJamEmotion } from './emotion'
import { laneField } from './field'
import { createBlockFill } from './fill'
import { createRouteInspector } from './inspector'
import { createLabels } from './labels'
import { createRoads } from './roads'
import { createSky } from './sky'
import { createSlab, districtBounds, slabBounds } from './slab'
import { createWalkers } from './walkers'

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
  const day = createDay(canvas, slab)
  const sky = createSky(slab)
  const field = laneField(sim.net, sim.district, plate)
  const roads = createRoads(sim.net, sim.district)
  const fill = createBlockFill(sim.net, sim.district, field, plate)
  const cars = createCars(sim.net)
  const walkers = createWalkers(sim.net, field)
  const emotion = createJamEmotion()
  const armConnections = createArmConnections()
  const route = createRouteInspector()
  const labels = createLabels(canvas, camera, sim.net, sim.district, field)
  const scene = new THREE.Scene().add(
    ...day.lights,
    ...createSlab(plate),
    createBlocks(field),
    fill.group,
    roads.group,
    ...cars.meshes,
    ...walkers.meshes,
    sky.group,
    emotion.group,
    armConnections.group,
    route.group,
  )

  // The canvas's size in CSS pixels, read only when it changes: reading it every frame would force a layout.
  let [width, height] = [0, 0]
  const fit = () => {
    ;[width, height] = [canvas.clientWidth, canvas.clientHeight]
    renderer.setSize(width, height, false)
    resize(width, height)
  }
  window.addEventListener('resize', fit)
  fit()

  const raycaster = new THREE.Raycaster()
  const roadPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  let inspected: Vehicle | null = null

  return {
    /** Stop the day at a time of day, 0–1, or let it run again with `null`. A dev aid: the player has no control over it. */
    holdDay: day.hold,

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

    /**
     * Draw a frame. `dt` is the real seconds since the last one, 0 while the sim is paused: it drives everything that
     * moves on its own (the day, the sky, the walkers and the Jam emotion), so a pause stops the whole world.
     */
    render(dt: number) {
      if (inspected && !sim.vehicles.includes(inspected)) inspected = null
      route.update(inspected)
      const glow = day.update(dt)
      fill.setGlow(glow.windows, glow.lamps)
      cars.setNight(glow.night)
      emotion.update(cars.update(sim.vehicles, dt), dt)
      walkers.update(dt)
      roads.update()
      updateCamera()
      sky.update(dt, camera.zoom)
      renderer.render(scene, camera)
      labels.update(width, height)
    },
  }
}
