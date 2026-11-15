import { beyond, DIRECTIONS, hasRoad, LAYOUTS, type Cell, type Layout } from '../city/city'
import type { Game } from '../game/game'
import type { Held } from '../render/hand'
import type { Relaid, View } from '../render/view'
import { WIN_FLOW, WIN_TIME } from '../sim/sim'
import { cellAt, cellBounds } from '../sim/tiles'
import { createTools, type Gesture } from './tools'

const CLICK_SLOP = 4 // px the pointer may move between press and release
/**
 * The most of its length yen's fill takes while the next Tile is out of reach. The last step to full comes only when
 * the Tile is affordable, so a fill a pixel short of the Price never passes for full.
 */
const SHORT_OF_PRICE = 0.97
const REFUSAL = '#ff4a1f' // the hot red-orange reserved for Jams and refusals

const yen = (n: number) => `¥${Math.round(n).toLocaleString('en')}`
const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y

/** A reading on the screen: `write` puts a value on the page, and runs only when the value changes. */
function reading(write: (value: string) => void) {
  let shown: string | undefined
  return (value: string) => {
    if (value !== shown) write((shown = value))
  }
}

const PAUSE = `<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
  <rect x="1" y="1" width="4" height="14" rx="1.6" fill="currentColor"/><rect x="9" y="1" width="4" height="14" rx="1.6" fill="currentColor"/>
</svg>`
const UNDO = `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
  <path d="M4.5 3.5L1.8 6.2l2.7 2.7M2.2 6.2h6.3a3.6 3.6 0 0 1 0 7.2H6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
const MENU = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</svg>`

/** A Layout's top-down picture for the bar, turned as the next drop will be. */
function icon(layout: Layout, rotation: number) {
  const roads = DIRECTIONS.filter((d) => hasRoad({ layout, rotation }, d))
    .map((d) => {
      const [dx, dy] = [Math.round(Math.cos((d * Math.PI) / 2)), -Math.round(Math.sin((d * Math.PI) / 2))]
      return `<line x1="28" y1="28" x2="${28 + dx * 30}" y2="${28 + dy * 30}" stroke="#3d4456" stroke-width="13" stroke-linecap="square"/>`
    })
    .join('')
  const ring = layout.id === 'roundabout' ? '<circle cx="28" cy="28" r="11.5" fill="#8fd16f" stroke="#3d4456" stroke-width="8"/>' : ''
  return `<svg width="50" height="50" viewBox="0 0 56 56" aria-hidden="true">
    <clipPath id="disc-${layout.id}"><circle cx="28" cy="28" r="27"/></clipPath>
    <circle cx="28" cy="28" r="27" fill="#eceae4"/><g clip-path="url(#disc-${layout.id})">${roads}${ring}</g>
    <circle cx="28" cy="28" r="26.5" fill="none" stroke="rgba(27,32,48,0.12)"/>
  </svg>`
}

/**
 * The screen (.scratch/ui-ux/spec.md, "Layout"): yen and Income top-left, the Flow gauge with trips a minute and the
 * Record top-centre, the clock top-right with the selected Junction's panel under it, the bar of Layouts with the Price
 * and Undo bottom-centre, and the menu bottom-left. Bottom-right is kept for the camera buttons. The Tools and the route
 * Inspector are used in the world (`./tools`).
 */
