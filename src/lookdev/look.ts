// PROTOTYPE (issue #16): anime / cel-shaded blend over the Apple Maps look. Throwaway.
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { PALETTE } from './field'

const CAR_COLORS = [0x8ecae6, 0xffb4a2, 0xb5e48c, 0xffd166, 0xcdb4db, 0xa0c4ff].map((c) => new THREE.Color(c))

/** The switches being judged. All off with palette 0 is the look-dev (Maps) baseline. */
export interface Look {
  toon: boolean
  /** Inverted-hull outlines. Ignored while `ink` is on. */
  outline: boolean
  shadow: boolean
  /** Full-screen wobbly ink lines, ground wash, kerb ink and windows. */
  ink: boolean
  /** Japanese street detail: houses, poles and wires, sakura, torii, road paint. */
  japan: boolean
  /** Painterly filter, fluffy trees, pastel walls, soft shadows, ground wash and flowers. */
  paint: boolean
  /** Map furniture: route line, destination pin, street names. */
  nav: boolean
  /** Orthographic camera at an isometric angle. */
  iso: boolean
  /** 0 Maps, 1 warm, 2 muted single-family, 3 golden hour. */
  pal: 0 | 1 | 2 | 3
}

const MAPS = {
  ...PALETTE,
  wall: 0xd5d8dd,
  roofs: [0xd5d8dd],
  leaf: 0xb3cc98,
  pine: 0xa3c193,
  bark: 0x978f7f,
  cars: CAR_COLORS,
  sky: 0xffffff,
  bounce: 0xcfcbc3,
  hemi: 2.6,
  sun: 0xffffff,
  sunPower: 1.0,
  sunDir: [-0.6, 1, 0.4],
  shade: 0x555555,
  ink: 0x777777,
  inkLine: 0x4a4f55,
  glass: 0x9aa3ad,
}

const WARM: typeof MAPS = {
  ground: 0xfaf1e0,
  road: 0x8c8c9b,
  line: 0xfffaf0,
  bike: 0x5fb3a6,
  curb: 0xeadbc8,
  grass: 0x9ad873,
  verge: 0xdff0c4,
  plaza: 0xf0e0c8,
  wall: 0xf7ead8,
  roofs: [0xdb7f66, 0x6fb3aa, 0xe6b85c, 0x8aa0cc, 0xd994a6],
  leaf: 0x8ed276,
  pine: 0x62b08a,
  bark: 0x9a7458,
  cars: [0x4fb4ea, 0xff8670, 0x86d65e, 0xffc23d, 0xb590e6, 0x6a94ff].map((c) => new THREE.Color(c)),
  sky: 0xd9d2ff, // violet ambient: whatever the sun misses goes cool
  bounce: 0xc4b8ee,
  hemi: 1.9,
  sun: 0xffedc8,
  sunPower: 1.7,
  sunDir: [-0.75, 0.7, 0.35], // late afternoon
  shade: 0x4a3c8c,
  ink: 0x6b5a80,
  inkLine: 0x4a3a5c,
  glass: 0x5a5f8a,
}

// One sage-teal family for the world; saturated accents are kept for traffic.
const MUTED: typeof MAPS = {
  ground: 0xdfe8d8,
  road: 0x6f8a8c,
  line: 0xf2f4ea,
  bike: 0xa8d5c2,
  curb: 0xc3d0c0,
  grass: 0x8fbf8a,
  verge: 0xb9d6ae,
  plaza: 0xd0dac8,
  wall: 0xcfd5c6,
  roofs: [0xd8877a, 0x7fb7a8, 0xe2b65e, 0xb9bfae, 0xe3a9a0],
  leaf: 0x5f9c78,
  pine: 0x4a8372,
  bark: 0x6b5a55,
  cars: [0xe0564c, 0xf0a13a, 0xf5c4bb, 0xf6f2e2, 0xf2d05c, 0x8fd3e3].map((c) => new THREE.Color(c)),
  sky: 0xcfe6e0,
  bounce: 0xb8d4cc,
  hemi: 2.2,
  sun: 0xfff6e0,
  sunPower: 1.3,
  sunDir: [-0.75, 0.7, 0.35],
  shade: 0x2f5560,
  ink: 0x5a7a78,
  inkLine: 0x1f3b3d,
  glass: 0x2c3e4a,
}

// Golden hour: Maps structure (warm white, grey road, soft greens), low warm sun, cool sky fill.
const GOLDEN: typeof MAPS = {
  ground: 0xf6efdc,
  road: 0x858893,
  line: 0xfffdf5,
  bike: 0x86c5b8,
  curb: 0xe9e2d2,
  grass: 0x9fd67e,
  verge: 0xdcefc0,
  plaza: 0xefe3cc,
  wall: 0xfbf0df,
  roofs: [0xd9785a, 0xe08a63, 0xc96a4f, 0x7fb6c9, 0xe6b86a],
  leaf: 0x7ecb63,
  pine: 0x4f9e74,
  bark: 0x8a6548,
  cars: [0x5fb7ee, 0xff8d73, 0xffd257, 0xfff6e6, 0xb79be8, 0x7ed6a6].map((c) => new THREE.Color(c)),
  sky: 0xcfdcff,
  bounce: 0xe8d8c0,
  hemi: 1.7,
  sun: 0xffdca8,
  sunPower: 2.2,
  sunDir: [-0.85, 0.5, 0.3],
  shade: 0x5a5a9a,
  ink: 0x7a6a70,
  inkLine: 0x5a4a4a,
  glass: 0x6f8fb0,
}

/** Wall colours for painted buildings and houses. */
export const PASTELS = [0xfbf0df, 0xf7d9d0, 0xf8ecc0, 0xd9e8f2, 0xfdfaf2, 0xe3efd6]

export type Colors = typeof MAPS
export const colors = (look: Look): Colors => [MAPS, WARM, MUTED, GOLDEN][look.pal]

// Two hard bands: faces turned away from the sun get ambient only.
const bands = new THREE.DataTexture(new Uint8Array([0, 0, 255, 255]), 4, 1, THREE.RedFormat)
bands.minFilter = bands.magFilter = THREE.NearestFilter
bands.needsUpdate = true

// Painted look: a half-tone step between shade and light softens the terminator.
const bands3 = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0, 140, 255, 255, 255]), 8, 1, THREE.RedFormat)
bands3.minFilter = bands3.magFilter = THREE.NearestFilter
bands3.needsUpdate = true

/** Lit prop material: Lambert for the Maps look, banded toon for the anime looks. */
export const lit = (look: Look, opts: { color?: number; vertexColors?: boolean } = {}): THREE.Material =>
  look.toon ? new THREE.MeshToonMaterial({ ...opts, gradientMap: look.paint ? bands3 : bands }) : new THREE.MeshLambertMaterial(opts)

/** Outline width in metres, set each frame from the camera distance so it stays about 1.5 px on screen. */
export const inkWidth = { value: 0.2 }

/** Inverted hull: back faces pushed out along the normal, drawn in a dark tint of the fill. */
export function inkMaterial(tint: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ color: tint, side: THREE.BackSide })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.inkWidth = inkWidth
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float inkWidth;\nvoid main() {')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * inkWidth;')
  }
  return mat
}

/** Position-only copy with averaged normals, so hard-edged boxes don't split at the corners when pushed out. */
export function hull(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', geo.attributes.position.clone())
  if (geo.index) g.setIndex(geo.index.clone())
  const merged = mergeVertices(g, 1e-3)
  merged.computeVertexNormals()
  return merged
}
