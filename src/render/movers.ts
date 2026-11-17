import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/demand'
import type { Polyline } from '../sim/geometry'
import { DAY } from './day'
import { spot, type Fate } from './kit'
import type { Build } from './scenery'
import { tint } from './shapes'

// The details that move on their own (#149): each Zone's, drawn instanced and placed every frame, outside the merged
// static scenery. A mover works a loop that its Block's fill lays out, a stretch at a time, and rests at the end of a
// stretch: it sets out each morning and stops for the night once it has worked the day's stretches. A chimney's smoke
// (#150) rises through the same working day.

/** The kinds of mover, each with its own model. */
export type MoverKind = 'tractor' | 'truck' | 'forklift' | 'butterfly'

/** A mover as a Block's fill lays it out, riding the brick of its build at `brick`. */
export interface Mover {
  kind: MoverKind
  /** The loop it works, closed: its last point is its first. */
  loop: Polyline
  /** How far along `loop` each stretch of work ends, in order: where it may stop for the night. */
  stops: number[]
  /** s it waits at each stop before setting out on the stretch from there (#150). None unless given. */
  waits?: number[]
  /** Whether it drives the stretch from each stop in reverse, facing the way it came (#150). None unless given. */
  reverse?: boolean[]
  /** The colour its model's white parts take (#150). White unless given. */
  paint?: string
  /** The stop it sets out from on the first day. */
  first: number
  /** m above the road it drives on. */
  h: number
  /** The index in its build of the brick it arrives with. */
  brick: number
}

/** A chimney's smoke (#150): puffs rise from `at`, its top, in Three coordinates, once the brick at `brick` stands. */
export interface Plume {
  at: THREE.Vector3
  brick: number
}

/** The time of day (0–1, as the day's clock) at which the movers set out and stop work, and their share of work left free. */
const WORK = { from: 0.02, to: 0.5, slack: 0.2 }
/** Real seconds of work in a day. */
const SHIFT = (WORK.to - WORK.from) * DAY
// Per kind: m/s, how high it bobs (m) and how fast (rad/s) while it drives, and its model. One that flies (#152) rises
// `fly.up` m off its path between stops, easing up and down over `fly.ease` m at each end of a stretch, and one with
// wings beats them `beat` times a second in flight and rests them nearly closed (`WINGS`).
interface Kind {
  speed: number
  bob: number
  rate: number
  model: () => THREE.BufferGeometry
  fly?: { up: number; ease: number }
  beat?: number
}
const KINDS: Record<MoverKind, Kind> = {
  tractor: { speed: 2.8, bob: 0.035, rate: 15, model: tractor },
  truck: { speed: 2.2, bob: 0.02, rate: 11, model: truck },
  forklift: { speed: 1.8, bob: 0.015, rate: 13, model: forklift },
  butterfly: { speed: 1.4, bob: 0.28, rate: 4.5, model: butterfly, fly: { up: 0.9, ease: 1.6 }, beat: 7 },
}
// How a resting butterfly holds its wings (rad up from flat): nearly closed over its back, fanning a little by day.
const WINGS = { rest: 1.25, fan: 0.22, night: 1.45, open: 0.35, sweep: 0.8 }
// Smoke (#150): s between puffs from a chimney, how long a puff lasts (s), how fast it rises (m/s) and how the wind
// carries it (m/s, Three's x and z), its radius as it leaves the chimney and as it fades (m), how opaque it starts, and
// its colour.
const SMOKE = { every: 0.6, lasts: 5.5, rise: 1.6, wind: [0.55, -0.35], from: 0.7, to: 2.5, opacity: 0.92, colour: '#f4f1ea' }
// ponytail: the most puffs drawn at once over the whole City, about 450 chimneys' worth: past it the newest builds'
// chimneys smoke unseen. Grow the mesh with the puffs, as `remesh` does the movers', if a City ever smokes more.
const PUFFS = 4096

/** A box `w` by `h` by `d` centred on `(x, z)` with its bottom at `y`, painted. */
const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
  tint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color)
/** A wheel of radius `r` and width `w` on an axle across the model at `x`, `z` out from the middle, `sides` round. */
const wheel = (r: number, w: number, x: number, z: number, color: string, sides = 14) =>
  tint(new THREE.CylinderGeometry(r, r, w, sides).rotateX(Math.PI / 2).translate(x, r, z), color)
