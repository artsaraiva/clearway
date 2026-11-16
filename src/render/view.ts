import * as THREE from 'three'
import type { Cell, Zone } from '../city/city'
import { extent, sameBounds, type Bounds, type Vec } from '../sim/geometry'
import type { Junction } from '../sim/network'
import type { Sim, Vehicle } from '../sim/sim'
import { createCamera, type ScreenPoint } from './camera'
import { carCentre, createCars } from './cars'
import { createDay } from './day'
import { createJamEmotion } from './emotion'
import { createField } from './field'
import { createHand, createRezoning, SWAP_LIFT, type Held, type Rezoning } from './hand'
import { createRouteInspector, createStageInspector, type InspectedTile } from './inspector'
import { createMaterials, type Stages } from './kit'
import { createLabels } from './labels'
import { createReveal } from './reveal'
import { createRoads } from './roads'
import { createScenery, finish, type Build, type Building, type Scenery } from './scenery'
import { createSky } from './sky'
import { createUnderShadow, slabBounds } from './slab'
import { createTools, NO_TOOLS, nearest, reach, targets, type Target, type ToolState } from './tools'
import { createWalkers } from './walkers'

const SHRINK = 0.3 // s for the cars to shrink out as a Rebuild starts
const GROW = 1.5 // per second: how fast the cars grow back in once the new pieces have landed
const CAR_PICK = 3 // m from a car's centre
// Stage-ups: ms of each frame spent building the pieces of Tiles that reached a Stage, though always one step of a
// build, so that one is never stuck; how many may play at once; and the puffs of dust and confetti each has. Every puff
// is a sprite whose matrix three updates each frame even while it is hidden, so a Stage-up's reveal leaves the scene
// while it is idle: six idle ones cost 0.2 ms a frame on the 26-Tile City.
const STAGE_UPS = { budget: 3, most: 6, puffs: 60 }

export type View = ReturnType<typeof createView>

/** The ground a view draws a Sim on. */
export interface Ground {
  /** The slab so far: the cell of every Tile placed, in order. */
  pieces: Bounds[]
  scenery: Scenery
  /** The Zone of the Tile on `cell`, as the City has it when its piece is built. None: unzoned. */
  zoneOf(cell: Cell): Zone | undefined
  /** The Stage of the Tile on `cell`, as the game has it when its piece is built. Any, for an unzoned Tile. */
  stageOf(cell: Cell): number
}

