// PROTOTYPE, throwaway (`./prototype-look`): walkers as jointed block figures. Each figure is still one merged model
// drawn as instances, but every part says which limb it is and where that limb turns, and the vertex shader swings the
// limbs as each instance's pose has them: legs and arms in step with the ground it covers, an arm raised to talk, the
// head turned to look. Not for main.
import * as THREE from 'three'
import { mulberry32 } from '../sim/demand'
import { pointAt, type Polyline, type Vec } from '../sim/geometry'
import type { Junction } from '../sim/network'
import type { Parked } from '../sim/prototype-signals'
import { inside } from './field'
import { allPlaces, placeCount, type Place } from './prototype-look'
import { part, tint } from './shapes'

const [BODY, LEFT_LEG, RIGHT_LEG, LEFT_ARM, RIGHT_ARM, HEAD] = [0, 1, 2, 3, 4, 5]
const [SKIN, HAIR, NAVY] = ['#f1d1b5', '#3a3330', '#3a4252']
/** How far a leg swings either way, in radians. */
const SWING = 0.62

/** Mark `g` as part of `limb`, which turns about the point `(px, py)` of the figure's side view (x ahead, y up); a head turns about the upright through `px`. */
const of = (g: THREE.BufferGeometry, limb: number, px = 0, py = 0) => {
  const joint = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < joint.length; i += 3) joint.set([limb, px, py], i)
  return g.setAttribute('joint', new THREE.BufferAttribute(joint, 3))
}
/** Two legs `hip` m long, each `apart` m off the middle. A figure faces +x, so its right is +z. */
const legs = (hip: number, colour: string, wide: number, apart: number, deep: number) => [
  of(part(wide, hip, deep, 0, 0, -apart, colour), LEFT_LEG, 0, hip),
  of(part(wide, hip, deep, 0, 0, apart, colour), RIGHT_LEG, 0, hip),
]
/** Two arms hanging `len` m from the `shoulder`, `out` m off the middle: a sleeve and a hand each. */
const arms = (shoulder: number, len: number, out: number, sleeve: string) =>
  [-1, 1].flatMap((k) => {
    const limb = k < 0 ? LEFT_ARM : RIGHT_ARM
    return [
      of(part(0.17, len - 0.14, 0.14, 0, shoulder - len + 0.14, k * out, sleeve), limb, 0, shoulder - 0.06),
      of(part(0.15, 0.14, 0.12, 0, shoulder - len, k * out, SKIN), limb, 0, shoulder - 0.06),
    ]
  })

/**
 * Each kind's parts, as the game's walkers are dressed: a shopper in a coat in its paint (pure white takes it) with a
 * bag in its left hand, a schoolchild in a white shirt and navy shorts under a yellow hat with a satchel on its back,
 * an office worker in a dark suit with a briefcase in its right hand. And the ground each covers in one whole stride,
 * both steps, so that its feet do not slide.
 */
export const FIGURES = {
  shopper: {
    hip: 0.7,
    stride: 4 * 0.7 * Math.sin(SWING),
    parts: () => [
      ...legs(0.7, NAVY, 0.22, 0.1, 0.16),
      of(part(0.34, 0.86, 0.5, 0, 0.56, 0, '#ffffff'), BODY),
      ...arms(1.4, 0.7, 0.32, '#ffffff'),
      of(part(0.26, 0.32, 0.12, 0.02, 0.4, -0.32, '#f6d36a'), LEFT_ARM, 0, 1.34),
      of(part(0.3, 0.3, 0.3, 0.02, 1.44, 0, SKIN), HEAD, 0.02),
      of(part(0.33, 0.12, 0.33, -0.01, 1.7, 0, HAIR), HEAD, 0.02),
    ],
  },
  schoolchild: {
    hip: 0.5,
    stride: 4 * 0.5 * Math.sin(SWING),
    parts: () => [
      ...legs(0.5, NAVY, 0.2, 0.09, 0.15),
      of(part(0.3, 0.52, 0.46, 0, 0.5, 0, '#fbf8f2'), BODY),
      of(part(0.26, 0.4, 0.42, -0.24, 0.56, 0, '#5a3f34'), BODY),
      ...arms(1.0, 0.46, 0.29, '#fbf8f2'),
      of(part(0.3, 0.3, 0.3, 0.02, 1.02, 0, SKIN), HEAD, 0.02),
      of(tint(new THREE.CylinderGeometry(0.24, 0.27, 0.16, 8).translate(0.02, 1.38, 0), '#f6d36a'), HEAD, 0.02),
      of(tint(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 8).translate(0.02, 1.31, 0), '#f6d36a'), HEAD, 0.02),
    ],
  },
  worker: {
    hip: 0.84,
    stride: 4 * 0.84 * Math.sin(SWING),
    parts: () => [
      ...legs(0.84, NAVY, 0.24, 0.1, 0.17),
      of(part(0.36, 0.76, 0.52, 0, 0.82, 0, '#4a5262'), BODY),
      of(part(0.05, 0.42, 0.16, 0.18, 1.14, 0, '#fbf8f2'), BODY),
      ...arms(1.56, 0.74, 0.33, '#4a5262'),
      of(part(0.42, 0.3, 0.1, 0.02, 0.52, 0.33, '#5a3f34'), RIGHT_ARM, 0, 1.5),
      of(part(0.32, 0.32, 0.32, 0.02, 1.58, 0, SKIN), HEAD, 0.02),
      of(part(0.34, 0.1, 0.34, -0.01, 1.86, 0, HAIR), HEAD, 0.02),
    ],
  },
} as const

