import * as THREE from 'three'
import type { Glow } from './day'
import { canvasTexture, gable, roundedBox, tint } from './shapes'

const TAU = Math.PI * 2
// The palette is the oversaturated one picked in #104 at its gentlest strength. Within 30° of hue of the Tool blue or
// the Jam red-orange, a colour keeps under 65% of that colour's chroma, which is why the terracotta roof is a darker
// brick, the salmon one persimmon and the slate one a teal slate.
const WALLS = ['#fdeed6', '#ffd7b6', '#e0f2d4', '#cbebfc', '#fbe3a2', '#fbd2dd', '#e5dafb', '#fff7e8', '#c0e9e0']
const ROOFS = ['#d56454', '#4d7d9c', '#5aa69b', '#d09c53', '#8b7dbf', '#ea8548']
const LAWN = '#a9db7f' // a house's garden
// An office tower's curtain wall is one of these glasses, which the kit's one glass is tinted to, and its frame,
// fins and crown one of these trims.
const OFFICE_GLASS = ['#8fadc0', '#7b9db0', '#8cb5ae', '#5f778c', '#a6bfcb', '#c2b498']
const OFFICE_TRIM = ['#f2f4f6', '#dde3e8', '#e6cfa6', '#c4ccd4', '#68727f']
const LEAVES = {
  round: ['#7bcd5d', '#5fbc51', '#92d76e', '#6bc357', '#85cf61'],
  sakura: ['#ffbbd1', '#ffa1c1', '#ffd1df', '#ffadc8'],
  pine: ['#379e62', '#43ac6b', '#2e9358'],
}

const SPHERE = new THREE.SphereGeometry(1, 16, 12)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
const ROUND = new THREE.CylinderGeometry(1, 1, 1, 28).translate(0, 0.5, 0) // smoother, for a round tower's glass
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)
const PYRAMID = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0) // turned an eighth, its base is a square 1.41 across
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

/**
 * A colour (painted onto the shared soft-lit material), a material of the kit, or one of them tinted by vertex colour.
 * The kit's glass is tinted white unless a tint is given, and takes `glow`, how brightly it lights at night: 1 unless
 * given, so that a curtain wall can be lit floor by floor.
 */
export type Look = string | THREE.Material | { material: THREE.Material; tint: THREE.Color; glow?: number }
export type TreeKind = keyof typeof LEAVES
/** An office tower: a framed curtain wall, fins up its faces, tiers set back, or round. */
export type OfficeStyle = 'curtain' | 'fins' | 'stepped' | 'round'
export type Kit = ReturnType<typeof createKit>
export type Materials = ReturnType<typeof createMaterials>

/** What a brick is, which decides when and how it comes in during a Rebuild. */
export type Stage = 'soil' | 'sand' | 'grass' | 'plate' | 'block' | 'ground' | 'lamp' | 'building' | 'tree'

/** One brick of the slab or of what stands on it: the unit that drops or pops in during a Rebuild. */
export interface Brick {
  stage: Stage
  /** The point it lands on, or grows out of, in Three coordinates. */
  at: THREE.Vector3
  /** Puffs of dust thrown up where it lands. */
  dust: number
}

/** A geometry in place, in Three coordinates, with its material and the index of the brick it belongs to. */
export interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  brick: number
}

/**
 * The materials of the static scenery, shared by every Block so that all of them merge into one mesh per material.
 * Slab, Blocks and walls take their colours on `solid`.
 */
