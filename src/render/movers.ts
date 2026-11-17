import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../sim/demand'
import type { Polyline } from '../sim/geometry'
import { DAY, WIND, WORK, type Glow } from './day'
import { spot, type Fate } from './kit'
import type { Build } from './scenery'
import { canvasTexture, tint } from './shapes'

// The details that move on their own (#149): each Zone's, drawn instanced and placed every frame, outside the merged
// static scenery. A mover works a loop that its Block's fill lays out, a stretch at a time, and rests at the end of a
// stretch: it sets out each morning and stops for the night once it has worked the day's stretches. A chimney's smoke
// (#150) rises through the same working day, washing and futons (#155) hang out through it and sway in the wind,
// beacons (#155) blink at night, and pools of light (#174) lie warm on the ground under the lights.

/** The kinds of mover, each with its own model. */
export type MoverKind = 'tractor' | 'truck' | 'forklift' | 'butterfly' | 'gondola' | 'shopper'

/** A mover as a Block's fill lays it out, riding the brick of its build at `brick`. */
export interface Mover {
  kind: MoverKind
  /** The loop it works, closed: its last point is its first. */
  loop: Polyline
  /** How far along `loop` each stretch of work ends, in order: where it may stop for the night. */
  stops: number[]
  /** s it waits at each stop before setting out on the stretch from there (#150). None unless given. */
  waits?: number[]
  /** Whether it drives the stretch from each stop in reverse, facing the way it came (#150). None unless given. */
  reverse?: boolean[]
  /** The colour its model's white parts take (#150). White unless given. */
  paint?: string
  /**
   * The wall it works, when it works one (#154): its loop is drawn on the wall's face, x along it from `(x, y)` and y up
   * it from `h`, and it always faces out of the wall, `heading` (0 east, π/2 north). Along the wall runs to its right.
   */
  face?: { x: number; y: number; heading: number }
  /** m above `h` of the arm it hangs from, by two ropes that pay out as it goes down (#154). None unless given. */
  hang?: number
  /** Whether it works whole laps of its loop a day, so that it ends each day at the stop it set out from (#154). */
  laps?: boolean
  /** The stop it sets out from on the first day. */
  first: number
  /** m above the road it drives on. */
  h: number
  /** The index in its build of the brick it arrives with. */
  brick: number
}

/**
 * A chimney's smoke (#150): puffs rise from `at`, its top, in Three coordinates, once the brick at `brick` stands. Steam
 * (#175), from a noodle shop's vent or a food stall's pot, is smaller, quicker and fainter.
 */
export interface Plume {
  at: THREE.Vector3
  brick: number
  steam?: boolean
}

/** The kinds of thing that flies from a pole and flutters in the wind (#154), each with its own model and wave: a flag, or a shop's nobori banner (#153). */
export type FlagKind = 'flag' | 'nobori'

/**
 * Something that flies from the top of a pole at `at`, in Three coordinates, and flutters in the wind (#154): a flag.
 * It flies downwind in `colour`, or turned `ry` as the kit turns a shape if it hangs from a rod as a nobori does (#153),
 * is lowered to `low` m above the road and furled for the night, and rides its pole's brick at `brick`.
 */
export interface Flag {
  kind: FlagKind
  at: THREE.Vector3
  low: number
  colour: string
  brick: number
  ry?: number
}

/** A beacon's colour (#155): white or amber, never the Jam's red. */
export type BeaconColour = 'white' | 'amber'

/** A beacon (#155): a bulb of radius `r` at `at`, in Three coordinates, riding the brick at `brick`, that blinks at night. */
export interface Beacon {
  at: THREE.Vector3
  r: number
  colour: BeaconColour
  brick: number
}

/**
 * A pool of light on the ground (#174): a warm decal `w` by `d` centred on `at`, in Three coordinates, turned `ry` as the
 * kit turns a shape, in `colour` at the strength of its light, riding the brick at `brick` of what lights it, and lit as
 * the lamps are. No light source: it adds its glow to the ground under it.
 */
export interface Pool {
  at: THREE.Vector3
  w: number
  d: number
  ry: number
  colour: THREE.Color
  brick: number
}

/** The kinds of thing that hangs and sways in the wind, each with its own model. */
export type SwayKind = 'laundry' | 'futon' | 'washing' | 'cloth'

/**
 * Something that hangs from a line and sways in the wind (#155): laundry on a pole, a futon over a railing. It hangs
 * from `at`, in Three coordinates, on a line turned `ry` as the kit turns a shape (0 along x, as a front facing north
 * runs), out of the building on the side a front facing `ry` looks, riding the brick at `brick`.
 */
export interface Sway {
  kind: SwayKind
  at: THREE.Vector3
  ry: number
  /** The colour its model's white parts take. White unless given. */
  paint?: string
  /** How far its model stretches along its line and down from it (#157): 1 and 1 unless given. */
  size?: [number, number]
  brick: number
}

