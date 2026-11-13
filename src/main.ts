import district01 from '../levels/district-01'
import streetGrid from './dev/street-grid'
import { createView } from './render/view'
import { DT, Sim } from './sim/sim'
import { createUI } from './ui/ui'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const params = new URLSearchParams(location.search)
// Dev only: `?district=grid` opens the street-grid fixture instead of District 1.
const district = import.meta.env.DEV && params.get('district') === 'grid' ? streetGrid : district01
// ponytail: dev-only Reveal for playtesting. The page reloads on the next Level (`?level=2`), with the configuration
// to carry over kept in sessionStorage. That lives in one tab only, and `?level=` skips the Win: a later Level opened
// directly starts from the earlier Levels' initial configurations. The real Reveal presentation belongs to #15 (UI/UX).
const level = Number(params.get('level') ?? 1) - 1
const sim = new Sim(district, level, JSON.parse(sessionStorage.getItem(`carried:${level}`) ?? '[]'))
const next = () => {
  sessionStorage.setItem(`carried:${level + 1}`, JSON.stringify(sim.configuration()))
  location.search = `?level=${level + 2}`
}
const view = createView(canvas, sim)
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, sim, view, district.levels[level + 1] && next)

// Dev hook for scripted screenshots and frame timing.
if (import.meta.env.DEV) Object.assign(window, { clearway: { sim, view } })

let acc = 0
let last = performance.now()
requestAnimationFrame(function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000)
  acc += dt * ui.scale // fixed 30 Hz steps; scale = sim seconds per real second
  last = now
  while (acc >= DT) {
    sim.step()
    acc -= DT
  }
  view.render(ui.scale ? dt : 0)
  ui.update()
  requestAnimationFrame(frame)
})
