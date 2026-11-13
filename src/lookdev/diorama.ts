// PROTOTYPE (issue #16): the "Anime Map Diorama" design rebuilt on the real sim, same layout as the design's first tile:
// a 3×3 street grid, river, hill and shrine. Throwaway. Open /diorama.html under `npm run dev`.
// (The earlier roundabout version is /diorama-roundabout.html.)
// Question: with the layout matched, does the sim-driven version feel like the design?
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { dashes, mid, ribbons } from '../render/ribbons'
import type { District, Point, RoadSpec } from '../sim/district'
import { pointAt, polyline, type Vec } from '../sim/geometry'
import { DT, Sim, VEHICLE_TYPES, type Vehicle } from '../sim/sim'
import { parkedCars, type CarLike } from './props'

// The design is authored in its own units (x east, y up, z south). One unit is U metres, which makes its roomy
// lanes 7 m wide and its stubby cars about the sim's 4.3 m.
const U = 4
const [ROAD, WALK, BANK] = [0.1, 0.4, 0.3] // design heights of the road, pavement and river bank
const H = 132 // half the slab, m
const KERB = (WALK - ROAD) * U
const SPEED = 1.5 // sim seconds per real second: slow, as in the design
const DAY = 90 // real seconds per day
const CAP = 1500
const TAU = Math.PI * 2

let seed = 1
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const R = (a: number, b: number) => a + (b - a) * rand()
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const hud = document.querySelector<HTMLElement>('#hud')!
const bar = document.querySelector<HTMLElement>('#bar')!
const labelLayer = document.querySelector<HTMLElement>('#labels')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
renderer.shadowMap.enabled = true
renderer.toneMapping = THREE.NeutralToneMapping
renderer.setClearColor(0x000000, 0)

const scene = new THREE.Scene()
const hemi = new THREE.HemisphereLight()
const sun = new THREE.DirectionalLight()
sun.castShadow = true
sun.shadow.mapSize.set(4096, 4096)
Object.assign(sun.shadow.camera, { left: -210, right: 210, top: 210, bottom: -210, near: 1, far: 1000 })
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.16
sun.shadow.radius = 3
scene.add(hemi, sun)

// Grab to rotate (left drag), wheel to zoom, right drag to pan.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000)
const controls = new OrbitControls(camera, canvas)
Object.assign(controls, { enableDamping: true, minZoom: 0.6, maxZoom: 8, minPolarAngle: 0.32, maxPolarAngle: 1.15 })
canvas.style.cursor = 'grab'
function view(az = 0.62, el = 0.72, zoom = 1, target: Vec = { x: 0, y: 0 }) {
  controls.target.set(target.x, -4, -target.y)
  camera.position.set(target.x + Math.sin(az) * Math.cos(el) * 900, -4 + Math.sin(el) * 900, -target.y + Math.cos(az) * Math.cos(el) * 900)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  controls.update()
}

// ---------- materials and shapes
const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
const glass = new THREE.MeshStandardMaterial({
  color: '#a9c4db',
  roughness: 0.22,
  metalness: 0.1,
  emissive: '#ffc78a',
  emissiveIntensity: 0,
})
const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.4, emissive: '#ffd08a', emissiveIntensity: 0 })
const water = new THREE.MeshStandardMaterial({ color: '#86cbef', roughness: 0.12, metalness: 0.05 })
const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide })
const gold = new THREE.MeshStandardMaterial({ color: '#d8b25a', roughness: 0.4, metalness: 0.3 })

const WALLS = ['#f6efe4', '#f3dac6', '#e5efdf', '#dae7f2', '#f4e4b9', '#efd8dd', '#e3ddef', '#fbf7f0', '#cfe4df']
const ROOFS = ['#d9735b', '#5d7a96', '#6ba39a', '#c79f6a', '#8a80b3', '#e08a6b']
const TOWERS = ['#eef2f5', '#dfe9f1', '#f5f0e7', '#e3ecea', '#f3e8e1']
const [SIDEWALK, ROADC, GRASS, STONE, PROM, VER] = ['#f1ede5', '#c3c7ce', '#b5dc95', '#ddd6c9', '#efe3c9', '#e5583f']
const CARS = ['#ffffff', '#f26d5b', '#4f8fe8', '#f6c85f', '#7cc6a4', '#b9a3e3', '#e9eef2', '#ff9db5'].map((c) => new THREE.Color(c))

const cache = new Map<string, THREE.BufferGeometry>()
/** Box with rounded corners and a bevelled top and bottom, sitting on y = 0. Design units. */
function rbox(w: number, h: number, d: number, r = 0.2, b = 0.06): THREE.BufferGeometry {
  const key = [w, h, d, r, b].map((v) => v.toFixed(2)).join()
  const hit = cache.get(key)
  if (hit) return hit
  b = Math.min(b, h / 2 - 0.001, w / 2 - 0.01, d / 2 - 0.01)
  if (b <= 0.003) b = 0
  const [iw, id] = [w - 2 * b, d - 2 * b]
  r = Math.max(0.002, Math.min(r, iw / 2 - 0.001, id / 2 - 0.001))
  const [x, y] = [-iw / 2, -id / 2]
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
    .lineTo(x + iw - r, y)
    .quadraticCurveTo(x + iw, y, x + iw, y + r)
  s.lineTo(x + iw, y + id - r).quadraticCurveTo(x + iw, y + id, x + iw - r, y + id)
  s.lineTo(x + r, y + id).quadraticCurveTo(x, y + id, x, y + id - r)
  s.lineTo(x, y + r).quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 4,
  })
  g.rotateX(-Math.PI / 2).translate(0, b, 0)
  cache.set(key, g)
  return g
}
/** Gable roof: a triangle `wid` across and `h` high, `len` long, ridge along z. */
function prism(len: number, wid: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-wid / 2, 0)
    .lineTo(wid / 2, 0)
    .lineTo(0, h)
    .lineTo(-wid / 2, 0)
  return new THREE.ExtrudeGeometry(s, {
    depth: len,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1,
  }).translate(0, 0, -len / 2)
}
/** A sim polygon (metres) raised to height `h`, bevelled at the top edge. */
function slab(loop: Vec[], h: number, b = 0.24): THREE.BufferGeometry {
  const s = new THREE.Shape(loop.map((p) => new THREE.Vector2(p.x, p.y)))
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h - b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
  })
  return g.rotateX(-Math.PI / 2)
}
const SPH = new THREE.SphereGeometry(1, 16, 12)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)
const CONE4 = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0).rotateY(Math.PI / 4)
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

function tint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const a = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i)
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3))
}

function canvasTex(cw: number, ch: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  ;[c.width, c.height] = [cw, ch]
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
// Soft contact shadows: a blurred dark decal under every building and tree.
const blob = (map: THREE.Texture, opacity: number) =>
  new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
const aoRound = blob(
  canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(25,35,50,0.6)')
    gr.addColorStop(0.5, 'rgba(25,35,50,0.28)')
    gr.addColorStop(1, 'rgba(25,35,50,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  }),
  1,
)
const aoRect = blob(
  canvasTex(128, 128, (g) => {
    g.filter = 'blur(12px)'
    g.fillStyle = 'rgba(25,35,50,0.75)'
    g.fillRect(28, 28, 72, 72)
  }),
  0.8,
)

// ---------- pieces: everything static is built as pieces that can drop in, then merged
interface Piece {
  g: THREE.Group
  d: number
  kind: 'drop' | 'pop' | 'show'
  big: number
  hit: boolean
}
const statics = new THREE.Group()
scene.add(statics)
let pieces: Piece[] = []
let parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
const [M4, Q, UP] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0)]
const casts = (mat: THREE.Material) => !mat.transparent && mat !== paint
const push = (geo: THREE.BufferGeometry, look: string | THREE.Material) =>
  parts.push(typeof look === 'string' ? { geo: tint(geo, look), mat: solid } : { geo, mat: look })

/** Queue a shape for the current piece, placed in design units. `look` is a colour (shared vertex-coloured material) or a material. */
function A(geo: THREE.BufferGeometry, look: string | THREE.Material, x = 0, y = ROAD, z = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  g.applyMatrix4(
    M4.compose(new THREE.Vector3(x * U, (y - ROAD) * U, z * U), Q.setFromAxisAngle(UP, ry), new THREE.Vector3(sx * U, sy * U, sz * U)),
  )
  push(g, look)
}
/** Queue a whole geometry authored in design units. */
const G = (geo: THREE.BufferGeometry, look: string | THREE.Material) =>
  push((geo.index ? geo.toNonIndexed() : geo.clone()).translate(0, -ROAD, 0).scale(U, U, U), look)
