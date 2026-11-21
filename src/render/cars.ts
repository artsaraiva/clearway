import * as THREE from 'three'
import { pointAt, type Vec } from '../sim/geometry'
import type { Lane, Network } from '../sim/network'
import type { Vehicle } from '../sim/sim'
import type { Glow } from './day'
import { LOW_POLY } from './look'
import { merged, painted, part, roundedBox, takesPaint, tint } from './shapes'

// ponytail: cars past the cap are not drawn (the sim still moves them); the budget is 1,000, so raise it when a City holds more.
const CAP = 1500
const LENGTH = 4.3 // m: every skin is drawn this long, the sim's one car type
// Walkers' shirts, the confetti and the food trucks (#177) share these. Blue is the Tools' colour and
// red-orange the Jams', so there is a turquoise car where a blue one would be and a raspberry one where a coral one would be.
export const PAINTS = {
  white: '#ffffff',
  raspberry: '#db6982',
  turquoise: '#009dcb',
  yellow: '#ffc52d',
  mint: '#64cb9f',
  violet: '#bc9ef2',
  pale: '#e9eef2',
  pink: '#ff9cbb',
}
const COLORS = Object.values(PAINTS).map((c) => new THREE.Color(c))
const [WHITE, , TURQUOISE, YELLOW, MINT, , PALE] = COLORS
const GROW = 8 // m of lane over which a car grows in, or shrinks out, at a Gateway
const STUCK_BELOW = 0.4 // m/s
const COOL = 1.5 // seconds of being stuck forgotten per second of moving
const [ANGRY_AFTER, ANGRY_RAMP] = [5, 3] // real seconds stuck before anger starts, and for it to reach full

// The skins' parts that keep their own colour (#176): tyres, the cars' dark glass, a chassis, trim, the lamps by day
// (a pale lens at the front and a deep red one at the back, 17° of hue from the Jam's red-orange at 55% of its chroma)
// and a taxi's roof lamp in the bulb's cream. By night the lamps light on a mesh of their own, as they always have.
export const PART = {
  tyre: '#2f3440',
  glass: '#41566c',
  chassis: '#4a525c',
  trim: '#c4ccd4',
  head: '#f4efe0',
  tail: '#a84a52',
  roof: '#fff4dc',
}
const LIGHT = { head: '#fff6d8', tail: '#ff3030', roof: '#ffd890' }
const PAINT = '#ffffff' // a skin's painted parts, which take its instance's colour

/** A car's skin (#176): how the sim's one car type is drawn, each a model of the same length. */
type Skin = 'hatchback' | 'kei' | 'taxi' | 'van' | 'keiTruck'

/** A rounded box `w` × `h` × `d` with its foot at `(x, y, z)` (m, the car facing +x), in `colour`, taking the paint `share`. */
const rounded = (w: number, h: number, d: number, r: number, x: number, y: number, z: number, colour: string, share = 0) =>
  painted(tint(roundedBox(w, h, d, r, Math.min(0.2, h / 4)).translate(x, y, z), colour), share)
/** A plain box `w` × `h` × `d` with its foot at `(x, y, z)`, in `colour`, taking the paint `share`. */
const box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: string, share = 0) =>
  painted(part(w, h, d, x, y, z, colour), share)
/** Four wheels of radius `r` on axles `x` m either way of the middle, `z` out from it. */
const wheels = (r: number, x: number, z: number) =>
  [x, -x].flatMap((ax) =>
    [z, -z].map((az) => {
      const tyre = new THREE.CylinderGeometry(r, r, 0.3, 8).rotateX(Math.PI / 2)
      return painted(tint(tyre.translate(ax, r, az), PART.tyre), 0)
    }),
  )

/**
 * Where a skin's lamps are (m, the car facing +x): a pair of head lamps `head.y` up and `head.z` either way of the
 * middle on its front bumper, and a pair of tail lamps `tall` by `wide` from `tail.y` up, `tail.z` either way, on its
 * back; and for a taxi, its roof lamp, `roof.y` up and `roof.at` along from its middle.
 */
interface Lamps {
  head: { y: number; z: number }
  tail: { y: number; z: number; tall: number; wide: number }
  roof?: { at: number; y: number }
}

/** A box of a car's model (m, the car facing +x): `long` along the car, `tall`, `wide` across, its middle `at` along from the car's and its foot `up`. */
interface Piece {
  long: number
  tall: number
  wide: number
  at: number
  up: number
}

/**
 * The saloon taxi (#176): its body, cabin and band of glass, its wheels' radius, axles and track, its lamps, and its
 * paints, yellow twice as often as mint, so that it reads as a taxi. A parked taxi (the kit's `taxi`, #177) is drawn
 * from the same numbers.
 */
