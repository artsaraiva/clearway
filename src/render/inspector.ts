import * as THREE from 'three'
import { pointAt } from '../sim/geometry'
import type { Vehicle } from '../sim/sim'
import { glow } from './glow'
import { ribbons } from './ribbons'

/** The route Inspector: one car's remaining route as a glowing blue line above the road, redrawn each frame as the car moves. */
export function createRouteInspector() {
  const core = new THREE.Mesh(new THREE.BufferGeometry(), glow('#2f86ff'))
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), glow('#62b0ff', 0.3))
  const group = new THREE.Group().add(halo, core)
  return {
    group,
    /** `null` hides it. */
    update(car: Vehicle | null) {
      group.visible = !!car
      if (!car) return
      const { lane, s, path } = car
      const lines = [[pointAt(lane.line, s), ...lane.line.pts.filter((_, i) => lane.line.cum[i] > s)], ...path.map((l) => l.line.pts)]
      core.geometry.dispose()
      halo.geometry.dispose()
      core.geometry = ribbons(lines, 1.2, 0.5)
      halo.geometry = ribbons(lines, 3.6, 0.45)
    },
  }
}
