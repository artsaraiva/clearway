import * as THREE from 'three'
import { DIRECTIONS, hasRoad, type Cell, type Layout } from '../city/city'
import { middle } from '../sim/geometry'
import type { Sim } from '../sim/sim'
import { CELL, cellBounds } from '../sim/tiles'
import { LOW_POLY } from './look'
import { canvasTexture } from './shapes'

const ROAD_WIDTH = 28 // m: two lanes each way
const ISLAND = 15 // m: the radius of a Roundabout's island
const HOVER = 0.3 // m the Tile in the hand sits above the road plane: level with the City, clear of the Road ends it covers
export const SWAP_LIFT = 46 // m it floats above a placed Tile it would swap, clear of most of what stands there
const FOLLOW = 14 // per second: how fast it glides to the cell under the pointer
const MARK = { inset: 2, height: 0.3, open: 0.14, under: 0.35 } // m, m, and the opacity of an open cell and of the cell under a Swap
// A refusal takes the hot red-orange reserved for Jams and refusals.
const COLORS = { legal: '#1f9d63', unaffordable: '#7b818c', refused: '#ff4a1f' }
// How far a Tile that cannot be dropped takes its state's colour, and how strongly that colour glows from within, so
// that it keeps its colour at dusk and at night.
const TINT = { mix: 0.6, glow: 0.4 }
// The slab's layers, as src/render/slab.ts lays them: top (m, road surface = 0), thickness and colour.
const LAYERS: [number, number, string][] = [
  [-10, 8.8, '#d2a069'],
  [-2.8, 7.2, '#e3bf8c'],
  [-0.6, 2.2, '#9ed67d'],
]
const [RIM, PLATE, PAVEMENT, GRASS] = [4, '#c3c7ce', '#ece7db', '#9ed67d']
// The caption over the Tile in the hand, a taped paper note as the screen's are (src/ui/kit.css): its texture (px), which
// its widest line fills to `fit` across at most, the note's margin around its lines (px), and the width it is drawn
// across (m). Per line, its typeface, weight, size (px) and baseline (px from the top): the Price or a cross in the
// UI's type, the lines beneath in its handwriting.
const CAPTION = { width: 512, height: 352, fit: 440, pad: 28, scale: 60 }
const LINES = [
  ['Zen Maru Gothic', 900, 92, 120],
  ['Klee One', 600, 50, 200],
  ['Klee One', 600, 44, 262],
] as const
// The caption's ink, per state, by the kit's token: its ink, its quieter ink, and stamp red for a refusal; the lines
// beneath take its quiet ink. The Tile's own tint above is the world's, which keeps its green, grey and red-orange.
const INK = { legal: 'ink', unaffordable: 'quieter', refused: 'stamp', quiet: 'quiet' } as const
// CSS px: the smallest any of its lines is drawn on screen. Zoomed out, the caption stops shrinking with the board there.
const LEAST = 13
const PAPER = { shadow: 'rgba(60,40,20,0.3)', tape: 'rgba(160,212,200,0.86)' }

/** The kit's colours the caption is drawn in, by token, read from the page's custom properties the first time it is. */
let kit: Record<(typeof INK)[keyof typeof INK] | 'paper', string> | undefined
function kitColours() {
  if (!kit) {
    const style = getComputedStyle(document.documentElement)
    const token = (name: string) => style.getPropertyValue(`--${name}`).trim()
    kit = { ink: token('ink'), quieter: token('quieter'), stamp: token('stamp'), quiet: token('quiet'), paper: token('paper') }
  }
  return kit
}

/** The Tile in the player's hand, as the page wants it shown. */
export interface Held {
  layout: Layout
  /** Quarter turns counterclockwise. */
  rotation: number
  /** The cell under the pointer, if it is over the board. */
  cell: Cell | null
  /** Whether dropping it here would go ahead, is legal but costs more yen than the player has, or is refused. */
  state: keyof typeof COLORS
  /** Whether the cell holds a Tile, so that the drop is a Swap. */
  swap: boolean
  /** What to say over it: the Price or a cross, then a line or two beneath. */
  lines: string[]
  /** Every empty cell where it could be dropped as it is turned. */
  open: Cell[]
  /** A Sim of the City the drop would make, when it is legal: the Gateway labels preview its Demand. */
  after: Sim | null
}

/** A Zone dragged over a placed Tile, as the page wants it shown. */
export interface Rezoning {
  /** The placed Tile's cell. */
  cell: Cell
  /** Whether letting go rezones the Tile, or changes nothing since the Tile is built as that Zone already. */
  state: 'legal' | 'unchanged'
  /** What to say over it: what the Tile will become. */
  lines: string[]
}