const ao = (x: number, y: number, z: number, aw: number, ad: number, round = false) =>
  A(PLANE, round ? aoRound : aoRect, x, y + 0.012, z, 0, aw, 1, ad)

/** Close the queued shapes into one piece that lands at delay `d`, anchored at a design-unit point. */
function piece(kind: Piece['kind'], d: number, x = 0, y = ROAD, z = 0, big = 0) {
  const g = new THREE.Group()
  g.position.set(x * U, (y - ROAD) * U, z * U)
  for (const mat of new Set(parts.map((p) => p.mat))) {
    const geo = mergeGeometries(parts.filter((p) => p.mat === mat).map((p) => p.geo))
    const m = new THREE.Mesh(geo.translate(-g.position.x, -g.position.y, -g.position.z), mat)
    m.castShadow = casts(mat)
    m.receiveShadow = true
    if (mat.transparent) m.renderOrder = 2
    g.add(m)
  }
  parts = []
  statics.add(g)
  pieces.push({ g, d: d + Math.random() * 0.05, kind, big, hit: false })
}
/** Bake every piece into one mesh per material. */
function merge() {
  statics.updateMatrixWorld(true)
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>()
  for (const p of pieces) {
    for (const m of p.g.children as THREE.Mesh[]) {
      by.set(m.material as THREE.Material, [...(by.get(m.material as THREE.Material) ?? []), m.geometry.applyMatrix4(m.matrixWorld)])
    }
  }
  statics.clear()
  for (const [mat, geos] of by) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat)
    m.castShadow = casts(mat)
    m.receiveShadow = true
    if (mat.transparent) m.renderOrder = 2
    statics.add(m)
    for (const g of geos) g.dispose()
  }
  pieces = []
}

// ---------- the District: the design's street grid as real Junctions, Roads and Demand
const VX = [-22, -8, 6].map((x) => x * U) // the three north–south streets
const HY = [20, 4, -12].map((y) => y * U) // the three east–west streets (design z = -20, -4, 12)
const EDGE = H - 2
const roads: Record<string, RoadSpec> = { E0: { from: [EDGE, HY[0]], to: 'J20', lanes: [1, 1] } } // over the bridge
VX.forEach((x, i) => {
  roads[`N${i}`] = { from: [x, EDGE], to: `J${i}0`, lanes: [1, 1] }
  roads[`V${i}a`] = { from: `J${i}0`, to: `J${i}1`, lanes: [1, 1] }
  roads[`V${i}b`] = { from: `J${i}1`, to: `J${i}2`, lanes: [1, 1] }
  roads[`S${i}`] = { from: [x, -EDGE], to: `J${i}2`, lanes: [1, 1] }
})
HY.forEach((y, j) => {
  roads[`W${j}`] = { from: [-EDGE, y], to: `J0${j}`, lanes: [1, 1] }
  roads[`H${j}a`] = { from: `J0${j}`, to: `J1${j}`, lanes: [1, 1] }
  roads[`H${j}b`] = { from: `J1${j}`, to: `J2${j}`, lanes: [1, 1] }
})
const GATES = ['N0', 'N1', 'N2', 'S0', 'S1', 'S2', 'W0', 'W1', 'W2', 'E0']
const VERTICAL = [
  ['N', 'Va'],
  ['Va', 'Vb'],
  ['Vb', 'S'],
] // by row: the two north–south Roads meeting there
const district: District = {
  roadDefaults: { speed: 8, laneWidth: 7, bikeBand: false, sidewalk: 0, median: 0 },
  junctions: Object.fromEntries(VX.flatMap((x, i) => HY.map((y, j) => [`J${i}${j}`, { type: 'priority' as const, at: [x, y] as Point }]))),
  roads,
  levels: [
    {
      reveal: VX.flatMap((_, i) => HY.map((_, j) => `J${i}${j}`)),
      seed: 8,
      tools: [],
      demand: Object.fromEntries(
        GATES.map((g) => [g, { rate: 7, to: Object.fromEntries(GATES.filter((o) => o !== g).map((o) => [o, 1])) }]),
      ),
      // north–south streets have Priority
      initial: Object.fromEntries(
        VX.flatMap((_, i) =>
          HY.map((_, j) => [
            `J${i}${j}`,
            { priority: Object.fromEntries(VERTICAL[j].map((r) => [r[0] + i + r.slice(1), 'main' as const])) },
          ]),
        ),
      ),
      solution: [],
      slab: { x0: -EDGE, y0: -EDGE, x1: EDGE, y1: EDGE },
    },
  ],
}

const sim = new Sim(district)
const w = district.roadDefaults.laneWidth
for (let i = 0; i < 2400; i++) sim.step()
const arms = sim.net.junctions.flatMap((j) => j.arms)
const entries = new Set(Object.values(sim.net.gateways).flatMap((a) => a.approach))

// ---------- the field the Blocks are cut from
// f > 0 inside a Block: metres clear of every lane's edge (Connections included, so corners follow the turns), of the
// slab rim, and of the river bank to the east.
// ponytail: brute-force distance to every lane segment, ~0.3 s here; bucket segments in a grid when Districts grow.
const CELL = 1.25
const N = Math.round((2 * H) / CELL) + 1
const field = new Float32Array(N * N)
const t0 = performance.now()
{
  // Road lanes at full width, the square mouth of each Junction, and a car's width along every turn (which rounds the corners).
  const segs = [
    ...sim.net.lanes.flatMap((l) =>
      l.line.pts.slice(1).map((b, i) => [l.line.pts[i].x, l.line.pts[i].y, b.x, b.y, l.kind === 'road' ? w / 2 : 1.6]),
    ),
    ...sim.net.junctions.flatMap((j) =>
      j.arms.map((a) => [j.at.x, j.at.y, j.at.x + Math.cos(a.angle) * 14, j.at.y + Math.sin(a.angle) * 14, w]),
    ),
  ]
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const [x, y] = [-H + i * CELL, -H + j * CELL]
      let best = Infinity
      for (const [ax, ay, bx, by, hw] of segs) {
        const [dx, dy] = [bx - ax, by - ay]
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
        best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t) - hw)
      }
      field[j * N + i] = Math.min(best, EDGE - 4 - Math.max(Math.abs(x), Math.abs(y)), 7.75 * U - x)
    }
  }
}
const fieldMs = performance.now() - t0
function sample(x: number, y: number): number {
  const [gx, gy] = [(x + H) / CELL, (y + H) / CELL]
  const [i, j] = [Math.max(0, Math.min(N - 2, Math.floor(gx))), Math.max(0, Math.min(N - 2, Math.floor(gy)))]
  const [u, v] = [gx - i, gy - j]
  const at = (a: number, b: number) => field[b * N + a]
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v
}

// Marching squares. Corner bits: 1 bottom-left, 2 bottom-right, 4 top-right, 8 top-left. Letters: the cell edges a segment joins.
const CASES = ['', 'LB', 'BR', 'LR', 'RT', 'LTBR', 'BT', 'LT', 'LT', 'BT', 'LBRT', 'RT', 'LR', 'BR', 'LB', '']
/** Closed outlines of the area where the field is above `level`, in sim metres. */
function contours(level: number): Vec[][] {
  const at = (i: number, j: number) => field[j * N + i] - level
  const pts = new Map<number, Vec>()
  const links = new Map<number, number[]>()
  const edge = (i: number, j: number, up: boolean) => {
    const id = 2 * (j * N + i) + +up
    if (!pts.has(id)) {
      const a = at(i, j)
      const t = a / (a - (up ? at(i, j + 1) : at(i + 1, j)))
      pts.set(id, { x: -H + (i + (up ? 0 : t)) * CELL, y: -H + (j + (up ? t : 0)) * CELL })
    }
    return id
  }
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const c = +(at(i, j) > 0) | (+(at(i + 1, j) > 0) << 1) | (+(at(i + 1, j + 1) > 0) << 2) | (+(at(i, j + 1) > 0) << 3)
      const ids = [...CASES[c]].map((e) =>
        e === 'B' ? edge(i, j, false) : e === 'T' ? edge(i, j + 1, false) : e === 'L' ? edge(i, j, true) : edge(i + 1, j, true),
      )
      for (let k = 0; k < ids.length; k += 2) {
        links.set(ids[k], [...(links.get(ids[k]) ?? []), ids[k + 1]])
        links.set(ids[k + 1], [...(links.get(ids[k + 1]) ?? []), ids[k]])
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
    if (loop.length > 12) loops.push(loop)
  }
  return loops
}
/** Blocks, with their bounds in design units. */
const blocks = contours(0).map((loop) => {
  const [xs, zs] = [loop.map((p) => p.x / U), loop.map((p) => -p.y / U)]
  return { loop, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
})
/** Pavement centre lines, which the walkers follow. */
const pavements = contours(1.6)

// ---------- props, in design units
function tree(x: number, y: number, z: number, s = 1, kind: 'round' | 'pine' | 'sakura' = 'round', d = 0) {
  A(CYL, '#9a7457', x, y, z, 0, 0.09 * s, 0.75 * s, 0.09 * s)
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++)
      A(
        CONE,
        pick(['#4f9a6a', '#5aa874', '#468f60']),
        x,
        y + s * (0.4 + i * 0.36),
        z,
        0,
        s * (0.62 - i * 0.15),
        s * 0.7,
        s * (0.62 - i * 0.15),
      )
  } else {
    const cols = kind === 'sakura' ? ['#f8bfd0', '#f4a8c0', '#fbd3df', '#f6b3c8'] : ['#86c96f', '#6db862', '#9bd47e', '#78bf68', '#8fcc73']
    const n = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const [a, rr, k] = [rand() * TAU, i ? 0.3 * s : 0, s * (i ? R(0.36, 0.48) : 0.6)]
      A(SPH, pick(cols), x + Math.cos(a) * rr, y + s * (i ? R(0.9, 1.35) : 1.05), z + Math.sin(a) * rr, 0, k, k * 0.9, k)
    }
  }
  ao(x, y, z, s * 1.7, s * 1.7, true)
  piece('pop', d, x, y, z)
}

