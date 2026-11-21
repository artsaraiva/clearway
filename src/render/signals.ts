import * as THREE from 'three'
import { pointAt } from '../sim/geometry'
import type { Arm, Junction, Network } from '../sim/network'
import type { Light } from '../sim/signals'
import type { NetworkSpec } from '../sim/spec'
import { KERB } from './blocks'
import { merged, part, tint } from './shapes'

const [STEEL, HOUSING, RED, WHITE] = ['#aeb6bd', '#2f3440', '#d8402f', '#f6f3ec']
// m: the mast's reach over the Approach, and where the heads' lamps sit on the post.
const MAST = { reach: 3.6, high: 5.4, head: 4.9 }
// m: a lamp's radius, wider than its head is deep, so that it shows from behind and from above as well as to the cars:
// the lights read from wherever the camera stands.
const BULB = 0.27
// How much larger a lit lamp is than a dark one, so that the one that shows is found at a glance, by day and by night.
const LIT = 1.5
// Each lamp lit and dark, in linear colour: lit, one channel is full and the others stay low, so that red stays red
// and does not wash out to pink; dark, a deep tint of the same colour.
const LAMPS: Record<Light, [THREE.Color, THREE.Color]> = {
  red: [new THREE.Color(1, 0.04, 0.03), new THREE.Color(0.07, 0.01, 0.01)],
  amber: [new THREE.Color(1, 0.42, 0.02), new THREE.Color(0.07, 0.04, 0.008)],
  green: [new THREE.Color(0.02, 0.9, 0.32), new THREE.Color(0.008, 0.06, 0.03)],
}
/** Where each of a post's five lamps sits, in the post's frame: the cars' green, amber and red, then the Walkers' wait and walk. */
const BULBS: [number, number, number][] = [
  [0, MAST.head, -MAST.reach + 0.62],
  [0, MAST.head, -MAST.reach],
  [0, MAST.head, -MAST.reach - 0.62],
  [0, 3.1, -0.42],
  [0, 2.5, -0.42],
]

/**
 * A Signal's post, in its own frame: x ahead, toward the Junction, and -z to the left, over the Road. It stands on the
 * near-side kerb with a mast over the Approach, a head of three lamps on it facing the cars that come, and lower down
 * a head of two for the Walkers who cross that Arm.
 */
const post = () =>
  merged([
    part(0.24, MAST.high + 0.2, 0.24, 0, 0, 0, STEEL),
    part(0.16, 0.16, MAST.reach, 0, MAST.high - 0.08, -MAST.reach / 2, STEEL),
    part(0.3, 0.7, 2, 0, MAST.head - 0.35, -MAST.reach, HOUSING),
    part(0.3, 1.3, 0.7, 0, 2.15, -0.42, HOUSING),
  ])

/** A sign on its pole, facing the driver who comes: a `sides`-sided plate of radius `r`, a smaller one in `face` on it. */
const sign = (sides: number, r: number, turn: number, rim: string, face: string) => {
  const plate = (radius: number, x: number, colour: string) =>
    tint(
      new THREE.CylinderGeometry(radius, radius, 0.12, sides)
        .rotateY(turn)
        .rotateZ(Math.PI / 2)
        .translate(x, 3, 0),
      colour,
    )
  return merged([part(0.16, 3, 0.16, 0, 0, 0, STEEL), plate(r, -0.12, rim), plate(r * 0.72, -0.15, face)])
}

/** What stands at an Arm's line: its Signal's post, its sign, or nothing. */
const standing = (junction: Junction, arm: Arm) => (junction.signal ? 'signal' : arm.priority === 'main' ? '' : arm.priority)

/**
 * What the player put at each Junction, standing in the world: a post with its lamps at every Arm of a Signal, and a
 * stop or a yield sign at each Arm that has one. Each kind is one mesh drawn as instances, and every lamp of the City
 * is an instance of one more, so they cost the same few draws however large the City.
 */