export function createMaterials() {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  // One glass for every window, so that windows add no draw calls. Its vertex colour tints it: white for the glass
  // itself, or the ratio to a paler or a darker glass. A darker tint lights its windows less (the glow goes with the
  // square of the tint's green, up to full), and each vertex's `glow` scales how brightly it lights.
  const GLASS = '#9cc7df'
  const glass = new THREE.MeshStandardMaterial({
    color: GLASS,
    vertexColors: true,
    roughness: 0.22,
    metalness: 0.1,
    emissive: '#ffc78a',
    emissiveIntensity: 0,
  })
  glass.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = glow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= min(1.0, vColor.g * vColor.g) * vGlow;',
      )
  }
  const shade = (hex: THREE.ColorRepresentation) => {
    const [c, base] = [new THREE.Color(hex), new THREE.Color(GLASS)]
    return new THREE.Color(c.r / base.r, c.g / base.g, c.b / base.b)
  }
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.4, emissive: '#ffd08a', emissiveIntensity: 0 })
  const water = new THREE.MeshStandardMaterial({ color: '#63d1f4', roughness: 0.12, metalness: 0.05 })
  // Contact shadows: a blurred dark decal under every building and tree.
  const decal = (map: THREE.Texture, opacity: number) =>
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  const roundShadow = decal(
    canvasTexture(128, 128, (g) => {
      const fade = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      fade.addColorStop(0, 'rgba(25,35,50,0.6)')
      fade.addColorStop(0.5, 'rgba(25,35,50,0.28)')
      fade.addColorStop(1, 'rgba(25,35,50,0)')
      g.fillStyle = fade
      g.fillRect(0, 0, 128, 128)
    }),
    1,
  )
  const squareShadow = decal(
    canvasTexture(128, 128, (g) => {
      g.filter = 'blur(12px)'
      g.fillStyle = 'rgba(25,35,50,0.75)'
      g.fillRect(28, 28, 72, 72)
    }),
    0.8,
  )

  return {
    solid,
    glass,
    /** The tints of `glass` a building's windows take, one picked per building: the glass, a paler and a darker one. */
    windows: [new THREE.Color(1, 1, 1), shade('#b4d6e3'), shade('#7aa9c9')],
    /** The tint that makes `glass` the colour `color`, as an office tower's curtain wall is. */
    glassOf: shade,
    bulb,
    water,
    roundShadow,
    squareShadow,
    /** Light the windows and lamps as the time of day has them. */
    setGlow({ windows, lamps }: Glow) {
      glass.emissiveIntensity = windows
      bulb.emissiveIntensity = lamps
    },
  }
}

/**
 * The building and tree kit: the bricks the slab and its Blocks are built from. Shapes are placed in sim metres,
 * `(x, y)` on the map and `h` above the road, and every shape added belongs to the next brick closed. Every random
 * choice comes from `rand`, so the same stream builds the same town.
 */
