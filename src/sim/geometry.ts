export interface Vec {
  x: number
  y: number
}

/** A rectangle in metres, from `x0` to `x1` east and from `y0` to `y1` north. */
export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Whether two rectangles overlap by more than an edge. */
export const overlaps = (a: Bounds, b: Bounds) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/** The rectangle around some points. */
export function around(pts: Vec[]): Bounds {
  const [xs, ys] = [pts.map((p) => p.x), pts.map((p) => p.y)]
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** The rectangle around some rectangles. */
export const extent = (rects: Bounds[]): Bounds =>
  around(
    rects.flatMap((r) => [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y1 },
    ]),
  )

/** The middle of a rectangle. */
export const middle = (b: Bounds): Vec => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 })

/** Polyline with cumulative arc length, for position lookup along a lane. */
export interface Polyline {
  pts: Vec[]
  cum: number[]
  length: number
}

export function polyline(pts: Vec[]): Polyline {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  }
  return { pts, cum, length: cum[cum.length - 1] }
}

/** Position and heading (radians) at arc length s, clamped to the line. */
export function pointAt(line: Polyline, s: number): { x: number; y: number; heading: number } {
  const { pts, cum } = line
  let i = 1
  while (i < pts.length - 1 && cum[i] < s) i++
  const a = pts[i - 1]
  const b = pts[i]
  const seg = cum[i] - cum[i - 1]
  const t = seg > 0 ? Math.min(1, Math.max(0, (s - cum[i - 1]) / seg)) : 0
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x) }
}

/** Counterclockwise arc from angle a0 to a1 (a1 > a0). */
export function arc(r: number, a0: number, a1: number): Vec[] {
  const n = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 60)))
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

/** Cubic Bezier from p0 heading h0 to p3 heading h3; handle length matches a circular arc for symmetric turns. */
export function bezier(p0: Vec, h0: number, p3: Vec, h3: number, n = 16): Vec[] {
  const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  const turn = Math.abs(Math.atan2(Math.sin(h3 - h0), Math.cos(h3 - h0)))
  const k = turn < 1e-3 ? chord / 3 : (chord * (2 / 3) * Math.tan(turn / 4)) / Math.sin(turn / 2)
  const p1 = { x: p0.x + k * Math.cos(h0), y: p0.y + k * Math.sin(h0) }
  const p2 = { x: p3.x - k * Math.cos(h3), y: p3.y - k * Math.sin(h3) }
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const u = 1 - t
    const w0 = u * u * u
    const w1 = 3 * u * u * t
    const w2 = 3 * u * t * t
    const w3 = t * t * t
    return {
      x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
      y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
    }
  })
}

/** Tightest turning radius along a polyline (from consecutive point triples). */
export function minRadius(line: Polyline): number {
  let min = Infinity
  const p = line.pts
  for (let i = 1; i < p.length - 1; i++) {
    const a = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y)
    const b = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y)
    const c = Math.hypot(p[i + 1].x - p[i - 1].x, p[i + 1].y - p[i - 1].y)
    const cross = Math.abs((p[i].x - p[i - 1].x) * (p[i + 1].y - p[i - 1].y) - (p[i].y - p[i - 1].y) * (p[i + 1].x - p[i - 1].x))
    if (cross > 1e-9) min = Math.min(min, (a * b * c) / (2 * cross))
  }
  return min
}

/** First crossing of two polylines, as arc lengths along each; endpoints excluded. */
export function intersect(a: Polyline, b: Polyline): [number, number] | null {
  for (let i = 1; i < a.pts.length; i++) {
    const p = a.pts[i - 1]
    const r = { x: a.pts[i].x - p.x, y: a.pts[i].y - p.y }
    for (let j = 1; j < b.pts.length; j++) {
      const q = b.pts[j - 1]
      const s = { x: b.pts[j].x - q.x, y: b.pts[j].y - q.y }
      const den = r.x * s.y - r.y * s.x
      if (Math.abs(den) < 1e-12) continue
      const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / den
      const u = ((q.x - p.x) * r.y - (q.y - p.y) * r.x) / den
      if (t < 0 || t > 1 || u < 0 || u > 1) continue
      const sa = a.cum[i - 1] + t * (a.cum[i] - a.cum[i - 1])
      const sb = b.cum[j - 1] + u * (b.cum[j] - b.cum[j - 1])
      if (sa < 0.01 || sb < 0.01 || sa > a.length - 0.01 || sb > b.length - 0.01) continue
      return [sa, sb]
    }
  }
  return null
}