/** The movers' share of the working day (`WORK`) left free. */
const SLACK = 0.2
/** Real seconds of work in a day. */
const SHIFT = (WORK.to - WORK.from) * DAY
// Per kind: m/s, how high it bobs (m) and how fast (rad/s) while it drives, and its model. One that flies (#152) rises
// `fly.up` m off its path between stops, easing up and down over `fly.ease` m at each end of a stretch, and one with
// wings beats them `beat` times a second in flight and rests them nearly closed (`WINGS`).
interface Kind {
  speed: number
  bob: number
  rate: number
  model: () => THREE.BufferGeometry
  fly?: { up: number; ease: number }
  beat?: number
}
const KINDS: Record<MoverKind, Kind> = {
  tractor: { speed: 2.8, bob: 0.035, rate: 15, model: tractor },
  truck: { speed: 2.2, bob: 0.02, rate: 11, model: truck },
  forklift: { speed: 1.8, bob: 0.015, rate: 13, model: forklift },
  butterfly: { speed: 1.4, bob: 0.28, rate: 4.5, model: butterfly, fly: { up: 0.9, ease: 1.6 }, beat: 7 },
  gondola: { speed: 1, bob: 0, rate: 0, model: gondola },
  shopper: { speed: 1.15, bob: 0.04, rate: 9, model: shopper }, // #175
}
// How a resting butterfly holds its wings (rad up from flat): nearly closed over its back, fanning a little by day.
const WINGS = { rest: 1.25, fan: 0.22, night: 1.45, open: 0.35, sweep: 0.8 }
// Smoke (#150): s between puffs from a chimney, how long a puff lasts (s), how fast it rises (m/s) and how the wind
// carries it (m/s, Three's x and z), its radius as it leaves the chimney and as it fades (m), how opaque it starts, and
// its colour.
const SMOKE = { every: 0.6, lasts: 5.5, rise: 1.6, wind: [WIND.x, -WIND.y], from: 0.7, to: 2.5, opacity: 0.92, colour: '#f4f1ea' }
// Steam (#175), from a noodle shop's vent or a food stall's pot: puffs as smoke's, but quicker, smaller and fainter, and
// slower on the wind.
const STEAM = { every: 0.35, lasts: 2.4, rise: 1.3, wind: 0.35, from: 0.3, to: 1.15, fade: 0.7 }
// Flying things (#154), per kind: its model, flying along +x from its pole at x = 0, its top edge on y = 0 and its face
// to +z, white for the colour each takes (or, as its `painted` share has it, its own: #153); how far it reaches from the
// pole and how far its free end swings (m); and how many waves run along it.
const FLAGS: Record<FlagKind, { model: () => THREE.BufferGeometry; reach: number; swing: number; waves: number }> = {
  flag: { model: () => new THREE.PlaneGeometry(2.3, 1.45, 8, 2).translate(1.15, -0.725, 0), reach: 2.3, swing: 0.32, waves: 1.3 },
  nobori: { model: nobori, reach: 0.76, swing: 0.2, waves: 0.6 }, // #153
}
// How fast every flying thing's waves run (rad/s), and the share of the day it takes to raise or lower one, at the
// start and the end of the working day.
const FLUTTER = { rate: 7, raise: 0.02 }
// ponytail: the most puffs drawn at once over the whole City, about 450 chimneys' worth: past it the newest builds'
// chimneys smoke unseen. Grow the mesh with the puffs, as `remesh` does the movers', if a City ever smokes more.
const PUFFS = 4096
// Beacons (#155): s between flashes, the share of that the flash holds before it fades, how fast it fades, how dimly it
// glows between flashes, and how bright a flash is for the lamps' glow; the colours, white or amber.
const BLINK = { every: 2, hold: 0.4, fade: 14, rest: 0.04, bright: 1 }
const BEACONS: Record<BeaconColour, string> = { white: '#fff3e2', amber: '#ffb24a' }
// Swaying (#155): per kind, how far it swings each way (rad), how fast (rad/s), and its model.
const SWAYS: Record<SwayKind, { swing: number; rate: number; model: () => THREE.BufferGeometry }> = {
  laundry: { swing: 0.2, rate: 2.4, model: laundry },
  futon: { swing: 0.04, rate: 1.6, model: futon },
  washing: { swing: 0.24, rate: 2.4, model: washing }, // #156
  cloth: { swing: 0.2, rate: 2.4, model: () => part(1, 1, 0.05, 0, -1, 0, '#ffffff') }, // #157: one piece pegged to a pole, stretched to its size
}
// Each is hung out over the first share of the working day (of the day's clock) and taken in over its last, at its own
// moment, and takes this share of the day to come or go.
const HANG = { out: 0.05, in: 0.06, takes: 0.004 }
// Pools of light (#174): how much of its colour a pool adds at its middle for the lamps' glow; how much of the moonlight
// on the ground it takes the place of there, without which a warm light added to the bright blue night comes out
// white; and how it fades out to its edge (the share of both at each share of the way out).
const POOLS = {
  bright: 0.26,
  dims: 0.6,
  fade: [
    [0, 1],
    [0.4, 0.82],
    [0.72, 0.36],
    [1, 0],
  ],
}

/** A box `w` by `h` by `d` centred on `(x, z)` with its bottom at `y`, painted. */
const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
  tint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color)
/** A wheel of radius `r` and width `w` on an axle across the model at `x`, `z` out from the middle, `sides` round. */
const wheel = (r: number, w: number, x: number, z: number, color: string, sides = 14) =>
  tint(new THREE.CylinderGeometry(r, r, w, sides).rotateX(Math.PI / 2).translate(x, r, z), color)
/** The parts merged into one model. */
const merged = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!

/**
 * A little tractor (#149), facing +x, centred under its middle and standing on y = 0, oversized as the cars are so it
 * reads with the whole City framed: big wheels behind, a persimmon bonnet, and a white canopy over the seat.
 */
function tractor(): THREE.BufferGeometry {
  const [BODY, TYRE, DARK, CANOPY] = ['#ea8548', '#2f3440', '#4a525c', '#f4f1ea']
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
    tint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color)
  const parts = [
    wheel(0.62, 0.34, -0.55, 0.6, TYRE),
    wheel(0.62, 0.34, -0.55, -0.6, TYRE),
    wheel(0.36, 0.24, 0.9, 0.5, TYRE),
    wheel(0.36, 0.24, 0.9, -0.5, TYRE),
    box(1.35, 0.62, 0.66, 0.6, 0.86, 0, BODY), // the bonnet
    box(0.06, 0.5, 0.56, 1.29, 0.84, 0, DARK), // its grille
    box(0.85, 0.5, 0.72, -0.48, 0.86, 0, BODY),
    box(0.84, 0.1, 0.4, -0.55, 1.3, 0.6, BODY), // mudguards
    box(0.84, 0.1, 0.4, -0.55, 1.3, -0.6, BODY),
    box(0.36, 0.14, 0.42, -0.62, 1.18, 0, DARK), // the seat
    box(0.06, 0.42, 0.06, -0.22, 1.3, 0, DARK), // the wheel's column
    box(1.08, 0.08, 1.02, -0.6, 2.18, 0, CANOPY),
    tint(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6).translate(0.95, 1.42, 0.2), DARK), // the exhaust
  ]
  for (const x of [-1.04, -0.16]) for (const z of [-0.44, 0.44]) parts.push(box(0.06, 1.02, 0.06, x, 1.65, z, CANOPY))
  return merged(parts).translate(-0.1, 0, 0).scale(1.3, 1.3, 1.3)
}

/**
 * A small box truck (#150), the flat-fronted kind that works Japanese towns, facing +x, centred under its middle and
 * standing on y = 0: a cab over its front wheels and a tall box behind, 6.5 m long and oversized across as the cars
 * are. Cab and box are white, for the paint each truck takes.
 */
function truck(): THREE.BufferGeometry {
  const [PAINT, TYRE, DARK, GLASS, TRIM] = ['#ffffff', '#2f3440', '#4a525c', '#41566c', '#c4ccd4']
  const parts = [
    part(6.2, 0.34, 1.9, 0, 0.5, 0, DARK), // the chassis
    part(1.5, 1.95, 2.3, 2.5, 0.75, 0, PAINT), // the cab
    part(0.06, 0.78, 2.1, 3.26, 1.75, 0, GLASS), // its windscreen
    part(0.9, 0.62, 0.06, 2.62, 1.78, 1.16, GLASS), // its side windows
    part(0.9, 0.62, 0.06, 2.62, 1.78, -1.16, GLASS),
    part(0.16, 0.36, 2.36, 3.22, 0.48, 0, TRIM), // the bumper
    part(4.75, 2.55, 2.4, -0.68, 0.86, 0, PAINT), // the box
    part(0.08, 2.45, 2.3, -3.07, 0.9, 0, TRIM), // its doors at the back
  ]
  for (const x of [2.35, -1.45, -2.25]) for (const z of [0.9, -0.9]) parts.push(wheel(0.46, 0.4, x, z, TYRE, 8))
  return merged(parts)
}

