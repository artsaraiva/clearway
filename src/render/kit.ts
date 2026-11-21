import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Stage } from '../game/game'
import { mulberry32 } from '../sim/demand'
import type { Bounds, Polyline } from '../sim/geometry'
import { KERB } from './blocks'
import { lampBoxes, PART as CAR, type ParkedModel } from './cars'
import type { Glow } from './day'
import { LOW_POLY } from './look'
import type { Beacon, BeaconColour, Flag, FlagKind, Mover, MoverKind, Plume, PlumeKind, Pool, Sway, SwayKind } from './movers'
import { clad, createPatterns, pave, PATTERN, tile, wrap, type Cladding, type Pattern } from './pattern'
import { canvasTexture, gable, hip, nudge, roughBall, roundedBox, tint } from './shapes'

const TAU = Math.PI * 2
// The palette is the oversaturated one picked in #104 at its gentlest strength. Within 30° of hue of the Tool blue or
// the Jam red-orange, a colour keeps under 65% of that colour's chroma, which is why the terracotta roof is a darker
// brick, the salmon one persimmon and the slate one a teal slate.
// Each Zone's own part of it lies beside its buildings in `./zones` (#207); what more than one Zone lays is here.
const LAWN = '#a9db7f' // a house's garden
const HEDGE = '#4e9f49' // round a Stage 3 house's garden
export const LEDGE = '#fbf6ef' // a Stage 3 house's, between its storeys
// What more than one Zone's buildings share of the palette (#207). A shop front's (#175): its door's frames, which a
// terraced row's corner shop takes too; a pale trim round windows and doors, and an awning's pale stripe; marks for
// lettering on a board, pale and dark, and how brightly a lit board and its marks glow. A front door's wood (#157,
// #178), a house's, a terraced house's and the one at the top of stairs up a wall; how brightly the lights over an
// apartment block's doors and at its stairs' landings glow (#178); a TV aerial's steel, on a terraced house's roof and a
// house's (#178, #179); and straw, a barn's bales and a scarecrow's hat (#149).
export const FRONTAGE = {
  frames: ['#4a525c', '#a1714c', '#fbf8f2', '#4a525c'],
  trim: '#fbf8f2',
  stripe: '#fbf8f2',
  marks: { pale: '#fbf8f2', dark: '#2f3440' },
  lit: { board: 0.33, marks: 1.6 },
}
export const DOOR = '#8a5a3c'
export const DOOR_LIGHT = 2
export const AERIAL = '#8e979f'
export const STRAW = '#e8cf7f'
const PAVILION = { posts: '#a1714c', roof: '#4d6575', floor: '#c49a6c' } // a Stage 3 park's, over its pond
// Industrial's shipping containers are its own (`./zones/industrial`, #210), as are its pallets and its trucks' bays.
// Medium-density details (#156), each a thing of its own that any Zone may use: an outdoor AC unit's casing and its
// fan's grille; a vending machine's paints and its dark trim, its lit front the lamps' bulb; and a bicycle's frames (the
// cars' colours), tyres and steel, which a covered bike rack's posts and rail take too. Washing, the rack's roof and
// the steel of outside stairs and walkways are medium-density's own (`./zones/medium-density`, #210).
export const AIRCON = { body: '#f2f3ef', grille: '#8e979f' }
const VENDING = { paints: ['#f4f6f8', '#2fb39a', '#f0b43c', '#79c86a', '#e8925e', '#f4f6f8'], trim: '#4a525c' }
export const BIKES = {
  frames: ['#ffffff', '#db6982', '#ffc52d', '#64cb9f', '#bc9ef2', '#ff9cbb', '#e9eef2', '#009dcb'],
  tyre: '#2f3440',
  steel: '#9aa3ad',
}
/** Outside stairs (#156): m along their flights, across their two lanes, and the depth of a landing. */
export const STAIR = { long: 4.2, wide: 2.4, landing: 1.1 }
/** An open walkway along an apartment block's face (#156): m out from the wall, and its parapet's height. */
export const WALKWAY = { deep: 1.3, parapet: 1 }
/** A covered bike rack (#156): m long and deep from its back to its open front, and m along it a bicycle takes. */
export const BIKE_RACK = { long: 4.4, deep: 2.2, per: 0.62 }
/** A vending machine's footprint (#156): m across its front and deep. */
export const VENDING_MACHINE = { wide: 1.1, deep: 0.85 }
// Farm details (#149): the crates of a harvest, on a kei truck's bed and stacked in a farmyard (`./zones/farms`), and
// the truck's white paint, its chassis and tyres; a scarecrow's post, cloth head and shirts (the cars' colours).
export const HARVEST = ['#f0c75e', '#7fbf9d', '#f0c75e', '#e9eef2']
const TRUCK = { paint: '#f4f6f8', chassis: '#4a525c', tyre: '#2f3440', crates: HARVEST }
const SCARECROW = { post: '#a1714c', head: '#f4ead2', shirts: ['#db6982', '#64cb9f', '#ffc52d', '#bc9ef2', '#009dcb'] }
// Low-density residential details (#157): a front door under a little canopy; solar panels' cells and frame; and
// pots for pot plants, by a house's door and in the scenes. A garden's drive, laundry and porch are low-density's own
// (`./zones/low-density`, #210).
export const HOME = {
  door: DOOR,
  cells: '#2d3b55',
  trim: '#c4ccd4', // solar panels' frames
  pots: ['#c49a6c', '#e9e4da', '#5aa69b', '#b85a4c'],
}
// Shops' nobori banners and paper lanterns are their own (`./zones/shops`, #210).
// Light pools (#174), warm on the ground at night: under a lamp, as far as the pavement goes round its post, up to
// `lamp` m and at least `least`; under a paper lantern, `lantern` m across; before a vending machine's lit front and a
// shop's lit window, `front` m out from it and `deep` m deep. Each pool's colour, the strength of its light in it.
// Since #175 a shop's front leaves a pool out to the kerb, brighter once its signboard lights (Stage 2) and brighter
// still under an arcade (Stage 3); a roof terrace's string lights, a street light on a pole, a food stall and a row of
// capsule machines leave their own.
export const POOL = {
  lamp: 4,
  least: 1.4,
  lantern: 3,
  front: { vending: 0.75, window: 1.15 },
  deep: { vending: 1.7, window: 2.2 },
  colours: {
    lamp: '#ffbe6a',
    cream: '#ffd49a',
    amber: '#f6a848',
    vending: '#ffe2b0',
    window: '#ffb870',
    sign: '#ffc27a',
    arcade: '#ffcf8f',
    string: '#ffc46e',
    pole: '#ffd08f',
    stall: '#f8b25a',
    lobby: '#ffc98a',
    canopy: '#ffd49a',
    door: '#ffd49a',
    flood: '#ffe6bf',
  },
  strengths: {
    lamp: 1,
    cream: 0.85,
    amber: 0.8,
    vending: 0.7,
    window: 0.6,
    sign: 0.75,
    arcade: 0.85,
    string: 0.7,
    pole: 0.8,
    stall: 0.85,
    lobby: 0.95,
    canopy: 1.1,
    door: 0.7,
    flood: 1.05,
  },
}
/** The kerbside's own lights, a lamp at a Block's corner and a street light on a pole, which leave pools on every Tile (#176). */
const KERBSIDE_POOLS: ReadonlySet<keyof typeof POOL.colours> = new Set(['lamp', 'pole'])
/** Whether a board in `colour` is pale, so that the marks for lettering on it are dark (#175). */
export function pale(colour: string): boolean {
  const c = new THREE.Color(colour)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.42
}
/** The bulb's own colour, cream. */
export const CREAM = '#fff4dc'
/** The bulb's tint that paints and lights it `colour`: the colour over the bulb's own cream. */
const bulbTint = (colour: string) => {
  const [c, cream] = [new THREE.Color(colour), new THREE.Color(CREAM)]
  return new THREE.Color(c.r / cream.r, c.g / cream.g, c.b / cream.b)
}
// Green details (#152): a bench's wooden slats and its iron ends, which a picnic parasol's pole takes too. The picnic
// blanket, water butts and cold frames are green's own (`./zones/green`).
export const BENCH = { wood: '#c49a6c', iron: '#6f7986' }
// High-density residential details (#155): a rooftop helipad's pad and its paint; the covers of futons aired over the
// railings; and a playground's soft ground, swings, spring rider and sand, and the wooden rim of a sandbox and of a
// flower bed. The slide is high-density's own (`./zones/high-density`, #210).
const HELIPAD = { pad: '#4f7a62', ring: '#f6d36a', mark: '#f6d36a' }
export const FUTONS = ['#fbd2dd', '#fff7e8', '#e0f2d4', '#fbe3a2', '#e5dafb', '#ffffff']
export const PLAY = {
  ground: '#8fd1a8',
  swings: '#ea8548',
  seat: '#4a525c',
  chain: '#9aa3ad',
  sand: '#e8d3a6',
  rim: '#c49a6c',
  rider: '#ff9cbb',
}
/** A garden's lawn and hedge and a playground's sand, for the builders beside the kit (`./props`, `./zones`, #178). */
export const GARDEN = { lawn: LAWN, hedge: HEDGE, sand: PLAY.sand }
const BUSH = new THREE.IcosahedronGeometry(1, 0) // a balcony plant's leaves: a few faces, laid by the thousand
export const TANK = { body: '#cea680', lid: '#b68b63' } // a water tank on the roof of homes
export const [DECK, PLANT] = ['#dfe3e7', '#cfd5dc'] // a flat roof's deck, and the plant boxes and masts on it
/** A flagpole and its finial (#154), an office's and a garden's carp pole's (#179). */
export const FLAG = { pole: '#e9eef2', finial: '#f0c75e' }
// How brightly a parked taxi's roof lamp glows at night (#177).
const TAXI_LAMP = 1.2
export const LEAVES = {
  round: ['#7bcd5d', '#5fbc51', '#92d76e', '#6bc357', '#85cf61'],
  sakura: ['#ffbbd1', '#ffa1c1', '#ffd1df', '#ffadc8'],
  pine: ['#379e62', '#43ac6b', '#2e9358'],
}

