import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Polyline } from '../sim/geometry'
import { DAY } from './day'
import type { Fate } from './kit'
import type { Build } from './scenery'
import { tint } from './shapes'

// The details that move on their own (#149): each Zone's, drawn instanced and placed every frame, outside the merged
// static scenery. A mover works a loop that its Block's fill lays out, a stretch at a time, and rests at the end of a
// stretch: it sets out each morning and stops for the night once it has worked the day's stretches.

/** The kinds of mover, each with its own model. */
export type MoverKind = 'tractor'

/** A mover as a Block's fill lays it out, riding the brick of its build at `brick`. */
export interface Mover {
  kind: MoverKind
  /** The loop it works, closed: its last point is its first. */
  loop: Polyline
  /** How far along `loop` each stretch of work ends, in order: where it may stop for the night. */
  stops: number[]
  /** The stop it sets out from on the first day. */
  first: number
  /** m above the road it drives on. */
  h: number
  /** The index in its build of the brick it arrives with. */
  brick: number
}

/** The time of day (0–1, as the day's clock) at which the movers set out and stop work, and their share of work left free. */
const WORK = { from: 0.02, to: 0.5, slack: 0.2 }
/** Real seconds of work in a day. */
const SHIFT = (WORK.to - WORK.from) * DAY
// Per kind: m/s, how high it bobs (m) and how fast (rad/s) while it drives, and its model.
const KINDS: Record<MoverKind, { speed: number; bob: number; rate: number; model: () => THREE.BufferGeometry }> = {
  tractor: { speed: 2.8, bob: 0.035, rate: 15, model: tractor },
}

/**
 * A little tractor (#149), facing +x, centred under its middle and standing on y = 0, oversized as the cars are so it
 * reads with the whole City framed: big wheels behind, a persimmon bonnet, and a white canopy over the seat.
 */
function tractor(): THREE.BufferGeometry {
  const [BODY, TYRE, DARK, CANOPY] = ['#ea8548', '#2f3440', '#4a525c', '#f4f1ea']
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
    tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color)
  const wheel = (r: number, w: number, x: number, z: number) =>
    tint(new THREE.CylinderGeometry(r, r, w, 14).rotateX(Math.PI / 2).translate(x, r, z), TYRE)
  const parts = [
    wheel(0.62, 0.34, -0.55, 0.6),
    wheel(0.62, 0.34, -0.55, -0.6),
    wheel(0.36, 0.24, 0.9, 0.5),
    wheel(0.36, 0.24, 0.9, -0.5),
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
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!
  return merged.translate(-0.1, 0, 0).scale(1.3, 1.3, 1.3)
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

/** The movers of one build, and the reveal it may be playing on. */
interface Entry {
  build: Build
  movers: Mover[]
  playing?: Poses
}

/**
 * The moving details of every build in the scene, one instanced mesh per kind. Where each mover is follows from the
 * work done, a clock that runs only through the working day and while the world runs, so a mover built again (by a
 * Swap, a Rezoning or a Stage-up) carries on from where it was. A mover arrives with its brick in the build's reveal,
 * and leaves with its build.
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
  let t = 0 // s run, for the bob
  const [m, q, at, scale, up] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  ]

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
  }

  /** How far along `v`'s loop it is from stop `from` to the stop `count` stops on. */
  const reachOf = ({ loop, stops }: Mover, from: number, count: number) =>
    count >= stops.length ? loop.length : (((stops[(from + count) % stops.length] - stops[from]) % loop.length) + loop.length) % loop.length
  /**
   * How many stretches `v` works a day: as many as fit in the shift with some time left free, and never more than the
   * shift can drive, so that it always ends the day at a stop.
   */
  const perDay = new WeakMap<Mover, number>()
  const stretches = (v: Mover) => {
    let count = perDay.get(v)
    if (count) return count
    const most = KINDS[v.kind].speed * SHIFT
    const n = v.stops.length
    count = Math.min(n, Math.max(1, Math.floor(((1 - WORK.slack) * most * n) / v.loop.length)))
    while (count > 1 && v.stops.some((_, i) => reachOf(v, i, count!) > 0.95 * most)) count--
    perDay.set(v, count)
    return count
  }

  /**
   * Where mover `v` is: on the day's stretches, from the stop the day before ended at, as far as the work done today
   * takes it, so it stops at the end of a stretch and sets out from there next morning.
   */
  const place = (v: Mover) => {
    const { speed } = KINDS[v.kind]
    const { loop, stops } = v
    const n = stops.length
    const count = stretches(v)
    const day = Math.floor(work / SHIFT)
    const from = (v.first + day * count) % n
    const reach = reachOf(v, from, count)
    const done = speed * (work - day * SHIFT)
    return { ...along(loop, (stops[from] + Math.min(done, reach)) % loop.length), moving: working && done < reach }
  }

  return {
    group,

    /** Show the movers of `build`, arriving with their bricks as `playing` plays it, or at once. */
    add(build: Build, playing?: Poses) {
      if (!build.movers.length) return
      entries.push({ build, movers: build.movers, playing })
      remesh()
    },

    /** Take away the movers of the build whose meshes are `meshes`, as its meshes leave the scene. */
    drop(meshes: THREE.Mesh[]) {
      const kept = entries.filter((e) => e.build.meshes !== meshes)
      if (kept.length === entries.length) return
      entries = kept
      remesh()
    },

    /**
     * `dt` is the real seconds since the last frame, 0 while paused, and `time` the time of day (0–1): the movers work
     * only through the working day.
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
        if (!e.playing || e.playing.pose(e.build, e.movers[0]?.brick ?? 0)) continue
        e.playing = undefined
        const fate = (v: Mover): Fate => e.build.bricks[v.brick].fate
        const kept = e.movers.filter((v) => fate(v) !== 'goes')
        if (kept.length < e.movers.length) [e.movers, changed] = [kept, true]
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
          const { bob, rate } = KINDS[v.kind]
          const hop = p.moving ? bob * Math.abs(Math.sin(t * rate + i)) : 0
          q.setFromAxisAngle(up, p.heading)
          m.compose(at.set(p.x, v.h + pose.lift + hop, -p.y), q, scale.setScalar(Math.max(0.001, pose.scale)))
          mesh.setMatrixAt(i, m)
        }
      }
      for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true
    },
  }
}
