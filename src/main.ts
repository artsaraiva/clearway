import { LAYOUTS, type Layout } from './city/city'
import { Game } from './game/game'
import { createView } from './render/view'
import { DT } from './sim/sim'
import { cellBounds } from './sim/tiles'
import { createUI } from './ui/ui'

// ms of each frame spent on a Rebuild's Pre-warm while its piece of slab assembles: small enough to leave a 120 Hz frame
// room to draw.
// ponytail: that covers a Pre-warm of about 1.5 s on the main thread within the 7 s build at 60 frames a second; a
// longer one keeps the cars off a finished slab until it is done. Move the Pre-warm to a worker with the sim (the
// road-network spec's gate) if a City's Pre-warm gets that slow.
const PREWARM_BUDGET = 4

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const params = new URLSearchParams(location.search)
// A new run on every load: nothing is saved yet. Dev only: `?seed=7` plays that run again.
const game = new Game(import.meta.env.DEV && params.has('seed') ? Number(params.get('seed')) : undefined)
// The first Pre-warm runs before anything is drawn, so the page opens on settled traffic.
while (!game.sim.prewarmed) game.step()
const view = createView(canvas, game.sim, {
  pieces: game.city.tiles.map((t) => cellBounds(t.cell)),
  scenery: { theme: 'city', seed: game.seed, landmarks: [], blocks: [], streets: {}, avenues: [] },
})
// Dev only: `?t=0.75` stops the day at that time (0 morning, 0.25 noon, 0.5 dusk, 0.75 night).
if (import.meta.env.DEV && params.has('t')) view.holdDay(Number(params.get('t')))
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, game, view)

let acc = 0
/** One frame: `dt` real seconds of the game, drawn. */
const frame = (dt: number) => {
  if (!game.sim.prewarmed) {
    const end = performance.now() + PREWARM_BUDGET
    while (!game.sim.prewarmed && performance.now() < end) game.step()
  } else if (!view.rebuilding) {
    acc += dt * ui.scale // fixed 30 Hz steps; scale = sim seconds per real second
    while (acc >= DT) {
      game.step()
      acc -= DT
    }
  }
  // A Rebuild plays on even while the world is paused.
  view.render(view.rebuilding || ui.scale ? dt : 0)
  ui.update()
}

// Dev hook for scripted screenshots and frame timing: `clearway.place('curve', 1, 1, 0)`, `clearway.game.yen += 5000`,
// and `clearway.frame(0.016)` where the browser is not drawing frames itself.
if (import.meta.env.DEV) {
  Object.assign(window, {
    clearway: {
      game,
      get sim() {
        return game.sim
      },
      view,
      frame,
      place: (id: Layout['id'], rotation: number, x: number, y: number) =>
        ui.place(
          LAYOUTS.find((l) => l.id === id)!,
          rotation,
          { x, y },
        ),
      undo: ui.undo,
    },
  })
}

let last = performance.now()
requestAnimationFrame(function loop(now) {
  // The first frame's timestamp can be earlier than the `last` taken at load, so never step back in time.
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
  last = now
  frame(dt)
  requestAnimationFrame(loop)
})
