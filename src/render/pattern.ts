import * as THREE from 'three'
import { KERB, PAVEMENT } from './blocks'

/**
 * Surface pattern (#174): siding, windows, tile rows and paving joints drawn on canvas and laid over the scenery's shared
 * soft-lit material, on top of its vertex colours. It costs no triangles and no material of its own: a part carries
 * which pattern it wears and where on it each vertex lies, in two vertex attributes, and `solid` samples one array
 * texture for every pattern. A pattern's red is a shade over the paint (half is none), its green the glass of a window,
 * which takes a glass's colour by day and lights at night as the windows do (the lit mask), and its blue a pale trim.
 */

/** What a face can wear: 0 for nothing. Each is a layer of the texture but `back`, a ground floor's back wall, which draws `wall` with a door in its middle bay. */
export const PATTERN = {
  /** Paving joints, in m on the map over `REPEAT.paving`. */
  paving: 1,
  /** A flat roof's tile rows inside a parapet, in m from its corner, with its size. */
  roof: 2,
  /** An upper storey's siding and a window in every bay. */
  storey: 3,
  /** A ground floor's panels and a high window in every bay. */
  wall: 4,
  /** `wall` with a service door in its middle bay. */
  back: 5,
  /** Coloured paving (#175): bricks in a basket weave, in m on the map over `REPEAT.paving`. */
  bricks: 6,
} as const
export type Pattern = (typeof PATTERN)[keyof typeof PATTERN]
const DOOR = 4 // the layer of `back`'s middle bay

/** m of the map or a roof that one repeat of the paving's or the roof's pattern covers. */
const REPEAT = { paving: 2.4, roof: 2 }
/**
 * A flat roof: m from its edge to its parapet's inner face, and to the end of the shadow the parapet throws in; how
 * much paler the parapet is, how much darker the shadow, and how much darker and greyer the roof inside, so that a roof
 * reads as a roof from the whole City framed.
 */
const PARAPET = { wide: 0.45, shadow: 0.7, pale: 1.12, lee: 0.3, inside: 0.9, grey: 0.15 }
/** The share of a pattern's windows lit at night, as the kit's panes are; the rest stay dark. */
const LIT = 0.7
const SIZE = 128 // texels on a layer's side
// Glass by day, as the kit's glass and its tints: the glass, a paler and a darker one, and a window left dark. The
// trim round windows and doors.
const GLASS = ['#b4d6e3', '#9cc7df', '#7aa9c9', '#56738a']
const TRIM = '#fbf8f2'
const WINDOW_LIGHT = '#ffc78a' // as the kit's glass glows

/** The faces of a box in its own frame (its front -z, as the kit's shapes face) and the pattern each wears; m a bay and a storey take. */
export interface Cladding {
  top?: Pattern
  front?: Pattern
  back?: Pattern
  sides?: Pattern
  bay?: number
  storey?: number
}

/**
 * Lay `cladding` over a non-indexed geometry in its own frame, before it is placed. Each triangle wears the pattern of
 * the face it looks out of. A wall's pattern runs in bays and storeys, as many whole bays as fit its width, so that no
 * window is cut at a corner; a roof's in m from its corner, with its size. `seed` (0 to 1) picks which windows light.
 */
export function clad(geo: THREE.BufferGeometry, cladding: Cladding, seed: number): THREE.BufferGeometry {
  const pos = geo.attributes.position
  geo.computeBoundingBox()
  const { min, max } = geo.boundingBox!
  const [w, h, d] = [max.x - min.x, max.y - min.y, max.z - min.z]
  const { bay = 3, storey = h } = cladding
  const uv = new Float32Array(pos.count * 2)
  const worn = new Float32Array(pos.count * 3)
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const tag = 0.1 + 0.8 * seed // kept clear of the whole numbers, which say the pattern
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1).sub(a)
    c.fromBufferAttribute(pos, i + 2).sub(a)
    const n = b.cross(c).normalize() // the triangle's normal
    const [top, endOn] = [n.y > 0.5, Math.abs(n.z) >= Math.abs(n.x)] // a wall facing ∓z, or one facing ±x
    const kind = top ? cladding.top : n.y < -0.5 ? undefined : endOn ? (n.z < 0 ? cladding.front : cladding.back) : cladding.sides
    if (!kind) continue
    const across = endOn ? w : d
    const bays = Math.max(1, Math.round(across / bay))
    for (let k = i; k < i + 3; k++) {
      const [x, y, z] = [pos.getX(k) - min.x, pos.getY(k) - min.y, pos.getZ(k) - min.z]
      uv.set(top ? [x, z] : [((endOn ? x : z) / across) * bays, y / storey], 2 * k)
      worn.set(top ? [kind + tag, w, d] : [kind + tag, bays, h / storey], 3 * k)
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo.setAttribute('pattern', new THREE.BufferAttribute(worn, 3))
}

