import district from '../levels/district-01'
import { createScene } from './render/scene'
import { DT, Sim } from './sim/sim'
import { createUI } from './ui/ui'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const sim = new Sim(district)
const view = createScene(canvas, sim)
const ui = createUI(document.querySelector<HTMLElement>('#ui')!, canvas, sim, view)

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