/** The parts merged into one model. */
const merged = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!

/**
 * A little tractor (#149), facing +x, centred under its middle and standing on y = 0, oversized as the cars are so it
 * reads with the whole City framed: big wheels behind, a persimmon bonnet, and a white canopy over the seat.
 */
function tractor(): THREE.BufferGeometry {
  const [BODY, TYRE, DARK, CANOPY] = ['#ea8548', '#2f3440', '#4a525c', '#f4f1ea']
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
    tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color)
  const parts = [
    wheel(0.62, 0.34, -0.55, 0.6, TYRE),
    wheel(0.62, 0.34, -0.55, -0.6, TYRE),
    wheel(0.36, 0.24, 0.9, 0.5, TYRE),
    wheel(0.36, 0.24, 0.9, -0.5, TYRE),
    box(1.35, 0.62, 0.66, 0.6, 0.86, 0, BODY), // the bonnet
    box(0.06, 0.5, 0.56, 1.29, 0.84, 0, DARK), // its grille
    box(0.85, 0.5, 0.72, -0.48, 0.86, 0, BODY),
    box(0.84, 0.1, 0.4, -0.55, 1.3, 0.6, BODY), // mudguards
    box(0.84, 0.1, 0.4, -0.55, 1.3, -0.6, BODY),
    box(0.36, 0.14, 0.42, -0.62, 1.18, 0, DARK), // the seat
    box(0.06, 0.42, 0.06, -0.22, 1.3, 0, DARK), // the wheel's column
    box(1.08, 0.08, 1.02, -0.6, 2.18, 0, CANOPY),
    tint(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6).translate(0.95, 1.42, 0.2), DARK), // the exhaust
  ]
  for (const x of [-1.04, -0.16]) for (const z of [-0.44, 0.44]) parts.push(box(0.06, 1.02, 0.06, x, 1.65, z, CANOPY))
  return merged(parts).translate(-0.1, 0, 0).scale(1.3, 1.3, 1.3)
}

/**
 * A small box truck (#150), the flat-fronted kind that works Japanese towns, facing +x, centred under its middle and
 * standing on y = 0: a cab over its front wheels and a tall box behind, 6.5 m long and oversized across as the cars
 * are. Cab and box are white, for the paint each truck takes.
 */
function truck(): THREE.BufferGeometry {
  const [PAINT, TYRE, DARK, GLASS, TRIM] = ['#ffffff', '#2f3440', '#4a525c', '#41566c', '#c4ccd4']
  const parts = [
    part(6.2, 0.34, 1.9, 0, 0.5, 0, DARK), // the chassis
    part(1.5, 1.95, 2.3, 2.5, 0.75, 0, PAINT), // the cab
    part(0.06, 0.78, 2.1, 3.26, 1.75, 0, GLASS), // its windscreen
    part(0.9, 0.62, 0.06, 2.62, 1.78, 1.16, GLASS), // its side windows
    part(0.9, 0.62, 0.06, 2.62, 1.78, -1.16, GLASS),
    part(0.16, 0.36, 2.36, 3.22, 0.48, 0, TRIM), // the bumper
    part(4.75, 2.55, 2.4, -0.68, 0.86, 0, PAINT), // the box
    part(0.08, 2.45, 2.3, -3.07, 0.9, 0, TRIM), // its doors at the back
  ]
  for (const x of [2.35, -1.45, -2.25]) for (const z of [0.9, -0.9]) parts.push(wheel(0.46, 0.4, x, z, TYRE, 8))
  return merged(parts)
}

/**
 * A forklift (#150), forks first along +x, centred under its middle and standing on y = 0, oversized as the cars are:
 * a yellow body and counterweight, a dark mast with its forks low, and a guard over the seat.
 */