export function createSignals() {
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true })
  const lit = new THREE.MeshBasicMaterial({ toneMapped: false })
  const group = new THREE.Group()
  let cap = 0
  let posts!: THREE.InstancedMesh
  let stops!: THREE.InstancedMesh
  let yields!: THREE.InstancedMesh
  let bulbs!: THREE.InstancedMesh
  const grow = (need: number) => {
    if (cap && need <= cap) return
    cap = Math.max(32, need * 2)
    for (const mesh of group.children as THREE.InstancedMesh[]) {
      mesh.geometry.dispose()
      mesh.dispose()
    }
    group.clear()
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, n: number, shadow: boolean) => {
      const m = new THREE.InstancedMesh(geometry, material, n)
      m.castShadow = shadow
      m.frustumCulled = false // its instances stand all over the City
      m.count = 0
      group.add(m)
      return m
    }
    posts = mesh(post(), metal, cap, true)
    // A red octagon, and a white triangle with a red edge, its point down.
    stops = mesh(sign(8, 0.85, Math.PI / 8, WHITE, RED), metal, cap, true)
    yields = mesh(sign(3, 1, -Math.PI / 2, RED, WHITE), metal, cap, true)
    bulbs = mesh(new THREE.IcosahedronGeometry(BULB, 1), lit, cap * BULBS.length, false)
  }

  let laid = ''
  let followed: Network | null = null
  /** Each post's Junction and the group of its Arm, in the order of the posts. */
  let lamps: { junction: Junction; group: number; at: THREE.Matrix4[] }[] = []
  const [grown, swell] = [new THREE.Matrix4(), new THREE.Matrix4().makeScale(LIT, LIT, LIT)]
  const [m, at, q, one, up] = [
    new THREE.Matrix4(),
    new THREE.Vector3(),
    new THREE.Quaternion(),
    new THREE.Vector3(1, 1, 1),
    new THREE.Vector3(0, 1, 0),
  ]

  /** Stand a post or a sign at each Arm that has one. */
  const lay = (net: Network, spec: NetworkSpec) => {
    const arms = net.junctions.flatMap((junction) => junction.arms.map((arm, i) => ({ junction, arm, i, what: standing(junction, arm) })))
    grow(arms.filter((a) => a.what).length)
    lamps = []
    posts.count = stops.count = yields.count = bulbs.count = 0
    for (const { junction, arm, i, what } of arms) {
      if (!what) continue
      const first = arm.approach[0]
      const end = pointAt(first.line, first.length)
      const w = spec.roads[arm.road]?.laneWidth ?? spec.roadDefaults.laneWidth
      // On the kerb to the right of the outermost Approach lane, just short of the line.
      const [rx, ry] = [Math.sin(end.heading), -Math.cos(end.heading)]
      const [x, y] = [end.x + rx * (w / 2 + 1) - Math.cos(end.heading) * 0.7, end.y + ry * (w / 2 + 1) - Math.sin(end.heading) * 0.7]
      m.compose(at.set(x, KERB, -y), q.setFromAxisAngle(up, end.heading), one)
      const mesh = what === 'signal' ? posts : what === 'stop' ? stops : yields
      mesh.setMatrixAt(mesh.count++, m)
      if (what !== 'signal') continue
      const spots = BULBS.map(([bx, by, bz]) => new THREE.Matrix4().makeTranslation(bx, by, bz).premultiply(m))
      lamps.push({ junction, group: junction.signal!.groups[i], at: spots })
      bulbs.count += spots.length
    }
    for (const mesh of [posts, stops, yields, bulbs]) mesh.instanceMatrix.needsUpdate = true
  }

  return {
    group,

    /**
     * Follow `net`, the network the traffic drives: stand the posts and signs again when a Change or a new Tile has
     * moved one, and light each Signal's lamps as it stands. The Walkers' green blinks through the last of the Walk phase.
     */
    update(net: Network, spec: NetworkSpec) {
      const now = net.junctions.map((j) => `${j.id}${j.signal ? 's' : ''}${j.arms.map((a) => a.road + a.priority[0])}`).join('|')
      // A new network has new Junctions, whatever stands on them: the lamps read theirs.
      if (now !== laid || net !== followed) {
        laid = now
        followed = net
        lay(net, spec)
      }
      lamps.forEach(({ junction, group, at }, k) => {
        const s = junction.signal
        const shows = s?.shows[group] ?? 'red'
        const walking = !!s?.walk && (s.walkLeft > 4 || Math.floor(s.walkLeft * 3) % 2 === 0)
        // Each lamp's colour, and whether it is the one lit.
        const shown: [keyof typeof LAMPS, boolean][] = [
          ['green', shows === 'green'],
          ['amber', shows === 'amber'],
          ['red', shows === 'red'],
          ['red', !s?.walk],
          ['green', walking],
        ]
        shown.forEach(([colour, on], i) => {
          bulbs.setColorAt(k * BULBS.length + i, LAMPS[colour][on ? 0 : 1])
          bulbs.setMatrixAt(k * BULBS.length + i, on ? grown.multiplyMatrices(at[i], swell) : at[i])
        })
      })
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true
      if (lamps.length) bulbs.instanceMatrix.needsUpdate = true
    },
  }
}
