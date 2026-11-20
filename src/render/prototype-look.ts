// PROTOTYPE, throwaway: the faceted look, to set beside the game's own on one Tile. `?look=facet` (dev only) swaps
// the kit's round shapes for few-sided ones, shades every face flat, and builds high-density residential's towers as
// stacked, chamfered tiers (`./zones/prototype-facet-tower`). Nothing here is for main.
import * as THREE from 'three'
import { SIGNALS } from '../sim/prototype-signals'

const LOOK =
  import.meta.env?.VITE_LOOK ??
  (import.meta.env?.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('look') : null)
/** The faceted look: `?look=facet`, or `?look=stacked`, which also builds high-density's towers as stacked tiers. */
export const FACET: boolean = LOOK === 'facet' || LOOK === 'stacked'
// The faceted look runs the sim's traffic lights (`../sim/prototype-signals`).
if (FACET) SIGNALS.on = true
/** Whether the camera may come closer than Block zoom: under either faceted look, and in the comparison page's builds of both looks. */
export const CLOSE: boolean = !!LOOK
/** The first take, which the user set aside for the game's own buildings (2026-11-20): the stacked towers. */
export const STACKED: boolean = LOOK === 'stacked'

type Pt = readonly [number, number]

/**
 * A solid between two outlines of as many points, `a` on y = 0 and `b` at y = `h`, each convex and going the same way
 * round: its sides, its top and its underside, every face flat. Points are `[x, z]`.
 */
export function loft(a: readonly Pt[], b: readonly Pt[], h: number): THREE.BufferGeometry {
  const n = a.length
  const low = a.map(([x, z]) => new THREE.Vector3(x, 0, z))
  const high = b.map(([x, z]) => new THREE.Vector3(x, h, z))
  const tris: THREE.Vector3[][] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    tris.push([low[i], low[j], high[j]], [low[i], high[j], high[i]])
  }
  for (let i = 1; i < n - 1; i++) tris.push([high[0], high[i], high[i + 1]], [low[0], low[i + 1], low[i]])
  const centre = [...low, ...high].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(2 * n)
  const [ab, ac, normal, mid] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  const position: number[] = []
  for (const [p, q, r] of tris) {
    normal.crossVectors(ab.subVectors(q, p), ac.subVectors(r, p))
    if (normal.lengthSq() < 1e-10) continue // a face an outline's coincident points leave empty
    const out = normal.dot(mid.copy(p).add(q).add(r).divideScalar(3).sub(centre)) >= 0
    for (const v of out ? [p, q, r] : [p, r, q]) position.push(v.x, v.y, v.z)
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((position.length / 3) * 2), 2))
  g.computeVertexNormals()
  return g
}

/** A rectangle `w` by `d` about `(ox, oz)` with its corners cut `c` m back: an outline for `loft`. */
export function oct(w: number, d: number, c: number, ox = 0, oz = 0): Pt[] {
  const [x, z] = [w / 2, d / 2]
  c = Math.max(0.01, Math.min(c, x - 0.05, z - 0.05))
  // prettier-ignore
  return [[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]]
    .map(([px, pz]) => [px + ox, pz + oz] as const)
}

/** A ball of radius about 1 with `detail` rounds of faces, every corner pushed in or out by up to `rough` of it. */
export function blob(seed: number, detail: number, rough = 0.2): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    // The same push for every copy of a corner, from where it stands.
    const k =
      Math.sin(seed * 12.9898 + Math.round(v.x * 50) * 78.233 + Math.round(v.y * 50) * 37.719 + Math.round(v.z * 50) * 11.131) * 43758.5453
    v.multiplyScalar(1 + (k - Math.floor(k) - 0.5) * 2 * rough)
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// The patterns of `./pattern` that draw a window in every bay, by number (`PATTERN`): what stands in for each where the
// faceted look builds without surface pattern. A window's width as a share of its bay (and the most, in m), its height
// as a share of its storey, how far up the storey its middle is, and whether it has a sill and shutters.
const WINDOWED: Record<
  number,
  { wide: number; most: number; tall: number; up: number; sill?: boolean; shutters?: boolean; strip?: boolean }
