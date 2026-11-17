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
export type MoverKind = 'tractor' | 'truck' | 'forklift'

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

/** The kinds of thing that hangs from a line and sways in the wind (#157), each with its own model. */
export type SwayKind = 'laundry' | 'futon'

/**
 * Something hung from a line that sways in the wind (#157), riding the brick at `brick`, the line's or the rail's: it
 * swings about the line, out through the working day, and is taken in at night.
 */
export interface Sway {
  kind: SwayKind
  /** Its hinge, the middle of its top edge on the line, in Three coordinates. */
  at: THREE.Vector3
  /** The way the line runs, turned as the kit turns things: 0 along x (east–west). */
  ry: number
  /** m along the line and m it hangs: the model's 1 by 1 unless given. */
  size?: [number, number]
  /** The colour its model's white parts take. White unless given. */
  paint?: string
  brick: number
}

/** The time of day (0–1, as the day's clock) at which the movers set out and stop work, and their share of work left free. */
const WORK = { from: 0.02, to: 0.5, slack: 0.2 }
/** Real seconds of work in a day. */
const SHIFT = (WORK.to - WORK.from) * DAY
// Per kind: m/s, how high it bobs (m) and how fast (rad/s) while it drives, and its model.
const KINDS: Record<MoverKind, { speed: number; bob: number; rate: number; model: () => THREE.BufferGeometry }> = {
  tractor: { speed: 2.8, bob: 0.035, rate: 15, model: tractor },
  truck: { speed: 2.2, bob: 0.02, rate: 11, model: truck },
  forklift: { speed: 1.8, bob: 0.015, rate: 13, model: forklift },
}
/** The light wind that carries the smoke and leans what hangs on a line (#150, #157): m/s along Three's x and z. */
export const WIND = [0.55, -0.35] as const
// Smoke (#150): s between puffs from a chimney, how long a puff lasts (s), how fast it rises (m/s), its radius as it
// leaves the chimney and as it fades (m), how opaque it starts, and its colour.
const SMOKE = { every: 0.6, lasts: 5.5, rise: 1.6, from: 0.7, to: 2.5, opacity: 0.92, colour: '#f4f1ea' }
// What hangs on a line (#157), per kind: how far it leans with the wind and swings either side of that (rad), how fast
// it swings (rad/s, each piece drawing its own from the range), and its model, 1 m along the line, hanging 1 m from
// its hinge on the line (a futon is folded over it), white for its paint.
const SWAYS: Record<SwayKind, { lean: number; swing: number; rate: [number, number]; model: () => THREE.BufferGeometry }> = {
  laundry: {
    lean: 0.14,
    swing: 0.16,
    rate: [1.8, 2.7],
    model: () => tint(new THREE.BoxGeometry(1, 1, 0.04).translate(0, -0.5, 0), '#ffffff'),
  },
  futon: {
    lean: 0.04,
    swing: 0.045,
    rate: [1.1, 1.5],
    model: () => tint(new THREE.BoxGeometry(1, 1, 0.26).translate(0, -0.42, 0), '#ffffff'),
  },
}
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

/** The movers, plumes and swaying things of one build, the reveal it may be playing on, and its plumes' puffs. */
interface Entry {
  build: Build
  movers: Mover[]
  plumes: { plume: Plume; next: number; draw: () => number }[]
  puffs: Puff[]
  sways: Sway[]
  playing?: Poses
}

/**
 * Turn each vertex of a hung thing about its line, the model's x through its hinge, by the angle its instance's `swing`
 * (lean, swing, rate, phase) gives at `windTime`, in a gust that comes and goes (#157). The material's shader and its
 * shadow's both do it.
 */
