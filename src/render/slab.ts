import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { District } from '../sim/district'

/** A rectangle in sim metres. */
export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

const RIM = 4 // m of grass showing around the road plate
const TILE = 44 // the layers are laid as tiles about this size, whose rounded corners give the slab its seams
const ROAD = '#c3c7ce'
// Top of each layer (m, road surface = 0), thickness and colour: soil, sand, grass.
const LAYERS: [number, number, string][] = [
  [-10, 8.8, '#c9a37a'],
  [-2.8, 8, '#dcc19a'],
  [-0.6, 2.2, '#a5d38a'],
]
const UNDER = -21.2 // height of the soft shadow in the air beneath the slab

/**
 * The road plate's rectangle: for now the District's bounds, every Road at its full width and every Ring in the file.
 * ponytail: ignores the Fog, so a multi-Level District shows its whole slab from Level 1; each Level authors its own
 * rectangle when the Reveal animation (#30) lands.
 */
export function districtBounds(district: District): Bounds {
  const { laneWidth } = district.roadDefaults
  const xs: number[] = []
  const ys: number[] = []
  const add = (x: number, y: number, r: number) => (xs.push(x - r, x + r), ys.push(y - r, y + r))
  for (const j of Object.values(district.junctions)) add(...j.at, j.type === 'roundabout' ? j.radius + (j.ringLanes * laneWidth) / 2 : 0)
  for (const road of Object.values(district.roads)) {
    const [a, b] = [road.from, road.to].map((end) => (typeof end === 'string' ? district.junctions[end].at : end))
    // Widen sideways only, so the Road still runs to the slab edge and stops.
    const half = Math.max(...road.lanes) * (road.laneWidth ?? laneWidth)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const [nx, ny] = [(-(b[1] - a[1]) / len) * half, ((b[0] - a[0]) / len) * half]
    for (const [x, y] of [a, b]) for (const side of [-1, 1]) add(x + nx * side, y + ny * side, 0)
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** The whole slab's rectangle: the road plate plus its grass rim. */
export const slabBounds = (plate: Bounds): Bounds => ({ x0: plate.x0 - RIM, y0: plate.y0 - RIM, x1: plate.x1 + RIM, y1: plate.y1 + RIM })

/** The middle of a rectangle, as Three (x, z). */
export const centre = (b: Bounds): [number, number] => [(b.x0 + b.x1) / 2, -(b.y0 + b.y1) / 2]

/** Box `w` × `h` × `d` with rounded corners (radius `r`) and a bevelled top and bottom (`b`), its top centred on the origin. */
function roundedBox(w: number, h: number, d: number, r: number, b: number): THREE.BufferGeometry {
  const [iw, id] = [w - 2 * b, d - 2 * b]
  const [x, y] = [-iw / 2, -id / 2]
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + iw - r, y).quadraticCurveTo(x + iw, y, x + iw, y + r)
  s.lineTo(x + iw, y + id - r).quadraticCurveTo(x + iw, y + id, x + iw - r, y + id)
  s.lineTo(x + r, y + id).quadraticCurveTo(x, y + id, x, y + id - r)
  s.lineTo(x, y + r).quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: h - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 4,
  })
  return g.rotateX(-Math.PI / 2).translate(0, b - h, 0)
}

function tint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const a = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i)
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3))
}

/** The slab floating in open sky: soil, sand and grass layers, the road plate on top (its surface at height 0), and the soft shadow beneath. */
export function createSlab(plate: Bounds): THREE.Object3D[] {
  const { x0, y0, x1, y1 } = slabBounds(plate)
  const [w, d] = [x1 - x0, y1 - y0]
  const [cx, cz] = centre(plate)
  const [nx, nz] = [Math.max(1, Math.round(w / TILE)), Math.max(1, Math.round(d / TILE))]
  const parts: THREE.BufferGeometry[] = []
  for (const [top, h, color] of LAYERS) {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        parts.push(
          tint(roundedBox(w / nx, h, d / nz, 2, 0.4).translate(x0 + ((i + 0.5) * w) / nx, top, -(y0 + ((j + 0.5) * d) / nz)), color),
        )
      }
    }
  }
  // All of the slab top is road; the Blocks stand on it and leave the Roads showing between them.
  parts.push(tint(roundedBox(w - 2 * RIM, 0.6, d - 2 * RIM, 0.16, 0.08).translate(cx, 0, cz), ROAD))
  const slab = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))
  slab.castShadow = slab.receiveShadow = true

  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const fade = g.createRadialGradient(128, 128, 30, 128, 128, 128)
  fade.addColorStop(0, 'rgba(40,50,80,0.45)')
  fade.addColorStop(1, 'rgba(40,50,80,0)')
  g.fillStyle = fade
  g.fillRect(0, 0, 256, 256)
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.67, d * 1.67).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }),
  )
  under.position.set(cx + 0.06 * w, UNDER, cz + 0.06 * d)
  return [slab, under]
}
