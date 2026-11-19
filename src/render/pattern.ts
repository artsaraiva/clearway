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
  /**
   * An office tower's curtain wall (#177): panes of the wall's own glass, two to a bay, a line at every floor over a
   * darker spandrel, in three tones lighter toward the top, lit floor by floor at night.
   */
  curtain: 7,
  /** A flat office roof's deck (#177): square pavers, in m from its corner, with its size. */
  deck: 8,
  /** An office plaza (#177): granite slabs chequered in two tones, in m on the map over `REPEAT.paving`. */
  plaza: 9,
  /** A terraced house's storey on its back or a row's end (#178): plaster, and a framed window in every bay. */
  house: 10,
  /** `house` with a back door in the middle bay of its ground floor (#178). */
  rear: 11,
  /** A terraced house's front (#178): plaster and a line at each floor, round the windows and the door it is built with. */
  plaster: 12,
  /** A pitched roof's tile rows (#178), in m along its eaves and down from its ridge over `REPEAT.roof`: kawara in ribs. */
  tiles: 13,
  /** The gable end under a tiled roof (#178): pale boards. */
  gable: 14,
  /** An apartment block's flat roof (#178): sheets of roofing in strips, in m from its corner, with its size. */
  sheets: 15,
  /** Setts (#178): small stones in rows, in m on the map over `REPEAT.paving`, as an alley or a court is paved. */
  setts: 16,
  /**
   * A house's storey (#179): lap siding, and in every bay a framed window between two louvred shutters in a deeper
   * shade of the paint; a foundation along the foot of its ground floor and the shadow of the eaves along the top of its
   * top storey.
   */
  home: 17,
  /** A house's front (#179): `home`, but for the ground floor's middle bay where its bays are odd, where the door is built. */
  homeFront: 18,
  /** A house's pitched roof (#179): flat tiles in a running bond, in m along its eaves and down from its ridge over `REPEAT.roof`, under a darker ridge. */
  shingles: 19,
  /** A low garden wall (#179): concrete blocks in a running bond. */
  blocks: 20,
  /** A park's lawn (#180): mown in stripes of two tones, in m on the map over `REPEAT.lawn`. */
  lawn: 21,
  /** A park's path (#180): fine gravel, in m on the map over `REPEAT.paving`. */
  gravel: 22,
  /**
   * A plaza's radial paving (#180): rings of stones round its middle, as many to a ring as fit round it, each a shade of
   * its own, in m from the middle (`pave`'s `middle`).
   */
  radial: 23,
  /**
   * A shed's wall (#181), in bays of about 3 m and the whole wall a storey: steel sheet corrugated in ribs 0.2 m apart, a
   * concrete plinth along its foot, and a high strip of windows across every bay, lit at night as the windows are.
   */
  corrugated: 24,
  /** A shed's roof (#181): steel sheet in ribs 0.25 m apart down the slope, lapped every 2 m, in m along its eaves and down from its ridge over `REPEAT.roof`. */
  ribbed: 25,
  /** A loading yard's tarmac (#181): fine stone in the binder, in m on the map over `REPEAT.paving`. */
  tarmac: 26,
  /** Hazard stripes (#181): the paint and near-black in stripes 0.3 m wide at 45° on the map, in m over `REPEAT.paving`. */
  hazard: 27,
  /** A fence's mesh panel (#181), in bays of its posts and its height: wire in diamonds over the dark beyond, framed at top and foot. */
  mesh: 28,
  /** A tank's steel (#181), wrapped round it (`wrap`) in plates of about 2 m by 1.2 m, welded in courses whose seams stagger. */
  plates: 29,
  /**
   * A meadow's grass (#182): unmown, deeper and flecked with seed heads, with glades and a winding way mown paler
   * through it, in m on the map over `REPEAT.meadow`.
   */
  meadow: 30,
  /** Worked soil (#182): furrows 0.4 m apart running east–west, in m on the map over `REPEAT.paving`. */
  soil: 31,
} as const
export type Pattern = (typeof PATTERN)[keyof typeof PATTERN]
const DOOR = 4 // the layer of `back`'s middle bay
const REAR_DOOR = PATTERN.rear - 1 // the layer of `rear`'s middle bay on the ground floor (#178)
const DOORWAY = PATTERN.homeFront - 1 // the layer of `homeFront`'s middle bay on the ground floor, siding alone (#179)
/** A house's foundation and the shadow under its eaves (#179): the share of a storey each covers, and how much darker each is. */
const HOME = { footing: 0.075, eaves: 0.07, foot: 0.76, shadow: 0.3 }

