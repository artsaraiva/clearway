// Walls and roofs read off what one kit built (#198), for rules 1 and 2 (`./rules`): each upright face of a building's
// parts, unrolled flat, with what breaks it up; and each face of one that looks up, with whether anything stands on it.
// Plain numbers out, as the rest of the report.
import * as THREE from 'three'
import { area, boxOf, hull, toEdge, within } from './geometry'
import type { Box, Pt, Roof, Wall } from './report'

/** A part of a brick as the faces read it: its geometry in place (Three coordinates), its material's name, its brick. */
export interface Part {
  geo: THREE.BufferGeometry
  material: string
  brick: number
}

/** A wall or a roof of brick `brick` of what was built, before the report gives it its Tile, Block and thing. */
type Read<T> = Omit<T, 'tile' | 'block' | 'thing'> & { brick: number }

/** How far a face's normal may lean from level and still be a wall, and how far up it must look to be a roof. */
const [UPRIGHT, UP] = [0.25, 0.25]
/** What the report counts a wall: an upright face at least `along` m along and `tall` m tall, more than the rule asks. */
const WALL = { along: 3, tall: 2 }
/**
 * m in front of a wall within which a part breaks it up (a window and its frame, a door, a sign, a downpipe, a hedge, a
 * neighbour's wall against it), and m behind it, for one laid flush with it.
 */
const FRONT = { out: 0.8, in: 0.05 }
/**
 * What the report counts a roof: a face that looks up, at least `over` m above its building's foot, `least` m² on the
 * map and `across` m across (its area over its length), over the building itself: over a part of it that rises from
 * within `grounded` m of its foot, so not an awning, a canopy on posts or the top of a parapet.
 */
const ROOF = { over: 2, least: 2, across: 1, grounded: 1 }
/**
 * A part stands on a roof (roof kit, a parapet, a ridge, a chimney, a tank) when the middle of its box is on the roof,
 * or within `edge` m of it, and its foot within `over` m above it or `under` m below it; and is roof kit, not another
 * storey, when it is under `tall` m tall or under `narrow` m across.
 */
const KIT = { edge: 0.3, over: 0.6, under: 0.3, tall: 3, narrow: 1 }
/** m between the points a roof is looked at from above, to tell how much of it is in sight. */
const LOOK = 1
/** Facets that make one curved wall, as a drum's do: each at least `wide` m wide, and each within `bend` (cosine) of the next. */
const CURVE = { wide: 0.5, bend: 0.82 }
/** m a grid square spans, for finding the parts near a face. */
const CELL = 4

/** A part, with what the faces ask of every part: its box on the map and how high it reaches. */
interface Prep {
  part: Part
  box: Box
  y0: number
  y1: number
  /** Its outline on the map, worked out when first asked for. */
  hull?: Pt[]
}

/** A flat face of one part: its normal, its plane's offset along it, its triangles, and the pattern it wears. */
interface Facet {
  n: THREE.Vector3
  d: number
  tris: THREE.Vector3[][]
  pattern: number
  /** Upright faces: m along it (`u`, left to right as one faces it) and up it, and its mean width. */
  u0: number
  u1: number
  v0: number
  v1: number
  wide: number
}

/** The map point of a point in Three coordinates. */
const map = (p: THREE.Vector3): Pt => ({ x: p.x, y: -p.z })

/** Call `fn` with each triangle of a geometry: its three corners and the index of its first vertex. */
function eachTriangle(geo: THREE.BufferGeometry, fn: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, first: number) => void) {
  const pos = geo.attributes.position
  const index = geo.index
  const n = index ? index.count : pos.count
  for (let i = 0; i + 2 < n; i += 3) {
    const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2]
    fn(
      new THREE.Vector3().fromBufferAttribute(pos, ia),
      new THREE.Vector3().fromBufferAttribute(pos, ib),
      new THREE.Vector3().fromBufferAttribute(pos, ic),
      ia,
    )
  }
}

/** A face's way along: right as one faces it, on the map. */
function alongOf(n: THREE.Vector3): Pt {
  const len = Math.hypot(n.x, n.z) || 1
  const [mx, my] = [n.x / len, -n.z / len]
  return { x: -my, y: mx }
}

/**
 * The walls and roofs of what one kit built: each upright face of a building's parts on the scenery's soft-lit
 * material, unrolled flat (round a drum, its facets one after another), with the parts on it or within `FRONT` m in
 * front of it; and each face of one that looks up, with how much of it is in sight and what stands on it. `building`
 * says which bricks are buildings, `base` what each stands on.
 */
