import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import type { Bounds, Polyline } from '../sim/geometry'
import { KERB } from './blocks'
import type { Glow } from './day'
import type { Mover, MoverKind, Plume } from './movers'
import { canvasTexture, gable, roundedBox, sawtooth, tint } from './shapes'

const TAU = Math.PI * 2
// The palette is the oversaturated one picked in #104 at its gentlest strength. Within 30° of hue of the Tool blue or
// the Jam red-orange, a colour keeps under 65% of that colour's chroma, which is why the terracotta roof is a darker
// brick, the salmon one persimmon and the slate one a teal slate.
const WALLS = ['#fdeed6', '#ffd7b6', '#e0f2d4', '#cbebfc', '#fbe3a2', '#fbd2dd', '#e5dafb', '#fff7e8', '#c0e9e0']
const ROOFS = ['#d56454', '#4d7d9c', '#5aa69b', '#d09c53', '#8b7dbf', '#ea8548']
const LAWN = '#a9db7f' // a house's garden
const HEDGE = '#4e9f49' // round a Stage 3 house's garden
const [LEDGE, CHIMNEY] = ['#fbf6ef', '#c9b8a6'] // a Stage 3 house's, between its storeys and through its roof
// An office tower's curtain wall is one of these glasses, which the kit's one glass is tinted to, and its frame,
// fins and crown one of these trims.
const OFFICE_GLASS = ['#8fadc0', '#7b9db0', '#8cb5ae', '#5f778c', '#a6bfcb', '#c2b498']
const OFFICE_TRIM = ['#f2f4f6', '#dde3e8', '#e6cfa6', '#c4ccd4', '#68727f']
// Each Zone's own part of the palette, under the rule above (#136). The brick roof and the persimmon sit right at the
// cap, so the reds here keep below them.
// Medium-density residential: a terraced row's walls, roof tiles and doors, and an apartment building's walls and cap.
const TERRACE = {
  walls: ['#fff4e2', '#f6dfb4', '#f3d2c4', '#ead9c2', '#dcc6a6', '#d6e4d3', '#f9e7c8'],
  roofs: ['#4d6575', '#5b6b7a', '#3f5866', '#7a5a46', '#b85a4c', '#5aa69b', '#8b7dbf', '#a8765a'],
  door: '#8a5a3c',
  blooms: ['#ffadc8', '#f6d36a', '#fff7e8', '#c7b8f0'], // a Stage 3 house's window boxes
}
const COURTYARD = { walls: ['#e0f2d4', '#cbebfc', '#e5dafb', '#fbe3a2', '#c0e9e0', '#fbd2dd', '#fdeed6'], cap: '#fbfaf6' }
const PAVILION = { posts: '#a1714c', roof: '#4d6575', floor: '#c49a6c' } // a Stage 3 park's, over its pond
// High-density residential: pale walls, so the towers read as homes beside the offices' glass, and white or stone trim.
const FLATS = { walls: ['#fbf3e6', '#eef5f0', '#f4eefb', '#fdf0e2', '#eaf3f8', '#f8eef0'], trims: ['#ffffff', '#e9e4da', '#d9e3ea'] }
// Shops: a ground floor in a bold colour, which the awning and the signs take too, under pale storeys, so that it leads.
const SHOP = {
  fronts: ['#2fb39a', '#f0b43c', '#ff9ab8', '#79c86a', '#a58ad8', '#e8925e', '#5cc0d6'],
  uppers: ['#fff7e8', '#ffe9d2', '#fde2e4', '#e3f4dc', '#fff1c7', '#e6f0fb'],
  stripe: '#fbf8f2',
}
// Industrial: a shed's walls, its roof sheets and its roller doors, and a chimney's brick under a white band.
const SHED = {
  walls: ['#c9d1d6', '#b9c8b4', '#dccbaa', '#aebdcb', '#cfb39b', '#d9dcd2'],
  roofs: ['#8f9aa5', '#7f8c7c', '#9c8f80', '#6f7f8c'],
  doors: ['#f0c75e', '#e9eef2', '#79a7c3', '#7fbf9d'],
  chimney: '#a8604f',
  band: '#f4f1ea',
}
// Industrial details (#150): shipping containers in the roofs' colours, their frames and ribs a shade darker; pallets'
// wood and the goods on them, cartons and shrink-wrap; the paint marking a truck's bay; and a lamp over each door.
const CONTAINERS = ['#d56454', '#4d7d9c', '#5aa69b', '#d09c53', '#8b7dbf', '#ea8548', '#7f8c7c']
/** A shipping container's size (m): long, wide and tall (#150). */
export const CONTAINER = { long: 6.1, wide: 2.45, tall: 2.6 }
const PALLET = { wood: '#c49a6c', goods: ['#d8b98b', '#f4f1ea', '#d8b98b', '#e9eef2'] }
const BAY = '#f0c75e'
// Medium-density details (#156), each a thing of its own that any Zone may use: an outdoor AC unit's casing and its
// fan's grille; a vending machine's paints and its dark trim, its lit front the lamps' bulb; a covered bike rack's
// steel and roof, and its bicycles' frames (the cars' colours) and tyres; washing and futons; and the steel of outside
// stairs and walkways, with their treads.
const AIRCON = { body: '#f2f3ef', grille: '#8e979f' }
const VENDING = { paints: ['#f4f6f8', '#2fb39a', '#f0b43c', '#79c86a', '#e8925e', '#f4f6f8'], trim: '#4a525c' }
const BIKES = {
  frames: ['#ffffff', '#db6982', '#ffc52d', '#64cb9f', '#bc9ef2', '#ff9cbb', '#e9eef2', '#009dcb'],
  tyre: '#2f3440',
  steel: '#9aa3ad',
  roof: '#d6e4d3',
}
const WASHING = ['#ffffff', '#ffffff', '#ff9cbb', '#ffc52d', '#64cb9f', '#bc9ef2', '#fbe3a2', '#a6dcef']
const FUTONS = ['#ff9ab8', '#f0b43c', '#a58ad8', '#79c86a', '#fff7e8', '#5cc0d6']
// How far washing and futons swing out, as a share of how far below the pole or the rail (a heavy futon barely stirs).
const WIND = { washing: 0.3, futon: 0.06 }
const STEEL = { frame: '#6f7986', tread: '#a7aeb6', pole: '#c4ccd4' }
/** Outside stairs (#156): m along their flights, across their two lanes, and the depth of a landing. */
export const STAIR = { long: 4.2, wide: 2.4, landing: 1.1 }
/** Stairs up a wall (#156): m out from the wall, and how much longer than their rise their flight runs. */
export const WALL_STAIR = { wide: 1.1, run: 1.2 }
/** An open walkway along an apartment block's face (#156): m out from the wall, and its parapet's height. */
export const WALKWAY = { deep: 1.3, parapet: 1 }
/** A covered bike rack (#156): m long and deep from its back to its open front, and m along it a bicycle takes. */
export const BIKE_RACK = { long: 4.4, deep: 2.2, per: 0.62 }
/** A vending machine's footprint (#156): m across its front and deep. */
export const VENDING_MACHINE = { wide: 1.1, deep: 0.85 }
// Farms: a barn's walls, roof and door, the silo and its dome, and bales of straw.
const BARN = {
  walls: ['#7e9aab', '#b85a4c', '#8aa58b'],
  roof: '#5b6b7a',
  door: '#f4f1ea',
  silo: '#e9eef2',
  dome: '#9aa7b2',
  straw: '#e8cf7f',
}
// Farm details (#149): a kei truck's white paint, its chassis and tyres, and the crates of a harvest; a scarecrow's
// post, cloth head and shirts (the cars' colours).
const TRUCK = { paint: '#f4f6f8', chassis: '#4a525c', tyre: '#2f3440', crates: ['#f0c75e', '#7fbf9d', '#f0c75e', '#e9eef2'] }
const SCARECROW = { post: '#a1714c', head: '#f4ead2', shirts: ['#db6982', '#64cb9f', '#ffc52d', '#bc9ef2', '#009dcb'] }
// Green details (#152): a bench's wooden slats and its iron ends; a picnic blanket's colours, its gingham's pale stripe,
// the basket and a parasol's pole; a water butt and its lid; and a cold frame's painted base and its glass, painted
// pale as the greenhouses' film is: the kit's glass would add a mesh to every green build, which never draws it.
const BENCH = { wood: '#c49a6c', iron: '#6f7986' }
const PICNIC = { blankets: ['#ffadc8', '#f6d36a', '#7fbf9d', '#c7b8f0', '#f0b43c'], stripe: '#fbf8f2', basket: '#c49a6c', lid: '#a1714c' }
const BUTT = { body: '#4f8a6e', lid: '#3d6d57' }
const FRAME = { base: '#f4f1ea', glass: '#d6ece6' }
/** A cold frame's glass (#152): a box 1 m across, 1 m deep and 0.36 m tall at its back, its top sloping to 0.14 m at its front (-z). */
const LIGHT = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed()
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0.5) pos.setY(i, pos.getZ(i) < 0 ? 0.14 : 0.36)
  g.computeVertexNormals()
  return g
})()
const TANK = { body: '#cea680', lid: '#b68b63' } // a water tank on the roof of homes
const [DECK, PLANT] = ['#dfe3e7', '#cfd5dc'] // a flat roof's deck, and the plant boxes and masts on it
const LEAVES = {
  round: ['#7bcd5d', '#5fbc51', '#92d76e', '#6bc357', '#85cf61'],
  sakura: ['#ffbbd1', '#ffa1c1', '#ffd1df', '#ffadc8'],
  pine: ['#379e62', '#43ac6b', '#2e9358'],
}