function forklift(): THREE.BufferGeometry {
  const [BODY, TYRE, DARK, FORKS] = ['#f0c75e', '#2f3440', '#4a525c', '#9aa3ad']
  const parts = [
    part(1.5, 0.75, 1.1, -0.05, 0.3, 0, BODY), // the body
    part(0.45, 0.95, 1.12, -0.72, 0.3, 0, BODY), // the counterweight
    part(0.42, 0.12, 0.5, -0.25, 1.05, 0, DARK), // the seat
    part(0.08, 0.5, 0.08, -0.4, 1.05, 0, DARK), // its back
    part(1.2, 0.07, 1.06, -0.15, 2.1, 0, DARK), // the guard over the seat
    part(0.12, 1.94, 0.18, 0.78, 0.25, 0.38, DARK), // the mast
    part(0.12, 1.94, 0.18, 0.78, 0.25, -0.38, DARK),
    part(0.08, 0.6, 0.86, 0.88, 0.12, 0, DARK), // the carriage
    part(1.05, 0.06, 0.16, 1.42, 0.1, 0.28, FORKS),
    part(1.05, 0.06, 0.16, 1.42, 0.1, -0.28, FORKS),
  ]
  for (const x of [-0.7, 0.36]) for (const z of [-0.5, 0.5]) parts.push(part(0.06, 1.1, 0.06, x, 1.02, z * 1.02, DARK))
  for (const z of [0.48, -0.48]) parts.push(wheel(0.3, 0.24, 0.45, z, TYRE, 8), wheel(0.25, 0.22, -0.55, z, TYRE, 8))
  return merged(parts).translate(-0.3, 0, 0).scale(1.3, 1.3, 1.3)
}

/**
 * A butterfly (#152), facing +x and centred on its body, its wings flat along z: a dark body and four white wings with
 * dark tips, for the paint each takes, about 0.85 m across, oversized so that it reads close up. Its wings beat in the
 * vertex shader (`createMovers`), about the body, by the angle each instance's `wing` gives.
 */
function butterfly(): THREE.BufferGeometry {
  const [WING, DARK] = ['#ffffff', '#4a525c']
  /** A flat polygon in the xz plane, fanned from its first point, mirrored to -z if `mirror`. */
  const flat = (pts: [number, number][], y: number, color: string, mirror: boolean) => {
    const v: number[] = []
    for (let i = 1; i < pts.length - 1; i++) for (const [x, z] of [pts[0], pts[i], pts[i + 1]]) v.push(x, y, mirror ? -z : z)
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return tint(g, color)
  }
  // The right wings' outlines (m, x forward and z out from the body): the forewing, its dark tip, and the hindwing.
  // prettier-ignore
  const [fore, tip, hind]: [number, number][][] = [
    [[0.09, 0.03], [-0.03, 0.03], [0.02, 0.3], [0.17, 0.27]],
    [[0.08, 0.24], [0.03, 0.3], [0.16, 0.27]],
    [[-0.02, 0.03], [-0.15, 0.04], [-0.17, 0.19], [-0.04, 0.21]],
  ]
  const parts = [part(0.3, 0.06, 0.06, -0.02, -0.03, 0, DARK).deleteAttribute('uv')]
  for (const mirror of [false, true]) parts.push(flat(fore, 0, WING, mirror), flat(tip, 0.004, DARK, mirror), flat(hind, 0, WING, mirror))
  return merged(parts).scale(1.4, 1.4, 1.4)
}

/** 0 to 1 eased in and out. */
const smooth = (k: number) => k * k * (3 - 2 * k)

/** Where `s` m along `line` lies, and the way it heads there: the segment found by halving, as a loop has hundreds. */
function along(line: Polyline, s: number): { x: number; y: number; heading: number } {
  const { pts, cum } = line
  let [lo, hi] = [1, pts.length - 1]
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < s) lo = mid + 1
    else hi = mid
  }
  const [a, b] = [pts[lo - 1], pts[lo]]
  const seg = cum[lo] - cum[lo - 1]
  const t = seg > 0 ? Math.min(1, Math.max(0, (s - cum[lo - 1]) / seg)) : 0
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x) }
}

/** How a build that plays stands now: brick `i`'s scale and how high it is lifted, or null once it plays no more. */
export interface Poses {
  pose(of: Build, i: number): { scale: number; lift: number } | null
}

/** A puff of smoke in the air: where it left its chimney, when (s run), and its own drift. */
interface Puff {
  x: number
  y: number
  z: number
  born: number
  dx: number
  dz: number
}

/** The movers and plumes of one build, the reveal it may be playing on, and its plumes' puffs. */
interface Entry {
  build: Build
  movers: Mover[]
  plumes: { plume: Plume; next: number; draw: () => number }[]
  puffs: Puff[]
  playing?: Poses
}