function building(x: number, z: number, bw: number, bd: number, type: 'house' | 'mid' | 'tower', dd: number, d: number) {
  const y = WALK
  if (type === 'house') {
    ;[bw, bd] = [Math.min(bw, 3), Math.min(bd, 3)]
    const h = R(1.1, 1.6)
    A(rbox(bw, h, bd, 0.12, 0.05), pick(WALLS), x, y, z)
    A(rbox(bw + 0.04, 0.26, bd + 0.04, 0.14, 0.02), glass, x, y + h * 0.42, z)
    const along = bw >= bd
    A(prism((along ? bw : bd) + 0.2, (along ? bd : bw) + 0.28, Math.min(bw, bd) * 0.42), pick(ROOFS), x, y + h, z, along ? Math.PI / 2 : 0)
    ao(x, y, z, bw * 1.45 + 0.5, bd * 1.45 + 0.5)
  } else {
    const tower = type === 'tower'
    const floors = tower ? Math.max(6, Math.round(14 - dd * 0.5 + R(-2, 2))) : Math.round(R(3, 6))
    const [fh, col, rad] = [tower ? 0.74 : 0.85, pick(tower ? TOWERS : WALLS), tower ? 0.35 : 0.25]
    const h = floors * fh + 0.3
    A(rbox(bw, h, bd, rad, 0.08), col, x, y, z)
    for (let i = 0; i < floors; i++) A(rbox(bw + 0.05, tower ? 0.42 : 0.34, bd + 0.05, rad + 0.02, 0.02), glass, x, y + 0.32 + i * fh, z)
    const top = y + h
    if (tower) {
      const [tw, td] = [bw * 0.66, bd * 0.66]
      A(rbox(tw, 1, td, 0.25, 0.06), col, x, top, z)
      A(rbox(tw + 0.04, 0.3, td + 0.04, 0.27, 0.02), glass, x, top + 0.4, z)
      if (rand() < 0.6) A(CYL, '#cfd5dc', x + tw * 0.2, top + 1, z, 0, 0.04, R(1.2, 2.4), 0.04)
    } else {
      if (rand() < 0.5) A(rbox(bw * 0.32, 0.32, bd * 0.3, 0.06, 0.03), '#d4d8dd', x - bw * 0.2, top, z + bd * 0.15)
      if (rand() < 0.35) {
        A(CYL, '#c8a88a', x + bw * 0.22, top, z - bd * 0.2, 0, 0.28, 0.55, 0.28)
        A(CONE, '#b08d6e', x + bw * 0.22, top + 0.55, z - bd * 0.2, 0, 0.3, 0.2, 0.3)
      } else if (rand() < 0.4) {
        for (let i = 0; i < 3; i++) {
          const k = R(0.22, 0.32)
          A(SPH, pick(['#86c96f', '#9bd47e']), x + R(-bw, bw) * 0.3, top + 0.1, z + R(-bd, bd) * 0.3, 0, k, k * 0.8, k)
        }
      }
    }
    ao(x, y, z, bw * 1.4 + 0.6, bd * 1.4 + 0.6)
  }
  piece('drop', d, x, y, z)
}

function splitLots(x0: number, z0: number, x1: number, z1: number, max: number, out: number[][]) {
  const [lw, ld] = [x1 - x0, z1 - z0]
  if (lw <= max && ld <= max) out.push([x0, z0, x1, z1])
  else if (lw >= ld) {
    const s = x0 + lw * R(0.38, 0.62)
    splitLots(x0, z0, s, z1, max, out)
    splitLots(s, z0, x1, z1, max, out)
  } else {
    const s = z0 + ld * R(0.38, 0.62)
    splitLots(x0, z0, x1, s, max, out)
    splitLots(x0, s, x1, z1, max, out)
  }
}
const lamp = (x: number, z: number) => {
  A(CYL, '#7d8794', x, WALK, z, 0, 0.035, 1.25, 0.035)
  A(SPH, lampMat, x, WALK + 1.3, z, 0, 0.11, 0.11, 0.11)
}

// The river's centre line, and the hill east of it.
const cz = (z: number) => 16 + 2 * Math.sin(z * 0.11 + 0.5)
const hill = (x: number, z: number) =>
  5.5 *
  Math.min(1, 1.25 * Math.exp(-((x - 27) ** 2 / 18 + (z - 8) ** 2 / 70))) *
  ss(21, 23.5, x) *
  (1 - ss(30.5, 32, x)) *
  ss(-12, -6, z) *
  (1 - ss(26, 30, z))
const ZS = [...Array.from({ length: 80 }, (_, i) => -31.6 + i * 0.8), 31.6]
function band(left: (z: number) => number, right: (z: number) => number) {
  const s = new THREE.Shape()
  s.moveTo(left(ZS[0]), -ZS[0])
  for (const z of ZS) s.lineTo(left(z), -z)
  for (const z of [...ZS].reverse()) s.lineTo(right(z), -z)
  return s
}
const waterGeo = new THREE.ShapeGeometry(
  band(
    (z) => cz(z) - 3.05,
    (z) => cz(z) + 3.05,
  ),
)
  .rotateX(-Math.PI / 2)
  .translate(0, ROAD + 0.04, 0)
const PY = BANK + hill(27, 8) - 0.05 // the shrine's podium

