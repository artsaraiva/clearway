import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import type { Polyline } from '../sim/geometry'
import { DAY, WIND, WORK, type Glow } from './day'
import { spot, type Fate } from './kit'
import { LOW_POLY } from './look'
import type { Build } from './scenery'
import { canvasTexture, merged, painted, part, takesPaint, tint } from './shapes'

// The details that move on their own (#149): each Zone's, drawn instanced and placed every frame, outside the merged
// static scenery. A mover works a loop that its Block's fill lays out, a stretch at a time, and rests at the end of a
// stretch: it sets out each morning and stops for the night once it has worked the day's stretches. A chimney's smoke
// (#150) rises through the same working day, washing and futons (#155) hang out through it and sway in the wind,
// beacons (#155) blink at night, and pools of light (#174) lie warm on the ground under the lights.

/** The kinds of mover, each with its own model. */
export type MoverKind =
  | 'tractor'
  | 'truck'
  | 'forklift'
  | 'butterfly'
  | 'gondola'
  | 'shopper'
  | 'foodtruck'
  | 'scooter'
  | 'cat'
  | 'swanboat'
  | 'duck'
  | 'koi'
  | 'pigeon'
  | 'firefly'
  | 'dog'
  | 'trolley'
  | 'lift'
  | 'egret'
  | 'chicken'

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
  /**
   * The stop where it is away (#177), as a food truck is off down the Road until it turns in: unseen while it waits
   * there, and shrinking over the last `AWAY` m of its loop to it, and growing over the first from it, as a car does at a
   * Gateway. Always seen unless given.
   */
  away?: number
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
  /** Its kind, smoke unless given: steam (#175), a fountain's spray or petals drifting down from a sakura (#180). */
  kind?: Exclude<PlumeKind, 'smoke'>
  /**
   * A sakura's petals (#227): how far out from `at`, its crown's middle, the crown reaches, and how far below `at`
   * the ground lies (m). Each petal leaves the crown's side and lands as it fades.
   */
  crown?: { out: number; drop: number }
}

/** The kinds of plume (`PLUMES`): a chimney's smoke, steam, a fountain's spray and a sakura's drifting petals. */
export type PlumeKind = 'smoke' | 'steam' | 'spray' | 'petals'

/**
 * The kinds of thing that flies from a pole and flutters in the wind (#154), each with its own model and wave: a flag, a
 * shop's nobori banner (#153), or a carp streamer in a garden (#179).
 */
export type FlagKind = 'flag' | 'nobori' | 'carp'

/**
 * Something that flies from the top of a pole at `at`, in Three coordinates, and flutters in the wind (#154): a flag.
 * It flies downwind in `colour`, or turned `ry` as the kit turns a shape if it hangs from a rod as a nobori does (#153),
 * is lowered to `low` m above the road and furled for the night, and rides its pole's brick at `brick`. It flies at
 * `size` times its model's size, as the carp on one pole do, largest at the top (#179); 1 unless given.
 */
