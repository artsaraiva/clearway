// PROTOTYPE (issue #16): Japanese street detail for the stylised look. Throwaway.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { Building } from './block'
import { BIKE, CURB } from './field'
import { colors, lit, PASTELS, type Look } from './look'
import { armFrame } from './props'

/** Footprints lower than this become rows of houses; taller ones stay as apartment blocks. */
export const HOUSE_BELOW = 16

const WALLS = [0xf1ead9, 0xe6dccb, 0xd9d4c6, 0xf5f0e6, 0xcdbfae]
const TILES = [0x4f6272, 0x5d6d70, 0x8a5c4c, 0x46625a, 0x70798a]
const CONCRETE = 0x8d9488
const VERMILION = 0xd6452f

const hash = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453
  return v - Math.floor(v)
}
const inside = (p: Vec, poly: Vec[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}
const bounds = (pts: Vec[]) => ({
  x0: Math.min(...pts.map((p) => p.x)),
  x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  y1: Math.max(...pts.map((p) => p.y)),
})

/** One-colour, non-indexed copy placed at sim (x, y) facing `heading`, ready to merge. */
function part(geo: THREE.BufferGeometry, hex: number, at: Vec = { x: 0, y: 0 }, heading = 0): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).rotateY(heading).translate(at.x, 0, -at.y)
  g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const col = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < g.attributes.position.count; i++) c.toArray(col, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
const cyl = (r0: number, r1: number, h: number, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0)

type P3 = [number, number, number]

/** Two-storey house with a hipped tile roof, centred on the origin. */
function house(L: number, W: number, wallH: number, rise: number, wall: number, roof: number): THREE.BufferGeometry {
  const [pos, col]: number[][] = [[], []]
  const tri = (a: P3, b: P3, c: P3, hex: number) => {
    // Wind every face outward from the middle of the house.
    const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a)))
    const out = new THREE.Vector3((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 - wallH / 2, (a[2] + b[2] + c[2]) / 3)
    for (const p of n.dot(out) < 0 ? [a, c, b] : [a, b, c]) {
      pos.push(...p)
      new THREE.Color(hex).toArray(col, col.length)
    }
  }
  const quad = (a: P3, b: P3, c: P3, d: P3, hex: number) => (tri(a, b, c, hex), tri(a, c, d, hex))
  const ring = (e: number, y: number): P3[] => [
    [-L / 2 - e, y, -W / 2 - e],
    [L / 2 + e, y, -W / 2 - e],
    [L / 2 + e, y, W / 2 + e],
    [-L / 2 - e, y, W / 2 + e],
  ]
  const [base, top, eave] = [ring(0, 0), ring(0, wallH), ring(0.7, wallH)]
  for (let i = 0; i < 4; i++) quad(base[i], base[(i + 1) % 4], top[(i + 1) % 4], top[i], wall)
  const r = L / 2 - W * 0.3
  const [r0, r1]: P3[] = [
    [-r, wallH + rise, 0],
    [r, wallH + rise, 0],
  ]
  quad(eave[0], eave[1], r1, r0, roof)
  quad(eave[2], eave[3], r0, r1, roof)
  tri(eave[1], eave[2], r1, roof)
  tri(eave[3], eave[0], r0, roof)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

