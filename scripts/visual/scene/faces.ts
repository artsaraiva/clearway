// Walls and roofs read off what one kit built (#198), for rules 1 and 2 (`./rules`): each upright face of a building's
// parts, unrolled flat, with what breaks it up; and each face of one that looks up, with whether anything stands on it.
// Plain numbers out, as the rest of the report.
import * as THREE from 'three'
import { area, boxesMeet, boxOf, hull, middle, toEdge, within } from './geometry'
import type { Box, Pt, Roof, Wall } from './report'

/** A part of a brick as the faces read it: its geometry in place (Three coordinates), its material's name, its brick. */
export interface Part {
  geo: THREE.BufferGeometry
  material: string
  brick: number
}

/** A wall or a roof of brick `brick` of what was built, before the report gives it its Tile, Block and thing. */
type OfBrick<T> = Omit<T, 'tile' | 'block' | 'thing'> & { brick: number }

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
 * A roof carries a part (roof kit, a chimney, a tank) when the middle of its box is on the roof at least `inside` m in
 * from its edge, or a quarter of the roof's width on a narrow one, so not a parapet, a ridge or a gutter along it; its foot within `over` m above the roof or `under` m
 * below it; and it is roof kit, not another storey: under `tall` m tall or under `narrow` m across.
 */
const ON_ROOF = { inside: 0.6, over: 0.6, under: 0.3, tall: 3, narrow: 1 }
/** m between the points a roof is looked at from above, to tell how much of it is in sight. */
const LOOK = 1
/**
 * Faces that make one curved wall, as a drum's do: each within `bend` (cosine) of the next, turning round at least
 * `radius` m, so a box's rounded corners still part its walls.
 */
const CURVE = { bend: 0.82, radius: 1 }
/** m a grid square spans, for finding the parts near a face. */
const CELL = 4

/** A part, with what the faces ask of every part: its box on the map and how high it reaches. */
interface Bounded {
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
}

/**
 * The upright faces of one building that lie in one plane, whichever of its parts each is a face of (a wall built a
 * storey a box is one wall): m along it (`u`, left to right as one faces it) and up it, and its mean width.
 */
interface Plane {
  n: THREE.Vector3
  d: number
  faces: (Facet & { of: Bounded })[]
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
 * front of it; and each face of one that looks up, with how much of it is in sight and what stands on it. `bricks` are
 * the kit's, by the index each part names: which are buildings, and what each stands on.
 */
export function facesOf(parts: Part[], bricks: { kind: string; at: { y: number } }[]): { walls: OfBrick<Wall>[]; roofs: OfBrick<Roof>[] } {
  const building = (brick: number) => bricks[brick]?.kind === 'building'
  const base = (brick: number) => bricks[brick].at.y
  const bounded: Bounded[] = []
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
    const i = bounded.push({ part, box: { x0, y0, x1, y1 }, y0: lo, y1: hi }) - 1
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++)
        (grid.get(`${gx},${gy}`) ?? grid.set(`${gx},${gy}`, []).get(`${gx},${gy}`)!).push(i)
  }
  /** The parts whose boxes come within `pad` m of `box`. */
  const near = (box: Box, pad: number): Bounded[] => {
    const seen = new Set<number>()
    for (let gx = Math.floor((box.x0 - pad) / CELL); gx <= Math.floor((box.x1 + pad) / CELL); gx++)
      for (let gy = Math.floor((box.y0 - pad) / CELL); gy <= Math.floor((box.y1 + pad) / CELL); gy++)
        for (const i of grid.get(`${gx},${gy}`) ?? []) seen.add(i)
    return [...seen].map((i) => bounded[i]).filter((q) => boxesMeet(q.box, box, pad))
  }
  /** Whether a part stands over a point of the map: within its outline, worked out when first asked for. */
  const covers = (q: Bounded, p: Pt) => {
    if (p.x < q.box.x0 || p.x > q.box.x1 || p.y < q.box.y0 || p.y > q.box.y1) return false
    if (!q.hull) {
      const pos = q.part.geo.attributes.position
      q.hull = hull(Array.from({ length: pos.count }, (_, k) => ({ x: pos.getX(k), y: -pos.getZ(k) })))
    }
    return within(q.hull, p.x, p.y)
  }

  // Each building's parts that rise from its foot: its body, which a roof stands over.
  const bodies = new Map<number, Bounded[]>()
  for (const q of bounded)
    if (building(q.part.brick) && q.y0 - base(q.part.brick) < ROOF.grounded)
      (bodies.get(q.part.brick) ?? bodies.set(q.part.brick, []).get(q.part.brick)!).push(q)

  const walls: OfBrick<Wall>[] = []
  const roofs: OfBrick<Roof>[] = []
  const uprights = new Map<number, (Facet & { of: Bounded })[]>()
  for (const own of bounded) {
    const { part } = own
    if (part.material !== 'solid' || !building(part.brick)) continue
    const { upright, up } = facetsOf(part.geo)
    ;(uprights.get(part.brick) ?? uprights.set(part.brick, []).get(part.brick)!).push(...upright.map((f) => ({ ...f, of: own })))
    const overBody = (p: Pt) => (bodies.get(part.brick) ?? []).some((q) => covers(q, p))
    roofs.push(...roofsOf(up, own, base(part.brick), near, covers, overBody))
  }
  for (const [brick, faces] of uprights) walls.push(...wallsOf(brick, planesOf(faces), near))
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
    let f = list.find((g) => same(g, n, d))
    if (!f) list.push((f = { n: n.clone(), d, tris: [], pattern: 0 }))
    f.tris.push([a, b, c])
    if (pattern) f.pattern = Math.max(f.pattern, Math.floor(pattern.getX(first)))
  })
  return { upright, up }
}