export function facesOf(
  parts: Part[],
  building: (brick: number) => boolean,
  base: (brick: number) => number,
): { walls: Read<Wall>[]; roofs: Read<Roof>[] } {
  const preps: Prep[] = []
  const grid = new Map<string, number[]>()
  for (const part of parts) {
    if (part.material === 'roundShadow' || part.material === 'squareShadow') continue
    const pos = part.geo.attributes.position
    let [x0, y0, x1, y1, lo, hi] = [Infinity, Infinity, -Infinity, -Infinity, Infinity, -Infinity]
    for (let k = 0; k < pos.count; k++) {
      const [x, y, z] = [pos.getX(k), -pos.getZ(k), pos.getY(k)]
      ;[x0, y0, x1, y1, lo, hi] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y), Math.min(lo, z), Math.max(hi, z)]
    }
    if (!pos.count) continue
    const i = preps.push({ part, box: { x0, y0, x1, y1 }, y0: lo, y1: hi }) - 1
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++)
        (grid.get(`${gx},${gy}`) ?? grid.set(`${gx},${gy}`, []).get(`${gx},${gy}`)!).push(i)
  }
  /** The parts whose boxes come within `pad` m of `box`. */
  const near = (box: Box, pad: number): Prep[] => {
    const seen = new Set<number>()
    for (let gx = Math.floor((box.x0 - pad) / CELL); gx <= Math.floor((box.x1 + pad) / CELL); gx++)
      for (let gy = Math.floor((box.y0 - pad) / CELL); gy <= Math.floor((box.y1 + pad) / CELL); gy++)
        for (const i of grid.get(`${gx},${gy}`) ?? []) seen.add(i)
    return [...seen]
      .map((i) => preps[i])
      .filter((q) => q.box.x0 < box.x1 + pad && box.x0 < q.box.x1 + pad && q.box.y0 < box.y1 + pad && box.y0 < q.box.y1 + pad)
  }
  const outline = (q: Prep) => {
    if (!q.hull) {
      const pos = q.part.geo.attributes.position
      q.hull = hull(Array.from({ length: pos.count }, (_, k) => ({ x: pos.getX(k), y: -pos.getZ(k) })))
    }
    return q.hull
  }

  // Each building's parts that rise from its foot: its body, which a roof stands over.
  const bodies = new Map<number, Prep[]>()
  for (const q of preps)
    if (building(q.part.brick) && q.y0 - base(q.part.brick) < ROOF.grounded)
      (bodies.get(q.part.brick) ?? bodies.set(q.part.brick, []).get(q.part.brick)!).push(q)
  const over = (brick: number, p: Pt) =>
    (bodies.get(brick) ?? []).some(
      (q) => q.box.x0 <= p.x && p.x <= q.box.x1 && q.box.y0 <= p.y && p.y <= q.box.y1 && within(outline(q), p.x, p.y),
    )

  const walls: Read<Wall>[] = []
  const roofs: Read<Roof>[] = []
  for (const prep of preps) {
    const { part } = prep
    if (part.material !== 'solid' || !building(part.brick)) continue
    const { upright, up } = facetsOf(part.geo)
    walls.push(...wallsOf(upright, prep, near))
    roofs.push(...roofsOf(up, prep, base(part.brick), near, outline, (p) => over(part.brick, p)))
  }
  return { walls, roofs }
}

/** A part's flat faces, upright and looking up: its triangles gathered by the plane each lies in. */
function facetsOf(geo: THREE.BufferGeometry): { upright: Facet[]; up: Facet[] } {
  const pattern = geo.attributes.pattern
  const [upright, up]: Facet[][] = [[], []]
  const [ab, ac] = [new THREE.Vector3(), new THREE.Vector3()]
  eachTriangle(geo, (a, b, c, first) => {
    const n = ab.subVectors(b, a).cross(ac.subVectors(c, a))
    if (n.lengthSq() < 1e-10) return
    n.normalize()
    const list = Math.abs(n.y) < UPRIGHT ? upright : n.y > UP ? up : null
    if (!list) return
    const d = n.dot(a)
    let f = list.find((g) => g.n.dot(n) > 0.9995 && Math.abs(g.d - d) < 0.02)
    if (!f) list.push((f = { n: n.clone(), d, tris: [], pattern: 0, u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, wide: 0 }))
    f.tris.push([a, b, c])
    if (pattern) f.pattern = Math.max(f.pattern, Math.floor(pattern.getX(first)))
  })
  for (const f of upright) {
    const t = alongOf(f.n)
    let twice = 0
    for (const tri of f.tris) {
      const uv = tri.map((p) => [p.x * t.x - p.z * t.y, p.y])
      for (const [u, v] of uv) [f.u0, f.u1, f.v0, f.v1] = [Math.min(f.u0, u), Math.max(f.u1, u), Math.min(f.v0, v), Math.max(f.v1, v)]
      twice += Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1]))
    }
    f.wide = twice / 2 / Math.max(1e-6, f.v1 - f.v0)
  }
  return { upright, up }
}