/**
 * m of the map or a roof that one repeat of the paving's, the roof's, a lawn's or a meadow's pattern covers: a lawn's
 * two stripes, a meadow's glades.
 */
const REPEAT = { paving: 2.4, roof: 2, lawn: 4, meadow: 16 }
/** Radial paving (#180): m from one ring of stones to the next, and about how long each stone is round its ring. */
const RADIAL = { ring: 0.6, stone: 0.75 }
/**
 * A flat roof: m from its edge to its parapet's inner face, and to the end of the shadow the parapet throws in; how
 * much paler the parapet is, how much darker the shadow, and how much darker and greyer the roof inside, so that a roof
 * reads as a roof at City zoom.
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
/**
 * A curtain wall's glass (#177): the sky's colour it pales toward up a tower, as #130's floors did, as a share of the way
 * there at its foot and more for each third of its height; how much each pane's tone strays either way; how bright a lit
 * floor's panes glow, at least and at most, for the windows' glow, dimmed for a darker glass as the kit's glass dims
 * (with the square of its green beside the kit's glass's, `glass`) but never below `least` of it; and how dimly a dark
 * floor still shows.
 */
const CURTAIN = { sky: '#e9f4fb', foot: 0.06, third: 0.12, tone: 0.07, lit: [0.45, 0.85], glass: '#9cc7df', least: 0.35, dark: 0.03 }

/** The faces of a box in its own frame (its front -z, as the kit's shapes face) and the pattern each wears; m a bay and a storey take. */
export interface Cladding {
  top?: Pattern
  front?: Pattern
  back?: Pattern
  sides?: Pattern
  bay?: number
  storey?: number
  /**
   * The share of a curtain wall's floors lit at night (#177), which a face wearing `PATTERN.curtain` carries in its
   * pattern's second number, where another wall carries its bays: none lit unless given.
   */
  lit?: number
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
  const tag = 0.1 + 0.8 * seed // kept clear of the whole numbers, which say the pattern
  return wear(geo, (uv, worn) =>
    eachTriangle(geo, (n, i) => {
      const [top, endOn] = [n.y > 0.5, Math.abs(n.z) >= Math.abs(n.x)] // a wall facing ∓z, or one facing ±x
      const kind = top ? cladding.top : n.y < -0.5 ? undefined : endOn ? (n.z < 0 ? cladding.front : cladding.back) : cladding.sides
      if (!kind) return
      const across = endOn ? w : d
      const bays = Math.max(1, Math.round(across / bay))
      for (let k = i; k < i + 3; k++) {
        const [x, y, z] = [pos.getX(k) - min.x, pos.getY(k) - min.y, pos.getZ(k) - min.z]
        uv.set(top ? [x, z] : [((endOn ? x : z) / across) * bays, y / storey], 2 * k)
        // The pattern's second number: a roof's width, a curtain wall's lit share, another wall's bays.
        const second = top ? w : kind === PATTERN.curtain ? (cladding.lit ?? 0) : bays
        worn.set([kind + tag, second, top ? d : h / storey], 3 * k)
      }
    }),
  )
}

/** Call `fn` with each triangle of a non-indexed geometry: its normal, and the index of its first vertex. */
function eachTriangle(geo: THREE.BufferGeometry, fn: (n: THREE.Vector3, i: number) => void) {
  const pos = geo.attributes.position
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1).sub(a)
    c.fromBufferAttribute(pos, i + 2).sub(a)
    fn(b.cross(c).normalize(), i)
  }
}

/**
 * Lay a curtain wall (#177), or another wall's `kind` (#181), round the side of a cylinder (non-indexed, three's
 * `CylinderGeometry` with its own uv) before it is placed, as `clad` lays one up a box's faces: `around` m round and
 * `tall` m tall, in as many whole bays of about `bay` m as fit round it and storeys of `storey` m, `lit` of its floors
 * lit at night as `seed` (0 to 1) has them. Its caps wear nothing.
 */
export function wrap(
  geo: THREE.BufferGeometry,
  around: number,
  tall: number,
  bay: number,
  storey: number,
  lit: number,
  seed: number,
  kind: Pattern = PATTERN.curtain,
) {
  const [nor, at] = [geo.attributes.normal, geo.attributes.uv]
  const bays = Math.max(1, Math.round(around / bay))
  return wear(geo, (uv, worn) => {
    for (let i = 0; i < nor.count; i++) {
      if (Math.abs(nor.getY(i)) > 0.5) continue
      uv.set([at.getX(i) * bays, (at.getY(i) * tall) / storey], 2 * i)
      worn.set([kind + 0.1 + 0.8 * seed, kind === PATTERN.curtain ? lit : bays, tall / storey], 3 * i)
    }
  })
}

