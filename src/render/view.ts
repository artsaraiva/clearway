import * as THREE from 'three'
import type { Cell, Zone } from '../city/city'
import type { Stage } from '../game/game'
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
import { createMaterials, type Finish, type Stages } from './kit'
import { createLabels } from './labels'
import { LOW_POLY } from './look'
import { createMovers } from './movers'
import { createReveal } from './reveal'
import { createRoads } from './roads'
import { createScenery, finish, type Build, type Building, type Scenery } from './scenery'
import { createSky } from './sky'
import { createUnderShadow, slabBounds } from './slab'
import { createTools, nearest, reach, targets, type Target, type ToolState } from './tools'
import { createWalkers } from './walkers'

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
  stageOf(cell: Cell): Stage
}

/** A Tile's piece to build again because the Tile went from one Stage to another, with its build once begun and done. */
interface StageUp {
  piece: Bounds
  stages: Stages
  begun?: { old: THREE.Mesh[]; building: Building }
  built?: Build
}

/** What an Undo did to the slab: the cell of the Tile it took off, or of the Tile whose Swap it took back. */
export type Undone = { takenOff: Bounds } | { swapped: Bounds }

/**
 * A Tile's Assembly, placed or swapped in: its piece, the build assembling on a reveal of its own, the Sim of the whole
 * City at its drop that the build stands on, whether its road plate has landed, whether all of it has and whether it has
 * opened to traffic, and how it opens.
 */
interface Assembly {
  piece: Bounds
  build: Build
  reveal: ReturnType<typeof createReveal>
  planned: Sim
  /** Whether it swaps out the Tile on its piece. */
  swap: boolean
  /** A Swap's: the meshes of the Tile it swaps out, which stand until its road plate lands on them. */
  old: THREE.Mesh[]
  plated: boolean
  built: boolean
  opened: boolean
  open: () => Sim
}

/**
 * Draws a Sim's City as a slab in open sky, and each Assembly as its piece of slab assembling. The slab has no bounds:
 * the Blocks' field and the lighting follow the City as it grows, and the camera goes wherever the player takes it.
 * `finishing` says whether the Zones built to the Finish wear their surface pattern and light pools (#174): both,
 * unless a sheet turns one off to show the Zone without it. `showcase` is for a scene that is only looked at, as the
 * title screen's: its clouds never fade as the camera comes close (`./sky`).
 */