> = {
  3: { wide: 0.44, most: 1.6, tall: 0.42, up: 0.55, sill: true }, // storey
  4: { wide: 0.5, most: 2, tall: 0.2, up: 0.72 }, // wall
  5: { wide: 0.5, most: 2, tall: 0.2, up: 0.72 }, // back
  10: { wide: 0.44, most: 1.5, tall: 0.42, up: 0.55, sill: true }, // house
  11: { wide: 0.44, most: 1.5, tall: 0.42, up: 0.55, sill: true }, // rear
  17: { wide: 0.36, most: 1.3, tall: 0.42, up: 0.54, sill: true, shutters: true }, // home
  18: { wide: 0.36, most: 1.3, tall: 0.42, up: 0.54, sill: true, shutters: true }, // homeFront
  24: { wide: 0.8, most: 3, tall: 0.9, up: 0, strip: true }, // corrugated
}
// The patterns with a door in the middle bay of the ground floor, built as a box, and the one whose middle bay is left
// for the door its builder stands there.
const [DOORED, OPEN] = [new Set([5, 11, 24]), 18]

/** A part of a wall's windows; a door says which way it opens, in its box's own frame. */
export type WindowPart = {
  box: THREE.BufferGeometry
  part: 'glass' | 'sill' | 'shutter' | 'door' | 'paint'
  paint?: string
  face?: [number, number]
}

const CLUMP = blob(31, 0, 0.24)
const PLANTERS = ['#b5704f', '#8a5a3c', '#e9e4da']
const GREENS = ['#5fbc51', '#7bcd5d', '#4fae5a', '#92d76e']
const BLOOMS = ['#ff9cbb', '#ffd35c', '#ffffff', '#f4788e', '#bc9ef2']

/**
 * The windows of a box that wears `cladding` (`./pattern`'s, as `clad` lays it), as boxes standing a little out of its
 * walls in its own frame: a pane in every bay of every storey, with a sill and shutters where its pattern draws them,
 * and a door where its pattern draws one. Some windows have a flower box for a sill, and where the box stands on the
 * `ground`, pots of leaves stand along the foot of its walls. `draw` (0 to 1) says which.
 */