/** A Tile's piece to build again because the Tile went from one Stage to another, with its build once begun and done. */
interface StageUp {
  piece: Bounds
  stages: Stages
  begun?: { old: THREE.Mesh[]; building: Building }
  built?: Build
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
  // Before the reveals, which copy the materials it patches.
  const stageInspector = createStageInspector(materials)
  const scenery = createScenery(ground.scenery, field, materials, ground.zoneOf, ground.stageOf)
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
  const regrow = createReveal(materials) // a Rezoning's, which plays beside a Rebuild's
  /** The piece of the Rezoning playing. */
  let regrowing: Bounds | null = null
  // Stage-ups waiting their turn, the first of them perhaps begun, and those playing, each on a reveal of its own so
  // that several Tiles can reach a Stage at once.
  const waiting: StageUp[] = []
  const playing: { reveal: ReturnType<typeof createReveal>; piece: Bounds | null }[] = []
  /** Called as a Stage-up has played to its end, with its piece and the Stage its Tile reached. */
  let onStageUp: ((piece: Bounds, stage: number) => void) | undefined
  /** Whether something plays on `piece` now, which a Stage-up of it must wait for: its meshes are the ones it replaces. */
  const busy = (piece: Bounds) =>
    (regrowing !== null && sameBounds(regrowing, piece)) || playing.some((p) => p.piece && sameBounds(p.piece, piece))
  /**
   * Play a Stage-up whose build is done: its meshes take the place of the old ones, and its lots change one by one, or
   * all at once and without celebrating if `quietly`.
   */
  const playStageUp = (job: StageUp, quietly = false) => {
    const built = job.built ?? finish(job.begun!.building)
    scene.remove(...job.begun!.old)
    scenery.discard(job.begun!.old)
    scene.add(...built.meshes)
    let slot = playing.find((p) => !p.piece)
    if (!slot) {
      slot = { reveal: createReveal(materials, STAGE_UPS.puffs), piece: null }
      playing.push(slot)
    }
    const used = slot
    if (!used.reveal.group.parent) scene.add(used.reveal.group)
    used.piece = job.piece
    const done = () => {
      used.piece = null
      if (!quietly) onStageUp?.(job.piece, job.stages.to)
    }
    used.reveal.play(built, { plate() {}, done }, 'stage-up')
    if (quietly) used.reveal.settle()
  }
  /** Finish at once the build of the Stage-up begun, if any, which then plays in its turn. */
  const buildAtOnce = () => {
    const job = waiting[0]
    if (job?.begun && !job.built) job.built = finish(job.begun.building)
  }
  /**
   * Make way for `piece` to be built again from the game as it stands: land at once a Stage-up playing on it or begun,
   * and drop one waiting, since the new build shows the Tile's Stage now.
   */
  const settleStageUps = (piece: Bounds) => {
    for (const p of playing) if (p.piece && sameBounds(p.piece, piece)) p.reveal.settle()
    if (waiting[0]?.begun && sameBounds(waiting[0].piece, piece)) playStageUp(waiting.shift()!, true)
    for (let i = waiting.length - 1; i >= 0; i--) if (sameBounds(waiting[i].piece, piece)) waiting.splice(i, 1)
  }
  const hand = createHand()
  const rezoning = createRezoning()
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
    regrow.group,
    hand.group,
    rezoning.group,
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
     * `frameCity`, `toggleTilt` and `centreOn` fly it. `heading` is how far the world is turned on screen, in radians
     * clockwise (0 with north up), so a top-down picture turned by it faces the way the board does. `steep` is whether
     * the camera looks down from its steepest tilt, and `onScreen` where a point of the road plane is on the canvas.
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
     * Tint the ground of every zoned Tile in `tiles` by its Stage, and stripe the ones a Jam holds back: the Stage
     * Inspector. `null` turns it off. Call it every frame.
     */
    inspectStages(tiles: InspectedTile[] | null) {
      stageInspector.show(tiles)
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

    /** Show what letting go of a Zone dragged over a placed Tile does to it. `null` shows nothing. */
    showRezoning(r: Rezoning | null) {
      rezoning.show(r)
    },

    /**
     * Show a Rezoning of the Tile on `piece`: what stands on its Blocks is built again as its Zone now has it, under
     * `sim`, the Sim that runs on, and drops in where the old buildings stood. It is no Rebuild: the traffic carries on,
     * and it plays on the real clock, paused or not.
     * ponytail: the piece is built in one go while the cars move, from about 7 ms for an industrial Tile to 26 ms for a
     * parks one on an M4 Pro (32 ms at worst), a dropped frame or two. Step `scenery.rezone`'s build over frames, and
     * swap the meshes once it is done, if the hitch shows on slower machines.
     */
    rezone(sim: Sim, piece: Bounds) {
      settleStageUps(piece)
      const { old, building } = scenery.rezone(sim, piece)
      const build = finish(building)
      scene.remove(...old)
      scenery.discard(old)
      scene.add(...build.meshes)
      // After `play`, which lands a Rezoning still playing, and that one's `done` lets go of its piece.
      regrow.play(build, { plate() {}, done: () => (regrowing = null) }, 'rezone')
      regrowing = piece
    },

    /**
     * Show the Tile on `piece` reaching Stage `to` from `from`, with no Rebuild: its piece is built again over the next
     * frames, a few ms of each and holding both Stages' buildings, and then its lots change one by one on the real
     * clock, each new building dropping in as a Rebuild's do. Confetti ends it, and then `onStageUp` hears of it. Tiles
     * that reach a Stage together are built in turn, and at most `STAGE_UPS.most` play at once: the rest wait, and none
     * begins while a Rebuild plays. A Tile that reaches another Stage before its last one has begun goes straight there.
     * ponytail: a Block's step of the build can't be split, so a frame takes at least one. On an M4 Pro the longest
     * step is 10 ms for a median low-density Tile and 22 ms at worst (offices 6 and 17), and with 1,000 cars about one
     * Stage-up in two has a frame over 16.7 ms, up to 28 ms (#138). Split a Block's fill into its lots, a step each, if
     * that hitch shows on slower machines.
     */
    stageUp(piece: Bounds, from: number, to: number) {
      const queued = waiting.find((j) => !j.begun && sameBounds(j.piece, piece))
      if (!queued) waiting.push({ piece, stages: { from, to } })
      else if (queued.stages.from === to) waiting.splice(waiting.indexOf(queued), 1)
      else queued.stages = { from: queued.stages.from, to }
    },

    /** Hear of each Stage-up as it plays to its end, with its piece and the Stage its Tile reached. */
    set onStageUp(f: ((piece: Bounds, stage: number) => void) | undefined) {
      onStageUp = f
    },

    /** How many Stage-ups are waiting, being built or playing. */
    get stagingUp() {
      return waiting.length + playing.filter((p) => p.piece).length
    },

    /**
     * Play a Rebuild: `rebuilt` is the Sim it made and `relaid` what it did to the slab. A Tile placed assembles next
     * to the slab already there, a swapped one in the place of the Tile before it, and one an Undo takes off is gone
     * at once. Then the cars grow in. They wait for the Sim's Pre-warm, which the caller runs meanwhile.
     * ponytail: the piece is built in one go when the Rebuild starts, a hitch of 9 to 31 ms for one cell on an M4 Pro,
     * from industrial to parks. Spread the build over frames (`scenery.add` is a generator) if the hitch shows on slower
     * machines.
     */
    rebuild(rebuilt: Sim, relaid: Relaid) {
      // A Rezoning still playing lands at once, since its piece may be the one rebuilt, and so does a Stage-up of that
      // piece. Another Stage-up begun is built at once, since this Rebuild lays the field again, and plays once it ends.
      regrow.settle()
      if ('swapped' in relaid) settleStageUps(relaid.swapped)
      if ('removed' in relaid) settleStageUps(relaid.removed)
      buildAtOnce()
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
      regrow.update(real)
      // The next Stage-up whose piece nothing plays on is built a few ms at a time, then plays. None begins while a
      // Rebuild plays, or while as many play as may.
      const end = performance.now() + STAGE_UPS.budget
      while (waiting.length && !next) {
        const at = waiting.findIndex((j) => j.begun || !busy(j.piece))
        if (at < 0) break
        const job = waiting[at]
        if (!job.begun) {
          if (playing.filter((p) => p.piece).length >= STAGE_UPS.most || performance.now() >= end) break
          waiting.unshift(...waiting.splice(at, 1))
          job.begun = scenery.stageUp(shown, job.piece, job.stages)
        }
        if (!job.built) {
          let step = job.begun.building.next()
          while (!step.done && performance.now() < end) step = job.begun.building.next()
          if (!step.done) break
          job.built = step.value
        }
        playStageUp(waiting.shift()!)
      }
      for (const p of playing) {
        p.reveal.update(real)
        if (!p.piece && !p.reveal.busy && p.reveal.group.parent) scene.remove(p.reveal.group)
      }
      if (next && !reveal.playing && next.prewarmed) {
        shown = next
        next = null
        cars.reset(shown.net)
      }
      grow = next ? Math.max(0, grow - dt / SHRINK) : Math.min(1, grow + dt * GROW)
      if (inspected && !shown.vehicles.includes(inspected)) inspected = null
      route.update(inspected)
      stageInspector.update(real)
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
