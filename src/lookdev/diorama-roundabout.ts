// PROTOTYPE (issue #16): the "Anime Map Diorama" look on the real sim. Throwaway. Open /diorama.html under `npm run dev`.
// Question: does the artifact's look survive a real roundabout, sim-driven cars, a day cycle and 1,000 cars?
import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import district from '../../levels/district-01'
import { dashes, mid, ribbons } from '../render/scene'
import { pointAt, polyline, type Vec } from '../sim/geometry'
import { DT, Sim, VEHICLE_TYPES, type Vehicle } from '../sim/sim'
import { parkedCars, type CarLike } from './props'

const H = 180 // half the slab, m
const KERB = 1 // Block height above the road: chunky on purpose, it is the toy look
const SPEED = 4 // sim seconds per real second
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
Object.assign(sun.shadow.camera, { left: -280, right: 280, top: 280, bottom: -280, near: 1, far: 1400 })
sun.shadow.bias = -0.0005
sun.shadow.normalBias = 0.16
sun.shadow.radius = 3
scene.add(hemi, sun)

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000)
const controls = new MapControls(camera, canvas)
Object.assign(controls, { enableDamping: true, minZoom: 0.5, maxZoom: 8, minPolarAngle: 0.3, maxPolarAngle: 1.15 })
function view(az = 0.62, el = 0.72, zoom = 1, target: Vec = { x: 0, y: 0 }) {
  controls.target.set(target.x, 0, -target.y)
  camera.position.set(target.x + Math.sin(az) * Math.cos(el) * 900, Math.sin(el) * 900, -target.y + Math.cos(az) * Math.cos(el) * 900)
  camera.zoom = zoom
  camera.updateProjectionMatrix()
  controls.update()
}

// ---------- materials and shapes
const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
const glass = new THREE.MeshStandardMaterial({ color: '#a9c4db', roughness: 0.22, metalness: 0.1, emissive: '#ffc78a', emissiveIntensity: 0 })
const lampMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.4, emissive: '#ffd08a', emissiveIntensity: 0 })
const water = new THREE.MeshStandardMaterial({ color: '#86cbef', roughness: 0.12 })
const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide })

const WALLS = ['#f6efe4', '#f3dac6', '#e5efdf', '#dae7f2', '#f4e4b9', '#efd8dd', '#e3ddef', '#fbf7f0', '#cfe4df']
const ROOFS = ['#d9735b', '#5d7a96', '#6ba39a', '#c79f6a', '#8a80b3', '#e08a6b']
const TOWERS = ['#eef2f5', '#dfe9f1', '#f5f0e7', '#e3ecea', '#f3e8e1']
const [SIDEWALK, ROADC, GRASS, STONE] = ['#f1ede5', '#c3c7ce', '#b5dc95', '#ddd6c9']
const CARS = ['#ffffff', '#f26d5b', '#4f8fe8', '#f6c85f', '#7cc6a4', '#b9a3e3', '#e9eef2', '#ff9db5'].map((c) => new THREE.Color(c))

const cache = new Map<string, THREE.BufferGeometry>()
/** Box with rounded corners and a bevelled top and bottom, sitting on y = 0. */
function rbox(w: number, h: number, d: number, r = 0.8, b = 0.25): THREE.BufferGeometry {
  const key = [w, h, d, r, b].map((v) => v.toFixed(2)).join()
  const hit = cache.get(key)
  if (hit) return hit
  b = Math.max(0, Math.min(b, h / 2 - 0.01, w / 2 - 0.05, d / 2 - 0.05))
  const [iw, id] = [w - 2 * b, d - 2 * b]
  r = Math.max(0.01, Math.min(r, iw / 2 - 0.01, id / 2 - 0.01))
  const [x, y] = [-iw / 2, -id / 2]
  const s = new THREE.Shape()
  s.moveTo(x + r, y).lineTo(x + iw - r, y).quadraticCurveTo(x + iw, y, x + iw, y + r)
  s.lineTo(x + iw, y + id - r).quadraticCurveTo(x + iw, y + id, x + iw - r, y + id)
  s.lineTo(x + r, y + id).quadraticCurveTo(x, y + id, x, y + id - r)
  s.lineTo(x, y + r).quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.01, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 3,
  })
  g.rotateX(-Math.PI / 2).translate(0, b, 0)
  cache.set(key, g)
  return g
}
/** Gable roof: a triangle `wid` across and `h` high, `len` long, ridge along sim y. */
function prism(len: number, wid: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-wid / 2, 0).lineTo(wid / 2, 0).lineTo(0, h).lineTo(-wid / 2, 0)
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2)
}
/** A sim polygon raised to height `h`, bevelled at the top edge. */
function slab(loop: Vec[], h: number, b = 0.25): THREE.BufferGeometry {
  const s = new THREE.Shape(loop.map((p) => new THREE.Vector2(p.x, p.y)))
  const g = new THREE.ExtrudeGeometry(s, { depth: h - b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1 })
  return g.rotateX(-Math.PI / 2)
}
const SPH = new THREE.SphereGeometry(1, 12, 9)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0)
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)