export const TAXI = {
  body: { long: LENGTH, tall: 0.8, wide: 2.15, at: 0, up: 0.32 } as Piece,
  cabin: { long: 2.2, tall: 0.74, wide: 1.9, at: -0.2, up: 1.06 } as Piece,
  glass: { long: 2.26, tall: 0.4, wide: 1.96, at: -0.2, up: 1.24 } as Piece,
  wheels: { r: 0.38, axle: 1.35, track: 0.96 },
  lamps: { head: { y: 0.8, z: 0.62 }, tail: { y: 0.84, z: 0.62, tall: 0.2, wide: 0.46 }, roof: { at: -0.15, y: 1.78 } } as Lamps,
  paints: [PAINTS.yellow, PAINTS.yellow, PAINTS.mint],
}

/**
 * The tall kei wagon (#176): its body, cabin and band of glass, its wheels and its lamps, as the taxi's. A kei car
 * parked by an apartment block (the kit's `parked`, #178) is drawn from the same numbers, in the cars' colours.
 */
export const KEI = {
  body: { long: LENGTH, tall: 0.82, wide: 2.06, at: 0, up: 0.32 } as Piece,
  cabin: { long: 3.55, tall: 1.36, wide: 1.98, at: -0.35, up: 1.04 } as Piece,
  glass: { long: 3.61, tall: 0.6, wide: 2.04, at: -0.35, up: 1.58 } as Piece,
  wheels: { r: 0.38, axle: 1.4, track: 0.94 },
  lamps: { head: { y: 0.84, z: 0.58 }, tail: { y: 0.9, z: 0.8, tall: 0.55, wide: 0.24 } } as Lamps,
  paints: Object.values(PAINTS),
}
/** A car's model as the kit parks it (#177, #178): the taxi's or the kei wagon's. */
export type ParkedModel = typeof TAXI | typeof KEI

/**
 * The skins (#176). For each: the share of cars that wear it and the paints it comes in, both drawn from a car's id
 * (`skinOf`); its lamps; and its body's other parts, facing +x, centred under its middle and standing on y = 0,
 * `LENGTH` long and oversized across as the cars always were, so that every skin reads as traffic alike: wheels, a body
 * in its paint, and a band of dark glass that is its windscreen at the front. Hatchbacks and kei cars come in all the
 * cars' colours; vans and kei trucks mostly white, as they are; taxis yellow or mint, so that they read as taxis.
 */