// Petals fallen round a sakura (#148): how many lie round a tree of size 0.8 and how far they reach for its size, the
// most round any tree, their colours, and the disc each is.
const PETALS = { count: 28, reach: 7, most: 120, colours: ['#ffd1df', '#ffbbd1', '#ffe3ec'], scale: [1, 1, 1] }
// Leaves fallen round a park's round tree (#180), as petals round a sakura: fewer, nearer, narrow, in greens and ochre.
const LEAVES_FALLEN = { count: 12, reach: 4, most: 40, colours: ['#9cc95a', '#c3c65a', '#d3b05c'], scale: [0.55, 1, 0.4] }
// A sakura's crown, for a tree of size 1 (#227): the height of its middle, and how far out its drifting petals leave
// it, past its middle sphere (2.4) and all but the widest of its side spheres (2.6 to 3.1).
const CROWN = { from: 4.2, out: 2.9 }
const PETAL = new THREE.CircleGeometry(0.42, 5).rotateX(-Math.PI / 2)

// Low poly (`./look`), the round shapes are few-sided: a roughened ball of eighty faces, a cylinder of seven sides and
// a cone of six. The coarse sphere is then as fine as the other, a rougher ball that turns its corners another way.
const SPHERE = LOW_POLY ? roughBall(1, 0.14) : new THREE.SphereGeometry(1, 16, 12)
const COARSE_SPHERE = LOW_POLY ? roughBall(2, 0.18) : new THREE.SphereGeometry(1, 12, 8) // a coarse tree's (#178)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, LOW_POLY ? 7 : 16).translate(0, 0.5, 0)
const THIN = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0) // for poles and vents, laid by the hundred
const BEAD = new THREE.IcosahedronGeometry(1, 1) // a flagpole's finial, and a carp pole's
const CONE = new THREE.ConeGeometry(1, 1, LOW_POLY ? 6 : 12).translate(0, 0.5, 0)
// A ball that is not leaves, a lamp's globe or a scarecrow's head: low poly, the bead's eighty even faces, not the rough ball.
const BALL = LOW_POLY ? BEAD : SPHERE
const CONE8 = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0) // a parasol (#175), laid by the hundred
const PYRAMID = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0) // turned an eighth, its base is a square 1.41 across
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const POT = new THREE.CylinderGeometry(1, 0.75, 1, 8).translate(0, 0.5, 0) // a pot plant's pot (#157)
// A flat disc facing -z, the way the kit's frames face at no turn: a fan's grille or one side of a wheel (#156).
const FACING_DISC = new THREE.CircleGeometry(1, 8).rotateY(Math.PI)
const DISC = new THREE.CylinderGeometry(1, 1, 1, 32) // centred on its middle, unlike CYLINDER: a helipad's pad
const RING = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2) // a helipad's painted ring, 1 m out
// One stripe of an awning, sloping down away from the wall it hangs on: a building's front is its -z.
const AWNING = new THREE.BoxGeometry(1, 0.1, 1.7).rotateX(-0.36)
/**
 * Shapes the kit lays, for the builders beside it (`./props`, `./kerbside`, `./zones`), each standing on y = 0 but the
 * discs and the awning: `cone` is the parasol's eight-sided cone and `cone12` the twelve-sided one, `disc` faces -z,
 * `centred` is a cylinder centred on its middle and `bead` a ball centred on its middle.
 */
export const SHAPES = {
  thin: THIN,
  bead: BEAD,
  sphere: SPHERE,
  bush: BUSH,
  pot: POT,
  cone: CONE8,
  cone12: CONE,
  disc: FACING_DISC,
  centred: DISC,
  cylinder: CYLINDER,
  pyramid: PYRAMID,
  petal: PETAL,
  awning: AWNING,
}
/**
 * Where `(lx, ly)` in the frame of something at `(x, y)` lies: `lx` to its right, `ly` out of its front, which faces
 * `ry` (0 north, π/2 west). The kit places shapes by it, as do the builders beside it.
 */
export const to = (x: number, y: number, ry: number, lx: number, ly: number): [number, number] => [
  x + lx * Math.cos(ry) - ly * Math.sin(ry),
  y + lx * Math.sin(ry) + ly * Math.cos(ry),
]
/** The faces of a box, as the way each looks: north, south, east and west. */
export const FACES = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const
/** Face `k` of `FACES` of a box `w` (east–west) by `d`: its way out (as a front faces), m from the middle out to it, and how long it is. */
export function boxFace(k: number, w: number, d: number) {
  const [fx, fy] = FACES[k]
  return { ry: Math.atan2(-fx, fy), half: (fx ? w : d) / 2, len: fx ? d : w }
}

/**
 * A colour (painted onto the shared soft-lit material), a material of the kit, or one of them tinted by vertex colour.
 * The kit's glass and bulb are tinted white unless a tint is given, and take `glow`, how brightly they light at night:
 * 1 unless given, so that a curtain wall can be lit floor by floor, and a paper lantern brighter or dimmer than a lamp.
 */
export type Look = string | THREE.Material | { material: THREE.Material; tint: THREE.Color; glow?: number }

export type TreeKind = keyof typeof LEAVES

/** The bounds of an apartment block's wings together (#178). */
export function wingBounds(wings: Bounds[]): Bounds {
  return {
    x0: Math.min(...wings.map((o) => o.x0)),
    y0: Math.min(...wings.map((o) => o.y0)),
    x1: Math.max(...wings.map((o) => o.x1)),
    y1: Math.max(...wings.map((o) => o.y1)),
  }
}
/**
 * The bays of face `face` (of `FACES`) of an apartment wing (#156): how many fit, 3.2 m apart, and where on the face
 * the middle of bay `i` lies, a window's at each floor.
 */
export function baysOf(wing: Bounds, face: number) {
  const [nx, ny] = FACES[face]
  const [cx, cy, w, d] = [(wing.x0 + wing.x1) / 2, (wing.y0 + wing.y1) / 2, wing.x1 - wing.x0, wing.y1 - wing.y0]
  const n = Math.floor(((nx === 0 ? w : d) - 2) / 3.2)
  const at = (i: number): [number, number] => {
    const t = -(n - 1) * 1.6 + i * 3.2
    return nx === 0 ? [cx + t, cy + (ny * d) / 2] : [cx + (nx * w) / 2, cy + t]
  }
  return { n, at }
}
/** A gap in a hedge (#157): on side `side` (0 east, 1 north, 2 west, 3 south), `wide` m across and `at` m along it from its middle. */
export interface Gap {
  side: number
  at: number
  wide: number
}
export type Kit = ReturnType<typeof createKit>
export type Materials = ReturnType<typeof createMaterials>

/**
 * What a brick is, which decides when and how it comes in during an Assembly. A mover's brick has no shapes: the mover
 * (`./movers`) is drawn apart, and takes the brick's place as it pops in.
 */
export type BrickKind = 'soil' | 'sand' | 'grass' | 'plate' | 'block' | 'ground' | 'lamp' | 'building' | 'tree' | 'pole' | 'wire' | 'mover'

/**
 * A seed drawn from where something stands, for a detail on a random stream of its own (#148, #149): the same spot
 * gives the same detail, and nothing else on its Block draws differently for it.
 */
export const spot = (x: number, y: number) => (Math.imul(Math.round(x * 100), 0x9e3779b1) ^ Math.round(y * 100)) >>> 0

/**
 * Where the outside stairs at end `end` (1 or -1) of face `face` (of `FACES`) of an apartment wing stand (#156): beyond
 * the wing's end, alongside its end wall, their flights running out from the face so that their landings meet the
 * walkway's end. Their middle, and their facing as the kit's frames take it: their flights run along its front.
 */
export function stairAt(wing: Bounds, face: number, end: number): { x: number; y: number; ry: number } {
  const [nx, ny] = FACES[face]
  const [cx, cy, w, d] = [(wing.x0 + wing.x1) / 2, (wing.y0 + wing.y1) / 2, wing.x1 - wing.x0, wing.y1 - wing.y0]
  const [len, half] = [nx === 0 ? w : d, nx === 0 ? d / 2 : w / 2]
  const along = end * (len / 2 + 0.05 + STAIR.wide / 2)
  const out = half + WALKWAY.deep - STAIR.long / 2
  return { x: cx + ny * along + nx * out, y: cy - nx * along + ny * out, ry: Math.atan2(ny, nx) }
}

/** Where an apartment building has its open walkways (#156): for each wing, the face (of `FACES`) along which it runs, or -1. */
export type Walks = number[]

/**
 * What becomes of a brick as its Tile reaches another Stage: it stands throughout, it goes (the old Stage's), or it
 * comes (the new Stage's). In any other build every brick stays.
 */
export type Fate = 'stays' | 'goes' | 'comes'

/** One brick of the slab or of what stands on it: the unit that drops or pops in during an Assembly. */
export interface Brick {
  kind: BrickKind
  /** The point it lands on, or grows out of, in Three coordinates. */
  at: THREE.Vector3
  /** Puffs of dust thrown up where it lands. */
  dust: number
  fate: Fate
  /** The lot of its Block it stands on, in the order its Zone's look cut them; -1 for none. */
  lot: number
  /** The scene it belongs to (#191): its index in the kit's `scenes`, or -1 for none. */
  scene: number
  /** What built it, for the scene check (#191): only when the kit was asked to label its bricks (`createKit`). */
  what?: string
}

/**
 * Ground a fill lays and later pieces must keep clear of (#191), as the scene check reads it: a parking bay, a taxi
 * bay, the step before a door, or what a standing piece stands on with the room it keeps (#198). A box `w` along its
 * front by `d`, centred on `(x, y)` (m) and turned `ry` as the kit's frames are, and the brick it was laid with; for a
 * standing piece, the Stage it stands from.
 */
export interface Claim {
  kind: 'bay' | 'taxi' | 'door' | 'stand'
  x: number
  y: number
  w: number
  d: number
  ry: number
  brick: number
  from?: number
}

/** Every kind of claim; and the ground laid to be kept clear, the bays and the door steps, without what stands. */
const CLAIMS: readonly Claim['kind'][] = ['bay', 'taxi', 'door', 'stand']
export const BAYS_AND_DOORS: readonly Claim['kind'][] = ['bay', 'taxi', 'door']

/** Ground `w` by `d` at `(x, y)` turned `ry`, as a claim or a question about one has it. */
type Ground = Pick<Claim, 'x' | 'y' | 'w' | 'd' | 'ry'>