function tint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const a = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i)
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3))
}

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

/** Queue a shape for the current piece. `look` is a colour (shared vertex-coloured material) or a material. Sim x, y; height h. */
function add(geo: THREE.BufferGeometry, look: string | THREE.Material, x = 0, h = 0, y = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone()
  g.applyMatrix4(M4.compose(new THREE.Vector3(x, h, -y), Q.setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz)))
  parts.push(typeof look === 'string' ? { geo: tint(g, look), mat: solid } : { geo: g, mat: look })
}
/** Close the queued shapes into one piece that lands at delay `d`, anchored at sim (x, y), height h. */
function piece(kind: Piece['kind'], d: number, x = 0, h = 0, y = 0, big = 0) {
  const g = new THREE.Group()
  g.position.set(x, h, -y)
  for (const mat of new Set(parts.map((p) => p.mat))) {
    const geo = mergeGeometries(parts.filter((p) => p.mat === mat).map((p) => p.geo))
    g.add(new THREE.Mesh(geo.translate(-x, -h, y), mat))
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
    m.castShadow = mat !== paint
    m.receiveShadow = true
    statics.add(m)
    for (const g of geos) g.dispose()
  }
  pieces = []
}

// ---------- sim, and the field the Blocks are cut from
const sim = new Sim(district)
const w = district.roadDefaults.laneWidth
for (let i = 0; i < 900; i++) sim.step()
const arms = sim.net.junctions.flatMap((j) => j.arms)
const entries = new Set(Object.values(sim.net.gateways).flatMap((a) => a.approach))

// f > 0 inside a Block: metres clear of every lane's edge (Connections included, so corners follow the turns) and of the slab rim.
// ponytail: brute-force distance to every lane segment, ~0.3 s here; bucket segments in a grid when Districts grow.
const CELL = 1.25
const N = Math.round((2 * H) / CELL) + 1
const field = new Float32Array(N * N)
const t0 = performance.now()
{
  const segs = sim.net.lanes.flatMap((l) => l.line.pts.slice(1).map((b, i) => [l.line.pts[i].x, l.line.pts[i].y, b.x, b.y]))
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const [x, y] = [-H + i * CELL, -H + j * CELL]
      let best = Infinity
      for (const [ax, ay, bx, by] of segs) {
        const [dx, dy] = [bx - ax, by - ay]
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
        best = Math.min(best, (x - ax - dx * t) ** 2 + (y - ay - dy * t) ** 2)
      }
      field[j * N + i] = Math.min(Math.sqrt(best) - w / 2 - 0.8, H - 1.5 - Math.max(Math.abs(x), Math.abs(y)))
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
      const ids = [...CASES[c]].map((e) => (e === 'B' ? edge(i, j, false) : e === 'T' ? edge(i, j + 1, false) : e === 'L' ? edge(i, j, true) : edge(i + 1, j, true)))
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
    for (let prev = -1, cur: number | undefined = start; cur !== undefined && !seen.has(cur); ) {
      seen.add(cur)
      loop.push(pts.get(cur)!)
      const next: number | undefined = links.get(cur)!.find((n) => n !== prev)
      ;[prev, cur] = [cur, next]
    }
    if (loop.length > 12) loops.push(loop)
  }
  return loops
}
const centre = (loop: Vec[]): Vec => ({ x: loop.reduce((s, p) => s + p.x, 0) / loop.length, y: loop.reduce((s, p) => s + p.y, 0) / loop.length })
const blocks = contours(0).map((loop) => ({ loop, c: centre(loop) }))
const isIsland = (c: Vec) => Math.hypot(c.x, c.y) < 25
/** Pavement centre lines: lamps stand on them and walkers follow them. */
const pavements = contours(1.6).filter((l) => !isIsland(centre(l)))
// Themes by quadrant, hand-picked for this one roundabout: the park sits nearest the camera so nothing tall hides the Ring.
const theme = (c: Vec) => (isIsland(c) ? 'island' : c.x > 0 && c.y < 0 ? 'park' : c.x > 0 ? 'towers' : c.y > 0 ? 'mixed' : 'houses')

