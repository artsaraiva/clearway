// Builds a City in Node, without drawing it, and records what its Blocks were built with as a scene report (#191).
// Three's geometry needs no WebGL; the canvas the materials draw their textures on is stubbed, so nothing is painted.
import * as THREE from 'three'
import { LAYOUTS, ZONES, type Layout, type Zone } from '../../../src/city/city'
import { Game, type Stage } from '../../../src/game/game'
import { area as blockArea, KERB, type Block as Outline } from '../../../src/render/blocks'
import { createCars } from '../../../src/render/cars'
import { createField } from '../../../src/render/field'
import { createMaterials, type Kit, type Materials } from '../../../src/render/kit'
import { moverModel, moverWidth } from '../../../src/render/movers'
import { createScenery, SEEDED, type Watch } from '../../../src/render/scenery'
import { LOOKS } from '../../../src/render/zones'
import type { Network } from '../../../src/sim/network'
import { cellAt, cellBounds } from '../../../src/sim/tiles'
import { facesOf } from './faces'
import { area, boxOf, hull, turnedBox } from './geometry'
import type { Block, Claim, Hull, Lot, Mover, Pt, Report, Roof, Scene, Thing, Wall } from './report'

// A canvas that paints nothing, for the textures the materials draw (contact shadows, the surface pattern's layers).
const pen = new Proxy(
  {},
  {
    get: (_, key) =>
      key === 'getImageData'
        ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
        : key === 'createRadialGradient' || key === 'createLinearGradient'
          ? () => ({ addColorStop() {} })
          : () => {},
    set: () => true,
  },
)
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => pen }) } })

// Deep enough to reach past the kit's plumbing to the fill that called it (V8 keeps 10 frames unless told).
Object.assign(Error, { stackTraceLimit: 40 })

/**
 * A part rises from what it stands on, as feet do, if its lowest point is within `FOOT` m of it, and the brick stands on
 * the ground: no more than `HUNG` m above the kerb, so a lantern on its cord or a wire on its poles has no feet.
 */
const [FOOT, HUNG] = [0.7, KERB + 1]
/**
 * A part is ground, as paving, paint, a lawn or a field's soil is, if it rises less than `FLAT` m from bottom to top or
 * no more than `STEP` m above what its brick stands on: ground one could step onto.
 */
const [FLAT, STEP] = [0.15, 0.35]
/** The scene check's own functions and the kit's plumbing, which a brick's label skips to find what built it. */
const PLUMBING = new Set([
  'label',
  'made',
  'brick',
  'mover',
  'own',
  'seeded',
  'from',
  'staged',
  'blockZoomProps',
  'furniture',
  'scene',
  'cladded',
])
/**
 * The Zones' buildings and the props one Zone lays, beside their fills in `src/render/zones` since #207 and #210, which
 * label a brick as the kit's methods do. A helper that closes no brick of its own (low-density's `washing`, the outside
 * stairs' `stairs`) has no need to be here.
 * ponytail: a name here is matched in any file, so another function of the same name on a brick's stack would be taken
 * for the builder (`../movers`' `laundry` and `nobori` build models, never on that stack). If that bites, match the file
 * too: these all live in `src/render/zones`.
 */
const BUILDERS = new Set([
  'house',
  'townhouse',
  'apartment',
  'residentialTower',
  'shop',
  'warehouse',
  'barn',
  'officeTower',
  'carpPole',
  'drive',
  'laundry',
  'porch',
  'washingPole',
  'outsideStairs',
  'wallStairs',
  'bikeRack',
  'slide',
  'sandbox',
  'nobori',
  'lantern',
  'containers',
  'crates',
  'blanket',
  'flag',
])

/**
 * What built the brick being closed, read from the stack: the innermost of the kit's methods or the Zones' buildings on
 * it (house, keiTruck, bench) and the first named function outside them (the Zone's or the kerbside's fill), as
 * `method|fill`.
 */
