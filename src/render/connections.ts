import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import type { Arm, Lane } from '../sim/network'
import { glow } from './glow'
import { ribbons, v3 } from './ribbons'

const [BLUE, HALO, ARMED, ORANGE] = ['#2f86ff', '#62b0ff', '#1e3a8a', '#f97316']
const SPHERE = new THREE.SphereGeometry(1, 20, 12)

/**
 * The Connection Tool's aid for one Arm, in the same language as the route Inspector: its active Connections as
 * glowing blue lines above the road, and a round marker on every lane end (blue where a Connection starts, orange
 * where it ends).
 */
export function createArmConnections() {
  const group = new THREE.Group()
  return {
    group,
    show(arm: Arm | null, armed: Lane | null) {
      for (const o of group.children) if ((o as THREE.Mesh).geometry !== SPHERE) (o as THREE.Mesh).geometry.dispose()
      group.clear()
      if (!arm) return
      const lines = arm.connections.filter((c) => c.enabled).map((c) => c.lane.line.pts)
      group.add(new THREE.Mesh(ribbons(lines, 2.6, 0.45), glow(HALO, 0.3)), new THREE.Mesh(ribbons(lines, 0.9, 0.5), glow(BLUE)))
      const marker = (p: Vec, color: string, r: number) => {
        const rim = new THREE.Mesh(SPHERE, glow('#ffffff'))
        const dot = new THREE.Mesh(SPHERE, glow(color))
        rim.position.copy(v3(p, 0.55))
        dot.position.copy(v3(p, 0.7))
        rim.scale.set(r + 0.35, 0.3, r + 0.35)
        dot.scale.set(r, 0.4, r)
        group.add(rim, dot)
      }
      for (const lane of [...arm.approach, ...arm.ringIn])
        marker(lane.line.pts[lane.line.pts.length - 1], lane === armed ? ARMED : BLUE, lane === armed ? 1.4 : 1)
      for (const lane of [...arm.ringOut, ...arm.exit]) marker(lane.line.pts[0], ORANGE, 1)
    },
  }
}