// Petals fallen round a sakura (#148): how many lie round a tree of size 0.8 and how far they reach for its size, the
// most round any tree, their colours, and the disc each is.
const PETALS = { count: 28, reach: 7, most: 120, colours: ['#ffd1df', '#ffbbd1', '#ffe3ec'] }
const PETAL = new THREE.CircleGeometry(0.42, 5).rotateX(-Math.PI / 2)

const SPHERE = new THREE.SphereGeometry(1, 16, 12)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
const ROUND = new THREE.CylinderGeometry(1, 1, 1, 28).translate(0, 0.5, 0) // smoother, for a round tower's glass
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)
const PYRAMID = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0) // turned an eighth, its base is a square 1.41 across
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
// A flat disc facing -z, the way the kit's frames face at no turn: a fan's grille or one side of a wheel (#156).
const DISC = new THREE.CircleGeometry(1, 8).rotateY(Math.PI)
// A sheet hanging down from its top edge's middle, facing -z: a towel or a shirt on the cloth, drawn from both sides.
const SHEET = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0)
// One stripe of an awning, sloping down away from the wall it hangs on: a building's front is its -z.
const AWNING = new THREE.BoxGeometry(1, 0.1, 1.7).rotateX(-0.36)
/** The faces of a box, as the way each looks: north, south, east and west. */
export const FACES = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const

/**
 * A colour (painted onto the shared soft-lit material), a material of the kit, or one of them tinted by vertex colour.
 * The kit's glass is tinted white unless a tint is given, and takes `glow`, how brightly it lights at night: 1 unless
 * given, so that a curtain wall can be lit floor by floor. The kit's cloth takes `hung`, how it hangs (#156).
 */
export type Look = string | THREE.Material | { material: THREE.Material; tint: THREE.Color; glow?: number; hung?: Hung }

/**
 * How a piece of cloth hangs and sways (#156), in Three coordinates: the point it hangs from (the middle of its top),
 * which it is gathered into when it is taken in; the way it swings out, as far as it swings at a metre below that
 * point; and where in its sway it starts.
 */
export interface Hung {
  at: THREE.Vector3
  swing: THREE.Vector2
  phase: number
}
export type TreeKind = keyof typeof LEAVES
/** An office tower: a framed curtain wall, fins up its faces, tiers set back, or round. */
export type OfficeStyle = 'curtain' | 'fins' | 'stepped' | 'round'
export type Kit = ReturnType<typeof createKit>
export type Materials = ReturnType<typeof createMaterials>

/**
 * What a brick is, which decides when and how it comes in during a Rebuild. A mover's brick has no shapes: the mover
 * (`./movers`) is drawn apart, and takes the brick's place as it pops in.
 */
export type BrickKind = 'soil' | 'sand' | 'grass' | 'plate' | 'block' | 'ground' | 'lamp' | 'building' | 'tree' | 'pole' | 'wire' | 'mover'

/**
 * A seed drawn from where something stands, for a detail on a random stream of its own (#148, #149): the same spot
 * gives the same detail, and nothing else on its Block draws differently for it.
 */
export const spot = (x: number, y: number) => (Math.imul(Math.round(x * 100), 0x9e3779b1) ^ Math.round(y * 100)) >>> 0

/**
 * Where a shed `w` by `d` has its roller doors, as `warehouse` lays them (#150): m along its long side from its middle,
 * about one to every 9 m.
 */
export function shedDoors(w: number, d: number): number[] {
  const len = Math.max(w, d) - 0.4
  const n = Math.max(1, Math.floor(len / 9))
  return Array.from({ length: n }, (_, k) => -len / 2 + ((k + 0.5) * len) / n)
}

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

/** One brick of the slab or of what stands on it: the unit that drops or pops in during a Rebuild. */
export interface Brick {
  kind: BrickKind
  /** The point it lands on, or grows out of, in Three coordinates. */
  at: THREE.Vector3
  /** Puffs of dust thrown up where it lands. */
  dust: number
  fate: Fate
  /** The lot of its Block it stands on, in the order its Zone's look cut them; -1 for none. */
  lot: number
}

