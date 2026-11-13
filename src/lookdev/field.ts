import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import type { Lane, Network } from '../sim/network'
import type { Building, Tree } from './block'

// Ground bake: one RGBA half-float texture over the level, painted by a single shader.
//   R  signed distance to the road edge, metres (negative on the road)
//   G  1 on islands (off-road areas the map border can't reach) and 2 m around them
//   B  signed distance to the grass polygons, metres
//   A  contact AO under buildings and trees, 0..1

const RES = 0.5 // m per texel
const MARGIN = 20 // m of field past the outermost lane point
const EXTEND = 60 // m: arms run on past their last point, so roads leave the field instead of ending in a cap
const FILLET = 5 // m: closing radius that rounds junction mouths (≈ 1.5 lane widths)
const REACH = 12 // m past the lane edge where the exact distance is kept
const BIAS = 0.3 // m: the closed, grid-quantised shape only wins where it adds road
const INF = 1e20

export const BIKE = 1.6 // m of teal bike band outside the road edge
export const CURB = 0.35 // m of kerb outside the bike band (or the road edge, on islands)
const LINE = 0.2 // m: white edge line inside the road edge
const WALK = 2.5 // m of pale verge between the kerb and grass

export interface Field {
  texture: THREE.DataTexture
  min: Vec
  size: Vec
}

/** Squared 1D distance transform (Felzenszwalb–Huttenlocher), f → d. */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) ** 2 + f[v[k]]
  }
}

/** Metres from each texel centre to the nearest texel where `mask` is set. */
function edt(mask: ArrayLike<number>, W: number, H: number): Float32Array {
  const n = Math.max(W, H)
  const [f, d, z] = [new Float64Array(n), new Float64Array(n), new Float64Array(n + 1)]
  const v = new Int32Array(n)
  const g = new Float64Array(W * H)
  for (let i = 0; i < W * H; i++) g[i] = mask[i] ? 0 : INF
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x]
    edt1d(f, H, d, v, z)
    for (let y = 0; y < H; y++) g[y * W + x] = d[y]
  }
  const out = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x]
    edt1d(f, W, d, v, z)
    for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]) * RES
  }
  return out
}

/** Signed distance to a mask's boundary (negative inside), corrected for the half-texel between centres and edge. */
function signed(mask: Uint8Array, W: number, H: number): Float32Array {
  const out = edt(mask, W, H)
  const inv = edt(
    mask.map((m) => 1 - m),
    W,
    H,
  )
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? RES / 2 - inv[i] : out[i] - RES / 2
  return out
}

/** Separable box blur in place, clamped at the borders. Three passes ≈ Gaussian. */
function blur(a: Float32Array, W: number, H: number, r: number, passes: number) {
  const tmp = new Float32Array(Math.max(W, H))
  const line = (off: number, stride: number, n: number) => {
    const at = (i: number) => a[off + Math.min(n - 1, Math.max(0, i)) * stride]
    let sum = 0
    for (let i = -r; i <= r; i++) sum += at(i)
    for (let i = 0; i < n; i++) {
      tmp[i] = sum / (2 * r + 1)
      sum += at(i + r + 1) - at(i - r)
    }
    for (let i = 0; i < n; i++) a[off + i * stride] = tmp[i]
  }
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) line(y * W, 1, W)
    for (let x = 0; x < W; x++) line(x, W, H)
  }
}

