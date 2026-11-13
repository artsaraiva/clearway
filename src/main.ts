import district from '../levels/district-01'
import { createScene } from './render/scene'
import { DT, Sim } from './sim/sim'
import { createUI } from './ui/ui'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
// ponytail: dev-only Reveal for playtesting. The page reloads on the next Level (`?level=2`), with the configuration
// to carry over kept in sessionStorage, so opening a later Level directly starts it from the earlier Levels' initial
// configurations. The real Reveal presentation belongs to #15 (UI/UX).
const level = Number(new URLSearchParams(location.search).get('level') ?? 1) - 1
const sim = new Sim(district, level, JSON.parse(sessionStorage.getItem(`carried:${level}`) ?? '[]'))
const next = () => {
  sessionStorage.setItem(`carried:${level + 1}`, JSON.stringify(sim.configuration()))
  location.search = `?level=${level + 2}`
}
const view = createScene(canvas, sim)
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, sim, view, district.levels[level + 1] && next)

let acc = 0
let last = performance.now()
requestAnimationFrame(function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000) * ui.scale // fixed 30 Hz steps; scale = sim seconds per real second
  last = now
  while (acc >= DT) {
    sim.step()
    acc -= DT
  }
  view.render()
  ui.update()
  requestAnimationFrame(frame)
})