export function windowBoxes(
  geo: THREE.BufferGeometry,
  cladding: { front?: number; back?: number; sides?: number; bay?: number; storey?: number },
  ground: boolean,
  draw: () => number,
): WindowPart[] {
  geo.computeBoundingBox()
  const { min, max } = geo.boundingBox!
  const [w, h, d] = [max.x - min.x, max.y - min.y, max.z - min.z]
  const { bay = 3, storey = h } = cladding
  const storeys = Math.max(1, Math.round(h / storey))
  const tall = h / storeys
  const out: WindowPart[] = []
  const of = <T>(a: T[]) => a[Math.floor(draw() * a.length)]
  // Each wall: its pattern, whether it faces ∓z, and where it stands.
  const walls = [
    { kind: cladding.front, endOn: true, at: min.z, sign: -1 },
    { kind: cladding.back, endOn: true, at: max.z, sign: 1 },
    { kind: cladding.sides, endOn: false, at: min.x, sign: -1 },
    { kind: cladding.sides, endOn: false, at: max.x, sign: 1 },
  ]
  for (const { kind, endOn, at, sign } of walls) {
    const spec = kind === undefined ? undefined : WINDOWED[kind]
    if (!spec) continue
    const across = endOn ? w : d
    const bays = Math.max(1, Math.round(across / bay))
    const pitch = across / bays
    /** A box `bw` wide, `bh` tall and `deep` out of the wall, its middle `along` the wall and its foot at `y`. */
    const box = (bw: number, bh: number, deep: number, along: number, y: number) => {
      const g = endOn ? new THREE.BoxGeometry(bw, bh, deep) : new THREE.BoxGeometry(deep, bh, bw)
      const u = (endOn ? min.x : min.z) + along
      return g.toNonIndexed().translate(endOn ? u : at + (sign * deep) / 2, y + bh / 2, endOn ? at + (sign * deep) / 2 : u)
    }
    /** A clump of leaves of radius `r`, its middle `along` the wall, `away` m out of it and at `y`. */
    const leaves = (r: number, along: number, away: number, y: number, squash = 0.8) => {
      const u = (endOn ? min.x : min.z) + along
      return CLUMP.clone()
        .rotateY(draw() * 6.28)
        .scale(r, r * squash, r)
        .translate(endOn ? u : at + sign * away, y, endOn ? at + sign * away : u)
    }
    const middle = Math.floor(bays / 2)
    for (let s = 0; s < (spec.strip ? 1 : storeys); s++) {
      for (let b = 0; b < bays; b++) {
        const along = pitch * (b + 0.5)
        if (s === 0 && b === middle && DOORED.has(kind!)) {
          out.push({ box: box(1, 2.05, 0.12, along, min.y + 0.05), part: 'door', face: endOn ? [0, sign] : [sign, 0] })
          continue
        }
        if (s === 0 && b === middle && kind === OPEN && bays % 2) continue
        const bw = Math.min(spec.most, pitch * spec.wide)
        const bh = spec.strip ? spec.tall : tall * spec.tall
        const y = spec.strip ? max.y - 0.5 - bh : min.y + (s + spec.up) * tall - bh / 2
        out.push({ box: box(bw, bh, 0.16, along, y), part: 'glass' })
        if (spec.sill && draw() < 0.34) {
          // A flower box for a sill: leaves along it, and a bloom or two among them.
          out.push({ box: box(bw + 0.2, 0.26, 0.38, along, y - 0.26), part: 'paint', paint: of(PLANTERS) })
          for (const k of [-1, 0, 1])
            out.push({
              box: leaves(0.2 + draw() * 0.08, along + k * bw * 0.32, 0.2, y + 0.08),
              part: 'paint',
              paint: of(draw() < 0.4 ? BLOOMS : GREENS),
            })
          if (draw() < 0.4)
            out.push({ box: leaves(0.15, along + (draw() - 0.5) * bw * 0.7, 0.36, y - 0.3, 2), part: 'paint', paint: of(GREENS) })
        } else if (spec.sill) out.push({ box: box(bw + 0.24, 0.09, 0.3, along, y - 0.09), part: 'sill' })
        if (spec.shutters) for (const k of [-1, 1]) out.push({ box: box(bw * 0.3, bh, 0.1, along + k * bw * 0.68, y), part: 'shutter' })
      }
    }
    // Pots along the wall's foot, between its bays and at its ends.
    if (ground)
      for (let b = 0; b <= bays; b++) {
        if (draw() > 0.6) continue
        const along = Math.min(across - 0.45, Math.max(0.45, pitch * b))
        const size = 0.5 + draw() * 0.22
        out.push({
          box: box(size, size * 0.9, size, along, min.y).translate(endOn ? 0 : sign * 0.12, 0, endOn ? sign * 0.12 : 0),
          part: 'paint',
          paint: of(PLANTERS),
        })
        out.push({
          box: leaves(size * 0.85, along, 0.12 + size / 2, min.y + size * 1.35, 1 + draw() * 0.5),
          part: 'paint',
          paint: of(draw() < 0.2 ? BLOOMS : GREENS),
        })
      }
  }
  return out
}

/** Somewhere a walker can go (`./prototype-walkers`): a door's step or a bench, at `(x, y)`, its front facing `ry` as the kit's frames do. */
export interface Place {
  kind: 'door' | 'bench'
  x: number
  y: number
  ry: number
}
const places = new Map<string, Place>()
/** Note a place as the kit builds it; one built again where it stood, as a Stage-up builds it, is the same place. */
export const notePlace = (kind: Place['kind'], x: number, y: number, ry: number) => {
  if (FACET) places.set(`${kind}:${x.toFixed(1)}:${y.toFixed(1)}`, { kind, x, y, ry })
}
/** Every place noted so far, and how many, to tell when there are more. */
export const allPlaces = () => [...places.values()]
export const placeCount = () => places.size

/** Somewhere off the Road a car can stand (`../sim/prototype-signals`): a house's carport or a shop's bay, the car's front facing `ry`. */
export interface Stand {
  kind: 'home' | 'shop'
  x: number
  y: number
  ry: number
}
const stands = new Map<string, Stand>()
/**
 * Whether the parked car a Zone lays at `(x, y)` is left out for the cars of the traffic to take its place, as most
 * are under the faceted look; if so, the place is noted.
 */
export const standAt = (kind: Stand['kind'], x: number, y: number, ry: number) => {
  if (!FACET) return false
  const k = Math.sin(Math.round(x * 10) * 12.9898 + Math.round(y * 10) * 78.233) * 43758.5453
  if (k - Math.floor(k) > 0.7) return false
  stands.set(`${x.toFixed(1)}:${y.toFixed(1)}`, { kind, x, y, ry })
  return true
}
export const allStands = () => [...stands.values()]