/** A grid of houses inside each low footprint. */
function houses(list: Building[], walls: number[], tiles: number[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (const { pts } of list) {
    const b = bounds(pts)
    for (let x = b.x0 + 7; x < b.x1 - 5; x += 13) {
      for (let y = b.y0 + 6.5; y < b.y1 - 5; y += 12) {
        const n = x * 17 + y * 3
        const at = { x: x + hash(n) - 0.5, y: y + hash(n + 1) - 0.5 }
        if (![-4, 4].every((dx) => [-4, 4].every((dy) => inside({ x: at.x + dx, y: at.y + dy }, pts)))) continue
        const g = house(9 + 2 * hash(n + 2), 7 + 1.5 * hash(n + 3), 5.5 + 1.5 * hash(n + 4), 2.2, pick(walls, n + 5), pick(tiles, n + 6))
        out.push(g.rotateY(hash(n + 7) < 0.5 ? 0 : Math.PI / 2).translate(at.x, 0, -at.y))
      }
    }
  }
  return out
}
const pick = (list: number[], n: number) => list[Math.floor(hash(n) * list.length)]

/** Water tanks and air-conditioning units on apartment roofs. */
function rooftops(list: Building[]): THREE.BufferGeometry[] {
  return list.flatMap(({ pts, h }, k) => {
    const b = bounds(pts)
    const spot = (i: number) => ({
      x: b.x0 + 5 + hash(k * 9 + i) * (b.x1 - b.x0 - 10),
      y: b.y0 + 5 + hash(k * 9 + i + 0.5) * (b.y1 - b.y0 - 10),
    })
    return [
      part(cyl(1.4, 1.4, 2.4, 12).translate(0, h, 0), 0xdde2d6, spot(0)),
      // Balconies up the south face.
      ...Array.from({ length: Math.floor((h - 2.5) / 3.6) }, (_, j) =>
        part(box(b.x1 - b.x0 - 4, 0.9, 1.2).translate((b.x0 + b.x1) / 2, 2.0 + j * 3.6, -(b.y0 - 0.6)), 0xe8e2d2),
      ),
      ...[1, 2, 3, 4].map((i) => part(box(2 + 2 * hash(k + i), 1.4, 2).translate(0, h + 0.7, 0), 0xb9bfb4, spot(i))),
      part(box(b.x1 - b.x0, 0.9, 0.4).translate((b.x0 + b.x1) / 2, h + 0.45, -b.y0 - 0.2), 0xc4cabd), // parapets
      part(box(b.x1 - b.x0, 0.9, 0.4).translate((b.x0 + b.x1) / 2, h + 0.45, -b.y1 + 0.2), 0xc4cabd),
    ]
  })
}

/** Utility poles down one side of every arm, with sagging wires between them. */
function poles(inkLine: number) {
  const [geos, wire]: [THREE.BufferGeometry[], number[]] = [[], []]
  for (const deg of [0, 90, 180, 270]) {
    const a = (deg * Math.PI) / 180
    const spots = [72, 100, 128, 156, 184].map((r) => ({
      x: Math.cos(a) * r - Math.sin(a) * 10.6,
      y: Math.sin(a) * r + Math.cos(a) * 10.6,
    }))
    for (const p of spots) {
      geos.push(
        part(cyl(0.16, 0.22, 9.4), CONCRETE, p, a),
        part(box(0.14, 0.14, 2.6).translate(0, 8.6, 0), CONCRETE, p, a),
        part(box(0.14, 0.14, 1.8).translate(0, 7.7, 0), CONCRETE, p, a),
        part(cyl(0.34, 0.34, 0.95, 10).translate(0, 6.4, 0.5), 0x6f7a78, p, a),
      )
    }
    for (let i = 1; i < spots.length; i++) {
      for (const off of [-1.2, 0, 1.2]) {
        const at = (t: number) => {
          const [p, q] = [spots[i - 1], spots[i]]
          return [p.x + (q.x - p.x) * t + Math.sin(a) * off, 8.7 - 2.8 * t * (1 - t), -(p.y + (q.y - p.y) * t) + Math.cos(a) * off]
        }
        for (let s = 0; s < 8; s++) wire.push(...at(s / 8), ...at((s + 1) / 8))
      }
    }
  }
  const lines = new THREE.BufferGeometry()
  lines.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3))
  const wires = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: inkLine }))
  wires.layers.set(1) // already a drawn line: keep it out of the ink pass
  return { geos, wires }
}

