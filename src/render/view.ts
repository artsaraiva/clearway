import * as THREE from 'three'
import { extent, sameBounds, type Bounds, type Vec } from '../sim/geometry'
import type { Junction } from '../sim/network'
import type { Sim, Vehicle } from '../sim/sim'
import { createCamera, type ScreenPoint } from './camera'
import { carCentre, createCars } from './cars'
import { createDay } from './day'
import { createJamEmotion } from './emotion'
import { createField } from './field'
import { createHand, SWAP_LIFT, type Held } from './hand'
import { createRouteInspector } from './inspector'
import { createMaterials } from './kit'
import { createLabels } from './labels'
import { createReveal } from './reveal'
import { createRoads } from './roads'
import { createScenery, finish, type Build, type Scenery } from './scenery'
import { createSky } from './sky'
import { createUnderShadow, slabBounds } from './slab'
import { createTools, NO_TOOLS, nearest, reach, targets, type Target, type ToolState } from './tools'
import { createWalkers } from './walkers'

const SHRINK = 0.3 // s for the cars to shrink out as a Rebuild starts
const GROW = 1.5 // per second: how fast the cars grow back in once the new pieces have landed
const CAR_PICK = 3 // m from a car's centre

// The Blocks are filled as if the City were this far across, around the cell a run starts on: towers by the start,
// houses far out. It is fixed, since the board has no bounds, so a Block comes out the same whenever its Tile is laid.
const FILL_EXTENT: Bounds = { x0: -300, y0: -300, x1: 300, y1: 300 }

export type View = ReturnType<typeof createView>

/** The ground a view draws a Sim on. */
export interface Ground {
  /** The slab so far: the cell of every Tile placed, in order. */
  pieces: Bounds[]
  scenery: Scenery
}

/** What a Rebuild did to the slab: the cell of the Tile it placed, of the Tile it swapped (or swapped back), or of the Tile an Undo took off. */
export type Relaid = { placed: Bounds } | { swapped: Bounds } | { removed: Bounds }

/**
 * Draws a Sim's City as a slab in open sky, and each Rebuild as its piece of slab assembling. The slab has no bounds:
 * the Blocks' field and the lighting follow the City as it grows, and the camera goes wherever the player takes it.
 */
