import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { CAR_COLORS, dashes, mid, ribbons } from '../render/scene'
import { pointAt, type Vec } from '../sim/geometry'
import type { Lane, Network } from '../sim/network'
import type { Vehicle, VehicleType } from '../sim/sim'
import type { Building, Tree } from './block'
import { BIKE, CURB, PALETTE } from './field'

const PAINT_Y = 0.02
const WALL = 0xd5d8dd
const LEAF = 0xb3cc98
const PINE = 0xa3c193
const BARK = 0x978f7f
const BRAKE_ON = new THREE.Color(0xff2a2a)
const BRAKE_OFF = new THREE.Color(0x5e2a2a)

const basic = (color: number) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
const lambert = (color: number) => new THREE.MeshLambertMaterial({ color })

/** Non-indexed, uv-free copy with a per-vertex colour from height, ready to merge. */
function painted(geo: THREE.BufferGeometry, color: (y: number) => THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) color(pos.getY(i)).toArray(col, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** Darker toward y0, full colour at y1: baked AO for canopies and walls. */
const shade = (hex: number, y0: number, y1: number, low: number) => (y: number) =>
  new THREE.Color(hex).multiplyScalar(low + (1 - low) * THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1))

/** Flat polygons (sim coordinates) as triangles at height y. */
export function flatPolys(polys: Vec[][], y: number): THREE.BufferGeometry {
  const pos: number[] = []
  for (const p of polys) {
    for (const tri of THREE.ShapeUtils.triangulateShape(p.map((q) => new THREE.Vector2(q.x, q.y)), [])) {
      for (const k of tri) pos.push(p[k].x, y, -p[k].y)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

export const plazaLayer = (polys: Vec[][]) => new THREE.Mesh(flatPolys(polys, 0.01), basic(PALETTE.plaza))

/** Frame at an arm's entry line: `at(r, lat)` is r m out along the arm and lat m right of inbound traffic. */
function armFrame(net: Network, arm: string, w: number) {
  const ins = net.approaches[arm]
  const outs = net.exits[arm]
  const end = (l: Lane) => l.line.pts[l.line.pts.length - 1]
  const [a, b] = [ins[0].line.pts[0], end(ins[0])]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const u = { x: (a.x - b.x) / len, y: (a.y - b.y) / len } // outward
  const right = { x: -u.y, y: u.x }
  const inner = [end(ins[ins.length - 1]), outs[outs.length - 1].line.pts[0]]
  const o = { x: (inner[0].x + inner[1].x) / 2, y: (inner[0].y + inner[1].y) / 2 }
  const lat = (p: Vec) => (p.x - o.x) * right.x + (p.y - o.y) * right.y
  return {
    u,
    at: (r: number, l: number): Vec => ({ x: o.x + u.x * r + right.x * l, y: o.y + u.y * r + right.y * l }),
    lanes: ins.map((l) => lat(end(l))),
    half: lat(end(ins[0])) + w / 2,
  }
}

// Arrow outlines in (forward, right) metres, drawn stretched along the lane.
const STRAIGHT = [[0, -0.15], [3.2, -0.15], [3.2, -0.6], [5, 0], [3.2, 0.6], [3.2, 0.15], [0, 0.15]]
const RIGHT_TURN = [[0, -0.15], [3, -0.15], [3, 1.2], [3.4, 1.2], [2.85, 2], [2.3, 1.2], [2.7, 1.2], [2.7, 0.15], [0, 0.15]]

/** Lane dividers, centre lines, entry lines, zebras, give-way triangles and turn arrows, merged into one mesh. */
export function markings(net: Network, w: number, stopArm: string): THREE.Mesh {
  const [thin, dashed, wide, polys]: Vec[][][] = [[], [], [], []]
  for (const node of net.nodes) {
    const { arm } = node
    const ins = net.approaches[arm]
    const outs = net.exits[arm]
    for (let i = 1; i < ins.length; i++) thin.push(...dashes(mid(ins[i - 1].line.pts, ins[i].line.pts), 3, 6))
    for (let i = 1; i < outs.length; i++) thin.push(...dashes(mid(outs[i - 1].line.pts, outs[i].line.pts), 3, 6))
    thin.push(mid(ins[ins.length - 1].line.pts, [...outs[outs.length - 1].line.pts].reverse()))
    const ring = net.lanes.filter((l) => l.kind === 'ring' && l.arm === arm)
    const across = (i: number) => node.connections.find((c) => c.fromPort === `ring${i}` && c.toPort === `ring${i}`)!.lane.line.pts
    for (let i = 1; i < ring.length; i++) {
      thin.push(...dashes(mid(ring[i - 1].line.pts, ring[i].line.pts), 3, 5))
      thin.push(...dashes(mid(across(i - 1), across(i)), 3, 5))
    }

    const f = armFrame(net, arm, w)
    if (arm === stopArm) wide.push([f.at(0.3, 0.15), f.at(0.3, f.half - 0.15)])
    for (let lat = -f.half + 0.75; lat < f.half - 0.4; lat += 1.1) wide.push([f.at(7, lat), f.at(10, lat)])
    f.lanes.forEach((lat, i) => {
      if (arm !== stopArm) {
        dashed.push(...dashes([f.at(0.2, lat - w / 2 + 0.15), f.at(0.2, lat + w / 2 - 0.15)], 0.5, 0.35))
        polys.push([f.at(5, lat), f.at(2, lat - 0.75), f.at(2, lat + 0.75)]) // give-way triangle, apex toward the driver
      }
      polys.push((i === 0 ? RIGHT_TURN : STRAIGHT).map(([fw, s]) => f.at(30 - fw * 1.5, lat + s)))
    })
  }
  const geo = mergeGeometries([ribbons(thin, 0.15, PAINT_Y), ribbons(dashed, 0.35, PAINT_Y), ribbons(wide, 0.5, PAINT_Y), flatPolys(polys, PAINT_Y)])
  return new THREE.Mesh(geo, basic(0xf7f7f5))
}

/** One give-way sign and one signal head, at the kerb right of each entry line, facing oncoming traffic. */
export function signs(net: Network, w: number, yieldArm: string, signalArm: string): THREE.Group {
  const group = new THREE.Group()
  const place = (obj: THREE.Object3D, arm: string) => {
    const f = armFrame(net, arm, w)
    const p = f.at(0.5, f.half + BIKE + CURB + 0.7)
    obj.position.set(p.x, 0, -p.y)
    obj.rotation.y = Math.atan2(f.u.x, -f.u.y)
    group.add(obj)
  }
  const pole = (h: number, r: number) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8).translate(0, h / 2, 0), lambert(0x9aa0a6))

  const giveWay = new THREE.Group()
  const plate = (r: number, color: number, z: number) =>
    new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 3).rotateX(Math.PI / 2).translate(0, 3.2, z), lambert(color))
  giveWay.add(pole(3.2, 0.06), plate(0.8, 0xd93a3a, 0.05), plate(0.5, 0xffffff, 0.08))
  place(giveWay, yieldArm)

  const signal = new THREE.Group()
  signal.add(pole(3.6, 0.09), new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.2, 0.35).translate(0, 4.2, 0.1), lambert(0x2b2f33)))
  ;[0x4a1c1c, 0x4a3a12, 0x2fe07a].forEach((color, i) => {
    signal.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8).translate(0, 4.56 - i * 0.36, 0.28), new THREE.MeshBasicMaterial({ color })))
  })
  place(signal, signalArm)
  return group
}