/**
 * Lay paving joints, or `kind`'s other paving, over the faces of a geometry in place (Three coordinates) that look up, in
 * m on the map.
 */
export function pave(geo: THREE.BufferGeometry, kind: Pattern = PATTERN.paving): THREE.BufferGeometry {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  const worn = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    if (nor.getY(i) < 0.9) continue
    uv.set([pos.getX(i) / REPEAT.paving, -pos.getZ(i) / REPEAT.paving], 2 * i)
    worn[3 * i] = kind + 0.5
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geo.setAttribute('pattern', new THREE.BufferAttribute(worn, 3))
}

/** A pseudo-random stream for drawing the layers, so that they draw alike every time. */
function stream(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/**
 * The layers, drawn on a canvas each: x across a bay (or a repeat) and y up it, y = 0 at the canvas's foot. Each fill
 * is `[shade, glass, trim]`, 128 being no shade.
 */
function drawLayers(): ((g: CanvasRenderingContext2D) => void)[] {
  const S = SIZE
  const fill = (g: CanvasRenderingContext2D, [r, gl, b]: number[], x: number, y: number, w: number, h: number) => {
    g.fillStyle = `rgb(${r},${gl},${b})`
    g.fillRect(x, S - y - h, w, h)
  }
  const plain = (g: CanvasRenderingContext2D) => fill(g, [128, 0, 0], 0, 0, S, S)
  /** A ground floor's wall: panels 0.75 m wide, a plinth and a line under the eaves. */
  const wall = (g: CanvasRenderingContext2D) => {
    plain(g)
    for (let x = 0; x < S; x += S / 4) fill(g, [112, 0, 0], x, 0, 2, S)
    fill(g, [100, 0, 0], 0, 0, S, 8)
    fill(g, [110, 0, 0], 0, S - 8, S, 3)
  }
  /** A window `w` by `h` texels, its foot `y` up, centred across the layer: a pale frame, two sliding panes and a sill. */
  const window = (g: CanvasRenderingContext2D, w: number, h: number, y: number, frame: number) => {
    const x = (S - w) / 2
    fill(g, [128, 0, 255], x - frame, y - frame, w + 2 * frame, h + 2 * frame)
    fill(g, [128, 255, 0], x, y, w, h)
    fill(g, [96, 255, 0], x, y + h - Math.ceil(h * 0.1), w, Math.ceil(h * 0.1)) // the head's shadow
    fill(g, [128, 0, 255], S / 2 - 1.5, y, 3, h) // where the panes meet
    fill(g, [128, 0, 255], x - frame - 3, y - frame - 3, w + 2 * frame + 6, 3) // the sill
    fill(g, [92, 0, 0], x - frame - 3, y - frame - 6, w + 2 * frame + 6, 3) // its shadow
  }
  return [
    // Paving: 0.6 m slabs in a running bond, each a shade of its own, with darker joints, dark enough to read from
    // Street (#175).
    (g) => {
      const draw = stream(7)
      plain(g)
      const t = S / 4
      for (let row = 0; row < 4; row++) {
        for (let k = -1; k < 4; k++) {
          const x = k * t + (row % 2) * (t / 2)
          fill(g, [88, 0, 0], x, row * t, t, t)
          fill(g, [Math.round(116 + draw() * 22), 0, 0], x + 1.5, row * t + 1.5, t - 3, t - 3)
        }
      }
    },
    // A roof's tiles: rows 0.5 m deep, each lit along its upper edge and shaded along its lower, the tiles in a bond.
    (g) => {
      const t = S / 4
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < t; k++) fill(g, [Math.round(118 + (20 * k) / t), 0, 0], 0, row * t + k, S, 1)
        fill(g, [100, 0, 0], 0, row * t, S, 2)
        for (let x = (row % 2) * (t / 2); x < S; x += t) fill(g, [108, 0, 0], x, row * t, 2, t)
      }
    },
    // An upper storey: siding boards, a floor line at its foot, and a window 1.3 m wide and 1.4 m tall, 0.9 m up.
    (g) => {
      plain(g)
      for (let y = 6; y < S; y += 10) fill(g, [114, 0, 0], 0, y, S, 1)
      fill(g, [100, 0, 0], 0, 0, S, 4)
      window(g, 56, 58, 37, 5)
    },
    // A ground floor's wall and a high window 0.9 m wide.
    (g) => {
      wall(g)
      window(g, 30, 20, 80, 3)
    },
    // Its middle bay at the back: a service door with a lit pane in it, under a little hood.
    (g) => {
      wall(g)
      const [w, h] = [34, 72]
      const x = (S - w) / 2
      fill(g, [128, 0, 255], x - 3, 8, w + 6, h + 3)
      fill(g, [80, 0, 0], x, 8, w, h)
      fill(g, [64, 0, 0], x + w / 2 - 1, 8, 2, h)
      fill(g, [128, 255, 0], x + 6, 8 + h - 26, w - 12, 18)
      fill(g, [128, 0, 255], x - 7, 8 + h + 5, w + 14, 4)
      fill(g, [88, 0, 0], x - 7, 8 + h + 1, w + 14, 4)
    },
    // Coloured paving (#175): 0.3 m squares of two bricks each, turned a quarter from square to square, every brick a
    // shade of its own, with darker joints.
    (g) => {
      const draw = stream(11)
      const t = S / 8
      for (let row = 0; row < 8; row++) {
        for (let k = 0; k < 8; k++) {
          fill(g, [84, 0, 0], k * t, row * t, t, t)
          for (const half of [0, 1]) {
            const shade = [Math.round(112 + draw() * 30), 0, 0]
            if ((row + k) % 2) fill(g, shade, k * t + 1, row * t + half * (t / 2) + 1, t - 2, t / 2 - 2)
            else fill(g, shade, k * t + half * (t / 2) + 1, row * t + 1, t / 2 - 2, t - 2)
          }
        }
      }
    },
  ]
}