/**
 * Have a material move each vertex as its limb and its instance's `pose` say: `pose.x` is where in its stride it is
 * (radians), `pose.y` how far it swings (0 standing, 1 walking; below 0, how far it is sat down), `pose.z` how far its right arm is raised (radians)
 * and `pose.w` how far its head is turned (radians).
 */
export const jointed = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 joint;\nattribute vec4 pose;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
{
  float limb = joint.x;
  // \`pose.y\` above 0 is how far it swings as it walks; below 0, how far it is sat down.
  float walk = max(0.0, pose.y);
  float sat = max(0.0, -pose.y);
  float swing = sin(pose.x) * walk * ${SWING.toFixed(2)};
  float turn = 0.0;
  if (limb > 0.5 && limb < 1.5) turn = swing + sat * 1.45;
  else if (limb > 1.5 && limb < 2.5) turn = -swing + sat * 1.45;
  else if (limb > 2.5 && limb < 3.5) turn = -swing * 0.8 + sat * 0.45;
  else if (limb > 3.5 && limb < 4.5) turn = swing * 0.8 * (1.0 - min(1.0, pose.z)) + pose.z + sat * 0.45 * (1.0 - min(1.0, pose.z));
  if (limb > 0.5 && limb < 4.5) {
    vec2 p = transformed.xy - joint.yz;
    float c = cos(turn), s = sin(turn);
    transformed.xy = joint.yz + vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  } else if (limb > 4.5) {
    vec2 p = vec2(transformed.x - joint.y, transformed.z);
    float c = cos(pose.w), s = sin(pose.w);
    transformed.x = joint.y + c * p.x + s * p.y;
    transformed.z = c * p.y - s * p.x;
  }
  // A walker leans into its stride, and rises a little as each foot passes under it.
  transformed.x += (transformed.y - 0.4) * 0.07 * walk;
  transformed.y += abs(cos(pose.x)) * 0.05 * walk;
}`,
    )
}

// ---- People: who each walker is, what it does, and its storylets. ----------------------------------------------
// After Neon Terrarium's storylet engine as its author describes it: everything about a person comes from a seed, once,
// when they appear, so being someone costs nothing a frame; everyone does small things (a shop, a bench, a look in a
// window); and a storylet, a short story in beats, begins only for someone the player has watched for a while, and
// goes on in the background for those the player keeps. Each person's storylets are kept in their own log.

type Kind = keyof typeof FIGURES
const NAMES = ['Hana', 'Kenji', 'Yui', 'Sora', 'Aoi', 'Ren', 'Mei', 'Daichi', 'Emi', 'Haruto', 'Mio', 'Takumi', 'Rin', 'Kaito', 'Nao', 'Shun', 'Saki', 'Yuto', 'Kana', 'Riku', 'Momo', 'Jun', 'Chie', 'Akira'] // prettier-ignore
const TRAITS = [
  'early riser',
  'sweet tooth',
  'chatty',
  'daydreamer',
  'bargain hunter',
  'bookworm',
  'night owl',
  'plant lover',
  'always late',
  'collector',
]
const HOMES = [
  'a flat over the bakery',
  'the house with the orange roof',
  'the ninth floor of a tower by the park',
  'a room above the family shop',
  'a terrace two streets over',
]
const JOBS: Record<Kind, string[]> = {
  shopper: ['keeps a flower stall', 'works nights at the hospital', 'teaches piano', 'is retired and busy', 'draws for a magazine'],
  schoolchild: ['is in the fourth year', 'is in the sixth year', 'plays in the school band', 'is on the football team'],
  worker: ['works in an office on the avenue', 'sells insurance', 'keeps the books for three shops', 'is new at the firm'],
}
const ROLE: Record<Kind, string> = { shopper: 'out shopping', schoolchild: 'a schoolchild', worker: 'an office worker' }

type Step = 'stop' | 'door' | 'bench' | 'cross' | 'home'
/** Steps that end indoors. */
const indoors = (step?: Step) => step === 'door' || step === 'home'
/** What a person has a door of their own for. */
type Base = 'home' | 'shop' | 'plant'
/** A storylet: who it can happen to and when, and its beats, each a thing done and the line it leaves in the log; `end` closes it. */
interface Storylet {
  title: string
  kinds?: Kind[]
  pair?: boolean
  when?: ('morning' | 'day' | 'dusk' | 'night')[]
  /** For those with a door of their own of this kind; a `home` beat goes to it. */
  needs?: Base
  beats: [Step, string][]
  end: string
}
// In a line, `A` is the person and `B` the one beside them.
const STORYLETS: Storylet[] = [
  {
    title: 'Dinner, eventually',
    kinds: ['shopper', 'worker'],
    pair: false,
    when: ['dusk', 'night'],
    beats: [
      ['door', 'A went in to pick up dinner.'],
      ['bench', 'A sat a while with the bag, in no hurry.'],
    ],
    end: 'A headed home as the lamps came on.',
  },
  {
    title: 'Pocket money',
    kinds: ['schoolchild'],
    pair: false,
    beats: [
      ['stop', 'A counted coins at the window.'],
      ['door', 'A went in.'],
      ['bench', 'A came out with a sweet and sat down to eat it.'],
    ],
    end: 'A saved the wrapper and walked on.',
  },
  {
    title: 'Waiting for someone',
    pair: false,
    beats: [
      ['bench', 'A sat down and kept checking the street.'],
      ['stop', 'A got up, looked both ways, and checked again.'],
    ],
    end: 'Nobody came. A walked on, a little slower.',
  },
  {
    title: 'Only looking',
    kinds: ['shopper'],
    pair: false,
    beats: [
      ['stop', 'A stopped at a window. Only looking.'],
      ['stop', 'A stopped at the next window too.'],
      ['door', 'A gave in and went inside.'],
    ],
    end: 'A came out carrying more than planned.',
  },
  {
    title: 'Ten minutes out',
    kinds: ['worker'],
    pair: false,
    when: ['morning', 'day'],
    beats: [
      ['bench', 'A slipped out of the office for ten minutes.'],
      ['stop', 'A stood a moment before going back.'],
    ],
    end: 'A went back in. It had been fourteen minutes.',
  },
  {
    title: 'The long talk',
    pair: true,
    beats: [
      ['stop', 'A and B stopped to talk.'],
      ['bench', 'The talk needed a bench.'],
      ['door', 'A and B went in together, still talking.'],
    ],
    end: 'A and B walked on, not finished.',
  },
  {
    title: 'Showing the way',
    pair: true,
    beats: [
      ['stop', 'A pointed something out to B.'],
      ['door', 'A took B in to see it.'],
    ],
    end: 'B agreed it was worth the detour.',
  },
  {
    title: 'The other side',
    pair: false,
    beats: [
      ['cross', 'A waited for the lights and crossed over.'],
      ['stop', 'A looked back at the side they had left.'],
    ],
    end: 'A decided this side was better.',
  },
  {
    title: 'Across the road',
    pair: true,
    beats: [
      ['cross', 'A and B crossed at the lights.'],
      ['door', 'A and B found the shop they were after.'],
    ],
    end: 'A and B came out agreeing it had been worth crossing for.',
  },
  {
    title: 'Forgot something',
    needs: 'home',
    pair: false,
    beats: [
      ['stop', 'A got to the corner and stopped.'],
      ['home', 'A went back in for it.'],
    ],
    end: 'A set off again, patting a pocket.',
  },
  {
    title: 'Home before dark',
    needs: 'home',
    when: ['dusk', 'night'],
    beats: [
      ['door', 'A picked something up on the way.'],
      ['home', 'A let themselves in and put the light on.'],
    ],
    end: 'A came back out for a last look at the street.',
  },
  {
    title: 'Minding the shop',
    needs: 'shop',
    beats: [
      ['home', 'A went in to mind the counter.'],
      ['stop', 'A stepped out to see how the window looked.'],
    ],
    end: 'A moved one thing in the window and was satisfied.',
  },
  {
    title: 'The shift',
    needs: 'plant',
    beats: [
      ['home', 'A clocked in.'],
      ['bench', 'A took the break outside.'],
      ['home', 'A went back in before the whistle.'],
    ],
    end: 'A clocked out and stood a moment in the air.',
  },
  {
    title: 'A slow evening',
    pair: true,
    when: ['dusk', 'night'],
    beats: [
      ['bench', 'A and B took the bench under the lamp.'],
      ['stop', 'A and B watched the windows light, one by one.'],
    ],
    end: 'A and B went home the long way.',
  },
]

export interface Person {
  id: number
  name: string
  kind: Kind
  traits: string[]
  home: string
  job: string
  lead?: Person
  friend?: Person
  side: number
  line: Polyline
  loop: Vec[]
  s: number
  speed: number
  phase: number
  talks: boolean
  // Where it is and how it stands, for the mesh.
  x: number
  y: number
  heading: number
  size: number
  sit: number
  stride: number
  swing: number
  arm: number
  look: number
  // What it is doing: strolling its Block's pavement (perhaps `until` it reaches a point of it), stopped, going to a
  // place, there (in a shop or on a bench), or coming back to the pavement.
  doing: 'stroll' | 'stop' | 'go' | 'act' | 'back' | 'wait'
  /** The far end of the zebra it means to cross, and the Junction whose lights it waits for. */
  cross?: { to: CrossingEnd; junction: Junction }
  // A door of their own, where they have one, and what it is to them; the Zone they were first seen on.
  zone?: string
  base?: Place | null
  baseKind?: Base
  // A driver: the car they came in, whether they are getting back into it, and whether they have gone.
  car?: Parked
  leaving?: boolean
  gone?: boolean
  step?: Step
  place?: Place
  until?: number
  tx: number
  ty: number
  timer: number
  next: number
  now: string
  // Its storylets: how long the player has watched it, whether the player keeps it, the one running, and its log.
  watched: number
  kept: boolean
  rest: number
  story?: { of: Storylet; beat: number }
  log: { title: string; when: string; lines: string[]; done: boolean }[]
}

/** One end of a zebra: where it is, and the pavement it is on, with how far round it. */
export interface CrossingEnd {
  x: number
  y: number
  line: Polyline
  loop: Vec[]
  s: number
}
let crossings: { junction: Junction; ends: [CrossingEnd, CrossingEnd] }[] = []
/** Say where people cross at the lights (`./prototype-signals`). */
export const setCrossings = (found: typeof crossings) => (crossings = found)

// Every storylet that has ended, newest first: it outlasts whoever it was about, a driver who has driven off too.
const archive: { who: string; title: string; text: string }[] = []
const file = (p: Person) => {
  const entry = p.log[p.log.length - 1]
  archive.unshift({ who: p.friend ? `${p.name} and ${p.friend.name}` : p.name, title: entry.title, text: entry.lines.join(' ') })
  archive.length = Math.min(archive.length, 40)
}
/** The storylets that ended most lately. */
export const recent = (n = 8) => archive.slice(0, n)

let ids = 0
// Whoever wants to hear of each line a Storylet writes; nobody does yet.
const listeners: ((p: Person) => void)[] = []

/** A person from a seed: all they are, decided once. One who walks beside another is given their `lead`. */
export function newPerson(
  seed: number,
  kind: Kind,
  line: Polyline,
  loop: Vec[],
  s: number,
  speed: number,
  lead?: Person,
  side = 0,
  zone?: string,
): Person {
  const draw = mulberry32(seed)
  const of = <T>(a: T[]) => a[Math.floor(draw() * a.length)]
  const here = pointAt(line, s)
  const me: Person = {
    ...{
      id: ++ids,
      name: of(NAMES),
      kind,
      traits: [of(TRAITS), of(TRAITS)].filter((v, i, a) => a.indexOf(v) === i),
      home: of(HOMES),
      job: of(JOBS[kind]),
    },
    ...{ lead, side, line, loop, s, speed, phase: draw() * 10, talks: draw() < 0.6, zone },
    ...{ x: here.x, y: here.y, heading: here.heading, size: 1, sit: 0, stride: draw() * 6, swing: 1, arm: 0, look: 0 },
    ...{
      doing: 'stroll' as const,
      tx: 0,
      ty: 0,
      timer: 0,
      next: 4 + draw() * 20,
      now: 'walking',
      watched: 0,
      kept: false,
      rest: 0,
      log: [],
    },
  }
  if (lead) {
    lead.friend = me
    me.friend = lead
    if (lead.name === me.name) me.name = NAMES[(NAMES.indexOf(me.name) + 7) % NAMES.length]
  }
  return me
}

/** m/s: how fast people cross a street, however they stroll. */
const CROSSING_PACE = 1.5
const HEADING: Record<Base, string> = { home: 'heading home', shop: 'heading back to the shop', plant: 'heading in to work' }
const INSIDE: Record<Base, string> = { home: 'at home', shop: 'minding the shop', plant: 'at work' }
const whenOf = (day: number) => (day < 0.18 || day > 0.92 ? 'morning' : day < 0.42 ? 'day' : day < 0.6 ? 'dusk' : 'night')
const say = (text: string, p: Person) => text.replace(/\bA\b/g, p.name).replace(/\bB\b/g, p.friend?.name ?? 'a friend')

// The places each Block's pavement reaches: those inside it or just off it, found again when more are built.
const reach = new WeakMap<Vec[], { count: number; places: { place: Place; s: number }[] }>()
function placesOf(p: Person) {
  const known = reach.get(p.loop)
  if (known?.count === placeCount()) return known.places
  const places: { place: Place; s: number }[] = []
  for (const place of allPlaces()) {
    let [best, at] = [Infinity, 0]
    for (let s = 0; s < p.line.length; s += 1) {
      const q = pointAt(p.line, s)
      const d = Math.hypot(q.x - place.x, q.y - place.y)
      if (d < best) [best, at] = [d, s]
    }
    if (best < 2.6 || (best < 16 && inside(p.loop, place.x, place.y))) places.push({ place, s: at })
  }
  reach.set(p.loop, { count: placeCount(), places })
  return places
}

/** Begin a step: a stop where it stands, or a walk round the pavement to the point nearest a door or a bench, then to it. */
function begin(p: Person, step: Step) {
  if (step === 'cross') {
    // To the nearest zebra's end on this pavement, there to wait for the lights.
    const ways = crossings.flatMap(({ junction, ends }) =>
      ends.flatMap((from, k) => (from.line === p.line ? [{ junction, from, to: ends[1 - k] }] : [])),
    )
    const way = ways.sort((a, b) => ahead(p, a.from.s) - ahead(p, b.from.s))[Math.floor(Math.random() * Math.min(2, ways.length))]
    if (way) {
      const [fore, aft] = [(way.from.s - p.s + p.line.length) % p.line.length, (p.s - way.from.s + p.line.length) % p.line.length]
      p.speed = Math.abs(p.speed) * (fore <= aft ? 1 : -1)
      // Not all at one spot of the kerb: each a little along it from the zebra's middle.
      const spot = (way.from.s + (Math.random() - 0.5) * 3.4 + p.line.length) % p.line.length
      ;[p.doing, p.step, p.until, p.cross, p.now] = [
        'stroll',
        step,
        spot,
        { to: way.to, junction: way.junction },
        'heading for the crossing',
      ]
      return
    }
  }
  const found =
    step === 'stop' || step === 'cross' ? [] : placesOf(p).filter((f) => (step === 'home' ? f.place === p.base : f.place.kind === step))
  if (!found.length) {
    const here = pointAt(p.line, p.s)
    const [nx, ny] = [-Math.sin(here.heading), Math.cos(here.heading)]
    p.heading = here.heading + (inside(p.loop, here.x + nx * 2.5, here.y + ny * 2.5) ? Math.PI / 2 : -Math.PI / 2)
    ;[p.doing, p.step, p.timer, p.now] = ['stop', 'stop', 3 + Math.random() * 6, p.friend ? 'talking' : 'looking in a window']
    return
  }
  // The nearest few, so that it does not always walk to the same one.
  const near = found.sort((a, b) => ahead(p, a.s) - ahead(p, b.s)).slice(0, step === 'home' ? 1 : 3)
  const { place, s } = near[Math.floor(Math.random() * near.length)]
  const [fore, aft] = [(s - p.s + p.line.length) % p.line.length, (p.s - s + p.line.length) % p.line.length]
  p.speed = Math.abs(p.speed) * (fore <= aft ? 1 : -1)
  ;[p.doing, p.step, p.place, p.until, p.now] = [
    'stroll',
    step,
    place,
    s,
    step === 'home' ? HEADING[p.baseKind!] : step === 'door' ? 'heading for a door' : 'looking for a seat',
  ]
}
const ahead = (p: Person, s: number) => Math.min((s - p.s + p.line.length) % p.line.length, (p.s - s + p.line.length) % p.line.length)

/** What is done is done: back to strolling, and a storylet's next beat, or its end. */
function done(p: Person) {
  ;[p.doing, p.step, p.place, p.until, p.cross, p.now] = ['stroll', undefined, undefined, undefined, undefined, 'walking']
  p.next = p.story ? 2 + Math.random() * 3 : 8 + Math.random() * 24
  if (!p.story) return
  if (p.story.beat < p.story.of.beats.length - 1) return // more beats to come, the first too if it began mid-errand
  const entry = p.log[p.log.length - 1]
  entry.lines.push(say(p.story.of.end, p))
  entry.done = true
  file(p)
  ;[p.story, p.rest, p.watched] = [undefined, 30 + Math.random() * 40, 0]
  for (const hear of listeners) hear(p)
}

/** Give a person a door of their own, if their Zone has one for them: a home, a shop they keep, a plant they work at. */
function settle(p: Person) {
  const kind: Base | undefined = p.zone?.endsWith('density')
    ? 'home'
    : p.zone === 'shops'
      ? 'shop'
      : p.zone === 'industrial'
        ? 'plant'
        : undefined
  const doors = placesOf(p).filter((f) => f.place.kind === 'door')
  const share = kind === 'home' ? 0.85 : kind === 'plant' ? 0.7 : 0.35
  p.base = kind && doors.length && (p.id * 0.618) % 1 < share ? doors[p.id % doors.length].place : null
  if (!p.base) return
  p.baseKind = kind
  if (kind === 'home') p.home = 'a house on this Block'
  else p.job = kind === 'shop' ? 'keeps a shop on this Block' : 'works at the plant here'
}

/** Choose what to do next: its storylet's beat, and its line in the log; or, with none running, some small thing. */
function decide(p: Person) {
  if (p.story) {
    const [step, line] = p.story.of.beats[++p.story.beat]
    p.log[p.log.length - 1].lines.push(say(line, p))
    for (const hear of listeners) hear(p)
    return begin(p, step)
  }
  if (p.base === undefined) settle(p)
  const roll = Math.random()
  if (p.base && roll > 0.72) return begin(p, 'home')
  begin(p, roll < 0.3 ? 'stop' : roll < 0.6 ? 'door' : roll < 0.8 ? 'bench' : 'cross')
}

/** Begin a storylet for someone the player watches or keeps, if one fits who they are and the time of day. */
function inspire(p: Person, day: number) {
  if (p.base === undefined) settle(p)
  const now = whenOf(day)
  const fits = STORYLETS.filter(
    (s) =>
      (!s.kinds || s.kinds.includes(p.kind)) &&
      (!s.needs || s.needs === p.baseKind) &&
      (s.pair === undefined || s.pair === !!p.friend) &&
      (!s.when || s.when.includes(now)) &&
      p.log[p.log.length - 1]?.title !== s.title,
  )
  if (!fits.length) return
  const of = fits[Math.floor(Math.random() * fits.length)]
  p.story = { of, beat: -1 }
  p.log.push({ title: of.title, when: now, lines: [], done: false })
  if (p.doing === 'stroll' && p.until === undefined) p.next = 0.5
}

const toward = (p: Person, x: number, y: number, dt: number, least = 0) => {
  const [dx, dy] = [x - p.x, y - p.y]
  const far = Math.hypot(dx, dy)
  const pace = Math.max(least, Math.abs(p.speed)) * dt
  if (far <= pace) return (([p.x, p.y] = [x, y]), true)
  ;[p.x, p.y, p.heading] = [p.x + (dx / far) * pace, p.y + (dy / far) * pace, Math.atan2(dy, dx)]
  return false
}

/**
 * A frame of a person's life, `dt` s long at clock `t` and time of day `day`: where they are, how they stand, and
 * what they are about. `watching` is whether the player follows them. One who walks beside another does as they do.
 */
export function live(p: Person, dt: number, t: number, day: number, watching: boolean) {
  const ease = Math.min(1, dt * 7)
  const lead = p.lead ?? p
  if (p.car) errand(p, dt)
  else if (!p.lead) {
    // A storylet begins for one the player has watched a while, or keeps, once the last has had its rest.
    p.rest = Math.max(0, p.rest - dt)
    if (watching) p.watched += dt
    if (!p.story && !p.rest && (p.watched > 5 || p.kept)) inspire(p, day)
    if (p.doing === 'stroll') {
      p.s = (p.s + p.speed * dt + p.line.length) % p.line.length
      const here = pointAt(p.line, p.s)
      ;[p.x, p.y, p.heading] = [here.x, here.y, here.heading + (p.speed < 0 ? Math.PI : 0)]
      if (p.until !== undefined) {
        if (ahead(p, p.until) < 0.7 && p.step === 'cross') {
          // At the kerb, facing the far side, until the lights say walk.
          const { to } = p.cross!
          ;[p.doing, p.heading, p.timer, p.now] = ['wait', Math.atan2(to.y - p.y, to.x - p.x), 150, 'waiting for the lights']
        } else if (ahead(p, p.until) < 0.7) {
          // Off the pavement: to a door's step, or to a seat on a bench.
          const { x, y, ry } = p.place!
          ;[p.tx, p.ty] = p.step === 'bench' ? [x - 0.05 * Math.sin(ry), y + 0.05 * Math.cos(ry)] : [x, y]
          ;[p.doing, p.until] = ['go', p.until]
        }
      } else if ((p.next -= dt) <= 0) decide(p)
    } else if (p.doing === 'stop') {
      if ((p.timer -= dt) <= 0) done(p)
    } else if (p.doing === 'wait') {
      // Across when the walk has long enough left to reach the far kerb at a brisk pace; or it gives up waiting.
      const { to, junction } = p.cross!
      const far = Math.hypot(to.x - p.x, to.y - p.y)
      if (junction.signal?.walk && junction.signal.walkLeft * CROSSING_PACE > far + 1.5)
        [p.doing, p.tx, p.ty, p.now] = ['go', to.x, to.y, 'crossing the street']
      else if ((p.timer -= dt) <= 0) done(p)
    } else if (p.doing === 'go' && p.step === 'cross') {
      if (toward(p, p.tx, p.ty, dt, CROSSING_PACE)) {
        // On the far pavement, which is now the one it walks; the one beside it too.
        const { to } = p.cross!
        ;[p.line, p.loop, p.s] = [to.line, to.loop, to.s]
        if (p.friend) [p.friend.line, p.friend.loop] = [to.line, to.loop]
        done(p)
      }
    } else if (p.doing === 'go') {
      if (toward(p, p.tx, p.ty, dt)) {
        const bench = p.step === 'bench'
        p.heading = p.place!.ry + (bench ? Math.PI / 2 : -Math.PI / 2)
        const own = p.step === 'home'
        ;[p.doing, p.timer, p.now] = [
          'act',
          bench ? 10 + Math.random() * 14 : own ? 14 + Math.random() * 26 : 6 + Math.random() * 8,
          bench ? 'sitting on a bench' : own ? INSIDE[p.baseKind!] : 'indoors',
        ]
      }
    } else if (p.doing === 'act') {
      if ((p.timer -= dt) <= 0) {
        const back = pointAt(p.line, p.until!)
        ;[p.doing, p.tx, p.ty, p.now] = ['back', back.x, back.y, 'walking']
        if (indoors(p.step)) p.heading += Math.PI
      }
    } else if (p.size > 0.9 && p.sit < 0.15 && toward(p, p.tx, p.ty, dt)) {
      p.s = p.until!
      done(p)
    }
  } else {
    // Beside its lead, on a bench too; a little toward the other when they stop.
    const [nx, ny] = [-Math.sin(lead.heading), Math.cos(lead.heading)]
    const off = lead.doing === 'act' && lead.step === 'bench' ? Math.sign(p.side) * 0.75 : p.side
    ;[p.x, p.y, p.heading, p.now] = [lead.x + nx * off, lead.y + ny * off, lead.heading, lead.now]
  }
  const acting = lead.doing === 'act'
  const still = lead.doing === 'stop' || lead.doing === 'wait' || acting || (lead.doing === 'back' && (lead.size < 0.9 || lead.sit > 0.15))
  p.size += ((acting && indoors(lead.step) ? 0 : 1) - p.size) * Math.min(1, dt * 5)
  p.sit += ((acting && lead.step === 'bench' ? 1 : 0) - p.sit) * Math.min(1, dt * 5)
  p.swing += ((still ? 0 : 1) - p.swing) * ease
  if (!still) p.stride += (Math.abs(lead.speed) * dt * Math.PI * 2) / FIGURES[p.kind].stride
  const talking = still && p.talks && (!!p.friend || lead.doing === 'stop') && p.size > 0.9
  p.arm += ((talking ? 1.25 + Math.sin(t * 5 + p.phase) * 0.3 : 0) - p.arm) * ease
  p.look = still
    ? Math.sin(t * 0.9 + p.phase) * 0.7 + (p.lead ? -Math.sign(p.side) * 0.4 : p.friend ? Math.sign(p.friend.side) * 0.4 : 0)
    : Math.sin(t * 0.5 + p.phase) * 0.18
  return p
}

/**
 * A driver, from the car they parked: who they are, with the door nearest the car to go to, and the storylet of their
 * stop already begun. `line` and `loop` are the nearest pavement, which they never walk.
 */
export function newDriver(car: Parked, line: Polyline, loop: Vec[]): Person {
  const { spot } = car
  const p = newPerson(
    (Math.random() * 4294967296) >>> 0,
    spot.kind === 'shop' ? 'worker' : Math.random() < 0.5 ? 'shopper' : 'worker',
    line,
    loop,
    0,
    1.25,
  )
  // Out of the driver's door, on the car's left.
  ;[p.x, p.y, p.size] = [spot.x - Math.sin(spot.heading) * 1.25, spot.y + Math.cos(spot.heading) * 1.25, 0]
  ;[p.tx, p.ty] = [p.x, p.y]
  const doors = allPlaces().filter((d) => d.kind === 'door')
  p.place = doors.sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y))[0]
  if (p.place && Math.hypot(p.place.x - spot.x, p.place.y - spot.y) > 34) p.place = undefined
  const home = spot.kind === 'home'
  ;[p.car, p.doing, p.step, p.base, p.now] = [car, 'go', 'door', null, home ? 'home, getting out of the car' : 'unloading']
  if (home) p.home = 'the house the car is parked at'
  else p.job = 'drives the delivery round'
  p.log.push({
    title: home ? 'Home for a while' : 'The delivery',
    when: 'now',
    lines: [say(home ? 'A pulled in and parked outside the house.' : 'A pulled up with stock for the shop.', p)],
    done: false,
  })
  return p
}

/** A driver's stop: from the car to the door, a while inside, back to the car, and away. */
function errand(p: Person, dt: number) {
  const home = p.car!.spot.kind === 'home'
  const tell = (line: string) => {
    p.log[0].lines.push(say(line, p))
    for (const hear of listeners) hear(p)
  }
  if (p.doing === 'go') {
    if (!p.place || toward(p, p.place.x, p.place.y, dt)) {
      if (p.place) p.heading = p.place.ry - Math.PI / 2
      ;[p.doing, p.timer, p.now] = ['act', home ? 30 + Math.random() * 40 : 9 + Math.random() * 8, home ? 'at home' : 'carrying it in']
      tell(home ? 'A went in.' : 'A carried it in.')
    }
  } else if (p.doing === 'act' && !p.leaving) {
    if ((p.timer -= dt) <= 0) [p.doing, p.heading, p.now] = ['back', p.heading + Math.PI, 'walking back to the car']
  } else if (p.doing === 'back') {
    if (p.size > 0.9 && toward(p, p.tx, p.ty, dt)) {
      ;[p.doing, p.leaving, p.now] = ['act', true, 'driving off']
      tell(home ? 'A came out, started the car and drove off.' : 'A drove off to the next stop.')
      p.log[0].done = true
      file(p)
    }
  } else if (p.leaving && p.size < 0.08) [p.gone, p.car!.leave] = [true, true]
}

/** How far above the pavement a person's feet are: sat down, its hips at a bench's seat. */
export const liftOf = (p: Person) => p.sit * (0.52 - FIGURES[p.kind].hip)

/** A person as a page shows them: who they are, what they are doing, and their log. */
export const describe = (p: Person) => {
  const me = p.lead ?? p
  return {
    id: me.id,
    name: me.name,
    with: me.friend?.name ?? '',
    role: ROLE[me.kind],
    job: me.job,
    home: me.home,
    traits: me.traits.join(', '),
    now: me.now,
    kept: me.kept,
    watched: Math.min(1, me.watched / 5),
    telling: me.story?.of.title ?? '',
    log: me.log.map((entry) => ({ ...entry, lines: [...entry.lines] })),
  }
}