function build() {
  seed = 20261113
  statics.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
  statics.clear()
  pieces = []
  const ord = (x: number, z: number) => Math.hypot(x, z) / 45

  // Slab: soil, sand, grass, then the road plate. All of the slab top is road until a Block lands on it.
  const LAYERS: [number, number, string][] = [
    [2.2, -4.6, '#c9a37a'],
    [2, -2.6, '#dcc19a'],
    [0.55, -0.6, '#a5d38a'],
  ]
  LAYERS.forEach(([h, y, col], li) => {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const [x, z] = [-27.5 + i * 11, -27.5 + j * 11]
        A(rbox(11, h, 11, 0.5, 0.1), col, x, y, z)
        piece('drop', li * 0.4 + ord(x, z) * 1.1, x, y, z, 3)
      }
    }
  })
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const [x, z] = [-24 + i * 16, -24 + j * 16]
      A(rbox(16, 0.15, 16, 0.04, 0.02), ROADC, x, -0.05, z)
      piece('drop', 1.5 + ord(x, z) * 0.9, x, -0.05, z, 2)
    }
  }

  // Paint: a dashed centre line per Road, and a zebra crossing on every Arm.
  const lines: Vec[][] = []
  const done = new Set<string>()
  for (const arm of arms) {
    const [inn, out] = [arm.approach[0].line, arm.exit[0].line]
    if (!done.has(arm.road)) lines.push(...dashes(mid(inn.pts, [...out.pts].reverse()), 4.4, 4.4))
    done.add(arm.road)
    const e = pointAt(inn, inn.length)
    const [fx_, fy, lx, ly] = [Math.cos(e.heading), Math.sin(e.heading), -Math.sin(e.heading), Math.cos(e.heading)]
    for (let o = -5.5; o <= 5.6; o += 2.2) {
      const [cx, cy] = [e.x + lx * (w / 2 + o) + fx_ * 2, e.y + ly * (w / 2 + o) + fy * 2]
      lines.push([
        { x: cx - fx_ * 2, y: cy - fy * 2 },
        { x: cx + fx_ * 2, y: cy + fy * 2 },
      ])
    }
  }
  parts.push({
    geo: ribbons(
      lines.filter((l) => l.length !== 2 || Math.hypot(l[1].x - l[0].x, l[1].y - l[0].y) < 4.1),
      1.1,
      0.04,
    ),
    mat: paint,
  })
  parts.push({
    geo: ribbons(
      lines.filter((l) => l.length === 2 && Math.hypot(l[1].x - l[0].x, l[1].y - l[0].y) >= 4.1),
      0.56,
      0.04,
    ),
    mat: paint,
  })
  piece('show', 2.6)

  // River, banks, bridge and promenade
  for (const sh of [
    band(
      () => 7.75,
      (z) => cz(z) - 3,
    ),
    band(
      (z) => cz(z) + 3,
      () => 31.6,
    ),
  ]) {
    G(
      new THREE.ExtrudeGeometry(sh, { depth: BANK - ROAD, bevelEnabled: false, curveSegments: 1 })
        .rotateX(-Math.PI / 2)
        .translate(0, ROAD, 0),
      GRASS,
    )
  }
  G(waterGeo, water)
  piece('drop', 2.4, 20, ROAD, 0, 3)
  A(rbox(24.25, 0.14, 3.6, 0.1, 0.03), ROADC, 19.875, 0.26, -20)
  const [bx0, bx1] = [cz(-20) - 3.6, cz(-20) + 3.6]
  for (const sg of [-1, 1]) {
    A(rbox(bx1 - bx0, 0.24, 0.14, 0.05, 0.03), '#f4efe6', (bx0 + bx1) / 2, 0.4, -20 + sg * 1.8)
    for (let x = bx0; x <= bx1 + 0.01; x += 1.2) A(rbox(0.2, 0.34, 0.2, 0.05, 0.03), '#f4efe6', x, 0.4, -20 + sg * 1.8)
  }
  for (const px of [cz(-20) - 1.4, cz(-20) + 1.4]) A(rbox(0.6, 0.2, 3, 0.15, 0.04), STONE, px, ROAD, -20)
  A(rbox(1.4, 0.03, 9.6, 0.3, 0.01), PROM, 9.2, BANK, -26.7)
  A(rbox(1.4, 0.03, 49.4, 0.3, 0.01), PROM, 9.2, BANK, 6.8)
  piece('drop', 3, 20, BANK, -20, 2)
  for (let z = -30; z <= 30; z += 2.6)
    if (Math.abs(z + 20) > 3.2)
      tree(Math.min(10.9, cz(z) - 3.7) + R(-0.15, 0.15), BANK, z + R(-0.3, 0.3), R(0.7, 0.9), 'sakura', 3.4 + (z + 30) * 0.02)

  // Hill, shrine, torii and the woods around them
  {
    const hg = new THREE.PlaneGeometry(11, 42, 55, 168)
      .rotateX(-Math.PI / 2)
      .translate(26.5, 0, 9)
      .toNonIndexed()
    const p = hg.attributes.position
    const cols = new Float32Array(p.count * 3)
    const [c0, c1, tc] = [new THREE.Color('#9fd07e'), new THREE.Color('#cbe8a3'), new THREE.Color()]
    for (let i = 0; i < p.count; i++) {
      const h = hill(p.getX(i), p.getZ(i))
      p.setY(i, BANK - 0.02 + h)
      tc.copy(c0).lerp(c1, Math.min(1, h / 5.5))
      cols.set([tc.r, tc.g, tc.b], i * 3)
    }
    hg.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    hg.computeVertexNormals()
    parts.push({ geo: hg.translate(0, -ROAD, 0).scale(U, U, U), mat: solid })
    piece('drop', 3.2, 27, BANK, 8, 3)
  }
  A(rbox(3.2, 0.4, 3.2, 0.2, 0.08), '#d9d2c4', 27, PY, 8)
  let yy = PY + 0.4
  for (let i = 0; i < 4; i++) {
    const s = 1.6 - i * 0.24
    A(rbox(s, 0.55, s, 0.06, 0.03), i % 2 ? '#f5efe4' : VER, 27, yy, 8)
    yy += 0.55
    A(CONE4, '#4b5a6e', 27, yy - 0.08, 8, 0, (s / 2 + 0.5) * Math.SQRT2, 0.42, (s / 2 + 0.5) * Math.SQRT2)
    yy += 0.22
  }
  A(CYL, gold, 27, yy, 8, 0, 0.05, 1.3, 0.05)
  for (let i = 0; i < 4; i++) A(SPH, gold, 27, yy + 0.3 + i * 0.22, 8, 0, 0.09, 0.05, 0.09)
  piece('drop', 4, 27, PY, 8, 2)
  for (const sx of [-0.8, 0.8]) A(CYL, VER, 27 + sx, BANK, -15.2, 0, 0.1, 1.9, 0.1)
  A(rbox(2.2, 0.14, 0.22, 0.04, 0.02), VER, 27, BANK + 1.75, -15.2)
  A(rbox(2.6, 0.12, 0.3, 0.05, 0.03), '#2f3440', 27, BANK + 1.89, -15.2)
  A(rbox(1.9, 0.12, 0.16, 0.03, 0.02), VER, 27, BANK + 1.4, -15.2)
  A(rbox(1.3, 0.04, 3.2, 0.25, 0.01), PROM, 27, BANK, -16.7)
  for (let z = -14.6; z < 5.6; z += 0.75) A(rbox(0.95, 0.06, 0.5, 0.12, 0.02), STONE, 27, BANK + hill(27, z) - 0.02, z)
  for (const sx of [-1.1, 1.1]) {
    A(rbox(0.3, 0.5, 0.3, 0.05, 0.03), STONE, 27 + sx, BANK, -14.3)
    A(rbox(0.26, 0.2, 0.26, 0.05, 0.03), lampMat, 27 + sx, BANK + 0.5, -14.3)
    A(CONE4, '#bdb5a6', 27 + sx, BANK + 0.7, -14.3, 0, 0.32, 0.22, 0.32)
  }
  piece('drop', 3.8, 27, BANK, -15.2)
  for (let i = 0, n = 0; i < 400 && n < 85; i++) {
    const [x, z] = [R(20.8, 31.2), R(-30, 29.5)]
    if (x < cz(z) + 3.6 || Math.abs(z + 20) < 2.6 || (Math.abs(x - 27) < 1.1 && z > -19 && z < 8)) continue
    if ((x - 27) ** 2 / 6 + (z - 8) ** 2 / 12 < 1 || (Math.abs(x - 27) < 2 && Math.abs(z + 15) < 1.5)) continue
    const h = hill(x, z)
    tree(x, BANK + h - 0.05, z, R(0.7, 1.15), h > 2.4 && rand() < 0.55 ? 'pine' : rand() < 0.15 ? 'sakura' : 'round', 3.6 + n++ * 0.02)
  }

  // Blocks: a raised pavement slab cut from the lane geometry, then a park, a plaza or seeded lots
  blocks.forEach((b, bi) => {
    const [bw, bd, cx, cb, tb] = [b.x1 - b.x0, b.z1 - b.z0, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 2.6 + bi * 0.25]
    const near = (x: number, z: number) => Math.hypot(cx - x, cb - z) < 4
    const plaza = near(-0.75, 4)
    parts.push({ geo: tint(slab(b.loop, KERB), plaza ? '#ece3d1' : SIDEWALK), mat: solid })
    for (const [lx, lz] of [
      [b.x0 + 0.5, b.z0 + 0.5],
      [b.x1 - 0.5, b.z0 + 0.5],
      [b.x0 + 0.5, b.z1 - 0.5],
      [b.x1 - 0.5, b.z1 - 0.5],
    ])
      lamp(lx, lz)
    piece('drop', tb, cx, ROAD, cb, 3)
    if (near(-15.25, 22.6)) {
      // Kumo Park
      const [px, pz] = [cx + 0.8, cb + 1.5]
      A(rbox(bw - 1, 0.06, bd - 1, 0.6, 0.03), GRASS, cx, WALK, cb)
      A(CYL, STONE, px, WALK, pz, 0, 3.4, 0.08, 2.4)
      A(CYL, water, px, WALK + 0.02, pz, 0, 3.15, 0.08, 2.2)
      A(rbox(1.6, 0.12, 0.5, 0.1, 0.03), VER, px - 2.7, WALK + 0.08, pz)
      piece('drop', tb + 0.3, cx, WALK, cb)
      for (let i = 0, n = 0; i < 200 && n < 30; i++) {
        const [x, z] = [R(b.x0 + 1.2, b.x1 - 1.2), R(b.z0 + 1.2, b.z1 - 1.2)]
        if (((x - px) / 4.3) ** 2 + ((z - pz) / 3.2) ** 2 < 1) continue
        tree(x, WALK + 0.06, z, R(0.75, 1.2), rand() < 0.2 ? 'sakura' : rand() < 0.15 ? 'pine' : 'round', tb + 0.6 + n++ * 0.03)
      }
      return
    }
    if (plaza) {
      // Hikari Tower: stacked cylinders, coral and cream, two glazed decks and a beacon; and a fountain
      const [tx, tz, base] = [-1, 5, WALK + 0.35]
      A(rbox(5, 0.35, 5, 0.6, 0.08), '#e2d8c6', tx, WALK, tz)
      const SEGS = [
        [0, 3, 1.6, 1.15],
        [3, 6, 1.15, 0.85],
        [6, 9, 0.85, 0.62],
        [9.9, 12.8, 0.55, 0.32],
        [13.3, 14.3, 0.3, 0.22],
      ]
      SEGS.forEach(([a, c, r0, r1], i) =>
        A(new THREE.CylinderGeometry(r1, r0, c - a, 16).translate(0, (c - a) / 2, 0), i % 2 ? '#fbf6ef' : '#f08a6e', tx, base + a, tz),
      )
      A(CYL, '#fbf6ef', tx, base + 9, tz, 0, 1.35, 0.9, 1.35)
      A(CYL, glass, tx, base + 9.15, tz, 0, 1.38, 0.5, 1.38)
      A(CYL, '#f08a6e', tx, base + 12.8, tz, 0, 0.72, 0.5, 0.72)
      A(CYL, glass, tx, base + 12.88, tz, 0, 0.74, 0.3, 0.74)
      A(CYL, '#fbf6ef', tx, base + 14.3, tz, 0, 0.07, 3.2, 0.07)
      A(SPH, lampMat, tx, base + 17.5, tz, 0, 0.13, 0.13, 0.13)
      ao(tx, WALK + 0.35, tz, 5, 5, true)
      piece('drop', tb + 0.8, tx, WALK, tz, 3)
      A(CYL, STONE, -1, WALK, -0.2, 0, 1.2, 0.28, 1.2)
      A(CYL, water, -1, WALK + 0.05, -0.2, 0, 1.02, 0.25, 1.02)
      A(CYL, STONE, -1, WALK, -0.2, 0, 0.18, 0.75, 0.18)
      piece('drop', tb + 1, -1, WALK, -0.2)
      for (const [x, z] of [
        [-4.6, -1.1],
        [3.1, -1.1],
        [-4.6, 9.1],
        [3.1, 9.1],
        [-4.6, 4],
        [3.1, 4],
      ])
        tree(x, WALK, z, 0.8, 'sakura', tb + 1.2)
      return
    }
    const lots: number[][] = []
    splitLots(b.x0 + 0.8, b.z0 + 0.8, b.x1 - 0.8, b.z1 - 0.8, Math.hypot(cx + 1, cb - 4) < 18 ? 5 : 3.8, lots)
    for (const [x0, z0, x1, z1] of lots) {
      const [px, pz, fw, fd] = [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 - 0.5, z1 - z0 - 0.5]
      if (fw < 1 || fd < 1) continue
      const d = tb + 0.45 + ord(px, pz) * 1.5
      if (rand() < 0.08) {
        tree(px, WALK, pz, R(0.6, 0.9), 'round', d)
        continue
      }
      const dd = Math.hypot(px + 1, pz - 4)
      const type = dd < 14 ? (rand() < 0.7 ? 'tower' : 'mid') : dd < 24 ? (rand() < 0.75 ? 'mid' : 'house') : rand() < 0.7 ? 'house' : 'mid'
      building(px, pz, fw, fd, type, dd, d)
      if (type === 'house' && (fw > 3.4 || fd > 3.4))
        tree(px + (fw > fd ? fw / 2 - 0.5 : 0), WALK, pz + (fw > fd ? 0 : fd / 2 - 0.5), 0.6, 'round', d + 0.2)
    }
  })
  // Street trees along the main avenue, on the pavement only
  for (const x of [-10.6, -5.4])
    for (let z = -30; z < 30; z += 3.4)
      if (sample(x * U, -z * U) > 1 && !(x > -6 && z > -2.25 && z < 10.25)) tree(x, WALK, z, 0.5, 'round', 5)
}