/**
 * Lay a roof's pattern `kind` (as an office roof's deck, #177) over a curved roof by its own uv, before it is placed:
 * three's sphere or cone, non-indexed, `around` pavers round it and `up` from its foot to its top, as a dome's panels
 * or a pointed cap's. `seed` (0 to 1) as `clad`'s.
 */
export function panel(geo: THREE.BufferGeometry, kind: Pattern, around: number, up: number, seed: number): THREE.BufferGeometry {
  const at = geo.attributes.uv
  return wear(geo, (uv, worn) => {
    for (let i = 0; i < at.count; i++) {
      uv.set([at.getX(i) * around, at.getY(i) * up], 2 * i)
      worn.set([kind + 0.1 + 0.8 * seed, around, up], 3 * i)
    }
  })
}

/**
 * Lay tile rows over a pitched roof (#178), a non-indexed gable or hip in its own frame before it is placed: each slope
 * wears `kind`, kawara (`PATTERN.tiles`) unless told, in m along its eaves and down from its ridge, the roof's top, so
 * that its rows run along the eaves and its ribs down the slope; each upright face, a gable end, wears `upright`,
 * `PATTERN.gable` unless told, as a shed's sawtooth wears its sheet up its steep faces too (#181). Its underside wears
 * nothing. `seed` (0 to 1) as `clad`'s.
 */
export function tile(
  geo: THREE.BufferGeometry,
  seed: number,
  kind: Pattern = PATTERN.tiles,
  upright: Pattern = PATTERN.gable,
): THREE.BufferGeometry {
  const pos = geo.attributes.position
  geo.computeBoundingBox()
  const top = geo.boundingBox!.max.y
  const tag = 0.1 + 0.8 * seed
  return wear(geo, (uv, worn) =>
    eachTriangle(geo, (n, i) => {
      if (n.y < -0.2) return
      const slope = n.y > 0.2
      // Along the eaves: square to the way the slope falls, or along an upright face.
      const [ax, az] = slope ? [-n.z, n.x] : Math.abs(n.z) >= Math.abs(n.x) ? [1, 0] : [0, 1]
      const len = Math.hypot(ax, az) || 1
      const fall = Math.sqrt(Math.max(0.05, 1 - n.y * n.y))
      for (let k = i; k < i + 3; k++) {
        const [x, y, z] = [pos.getX(k), pos.getY(k), pos.getZ(k)]
        const along = (x * ax + z * az) / len
        uv.set([along, slope ? (top - y) / fall : y], 2 * k)
        worn.set([(slope ? kind : upright) + tag, 0, 0], 3 * k)
      }
    }),
  )
}

/**
 * Lay paving joints, or `kind`'s other paving, over the faces of a geometry in place (Three coordinates) that look up, in
 * m on the map: radial paving (#180) in m from `middle`, a point on the map, which the shader turns into rings. With
 * `quarter` the pattern lies a quarter turn round (#184), as a field's furrows run north–south with its rows.
 */
export function pave(
  geo: THREE.BufferGeometry,
  kind: Pattern = PATTERN.paving,
  middle = { x: 0, y: 0 },
  quarter = false,
): THREE.BufferGeometry {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  const per = kind === PATTERN.lawn ? REPEAT.lawn : kind === PATTERN.meadow ? REPEAT.meadow : kind === PATTERN.radial ? 1 : REPEAT.paving
  return wear(geo, (uv, worn) => {
    for (let i = 0; i < pos.count; i++) {
      if (nor.getY(i) < 0.9) continue
      const [u, v] = [(pos.getX(i) - middle.x) / per, (-pos.getZ(i) - middle.y) / per]
      uv.set(quarter ? [v, u] : [u, v], 2 * i)
      worn[3 * i] = kind + 0.5
    }
  })
}

/**
 * Give a geometry the `uv` and `pattern` attributes the surface pattern reads, as `fill` writes them over zeros, which
 * wear none: two numbers a vertex for where it lies in its pattern, and three for the pattern, with its tag, and its
 * size. `fill` may read the geometry's own uv, which this then replaces.
 */
