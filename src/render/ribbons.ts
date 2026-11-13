import * as THREE from 'three'
import { pointAt, polyline, type Vec } from '../sim/geometry'

/** Sim (x, y) → Three (x, height, -y): north is away from the default camera. */
export const v3 = (p: Vec, y = 0) => new THREE.Vector3(p.x, y, -p.y)

/** Flat strips of the given width along each polyline, merged into one geometry. */
export function ribbons(lines: Vec[][], width: number, y: number): THREE.BufferGeometry {
  const pos: number[] = []
  for (const pts of lines) {
    const side = pts.map((_, i) => {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(pts.length - 1, i + 1)]
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      return { x: (-(b.y - a.y) / len) * (width / 2), y: ((b.x - a.x) / len) * (width / 2) }
    })
    for (let i = 1; i < pts.length; i++) {
      const [a, b, na, nb] = [pts[i - 1], pts[i], side[i - 1], side[i]]
      const quad = [
        [a.x + na.x, a.y + na.y],
        [a.x - na.x, a.y - na.y],
        [b.x + nb.x, b.y + nb.y],
        [a.x - na.x, a.y - na.y],
        [b.x - nb.x, b.y - nb.y],
        [b.x + nb.x, b.y + nb.y],
      ]
      for (const [x, z] of quad) pos.push(x, y, -z)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/** Dashes along a polyline. */
export function dashes(pts: Vec[], dash: number, gap: number): Vec[][] {
  const line = polyline(pts)
  const out: Vec[][] = []
  for (let s = gap / 2; s + dash <= line.length; s += dash + gap) out.push([pointAt(line, s), pointAt(line, s + dash)])
  return out
}

export const mid = (a: Vec[], b: Vec[]) => a.map((p, i) => ({ x: (p.x + b[i].x) / 2, y: (p.y + b[i].y) / 2 }))
