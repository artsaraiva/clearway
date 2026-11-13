import type { View } from '../render/scene'
import type { Priority } from '../sim/district'
import type { Arm, Lane } from '../sim/network'
import { WIN_FLOW, WIN_TIME, type Sim, type Vehicle } from '../sim/sim'

const ARM_PICK = 25 // m from where an Arm meets the Ring
const MARKER_PICK = 3 // m from a lane-end marker
const CAR_PICK = 3 // m from a car's centre

/** `next`, when there is a Level after this one, Reveals it. */
export function createUI(root: HTMLElement, canvas: HTMLCanvasElement, sim: Sim, view: View, next?: () => void) {
  const { tools } = sim.level
  root.innerHTML = `
    <div class="panel gauge">
      <div class="row"><span>Flow</span><b id="flow-pct"></b></div>
      <div class="bar"><div id="flow-fill"></div><div class="mark" style="left:${WIN_FLOW * 100}%"></div></div>
      <div class="sub" id="flow-sub"></div>
    </div>
    <div class="panel banner" id="banner" hidden>Level won!${next ? ' <button id="next">Next Level</button>' : ''}</div>
    <div class="panel time">
      <button data-scale="0">Pause</button><button data-scale="1">1×</button><button data-scale="4">4×</button><button data-scale="8">8×</button>
      <button id="reset">Reset</button>
    </div>
    <div class="panel node" id="node" hidden>
      <div class="row"><b id="node-name"></b><span class="hint">Esc to close</span></div>
      ${tools.includes('priority') ? '<div class="prio" id="prio"><button data-prio="main">Main</button><button data-prio="yield">Yield</button></div>' : ''}
      ${tools.includes('connector') ? '<div class="hint">Click a blue lane end, then an orange one, to toggle that connection.</div>' : ''}
    </div>`
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

  let scale = 4
  let selected: Arm | null = null
  let armed: Lane | null = null

  const select = (arm: Arm | null) => {
    selected = arm
    armed = null
    view.inspectCar(null)
    $('node').hidden = !arm
    if (arm) $('node-name').textContent = `${arm.junction}: ${arm.road} arm`
    // On a roundabout the Ring is always main, so the Priority rule isn't offered there.
    const prio = root.querySelector<HTMLElement>('#prio')
    if (prio) prio.hidden = !arm || sim.district.junctions[arm.junction].type !== 'priority'
    view.showArm(arm, null)
  }

  root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => (b.onclick = () => (scale = Number(b.dataset.scale))))
  root
    .querySelectorAll<HTMLButtonElement>('[data-prio]')
    .forEach(
      (b) =>
        (b.onclick = () => selected && sim.apply({ at: selected.junction, priority: { [selected.road]: b.dataset.prio as Priority } })),
    )
  if (next) $('next').onclick = next
  $('reset').onclick = () => {
    sim.reset()
    select(selected)
  }
  window.addEventListener('keydown', (e) => e.key === 'Escape' && select(null))

  canvas.addEventListener('pointerdown', (e) => {
    const p = view.pick(e)
    if (!p) return
    const dist = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y)
    if (selected && tools.includes('connector')) {
      const ends = [
        ...[...selected.approach, ...selected.ringIn].map((lane) => ({ lane, dir: 'in', at: lane.line.pts[lane.line.pts.length - 1] })),
        ...[...selected.ringOut, ...selected.exit].map((lane) => ({ lane, dir: 'out', at: lane.line.pts[0] })),
      ]
      const hit = ends.filter((m) => dist(m.at) < MARKER_PICK).sort((a, b) => dist(a.at) - dist(b.at))[0]
      if (hit?.dir === 'in') armed = hit.lane
      else if (hit && armed) {
        const c = selected.connections.find((c) => c.from === armed && c.to === hit.lane)
        if (c) sim.apply({ at: selected.junction, [c.enabled ? 'disable' : 'enable']: [c.ref] })
        armed = null
      }
      if (hit) return view.showArm(selected, armed)
    }
    const car = sim.vehicles.reduce<Vehicle | null>(
      (best, v) => (dist(view.carCentre(v)) < (best ? dist(view.carCentre(best)) : CAR_PICK) ? v : best),
      null,
    )
    if (car) return view.inspectCar(car)
    const near = sim.net.junctions.flatMap((j) => j.arms).find((a) => dist(a.center) < ARM_PICK)
    select(near ?? null)
  })

  return {
    get scale() {
      return scale
    },
    update() {
      $('flow-pct').textContent = `${Math.round(sim.flow * 100)}%`
      const fill = $('flow-fill')
      fill.style.width = `${Math.min(100, sim.flow * 100)}%`
      fill.className = sim.flow >= WIN_FLOW ? 'good' : ''
      const queued = Object.values(sim.queues).reduce((n, q) => n + q.length, 0)
      $('banner').hidden = !sim.won
      $('flow-sub').textContent =
        sim.sustained > 0 && !sim.won
          ? `Hold it: ${Math.ceil(WIN_TIME - sim.sustained)} s to go`
          : `${sim.vehicles.length} cars · ${queued} waiting off-map · ${Math.floor(sim.time)} s`
      root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => b.classList.toggle('on', Number(b.dataset.scale) === scale))
      root
        .querySelectorAll<HTMLButtonElement>('[data-prio]')
        .forEach((b) => b.classList.toggle('on', selected?.priority === b.dataset.prio))
    },
  }
}
