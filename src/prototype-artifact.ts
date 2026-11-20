// PROTOTYPE, throwaway (`./render/prototype-look`): a small City at Stage 3 on a canvas, for a page that sets the
// game's look beside the faceted one. Built once per look into a script of its own. Not for main.
import { LAYOUTS, ZONES } from './city/city'
import { Game } from './game/game'
import { SEEDED } from './render/scenery'
import { allStands } from './render/prototype-look'
import { describe, recent } from './render/prototype-walkers'
import { PARKING } from './sim/prototype-signals'
import { createView } from './render/view'
import { DT } from './sim/sim'
import { cellBounds } from './sim/tiles'

/** The middle of the Block the camera closes in on, in a City of one Tile. */
const BLOCK = { x: 25, y: -25 }

/**
 * Draw a City on `canvas`, its traffic running, the day held at `time` (0 morning, 0.25 noon, 0.5 dusk, 0.75 night):
 * `row`, three Tiles (low-density, high-density, shops), or `shops`, one shops Tile seen from Block zoom.
 */
export function mount(canvas: HTMLCanvasElement, time = 0.25, city: 'row' | 'shops' | 'trio' = 'row') {
  const game = new Game(3, { free: true })
  const settle = () => {
    while (!game.sim.prewarmed) game.step()
  }
  settle()
  const zone = (id: string) => ZONES.find((z) => z.id === id)
  const layout = (id: string) => LAYOUTS.find((l) => l.id === id)!
  if (city === 'row') {
    game.rezone({ x: 0, y: 0 }, zone('high-density'))
    game.place(layout('tee'), 0, { x: -1, y: 0 }, zone('low-density'))
    settle()
    game.place(layout('roundabout'), 0, { x: 1, y: 0 }, zone('shops'))
    settle()
  } else if (city === 'trio') {
    // Homes, shops and industry in a row, the shops in the middle.
    game.rezone({ x: 0, y: 0 }, zone('shops'))
    game.place(layout('tee'), 0, { x: -1, y: 0 }, zone('low-density'))
    settle()
    for (const id of ['crossroads', 'tee', 'roundabout']) {
      if (game.city.tileAt({ x: 1, y: 0 })) break
      for (let turns = 0; turns < 4 && !game.city.tileAt({ x: 1, y: 0 }); turns++)
        game.place(layout(id), turns, { x: 1, y: 0 }, zone('industrial'))
    }
    settle()
  } else game.rezone({ x: 0, y: 0 }, zone('shops'))
  for (const t of game.city.tiles) game.setStage(t.cell, 3)
  const view = createView(canvas, game.sim, {
    pieces: game.city.tiles.map((t) => cellBounds(t.cell)),
    scenery: { theme: 'city', seed: game.seed, landmarks: [], blocks: [], streets: {}, avenues: [], seeded: SEEDED },
    zoneOf: (c) => game.city.tileAt(c)?.zone,
    stageOf: (c) => game.stageOf(c)?.stage ?? 1,
  })
  view.holdDay(time)
  let [acc, last, running] = [0, performance.now(), true]
  // Frames until the camera, having framed the slab, closes in: on the City, or on one Block of a single Tile.
  let closing = 3
  let centring = 0
  const middle = () => {
    const r = canvas.getBoundingClientRect()
    return { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.54 }
  }
  /** Zoom until `metres` of road plane run across the canvas. */
  const zoomTo = (metres: number) => {
    const at = middle()
    for (let k = 0; k < 6; k++) {
      const [a, b] = [view.pick({ ...at, clientX: at.clientX - 100 }), view.pick({ ...at, clientX: at.clientX + 100 })]
      if (!a || !b) return
      const span = (Math.hypot(b.x - a.x, b.y - a.y) * canvas.getBoundingClientRect().width) / 200
      view.camera.zoomAt(at, (100 * Math.log(span / metres)) / Math.log(0.95))
    }
  }
  const closeIn = () => {
    if (city !== 'shops') return view.camera.zoomAt(middle(), city === 'trio' ? -1000 : -480)
    zoomTo(60)
    view.camera.centreOn(BLOCK)
    centring = 90
  }
  /** A day played from `from` to `to` over `over` seconds, then held. */
  let playing: { from: number; to: number; over: number; t: number } | null = null
  requestAnimationFrame(function loop(now) {
    if (!running) return
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
    last = now
    if (!view.rebuilding) {
      acc += dt
      while (acc >= DT) {
        game.step()
        acc -= DT
      }
    }
    if (playing) {
      playing.t = Math.min(1, playing.t + dt / playing.over)
      view.holdDay(playing.from + (playing.to - playing.from) * playing.t)
      if (playing.t === 1) playing = null
    }
    view.render(dt, dt)
    // The camera keeps the person followed near the middle of the canvas.
    const who = view.walkers.followed
    if (who && dt > 0) {
      const [px, py] = view.camera.onScreen({ x: who.x, y: who.y })
      const r = canvas.getBoundingClientRect()
      const k = Math.min(1, dt * 2.5)
      const from = { clientX: r.left + px, clientY: r.top + py }
      view.camera.pan(from, { clientX: from.clientX + (r.width / 2 - px) * k, clientY: from.clientY + (r.height * 0.56 - py) * k })
    }
    if (closing > 0 && --closing === 0) closeIn()
    if (centring > 0 && --centring === 0) zoomTo(60)
    requestAnimationFrame(loop)
  })
  return {
    camera: view.camera,
    setTime(t: number) {
      playing = null
      view.holdDay(t)
    },
    /** Let the afternoon fall to night over `over` seconds. */
    playDusk(over = 24) {
      playing = { from: 0.4, to: 0.62, over, t: 0 }
    },
    /** Back to the view it opened on, from the heading and tilt the camera has. */
    home() {
      view.camera.frameCity()
      closing = 70
    },
    /** Follow the person under a point of the screen, if one is there, and say who they are. */
    pick(at: { clientX: number; clientY: number }) {
      const ground = view.pick(at)
      const found = ground && view.walkers.personAt(ground.x, ground.y)
      if (found) view.walkers.follow(found)
      return found ? describe(found) : null
    },
    /** Follow the person of this id, or nobody. */
    follow(id: number | null) {
      view.walkers.follow(view.walkers.people().find((p) => p.id === id) ?? null)
    },
    /** Keep a person, whose storylets then go on unwatched, or let them go. */
    keep(id: number, kept: boolean) {
      const found = view.walkers.people().find((p) => p.id === id)
      if (found) found.kept = kept
    },
    /** The person followed and those kept, as a page shows them, and the time of day (0 to 1). */
    state() {
      const who = view.walkers.followed
      return {
        day: view.dayTime,
        recent: recent(),
        parking: {
          stands: allStands().length,
          spots: PARKING.spots.length,
          parked: PARKING.parked.length,
          reserved: PARKING.spots.filter((x) => x.reserved).length,
        },
        followed: who ? describe(who) : null,
        kept: view.walkers
          .people()
          .filter((p) => p.kept)
          .map(describe),
      }
    },
    /** Let the day run on its own clock, or hold it where it is. */
    stop: () => (running = false),
  }
}