/**
 * Up to three lines on a taped paper note that always faces the camera, drawn over everything: a large one in the ink
 * of `state`, then smaller handwritten ones in quiet ink, or all in that ink when `loud`, as a refusal's reason is.
 */
function caption(lines: string[], state: keyof typeof COLORS, loud = false) {
  const colours = kitColours()
  const ink = colours[INK[state]]
  const sprite = new THREE.Sprite()
  const texture = canvasTexture(CAPTION.width, CAPTION.height, (g) => {
    g.textAlign = 'center'
    // Each line's font, set smaller to fit when it is long, such as a refusal's reason.
    const fonts = lines.map((text, i) => {
      const [face, weight, size] = LINES[i]
      const font = (px: number) => `${weight} ${px}px "${face}", "Zen Maru Gothic", -apple-system, "Helvetica Neue", sans-serif`
      g.font = font(size)
      const px = Math.floor(size * Math.min(1, CAPTION.fit / g.measureText(text).width))
      g.font = font(px)
      return { font: font(px), width: g.measureText(text).width, px }
    })
    sprite.userData.least = Math.min(...fonts.map((f) => f.px))
    if (!lines.length) return
    // The note: as wide as its widest line, from the top of the first line to the foot of the last.
    const last = LINES[lines.length - 1]
    const w = Math.max(...fonts.map((f) => f.width)) + 2 * CAPTION.pad
    const [top, bottom] = [LINES[0][3] - 0.8 * fonts[0].px - CAPTION.pad, last[3] + 0.25 * fonts[lines.length - 1].px + CAPTION.pad]
    g.save()
    g.shadowColor = PAPER.shadow
    g.shadowBlur = 14
    g.shadowOffsetY = 5
    g.fillStyle = colours.paper
    g.beginPath()
    g.roundRect((CAPTION.width - w) / 2, top, w, bottom - top, 10)
    g.fill()
    g.restore()
    // A strip of mint tape across its top edge, a little off level.
    g.save()
    g.translate(CAPTION.width / 2, top)
    g.rotate(-0.05)
    g.fillStyle = PAPER.tape
    g.fillRect(-48, -15, 96, 30)
    g.restore()
    lines.forEach((text, i) => {
      g.font = fonts[i].font
      g.fillStyle = i === 0 || loud ? ink : colours[INK.quiet]
      g.fillText(text, CAPTION.width / 2, LINES[i][3])
    })
  })
  sprite.material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false })
  fit(sprite, 0)
  // Anchored a little above its middle, where the first two lines sit, so that a third line hangs below them.
  sprite.center.set(0.5, 1 - 128 / CAPTION.height)
  sprite.renderOrder = 20
  return sprite
}

/**
 * Size a caption: `CAPTION.scale` m across, or wider when the camera is so far out, at `perPixel` m to a CSS pixel, that
 * its smallest line would be drawn under `LEAST` px.
 */
function fit(sprite: THREE.Sprite, perPixel: number) {
  const least = sprite.userData.least as number | undefined
  const w = least ? Math.max(CAPTION.scale, (perPixel * LEAST * CAPTION.width) / least) : CAPTION.scale
  if (w !== sprite.scale.x) sprite.scale.set(w, (w * CAPTION.height) / CAPTION.width, 1)
}

/** A cell tinted on the road plane, drawn over the slab. */
function mark(cell: Cell, color: string, opacity: number) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(CELL - 2 * MARK.inset, CELL - 2 * MARK.inset).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false }),
  )
  const { x, y } = middle(cellBounds(cell))
  mesh.position.set(x, MARK.height, -y)
  mesh.renderOrder = 10
  return mesh
}

/**
 * A Tile as a piece of slab not built on yet: soil, sand and grass under a road plate, the pavement of its Blocks and
 * its centre lines. Built around the origin, its road surface at height 0. `tint` colours a Tile that cannot be dropped.
 */