/**
 * A forklift (#150), forks first along +x, centred under its middle and standing on y = 0, oversized as the cars are:
 * a yellow body and counterweight, a dark mast with its forks low, and a guard over the seat.
 */
function forklift(): THREE.BufferGeometry {
  const [BODY, TYRE, DARK, FORKS] = ['#f0c75e', '#2f3440', '#4a525c', '#9aa3ad']
  const parts = [
    part(1.5, 0.75, 1.1, -0.05, 0.3, 0, BODY), // the body
    part(0.45, 0.95, 1.12, -0.72, 0.3, 0, BODY), // the counterweight
    part(0.42, 0.12, 0.5, -0.25, 1.05, 0, DARK), // the seat
    part(0.08, 0.5, 0.08, -0.4, 1.05, 0, DARK), // its back
    part(1.2, 0.07, 1.06, -0.15, 2.1, 0, DARK), // the guard over the seat
    part(0.12, 1.94, 0.18, 0.78, 0.25, 0.38, DARK), // the mast
    part(0.12, 1.94, 0.18, 0.78, 0.25, -0.38, DARK),
    part(0.08, 0.6, 0.86, 0.88, 0.12, 0, DARK), // the carriage
    part(1.05, 0.06, 0.16, 1.42, 0.1, 0.28, FORKS),
    part(1.05, 0.06, 0.16, 1.42, 0.1, -0.28, FORKS),
  ]
  for (const x of [-0.7, 0.36]) for (const z of [-0.5, 0.5]) parts.push(part(0.06, 1.1, 0.06, x, 1.02, z * 1.02, DARK))
  for (const z of [0.48, -0.48]) parts.push(wheel(0.3, 0.24, 0.45, z, TYRE, 8), wheel(0.25, 0.22, -0.55, z, TYRE, 8))
  return merged(parts).translate(-0.3, 0, 0).scale(1.3, 1.3, 1.3)
}

/**
 * A shopper (#175) walking a shops Tile's pavement and stopping at the fronts, as tall as the walkers: legs, a coat in
 * white for its paint, a head and hair, and a bag at its side. Faces +x.
 */
function shopper(): THREE.BufferGeometry {
  const [LEGS, SKIN, HAIR, BAG] = ['#3a4252', '#f1d1b5', '#3a3330', '#f4ead2']
  return merged([
    part(0.26, 0.82, 0.4, 0, 0, 0, LEGS),
    part(0.36, 0.74, 0.62, 0, 0.8, 0, '#ffffff'), // the coat
    part(0.32, 0.32, 0.32, 0.02, 1.54, 0, SKIN),
    part(0.34, 0.12, 0.34, 0, 1.82, 0, HAIR),
    part(0.24, 0.34, 0.1, 0.04, 0.58, 0.37, BAG),
  ])
}

/**
 * A line of washing (#155), hanging from a pole along x at y = 0, oversized a little as the moving details are: towels
 * and shirts in pale colours, out of the building along -z.
 */
function laundry(): THREE.BufferGeometry {
  const parts = [tint(new THREE.CylinderGeometry(0.045, 0.045, 3.9, 6).rotateZ(Math.PI / 2), '#c4ccd4')]
  const CLOTHS = ['#ffffff', '#fbd2dd', '#fbe3a2', '#d6efe6']
  ;[-1.38, -0.46, 0.46, 1.38].forEach((x, i) => {
    if (i % 2)
      parts.push(part(0.66, 0.82, 0.05, x, -0.98, 0, CLOTHS[i]), part(1.1, 0.28, 0.05, x, -0.34, 0, CLOTHS[i])) // a shirt
    else parts.push(part(0.76, 1.05 - 0.15 * (i / 2), 0.05, x, -1.05 + 0.15 * (i / 2), 0, CLOTHS[i])) // a towel
  })
  return merged(parts)
}

/**
 * A futon aired over a railing whose top runs along x at y = 0 (#155): a thick quilt folded over it, most of it hanging
 * out of the building along -z. White, for the cover each takes.
 */
function futon(): THREE.BufferGeometry {
  const PAINT = '#ffffff'
  return merged([
    part(1.7, 0.14, 0.42, 0, 0, 0, PAINT), // over the rail
    part(1.7, 1.05, 0.14, 0, -1, -0.24, PAINT), // hanging out
    part(1.7, 0.55, 0.14, 0, -0.5, 0.24, PAINT), // and in
  ])
}

/** A part whose paint share is `share`: 1 takes its instance's paint, 0 keeps its own colour (#156). */
const painted = (geo: THREE.BufferGeometry, share: number) =>
  geo.setAttribute('painted', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(share), 1))

/** Have a material paint each vertex its instance's colour as its `painted` share has it (#156). */
const takesPaint = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float painted;').replace(
    '#include <color_vertex>',
    `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
\tvColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, painted);
#endif`,
  )
}

/**
 * A nobori banner's cloth (#153), flying along +x from its pole as the flags do, its top edge on the rod across the
 * pole's top: 0.72 m wide and 2.4 m tall, oversized as the props are. The cloth takes the paint, and a pale band of
 * lettering down its middle keeps its own colour.
 */
function nobori(): THREE.BufferGeometry {
  const cloth = (x0: number, x1: number, y0: number, y1: number, colour: string, share: number) =>
    painted(tint(new THREE.PlaneGeometry(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2, 0), colour), share)
  return merged([
    cloth(0.04, 0.29, -2.4, 0, '#ffffff', 1),
    cloth(0.29, 0.51, -0.3, 0, '#ffffff', 1),
    cloth(0.29, 0.51, -2.1, -0.3, '#fbf8f2', 0), // the lettering
    cloth(0.29, 0.51, -2.4, -2.1, '#ffffff', 1),
    cloth(0.51, 0.76, -2.4, 0, '#ffffff', 1),
  ])
}

/**
 * A short line of washing (#156), hanging from a pole 2.6 m along x at y = 0, for a balcony's bay or a house's upper
 * floor, oversized a little as the moving details are: a towel and a hand towel in the paint each line takes, and a pink
 * shirt and a mint towel that keep their colours, so a line reads bright against pale walls.
 */
function washing(): THREE.BufferGeometry {
  const keep = (w: number, h: number, x: number, y: number, colour: string) => painted(part(w, h, 0.05, x, y, 0, colour), 0)
  const take = (w: number, h: number, x: number, y: number) => painted(part(w, h, 0.05, x, y, 0, '#ffffff'), 1)
  return merged([
    painted(tint(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6).rotateZ(Math.PI / 2), '#c4ccd4'), 0),
    take(0.55, 0.95, -0.95, -0.97), // a towel
    keep(0.5, 0.72, -0.22, -0.88, '#ff9cbb'), // a shirt
    keep(0.8, 0.24, -0.22, -0.3, '#ff9cbb'),
    keep(0.48, 0.82, 0.5, -0.84, '#64cb9f'), // a towel
    take(0.38, 0.58, 1.02, -0.6), // a hand towel
  ])
}

