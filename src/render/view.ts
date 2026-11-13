import * as THREE from 'three'
import { extent, type Vec } from '../sim/geometry'
import type { Arm, Lane } from '../sim/network'
import type { Sim, Vehicle } from '../sim/sim'
import { createCamera } from './camera'
import { carCentre, createCars } from './cars'
import { createArmConnections } from './connections'
import { createDay } from './day'
import { createJamEmotion } from './emotion'
import { createField } from './field'
import { createRouteInspector } from './inspector'
import { createMaterials } from './kit'
import { createLabels } from './labels'
import { createReveal } from './reveal'
import { createRoads } from './roads'
import { createScenery } from './scenery'
import { createSky } from './sky'
import { createUnderShadow, slabBounds } from './slab'
import { createWalkers } from './walkers'

const SHRINK = 0.3 // s for the cars to shrink out as a Reveal starts
const GROW = 1.5 // per second: how fast the new Level's cars grow in once its piece has landed

export type View = ReturnType<typeof createView>

/** Draws a Sim's District as a slab in open sky, and each Reveal as the next piece of slab assembling. */
export function createView(canvas: HTMLCanvasElement, sim: Sim) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setClearColor(0x000000, 0)

  const { district } = sim
  const levelOf = (s: Sim) => district.levels.indexOf(s.level)
  /** The slab once Level `level` is Revealed: its road plate and grass rim. */
  const slabAt = (level: number) => slabBounds(extent(district.levels.slice(0, level + 1).map((l) => l.slab)))
  const whole = extent(district.levels.map((l) => l.slab))
  const field = createField(district, whole)
  const materials = createMaterials()
  const scenery = createScenery(district, field, materials)
  const laid = scenery.lay(sim.net, levelOf(sim))
  const slab = slabAt(levelOf(sim))
  const { camera, resize, update: updateCamera, fit } = createCamera(canvas, slab)
  // Lit for the whole District from the start, so that no Reveal moves the shadows of the slab already there.
  const day = createDay(canvas, slabBounds(whole))
  const sky = createSky(slab)
  const under = createUnderShadow()
  under.fit(slab)
  let roads = createRoads(sim.net, district)
  const cars = createCars(sim.net)
  const walkers = createWalkers()
  walkers.add(sim.net, field, whole)
  const emotion = createJamEmotion()
  const armConnections = createArmConnections()
  const route = createRouteInspector()
  const labels = createLabels(canvas, camera, district)
  labels.show(sim.net, field)
  const reveal = createReveal(materials)
  const scene = new THREE.Scene().add(
    ...day.lights,
    ...laid,
    under.mesh,
    roads.group,
    ...cars.meshes,
    walkers.group,
    sky.group,
    emotion.group,
    armConnections.group,
    route.group,
    reveal.group,
  )

  // The canvas's size in CSS pixels, read only when it changes: reading it every frame would force a layout.
  let [width, height] = [0, 0]
  const fitCanvas = () => {
    ;[width, height] = [canvas.clientWidth, canvas.clientHeight]
    renderer.setSize(width, height, false)
    resize(width, height)
  }
  window.addEventListener('resize', fitCanvas)
  fitCanvas()

  const raycaster = new THREE.Raycaster()
  const roadPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  let inspected: Vehicle | null = null
  let shown = sim // the Sim whose cars are drawn
  let next: Sim | null = null // the Sim a Reveal is building toward, until its cars are shown
  let grow = 1 // the cars' size: they shrink out as a Reveal starts and grow back in once it has landed

  return {
    /** Stop the day at a time of day, 0–1. A dev aid: the player has no control over it. */
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

    /**
     * Whether a Reveal is under way: from `reveal` until the new Level's cars have grown in. The Level is not shown
     * yet, so its Sim should not run, and the build plays even while the world is paused.
     */
    get revealing() {
      return next !== null || grow < 1
    },

    /**
     * Play the Reveal of `level`'s Level, the Sim that the Reveal rebuilt: its piece of slab assembles, then its cars
     * grow in. The cars wait for the Sim's Pre-warm, which the caller runs meanwhile.
     * ponytail: the piece is cut and filled in this one call (about 130 ms for a column of the street grid), and the
     * first Reveal of a page compiles its shaders on its first frame (about 120 ms), so the click that starts it
     * stutters. Build across frames, or in a worker, if a larger piece makes that a noticeable pause.
     */
    reveal(level: Sim) {
      const build = scenery.reveal(level.net, levelOf(level))
      scene.add(...build.meshes)
      const paint = createRoads(level.net, district)
      const grown = slabAt(levelOf(level))
      fit(grown)
      under.fit(grown, true)
      ;[next, inspected] = [level, null]
      armConnections.show(null, null)
      reveal.play(build, {
        plate() {
          scene.remove(roads.group)
          roads.group.traverse((o) => {
            if (!(o instanceof THREE.Mesh)) return
            o.geometry.dispose()
            ;(o.material as THREE.Material).dispose()
          })
          roads = paint
          scene.add(roads.group)
        },
        blocks() {
          for (const mesh of build.replaced) {
            scene.remove(mesh)
            mesh.geometry.dispose()
          }
          walkers.remove(build.region, field)
        },
        done() {
          walkers.add(level.net, field, build.region)
          labels.show(level.net, field)
          sky.fit(grown)
        },
      })
    },

    /**
     * Draw a frame. `dt` is the real seconds since the last one, 0 while the sim is paused: it drives everything that
     * moves on its own (the day, the sky, the walkers, the Jam emotion and a Reveal), so a pause stops the whole world.
     */
    render(dt: number) {
      reveal.update(dt)
      if (next && !reveal.playing && next.prewarmed) {
        shown = next
        next = null
        cars.reset(shown.net)
      }
      grow = next ? Math.max(0, grow - dt / SHRINK) : Math.min(1, grow + dt * GROW)
      if (inspected && !shown.vehicles.includes(inspected)) inspected = null
      route.update(inspected)
      const glow = day.update(dt)
      materials.setGlow(glow)
      cars.setGlow(glow)
      emotion.update(cars.update(grow > 0 ? shown.vehicles : [], dt, grow), dt)
      walkers.update(dt)
      roads.update()
      updateCamera(dt)
      under.update(dt)
      sky.update(dt, camera.zoom)
      renderer.render(scene, camera)
      labels.update(width, height)
    },
  }
}