export interface Flag {
  kind: FlagKind
  at: THREE.Vector3
  low: number
  colour: string
  brick: number
  ry?: number
  size?: number
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
export type SwayKind = 'laundry' | 'futon' | 'washing' | 'cloth' | 'kite'

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
// Per kind: m/s, how high it bobs (m) and how fast (rad/s) while it drives, its model, and how wide a strip of ground
// its loop takes (m), which the street furniture keeps off (#176): none for one that works a wall or flies. One that
// flies (#152) rises `fly.up` m off its path between stops, easing up and down over `fly.ease` m at each end of a
// stretch, and one with wings beats them `beat` times a second in flight and rests them nearly closed (`WINGS`).
interface Kind {
  speed: number
  bob: number
  rate: number
  model: () => THREE.BufferGeometry
  wide: number
  fly?: { up: number; ease: number }
  beat?: number
  /** How it holds its wings (`WINGS`), if not as a butterfly does: a pigeon folds them down along its sides (#180). */
  wings?: typeof WINGS
  /**
   * Whether it works by night (#180), as fireflies do: round its loop by the run's clock and never stopping, lit as the
   * lamps are, and unseen by day.
   */
  byNight?: boolean
}
const KINDS: Record<MoverKind, Kind> = {
  tractor: { speed: 2.8, bob: 0.035, rate: 15, model: tractor, wide: 2.6 },
  truck: { speed: 2.2, bob: 0.02, rate: 11, model: truck, wide: 2.8 },
  forklift: { speed: 1.8, bob: 0.015, rate: 13, model: forklift, wide: 1.8 },
  butterfly: { speed: 1.4, bob: 0.28, rate: 4.5, model: butterfly, wide: 0, fly: { up: 0.9, ease: 1.6 }, beat: 7 },
  gondola: { speed: 1, bob: 0, rate: 0, model: gondola, wide: 0 },
  shopper: { speed: 1.15, bob: 0.04, rate: 9, model: shopper, wide: 0.8 }, // #175
  foodtruck: { speed: 2, bob: 0.015, rate: 11, model: foodTruck, wide: 2.6 }, // #177
  scooter: { speed: 2.6, bob: 0.025, rate: 12, model: scooter, wide: 1.1 }, // #178
  cat: { speed: 0.45, bob: 0.015, rate: 10, model: cat, wide: 0 }, // #179: it walks the top of a garden wall, on no ground
  // #180: a park's, on its pond, on its plaza or over its water by night, on no ground
  swanboat: { speed: 0.55, bob: 0.03, rate: 1.6, model: swanBoat, wide: 0 },
  duck: { speed: 0.32, bob: 0.015, rate: 2.4, model: duck, wide: 0 },
  koi: { speed: 0.45, bob: 0, rate: 0, model: koi, wide: 0 },
  pigeon: {
    speed: 1.5,
    bob: 0.04,
    rate: 9,
    model: pigeon,
    wide: 0,
    fly: { up: 1.8, ease: 1.4 },
    beat: 5,
    wings: { rest: -1.3, fan: 0, night: -1.3, open: 0.15, sweep: 0.75 },
  },
  firefly: { speed: 0.35, bob: 0.3, rate: 1.3, model: firefly, wide: 0, byNight: true },
  dog: { speed: 3.4, bob: 0.07, rate: 13, model: dog, wide: 0.5 }, // #182: it runs a meadow's grass between the picnic blankets
  trolley: { speed: 0.7, bob: 0, rate: 0, model: trolley, wide: 0 }, // #181: a gantry crane's, along its girders, on no ground
  lift: { speed: 1.4, bob: 0, rate: 0, model: lift, wide: 0 }, // #183: a glass lift up a tower's face, on no ground
  // #184: a farm's. An egret stands in a paddy, steps and flies off, on no ground; a chicken pecks about its run.
  egret: {
    speed: 1.7,
    bob: 0.03,
    rate: 6,
    model: egret,
    wide: 0,
    fly: { up: 2.4, ease: 2.6 },
    beat: 3,
    wings: { rest: -1.35, fan: 0, night: -1.35, open: 0.1, sweep: 0.7 },
  },
  chicken: { speed: 0.4, bob: 0.03, rate: 11, model: chicken, wide: 0 },
}

/** How wide a strip of ground a mover of `kind` takes along its loop (m, #176): 0 for one that works a wall or flies. */
export const moverWidth = (kind: MoverKind) => KINDS[kind].wide
/** A mover of `kind`'s model, as it drives (#191): for the scene check, which stands each vehicle on its wheels. */
export const moverModel = (kind: MoverKind) => KINDS[kind].model()
// How a resting butterfly holds its wings (rad up from flat): nearly closed over its back, fanning a little by day.
const WINGS = { rest: 1.25, fan: 0.22, night: 1.45, open: 0.35, sweep: 0.8 }
/** m of its loop either side of the stop where a mover is away (#177) over which it shrinks out of sight, or grows back. */
const AWAY = 3
/** The share of its speed a puff has lost by the end of its life: smoke and steam slow as they rise, a petal as it lands. */
const SLOWS = 0.3
// Smoke (#150): how the wind carries a puff (m/s, Three's x and z), how opaque it starts, and its colour.
const SMOKE = { wind: [WIND.x, -WIND.y], opacity: 0.92, colour: '#f4f1ea' }
// Each kind of plume's puffs: a chimney's smoke (#150), and steam (#175) from a noodle shop's vent or a food stall's pot,
// quicker, smaller and fainter, and slower on the wind. s between puffs, how long a puff lasts (s), how fast it rises
// (m/s), its share of the wind and of its own drift, its radius as it leaves and as it fades (m), and its share of the
// smoke's opacity.
// A fountain's spray (#180) is thrown up and falls back (`fall`, m/s²) into its basin, and petals drift down from a
// sakura, in their own colour. A petal (#227) leaves its crown's side, up to `side` of the crown's reach above or below
// its middle, and drifts on outward; it falls at the speed that lands it as it fades, whatever `rise` says, so a small
// tree's float down slowly, and stays opaque most of the way: `holds` is the power of its age its fading follows, where
// the others fade from the start. It is `flat`, that share of its width tall.
const PLUMES: Record<
  PlumeKind,
  {
    every: number
    lasts: number
    rise: number
    wind: number
    drift: number
    from: number
    to: number
    fade: number
    fall?: number
    colour?: string
    side?: number
    holds?: number
    flat?: number
  }
> = {
  smoke: { every: 0.6, lasts: 5.5, rise: 1.6, wind: 1, drift: 1, from: 0.7, to: 2.5, fade: 1 },
  steam: { every: 0.5, lasts: 2.2, rise: 1.3, wind: 0.35, drift: 0.4, from: 0.3, to: 1.15, fade: 0.7 },
  spray: { every: 0.07, lasts: 1.7, rise: 4.2, wind: 0.12, drift: 2.4, from: 0.14, to: 0.32, fade: 0.8, fall: 6, colour: '#f3f8f8' },
  petals: {
    every: 1.2,
    lasts: 6,
    rise: -0.8,
    wind: 0.5,
    drift: 0.6,
    from: 0.26,
    to: 0.26,
    fade: 1,
    colour: '#e04a94',
    side: 0.25,
    holds: 5,
    flat: 0.4,
  },
}
// Fireflies (#180): their body by day, their light, and how brightly they glow for the lamps' glow; the lamps' glow at
// which they are all out, and how much each pulses as it drifts.
const FIREFLY = { body: '#3d4436', light: '#d9f27a', glow: 1.6, out: 2, pulse: 0.35 }
// Flying things (#154), per kind: its model, flying along +x from its pole at x = 0, its top edge on y = 0 and its face
// to +z, white for the colour each takes (or, as its `painted` share has it, its own: #153); how far it reaches from the
// pole and how far its free end swings (m); and how many waves run along it.
const FLAGS: Record<FlagKind, { model: () => THREE.BufferGeometry; reach: number; swing: number; waves: number }> = {
  flag: { model: () => new THREE.PlaneGeometry(2.3, 1.45, 8, 2).translate(1.15, -0.725, 0), reach: 2.3, swing: 0.32, waves: 1.3 },
  nobori: { model: nobori, reach: 0.76, swing: 0.2, waves: 0.6 }, // #153
  carp: { model: carp, reach: 2.6, swing: 0.3, waves: 1.1 }, // #179
}
// How fast every flying thing's waves run (rad/s), and the share of the day it takes to raise or lower one, at the
// start and the end of the working day.
const FLUTTER = { rate: 7, raise: 0.02 }
// ponytail: the most puffs drawn at once over the whole City, about 450 chimneys' worth, or 400 big sakura's petals
// (#227: a City all parks has 1,180 in the air): past it the newest builds' chimneys smoke unseen. Grow the mesh with the puffs, as `remesh` does the movers', if a City ever smokes more.
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
  kite: { swing: 0.07, rate: 1.1, model: kite }, // #182: it rides the wind on its string, out through the working day
}
// Each is hung out over the first share of the working day (of the day's clock) and taken in over its last, at its own
// moment, and takes this share of the day to come or go.
const HANG = { out: 0.05, in: 0.06, takes: 0.004 }
// Pools of light (#174): how much of its colour a pool adds at its middle for the lamps' glow; how much of the moonlight
// on the ground it takes the place of there, without which a warm light added to the bright blue night comes out
// white, once the lamps glow `full`, as from dusk through the night; and how it fades out to its edge (the share of
// both at each share of the way out). Below `full`, as the lamps come on before dusk and go out at dawn, it dims as
// much less as it lights less, so that a pool never darkens the ground.
const POOLS = {
  bright: 0.26,
  dims: 0.6,
  full: 4,
  fade: [
    [0, 1],
    [0.4, 0.82],
    [0.72, 0.36],
    [1, 0],
  ],
}

