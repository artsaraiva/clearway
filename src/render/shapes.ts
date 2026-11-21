import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Vec } from '../sim/geometry'
import { LOW_POLY } from './look'

/**
 * Box `w` × `h` × `d` with rounded corners (radius `r`) and a bevelled top and bottom (`b`), standing on y = 0.
 * The radius and bevel shrink to fit a box too small for them. Low poly (`./look`), each corner and bevel is one cut.
 */
export function roundedBox(w: number, h: number, d: number, r: number, b: number): THREE.BufferGeometry {
  b = Math.min(b, h / 2 - 0.004, w / 2 - 0.04, d / 2 - 0.04)
  if (b <= 0.012) b = 0
  const [iw, id] = [w - 2 * b, d - 2 * b]
  r = Math.max(0.008, Math.min(r, iw / 2 - 0.004, id / 2 - 0.004))
  const [x, y] = [-iw / 2, -id / 2]
  const s = new THREE.Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + iw - r, y).quadraticCurveTo(x + iw, y, x + iw, y + r)
  s.lineTo(x + iw, y + id - r).quadraticCurveTo(x + iw, y + id, x + iw - r, y + id)
  s.lineTo(x + r, y + id).quadraticCurveTo(x, y + id, x, y + id - r)
  s.lineTo(x, y + r).quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.004, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: LOW_POLY ? 1 : 2,
    curveSegments: LOW_POLY ? 1 : 4,
  })
  return g.rotateX(-Math.PI / 2).translate(0, b, 0)
}

/**
 * A number from -1 to 1 that the same whole numbers always give: a part's own small difference, drawn from where it
 * stands and not from a random stream, so that nothing built after it changes.
 */
export function nudge(a: number, b: number, c: number, d = 0): number {
  const k = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + d * 11.131) * 43758.5453
  return (k - Math.floor(k)) * 2 - 1
}

/**
 * A ball of eighty flat faces and radius about 1, every corner pushed in or out by up to `rough` of it: the low-poly
 * look's sphere (`./look`). `seed` picks which way each corner goes, the same on every load.
 */
export function roughBall(seed: number, rough: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  const at = (c: number) => Math.round(c * 50) // the same push for every face's copy of a corner
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    v.multiplyScalar(1 + nudge(seed, at(v.x), at(v.y), at(v.z)) * rough)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  // Indexed, as the sphere it stands in for is: a builder's `toNonIndexed()` then takes a copy, not the shared ball.
  g.setIndex(Array.from({ length: p.count }, (_, i) => i))
  return g
}

/** Gable roof standing on y = 0: a triangle `wid` across and `h` high, `len` long, its ridge along z. */
export function gable(len: number, wid: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(-wid / 2, 0)
  s.lineTo(wid / 2, 0)
    .lineTo(0, h)
    .lineTo(-wid / 2, 0)
  return new THREE.ExtrudeGeometry(s, {
    depth: len,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 1,
  }).translate(0, 0, -len / 2)
}

/**
 * Hipped roof standing on y = 0 (#178), non-indexed: `wid` across and `len` long, its ridge along z at `h`, sloping down
 * to its eaves on every side, the hips at each end as steep as its sides, and closed underneath.
 */
export function hip(len: number, wid: number, h: number): THREE.BufferGeometry {
  const [a, l] = [wid / 2, len / 2]
  const ridge = Math.max(0, l - a)
  const [A, B, C, D] = [
    [-a, 0, -l],
    [a, 0, -l],
    [a, 0, l],
    [-a, 0, l],
  ]
  const [R1, R2] = [
    [0, h, -ridge],
    [0, h, ridge],
  ]
  // prettier-ignore
  const faces = [
    B, R2, C, B, R1, R2, // the +x side
    D, R1, A, D, R2, R1, // the -x side
    A, R1, B, // the hip at -z
    C, R2, D, // the hip at +z
    A, B, C, A, C, D, // underneath
  ]
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(faces.flat(), 3))
  g.computeVertexNormals()
  return g
}

/**
 * A sawtooth roof standing on y = 0: `n` teeth `h` high along x over `len`, each an upright face and a slope down to
 * the next, `wid` deep along z.
 */
export function sawtooth(len: number, wid: number, h: number, n: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const tooth = len / n
  s.moveTo(-len / 2, 0)
  for (let i = 0; i < n; i++) s.lineTo(-len / 2 + i * tooth, h).lineTo(-len / 2 + (i + 1) * tooth, 0)
  s.lineTo(-len / 2, 0)
  return new THREE.ExtrudeGeometry(s, { depth: wid, bevelEnabled: false }).translate(0, 0, -wid / 2)
}

/** A sim outline raised from y = 0 to `h`, bevelled at its top edge. Lies at Three's (x, -y). */
export function raised(loop: Vec[], h: number, bevel: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(new THREE.Shape(loop.map((p) => new THREE.Vector2(p.x, p.y))), {
    depth: h - bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
  }).rotateX(-Math.PI / 2) // extruded along +z from the sim's (x, y); turned so that it rises along +y
}

/** Paint a whole geometry one colour, for a material with vertex colours. */
export function tint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const a = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i)
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3))
}

/** A box `w` × `h` × `d` with its foot at `(x, y, z)`, in `colour`: a part of an instanced model (`merged`). */
export const part = (w: number, h: number, d: number, x: number, y: number, z: number, colour: THREE.ColorRepresentation) =>
  tint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), colour)

/** A model's parts merged into one geometry, their triangles unshared first so that any parts merge. */
export const merged = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!

/** A part whose paint share is `share`: 1 takes its instance's paint, 0 keeps its own colour (#156). */
export const painted = (geo: THREE.BufferGeometry, share: number) =>
  geo.setAttribute('painted', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(share), 1))

/** Have a material paint each vertex its instance's colour as its `painted` share has it (#156). */
export const takesPaint = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float painted;').replace(
    '#include <color_vertex>',
    `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
\tvColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, painted);
#endif`,
  )
}

/** A texture drawn on a canvas. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  ;[c.width, c.height] = [w, h]
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** A soft white puff, for steam, dust and confetti sprites. */
export const puff = () =>
  canvasTexture(64, 64, (g) => {
    const fade = g.createRadialGradient(32, 32, 4, 32, 32, 30)
    fade.addColorStop(0, 'rgba(255,255,255,1)')
    fade.addColorStop(0.7, 'rgba(255,255,255,0.9)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = fade
    g.fillRect(0, 0, 64, 64)
  })