function label(): string {
  let [method, fill] = ['', '']
  for (const line of new Error().stack!.split('\n').slice(1)) {
    const m = /at (?:\S+\.)?([\w$]+)(?: \[as [\w$]+\])? \((.*?):\d+:\d+\)/.exec(line)
    if (!m) continue
    const [, name, file] = m
    if (PLUMBING.has(name) || name === 'anonymous' || name === 'eval' || file.includes('/scripts/visual/scene/')) continue
    if (file.endsWith('/render/kit.ts') || BUILDERS.has(name)) method ||= name
    else {
      fill = name
      break
    }
  }
  return `${method}|${fill}`
}

/** The tile of a point, as `x,y`. */
const tileOf = (p: Pt) => {
  const c = cellAt(p)
  return `${c.x},${c.y}`
}

/** A drop of the City: Layout, quarter turns, x, y. */
export type Drop = [Layout['id'], number, number, number]

/** What to build: the 26-Tile City of `city`, all of `zone` (none: unzoned), at `stage`, its Blocks filled from `seed`. */
export interface Ask {
  city: Drop[]
  zone?: Zone['id']
  stage: Stage
  seed: number
}

/** The game's run of the City, its Tiles placed in order, all of one Zone at one Stage: the same for every seed. */
function placeCity({ city, zone, stage }: Ask): Game {
  const z = zone ? ZONES.find((o) => o.id === zone) : undefined
  const game = new Game(3, { free: true }) // after the Crossroads, the drops of `city` follow a seed-3 run
  game.rezone({ x: 0, y: 0 }, z)
  for (const [id, r, x, y] of city) {
    const offer = game.place(
      LAYOUTS.find((l) => l.id === id)!,
      r,
      { x, y },
      z,
    )
    if (!offer.legal) throw new Error(`refused ${id} at ${x},${y}`)
  }
  for (const t of game.city.tiles) game.setStage(t.cell, stage)
  return game
}

/**
 * The materials an older ref's kit names otherwise, by that name, and this tree's name for each, so that `--against`
 * reads the ref's meshes as this tree's: the Block-zoom props' material was `close` before #202.
 * ponytail: only a ref from before #202 needs it; drop the entry once no comparison reaches back that far.
 */
const RENAMED: Record<string, string> = { close: 'blockZoom' }

/** The name of a material of `materials`, for the hash and the layers, as this tree's kit names it. */
function materialName(materials: Materials, m: THREE.Material): string {
  for (const [name, value] of Object.entries(materials)) if (value === m) return RENAMED[name] ?? name
  return m.type
}

/** The material this tree's kit names `name`, from a ref's kit that may name it otherwise. */
function materialNamed(materials: Materials, name: string): THREE.Material {
  for (const [n, value] of Object.entries(materials)) if ((RENAMED[n] ?? n) === name) return value as THREE.Material
  throw new Error(`the kit has no material ${name}`)
}