/** The patterns, one layer each, mipmapped and repeating, as data: no colour space. */
function createPatternMap(): THREE.DataArrayTexture {
  const layers = drawLayers()
  const data = new Uint8Array(SIZE * SIZE * 4 * layers.length)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  layers.forEach((draw, i) => {
    g.clearRect(0, 0, SIZE, SIZE)
    draw(g)
    const pixels = g.getImageData(0, 0, SIZE, SIZE).data
    // Rows from the canvas's foot up, so that a layer's y runs up its face.
    for (let row = 0; row < SIZE; row++) {
      const from = (SIZE - 1 - row) * SIZE * 4
      data.set(pixels.subarray(from, from + SIZE * 4), (i * SIZE + row) * SIZE * 4)
    }
  })
  const map = new THREE.DataArrayTexture(data, SIZE, SIZE, layers.length)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.anisotropy = 8
  map.needsUpdate = true
  return map
}

const vec3 = (colour: THREE.ColorRepresentation) => {
  const c = new THREE.Color(colour)
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
}
const f = (n: number) => n.toFixed(4)

/**
 * The surface pattern for a material: the patch that lays it over the material's vertex colours, and `light`, the
 * windows' glow, for the lit mask. Patch `solid` with it before anything copies it, as the Stage Inspector does.
 */