/**
 * A butterfly (#152), facing +x and centred on its body, its wings flat along z: a dark body and four white wings with
 * dark tips, for the paint each takes, about 0.85 m across, oversized so that it reads close up. Its wings beat in the
 * vertex shader (`createMovers`), about the body, by the angle each instance's `wing` gives.
 */
function butterfly(): THREE.BufferGeometry {
  const [WING, DARK] = ['#ffffff', '#4a525c']
  /** A flat polygon in the xz plane, fanned from its first point, mirrored to -z if `mirror`. */
  const flat = (pts: [number, number][], y: number, color: string, mirror: boolean) => {
    const v: number[] = []
    for (let i = 1; i < pts.length - 1; i++) for (const [x, z] of [pts[0], pts[i], pts[i + 1]]) v.push(x, y, mirror ? -z : z)
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return tint(g, color)
  }
  // The right wings' outlines (m, x forward and z out from the body): the forewing, its dark tip, and the hindwing.
  // prettier-ignore
  const [fore, tip, hind]: [number, number][][] = [
    [[0.09, 0.03], [-0.03, 0.03], [0.02, 0.3], [0.17, 0.27]],
    [[0.08, 0.24], [0.03, 0.3], [0.16, 0.27]],
    [[-0.02, 0.03], [-0.15, 0.04], [-0.17, 0.19], [-0.04, 0.21]],
  ]
  const parts = [part(0.3, 0.06, 0.06, -0.02, -0.03, 0, DARK).deleteAttribute('uv')]
  for (const mirror of [false, true]) parts.push(flat(fore, 0, WING, mirror), flat(tip, 0.004, DARK, mirror), flat(hind, 0, WING, mirror))
  return merged(parts).scale(1.4, 1.4, 1.4)
}

/** 0 to 1 eased in and out. */
const smooth = (k: number) => k * k * (3 - 2 * k)

/**
 * A window cleaners' cradle (#154), facing out of the wall along +x with the wall behind it, centred under its middle
 * and standing on y = 0, oversized a little as the cars are: a yellow platform 4 m long with rails round it, and two
 * cleaners in it.
 */
function gondola(): THREE.BufferGeometry {
  const [FRAME, RAIL, SHIRT, HAT, SKIN] = ['#f0c75e', '#9aa3ad', '#64cb9f', '#ffffff', '#f4ead2']
  const parts = [
    part(0.9, 0.22, 4, 0, 0, 0, FRAME), // the platform
    part(0.08, 1, 4, 0.41, 0.22, 0, FRAME), // the rail facing out
    part(0.9, 1, 0.08, 0, 0.22, 1.96, FRAME), // the rails at the ends
    part(0.9, 1, 0.08, 0, 0.22, -1.96, FRAME),
    part(0.06, 0.06, 4, -0.42, 1.16, 0, RAIL), // the rail by the wall
    part(0.12, 1.5, 0.12, -0.3, 0.22, 1.9, RAIL), // the stirrups the ropes hold
    part(0.12, 1.5, 0.12, -0.3, 0.22, -1.9, RAIL),
  ]
  for (const z of [-0.9, 0.85]) {
    parts.push(
      part(0.34, 0.9, 0.44, -0.08, 0.22, z, SHIRT),
      tint(new THREE.SphereGeometry(0.2, 8, 6).translate(-0.08, 1.32, z), SKIN),
      tint(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.08, 1.38, z), HAT),
    )
  }
  return merged(parts).scale(1.25, 1.25, 1.25)
}
/** The ropes a gondola hangs by, one at each end: 1 m tall from y = 0, to be stretched to their length. */
function ropes(): THREE.BufferGeometry {
  return merged([-1.9, 1.9].map((z) => part(0.05, 1, 0.05, -0.3 * 1.25, 0, z * 1.25, '#4a525c')))
}

/** How far up its pole a flag flies at the time of day `time` (0–1): raised as the working day starts, lowered as it ends. */
function hoisted(time: number): number {
  const t = (time - WORK.from + 1) % 1 // since the working day began
  return Math.max(0, Math.min(1, t / FLUTTER.raise, (WORK.to - WORK.from + FLUTTER.raise - t) / FLUTTER.raise))
}

/** Where `s` m along `line` lies, and the way it heads there: the segment found by halving, as a loop has hundreds. */
function along(line: Polyline, s: number): { x: number; y: number; heading: number } {
  const { pts, cum } = line
  let [lo, hi] = [1, pts.length - 1]
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cum[mid] < s) lo = mid + 1
    else hi = mid
  }
  const [a, b] = [pts[lo - 1], pts[lo]]
  const seg = cum[lo] - cum[lo - 1]
  const t = seg > 0 ? Math.min(1, Math.max(0, (s - cum[lo - 1]) / seg)) : 0
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x) }
}

/** How a build that plays stands now: brick `i`'s scale and how high it is lifted, or null once it plays no more. */
export interface Poses {
  pose(of: Build, i: number): { scale: number; lift: number } | null
}

/** A puff of smoke in the air: where it left its chimney, when (s run), its own drift, and whether it is steam (#175). */
interface Puff {
  x: number
  y: number
  z: number
  born: number
  dx: number
  dz: number
  steam?: boolean
}

/** The movers, plumes, flags, beacons and swaying things of one build, the reveal it may be playing on, and its plumes' puffs. */
interface Entry {
  build: Build
  movers: Mover[]
  flags: Flag[]
  plumes: { plume: Plume; next: number; draw: () => number }[]
  puffs: Puff[]
  /** Each beacon, and where it is in its blink (0–1) when the run starts. */
  beacons: { beacon: Beacon; phase: number }[]
  /** Each swaying thing, where it is in its swing when the run starts, and when (the day's clock) it is hung out and taken in. */
  sways: { sway: Sway; phase: number; out: number; in: number }[]
  /** The pools of light, and the index of the first in the City's mesh of them. */
  pools: Pool[]
  poolAt: number
  playing?: Poses
}

/**
 * The moving details of every build in the scene, one instanced mesh per kind. Where each mover is follows from the
 * work done, a clock that runs only through the working day and while the world runs, so a mover built again (by a
 * Swap, a Rezoning or a Stage-up) carries on from where it was. A mover arrives with its brick in the build's reveal,
 * and leaves with its build. Each chimney smokes while the working day runs, once its brick stands, its puffs one
 * instanced mesh of soft spheres that fade as they rise. The pools of light (#174) are laid once, and moved only while
 * their lights still arrive.
 * ponytail: every instance is placed each frame, parked or not, which is nothing at a few hundred. Skip the parked
 * ones if a City ever holds thousands.
 */
