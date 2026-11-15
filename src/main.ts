import { City, LAYOUTS, type Layout, type Tile } from './city/city'
import { extent } from './sim/geometry'
import { createView } from './render/view'
import { DT, Sim } from './sim/sim'
import { cellBounds } from './sim/tiles'
import { createUI } from './ui/ui'

// ms of each frame spent on a Rebuild's Pre-warm while its pieces of slab assemble: small enough to leave a 120 Hz frame
// room to draw.
// ponytail: that covers a Pre-warm of about 1.5 s on the main thread within the 7 s build at 60 frames a second; a
// longer one keeps the cars off a finished slab until it is done. Move the Pre-warm to a worker with the sim (the
// road-network spec's gate) if a City's Pre-warm gets that slow.
const PREWARM_BUDGET = 4

// ponytail: a fixed small City with one seed, so the page loads and a Rebuild can be played, until the game page (#88)
// brings the bar of Layouts, the run's seed and the board that grows. The first `PLACED` Tiles are there at load; in
// dev, `N` places the next one.
const SEED = 86
const PLACED = 4
const tile = (id: Layout['id'], rotation: number, x: number, y: number): Tile => ({
  cell: { x, y },
  layout: LAYOUTS.find((l) => l.id === id)!,
  rotation,
})
const TILES = [
  tile('crossroads', 0, 0, 0),
  tile('straight', 0, 1, 0),
  tile('tee', 2, 0, 1),
  tile('roundabout', 0, -1, 0),
  tile('curve', 1, 1, 1),
  tile('curve', 0, 0, -1),
]

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const params = new URLSearchParams(location.search)
const city = new City([TILES[0]])
const place = ({ layout, rotation, cell }: Tile) => {
  const verdict = city.place(layout, rotation, cell)
  if (!verdict.legal) throw new Error(`Tile ${layout.name} at ${cell.x},${cell.y}: ${verdict.reason}`)
}
TILES.slice(1, PLACED).forEach(place)
let sim = new Sim(city, [], SEED)
const view = createView(canvas, sim, {
  pieces: city.tiles.map((t) => [cellBounds(t.cell)]),
  whole: extent(TILES.map((t) => cellBounds(t.cell))),
  scenery: { theme: 'city', seed: SEED, landmarks: [], blocks: [], streets: {}, avenues: [] },
})
// Dev only: `?t=0.75` stops the day at that time (0 morning, 0.25 noon, 0.5 dusk, 0.75 night).
if (import.meta.env.DEV && params.has('t')) view.holdDay(Number(params.get('t')))
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, sim, view)

/**
 * Place the next Tile and rebuild in place (ADR 0002): a new Sim carries the configuration over and Pre-warms over the
 * next frames while the view assembles the Tile's piece of slab.
 */
const next = () => {
  const placing = TILES[city.tiles.length]
  if (!placing || view.rebuilding) return
  place(placing)
  sim = new Sim(city, sim.configuration(), SEED, { prewarm: false })
  view.rebuild(sim, [cellBounds(placing.cell)])
  ui.show(sim)
}
// Dev only: `N` places the next Tile, and `R` starts over.
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase()
    if (key === 'n') next()
    if (key === 'r') location.reload()
  })
}

// Dev hook for scripted screenshots and frame timing.
if (import.meta.env.DEV) {
  Object.assign(window, {
    clearway: {
      get sim() {
        return sim
      },
      view,
      next,
    },
  })
}

let acc = 0
let last = performance.now()
requestAnimationFrame(function frame(now) {
  // The first frame's timestamp can be earlier than the `last` taken at load, so never step back in time.
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
  last = now
  if (!sim.prewarmed) {
    const end = performance.now() + PREWARM_BUDGET
    while (!sim.prewarmed && performance.now() < end) sim.step()
  } else if (!view.rebuilding) {
    acc += dt * ui.scale // fixed 30 Hz steps; scale = sim seconds per real second
    while (acc >= DT) {
      sim.step()
      acc -= DT
    }
  }
  // A Rebuild plays on even while the world is paused.
  view.render(view.rebuilding || ui.scale ? dt : 0)
  if (!view.rebuilding) ui.update()
  requestAnimationFrame(frame)
})
