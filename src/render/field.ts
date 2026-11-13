import type { District } from '../sim/district'
import type { Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { Bounds } from './slab'

const CELL = 1.25 // m between samples
// The field is exact up to this far from a lane's edge and flat beyond it, so each lane segment only touches the
// samples around it. Raise it when something needs an outline further in than this (a deep lawn inset, say).
const REACH = 8
const HALF_CAR = 1.6 // half a car's width plus a little clearance
const INSET = 2 // m of bare road plate between a Block and the plate's edge
const MIN_AREA = 30 // m²: an outline enclosing less than this is a sliver, not a Block

/** The distance field the Blocks are cut from, over the road plate. */
export interface Field {
  /**
   * Metres clear of the road at a sim point: above zero inside a Block, capped at `REACH` and by the distance to the
   * plate's edge. Below zero (on the road) only the sign means anything.
   */
  sample(x: number, y: number): number
  /** Closed outlines of the area at least `level` m clear of the road: 0 gives the Blocks, more
   * gives insets of them. `level` must stay below `REACH`, where the field goes flat.
   */
  outlines(level: number): Vec[][]
}

type Strip = [ax: number, ay: number, bx: number, by: number, halfWidth: number]

/** Everything that is road, as strips: Road and Ring lanes at full width, Connections, and the mouth of each Priority junction. */
function roadStrips(net: Network, district: District): Strip[] {
  const w = district.roadDefaults.laneWidth
  const laneWidth = (road: string) => district.roads[road].laneWidth ?? w
  const roundabouts = new Set(net.junctions.filter((j) => j.type === 'roundabout').map((j) => j.id))
  const strips: Strip[] = []
  for (const lane of net.lanes) {
    // A roundabout's Connections are its lanes through the mouth, so they keep the full width. On a Priority junction
    // the mouth is square (below) and a car's width along each turn rounds its corners.
    const half =
      'road' in lane.owner
        ? laneWidth(lane.owner.road) / 2
        : lane.kind === 'ring' || roundabouts.has(lane.owner.junction)
          ? w / 2
          : HALF_CAR
    const { pts } = lane.line
    for (let i = 1; i < pts.length; i++) strips.push([pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, half])
  }
  // The mouth of a Priority junction: every Road lane carried straight on until it is level with the centre.
  for (const junction of net.junctions) {
    if (junction.type !== 'priority') continue
    for (const arm of junction.arms) {
      const [ux, uy] = [Math.cos(arm.angle), Math.sin(arm.angle)]
      const ends = [...arm.approach.map((l) => l.line.pts[l.line.pts.length - 1]), ...arm.exit.map((l) => l.line.pts[0])]
      for (const p of ends) {
        const d = (p.x - junction.at.x) * ux + (p.y - junction.at.y) * uy
        strips.push([p.x, p.y, p.x - ux * d, p.y - uy * d, laneWidth(arm.road) / 2])
      }
    }
  }
  return strips
}

/**
 * The mouth of each roundabout Arm: the area between its outermost entry curve, its outermost exit curve and the outer
 * Ring lane. Left to the lanes alone, the gaps between the curves would come out as Block slivers.
 */
function roundaboutMouths(net: Network): Vec[][] {
  const mouths: Vec[][] = []
  for (const junction of net.junctions) {
    if (junction.type !== 'roundabout') continue
    for (const arm of junction.arms) {
      const curve = (from: unknown, to: unknown) => arm.connections.find((c) => c.from === from && c.to === to)?.lane.line.pts
      const entry = curve(arm.approach[0], arm.ringOut[0])
      const across = curve(arm.ringIn[0], arm.ringOut[0])
      const exit = curve(arm.ringIn[0], arm.exit[0])
      if (entry && across && exit) mouths.push([...entry, ...[...across].reverse(), ...exit])
    }
  }
  return mouths
}

function inside(loop: Vec[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [a, b] = [loop[i], loop[j]]
    if (a.y > y !== b.y > y && x < a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)) hit = !hit
  }
  return hit
}

// Marching squares. Corner bits: 1 bottom-left, 2 bottom-right, 4 top-right, 8 top-left. Letters: the cell edges a segment joins.
const CASES = ['', 'LB', 'BR', 'LR', 'RT', 'LTBR', 'BT', 'LT', 'LT', 'BT', 'LBRT', 'RT', 'LR', 'BR', 'LB', '']

/**
 * The field of a network's lanes over the road plate `plate`. Connections count whether enabled or not, so no Change moves a Block.
 * ponytail: always computes the whole plate (about 11 ms for eight Junctions). A Reveal reloads the page today; when
 * it happens in place (#30), recompute only the samples under the newly Revealed piece if the whole plate gets slow.
 */