// ---------- props
function tree(x: number, y: number, h: number, s: number, kind: 'round' | 'pine' | 'sakura', d: number) {
  add(CYL, '#9a7457', x, h, y, 0, 0.36 * s, 3 * s, 0.36 * s)
  if (kind === 'pine') {
    for (let i = 0; i < 3; i++) add(CONE, pick(['#4f9a6a', '#5aa874', '#468f60']), x, h + s * (1.6 + i * 1.45), y, 0, s * (2.5 - i * 0.6), s * 2.8, s * (2.5 - i * 0.6))
  } else {
    const cols = kind === 'sakura' ? ['#f8bfd0', '#f4a8c0', '#fbd3df', '#f6b3c8'] : ['#86c96f', '#6db862', '#9bd47e', '#78bf68', '#8fcc73']
    const n = 3 + Math.floor(rand() * 3)
    for (let i = 0; i < n; i++) {
      const [a, rr, k] = [rand() * TAU, i ? 1.2 * s : 0, s * (i ? R(1.45, 1.9) : 2.4)]
      add(SPH, pick(cols), x + Math.cos(a) * rr, h + s * (i ? R(3.6, 5.4) : 4.2), y + Math.sin(a) * rr, 0, k, k * 0.9, k)
    }
  }
  piece('pop', d, x, h, y)
}

function building(x: number, y: number, fw: number, fd: number, type: 'house' | 'mid' | 'tower', d: number) {
  if (type === 'house') {
    const [bw, bd, h] = [Math.min(fw, 12), Math.min(fd, 12), R(4.5, 6.5)]
    add(rbox(bw, h, bd, 0.5, 0.2), pick(WALLS), x, KERB, y)
    add(rbox(bw + 0.16, 1, bd + 0.16, 0.56, 0.08), glass, x, KERB + h * 0.42, y)
    const along = bw >= bd
    add(prism((along ? bw : bd) + 0.8, (along ? bd : bw) + 1.1, Math.min(bw, bd) * 0.42), pick(ROOFS), x, KERB + h, y, along ? Math.PI / 2 : 0)
  } else {
    const tower = type === 'tower'
    const floors = tower ? Math.round(R(7, 13)) : Math.round(R(3, 6))
    const [fh, col, rad] = [tower ? 3 : 3.4, pick(tower ? TOWERS : WALLS), tower ? 1.4 : 1]
    const h = floors * fh + 1.2
    add(rbox(fw, h, fd, rad, 0.3), col, x, KERB, y)
    for (let i = 0; i < floors; i++) add(rbox(fw + 0.2, tower ? 1.7 : 1.4, fd + 0.2, rad + 0.08, 0.08), glass, x, KERB + 1.3 + i * fh, y)
    const top = KERB + h
    if (tower) {
      add(rbox(fw * 0.66, 4, fd * 0.66, 1, 0.25), col, x, top, y)
      add(rbox(fw * 0.66 + 0.16, 1.2, fd * 0.66 + 0.16, 1.08, 0.08), glass, x, top + 1.6, y)
      if (rand() < 0.6) add(CYL, '#cfd5dc', x + fw * 0.13, top + 4, y, 0, 0.16, R(5, 9), 0.16)
    } else if (rand() < 0.5) add(rbox(fw * 0.32, 1.3, fd * 0.3, 0.25, 0.12), '#d4d8dd', x - fw * 0.2, top, y - fd * 0.15)
    else for (let i = 0; i < 3; i++) add(SPH, pick(['#86c96f', '#9bd47e']), x + R(-fw, fw) * 0.3, top + 0.4, y + R(-fd, fd) * 0.3, 0, 1.1, 0.9, 1.1)
  }
  piece('drop', d, x, KERB, y)
}