/** The Stage a build is of, `to`, or, when `from` differs, the two Stages a Tile's Stage-up goes between. */
export interface Stages {
  from: number
  to: number
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
  // Cloth (#156): washing and futons, which sway in the wind and are taken in for the night. Each vertex carries how its
  // piece hangs (`Hung`): it swings out about the point it hangs from, the further the lower, on the wind's clock, and
  // is gathered into that point as `out` falls to 0. Moved here rather than placed each frame, so a City's thousands of
  // pieces cost no time on the CPU and ride their buildings' bricks.
  const wind = { time: { value: 0 }, out: { value: 1 } }
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
  cloth.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind.time
    shader.uniforms.windOut = wind.out
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 hang;\nattribute vec2 swing;\nuniform float windTime;\nuniform float windOut;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec3 rest = position - hang.xyz;
  float sway = 0.65 * sin(windTime * 1.9 + hang.w) + 0.35 * sin(windTime * 3.3 + 1.7 * hang.w);
  vec3 hung = rest + vec3(swing.x, 0.0, swing.y) * max(0.0, -rest.y) * sway;
  transformed += hung * windOut - rest;
}`,
      )
  }
  cloth.customProgramCacheKey = () => 'cloth'
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
    glass,
    /** The tints of `glass` a building's windows take, one picked per building: the glass, a paler and a darker one. */
    windows: [new THREE.Color(1, 1, 1), shade('#b4d6e3'), shade('#7aa9c9')],
    /** The tint of a window left dark at night: by day, a darker glass. */
    unlit: shade('#56738a'),
    /** The tint that makes `glass` the colour `color`, as an office tower's curtain wall is. */
    glassOf: shade,
    bulb,
    water,
    cloth,
    roundShadow,
    squareShadow,
    /** Light the windows and lamps as the time of day has them. */
    setGlow({ windows, lamps }: Glow) {
      glass.emissiveIntensity = windows
      bulb.emissiveIntensity = lamps
    },
    /** Sway the cloth to the wind's clock `time` (s), hung out as far as `out` (1 out, 0 taken in) (#156). */
    setWind(time: number, out: number) {
      wind.time.value = time
      wind.out.value = out
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
  const { solid, glass, windows, unlit, glassOf, bulb, water, cloth, roundShadow, squareShadow } = materials

  const parts: Part[] = []
  const bricks: Brick[] = []
  const movers: Mover[] = []
  const plumes: Plume[] = []
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
  /** Give every vertex of a geometry of the glass the glow `glow`. */
  const glowing = (geo: THREE.BufferGeometry, glow: number) =>
    geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(glow), 1))
  /** Give every vertex of a geometry of the cloth how its piece hangs (#156). */
  const hanging = (geo: THREE.BufferGeometry, { at, swing, phase }: Hung) => {
    const n = geo.attributes.position.count
    const [hang, swings] = [new Float32Array(4 * n), new Float32Array(2 * n)]
    for (let i = 0; i < n; i++) {
      hang.set([at.x, at.y, at.z, phase], 4 * i)
      swings.set([swing.x, swing.y], 2 * i)
    }
    return geo.setAttribute('hang', new THREE.BufferAttribute(hang, 4)).setAttribute('swing', new THREE.BufferAttribute(swings, 2))
  }
  /** Add a geometry that is already in place (Three coordinates). The kit takes it over. */
  const push = (geo: THREE.BufferGeometry, look: Look) => {
    if (typeof look === 'string') parts.push({ geometry: tint(geo, look), material: solid, brick: -1 })
    else if ('tint' in look) {
      const tinted = tint(geo, look.tint)
      const geometry = look.material === glass ? glowing(tinted, look.glow ?? 1) : look.hung ? hanging(tinted, look.hung) : tinted
      parts.push({ geometry, material: look.material, brick: -1 })
    } else parts.push({ geometry: look === glass ? glowing(tint(geo, '#ffffff'), 1) : geo, material: look, brick: -1 })
  }
  /** Add a copy of a shape standing at `(x, y)`, `h` above the road, turned `ry` and scaled. */
  const add = (geo: THREE.BufferGeometry, look: Look, x: number, y: number, h: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(sx, sy, sz))), look)
  }
  /** Close the shapes added since the last brick into one, which lands on `(x, y)`, `h` above the road. */
  const brick = (kind: BrickKind, x: number, y: number, h: number, dust = 0) => {
    if (open === parts.length) return
    for (let i = open; i < parts.length; i++) parts[i].brick = bricks.length
    open = parts.length
    bricks.push({ kind, at: new THREE.Vector3(x, h, -y), dust, fate, lot })
  }

  // Buildings repeat their boxes, so each is cut once per size.
  const boxes = new Map<string, THREE.BufferGeometry>()
  const box = (w: number, h: number, d: number, r: number, b: number) => {
    const key = [w, h, d, r, b].map((v) => v.toFixed(2)).join()
    if (!boxes.has(key)) boxes.set(key, roundedBox(w, h, d, r, b))
    return boxes.get(key)!
  }
  /** A contact shadow under a footprint `w` by `d`, round or square, turned `ry`. */
  const shadow = (x: number, y: number, h: number, w: number, d: number, round = false, ry = 0) =>
    add(PLANE, round ? roundShadow : squareShadow, x, y, h + 0.05, ry, w, 1, d)
  // Plain boxes, unrounded, for the fine parts of a building (a floor of glass, a fin, a mullion), each cut once per size.
  const cuboids = new Map<string, THREE.BufferGeometry>()
  const cuboid = (w: number, h: number, d: number) => {
    const key = [w, h, d].map((v) => v.toFixed(2)).join()
    if (!cuboids.has(key)) cuboids.set(key, new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0))
    return cuboids.get(key)!
  }
  // Gable roofs repeat along a terraced row, so each is cut once per size too.
  const gables = new Map<string, THREE.BufferGeometry>()
  const gableRoof = (len: number, wid: number, h: number) => {
    const key = [len, wid, h].map((v) => v.toFixed(2)).join()
    if (!gables.has(key)) gables.set(key, gable(len, wid, h))
    return gables.get(key)!
  }
  /** Where `(lx, ly)` in the frame of a building at `(x, y)` lies: `lx` to its right, `ly` out of its front, which faces `ry` (0 north, π/2 west). */
  const to = (x: number, y: number, ry: number, lx: number, ly: number): [number, number] => [
    x + lx * Math.cos(ry) - ly * Math.sin(ry),
    y + lx * Math.sin(ry) + ly * Math.cos(ry),
  ]
  /** Add a shape at `(lx, ly)` in the frame of a building at `(x, y)` whose front faces `ry`, turned with it, `h` above the road. */
  const local = (geo: THREE.BufferGeometry, look: Look, x: number, y: number, ry: number, lx: number, ly: number, h: number, sx = 1) =>
    add(geo, look, ...to(x, y, ry, lx, ly), h, ry, sx)
  /** One window's glass, lit at night for `share` of the windows and dark for the rest. */
  const pane = (share: number): Look => ({ material: glass, tint: rand() < share ? pick(windows) : unlit })
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
  // A flight of stairs (#156): a slab `w` wide and `t` thick sloping up `rise` over `run`, up toward +x (or -x for a
  // negative `run`), centred on its middle. Each is cut once per size.
  const flights = new Map<string, THREE.BufferGeometry>()
  const flight = (run: number, rise: number, w: number, t: number) => {
    const key = [run, rise, w, t].map((v) => v.toFixed(2)).join()
    if (!flights.has(key)) flights.set(key, new THREE.BoxGeometry(Math.hypot(run, rise), t, w).rotateZ(Math.atan2(rise, run)))
    return flights.get(key)!
  }
  /**
   * An outdoor AC unit (#156) with its back to a wall at `(x, y)`, the wall facing `ry`, standing `h` above the road: a
   * pale casing with a fan's round grille, drawn a little large as the props are. It joins the next brick.
   */
  const airCon = (x: number, y: number, h: number, ry: number) => {
    put(cuboid(1.05, 0.74, 0.44), AIRCON.body, x, y, ry, 0, 0.24, h)
    put(DISC, AIRCON.grille, x, y, ry, -0.17, 0.47, h + 0.37, 0.26, 0.26, 1)
  }
  /**
   * The cloth's look for a piece in `colour` hung from `(x, y)`, `h` above the road, before a wall facing `ry`: it swings
   * out from the wall and back, `swing` as far a metre down, from where it hangs in its own phase (#156).
   */
  const hung = (colour: string, x: number, y: number, h: number, ry: number, swing: number): Look => ({
    material: cloth,
    tint: new THREE.Color(colour),
    hung: {
      at: new THREE.Vector3(x, h, -y),
      swing: new THREE.Vector2(-Math.sin(ry) * swing, -Math.cos(ry) * swing),
      phase: (spot(x, y) % 6283) / 1000,
    },
  })
  /**
   * Washing on a pole `len` long, `h` above the road, `out` m from a wall at `(x, y)` that faces `ry` (#156): a pole on
   * two brackets and a few towels and shirts hung from it, in the kit's stream. It joins the next brick.
   */
  const washing = (x: number, y: number, h: number, ry: number, len: number, out: number) => {
    put(cuboid(len, 0.05, 0.05), STEEL.pole, x, y, ry, 0, out, h)
    for (const k of [-1, 1]) put(cuboid(0.05, 0.05, out), STEEL.pole, x, y, ry, (k * (len - 0.1)) / 2, out / 2, h)
    for (let at = -len / 2 + 0.1; at < len / 2 - 0.4;) {
      const [w, drop] = [range(0.45, 0.7), range(0.6, 1.05)]
      if (at + w > len / 2 - 0.05) break
      if (rand() < 0.8) {
        const [px, py] = to(x, y, ry, at + w / 2, out)
        put(SHEET, hung(pick(WASHING), px, py, h, ry, WIND.washing), x, y, ry, at + w / 2, out, h - 0.03, w, drop, 1)
      }
      at += w + range(0.06, 0.2)
    }
  }
  /** A futon `w` wide hung over a rail `h` above the road, `out` m from a wall at `(x, y)` facing `ry` (#156). It joins the next brick. */
  const futon = (x: number, y: number, h: number, ry: number, w: number, out: number) => {
    const [px, py] = to(x, y, ry, 0, out)
    const look = hung(pick(FUTONS), px, py, h, ry, WIND.futon)
    put(cuboid(w, 0.12, 0.34), look, x, y, ry, 0, out, h)
    put(cuboid(w, 1.2, 0.1), look, x, y, ry, 0, out + 0.14, h - 1.15)
  }
  /** A bicycle standing at `(x, y)`, its length along `ry`'s right, a little large (#156): two wheels, a frame, a saddle and a basket. */
  const bicycle = (x: number, y: number, h: number, ry: number) => {
    const frame = pick(BIKES.frames)
    const r = 0.38
    // Each wheel a disc on either side, so it shows from both, at a few dozen triangles a bicycle: they come by the hundred.
    for (const lx of [-0.6, 0.6]) {
      put(DISC, BIKES.tyre, x, y, ry, lx, 0.04, h + r, r, r, 1)
      put(DISC, BIKES.tyre, x, y, ry + Math.PI, -lx, 0.04, h + r, r, r, 1)
    }
    put(cuboid(0.95, 0.07, 0.07), frame, x, y, ry, 0.05, 0, h + 0.82) // the top tube
    put(cuboid(0.07, 0.62, 0.07), frame, x, y, ry, -0.32, 0, h + r) // the seat tube, its saddle on top
    put(cuboid(0.07, 0.72, 0.5), frame, x, y, ry, 0.48, 0, h + r) // the fork and the handlebar
    put(cuboid(0.36, 0.26, 0.38), BIKES.steel, x, y, ry, 0.72, 0, h + r + 0.42) // the basket
  }
  /**
   * Steel outside stairs (#156), centred on `(x, y)`, their flights running along their front `ry`: two flights a
   * storey in two lanes, turning at a landing half-way, from the first of `tops` (m above the road) to each of the rest,
   * with a landing at each, posts at the corners and a railing up the outer side. They join the next brick.
   */
  const stairs = (x: number, y: number, ry: number, tops: number[]) => {
    const { long: L, wide: W, landing: D } = STAIR
    const [run, lane] = [L - 2 * D, (W - 0.1) / 2]
    for (let f = 0; f + 1 < tops.length; f++) {
      const [lo, hi] = [tops[f], tops[f + 1]]
      const half = (hi - lo) / 2
      // Out along one lane to the half-landing at the far end, and back along the other to the next floor.
      put(flight(-run, half, lane, 0.14), STEEL.tread, x, y, ry, 0, (W - lane) / 2, lo + half / 2)
      put(flight(-run, half, 0.05, 0.9), STEEL.frame, x, y, ry, 0, W / 2 - 0.03, lo + half / 2 + 0.5)
      put(cuboid(D, 0.14, W), STEEL.tread, x, y, ry, -(L - D) / 2, 0, lo + half - 0.14)
      put(cuboid(0.05, 0.9, W), STEEL.frame, x, y, ry, -L / 2 + 0.03, 0, lo + half)
      put(flight(run, half, lane, 0.14), STEEL.tread, x, y, ry, 0, -(W - lane) / 2, lo + 1.5 * half)
      put(flight(run, half, 0.05, 0.9), STEEL.frame, x, y, ry, 0, -W / 2 + 0.03, lo + 1.5 * half + 0.5)
      put(cuboid(D, 0.14, W), STEEL.tread, x, y, ry, (L - D) / 2, 0, hi - 0.14)
      put(cuboid(0.05, 0.9, W), STEEL.frame, x, y, ry, L / 2 - 0.03, 0, hi)
    }
    const top = tops[tops.length - 1] + 0.9
    for (const lx of [-1, 1])
      for (const ly of [-1, 1])
        put(cuboid(0.14, top - tops[0], 0.14), STEEL.frame, x, y, ry, lx * (L / 2 - 0.07), ly * (W / 2 - 0.07), tops[0])
  }

  return {
    add,
    push,
    brick,
    box,
    cuboid,
    shadow,
    glass,
    bulb,
    water,
    range,
    pick,
    chance: (p: number) => rand() < p,

    /** Build at Stage `s.to`, or, when `s.from` differs, a Tile's Stage-up from one to the other. Stage 2 unless told. */
    stages(s: Stages) {
      stages = s
    },

    /** Say where loose things on the ground, such as fallen petals, may lie: `on(x, y, clear)`, on the Block `clear` m in from its edge. */
    ground(on: (x: number, y: number, clear: number) => boolean) {
      onBlock = on
    },

    /** Whether a loose thing may lie at `(x, y)`, on the Block at least `clear` m in from its edge (`ground`). */
    onGround(x: number, y: number, clear: number) {
      return onBlock(x, y, clear)
    },

    /** The bricks closed from now on stand on lot `n` of the Block (-1: on none). */
    lot(n: number) {
      lot = n
    },

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
    staged(fn: (stage: number) => void, seed = (rand() * 4294967296) >>> 0) {
      if (stages.from === stages.to) return own(seed, 'stays', () => fn(stages.to))
      own(seed, 'goes', () => fn(stages.from))
      own(seed, 'comes', () => fn(stages.to))
    },

    /**
     * A tree of size `s` (1 is about 6 m tall), as one brick: a cluster of spheres, or stacked cones for a pine. A sakura
     * has petals fallen round it, as many to the square metre whatever its size. They are drawn from where it stands,
     * so the kit's own stream is untouched, and they lie only on the Block: on a raised lawn, only well in from the
     * Block's edge, so that none hangs over the pavement beyond the lawn.
     */
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
      if (kind === 'sakura') {
        const fall = mulberry32(spot(x, y))
        const clear = h > KERB + 0.1 ? 2.4 : 0.5
        const n = Math.min(PETALS.most, Math.round(PETALS.count * (s / 0.8) ** 2))
        for (let i = 0; i < n; i++) {
          const [a, r, colour, turn] = [fall() * TAU, Math.sqrt(fall()) * s * PETALS.reach, Math.floor(fall() * 3), fall() * TAU]
          const [px, py] = [x + Math.cos(a) * r, y + Math.sin(a) * r]
          if (onBlock(px, py, clear)) add(PETAL, PETALS.colours[colour], px, py, h + 0.08, turn)
        }
      }
      shadow(x, y, h, s * 6.8, s * 6.8, true)
      brick('tree', x, y, h)
    },

    /**
     * A house at Stage `stage` on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: a wall box with
     * a glass band a storey in one of the glass's tints, under a gable roof whose ridge runs the long way. It is at most
     * 12 m on a side. What it is, its colours, its glass and how tall it stands within its Stage, is drawn before
     * anything a Stage changes, so each Stage builds the same house, better:
     * - Stage 1: a cottage, one low storey on 70% of the footprint, with a narrow band.
     * - Stage 2: the house on the whole footprint, one tall storey.
     * - Stage 3: two storeys with a ledge between them, and a chimney through the roof near one gable end.
     */
    house(x: number, y: number, h: number, w: number, d: number, stage = 2) {
      const panes = { material: glass, tint: pick(windows) }
      const [tall, walls, roofs, end] = [rand(), pick(WALLS), pick(ROOFS), rand() < 0.5 ? 1 : -1]
      const k = stage === 1 ? 0.7 : 1
      ;[w, d] = [Math.min(w, 12) * k, Math.min(d, 12) * k]
      const wall = stage === 1 ? 3 + 0.5 * tall : stage === 2 ? 4.4 + 1.2 * tall : 6.6 + 0.8 * tall
      add(box(w, wall, d, 0.48, 0.2), walls, x, y, h)
      if (stage === 1) add(box(w + 0.16, 0.8, d + 0.16, 0.56, 0.08), panes, x, y, h + wall * 0.38)
      else if (stage === 2) add(box(w + 0.16, 1.04, d + 0.16, 0.56, 0.08), panes, x, y, h + wall * 0.42)
      else {
        add(box(w + 0.16, 1.04, d + 0.16, 0.56, 0.08), panes, x, y, h + wall * 0.18)
        add(cuboid(w + 0.3, 0.24, d + 0.3), LEDGE, x, y, h + wall * 0.5)
        add(box(w + 0.16, 1.04, d + 0.16, 0.56, 0.08), panes, x, y, h + wall * 0.66)
      }
      const along = w >= d
      const [ridge, span, pitch] = [along ? w : d, along ? d : w, Math.min(w, d) * 0.42]
      add(gable(ridge + 0.8, span + 1.12, pitch), roofs, x, y, h + wall, along ? Math.PI / 2 : 0)
      if (stage === 3) {
        const at = end * (ridge / 2 - 1.1)
        const [cx, cy] = along ? [x + at, y + span * 0.18] : [x + span * 0.18, y + at]
        add(cuboid(0.9, pitch + 1.4, 0.9), CHIMNEY, cx, cy, h + wall + 0.3)
      }
      shadow(x, y, h, w * 1.45 + 2, d * 1.45 + 2)
      brick('building', x, y, h)
    },

    /** A lawn over a footprint `w` by `d`, centred on `(x, y)`: a house's garden or a courtyard. It joins the next brick. */
    lawn(x: number, y: number, h: number, w: number, d: number) {
      add(box(w, 0.16, d, 0.8, 0.06), LAWN, x, y, h)
    },

    /**
     * A hedge round the edge of a lawn `w` by `d` centred on `(x, y)`, with a gap for a gate in the middle of side `gate`
     * (0 east, 1 north, 2 west, 3 south), as one brick. Plain boxes: a garden's hedge is laid by the hundred.
     */
    hedge(x: number, y: number, h: number, w: number, d: number, gate: number) {
      const [thick, tall, gap] = [0.7, 1.1, 2.4]
      const sides: [sx: number, sy: number, sw: number, sd: number][] = [
        [x + w / 2 - thick / 2, y, thick, d],
        [x, y + d / 2 - thick / 2, w - 2 * thick, thick],
        [x - w / 2 + thick / 2, y, thick, d],
        [x, y - d / 2 + thick / 2, w - 2 * thick, thick],
      ]
      sides.forEach(([sx, sy, sw, sd], side) => {
        if (side !== gate) return add(cuboid(sw, tall, sd), HEDGE, sx, sy, h)
        // Two lengths, either side of the gate.
        const eastWest = side % 2 === 1
        const len = ((eastWest ? sw : sd) - gap) / 2
        for (const k of [-1, 1]) {
          const off = k * (gap / 2 + len / 2)
          if (eastWest) add(cuboid(len, tall, sd), HEDGE, sx + off, sy, h)
          else add(cuboid(sw, tall, len), HEDGE, sx, sy + off, h)
        }
      })
      brick('ground', x, y, h)
    },

    /**
     * A house of a terraced row at Stage `stage`, as one brick: `w` along the row and `d` deep, its front facing `ry` (0
     * north, π/2 west), `storeys` high, as many as the caller gives its Stage. It shares its side walls with the houses
     * beside it, under a gable roof whose ridge runs along the row, with a window or two a storey on its front and a
     * wooden door. Its colours and whether it has an eave are drawn before anything a Stage changes:
     * - Stage 1: plain, with no eave.
     * - Stage 2: an eave over the ground floor on some.
     * - Stage 3: an eave on every house of two storeys or more, a pale cornice under the roof, and a window box of
     *   flowers under each upper window.
     * Its details (#156) draw from where it stands: an AC unit by the door on one house in four at Stage 1, half at
     * Stage 2 and three in four at Stage 3, with a second on the eave of some; washing under the top floor's eaves on
     * some houses of two storeys or more from Stage 2, more at Stage 3.
     */
    townhouse(x: number, y: number, h: number, w: number, d: number, ry: number, storeys: number, stage = 2) {
      const wall = storeys * 3 + 0.6
      const [tile, walls, eave, bloom] = [pick(TERRACE.roofs), pick(TERRACE.walls), rand() < 0.55, pick(TERRACE.blooms)]
      add(box(w, wall, d, 0.16, 0.08), walls, x, y, h, ry)
      add(gableRoof(w + 0.2, d + 1, Math.min(4.2, d * 0.34)), tile, x, y, h + wall, ry + Math.PI / 2)
      if (stage === 3) local(cuboid(w + 0.06, 0.42, 0.5), LEDGE, x, y, ry, 0, d / 2 + 0.05, h + wall - 0.42)
      const across = w >= 5.6 ? 2 : 1 // windows a storey
      for (let s = 0; s < storeys; s++) {
        for (let k = 0; k < across; k++) {
          const lx = across === 1 ? 0 : (k ? 1 : -1) * w * 0.23
          if (s === 0 && k === across - 1) local(cuboid(1.2, 2.2, 0.3), TERRACE.door, x, y, ry, lx, d / 2, h)
          else local(cuboid(1.1, 1.3, 0.3), pane(0.7), x, y, ry, lx, d / 2, h + 1 + s * 3)
          if (stage === 3 && s > 0) local(cuboid(1.4, 0.34, 0.55), bloom, x, y, ry, lx, d / 2 + 0.2, h + 0.7 + s * 3)
        }
      }
      if (storeys > 1 && (stage === 3 || (stage === 2 && eave))) local(cuboid(w + 0.1, 0.22, 1.1), tile, x, y, ry, 0, d / 2 + 0.5, h + 3.1)
      // Its details (#156), drawn from where it stands: an AC unit by the door on some, and on Stage 3's eave a second;
      // washing on a pole under the top floor's eaves.
      own(spot(x, y), fate, () => {
        const [ac, high, wash] = [rand(), rand(), rand()]
        const wall = (lx: number) => to(x, y, ry, lx, d / 2)
        // Under the ground floor's window, or beside the door of a house one window wide.
        if (ac < [0.25, 0.5, 0.75][stage - 1]) airCon(...wall(across === 2 ? -w * 0.23 : -1.3), h + 0.02, ry)
        if (stage === 3 && storeys > 1 && high < 0.45) airCon(...wall(across === 2 ? 0 : 1.3), h + 3.34, ry)
        if (storeys > 1 && wash < [0, 0.3, 0.55][stage - 1]) washing(...wall(0), h + storeys * 3 - 0.45, ry, w - 0.9, 0.7)
      })
      shadow(x, y, h, w * 1.25 + 1, d * 1.25 + 1, false, ry)
      brick('building', x, y, h)
    },

    /**
     * An apartment building at Stage `stage`, of `floors` storeys over the wings `wings`, rectangles that meet at their
     * edges in an O, a U, an L or a bar, as one brick: one wall colour, with a row of windows a storey, lit or dark one
     * by one, on every face not against another wing, and a cap on each wing. The caller gives each Stage its floors.
     * - Stage 1: plain, with no water tank.
     * - Stage 2: a water tank on the first wing, and an open walkway along the face each wing walks (`walks`), with a
     *   door between each two windows (#156).
     * - Stage 3: a balcony slab along every other face at each floor, with washing and futons hung out in some bays, and
     *   a plant room beside the water tank.
     * A few AC units (#156), more with each Stage, stand on its walls, walkways and balconies.
     */
    apartment(wings: Bounds[], h: number, floors: number, stage = 2, walks: Walks = []) {
      const colour = pick(COURTYARD.walls)
      const height = floors * 3.2 + 0.8
      /** Whether `(px, py)` lies on a wing other than wing `self`. */
      const against = (px: number, py: number, self: number) =>
        wings.some((o, k) => k !== self && px > o.x0 - 0.05 && px < o.x1 + 0.05 && py > o.y0 - 0.05 && py < o.y1 + 0.05)
      // Where an AC unit may stand (#156): on the wall between two windows, or before a window on a walkway, and whether
      // a slab is there to stand on.
      const spots: { x: number; y: number; ry: number; slab: boolean }[] = []
      wings.forEach((wing, k) => {
        const [cx, cy, w, d] = [(wing.x0 + wing.x1) / 2, (wing.y0 + wing.y1) / 2, wing.x1 - wing.x0, wing.y1 - wing.y0]
        add(box(w, height, d, 0.6, 0.2), colour, cx, cy, h)
        add(box(w + 0.24, 0.6, d + 0.24, 0.68, 0.1), COURTYARD.cap, cx, cy, h + height)
        for (const [face, [nx, ny]] of FACES.entries()) {
          const n = Math.floor(((nx === 0 ? w : d) - 2) / 3.2)
          const ry = Math.atan2(-nx, ny)
          const len = nx === 0 ? w : d
          const [mx, my] = [cx + (nx * w) / 2, cy + (ny * d) / 2]
          // From Stage 2 an open walkway runs along the face its wing walks (#156), and Stage 3's balconies take the rest.
          const walk = stage > 1 && walks[k] === face
          const balcony = stage === 3 && !walk && !against(mx + nx * 0.4, my + ny * 0.4, k)
          /** Whether a window or a door at `(px, py)` would look into the next wing, by just out of the face across its width. */
          const blind = (px: number, py: number) => [-0.9, 0, 0.9].some((a) => against(px + nx * 0.4 + ny * a, py + ny * 0.4 + nx * a, k))
          for (let i = 0; i < n; i++) {
            const t = -(n - 1) * 1.6 + i * 3.2
            const [fx, fy] = nx === 0 ? [cx + t, cy + (ny * d) / 2] : [cx + (nx * w) / 2, cy + t]
            if (blind(fx, fy)) continue
            for (let f = 0; f < floors; f++) add(cuboid(1.5, 1.6, 0.3), pane(0.65), fx, fy, h + 1.1 + f * 3.2, ry)
            if (walk) spots.push({ x: fx, y: fy, ry, slab: true })
            // Between this window and the next: a door onto the walkway at each floor, or a wall for an AC unit.
            const [gx, gy] = nx === 0 ? [fx + 1.6, fy] : [fx, fy + 1.6]
            if (i === n - 1 || blind(gx, gy)) continue
            if (walk) for (let f = 1; f < floors; f++) add(cuboid(0.95, 2.05, 0.16), TERRACE.door, gx, gy, h + 0.94 + f * 3.2, ry)
            else spots.push({ x: gx, y: gy, ry, slab: balcony })
          }
          if (walk) {
            // A slab the length of the face at each floor above the ground, behind a parapet with a steel rail on top.
            // Where it runs into another wing it stays hidden inside it.
            const { deep, parapet } = WALKWAY
            for (let f = 1; f < floors; f++) {
              const at = h + 0.7 + f * 3.2
              add(cuboid(len - 0.1, 0.24, deep), COURTYARD.cap, mx + (nx * deep) / 2, my + (ny * deep) / 2, at, ry)
              add(cuboid(len - 0.1, parapet, 0.14), COURTYARD.cap, mx + nx * (deep - 0.07), my + ny * (deep - 0.07), at + 0.24, ry)
              add(cuboid(len - 0.1, 0.07, 0.2), STEEL.frame, mx + nx * (deep - 0.07), my + ny * (deep - 0.07), at + 0.24 + parapet, ry)
            }
          }
          // Stage 3's balconies: a slab and its railing along the face at every floor above the ground, unless the
          // face's middle is against another wing. Where a slab runs into another wing it stays hidden inside it. Washing
          // hangs on poles in some of their bays and futons over the rail in others, drawn from where the face stands.
          if (!balcony) continue
          for (let f = 1; f < floors; f++) {
            add(cuboid(len - 0.8, 0.24, 1.1), COURTYARD.cap, mx + nx * 0.55, my + ny * 0.55, h + 0.7 + f * 3.2, ry)
            add(cuboid(len - 0.8, 0.8, 0.12), COURTYARD.cap, mx + nx * 1.05, my + ny * 1.05, h + 0.94 + f * 3.2, ry)
          }
          own(spot(mx, my), fate, () => {
            for (let f = 1; f < floors; f++) {
              for (let i = 0; i < n; i++) {
                const t = -(n - 1) * 1.6 + i * 3.2
                const [fx, fy] = nx === 0 ? [cx + t, cy + (ny * d) / 2] : [cx + (nx * w) / 2, cy + t]
                const r = rand()
                if (blind(fx, fy)) continue
                if (r < 0.2) washing(fx, fy, h + 0.7 + (f + 1) * 3.2 - 0.4, ry, 2.6, 0.62)
                else if (r < 0.33) futon(fx, fy, h + 1.76 + f * 3.2, ry, range(1.3, 1.7), 1.05)
              }
            }
          })
        }
        shadow(cx, cy, h, w * 1.2 + 2, d * 1.2 + 2)
      })
      // A few AC units (#156), drawn from where the building stands: on a slab where there is one, else on the wall.
      own(spot(wings[0].x0, wings[0].y0), fate, () => {
        for (let k = 0; k < [2, 3, 6][stage - 1] && spots.length && floors > 1; k++) {
          const [s] = spots.splice(Math.floor(rand() * spots.length), 1)
          const f = 1 + Math.floor(rand() * (floors - 1))
          airCon(s.x, s.y, h + (s.slab ? 0.94 : 0.42) + f * 3.2, s.ry)
        }
      })
      const [first] = wings
      const [tx, ty] = [first.x0 + (first.x1 - first.x0) * 0.3, (first.y0 + first.y1) / 2]
      if (stage > 1) {
        add(CYLINDER, TANK.body, tx, ty, h + height + 0.6, 0, 1.12, 2.2, 1.12)
        add(CONE, TANK.lid, tx, ty, h + height + 2.8, 0, 1.2, 0.8, 1.2)
      }
      if (stage === 3) {
        const [pw, pd] = [(first.x1 - first.x0) * 0.3, (first.y1 - first.y0) * 0.5]
        add(box(pw, 2.6, pd, 0.3, 0.1), COURTYARD.cap, first.x0 + (first.x1 - first.x0) * 0.68, ty, h + height + 0.6)
      }
      const [x0, x1] = [Math.min(...wings.map((r) => r.x0)), Math.max(...wings.map((r) => r.x1))]
      const [y0, y1] = [Math.min(...wings.map((r) => r.y0)), Math.max(...wings.map((r) => r.y1))]
      brick('building', (x0 + x1) / 2, (y0 + y1) / 2, h)
    },

    /**
     * A residential tower at Stage `stage`, of `floors` storeys on a footprint `w` (east–west) by `d`, centred on
     * `(x, y)`, as one brick: a podium with a lit lobby, a pale wall with windows lit or dark one by one, a stack of
     * balconies up the middle of its two long faces, and on its roof a water tank. The caller gives each Stage its floors.
     * - Stage 1: a bare roof but for the tank.
     * - Stage 2: a little garden on the roof.
     * - Stage 3: a band of trim round the wall every four floors, a crown of lit glass under a deeper cap, and a bigger
     *   roof garden.
     */
    residentialTower(x: number, y: number, h: number, w: number, d: number, floors: number, stage = 2) {
      const [colour, trim] = [pick(FLATS.walls), pick(FLATS.trims)]
      const STOREY = 3.1
      const base = h + 4.2
      const top = base + floors * STOREY
      add(box(w + 2.4, 4.2, d + 2.4, 1, 0.2), trim, x, y, h)
      for (const side of [-1, 1])
        add(cuboid(w * 0.55, 2.6, 0.3), { material: glass, tint: windows[0] }, x, y + side * (d / 2 + 1.2), h + 0.5)
      add(box(w, floors * STOREY, d, 0.9, 0.2), colour, x, y, base)
      const long = w >= d // the balconies go up the middle of the long faces
      for (const [nx, ny] of FACES) {
        const balconied = (nx === 0) === long
        const n = Math.floor(((nx === 0 ? w : d) - 2) / 3)
        const ry = Math.atan2(-nx, ny)
        for (let i = 0; i < n; i++) {
          const t = -(n - 1) * 1.5 + i * 3
          if (balconied && Math.abs(t) < 2.6) continue
          const [fx, fy] = nx === 0 ? [x + t, y + (ny * d) / 2] : [x + (nx * w) / 2, y + t]
          for (let f = 0; f < floors; f++) add(cuboid(1.3, 1.6, 0.3), pane(0.6), fx, fy, base + 0.8 + f * STOREY, ry)
        }
        if (!balconied) continue
        // On every floor, from the middle of the face: a balcony's floor, the railing at its edge, and a glass door.
        const [mx, my] = [x + (nx * w) / 2, y + (ny * d) / 2]
        for (let f = 0; f < floors; f++) {
          const at = base + f * STOREY + 0.1
          local(cuboid(4.6, 0.24, 1.5), trim, mx, my, ry, 0, 0.75, at)
          local(cuboid(4.6, 1, 0.14), trim, mx, my, ry, 0, 1.45, at + 0.24)
          local(cuboid(3.6, 2.2, 0.3), pane(0.55), mx, my, ry, 0, 0, at + 0.3)
        }
      }
      if (stage === 3) {
        // A band of trim every four floors, and a crown: the top floor's glass all round, lit at night.
        for (let f = 4; f < floors - 1; f += 4) add(cuboid(w + 0.5, 0.5, d + 0.5), trim, x, y, base + f * STOREY - 0.25)
        add(box(w + 0.16, 1.8, d + 0.16, 0.9, 0.08), { material: glass, tint: windows[1] }, x, y, top - 2.3)
      }
      // A cap over the roof, and on it a water tank and a garden.
      const cap = stage === 3 ? 2 : 1.2
      add(box(w + 0.3, cap, d + 0.3, 1, 0.12), trim, x, y, top)
      const roof = top + cap - 0.3
      add(CYLINDER, TANK.body, x - w * 0.22, y + d * 0.2, roof, 0, 1.3, 2.4, 1.3)
      add(CONE, TANK.lid, x - w * 0.22, y + d * 0.2, roof + 2.4, 0, 1.4, 0.9, 1.4)
      if (stage > 1) {
        const [gw, gd] = stage === 3 ? [w * 0.5, d * 0.5] : [w * 0.36, d * 0.3]
        add(box(gw, 0.5, gd, 0.3, 0.1), LAWN, x + w * 0.18, y - d * 0.16, roof)
        const bushes = stage === 3 ? [-1.5, -0.5, 0.5, 1.5] : [-1, 1]
        for (const k of bushes) add(SPHERE, LEAVES.round[1], x + w * (0.18 + 0.08 * k), y - d * 0.16, roof + 0.6, 0, 0.9, 0.8, 0.9)
      }
      shadow(x, y, h, w * 1.4 + 3, d * 1.4 + 3)
      brick('building', x, y, h)
    },

    /**
     * A shop at Stage `stage`, as one brick: `w` along its street and `d` deep, its front facing `ry`, `storeys` high,
     * as many as the caller gives its Stage. A ground floor in a bold colour with a lit shop window, under pale storeys
     * with windows or none. Facing a Road (`onRoad`) rather than a seam between Tiles, it has a striped awning. Its
     * colours and which signs it would have are drawn before anything a Stage changes:
     * - Stage 1: a narrower shop window and no signs.
     * - Stage 2: on some, a sign on the roof or one hung by the door.
     * - Stage 3: both signs on every shop facing a Road, and a pale cornice over the ground floor.
     */
    shop(x: number, y: number, h: number, w: number, d: number, ry: number, storeys: number, onRoad: boolean, stage = 2) {
      const [front, upper, colour, roofSign, hung] = [pick(SHOP.fronts), pick(SHOP.uppers), pick(SHOP.fronts), rand() < 0.45, rand() < 0.45]
      const [signColour, hungColour] = [pick(SHOP.fronts), pick(SHOP.fronts)]
      add(box(w, 3.8, d, 0.24, 0.1), front, x, y, h, ry)
      local(cuboid(w * (stage === 1 ? 0.6 : 0.8), 2.4, 0.3), { material: glass, tint: windows[0] }, x, y, ry, 0, d / 2, h + 0.3)
      if (stage === 3) local(cuboid(w + 0.06, 0.4, 0.4), SHOP.stripe, x, y, ry, 0, d / 2 + 0.04, h + 3.7)
      let top = h + 3.8
      if (storeys > 1) {
        const tall = (storeys - 1) * 3.1
        add(box(w - 0.3, tall, d - 0.6, 0.24, 0.1), upper, x, y, top, ry)
        const across = Math.max(1, Math.floor(w / 3))
        for (let s = 0; s < storeys - 1; s++) {
          for (let k = 0; k < across; k++)
            local(cuboid(1.3, 1.4, 0.3), pane(0.7), x, y, ry, (k - (across - 1) / 2) * (w / across), (d - 0.6) / 2, top + 0.9 + s * 3.1)
        }
        top += tall
      }
      add(box(w + 0.1, 0.5, d + 0.1, 0.26, 0.08), storeys > 1 ? upper : front, x, y, top, ry)
      if (onRoad) {
        if (stage === 3 || (stage === 2 && roofSign)) local(cuboid(w * 0.6, 1.8, 0.3), signColour, x, y, ry, 0, d / 2 - 1.2, top + 0.5)
        const span = w * 0.86
        const stripes = Math.max(3, Math.round(span / 1.2))
        for (let i = 0; i < stripes; i++)
          local(
            AWNING,
            i % 2 ? SHOP.stripe : colour,
            x,
            y,
            ry,
            -span / 2 + (i + 0.5) * (span / stripes),
            d / 2 + 0.85,
            h + 3,
            span / stripes,
          )
        if (stage === 3 || (stage === 2 && hung)) local(cuboid(0.24, 2.4, 1.1), hungColour, x, y, ry, w / 2 - 0.5, d / 2 + 0.55, h + 4.2)
      }
      shadow(x, y, h, w * 1.25 + 1, d * 1.25 + 1, false, ry)
      brick('building', x, y, h)
    },

    /**
     * A shed at Stage `stage` on a footprint `w` (east–west) by `d`, centred on `(x, y)`, as one brick: low walls under
     * a sawtooth roof whose teeth follow one another along its long side, glazed up each tooth, roller doors along the
     * long side `side` (1 north or west, -1 south or east), and a brick chimney if `chimney`, which smokes. Its colours,
     * its glazing and its height within its Stage are drawn before anything a Stage changes:
     * - Stage 1: on 80% of the footprint, lower, and with no chimney.
     * - Stage 2: on the whole footprint, with a lamp over each door that lights at dusk (#150).
     * - Stage 3: a metre taller, with a two-storey office at one end of its back, vents along its roof, and a taller
     *   chimney with a second band.
     */
    warehouse(x: number, y: number, h: number, w: number, d: number, chimney: boolean, side: number, stage = 2) {
      const [tall, walls, roofs, lit, doorColour, chimneyTall] = [
        rand(),
        pick(SHED.walls),
        pick(SHED.roofs),
        rand() < 0.5,
        pick(SHED.doors),
        range(15, 21),
      ]
      if (stage === 1) [w, d] = [w * 0.8, d * 0.8]
      const wall = [4.2 + 1.2 * tall, 5.4 + 2 * tall, 6.4 + 2 * tall][stage - 1]
      add(box(w, wall, d, 0.4, 0.14), walls, x, y, h)
      const along = w >= d
      const [len, wid, ry] = along ? [w - 0.4, d - 0.4, 0] : [d - 0.4, w - 0.4, Math.PI / 2]
      const n = Math.max(2, Math.round(len / 6))
      const rise = Math.min(3.4, (len / n) * 0.55)
      const teeth = sawtooth(len, wid, rise, n)
      add(teeth, roofs, x, y, h + wall, ry)
      teeth.dispose()
      const glaze: Look = { material: glass, tint: lit ? windows[2] : unlit }
      for (let i = 1; i < n; i++) local(cuboid(0.2, rise * 0.8, wid - 1.2), glaze, x, y, ry, -len / 2 + (i * len) / n - 0.12, 0, h + wall)
      for (const u of shedDoors(w, d)) {
        local(cuboid(3.6, 4, 0.3), doorColour, x, y, ry, u, (side * (wid + 0.4)) / 2, h)
        if (stage > 1) local(cuboid(0.7, 0.22, 0.5), bulb, x, y, ry, u, side * (wid / 2 + 0.45), h + 4.5)
      }
      if (stage === 3) {
        // An office at the far end of the back, standing a storey clear of the walls, with a band of windows a floor.
        const [ow, od] = [Math.min(11, len * 0.32), Math.min(7, wid * 0.45)]
        const [ox, oy] = [-len / 2 + ow / 2 + 0.2, -side * (wid / 2 - od / 2 + 0.35)] // its face just out of the shed's
        const high = wall + 3.4
        local(box(ow, high, od, 0.3, 0.1), SHED.band, x, y, ry, ox, oy, h)
        for (const f of [0, 1])
          local(
            cuboid(ow - 1.2, 1.3, 0.3),
            { material: glass, tint: windows[0] },
            x,
            y,
            ry,
            ox,
            oy - side * (od / 2),
            h + high - 6.2 + f * 3.1,
          )
        for (let i = 0; i < n; i++) {
          const [vx, vy] = to(x, y, ry, -len / 2 + ((i + 0.5) * len) / n + 1.2, 0)
          add(CYLINDER, PLANT, vx, vy, h + wall + rise * 0.5, 0, 0.5, rise * 0.5 + 1.2, 0.5)
        }
      }
      if (chimney && stage > 1) {
        const [cx, cy] = to(x, y, ry, len / 2 - 2.6, -side * (wid / 2 - 2.6))
        const high = chimneyTall + (stage === 3 ? 5 : 0)
        add(CYLINDER, SHED.chimney, cx, cy, h, 0, 1, high, 1)
        add(CYLINDER, SHED.band, cx, cy, h + high - 2.4, 0, 1.06, 0.9, 1.06)
        if (stage === 3) add(CYLINDER, SHED.band, cx, cy, h + high - 6, 0, 1.06, 0.6, 1.06)
        plumes.push({ at: new THREE.Vector3(cx, h + high + 0.4, -cy), brick: bricks.length }) // the brick about to close
      }
      shadow(x, y, h, w * 1.3 + 2, d * 1.3 + 2)
      brick('building', x, y, h)
    },

    /**
     * A barn at Stage `stage` facing `ry`, with a few bales of straw before it, as one brick. Its colour is drawn before
     * anything a Stage changes:
     * - Stage 1: the barn and a bale.
     * - Stage 2: a silo beside it, and three bales.
     * - Stage 3: a second, shorter silo and a lean-to shed against its other side.
     */
    barn(x: number, y: number, h: number, ry: number, stage = 2) {
      add(box(9, 5.2, 7, 0.3, 0.1), pick(BARN.walls), x, y, h, ry)
      add(gableRoof(9.6, 8, 3.2), BARN.roof, x, y, h + 5.2, ry + Math.PI / 2)
      local(cuboid(3.2, 3.8, 0.3), BARN.door, x, y, ry, 0, 3.5, h)
      if (stage > 1) {
        const [sx, sy] = to(x, y, ry, 6.6, -1)
        add(CYLINDER, BARN.silo, sx, sy, h, 0, 1.9, 9.5, 1.9)
        add(SPHERE, BARN.dome, sx, sy, h + 9.5, 0, 1.95, 1.4, 1.95)
      }
      if (stage === 3) {
        const [sx, sy] = to(x, y, ry, 6.4, -4.6)
        add(CYLINDER, BARN.silo, sx, sy, h, 0, 1.5, 7, 1.5)
        add(SPHERE, BARN.dome, sx, sy, h + 7, 0, 1.55, 1.1, 1.55)
        local(box(3.4, 3.2, 6, 0.2, 0.08), BARN.door, x, y, ry, -6.2, 0, h)
        local(cuboid(4, 0.3, 6.6), BARN.roof, x, y, ry, -6.4, 0, h + 3.2)
      }
      for (const k of stage === 1 ? [1] : [0, 1, 2]) {
        const [bx, by] = to(x, y, ry, -3 + k * 2.2, 5.6)
        add(CYLINDER, BARN.straw, bx, by, h, 0, 0.85, 1.1, 0.85)
      }
      shadow(x, y, h, 12, 9, false, ry)
      brick('building', x, y, h)
    },

    /**
     * A pavilion standing on its floor at `(x, y)`, `h` above the road, as one brick: four wooden posts under a hipped
     * roof, open on every side, the kind that stands over a Japanese garden's pond.
     */
    pavilion(x: number, y: number, h: number) {
      add(cuboid(4.2, 0.3, 4.2), PAVILION.floor, x, y, h)
      for (const i of [-1, 1]) for (const j of [-1, 1]) add(cuboid(0.3, 2.6, 0.3), PAVILION.posts, x + i * 1.75, y + j * 1.75, h + 0.3)
      add(PYRAMID, PAVILION.roof, x, y, h + 2.9, Math.PI / 4, 3.6, 1.8, 3.6)
      shadow(x, y, h, 6, 6, true) // round, as the trees' are: a park or a meadow then draws no other shadow
      brick('building', x, y, h)
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
     *
     * At Stage `stage`, whose floors the caller picks: Stage 1 builds the plain body, with no penthouse, spire or dome,
     * one tier, and fewer floors lit at night. Stage 2 builds it as above. Stage 3 puts a spire on every style and a
     * third tier on a stepped one, and lights more floors. Its glass, its trim and how busy it is are drawn before
     * anything a Stage changes, so each Stage builds the same tower, better.
     */
    officeTower(x: number, y: number, h: number, w: number, d: number, floors: number, style: OfficeStyle, stage = 2) {
      const STOREY = 3.2
      const SKY = new THREE.Color('#e9f4fb')
      const [foot, trim, busy] = [new THREE.Color(pick(OFFICE_GLASS)), pick(OFFICE_TRIM), rand()]
      const lit = [0.2 + 0.25 * busy, 0.3 + 0.45 * busy, 0.45 + 0.4 * busy][stage - 1]
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
        add(cuboid(rw - 0.2, 0.3, rd - 0.2), DECK, x, y, at)
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
        add(box(pw + 0.3, 0.4, pd + 0.3, 0.45, 0.08), DECK, x - rw * 0.08, y + rd * 0.08, at + 3.4)
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
        if (stage === 1) add(ROUND, DECK, x, y, top + 0.2, 0, r - 0.2, 1, r - 0.2)
        else {
          add(SPHERE, trim, x, y, top + 1.4, 0, r * 0.78, r * 0.52, r * 0.78)
          spire(top + 1.4 + r * 0.5, stage === 3 ? range(9, 13) : range(4, 6), 0.3)
        }
      } else if (style === 'stepped') {
        // Each tier takes its share of the floors and stands 70% the size of the one below.
        const shares = stage === 1 ? [1] : stage === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2]
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
        const r = Math.min(tw, td) * 0.707
        const cap = stage === 1 ? Math.min(3.5, Math.min(tw, td) * 0.4) : Math.min(7, Math.min(tw, td) * 0.78)
        add(PYRAMID, trim, x, y, at, Math.PI / 4, r, cap, r)
        if (stage > 1) spire(at + cap - 0.4, stage === 3 ? range(8, 12) : range(5, 9), 0.24)
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
        if (stage > 1) {
          const crown = penthouse(w - 2, d - 2, top + 0.3)
          if (stage === 3 || floors >= 14) spire(crown, stage === 3 ? range(7, 11) : range(5, 8), 0.3)
        }
      } else {
        for (let f = 0; f < floors; f++) add(cuboid(w - 0.2, STOREY, d - 0.2), storey(f), x, y, base + f * STOREY)
        posts(w, d, base, body)
        mullions(w - 0.2, d - 0.2, base, body)
        roof(w, d, top, true)
        if (stage > 1) {
          const crown = penthouse(w, d, top + 0.3)
          if (stage === 3 || floors >= 14 || rand() < 0.4) spire(crown, stage === 3 ? range(7, 11) : range(5, 9), 0.18)
        }
      }
      shadow(x, y, h, w * 1.4 + 2.4, d * 1.4 + 2.4, style === 'round')
      brick('building', x, y, h)
    },

    /**
     * A detail that moves on its own (`./movers`), working the closed `loop` a stretch at a time from stop `first` of
     * `stops`, `h` above the road, and waiting, reversing and painted as `more` has it: a brick of its own with no
     * shapes, standing where the loop starts.
     */
    mover(
      kind: MoverKind,
      loop: Polyline,
      stops: number[],
      first: number,
      h: number,
      more: Pick<Mover, 'waits' | 'reverse' | 'paint'> = {},
    ) {
      movers.push({ kind, loop, stops, first, h, ...more, brick: bricks.length })
      bricks.push({ kind: 'mover', at: new THREE.Vector3(loop.pts[0].x, h, -loop.pts[0].y), dust: 0, fate, lot })
    },

    /**
     * A kei truck parked at `(x, y)`, its front facing `ry` (0 north, π/2 west), as one brick (#149): a white cab and a
     * flat bed with low gates, oversized as the cars are. Its bed carries two crates at Stage 2 and is full at Stage 3.
     */
    keiTruck(x: number, y: number, h: number, ry: number, stage = 2) {
      const [paint, crates] = [TRUCK.paint, stage === 3 ? 6 : 2]
      local(cuboid(1.7, 0.36, 4), TRUCK.chassis, x, y, ry, 0, 0, h + 0.28)
      for (const lx of [-0.82, 0.82]) for (const ly of [-1.3, 1.25]) local(cuboid(0.32, 0.62, 0.62), TRUCK.tyre, x, y, ry, lx, ly, h)
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
     * Crates stacked on the ground at `(x, y)`, `count` of them two to a layer, turned `ry`, as one brick: a farmyard's
     * harvest waiting to go.
     */
    crates(x: number, y: number, h: number, ry: number, count: number) {
      for (let k = 0; k < count; k++)
        local(cuboid(0.74, 0.44, 0.58), pick(TRUCK.crates), x, y, ry, k % 2 ? 0.4 : -0.4, 0, h + Math.floor(k / 2) * 0.46)
      shadow(x, y, h, 2.2, 1.6, false, ry)
      brick('building', x, y, h)
    },

    /**
     * Shipping containers stacked on the ground at `(x, y)`, their length along `ry` (0 east–west), as one brick (#150):
     * the layers from `first` up to `layers`, each a box in its own colour with its frame and ribs a shade darker.
     */
    containers(x: number, y: number, h: number, ry: number, layers: number, first = 0) {
      const { long: L, wide: W, tall: H } = CONTAINER
      for (let k = first; k < layers; k++) {
        const colour = pick(CONTAINERS)
        const frame = `#${new THREE.Color(colour).multiplyScalar(0.78).getHexString()}`
        const at = h + k * H
        add(cuboid(L - 0.24, H - 0.12, W - 0.1), colour, x, y, at + 0.06, ry)
        for (const end of [-1, 1]) local(cuboid(0.14, H, W), frame, x, y, ry, end * (L / 2 - 0.07), 0, at)
        for (let r = 1; r < 6; r++) local(cuboid(0.1, H - 0.3, W + 0.04), frame, x, y, ry, -L / 2 + (r * L) / 6, 0, at + 0.15)
      }
      if (!first) shadow(x, y, h, L + 1.2, W + 1.2, false, ry)
      brick('building', x, y, h + first * H)
    },

    /**
     * Pallets stacked at `(x, y)`, turned `ry`, each with its load of goods, as one brick (#150): the layers from `first`
     * up to `layers`. The forklifts' work, oversized a little as the props are.
     */
    pallets(x: number, y: number, h: number, ry: number, layers: number, first = 0) {
      const [P, T, G] = [1.4, 0.18, 0.95] // the pallet's side, its thickness and the height of its load
      for (let k = first; k < layers; k++) {
        const at = h + k * (T + G)
        add(cuboid(P, T, P), PALLET.wood, x, y, at, ry)
        add(cuboid(P - 0.12, G, P - 0.12), pick(PALLET.goods), x, y, at + T, ry)
      }
      if (!first) shadow(x, y, h, P + 0.8, P + 0.8, false, ry)
      brick('building', x, y, h + first * (T + G))
    },

    /**
     * The paint marking a truck's bay, a line down each side `l` m long and `w` apart, its length across a shed whose
     * long side runs `ry` (0 east–west), as a brick (#150).
     */
    bay(x: number, y: number, h: number, ry: number, l: number, w: number) {
      for (const k of [-1, 1]) local(cuboid(0.14, 0.02, l), BAY, x, y, ry, (k * w) / 2, 0, h)
      brick('ground', x, y, h)
    },

    /**
     * Steel outside stairs centred on `(x, y)`, their flights running along `ry`'s right, as one brick (#156): two
     * flights a storey from the first of `tops` (m above the road) to each of the others, as an apartment block has up
     * one end of its walkways.
     */
    outsideStairs(x: number, y: number, ry: number, tops: number[]) {
      stairs(x, y, ry, tops)
      shadow(x, y, tops[0], STAIR.long + 1, STAIR.wide + 1, false, ry)
      brick('building', x, y, tops[0])
    },

    /**
     * A straight flight of steel stairs up a wall, centred on `(x, y)` with its flight along `ry`'s right and the wall
     * at its back, rising `rise` m toward its end `toward` (1: its right, -1: its left) to a landing there with a door
     * in the wall, as one brick (#156): the stairs up the end of a small apartment house's row.
     */
    wallStairs(x: number, y: number, h: number, ry: number, rise: number, toward: number) {
      const { landing: D } = STAIR
      const W = WALL_STAIR.wide
      const run = rise * WALL_STAIR.run
      const L = run + D
      put(flight(toward * run, rise, W - 0.1, 0.14), STEEL.tread, x, y, ry, (-toward * D) / 2, 0, h + rise / 2)
      put(flight(toward * run, rise, 0.05, 0.9), STEEL.frame, x, y, ry, (-toward * D) / 2, W / 2 - 0.03, h + rise / 2 + 0.5)
      const end = toward * (L / 2 - D / 2) // the landing's middle
      put(cuboid(D, 0.14, W), STEEL.tread, x, y, ry, end, 0, h + rise - 0.14)
      put(cuboid(D, 0.9, 0.05), STEEL.frame, x, y, ry, end, W / 2 - 0.03, h + rise)
      put(cuboid(0.05, 0.9, W), STEEL.frame, x, y, ry, toward * (L / 2 - 0.03), 0, h + rise)
      for (const lx of [end - D / 2 + 0.06, end + D / 2 - 0.06]) put(cuboid(0.12, rise, 0.12), STEEL.frame, x, y, ry, lx, W / 2 - 0.06, h)
      put(cuboid(0.9, 2.05, 0.12), TERRACE.door, x, y, ry, end, -W / 2 - 0.02, h + rise)
      shadow(x, y, h, L + 0.8, W + 0.8, false, ry)
      brick('building', x, y, h)
    },

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
      shadow(x, y, h, W + 0.8, D + 0.8, false, ry)
      brick('building', x, y, h)
    },

    /**
     * A covered bike rack `len` long centred on `(x, y)`, open to its front `ry`, with `bikes` bicycles in it, as one
     * brick (#156): steel posts and a pale roof, a rail along the back, and the bicycles side by side facing out.
     */
    bikeRack(x: number, y: number, h: number, ry: number, len: number, bikes: number) {
      const D = BIKE_RACK.deep
      for (const lx of [-1, 1])
        for (const ly of [-1, 1]) put(cuboid(0.1, 2.25, 0.1), BIKES.steel, x, y, ry, lx * (len / 2 - 0.08), ly * (D / 2 - 0.08), h)
      put(cuboid(len + 0.3, 0.08, D + 0.3), BIKES.roof, x, y, ry, 0, 0, h + 2.25)
      put(cuboid(len - 0.2, 0.08, 0.08), BIKES.steel, x, y, ry, 0, -D / 2 + 0.25, h + 0.55)
      const n = Math.min(bikes, Math.floor((len - 0.3) / BIKE_RACK.per))
      for (let k = 0; k < n; k++) {
        const lx = -len / 2 + 0.15 + BIKE_RACK.per * (k + 0.5)
        bicycle(...to(x, y, ry, lx, -0.05), h, ry + Math.PI / 2)
      }
      shadow(x, y, h, len + 1, D + 1, false, ry)
      brick('building', x, y, h)
    },

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
      add(SPHERE, SCARECROW.head, x, y, h + 2.42, 0, 0.32, 0.36, 0.32)
      add(CYLINDER, BARN.straw, x, y, h + 2.62, 0, 0.72, 0.06, 0.72)
      add(CONE, BARN.straw, x, y, h + 2.66, 0, 0.36, 0.4, 0.36)
      shadow(x, y, h, 2, 2, true)
      brick('tree', x, y, h)
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

    /**
     * A picnic blanket laid at `(x, y)`, turned `ry`, as one brick (#152): gingham in one of the blankets' colours, with
     * a basket on it if `basket`, and a parasol over it in another colour if `parasol`. Oversized a little.
     */
    blanket(x: number, y: number, h: number, ry: number, basket: boolean, parasol: boolean) {
      const [colour, shade] = [pick(PICNIC.blankets), pick(PICNIC.blankets)]
      add(cuboid(2.6, 0.04, 2), colour, x, y, h, ry)
      for (const k of [-1, 0, 1]) {
        local(cuboid(0.18, 0.012, 2), PICNIC.stripe, x, y, ry, k * 0.78, 0, h + 0.04)
        local(cuboid(2.6, 0.012, 0.18), PICNIC.stripe, x, y, ry, 0, k * 0.6, h + 0.04)
      }
      if (basket) {
        local(cuboid(0.62, 0.36, 0.42), PICNIC.basket, x, y, ry, 0.72, 0.5, h + 0.04)
        local(cuboid(0.66, 0.05, 0.46), PICNIC.lid, x, y, ry, 0.72, 0.5, h + 0.4)
        for (const k of [-1, 1]) local(cuboid(0.04, 0.26, 0.04), PICNIC.lid, x, y, ry, 0.72 + k * 0.24, 0.5, h + 0.45)
        local(cuboid(0.52, 0.04, 0.04), PICNIC.lid, x, y, ry, 0.72, 0.5, h + 0.71)
      }
      if (parasol) {
        const [px, py] = to(x, y, ry, -0.95, 0.7)
        add(cuboid(0.06, 2.3, 0.06), BENCH.iron, px, py, h)
        add(CONE, shade, px, py, h + 1.95, 0, 1.4, 0.5, 1.4)
        shadow(px, py, h, 3, 3, true)
      }
      brick('ground', x, y, h)
    },

    /** A water butt at `(x, y)`, as one brick that drops in (#152): a green barrel under a darker lid, oversized a little. */
    waterButt(x: number, y: number, h: number) {
      add(CYLINDER, BUTT.body, x, y, h, 0, 0.42, 1.1, 0.42)
      add(CYLINDER, BUTT.lid, x, y, h + 1.1, 0, 0.45, 0.07, 0.45)
      shadow(x, y, h, 1.3, 1.3, true)
      brick('building', x, y, h)
    },

    /**
     * Cold frames in a row `w` m long at `(x, y)`, their fronts facing `ry`, as one brick that drops in (#152): glass
     * lights 1.1 m deep, sloping down to the front, on a low painted base, one to every 1.3 m or so.
     */
    coldFrames(x: number, y: number, h: number, ry: number, w: number) {
      const n = Math.max(1, Math.round(w / 1.3))
      const each = w / n
      for (let k = 0; k < n; k++) {
        const lx = -w / 2 + (k + 0.5) * each
        local(cuboid(each - 0.08, 0.24, 1.1), FRAME.base, x, y, ry, lx, 0, h)
        add(LIGHT, FRAME.glass, ...to(x, y, ry, lx, 0), h + 0.24, ry, each - 0.14, 1, 1.1)
      }
      shadow(x, y, h, w + 1, 2, true, ry) // round, as a scarecrow's or a water butt's: allotments draw no other shadow
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

    /**
     * Everything built, as parts tagged with their bricks, the movers and the chimneys' plumes. Every shape must be in a
     * brick by now. The kit is spent after this.
     */
    done(): { parts: Part[]; bricks: Brick[]; movers: Mover[]; plumes: Plume[] } {
      if (open < parts.length) throw new Error('the kit has shapes left out of any brick')
      for (const g of [...boxes.values(), ...cuboids.values(), ...gables.values(), ...flights.values()]) g.dispose()
      boxes.clear()
      cuboids.clear()
      gables.clear()
      flights.clear()
      return { parts, bricks, movers, plumes }
    },
  }
}