/**
 * How far ground `a` grown `ga` m each side reaches into claim `c` grown `gc` m each side (shrunk, if below 0): along each
 * of the two boxes' sides (the separating axes), how far either would move to clear the other, and the least of those;
 * 0 or less where they are apart. Unlike their overlap, it holds for a point within a box. The sides are taken as
 * `overlap` in `zones/ground` takes them, so that ground a Zone once kept in a list of its own is held as it was; or, for
 * a bay or a door step (`kept`), as the kit always took them.
 */
function reach(a: Ground, ga: number, c: Ground, gc: number, kept: boolean): number {
  const outline = (b: Ground, grow: number) =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([u, v]) => to(b.x, b.y, b.ry, u * (b.w / 2 + grow), v * (b.d / 2 + grow)))
  const sides = (ry: number) =>
    kept
      ? [ry, ry + Math.PI / 2].map((t) => [Math.cos(t), Math.sin(t)])
      : [
          [Math.cos(ry), Math.sin(ry)],
          [-Math.sin(ry), Math.cos(ry)],
        ]
  const [mine, theirs] = [outline(a, ga), outline(c, gc)]
  return Math.min(
    ...[...sides(a.ry), ...sides(c.ry)].map(([ax, ay]) => {
      const along = (p: [number, number]) => p[0] * ax + p[1] * ay
      const [m, s] = [mine.map(along), theirs.map(along)]
      return Math.min(Math.max(...m) - Math.min(...s), Math.max(...s) - Math.min(...m))
    }),
  )
}

/** A scene (#173, rule 5) a fill laid (#191): its kind, as its Zone names it; its bricks carry its index. */
export interface Scene {
  kind: string
}

/** The building form a lot was built in (#191), such as an office tower's, which rule 10 holds neighbours apart by. */
export interface Form {
  lot: number
  form: string
  /** The lot's ground, as its Zone cut it: a box `w` by `d` centred on `(x, y)` and turned `ry`. None if not told. */
  ground?: { x: number; y: number; w: number; d: number; ry: number }
}

/** The Stage a build is of, `to`, or, when `from` differs, the two Stages a Tile's Stage-up goes between. */
export interface Stages {
  from: Stage
  to: Stage
}

/** A geometry in place, in Three coordinates, with its material and the index of the brick it belongs to. */
export interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  brick: number
}

/**
 * What a Zone built to the Finish (#173) wears: surface pattern over its walls, roofs and paving, and pools of
 * light on its ground at night (#174). Each can be turned off, for a sheet that shows the Zone with and without.
 */
export interface Finish {
  pattern: boolean
  pools: boolean
  /**
   * Dev only (#175): how much deeper than built the Zones built to the Finish lay what stands on their Blocks,
   * for the user to compare a packed Tile with the open one. 1 unless given; lanes, Roads and the sim never change.
   */
  deeper?: number
  /**
   * Dev only (#176): draw the street furniture (guard rails, convex mirrors, planters, bollards and benches) at every
   * zoom on `solid`, with its contact shadows, as #175 drew it round a shops Tile, for the user to compare with it
   * as Block-zoom props. Block-zoom props unless set.
   */
  furniture?: boolean
}

// Block-zoom props (#173, #175): the zoom (as the camera's) from which they start to fade in, and the zoom at which
// they stand whole. Tile zoom, one Tile filling the screen, is about 4; City zoom, the whole City in frame, is under 1.
const BLOCK_ZOOM = { from: 2.2, to: 3.2 }
/** Low poly (`./look`): how much lighter or darker than its colour a part may be toned, as a share of full lightness. */
const TONE = 0.02

/**
 * The materials of the static scenery, shared by every Block so that all of them merge into one mesh per material.
 * Slab, Blocks and walls take their colours on `solid`, which lays the surface pattern over them (`./pattern`) unless
 * `finish` turns it off. Block-zoom props take theirs on `blockZoom`, `solid` drawn apart so that it can fade them out
 * as the camera leaves Tile zoom, and hide them beyond it.
 */