function splitLots(x0: number, y0: number, x1: number, y1: number, max: number, out: number[][]) {
  const [lw, ld] = [x1 - x0, y1 - y0]
  if (lw <= max && ld <= max) out.push([x0, y0, x1, y1])
  else if (lw >= ld) {
    const s = x0 + lw * R(0.38, 0.62)
    splitLots(x0, y0, s, y1, max, out)
    splitLots(s, y0, x1, y1, max, out)
  } else {
    const s = y0 + ld * R(0.38, 0.62)
    splitLots(x0, y0, x1, s, max, out)
    splitLots(x0, s, x1, y1, max, out)
  }
}

const LANDMARK = { x: 78, y: 78 } // Hikari Tower: hand-authored, the seeded fill keeps clear of it

function build() {
  seed = 20261113
  statics.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
  statics.clear()
  pieces = []
  const ord = (x: number, y: number) => Math.hypot(x, y) / 250

  // Slab: soil, sand, grass, then the road plate. All of the slab top is road until a Block lands on it.
  const LAYERS: [number, number, string][] = [[9, -20.4, '#c9a37a'], [8.4, -11.4, '#dcc19a'], [2.4, -3, '#a5d38a']]
  LAYERS.forEach(([h, y0, col], li) => {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const [x, y] = [-150 + i * 60, -150 + j * 60]
        add(rbox(60, h, 60, 2, 0.4), col, x, y0, y)
        piece('drop', li * 0.4 + ord(x, y) * 1.1, x, y0, y, 3)
      }
    }
  })
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const [x, y] = [-135 + i * 90, -135 + j * 90]
      add(rbox(90, 0.6, 90, 0.2, 0.05), ROADC, x, -0.6, y)
      piece('drop', 1.5 + ord(x, y) * 0.9, x, -0.6, y, 2)
    }
  }

  // Paint: lane dividers, centre lines.
  const lines: Vec[][] = []
  for (const arm of arms) {
    for (const set of [arm.approach, arm.exit]) for (let i = 1; i < set.length; i++) lines.push(...dashes(mid(set[i - 1].line.pts, set[i].line.pts), 3, 6))
    lines.push(mid(arm.approach[arm.approach.length - 1].line.pts, [...arm.exit[arm.exit.length - 1].line.pts].reverse()))
    for (let i = 1; i < arm.ringOut.length; i++) lines.push(...dashes(mid(arm.ringOut[i - 1].line.pts, arm.ringOut[i].line.pts), 3, 5))
  }
  parts.push({ geo: ribbons(lines, 0.3, 0.04), mat: paint })
  piece('show', 2.6)

  // Blocks
  blocks.forEach(({ loop, c }, bi) => {
    const [kind, tb] = [theme(c), 2.6 + bi * 0.35]
    parts.push({ geo: tint(slab(loop, KERB), SIDEWALK), mat: solid })
    piece('drop', tb, c.x, 0, c.y, 3)
    if (kind === 'island') {
      for (const lawn of contours(1.2).filter((l) => isIsland(centre(l)))) parts.push({ geo: tint(slab(lawn, 0.5, 0.2).translate(0, KERB, 0), GRASS), mat: solid })
      piece('drop', tb + 0.3)
      tree(0, 0, KERB + 0.5, 2.6, 'sakura', tb + 0.7)
      for (let i = 0; i < 8; i++) tree(Math.cos((i * TAU) / 8) * 24, Math.sin((i * TAU) / 8) * 24, KERB + 0.5, 0.8, i % 2 ? 'sakura' : 'round', tb + 0.8 + i * 0.06)
      return
    }
    const xs = loop.map((p) => p.x)
    const ys = loop.map((p) => p.y)
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    if (kind === 'park') {
      for (const lawn of contours(4).filter((l) => theme(centre(l)) === 'park')) parts.push({ geo: tint(slab(lawn, 0.3, 0.12).translate(0, KERB, 0), GRASS), mat: solid })
      const pond = { x: 95, y: -100 }
      add(CYL, STONE, pond.x, KERB + 0.3, pond.y, 0, 22, 0.35, 15)
      add(CYL, water, pond.x, KERB + 0.4, pond.y, 0, 20.5, 0.35, 13.5)
      piece('drop', tb + 0.3, c.x, KERB, c.y)
      for (let i = 0, n = 0; i < 400 && n < 60; i++) {
        const [x, y] = [R(box[0], box[2]), R(box[1], box[3])]
        if (sample(x, y) < 7 || ((x - pond.x) / 26) ** 2 + ((y - pond.y) / 19) ** 2 < 1) continue
        tree(x, y, KERB + 0.3, R(0.75, 1.2), rand() < 0.25 ? 'sakura' : rand() < 0.15 ? 'pine' : 'round', tb + 0.6 + n++ * 0.03)
      }
      return
    }
    if (kind === 'towers') {
      // Stacked cylinders, coral and cream, with two glazed decks and a beacon.
      const { x, y } = LANDMARK
      add(rbox(26, 1.4, 26, 3, 0.3), '#e2d8c6', x, KERB, y)
      const SEGS = [[0, 12, 6.4, 4.6], [12, 24, 4.6, 3.4], [24, 36, 3.4, 2.5], [39.6, 51.2, 2.2, 1.3], [53.2, 57.2, 1.2, 0.9]]
      SEGS.forEach(([a, b, r0, r1], i) => add(new THREE.CylinderGeometry(r1, r0, b - a, 16).translate(0, (b - a) / 2, 0), i % 2 ? '#fbf6ef' : '#f08a6e', x, KERB + 1.4 + a, y))
      add(CYL, '#fbf6ef', x, KERB + 37.4, y, 0, 5.4, 3.6, 5.4)
      add(CYL, glass, x, KERB + 38, y, 0, 5.5, 2, 5.5)
      add(CYL, '#f08a6e', x, KERB + 52.6, y, 0, 2.9, 2, 2.9)
      add(CYL, '#fbf6ef', x, KERB + 58.6, y, 0, 0.28, 12, 0.28)
      add(SPH, lampMat, x, KERB + 71, y, 0, 0.6, 0.6, 0.6)
      piece('drop', tb + 1.2, x, KERB, y, 3)
      for (const [dx, dy] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) tree(x + dx, y + dy, KERB, 0.9, 'sakura', tb + 1.6)
    }
    const lots: number[][] = []
    splitLots(box[0], box[1], box[2], box[3], kind === 'houses' ? 17 : 24, lots)
    const mix = () => (kind === 'houses' ? (rand() < 0.85 ? 'house' : 'mid') : kind === 'towers' ? (rand() < 0.55 ? 'tower' : 'mid') : rand() < 0.6 ? 'mid' : 'house')
    for (const [x0, y0, x1, y1] of lots) {
      const [px, py, fw, fd] = [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0 - 2.4, y1 - y0 - 2.4]
      const d = tb + 0.5 + ord(px, py) * 2.5
      const inside = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].every(([x, y]) => sample(x, y) > 2.5)
      if (kind === 'towers' && Math.hypot(px - LANDMARK.x, py - LANDMARK.y) < 34) continue
      if (!inside || fw < 5 || fd < 5 || rand() < 0.08) {
        if (sample(px, py) > 5) tree(px, py, KERB, R(0.7, 1.05), rand() < 0.3 ? 'sakura' : 'round', d)
        continue
      }
      building(px, py, fw, fd, mix(), d)
    }
  })

  // Street lamps along the pavements
  for (const path of pavements) {
    const line = polyline([...path, path[0]])
    for (let s = 0; s < line.length - 14; s += 28) {
      const p = pointAt(line, s)
      add(CYL, '#7d8794', p.x, KERB, p.y, 0, 0.14, 5, 0.14)
      add(SPH, lampMat, p.x, KERB + 5.2, p.y, 0, 0.45, 0.45, 0.45)
    }
    piece('pop', 5)
  }
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
      if (!p.hit && p.big) for (let i = 0; i < p.big; i++) puff(p.g.position.x + (Math.random() - 0.5) * 30, p.g.position.y + 2, p.g.position.z + (Math.random() - 0.5) * 30, {})
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
      vx: (Math.random() - 0.5) * 20, vy: 30 + Math.random() * 24, vz: (Math.random() - 0.5) * 20, g: 48, s0: 3, s1: 2, max: 1.8, col: cols[i % 6], a: 1,
    })
  }
}