// ---------- reveal: pieces drop in brick by brick, then everything is baked
const backOut = (u: number) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2
let buildT = -1 // seconds into the reveal, or -1 when idle
let grow = 1 // cars scale in once the slab has landed
function reveal() {
  build()
  for (const p of pieces) p.g.visible = false
  ;[buildT, grow] = [0, 0]
}
function stepReveal(dt: number) {
  if (buildT < 0) return
  buildT += dt
  let live = false
  for (const p of pieces) {
    const u = (buildT - p.d) / 0.62
    if (u < 1) live = true
    if (u <= 0) continue
    p.g.visible = true
    if (p.kind === 'show' || u >= 1) p.g.scale.setScalar(1)
    else if (p.kind === 'pop') p.g.scale.setScalar(Math.max(0.001, backOut(u)))
    else if (u < 0.5) p.g.scale.setScalar(Math.min(1, 0.55 + u * 2))
    else {
      const e = Math.exp(-4.5 * (u * 2 - 1)) * Math.cos((u * 2 - 1) * 9.5)
      p.g.scale.set(1 + 0.13 * e, 1 - 0.22 * e, 1 + 0.13 * e)
      if (!p.hit && p.big)
        for (let i = 0; i < p.big; i++)
          puff(p.g.position.x + (Math.random() - 0.5) * 30, p.g.position.y + 2, p.g.position.z + (Math.random() - 0.5) * 30, {})
      p.hit = true
    }
    p.g.position.y = (p.g.userData.y ??= p.g.position.y) + (p.kind === 'drop' && u < 0.5 ? 25 * (1 - (u * 2) ** 2) : 0)
  }
  if (live) return
  merge()
  buildT = -1
  const cols = ['#f26d5b', '#4f8fe8', '#f6c85f', '#7cc6a4', '#b9a3e3', '#ff9db5']
  for (let i = 0; i < 50; i++) {
    puff((Math.random() - 0.5) * 220, 8 + Math.random() * 12, (Math.random() - 0.5) * 220, {
      vx: (Math.random() - 0.5) * 20,
      vy: 30 + Math.random() * 24,
      vz: (Math.random() - 0.5) * 20,
      g: 48,
      s0: 3,
      s1: 2,
      max: 1.8,
      col: cols[i % 6],
      a: 1,
    })
  }
}

// ---------- sprites: dust, confetti, steam, anger marks, speech bubbles
const puffTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.7, 'rgba(255,255,255,0.9)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
})
const angerTex = canvasTex(128, 128, (g) => {
  g.lineCap = 'round'
  for (const [lw, col] of [
    [20, '#fff'],
    [11, '#ff3b46'],
  ] as const) {
    g.lineWidth = lw
    g.strokeStyle = col
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const a = Math.atan2(-dy, -dx)
      g.beginPath()
      g.arc(64 + dx * 36, 64 + dy * 36, 26, a - 0.85, a + 0.85)
      g.stroke()
    }
  }
})
const bubbleTex = ['もう!', 'はやく!', 'HONK!', 'ちょっと!', 'ぐぬぬ…'].map((text) =>
  canvasTex(256, 128, (g) => {
    g.fillStyle = '#fff'
    g.strokeStyle = '#2f3440'
    g.lineWidth = 6
    g.lineJoin = 'round'
    g.beginPath()
    g.roundRect(8, 8, 240, 86, 40)
    g.fill()
    g.stroke()
    g.beginPath()
    g.moveTo(96, 93)
    g.lineTo(112, 122)
    g.lineTo(136, 93)
    g.fill()
    g.stroke()
    g.fillRect(100, 88, 32, 8)
    g.fillStyle = '#e0323c'
    g.font = "900 42px system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif"
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 128, 53)
  }),
)
const sprite = (map: THREE.Texture, order: number, onTop = true) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: !onTop, depthWrite: false, toneMapped: false }))
  s.visible = false
  s.renderOrder = order
  scene.add(s)
  return s
}
const FX = { vx: 0, vy: 2.4, vz: 0, g: 0, s0: 1.4, s1: 5, max: 0.6, col: '#ffffff', a: 0.75 }
const fx = Array.from({ length: 140 }, () => ({ sp: sprite(puffTex, 8, false), life: 0, ...FX }))
function puff(x: number, y: number, z: number, o: Partial<typeof FX>) {
  const p = fx.find((q) => q.life <= 0)
  if (!p) return
  Object.assign(p, FX, o)
  p.life = p.max
  p.sp.material.color.set(p.col)
  p.sp.position.set(x, y, z)
  p.sp.visible = true
}
function stepFx(dt: number) {
  for (const p of fx) {
    if (p.life <= 0) continue
    p.life -= dt
    const q = 1 - Math.max(0, p.life) / p.max
    p.vy -= p.g * dt
    p.sp.position.x += p.vx * dt
    p.sp.position.y += p.vy * dt
    p.sp.position.z += p.vz * dt
    p.sp.scale.setScalar(p.s0 + (p.s1 - p.s0) * q)
    p.sp.material.opacity = Math.min(1, (1 - q) * 1.8) * p.a
    p.sp.visible = p.life > 0
  }
}
const marks = Array.from({ length: 60 }, () => sprite(angerTex, 10))
const bubbles = Array.from({ length: 6 }, () => ({ sp: sprite(bubbleTex[0], 11), life: 0 }))
for (const b of bubbles) b.sp.center.set(0.44, 0)