/** A wheel of radius `r` and width `w` on an axle across the model at `x`, `z` out from the middle, `sides` round. */
const wheel = (r: number, w: number, x: number, z: number, color: string, sides = 14) =>
  tint(new THREE.CylinderGeometry(r, r, w, sides).rotateX(Math.PI / 2).translate(x, r, z), color)

/**
 * A little tractor (#149), facing +x, centred under its middle and standing on y = 0, oversized as the cars are so it
 * reads at City zoom: big wheels behind, a persimmon bonnet, and a white canopy over the seat.
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
export function shopper(): THREE.BufferGeometry {
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
 * A food truck (#177), facing +x, centred under its middle and standing on y = 0, oversized as the cars are: a kei van
 * whose cab and box are white for the paint it takes, a serving hatch open along its left (-z) side over a counter
 * under a striped awning, and a menu board on its other side.
 */
function foodTruck(): THREE.BufferGeometry {
  const [PAINT, TYRE, GLASS, DARK, STRIPE, HATCH, LIT] = ['#ffffff', '#2f3440', '#41566c', '#4a525c', '#fbf8f2', '#5a4a3c', '#ffe2b0']
  const parts = [
    part(4.3, 0.34, 1.9, 0, 0.42, 0, DARK), // the chassis
    part(1.4, 1.5, 2.1, 1.45, 0.62, 0, PAINT), // the cab
    part(0.06, 0.62, 1.9, 2.16, 1.4, 0, GLASS), // its windscreen
    part(2.85, 2.25, 2.2, -0.68, 0.62, 0, PAINT), // the box
    part(2.1, 0.95, 0.06, -0.68, 1.55, -1.12, HATCH), // the hatch, open
    part(2.1, 0.08, 0.5, -0.68, 1.47, -1.32, LIT), // its counter
    part(2.3, 0.06, 1.1, -0.68, 2.62, -1.55, STRIPE), // the awning over it
    part(0.7, 0.9, 0.04, -0.68, 1.1, 1.12, DARK), // a menu board on the other side
  ]
  for (const x of [1.4, -1.4]) for (const z of [0.86, -0.86]) parts.push(wheel(0.38, 0.32, x, z, TYRE, 8))
  return merged(parts)
}

/**
 * A delivery scooter (#178), facing +x, centred under its middle and standing on y = 0, oversized more than the cars are,
 * so that it reads from Tile zoom: two wheels, a body in white for its paint under its seat, a leg shield and
 * handlebars, a delivery box on its carrier, and its rider in a jacket and a white helmet.
 */