/** Upright faces into walls: each flat face that is big enough, and each run of facets that make one curved face. */
function wallsOf(facets: Facet[], prep: Prep, near: (box: Box, pad: number) => Prep[]): Read<Wall>[] {
  // Facets that share an edge and bend little from each other, as a drum's do, make one curved wall.
  const key = (p: THREE.Vector3) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`
  const corners = facets.map((f) => new Set(f.tris.flat().map(key)))
  const run = facets.map((_, i) => i)
  const root = (i: number): number => (run[i] === i ? i : (run[i] = root(run[i])))
  for (let i = 0; i < facets.length; i++) {
    if (facets[i].wide < CURVE.wide) continue
    for (let j = i + 1; j < facets.length; j++) {
      if (facets[j].wide < CURVE.wide) continue
      const [a, b] = [alongOf(facets[i].n), alongOf(facets[j].n)]
      if (a.x * b.x + a.y * b.y < CURVE.bend || a.x * b.x + a.y * b.y > 0.9995) continue
      let shared = 0
      for (const k of corners[j]) if (corners[i].has(k) && ++shared >= 2) break
      if (shared >= 2) run[root(j)] = root(i)
    }
  }
  const runs = new Map<number, Facet[]>()
  facets.forEach((f, i) => (runs.get(root(i)) ?? runs.set(root(i), []).get(root(i))!).push(f))

  const out: Read<Wall>[] = []
  for (const group of runs.values()) {
    // Round a curved wall in the order its facets face, from the widest turn between two, or anywhere round a closed one.
    const turn = (f: Facet) => Math.atan2(-f.n.z, f.n.x)
    group.sort((a, b) => turn(a) - turn(b))
    if (group.length > 1) {
      let [gap, from] = [-1, 0]
      group.forEach((f, i) => {
        const next = turn(group[(i + 1) % group.length]) + (i + 1 === group.length ? 2 * Math.PI : 0)
        if (next - turn(f) > gap) [gap, from] = [next - turn(f), (i + 1) % group.length]
      })
      group.push(...group.splice(0, from))
    }
    const curved = group.length > 1
    const along = curved ? group.reduce((s, f) => s + f.wide, 0) : group[0].u1 - group[0].u0
    const [v0, v1] = [Math.min(...group.map((f) => f.v0)), Math.max(...group.map((f) => f.v1))]
    if (along < WALL.along || v1 - v0 < WALL.tall) continue
    const pattern = Math.max(...group.map((f) => f.pattern))
    const shape: Pt[][] = []
    const marks: Box[] = []
    const foot: Pt[] = []
    let offset = 0
    for (const f of group) {
      const t = alongOf(f.n)
      const u = (p: THREE.Vector3) => p.x * t.x - p.z * t.y
      // Where a point along this facet lies along the wall: as it is on a flat wall, spread over the facet's mean width round a curved one.
      const scale = curved ? f.wide / Math.max(1e-6, f.u1 - f.u0) : 1
      const x = (a: number) => offset + (a - f.u0) * scale
      if (!curved) for (const tri of f.tris) shape.push(tri.map((p) => ({ x: x(u(p)), y: p.y })))
      const mid = f.tris.flat().reduce((s, p) => ({ x: s.x + p.x, y: s.y - p.z }), { x: 0, y: 0 })
      const [cx, cy] = [mid.x / (f.tris.length * 3), mid.y / (f.tris.length * 3)]
      const at = (a: number) => {
        const k = a - (cx * t.x + cy * t.y)
        return { x: cx + k * t.x, y: cy + k * t.y }
      }
      foot.push(at(f.u0), at(f.u1))
      if (!pattern) marks.push(...marksOn(f, prep, near, x))
      offset = x(f.u1)
    }
    if (curved)
      shape.push([
        { x: 0, y: v0 },
        { x: along, y: v0 },
        { x: along, y: v1 },
        { x: 0, y: v1 },
      ])
    out.push({ brick: prep.part.brick, pattern, shape, marks, foot: curved ? foot : [foot[0], foot[1]] })
  }
  return out
}

/**
 * What breaks up an upright facet: every other part with some of it within `FRONT` of the facet's plane, in front of
 * it or flush with it, over the facet's extent: a window or its frame, a door, a sign, a downpipe, a neighbour's wall
 * against it. Each as the box it covers on the wall, `x` placing a point along the facet along the wall.
 */
function marksOn(f: Facet, own: Prep, near: (box: Box, pad: number) => Prep[], x: (u: number) => number): Box[] {
  const t = alongOf(f.n)
  const box = boxOf(f.tris.flat().map(map))
  const out: Box[] = []
  for (const q of near(box, FRONT.out + 0.2)) {
    if (q === own || q.y1 <= f.v0 || q.y0 >= f.v1) continue
    const pos = q.part.geo.attributes.position
    let [d0, d1, a0, a1] = [Infinity, -Infinity, Infinity, -Infinity]
    for (let k = 0; k < pos.count; k++) {
      const [px, py, pz] = [pos.getX(k), pos.getY(k), pos.getZ(k)]
      const d = f.n.x * px + f.n.y * py + f.n.z * pz - f.d
      const a = px * t.x - pz * t.y
      ;[d0, d1, a0, a1] = [Math.min(d0, d), Math.max(d1, d), Math.min(a0, a), Math.max(a1, a)]
    }
    if (d1 < -FRONT.in || d0 > FRONT.out || a1 <= f.u0 || a0 >= f.u1) continue
    out.push({ x0: x(Math.max(a0, f.u0)), x1: x(Math.min(a1, f.u1)), y0: Math.max(q.y0, f.v0), y1: Math.min(q.y1, f.v1) })
  }
  return out
}

/**
 * Faces that look up into roofs: each at least `ROOF.over` m above its building's foot, `ROOF.least` m² on the map
 * and `ROOF.across` across, over its body (`overBody`). One that wears no pattern is looked at from above every `LOOK` m to tell how much of it is in sight, and what stands
 * on it is counted.
 */
function roofsOf(
  facets: Facet[],
  prep: Prep,
  foot: number,
  near: (box: Box, pad: number) => Prep[],
  outline: (q: Prep) => Pt[],
  overBody: (p: Pt) => boolean,
): Read<Roof>[] {
  const out: Read<Roof>[] = []
  for (const f of facets) {
    const low = Math.min(...f.tris.flat().map((p) => p.y))
    const flat = f.tris.map((tri) => tri.map(map))
    const size = flat.reduce((s, tri) => s + area(tri), 0)
    if (low - foot < ROOF.over || size < ROOF.least) continue
    const shape = hull(flat.flat())
    const long = Math.max(...shape.flatMap((p) => shape.map((q) => Math.hypot(p.x - q.x, p.y - q.y))))
    const mid = { x: shape.reduce((s, p) => s + p.x, 0) / shape.length, y: shape.reduce((s, p) => s + p.y, 0) / shape.length }
    if (size / long < ROOF.across || !overBody(mid)) continue
    if (f.pattern) {
      out.push({ brick: prep.part.brick, pattern: f.pattern, hull: shape, seen: size, kit: 0 })
      continue
    }
    /** m above the road the roof stands at a point of the map. */
    const height = (p: Pt) => (f.d - f.n.x * p.x + f.n.z * p.y) / f.n.y
    const others = near(boxOf(shape), KIT.edge).filter((q) => q !== prep)
    // In sight from above where it is on the roof and no other part stands over it; and open, at least `LOOK` m across,
    // where it is in sight half that either way, so the ledge left round a tower on its podium is not counted.
    const inSight = (p: Pt) => {
      if (!flat.some((tri) => within(tri, p.x, p.y))) return false
      const h = height(p) + 0.05
      return !others.some(
        (q) => q.y1 > h && q.box.x0 <= p.x && p.x <= q.box.x1 && q.box.y0 <= p.y && p.y <= q.box.y1 && within(outline(q), p.x, p.y),
      )
    }
    const half = LOOK / 2
    const open = (p: Pt) =>
      [p, { x: p.x - half, y: p.y }, { x: p.x + half, y: p.y }, { x: p.x, y: p.y - half }, { x: p.x, y: p.y + half }].every(inSight)
    const looks: Pt[] = []
    for (const tri of flat) {
      looks.push({ x: (tri[0].x + tri[1].x + tri[2].x) / 3, y: (tri[0].y + tri[1].y + tri[2].y) / 3 })
      const b = boxOf(tri)
      for (let gx = Math.ceil(b.x0 / LOOK) * LOOK; gx < b.x1; gx += LOOK)
        for (let gy = Math.ceil(b.y0 / LOOK) * LOOK; gy < b.y1; gy += LOOK) if (within(tri, gx, gy)) looks.push({ x: gx, y: gy })
    }
    const seen = (size * looks.filter(open).length) / looks.length
    const kit = others.filter((q) => {
      const c = { x: (q.box.x0 + q.box.x1) / 2, y: (q.box.y0 + q.box.y1) / 2 }
      if (!within(shape, c.x, c.y) && toEdge(shape, c.x, c.y) > KIT.edge) return false
      const h = height(c)
      if (q.y0 < h - KIT.under || q.y0 > h + KIT.over) return false
      return q.y1 - q.y0 < KIT.tall || Math.min(q.box.x1 - q.box.x0, q.box.y1 - q.box.y0) < KIT.narrow
    }).length
    out.push({ brick: prep.part.brick, pattern: 0, hull: shape, seen, kit })
  }
  return out
}
