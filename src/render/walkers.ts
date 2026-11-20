import * as THREE from 'three'
import { pointAt, polyline, sameBounds, type Bounds, type Polyline } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { KERB } from './blocks'
import { FACET } from './prototype-look'
import { PARKING } from '../sim/prototype-signals'
import { crossingsOf } from './prototype-signals'
import { type CrossingEnd, FIGURES, jointed, live, liftOf, newDriver, newPerson, type Person, setCrossings } from './prototype-walkers'
import { inside, type Field } from './field'
import { shopper } from './movers'
import { merged, part, takesPaint, tint } from './shapes'

const INSET = 1.6 // m in from the kerb: the pavement's centre line
const SPACING = FACET ? 26 : 85 // m of pavement per walker (PROTOTYPE, `./prototype-look`: more of them)
// The cars' colours, a walker's paint: every walker wears one, on whatever of its model takes paint (`model`).
const SHIRTS = ['#db6982', '#009dcb', '#ffc52d', '#ffffff', '#64cb9f', '#bc9ef2', '#2f3440', '#ff9cbb'].map((c) => new THREE.Color(c))

/** A kind of walker (#176), each with a model of its own, seen at Block zoom: a shopper with a bag, a schoolchild in a yellow hat, an office worker. */
type WalkerKind = 'shopper' | 'schoolchild' | 'worker'

/**
 * The parts merged into one model, facing +x, its white parts taking its instance's paint.
 * ponytail: a part takes paint by being pure white, so the schoolchild's and the office worker's white shirts are
 * `#fbf8f2`, a shade off, to keep their own colour; a part that must show pure white would take its walker's paint.
 * Give each part its share with `painted` (`./shapes`), as the cars' parts have theirs, if one ever must.
 */
const model = (parts: THREE.BufferGeometry[]) => {
  const g = merged(parts)
  const colour = g.attributes.color
  const share = new Float32Array(colour.count)
  for (let i = 0; i < colour.count; i++) share[i] = colour.getX(i) + colour.getY(i) + colour.getZ(i) > 2.99 ? 1 : 0
  return g.setAttribute('painted', new THREE.BufferAttribute(share, 1))
}

// The kinds (#176), each drawn a little large as the walkers always were: how many of every ten walkers are of each,
// and its model. A shopper is the shops' (#175), in a coat in its paint; a schoolchild in a white shirt and navy shorts
// under a yellow hat, a satchel on its back; an office worker in a dark suit with a white shirt and a briefcase.
const SKIN_TONE = '#f1d1b5'
const HAIR = '#3a3330'
const KINDS: Record<WalkerKind, { share: number; model: () => THREE.BufferGeometry }> = {
  shopper: { share: 4, model: () => model([shopper()]) },
  schoolchild: {
    share: 3,
    model: () =>
      model([
        part(0.22, 0.5, 0.34, 0, 0, 0, '#3a4252'), // legs and shorts
        part(0.3, 0.52, 0.48, 0, 0.5, 0, '#fbf8f2'), // the shirt
        part(0.26, 0.4, 0.42, -0.24, 0.56, 0, '#5a3f34'), // the satchel
        part(0.3, 0.3, 0.3, 0.02, 1.02, 0, SKIN_TONE),
        tint(new THREE.CylinderGeometry(0.24, 0.27, 0.16, 10).translate(0.02, 1.38, 0), '#f6d36a'), // the hat
        tint(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10).translate(0.02, 1.31, 0), '#f6d36a'), // its brim
      ]),
  },
  worker: {
    share: 3,
    model: () =>
      model([
        part(0.26, 0.84, 0.38, 0, 0, 0, '#3a4252'), // trousers
        part(0.36, 0.76, 0.6, 0, 0.82, 0, '#4a5262'), // the jacket
        part(0.05, 0.42, 0.16, 0.18, 1.14, 0, '#fbf8f2'), // the shirt at its front
        part(0.32, 0.32, 0.32, 0.02, 1.58, 0, SKIN_TONE),
        part(0.34, 0.1, 0.34, -0.01, 1.86, 0, HAIR),
        part(0.42, 0.3, 0.1, 0.02, 0.5, 0.38, '#5a3f34'), // the briefcase
      ]),
  },
}
const ORDER = Object.keys(KINDS) as WalkerKind[]
const DEAL = ORDER.flatMap((k) => Array<WalkerKind>(KINDS[k].share).fill(k)) // one in ten of each share

