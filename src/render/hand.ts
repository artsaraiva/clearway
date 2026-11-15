import * as THREE from 'three'
import { DIRECTIONS, hasRoad, type Cell, type Layout } from '../city/city'
import { middle } from '../sim/geometry'
import { CELL, cellBounds } from '../sim/tiles'
import { canvasTexture } from './shapes'

const ROAD_WIDTH = 28 // m: two lanes each way
const ISLAND = 15 // m: the radius of a Roundabout's island
const HOVER = 0.3 // m the Tile in the hand sits above the road plane: level with the City, clear of the Road ends it covers
const SWAP_LIFT = 46 // m it floats above a placed Tile it would swap, clear of most of what stands there
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

/** The Tile the player is dragging from the bar, as the page wants it shown. */
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
  /** What to say over it: the Price or a cross, then a line beneath. */
  lines: [string, string]
  /** Every empty cell where it could be dropped as it is turned. */
  open: Cell[]
}

/** Two lines of text that always face the camera, drawn over everything. */
function caption([first, second]: [string, string], color: string) {
  const texture = canvasTexture(512, 256, (g) => {
    g.textAlign = 'center'
    g.lineJoin = 'round'
    g.lineWidth = 14
    g.strokeStyle = 'rgba(255,255,255,0.95)'
    g.fillStyle = color
    for (const [text, font, y] of [
      [first, '800 92px', 120],
      [second, '600 54px', 205],
    ] as const) {
      g.font = `${font} -apple-system, "Helvetica Neue", sans-serif`
      g.strokeText(text, 256, y)
      g.fillText(text, 256, y)
    }
  })
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }))
  sprite.scale.set(60, 30, 1)
  sprite.renderOrder = 20
  return sprite
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
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
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

/**
 * The Tile in the hand while the player drags a Layout from the bar: a piece of unbuilt slab seated at the City's
 * level in the cell under the pointer, with the Price over it, tinted grey when the player cannot afford it and red,
 * with the reason, when the drop is refused. Over a placed Tile it floats above what stands there, since the drop is a
 * Swap. Every empty cell that would take it is tinted green.
 */
export function createHand() {
  const group = new THREE.Group()
  let tile: THREE.Group | null = null
  const target = new THREE.Vector3()
  let last = performance.now()

  const clear = () => {
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
    tile = null
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
      const text = caption(lines, COLORS[state])
      text.position.y = 16
      tile.add(text)
      group.add(tile)
    },

    /** Glide toward the cell under the pointer. It runs on the real clock, since the player places Tiles while paused too. */
    update() {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      tile?.position.lerp(target, 1 - Math.exp(-FOLLOW * dt))
    },
  }
}