export function createMaterials(finish: Finish = { pattern: true, pools: true }) {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  // Low poly (`./look`), flat colour stands where the surface pattern was. Only the material drops it: the kit builds
  // as it does patterned, so what is built and where is the same in both looks.
  const patterns = finish.pattern && !LOW_POLY ? createPatterns() : null
  if (patterns) solid.onBeforeCompile = patterns.patch
  // `solid`'s patches, read as it compiles so that it takes the Stage Inspector's too, then a dither that drops a share
  // of its pixels as it fades: no blending, so nothing has to be sorted, and only this program carries the discard.
  const blockZoom = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  const blockZoomFade = { value: 1 }
  const dither = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.blockZoomFade = blockZoomFade
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float blockZoomFade;').replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
if (blockZoomFade < 1.0 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= blockZoomFade) discard;`,
    )
  }
  blockZoom.onBeforeCompile = (shader, renderer) => {
    solid.onBeforeCompile(shader, renderer)
    dither(shader)
  }
  blockZoom.customProgramCacheKey = () => `blockZoom ${solid.customProgramCacheKey()}`
  // The shadow `blockZoom` casts, dropping the same share of the shadow map's texels as it fades, so that a prop's
  // shadow fades with it.
  const blockZoomDepth = new THREE.MeshDepthMaterial()
  blockZoomDepth.onBeforeCompile = dither
  blockZoomDepth.customProgramCacheKey = () => 'blockZoom depth'
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
  // One bulb for every lamp, tinted white unless a tint is given. Like the glass, each vertex's `glow` scales how
  // brightly it lights, and a tinted bulb glows in its own colour (#153): a paper lantern's cream burns whiter than a
  // lit window, and its amber deeper.
  const bulb = new THREE.MeshStandardMaterial({
    color: CREAM,
    vertexColors: true,
    roughness: 0.4,
    emissive: '#ffd08a',
    emissiveIntensity: 0,
  })
  bulb.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = glow;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb * vGlow;')
  }
  const water = new THREE.MeshStandardMaterial({ color: '#63d1f4', roughness: 0.12, metalness: 0.05 })
  for (const material of [solid, blockZoom, glass, bulb, water]) material.flatShading = LOW_POLY
  // Contact shadows: a blurred dark decal under every building and tree, violet like the shadows the light casts (#148).
  const SHADE = '52,44,150'
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
      fade.addColorStop(0, `rgba(${SHADE},0.6)`)
      fade.addColorStop(0.5, `rgba(${SHADE},0.28)`)
      fade.addColorStop(1, `rgba(${SHADE},0)`)
      g.fillStyle = fade
      g.fillRect(0, 0, 128, 128)
    }),
    1,
  )
  const squareShadow = decal(
    canvasTexture(128, 128, (g) => {
      g.filter = 'blur(12px)'
      g.fillStyle = `rgba(${SHADE},0.75)`
      g.fillRect(28, 28, 72, 72)
    }),
    0.8,
  )

  return {
    solid,
    blockZoom,
    /** What a mesh of `blockZoom` casts its shadow with (its `customDepthMaterial`): it fades as `blockZoom` does. */
    blockZoomDepth,
    glass,
    /** The tints of `glass` a building's windows take, one picked per building: the glass, a paler and a darker one. */
    windows: [new THREE.Color(1, 1, 1), shade('#b4d6e3'), shade('#7aa9c9')],
    /** The tint of a window left dark at night: by day, a darker glass. */
    unlit: shade('#56738a'),
    /** The tint that makes `glass` the colour `color`, as an office tower's curtain wall is. */
    glassOf: shade,
    bulb,
    water,
    roundShadow,
    squareShadow,
    /** Whether the Zones built to the Finish wear their surface pattern and their light pools. */
    finish,
    /** Light the windows and lamps as the time of day has them. */
    setGlow({ windows, lamps }: Glow) {
      glass.emissiveIntensity = windows
      bulb.emissiveIntensity = lamps
      patterns?.setGlow(windows)
    },
    /**
     * Show the Block-zoom props as the camera's zoom has them: whole from Tile zoom inward, fading out as the camera
     * leaves it, as the clouds fade in, and not drawn at all farther out, where most Tiles are on screen.
     */
    setZoom(zoom: number) {
      blockZoomFade.value = THREE.MathUtils.clamp((zoom - BLOCK_ZOOM.from) / (BLOCK_ZOOM.to - BLOCK_ZOOM.from), 0, 1)
      blockZoom.visible = blockZoomFade.value > 0
    },
  }
}

/**
 * The building and tree kit: the bricks the slab and its Blocks are built from. Shapes are placed in sim metres,
 * `(x, y)` on the map and `h` above the road, and every shape added belongs to the next brick closed. Every random
 * choice comes from `rand`, so the same stream builds the same town.
 */
export function createKit(rand: () => number, materials: Materials, label?: () => string) {
  const range = (a: number, b: number) => a + (b - a) * rand()
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]
  const { solid, blockZoom, glass, windows, unlit, glassOf, bulb, water, roundShadow, squareShadow } = materials

  const parts: Part[] = []
  const bricks: Brick[] = []
  const movers: Mover[] = []
  const plumes: Plume[] = []
  const beacons: Beacon[] = []
  const sways: Sway[] = []
  const flags: Flag[] = []
  const pools: Pool[] = []
  // What the scene check reads (#191): the ground laid to be kept clear, the scenes and the lots' building forms.
  const claims: Claim[] = []
  const scenes: Scene[] = []
  const forms: Form[] = []
  let scene = -1 // the scene the bricks closed from now on belong to
  let ground: Form['ground'] // the current lot's ground, if its Zone told it
  /** A new brick, labelled with what built it where the scene check asks (`label`). */
  const made = (kind: BrickKind, at: THREE.Vector3, dust: number): Brick =>
    label ? { kind, at, dust, fate, lot, scene, what: label() } : { kind, at, dust, fate, lot, scene }
  /** Record that the current lot is built in `form` (#191): its building's kind and the shape it takes. */
  const formed = (form: string) => {
    if (lot >= 0) forms.push({ lot, form, ground })
  }
  /** Lay claim to ground `w` by `d` at `(x, y)` turned `ry` (#191), riding the next brick closed: `kit.claim`. */
  const claim = (kind: Claim['kind'], x: number, y: number, w: number, d: number, ry: number) => {
    claims.push({ kind, x, y, w, d, ry, brick: bricks.length })
  }
  /** Lay claim to the ground a piece standing from Stage `from` stands on (#198): `kit.stand`. */
  const stand = (x: number, y: number, w: number, d = w, ry = 0, from = 1) => {
    claims.push({ kind: 'stand', x, y, w, d, ry, brick: bricks.length, ...(from > 1 && { from }) })
  }
  /** Whether ground `w` by `d` at `(x, y)` turned `ry` keeps clear of every claim laid on the Block so far: `kit.unclaimed`. */
  const unclaimed = (x: number, y: number, w: number, d: number, ry = 0, room = 0, of: readonly Claim['kind'][] = CLAIMS) => {
    const mine = { x, y, w, d, ry }
    const grow = w || d ? room : 0 // a point stays one, `room` m from each claim
    // Apart from a bay or a door step, or within a sliver of it; apart from what stands, both grown `room`.
    return claims.every(
      (c) => !of.includes(c.kind) || (c.kind === 'stand' ? reach(mine, grow, c, room, false) <= 0 : reach(mine, 0, c, 0, true) <= 0.02),
    )
  }
  /** The ground standing pieces claimed on the Block so far, of those standing at Stage `stage`: `kit.claimed`. */
  const claimed = (stage = 3): readonly Claim[] => claims.filter((c) => c.kind === 'stand' && (c.from ?? 1) <= stage)
  /**
   * The way through a door `w` wide in a wall at `(x, y)` facing `ry`, from `out` m out from it, as a claim (#191): 1.2 m
   * deep, and as wide as the door less 0.2 m either side, where its frame stands and pot plants may flank it.
   */
  const doorway = (x: number, y: number, ry: number, w: number, out = 0) =>
    claim('door', ...to(x, y, ry, 0, out + 0.6), Math.max(0.6, w - 0.4), 1.2, ry)
  // Whether what is built from here on wears surface pattern and leaves pools of light (`finish`), and whether it is a
  // Block-zoom prop, painted on `blockZoom` (`blockZoomProps`).
  let [patterned, pooled, inBlockZoomProps] = [false, false, false]
  /** Whether what is built from here on is to the Finish (`finish`), as far as the materials allow (#178). */
  const finished = () => patterned || pooled
  let open = 0 // parts from here on belong to the next brick
  // The Stages built, and the fate and the lot of the bricks closed from now on.
  let stages: Stages = { from: 2, to: 2 }
  let fate: Fate = 'stays'
  let lot = -1
  /** Whether `(x, y)` lies on the Block being built, at least `clear` m in from its edge. Nothing lies loose until told. */
  let onBlock = (_x: number, _y: number, _clear: number) => false
  /**
   * Run `fn` on a random stream of its own, seeded `seed`, its bricks taking the fate `as`. The kit's own stream gave
   * the seed, one draw however much `fn` draws, so nothing built after it changes with what it built.
   */
  const own = (seed: number, as: Fate, fn: () => void) => {
    const [outer, was] = [rand, fate]
    ;[rand, fate] = [mulberry32(seed), as]
    fn()
    ;[rand, fate] = [outer, was]
  }
  const [m, q, up] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0)]
  /** Give every vertex of a geometry of the glass or the bulb the glow `glow`. */
  const glowing = (geo: THREE.BufferGeometry, glow: number) =>
    geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(glow), 1))
  /**
   * `colour` up to `TONE` lighter or darker, by where `geo` stands: low poly (`./look`), parts painted one colour on the
   * soft-lit scenery are not quite one tone, so that a large flat area is not dead, and a part tones the same way on
   * every load. Glass, bulbs and what is drawn instanced keep their colour.
   */
  const toned = (geo: THREE.BufferGeometry, colour: string) => {
    const p = geo.attributes.position
    const at = (v: number) => Math.round(v * 10) // to 10 cm, past the float's last digits
    return new THREE.Color(colour).offsetHSL(0, 0, nudge(at(p.getX(0)), at(p.getY(0)), at(p.getZ(0))) * TONE)
  }
  /** Add a geometry that is already in place (Three coordinates). The kit takes it over. */
  const push = (geo: THREE.BufferGeometry, look: Look) => {
    if (typeof look === 'string')
      parts.push({ geometry: tint(geo, LOW_POLY ? toned(geo, look) : look), material: inBlockZoomProps ? blockZoom : solid, brick: -1 })
    else if ('tint' in look) {
      const tinted = tint(geo, look.tint)
      const lit = look.material === glass || look.material === bulb
      parts.push({ geometry: lit ? glowing(tinted, look.glow ?? 1) : tinted, material: look.material, brick: -1 })
    } else if (look === glass || look === bulb) parts.push({ geometry: glowing(tint(geo, '#ffffff'), 1), material: look, brick: -1 })
    else parts.push({ geometry: geo, material: look, brick: -1 })
  }
  /** Add a copy of a shape standing at `(x, y)`, `h` above the road, turned `ry` and scaled. */
  const add = (geo: THREE.BufferGeometry, look: Look, x: number, y: number, h: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(sx, sy, sz))), look)
  }
  /**
   * Add a copy of a box as `add` does, unscaled, wearing `cladding` (`./pattern`) where the kit builds patterned, its
   * windows lit as `seed` (any whole number) has them.
   */
  const cladded = (
    geo: THREE.BufferGeometry,
    look: Look,
    x: number,
    y: number,
    h: number,
    ry: number,
    cladding: Cladding,
    seed: number,
  ) => {
    if (!patterned) return add(geo, look, x, y, h, ry)
    const g = clad(geo.index ? geo.toNonIndexed() : geo.clone(), cladding, mulberry32(seed)())
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(1, 1, 1))), look)
  }
  /**
   * A pool of light on the ground at `(x, y)`, `h` above the road (#174), `w` by `d` and turned `ry`, in the colour and
   * strength of `kind`'s light, where the kit builds with pools, or for the kerbside's own lights on every Tile as far
   * as the materials' finish allows (#176): `./movers` draws it, riding the next brick closed, lit as the lamps are.
   */
  const pool = (kind: keyof typeof POOL.colours, x: number, y: number, h: number, w: number, d: number, ry = 0) => {
    if (!pooled && !(KERBSIDE_POOLS.has(kind) && materials.finish.pools)) return
    const colour = new THREE.Color(POOL.colours[kind]).multiplyScalar(POOL.strengths[kind])
    pools.push({ at: new THREE.Vector3(x, h + 0.06, -y), w, d, ry, colour, brick: bricks.length })
  }
  /** Build what `fn` adds as Block-zoom props, painted on `blockZoom`, which hides them beyond Tile zoom (#175). */
  const blockZoomProps = (fn: () => void) => {
    const was = inBlockZoomProps
    inBlockZoomProps = true
    fn()
    inBlockZoomProps = was
  }
  /** The bulb painted `colour` by day and lit in it at night, `glow` as bright as a lamp: #153's amber, #175's signs. */
  const lit = (colour: string, glow: number): Look => ({ material: bulb, tint: bulbTint(colour), glow })
  /** Marks for lettering on a board in `colour` (#175): dark on a pale board, pale on a dark or a coloured one, lit if `on`. */
  const markOf = (colour: string, on: boolean): Look =>
    pale(colour) ? FRONTAGE.marks.dark : on ? lit(FRONTAGE.marks.pale, FRONTAGE.lit.marks) : FRONTAGE.marks.pale
  /**
   * Steam rising from `(x, y)`, `h` above the road, as from a noodle shop's vent or a food stall's pot (#175): small
   * puffs that `./movers` lets rise through the working day, riding the next brick closed.
   */
  const steam = (x: number, y: number, h: number) => plume('steam', x, y, h)
  /** Smoke rising from a chimney's top at `(x, y)`, `h` above the road (#150), riding the next brick closed. */
  const smoke = (x: number, y: number, h: number) => plume('smoke', x, y, h)
  /**
   * A plume of `kind` from `(x, y)`, `h` above the road, riding the next brick closed: a chimney's smoke or steam, or
   * (#180) a fountain's spray thrown up or petals drifting down from a sakura's crown, puffs that `./movers` lets fly
   * through the working day. A sakura's petals take its `crown`, how far out it reaches and how far they fall (#227).
   */
  const plume = (kind: PlumeKind, x: number, y: number, h: number, crown?: Plume['crown']) => {
    plumes.push({ at: new THREE.Vector3(x, h, -y), brick: bricks.length, ...(kind !== 'smoke' && { kind }), ...(crown && { crown }) })
  }
  /** A pot plant `s` m tall at `(x, y)`, `h` above the road (#175): a pot from `draw`'s colours under a bush of leaves. */
  const pot = (x: number, y: number, h: number, s: number, draw: () => number) => {
    add(POT, HOME.pots[Math.floor(draw() * HOME.pots.length)], x, y, h, 0, s * 0.42, s * 0.55, s * 0.42)
    add(BUSH, LEAVES.round[Math.floor(draw() * LEAVES.round.length)], x, y, h + s * 0.78, draw() * TAU, s * 0.5, s * 0.42, s * 0.5)
  }
  /** Close the shapes added since the last brick into one, which lands on `(x, y)`, `h` above the road. */
  const brick = (kind: BrickKind, x: number, y: number, h: number, dust = 0) => {
    if (open === parts.length) return
    for (let i = open; i < parts.length; i++) parts[i].brick = bricks.length
    open = parts.length
    bricks.push(made(kind, new THREE.Vector3(x, h, -y), dust))
  }

  // Buildings repeat their shapes, so each is cut once per size, to `digits` places, and disposed of when the kit is done.
  const cut: Map<string, THREE.BufferGeometry | THREE.BufferGeometry[]>[] = []
  const memo = <A extends number[], G extends THREE.BufferGeometry | THREE.BufferGeometry[]>(make: (...a: A) => G, digits = 2) => {
    const shapes = new Map<string, G>()
    cut.push(shapes)
    return (...a: A): G => {
      const key = a.map((v) => v.toFixed(digits)).join()
      if (!shapes.has(key)) shapes.set(key, make(...a))
      return shapes.get(key)!
    }
  }
  const box = memo((w: number, h: number, d: number, r: number, b: number) => roundedBox(w, h, d, r, b))
  /** A contact shadow under a footprint `w` by `d`, round or square, turned `ry`. */
  const shadow = (x: number, y: number, h: number, w: number, d: number, round = false, ry = 0) =>
    inBlockZoomProps || add(PLANE, round ? roundShadow : squareShadow, x, y, h + 0.05, ry, w, 1, d) // none under a Block-zoom prop
  // Plain boxes, unrounded, for the fine parts of a building (a floor of glass, a fin, a mullion).
  const cuboid = memo((w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0))
  // Gable roofs, which repeat along a terraced row, and hipped ones (#178).
  const gableRoof = memo((len: number, wid: number, h: number) => gable(len, wid, h))
  const hipRoof = memo((len: number, wid: number, h: number) => hip(len, wid, h))
  // Solar panels (#157): a frame `len` along a roof's ridge and `slope` down it, and two rows of cells on it, flat, then
  // tilted `tilt` about x so that they face +z.
  const solarPanel = memo((len: number, slope: number, tilt: number): [THREE.BufferGeometry, THREE.BufferGeometry] => {
    const cols = Math.max(2, Math.round(len / 1.1))
    const [cw, ch] = [len / cols, slope / 2]
    const cells: THREE.BufferGeometry[] = []
    for (let i = 0; i < cols; i++)
      for (const r of [-0.5, 0.5])
        cells.push(new THREE.BoxGeometry(cw - 0.1, 0.06, ch - 0.1).translate(-len / 2 + (i + 0.5) * cw, 0.07, r * ch).toNonIndexed())
    const frame = new THREE.BoxGeometry(len, 0.08, slope).translate(0, 0.04, 0).toNonIndexed()
    return [frame.rotateX(tilt), mergeGeometries(cells)!.rotateX(tilt)]
  })
  /** Add a shape at `(lx, ly)` in the frame of a building at `(x, y)` whose front faces `ry`, turned with it, `h` above the road. */
  const local = (geo: THREE.BufferGeometry, look: Look, x: number, y: number, ry: number, lx: number, ly: number, h: number, sx = 1) =>
    add(geo, look, ...to(x, y, ry, lx, ly), h, ry, sx)
  /** A kei vehicle's chassis, `long` m, and its four tyres on axles `axles` m along it, its front facing `ry` (#149, #157). */
  const keiChassis = (x: number, y: number, h: number, ry: number, long: number, axles: number[]) => {
    local(cuboid(1.7, 0.36, long), TRUCK.chassis, x, y, ry, 0, 0, h + 0.28)
    for (const lx of [-0.82, 0.82]) for (const ly of axles) local(cuboid(0.32, 0.62, 0.62), TRUCK.tyre, x, y, ry, lx, ly, h)
  }
  /** One window's glass, lit at night for `share` of the windows and dark for the rest. */
  const pane = (share: number) => ({ material: glass, tint: rand() < share ? pick(windows) : unlit })
  /** A detail that moves on its own (`./movers`): a brick of its own with no shapes, standing where its loop starts. */
  const mover = (
    kind: MoverKind,
    loop: Polyline,
    stops: number[],
    first: number,
    h: number,
    more: Pick<Mover, 'waits' | 'reverse' | 'paint' | 'face' | 'hang' | 'laps' | 'away'> = {},
  ) => {
    movers.push({ kind, loop, stops, first, h, ...more, brick: bricks.length })
    const [p, f] = [loop.pts[0], more.face]
    const at = f ? new THREE.Vector3(f.x, h + p.y, -f.y) : new THREE.Vector3(p.x, h, -p.y)
    bricks.push(made('mover', at, 0))
  }
  /** Add a shape at `(lx, ly)` in the frame of something at `(x, y)` facing `ry`, turned with it and scaled. */
  const put = (
    geo: THREE.BufferGeometry,
    look: Look,
    x: number,
    y: number,
    ry: number,
    lx: number,
    ly: number,
    h: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) => add(geo, look, ...to(x, y, ry, lx, ly), h, ry, sx, sy, sz)
  /**
   * A flight of stairs (#156): a slab `w` wide and `t` thick sloping up `rise` over `run`, up toward +x (or -x for a
   * negative `run`), centred on its middle, cut once per size: the kit disposes of it.
   */
  const flight = memo((run: number, rise: number, w: number, t: number) =>
    new THREE.BoxGeometry(Math.hypot(run, rise), t, w).rotateZ(Math.atan2(rise, run)),
  )
  /**
   * An outdoor AC unit (#156) with its back to a wall at `(x, y)`, the wall facing `ry`, standing `h` above the road: a
   * pale casing with a fan's round grille, drawn a little large as the props are. It joins the next brick.
   */
  const airCon = (x: number, y: number, h: number, ry: number) => {
    put(cuboid(1.05, 0.74, 0.44), AIRCON.body, x, y, ry, 0, 0.24, h)
    put(FACING_DISC, AIRCON.grille, x, y, ry, -0.17, 0.47, h + 0.37, 0.26, 0.26, 1)
  }
  /**
   * A pole `len` long for washing centred on `(x, y)`, running along `ry`'s right, on a stand at each end with an arm
   * across its top, in `look` (#157, #178): it joins the next brick. Returns how high over `h` the pole runs.
   */
  const poleStand = (x: number, y: number, h: number, ry: number, len: number, look: Look) => {
    const top = 2.3
    for (const k of [-1, 1]) {
      local(cuboid(0.07, top + 0.1, 0.07), look, x, y, ry, (k * len) / 2, 0, h)
      local(cuboid(0.07, 0.07, 0.6), look, x, y, ry, (k * len) / 2, 0, h + top - 0.04)
    }
    local(cuboid(len + 0.3, 0.06, 0.06), look, x, y, ry, 0, 0, h + top)
    return top
  }
  /** A bicycle standing at `(x, y)`, its length along `ry`'s right, a little large (#156): two wheels, a frame, a saddle and a basket. */
  const bicycle = (x: number, y: number, h: number, ry: number) => {
    const frame = pick(BIKES.frames)
    const r = 0.38
    // Each wheel a disc on either side, so it shows from both, at a few dozen triangles a bicycle: they come by the hundred.
    for (const lx of [-0.6, 0.6]) {
      put(FACING_DISC, BIKES.tyre, x, y, ry, lx, 0.04, h + r, r, r, 1)
      put(FACING_DISC, BIKES.tyre, x, y, ry + Math.PI, -lx, 0.04, h + r, r, r, 1)
    }
    put(cuboid(0.95, 0.07, 0.07), frame, x, y, ry, 0.05, 0, h + 0.82) // the top tube
    put(cuboid(0.07, 0.62, 0.07), frame, x, y, ry, -0.32, 0, h + r) // the seat tube, its saddle on top
    put(cuboid(0.07, 0.72, 0.5), frame, x, y, ry, 0.48, 0, h + r) // the fork and the handlebar
    put(cuboid(0.36, 0.26, 0.38), BIKES.steel, x, y, ry, 0.72, 0, h + r + 0.42) // the basket
  }
  /**
   * `count` bicycles side by side `gap` m apart, centred on `(x, y)` along `ry`'s right, each facing out to its front
   * (#156), or turned `slant` off square to it (#153). They join the next brick.
   */
  const row = (x: number, y: number, h: number, ry: number, count: number, gap: number, slant = 0) => {
    for (let k = 0; k < count; k++) bicycle(...to(x, y, ry, (k - (count - 1) / 2) * gap, 0), h, ry + Math.PI / 2 + slant)
  }
  /**
   * `count` bicycles standing side by side `gap` m apart, centred on `(x, y)`, as one brick (#156): `kit.bicycles`.
   */
  const bicycles = (x: number, y: number, h: number, ry: number, count: number, gap = BIKE_RACK.per, slant = 0) => {
    row(x, y, h, ry, count, gap, slant)
    shadow(x, y, h, count * gap + 0.6, 2.4, false, ry)
    brick('building', x, y, h)
  }
  /**
   * A beacon's bulb of radius `r` at `(x, y)`, `h` above the road (#155), white or amber, never red: `./movers` draws it
   * and blinks it at night, riding the next brick closed.
   */
  const beacon = (x: number, y: number, h: number, r: number, colour: BeaconColour = 'white') => {
    beacons.push({ at: new THREE.Vector3(x, h, -y), r, colour, brick: bricks.length })
  }
  /**
   * Something that hangs from a line through `(x, y)`, `h` above the road, and sways in the wind (#155): laundry on a
   * pole or a futon over a railing, the line running along `ry` (0 along x, as a front facing `ry` runs), out of the
   * building on the side a front facing `ry` looks, painted and sized as `more` has it. A futon's cover, unless given,
   * is drawn from where it hangs, so the kit's stream is untouched. `./movers` draws it, riding the next brick closed.
   */
  const sway = (kind: SwayKind, x: number, y: number, h: number, ry: number, more: Pick<Sway, 'paint' | 'size'> = {}) => {
    const paint = more.paint ?? (kind === 'futon' ? FUTONS[spot(x, y) % FUTONS.length] : undefined)
    const size = more.size ? { size: more.size } : {}
    sways.push({ kind, at: new THREE.Vector3(x, h, -y), ry, ...(paint ? { paint } : {}), ...size, brick: bricks.length })
  }
  /**
   * The mark of a helipad painted on a roof at `(x, y)`, `h` above the road (#155): a dark disc with a ring `r` m across
   * its outside, and an H inside, joining the next brick. Its colours are `paint`'s: a residential tower's green pad
   * under yellow unless given, an office tower's grey pad with a yellow ring and a white H (#154).
   */
  const helipad = (x: number, y: number, h: number, r: number, paint: { pad: string; ring: string; mark: string } = HELIPAD) => {
    add(DISC, paint.pad, x, y, h, 0, r + 0.6, 0.12, r + 0.6)
    add(RING, paint.ring, x, y, h + 0.13, 0, r, 1, r)
    for (const k of [-1, 1]) add(cuboid(0.55, 0.04, r * 1.05), paint.mark, x + k * r * 0.33, y, h + 0.12)
    add(cuboid(r * 0.66, 0.04, 0.5), paint.mark, x, y, h + 0.12)
  }
  // Panels laid on a slope (#178): a box `w` × `t` × `d` centred on its middle, tipped `tip` about x so that its top looks
  // out of its front (-z) and up, as a roof's slope does.
  const tipped = memo((w: number, t: number, d: number, tip: number) => new THREE.BoxGeometry(w, t, d).rotateX(-tip), 3)
  /**
   * Add a copy of a pitched roof as `add` does, unscaled, wearing tile rows (`./pattern`) where the kit builds patterned
   * (#178): kawara unless `kind` says otherwise, as a house's flat tiles (#179), and its upright faces `upright`, as a
   * shed's sawtooth wears its sheet up its steep faces (#181).
   */
  const tiled = (
    geo: THREE.BufferGeometry,
    look: Look,
    x: number,
    y: number,
    h: number,
    ry: number,
    seed: number,
    kind: Pattern = PATTERN.tiles,
    upright: Pattern = PATTERN.gable,
  ) => {
    if (!patterned) return add(geo, look, x, y, h, ry)
    const g = tile(geo.index ? geo.toNonIndexed() : geo.clone(), mulberry32(seed)(), kind, upright)
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(1, 1, 1))), look)
  }

  /**
   * Add a copy of a cylinder (three's `CylinderGeometry`, its foot at y = 0) standing at `(x, y)`, `h` above the road,
   * `r` in radius and `tall` m tall, wearing `kind` round its side (`./pattern`'s `wrap`) where the kit builds patterned,
   * in bays of about `bay` m and storeys of `storey` m, `lit` of its floors lit for a curtain wall, as `seed` (any whole
   * number) has it: a round office tower's glass (#177), a tank's plates or a chimney's brick (#181).
   */
  const wrapped = (
    geo: THREE.BufferGeometry,
    look: Look,
    x: number,
    y: number,
    h: number,
    r: number,
    tall: number,
    { kind, bay, storey, lit = 0 }: { kind: Pattern; bay: number; storey: number; lit?: number },
    seed: number,
  ) => {
    if (!patterned) return add(geo, look, x, y, h, 0, r, tall, r)
    const g = wrap(geo.toNonIndexed(), 2 * Math.PI * r, tall, bay, storey, lit, mulberry32(seed)(), kind)
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.identity(), new THREE.Vector3(r, tall, r))), look)
  }

  /**
   * A car parked at `(x, y)`, its front facing `ry`, as one brick (#177, #178): the cars' `model` in `paint`, in plain
   * boxes: its body, cabin and glass, a taxi's roof lamp lit at night, its tyres, and its lamps as they are by day.
   */
  const parked = (model: ParkedModel, x: number, y: number, h: number, ry: number, paint: string) => {
    const { body, cabin, glass, wheels, lamps } = model
    const [head, , tail, , roof] = lampBoxes(lamps)
    const bodywork: [ParkedModel['body'], Look][] = [
      [body, paint],
      [cabin, paint],
      [glass, CAR.glass],
    ]
    if (roof) bodywork.push([roof, lit(CREAM, TAXI_LAMP)])
    for (const [p, look] of bodywork) local(cuboid(p.wide, p.tall, p.long), look, x, y, ry, 0, p.at, h + p.up)
    const tyre = 2 * wheels.r
    for (const lx of [-wheels.track, wheels.track])
      for (const ly of [-wheels.axle, wheels.axle]) local(cuboid(0.3, tyre, tyre), TRUCK.tyre, x, y, ry, lx, ly, h)
    for (const side of [-1, 1])
      for (const p of [head, tail]) local(cuboid(p.wide, p.tall, p.long), CAR[p.kind], x, y, ry, side * p.z, p.at, h + p.up)
    shadow(x, y, h, 2.9, 5.2, false, ry)
    brick('building', x, y, h)
  }

  return {
    add,
    push,
    put,
    cladded,
    tiled,
    wrapped,
    /** A gable roof `wid` across and `h` high, `len` long, its ridge along z (`./shapes`' `gable`), cut once per size: the kit disposes of it. */
    gable: gableRoof,
    /** A hipped roof (`./shapes`' `hip`), cut once per size as `gable` is (#178). */
    hip: hipRoof,
    brick,
    box,
    cuboid,
    shadow,
    glass,
    /** The tint that makes the glass the colour `color` (#179), as a pond's water is, unlit at night with a glow of 0. */
    glassOf,
    bulb,
    water,
    range,
    pick,
    chance: (p: number) => rand() < p,
    blockZoomProps,
    lit,
    pot,
    /**
     * A pool of light on the ground at `(x, y)`, `h` above the road, `w` by `d` and turned `ry`, in the colour and
     * strength of `kind`'s light, where the kit builds with pools (#174): it rides the next brick closed.
     */
    pool,
    /**
     * Whether the kerbside is dressed (#175, on every Tile since #176): a kerbstone line, tactile paving, street
     * furniture, street lights and marks on the road plate. It goes with the Finish, as far as the materials'
     * `finish` allows it at all, so that a sheet or a bench with none shows the kerbside as it was.
     */
    get dressed() {
      return materials.finish.pattern || materials.finish.pools
    },
    /** Whether what is built from here on is to the Finish (`finish`), as far as the materials allow (#178). */
    get finished() {
      return finished()
    },

    /** How much the kit has built so far, to read back what it builds from here on (`since`). */
    mark() {
      return { parts: parts.length, movers: movers.length }
    },

    /**
     * What the kit built since `from` (a `mark`), for the street furniture to keep off (`./kerbside`, #176): its parts'
     * geometries in place, and the loops of its movers.
     */
    since(from: { parts: number; movers: number }) {
      return {
        geometries: parts.slice(from.parts).map((p) => p.geometry),
        loops: movers.slice(from.movers).map(({ kind, loop }) => ({ kind, loop })),
      }
    },
    /** Dev only (#175): how much deeper what stands on a Block is laid than built, for a comparison. 1 unless set. */
    deeper: materials.finish.deeper ?? 1,

    /**
     * Build what `fn` adds as street furniture: Block-zoom props (`blockZoomProps`, #176), or at every zoom where the
     * dev switch `furniture` asks for it, as #175 built it.
     */
    furniture(fn: () => void) {
      if (materials.finish.furniture) fn()
      else blockZoomProps(fn)
    },

    steam,
    smoke,
    plume,

    // What the Zones' buildings (`./zones`, #207) build with beyond the shapes above: the kit's stream, the glass's
    // window tints, where and how the kit builds, and the pieces more than one Zone's buildings share.
    /** One draw from the kit's stream, the one `from` and `staged` reseed. */
    rand: () => rand(),
    /**
     * Build what `fn` adds on a stream of its own from `seed` (any whole number, such as a `spot`), so that the kit's
     * stream is untouched, in the Stage-up role the kit is building in now.
     */
    seeded(seed: number, fn: () => void) {
      own(seed, fate, fn)
    },
    /** Whether the kit builds patterned at this moment (`finish`), as `cladded` and `paving` do. */
    get patterned() {
      return patterned
    },
    windows,
    unlit,
    pane,
    formed,
    doorway,
    local,
    solarPanel,
    tipped,
    airCon,
    markOf,

    // What the props one Zone lays (`./zones`, #210) build with beyond the above: what flies from a pole; a laundry pole's
    // stand, which low- and medium-density both lay; the bicycles' row, which `bicycles` lays too; and stairs' flights,
    // cut once per size.
    /**
     * Something that flies from the top of a pole at `(x, y)`, `h` above the road, and flutters in the wind (`./movers`'
     * `Flag`, #154): a flag, a nobori or a carp, in `colour`, lowered to `low` m above the road for the night and turned
     * or sized as `more` has it. It rides the next brick closed.
     */
    fly(kind: FlagKind, x: number, y: number, h: number, low: number, colour: string, more: Pick<Flag, 'ry' | 'size'> = {}) {
      flags.push({ kind, at: new THREE.Vector3(x, h, -y), low, colour, ...more, brick: bricks.length })
    },
    poleStand,
    row,
    flight,

    /** Build at Stage `s.to`, or, when `s.from` differs, a Tile's Stage-up from one to the other. Stage 2 unless told. */
    stages(s: Stages) {
      stages = s
    },

    /**
     * Build what follows to the Finish (#173) if `on`, wearing surface pattern and leaving pools of light, as
     * far as the materials' `finish` allows (#174).
     */
    finish(on: boolean) {
      ;[patterned, pooled] = [on && materials.finish.pattern, on && materials.finish.pools]
    },

    /**
     * A Block's pavement, raised from its outline (`./blocks`). The surface pattern lays paving joints over it on every
     * Tile, picking it out by its colour and height, as far as the materials' finish allows (#174; every Tile since #176).
     */
    pavement(geo: THREE.BufferGeometry, look: Look) {
      push(geo, look)
    },

    /**
     * Coloured paving on the pavement, `w` by `d` centred on `(x, y)`, `h` above the road and turned `ry`, as one brick
     * (#175): bricks in a basket weave in `colour` where the kit builds patterned, as before a row of shop fronts, or
     * `kind`'s other paving, such as an office plaza's (#177), `lift` m up so that one paving may lie over another.
     */
    paving(
      x: number,
      y: number,
      h: number,
      w: number,
      d: number,
      ry: number,
      colour: string,
      kind: Pattern = PATTERN.bricks,
      lift = 0.012,
    ) {
      const g = PLANE.toNonIndexed().applyMatrix4(
        m.compose(new THREE.Vector3(x, h + lift, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(w, 1, d)),
      )
      push(patterned ? pave(g, kind) : g, colour)
      brick('ground', x, y, h)
    },

    /**
     * Ground laid from a geometry already in place (Three coordinates) in `look` (#180), as a park's lawn or its paths:
     * wearing `kind`'s pattern on its top where the kit builds patterned, radial paving round `middle`, a quarter turn
     * round if `quarter` (#184). It joins the next brick.
     */
    laid(geo: THREE.BufferGeometry, look: Look, kind: Pattern, middle?: { x: number; y: number }, quarter = false) {
      push(patterned ? pave(geo, kind, middle, quarter) : geo, look)
    },

    /** Say where loose things on the ground, such as fallen petals, may lie: `on(x, y, clear)`, on the Block `clear` m in from its edge. */
    ground(on: (x: number, y: number, clear: number) => boolean) {
      onBlock = on
    },

    /** Whether a loose thing may lie at `(x, y)`, on the Block at least `clear` m in from its edge (`ground`). */
    onGround(x: number, y: number, clear: number) {
      return onBlock(x, y, clear)
    },

    /**
     * The bricks closed from now on stand on lot `n` of the Block (-1: on none), whose ground, if given, is `on`: a box,
     * or one turned as a row's lots are. The ground goes no further than the scene check (#191), whose rule 10 reads
     * which lots lie side by side.
     */
    lot(n: number, on?: Bounds | { x: number; y: number; w: number; d: number; ry: number }) {
      lot = n
      ground = on && ('x0' in on ? { x: (on.x0 + on.x1) / 2, y: (on.y0 + on.y1) / 2, w: on.x1 - on.x0, d: on.y1 - on.y0, ry: 0 } : on)
    },

    /**
     * Build what `fn` adds as one scene of the Block (#173's rule 5), of the kind its Zone names `kind`, for the scene
     * check to find (#191). It changes nothing that is drawn.
     */
    scene(kind: string, fn: () => void) {
      const was = scene
      scene = scenes.push({ kind }) - 1
      fn()
      scene = was
    },

    /**
     * Lay claim to ground later pieces must keep clear of (#191): a box `w` by `d` at `(x, y)` turned `ry`, as `Claim`
     * has it, riding the next brick closed. The scene check holds what stands on it to account; it changes nothing that
     * is drawn.
     */
    claim,

    /**
     * Lay claim to the ground a standing piece stands on (#198), with what room it keeps round it: a box `w` by `d` at
     * `(x, y)` turned `ry`, its piece standing from Stage `from`. Laid as the piece is placed, whatever the Stage built,
     * so that the next piece's `unclaimed` keeps off it at every Stage; riding the next brick closed, as `claim`.
     */
    stand,

    /**
     * Whether ground `w` by `d` at `(x, y)` turned `ry` keeps clear of every claim laid on the Block so far (#193): the
     * bays and the steps before doors but for a sliver, and the ground standing pieces took (`stand`), it and each grown
     * `room` m each side (shrunk, if below 0, as `overlap` in `zones/ground` shrinks both), which later pieces read rather
     * than a list of their own (#198). A point asks with `w` and `d` 0: whether it lies `room` m or more from each. It asks after the claims `of` those kinds, every kind by
     * default: what stands (`['stand']`) for ground that lies flat or is passed over, as a bay's paint or a mover's way.
     */
    unclaimed,

    /**
     * The ground standing pieces claimed on the Block so far (#198), of those standing at Stage `stage` (all, by
     * default): for what reads the ground left bare, rather than asks whether one piece's is free.
     */
    claimed,

    /**
     * Something that stands the same at every Stage from `first` on, built by `fn` on a random stream of its own: seeded
     * `seed`, such as a `spot`, or else by one draw from the kit's stream. In a Stage-up it stays if both Stages have it,
     * and comes or goes if only one does.
     */
    from(first: number, fn: () => void, seed = (rand() * 4294967296) >>> 0) {
      const [low, high] = [Math.min(stages.from, stages.to), Math.max(stages.from, stages.to)]
      if (first > high) return
      own(seed, first <= low ? 'stays' : stages.to > stages.from ? 'comes' : 'goes', fn)
    },

    /**
     * Something that changes with the Stage, built by `fn(stage)` on a random stream of its own (seeded as `from`'s), so
     * that it draws alike at every Stage until it draws what only its Stage has: each Stage builds the same thing,
     * better. In a Stage-up the old Stage's goes and the new Stage's comes.
     */
    staged(fn: (stage: Stage) => void, seed = (rand() * 4294967296) >>> 0) {
      if (stages.from === stages.to) return own(seed, 'stays', () => fn(stages.to))
      own(seed, 'goes', () => fn(stages.from))
      own(seed, 'comes', () => fn(stages.to))
    },

    /**
     * A tree of size `s` (1 is about 6 m tall), as one brick: a cluster of spheres, or stacked cones for a pine. A sakura
     * has petals fallen round it, as many to the square metre whatever its size. They are drawn from where it stands,
     * so the kit's own stream is untouched, and they lie only on the Block: on a raised lawn, only well in from the
     * Block's edge, so that none hangs over the pavement beyond the lawn. From one sakura in two, chosen by where it
     * stands, petals drift down from its crown through the working day (#225), a plume riding its brick. A `coarse`
     * tree's spheres have fewer faces, for the trees a Zone lays by the dozen on its Blocks (#178): they read the same
     * from Tile zoom at under half the triangles. A round tree with `leaves` has leaves fallen round it, as a sakura's
     * petals, in greens and ochre (#180).
     */
    tree(x: number, y: number, h: number, s: number, kind: TreeKind, coarse = false, leaves = false) {
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
            coarse ? COARSE_SPHERE : SPHERE,
            pick(LEAVES[kind]),
            x + Math.cos(a) * out,
            y + Math.sin(a) * out,
            h + s * (i ? range(3.6, 5.4) : CROWN.from),
            0,
            k,
            k * 0.9,
            k,
          )
        }
      }
      const fallen = kind === 'sakura' ? PETALS : kind === 'round' && leaves ? LEAVES_FALLEN : null
      if (fallen) {
        const fall = mulberry32(spot(x, y))
        const clear = h > KERB + 0.1 ? 2.4 : 0.5
        const n = Math.min(fallen.most, Math.round(fallen.count * (s / 0.8) ** 2))
        for (let i = 0; i < n; i++) {
          const [a, r, colour, turn] = [fall() * TAU, Math.sqrt(fall()) * s * fallen.reach, Math.floor(fall() * 3), fall() * TAU]
          const [px, py] = [x + Math.cos(a) * r, y + Math.sin(a) * r]
          if (onBlock(px, py, clear))
            add(PETAL, fallen.colours[colour], px, py, h + 0.08, turn, ...(fallen.scale as [number, number, number]))
        }
      }
      if (kind === 'sakura' && spot(x, y) % 2) plume('petals', x, y, h + CROWN.from * s, { out: CROWN.out * s, drop: CROWN.from * s })
      shadow(x, y, h, s * 6.8, s * 6.8, true)
      brick('tree', x, y, h)
    },

    /** A lawn over a footprint `w` by `d`, centred on `(x, y)`: a house's garden or a courtyard. It joins the next brick. */
    lawn(x: number, y: number, h: number, w: number, d: number) {
      add(box(w, 0.16, d, 0.8, 0.06), LAWN, x, y, h)
    },

    /**
     * A hedge round the edge of a lawn `w` by `d` centred on `(x, y)`, with a gap for a gate in the middle of side `gate`
     * (0 east, 1 north, 2 west, 3 south), as one brick. Plain boxes: a garden's hedge is laid by the hundred.
     */
    hedge(x: number, y: number, h: number, w: number, d: number, gate: number | Gap[]) {
      const [thick, tall] = [0.7, 1.1]
      const gaps = typeof gate === 'number' ? [{ side: gate, at: 0, wide: 2.4 }] : gate
      const sides: [sx: number, sy: number, sw: number, sd: number][] = [
        [x + w / 2 - thick / 2, y, thick, d],
        [x, y + d / 2 - thick / 2, w - 2 * thick, thick],
        [x - w / 2 + thick / 2, y, thick, d],
        [x, y - d / 2 + thick / 2, w - 2 * thick, thick],
      ]
      sides.forEach(([sx, sy, sw, sd], side) => {
        // The lengths between the gaps on this side, from one end to the other.
        const eastWest = side % 2 === 1
        const len = eastWest ? sw : sd
        const cuts = gaps.filter((g) => g.side === side).map((g) => [g.at - g.wide / 2, g.at + g.wide / 2])
        cuts.sort((a, b) => a[0] - b[0]).push([len / 2, len / 2])
        let from = -len / 2
        for (const [a, b] of cuts) {
          const to = Math.min(a, len / 2)
          if (to - from > 0.01) {
            const [mid, l] = [(from + to) / 2, to - from]
            if (eastWest) add(cuboid(l, tall, sd), HEDGE, sx + mid, sy, h)
            else add(cuboid(sw, tall, l), HEDGE, sx, sy + mid, h)
          }
          from = Math.max(from, b)
        }
      })
      brick('ground', x, y, h)
    },

    /**
     * A pavilion standing on its floor at `(x, y)`, `h` above the road, as one brick: four wooden posts under a hipped
     * roof, open on every side, the kind that stands over a Japanese garden's pond; its roof in tile rows if `inTiles`
     * (#180), where the kit builds patterned.
     */
    pavilion(x: number, y: number, h: number, inTiles = false) {
      add(cuboid(4.2, 0.3, 4.2), PAVILION.floor, x, y, h)
      for (const i of [-1, 1]) for (const j of [-1, 1]) add(cuboid(0.3, 2.6, 0.3), PAVILION.posts, x + i * 1.75, y + j * 1.75, h + 0.3)
      if (inTiles) tiled(PYRAMID.clone().scale(3.6, 1.8, 3.6), PAVILION.roof, x, y, h + 2.9, Math.PI / 4, spot(x, y))
      else add(PYRAMID, PAVILION.roof, x, y, h + 2.9, Math.PI / 4, 3.6, 1.8, 3.6)
      shadow(x, y, h, 6, 6, true) // round, as the trees' are: a park or a meadow then draws no other shadow
      brick('building', x, y, h)
    },

    /**
     * A detail that moves on its own (`./movers`), working the closed `loop` a stretch at a time from stop `first` of
     * `stops`, `h` above the road, and waiting, reversing, painted, on a wall, hanging and working whole laps as `more`
     * has it: a brick of its own with no shapes, standing where the loop starts.
     */
    mover,

    /**
     * A kei truck parked at `(x, y)`, its front facing `ry` (0 north, π/2 west), as one brick (#149): a white cab and a
     * flat bed with low gates, oversized as the cars are. Its bed carries two crates at Stage 2 and is full at Stage 3.
     */
    keiTruck(x: number, y: number, h: number, ry: number, stage = 2) {
      const [paint, crates] = [TRUCK.paint, stage === 3 ? 6 : 2]
      keiChassis(x, y, h, ry, 4, [-1.3, 1.25])
      local(box(1.85, 1.36, 1.25, 0.22, 0.08), paint, x, y, ry, 0, 1.4, h + 0.62)
      const panes = { material: glass, tint: windows[2] }
      local(cuboid(1.7, 0.56, 0.06), panes, x, y, ry, 0, 2.04, h + 1.28)
      for (const lx of [-0.93, 0.93]) local(cuboid(0.06, 0.5, 0.64), panes, x, y, ry, lx, 1.5, h + 1.3)
      local(cuboid(1.85, 0.12, 2.75), paint, x, y, ry, 0, -0.6, h + 0.64)
      local(cuboid(1.85, 0.62, 0.08), paint, x, y, ry, 0, 0.74, h + 0.76) // the guard behind the cab
      local(cuboid(1.85, 0.36, 0.08), paint, x, y, ry, 0, -1.94, h + 0.76)
      for (const lx of [-0.89, 0.89]) local(cuboid(0.08, 0.36, 2.75), paint, x, y, ry, lx, -0.6, h + 0.76)
      for (let k = 0; k < crates; k++) {
        const [lx, ly] = [k % 2 ? 0.42 : -0.42, 0.36 - Math.floor(k / 2) * 0.66]
        local(cuboid(0.74, 0.44, 0.58), pick(TRUCK.crates), x, y, ry, lx, ly, h + 0.76)
      }
      shadow(x, y, h, 2.8, 5.2, false, ry)
      brick('building', x, y, h)
    },

    /**
     * A car parked at `(x, y)`, its front facing `ry` (0 north, π/2 west), as one brick (#177, #178): the cars' `model`
     * (#176, `TAXI` or `KEI`) in `paint` and plain boxes, oversized across as the cars are, a taxi's roof lamp cream by
     * day and lit at night.
     */
    parked,

    /**
     * A vending machine with its back to a wall, standing at `(x, y)` with its front facing `ry`, as one brick (#156):
     * a box in one of a few paints, a little large as the props are, its front a panel of the lamps' bulb that lights at
     * dusk, over a dark row of buttons and the slot.
     */
    vendingMachine(x: number, y: number, h: number, ry: number) {
      const { wide: W, deep: D } = VENDING_MACHINE
      put(cuboid(W, 2, D), pick(VENDING.paints), x, y, ry, 0, 0, h) // plain: machines come by the hundred
      put(cuboid(W - 0.18, 1.2, 0.05), bulb, x, y, ry, 0, D / 2, h + 0.68)
      put(cuboid(W - 0.18, 0.12, 0.06), VENDING.trim, x, y, ry, 0, D / 2, h + 0.5)
      put(cuboid(W - 0.4, 0.22, 0.06), VENDING.trim, x, y, ry, 0, D / 2, h + 0.16)
      pool('vending', ...to(x, y, ry, 0, D / 2 + POOL.front.vending), h, W + 1.4, POOL.deep.vending, ry)
      shadow(x, y, h, W + 0.8, D + 0.8, false, ry)
      brick('building', x, y, h)
    },

    /**
     * `count` bicycles standing side by side `gap` m apart, centred on `(x, y)`, the row along `ry`'s right and each
     * bicycle facing out to its front, or turned `slant` off square to it as a shop's row is (#153), as one brick (#156):
     * parked against a wall, by a shop or a house. Frames in the cars' colours, a little large as the props are.
     */
    bicycles,

    /**
     * A scarecrow standing at `(x, y)`, its arms turned `ry`, as one brick that pops in like a tree (#149): a post with
     * outstretched arms in a bright shirt, a cloth head and a straw hat, oversized a little so it reads from afar.
     */
    scarecrow(x: number, y: number, h: number, ry: number) {
      const shirt = pick(SCARECROW.shirts)
      add(cuboid(0.16, 2.6, 0.16), SCARECROW.post, x, y, h)
      add(cuboid(2.3, 0.14, 0.14), SCARECROW.post, x, y, h + 1.86, ry)
      add(cuboid(1.8, 0.32, 0.34), shirt, x, y, h + 1.74, ry)
      add(cuboid(0.86, 0.96, 0.46), shirt, x, y, h + 1.04, ry)
      add(BALL, SCARECROW.head, x, y, h + 2.42, 0, 0.32, 0.36, 0.32)
      add(CYLINDER, STRAW, x, y, h + 2.62, 0, 0.72, 0.06, 0.72)
      add(CONE, STRAW, x, y, h + 2.66, 0, 0.36, 0.4, 0.36)
      shadow(x, y, h, 2, 2, true)
      brick('tree', x, y, h)
    },

    sway,
    beacon,
    helipad,

    /**
     * A soft surface on the ground, `w` by `d` centred on `(x, y)` and turned `ry`, as a brick (#155): a playground's,
     * or with `look` a garden's lawn. Plain boxes, as are the flower beds: a tower's foot is laid by the hundred.
     */
    surface(x: number, y: number, h: number, w: number, d: number, ry: number, look: Look = PLAY.ground) {
      add(cuboid(w, 0.1, d), look, x, y, h, ry)
      brick('ground', x, y, h)
    },

    /**
     * A park bench at `(x, y)`, its front facing `ry` (0 north, π/2 west), as one brick that drops in (#152): wooden
     * slats on iron ends, 2 m long, oversized a little as the props are.
     */
    bench(x: number, y: number, h: number, ry: number) {
      local(cuboid(2, 0.08, 0.56), BENCH.wood, x, y, ry, 0, 0.02, h + 0.44)
      for (const lift of [0.62, 0.84]) local(cuboid(2, 0.14, 0.05), BENCH.wood, x, y, ry, 0, -0.28, h + lift)
      for (const lx of [-0.86, 0.86]) {
        local(cuboid(0.08, 0.44, 0.5), BENCH.iron, x, y, ry, lx, 0.02, h)
        local(cuboid(0.07, 1, 0.07), BENCH.iron, x, y, ry, lx, -0.3, h)
        local(cuboid(0.08, 0.05, 0.56), BENCH.iron, x, y, ry, lx, 0.02, h + 0.66)
      }
      shadow(x, y, h, 2.8, 1.4, true, ry) // round, as the trees' are: a meadow then draws no other shadow
      brick('building', x, y, h)
    },

    /** A frame of two swings at `(x, y)`, or of one if `one` (#178), its bar along `ry`'s right, as a brick that pops in (#155). */
    swings(x: number, y: number, h: number, ry: number, one = false) {
      const [wide, tall] = [one ? 2.2 : 3.4, 2.5]
      for (const k of [-1, 1]) {
        for (const j of [-0.7, 0.7]) {
          const leg = new THREE.BoxGeometry(0.14, tall + 0.2, 0.14).rotateX(-j * 0.5).translate(0, tall / 2, j * 0.62)
          local(leg, PLAY.swings, x, y, ry, (k * wide) / 2, 0, h)
          leg.dispose()
        }
      }
      local(cuboid(wide + 0.3, 0.14, 0.14), PLAY.swings, x, y, ry, 0, 0, h + tall)
      for (const k of one ? [0] : [-0.8, 0.8]) {
        for (const c of [-0.28, 0.28]) local(cuboid(0.04, tall - 0.6, 0.04), PLAY.chain, x, y, ry, k + c, 0, h + 0.6)
        local(cuboid(0.7, 0.08, 0.36), PLAY.seat, x, y, ry, k, 0, h + 0.55)
      }
      shadow(x, y, h, wide + 1.6, 2.4, false, ry)
      brick('tree', x, y, h)
    },

    /** A spring rider at `(x, y)` facing `ry`, as a brick that pops in (#155): a little animal to rock on. */
    rider(x: number, y: number, h: number, ry: number) {
      local(cuboid(0.14, 0.45, 0.14), PLAY.chain, x, y, ry, 0, 0, h)
      local(box(0.5, 0.45, 0.95, 0.2, 0.06), PLAY.rider, x, y, ry, 0, 0, h + 0.4)
      local(box(0.42, 0.42, 0.42, 0.18, 0.06), PLAY.rider, x, y, ry, 0, 0.45, h + 0.75)
      shadow(x, y, h, 1.2, 1.4, true)
      brick('tree', x, y, h)
    },

    /** A raised bed of flowers `w` by `d` at `(x, y)`, turned `ry`, in bloom `colour`, as a brick (#155). */
    flowerBed(x: number, y: number, h: number, w: number, d: number, ry: number, colour: string) {
      local(cuboid(w, 0.4, d), PLAY.rim, x, y, ry, 0, 0, h)
      local(cuboid(w - 0.3, 0.32, d - 0.3), HEDGE, x, y, ry, 0, 0, h + 0.3)
      const n = Math.max(2, Math.round(w / 0.9))
      for (let k = 0; k < n; k++) {
        const [bx, by] = to(x, y, ry, -w / 2 + 0.5 + (k * (w - 1)) / (n - 1), ((k % 2 ? 1 : -1) * d) / 4)
        add(BUSH, colour, bx, by, h + 0.66, k, 0.34, 0.26, 0.34)
      }
      brick('ground', x, y, h)
    },

    /** A street lamp, as one brick, with a pool of light round its post as far as the pavement goes, where the kit builds with pools. */
    lamp(x: number, y: number, h: number) {
      add(CYLINDER, '#7d8794', x, y, h, 0, 0.14, 5, 0.14)
      add(BALL, bulb, x, y, h + 5.2, 0, 0.44, 0.44, 0.44)
      // As wide as the pavement round its post lets it, its faint rim and no more past the kerb (#175), where a decal
      // at the pavement's height would float over the road plate.
      let r = POOL.lamp
      while (r > POOL.least && !onBlock(x, y, r * 0.78)) r -= 0.2
      pool('lamp', x, y, h, 2 * r, 2 * r)
      brick('lamp', x, y, h)
    },

    /** A cylinder of radii `rx` (east–west) and `ry`, `height` tall. */
    drum(look: Look, x: number, y: number, h: number, rx: number, ry: number, height: number) {
      add(CYLINDER, look, x, y, h, 0, rx, height, ry)
    },

    ball(look: Look, x: number, y: number, h: number, r: number) {
      add(BALL, look, x, y, h, 0, r, r, r)
    },

    /**
     * Everything built, as parts tagged with their bricks, the movers, the chimneys' plumes, the beacons, what sways,
     * the flags and the pools of light; and for the scene check (#191) the ground claimed, the scenes and the lots'
     * building forms. Every shape must be in a brick by now. The kit is spent after this.
     */
    done(): {
      parts: Part[]
      bricks: Brick[]
      movers: Mover[]
      plumes: Plume[]
      beacons: Beacon[]
      sways: Sway[]
      flags: Flag[]
      pools: Pool[]
      claims: Claim[]
      scenes: Scene[]
      forms: Form[]
    } {
      if (open < parts.length) throw new Error('the kit has shapes left out of any brick')
      for (const shapes of cut) {
        for (const g of [...shapes.values()].flat()) g.dispose()
        shapes.clear()
      }
      return { parts, bricks, movers, plumes, beacons, sways, flags, pools, claims, scenes, forms }
    },
  }
}
