import { LAYOUTS, ZONES, type Layout, type Zone } from './city/city'
import type { Stage } from './game/game'
import { openRun, type Run } from './game/save'
import { SEEDED } from './render/scenery'
import { createView } from './render/view'
import { DT } from './sim/sim'
import { cellBounds } from './sim/tiles'
// The paper & stamp kit: the theme's colours, type and pieces, which every part of the screen is built from.
import './ui/kit.css'
import { everyFrame } from './ui/frames'
import { showNotice } from './ui/notice'
import { createTitle } from './ui/title'
import { createTripsPanel } from './ui/trips-panel.proto'
import { createUI } from './ui/ui'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const params = new URLSearchParams(location.search)

/**
 * Play `run` on the page's canvas: build its view with its Pre-warm, the screen over it, and draw it every frame from
 * now on. The page plays one run; leaving it loads the page again.
 */
function play(run: Run) {
  const game = run.game
  // The Pre-warm runs before anything is drawn, so the run opens on settled traffic, a saved one too. It is the only
  // one: every change to the City after carries the traffic over (ADR 0006).
  // ponytail: the page stays still while it runs, which grows with the saved City: with loading, about 60 ms for 10
  // Tiles and 480 ms for 40 on an M4 Pro. Draw the slab first and spread the Pre-warm over frames if large Cities keep
  // the page still too long.
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
    {
      finishing:
        finish || deeper || furniture
          ? { pattern: !finish || finish.includes('pattern'), pools: !finish || finish.includes('pools'), deeper, furniture }
          : undefined,
    },
  )
  // Dev only: `?t=0.75` stops the day at that time (0 morning, 0.25 noon, 0.5 dusk, 0.75 night).
  if (import.meta.env.DEV && params.has('t')) view.holdDay(Number(params.get('t')))
  const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, game, view, run)
  if (run.notice) showNotice(document.querySelector<HTMLElement>('#ui')!, run.notice)

  // PROTOTYPE (#303): `?trips` shows the trips' state, and the picture's day follows the simulation's clock.
  const tripsPanel = game.tileTrips && createTripsPanel(game, view)

  let acc = 0
  /** One frame: `dt` real seconds of the game, drawn. */
  const frame = (dt: number) => {
    acc += dt * ui.scale // fixed 30 Hz steps; scale = sim seconds per real second
    while (acc >= DT) {
      game.step()
      acc -= DT
    }
    if (game.tileTrips) view.holdDay(game.tileTrips.clock)
    tripsPanel?.update()
    // A Tile assembling plays on even while the world is paused, and so does the camera.
    view.render(view.assembling || ui.scale ? dt : 0, dt)
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

  everyFrame(frame)
}

// The page opens on the title screen, which builds the run the player picks and hands it here. A page loaded again to
// open a run at once, as the Paused memo's New run does, and a dev `?seed=7` page skip the title.
const opened = openRun(params)
if ('leave' in opened) createTitle(opened, play)
else play(opened)