const SKINS: Record<Skin, { share: number; paints: THREE.Color[]; lamps: Lamps; parts: () => THREE.BufferGeometry[] }> = {
  // The stubby rounded car the game has always drawn, on wheels: a low body and a cabin set back.
  hatchback: {
    share: 0.32,
    paints: COLORS,
    lamps: { head: { y: 0.85, z: 0.52 }, tail: { y: 0.92, z: 0.6, tall: 0.22, wide: 0.4 } },
    parts: () => [
      rounded(LENGTH, 0.95, 2.2, 0.55, 0, 0.32, 0, PAINT, 1),
      rounded(2.6, 0.85, 2, 0.5, -0.35, 1.2, 0, PAINT, 1),
      rounded(2.66, 0.42, 2.06, 0.52, -0.35, 1.44, 0, PART.glass),
      ...wheels(0.4, 1.35, 0.98),
    ],
  },
  // A tall kei wagon: a short bonnet under a tall, square cabin with a wide glass band, and tall tail lamps.
  kei: {
    share: 0.28,
    paints: COLORS,
    lamps: KEI.lamps,
    parts: () => {
      const { body, cabin, glass, wheels: w } = KEI
      return [
        rounded(body.long, body.tall, body.wide, 0.32, body.at, body.up, 0, PAINT, 1),
        rounded(cabin.long, cabin.tall, cabin.wide, 0.3, cabin.at, cabin.up, 0, PAINT, 1),
        rounded(glass.long, glass.tall, glass.wide, 0.32, glass.at, glass.up, 0, PART.glass),
        ...wheels(w.r, w.axle, w.track),
      ]
    },
  },
  // A saloon taxi: bonnet, cabin and boot, and its lamp on the roof, cream by day and lit at night.
  taxi: {
    share: 0.12,
    paints: TAXI.paints.map((c) => new THREE.Color(c)),
    lamps: TAXI.lamps,
    parts: () => {
      const { body, cabin, glass, wheels: w } = TAXI
      return [
        rounded(body.long, body.tall, body.wide, 0.4, body.at, body.up, 0, PAINT, 1),
        rounded(cabin.long, cabin.tall, cabin.wide, 0.42, cabin.at, cabin.up, 0, PAINT, 1),
        rounded(glass.long, glass.tall, glass.wide, 0.44, glass.at, glass.up, 0, PART.glass),
        ...wheels(w.r, w.axle, w.track),
      ]
    },
  },
  // A box van, flat-fronted: one tall body, glass round its front half, and tail lamps up its back corners.
  van: {
    share: 0.15,
    paints: [WHITE, WHITE, PALE, YELLOW, TURQUOISE],
    lamps: { head: { y: 0.72, z: 0.68 }, tail: { y: 0.7, z: 0.86, tall: 0.6, wide: 0.22 } },
    parts: () => [
      rounded(LENGTH, 1.86, 2.15, 0.42, 0, 0.32, 0, PAINT, 1),
      rounded(1.7, 0.6, 2.2, 0.44, 1.33, 1.38, 0, PART.glass),
      box(0.12, 0.2, 2.1, LENGTH / 2 - 0.02, 0.36, 0, PART.trim), // the bumper
      ...wheels(0.4, 1.4, 0.96),
    ],
  },
  // A kei truck: a cab over its front wheels, its glass, and a flat bed behind with low gates.
  keiTruck: {
    share: 0.13,
    paints: [WHITE, WHITE, PALE, MINT],
    lamps: { head: { y: 0.66, z: 0.66 }, tail: { y: 0.84, z: 0.78, tall: 0.2, wide: 0.36 } },
    parts: () => [
      rounded(1.55, 1.55, 2.1, 0.36, 1.375, 0.32, 0, PAINT, 1),
      rounded(1.6, 0.56, 2.15, 0.38, 1.42, 1.14, 0, PART.glass),
      box(2.7, 0.3, 1.8, -0.75, 0.36, 0, PART.chassis),
      box(2.75, 0.1, 2.1, -0.78, 0.66, 0, PAINT, 1), // the bed
      ...[1.01, -1.01].map((z) => box(2.75, 0.42, 0.08, -0.78, 0.76, z, PAINT, 1)), // its gates
      box(0.08, 0.42, 2.1, -2.11, 0.76, 0, PAINT, 1),
      box(0.08, 0.95, 2.1, 0.56, 0.76, 0, PART.chassis), // the guard behind the cab
      ...wheels(0.34, 1.35, 0.94), // small, as a kei truck's are, their tops inside its bed
    ],
  },
}
const ORDER = Object.keys(SKINS) as Skin[]

/** A lamp of a car's model, a box (m, the car facing +x) placed as a `Piece`, `z` across from its middle: which lamp it is. */
type Lamp = Piece & { z: number; kind: 'head' | 'tail' | 'roof' }

/** Where a skin's lamps are, as boxes: a pair of head lamps, a pair of tail lamps, and a taxi's roof lamp. */
export function lampBoxes({ head, tail, roof }: Lamps): Lamp[] {
  return [
    ...[head.z, -head.z].map((z) => ({ long: 0.1, tall: 0.22, wide: 0.4, at: LENGTH / 2 - 0.02, up: head.y, z, kind: 'head' as const })),
    ...[tail.z, -tail.z].map((z) => ({
      long: 0.1,
      tall: tail.tall,
      wide: tail.wide,
      at: -LENGTH / 2 + 0.02,
      up: tail.y,
      z,
      kind: 'tail' as const,
    })),
    ...(roof ? [{ long: 0.42, tall: 0.3, wide: 0.86, at: roof.at, up: roof.y, z: 0, kind: 'roof' as const }] : []),
  ]
}

/** A skin's lamps as boxes: by day its lenses on its body (`lit` false), or by night a little larger and lit (`lit` true). */
function lampsOf(lamps: Lamps, lit: boolean): THREE.BufferGeometry[] {
  const grow = lit ? 0.04 : 0
  return lampBoxes(lamps).map(({ long, tall, wide, at, up, z, kind }) =>
    lit
      ? tint(new THREE.BoxGeometry(long + grow, tall + grow, wide + grow).translate(at, up + tall / 2, z), LIGHT[kind])
      : box(long, tall, wide, at, up, z, PART[kind]),
  )
}

/** The skin car `id` wears, by the skins' shares, and its paint: the same every frame and every run. */
function skinOf(id: number): { skin: Skin; paint: THREE.Color } {
  const h = Math.imul(id + 1, 0x9e3779b1) >>> 0
  let at = ((h >>> 8) % 1000) / 1000
  const skin = ORDER.find((s) => (at -= SKINS[s].share) < 0) ?? ORDER[0]
  const { paints } = SKINS[skin]
  return { skin, paint: paints[(h >>> 20) % paints.length] }
}