export function laneField(net: Network, district: District, plate: Bounds): Field {
  const { x0, y0 } = plate
  const nx = Math.ceil((plate.x1 - x0) / CELL) + 1
  const ny = Math.ceil((plate.y1 - y0) / CELL) + 1
  const f = new Float32Array(nx * ny).fill(REACH)
  /** Sample index range covering sim coordinates `lo`..`hi` along an axis that starts at `origin` and has `n` samples. */
  const span = (lo: number, hi: number, origin: number, n: number) => [
    Math.max(0, Math.ceil((lo - origin) / CELL)),
    Math.min(n - 1, Math.floor((hi - origin) / CELL)),
  ]

  for (const [ax, ay, bx, by, half] of roadStrips(net, district)) {
    const r = half + REACH
    const [i0, i1] = span(Math.min(ax, bx) - r, Math.max(ax, bx) + r, x0, nx)
    const [j0, j1] = span(Math.min(ay, by) - r, Math.max(ay, by) + r, y0, ny)
    const [dx, dy] = [bx - ax, by - ay]
    const len2 = dx * dx + dy * dy || 1
    for (let j = j0; j <= j1; j++) {
      const py = y0 + j * CELL - ay
      for (let i = i0; i <= i1; i++) {
        const px = x0 + i * CELL - ax
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
        const d = Math.sqrt((px - dx * t) ** 2 + (py - dy * t) ** 2) - half
        if (d < f[j * nx + i]) f[j * nx + i] = d
      }
    }
  }
  for (const mouth of roundaboutMouths(net)) {
    const [xs, ys] = [mouth.map((p) => p.x), mouth.map((p) => p.y)]
    const [i0, i1] = span(Math.min(...xs), Math.max(...xs), x0, nx)
    const [j0, j1] = span(Math.min(...ys), Math.max(...ys), y0, ny)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (f[j * nx + i] > -1 && inside(mouth, x0 + i * CELL, y0 + j * CELL)) f[j * nx + i] = -1
      }
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, y] = [x0 + i * CELL, y0 + j * CELL]
      const rim = Math.min(x - x0, plate.x1 - x, y - y0, plate.y1 - y) - INSET
      if (rim < f[j * nx + i]) f[j * nx + i] = rim
    }
  }

  return {
    sample(x, y) {
      const [gx, gy] = [(x - x0) / CELL, (y - y0) / CELL]
      const [i, j] = [Math.max(0, Math.min(nx - 2, Math.floor(gx))), Math.max(0, Math.min(ny - 2, Math.floor(gy)))]
      const [u, v] = [gx - i, gy - j]
      const at = (a: number, b: number) => f[b * nx + a]
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v
    },

    // ponytail: an outline is a plain loop with no holes, which holds while every stretch of road reaches the plate's
    // edge (a Block then never surrounds road). A road loop cut off from the edge would come out as a second, solid
    // outline inside its Block; pair inner loops with outer ones if a District ever has one.
    outlines(level) {
      const at = (i: number, j: number) => f[j * nx + i] - level
      const pts = new Map<number, Vec>()
      const links = new Map<number, number[]>()
      /** The crossing on the cell edge leaving sample (i, j) upward or rightward, by id. */
      const edge = (i: number, j: number, up: boolean) => {
        const id = 2 * (j * nx + i) + +up
        if (!pts.has(id)) {
          const a = at(i, j)
          const t = a / (a - (up ? at(i, j + 1) : at(i + 1, j)))
          pts.set(id, { x: x0 + (i + (up ? 0 : t)) * CELL, y: y0 + (j + (up ? t : 0)) * CELL })
        }
        return id
      }
      const link = (a: number, b: number) => (links.get(a) ?? links.set(a, []).get(a)!).push(b)
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const c = +(at(i, j) > 0) | (+(at(i + 1, j) > 0) << 1) | (+(at(i + 1, j + 1) > 0) << 2) | (+(at(i, j + 1) > 0) << 3)
          const sides = CASES[c]
          for (let k = 0; k < sides.length; k += 2) {
            const [a, b] = [sides[k], sides[k + 1]].map((e) =>
              e === 'B' ? edge(i, j, false) : e === 'T' ? edge(i, j + 1, false) : e === 'L' ? edge(i, j, true) : edge(i + 1, j, true),
            )
            link(a, b)
            link(b, a)
          }
        }
      }
      const seen = new Set<number>()
      const loops: Vec[][] = []
      for (const start of links.keys()) {
        if (seen.has(start)) continue
        const loop: Vec[] = []
        for (let prev = -1, cur: number | undefined = start; cur !== undefined && !seen.has(cur);) {
          seen.add(cur)
          loop.push(pts.get(cur)!)
          const next: number | undefined = links.get(cur)!.find((n) => n !== prev)
          ;[prev, cur] = [cur, next]
        }
        let area = 0
        loop.forEach((p, k) => {
          const q = loop[(k + 1) % loop.length]
          area += p.x * q.y - q.x * p.y
        })
        if (Math.abs(area) / 2 >= MIN_AREA) loops.push(loop)
      }
      return loops
    },
  }
}