/** Orange convex mirrors at every junction mouth. */
function mirrors(net: Network, w: number): THREE.BufferGeometry[] {
  return Object.values(net.gateways).flatMap((arm) => {
    const f = armFrame(arm, w)
    const p = f.at(2, -(f.half + BIKE + CURB + 0.9))
    const facing = Math.atan2(f.u.y, f.u.x) + Math.PI / 4
    const disc = (r: number, x: number) => new THREE.CylinderGeometry(r, r, 0.08, 16).rotateZ(Math.PI / 2).translate(x, 3.4, 0)
    return [
      part(cyl(0.07, 0.07, 3.4), 0xf08a24, p, facing),
      part(disc(0.55, 0), 0xf08a24, p, facing),
      part(disc(0.44, -0.05), 0xd3e6e8, p, facing),
    ]
  })
}

function vending(): THREE.BufferGeometry[] {
  const row = (x: number, y: number, dx: number, dy: number, heading: number) =>
    [0xd9463c, 0x3f78b8, 0xf2f2ea, 0xd9463c].map((hex, i) =>
      part(box(0.8, 1.85, 1.1).translate(0, 0.925, 0), hex, { x: x + dx * i * 1.3, y: y + dy * i * 1.3 }, heading),
    )
  return [...row(38, -48.5, 1, 0, Math.PI / 2), ...row(101.5, -84, 0, 1, 0)]
}

/** A torii at the park corner, facing the roundabout. */
function torii(): THREE.BufferGeometry[] {
  const [at, heading, k] = [{ x: -66, y: 66 }, Math.PI / 4, 1.5]
  const p = (g: THREE.BufferGeometry, hex: number) => part(g.scale(k, k, k), hex, at, heading)
  return [
    p(cyl(0.28, 0.33, 5.2, 10).translate(0, 0, 2.3), VERMILION),
    p(cyl(0.28, 0.33, 5.2, 10).translate(0, 0, -2.3), VERMILION),
    p(box(0.34, 0.34, 5.8).translate(0, 4.2, 0), VERMILION),
    p(box(0.55, 0.42, 7).translate(0, 5.4, 0), VERMILION),
    p(box(0.75, 0.2, 7.5).translate(0, 5.7, 0), 0x2e2e33),
  ]
}

/** People on the pavements and a few on each crossing. Static: pedestrians are decoration. */
function people(net: Network, w: number): THREE.BufferGeometry[] {
  const SHIRTS = [0xf2f2ea, 0x5fa8d3, 0xf28f6b, 0xf5cf5a, 0x8ecf9a, 0xd98bb5, 0x56607a]
  return Object.values(net.gateways).flatMap((arm, k) => {
    const f = armFrame(arm, w)
    const walk = f.half + BIKE + CURB + 1.3
    const spots = [
      ...Array.from({ length: 16 }, (_, i) => f.at(14 + hash(k * 31 + i) * 170, (i % 2 ? 1 : -1) * (walk + hash(k * 7 + i + 0.3)))),
      ...[0, 1, 2].map((i) => f.at(7.6 + hash(k + i) * 1.8, (hash(k * 5 + i + 0.7) - 0.5) * 2 * f.half)),
    ]
    return spots.flatMap((p, i) => [
      part(cyl(0.3, 0.26, 0.85, 7), 0x3d4658, p),
      part(cyl(0.34, 0.32, 0.8, 7).translate(0, 0.85, 0), pick(SHIRTS, k * 13 + i), p),
      part(new THREE.SphereGeometry(0.3, 8, 6).translate(0, 1.95, 0), 0xf1cfb4, p),
    ])
  })
}

export function japanLayer(net: Network, w: number, low: Building[], tall: Building[], look: Look): THREE.Group {
  const wired = poles(colors(look).inkLine)
  const mesh = new THREE.Mesh(
    mergeGeometries([
      ...(look.paint ? houses(low, PASTELS, colors(look).roofs) : houses(low, WALLS, TILES)),
      ...people(net, w),
      ...rooftops(tall),
      ...wired.geos,
      ...mirrors(net, w),
      ...vending(),
      ...torii(),
    ]),
    lit(look, { vertexColors: true }),
  )
  mesh.castShadow = mesh.receiveShadow = true
  return new THREE.Group().add(mesh, wired.wires)
}