function wear(geo: THREE.BufferGeometry, fill: (uv: Float32Array, worn: Float32Array) => void): THREE.BufferGeometry {
  const n = geo.attributes.position.count
  const [uv, worn] = [new Float32Array(n * 2), new Float32Array(n * 3)]
  fill(uv, worn)
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
  /** A fine speckle over the whole layer, each `cell` texels square a shade between `lo` and `hi`, from `seed`. */
  const speckle = (g: CanvasRenderingContext2D, seed: number, lo: number, hi: number, cell: number) => {
    const draw = stream(seed)
    for (let y = 0; y < S; y += cell)
      for (let x = 0; x < S; x += cell) fill(g, [Math.round(lo + draw() * (hi - lo)), 0, 0], x, y, cell, cell)
  }
  /** A terraced house's plaster (#178): a fine speckle, a line at the floor and a lighter one over it. */
  const plaster = (g: CanvasRenderingContext2D, seed: number) => {
    speckle(g, seed, 122, 134, 4)
    fill(g, [102, 0, 0], 0, 0, S, 4)
    fill(g, [138, 0, 0], 0, 4, S, 2)
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
  /** Lap siding (#179): boards 8 texels deep, each shaded along its foot where the board above laps it and lit over that. */
  const siding = (g: CanvasRenderingContext2D) => {
    plain(g)
    for (let y = 0; y < S; y += 8) {
      fill(g, [104, 0, 0], 0, y, S, 1)
      fill(g, [136, 0, 0], 0, y + 1, S, 1)
    }
  }
  /**
   * A house's window (#179): `window`'s, `w` by `h` texels with its foot `y` up, between two louvred shutters `wide`
   * texels across, in a deeper shade of the paint than the siding, each slat lit along its top.
   */
  const shuttered = (g: CanvasRenderingContext2D, w: number, h: number, y: number, wide: number) => {
    const [frame, x] = [3, (S - w) / 2]
    for (const sx of [x - frame - wide, x + w + frame]) {
      fill(g, [86, 0, 0], sx, y - frame, wide, h + 2 * frame)
      for (let ly = y - frame + 2; ly + 3 <= y + h + frame - 2; ly += 3) {
        fill(g, [98, 0, 0], sx + 2, ly, wide - 4, 2)
        fill(g, [114, 0, 0], sx + 2, ly + 2, wide - 4, 1)
      }
    }
    window(g, w, h, y, frame)
  }
  return [
    // Paving: 0.6 m slabs in a running bond, each a shade of its own, with darker joints, dark enough to read from
    // Tile zoom (#175).
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
    // A curtain wall's bay of a storey (#177): a darker spandrel at its foot under a pale line at the floor, then two
    // panes of glass side by side, a mullion at the bay's edges and between them, and a shadow under each head.
    (g) => {
      fill(g, [128, 255, 0], 0, 0, S, S)
      fill(g, [104, 255, 0], 0, S - 7, S, 7)
      fill(g, [86, 0, 0], 0, 0, S, 19)
      fill(g, [128, 0, 255], 0, 19, S, 4)
      for (const x of [0, S - 2]) fill(g, [128, 0, 255], x, 0, 2, S)
      fill(g, [128, 0, 255], S / 2 - 1, 23, 2, S - 23)
    },
    // A flat office roof's deck (#177): pavers 1 m square, each a shade of its own, with darker joints.
    (g) => {
      const draw = stream(13)
      const t = S / 2
      for (let row = 0; row < 2; row++) {
        for (let k = 0; k < 2; k++) {
          fill(g, [98, 0, 0], k * t, row * t, t, t)
          fill(g, [Math.round(120 + draw() * 14), 0, 0], k * t + 2, row * t + 2, t - 4, t - 4)
        }
      }
    },
    // An office plaza (#177): slabs 0.6 m square in a grid, a light square of four beside a dark one, with joints.
    (g) => {
      const draw = stream(17)
      const t = S / 4
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 4; k++) {
          const dark = (Math.floor(row / 2) + Math.floor(k / 2)) % 2
          fill(g, [90, 0, 0], k * t, row * t, t, t)
          fill(g, [Math.round((dark ? 108 : 132) + draw() * 10), 0, 0], k * t + 1.5, row * t + 1.5, t - 3, t - 3)
        }
      }
    },
    // A terraced house's storey of 3 m on its back or a row's end (#178): plaster, a line at the floor, and a window 0.9
    // m wide and 1.25 m tall, 0.95 m up, framed, sliding and silled, under a little hood.
    (g) => {
      plaster(g, 19)
      window(g, 48, 53, 41, 4)
      fill(g, [128, 0, 255], 36, 41 + 53 + 7, 56, 3) // the hood
      fill(g, [96, 0, 0], 36, 41 + 53 + 4, 56, 3) // its shadow
    },
    // Its ground floor's middle bay at the back (#178): a back door 0.85 m wide with a lit pane, framed, under a hood.
    (g) => {
      plaster(g, 23)
      const [w, h] = [44, 86]
      const x = (S - w) / 2
      fill(g, [128, 0, 255], x - 3, 4, w + 6, h + 3)
      fill(g, [86, 0, 0], x, 4, w, h)
      fill(g, [70, 0, 0], x + w - 8, 4 + h / 2 - 2, 4, 4) // its handle
      fill(g, [128, 255, 0], x + 7, 4 + h - 30, w - 14, 22)
      fill(g, [128, 0, 255], x - 8, 4 + h + 7, w + 16, 4)
      fill(g, [88, 0, 0], x - 8, 4 + h + 3, w + 16, 4)
    },
    // A terraced house's front (#178): plaster and a line at each floor, round the windows and door built over it.
    (g) => plaster(g, 29),
    // A pitched roof's tiles (#178): kawara 0.25 m across in ribs down the slope, each rib lit along its crown, in rows
    // 0.25 m deep, the foot of each row shaded where the next overlaps it.
    (g) => {
      const t = S / 8
      for (let k = 0; k < S; k++) fill(g, [Math.round(112 + 30 * Math.sin((Math.PI * (k % t)) / t)), 0, 0], k, 0, 1, S)
      for (let row = 0; row < 8; row++) {
        fill(g, [92, 0, 0], 0, row * t, S, 2)
        fill(g, [108, 0, 0], 0, row * t + 2, S, 2)
      }
    },
    // A gable end under a tiled roof (#178): pale boards 0.25 m wide.
    (g) => {
      fill(g, [128, 0, 255], 0, 0, S, S)
      for (let y = 0; y < S; y += S / 8) fill(g, [112, 0, 255], 0, y, S, 2)
    },
    // An apartment block's flat roof (#178): sheets of roofing a metre wide, a raised seam between each two, and a
    // lap every 2 m along them.
    (g) => {
      speckle(g, 31, 120, 134, 4)
      for (const x of [0, S / 2]) {
        fill(g, [100, 0, 0], x, 0, 3, S)
        fill(g, [146, 0, 0], x + 3, 0, 2, S)
      }
      fill(g, [112, 0, 0], 0, 0, S, 2)
    },
    // Setts (#178): stones 0.3 m square in a running bond, each a shade of its own, with dark joints.
    (g) => {
      const draw = stream(37)
      const t = S / 8
      fill(g, [84, 0, 0], 0, 0, S, S)
      for (let row = 0; row < 8; row++) {
        for (let k = -1; k < 8; k++) {
          const x = k * t + (row % 2) * (t / 2)
          fill(g, [Math.round(108 + draw() * 32), 0, 0], x + 1.5, row * t + 1.5, t - 3, t - 3)
        }
      }
    },
    // A house's storey (#179) of about 3.4 m in a bay of about 2.6 m: lap siding, and a window 0.9 m wide and 1.25 m
    // tall, 0.95 m up, framed, sliding and silled, between louvred shutters 0.4 m wide.
    (g) => {
      siding(g)
      shuttered(g, 44, 47, 36, 20)
    },
    // Its front's middle bay on the ground floor, where the door is built (#179): the siding alone.
    (g) => siding(g),
    // A house's roof (#179): flat tiles 0.5 m wide in rows 0.25 m deep, each a shade of its own, in a running bond;
    // the top of each row shaded where the row above laps it, and its foot lit.
    (g) => {
      const draw = stream(41)
      const t = S / 8
      for (let row = 0; row < 8; row++) {
        for (let k = -1; k < 4; k++) {
          const x = k * 2 * t + (row % 2) * t
          fill(g, [Math.round(116 + draw() * 20), 0, 0], x, row * t, 2 * t, t)
          fill(g, [100, 0, 0], x, row * t, 1, t)
        }
        fill(g, [90, 0, 0], 0, row * t, S, 2)
        fill(g, [106, 0, 0], 0, row * t + 2, S, 1)
        fill(g, [140, 0, 0], 0, row * t + t - 1, S, 1)
      }
    },
    // A low garden wall (#179) laid in bays of 1.6 m and its height: concrete blocks 0.4 m by 0.2 m in a running bond,
    // each a shade of its own, with joints.
    (g) => {
      const draw = stream(43)
      const t = S / 4
      fill(g, [96, 0, 0], 0, 0, S, S)
      for (let row = 0; row < 4; row++) {
        for (let k = -1; k < 4; k++) {
          const x = k * t + (row % 2) * (t / 2)
          fill(g, [Math.round(118 + draw() * 16), 0, 0], x + 1, row * t + 1, t - 2, t - 2)
        }
      }
    },
    // A park's lawn (#180) over two stripes 2 m wide: one mown toward the eye and paler, one away and deeper, each
    // finely speckled.
    (g) => {
      const draw = stream(47)
      for (let y = 0; y < S; y += 4)
        for (let x = 0; x < S; x += 4) fill(g, [Math.round((x < S / 2 ? 132 : 114) + draw() * 8), 0, 0], x, y, 4, 4)
    },
    // A park's gravel (#180): stones of 5 cm, each a shade of its own, and a darker one here and there.
    (g) => {
      const draw = stream(53)
      for (let y = 0; y < S; y += 3)
        for (let x = 0; x < S; x += 3) fill(g, [Math.round(draw() < 0.08 ? 96 : 116 + draw() * 26), 0, 0], x, y, 3, 3)
    },
    // A stone of radial paving (#180), one to a repeat: finely speckled, with a dark joint along two edges.
    (g) => {
      speckle(g, 59, 122, 134, 4)
      fill(g, [84, 0, 0], 0, 0, S, 6)
      fill(g, [84, 0, 0], 0, 0, 6, S)
    },
    // A shed's wall (#181), a bay of about 3 m across and the whole wall up: steel sheet in ribs 0.2 m apart, each
    // shaded along one side and lit along the other; a concrete plinth along the foot, and a strip of windows across
    // the bay high on the wall, framed, with a mullion at the bay's edges and its middle and the shadow of its head.
    (g) => {
      plain(g)
      for (let x = 0; x < S; x += 8) {
        fill(g, [108, 0, 0], x, 0, 2, S)
        fill(g, [138, 0, 0], x + 2, 0, 1, S)
      }
      fill(g, [96, 0, 0], 0, 0, S, 6)
      fill(g, [112, 0, 0], 0, 6, S, 2)
      const [y, h] = [Math.round(S * 0.7), Math.round(S * 0.13)]
      fill(g, [128, 0, 255], 0, y - 3, S, h + 6)
      fill(g, [128, 255, 0], 0, y, S, h)
      fill(g, [96, 255, 0], 0, y + h - 2, S, 2)
      for (const x of [0, S / 2 - 1.5, S - 1.5]) fill(g, [128, 0, 255], x, y, 3, h)
      fill(g, [92, 0, 0], 0, y - 6, S, 3)
    },
    // A shed's roof (#181), 2 m each way: ribs 0.25 m apart down the slope, each lit along its crest and shaded beside
    // it, and the lap where one sheet meets the next down the slope.
    (g) => {
      plain(g)
      for (let x = 0; x < S; x += 16) {
        fill(g, [104, 0, 0], x, 0, 3, S)
        fill(g, [142, 0, 0], x + 3, 0, 2, S)
        fill(g, [120, 0, 0], x + 5, 0, 2, S)
      }
      fill(g, [96, 0, 0], 0, S - 3, S, 3)
      fill(g, [136, 0, 0], 0, S - 5, S, 2)
    },
    // A yard's tarmac (#181), 2.4 m each way: fine stone, each 4 cm a shade of its own, a paler chip here and there.
    (g) => {
      const draw = stream(61)
      for (let y = 0; y < S; y += 2)
        for (let x = 0; x < S; x += 2) fill(g, [Math.round(draw() < 0.06 ? 142 : 118 + draw() * 14), 0, 0], x, y, 2, 2)
    },
    // Hazard stripes (#181), 2.4 m each way: the paint and near-black in turn, 0.3 m wide, at 45°.
    (g) => {
      plain(g)
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y) % (S / 4) < S / 8) fill(g, [22, 0, 0], x, y, 1, 1)
    },
    // A fence's mesh panel (#181), a bay between its posts and its height: wire in diamonds a tenth of the bay across,
    // pale over the dark beyond, between a rail at its top and its foot.
    (g) => {
      fill(g, [66, 0, 0], 0, 0, S, S)
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const [a, b] = [(x + y) % 13, (x - y + 13 * 20) % 13]
          if (a < 2 || b < 2) fill(g, [150, 0, 0], x, y, 1, 1)
        }
      fill(g, [140, 0, 0], 0, 0, S, 7)
      fill(g, [140, 0, 0], 0, S - 9, S, 9)
    },
    // A tank's plates (#181), a bay of about 2 m round it and a storey of 1.2 m up: courses of steel plate, two to a
    // bay and staggered a half from one course to the next, welded along darker seams.
    (g) => {
      plain(g)
      for (const [row, shift] of [
        [0, 0],
        [S / 2, S / 4],
      ]) {
        fill(g, [98, 0, 0], 0, row, S, 2)
        fill(g, [136, 0, 0], 0, row + 2, S, 1)
        for (let x = shift; x < S + shift; x += S / 2) fill(g, [104, 0, 0], x % S, row, 2, S / 2)
      }
    },
    // A meadow's grass (#182) over 16 m: unmown and deeper, each 25 cm a shade of its own and a pale seed head here and
    // there; mown paler in three glades and the way that winds between them, which wrap at the repeat's edges.
    (g) => {
      const draw = stream(61)
      const glades = [
        [0.22, 0.3, 0.17],
        [0.7, 0.68, 0.2],
        [0.82, 0.14, 0.11],
      ]
      const mown = (u: number, v: number) => {
        const wrap = (a: number) => Math.abs(a - Math.round(a))
        if (glades.some(([cx, cy, r]) => Math.hypot(wrap(u - cx), wrap(v - cy)) < r)) return true
        return wrap(v - 0.5 - 0.2 * Math.sin(2 * Math.PI * u)) < 0.045 // the way between them
      }
      for (let y = 0; y < S; y += 2)
        for (let x = 0; x < S; x += 2) {
          const pale = mown((x + 1) / S, (y + 1) / S)
          const shade = pale ? 134 + draw() * 6 : draw() < 0.05 ? 138 : 110 + draw() * 12
          fill(g, [Math.round(shade), 0, 0], x, y, 2, 2)
        }
    },
    // Worked soil (#182) over 2.4 m: six furrows running across, each a dark trough under a paler ridge, finely speckled.
    (g) => {
      const draw = stream(67)
      const t = S / 6
      for (let y = 0; y < S; y += 2)
        for (let x = 0; x < S; x += 4) {
          const k = (y % t) / t // up its furrow
          fill(g, [Math.round((k < 0.3 ? 100 : k < 0.75 ? 126 : 138) + draw() * 8), 0, 0], x, y, 4, 2)
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
      // ponytail: any part lying flat at the kerb's height in the pavement's very colour is paved too, which nothing
      // builds today. Give such a part a colour a shade off the pavement's, or the pavement a mesh of its own on a
      // patterned copy of the material (a draw call a build), if one ever must stay plain.
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
bool patternInMetres = patternKind == ${f(PATTERN.roof)} || patternKind == ${f(PATTERN.deck)} || patternKind == ${f(PATTERN.sheets)} || patternKind == ${f(PATTERN.tiles)} || patternKind == ${f(PATTERN.gable)} || patternKind == ${f(PATTERN.shingles)} || patternKind == ${f(PATTERN.ribbed)};
vec2 patternAt = patternInMetres ? vPatternAt / ${f(REPEAT.roof)} : vPatternAt;
vec2 patternDx = dFdx(patternAt);
vec2 patternDy = dFdy(patternAt);
// Radial paving (#180): m from its middle turned into rings and the stones round each, and their derivatives worked out
// from those of the m, which hold across the seam where the angle wraps.
if (patternKind == ${f(PATTERN.radial)}) {
  float r = max(length(vPatternAt), 1e-3);
  float stones = max(6.0, floor(${f(2 * Math.PI)} * (floor(r / ${f(RADIAL.ring)}) + 0.5) * ${f(RADIAL.ring / RADIAL.stone)}));
  float k = stones / ${f(2 * Math.PI)};
  vec2 tx = vec2(-vPatternAt.y, vPatternAt.x) / (r * r);
  patternAt = vec2((atan(vPatternAt.y, vPatternAt.x) / ${f(2 * Math.PI)} + 0.5) * stones, r / ${f(RADIAL.ring)});
  patternDx = vec2(dot(tx, patternDx) * k, dot(vPatternAt, patternDx) / (r * ${f(RADIAL.ring)}));
  patternDy = vec2(dot(tx, patternDy) * k, dot(vPatternAt, patternDy) / (r * ${f(RADIAL.ring)}));
}
float patternEdge = min(min(vPatternAt.x, vPattern.y - vPatternAt.x), min(vPatternAt.y, vPattern.z - vPatternAt.y));
float patternAa = fwidth(patternEdge);
if (patternKind > 0.5) {
  float layer = patternKind - 1.0;
  if (patternKind == ${f(PATTERN.back)}) layer = floor(patternAt.x) == floor(floor(vPattern.y + 0.5) * 0.5) ? ${f(DOOR)} : ${f(PATTERN.wall - 1)};
  // A terraced house's back (#178): its door in the middle bay of the ground floor, a window in every other bay.
  if (patternKind == ${f(PATTERN.rear)}) layer = floor(patternAt.y) == 0.0 && floor(patternAt.x) == floor(floor(vPattern.y + 0.5) * 0.5) ? ${f(REAR_DOOR)} : ${f(PATTERN.house - 1)};
  // A house's front (#179): siding alone in the middle bay of its ground floor where its bays are odd, behind its door.
  if (patternKind == ${f(PATTERN.homeFront)}) layer = floor(patternAt.y) == 0.0 && mod(floor(vPattern.y + 0.5), 2.0) == 1.0 && floor(patternAt.x) == floor(floor(vPattern.y + 0.5) * 0.5) ? ${f(DOORWAY)} : ${f(PATTERN.home - 1)};
  vec3 worn = textureGrad(patternMap, vec3(patternAt, layer), patternDx, patternDy).rgb;
  float shade = worn.r * 2.0;
  // Each stone of radial paving a shade of its own (#180).
  if (patternKind == ${f(PATTERN.radial)}) shade *= 0.92 + 0.16 * patternHash(vec3(floor(patternAt), 3.0));
  // A tiled roof's ridge (#178), and a house's (#179): a darker cap along its first 0.22 m down from the top.
  if (patternKind == ${f(PATTERN.tiles)} || patternKind == ${f(PATTERN.shingles)}) shade *= 1.0 - 0.22 * (1.0 - smoothstep(0.2 - patternAa, 0.24 + patternAa, vPatternAt.y));
  // A house's foundation along the foot of its ground floor, and the shadow of its eaves along the top of its top
  // storey (#179), in storeys up the wall: its pattern's third number is how many storeys tall the wall stands.
  if (patternKind == ${f(PATTERN.home)} || patternKind == ${f(PATTERN.homeFront)}) {
    float aaUp = length(vec2(patternDx.y, patternDy.y));
    shade *= mix(${f(HOME.foot)}, 1.0, smoothstep(${f(HOME.footing)} - aaUp, ${f(HOME.footing)} + aaUp, patternAt.y));
    shade *= 1.0 - ${f(HOME.shadow)} * smoothstep(vPattern.z - ${f(HOME.eaves)} - aaUp, vPattern.z - ${f(HOME.eaves)} + aaUp, patternAt.y);
  }
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
  vec3 patternPaint = diffuseColor.rgb;
  diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(TRIM)}, worn.b);
  float seed = fract(vPattern.x) * 97.0;
  float h = patternHash(vec3(floor(patternAt), seed));
  vec3 glass = h < ${f(LIT)} ? (h < ${f(LIT / 3)} ? ${vec3(GLASS[0])} : h < ${f((2 * LIT) / 3)} ? ${vec3(GLASS[1])} : ${vec3(GLASS[2])}) : ${vec3(GLASS[3])};
  float lit = h < ${f(LIT)} ? (h < ${f((2 * LIT) / 3)} ? 1.0 : 0.45) : 0.0;
  if (patternKind == ${f(PATTERN.curtain)}) {
    // The wall's own glass, its paint, paling toward the sky a third of its height at a time, each pane a tone of its
    // own; and a floor lit across the whole tower, as the share in vPattern.y of its floors are, or dark.
    float pane = patternHash(vec3(floor(patternAt.x * 2.0), floor(patternAt.y), seed + 5.0));
    float third = floor(clamp(patternAt.y / max(vPattern.z, 1.0), 0.0, 0.999) * 3.0);
    glass = mix(patternPaint, ${vec3(CURTAIN.sky)}, ${f(CURTAIN.foot)} + ${f(CURTAIN.third)} * third);
    glass *= 1.0 + ${f(CURTAIN.tone)} * (pane < 0.34 ? -1.0 : pane < 0.67 ? 0.0 : 1.0);
    float floorLit = patternHash(vec3(1.7, floor(patternAt.y), seed));
    float dim = min(1.0, pow(patternPaint.g / ${f(new THREE.Color(CURTAIN.glass).g)}, 2.0));
    lit = floorLit < vPattern.y ? (${f(CURTAIN.lit[0])} + ${f(CURTAIN.lit[1] - CURTAIN.lit[0])} * pane) * mix(${f(CURTAIN.least)}, 1.0, dim) : ${f(CURTAIN.dark)};
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, worn.g) * shade;
  patternGlass = worn.g;
  patternLit = worn.g * lit;
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