/** A running hash of words (two lanes of FNV-1a over 32-bit words), as 16 hex digits: no node types in this project. */
function hasher() {
  let [a, b] = [0x811c9dc5, 0x01000193 ^ 0x5bd1e995]
  const words = (w: Uint32Array) => {
    for (let i = 0; i < w.length; i++) {
      a = Math.imul(a ^ w[i], 0x01000193)
      b = Math.imul(b ^ w[i], 0x5bd1e995) ^ (b >>> 15)
    }
  }
  return {
    bytes(array: ArrayBufferView) {
      const n = array.byteLength >> 2
      words(new Uint32Array(array.buffer, array.byteOffset, n))
      for (let i = n << 2; i < array.byteLength; i++) words(Uint32Array.of(new Uint8Array(array.buffer, array.byteOffset)[i]))
    },
    text: (t: string) => words(Uint32Array.from(t, (c) => c.charCodeAt(0))),
    hex: () => (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0'),
  }
}

/** A hash of meshes: their materials, positions, colours and patterns, in order. */
function hashOf(meshes: THREE.Mesh[], materials: Materials): string {
  const h = hasher()
  for (const mesh of meshes) {
    h.text(materialName(materials, mesh.material as THREE.Material))
    const g = mesh.geometry
    for (const name of Object.keys(g.attributes).sort()) {
      if (name === 'normal' || name === 'brick') continue
      h.text(name)
      h.bytes((g.attributes[name] as THREE.BufferAttribute).array)
    }
    if (g.index) h.bytes(g.index.array)
  }
  return h.hex()
}

/** Whether the scene check's hooks exist in the tree being built: an older ref's scenery calls no `watch`. */
let hooked = false

/** Build the City `ask` names and report what stands on it. */
export function buildReport(ask: Ask): Report {
  const game = placeCity(ask)
  hooked = false
  const start = performance.now()
  const materials = createMaterials({ pattern: true, pools: true })
  materials.setZoom(1) // City zoom
  const blockZoomHidden = !materialNamed(materials, 'blockZoom').visible
  const field = createField()
  const blocks: Block[] = []
  const things: Thing[] = []
  const claims: Claim[] = []
  const scenes: Scene[] = []
  const lots = new Map<string, Lot & { pts: Pt[] }>()
  const movers: Mover[] = []
  const walls: Wall[] = []
  const roofs: Roof[] = []
  const pools: Report['pools'] = []
  const moving: Record<string, number> = {}
  const painted = new Map<number, number>() // triangles by linear colour, 12 bits a channel

  const watch: Watch = {
    label,
    took(built, outline: Outline | null) {
      hooked = true
      const index = outline ? blocks.length : -1
      if (outline) {
        const tile = tileOf({ x: (outline.x0 + outline.x1) / 2, y: (outline.y0 + outline.y1) / 2 })
        const cell = tile.split(',').map(Number)
        const zone = game.city.tileAt({ x: cell[0], y: cell[1] })?.zone
        blocks.push({
          tile,
          zone: zone?.id,
          finished: !!(zone && LOOKS[zone.id].finish),
          stage: game.stageOf({ x: cell[0], y: cell[1] })?.stage ?? 1,
          loop: outline.loop.map(({ x, y }) => ({ x, y })),
          area: blockArea(outline.loop),
        })
      }
      record(built, index)
    },
  }

  /** Take what one kit built into the report, its bricks standing on Block `block` (-1: the slab's, the poles'). */
  function record(built: ReturnType<Kit['done']>, block: number) {
    const first = things.length
    const scenesFrom = scenes.length
    for (const s of built.scenes ?? []) scenes.push({ kind: s.kind, tile: '', block, things: [] })
    const named = built.parts.map((p) => ({ geo: p.geometry, material: materialName(materials, p.material), brick: p.brick }))
    const parts = built.bricks.map(() => [] as typeof named)
    for (const p of named) parts[p.brick].push(p)
    built.bricks.forEach((b, i) => {
      const [method, fill] = (b.what ?? '|').split('|')
      const base = b.at.y
      const at = { x: b.at.x, y: -b.at.z }
      const feet: Hull[] = []
      const rising: Pt[] = []
      const all: Pt[] = []
      let [top, low, tris, bulbs, bulbLow, blockZoom, open] = [-Infinity, Infinity, 0, 0, Infinity, 0, 0]
      for (const { geo, material } of parts[i]) {
        const pos = geo.attributes.position
        tris += (geo.index ? geo.index.count : pos.count) / 3
        if (material === 'roundShadow' || material === 'squareShadow') continue
        if (material === 'blockZoom') blockZoom++
        else open++
        let [y0, y1] = [Infinity, -Infinity]
        const pts: Pt[] = []
        const seen = new Set<number>()
        for (let k = 0; k < pos.count; k++) {
          const y = pos.getY(k)
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          const [px, py] = [pos.getX(k), -pos.getZ(k)]
          const key = Math.round((px + 5000) * 1000) * 1e7 + Math.round((py + 5000) * 1000) // mm, as one number
          if (seen.has(key)) continue
          seen.add(key)
          pts.push({ x: px, y: py })
        }
        ;[top, low] = [Math.max(top, y1), Math.min(low, y0)]
        all.push(...pts)
        if (y1 - y0 >= FLAT && y1 > base + STEP) {
          rising.push(...pts)
          if (y0 < base + FOOT && base <= HUNG) feet.push(hull(pts))
        }
        if (material === 'bulb') {
          const glow = geo.attributes.glow
          if (!glow || glow.getX(0) > 0) {
            bulbs++
            bulbLow = Math.min(bulbLow, y0 - base)
          }
        }
        if ((material === 'solid' || material === 'blockZoom') && geo.attributes.color) {
          const c = geo.attributes.color
          for (let k = 0; k < c.count; k += 3) {
            const key = (Math.round(c.getX(k) * 4095) * 4096 + Math.round(c.getY(k) * 4095)) * 4096 + Math.round(c.getZ(k) * 4095)
            painted.set(key, (painted.get(key) ?? 0) + 1)
          }
        }
      }
      const outline = rising.length >= 3 ? hull(rising) : []
      const thing: Thing = {
        id: things.length,
        tile: tileOf(at),
        block,
        kind: b.kind,
        what: method || fill || 'unknown',
        fill: fill || 'unknown',
        lot: b.lot,
        scene: b.scene !== undefined && b.scene >= 0 ? scenesFrom + b.scene : -1,
        layer: blockZoom && !open ? 'blockZoom' : 'solid',
        base,
        top: top === -Infinity ? base : top,
        low: low === Infinity ? base : low,
        feet,
        box: boxOf(feet.length ? feet.flat() : all.length ? all : [at]),
        area: outline.length >= 3 ? area(outline) : 0,
        flat: !rising.length && all.length > 0,
        tris,
        bulbs,
        bulbLow,
        pools: 0,
      }
      things.push(thing)
      if (thing.scene >= 0) {
        scenes[thing.scene].things.push(thing.id)
        scenes[thing.scene].tile ||= thing.tile
      }
      if (block >= 0 && b.lot >= 0) {
        const key = `${block}:${b.lot}`
        const lot = lots.get(key) ?? lots.set(key, { tile: thing.tile, block, index: b.lot, box: thing.box, pts: [] }).get(key)!
        if (!thing.flat && b.kind !== 'mover') lot.pts.push(...(feet.length ? feet.flat() : []))
      }
    })
    // The buildings' walls and roofs (rules 1 and 2), each on its building's thing.
    const faces = facesOf(named, built.bricks)
    const on = (brick: number) => ({ tile: things[first + brick].tile, block, thing: first + brick })
    for (const { brick, ...face } of faces.walls) walls.push({ ...on(brick), ...face })
    for (const { brick, ...face } of faces.roofs) roofs.push({ ...on(brick), ...face })
    for (const p of built.pools) {
      if (things[first + p.brick]) things[first + p.brick].pools++
      pools.push({ x: p.at.x, y: -p.at.z, r: Math.max(p.w, p.d) / 2 })
    }
    for (const c of built.claims ?? []) {
      const t = things[first + c.brick] ?? things[things.length - 1]
      claims.push({ kind: c.kind, tile: t.tile, block, hull: turnedBox(c.x, c.y, c.w, c.d, c.ry), thing: t.id })
    }
    for (const f of built.forms ?? []) {
      const key = `${block}:${f.lot}`
      const ground = f.ground && turnedBox(f.ground.x, f.ground.y, f.ground.w, f.ground.d, f.ground.ry)
      const lot =
        lots.get(key) ??
        lots.set(key, { tile: blocks[block]?.tile ?? '', block, index: f.lot, box: boxOf(ground ?? []), pts: [] }).get(key)!
      Object.assign(lot, { form: f.form, ground })
    }
    for (const m of built.movers) {
      const t = things[first + m.brick]
      const path = m.face ? [{ x: m.face.x, y: m.face.y }] : m.loop.pts.map(({ x, y }) => ({ x, y }))
      movers.push({ kind: m.kind, tile: t.tile, block, path, wide: moverWidth(m.kind), away: m.away !== undefined, thing: t.id })
      moving[t.tile] = (moving[t.tile] ?? 0) + 1
    }
    for (const o of [...built.sways, ...built.flags, ...built.plumes]) {
      const tile = tileOf({ x: o.at.x, y: -o.at.z })
      moving[tile] = (moving[tile] ?? 0) + 1
    }
  }

  const scenery = createScenery(
    { theme: 'city', seed: ask.seed, landmarks: [], blocks: [], streets: {}, avenues: [], seeded: SEEDED },
    field,
    materials,
    (cell) => game.city.tileAt(cell)?.zone,
    (cell) => game.stageOf(cell)?.stage ?? 1,
    watch,
  )
  const builds = game.city.tiles.map((t) => scenery.lay(game.sim, [cellBounds(t.cell)]))
  const meshes = builds.flatMap((b) => b.meshes)
  const ms = performance.now() - start
  for (const b of blocks) b.kerb = kerbOf(b.loop, game.sim.net)
  const colours: Record<string, number> = {}
  const colour = new THREE.Color()
  for (const [key, n] of painted) {
    const hex = colour
      .setRGB(Math.floor(key / 4096 ** 2) / 4095, (Math.floor(key / 4096) % 4096) / 4095, (key % 4096) / 4095, THREE.LinearSRGBColorSpace)
      .getHexString()
    colours[hex] = (colours[hex] ?? 0) + n
  }

  return {
    zone: ask.zone ?? 'unzoned',
    stage: ask.stage,
    seed: ask.seed,
    blocks,
    things,
    claims,
    scenes,
    lots: [...lots.values()].map(({ pts, ...lot }) => ({ ...lot, box: pts.length ? boxOf(pts) : lot.box })),
    movers,
    walls,
    roofs,
    pools,
    moving,
    colours,
    vehicles: hooked ? vehicles(game.sim.net) : [],
    blockZoomHidden,
    triangles: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0),
    meshes: meshes.length,
    hash: hashOf(meshes, materials),
    ms,
  }
}

