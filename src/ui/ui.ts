import { beyond, DIRECTIONS, LAYOUTS, type Cell, type Layout } from '../city/city'
import type { Game } from '../game/game'
import type { Held } from '../render/hand'
import { labelledDemand } from '../render/labels'
import type { Relaid, View } from '../render/view'
import type { Arm, Lane } from '../sim/network'
import { WIN_FLOW, WIN_TIME, type Vehicle } from '../sim/sim'
import type { Priority } from '../sim/spec'
import { cellAt, cellBounds } from '../sim/tiles'
import { createCameraButtons } from './camera-buttons'
import { CLICK_SLOP, watchPresses, type Gesture } from './press'

const ARM_PICK = 25 // m from where an Arm meets the Ring
const MARKER_PICK = 3 // m from a lane-end marker
const CAR_PICK = 3 // m from a car's centre
/**
 * The most of its length yen's fill takes while the next Tile is out of reach. The last step to full comes only when
 * the Tile is affordable, so a fill a pixel short of the Price never passes for full.
 */
const SHORT_OF_PRICE = 0.97
const REFUSAL = '#ff4a1f' // the hot red-orange reserved for Jams and refusals

const yen = (n: number) => `¥${Math.round(n).toLocaleString('en')}`
const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
/** A change in trips a minute, to the tenth the Gateway labels read: "+4.7 trips/min". */
const tripsChange = (change: number) => {
  const tenths = Math.round(change * 10)
  return `${tenths > 0 ? '+' : tenths < 0 ? '−' : '±'}${(Math.abs(tenths) / 10).toFixed(1)} trips/min`
}

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

/**
 * A Layout's top-down picture for the bar, north up. Its `.turn` group is turned to show the Tile the way it will land
 * on the screen.
 */
function icon(layout: Layout) {
  const roads = DIRECTIONS.filter((d) => layout.roads[d])
    .map((d) => {
      const [dx, dy] = [Math.round(Math.cos((d * Math.PI) / 2)), -Math.round(Math.sin((d * Math.PI) / 2))]
      return `<line x1="28" y1="28" x2="${28 + dx * 30}" y2="${28 + dy * 30}" stroke="#3d4456" stroke-width="13" stroke-linecap="square"/>`
    })
    .join('')
  const ring = layout.id === 'roundabout' ? '<circle cx="28" cy="28" r="11.5" fill="#8fd16f" stroke="#3d4456" stroke-width="8"/>' : ''
  return `<svg width="50" height="50" viewBox="0 0 56 56" aria-hidden="true">
    <clipPath id="disc-${layout.id}"><circle cx="28" cy="28" r="27"/></clipPath>
    <circle cx="28" cy="28" r="27" fill="#eceae4"/><g clip-path="url(#disc-${layout.id})"><g class="turn">${roads}${ring}</g></g>
    <circle cx="28" cy="28" r="26.5" fill="none" stroke="rgba(27,32,48,0.12)"/>
  </svg>`
}

/**
 * The screen (.scratch/ui-ux/spec.md, "Layout"): yen and Income top-left, the Flow gauge with trips a minute and the
 * Record top-centre, the clock top-right, the bar of Layouts with the Price and Undo bottom-centre, the camera's
 * buttons bottom-right and the menu bottom-left. While a Layout is in the hand, every click on the board drops it.
 * Otherwise, until the Tools move into the world (#107), a click near an Arm selects it and shows its Tools under the
 * clock, and a click on a car shows its route. Drags on the board move the camera.
 */
