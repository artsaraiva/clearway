import * as THREE from 'three'
import { pointAt, polyline } from '../sim/geometry'
import type { Network } from '../sim/network'
import { KERB } from './blocks'
import { inside, type Field } from './field'

const INSET = 1.6 // m in from the kerb: the pavement's centre line
const SPACING = 85 // m of pavement per walker
const SHIRTS = ['#f26d5b', '#4f8fe8', '#f6c85f', '#ffffff', '#7cc6a4', '#b9a3e3', '#2f3440', '#ff9db5'].map((c) => new THREE.Color(c))

/**
 * Walkers on the pavement, as two instanced meshes (bodies and heads). Each one laps the centre line of its own
 * Block's pavement, so it never crosses a road. Decoration: nothing in the sim reads them.
 */
export function createWalkers(net: Network, field: Field) {
  const islands = net.junctions.filter((j) => j.type === 'roundabout').map((j) => j.at)
  const walkers = field
    .outlines(INSET)
    // Nobody can reach a roundabout's island.
    .filter((loop) => !islands.some((at) => inside(loop, at.x, at.y)))
    .flatMap((loop) => {
      const line = polyline([...loop, loop[0]])
      return Array.from({ length: Math.max(2, Math.round(line.length / SPACING)) }, () => ({
        line,
        s: Math.random() * line.length,
        speed: (0.9 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1), // m/s, either way round
        phase: Math.random() * 10,
      }))
    })

  const bodies = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.3, 0.65, 3, 8).translate(0, 0.62, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    walkers.length,
  )
  const heads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.29, 10, 8).translate(0, 1.6, 0),
    new THREE.MeshStandardMaterial({ color: '#f1d1b5', roughness: 0.85 }),
    walkers.length,
  )
  bodies.castShadow = heads.castShadow = true
  bodies.frustumCulled = heads.frustumCulled = false // instances move; the mesh's own bounds mean nothing
  walkers.forEach((_, i) => bodies.setColorAt(i, SHIRTS[i % SHIRTS.length]))
  const m = new THREE.Matrix4()
  let t = 0

  return {
    meshes: [bodies, heads],

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
