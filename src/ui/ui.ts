import { beyond, DIRECTIONS, hasRoad, LAYOUTS, type Cell, type Layout } from '../city/city'
import type { Game } from '../game/game'
import type { Held } from '../render/hand'
import type { Relaid, View } from '../render/view'
import type { Arm, Lane } from '../sim/network'
import { WIN_FLOW, WIN_TIME, type Vehicle } from '../sim/sim'
import type { Priority } from '../sim/spec'
import { cellAt, cellBounds } from '../sim/tiles'

const ARM_PICK = 25 // m from where an Arm meets the Ring
const MARKER_PICK = 3 // m from a lane-end marker
const CAR_PICK = 3 // m from a car's centre
const CLICK_SLOP = 4 // px the pointer may move between press and release

const yen = (n: number) => `¥${Math.round(n).toLocaleString('en')}`
const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y

/** A Layout's picture for the bar, turned as the next drop will be. */
function icon(layout: Layout, rotation: number) {
  const roads = DIRECTIONS.filter((d) => hasRoad({ layout, rotation }, d))
    .map((d) => {
      const [dx, dy] = [Math.round(Math.cos((d * Math.PI) / 2)), -Math.round(Math.sin((d * Math.PI) / 2))]
      return `<line x1="28" y1="28" x2="${28 + dx * 28}" y2="${28 + dy * 28}" stroke="#3b4252" stroke-width="14"/>`
    })
    .join('')
  const ring = layout.id === 'roundabout' ? '<circle cx="28" cy="28" r="13" fill="#a5d38a" stroke="#3b4252" stroke-width="9"/>' : ''
  return `<svg width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" rx="6" fill="#cfd6c8"/>${roads}${ring}</svg>`
}

/**
 * The minimum screen, until #15 designs the real one: the bar of Layouts to drag onto the board, Undo, the yen and
 * traffic readings, the clock, and both Tools and the route Inspector on every Junction.
 */