// ---------- sprites: dust, confetti, steam, anger marks, speech bubbles
function canvasTex(cw: number, ch: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  ;[c.width, c.height] = [cw, ch]
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
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
  for (const [lw, col] of [[20, '#fff'], [11, '#ff3b46']] as const) {
    g.lineWidth = lw
    g.strokeStyle = col
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
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
    mergeGeometries([at(rbox(3.6, 0.5, 1.7, 0.25, 0.1), '#3a3f47', 0, 0.05), at(rbox(4.3, 1.15, 1.9, 0.5, 0.3), '#ffffff', 0, 0.3), at(rbox(2.4, 0.9, 1.7, 0.45, 0.25), '#ffffff', -0.3, 1.3), at(rbox(2.5, 0.5, 1.76, 0.45, 0.08), '#41566c', -0.3, 1.5)]),
    mergeGeometries([0.6, -0.6].flatMap((z) => [at(new THREE.BoxGeometry(0.12, 0.3, 0.45), '#fff6d8', 2.13, 0.85, z), at(new THREE.BoxGeometry(0.12, 0.25, 0.45), '#ff3030', -2.13, 0.9, z)])),
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
    P3.set(p.x - Math.cos(p.heading) * back, mad ? Math.abs(Math.sin(t * 11 + v.id)) * 0.3 * mad : 0, -(p.y - Math.sin(p.heading) * back))
    M4.compose(P3, Q.setFromEuler(E.set(mad ? Math.sin(t * 34 + v.id) * 0.07 * mad : 0, p.heading, 0)), S3.setScalar(Math.max(0.001, Math.min(1, edge) * grow)))
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

// ---------- Priority paint: give-way triangles on every yielding Arm, read from the sim each frame
const yields = arms.map((arm) => {
  const pos: number[] = []
  for (const lane of arm.approach) {
    const e = pointAt(lane.line, lane.length)
    const [fx_, fy, rx, ry] = [Math.cos(e.heading), Math.sin(e.heading), Math.sin(e.heading), -Math.cos(e.heading)]
    for (const o of [-1, 0, 1]) {
      const [cx, cy] = [e.x - fx_ * 0.5 + rx * o * 1.05, e.y - fy * 0.5 + ry * o * 1.05]
      for (const [a, b] of [[0, 0.42], [0, -0.42], [-1.5, 0]]) pos.push(cx + fx_ * a + rx * b, 0.05, -(cy + fy * a + ry * b))
    }
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  const mesh = new THREE.Mesh(g, paint)
  scene.add(mesh)
  return { arm, mesh }
})

// ---------- walkers, clouds, the shadow under the slab
const walkers = pavements.flatMap((path) => {
  const line = polyline([...path, path[0]])
  return Array.from({ length: 5 }, () => ({ line, s: Math.random() * line.length, v: (0.9 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 10 }))
})
const SHIRTS = ['#f26d5b', '#4f8fe8', '#f6c85f', '#ffffff', '#7cc6a4', '#b9a3e3', '#2f3440', '#ff9db5'].map((c) => new THREE.Color(c))
const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.3, 0.65, 3, 8).translate(0, 0.62, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), walkers.length)
const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.29, 10, 8).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: '#f1d1b5', roughness: 0.85 }), walkers.length)
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