function swaying(material: THREE.Material, wind: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 swing;
uniform float windTime;
float swayAngle() {
  return swing.x + swing.y * sin(windTime * swing.z + swing.w) * (0.7 + 0.3 * sin(windTime * 0.31 + swing.w * 1.7));
}
vec3 swayed(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = swayed(transformed, swayAngle());')
    if (shader.vertexShader.includes('#include <beginnormal_vertex>'))
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n\tobjectNormal = swayed(objectNormal, swayAngle());',
      )
  }
  return material
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

  // What hangs on a line (#157): one instanced mesh per kind, swung in its shader by the wind clock, which runs with
  // the world, so nothing moves while the game is paused. Its instances are placed when they come and go and while their
  // build plays, and not otherwise.
  const wind = { value: 0 }
  const cloth = swaying(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), wind)
  const clothDepth = swaying(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), wind)
  const hung = new Map((Object.keys(SWAYS) as SwayKind[]).map((k) => [k, SWAYS[k].model()]))
  const hangs = new Map<SwayKind, THREE.InstancedMesh>()
  let placed = false // whether every swaying thing stands where its build has it

  /** New instanced meshes for the things hung there are now, each swinging on its own. */
  const rehang = () => {
    for (const mesh of hangs.values()) {
      group.remove(mesh)
      mesh.geometry.dispose()
      mesh.dispose()
    }
    hangs.clear()
    for (const [kind, model] of hung) {
      const all = entries.flatMap((e) => e.sways.filter((s) => s.kind === kind))
      if (!all.length) continue
      const { lean, swing, rate } = SWAYS[kind]
      const swings = new Float32Array(all.length * 4)
      all.forEach((s, i) => {
        // It leans with the wind as far as the wind blows across its line, and swings at its own rate and phase.
        const draw = mulberry32(spot(s.at.x, s.at.z))
        const across = (-Math.sin(s.ry) * WIND[0] - Math.cos(s.ry) * WIND[1]) / Math.hypot(...WIND)
        swings.set([lean * across, swing * (0.8 + 0.4 * draw()), rate[0] + draw() * (rate[1] - rate[0]), draw() * Math.PI * 2], i * 4)
      })
      const geometry = model.clone()
      geometry.setAttribute('swing', new THREE.InstancedBufferAttribute(swings, 4))
      const mesh = new THREE.InstancedMesh(geometry, cloth, all.length)
      mesh.name = kind
      mesh.castShadow = mesh.receiveShadow = true
      mesh.customDepthMaterial = clothDepth
      mesh.frustumCulled = false
      mesh.visible = working
      all.forEach((s, i) => mesh.setColorAt(i, s.paint ? new THREE.Color(s.paint) : white))
      hangs.set(kind, mesh)
      group.add(mesh)
    }
    placed = false
  }

  /** Stand every swaying thing where its build has it, popping in with its brick while the build plays. */
  const hang = () => {
    const counts = new Map<SwayKind, number>()
    for (const e of entries) {
      for (const s of e.sways) {
        const mesh = hangs.get(s.kind)
        if (!mesh) continue
        const i = counts.get(s.kind) ?? 0
        counts.set(s.kind, i + 1)
        const pose = e.playing?.pose(e.build, s.brick) ?? { scale: 1, lift: 0 }
        const k = Math.max(0.001, pose.scale)
        const [w, tall] = s.size ?? [1, 1]
        q.setFromAxisAngle(up, s.ry)
        m.compose(at.set(s.at.x, s.at.y + pose.lift, s.at.z), q, scale.set(w * k, tall * k, k))
        mesh.setMatrixAt(i, m)
      }
    }
    for (const mesh of hangs.values()) mesh.instanceMatrix.needsUpdate = true
    placed = !entries.some((e) => e.playing && e.sways.length)
  }

  /** New instanced meshes for the movers there are now. */
  const remesh = () => {
    for (const mesh of meshes.values()) {
      group.remove(mesh)
      mesh.dispose()
    }
    meshes.clear()
    for (const [kind, model] of models) {
      const count = entries.reduce((n, e) => n + e.movers.filter((v) => v.kind === kind).length, 0)
      if (!count) continue
      const mesh = new THREE.InstancedMesh(model, material, count)
      mesh.name = kind
      mesh.castShadow = mesh.receiveShadow = true
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
        return { ...p, heading: p.heading + (reverse?.[from] ? Math.PI : 0), moving: working }
      }
      left -= reach / speed
      from = (from + 1) % n
    }
    // At stop `from`, facing as it came in: a stop at the loop's start is its end too.
    const p = along(loop, stops[from] || loop.length)
    return { ...p, heading: p.heading + (reverse?.[(from + n - 1) % n] ? Math.PI : 0), moving: false }
  }

  /** Whether brick `i` of entry `e`'s build stands at rest, in its place and at full size. */
  const stands = (e: Entry, i: number) => {
    const pose = e.playing?.pose(e.build, i)
    return !pose || (pose.scale > 0.999 && Math.abs(pose.lift) < 0.01)
  }

  return {
    group,

    /** Show the movers, plumes and swaying things of `build`, arriving with their bricks as `playing` plays it, or at once. */
    add(build: Build, playing?: Poses) {
      if (!build.movers.length && !build.plumes.length && !build.sways.length) return
      const plumes = build.plumes.map((plume) => {
        const draw = mulberry32(spot(plume.at.x, -plume.at.z))
        return { plume, next: draw() * SMOKE.every, draw }
      })
      entries.push({ build, movers: build.movers, plumes, puffs: [], sways: build.sways, playing })
      if (build.movers.length) remesh()
      if (build.sways.length) rehang()
    },

    /** Take away the movers, plumes and swaying things of the build whose meshes are `meshes`, as its meshes leave the scene. */
    drop(meshes: THREE.Mesh[]) {
      const kept = entries.filter((e) => e.build.meshes !== meshes)
      if (kept.length === entries.length) return
      const gone = entries.filter((e) => e.build.meshes === meshes)
      entries = kept
      if (gone.some((e) => e.movers.length)) remesh()
      if (gone.some((e) => e.sways.length)) rehang()
    },

    /**
     * `dt` is the real seconds since the last frame, 0 while paused, and `time` the time of day (0–1): the movers work,
     * the chimneys smoke and the laundry hangs out only through the working day.
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
      let [changed, rehung] = [false, false]
      for (const e of entries) {
        if (!e.playing || e.playing.pose(e.build, 0)) continue
        const fate = (i: number): Fate => e.build.bricks[i].fate
        const kept = e.movers.filter((v) => fate(v.brick) !== 'goes')
        if (kept.length < e.movers.length) [e.movers, changed] = [kept, true]
        e.plumes = e.plumes.filter((p) => fate(p.plume.brick) !== 'goes')
        const hanging = e.sways.filter((s) => fate(s.brick) !== 'goes')
        if (hanging.length < e.sways.length) [e.sways, rehung] = [hanging, true]
        e.playing = undefined
        placed = false
      }
      if (changed) remesh()
      if (rehung) rehang()
      // What hangs on a line swings with the wind through the working day, and is taken in for the night.
      wind.value += dt
      for (const mesh of hangs.values()) mesh.visible = working
      if (!placed) hang()
      const counts = new Map<MoverKind, number>()
      for (const e of entries) {
        for (const v of e.movers) {
          const mesh = meshes.get(v.kind)
          if (!mesh) continue
          const i = counts.get(v.kind) ?? 0
          counts.set(v.kind, i + 1)
          const pose = e.playing?.pose(e.build, v.brick) ?? { scale: 1, lift: 0 }
          const p = place(v)
          const { bob, rate } = KINDS[v.kind]
          const hop = p.moving ? bob * Math.abs(Math.sin(t * rate + i)) : 0
          q.setFromAxisAngle(up, p.heading)
          m.compose(at.set(p.x, v.h + pose.lift + hop, -p.y), q, scale.setScalar(Math.max(0.001, pose.scale)))
          mesh.setMatrixAt(i, m)
        }
      }
      for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true

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
          const [wx, wz] = WIND
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