// ---------- cars: one instanced mesh, plus head and tail lights for the night
function carGeometry() {
  const at = (g: THREE.BufferGeometry, col: string, x: number, y: number, z = 0) => tint(g.clone().translate(x, y, z), col)
  return [
    mergeGeometries([
      at(rbox(0.84, 0.12, 0.46, 0.06, 0.03), '#3a3f47', 0, 0.02),
      at(rbox(1, 0.3, 0.52, 0.14, 0.08), '#ffffff', 0, 0.08),
      at(rbox(0.56, 0.24, 0.46, 0.12, 0.07), '#ffffff', -0.06, 0.34),
      at(rbox(0.58, 0.13, 0.48, 0.12, 0.02), '#41566c', -0.06, 0.39),
    ]).scale(4.3, 4.3, 4.3),
    mergeGeometries(
      [0.6, -0.6].flatMap((z) => [
        at(new THREE.BoxGeometry(0.12, 0.3, 0.45), '#fff6d8', 2.13, 0.85, z),
        at(new THREE.BoxGeometry(0.12, 0.25, 0.45), '#ff3030', -2.13, 0.9, z),
      ]),
    ),
  ]
}
const [bodyGeo, lightGeo] = carGeometry()
const carMesh = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), CAP)
const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const carLights = new THREE.InstancedMesh(lightGeo, lightMat, CAP)
carMesh.castShadow = carMesh.receiveShadow = true
carMesh.frustumCulled = carLights.frustumCulled = false
scene.add(carMesh, carLights)

let waits = new Map<number, number>() // real seconds each car has been stuck
let bubbleT = 0
const [E, S3, P3] = [new THREE.Euler(0, 0, 0, 'YXZ'), new THREE.Vector3(), new THREE.Vector3()]
function updateCars(list: CarLike[], dt: number, t: number) {
  const next = new Map<number, number>()
  const angry: { x: number; y: number; z: number; mad: number; wait: number }[] = []
  const n = (carMesh.count = carLights.count = Math.min(list.length, CAP))
  for (let i = 0; i < n; i++) {
    const v = list[i]
    const p = pointAt(v.lane.line, v.s)
    const back = v.type.length / 2
    const wait = v.v < 0.4 ? (waits.get(v.id) ?? 0) + dt : Math.max(0, (waits.get(v.id) ?? 0) - 1.5 * dt)
    next.set(v.id, wait)
    const mad = Math.min(1, Math.max(0, (wait - 5) / 3))
    // Cars grow in at a Gateway and shrink out at one.
    const edge = entries.has(v.lane) ? v.s / 8 : v.lane.toGateway ? (v.lane.length - v.s) / 8 : 1
    P3.set(
      p.x - Math.cos(p.heading) * back,
      (p.x > 7.75 * U ? KERB : 0) + (mad ? Math.abs(Math.sin(t * 11 + v.id)) * 0.3 * mad : 0),
      -(p.y - Math.sin(p.heading) * back),
    )
    M4.compose(
      P3,
      Q.setFromEuler(E.set(mad ? Math.sin(t * 34 + v.id) * 0.07 * mad : 0, p.heading, 0)),
      S3.setScalar(Math.max(0.001, Math.min(1, edge) * grow)),
    )
    carMesh.setMatrixAt(i, M4)
    carLights.setMatrixAt(i, M4)
    carMesh.setColorAt(i, CARS[v.id % CARS.length])
    if (mad && grow >= 1) angry.push({ x: P3.x, y: P3.y, z: P3.z, mad, wait })
  }
  waits = next
  carMesh.instanceMatrix.needsUpdate = carLights.instanceMatrix.needsUpdate = true
  if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true

  // The longest-stuck cars get a mark; the worst steam and shout.
  angry.sort((a, b) => b.wait - a.wait)
  marks.forEach((m, i) => {
    const c = angry[i]
    m.visible = !!c
    if (!c) return
    m.position.set(c.x + 0.8, c.y + 4, c.z)
    m.scale.setScalar((1.8 + c.mad * 1.8) * (1 + 0.22 * Math.sin(t * 13 + i)))
  })
  for (const c of angry) if (c.wait > 10 && Math.random() < dt * 2) puff(c.x, c.y + 2.4, c.z, { vy: 5, s0: 1.2, s1: 4.4, max: 1 })
  bubbleT -= dt
  const loud = angry.filter((c) => c.wait > 9)
  const free = bubbles.find((b) => b.life <= 0)
  if (bubbleT <= 0 && loud.length && free) {
    bubbleT = 0.5 + Math.random() * 0.6
    const c = loud[Math.floor(Math.random() * loud.length)]
    free.life = 1.8
    free.sp.material.map = bubbleTex[Math.floor(Math.random() * bubbleTex.length)]
    free.sp.position.set(c.x, c.y + 6, c.z)
  }
  for (const b of bubbles) {
    b.life -= dt
    b.sp.visible = b.life > 0
    const k = Math.min(1, (1.8 - b.life) / 0.15) * (1 + 0.06 * Math.sin(t * 20))
    b.sp.scale.set(10.4 * k, 5.2 * k, 1)
    b.sp.material.opacity = Math.min(1, Math.max(0, b.life / 0.3))
  }
}

// ---------- walkers, clouds, the shadow under the slab
const walkers = pavements.flatMap((path) => {
  const line = polyline([...path, path[0]])
  return Array.from({ length: 2 }, () => ({
    line,
    s: Math.random() * line.length,
    v: (0.9 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
    ph: Math.random() * 10,
  }))
})
const SHIRTS = ['#f26d5b', '#4f8fe8', '#f6c85f', '#ffffff', '#7cc6a4', '#b9a3e3', '#2f3440', '#ff9db5'].map((c) => new THREE.Color(c))
const bodies = new THREE.InstancedMesh(
  new THREE.CapsuleGeometry(0.3, 0.65, 3, 8).translate(0, 0.62, 0),
  new THREE.MeshStandardMaterial({ roughness: 0.85 }),
  walkers.length,
)
const heads = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.29, 10, 8).translate(0, 1.6, 0),
  new THREE.MeshStandardMaterial({ color: '#f1d1b5', roughness: 0.85 }),
  walkers.length,
)
bodies.castShadow = heads.castShadow = true
bodies.frustumCulled = heads.frustumCulled = false
walkers.forEach((_, i) => bodies.setColorAt(i, SHIRTS[i % SHIRTS.length]))
scene.add(bodies, heads)
function stepWalkers(dt: number, t: number) {
  walkers.forEach((wk, i) => {
    wk.s = (wk.s + wk.v * dt + wk.line.length) % wk.line.length
    const p = pointAt(wk.line, wk.s)
    M4.makeTranslation(p.x, KERB + Math.abs(Math.sin((t + wk.ph) * 9)) * 0.12, -p.y)
    bodies.setMatrixAt(i, M4)
    heads.setMatrixAt(i, M4)
  })
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true
  bodies.visible = heads.visible = buildT < 0
}

