// PROTOTYPE, throwaway (`./prototype-look`, `../sim/prototype-signals`): the traffic lights of every signalled
// Junction, and where people cross at them. On the near-side kerb of each Arm stands a post with a mast over the
// Approach, a head of three lamps on it facing the cars that come, and lower down a head of two for the people who
// cross that Arm. Not for main.
import * as THREE from 'three'
import { pointAt, type Vec } from '../sim/geometry'
import type { Junction, Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { PARKING } from '../sim/prototype-signals'
import { KERB } from './blocks'
import { allStands, FACET } from './prototype-look'
import { ZEBRA } from './roads'

/** m in from the kerb that people walk, as `./walkers` has it. */
const INSET = 1.6
const signalled = (j: Junction) => j.type === 'priority' && j.arms.length >= 3

// Each lamp lit and dark. Lit is brighter than white, so that the glow takes it.
const LAMPS = {
  red: [new THREE.Color(4, 0.35, 0.25), new THREE.Color(0.22, 0.05, 0.05)],
  amber: [new THREE.Color(4, 2.2, 0.3), new THREE.Color(0.24, 0.15, 0.04)],
  green: [new THREE.Color(0.3, 3.4, 1.7), new THREE.Color(0.04, 0.2, 0.12)],
} as const

/** Each Arm of a signalled Junction as its zebra crosses it: the Junction, and the zebra's two ends, on the pavement either side. */
export function crossingsOf(net: Network, spec: NetworkSpec): { junction: Junction; ends: [Vec, Vec] }[] {
  return net.junctions.filter(signalled).flatMap((junction) =>
    junction.arms.map((arm) => {
      const first = arm.approach[0]
      const end = pointAt(first.line, first.length)
      const [fx, fy, lx, ly] = [Math.cos(end.heading), Math.sin(end.heading), -Math.sin(end.heading), Math.cos(end.heading)]
      const w = spec.roads[arm.road].laneWidth ?? spec.roadDefaults.laneWidth
      const across = (arm.approach.length + arm.exit.length) * w
      const along = ZEBRA.setback + ZEBRA.length / 2
      const at = (o: number): Vec => ({ x: end.x + fx * along + lx * o, y: end.y + fy * along + ly * o })
      return { junction, ends: [at(-w / 2 - INSET), at(across - w / 2 + INSET)] as [Vec, Vec] }
    }),
  )
}

/** Tell the sim where cars can park: each stand a Zone left free, with the nearest point of an outermost Road lane it is reached from. */
function bindStands(net: Network) {
  const lanes = net.lanes.filter((l) => 'road' in l.owner && l.index === 0 && l.length > 34)
  PARKING.spots = allStands().flatMap((stand) => {
    let best: { d: number; lane: (typeof lanes)[number]; s: number } | null = null
    for (const lane of lanes)
      for (let s = 16; s < lane.length - 12; s += 2) {
        const q = pointAt(lane.line, s)
        const d = Math.hypot(q.x - stand.x, q.y - stand.y)
        if (d < 30 && (!best || d < best.d)) best = { d, lane, s }
      }
    return best ? [{ kind: stand.kind, lane: best.lane, s: best.s, x: stand.x, y: stand.y, heading: stand.ry + Math.PI / 2 }] : []
  })
  return allStands().length
}

export function createSignals(net: Network, spec: NetworkSpec) {
  // The stands are noted as the Blocks are built, over the first frames: bound here, and again whenever there are more.
  let bound = FACET ? bindStands(net) : 0
  ;[PARKING.parked, PARKING.arrivals] = [[], []]
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: '#8e979f', roughness: 0.7, flatShading: true })
  const housing = new THREE.MeshStandardMaterial({ color: '#2f3440', roughness: 0.8, flatShading: true })
  const bulb = new THREE.IcosahedronGeometry(0.17, 1)
  const lamp = () => new THREE.MeshBasicMaterial({ toneMapped: false })
  // Each Junction's lamps: one of each colour for each of its two groups, and the two that people read.
  const lit: {
    junction: Junction
    cars: Record<keyof typeof LAMPS, THREE.MeshBasicMaterial>[]
    walk: THREE.MeshBasicMaterial
    wait: THREE.MeshBasicMaterial
  }[] = []
  for (const junction of net.junctions.filter(signalled)) {
    const cars = [0, 1].map(() => ({ red: lamp(), amber: lamp(), green: lamp() }))
    const [walk, wait] = [lamp(), lamp()]
    lit.push({ junction, cars, walk, wait })
    // The groups as the sim deals them (`../sim/prototype-signals`): the two Arms most nearly facing each other, then the rest.
    const arms = junction.arms
    let [best, pair] = [-Infinity, [0, 1]]
    for (let i = 0; i < arms.length; i++)
      for (let j = i + 1; j < arms.length; j++) {
        const facing = -Math.cos(arms[i].angle - arms[j].angle)
        if (facing > best) [best, pair] = [facing, [i, j]]
      }
    arms.forEach((arm, i) => {
      const first = arm.approach[0]
      const end = pointAt(first.line, first.length)
      const w = spec.roads[arm.road].laneWidth ?? spec.roadDefaults.laneWidth
      const reach = Math.min(4.6, arm.approach.length * w * 0.75)
      // The post's frame: x ahead, toward the Junction; -z to the left, over the Road.
      const post = new THREE.Group()
      const [lx, ly] = [-Math.sin(end.heading), Math.cos(end.heading)]
      const [px, py] = [end.x + lx * (-w / 2 - 1) - Math.cos(end.heading) * 0.7, end.y + ly * (-w / 2 - 1) - Math.sin(end.heading) * 0.7]
      post.position.set(px, KERB, -py)
      post.rotation.y = end.heading
      const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, material: THREE.Material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
        mesh.position.set(x, y, z)
        mesh.castShadow = true
        post.add(mesh)
      }
      const light = (x: number, y: number, z: number, material: THREE.Material) =>
        post.add(new THREE.Mesh(bulb, material).translateX(x).translateY(y).translateZ(z))
      box(0.18, 5.4, 0.18, 0, 2.7, 0, steel)
      box(0.12, 0.12, reach, 0, 5.2, -reach / 2, steel)
      // The cars' head, lying on its side over the Approach: green nearest the kerb, red nearest the middle of the Road.
      box(0.42, 0.56, 1.6, 0, 4.82, -reach, housing)
      box(0.5, 0.08, 1.7, -0.06, 5.12, -reach, housing) // its hood
      const mine = cars[pair.includes(i) ? 0 : 1]
      light(-0.2, 4.82, -reach + 0.5, mine.green)
      light(-0.2, 4.82, -reach, mine.amber)
      light(-0.2, 4.82, -reach - 0.5, mine.red)
      // The people's head, on the post, facing those who cross toward it.
      box(0.34, 0.86, 0.3, 0, 2.75, -0.2, housing)
      light(0, 2.95, -0.36, wait)
      light(0, 2.55, -0.36, walk)
      group.add(post)
    })
  }

  return {
    group,
    /** Show what every Junction's lights say now, at clock `t` (s): the people's green blinks through the last of the walk. */
    update(t: number) {
      if (FACET && allStands().length !== bound && !PARKING.parked.length) bound = bindStands(net)
      for (const { junction, cars, walk, wait } of lit) {
        const s = junction.signal
        cars.forEach((set, g) => {
          for (const colour of ['red', 'amber', 'green'] as const)
            set[colour].color.copy(LAMPS[colour][(s ? s.shows[g] : 'red') === colour ? 0 : 1])
        })
        const walking = !!s?.walk && (s.walkLeft > 4 || Math.floor(t * 3) % 2 === 0)
        walk.color.copy(LAMPS.green[walking ? 0 : 1])
        wait.color.copy(LAMPS.red[s?.walk ? 1 : 0])
      }
    },
  }
}