export function createView(
  canvas: HTMLCanvasElement,
  sim: Sim,
  ground: Ground,
  { finishing, showcase = false }: { finishing?: Finish; showcase?: boolean } = {},
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  renderer.shadowMap.enabled = true
  // Low poly (`./look`), shadows are hard-edged: the shadow map is read without blur.
  if (LOW_POLY) renderer.shadowMap.type = THREE.BasicShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.setClearColor(0x000000, 0)

  /** Every piece of slab laid so far. */
  const pieces = [...ground.pieces]
  /** The slab so far as a rectangle: its road plate and grass rim. */
  const slabNow = () => slabBounds(extent(pieces))
  const field = createField()
  const materials = createMaterials(finishing)
  // Before the reveals, which copy the materials it patches.
  const stageInspector = createStageInspector(materials)
  const scenery = createScenery(ground.scenery, field, materials, ground.zoneOf, ground.stageOf)
  const laid = pieces.map((piece) => scenery.lay(sim, [piece]))
  const movers = createMovers()
  for (const build of laid) movers.add(build)
  let slab = slabNow()
  const rig = createCamera(canvas, slab) // the camera, and what moves it
  const day = createDay(canvas, slab)
  const sky = createSky(slab, showcase)
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
  const regrow = createReveal(materials) // a Rezoning's, and an Undo's of a Swap, which play beside the Assemblies
  /** The piece regrowing: a Rezoning's, or an Undo's of a Swap. */
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
    drop(job.begun!.old)
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
    movers.add(built, used.reveal)
    if (quietly) used.reveal.settle()
  }
  /** Finish at once the build of the Stage-up begun, if any, which then plays in its turn. */
  const buildAtOnce = () => {
    const job = waiting[0]
    if (job?.begun && !job.built) job.built = finish(job.begun.building)
  }
  /** The Assemblies playing, in the order dropped: the first that has not opened opens to traffic next. */
  const assemblies: Assembly[] = []
  /**
   * Make way for `piece` to be built again from the game as it stands: land at once whatever plays on it (a Rezoning, a
   * Stage-up begun or playing, or the rest of an Assembly that has opened to traffic), and drop a Stage-up waiting, since
   * the new build shows the Tile's Stage now.
   */
  const makeWay = (piece: Bounds) => {
    if (regrowing && sameBounds(regrowing, piece)) regrow.settle()
    for (const a of assemblies.filter((a) => a.opened && sameBounds(a.piece, piece))) a.reveal.settle()
    for (const p of playing) if (p.piece && sameBounds(p.piece, piece)) p.reveal.settle()
    if (waiting[0]?.begun && sameBounds(waiting[0].piece, piece)) playStageUp(waiting.shift()!, true)
    for (let i = waiting.length - 1; i >= 0; i--) if (sameBounds(waiting[i].piece, piece)) waiting.splice(i, 1)
  }
  /**
   * The reveals the Assemblies play on, one each. One whose build has landed plays the next, and one leaves the scene
   * while nothing of it moves, as a Stage-up's does.
   */
  const assemblers: ReturnType<typeof createReveal>[] = []
  const assembler = () => {
    let free = assemblers.find((r) => !r.playing)
    if (!free) assemblers.push((free = createReveal(materials)))
    if (!free.group.parent) scene.add(free.group)
    return free
  }
  /** The wires across the seams between Tiles, strung again whenever a Tile lands or is taken off. */
  let seams = scenery.seams()
  const restring = () => {
    if (seams) {
      scene.remove(seams)
      seams.geometry.dispose()
    }
    seams = scenery.seams(assemblies.filter((a) => !a.built).map((a) => a.piece))
    if (seams) scene.add(seams)
  }
  const hand = createHand()
  const rezoning = createRezoning()
  const scene = new THREE.Scene().add(
    ...day.lights,
    ...laid.flatMap((build) => build.meshes),
    movers.group,
    under.mesh,
    roads.group,
    ...cars.meshes,
    walkers.group,
    sky.group,
    emotion.group,
    tools.group,
    route.group,
    regrow.group,
    hand.group,
    rezoning.group,
  )
  if (seams) scene.add(seams)
  /** Take a build's meshes out of the scene, and its movers with them. */
  function drop(meshes: THREE.Mesh[]) {
    scene.remove(...meshes)
    scenery.discard(meshes)
    movers.drop(meshes)
  }

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
  /** Whether the browser asks for reduced motion: the clouds stop drifting and the cars stop shaking, and cars still drive. */
  let calm = false
  let shown = sim // the Sim whose cars are drawn
  let painted = sim // the Sim whose network the road paint shows

  /** Paint the roads of `by`'s network in place of the paint before. */
  const repaint = (by: Sim) => {
    if (by === painted) return
    painted = by
    scene.remove(roads.group)
    roads.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    })
    roads = createRoads(by.net, by.spec)
    scene.add(roads.group)
  }
  /**
   * Paint the roads as far as plate has landed: the network the last Tile dropped whose plate has landed but that has
   * not opened stands on, which has every Tile dropped before it, or else the traffic's.
   */
  const paintAssemblies = () => repaint([...assemblies].reverse().find((a) => a.plated && !a.opened)?.planned ?? shown)
  /** Take the piece of a Tile off the slab, its walkers and its scenery with it. */
  const takeUp = (piece: Bounds) => {
    pieces.splice(pieces.findIndex((p) => sameBounds(p, piece)), 1) // prettier-ignore
    walkers.remove([piece])
    drop(scenery.remove(piece))
  }
  /** Fit the camera, the light and the shadow under the slab to the slab as it stands, if it has grown or shrunk. */
  const refit = () => {
    const now = slabNow()
    if (sameBounds(now, slab)) return
    slab = now
    rig.setCity(now)
    day.fit(now)
    under.fit(now, true)
  }
  /** Show the traffic of `sim`, which drives on from the Sim shown (ADR 0006). */
  const driveOn = (sim: Sim) => {
    shown = sim
    cars.reset(shown.net, true)
    labels.show(shown.net, shown.rates, field, pieces)
  }
  /**
   * Open to traffic, in the order dropped, each Tile in its Assembly that has landed once every Tile dropped before it
   * has opened: a placed Tile once all of it has landed, a swapped one once its road plate has, since the Tile it swaps
   * out is gone then. The Sim its `open` gives drives on from the one shown. An Assembly that has opened and landed is
   * done.
   * ponytail: a Swap dropped within an Assembly of a Tile dropped before it waits for that Tile to land, up to about
   * 4 s after its own plate, and its traffic drives the old Layout's lanes over the new plate meanwhile. Let Tiles
   * that touch no other Tile in its Assembly land out of order if that shows.
   */
  const openLanded = () => {
    for (const a of assemblies) {
      if (a.opened) continue
      if (!(a.swap ? a.plated : a.built)) break
      a.opened = true
      const opened = a.open()
      // The network the Tile's piece stands on is the one it opens: its paint stands, following the new traffic.
      if (painted === a.planned) painted = opened
      driveOn(opened)
    }
    for (let i = assemblies.length - 1; i >= 0; i--) if (assemblies[i].opened && assemblies[i].built) assemblies.splice(i, 1)
    paintAssemblies()
  }
  /**
   * Put the build `building` of `piece` in the place of `old` over the slab standing: what stands on its Blocks drops in
   * again, as a Rezoning's does, on the real clock.
   */
  const regrowPiece = (piece: Bounds, { old, building }: { old: THREE.Mesh[]; building: Building }) => {
    const build = finish(building)
    drop(old)
    scene.add(...build.meshes)
    // After `play`, which lands a Rezoning still playing, and that one's `done` lets go of its piece.
    regrow.play(build, { plate() {}, done: () => (regrowing = null) }, 'rezone')
    movers.add(build, regrow)
    regrowing = piece
    return build
  }

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
    /** Stop the day at a time of day, 0–1. A dev aid, and the title screen's noon: the player has no control over it. */
    holdDay: day.hold,

    /** Whether the world moves less, as the browser's reduced motion asks: the clouds stop drifting and the cars stop shaking. */
    get calm() {
      return calm
    },
    set calm(on: boolean) {
      calm = on
    },

    /** Let go of the canvas and of everything drawn on it, for a view that is done with, as the title's when a run opens. */
    dispose() {
      window.removeEventListener('resize', fitCanvas)
      labels.remove()
      renderer.dispose()
      renderer.forceContextLoss()
    },

    /**
     * The camera, for the screen to move: `pan` and `rotate` follow drags, `zoomAt` the wheel and `drive` the keys; `northUp`,
     * `frameCity`, `toggleTilt` and `centreOn` fly it, and `look` puts it on a view at once. `heading` is how far the world is turned on screen, in radians
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

    /** Whether a Tile placed or swapped in is assembling, which plays even while the world is paused. */
    get assembling() {
      return assemblies.length > 0
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
     * `sim`, the Sim that runs on, and drops in where the old buildings stood. The traffic carries on, and it plays on
     * the real clock, paused or not.
     * ponytail: the piece is built in one go while the cars move, from about 7 ms for an industrial Tile to 26 ms for a
     * parks one on an M4 Pro (32 ms at worst), a dropped frame or two. Step `scenery.rezone`'s build over frames, and
     * swap the meshes once it is done, if the hitch shows on slower machines.
     */
    rezone(sim: Sim, piece: Bounds) {
      makeWay(piece)
      regrowPiece(piece, scenery.rezone(sim, piece))
    },

    /**
     * Show the Tile on `piece` reaching Stage `to` from `from`: its piece is built again over the next frames, a few ms
     * of each and holding both Stages' buildings, and then its lots change one by one on the real clock, each new
     * building dropping in as an Assembly's do. Confetti ends it, and then `onStageUp` hears of it. Tiles that reach a
     * Stage together are built in turn, and at most `STAGE_UPS.most` play at once: the rest wait, and none begins while
     * a Tile assembles. A Tile that reaches another Stage before its last one has begun goes straight there.
     * ponytail: a Block's step of the build can't be split, so a frame takes at least one. On an M4 Pro the longest
     * step is 10 ms for a median low-density Tile and 22 ms at worst (offices 6 and 17), and with 1,000 cars about one
     * Stage-up in two has a frame over 16.7 ms, up to 28 ms (#138). Split a Block's fill into its lots, a step each, if
     * that hitch shows on slower machines.
     */
    stageUp(piece: Bounds, from: Stage, to: Stage) {
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
     * Play a Tile's Assembly, placed or swapped in: its piece assembles next to the slab already there, or in the place
     * of the Tile it swaps out, which stands until the new road plate lands on it. It is built on `planned`, a Sim of the
     * whole City (it has every Tile dropped before this one), while the traffic shown drives on as it was. The road
     * paint follows as its plate lands. Several Tiles assemble at once, each on a reveal of its own, and each opens to
     * traffic in the order dropped (see `openLanded`): then `open` gives the Sim to show, which drives on from the one
     * shown (ADR 0006).
     * ponytail: the piece is built in one go at the drop, a hitch of 9 to 31 ms for one cell on an M4 Pro, from
     * industrial to parks. Spread the build over frames (`scenery.add` and `scenery.swap` build with generators) if the
     * hitch shows on slower machines.
     */
    assemble(planned: Sim, piece: Bounds, open: () => Sim) {
      const swap = pieces.some((p) => sameBounds(p, piece))
      if (swap) makeWay(piece)
      // A Stage-up begun is built at once, since the new piece lays the field again, and plays once no Tile assembles.
      buildAtOnce()
      let build: Build
      let old: THREE.Mesh[] = []
      if (swap) {
        const swapped = scenery.swap(planned, piece)
        ;[old, build] = [swapped.old, finish(swapped.building)]
      } else {
        pieces.push(piece)
        build = finish(scenery.add(planned, [piece]))
      }
      scene.add(...build.meshes)
      const assembly: Assembly = { piece, build, reveal: assembler(), planned, swap, old, plated: false, built: false, opened: false, open }
      assemblies.push(assembly)
      // Its seams wait for its poles to land.
      restring()
      refit()
      // The camera stays where it is, unless the Tile is off screen: then it moves just far enough to show it.
      rig.bringIn(piece)
      // Neither moment counts once an Undo has taken the Tile off.
      const ours = () => assemblies.includes(assembly)
      assembly.reveal.play(build, {
        plate() {
          if (!ours()) return
          assembly.plated = true
          // The Tile swapped out goes, its walkers with it.
          drop(assembly.old)
          assembly.old = []
          if (swap) walkers.remove([piece])
          openLanded()
        },
        done() {
          if (!ours()) return
          assembly.built = true
          walkers.add(planned.net, field, build.pieces)
          sky.fit(slab)
          restring()
          openLanded()
        },
      })
      movers.add(build, assembly.reveal)
    },

    /**
     * Show an Undo at once: `sim` is the game's Sim after it, which drives on from the one shown (ADR 0006), and `undone`
     * what it did to the slab. A Tile in its Assembly stops assembling. A Tile taken off is gone, and a Swap taken back
     * puts the Tile before it on its cell again, its road plate at once and the rest dropping in as a Rezoning's does.
     * ponytail: a Tile taken back is built in one go, a hitch of 9 to 31 ms for one cell on an M4 Pro, as `assemble`'s
     * is, and so are the buildings of a Tile whose Swap is taken back before its plate lands, which drop in again.
     * Build it over frames, and keep the old Tile's meshes standing when the plate never landed, if either shows.
     */
    undo(sim: Sim, undone: Undone) {
      const piece = 'takenOff' in undone ? undone.takenOff : undone.swapped
      const at = assemblies.findIndex((a) => sameBounds(a.piece, piece))
      if (at >= 0) {
        const [gone] = assemblies.splice(at, 1)
        gone.reveal.settle()
        drop(gone.old)
      }
      makeWay(piece)
      // As in `assemble`: the piece taken off or taken back lays the field again.
      buildAtOnce()
      if ('takenOff' in undone) takeUp(piece)
      else {
        walkers.remove([piece])
        const build = regrowPiece(piece, scenery.swap(sim, piece))
        walkers.add(sim.net, field, build.pieces)
      }
      restring()
      refit()
      sky.fit(slab)
      if (sim !== shown) driveOn(sim)
      else labels.show(shown.net, shown.rates, field, pieces)
      paintAssemblies()
    },

    /**
     * Draw a frame. `dt` is the real seconds since the last one, 0 while the sim is paused: it drives everything that
     * moves on its own (the day, the sky, the walkers and the Jam emotion), so a pause stops the whole world. An Assembly
     * plays on its own clock: the caller keeps `dt` running while one plays (`assembling`).
     * `real` is the real seconds paused or not: the camera keeps moving while the world is paused.
     */
    render(dt: number, real = dt) {
      for (const r of assemblers) {
        r.update(dt)
        if (!r.busy && r.group.parent) scene.remove(r.group)
      }
      regrow.update(real)
      // The next Stage-up whose piece nothing plays on is built a few ms at a time, then plays. None begins while a
      // Tile assembles, or while as many play as may.
      const end = performance.now() + STAGE_UPS.budget
      while (waiting.length && !assemblies.length) {
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
      if (inspected && !shown.vehicles.includes(inspected)) inspected = null
      route.update(inspected)
      stageInspector.update(real)
      const glow = day.update(dt)
      movers.update(dt, day.time, glow)
      materials.setGlow(glow)
      materials.setZoom(rig.camera.zoom)
      cars.setGlow(glow)
      emotion.update(cars.update(shown.vehicles, dt, calm), dt)
      walkers.update(dt)
      // m to a CSS pixel: the captions over the hand and a rezoning keep their lines readable however far out.
      const perPixel = (rig.camera.top - rig.camera.bottom) / rig.camera.zoom / height
      hand.update(perPixel)
      rezoning.update(perPixel)
      tools.update()
      // The give-way paint shows the traffic's Priorities, whatever network the paint stands on: an Assembly's once its
      // plate has landed.
      roads.update(shown.net)
      rig.update(real)
      under.update(dt)
      sky.update(dt, rig.camera.zoom, calm)
      renderer.render(scene, rig.camera)
      labels.update(width, height)
    },
  }
}