const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.3 })
const clouds = [[-130, 70, 110], [30, 78, 150], [130, 72, -110]].map(([x, y, z]) => {
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
const under = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2),
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
under.position.set(16, -23, 16)
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
  { p: 0, name: 'Morning', sun: '#fff3e0', si: 2.6, sky: '#d6ebff', gnd: '#efe6d2', hi: 1.25, bg: ['#bfe2fb', '#e6f2f6', '#f6efe2'], win: 0, lamp: 0, az: 1.5, el: 0.6 },
  { p: 0.25, name: 'Noon', sun: '#fffaf0', si: 3, sky: '#dcebff', gnd: '#f2ead9', hi: 1.25, bg: ['#8fcaf6', '#cfe7f6', '#f3f1e6'], win: 0, lamp: 0, az: 0.5, el: 1.15 },
  { p: 0.4, sun: '#ffe0b3', si: 2.9, sky: '#cfe2ff', gnd: '#f4dcc0', hi: 1.1, bg: ['#9ccff3', '#d9ecf3', '#ffe4c4'], win: 0.12, lamp: 0, az: -0.3, el: 0.62 },
  { p: 0.5, name: 'Dusk', sun: '#ff9c6e', si: 1.8, sky: '#8e9fe0', gnd: '#e8a98c', hi: 0.85, bg: ['#6876c4', '#b493c4', '#f7b48c'], win: 1.4, lamp: 4, az: -0.9, el: 0.25 },
  { p: 0.58, sun: '#ff9c6e', si: 0, sky: '#7686d6', gnd: '#7a6f9c', hi: 0.85, bg: ['#2a3270', '#5a5aa0', '#a07aa8'], win: 1.5, lamp: 5, az: -1.1, el: 0.15 },
  { p: 0.62, sun: '#a9c0ff', si: 0, sky: '#7686d6', gnd: '#5a5f9c', hi: 0.9, bg: ['#222a62', '#444c92', '#7a6aa0'], win: 1.6, lamp: 5, az: 1.2, el: 0.5 },
  { p: 0.75, name: 'Night', sun: '#c4d4ff', si: 1.7, sky: '#b4c2f6', gnd: '#7a84c0', hi: 1.75, bg: ['#161d48', '#2c3876', '#525a9a'], win: 1.6, lamp: 5, az: 0.3, el: 1 },
  { p: 0.9, sun: '#a9c0ff', si: 0, sky: '#9aa8e0', gnd: '#8a84a8', hi: 0.95, bg: ['#3a4a90', '#8a8cc0', '#e0b0a8'], win: 0.6, lamp: 2, az: -0.9, el: 0.5 },
  { p: 0.94, sun: '#fff3e0', si: 0, sky: '#b8c8ee', gnd: '#c8b8b8', hi: 1.05, bg: ['#6a8ad0', '#b8c4e0', '#f4d0b8'], win: 0.2, lamp: 0.5, az: 1.6, el: 0.3 },
]
const param = new URLSearchParams(location.search).get('t')
let clock = param ? +param : 0.36
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
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(600)
  document.body.style.background = `linear-gradient(180deg,${[0, 1, 2].map((s) => `#${mix(a.bg[s], b.bg[s], k).getHexString()} ${s * 50}%`).join(',')})`
}

