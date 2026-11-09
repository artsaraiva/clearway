import type { View } from '../render/scene'
import type { Node } from '../sim/network'
import { WIN_FLOW, WIN_TIME, WIN_WARMUP, type Priority, type Sim } from '../sim/sim'

const NODE_PICK = 25 // m from a ring node's centre
const MARKER_PICK = 3 // m from a lane-end marker

export function createUI(root: HTMLElement, canvas: HTMLCanvasElement, sim: Sim, view: View) {
  root.innerHTML = `
    <div class="panel gauge">
      <div class="row"><span>Flow</span><b id="flow-pct"></b></div>
      <div class="bar"><div id="flow-fill"></div><div class="mark" style="left:${WIN_FLOW * 100}%"></div></div>
      <div class="sub" id="flow-sub"></div>
    </div>
    <div class="panel time">
      <button data-scale="0">Pause</button><button data-scale="1">1×</button><button data-scale="4">4×</button>
    </div>
    <div class="panel node" id="node" hidden>
      <div class="row"><b id="node-name"></b><span class="hint">Esc to close</span></div>
      <div class="prio">
        <button data-prio="yield">Yield</button><button data-prio="stop">Stop</button><button data-prio="signal">Signal</button>
      </div>
      <div class="hint">Click a blue lane end, then an orange one, to toggle that connection.</div>
    </div>`
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

  let scale = 4
  let selected: Node | null = null
  let armed: string | null = null

  const select = (node: Node | null) => {
    selected = node
    armed = null
    $('node').hidden = !node
    if (node) $('node-name').textContent = `${node.arm} junction`
    view.showNode(node, null)
  }

  root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => (b.onclick = () => (scale = Number(b.dataset.scale))))
  root.querySelectorAll<HTMLButtonElement>('[data-prio]').forEach(
    (b) => (b.onclick = () => selected && sim.setPriority(selected.arm, b.dataset.prio as Priority)),
  )
  window.addEventListener('keydown', (e) => e.key === 'Escape' && select(null))

  canvas.addEventListener('pointerdown', (e) => {
    const p = view.pick(e)
    if (!p) return
    const dist = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y)
    if (selected) {
      const ends = [
        ...Object.entries(selected.inPorts).map(([port, l]) => ({ port, dir: 'in', at: l.line.pts[l.line.pts.length - 1] })),
        ...Object.entries(selected.outPorts).map(([port, l]) => ({ port, dir: 'out', at: l.line.pts[0] })),
      ]
      const hit = ends.filter((m) => dist(m.at) < MARKER_PICK).sort((a, b) => dist(a.at) - dist(b.at))[0]
      if (hit?.dir === 'in') armed = hit.port
      else if (hit && armed) {
        const c = sim.connection(selected.arm, armed, hit.port)
        if (c) sim.setConnection(selected.arm, armed, hit.port, !c.enabled)
        armed = null
      }
      if (hit) return view.showNode(selected, armed)
    }
    const near = sim.net.nodes.find((n) => dist(n.center) < NODE_PICK)
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
      $('flow-sub').textContent = sim.won
        ? 'Cleared! Traffic is flowing.'
        : sim.sustained > 0
          ? `Hold it: ${Math.ceil(WIN_TIME - sim.sustained)} s to go`
          : sim.time < WIN_WARMUP
            ? `Traffic building up… ${Math.ceil(WIN_WARMUP - sim.time)} s`
          : `${sim.vehicles.length} cars · ${queued} waiting off-map · ${Math.floor(sim.time)} s`
      root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => b.classList.toggle('on', Number(b.dataset.scale) === scale))
      root
        .querySelectorAll<HTMLButtonElement>('[data-prio]')
        .forEach((b) => b.classList.toggle('on', !!selected && sim.priority[selected.arm] === b.dataset.prio))
    },
  }
}
