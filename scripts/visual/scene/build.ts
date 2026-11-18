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
import { area, boxOf, hull, turnedBox } from './geometry'
import type { Block, Claim, Hull, Lot, Mover, Pt, Report, Scene, Thing } from './report'

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
/** A part lies flat, as paving or paint does, if it is less than this many m from top to bottom. */
const FLAT = 0.15
/** The scene check's own functions and the kit's plumbing, which a brick's label skips to find what built it. */
const PLUMBING = new Set(['label', 'made', 'brick', 'mover', 'own', 'from', 'staged', 'closeOnly', 'furniture', 'scene', 'cladded'])

/**
 * What built the brick being closed, read from the stack: the innermost of the kit's methods on it (house, keiTruck,
 * bench) and the first named function outside the kit (the Zone's or the kerbside's fill), as `method|fill`.
 */
function label(): string {
  let [method, fill] = ['', '']
  for (const line of new Error().stack!.split('\n').slice(1)) {
    const m = /at (?:\S+\.)?([\w$]+) \((.*?):\d+:\d+\)/.exec(line)
    if (!m) continue
    const [, name, file] = m
    if (PLUMBING.has(name) || name === 'anonymous' || name === 'eval' || file.includes('/scripts/visual/scene/')) continue
    if (file.endsWith('/render/kit.ts')) method ||= name
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

/** The name of a material of `materials`, for the hash and the layers. */
function materialName(materials: Materials, m: THREE.Material): string {
  for (const [name, value] of Object.entries(materials)) if (value === m) return name
  return m.type
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
  const field = createField()
  const blocks: Block[] = []
  const things: Thing[] = []
  const claims: Claim[] = []
  const scenes: Scene[] = []
  const lots = new Map<string, Lot & { pts: Pt[] }>()
  const movers: Mover[] = []
  const moving: Record<string, number> = {}
  const colours: Record<string, number> = {}
  const colour = new THREE.Color()

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
    const parts = built.bricks.map(() => [] as { geo: THREE.BufferGeometry; material: string }[])
    for (const p of built.parts) parts[p.brick].push({ geo: p.geometry, material: materialName(materials, p.material) })
    built.bricks.forEach((b, i) => {
      const [method, fill] = (b.what ?? '|').split('|')
      const base = b.at.y
      const at = { x: b.at.x, y: -b.at.z }
      const feet: Hull[] = []
      const rising: Pt[] = []
      const all: Pt[] = []
      let [top, low, tris, bulbs, bulbLow, close, open] = [-Infinity, Infinity, 0, 0, Infinity, 0, 0]
      for (const { geo, material } of parts[i]) {
        const pos = geo.attributes.position
        tris += (geo.index ? geo.index.count : pos.count) / 3
        if (material === 'roundShadow' || material === 'squareShadow') continue
        if (material === 'close') close++
        else open++
        let [y0, y1] = [Infinity, -Infinity]
        const pts: Pt[] = []
        const seen = new Set<string>()
        for (let k = 0; k < pos.count; k++) {
          const y = pos.getY(k)
          ;[y0, y1] = [Math.min(y0, y), Math.max(y1, y)]
          const [px, py] = [pos.getX(k), -pos.getZ(k)]
          const key = `${px.toFixed(3)},${py.toFixed(3)}`
          if (seen.has(key)) continue
          seen.add(key)
          pts.push({ x: px, y: py })
        }
        ;[top, low] = [Math.max(top, y1), Math.min(low, y0)]
        all.push(...pts)
        if (y1 - y0 >= FLAT) {
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
        if ((material === 'solid' || material === 'close') && geo.attributes.color) {
          const c = geo.attributes.color
          for (let k = 0; k < c.count; k += 3) {
            const hex = colour.setRGB(c.getX(k), c.getY(k), c.getZ(k), THREE.LinearSRGBColorSpace).getHexString()
            colours[hex] = (colours[hex] ?? 0) + 1
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
        layer: close && !open ? 'close' : 'solid',
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
    for (const p of built.pools) things[first + p.brick].pools++
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
    moving,
    colours,
    vehicles: hooked ? vehicles(game.sim.net) : [],
    triangles: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0),
    meshes: meshes.length,
    hash: hashOf(meshes, materials),
    ms,
  }
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

/** Whether the tree built has the scene check's hooks; false for an older ref's, whose report holds meshes and no more. */
export const hasHooks = () => hooked