// ---------- labels
const NAMES = ['Hoshi-dori', 'Sakura Avenue', 'Kawabata St', 'Asagiri Rd']
const labels = [
  ...Object.values(sim.net.gateways).map((arm, i) => ({ text: NAMES[i % NAMES.length], p: [Math.cos(arm.angle) * 118, 0.3, Math.sin(arm.angle) * 118], d: [Math.cos(arm.angle), Math.sin(arm.angle)] })),
  { text: '● Hikari Tower', p: [LANDMARK.x, 76, LANDMARK.y], d: null, color: '#b4523a' },
  { text: '● Kumo Park', p: [95, 12, -100], d: null, color: '#3d7f3a' },
].map((l) => {
  const el = labelLayer.appendChild(document.createElement('div'))
  el.textContent = l.text
  if ('color' in l) el.style.color = l.color
  return { ...l, el }
})
const [va, vb] = [new THREE.Vector3(), new THREE.Vector3()]
function stepLabels() {
  const { clientWidth: cw, clientHeight: ch } = canvas
  for (const l of labels) {
    va.set(l.p[0], l.p[1], -l.p[2]).project(camera)
    const at = `translate(${((va.x + 1) / 2) * cw}px,${((1 - va.y) / 2) * ch}px) translate(-50%,-50%)`
    if (!l.d) {
      l.el.style.transform = at
      continue
    }
    vb.set(l.p[0] + l.d[0] * 20, l.p[1], -(l.p[2] + l.d[1] * 20)).project(camera)
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
  const half = Math.max(215, (300 * ch) / cw)
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
Object.assign(window, { diorama: { view, bench, reveal, time: (p: number) => ([clock, cycling] = [p, false]), setStress: (on: boolean) => (stress = on) } })

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
  for (const c of clouds) c.position.x = c.position.x > 260 ? -260 : c.position.x + dt * 3
  for (const y of yields) y.mesh.visible = buildT < 0 && y.arm.priority === 'yield'
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
      'click a car for its route · drag pan · right-drag orbit',
    ].join('\n')
    ;[since, frames, cpu] = [now, 0, 0]
  }
  requestAnimationFrame(frame)
})
