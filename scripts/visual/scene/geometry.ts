// Outlines on the map for the scene check (#191): hulls, their areas, how deep two overlap, boxes.
import type { Box, Hull, Pt } from './report'

/** The convex hull of `pts`, counterclockwise (Andrew's monotone chain). */
export function hull(pts: Pt[]): Hull {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop()
    lower.push(q)
  }
  const upper: Pt[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 1e-9) upper.pop()
    upper.push(p[i])
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** m² inside an outline. */
export function area(h: Pt[]): number {
  let twice = 0
  h.forEach((p, i) => {
    const q = h[(i + 1) % h.length]
    twice += p.x * q.y - q.x * p.y
  })
  return Math.abs(twice) / 2
}

/** The box round some points. */
export function boxOf(pts: Pt[]): Box {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { x, y } of pts) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  return { x0, y0, x1, y1 }
}

/** Whether two boxes overlap, or come within `pad` m of each other. */
export const boxesMeet = (a: Box, b: Box, pad = 0) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad

/**
 * How deep two convex outlines overlap (m): the least they would have to move apart along any of their edges' normals
 * to part (the separating axis test). 0 or less: they do not overlap.
 */
export function overlap(a: Hull, b: Hull): number {
  let least = Infinity
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [p, q] = [poly[i], poly[(i + 1) % poly.length]]
      const len = Math.hypot(q.x - p.x, q.y - p.y)
      if (len < 1e-9) continue
      const [nx, ny] = [-(q.y - p.y) / len, (q.x - p.x) / len]
      let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity]
      for (const v of a) {
        const t = v.x * nx + v.y * ny
        ;[a0, a1] = [Math.min(a0, t), Math.max(a1, t)]
      }
      for (const v of b) {
        const t = v.x * nx + v.y * ny
        ;[b0, b1] = [Math.min(b0, t), Math.max(b1, t)]
      }
      least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0))
      if (least <= 0) return least
    }
  }
  return least
}

/** A box `w` along its front by `d`, centred on `(x, y)` and turned `ry`, as the kit's frames turn (`to`), as an outline. */
export function turnedBox(x: number, y: number, w: number, d: number, ry: number): Hull {
  const [c, s] = [Math.cos(ry), Math.sin(ry)]
  // The kit's `to`: local x along the front turns to (cos, sin) and local y out of it to (-sin, cos).
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([lx, ly]) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c }))
}

/** A circle of radius `r` round `(x, y)`, as an outline of `n` sides. */
export const disc = (x: number, y: number, r: number, n = 8): Hull =>
  Array.from({ length: n }, (_, i) => ({ x: x + r * Math.cos((i / n) * Math.PI * 2), y: y + r * Math.sin((i / n) * Math.PI * 2) }))

/** Whether `(x, y)` lies inside an outline (even–odd). */
export function within(loop: Pt[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** m from `(x, y)` to the nearest point of a closed outline. */
export function toEdge(loop: Pt[], x: number, y: number): number {
  let best = Infinity
  for (let i = 0; i < loop.length; i++) {
    const [a, b] = [loop[i], loop[(i + 1) % loop.length]]
    const [dx, dy] = [b.x - a.x, b.y - a.y]
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(a.x + t * dx - x, a.y + t * dy - y))
  }
  return best
}
