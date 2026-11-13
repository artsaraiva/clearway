import * as THREE from 'three'
import { pointAt, type Vec } from '../sim/geometry'
import type { Arm } from '../sim/network'
import { dashes, mid, ribbons } from './ribbons'

const PAINT_Y = 0.04
const [WHITE, MAIN] = [0xffffff, 0x30a46c]
const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })

/**
 * Road paint on the plate: dashed lane dividers, a solid centre line, and a stop line across each approach.
 * ponytail: carried over from the throwaway renderer so the game plays before Blocks give roads their edges. A Road
 * between two Junctions is painted once per Arm, and Priority shows as a green stop line; #26 repaints per Road and
 * #28 replaces the stop lines with give-way triangles.
 */
export function createRoads(arms: Arm[], laneWidth: number) {
  const lines: Vec[][] = []
  for (const arm of arms) {
    const { approach: ins, exit: outs, ringOut: ring } = arm
    for (let i = 1; i < ins.length; i++) lines.push(...dashes(mid(ins[i - 1].line.pts, ins[i].line.pts), 3, 6))
    for (let i = 1; i < outs.length; i++) lines.push(...dashes(mid(outs[i - 1].line.pts, outs[i].line.pts), 3, 6))
    lines.push(mid(ins[ins.length - 1].line.pts, [...outs[outs.length - 1].line.pts].reverse()))
    for (let i = 1; i < ring.length; i++) lines.push(...dashes(mid(ring[i - 1].line.pts, ring[i].line.pts), 3, 5))
  }
  const group = new THREE.Group()
  group.add(new THREE.Mesh(ribbons(lines, 0.18, PAINT_Y), paint(WHITE)))

  const stopLines = arms.map((arm) => {
    const ins = arm.approach
    const end = (i: number) => ins[i].line.pts[ins[i].line.pts.length - 1]
    const { heading } = pointAt(ins[0].line, ins[0].length)
    const right = { x: (Math.sin(heading) * laneWidth) / 2, y: (-Math.cos(heading) * laneWidth) / 2 }
    const [a, b] = [end(0), end(ins.length - 1)]
    const across = [
      { x: a.x + right.x, y: a.y + right.y },
      { x: b.x - right.x, y: b.y - right.y },
    ]
    const material = paint(WHITE)
    group.add(new THREE.Mesh(ribbons([across], 0.6, PAINT_Y + 0.01), material))
    return { arm, material }
  })
  for (const mesh of group.children) mesh.receiveShadow = true

  return {
    group,
    /** Re-read each Arm's Priority from the sim. */
    update() {
      for (const { arm, material } of stopLines) material.color.setHex(arm.priority === 'main' ? MAIN : WHITE)
    },
  }
}