export function createUI(root: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View) {
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

  let scale = 4
  let selected: Arm | null = null
  let armed: Lane | null = null
  /** Quarter turns counterclockwise of the next drop, shared by every Layout in the bar. */
  let rotation = 0
  /**
   * The Layout in the hand, and the cell under the pointer when it is over the board. A press on a Layout in the bar
   * puts it in the hand. Released without moving, it is `picked`: it stays in the hand, every click on the board drops
   * it, and `Esc` or a right click without movement puts it back. Moved first, it is `dragged`: the release drops it
   * once and lets go. While the hand holds a Layout, nothing on the board can be selected.
   */
  let hand: { layout: Layout; how: 'pressed' | 'picked' | 'dragged'; cell: Cell | null } | null = null
  /** Where the press on the bar was, and whether it was on the Layout already picked, which a click puts back. */
  let press = { x: 0, y: 0, again: false }
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
    <div class="glass junction" id="junction" hidden>
      <div class="row"><span class="name" id="junction-name"></span><span class="soft">Esc to close</span></div>
      <div class="pair" id="priority"><button data-prio="main">Main</button><button data-prio="yield">Yield</button></div>
      <div class="soft">Click a blue lane end, then an orange one, to toggle that connection.</div>
      <button id="reset">Reset all junctions</button>
    </div>
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
          <dt>Put it back</dt><dd><kbd>Esc</kbd> or right click</dd>
          <dt>Deselect</dt><dd><kbd>Esc</kbd></dd>
          <dt>Frame the whole City</dt><dd><kbd>F</kbd></dd>
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

  const select = (arm: Arm | null) => {
    selected = arm
    armed = null
    view.inspectCar(null)
    $('junction').hidden = !arm
    if (arm) $('junction-name').textContent = `${arm.junction}: ${arm.road} arm`
    // On a roundabout the Ring is always main, so the Priority rule isn't offered there.
    $('priority').hidden = !arm || game.sim.spec.junctions[arm.junction].type !== 'priority'
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

  /**
   * What the hand shows as it stands. Over a legal cell that includes what the drop does to Demand: the Gateways it
   * would close and open, and the change in the City's total, read the way the Gateway labels read.
   */
  const held = (): Held | null => {
    if (!hand || view.rebuilding) return null
    const { layout, cell } = hand
    const city = game.city
    const empty = new Map<string, Cell>()
    for (const tile of city.tiles) {
      for (const d of DIRECTIONS) {
        const c = beyond(tile.cell, d)
        if (!city.tiles.some((t) => sameCell(t.cell, c))) empty.set(`${c.x},${c.y}`, c)
      }
    }
    const open = [...empty.values()].filter((c) => city.drop(layout, rotation, c).legal)
    const base = { layout, rotation, cell, open, after: null }
    if (!cell) return { ...base, state: 'legal', swap: false, lines: [] }
    const offer = game.offer(layout, rotation, cell)
    const swap = city.tiles.some((t) => sameCell(t.cell, cell))
    if (!offer.legal) return { ...base, state: 'refused', swap, lines: ['✕', offer.reason] }
    const after = game.preview(layout, rotation, cell)!
    const notes = [swap && 'swap', offer.price < game.price && 'loop rebate', !offer.affordable && 'not enough yen'].filter(Boolean)
    return {
      ...base,
      after,
      state: offer.affordable ? 'legal' : 'unaffordable',
      swap,
      lines: [
        yen(offer.price),
        tripsChange(labelledDemand(after) - labelledDemand(game.sim)),
        ...(notes.length ? [notes.join(' · ')] : []),
      ],
    }
  }

  // The bar: its Layouts, each with a picture that the frame turns.
  $('layouts').innerHTML = LAYOUTS.map((l) => `<div class="layout" data-layout="${l.id}">${icon(l)}${l.name}</div>`).join('')
  const bar = [...$('layouts').querySelectorAll<HTMLElement>('[data-layout]')].map((el) => ({
    el,
    layout: LAYOUTS.find((l) => l.id === el.dataset.layout)!,
  }))
  const pictures = [...$('layouts').querySelectorAll<SVGGElement>('.turn')]
  /** Turn every picture in the bar by `degrees` clockwise. */
  const turnPictures = reading((degrees) => pictures.forEach((g) => g.setAttribute('transform', `rotate(${degrees} 28 28)`)))
  for (const { el, layout } of bar) {
    el.onpointerdown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      el.releasePointerCapture?.(e.pointerId)
      press = { x: e.clientX, y: e.clientY, again: hand?.how === 'picked' && hand.layout === layout }
      hand = { layout, how: 'pressed', cell: null }
    }
  }
  const turn = (by: number) => (rotation = (((rotation + by) % 4) + 4) % 4)

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
    if (hand) return
    e.preventDefault()
    turn(e.deltaY > 0 ? -1 : 1)
  }

  /** Whether a pointer event is over a piece of the screen rather than the board. */
  const overScreen = (e: Event) => e.target instanceof Node && root.contains(e.target)
  /** Whether a pointer has moved from where it was pressed, so that its release is no click. */
  const moved = (e: PointerEvent, from: { x: number; y: number }) => Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_SLOP
  /**
   * Where the right button was last pressed, and whether the hand held a Layout then. A right click without movement
   * puts the Layout back.
   */
  let right = { x: 0, y: 0, held: false }
  window.addEventListener('pointerdown', (e) => {
    if (!sheet.hidden && !(e.target instanceof Node && $('menu').contains(e.target))) showMenu(false)
    if (e.button === 2) right = { x: e.clientX, y: e.clientY, held: hand !== null }
  })
  window.addEventListener('pointermove', (e) => {
    if (!hand) return
    if (hand.how === 'pressed' && moved(e, press)) hand.how = 'dragged'
    const p = overScreen(e) ? null : view.pick(e)
    hand.cell = p && cellAt(p)
  })
  window.addEventListener('pointerup', (e) => {
    // A right drag moves the camera, whatever the hand holds.
    if (e.button === 2 && !moved(e, right)) hand = null
    if (e.button !== 0) return
    if (hand?.how === 'pressed') hand = press.again ? null : { ...hand, how: 'picked' }
    if (hand?.how !== 'dragged') return
    const p = overScreen(e) ? null : view.pick(e)
    const { layout } = hand
    hand = null
    if (p) place(layout, rotation, cellAt(p))
  })
  // No browser menu for a right click on a Layout in the hand. On Windows the menu opens as the button comes up, after
  // that release has put the Layout back, so the press decides.
  window.addEventListener('contextmenu', (e) => {
    if (hand || right.held) e.preventDefault()
    right.held = false
  })
  // While a Tile is in the hand the wheel turns it, and the camera does not zoom.
  window.addEventListener(
    'wheel',
    (e) => {
      if (!hand) return
      e.preventDefault()
      e.stopPropagation()
      turn(e.deltaY > 0 ? -1 : 1)
    },
    { capture: true, passive: false },
  )
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') turn(e.shiftKey ? -1 : 1)
    if (e.key === 'Escape') {
      showMenu(false)
      // The Layout in the hand goes back first. Only an empty hand deselects.
      if (hand) hand = null
      else select(null)
    }
  })

  /** A press whose drag moves the camera, with a grabbing hand while it does. */
  const moving = (move: NonNullable<Gesture['drag']>, end?: Gesture['end']): Gesture => ({
    drag(e, from) {
      canvas.style.cursor = 'grabbing'
      move(e, from)
    },
    end(e, click) {
      canvas.style.cursor = ''
      end?.(e, click)
    },
  })
  // A press on the board is a click until it moves past the slop, then a drag that moves the camera: a left drag pans,
  // and a right drag rotates, as does a left drag with Shift, Ctrl or ⌘ for a trackpad. The wheel zooms toward the
  // pointer, unless a Tile in the hand takes it to turn. A right click without movement puts the Layout in the hand
  // back (above), and a right drag rotates whatever the hand holds.
  watchPresses(canvas, (e) => {
    const rotating = e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey))
    if (rotating) return moving((e, from) => view.camera.rotate(e.clientX - from.clientX, e.clientY - from.clientY))
    if (e.button !== 0) return null
    return moving(
      (e, from) => view.camera.pan(from, e),
      (e, click) => click && clickBoard(e),
    )
  })
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      // In pixels, whatever the wheel counts in; a pinch on a trackpad comes as small turns with Ctrl held.
      view.camera.zoomAt(e, e.deltaY * [1, 16, 100][e.deltaMode] * (e.ctrlKey ? 10 : 1))
    },
    { passive: false },
  )

  /**
   * A click on the board: a drop while a Layout is in the hand, and otherwise a lane end of the selected Arm, a car, an
   * Arm, or nothing. Nothing is picked during a Rebuild.
   */
  function clickBoard(e: PointerEvent) {
    if (view.rebuilding) return
    const p = view.pick(e)
    if (!p) return
    // While a Layout is in the hand, every click is a drop, and the Layout stays in the hand.
    if (hand) {
      if (hand.how === 'picked') place(hand.layout, rotation, cellAt(p))
      return
    }
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
  }

  const cameraButtons = createCameraButtons(root, view)

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
      // The hand is shown again only when what it shows changes. Yen can reach a drop's price, which a loop rebate makes
      // lower than the Price, with nothing else changing. A Change cannot: it takes a click on the screen, or on the
      // board with the hand empty, and the hand over the screen holds no cell.
      const offer = hand?.cell && !view.rebuilding ? game.offer(hand.layout, rotation, hand.cell) : null
      const key = hand ? `${hand.layout.id}:${rotation}:${hand.cell?.x},${hand.cell?.y}:${offer?.legal && offer.affordable}:${game.city.tiles.length}:${view.rebuilding}` : '' // prettier-ignore
      if (key !== shown) view.hold(held())
      shown = key
      cameraButtons.update()

      // Yen counts whole yen down, so it never shows the Price before the Tile is affordable. Its fill is full exactly
      // when the next Tile is affordable, which in a Free run, at a Price of ¥0, is always.
      const affordable = game.yen >= game.price
      // The bar: the Layout in the hand stands out, grey while the Price is out of reach, and every picture shows its
      // Tile the way it will land on the screen.
      for (const { el, layout } of bar) {
        el.classList.toggle('on', hand?.layout === layout)
        el.classList.toggle('short', hand?.layout === layout && !affordable)
      }
      turnPictures((((view.camera.heading * 180) / Math.PI - 90 * rotation) % 360).toFixed(1))
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
      root
        .querySelectorAll<HTMLButtonElement>('[data-prio]')
        .forEach((b) => b.classList.toggle('on', selected?.priority === b.dataset.prio))
    },
  }
}