/** Extruded footprints with flat roofs and a darker base, merged into one mesh. */
export function buildingLayer(list: Building[]): THREE.Mesh {
  const geos = list.map(({ pts, h }) => {
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: Math.min(12, Math.ceil(h / 3)) }).rotateX(-Math.PI / 2)
    return painted(g, (y) => new THREE.Color(WALL).multiplyScalar(1 - 0.22 * Math.exp(-y / 3)))
  })
  return new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true }))
}

/** Unit icosphere pushed out by smooth noise: a blobby canopy. */
function blob(radius: number, stretch: number, seed: number): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv'))
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)]
    const n = Math.sin(3 * x + seed) * Math.sin(3 * y + 2 * seed) * Math.sin(3 * z + 3 * seed) + 0.5 * Math.sin(5 * (x + z) + seed)
    const k = radius * (1 + 0.13 * n)
    p.setXYZ(i, x * k, y * k * stretch, z * k)
  }
  g.computeVertexNormals()
  return g
}

function treeGeometry(kind: number): THREE.BufferGeometry {
  const trunk = (h: number) => painted(new THREE.CylinderGeometry(0.11, 0.17, h, 6).translate(0, h / 2, 0), () => new THREE.Color(BARK))
  if (kind === 2) {
    const tiers = [[1.5, 2.6, 2.4], [1.15, 2.2, 3.6], [0.75, 1.9, 4.8]]
    return mergeGeometries([trunk(1.6), ...tiers.map(([r, h, y]) => painted(new THREE.ConeGeometry(r, h, 8).translate(0, y, 0), shade(PINE, 1.1, 5.8, 0.7)))])
  }
  const [r, stretch, seed] = kind === 0 ? [2.8, 1, 1] : [2.3, 1.35, 4]
  const ry = r * stretch
  const top = 3 + ry
  return mergeGeometries([trunk(3.4), painted(blob(r, stretch, seed).translate(0, top, 0), shade(LEAF, top - ry, top + ry, 0.7))])
}