interface Walker {
  kind: WalkerKind
  line: Polyline
  s: number
  /** m/s, either way round. */
  speed: number
  phase: number
  paint: THREE.Color
  /** The piece of slab whose pavement it walks. */
  piece: Bounds
  // PROTOTYPE (`./prototype-walkers`): who it is, and what it is about.
  me?: Person
}

/**
 * Walkers on the pavement, one instanced mesh per kind (#176). Each one laps the centre line of its own Block's
 * pavement, facing the way it walks, so it never crosses a road. Decoration: nothing in the sim reads them.
 */
export function createWalkers() {
  const group = new THREE.Group()
  // PROTOTYPE (`./prototype-walkers`): the faceted look's walkers are jointed figures, their shadows moving with them.
  const models = new Map(ORDER.map((k) => [k, FACET ? model(FIGURES[k].parts()) : KINDS[k].model()]))
  const clothes = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: FACET })
  clothes.onBeforeCompile = takesPaint
  const shadow = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  if (FACET) {
    clothes.onBeforeCompile = (shader) => {
      takesPaint(shader)
      jointed(shader)
    }
    shadow.onBeforeCompile = jointed
  }
  let walkers: Walker[] = []
  let meshes = new Map<WalkerKind, THREE.InstancedMesh>()
  const [m, q, at, up, one] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 1, 1),
  ]
  let t = 0
  // PROTOTYPE (`./prototype-walkers`): the person the player follows, and the marker over them.
  let followed: Person | null = null
  let pavements = new Map<Polyline, { x: number; y: number }[]>()
  const size = new THREE.Vector3()
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: '#ffd35c', toneMapped: false }))
  marker.scale.set(1, 1.5, 1)
  marker.visible = false
  group.add(marker)

  /** New instanced meshes for the walkers there are now. */
  const remesh = () => {
    for (const mesh of meshes.values()) {
      group.remove(mesh)
      mesh.dispose()
    }
    meshes = new Map()
    for (const kind of ORDER) {
      const mine = walkers.filter((w) => w.kind === kind)
      const mesh = new THREE.InstancedMesh(models.get(kind)!, clothes, mine.length)
      mesh.name = `walker ${kind}`
      mesh.castShadow = true
      mesh.frustumCulled = false // instances move; the mesh's own bounds mean nothing
      mine.forEach((walker, i) => mesh.setColorAt(i, walker.paint))
      if (FACET) {
        mesh.geometry.setAttribute('pose', new THREE.InstancedBufferAttribute(new Float32Array(4 * Math.max(1, mine.length)), 4))
        mesh.customDepthMaterial = shadow
      }
      meshes.set(kind, mesh)
      group.add(mesh)
    }
  }
  return {
    group,

    /** PROTOTYPE (`./prototype-walkers`): the person within `within` m of `(x, y)`, nearest first; of a two, the one who leads. */
    personAt(x: number, y: number, within = 2.2): Person | null {
      let [best, found] = [within, null as Person | null]
      for (const { me } of walkers) {
        if (!me || me.size < 0.5) continue
        const d = Math.hypot(me.x - x, me.y - y)
        if (d < best) [best, found] = [d, me.lead ?? me]
      }
      return found
    },
    /** Every person who leads their own life, for a page that lists them. */
    people: () => walkers.flatMap(({ me }) => (me && !me.lead ? [me] : [])),
    follow(person: Person | null) {
      followed = person
    },
    get followed() {
      return followed
    },

    /** Walkers on the pavement of the pieces of slab `pieces`, laid in `field`. Nobody can reach a roundabout's island. */
    add(net: Network, field: Field, pieces: Bounds[], spec?: NetworkSpec, zoneOf?: (piece: Bounds) => string | undefined) {
      const islands = net.junctions.filter((j) => j.type === 'roundabout').map((j) => j.at)
      for (const piece of pieces) {
        for (const loop of field.outlines(INSET, [piece])) {
          if (islands.some((at) => inside(loop, at.x, at.y))) continue
          const line = polyline([...loop, loop[0]])
          for (let k = Math.max(2, Math.round(line.length / SPACING)); k > 0; k--) {
            const kind = DEAL[Math.floor(Math.random() * DEAL.length)]
            const walker: Walker = {
              kind,
              line,
              s: Math.random() * line.length,
              speed: (0.9 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1) * (kind === 'schoolchild' ? 0.85 : 1),
              phase: Math.random() * 10,
              paint: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
              piece,
            }
            walkers.push(walker)
            if (FACET) {
              const seed = (Math.random() * 4294967296) >>> 0
              walker.me = newPerson(seed, kind, line, loop, walker.s, walker.speed, undefined, 0, zoneOf?.(piece))
              // Some walk in twos, side by side.
              if (Math.random() < 0.35) {
                const other = DEAL[Math.floor(Math.random() * DEAL.length)]
                const side = Math.random() < 0.5 ? 0.6 : -0.6
                walkers.push({
                  ...walker,
                  kind: other,
                  paint: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
                  me: newPerson(seed ^ 0x5bd1e995, other, line, loop, walker.s, walker.speed, walker.me, side, zoneOf?.(piece)),
                })
              }
            }
          }
        }
      }
      // PROTOTYPE (`./prototype-signals`): where people cross at the lights, each zebra's ends on the pavements they join.
      if (FACET && spec) {
        const lines = new Map(walkers.flatMap(({ me }) => (me && !me.car ? [[me.line, me.loop] as const] : [])))
        pavements = lines
        const snap = (at: { x: number; y: number }) => {
          let best: { d: number; end: CrossingEnd } | null = null
          for (const [line, loop] of lines)
            for (let s = 0; s < line.length; s += 1) {
              const q = pointAt(line, s)
              const d = Math.hypot(q.x - at.x, q.y - at.y)
              if (d < 4.5 && (!best || d < best.d)) best = { d, end: { x: q.x, y: q.y, line, loop, s } }
            }
          return best?.end
        }
        setCrossings(
          crossingsOf(net, spec).flatMap(({ junction, ends }) => {
            const [a, b] = [snap(ends[0]), snap(ends[1])]
            return a && b && a.line !== b.line ? [{ junction, ends: [a, b] as [CrossingEnd, CrossingEnd] }] : []
          }),
        )
      }
      remesh()
    },

    /** Take the walkers off the pieces of slab `pieces`, which a Swap or an Undo is lifting. */
    remove(pieces: Bounds[]) {
      walkers = walkers.filter((walker) => !pieces.some((p) => sameBounds(p, walker.piece)))
      remesh()
    },

    /** `dt` is the real seconds since the last frame, 0 while paused. */
    update(dt: number, day = 0.25) {
      t += dt
      // PROTOTYPE (`../sim/prototype-signals`): out of each car that has just parked steps its driver; one who has driven off is gone.
      if (FACET && (PARKING.arrivals.length || walkers.some((w) => w.me?.gone))) {
        if (followed?.gone) followed = null
        walkers = walkers.filter((w) => !w.me?.gone)
        const [line, loop] = [...pavements][0] ?? []
        for (const car of line && loop ? PARKING.arrivals.splice(0) : []) {
          const me = newDriver(car, line, loop)
          walkers.push({
            kind: me.kind,
            line,
            s: 0,
            speed: 1.25,
            phase: 0,
            paint: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
            piece: walkers[0]?.piece ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
            me,
          })
        }
        remesh()
      }
      const index = new Map<WalkerKind, number>(ORDER.map((k) => [k, 0]))
      for (const walker of walkers) {
        const i = index.get(walker.kind)!
        index.set(walker.kind, i + 1)
        const mesh = meshes.get(walker.kind)!
        if (walker.me) {
          // PROTOTYPE (`./prototype-walkers`): a person lives its frame, and the shader takes its pose.
          const me = live(walker.me, dt, t, day, followed === (walker.me.lead ?? walker.me))
          at.set(me.x, KERB + liftOf(me), -me.y)
          mesh.setMatrixAt(i, m.compose(at, q.setFromAxisAngle(up, me.heading), size.setScalar(Math.max(0.001, me.size))))
          const pose = mesh.geometry.attributes.pose as THREE.InstancedBufferAttribute
          pose.setXYZW(i, me.stride, me.sit > 0.02 ? -me.sit : me.swing, me.arm, me.look)
          pose.needsUpdate = true
          continue
        }
        const { line } = walker
        walker.s = (walker.s + walker.speed * dt + line.length) % line.length
        const p = pointAt(line, walker.s)
        at.set(p.x, KERB + Math.abs(Math.sin((t + walker.phase) * 9)) * 0.12, -p.y) // a little hop per step
        q.setFromAxisAngle(up, p.heading + (walker.speed < 0 ? Math.PI : 0)) // facing the way it walks
        mesh.setMatrixAt(i, m.compose(at, q, one))
      }
      // The one the player follows wears a marker over its head.
      marker.visible = !!followed && followed.size > 0.5
      if (followed) marker.position.set(followed.x, KERB + 2.7 + Math.sin(t * 3) * 0.12, -followed.y)
      marker.rotation.y = t * 1.5
      for (const mesh of meshes.values()) mesh.instanceMatrix.needsUpdate = true
    },
  }
}