function scooter(): THREE.BufferGeometry {
  const [PAINT, TYRE, DARK, BOX, LEGS, JACKET, SKIN, HELMET] = [
    '#ffffff',
    '#2f3440',
    '#4a525c',
    '#f0c75e',
    '#3a4252',
    '#55705f',
    '#f1d1b5',
    '#fbf8f2',
  ]
  return merged([
    wheel(0.3, 0.14, 0.62, 0, TYRE, 10),
    wheel(0.3, 0.14, -0.6, 0, TYRE, 10),
    part(1.05, 0.34, 0.4, -0.08, 0.32, 0, PAINT), // the body
    part(0.14, 0.74, 0.46, 0.44, 0.3, 0, PAINT), // the leg shield
    part(0.08, 0.36, 0.08, 0.5, 1.02, 0, DARK), // the stem
    part(0.1, 0.06, 0.72, 0.5, 1.36, 0, DARK), // the handlebars
    part(0.62, 0.1, 0.36, -0.22, 0.66, 0, DARK), // the seat
    part(0.62, 0.52, 0.58, -0.66, 0.68, 0, BOX), // the box on its carrier
    part(0.34, 0.44, 0.42, -0.12, 0.76, 0, LEGS), // the rider: legs,
    part(0.34, 0.56, 0.46, -0.1, 1.18, 0, JACKET), // jacket,
    part(0.5, 0.12, 0.12, 0.2, 1.42, 0.2, JACKET), // arms on the bars,
    part(0.5, 0.12, 0.12, 0.2, 1.42, -0.2, JACKET),
    part(0.24, 0.12, 0.26, -0.06, 1.74, 0, SKIN), // face
    part(0.34, 0.26, 0.34, -0.08, 1.84, 0, HELMET), // and helmet
  ]).scale(1.45, 1.45, 1.45)
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
 * A carp streamer (#179), flying along +x from its pole as the flags do, its mouth's ring at the pole, 2.6 m long and
 * hanging under y = 0: a fish of cloth, flat, its body white for the paint it takes and divided along its length so that
 * the waves run through it, a pale belly, an eye on each side and a forked tail.
 */
function carp(): THREE.BufferGeometry {
  const L = 2.6
  const mid = -0.2 * L // its middle line, below the pole's top
  // Its half-height at each of its body's stations, mouth to the root of its tail.
  const body = [0.11, 0.15, 0.17, 0.165, 0.14, 0.1, 0.07].map((h, i) => ({ x: (i * 0.8 * L) / 6, h: h * L }))
  const v: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d)
  for (let i = 0; i + 1 < body.length; i++) {
    const [p, q] = [body[i], body[i + 1]]
    quad([p.x, mid - p.h, 0], [q.x, mid - q.h, 0], [q.x, mid + q.h, 0], [p.x, mid + p.h, 0])
  }
  const root = body[body.length - 1]
  // The tail: two lobes out to its tips, a notch between them.
  for (const s of [-1, 1])
    v.push(root.x, mid, 0, L, mid + s * 0.17 * L, 0, root.x, mid + s * root.h, 0, root.x, mid, 0, 0.9 * L, mid, 0, L, mid + s * 0.17 * L, 0)
  const cloth = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  cloth.computeVertexNormals()
  const keep = (w: number, h: number, x: number, y: number, z: number, colour: string) =>
    painted(tint(new THREE.PlaneGeometry(w, h).deleteAttribute('uv').translate(x, y, z), colour), 0)
  const eyes = [0.006, -0.006].flatMap((z) => [
    keep(0.22, 0.22, 0.13 * L, mid + 0.05 * L, z, '#fbf8f2'),
    keep(0.1, 0.1, 0.13 * L, mid + 0.05 * L, z * 2, '#2f3440'),
    keep(0.5 * L, 0.07 * L, 0.42 * L, mid - 0.09 * L, z, '#fbf8f2'), // its belly
  ])
  return merged([painted(tint(cloth, '#ffffff'), 1), ...eyes])
}

/**
 * A cat (#179), facing +x, centred under its middle and standing on y = 0, oversized as the moving details are so that it
 * reads from Tile zoom: a body, legs, a head with ears, and a tail held up, white for the paint it takes, its eyes dark.
 */
function cat(): THREE.BufferGeometry {
  const PAINT = '#ffffff'
  const tail = painted(tint(new THREE.BoxGeometry(0.06, 0.34, 0.06).rotateZ(0.5).translate(-0.27, 0.36, 0), PAINT), 1)
  return merged([
    ...[-0.15, 0.15].flatMap((x) => [-0.06, 0.06].map((z) => painted(part(0.06, 0.16, 0.06, x, 0, z, PAINT), 1))), // legs
    painted(part(0.44, 0.17, 0.18, 0, 0.14, 0, PAINT), 1), // the body
    painted(part(0.17, 0.16, 0.17, 0.25, 0.24, 0, PAINT), 1), // the head
    painted(part(0.05, 0.07, 0.04, 0.26, 0.4, 0.05, PAINT), 1), // the ears
    painted(part(0.05, 0.07, 0.04, 0.26, 0.4, -0.05, PAINT), 1),
    painted(part(0.02, 0.03, 0.035, 0.34, 0.33, 0.04, '#2f3440'), 0), // the eyes
    painted(part(0.02, 0.03, 0.035, 0.34, 0.33, -0.04, '#2f3440'), 0),
    tail,
  ]).scale(1.7, 1.7, 1.7)
}

/**
 * A dog (#182), facing +x, centred under its middle and standing on y = 0, oversized as the moving details are so that it
 * reads from Tile zoom: a body, legs, a head with a muzzle and a tail held up, white for the coat it takes, its ears and
 * nose dark.
 */
function dog(): THREE.BufferGeometry {
  const [PAINT, DARK] = ['#ffffff', '#4a3a30']
  const tail = painted(tint(new THREE.BoxGeometry(0.07, 0.3, 0.07).rotateZ(0.7).translate(-0.42, 0.52, 0), PAINT), 1)
  return merged([
    ...[-0.24, 0.24].flatMap((x) => [-0.09, 0.09].map((z) => painted(part(0.08, 0.26, 0.08, x, 0, z, PAINT), 1))), // legs
    painted(part(0.66, 0.26, 0.26, 0, 0.24, 0, PAINT), 1), // the body
    painted(part(0.24, 0.24, 0.24, 0.4, 0.4, 0, PAINT), 1), // the head
    painted(part(0.16, 0.12, 0.14, 0.56, 0.4, 0, PAINT), 1), // its muzzle
    painted(part(0.05, 0.05, 0.08, 0.64, 0.47, 0, DARK), 0), // its nose
    painted(part(0.07, 0.14, 0.05, 0.36, 0.56, 0.11, DARK), 0), // the ears
    painted(part(0.07, 0.14, 0.05, 0.36, 0.56, -0.11, DARK), 0),
    tail,
  ]).scale(1.7, 1.7, 1.7)
}

/** How far a kite flies from the hand that holds its string (#182): m up, and m downwind. */
const KITE = { up: 7.2, out: 5.2 }

/**
 * A kite on its string (#182), held at the origin and flying up and out along -z, as what sways hangs out of its
 * building: a diamond in white for the paint it takes, on two dark spars, with a tail of three pale bows, at the end
 * of a string. Oversized, as the moving details are. It swings about the hand on the wind, and is taken in for the night.
 */
function kite(): THREE.BufferGeometry {
  const [SPAR, BOW, STRING] = ['#4a525c', '#fbf8f2', '#e9eef2']
  const { up, out } = KITE
  const [len, lean] = [Math.hypot(up, out), Math.atan2(out, up)]
  const box = (w: number, h: number, d: number, colour: string) => tint(new THREE.BoxGeometry(w, h, d).deleteAttribute('uv'), colour)
  // The diamond, in its own plane (x across, y up it), both of its sides: its top, its sides, its foot.
  const [top, side, foot] = [1.7, 1.25, 2.3]
  const v: number[] = []
  for (const [a, b, c] of [
    [
      [0, top],
      [-side, 0],
      [side, 0],
    ],
    [
      [0, -foot],
      [side, 0],
      [-side, 0],
    ],
  ])
    for (const face of [
      [a, b, c],
      [a, c, b],
    ])
      for (const [x, y] of face) v.push(x, y, 0)
  const sail = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  sail.computeVertexNormals()
  const flying = [
    painted(tint(sail, '#ffffff'), 1),
    painted(box(0.05, top + foot, 0.03, SPAR).translate(0, (top - foot) / 2, 0), 0),
    painted(box(2 * side, 0.05, 0.03, SPAR), 0),
    ...[0, 1, 2].map((k) => painted(box(0.5, 0.2, 0.03, BOW).translate(0.12 * (k % 2 ? 1 : -1), -foot - 0.45 - 0.5 * k, 0), 0)),
    painted(box(0.02, 1.6, 0.02, STRING).translate(0, -foot - 0.8, 0), 0),
  ].map((g) =>
    g
      .rotateY(Math.PI / 4)
      .rotateX(-lean + 0.5)
      .translate(0, up, -out),
  ) // turned an eighth to be seen from every side, leaning back on the wind, over the end of its string
  // Its sail's two sides both face the sky for the light, so that neither is seen dark from below the sun.
  const lit = flying[0].attributes.normal
  for (let i = 0; i < lit.count; i++) lit.setXYZ(i, 0, 1, 0)
  const string = painted(
    box(0.05, len, 0.05, STRING)
      .translate(0, len / 2, 0)
      .rotateX(-lean),
    0,
  )
  return merged([...flying, string])
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
 * dark tips, for the paint each takes, about 0.85 m across, oversized so that it reads at Block zoom. Its wings beat in
 * the vertex shader (`createMovers`), about the body, by the angle each instance's `wing` gives.
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

/**
 * A swan boat (#180), facing +x, standing on the water at y = 0 and centred under its middle, oversized as the cars are:
 * a white hull with its wings along its sides, a cream seat, and a swan's neck and head at its bow.
 */
function swanBoat(): THREE.BufferGeometry {
  const [WHITE, BEAK, SEAT, EYE] = ['#ffffff', '#f0b24e', '#e8dcc0', '#2f3440']
  return merged([
    part(2.1, 0.42, 1.15, 0, -0.1, 0, WHITE), // the hull
    part(0.55, 0.42, 1.15, -0.8, 0.32, 0, WHITE), // its raised tail
    ...[-1, 1].map((z) => part(1.35, 0.32, 0.14, -0.15, 0.3, z * 0.6, WHITE)), // the wings
    part(0.75, 0.14, 0.9, -0.05, 0.32, 0, SEAT),
    part(0.2, 1.05, 0.2, 0.86, 0.3, 0, WHITE), // the neck
    part(0.36, 0.22, 0.22, 0.98, 1.3, 0, WHITE), // the head
    part(0.2, 0.09, 0.12, 1.24, 1.34, 0, BEAK),
    part(0.05, 0.05, 0.24, 1.06, 1.42, 0, EYE),
  ]).scale(1.15, 1.15, 1.15)
}

/** A duck (#180), facing +x and floating on y = 0, oversized as the moving details are: grey and brown, a dark green head. */
function duck(): THREE.BufferGeometry {
  const [BODY, BREAST, HEAD, BEAK, TAIL] = ['#b9b2a4', '#7a5c46', '#2f6447', '#e3bd4a', '#4a525c']
  return merged([
    part(0.34, 0.15, 0.2, -0.02, -0.03, 0, BODY),
    part(0.1, 0.14, 0.18, 0.14, -0.02, 0, BREAST),
    part(0.08, 0.06, 0.12, -0.2, 0.06, 0, TAIL),
    part(0.12, 0.12, 0.11, 0.15, 0.12, 0, HEAD),
    part(0.08, 0.03, 0.06, 0.24, 0.15, 0, BEAK),
  ]).scale(1.8, 1.8, 1.8)
}

/**
 * A koi's shadow under the water (#180), facing +x and lying flat on y = 0, a little oversized: a dark fish's outline,
 * its body and its tail, for the paint it takes.
 */
function koi(): THREE.BufferGeometry {
  // prettier-ignore
  const outline: [number, number][] = [[0.42, 0], [0.3, 0.09], [0.05, 0.12], [-0.2, 0.07], [-0.32, 0], [-0.2, -0.07], [0.05, -0.12], [0.3, -0.09]]
  const tail: [number, number][] = [
    [-0.3, 0],
    [-0.5, 0.13],
    [-0.46, 0],
    [-0.5, -0.13],
  ]
  const v: number[] = []
  // Fanned from its first point, wound to face up.
  for (const pts of [outline, tail])
    for (let i = 1; i < pts.length - 1; i++) for (const [x, z] of [pts[0], pts[i + 1], pts[i]]) v.push(x, 0, z)
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return tint(g, '#ffffff').scale(1.6, 1, 1.6)
}

/**
 * A pigeon (#180), facing +x and centred on its body, its wings flat along z, oversized as the moving details are: a grey
 * body, a darker head and a pale wing. Its wings beat in flight, as a butterfly's do (`createMovers`), and fold down
 * along its sides at rest.
 */
function pigeon(): THREE.BufferGeometry {
  const [BODY, HEAD, WING, BEAK] = ['#9a9ea6', '#6f7480', '#b8bcc2', '#d8c6a8']
  const wing = (mirror: boolean) => {
    const pts: [number, number][] = [
      [0.06, 0.03],
      [-0.1, 0.03],
      [-0.12, 0.22],
      [0.02, 0.18],
    ]
    const v: number[] = []
    for (let i = 1; i < pts.length - 1; i++) for (const [x, z] of [pts[0], pts[i], pts[i + 1]]) v.push(x, 0.02, mirror ? -z : z)
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return tint(g, WING)
  }
  return merged([
    part(0.26, 0.1, 0.06, -0.02, -0.05, 0, BODY).deleteAttribute('uv'),
    part(0.08, 0.08, 0.06, 0.13, 0.02, 0, HEAD).deleteAttribute('uv'),
    part(0.04, 0.02, 0.02, 0.19, 0.05, 0, BEAK).deleteAttribute('uv'),
    part(0.1, 0.02, 0.06, -0.17, 0, 0, HEAD).deleteAttribute('uv'), // the tail
    wing(false),
    wing(true),
  ]).scale(1.6, 1.6, 1.6)
}

/**
 * An egret (#184), facing +x and centred on its body as a pigeon is, its long dark legs reaching 0.85 m below it,
 * oversized as the moving details are: a slim white body, a long neck held up, a yellow bill, and white wings that
 * beat in flight and fold down along its sides at rest (`createMovers`). Its body is no wider than the wings' root, so
 * that only its wings beat.
 */
function egret(): THREE.BufferGeometry {
  const [WHITE, LEG, BILL] = ['#fbfaf5', '#3f4650', '#e3bd4a']
  const wing = (mirror: boolean) => {
    const pts: [number, number][] = [
      [0.12, 0.022],
      [-0.2, 0.022],
      [-0.24, 0.36],
      [0.02, 0.3],
    ]
    const v: number[] = []
    for (let i = 1; i < pts.length - 1; i++) for (const [x, z] of [pts[0], pts[i], pts[i + 1]]) v.push(x, 0.03, mirror ? -z : z)
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return tint(g, WHITE)
  }
  return merged([
    part(0.025, 0.44, 0.012, -0.02, -0.5, 0.012, LEG).deleteAttribute('uv'),
    part(0.025, 0.44, 0.012, 0.03, -0.5, -0.012, LEG).deleteAttribute('uv'),
    part(0.36, 0.14, 0.04, -0.04, -0.08, 0, WHITE).deleteAttribute('uv'), // the body
    part(0.05, 0.3, 0.035, 0.15, 0, 0, WHITE).deleteAttribute('uv'), // the neck
    part(0.1, 0.06, 0.035, 0.19, 0.28, 0, WHITE).deleteAttribute('uv'), // the head
    part(0.12, 0.022, 0.02, 0.3, 0.295, 0, BILL).deleteAttribute('uv'),
    wing(false),
    wing(true),
  ]).scale(1.7, 1.7, 1.7)
}

/** A chicken (#184), facing +x and standing on y = 0, oversized as the moving details are: white, with a comb, a wattle and a tail held up. */
function chicken(): THREE.BufferGeometry {
  const [WHITE, COMB, BEAK, LEG] = ['#fbf8f2', '#d98672', '#e3bd4a', '#d9a441']
  return merged([
    part(0.03, 0.1, 0.03, 0, 0, 0.04, LEG),
    part(0.03, 0.1, 0.03, 0, 0, -0.04, LEG),
    part(0.26, 0.17, 0.17, -0.01, 0.1, 0, WHITE), // the body
    part(0.07, 0.14, 0.12, -0.16, 0.2, 0, WHITE), // the tail
    part(0.1, 0.13, 0.1, 0.12, 0.24, 0, WHITE), // the head
    part(0.07, 0.04, 0.03, 0.12, 0.37, 0, COMB),
    part(0.03, 0.05, 0.03, 0.17, 0.2, 0, COMB),
    part(0.06, 0.03, 0.04, 0.2, 0.28, 0, BEAK),
  ]).scale(1.7, 1.7, 1.7)
}

/** A firefly (#180): a speck of light, a little large, that `createMovers` lights by night and hides by day. */
function firefly(): THREE.BufferGeometry {
  return tint(new THREE.IcosahedronGeometry(0.13, 0), '#ffffff')
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
/**
 * A glass lift's car (#183), facing out of the wall along +x with the wall behind it, centred under its middle and
 * standing on y = 0, oversized a little as the cars are: a glazed car between a floor and a roof, a post at each corner.
 */
function lift(): THREE.BufferGeometry {
  const [FRAME, GLASS, FLOOR] = ['#f4f6f8', '#b4d6e3', '#4a525c']
  const parts = [part(1.4, 0.22, 1.9, 0, 0, 0, FLOOR), part(1.4, 0.26, 1.9, 0, 2.5, 0, FRAME), part(1.2, 2.28, 1.7, 0, 0.22, 0, GLASS)]
  for (const x of [-0.64, 0.64]) for (const z of [-0.89, 0.89]) parts.push(part(0.12, 2.28, 0.12, x, 0.22, z, FRAME))
  return merged(parts).scale(1.25, 1.25, 1.25)
}
/**
 * A gantry crane's trolley (#181), riding the tops of two girders 3.3 m apart along x and centred on its middle, y = 0
 * the girders' top: its frame and hoist, and under it on four ropes a container's spreader `TROLLEY.drop` m down, its
 * length along x as the containers under it lie. Frame and spreader are white, for the crane's paint it takes.
 */
function trolley(): THREE.BufferGeometry {
  const [FRAME, HOIST, ROPE] = ['#ffffff', '#4a525c', '#2f3440']
  const { drop } = TROLLEY
  const parts = [
    part(2.2, 0.35, 3.9, 0, 0, 0, FRAME), // the frame across both girders
    part(1.5, 0.9, 1.7, 0, 0.35, 0, HOIST), // the hoist's drum and motor
    part(1.7, 0.12, 2.0, 0, 1.25, 0, FRAME), // its cover
    part(5.8, 0.32, 0.36, 0, -drop, 0.95, FRAME), // the spreader's long sides
    part(5.8, 0.32, 0.36, 0, -drop, -0.95, FRAME),
    part(0.36, 0.32, 2.3, 2.7, -drop, 0, FRAME), // its ends
    part(0.36, 0.32, 2.3, -2.7, -drop, 0, FRAME),
    part(0.9, 0.3, 0.9, 0, -drop + 0.32, 0, HOIST), // the headblock the ropes hold
  ]
  for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) parts.push(part(0.05, drop - 0.6, 0.05, x, -drop + 0.6, z, ROPE))
  return merged(parts)
}
/** How far under a gantry crane's girders its trolley carries its spreader (m, #181): `trolley` draws it so. */
export const TROLLEY = { drop: 2.6 }

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

/**
 * A puff of smoke in the air: where it left its chimney, when (s run), its own drift, and its kind of plume (#175). A
 * petal (#227) carries its own speed (m/s), the one that lands it as it fades.
 */
interface Puff {
  x: number
  y: number
  z: number
  born: number
  dx: number
  dz: number
  kind: keyof typeof PLUMES
  rise?: number
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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: LOW_POLY })
  // Wings (#152): each vertex off the body turns up about it by its instance's `wing`, the left wing and the right
  // mirrored, and its normal with it.
  const winged = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide, flatShading: LOW_POLY })
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
  // Fireflies (#180): their own light, as bright as the lamps' glow has it, and nothing by day.
  const glowing = new THREE.MeshStandardMaterial({ color: FIREFLY.body, roughness: 0.6, emissive: FIREFLY.light, emissiveIntensity: 0 })
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
      const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, flatShading: LOW_POLY })
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
  // Each puff its plume's colour (#180): white for smoke, steam and spray, rose for petals.
  for (let i = 0; i < PUFFS; i++) smoke.setColorAt(i, white)
  const tints = new Map(Object.values(PLUMES).flatMap((p) => (p.colour ? [[p.colour, new THREE.Color(p.colour)] as const] : [])))
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
  const hanging = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: LOW_POLY })
  hanging.onBeforeCompile = takesPaint
  const swaying = new Map<SwayKind, THREE.InstancedMesh>()
  // Pools of light (#174): one instanced mesh of warm decals for the whole City, added to what lies under them, unlit
  // and untouched by tone mapping, as the contact shadows are, dimming the moonlight under them by up to `POOLS.dims`
  // (its opacity) as they add their own (its colour, premultiplied by it). Each takes its colour; the material's is the
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
      // Each flag's phase, from where it flies (how high too, for the carp on one pole, #179), and its colour, which stay
      // until the next remesh.
      const phase = new THREE.InstancedBufferAttribute(
        new Float32Array(flying.map((f) => mulberry32(spot(f.at.x, -f.at.z) ^ (kind === 'carp' ? Math.round(f.at.y * 100) : 0))() * 7)),
        1,
      )
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
      const { byNight } = KINDS[kind]
      const mesh = new THREE.InstancedMesh(geometry, beats ? winged : byNight ? glowing : material, count)
      mesh.name = kind
      mesh.castShadow = !beats && !byNight // a wing's shadow would not beat with it, and a speck of light casts none
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
   * morning. It faces back along the way it drives a stretch in reverse. `away` is how far along its loop it is from
   * the stop where it is away (#177), Infinity off the stretches either side of that stop or for a mover never away.
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
        const away = from === v.away ? left * speed : (from + 1) % n === v.away ? reach - left * speed : Infinity
        return onFace(v, { ...p, heading: p.heading + (reverse?.[from] ? Math.PI : 0), moving: working, off, away })
      }
      left -= reach / speed
      from = (from + 1) % n
    }
    // At stop `from`, facing as it came in: a stop at the loop's start is its end too.
    const p = along(loop, stops[from] || loop.length)
    const away = from === v.away ? 0 : Infinity
    return onFace(v, { ...p, heading: p.heading + (reverse?.[(from + n - 1) % n] ? Math.PI : 0), moving: false, off: 0, away })
  }
  /**
   * Where mover `v` that works by night (#180) is: round its loop by the run's clock, from where its phase puts it, never
   * stopping, so that it drifts on whatever the hour and wherever it was built.
   */
  const wander = (v: Mover) => {
    const len = v.loop.length
    const s = (((t * KINDS[v.kind].speed + (phaseOf(v) / (Math.PI * 2)) * len) % len) + len) % len
    return { ...along(v.loop, s), moving: true, off: Infinity, away: Infinity, up: 0 }
  }
  /** Where a place on `v`'s loop lies on the map, and m above `v.h`: for a mover that works a wall, on the wall's face. */
  const onFace = (v: Mover, p: { x: number; y: number; heading: number; moving: boolean; off: number; away: number }) => {
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
        return { plume, next: draw() * PLUMES.smoke.every, draw } // its first puff within a chimney's beat, steam's too
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
      // Fireflies come out as the lamps come on (#180), and glow as they do.
      const dark = smooth(Math.min(1, (glow?.lamps ?? 0) / FIREFLY.out))
      glowing.emissiveIntensity = (glow?.lamps ?? 0) * FIREFLY.glow
      for (const e of entries) {
        for (const v of e.movers) {
          const mesh = meshes.get(v.kind)
          if (!mesh) continue
          const i = counts.get(v.kind) ?? 0
          counts.set(v.kind, i + 1)
          const pose = e.playing?.pose(e.build, v.brick) ?? { scale: 1, lift: 0 }
          const { bob, rate, fly, beat, byNight, wings = WINGS } = KINDS[v.kind]
          const p = byNight ? wander(v) : place(v)
          // In flight, risen off its path, eased up from a stop and down onto the next.
          const rise = fly ? fly.up * smooth(Math.min(1, p.off / fly.ease)) : 0
          const phase = phaseOf(v)
          const hop = p.moving ? bob * Math.abs(Math.sin(t * rate + phase)) * (fly ? smooth(Math.min(1, p.off / fly.ease)) : 1) : 0
          // Away (#177): unseen at its stop there, and shrinking as it nears it along its loop.
          const seen = byNight ? dark * (1 - FIREFLY.pulse + FIREFLY.pulse * Math.sin(t * 2.3 + phase * 3)) : 1
          const size = Math.max(0.001, pose.scale * smooth(Math.min(1, p.away / AWAY)) * seen)
          q.setFromAxisAngle(up, p.heading)
          m.compose(at.set(p.x, v.h + p.up + pose.lift + rise + hop, -p.y), q, scale.setScalar(size))
          mesh.setMatrixAt(i, m)
          if (beat !== undefined) {
            const wing = mesh.geometry.getAttribute('wing') as THREE.InstancedBufferAttribute
            const angle = p.moving
              ? wings.open + wings.sweep * Math.sin(t * beat * Math.PI * 2 + phase)
              : working
                ? wings.rest + wings.fan * Math.sin(t * 1.3 + phase)
                : wings.night
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
            const grown = s * (f.size ?? 1)
            m.compose(at, q.setFromAxisAngle(up, f.ry ?? downwind), scale.set(grown * (0.06 + 0.94 * raised), grown, grown))
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
          const kind = p.plume.kind ?? 'smoke'
          const { every, drift, lasts, side = 0 } = PLUMES[kind]
          const crown = p.plume.crown
          // A crown reaching more than a metre out sheds more often, by the root of its reach, so that a big tree's
          // petals are not lost round it.
          const beat = crown ? every / Math.max(1, Math.sqrt(crown.out)) : every
          for (p.next -= dt; p.next <= 0; p.next += beat) {
            const { x, y, z } = p.plume.at
            const [a, r] = [p.draw() * Math.PI * 2, (0.25 + 0.25 * p.draw()) * drift]
            const [dx, dz] = [Math.cos(a) * r, Math.sin(a) * r]
            if (crown) {
              // A petal leaves the crown's side the way it drifts, and its slowing fall lands it as it fades.
              const { out } = crown
              const up = (p.draw() * 2 - 1) * side * out
              const rise = -(crown.drop + up) / (lasts * (1 - SLOWS))
              e.puffs.push({ x: x + Math.cos(a) * out, y: y + up, z: z + Math.sin(a) * out, born: t + p.next, dx, dz, kind, rise })
            } else e.puffs.push({ x, y, z, born: t + p.next, dx, dz, kind })
          }
        }
        e.puffs = e.puffs.filter((f) => t - f.born < PLUMES[f.kind].lasts)
        for (const f of e.puffs) {
          if (n >= PUFFS) break
          const age = Math.max(0, t - f.born)
          const { lasts, from, to, wind, fade, fall, colour, holds, flat = 1 } = PLUMES[f.kind]
          const rise = f.rise ?? PLUMES[f.kind].rise
          const k = age / lasts
          const [wx, wz] = SMOKE.wind
          // Spray (#180) is thrown up and falls back; smoke and steam slow as they rise, and a petal as it lands.
          const y = fall ? f.y + rise * age - 0.5 * fall * age * age : f.y + rise * age * (1 - SLOWS * k)
          at.set(f.x + (wx * wind + f.dx) * age, y, f.z + (wz * wind + f.dz) * age)
          const r = from + (to - from) * Math.sqrt(k)
          m.compose(at, q, scale.set(r, r * flat, r))
          smoke.setMatrixAt(n, m)
          smoke.setColorAt(n, colour ? tints.get(colour)! : white)
          fades.setX(n, Math.min(1, age / 0.4) * (holds ? 1 - k ** holds : (1 - k) ** 1.8) * fade)
          n++
        }
      }
      smoke.count = n
      smoke.instanceMatrix.needsUpdate = true
      smoke.instanceColor!.needsUpdate = true
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

      // Pools of light: lit as the lamps are, dimming the moonlight as much, and hidden by day. Only those whose lights
      // still arrive move.
      const lamps = glow?.lamps ?? 0
      warmth.opacity = POOLS.dims * Math.min(1, lamps / POOLS.full)
      warmth.color.setScalar(warmth.opacity > 0 ? (lamps * POOLS.bright) / warmth.opacity : 0)
      if (pooled) {
        pooled.visible = warmth.opacity > 0
        for (const e of entries) if (e.playing) layPools(e)
      }
    },
  }
}