/** m from a lane's middle within which a Block's edge faces its Road: half a lane, and a little. */
const KERBSIDE = 6

/** Where a Block's edge faces a Road: runs of points a metre apart along its outline, each within `KERBSIDE` of a lane. */
function kerbOf(loop: Pt[], net: Network): Pt[][] {
  // The lanes' segments, by the 10 m squares they come near.
  const grid = new Map<string, [Pt, Pt][]>()
  const cell = (x: number, y: number) => `${Math.floor(x / 10)},${Math.floor(y / 10)}`
  for (const lane of net.lanes)
    for (let i = 0; i + 1 < lane.line.pts.length; i++) {
      const [a, b] = [lane.line.pts[i], lane.line.pts[i + 1]]
      for (let x = Math.floor((Math.min(a.x, b.x) - KERBSIDE) / 10); x <= Math.floor((Math.max(a.x, b.x) + KERBSIDE) / 10); x++)
        for (let y = Math.floor((Math.min(a.y, b.y) - KERBSIDE) / 10); y <= Math.floor((Math.max(a.y, b.y) + KERBSIDE) / 10); y++)
          (grid.get(`${x},${y}`) ?? grid.set(`${x},${y}`, []).get(`${x},${y}`)!).push([a, b])
    }
  const near = (p: Pt) =>
    (grid.get(cell(p.x, p.y)) ?? []).some(([a, b]) => {
      const [dx, dy] = [b.x - a.x, b.y - a.y]
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < KERBSIDE
    })
  const pts: Pt[] = []
  loop.forEach((a, i) => {
    const b = loop[(i + 1) % loop.length]
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)))
    for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  })
  // Runs of road-facing points, the last joined to the first where the run goes round the start of the loop.
  const runs: Pt[][] = []
  let run: Pt[] = []
  for (const p of pts) {
    if (near(p)) run.push(p)
    else if (run.length) runs.push(run.splice(0))
  }
  if (run.length) {
    if (runs.length && near(pts[0])) runs[0] = [...run, ...runs[0]]
    else runs.push(run)
  }
  return runs
}

/** The vehicles' models and how high each one's lowest point stands: the cars' skins and the movers that drive. */
function vehicles(net: Network) {
  const out = createCars(net).meshes.flatMap((m) => {
    if (!m.name.startsWith('car ')) return []
    m.geometry.computeBoundingBox()
    return [{ name: m.name, low: m.geometry.boundingBox!.min.y }]
  })
  for (const kind of ['tractor', 'truck', 'forklift', 'foodtruck', 'scooter'] as const) {
    const g = moverModel(kind)
    g.computeBoundingBox()
    out.push({ name: `mover ${kind}`, low: g.boundingBox!.min.y })
  }
  return out
}