export function createPatterns() {
  const uniforms = {
    patternMap: { value: createPatternMap() },
    patternLight: { value: new THREE.Color(0, 0, 0) },
  }
  const warm = new THREE.Color(WINDOW_LIGHT)
  return {
    patch(shader: THREE.WebGLProgramParametersWithUniforms) {
      Object.assign(shader.uniforms, uniforms)
      // Every Block's pavement wears paving joints (#176): its top, facing up at the kerb's height in the pavement's
      // colour, is picked out here, so that no build carries a pattern for it and a Zone that wears none carries none.
      const pavement = new THREE.Color(PAVEMENT)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 pattern;\nvarying vec3 vPattern;\nvarying vec2 vPatternAt;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
\tvPattern = pattern;
\tvPatternAt = uv;
\tif (pattern.x < 0.5 && normal.y > 0.99 && abs(position.y - ${f(KERB)}) < 0.004 && all(lessThan(abs(color.rgb - ${vec3(pavement)}), vec3(0.003)))) {
\t\tvPattern = vec3(${f(PATTERN.paving + 0.5)}, 0.0, 0.0);
\t\tvPatternAt = vec2(position.x, -position.z) / ${f(REPEAT.paving)};
\t}`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform highp sampler2DArray patternMap;
uniform vec3 patternLight;
// Smooth, not flat: every vertex of a triangle carries the same pattern, and a flat varying makes ANGLE on Metal
// rework every draw for GL's provoking vertex, 0.4 ms a frame on the 26-Tile City.
varying vec3 vPattern;
varying vec2 vPatternAt;
float patternHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
float patternKind = floor(vPattern.x);
float patternGlass = 0.0;
float patternLit = 0.0;
// Derivatives before the branch: a face's neighbour may wear no pattern. A roof's m in from its nearest edge.
vec2 patternAt = patternKind == ${f(PATTERN.roof)} ? vPatternAt / ${f(REPEAT.roof)} : vPatternAt;
vec2 patternDx = dFdx(patternAt);
vec2 patternDy = dFdy(patternAt);
float patternEdge = min(min(vPatternAt.x, vPattern.y - vPatternAt.x), min(vPatternAt.y, vPattern.z - vPatternAt.y));
float patternAa = fwidth(patternEdge);
if (patternKind > 0.5) {
  float layer = patternKind - 1.0;
  if (patternKind == ${f(PATTERN.back)}) layer = floor(patternAt.x) == floor(floor(vPattern.y + 0.5) * 0.5) ? ${f(DOOR)} : ${f(PATTERN.wall - 1)};
  vec3 worn = textureGrad(patternMap, vec3(patternAt, layer), patternDx, patternDy).rgb;
  float shade = worn.r * 2.0;
  if (patternKind == ${f(PATTERN.roof)}) {
    // The parapet: a pale rim round the roof, and the shadow it throws in.
    float edge = patternEdge;
    float aa = patternAa;
    float rim = 1.0 - smoothstep(${f(PARAPET.wide)} - aa, ${f(PARAPET.wide)} + aa, edge);
    float lee = 1.0 - smoothstep(${f(PARAPET.shadow)} - aa, ${f(PARAPET.shadow)} + aa, edge) - rim;
    float grey = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(grey), ${f(PARAPET.grey)}), diffuseColor.rgb, rim);
    shade = mix(shade * ${f(PARAPET.inside)}, ${f(PARAPET.pale)}, rim) * (1.0 - ${f(PARAPET.lee)} * lee);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(TRIM)}, worn.b);
  float h = patternHash(vec3(floor(patternAt), fract(vPattern.x) * 97.0));
  vec3 glass = h < ${f(LIT)} ? (h < ${f(LIT / 3)} ? ${vec3(GLASS[0])} : h < ${f((2 * LIT) / 3)} ? ${vec3(GLASS[1])} : ${vec3(GLASS[2])}) : ${vec3(GLASS[3])};
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, worn.g) * shade;
  patternGlass = worn.g;
  patternLit = worn.g * (h < ${f(LIT)} ? (h < ${f((2 * LIT) / 3)} ? 1.0 : 0.45) : 0.0);
}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, patternGlass);',
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += patternLight * patternLit;')
    },
    /** Light the windows of the patterns as brightly as the kit's glass lights its own. */
    setGlow(windows: number) {
      uniforms.patternLight.value.copy(warm).multiplyScalar(windows)
    },
  }
}