export function createMovers() {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  // Wings (#152): each vertex off the body turns up about it by its instance's `wing`, the left wing and the right
  // mirrored, and its normal with it.
  const winged = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })
  winged.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wing;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
\tfloat wSide = position.z > 0.035 ? 1.0 : (position.z < -0.035 ? -1.0 : 0.0);
\tfloat wC = cos(wing * abs(wSide));
\tfloat wS = sin(wing * abs(wSide));
\tobjectNormal = vec3(objectNormal.x, objectNormal.y * wC + wSide * objectNormal.z * wS, -wSide * objectNormal.y * wS + objectNormal.z * wC);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
\ttransformed = vec3(transformed.x, transformed.y * wC + wSide * transformed.z * wS, -wSide * transformed.y * wS + transformed.z * wC);`,
      )
  }
  const models = new Map((Object.keys(KINDS) as MoverKind[]).map((k) => [k, KINDS[k].model()]))
  const meshes = new Map<MoverKind, THREE.InstancedMesh>()
  const rope = ropes()
  let strung: THREE.InstancedMesh | null = null // the ropes of every mover that hangs
  // Flying things (#154), one mesh per kind for the whole City: each vertex swings across its flag, more toward the free
  // end, on waves that run out from the pole, each flag on a phase of its own; a wave's crest catches the light and its
  // trough falls in shade. Its shadow flutters with it.
  const wave = { value: 0 }
  const flutters = (kind: FlagKind) => (shader: THREE.WebGLProgramParametersWithUniforms) => {
    const { reach, swing, waves } = FLAGS[kind]
    const k = (n: number) => n.toFixed(4)
    shader.uniforms.wave = wave
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float phase;\nuniform float wave;\nvarying float vRipple;')
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          `float reach = position.x / ${k(reach)};`,
          `float swell = phase + wave - reach * ${k(waves * Math.PI * 2)};`,
          `transformed.z += ${k(swing)} * reach * sin(swell);`,
          'vRipple = 0.18 * reach * cos(swell);',
        ].join('\n\t'),
      )
  }
  const flyers = new Map(
    (Object.keys(FLAGS) as FlagKind[]).map((kind) => {
      const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })
      cloth.customProgramCacheKey = () => `flag ${kind}`
      cloth.onBeforeCompile = (shader) => {
        flutters(kind)(shader)
        takesPaint(shader)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vRipple;')
          .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= 1.0 + vRipple;')
      }
      const shadow = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide })
      shadow.customProgramCacheKey = () => `flag shadow ${kind}`
      shadow.onBeforeCompile = flutters(kind)
      const model = FLAGS[kind].model()
      return [kind, { model: model.getAttribute('painted') ? model : painted(tint(model, '#ffffff'), 1), cloth, shadow }]
    }),
  )
  const flown = new Map<FlagKind, THREE.InstancedMesh>()
  let entries: Entry[] = []
  let work = 0 // s worked: a whole number of shifts outside the working day
  let working = false
  let t = 0 // s run, for the bob and the smoke
  const [m, q, tilt, at, scale, up, across, white] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Quaternion(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Color('#ffffff'),
  ]

  // The puffs of smoke: soft spheres, each faded by its own share of the material's opacity.
  const fades = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1)
  const ball = new THREE.IcosahedronGeometry(1, 2)
  ball.setAttribute('fade', fades)
  const haze = new THREE.MeshStandardMaterial({
    color: SMOKE.colour,
    roughness: 1,
    transparent: true,
    depthWrite: false,
    opacity: SMOKE.opacity,
    emissive: SMOKE.colour, // a little light of its own, so that a puff's shaded side stays soft
    emissiveIntensity: 0.3,
  })
  haze.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFade = fade;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a *= vFade;')
  }
  const smoke = new THREE.InstancedMesh(ball, haze, PUFFS)
  smoke.name = 'smoke'
  smoke.count = 0
  smoke.frustumCulled = false
  smoke.renderOrder = 3
  group.add(smoke)

  // Beacons (#155): one instanced mesh of bulbs in their colours, each lit by its own share of the material's glow.
  const bulb = new THREE.IcosahedronGeometry(1, 1)
  const lens = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, emissive: '#ffffff', emissiveIntensity: 0 })
  lens.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float flash;\nvarying float vFlash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFlash = flash;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb * vFlash;')
  }
  let beacons: THREE.InstancedMesh | null = null
  let flashes = new THREE.InstancedBufferAttribute(new Float32Array(0), 1)
  // Swaying things (#155): one instanced mesh per kind. A model's parts take its instance's paint as their `painted`
  // share has it (#156): all of them unless the model says otherwise.
  const swayModels = new Map(
    (Object.keys(SWAYS) as SwayKind[]).map((k) => {
      const model = SWAYS[k].model()
      return [k, model.getAttribute('painted') ? model : painted(model, 1)]
    }),
  )
  const hanging = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  hanging.onBeforeCompile = takesPaint
  const swaying = new Map<SwayKind, THREE.InstancedMesh>()
  // Pools of light (#174): one instanced mesh of warm decals for the whole City, added to what lies under them, unlit
  // and untouched by tone mapping, as the contact shadows are, dimming the moonlight under them by `POOLS.dims` (its
  // alpha) as they add their own (its colour, premultiplied by it). Each takes its colour; the material's is the
  // lamps' glow.
  const warmth = new THREE.MeshBasicMaterial({
    map: canvasTexture(64, 64, (g) => {
      const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      for (const [at, a] of POOLS.fade) fade.addColorStop(at, `rgba(255,255,255,${a})`)
      g.fillStyle = fade
      g.fillRect(0, 0, 64, 64)
    }),
    transparent: true,
    opacity: POOLS.dims,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const decal = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  let pooled: THREE.InstancedMesh | null = null
  /** Lay entry `e`'s pools in the mesh of them, each as big as its light's brick stands: none while it falls in. */
  const layPools = (e: Entry) => {
    if (!pooled) return
    e.pools.forEach((p, i) => {
      const pose = e.playing?.pose(e.build, p.brick) ?? { scale: 1, lift: 0 }
      const k = pose.lift > 0.01 ? 0.001 : Math.max(0.001, pose.scale)
      pooled!.setMatrixAt(e.poolAt + i, m.compose(p.at, q.setFromAxisAngle(up, p.ry), scale.set(p.w * k, 1, p.d * k)))
    })
    pooled.instanceMatrix.needsUpdate = true
  }

  /** New instanced meshes for the movers, flags, beacons, swaying things and pools of light there are now. */
  const remesh = () => {
    for (const mesh of meshes.values()) {
      group.remove(mesh)
      mesh.dispose()
      if (mesh.geometry !== models.get(mesh.name as MoverKind)) mesh.geometry.dispose()
    }
    for (const mesh of [...swaying.values(), ...(beacons ? [beacons] : []), ...(pooled ? [pooled] : [])]) {
      group.remove(mesh)
      mesh.dispose()
    }
    beacons?.geometry.dispose() // its own copy of the bulb, carrying its flashes
    meshes.clear()
    if (strung) {
      group.remove(strung)
      strung.dispose()
      strung = null
    }
    for (const mesh of flown.values()) {
      group.remove(mesh)
      mesh.dispose()
      mesh.geometry.dispose() // its own copy of the model, carrying its phases
    }
    flown.clear()
    for (const [kind, { model, cloth, shadow }] of flyers) {
      const flying = entries.flatMap((e) => e.flags.filter((f) => f.kind === kind))
      if (!flying.length) continue
      // Each flag's phase, from where it flies, and its colour, which stay until the next remesh.
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(flying.map((f) => mulberry32(spot(f.at.x, -f.at.z))() * 7)), 1)
      const mesh = new THREE.InstancedMesh(model.clone().setAttribute('phase', phase), cloth, flying.length)
      mesh.name = `${kind}s`
      mesh.castShadow = mesh.receiveShadow = true
      mesh.customDepthMaterial = shadow
      mesh.frustumCulled = false
      flying.forEach((f, i) => mesh.setColorAt(i, new THREE.Color(f.colour)))
      flown.set(kind, mesh)
      group.add(mesh)
    }
    const ropes = entries.reduce((n, e) => n + e.movers.filter((v) => v.hang).length, 0)
    if (ropes) {
      strung = new THREE.InstancedMesh(rope, material, ropes)
      strung.name = 'ropes'
      strung.frustumCulled = false
      group.add(strung)
    }
    swaying.clear()
    beacons = null
    pooled = null
    const lying = entries.reduce((n, e) => n + e.pools.length, 0)
    if (lying) {
      pooled = new THREE.InstancedMesh(decal, warmth, lying)
      pooled.name = 'pools'
      pooled.frustumCulled = false
      pooled.renderOrder = 2 // over the contact shadows, which it lights too
      let at = 0
      for (const e of entries) {
        e.poolAt = at
        e.pools.forEach((p, i) => pooled!.setColorAt(at + i, p.colour))
        at += e.pools.length
        layPools(e)
      }
      group.add(pooled)
    }
    const lights = entries.flatMap((e) => e.beacons)
    if (lights.length) {
      flashes = new THREE.InstancedBufferAttribute(new Float32Array(lights.length), 1)
      const geometry = bulb.clone()
      geometry.setAttribute('flash', flashes)
      beacons = new THREE.InstancedMesh(geometry, lens, lights.length)
      beacons.name = 'beacon'
      beacons.frustumCulled = false
      lights.forEach((b, i) => beacons!.setColorAt(i, new THREE.Color(BEACONS[b.beacon.colour])))
      group.add(beacons)
    }
    for (const [kind, model] of swayModels) {
      const hung = entries.flatMap((e) => e.sways.filter((s) => s.sway.kind === kind))
      if (!hung.length) continue
      const mesh = new THREE.InstancedMesh(model, hanging, hung.length)
      mesh.name = kind
      mesh.receiveShadow = true // too fine to cast a shadow worth its cost, a thousand at a time
      mesh.frustumCulled = false
      hung.forEach((s, i) => mesh.setColorAt(i, s.sway.paint ? new THREE.Color(s.sway.paint) : white))
      swaying.set(kind, mesh)
      group.add(mesh)
    }
    for (const [kind, model] of models) {
      const count = entries.reduce((n, e) => n + e.movers.filter((v) => v.kind === kind).length, 0)
      if (!count) continue
      // A winged kind's model carries each instance's wing angle, so it takes a copy of its own.
      const beats = KINDS[kind].beat !== undefined
      const geometry = beats ? model.clone().setAttribute('wing', new THREE.InstancedBufferAttribute(new Float32Array(count), 1)) : model
      const mesh = new THREE.InstancedMesh(geometry, beats ? winged : material, count)
      mesh.name = kind
      mesh.castShadow = !beats // a wing's shadow would not beat with it
      mesh.receiveShadow = true
      mesh.frustumCulled = false // instances move; the mesh's own bounds mean nothing
      meshes.set(kind, mesh)
      group.add(mesh)
    }
    // The paint each mover takes, which stays until the next remesh.
    const counts = new Map<MoverKind, number>()
    for (const e of entries) {
      for (const v of e.movers) {
        const mesh = meshes.get(v.kind)!
        const i = counts.get(v.kind) ?? 0
        counts.set(v.kind, i + 1)
        mesh.setColorAt(i, v.paint ? new THREE.Color(v.paint) : white)
      }
    }
  }

  /** How far along `v`'s loop it drives from stop `from` to the stop `count` stops on, going round as often as that takes. */
  const reachOf = ({ loop, stops }: Mover, from: number, count: number) => {
    const n = stops.length
    const part = count % n ? (((stops[(from + count) % n] - stops[from]) % loop.length) + loop.length) % loop.length : 0
    return Math.floor(count / n) * loop.length + part
  }
  /** s `v` takes from stop `from` to the stop `count` stops on, waiting at each stop on the way before it sets out. */
  const timeOf = (v: Mover, from: number, count: number) => {
    let waited = 0
    for (let k = 0; k < count; k++) waited += v.waits?.[(from + k) % v.stops.length] ?? 0
    return reachOf(v, from, count) / KINDS[v.kind].speed + waited
  }
  /**
   * How many stretches `v` works a day: as many as fit in the shift with some time left free, round its loop as often
   * as that takes (a forklift's, many times), and never more than the shift has time for, so that it always ends the
   * day at a stop.
   */
  /**
   * A phase of its own for each mover's bob and wingbeat (rad), from where its loop starts and the stop it sets out
   * from: an instance's index shifts whenever movers come or go, and a phase from it would jump (#152).
   */
  const phases = new WeakMap<Mover, number>()
  const phaseOf = (v: Mover) => {
    let phase = phases.get(v)
    if (phase === undefined) phases.set(v, (phase = mulberry32(spot(v.loop.pts[0].x, v.loop.pts[0].y) + v.first)() * Math.PI * 2))
    return phase
  }
  const perDay = new WeakMap<Mover, number>()
  const stretches = (v: Mover) => {
    let count = perDay.get(v)
    if (count) return count
    const n = v.stops.length
    count = Math.max(1, Math.floor(((1 - SLACK) * SHIFT * n) / timeOf(v, 0, n)))
    if (v.laps) count = n * Math.max(1, Math.floor(count / n))
    while (count > (v.laps ? n : 1) && v.stops.some((_, i) => timeOf(v, i, count!) > 0.95 * SHIFT)) count -= v.laps ? n : 1
    perDay.set(v, count)
    return count
  }

  /**
   * Where mover `v` is: on the day's stretches, from the stop the day before ended at, as far as the work done today
   * takes it, waiting at each stop on the way, so it stops at the end of a stretch and sets out from there next
   * morning. It faces back along the way it drives a stretch in reverse.
   */
  const place = (v: Mover) => {
    const { speed } = KINDS[v.kind]
    const { loop, stops, waits, reverse } = v
    const n = stops.length
    const count = stretches(v)
    const day = Math.floor(work / SHIFT)
    let from = (v.first + day * count) % n
    let left = work - day * SHIFT // s of today's work still to follow
    for (let k = 0; k < count; k++) {
      left -= waits?.[from] ?? 0
      if (left < 0) break
      const reach = reachOf(v, from, 1)
      if (left * speed < reach) {
        const p = along(loop, (stops[from] + left * speed) % loop.length)
        const off = Math.min(left * speed, reach - left * speed) // m from the nearer end of the stretch
        return onFace(v, { ...p, heading: p.heading + (reverse?.[from] ? Math.PI : 0), moving: working, off })
      }
      left -= reach / speed
      from = (from + 1) % n
    }
    // At stop `from`, facing as it came in: a stop at the loop's start is its end too.
    const p = along(loop, stops[from] || loop.length)
    return onFace(v, { ...p, heading: p.heading + (reverse?.[(from + n - 1) % n] ? Math.PI : 0), moving: false, off: 0 })
  }
  /** Where a place on `v`'s loop lies on the map, and m above `v.h`: for a mover that works a wall, on the wall's face. */
  const onFace = (v: Mover, p: { x: number; y: number; heading: number; moving: boolean; off: number }) => {
    if (!v.face) return { ...p, up: 0 }
    const { x, y, heading } = v.face
    return { ...p, x: x + p.x * Math.sin(heading), y: y - p.x * Math.cos(heading), up: p.y, heading }
  }

  /** Whether brick `i` of entry `e`'s build stands at rest, in its place and at full size. */
  const stands = (e: Entry, i: number) => {
    const pose = e.playing?.pose(e.build, i)
    return !pose || (pose.scale > 0.999 && Math.abs(pose.lift) < 0.01)
  }

  return {
    group,

    /** Show the movers, plumes, flags, beacons, swaying things and pools of light of `build`, arriving with their bricks as `playing` plays it, or at once. */
    add(build: Build, playing?: Poses) {
      if (
        !build.movers.length &&
        !build.plumes.length &&
        !build.flags.length &&
        !build.beacons.length &&
        !build.sways.length &&
        !build.pools.length
      )
        return
      const plumes = build.plumes.map((plume) => {
        const draw = mulberry32(spot(plume.at.x, -plume.at.z))
        return { plume, next: draw() * SMOKE.every, draw }
      })
      const beacons = build.beacons.map((beacon) => ({ beacon, phase: mulberry32(spot(beacon.at.x, -beacon.at.z))() }))
      const sways = build.sways.map((sway) => {
        const draw = mulberry32(spot(sway.at.x, -sway.at.z) ^ Math.round(sway.at.y * 100))
        const [phase, out, taken] = [draw() * Math.PI * 2, draw(), draw()]
        return { sway, phase, out: WORK.from + out * HANG.out, in: WORK.to - HANG.takes - taken * HANG.in }
      })
      entries.push({
        build,
        movers: build.movers,
        flags: build.flags,
        plumes,
        puffs: [],
        beacons,
        sways,
        pools: build.pools,
        poolAt: 0,
        playing,
      })
      if (build.movers.length || build.flags.length || beacons.length || sways.length || build.pools.length) remesh()
    },

    /** Take away what moves, smokes, blinks, flies, sways and lights the ground of the build whose meshes are `meshes`, as its meshes leave the scene. */
    drop(meshes: THREE.Mesh[]) {
      const kept = entries.filter((e) => e.build.meshes !== meshes)
      if (kept.length === entries.length) return
      const moved = entries.some(
        (e) => e.build.meshes === meshes && (e.movers.length || e.flags.length || e.beacons.length || e.sways.length || e.pools.length),
      )
      entries = kept
      if (moved) remesh()
    },

    /**
     * `dt` is the real seconds since the last frame, 0 while paused, `time` the time of day (0–1) and `glow` what glows
     * then: the movers work, the chimneys smoke and the washing hangs out only through the working day, and the beacons
     * blink as the lamps glow.
     */
    update(dt: number, time: number, glow?: Glow) {
      t += dt
      const was = working
      working = time >= WORK.from && time < WORK.to
      // At the end of the working day the day's work is done, so every mover stops at the end of its last stretch,
      // even when the time of day jumps there.
      if (was && !working) work = Math.ceil(work / SHIFT - 1e-6) * SHIFT
      if (working) work += dt
      // A build that has played out keeps only what its Stage has.
      let changed = false
      for (const e of entries) {
        if (!e.playing || e.playing.pose(e.build, 0)) continue
        const fate = (i: number): Fate => e.build.bricks[i].fate
        const kept = e.movers.filter((v) => fate(v.brick) !== 'goes')
        if (kept.length < e.movers.length) [e.movers, changed] = [kept, true]
        e.plumes = e.plumes.filter((p) => fate(p.plume.brick) !== 'goes')
        const flown = e.flags.filter((f) => fate(f.brick) !== 'goes')
        if (flown.length < e.flags.length) [e.flags, changed] = [flown, true]
        const [beacons, sways] = [
          e.beacons.filter((b) => fate(b.beacon.brick) !== 'goes'),
          e.sways.filter((s) => fate(s.sway.brick) !== 'goes'),
        ]
        if (beacons.length < e.beacons.length || sways.length < e.sways.length) [e.beacons, e.sways, changed] = [beacons, sways, true]
        const lying = e.pools.filter((p) => fate(p.brick) !== 'goes')
        if (lying.length < e.pools.length) [e.pools, changed] = [lying, true]
        e.playing = undefined
        layPools(e) // at full size, as it now stands
      }
      if (changed) remesh()
      const counts = new Map<MoverKind, number>()
      let roped = 0
      for (const e of entries) {
        for (const v of e.movers) {
          const mesh = meshes.get(v.kind)
          if (!mesh) continue
          const i = counts.get(v.kind) ?? 0
          counts.set(v.kind, i + 1)
          const pose = e.playing?.pose(e.build, v.brick) ?? { scale: 1, lift: 0 }
          const p = place(v)
          const { bob, rate, fly, beat } = KINDS[v.kind]
          // In flight, risen off its path, eased up from a stop and down onto the next.
          const rise = fly ? fly.up * smooth(Math.min(1, p.off / fly.ease)) : 0
          const phase = phaseOf(v)
          const hop = p.moving ? bob * Math.abs(Math.sin(t * rate + phase)) * (fly ? smooth(Math.min(1, p.off / fly.ease)) : 1) : 0
          const size = Math.max(0.001, pose.scale)
          q.setFromAxisAngle(up, p.heading)
          m.compose(at.set(p.x, v.h + p.up + pose.lift + rise + hop, -p.y), q, scale.setScalar(size))
          mesh.setMatrixAt(i, m)
          if (beat !== undefined) {
            const wing = mesh.geometry.getAttribute('wing') as THREE.InstancedBufferAttribute
            const angle = p.moving
              ? WINGS.open + WINGS.sweep * Math.sin(t * beat * Math.PI * 2 + phase)
              : working
                ? WINGS.rest + WINGS.fan * Math.sin(t * 1.3 + phase)
                : WINGS.night
            wing.setX(i, angle)
          }
          // Its ropes, from its stirrups up to the arm it hangs from.
          if (v.hang && strung) {
            const foot = v.h + p.up + pose.lift + 1.5
            m.compose(at.set(p.x, foot, -p.y), q, scale.set(size, Math.max(0.001, (v.hang + v.h - foot) * size), size))
            strung.setMatrixAt(roped++, m)
          }
        }
      }
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.needsUpdate = true
        const wing = mesh.geometry.getAttribute('wing')
        if (wing) wing.needsUpdate = true
      }
      if (strung) strung.instanceMatrix.needsUpdate = true

      // Flags: up their poles through the working day, downwind or as their rods turn them, and growing with their poles' bricks.
      wave.value = (wave.value + dt * FLUTTER.rate) % (Math.PI * 2000)
      if (flown.size) {
        const raised = hoisted(time)
        const downwind = Math.atan2(WIND.y, WIND.x)
        const counted = new Map<FlagKind, number>()
        for (const e of entries) {
          for (const f of e.flags) {
            const mesh = flown.get(f.kind)!
            const k = counted.get(f.kind) ?? 0
            counted.set(f.kind, k + 1)
            const pose = e.playing?.pose(e.build, f.brick) ?? { scale: 1, lift: 0 }
            const s = Math.max(0.001, pose.scale)
            const foot = e.build.bricks[f.brick].at // what its pole grows out of
            const y = f.low + (f.at.y - f.low) * raised
            at.set(foot.x + (f.at.x - foot.x) * s, foot.y + (y - foot.y) * s + pose.lift, foot.z + (f.at.z - foot.z) * s)
            m.compose(at, q.setFromAxisAngle(up, f.ry ?? downwind), scale.set(s * (0.06 + 0.94 * raised), s, s))
            mesh.setMatrixAt(k, m)
          }
        }
        for (const mesh of flown.values()) mesh.instanceMatrix.needsUpdate = true
      }

      // Smoke: each standing chimney puffs while the working day runs, and its puffs rise, swell and fade.
      let n = 0
      q.identity()
      for (const e of entries) {
        for (const p of e.plumes) {
          if (!working || !stands(e, p.plume.brick)) continue
          const steam = p.plume.steam
          for (p.next -= dt; p.next <= 0; p.next += steam ? STEAM.every : SMOKE.every) {
            const { x, y, z } = p.plume.at
            const [a, r] = [p.draw() * Math.PI * 2, (0.25 + 0.25 * p.draw()) * (steam ? 0.4 : 1)]
            e.puffs.push({ x, y, z, born: t + p.next, dx: Math.cos(a) * r, dz: Math.sin(a) * r, steam })
          }
        }
        e.puffs = e.puffs.filter((f) => t - f.born < (f.steam ? STEAM.lasts : SMOKE.lasts))
        for (const f of e.puffs) {
          if (n >= PUFFS) break
          const age = Math.max(0, t - f.born)
          const [lasts, rise, from, to, blow] = f.steam
            ? [STEAM.lasts, STEAM.rise, STEAM.from, STEAM.to, STEAM.wind]
            : [SMOKE.lasts, SMOKE.rise, SMOKE.from, SMOKE.to, 1]
          const k = age / lasts
          const [wx, wz] = SMOKE.wind
          at.set(f.x + (wx * blow + f.dx) * age, f.y + rise * age * (1 - 0.3 * k), f.z + (wz * blow + f.dz) * age)
          m.compose(at, q, scale.setScalar(from + (to - from) * Math.sqrt(k)))
          smoke.setMatrixAt(n, m)
          fades.setX(n, Math.min(1, age / 0.4) * (1 - k) ** 1.8 * (f.steam ? STEAM.fade : 1))
          n++
        }
      }
      smoke.count = n
      smoke.instanceMatrix.needsUpdate = true
      fades.needsUpdate = true

      // Beacons: each in its place, flashing on its own beat, lit only as the lamps are.
      lens.emissiveIntensity = (glow?.lamps ?? 0) * BLINK.bright
      if (beacons) {
        let i = 0
        q.identity()
        for (const e of entries) {
          for (const { beacon, phase } of e.beacons) {
            const pose = e.playing?.pose(e.build, beacon.brick) ?? { scale: 1, lift: 0 }
            at.copy(beacon.at).y += pose.lift
            beacons.setMatrixAt(i, m.compose(at, q, scale.setScalar(Math.max(0.001, pose.scale) * beacon.r)))
            const s = (t / BLINK.every + phase) % 1
            flashes.setX(i++, s < BLINK.hold ? 1 : BLINK.rest + (1 - BLINK.rest) * Math.exp(-(s - BLINK.hold) * BLINK.fade))
          }
        }
        beacons.instanceMatrix.needsUpdate = true
        flashes.needsUpdate = true
      }

      // Swaying things: hung out through the working day, each swinging on the wind about its line.
      const counted = new Map<SwayKind, number>()
      for (const e of entries) {
        for (const { sway, phase, out, in: taken } of e.sways) {
          const mesh = swaying.get(sway.kind)!
          const i = counted.get(sway.kind) ?? 0
          counted.set(sway.kind, i + 1)
          const pose = e.playing?.pose(e.build, sway.brick) ?? { scale: 1, lift: 0 }
          const hung = Math.max(0, Math.min(1, (time - out) / HANG.takes, (taken - time) / HANG.takes))
          const { swing, rate } = SWAYS[sway.kind]
          const gust = 0.65 + 0.35 * Math.sin(t * 0.31 + phase * 1.7)
          tilt.setFromAxisAngle(across, swing * gust * (0.35 + Math.sin(t * rate + phase)))
          q.setFromAxisAngle(up, sway.ry).multiply(tilt)
          at.copy(sway.at).y += pose.lift
          const [k, [sx, sy]] = [Math.max(0.001, pose.scale * hung), sway.size ?? [1, 1]]
          mesh.setMatrixAt(i, m.compose(at, q, scale.set(sx * k, sy * k, k)))
        }
      }
      for (const mesh of swaying.values()) mesh.instanceMatrix.needsUpdate = true

      // Pools of light: lit as the lamps are, and hidden by day. Only those whose lights still arrive move.
      warmth.color.setScalar(((glow?.lamps ?? 0) * POOLS.bright) / POOLS.dims)
      if (pooled) {
        pooled.visible = warmth.color.r > 0
        for (const e of entries) if (e.playing) layPools(e)
      }
    },
  }
}