// Clouds fade out as the camera zooms in, so they never sit between the player and a jam; their shadows stay.
const cloudMat = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  roughness: 1,
  emissive: '#ffffff',
  emissiveIntensity: 0.3,
  transparent: true,
})
const clouds = [
  [-120, 64, 96],
  [24, 70, 136],
  [112, 66, -96],
].map(([x, y, z]) => {
  const g = new THREE.Group()
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(SPH, cloudMat)
    const k = (6 + Math.random() * 5) * (1 - Math.abs(i - 3.5) / 7)
    m.scale.set(k * 1.2, k * 0.85, k)
    m.position.set((i - 3.5) * 6.5, Math.random() * 3, Math.random() * 8 - 4)
    m.castShadow = true
    g.add(m)
  }
  g.position.set(x, y, z)
  scene.add(g)
  return g
})
// Two propeller planes crossing the sky: a near-straight line with a slight curve, gone at the edge, then a new line.
const FAR = 62 // design units from the centre where a plane appears and disappears
const planes = [
  { y: 15, col: '#f26d5b' },
  { y: 19, col: '#4f8fe8' },
].map((pl) => {
  const g = new THREE.Group()
  const mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })
  const part = (geo: THREE.BufferGeometry, c: string, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat(c))
    m.position.set(x, y, z)
    m.castShadow = true
    g.add(m)
    return m
  }
  part(rbox(1.7, 0.34, 0.36, 0.16, 0.08), '#fbf6ef', 0, 0)
  part(rbox(0.5, 0.2, 0.3, 0.12, 0.05), '#41566c', 0.2, 0.26) // canopy
  part(rbox(0.55, 0.06, 2.6, 0.12, 0.02), pl.col, 0.15, 0.2) // wing
  part(rbox(0.32, 0.05, 0.9, 0.1, 0.02), pl.col, -0.72, 0.22) // tailplane
  part(rbox(0.36, 0.42, 0.06, 0.02, 0.02), pl.col, -0.72, 0.26) // fin
  part(rbox(0.16, 0.22, 0.22, 0.08, 0.04), pl.col, 0.88, 0.06) // nose
  const prop = part(new THREE.BoxGeometry(0.03, 0.9, 0.09), '#3a3f47', 0.99, 0.17)
  g.scale.setScalar(U)
  scene.add(g)
  return { ...pl, g, prop, x: 0, z: FAR + 1, h: 0, turn: 0 }
})
function stepSky(dt: number, t: number) {
  cloudMat.opacity = THREE.MathUtils.clamp(1.9 - camera.zoom, 0, 1)
  for (const c of clouds) {
    c.position.x = c.position.x > 240 ? -240 : c.position.x + dt * 3
    c.visible = buildT < 0
  }
  for (const pl of planes) {
    if (Math.hypot(pl.x, pl.z) > FAR) {
      // Start on the rim, aimed somewhere near the middle.
      const a = Math.random() * TAU
      ;[pl.x, pl.z] = [Math.cos(a) * FAR, Math.sin(a) * FAR]
      pl.h = Math.atan2(-pl.z + (Math.random() - 0.5) * 50, -pl.x + (Math.random() - 0.5) * 50)
      pl.turn = (Math.random() - 0.5) * 0.06
    }
    pl.h += pl.turn * dt
    pl.x += Math.cos(pl.h) * 5 * dt
    pl.z += Math.sin(pl.h) * 5 * dt
    pl.g.position.set(pl.x * U, (pl.y + Math.sin(t * 0.7 + pl.y) * 0.4) * U, pl.z * U)
    pl.g.rotation.set(pl.turn * 5, -pl.h, 0, 'YXZ')
    pl.g.scale.setScalar(U * THREE.MathUtils.clamp((FAR - Math.hypot(pl.x, pl.z)) / 6, 0.001, 1))
    pl.prop.rotation.x += dt * 40
    pl.g.visible = buildT < 0
  }
}
const rippleTex = canvasTex(256, 256, (g) => {
  g.strokeStyle = 'rgba(255,255,255,0.6)'
  g.lineCap = 'round'
  for (let i = 0; i < 46; i++) {
    const [x, y, l] = [Math.random() * 256, Math.random() * 256, 8 + Math.random() * 22]
    g.lineWidth = 1.5 + Math.random() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + l / 2, y - 3, x + l, y)
    g.stroke()
  }
})
rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping
rippleTex.repeat.set(0.14, 0.14)
const ripple = new THREE.Mesh(
  waterGeo
    .clone()
    .translate(0, 0.01 - ROAD, 0)
    .scale(U, U, U),
  new THREE.MeshBasicMaterial({
    map: rippleTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }),
)
scene.add(ripple)
const boats = ['#f26d5b', '#4f8fe8'].map((col, i) => {
  const g = new THREE.Group()
  const hull = new THREE.Mesh(rbox(0.95, 0.14, 0.42, 0.18, 0.05), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }))
  const cabin = new THREE.Mesh(rbox(0.36, 0.16, 0.3, 0.06, 0.03), new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }))
  cabin.position.set(-0.1, 0.14, 0)
  hull.castShadow = cabin.castShadow = true
  g.add(hull, cabin).scale.setScalar(U)
  scene.add(g)
  return { g, s: i * 0.5, off: i ? 1 : -1 }
})
function stepRiver(dt: number, t: number) {
  rippleTex.offset.y -= dt * 0.03
  ripple.visible = buildT < 0
  for (const b of boats) {
    b.s += dt * 0.012
    const [ph, fwd] = [b.s % 1, b.s % 1 < 0.5]
    const z = -13 + (fwd ? ph * 2 : 2 - ph * 2) * 42
    b.g.position.set((cz(z) + b.off) * U, (0.03 + Math.sin(t * 2 + b.off) * 0.02) * U, z * U)
    b.g.rotation.y = Math.atan2(fwd ? -1 : 1, 0.22 * Math.cos(z * 0.11 + 0.5) * (fwd ? 1 : -1))
    b.g.visible = buildT < 0
  }
}
const under = new THREE.Mesh(
  new THREE.PlaneGeometry(440, 440).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({
    map: canvasTex(256, 256, (g) => {
      const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128)
      gr.addColorStop(0, 'rgba(40,50,80,0.45)')
      gr.addColorStop(1, 'rgba(40,50,80,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 256, 256)
    }),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }),
)
under.position.set(16, -21.2, 16)
scene.add(under)

// ---------- day cycle. p runs 0..1 over a day; the one light is the sun by day and the moon by night,
// and goes dark for a moment at each handover so the jump across the sky is never seen.
interface Key {
  p: number
  name?: string
  sun: string
  si: number
  sky: string
  gnd: string
  hi: number
  bg: [string, string, string]
  win: number
  lamp: number
  az: number
  el: number
}
const KEYS: Key[] = [
  {
    p: 0,
    name: 'Morning',
    sun: '#fff3e0',
    si: 2.6,
    sky: '#d6ebff',
    gnd: '#efe6d2',
    hi: 1.25,
    bg: ['#bfe2fb', '#e6f2f6', '#f6efe2'],
    win: 0,
    lamp: 0,
    az: -0.82,
    el: 0.9,
  },
  {
    p: 0.25,
    name: 'Noon',
    sun: '#fffaf0',
    si: 3,
    sky: '#dcebff',
    gnd: '#f2ead9',
    hi: 1.25,
    bg: ['#8fcaf6', '#cfe7f6', '#f3f1e6'],
    win: 0,
    lamp: 0,
    az: 0.1,
    el: 1.2,
  },
  {
    p: 0.4,
    sun: '#ffe0b3',
    si: 2.9,
    sky: '#cfe2ff',
    gnd: '#f4dcc0',
    hi: 1.1,
    bg: ['#9ccff3', '#d9ecf3', '#ffe4c4'],
    win: 0.12,
    lamp: 0,
    az: 1.05,
    el: 0.66,
  },
  {
    p: 0.5,
    name: 'Dusk',
    sun: '#ff9c6e',
    si: 1.8,
    sky: '#8e9fe0',
    gnd: '#e8a98c',
    hi: 0.85,
    bg: ['#6876c4', '#b493c4', '#f7b48c'],
    win: 1.4,
    lamp: 4,
    az: 1.76,
    el: 0.34,
  },
  {
    p: 0.58,
    sun: '#ff9c6e',
    si: 0,
    sky: '#7686d6',
    gnd: '#7a6f9c',
    hi: 0.85,
    bg: ['#2a3270', '#5a5aa0', '#a07aa8'],
    win: 1.5,
    lamp: 5,
    az: 1.9,
    el: 0.15,
  },
  {
    p: 0.62,
    sun: '#a9c0ff',
    si: 0,
    sky: '#7686d6',
    gnd: '#5a5f9c',
    hi: 0.9,
    bg: ['#222a62', '#444c92', '#7a6aa0'],
    win: 1.6,
    lamp: 5,
    az: -1.2,
    el: 0.5,
  },
  {
    p: 0.75,
    name: 'Night',
    sun: '#c4d4ff',
    si: 1.7,
    sky: '#b4c2f6',
    gnd: '#7a84c0',
    hi: 1.75,
    bg: ['#161d48', '#2c3876', '#525a9a'],
    win: 1.6,
    lamp: 5,
    az: 0.3,
    el: 1,
  },
  {
    p: 0.9,
    sun: '#a9c0ff',
    si: 0,
    sky: '#9aa8e0',
    gnd: '#8a84a8',
    hi: 0.95,
    bg: ['#3a4a90', '#8a8cc0', '#e0b0a8'],
    win: 0.6,
    lamp: 2,
    az: 1.2,
    el: 0.5,
  },
  {
    p: 0.94,
    sun: '#fff3e0',
    si: 0,
    sky: '#b8c8ee',
    gnd: '#c8b8b8',
    hi: 1.05,
    bg: ['#6a8ad0', '#b8c4e0', '#f4d0b8'],
    win: 0.2,
    lamp: 0.5,
    az: -1,
    el: 0.3,
  },
]
const param = new URLSearchParams(location.search).get('t')
let clock = param ? +param : 0.4
let cycling = !param
let night = 0
const [ca, cb] = [new THREE.Color(), new THREE.Color()]
const mix = (a: string, b: string, k: number) => ca.set(a).lerp(cb.set(b), k)
function setTime(p: number) {
  const i = KEYS.length - 1 - [...KEYS].reverse().findIndex((k) => k.p <= p)
  const [a, b] = [KEYS[i], KEYS[(i + 1) % KEYS.length]]
  const k = (p - a.p) / ((b.p || 1) - a.p)
  const num = (f: (key: Key) => number) => f(a) + (f(b) - f(a)) * k
  sun.color.copy(mix(a.sun, b.sun, k))
  hemi.color.copy(mix(a.sky, b.sky, k))
  hemi.groundColor.copy(mix(a.gnd, b.gnd, k))
  sun.intensity = num((q) => q.si)
  hemi.intensity = num((q) => q.hi)
  glass.emissiveIntensity = num((q) => q.win)
  lampMat.emissiveIntensity = num((q) => q.lamp)
  night = Math.min(1, num((q) => q.lamp) / 3)
  lightMat.color.setScalar(night)
  carLights.visible = night > 0.05
  const [az, el] = [num((q) => q.az), num((q) => q.el)]
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(500)
  document.body.style.background = `linear-gradient(180deg,${[0, 1, 2].map((s) => `#${mix(a.bg[s], b.bg[s], k).getHexString()} ${s * 50}%`).join(',')})`
}

