import district01 from '../levels/district-01'
import streetGrid from './dev/street-grid'
import { createView } from './render/view'
import { DT, Sim } from './sim/sim'
import { createUI } from './ui/ui'

// ms of each frame spent on a Reveal's Pre-warm, while its piece of slab assembles.
// ponytail: that covers a Pre-warm of about 2.5 s on the main thread within the 7 s build; a longer one keeps the new
// Level's cars off a finished slab until it is done. Move the Pre-warm to a worker with the sim (the road-network
// spec's gate) if a District's Pre-warm gets that slow.
const PREWARM_BUDGET = 6

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const params = new URLSearchParams(location.search)
// Dev only: `?district=grid` opens the street-grid fixture instead of District 1.
const district = import.meta.env.DEV && params.get('district') === 'grid' ? streetGrid : district01
// ponytail: dev-only resume for playtesting. A Reveal writes its Level to the URL (`?level=2`) and the configuration it
// carried over to sessionStorage, so a reload reopens that Level. That lives in one tab only, and `?level=` skips the
// Win: a later Level opened directly starts from the earlier Levels' initial configurations. The rest of the Reveal's
// presentation belongs to #15 (UI/UX).
let level = Number(params.get('level') ?? 1) - 1
let sim = new Sim(district, level, JSON.parse(sessionStorage.getItem(`carried:${level}`) ?? '[]'))
const view = createView(canvas, sim)
// Dev only: `?t=0.75` stops the day at that time (0 morning, 0.25 noon, 0.5 dusk, 0.75 night).
if (import.meta.env.DEV && params.has('t')) view.holdDay(Number(params.get('t')))

/**
 * Reveal the next Level in place (ADR 0002): a new Sim carries the configuration over and Pre-warms over the next frames
 * while the view assembles the Level's piece of slab.
 */
const next = () => {
  if (!district.levels[level + 1] || view.revealing) return
  const carried = sim.configuration()
  level++
  sessionStorage.setItem(`carried:${level}`, JSON.stringify(carried))
  params.set('level', String(level + 1))
  history.replaceState(null, '', `?${params}`)
  sim = new Sim(district, level, carried, { prewarm: false })
  view.reveal(sim)
  ui.show(sim, district.levels[level + 1] && next)
}
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, sim, view, district.levels[level + 1] && next)
// Dev only: `N` Reveals the next Level without a Win.
if (import.meta.env.DEV) window.addEventListener('keydown', (e) => e.key.toLowerCase() === 'n' && next())

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
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!sim.prewarmed) {
    const end = performance.now() + PREWARM_BUDGET
    while (!sim.prewarmed && performance.now() < end) sim.step()
  } else if (!view.revealing) {
    acc += dt * ui.scale // fixed 30 Hz steps; scale = sim seconds per real second
    while (acc >= DT) {
      sim.step()
      acc -= DT
    }
  }
  // A Reveal plays on even while the world is paused.
  view.render(view.revealing || ui.scale ? dt : 0)
  if (!view.revealing) ui.update()
  requestAnimationFrame(frame)
})