export function createView(canvas: HTMLCanvasElement, sim: Sim, ground: Ground) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setClearColor(0x000000, 0)

  /** Every piece of slab laid so far. */
  const pieces = [...ground.pieces]
  /** The slab so far as a rectangle: its road plate and grass rim. */
  const slabNow = () => slabBounds(extent(pieces))
  const field = createField()
  const materials = createMaterials()
  const scenery = createScenery(ground.scenery, field, materials, FILL_EXTENT)
  const laid = pieces.flatMap((piece) => scenery.lay(sim, [piece]))
  let slab = slabNow()
  const rig = createCamera(canvas, slab) // the camera, and what moves it
  const day = createDay(canvas, slab)
  const sky = createSky(slab)
  const under = createUnderShadow()
  under.fit(slab)
  let roads = createRoads(sim.net, sim.spec)
  const cars = createCars(sim.net)
  const walkers = createWalkers()
  walkers.add(sim.net, field, pieces)
  const emotion = createJamEmotion()
  const tools = createTools()
  const route = createRouteInspector()
  const labels = createLabels(canvas, rig.camera, ground.scenery)
  labels.show(sim.net, sim.rates, field, pieces)
  const reveal = createReveal(materials)
  const hand = createHand()
  const scene = new THREE.Scene().add(
    ...day.lights,
    ...laid,
    under.mesh,
    roads.group,
    ...cars.meshes,
    walkers.group,
    sky.group,
    emotion.group,
    tools.group,
    route.group,
    reveal.group,
    hand.group,
  )

  // The canvas's size in CSS pixels, read only when it changes: reading it every frame would force a layout.
  let [width, height] = [0, 0]
  const fitCanvas = () => {
    ;[width, height] = [canvas.clientWidth, canvas.clientHeight]
    renderer.setSize(width, height, false)
    rig.resize(width, height)
  }
  window.addEventListener('resize', fitCanvas)
  fitCanvas()

  const raycaster = new THREE.Raycaster()
  const roadPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  let inspected: Vehicle | null = null
  let shown = sim // the Sim whose cars are drawn
  let next: Sim | null = null // the Sim a Rebuild is building toward, until its cars are shown
  let grow = 1 // the cars' size: they shrink out as a Rebuild starts and grow back in once it has landed

  /** Sim coordinates under the pointer, on the road plane. */
  const pick = (e: ScreenPoint): Vec | null => {
    const r = canvas.getBoundingClientRect()
    raycaster.setFromCamera(
      new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
      rig.camera,
    )
    const hit = raycaster.ray.intersectPlane(roadPlane, new THREE.Vector3())
    return hit ? { x: hit.x, y: -hit.z } : null
  }
  /** Metres of road under `px` pixels at the pointer, the most in any direction (the tilt foreshortens the board's depth). */
  const metres = (e: ScreenPoint, px: number) => {
    const p = pick(e)
    const across = pick({ clientX: e.clientX + px, clientY: e.clientY })
    const down = pick({ clientX: e.clientX, clientY: e.clientY + px })
    return p && across && down ? Math.max(Math.hypot(across.x - p.x, across.y - p.y), Math.hypot(down.x - p.x, down.y - p.y)) : 0
  }

  return {
    /** Stop the day at a time of day, 0–1. A dev aid: the player has no control over it. */
    holdDay: day.hold,

    /**
     * The camera, for the screen to move: `pan` and `rotate` follow drags and `zoomAt` the wheel; `northUp`,
     * `frameCity` and `toggleTilt` fly it. `heading` is how far the world is turned on screen, in radians clockwise
     * (0 with north up), so a top-down picture turned by it faces the way the board does. `steep` is whether the
     * camera looks down from its steepest tilt.
     */
    camera: rig.controls,

    pick,

    /** The Junction whose halo the pointer is inside. */
    junctionAt(e: ScreenPoint): Junction | null {
      const p = pick(e)
      return (p && shown.net.junctions.find((j) => Math.hypot(p.x - j.at.x, p.y - j.at.y) < reach(j))) ?? null
    },

    /**
     * The target of `junction` under the pointer: the nearest one the pointer is on, or within `slack` pixels of, so a
     * lane end stays easy to hit when the camera is far out. `accept` narrows the choice.
     */
    toolAt(e: ScreenPoint, junction: Junction, slack = 8, accept: (t: Target) => boolean = () => true): Target | null {
      const p = pick(e)
      return p && nearest(targets(junction).filter(accept), p, metres(e, slack))
    },

    /** The car under the pointer. */
    carAt(e: ScreenPoint): Vehicle | null {
      const p = pick(e)
      if (!p) return null
      const gap = (v: Vehicle) => {
        const c = carCentre(v)
        return Math.hypot(c.x - p.x, c.y - p.y)
      }
      return shown.vehicles.reduce<Vehicle | null>((best, v) => (gap(v) < (best ? gap(best) : CAR_PICK) ? v : best), null)
    },

    /** Show the Tools in the world as `state` has them. */
    showTools(state: ToolState) {
      tools.show(state)
    },

    /** Highlight a car's remaining route. `null` clears it. */
    inspectCar(v: Vehicle | null) {
      inspected = v
    },

    /**
     * Whether a Rebuild is under way: from `rebuild` until the new Sim's cars have grown in. Its traffic is not shown
     * yet, so the Sim should not run past its Pre-warm, and the build plays even while the world is paused.
     */
    get rebuilding() {
      return next !== null || grow < 1
    },

    /** Show the Tile in the player's hand, and what its drop does to the Gateways. `null` empties the hand. */
    hold(held: Held | null) {
      hand.show(held)
      // The Gateways a Swap would open float with the Tile in the hand, which floats over the Tile it would replace.
      labels.preview(held?.after ?? null, held?.swap ? SWAP_LIFT : 0)
    },

    /**
     * Play a Rebuild: `rebuilt` is the Sim it made and `relaid` what it did to the slab. A Tile placed assembles next
     * to the slab already there, a swapped one in the place of the Tile before it, and one an Undo takes off is gone
     * at once. Then the cars grow in. They wait for the Sim's Pre-warm, which the caller runs meanwhile.
     * ponytail: the piece is built in one go when the Rebuild starts, a hitch of a few ms for one cell. Spread the
     * build over frames (`scenery.add` is a generator) if a placement ever adds enough to drop one.
     */
    rebuild(rebuilt: Sim, relaid: Relaid) {
      const drop = (meshes: THREE.Mesh[]) => {
        scene.remove(...meshes)
        scenery.discard(meshes)
      }
      let build: Build | null = null
      /** The Tile a Swap replaced, which stands until the new road plate lands on it. */
      let old: THREE.Mesh[] = []
      if ('removed' in relaid) {
        pieces.splice(pieces.findIndex((p) => sameBounds(p, relaid.removed)), 1) // prettier-ignore
        walkers.remove([relaid.removed])
        drop(scenery.remove(relaid.removed))
      } else if ('swapped' in relaid) {
        walkers.remove([relaid.swapped])
        const swap = scenery.swap(rebuilt, relaid.swapped)
        ;[old, build] = [swap.old, finish(swap.building)]
      } else {
        pieces.push(relaid.placed)
        build = finish(scenery.add(rebuilt, [relaid.placed]))
      }
      if (build) scene.add(...build.meshes)
      const paint = createRoads(rebuilt.net, rebuilt.spec)
      const grown = slabNow()
      if (!sameBounds(grown, slab)) {
        slab = grown
        rig.setCity(grown)
        day.fit(grown)
        under.fit(grown, true)
      }
      // The camera stays where it is, unless the Tile laid is off screen: then it moves just far enough to show it.
      if ('placed' in relaid) rig.bringIn(relaid.placed)
      if ('swapped' in relaid) rig.bringIn(relaid.swapped)
      ;[next, inspected] = [rebuilt, null]
      tools.show(NO_TOOLS)
      labels.show(rebuilt.net, rebuilt.rates, field, pieces)
      const moments = {
        plate() {
          drop(old)
          scene.remove(roads.group)
          roads.group.traverse((o) => {
            if (!(o instanceof THREE.Mesh)) return
            o.geometry.dispose()
            ;(o.material as THREE.Material).dispose()
          })
          roads = paint
          scene.add(roads.group)
        },
        done() {
          if (build) walkers.add(rebuilt.net, field, build.pieces)
          sky.fit(grown)
        },
      }
      if (build) return reveal.play(build, moments)
      moments.plate()
      moments.done()
    },

    /**
     * Draw a frame. `dt` is the real seconds since the last one, 0 while the sim is paused: it drives everything that
     * moves on its own (the day, the sky, the walkers, the Jam emotion and a Rebuild), so a pause stops the whole world.
     * `real` is the real seconds paused or not: the camera keeps moving while the world is paused.
     */
    render(dt: number, real = dt) {
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
      hand.update()
      tools.update()
      roads.update()
      rig.update(real)
      under.update(dt)
      sky.update(dt, rig.camera.zoom)
      renderer.render(scene, rig.camera)
      labels.update(width, height)
    },
  }
}