// ---------- labels
const labels = [
  { text: 'Hoshi-dori', p: [-22, 0.3, -12], d: [0, 1] },
  { text: 'Sakura Avenue', p: [-8, 0.3, -12], d: [0, 1] },
  { text: 'Kawabata St', p: [6, 0.3, 22], d: [0, 1] },
  { text: 'Asagiri Rd', p: [-15, 0.3, -20], d: [1, 0] },
  { text: 'Tsuki-dori', p: [-27, 0.3, -4], d: [1, 0] },
  { text: 'Midori St', p: [-15, 0.3, 12], d: [1, 0] },
  { text: 'Hikawa River', p: [cz(8), 0.3, 8], d: [0, 1], color: '#3a87b8' },
  { text: '● Hikari Tower', p: [-1, 19, 5], d: null, color: '#b4523a' },
  { text: '● Kumo Park', p: [-14, 2.5, 20], d: null, color: '#3d7f3a' },
  { text: '● Asagiri Shrine', p: [27, PY + 5.5, 8], d: null, color: '#a83a28' },
].map((l) => {
  const el = labelLayer.appendChild(document.createElement('div'))
  el.textContent = l.text
  if ('color' in l && l.color) el.style.color = l.color
  return { ...l, el }
})
const [va, vb] = [new THREE.Vector3(), new THREE.Vector3()]
function stepLabels() {
  const { clientWidth: cw, clientHeight: ch } = canvas
  for (const l of labels) {
    va.set(l.p[0] * U, l.p[1] * U, l.p[2] * U).project(camera)
    const at = `translate(${((va.x + 1) / 2) * cw}px,${((1 - va.y) / 2) * ch}px) translate(-50%,-50%)`
    if (!l.d) {
      l.el.style.transform = at
      continue
    }
    vb.set((l.p[0] + l.d[0] * 5) * U, l.p[1] * U, (l.p[2] + l.d[1] * 5) * U).project(camera)
    let a = Math.atan2(-(vb.y - va.y) * ch, (vb.x - va.x) * cw)
    if (a > Math.PI / 2) a -= Math.PI
    if (a < -Math.PI / 2) a += Math.PI
    l.el.style.transform = `${at} rotate(${a}rad)`
  }
  labelLayer.style.visibility = buildT < 0 ? '' : 'hidden'
}

// ---------- click a car to see its route
let inspected: Vehicle | null = null
const routeCore = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#2f86ff', toneMapped: false }))
const routeGlow = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: '#62b0ff', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }),
)
scene.add(routeGlow, routeCore)
const ray = new THREE.Raycaster()
const ground = new THREE.Plane(UP, 0)
let down = { x: 0, y: 0 }
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }))
canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return
  const r = canvas.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
  const hit = ray.ray.intersectPlane(ground, new THREE.Vector3())
  const near = (v: Vehicle) => {
    const p = pointAt(v.lane.line, v.s)
    return Math.hypot(p.x - hit!.x, p.y + hit!.z)
  }
  inspected = hit ? (sim.vehicles.filter((v) => near(v) < 6).sort((a, b) => near(a) - near(b))[0] ?? null) : null
})
function stepRoute() {
  if (inspected && !sim.vehicles.includes(inspected)) inspected = null
  routeCore.visible = routeGlow.visible = !!inspected
  if (!inspected) return
  const { lane, s, path } = inspected
  const lines = [[pointAt(lane.line, s), ...lane.line.pts.filter((_, i) => lane.line.cum[i] > s)], ...path.map((l) => l.line.pts)]
  routeCore.geometry.dispose()
  routeGlow.geometry.dispose()
  routeCore.geometry = ribbons(lines, 1.2, 0.5)
  routeGlow.geometry = ribbons(lines, 3.6, 0.45)
}

// ---------- controls
let stress = false
const parked = parkedCars(sim.net, 1000, VEHICLE_TYPES[0])
const button = (label: string, act: () => void) => {
  const b = bar.appendChild(document.createElement('button'))
  b.textContent = label
  b.onclick = act
}
for (const k of KEYS) if (k.name) button(k.name, () => ([clock, cycling] = [k.p, false]))
button('Cycle', () => (cycling = true))
button('Reveal', reveal)
button('1,000 cars', () => (stress = !stress))

function resize() {
  const { clientWidth: cw, clientHeight: ch } = canvas
  renderer.setSize(cw, ch, false)
  const half = Math.max(33, (50 * ch) / cw) * U
  Object.assign(camera, { left: (-half * cw) / ch, right: (half * cw) / ch, top: half, bottom: -half })
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()
view()
build()
merge()

/** Uncapped cost: ms per frame for n back-to-back renders, waiting on the GPU each time. */
function bench(n = 120) {
  const gl = renderer.getContext()
  const px = new Uint8Array(4)
  const t = performance.now()
  for (let i = 0; i < n; i++) {
    renderer.render(scene, camera)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
  }
  return (performance.now() - t) / n
}
// Hooks for scripted screenshots and timing.
Object.assign(window, {
  diorama: { view, bench, reveal, time: (p: number) => ([clock, cycling] = [p, false]), setStress: (on: boolean) => (stress = on) },
})

let [acc, last, since, frames, cpu, t] = [0, performance.now(), performance.now(), 0, 0, 0]
requestAnimationFrame(function frame(now) {
  const start = performance.now()
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  t += dt
  if (!stress) {
    acc += dt * SPEED
    for (; acc >= DT; acc -= DT) sim.step()
  }
  if (cycling) clock = (clock + dt / DAY) % 1
  setTime(clock)
  if (buildT < 0) grow = Math.min(1, grow + dt * 1.5)
  stepReveal(dt)
  stepFx(dt)
  updateCars(stress ? parked : sim.vehicles, dt, t)
  stepWalkers(dt, t)
  stepRoute()
  stepRiver(dt, t)
  stepSky(dt, t)
  controls.update()
  stepLabels()
  renderer.render(scene, camera)
  cpu += performance.now() - start
  frames++
  if (now - since > 500) {
    const { calls, triangles } = renderer.info.render
    hud.textContent = [
      `${((frames * 1000) / (now - since)).toFixed(0)} fps · ${(cpu / frames).toFixed(1)} ms cpu/frame`,
      `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris · ${renderer.getPixelRatio()}x · field ${fieldMs.toFixed(0)} ms`,
      `cars: ${stress ? `${parked.length} static` : `${sim.vehicles.length} live sim`} · ${((clock * 24 + 7) % 24).toFixed(1).padStart(4)} h`,
      'click a car for its route · drag to rotate · wheel zooms · right-drag pans',
    ].join('\n')
    ;[since, frames, cpu] = [now, 0, 0]
  }
  requestAnimationFrame(frame)
})