/** Three tree variants, one InstancedMesh each. */
export function treeLayer(list: Tree[]): THREE.Group {
  const group = new THREE.Group()
  const [m, q, up, c] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0), new THREE.Color()]
  for (const kind of [0, 1, 2]) {
    const mine = list.filter((t) => t.kind === kind)
    const mesh = new THREE.InstancedMesh(treeGeometry(kind), new THREE.MeshLambertMaterial({ vertexColors: true }), mine.length)
    mine.forEach((t, i) => {
      q.setFromAxisAngle(up, t.x * 7.3 + t.y * 3.1)
      mesh.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0, -t.y), q, new THREE.Vector3(t.s, t.s, t.s)))
      mesh.setColorAt(i, c.setScalar(0.93 + 0.07 * Math.sin(t.x * 1.7 + t.y)))
    })
    group.add(mesh)
  }
  return group
}

/** Soft dark ellipse with vertex alpha, for contact shadows under cars. */
function ellipse(): THREE.BufferGeometry {
  const [pos, col]: number[][] = [[], []]
  const N = 24
  const ring = (a: number, b: number, i: number) => [Math.cos((i / N) * Math.PI * 2) * a, 0, Math.sin((i / N) * Math.PI * 2) * b]
  const vert = (p: number[], alpha: number) => (pos.push(...p), col.push(0, 0, 0, alpha))
  for (let i = 0; i < N; i++) {
    const [ia, ib, oa, ob] = [ring(2.1, 0.85, i), ring(2.1, 0.85, i + 1), ring(3.0, 1.5, i), ring(3.0, 1.5, i + 1)]
    vert([0, 0, 0], 0.45), vert(ib, 0.45), vert(ia, 0.45)
    vert(ia, 0.45), vert(ib, 0.45), vert(oa, 0)
    vert(ib, 0.45), vert(ob, 0), vert(oa, 0)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  return g.translate(0, 0.03, 0)
}

export type CarLike = Pick<Vehicle, 'id' | 'lane' | 's' | 'v' | 'acc' | 'waiting' | 'type'>

/** Instanced car bodies, rear lights (red when braking or held) and contact shadows. */
export function carLayer(capacity: number) {
  const body = new THREE.InstancedMesh(new RoundedBoxGeometry(4.3, 1.5, 1.9, 2, 0.45).translate(0, 0.8, 0), new THREE.MeshLambertMaterial(), capacity)
  const lamp = new THREE.BoxGeometry(0.1, 0.24, 0.42)
  const lights = new THREE.InstancedMesh(mergeGeometries([lamp.clone().translate(-2.16, 0.95, 0.6), lamp.clone().translate(-2.16, 0.95, -0.6)]), new THREE.MeshBasicMaterial(), capacity)
  const shadowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 })
  const shadow = new THREE.InstancedMesh(ellipse(), shadowMat, capacity)
  const meshes = [shadow, body, lights]
  const group = new THREE.Group()
  for (const mesh of meshes) {
    mesh.frustumCulled = false // instances move; the cached bounding sphere would go stale
    mesh.count = 0
    group.add(mesh)
  }
  const [m, q, pos, up, one] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 1)]

  return {
    group,
    update(cars: CarLike[]) {
      const n = Math.min(cars.length, capacity)
      for (let i = 0; i < n; i++) {
        const v = cars[i]
        const p = pointAt(v.lane.line, v.s)
        const back = v.type.length / 2 // s is the front bumper
        pos.set(p.x - Math.cos(p.heading) * back, 0, -(p.y - Math.sin(p.heading) * back))
        m.compose(pos, q.setFromAxisAngle(up, p.heading), one)
        for (const mesh of meshes) mesh.setMatrixAt(i, m)
        body.setColorAt(i, CAR_COLORS[v.id % CAR_COLORS.length])
        lights.setColorAt(i, v.acc < -0.5 || v.waiting || v.v < 0.3 ? BRAKE_ON : BRAKE_OFF)
      }
      for (const mesh of meshes) {
        mesh.count = n
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    },
  }
}

/** n cars spread evenly over every lane, a third of them braking: render-cost test only. */
export function parkedCars(net: Network, n: number, type: VehicleType): CarLike[] {
  const step = net.lanes.reduce((t, l) => t + l.length, 0) / n
  const out: CarLike[] = []
  let s = 0
  for (const lane of net.lanes) {
    for (; s < lane.length; s += step) {
      const braking = out.length % 3 === 0
      out.push({ id: out.length, lane, s, v: braking ? 2 : 8, acc: braking ? -2 : 0, waiting: false, type })
    }
    s -= lane.length
  }
  return out
}
