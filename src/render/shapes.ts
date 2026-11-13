import * as THREE from 'three'
import type { Vec } from '../sim/geometry'

/**
 * Box `w` × `h` × `d` with rounded corners (radius `r`) and a bevelled top and bottom (`b`), standing on y = 0.
 * The radius and bevel shrink to fit a box too small for them.
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
    bevelSegments: 2,
    curveSegments: 4,
  })
  return g.rotateX(-Math.PI / 2).translate(0, b, 0)
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
export function tint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color)
  const a = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i)
  return g.setAttribute('color', new THREE.BufferAttribute(a, 3))
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