/**
 * The moving details of every build in the scene, one instanced mesh per kind. Where each mover is follows from the
 * work done, a clock that runs only through the working day and while the world runs, so a mover built again (by a
 * Swap, a Rezoning or a Stage-up) carries on from where it was. A mover arrives with its brick in the build's reveal,
 * and leaves with its build. Each chimney smokes while the working day runs, once its brick stands, its puffs one
 * instanced mesh of soft spheres that fade as they rise.
 * ponytail: every instance is placed each frame, parked or not, which is nothing at a few hundred. Skip the parked
 * ones if a City ever holds thousands.
 */
export function createMovers() {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  // Wings (#152): each vertex off the body turns up about it by its instance's `wing`, the left wing and the right
  // mirrored, and its normal with it.
  const winged = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })
  winged.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wing;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
\tfloat wSide = position.z > 0.035 ? 1.0 : (position.z < -0.035 ? -1.0 : 0.0);
\tfloat wC = cos(wing * abs(wSide));
\tfloat wS = sin(wing * abs(wSide));
\tobjectNormal = vec3(objectNormal.x, objectNormal.y * wC + wSide * objectNormal.z * wS, -wSide * objectNormal.y * wS + objectNormal.z * wC);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
\ttransformed = vec3(transformed.x, transformed.y * wC + wSide * transformed.z * wS, -wSide * transformed.y * wS + transformed.z * wC);`,
      )
  }
  const models = new Map((Object.keys(KINDS) as MoverKind[]).map((k) => [k, KINDS[k].model()]))
  const meshes = new Map<MoverKind, THREE.InstancedMesh>()
  let entries: Entry[] = []
  let work = 0 // s worked: a whole number of shifts outside the working day
  let working = false
  let t = 0 // s run, for the bob and the smoke
  const [m, q, at, scale, up, white] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    new THREE.Color('#ffffff'),
  ]

  // The puffs of smoke: soft spheres, each faded by its own share of the material's opacity.
  const fades = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1)
  const ball = new THREE.IcosahedronGeometry(1, 2)
  ball.setAttribute('fade', fades)
  const haze = new THREE.MeshStandardMaterial({
    color: SMOKE.colour,
    roughness: 1,
    transparent: true,
    depthWrite: false,
    opacity: SMOKE.opacity,
    emissive: SMOKE.colour, // a little light of its own, so that a puff's shaded side stays soft
    emissiveIntensity: 0.3,
  })
  haze.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFade = fade;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vFade;')
  }
  const smoke = new THREE.InstancedMesh(ball, haze, PUFFS)
  smoke.name = 'smoke'
  smoke.count = 0
  smoke.frustumCulled = false
  smoke.renderOrder = 3
  group.add(smoke)

  /** New instanced meshes for the movers there are now. */
  const remesh = () => {
    for (const mesh of meshes.values()) {
      group.remove(mesh)
      mesh.dispose()
      if (mesh.geometry !== models.get(mesh.name as MoverKind)) mesh.geometry.dispose()
    }
    meshes.clear()
    for (const [kind, model] of models) {
      const count = entries.reduce((n, e) => n + e.movers.filter((v) => v.kind === kind).length, 0)
      if (!count) continue
      // A winged kind's model carries each instance's wing angle, so it takes a copy of its own.
      const beats = KINDS[kind].beat !== undefined
      const geometry = beats ? model.clone().setAttribute('wing', new THREE.InstancedBufferAttribute(new Float32Array(count), 1)) : model
      const mesh = new THREE.InstancedMesh(geometry, beats ? winged : material, count)
      mesh.name = kind
      mesh.castShadow = !beats // a wing's shadow would not beat with it
      mesh.receiveShadow = true
      mesh.frustumCulled = false // instances move; the mesh's own bounds mean nothing
      meshes.set(kind, mesh)
      group.add(mesh)
    }
    // The paint each mover takes, which stays until the next remesh.
    const counts = new Map<MoverKind, number>()
    for (const e of entries) {
      for (const v of e.movers) {
        const mesh = meshes.get(v.kind)!
        const i = counts.get(v.kind) ?? 0
        counts.set(v.kind, i + 1)
        mesh.setColorAt(i, v.paint ? new THREE.Color(v.paint) : white)
      }
    }
  }

  /** How far along `v`'s loop it drives from stop `from` to the stop `count` stops on, going round as often as that takes. */
  const reachOf = ({ loop, stops }: Mover, from: number, count: number) => {
    const n = stops.length
    const part = count % n ? (((stops[(from + count) % n] - stops[from]) % loop.length) + loop.length) % loop.length : 0
    return Math.floor(count / n) * loop.length + part
  }
  /** s `v` takes from stop `from` to the stop `count` stops on, waiting at each stop on the way before it sets out. */
  const timeOf = (v: Mover, from: number, count: number) => {
    let waited = 0
    for (let k = 0; k < count; k++) waited += v.waits?.[(from + k) % v.stops.length] ?? 0
    return reachOf(v, from, count) / KINDS[v.kind].speed + waited
  }
  /**
   * How many stretches `v` works a day: as many as fit in the shift with some time left free, round its loop as often
   * as that takes (a forklift's, many times), and never more than the shift has time for, so that it always ends the
   * day at a stop.
   */
  const perDay = new WeakMap<Mover, number>()
  const stretches = (v: Mover) => {
    let count = perDay.get(v)
    if (count) return count
    const n = v.stops.length
    count = Math.max(1, Math.floor(((1 - WORK.slack) * SHIFT * n) / timeOf(v, 0, n)))
    while (count > 1 && v.stops.some((_, i) => timeOf(v, i, count!) > 0.95 * SHIFT)) count--
    perDay.set(v, count)
    return count
  }

  /**
   * Where mover `v` is: on the day's stretches, from the stop the day before ended at, as far as the work done today
   * takes it, waiting at each stop on the way, so it stops at the end of a stretch and sets out from there next
   * morning. It faces back along the way it drives a stretch in reverse.
   */
  const place = (v: Mover) => {
    const { speed } = KINDS[v.kind]
    const { loop, stops, waits, reverse } = v
    const n = stops.length
    const count = stretches(v)
    const day = Math.floor(work / SHIFT)
    let from = (v.first + day * count) % n
    let left = work - day * SHIFT // s of today's work still to follow
    for (let k = 0; k < count; k++) {
      left -= waits?.[from] ?? 0
      if (left < 0) break
      const reach = reachOf(v, from, 1)
      if (left * speed < reach) {
        const p = along(loop, (stops[from] + left * speed) % loop.length)
        const off = Math.min(left * speed, reach - left * speed) // m from the nearer end of the stretch
        return { ...p, heading: p.heading + (reverse?.[from] ? Math.PI : 0), moving: working, off }
      }
      left -= reach / speed
      from = (from + 1) % n
    }
    // At stop `from`, facing as it came in: a stop at the loop's start is its end too.
    const p = along(loop, stops[from] || loop.length)
    return { ...p, heading: p.heading + (reverse?.[(from + n - 1) % n] ? Math.PI : 0), moving: false, off: 0 }
  }

  /** Whether brick `i` of entry `e`'s build stands at rest, in its place and at full size. */
  const stands = (e: Entry, i: number) => {
    const pose = e.playing?.pose(e.build, i)
    return !pose || (pose.scale > 0.999 && Math.abs(pose.lift) < 0.01)
  }

  return {
    group,

    /** Show the movers and plumes of `build`, arriving with their bricks as `playing` plays it, or at once. */
    add(build: Build, playing?: Poses) {
      if (!build.movers.length && !build.plumes.length) return
      const plumes = build.plumes.map((plume) => {
        const draw = mulberry32(spot(plume.at.x, -plume.at.z))
        return { plume, next: draw() * SMOKE.every, draw }
      })
      entries.push({ build, movers: build.movers, plumes, puffs: [], playing })
      if (build.movers.length) remesh()
    },

    /** Take away the movers and plumes of the build whose meshes are `meshes`, as its meshes leave the scene. */
    drop(meshes: THREE.Mesh[]) {
      const kept = entries.filter((e) => e.build.meshes !== meshes)
      if (kept.length === entries.length) return
      const moved = entries.some((e) => e.build.meshes === meshes && e.movers.length)
      entries = kept
      if (moved) remesh()
    },

    /**
     * `dt` is the real seconds since the last frame, 0 while paused, and `time` the time of day (0–1): the movers work
     * and the chimneys smoke only through the working day.
     */
    update(dt: number, time: number) {
      t += dt
      const was = working
      working = time >= WORK.from && time < WORK.to
      // At the end of the working day the day's work is done, so every mover stops at the end of its last stretch,
      // even when the time of day jumps there.
      if (was && !working) work = Math.ceil(work / SHIFT - 1e-6) * SHIFT
      if (working) work += dt
      // A build that has played out keeps only what its Stage has.
      let changed = false
      for (const e of entries) {
        const first = e.movers[0]?.brick ?? e.plumes[0]?.plume.brick ?? 0
        if (!e.playing || e.playing.pose(e.build, first)) continue
        const fate = (i: number): Fate => e.build.bricks[i].fate
        const kept = e.movers.filter((v) => fate(v.brick) !== 'goes')
        if (kept.length < e.movers.length) [e.movers, changed] = [kept, true]
        e.plumes = e.plumes.filter((p) => fate(p.plume.brick) !== 'goes')
        e.playing = undefined
      }
      if (changed) remesh()
      const counts = new Map<MoverKind, number>()
      for (const e of entries) {
        for (const v of e.movers) {
          const mesh = meshes.get(v.kind)
          if (!mesh) continue
          const i = counts.get(v.kind) ?? 0
          counts.set(v.kind, i + 1)
          const pose = e.playing?.pose(e.build, v.brick) ?? { scale: 1, lift: 0 }
          const p = place(v)
          const { bob, rate, fly, beat } = KINDS[v.kind]
          // In flight, risen off its path, eased up from a stop and down onto the next.
          const rise = fly ? fly.up * smooth(Math.min(1, p.off / fly.ease)) : 0
          const hop = p.moving ? bob * Math.abs(Math.sin(t * rate + i)) * (fly ? smooth(Math.min(1, p.off / fly.ease)) : 1) : 0
          q.setFromAxisAngle(up, p.heading)
          m.compose(at.set(p.x, v.h + pose.lift + rise + hop, -p.y), q, scale.setScalar(Math.max(0.001, pose.scale)))
          mesh.setMatrixAt(i, m)
          if (beat !== undefined) {
            const wing = mesh.geometry.getAttribute('wing') as THREE.InstancedBufferAttribute
            const angle = p.moving
              ? WINGS.open + WINGS.sweep * Math.sin(t * beat * Math.PI * 2 + i * 1.7)
              : working
                ? WINGS.rest + WINGS.fan * Math.sin(t * 1.3 + i)
                : WINGS.night
            wing.setX(i, angle)
          }
        }
      }
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.needsUpdate = true
        const wing = mesh.geometry.getAttribute('wing')
        if (wing) wing.needsUpdate = true
      }

      // Smoke: each standing chimney puffs while the working day runs, and its puffs rise, swell and fade.
      let n = 0
      q.identity()
      for (const e of entries) {
        for (const p of e.plumes) {
          if (!working || !stands(e, p.plume.brick)) continue
          for (p.next -= dt; p.next <= 0; p.next += SMOKE.every) {
            const { x, y, z } = p.plume.at
            const [a, r] = [p.draw() * Math.PI * 2, 0.25 + 0.25 * p.draw()]
            e.puffs.push({ x, y, z, born: t + p.next, dx: Math.cos(a) * r, dz: Math.sin(a) * r })
          }
        }
        e.puffs = e.puffs.filter((f) => t - f.born < SMOKE.lasts)
        for (const f of e.puffs) {
          if (n >= PUFFS) break
          const age = Math.max(0, t - f.born)
          const k = age / SMOKE.lasts
          const [wx, wz] = SMOKE.wind
          at.set(f.x + (wx + f.dx) * age, f.y + SMOKE.rise * age * (1 - 0.3 * k), f.z + (wz + f.dz) * age)
          m.compose(at, q, scale.setScalar(SMOKE.from + (SMOKE.to - SMOKE.from) * Math.sqrt(k)))
          smoke.setMatrixAt(n, m)
          fades.setX(n, Math.min(1, age / 0.4) * (1 - k) ** 1.8)
          n++
        }
      }
      smoke.count = n
      smoke.instanceMatrix.needsUpdate = true
      fades.needsUpdate = true
    },
  }
}