function tileModel(layout: Layout, rotation: number, tint: string | null) {
  const group = new THREE.Group()
  const look = (color: string) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: LOW_POLY })
    if (tint) {
      material.color.lerp(new THREE.Color(tint), TINT.mix)
      material.emissive.set(tint)
      material.emissiveIntensity = TINT.glow
    }
    return material
  }
  const add = (geometry: THREE.BufferGeometry, color: string, x: number, top: number, y: number, h: number) => {
    const mesh = new THREE.Mesh(geometry, look(color))
    mesh.position.set(x, top - h / 2, -y)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
  }
  const box = (w: number, h: number, d: number, x: number, top: number, y: number, color: string) =>
    add(new THREE.BoxGeometry(w, h, d), color, x, top, y, h)

  for (const [top, h, color] of LAYERS) box(CELL + 2 * RIM, h, CELL + 2 * RIM, 0, top, 0, color)
  box(CELL, 0.6, CELL, 0, 0, 0, PLATE)
  const side = (CELL - ROAD_WIDTH) / 2
  const off = (CELL + ROAD_WIDTH) / 4
  // Pavement wherever no Road runs: the four corners, and the middle of each side without a Road.
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) box(side - 3, 0.5, side - 3, sx * off, 0.5, sy * off, PAVEMENT) // prettier-ignore
  for (const d of DIRECTIONS) {
    const [dx, dy] = [Math.round(Math.cos((d * Math.PI) / 2)), Math.round(Math.sin((d * Math.PI) / 2))]
    if (!hasRoad({ layout, rotation }, d))
      box(dx ? side - 3 : ROAD_WIDTH + 3, 0.5, dy ? side - 3 : ROAD_WIDTH + 3, dx * off, 0.5, dy * off, PAVEMENT)
    // A dashed centre line out to the edge.
    else for (let t = 20; t < CELL / 2 - 2; t += 9) box(dx ? 5 : 0.7, 0.1, dy ? 5 : 0.7, dx * t, 0.1, dy * t, '#ffffff')
  }
  if (layout.id === 'roundabout') add(new THREE.CylinderGeometry(ISLAND, ISLAND, 1, 32), GRASS, 0, 1, 0, 1)
  return group
}

/** Take everything out of `group`, and free it. */
function empty(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child)
    child.traverse((o) => {
      if (!(o instanceof THREE.Mesh || o instanceof THREE.Sprite)) return
      o.geometry.dispose()
      const material = o.material as THREE.Material & { map?: THREE.Texture | null }
      material.map?.dispose()
      material.dispose()
    })
  }
}

/**
 * The Tile in the hand while the player holds a Layout from the bar: a piece of unbuilt slab seated at the City's
 * level in the cell under the pointer, with the Price over it on a paper note, tinted grey when the player cannot
 * afford it and red, with the reason stamped in red on the note, when the drop is refused. Over a placed Tile it floats above what stands there, since the drop is a
 * Swap. Every empty cell that would take it is tinted green.
 */
export function createHand() {
  const group = new THREE.Group()
  let tile: THREE.Group | null = null
  let text: THREE.Sprite | null = null
  const target = new THREE.Vector3()
  let last = performance.now()

  const clear = () => {
    empty(group)
    tile = text = null
  }

  return {
    group,

    /** Show the Tile in the hand as `held` says. `null` empties the hand. */
    show(held: Held | null) {
      const from = tile?.position.clone()
      clear()
      if (!held) return
      const { layout, rotation, cell, state, swap, lines, open } = held
      for (const c of open) if (c.x !== cell?.x || c.y !== cell.y) group.add(mark(c, COLORS.legal, MARK.open))
      if (!cell) return
      if (swap) group.add(mark(cell, COLORS[state], MARK.under))
      tile = tileModel(layout, rotation, state === 'legal' ? null : COLORS[state])
      const { x, y } = middle(cellBounds(cell))
      target.set(x, swap ? SWAP_LIFT : HOVER, -y)
      tile.position.copy(from ?? target)
      text = caption(lines, state, state === 'refused')
      text.position.y = 16
      tile.add(text)
      group.add(tile)
    },

    /**
     * Glide toward the cell under the pointer, with the caption sized for the camera, at `perPixel` m to a CSS pixel. It
     * runs on the real clock, since the player places Tiles while paused too.
     */
    update(perPixel: number) {
      if (text) fit(text, perPixel)
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      tile?.position.lerp(target, 1 - Math.exp(-FOLLOW * dt))
    },
  }
}

/**
 * A Zone dragged from the bar over a placed Tile: the Tile tinted on the road plane, and what letting go makes of it
 * said where a Swap's caption would be. Green, with the caption in ink, when it rezones the Tile, and the grey of a drop
 * the player cannot afford, with the caption in quieter ink, when the Tile is built as that Zone already, so letting go
 * changes nothing.
 */
export function createRezoning() {
  const group = new THREE.Group()
  let text: THREE.Sprite | null = null
  return {
    group,

    /** Show `rezoning`. `null` shows nothing. */
    show(rezoning: Rezoning | null) {
      empty(group)
      text = null
      if (!rezoning) return
      const legal = rezoning.state === 'legal'
      group.add(mark(rezoning.cell, legal ? COLORS.legal : COLORS.unaffordable, MARK.under))
      text = caption(rezoning.lines, legal ? 'legal' : 'unaffordable')
      const { x, y } = middle(cellBounds(rezoning.cell))
      text.position.set(x, SWAP_LIFT + 16, -y)
      group.add(text)
    },

    /** Size the caption for the camera, at `perPixel` m to a CSS pixel. */
    update(perPixel: number) {
      if (text) fit(text, perPixel)
    },
  }
}