/** A car angry enough to show it. */
export interface StuckCar {
  /** Where it is drawn, in Three coordinates. */
  at: THREE.Vector3
  /** 0–1. */
  anger: number
  /** Real seconds stuck. */
  stuck: number
}

/** Sim position of a car's centre (`s` is the front bumper). */
export function carCentre(v: Vehicle): Vec {
  const p = pointAt(v.lane.line, v.s)
  const back = v.type.length / 2
  return { x: p.x - Math.cos(p.heading) * back, y: p.y - Math.sin(p.heading) * back }
}

/**
 * Every car, drawn in its skin (#176): one instanced mesh per skin for the bodies, and one per skin for their head and
 * tail lights, placed from the sim each frame. Cars grow in at a Gateway and shrink out at one, and shake once they
 * have been stuck for a few real seconds.
 */
export function createCars(net: Network) {
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: LOW_POLY })
  paint.onBeforeCompile = takesPaint
  // Unlit: the lights glow by their own colour, scaled by the time of day.
  const lit = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const skins = new Map(
    ORDER.map((skin) => {
      const { lamps, parts } = SKINS[skin]
      const body = new THREE.InstancedMesh(merged([...parts(), ...lampsOf(lamps, false)]), paint, CAP)
      const lights = new THREE.InstancedMesh(merged(lampsOf(lamps, true)), lit, CAP)
      body.name = `car ${skin}`
      body.castShadow = body.receiveShadow = true
      body.frustumCulled = lights.frustumCulled = false // instances move; the mesh's own bounds mean nothing
      body.count = lights.count = 0
      return [skin, { body, lights }]
    }),
  )

  let entries = new Set<Lane>()
  let stuck = new Map<number, number>() // real seconds each car has been stuck, by id
  /** Follow the cars of a network. Unless they are the cars `carried` over from the one before, none has been stuck yet. */
  const reset = (on: Network, carried = false) => {
    entries = new Set(Object.values(on.gateways).flatMap((arm) => arm.approach))
    if (!carried) stuck = new Map()
  }
  reset(net)
  let t = 0
  const [m, q, e, at, scale] = [
    new THREE.Matrix4(),
    new THREE.Quaternion(),
    new THREE.Euler(0, 0, 0, 'YXZ'),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]

  return {
    meshes: [...skins.values()].flatMap((s) => [s.body, s.lights]),
    reset,

    /**
     * Place the cars. `dt` is the real seconds since the last frame, 0 while paused. Returns the angry ones. When `calm`,
     * as reduced motion asks, an angry car stays still: it is angry all the same.
     */
    update(vehicles: Vehicle[], dt: number, calm = false): StuckCar[] {
      t += dt
      const next = new Map<number, number>()
      const angry: StuckCar[] = []
      for (const s of skins.values()) s.body.count = 0
      const drawn = Math.min(vehicles.length, CAP)
      for (let i = 0; i < drawn; i++) {
        const v = vehicles[i]
        const { heading } = pointAt(v.lane.line, v.s)
        const before = stuck.get(v.id) ?? 0
        const wait = v.v < STUCK_BELOW ? before + dt : Math.max(0, before - COOL * dt)
        next.set(v.id, wait)
        const anger = Math.min(1, Math.max(0, (wait - ANGRY_AFTER) / ANGRY_RAMP))
        const grown = entries.has(v.lane) ? v.s / GROW : v.lane.toGateway ? (v.lane.length - v.s) / GROW : 1
        const c = carCentre(v)
        // An angry car hops and rocks.
        const jolt = calm ? 0 : anger
        at.set(c.x, jolt && Math.abs(Math.sin(t * 11 + v.id)) * 0.3 * jolt, -c.y)
        q.setFromEuler(e.set(jolt && Math.sin(t * 34 + v.id) * 0.07 * jolt, heading, 0))
        m.compose(at, q, scale.setScalar(Math.max(0.001, Math.min(1, grown))))
        const worn = skinOf(v.id)
        const { body, lights } = skins.get(worn.skin)!
        const k = body.count++
        body.setMatrixAt(k, m)
        lights.setMatrixAt(k, m)
        body.setColorAt(k, worn.paint)
        if (anger) angry.push({ at: at.clone(), anger, stuck: wait })
      }
      stuck = next
      for (const { body, lights } of skins.values()) {
        lights.count = body.count
        body.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = true
        if (body.instanceColor) body.instanceColor.needsUpdate = true
      }
      return angry
    },

    /** Light the head and tail lights as the time of day has them. */
    setGlow({ carLights }: Glow) {
      lit.color.setScalar(carLights)
      for (const { lights } of skins.values()) lights.visible = carLights > 0.05
    },
  }
}