export function createUI(root: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View) {
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

  let scale = 4
  /** Quarter turns counterclockwise of the next drop, shared by every Layout in the bar. */
  let rotation = 0
  /** The Layout being dragged from the bar, and the cell under the pointer if it is over the board. */
  let drag: { layout: Layout; cell: Cell | null } | null = null
  /** What the hand last showed, so that it is only rebuilt when that changes. */
  let shown = ''

  root.innerHTML = `
    <div class="glass money">
      <div class="yen" id="yen"><small>¥</small><span id="yen-amount"></span></div>
      <div class="fill"><i id="yen-fill"></i></div>
      <div class="income soft"><span id="income"></span><span id="to-price"></span></div>
    </div>
    <div class="glass flow" id="flow">
      <div class="row"><span class="label">Flow</span><span class="state soft" id="holding"></span><span class="pct" id="flow-pct"></span></div>
      <div class="gauge"><i id="flow-fill"></i><b style="left: ${WIN_FLOW * 100}%"></b></div>
      <div class="row sub soft"><span id="trips"></span><span id="record"></span></div>
    </div>
    <div class="glass speed">
      <button data-scale="0" aria-label="Pause">${PAUSE}</button><button data-scale="1">1×</button><button data-scale="4">4×</button><button data-scale="8">8×</button>
    </div>
    <div class="glass junction" id="junction" hidden></div>
    <div class="glass bar" id="tray">
      <div class="layouts" id="layouts"></div>
      <div class="side">
        <div class="price"><span class="soft">Next tile</span><b id="price"></b></div>
        <button class="undo gone" id="undo">${UNDO}Undo</button>
      </div>
    </div>
    <div class="menu" id="menu">
      <button class="glass round" id="menu-button" aria-label="Menu" aria-expanded="false">${MENU}</button>
      <div class="glass sheet" id="menu-sheet" hidden>
        <button class="item" id="new-run">New run</button>
        <button class="item" id="free-run" role="switch" aria-checked="${game.free}">
          <span>Free run<small>Every tile costs ¥0</small></span><i class="switch"></i>
        </button>
        <dl class="keys">
          <dt>Turn the tile</dt><dd><kbd>R</kbd> or wheel</dd>
          <dt>Turn it back</dt><dd><kbd>Shift</kbd> <kbd>R</kbd></dd>
          <dt>Put it back, deselect</dt><dd><kbd>Esc</kbd></dd>
        </dl>
      </div>
    </div>`

  const text = (id: string) => {
    const el = $(id)
    return reading((value) => (el.textContent = value))
  }
  const width = (id: string) => {
    const el = $(id)
    return reading((value) => (el.style.width = value))
  }
  const show = {
    yen: text('yen-amount'),
    yenFill: width('yen-fill'),
    income: text('income'),
    toPrice: text('to-price'),
    price: text('price'),
    flow: text('flow-pct'),
    flowFill: width('flow-fill'),
    holding: text('holding'),
    trips: text('trips'),
    record: text('record'),
  }

  /** Play the Rebuild the game just made. */
  const rebuilt = (relaid: Relaid) => {
    tools.clear()
    view.rebuild(game.sim, relaid)
  }

  /** Drop a Layout on a cell: a placement, or a Swap on a placed Tile. Refused while a Rebuild plays. */
  const place = (layout: Layout, turns: number, cell: Cell) => {
    if (view.rebuilding) return false
    const offer = game.place(layout, turns, cell)
    if (!offer.legal) return false
    if (!offer.affordable) {
      $('yen').animate([{ color: REFUSAL, offset: 0 }], { duration: 600, easing: 'ease-out' })
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
      (l) => `<div class="layout${drag?.layout === l ? ' on' : ''}" data-layout="${l.id}">${icon(l, rotation)}${l.name}</div>`,
    ).join('')
    $('layouts')
      .querySelectorAll<HTMLElement>('[data-layout]')
      .forEach((el) => {
        el.onpointerdown = (e) => {
          if (e.button !== 0) return
          e.preventDefault()
          el.releasePointerCapture?.(e.pointerId)
          drag = { layout: LAYOUTS.find((l) => l.id === el.dataset.layout)!, cell: null }
          el.classList.add('on')
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

  const sheet = $('menu-sheet')
  const showMenu = (open: boolean) => {
    sheet.hidden = !open
    $('menu-button').setAttribute('aria-expanded', String(open))
  }
  /**
   * Leave this run for the page loaded with `params`. Nothing is saved yet, so that loses the City as it stands: once it
   * has grown, ask first.
   */
  const leave = (params: URLSearchParams) => {
    if (game.city.tiles.length > 1 && !confirm('Start a new run? This City is not saved.')) return
    const query = params.toString()
    location.assign(query ? `?${query}` : location.pathname)
  }

  root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => (b.onclick = () => (scale = Number(b.dataset.scale))))
  $('undo').onclick = undo
  $('menu-button').onclick = () => showMenu(sheet.hidden)
  // A new run takes a new seed. The switch to or from a Free run flips `?free`, and other parameters stay.
  $('new-run').onclick = () => {
    const params = new URLSearchParams(location.search)
    params.delete('seed')
    leave(params)
  }
  $('free-run').onclick = () => {
    const params = new URLSearchParams(location.search)
    if (game.free) params.delete('free')
    else params.set('free', '')
    leave(params)
  }
  $('tray').onwheel = (e) => {
    if (drag) return
    e.preventDefault()
    turn(e.deltaY > 0 ? -1 : 1)
  }
  drawBar()

  /** Whether a pointer event is over a piece of the screen rather than the board. */
  const overScreen = (e: Event) => e.target instanceof Node && root.contains(e.target)
  // In the capture phase, ahead of the Tools, which keep a press on a lane end to themselves.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!sheet.hidden && !(e.target instanceof Node && $('menu').contains(e.target))) showMenu(false)
    },
    { capture: true },
  )
  const tools = createTools($('junction'), canvas, game, view, () => drag !== null || view.rebuilding)
  window.addEventListener('pointermove', (e) => {
    if (!drag) return
    const p = overScreen(e) ? null : view.pick(e)
    drag.cell = p && cellAt(p)
  })
  window.addEventListener('pointerup', (e) => {
    if (!drag) return
    const p = overScreen(e) ? null : view.pick(e)
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
    // Esc puts back the Tile in the hand first, and only then lets go of what is selected.
    if (e.key === 'Escape') {
      showMenu(false)
      if (drag) drop()
      else tools.back()
    }
  })

  // A click is a press and release in one spot, and a drag moves the camera, unless the Tools take the press to draw a
  // Connection. These listen in the capture phase, so a press the Tools take never reaches the camera. Nothing is
  // picked while a Tile is in the hand or a Rebuild plays.
  let press: { x: number; y: number; gesture: Gesture | null; dragging: boolean } | null = null
  const travelled = (e: PointerEvent) => press !== null && Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP
  window.addEventListener(
    'pointerdown',
    (e) => {
      press = null
      if (e.button !== 0 || e.target !== canvas) return
      const gesture = tools.press(e)
      if (gesture) {
        e.stopPropagation()
        canvas.setPointerCapture(e.pointerId)
      }
      press = { x: e.clientX, y: e.clientY, gesture, dragging: false }
    },
    { capture: true },
  )
  window.addEventListener('pointermove', (e) => {
    if (!press?.gesture) return
    press.dragging ||= travelled(e)
    if (press.dragging) press.gesture.drag?.(e)
  })
  window.addEventListener(
    'pointerup',
    (e) => {
      if (e.button !== 0 || !press) return
      const { gesture } = press
      const click = !press.dragging && !travelled(e)
      press = null
      if (gesture) gesture.end?.(e, click)
      else if (click && e.target === canvas) tools.click(e)
    },
    { capture: true },
  )

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

      // Yen counts whole yen down, so it never shows the Price before the Tile is affordable. Its fill is full exactly
      // when the next Tile is affordable, which in a Free run, at a Price of ¥0, is always.
      const affordable = game.yen >= game.price
      show.yen(Math.floor(game.yen).toLocaleString('en'))
      show.yenFill(`${affordable ? 100 : ((100 * SHORT_OF_PRICE * game.yen) / game.price).toFixed(1)}%`)
      show.income(`${yen(game.income)} a minute`)
      show.toPrice(game.free ? 'Free run' : `of ${yen(game.price)}`)
      show.price(yen(game.price))
      const trips = Math.round(game.tripsPerMinute)
      show.trips(`${trips} ${trips === 1 ? 'trip' : 'trips'} a minute`)
      show.record(`${game.free ? 'Free-run Record' : 'Record'} ${Math.round(game.record)}`)
      const undoButton = $('undo') as HTMLButtonElement
      undoButton.classList.toggle('gone', !game.undoable)
      undoButton.disabled = view.rebuilding
      // The traffic readings wait for a Rebuild to show its cars.
      if (!view.rebuilding) {
        show.flow(`${Math.round(sim.flow * 100)}%`)
        show.flowFill(`${Math.min(100, sim.flow * 100).toFixed(1)}%`)
        $('flow').classList.toggle('holding', sim.holding)
        show.holding(sim.holding ? 'Holding' : sim.sustained > 0 ? `Holding in ${Math.ceil(WIN_TIME - sim.sustained)} s` : '')
      }
      root.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) => b.classList.toggle('on', Number(b.dataset.scale) === scale))
      tools.update()
    },
  }
}
