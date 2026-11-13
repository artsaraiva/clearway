import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { pointAt, polyline, type Vec } from '../sim/geometry'
import type { Node } from '../sim/network'
import type { Sim, Vehicle } from '../sim/sim'

const ROAD_Y = 0.15
const COLORS = { ground: 0xffffff, road: 0xc9ccd2, paint: 0xffffff, stop: 0xe5484d, green: 0x30a46c }
export const CAR_COLORS = [0x8ecae6, 0xffb4a2, 0xb5e48c, 0xffd166, 0xcdb4db, 0xa0c4ff].map((c) => new THREE.Color(c))
const MAX_CARS = 600

/** Sim (x, y) → Three (x, height, -y): north is away from the camera. */
const v3 = (p: Vec, y = 0) => new THREE.Vector3(p.x, y, -p.y)

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

const flat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })

export type View = ReturnType<typeof createScene>

export function createScene(canvas: HTMLCanvasElement, sim: Sim) {
  const { net } = sim
  const w = sim.level.roundabout.laneWidth

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.ground)

  const camera = new THREE.OrthographicCamera()
  camera.position.set(0, 300, 300) // 45° tilt
  camera.lookAt(0, 0, 0)
  camera.zoom = 1.6

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(-80, 160, 60)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 500 })
  sun.shadow.camera.updateProjectionMatrix()
  sun.shadow.radius = 4
  scene.add(sun)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), flat(COLORS.ground))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // Road surface: every lane, including all candidate connections so node areas are paved.
  const road = new THREE.Mesh(
    ribbons(
      net.lanes.map((l) => l.line.pts),
      w + 0.05,
      ROAD_Y,
    ),
    flat(COLORS.road),
  )
  road.receiveShadow = true
  scene.add(road)

  // Paint: dashed lane dividers, solid centre line between approach and exit.
  const paint: Vec[][] = []
  const ringLanes = (arm: string) => net.lanes.filter((l) => l.kind === 'ring' && l.arm === arm)
  for (const node of net.nodes) {
    const ins = net.approaches[node.arm]
    const outs = net.exits[node.arm]
    for (let i = 1; i < ins.length; i++) paint.push(...dashes(mid(ins[i - 1].line.pts, ins[i].line.pts), 3, 6))
    for (let i = 1; i < outs.length; i++) paint.push(...dashes(mid(outs[i - 1].line.pts, outs[i].line.pts), 3, 6))
    paint.push(mid(ins[ins.length - 1].line.pts, [...outs[outs.length - 1].line.pts].reverse()))
    const ring = ringLanes(node.arm)
    for (let i = 1; i < ring.length; i++) paint.push(...dashes(mid(ring[i - 1].line.pts, ring[i].line.pts), 3, 5))
  }
  scene.add(new THREE.Mesh(ribbons(paint, 0.18, ROAD_Y + 0.02), flat(COLORS.paint)))

  // Stop lines across each approach, coloured by priority rule.
  const stopLines = net.nodes.map((node) => {
    const ins = net.approaches[node.arm]
    const end = (i: number) => ins[i].line.pts[ins[i].line.pts.length - 1]
    const { heading } = pointAt(ins[0].line, ins[0].length)
    const right = { x: Math.sin(heading), y: -Math.cos(heading) }
    const a = end(0)
    const b = end(ins.length - 1)
    const pts = [
      { x: a.x + (right.x * w) / 2, y: a.y + (right.y * w) / 2 },
      { x: b.x - (right.x * w) / 2, y: b.y - (right.y * w) / 2 },
    ]
    const mesh = new THREE.Mesh(ribbons([pts], 0.6, ROAD_Y + 0.03), flat(COLORS.paint))
    scene.add(mesh)
    return { arm: node.arm, mesh }
  })

  // Cars.
  const carGeo = new RoundedBoxGeometry(4.3, 1.5, 1.9, 3, 0.45)
  carGeo.translate(0, 0.75 + ROAD_Y, 0)
  const cars = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), MAX_CARS)
  cars.castShadow = true
  cars.receiveShadow = true
  cars.count = 0
  scene.add(cars)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)

  // Lane-connector overlay for the selected node.
  const overlay = new THREE.Group()
  scene.add(overlay)

  // Route inspector: the remaining route of one clicked car, redrawn each frame as it moves.
  let inspectedCar: Vehicle | null = null
  const route = new THREE.Mesh(new THREE.BufferGeometry(), flat(0xe11d74))
  route.position.y = ROAD_Y + 0.04
  scene.add(route)

  /** Sim position of a car's centre (`s` is the front bumper). */
  const carCentre = (v: Vehicle): Vec => {
    const p = pointAt(v.lane.line, v.s)
    const back = v.type.length / 2
    return { x: p.x - Math.cos(p.heading) * back, y: p.y - Math.sin(p.heading) * back }
  }

  function resize() {
    const { clientWidth: cw, clientHeight: ch } = canvas
    renderer.setSize(cw, ch, false)
    const half = 120
    const aspect = cw / ch
    Object.assign(camera, { left: -half * aspect, right: half * aspect, top: half, bottom: -half })
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      camera.zoom = Math.min(6, Math.max(0.6, camera.zoom * Math.exp(-e.deltaY * 0.001)))
      camera.updateProjectionMatrix()
    },
    { passive: false },
  )

  const raycaster = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ROAD_Y)

  return {
    /** Sim coordinates under a pointer event, on the road plane. */
    pick(e: PointerEvent): Vec | null {
      const r = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3())
      return hit ? { x: hit.x, y: -hit.z } : null
    },

    /** Rebuild the connector overlay: active connection curves plus lane-end markers. */
    showNode(node: Node | null, armed: string | null) {
      for (const o of overlay.children) (o as THREE.Mesh).geometry.dispose()
      overlay.clear()
      if (!node) return
      const active = node.connections.filter((c) => c.enabled)
      const fromRing = active.filter((c) => c.from.kind === 'ring').map((c) => c.lane.line.pts)
      const fromApproach = active.filter((c) => c.from.kind !== 'ring').map((c) => c.lane.line.pts)
      overlay.add(new THREE.Mesh(ribbons(fromRing, 0.6, ROAD_Y + 0.05), flat(0x10b981)))
      overlay.add(new THREE.Mesh(ribbons(fromApproach, 0.6, ROAD_Y + 0.06), flat(0x3b82f6)))
      const marker = (p: Vec, color: number, big: boolean) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(big ? 1.3 : 0.9, big ? 1.3 : 0.9, 0.4, 24), flat(color))
        mesh.position.copy(v3(p, ROAD_Y + 0.2))
        mesh.castShadow = true
        overlay.add(mesh)
      }
      for (const [port, lane] of Object.entries(node.inPorts))
        marker(lane.line.pts[lane.line.pts.length - 1], port === armed ? 0x1e3a8a : 0x3b82f6, port === armed)
      for (const lane of Object.values(node.outPorts)) marker(lane.line.pts[0], 0xf97316, false)
    },

    /** Highlight a car's remaining route. `null` clears it. */
    inspectCar(v: Vehicle | null) {
      inspectedCar = v
    },

    carCentre,

    render() {
      const vs = sim.vehicles
      if (inspectedCar && !vs.includes(inspectedCar)) inspectedCar = null
      route.visible = !!inspectedCar
      if (inspectedCar) {
        const { lane, s, path } = inspectedCar
        const here = pointAt(lane.line, s)
        const rest = lane.line.pts.filter((_, i) => lane.line.cum[i] > s)
        route.geometry.dispose()
        route.geometry = ribbons([[here, ...rest], ...path.map((l) => l.line.pts)], 1.2, 0)
      }
      cars.count = Math.min(vs.length, MAX_CARS)
      for (let i = 0; i < cars.count; i++) {
        const v = vs[i]
        q.setFromAxisAngle(up, pointAt(v.lane.line, v.s).heading)
        m.compose(v3(carCentre(v)), q, one)
        cars.setMatrixAt(i, m)
        cars.setColorAt(i, CAR_COLORS[v.id % CAR_COLORS.length])
      }
      cars.instanceMatrix.needsUpdate = true
      if (cars.instanceColor) cars.instanceColor.needsUpdate = true

      for (const { arm, mesh } of stopLines) {
        const rule = sim.priority[arm]
        const color = rule === 'yield' ? COLORS.paint : rule === 'stop' ? COLORS.stop : sim.isGreen(arm) ? COLORS.green : COLORS.stop
        ;(mesh.material as THREE.MeshStandardMaterial).color.setHex(color)
      }
      renderer.render(scene, camera)
    },
  }
}