const inside = (x: number, y: number, poly: Vec[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Lane centreline, with Gateway Roads extended outward past the network boundary. */
function lanePts(l: Lane, fromGateway: Set<Lane>): Vec[] {
  const p = l.line.pts
  const ext = (a: Vec, b: Vec) => {
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    return { x: a.x + ((a.x - b.x) / d) * EXTEND, y: a.y + ((a.y - b.y) / d) * EXTEND }
  }
  if (fromGateway.has(l)) return [ext(p[0], p[1]), ...p]
  if (l.toGateway) return [...p, ext(p[p.length - 1], p[p.length - 2])]
  return p
}

/** Bake the road surface from lane centrelines (every lane, including all candidate connections) plus the block props. */
export function bakeField(net: Network, laneWidth: number, block: { grass: Vec[][]; buildings: Building[]; trees: Tree[] }): Field {
  const r = laneWidth / 2
  const all = net.lanes.flatMap((l) => l.line.pts)
  const x0 = Math.min(...all.map((p) => p.x)) - MARGIN
  const y0 = Math.min(...all.map((p) => p.y)) - MARGIN
  const W = Math.ceil((Math.max(...all.map((p) => p.x)) + MARGIN - x0) / RES)
  const H = Math.ceil((Math.max(...all.map((p) => p.y)) + MARGIN - y0) / RES)
  const N = W * H
  const cx = (i: number) => x0 + (i + 0.5) * RES
  const cy = (j: number) => y0 + (j + 0.5) * RES
  const span = (lo: number, hi: number, o: number, n: number) => [
    Math.max(0, Math.floor((lo - o) / RES)),
    Math.min(n - 1, Math.ceil((hi - o) / RES)),
  ]

  // 1. Exact distance to the nearest lane centreline, near the lanes.
  const dmin = new Float32Array(N).fill(INF)
  const reach = r + Math.max(FILLET, REACH)
  const fromGateway = new Set(Object.values(net.gateways).flatMap((arm) => arm.approach))
  for (const lane of net.lanes) {
    const p = lanePts(lane, fromGateway)
    for (let k = 1; k < p.length; k++) {
      const [a, b] = [p[k - 1], p[k]]
      const [dx, dy] = [b.x - a.x, b.y - a.y]
      const len2 = dx * dx + dy * dy || 1e-9
      const [i0, i1] = span(Math.min(a.x, b.x) - reach, Math.max(a.x, b.x) + reach, x0, W)
      const [j0, j1] = span(Math.min(a.y, b.y) - reach, Math.max(a.y, b.y) + reach, y0, H)
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const [px, py] = [cx(i) - a.x, cy(j) - a.y]
          const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
          const d = Math.hypot(px - t * dx, py - t * dy)
          if (d < dmin[j * W + i]) dmin[j * W + i] = d
        }
      }
    }
  }

  // 2. Morphological close (dilate, then erode by FILLET): rounds junction mouths, fills slivers between lanes.
  //    The closed shape is grid-quantised, so it is lightly blurred and only used where it adds road.
  const toOutside = edt(
    dmin.map((d) => (d - r > FILLET ? 1 : 0)),
    W,
    H,
  )
  const closed = new Uint8Array(N)
  for (let i = 0; i < N; i++) closed[i] = toOutside[i] - RES / 2 > FILLET ? 1 : 0
  const sdClosed = signed(closed, W, H)
  blur(sdClosed, W, H, 1, 2)
  const sd = new Float32Array(N)
  for (let i = 0; i < N; i++) sd[i] = Math.min(dmin[i] - r, sdClosed[i] + BIAS)

  // 3. Islands: flood-fill the off-road area from the border; whatever stays unreached is an island.
  const reached = new Uint8Array(N)
  const stack = new Int32Array(N)
  let top = 0
  const visit = (i: number) => {
    if (!reached[i] && sd[i] > 0) {
      reached[i] = 1
      stack[top++] = i
    }
  }
  for (let i = 0; i < W; i++) (visit(i), visit((H - 1) * W + i))
  for (let j = 0; j < H; j++) (visit(j * W), visit(j * W + W - 1))
  while (top) {
    const i = stack[--top]
    const x = i % W
    if (x > 0) visit(i - 1)
    if (x < W - 1) visit(i + 1)
    if (i >= W) visit(i - W)
    if (i < N - W) visit(i + W)
  }
  const island = new Uint8Array(N)
  for (let i = 0; i < N; i++) island[i] = sd[i] > 0 && !reached[i] ? 1 : 0
  const toIsland = edt(island, W, H)

  // 4. Grass.
  const fill = (poly: Vec[], set: (i: number) => void) => {
    const [i0, i1] = span(Math.min(...poly.map((p) => p.x)), Math.max(...poly.map((p) => p.x)), x0, W)
    const [j0, j1] = span(Math.min(...poly.map((p) => p.y)), Math.max(...poly.map((p) => p.y)), y0, H)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inside(cx(i), cy(j), poly)) set(j * W + i)
  }
  const lawn = new Uint8Array(N)
  for (const poly of block.grass) fill(poly, (i) => (lawn[i] = 1))
  const gd = signed(lawn, W, H)

  // 5. Contact AO: building footprints and tree discs, blurred into halos.
  const ao = new Float32Array(N)
  for (const b of block.buildings) fill(b.pts, (i) => (ao[i] = 1))
  for (const t of block.trees) {
    const rad = 2.2 * t.s
    const [i0, i1] = span(t.x - rad, t.x + rad, x0, W)
    const [j0, j1] = span(t.y - rad, t.y + rad, y0, H)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) if (Math.hypot(cx(i) - t.x, cy(j) - t.y) < rad) ao[j * W + i] = Math.max(ao[j * W + i], 0.7)
  }
  blur(ao, W, H, 4, 3)

  const half = THREE.DataUtils.toHalfFloat
  const clamp = (v: number) => Math.max(-500, Math.min(500, v))
  const data = new Uint16Array(N * 4)
  for (let i = 0; i < N; i++) {
    data[i * 4] = half(clamp(sd[i]))
    data[i * 4 + 1] = half(toIsland[i] <= 2 ? 1 : 0)
    data[i * 4 + 2] = half(clamp(gd[i]))
    data[i * 4 + 3] = half(ao[i])
  }
  const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType)
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return { texture, min: { x: x0, y: y0 }, size: { x: W * RES, y: H * RES } }
}

