import * as THREE from 'three'
import { around, overlaps, pointAt, polyline, type Bounds, type Polyline, type Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import { KERB } from './blocks'
import { inside, sameLoop, type Field } from './field'

const INSET = 1.6 // m in from the kerb: the pavement's centre line
const SPACING = 85 // m of pavement per walker
const SHIRTS = ['#f26d5b', '#4f8fe8', '#f6c85f', '#ffffff', '#7cc6a4', '#b9a3e3', '#2f3440', '#ff9db5'].map((c) => new THREE.Color(c))

interface Walker {
  /** The pavement's centre line it laps, as the field outlines it. */
  loop: Vec[]
  line: Polyline
  s: number
  /** m/s, either way round. */
  speed: number
  phase: number
  shirt: THREE.Color
}

/**
 * Walkers on the pavement, as two instanced meshes (bodies and heads). Each one laps the centre line of its own
 * Block's pavement, so it never crosses a road. Decoration: nothing in the sim reads them.
 */
export function createWalkers() {
  const group = new THREE.Group()
  const body = new THREE.CapsuleGeometry(0.3, 0.65, 3, 8).translate(0, 0.62, 0)
  const head = new THREE.SphereGeometry(0.29, 10, 8).translate(0, 1.6, 0)
  const clothes = new THREE.MeshStandardMaterial({ roughness: 0.85 })
  const skin = new THREE.MeshStandardMaterial({ color: '#f1d1b5', roughness: 0.85 })
  let walkers: Walker[] = []
  let [bodies, heads] = [new THREE.InstancedMesh(body, clothes, 0), new THREE.InstancedMesh(head, skin, 0)]
  const m = new THREE.Matrix4()
  let t = 0

  /** New instanced meshes for the walkers there are now. */
  const remesh = () => {
    group.remove(bodies, heads)
    bodies.dispose()
    heads.dispose()
    ;[bodies, heads] = [new THREE.InstancedMesh(body, clothes, walkers.length), new THREE.InstancedMesh(head, skin, walkers.length)]
    bodies.castShadow = heads.castShadow = true
    bodies.frustumCulled = heads.frustumCulled = false // instances move; the mesh's own bounds mean nothing
    walkers.forEach((walker, i) => bodies.setColorAt(i, walker.shirt))
    group.add(bodies, heads)
  }
  /** Whether anyone already walks this stretch of pavement. */
  const walked = (loop: Vec[]) => walkers.some((walker) => sameLoop(walker.loop, loop))

  return {
    group,

    /**
     * Walkers on every stretch of pavement of `field` that reaches into `region` and has none yet. Nobody can reach a
     * roundabout's island.
     */
    add(net: Network, field: Field, region: Bounds) {
      const islands = net.junctions.filter((j) => j.type === 'roundabout').map((j) => j.at)
      for (const loop of field.outlines(INSET)) {
        if (!overlaps(around(loop), region) || islands.some((at) => inside(loop, at.x, at.y)) || walked(loop)) continue
        const line = polyline([...loop, loop[0]])
        for (let k = Math.max(2, Math.round(line.length / SPACING)); k > 0; k--) {
          walkers.push({
            loop,
            line,
            s: Math.random() * line.length,
            speed: (0.9 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
            phase: Math.random() * 10,
            shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
          })
        }
      }
      remesh()
    },

    /** Take away the walkers in `region` whose pavement `field` no longer has: the Reveal has cut their Block again. */
    remove(region: Bounds, field: Field) {
      const kept = field.outlines(INSET)
      walkers = walkers.filter((walker) => !overlaps(around(walker.loop), region) || kept.some((loop) => sameLoop(loop, walker.loop)))
      remesh()
    },

    /** `dt` is the real seconds since the last frame, 0 while paused. */
    update(dt: number) {
      t += dt
      walkers.forEach((walker, i) => {
        const { line } = walker
        walker.s = (walker.s + walker.speed * dt + line.length) % line.length
        const p = pointAt(line, walker.s)
        m.makeTranslation(p.x, KERB + Math.abs(Math.sin((t + walker.phase) * 9)) * 0.12, -p.y) // a little hop per step
        bodies.setMatrixAt(i, m)
        heads.setMatrixAt(i, m)
      })
      bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true
    },
  }
}