export function createKit(rand: () => number, materials: Materials) {
  const range = (a: number, b: number) => a + (b - a) * rand()
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]
  const { solid, glass, windows, glassOf, bulb, water, roundShadow, squareShadow } = materials

  const parts: Part[] = []
  const bricks: Brick[] = []
  let open = 0 // parts from here on belong to the next brick
  const [m, q, up] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0)]
  /** Give every vertex of a geometry of the glass the glow `glow`. */
  const glowing = (geo: THREE.BufferGeometry, glow: number) =>
    geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(glow), 1))
  /** Add a geometry that is already in place (Three coordinates). The kit takes it over. */
  const push = (geo: THREE.BufferGeometry, look: Look) => {
    if (typeof look === 'string') parts.push({ geometry: tint(geo, look), material: solid, brick: -1 })
    else if ('tint' in look) {
      const tinted = tint(geo, look.tint)
      parts.push({ geometry: look.material === glass ? glowing(tinted, look.glow ?? 1) : tinted, material: look.material, brick: -1 })
    } else parts.push({ geometry: look === glass ? glowing(tint(geo, '#ffffff'), 1) : geo, material: look, brick: -1 })
  }
  /** Add a copy of a shape standing at `(x, y)`, `h` above the road, turned `ry` and scaled. */
  const add = (geo: THREE.BufferGeometry, look: Look, x: number, y: number, h: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(sx, sy, sz))), look)
  }
  /** Close the shapes added since the last brick into one, which lands on `(x, y)`, `h` above the road. */
  const brick = (stage: Stage, x: number, y: number, h: number, dust = 0) => {
    if (open === parts.length) return
    for (let i = open; i < parts.length; i++) parts[i].brick = bricks.length
    open = parts.length
    bricks.push({ stage, at: new THREE.Vector3(x, h, -y), dust })
  }

  // Buildings repeat their boxes, so each is cut once per size.
  const boxes = new Map<string, THREE.BufferGeometry>()
  const box = (w: number, h: number, d: number, r: number, b: number) => {
    const key = [w, h, d, r, b].map((v) => v.toFixed(2)).join()
    if (!boxes.has(key)) boxes.set(key, roundedBox(w, h, d, r, b))
    return boxes.get(key)!
  }
  const shadow = (x: number, y: number, h: number, w: number, d: number, round = false) =>
    add(PLANE, round ? roundShadow : squareShadow, x, y, h + 0.05, 0, w, 1, d)
  // Plain boxes, unrounded, for the fine parts of a building (a floor of glass, a fin, a mullion), each cut once per size.
  const cuboids = new Map<string, THREE.BufferGeometry>()
  const cuboid = (w: number, h: number, d: number) => {
    const key = [w, h, d].map((v) => v.toFixed(2)).join()
    if (!cuboids.has(key)) cuboids.set(key, new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0))
    return cuboids.get(key)!
  }

  return {
    add,
    push,
    brick,
    box,
    shadow,
    glass,
    bulb,
    water,
    range,
    pick,
    chance: (p: number) => rand() < p,

    /** A tree of size `s` (1 is about 6 m tall), as one brick: a cluster of spheres, or stacked cones for a pine. */
    tree(x: number, y: number, h: number, s: number, kind: TreeKind) {
      add(CYLINDER, '#a1714c', x, y, h, 0, 0.36 * s, 3 * s, 0.36 * s)
      if (kind === 'pine') {
        for (let i = 0; i < 3; i++) {
          const r = s * (2.48 - i * 0.6)
          add(CONE, pick(LEAVES.pine), x, y, h + s * (1.6 + i * 1.44), 0, r, s * 2.8, r)
        }
      } else {
        const n = 3 + Math.floor(rand() * 3)
        for (let i = 0; i < n; i++) {
          const [a, out, k] = [rand() * TAU, i ? 1.2 * s : 0, s * (i ? range(1.44, 1.92) : 2.4)]
          add(
            SPHERE,
            pick(LEAVES[kind]),
            x + Math.cos(a) * out,
            y + Math.sin(a) * out,
            h + s * (i ? range(3.6, 5.4) : 4.2),
            0,
            k,
            k * 0.9,
            k,
          )
        }
      }
      shadow(x, y, h, s * 6.8, s * 6.8, true)
      brick('tree', x, y, h)
    },

    /**
     * A house on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: a wall box with a glass band in
     * one of the glass's tints, under a gable roof whose ridge runs the long way. It is at most 12 m on a side.
     */
    house(x: number, y: number, h: number, w: number, d: number) {
      const panes = { material: glass, tint: pick(windows) }
      ;[w, d] = [Math.min(w, 12), Math.min(d, 12)]
      const wall = range(4.4, 6.4)
      add(box(w, wall, d, 0.48, 0.2), pick(WALLS), x, y, h)
      add(box(w + 0.16, 1.04, d + 0.16, 0.56, 0.08), panes, x, y, h + wall * 0.42)
      const along = w >= d
      add(gable((along ? w : d) + 0.8, (along ? d : w) + 1.12, Math.min(w, d) * 0.42), pick(ROOFS), x, y, h + wall, along ? Math.PI / 2 : 0)
      shadow(x, y, h, w * 1.45 + 2, d * 1.45 + 2)
      brick('building', x, y, h)
    },

    /** A lawn over a footprint `w` by `d`, centred on `(x, y)`: a house's garden. It joins the next brick. */
    lawn(x: number, y: number, h: number, w: number, d: number) {
      add(box(w, 0.16, d, 0.8, 0.06), LAWN, x, y, h)
    },

    /**
     * An office tower of `floors` storeys on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: a
     * plinth with a lit lobby, then a curtain wall with no band per floor, in one glass that pales toward the top where it
     * catches the sky, and a crown. The wall is laid floor by floor, flush, so by day it is one sheet of glass and at
     * night some floors are lit and the rest dark. `style` shapes it:
     * - `curtain`: framed by corner posts with fine mullions, under a parapet, a penthouse and sometimes a mast.
     * - `fins`: fins up every face that rise past the roof as its crown, round a penthouse.
     * - `stepped`: tiers set back, each framed and topped by a ledge, under a pointed cap and a spire.
     * - `round`: a drum under a parapet ring, a dome and a spire.
     */
    officeTower(x: number, y: number, h: number, w: number, d: number, floors: number, style: OfficeStyle) {
      const STOREY = 3.2
      const [ROOF, PLANT, SKY] = ['#dfe3e7', '#cfd5dc', new THREE.Color('#e9f4fb')]
      const [foot, trim, lit] = [new THREE.Color(pick(OFFICE_GLASS)), pick(OFFICE_TRIM), range(0.3, 0.75)]
      /** Floor `f`'s glass: up to 30% of the way to the sky's colour at the top, and lit at night for `lit` of the floors. */
      const storey = (f: number): Look => ({
        material: glass,
        tint: glassOf(foot.clone().lerp(SKY, (0.3 * f) / Math.max(1, floors - 1))),
        glow: rand() < lit ? range(0.45, 0.8) : 0.04,
      })
      const base = h + 3.6
      const body = floors * STOREY
      const top = base + body
      /** Corner posts up a box `pw` by `pd`, from `from` for `tall` m. */
      const posts = (pw: number, pd: number, from: number, tall: number) => {
        for (const i of [-1, 1]) {
          for (const j of [-1, 1]) add(box(1.2, tall, 1.2, 0.36, 0.1), trim, x + i * (pw / 2 - 0.45), y + j * (pd / 2 - 0.45), from)
        }
      }
      /** Fine mullions about 3.2 m apart up the faces of a box `mw` by `md`, between its corners. */
      const mullions = (mw: number, md: number, from: number, tall: number) => {
        for (const [len, across, eastWest] of [
          [mw, md, true],
          [md, mw, false],
        ] as const) {
          const n = Math.max(2, Math.round(len / 3.2))
          for (let i = 1; i < n; i++) {
            const t = -len / 2 + (i * len) / n
            for (const side of [-1, 1]) {
              if (eastWest) add(cuboid(0.16, tall, 0.22), trim, x + t, y + (side * across) / 2, from)
              else add(cuboid(0.22, tall, 0.16), trim, x + (side * across) / 2, y + t, from)
            }
          }
        }
      }
      /** A flat roof `rw` by `rd` at `at`, with a parapet round its edge if `parapet`. */
      const roof = (rw: number, rd: number, at: number, parapet: boolean) => {
        add(cuboid(rw - 0.2, 0.3, rd - 0.2), ROOF, x, y, at)
        if (!parapet) return
        for (const side of [-1, 1]) {
          add(cuboid(rw, 1.3, 0.45), trim, x, y + side * (rd / 2 - 0.22), at)
          add(cuboid(0.45, 1.3, rd - 0.9), trim, x + side * (rw / 2 - 0.22), y, at)
        }
      }
      /** A penthouse with its own little roof on a roof `rw` by `rd` at `at`, and a plant box or two. Returns its top. */
      const penthouse = (rw: number, rd: number, at: number) => {
        const [pw, pd] = [rw * 0.5, rd * 0.44]
        add(box(pw, 3.4, pd, 0.4, 0.12), trim, x - rw * 0.08, y + rd * 0.08, at)
        add(box(pw + 0.3, 0.4, pd + 0.3, 0.45, 0.08), ROOF, x - rw * 0.08, y + rd * 0.08, at + 3.4)
        add(box(rw * 0.18, 1.3, rd * 0.16, 0.2, 0.08), PLANT, x + rw * 0.28, y - rd * 0.27, at)
        add(box(rw * 0.12, 1.1, rd * 0.22, 0.2, 0.08), PLANT, x - rw * 0.3, y - rd * 0.24, at)
        return at + 3.8
      }
      /** A spire `tall` m high from `at`, with a beacon on its tip. */
      const spire = (at: number, tall: number, r: number) => {
        add(CYLINDER, PLANT, x, y, at, 0, r, tall, r)
        add(SPHERE, bulb, x, y, at + tall, 0, r * 1.4, r * 1.4, r * 1.4)
      }

      // A plinth, a lit lobby and a canopy over it.
      add(box(w + 1.6, 0.8, d + 1.6, 1.4, 0.16), trim, x, y, h)
      add(box(w + 0.6, 2.4, d + 0.6, 1.2, 0.08), { material: glass, tint: windows[0] }, x, y, h + 0.8)
      add(box(w + 1.6, 0.4, d + 1.6, 1.4, 0.1), trim, x, y, h + 3.2)
      if (style === 'round') {
        const r = Math.min(w, d) / 2
        for (let f = 0; f < floors; f++) add(ROUND, storey(f), x, y, base + f * STOREY, 0, r, STOREY, r)
        const n = Math.max(10, Math.round((TAU * r) / 3.2))
        for (let i = 0; i < n; i++)
          add(cuboid(0.2, body, 0.2), trim, x + Math.cos((i * TAU) / n) * r, y + Math.sin((i * TAU) / n) * r, base)
        add(ROUND, trim, x, y, top, 0, r + 0.3, 1.4, r + 0.3)
        add(SPHERE, trim, x, y, top + 1.4, 0, r * 0.78, r * 0.52, r * 0.78)
        spire(top + 1.4 + r * 0.5, floors >= 14 ? range(8, 12) : range(4, 6), 0.3)
      } else if (style === 'stepped') {
        // Each tier takes its share of the floors and stands 70% the size of the one below.
        const shares = floors >= 12 ? [0.5, 0.3, 0.2] : [0.6, 0.4]
        let [tw, td, at, left] = [w, d, base, floors]
        shares.forEach((share, i) => {
          const n = i === shares.length - 1 ? left : Math.max(1, Math.round(floors * share))
          for (let f = 0; f < n; f++) add(cuboid(tw - 0.2, STOREY, td - 0.2), storey(floors - left + f), x, y, at + f * STOREY)
          left -= n
          posts(tw, td, at, n * STOREY)
          mullions(tw - 0.2, td - 0.2, at, n * STOREY)
          at += n * STOREY
          add(box(tw + 0.4, 0.7, td + 0.4, 1.3, 0.12), trim, x, y, at)
          at += 0.7
          if (i < shares.length - 1) [tw, td] = [tw * 0.7, td * 0.7]
        })
        const [r, cap] = [Math.min(tw, td) * 0.707, Math.min(7, Math.min(tw, td) * 0.78)]
        add(PYRAMID, trim, x, y, at, Math.PI / 4, r, cap, r)
        spire(at + cap - 0.4, range(5, 9), 0.24)
      } else if (style === 'fins') {
        for (let f = 0; f < floors; f++) add(cuboid(w - 0.7, STOREY, d - 0.7), storey(f), x, y, base + f * STOREY)
        for (const [len, across, eastWest] of [
          [w, d, true],
          [d, w, false],
        ] as const) {
          const n = Math.max(3, Math.round(len / 2.4))
          for (let i = 0; i < n; i++) {
            const t = -len / 2 + 0.4 + (i * (len - 0.8)) / (n - 1)
            for (const side of [-1, 1]) {
              if (eastWest) add(cuboid(0.36, body + 2.6, 0.8), trim, x + t, y + side * (across / 2 - 0.4), base)
              else add(cuboid(0.8, body + 2.6, 0.36), trim, x + side * (across / 2 - 0.4), y + t, base)
            }
          }
        }
        roof(w - 0.7, d - 0.7, top, false)
        const crown = penthouse(w - 2, d - 2, top + 0.3)
        if (floors >= 14) spire(crown, range(5, 8), 0.3)
      } else {
        for (let f = 0; f < floors; f++) add(cuboid(w - 0.2, STOREY, d - 0.2), storey(f), x, y, base + f * STOREY)
        posts(w, d, base, body)
        mullions(w - 0.2, d - 0.2, base, body)
        roof(w, d, top, true)
        const crown = penthouse(w, d, top + 0.3)
        if (floors >= 14 || rand() < 0.4) spire(crown, range(5, 9), 0.18)
      }
      shadow(x, y, h, w * 1.4 + 2.4, d * 1.4 + 2.4, style === 'round')
      brick('building', x, y, h)
    },

    /** A street lamp, as one brick. */
    lamp(x: number, y: number, h: number) {
      add(CYLINDER, '#7d8794', x, y, h, 0, 0.14, 5, 0.14)
      add(SPHERE, bulb, x, y, h + 5.2, 0, 0.44, 0.44, 0.44)
      brick('lamp', x, y, h)
    },

    /** A cylinder of radii `rx` (east–west) and `ry`, `height` tall. */
    drum(look: Look, x: number, y: number, h: number, rx: number, ry: number, height: number) {
      add(CYLINDER, look, x, y, h, 0, rx, height, ry)
    },

    ball(look: Look, x: number, y: number, h: number, r: number) {
      add(SPHERE, look, x, y, h, 0, r, r, r)
    },

    /** Everything built, as parts tagged with their bricks. Every shape must be in a brick by now. The kit is spent after this. */
    done(): { parts: Part[]; bricks: Brick[] } {
      if (open < parts.length) throw new Error('the kit has shapes left out of any brick')
      for (const g of [...boxes.values(), ...cuboids.values()]) g.dispose()
      boxes.clear()
      cuboids.clear()
      return { parts, bricks }
    },
  }
}
