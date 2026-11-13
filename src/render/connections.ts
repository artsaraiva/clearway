import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import type { Arm, Lane } from '../sim/network'
import { glow } from './glow'
import { ribbons, v3 } from './ribbons'

/** The Connection Tool's aid for one Arm: its active Connection curves plus a marker on every lane end. */
export function createArmConnections() {
  const group = new THREE.Group()
  return {
    group,
    show(arm: Arm | null, armed: Lane | null) {
      for (const o of group.children) (o as THREE.Mesh).geometry.dispose()
      group.clear()
      if (!arm) return
      const active = arm.connections.filter((c) => c.enabled)
      const fromRing = active.filter((c) => c.from.kind === 'ring').map((c) => c.lane.line.pts)
      const fromApproach = active.filter((c) => c.from.kind !== 'ring').map((c) => c.lane.line.pts)
      group.add(new THREE.Mesh(ribbons(fromRing, 0.6, 0.08), glow(0x10b981)))
      group.add(new THREE.Mesh(ribbons(fromApproach, 0.6, 0.1), glow(0x3b82f6)))
      const marker = (p: Vec, color: number, big: boolean) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(big ? 1.3 : 0.9, big ? 1.3 : 0.9, 0.4, 24), glow(color))
        mesh.position.copy(v3(p, 0.2))
        group.add(mesh)
      }
      for (const lane of [...arm.approach, ...arm.ringIn])
        marker(lane.line.pts[lane.line.pts.length - 1], lane === armed ? 0x1e3a8a : 0x3b82f6, lane === armed)
      for (const lane of [...arm.ringOut, ...arm.exit]) marker(lane.line.pts[0], 0xf97316, false)
    },
  }
}