// Palette sampled from the reference, then tuned by eye.
export const PALETTE = {
  ground: 0xf4f3ed,
  road: 0x8d9394,
  line: 0xe6e6e6,
  bike: 0x6c9d93,
  curb: 0xd9dbd9,
  grass: 0xb8e18a,
  verge: 0xe8f3dc,
  plaza: 0xe7e6e1,
}

const vertexShader = /* glsl */ `
  varying vec2 vSim;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vSim = vec2(world.x, -world.z);
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D field;
  uniform vec2 fieldMin;
  uniform vec2 fieldSize;
  uniform vec3 cGround, cRoad, cLine, cBike, cCurb, cGrass, cVerge;
  varying vec2 vSim;
  #include <fog_pars_fragment>

  // 1 below the edge, 0 above, antialiased over one screen pixel.
  float under(float edge, float x) {
    float w = fwidth(x) * 0.75 + 1e-3;
    return 1.0 - smoothstep(edge - w, edge + w, x);
  }

  void main() {
    vec2 uv = (vSim - fieldMin) / fieldSize;
    vec4 f = texture2D(field, clamp(uv, 0.0, 1.0));
    float sd = f.r, island = f.g, gd = f.b, ao = f.a;
    float kerb = mix(BIKE + CURB, CURB, island);

    float lawn = under(0.0, gd) * (1.0 - island);
    vec3 col = mix(cGround, cVerge, lawn);
    col = mix(col, cGrass, lawn * under(0.0, kerb + WALK - sd));
    col *= 1.0 - 0.12 * (1.0 - smoothstep(kerb, kerb + 2.0, sd)) - 0.3 * ao;
    col = mix(col, cCurb, under(kerb, sd));
    col = mix(col, cBike, under(BIKE, sd) * (1.0 - island));
    col = mix(col, cLine, under(0.0, sd));
    col = mix(col, cRoad, under(-LINE, sd));

    vec2 e = min(uv, 1.0 - uv) * fieldSize;
    col = mix(cGround, col, smoothstep(0.0, 25.0, min(e.x, e.y)));

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/** Unlit ground material that paints road, bike band, kerb, verge, grass and AO from the baked field. */
export function groundMaterial(field: Field): THREE.ShaderMaterial {
  const c = (hex: number) => ({ value: new THREE.Color(hex) })
  return new THREE.ShaderMaterial({
    fog: true,
    defines: { BIKE: BIKE.toFixed(2), CURB: CURB.toFixed(2), LINE: LINE.toFixed(2), WALK: WALK.toFixed(2) },
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      field: { value: field.texture },
      fieldMin: { value: new THREE.Vector2(field.min.x, field.min.y) },
      fieldSize: { value: new THREE.Vector2(field.size.x, field.size.y) },
      cGround: c(PALETTE.ground),
      cRoad: c(PALETTE.road),
      cLine: c(PALETTE.line),
      cBike: c(PALETTE.bike),
      cCurb: c(PALETTE.curb),
      cGrass: c(PALETTE.grass),
      cVerge: c(PALETTE.verge),
    },
    vertexShader,
    fragmentShader,
  })
}