/** Whether a face of normal `n` and offset `d` lies in the plane of `f`. */
const same = (f: { n: THREE.Vector3; d: number }, n: THREE.Vector3, d: number) => f.n.dot(n) > 0.9995 && Math.abs(f.d - d) < 0.02

/** A building's upright faces gathered by the plane each lies in, across its parts, each plane with its extent. */
function planesOf(faces: (Facet & { of: Bounded })[]): Plane[] {
  const planes: Plane[] = []
  for (const f of faces) {
    let p = planes.find((q) => same(q, f.n, f.d))
    if (!p) planes.push((p = { n: f.n, d: f.d, faces: [], u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, wide: 0 }))
    p.faces.push(f)
  }
  for (const p of planes) {
    const t = alongOf(p.n)
    let twice = 0
    for (const tri of p.faces.flatMap((f) => f.tris)) {
      const uv = tri.map((q) => [q.x * t.x - q.z * t.y, q.y])
      for (const [u, v] of uv) [p.u0, p.u1, p.v0, p.v1] = [Math.min(p.u0, u), Math.max(p.u1, u), Math.min(p.v0, v), Math.max(p.v1, v)]
      twice += Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[2][0] - uv[0][0]) * (uv[1][1] - uv[0][1]))
    }
    p.wide = twice / 2 / Math.max(1e-6, p.v1 - p.v0)
  }
  return planes
}

/**
 * A building's upright planes into walls: each plane that is big enough, and each run of planes that make one curved
 * face. A wall wears a pattern if all of it does; where only some of it does, its shape is the rest.
 */