export function createUI(root: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View) {
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

  let scale = 4
  let selected: Arm | null = null
  let armed: Lane | null = null
  /** Quarter turns counterclockwise of the next drop, shared by every Layout in the bar. */
  let rotation = 0
  /** The Layout being dragged from the bar, and the cell under the pointer if it is over the board. */
  let drag: { layout: Layout; cell: Cell | null } | null = null
  /** What the hand last showed, so that it is only rebuilt when that changes. */
  let shown = ''

  const select = (arm: Arm | null) => {
    selected = arm
    armed = null
    view.inspectCar(null)
    $('node').hidden = !arm
    if (arm) $('node-name').textContent = `${arm.junction}: ${arm.road} arm`
    // On a roundabout the Ring is always main, so the Priority rule isn't offered there.
    $('prio').hidden = !arm || game.sim.spec.junctions[arm.junction].type !== 'priority'
    view.showArm(arm, null)
  }

  /** Play the Rebuild the game just made. */
  const rebuilt = (relaid: Relaid) => {
    select(null)
    view.rebuild(game.sim, relaid)
  }

  /** Drop a Layout on a cell: a placement, or a Swap on a placed Tile. Refused while a Rebuild plays. */
  const place = (layout: Layout, turns: number, cell: Cell) => {
    if (view.rebuilding) return false
    const offer = game.place(layout, turns, cell)
    if (!offer.legal) return false
    if (!offer.affordable) {
      $('yen').animate([{ color: '#d6453d' }, { color: '#222' }], 600)
      return false
    }
    rebuilt(offer.swap ? { swapped: cellBounds(cell) } : { placed: cellBounds(cell) })
    return true
  }

  const undo = () => {
    if (view.rebuilding) return
    const before = game.city.tiles
    if (!game.undo()) return
    // An Undo of a placement takes its Tile off; an Undo of a Swap puts the Tile before it back on its cell.
    const after = game.city.tiles
    const gone = before.find((t) => !after.some((u) => sameCell(t.cell, u.cell)))
    const changed = before.find((t) => after.some((u) => sameCell(t.cell, u.cell) && (u.layout !== t.layout || u.rotation !== t.rotation)))
    if (gone) rebuilt({ removed: cellBounds(gone.cell) })
    else if (changed) rebuilt({ swapped: cellBounds(changed.cell) })
  }

  /** What the hand shows for the drag as it stands. */
  const held = (): Held | null => {
    if (!drag || view.rebuilding) return null
    const { layout, cell } = drag
    const city = game.city
    const empty = new Map<string, Cell>()
    for (const tile of city.tiles) {
      for (const d of DIRECTIONS) {
        const c = beyond(tile.cell, d)
        if (!city.tiles.some((t) => sameCell(t.cell, c))) empty.set(`${c.x},${c.y}`, c)
      }
    }
    const open = [...empty.values()].filter((c) => city.drop(layout, rotation, c).legal)
    const base = { layout, rotation, cell, open }
    if (!cell) return { ...base, state: 'legal', swap: false, lines: ['', ''] }
    const offer = game.offer(layout, rotation, cell)
    const swap = city.tiles.some((t) => sameCell(t.cell, cell))
    if (!offer.legal) return { ...base, state: 'refused', swap, lines: ['✕', offer.reason] }
    const rebate = offer.price < game.price ? ' · loop rebate' : ''
    return offer.affordable
      ? { ...base, state: 'legal', swap, lines: [yen(offer.price), `drop to ${swap ? 'swap' : 'place'}${rebate}`] }
      : { ...base, state: 'unaffordable', swap, lines: [yen(offer.price), 'not enough yen'] }
  }

  const drawBar = () => {
    $('layouts').innerHTML = LAYOUTS.map(
      (l) => `<div class="tile${drag?.layout === l ? ' held' : ''}" data-layout="${l.id}">${icon(l, rotation)}${l.name}</div>`,
    ).join('')
    $('layouts')
      .querySelectorAll<HTMLElement>('[data-layout]')
      .forEach((el) => {
        el.onpointerdown = (e) => {
          if (e.button !== 0) return
          e.preventDefault()
          el.releasePointerCapture?.(e.pointerId)
          drag = { layout: LAYOUTS.find((l) => l.id === el.dataset.layout)!, cell: null }
          el.classList.add('held')
        }
      })
  }
  const turn = (by: number) => {
    rotation = (((rotation + by) % 4) + 4) % 4
    drawBar()
  }
  const drop = () => {
    drag = null
    drawBar()
  }

  root.innerHTML = `
    <div class="panel gauge">
      <div class="row"><span>Yen</span><b id="yen" class="yen"></b></div>
      <div class="row"><span>Income</span><b id="income"></b></div>
      <div class="row"><span>Trips</span><b id="trips"></b></div>
      <div class="sub" id="record"></div>
      <div class="row flow"><span>Flow</span><b id="flow-pct"></b></div>
      <div class="bar"><div id="flow-fill"></div><div class="mark" style="left:${WIN_FLOW * 100}%"></div></div>
      <div class="sub" id="flow-sub"></div>
    </div>
    <div class="panel banner" id="banner" hidden>Holding</div>
    <div class="panel time">
      <button data-scale="0">Pause</button><button data-scale="1">1×</button><button data-scale="4">4×</button><button data-scale="8">8×</button>
      <button id="reset">Reset</button>
    </div>
    <div class="panel node" id="node" hidden>
      <div class="row"><b id="node-name"></b><span class="hint">Esc to close</span></div>
      <div class="prio" id="prio"><button data-prio="main">Main</button><button data-prio="yield">Yield</button></div>
      <div class="hint">Click a blue lane end, then an orange one, to toggle that connection.</div>
    </div>
    <div class="panel tray" id="tray">
      <div class="layouts" id="layouts"></div>
      <div class="side">
        <span>Next Tile</span><b id="price"></b>
        <span>R or the wheel turns it</span>
        <button id="undo" hidden>Undo</button>
      </div>
    </div>`
  root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => (b.onclick = () => (scale = Number(b.dataset.scale))))
  root
    .querySelectorAll<HTMLButtonElement>('[data-prio]')
    .forEach(
      (b) =>
        (b.onclick = () => selected && game.apply({ at: selected.junction, priority: { [selected.road]: b.dataset.prio as Priority } })),
    )
  $('reset').onclick = () => {
    game.reset()
    select(selected)
  }
  $('undo').onclick = undo
  $('tray').onwheel = (e) => {
    if (drag) return
    e.preventDefault()
    turn(e.deltaY > 0 ? -1 : 1)
  }
  drawBar()

  const overPanel = (e: Event) => e.target instanceof Element && e.target.closest('.panel') !== null
  window.addEventListener('pointermove', (e) => {
    if (!drag) return
    const p = overPanel(e) ? null : view.pick(e)
    drag.cell = p && cellAt(p)
  })
  window.addEventListener('pointerup', (e) => {
    if (!drag) return
    const p = overPanel(e) ? null : view.pick(e)
    const { layout } = drag
    drop()
    if (p) place(layout, rotation, cellAt(p))
  })
  // While a Tile is in the hand the wheel turns it, and the camera does not zoom.
  window.addEventListener(
    'wheel',
    (e) => {
      if (!drag) return
      e.preventDefault()
      e.stopPropagation()
      turn(e.deltaY > 0 ? -1 : 1)
    },
    { capture: true, passive: false },
  )
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') turn(e.shiftKey ? -1 : 1)
    if (e.key === 'Escape') {
      if (drag) drop()
      select(null)
    }
  })

  // A click is a press and release in one spot: a drag moves the camera instead. Nothing is picked during a Rebuild.
  let down = { x: 0, y: 0 }
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }))
  canvas.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP || view.rebuilding || drag) return
    const p = view.pick(e)
    if (!p) return
    const sim = game.sim
    const dist = (q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y)
    if (selected) {
      const ends = [
        ...[...selected.approach, ...selected.ringIn].map((lane) => ({ lane, dir: 'in', at: lane.line.pts[lane.line.pts.length - 1] })),
        ...[...new Set(selected.connections.map((c) => c.to))].map((lane) => ({ lane, dir: 'out', at: lane.line.pts[0] })),
      ]
      const hit = ends.filter((m) => dist(m.at) < MARKER_PICK).sort((a, b) => dist(a.at) - dist(b.at))[0]
      if (hit?.dir === 'in') armed = hit.lane
      else if (hit && armed) {
        const c = selected.connections.find((c) => c.from === armed && c.to === hit.lane)
        if (c) game.apply({ at: selected.junction, [c.enabled ? 'disable' : 'enable']: [c.ref] })
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
    /** Sim seconds per real second: 0 while paused. */
    get scale() {
      return scale
    },

    place,
    undo,

    /** Show the game as it stands. Call it every frame. */
    update() {
      const sim = game.sim
      const key = drag ? `${drag.layout.id}:${rotation}:${drag.cell?.x},${drag.cell?.y}:${game.yen >= game.price}:${game.city.tiles.length}:${view.rebuilding}` : '' // prettier-ignore
      if (key !== shown) view.hold(held())
      shown = key

      $('yen').textContent = yen(game.yen)
      $('income').textContent = `${yen(game.income)}/min`
      $('trips').textContent = `${game.tripsPerMinute.toFixed(0)}/min`
      $('record').textContent = `Record ${game.record.toFixed(0)}/min · ${game.city.tiles.length} Tiles`
      $('price').textContent = yen(game.price)
      $('tray').classList.toggle('poor', game.yen < game.price)
      const undoButton = $('undo') as HTMLButtonElement
      undoButton.hidden = !game.undoable
      undoButton.disabled = view.rebuilding
      // The traffic readings wait for a Rebuild to show its cars.
      if (!view.rebuilding) {
        $('flow-pct').textContent = `${Math.round(sim.flow * 100)}%`
        const fill = $('flow-fill')
        fill.style.width = `${Math.min(100, sim.flow * 100)}%`
        fill.className = sim.flow >= WIN_FLOW ? 'good' : ''
        const queued = Object.values(sim.queues).reduce((n, q) => n + q.length, 0)
        $('banner').hidden = !sim.holding
        $('flow-sub').textContent =
          sim.sustained > 0 && !sim.holding
            ? `Hold it: ${Math.ceil(WIN_TIME - sim.sustained)} s to go`
            : `${sim.vehicles.length} cars · ${queued} waiting off-map`
      }
      root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => b.classList.toggle('on', Number(b.dataset.scale) === scale))
      root
        .querySelectorAll<HTMLButtonElement>('[data-prio]')
        .forEach((b) => b.classList.toggle('on', selected?.priority === b.dataset.prio))
    },
  }
}
