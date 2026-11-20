import { LAYOUTS, ZONES, type Layout, type Zone } from './city/city'
import type { Stage } from './game/game'
import { openRun } from './game/save'
import { SEEDED } from './render/scenery'
import { createView } from './render/view'
import { DT } from './sim/sim'
import { cellBounds } from './sim/tiles'
import { showNotice } from './ui/notice'
import { createUI } from './ui/ui'

// ms of each frame spent on the Pre-warm of a Swap or an Undo while its piece of slab assembles: small enough to leave
// a 120 Hz frame room to draw. A placement has none: its traffic drives on (ADR 0006).
// ponytail: that covers a Pre-warm of about 1.5 s on the main thread within the 7 s build at 60 frames a second; a
// longer one keeps the cars off a finished slab until it is done. Move the Pre-warm to a worker with the sim (the
// road-network spec's gate) if a City's Pre-warm gets that slow.
const PREWARM_BUDGET = 4

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const params = new URLSearchParams(location.search)
// The saved run last played, which keeps itself saved (`./game/save`). Dev only: `?seed=7` plays that run again.
const run = openRun(params)
const game = run.game
// The first Pre-warm runs before anything is drawn, so the page opens on settled traffic. For a saved run, it is the
// Pre-warm of the Rebuild that loading is.
// ponytail: the page stays blank while it runs, which grows with the saved City: with loading, about 60 ms for 10
// Tiles and 480 ms for 40 on an M4 Pro. Draw the slab first and spread the Pre-warm over frames, as a Rebuild does, if
// large Cities keep the page blank too long.
while (!game.sim.prewarmed) game.step()
// Dev only: `?finish=none` builds the Zones built to the Finish without their surface pattern and light
// pools, and `?finish=pattern` or `?finish=pools` with only the one named (#174), for a sheet or a bench of each.
// `?deeper` lays what stands on their Blocks 20% deeper (`?deeper=1.4`, 40%), for the user to compare a packed Tile
// with the open one (#175): lanes, Roads, the City and the sim are as they were. `?furniture` draws the street
// furniture at every zoom, as #175 drew it, for the user to compare with it as Block-zoom props (#176).
const finish = import.meta.env.DEV ? params.get('finish')?.split(',') : undefined
const deeper = import.meta.env.DEV && params.has('deeper') ? Number(params.get('deeper')) || 1.2 : undefined
const furniture = import.meta.env.DEV && params.has('furniture')
const view = createView(
  canvas,
  game.sim,
  {
    pieces: game.city.tiles.map((t) => cellBounds(t.cell)),
    scenery: { theme: 'city', seed: game.seed, landmarks: [], blocks: [], streets: {}, avenues: [], seeded: SEEDED },
    zoneOf: (cell) => game.city.tileAt(cell)?.zone,
    stageOf: (cell) => game.stageOf(cell)?.stage ?? 1,
  },
  finish || deeper || furniture
    ? { pattern: !finish || finish.includes('pattern'), pools: !finish || finish.includes('pools'), deeper, furniture }
    : undefined,
)
// Dev only: `?t=0.75` stops the day at that time (0 morning, 0.25 noon, 0.5 dusk, 0.75 night).
if (import.meta.env.DEV && params.has('t')) view.holdDay(Number(params.get('t')))
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, game, view, run)
if (run.notice) showNotice(document.querySelector<HTMLElement>('#ui')!, run.notice)

let acc = 0
/** One frame: `dt` real seconds of the game, drawn. */
const frame = (dt: number) => {
  game.assembling = view.assembling
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
  // A Rebuild plays on even while the world is paused, and so do a Tile assembling and the camera.
  view.render(view.rebuilding || view.assembling || ui.scale ? dt : 0, dt)
  ui.update()
}

// Dev hook for scripted screenshots and frame timing: `dioramania.place('curve', 1, 1, 0)`, `dioramania.game.yen += 5000`,
// and `dioramania.frame(0.016)` where the browser is not drawing frames itself. `dioramania.pick('offices')` picks the Zone
// the Tiles placed next are built as, and `dioramania.rezone(1, 0, null)` unzones a placed Tile. `dioramania.stage(1, 0, 3)`
// puts a zoned Tile at a Stage, playing its Stage-up as if it had grown there, and `dioramania.pace(10)` makes each trip
// a Junction serves count ten times toward its Tile's next Stage.
if (import.meta.env.DEV) {
  const zone = (id: Zone['id'] | null) => (id === null ? undefined : ZONES.find((z) => z.id === id)!)
  Object.assign(window, {
    dioramania: {
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
      pick: (id: Zone['id'] | null) => ui.pick(zone(id)),
      rezone: (x: number, y: number, id: Zone['id'] | null) => ui.rezone({ x, y }, zone(id)),
      stage: (x: number, y: number, stage: Stage) => game.setStage({ x, y }, stage),
      pace: (pace: number) => (game.pace = pace),
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