function wallsOf(brick: number, planes: Plane[], near: (box: Box, pad: number) => Bounded[]): OfBrick<Wall>[] {
  // Planes that share an edge and bend little from each other, round far enough, as a drum's do, make one curved wall.
  const key = (p: THREE.Vector3) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`
  const corners = planes.map((p) => new Set(p.faces.flatMap((f) => f.tris.flat().map(key))))
  const run = planes.map((_, i) => i)
  const root = (i: number): number => (run[i] === i ? i : (run[i] = root(run[i])))
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++) {
      const [a, b] = [alongOf(planes[i].n), alongOf(planes[j].n)]
      const bend = a.x * b.x + a.y * b.y
      if (bend < CURVE.bend || bend > 0.9995 || (planes[i].wide + planes[j].wide) / 2 / Math.acos(bend) < CURVE.radius) continue
      let shared = 0
      for (const k of corners[j]) if (corners[i].has(k) && ++shared >= 2) break
      if (shared >= 2) run[root(j)] = root(i)
    }
  const runs = new Map<number, Plane[]>()
  planes.forEach((p, i) => (runs.get(root(i)) ?? runs.set(root(i), []).get(root(i))!).push(p))

  const out: OfBrick<Wall>[] = []
  for (const group of runs.values()) {
    // Round a curved wall in the order its planes face, from the widest turn between two, or anywhere round a closed one.
    const turn = (p: Plane) => Math.atan2(-p.n.z, p.n.x)
    group.sort((a, b) => turn(a) - turn(b))
    if (group.length > 1) {
      let [gap, from] = [-1, 0]
      group.forEach((p, i) => {
        const next = turn(group[(i + 1) % group.length]) + (i + 1 === group.length ? 2 * Math.PI : 0)
        if (next - turn(p) > gap) [gap, from] = [next - turn(p), (i + 1) % group.length]
      })
      group.push(...group.splice(0, from))
    }
    const curved = group.length > 1
    const along = curved ? group.reduce((s, p) => s + p.wide, 0) : group[0].u1 - group[0].u0
    const [v0, v1] = [Math.min(...group.map((p) => p.v0)), Math.max(...group.map((p) => p.v1))]
    if (along < WALL.along || v1 - v0 < WALL.tall) continue
    const faces = group.flatMap((p) => p.faces)
    const pattern = faces.every((f) => f.pattern) ? Math.max(...faces.map((f) => f.pattern)) : 0
    const own = new Set(faces.map((f) => f.of))
    const shape: Pt[][] = []
    const marks: Box[] = []
    const foot: Pt[] = []
    let offset = 0
    for (const p of group) {
      const t = alongOf(p.n)
      const u = (q: THREE.Vector3) => q.x * t.x - q.z * t.y
      // Where a point along this plane lies along the wall: as it is on a flat wall, spread over the plane's mean width
      // round a curved one.
      const scale = curved ? p.wide / Math.max(1e-6, p.u1 - p.u0) : 1
      const x = (a: number) => offset + (a - p.u0) * scale
      for (const f of p.faces) {
        // A face of a curved wall, or one that wears a pattern on a wall that does not all wear one, as the box it covers
        // on the wall: of the shape, or of what breaks the wall up.
        const pts = f.tris.flat()
        const [a, b] = [x(Math.min(...pts.map(u))), x(Math.max(...pts.map(u)))]
        const [lo, hi] = [Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y))]
        if (f.pattern && !pattern) marks.push({ x0: a, x1: b, y0: lo, y1: hi })
        else if (curved)
          shape.push([
            { x: a, y: lo },
            { x: b, y: lo },
            { x: b, y: hi },
            { x: a, y: hi },
          ])
        else for (const tri of f.tris) shape.push(tri.map((q) => ({ x: x(u(q)), y: q.y })))
      }
      const all = p.faces.flatMap((f) => f.tris.flat())
      const [cx, cy] = [all.reduce((s, q) => s + q.x, 0) / all.length, all.reduce((s, q) => s - q.z, 0) / all.length]
      const at = (a: number) => {
        const k = a - (cx * t.x + cy * t.y)
        return { x: cx + k * t.x, y: cy + k * t.y }
      }
      foot.push(at(p.u0), at(p.u1))
      if (!pattern) marks.push(...marksOn(p, own, near, x))
      offset = x(p.u1)
    }
    out.push({ brick, pattern, shape, marks, foot: curved ? foot : [foot[0], foot[1]] })
  }
  return out
}

/**
 * What breaks up an upright plane: every part but its wall's own with some of it within `FRONT` of the plane, in front
 * of it or flush with it, over the plane's extent: a window or its frame, a door, a sign, a downpipe, a neighbour's wall
 * against it. Each as the box it covers on the wall, `x` placing a point along the plane along the wall.
 */
function marksOn(f: Plane, own: Set<Bounded>, near: (box: Box, pad: number) => Bounded[], x: (u: number) => number): Box[] {
  const t = alongOf(f.n)
  const box = boxOf(f.faces.flatMap((g) => g.tris.flat().map(map)))
  const out: Box[] = []
  for (const q of near(box, FRONT.out + 0.2)) {
    if (own.has(q) || q.y1 <= f.v0 || q.y0 >= f.v1) continue
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
 * and `ROOF.across` across, over its body (`overBody`). One that wears no pattern is looked at from above every
 * `LOOK` m to tell how much of it is in sight, and what it carries is counted.
 */
function roofsOf(
  facets: Facet[],
  own: Bounded,
  foot: number,
  near: (box: Box, pad: number) => Bounded[],
  covers: (q: Bounded, p: Pt) => boolean,
  overBody: (p: Pt) => boolean,
): OfBrick<Roof>[] {
  const out: OfBrick<Roof>[] = []
  for (const f of facets) {
    const low = Math.min(...f.tris.flat().map((p) => p.y))
    const flat = f.tris.map((tri) => tri.map(map))
    const size = flat.reduce((s, tri) => s + area(tri), 0)
    if (low - foot < ROOF.over || size < ROOF.least) continue
    const shape = hull(flat.flat())
    const long = Math.max(...shape.flatMap((p) => shape.map((q) => Math.hypot(p.x - q.x, p.y - q.y))))
    const across = size / long
    if (across < ROOF.across || !overBody(middle(shape))) continue
    if (f.pattern) {
      out.push({ brick: own.part.brick, pattern: f.pattern, hull: shape, seen: size, carries: 0, round: false })
      continue
    }
    /** m above the road the roof stands at a point of the map. */
    const height = (p: Pt) => (f.d - f.n.x * p.x + f.n.z * p.y) / f.n.y
    const others = near(boxOf(shape), 0).filter((q) => q !== own)
    // In sight from above where it is on the roof and no other part stands over it; and open, at least `LOOK` m across,
    // where it is in sight half that either way, so the ledge left round a tower on its podium is not counted.
    const inSight = (p: Pt) => {
      if (!flat.some((tri) => within(tri, p.x, p.y))) return false
      const h = height(p) + 0.05
      return !others.some((q) => q.y1 > h && covers(q, p))
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
    const carries = others.filter((q) => {
      const c = { x: (q.box.x0 + q.box.x1) / 2, y: (q.box.y0 + q.box.y1) / 2 }
      if (!within(shape, c.x, c.y) || toEdge(shape, c.x, c.y) < Math.min(ON_ROOF.inside, across / 4)) return false
      const h = height(c)
      if (q.y0 < h - ON_ROOF.under || q.y0 > h + ON_ROOF.over) return false
      return q.y1 - q.y0 < ON_ROOF.tall || Math.min(q.box.x1 - q.box.x0, q.box.y1 - q.box.y0) < ON_ROOF.narrow
    }).length
    const mid = middle(shape)
    const round = flat.some((tri) => within(tri, mid.x, mid.y)) && others.some((q) => q.y1 > height(mid) + 0.05 && covers(q, mid))
    out.push({ brick: own.part.brick, pattern: 0, hull: shape, seen, carries, round })
  }
  return out
}
