import { beyond, DIRECTIONS, FIRST_ZONE, LAYOUTS, ZONES, type Cell, type Layout, type Zone } from '../city/city'
import type { Game } from '../game/game'
import type { Run } from '../game/save'
import type { Held, Rezoning } from '../render/hand'
import { labelledDemand } from '../render/labels'
import type { Relaid, View } from '../render/view'
import { cellAt, cellBounds } from '../sim/tiles'
import { createCameraButtons } from './camera-buttons'
import { createGrowth } from './growth'
import { createJamMarkers } from './jams'
import { CLICK_SLOP, watchPresses, type Gesture } from './press'
import { createStageInspector } from './stage-inspector'
import { createStrip } from './strip'
import { createTools } from './tools'

/** The picks of the bar's second row, in order: each Zone, then none, which the bar calls Roads only. */
const ZONE_PICKS: (Zone | undefined)[] = [...ZONES, undefined]
/** A Zone's name, or the bar's for none. */
const nameOf = (zone: Zone | undefined) => zone?.name ?? 'Roads only'

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

// The Zones' pictures: what each builds, seen from above at a slant on a small disc. Their colours are the world's.
const ZONE_PICTURES: Record<Zone['id'] | 'none', string> = {
  'low-density': `<circle cx="20" cy="20" r="19" fill="#cdeaad"/>
    <rect x="8" y="21" width="15" height="11" rx="1.5" fill="#fdeed6"/><path d="M6 22.5 15.5 13l9.5 9.5z" fill="#d56454"/>
    <rect x="13.5" y="25" width="4" height="7" fill="#9cc7df"/>
    <circle cx="29.5" cy="22" r="5.5" fill="#6bc357"/><circle cx="27" cy="18.5" r="3.6" fill="#92d76e"/>
    <rect x="28.8" y="26" width="1.6" height="6" fill="#a1714c"/>`,
  'medium-density': `<circle cx="20" cy="20" r="19" fill="#f4e6cf"/>
    <rect x="6.5" y="19" width="9" height="13" fill="#f6dfb4"/><rect x="15.5" y="15.5" width="9" height="16.5" fill="#fff4e2"/>
    <rect x="24.5" y="20" width="9" height="12" fill="#d6e4d3"/>
    <path d="M5.8 19.6 7.8 15.6h6.4l2 4z" fill="#4d6575"/><path d="M14.8 16.1 16.8 12.1h6.4l2 4z" fill="#b85a4c"/>
    <path d="M23.8 20.6 25.8 16.6h6.4l2 4z" fill="#5aa69b"/>
    <path d="M8.6 21.5h2.4v2.6H8.6zM17.6 18.5H20v2.6h-2.4zM17.6 23.5H20v2.6h-2.4zM26.6 22.5H29v2.6h-2.4z" fill="#9cc7df"/>
    <path d="M12 27h2v5h-2zM21 27h2v5h-2zM30 27h2v5h-2z" fill="#8a5a3c"/>`,
  'high-density': `<circle cx="20" cy="20" r="19" fill="#dae4f1"/>
    <rect x="10.5" y="30.5" width="19" height="3.5" rx="1" fill="#e9e4da"/>
    <path d="M26 9.4 29.6 8v22.6L26 31z" fill="#e2d6c2"/>
    <rect x="13" y="9" width="14" height="22" rx="1" fill="#fbf3e6"/><rect x="12.4" y="7.6" width="15.2" height="2.2" rx="0.8" fill="#e9e4da"/>
    <path d="M15.4 11.5v17.8M24.6 11.5v17.8" stroke="#9cc7df" stroke-width="2" stroke-dasharray="2 1.7"/>
    <path d="M18.2 12.5h3.6M18.2 16.2h3.6M18.2 19.9h3.6M18.2 23.6h3.6M18.2 27.3h3.6" stroke="#c9cfd6" stroke-width="1.6"/>
    <rect x="15" y="4.6" width="3" height="3.2" fill="#cea680"/><path d="M14.6 4.8 16.5 3.3l1.9 1.5z" fill="#b68b63"/>
    <circle cx="23.6" cy="6.6" r="1.5" fill="#5fbc51"/>`,
  offices: `<circle cx="20" cy="20" r="19" fill="#e2eef5"/>
    <rect x="9" y="8" width="11" height="25" rx="1" fill="#7b9db0"/><rect x="9" y="7" width="11" height="2.4" rx="1" fill="#f2f4f6"/>
    <path d="M12.7 9.5v23M16.3 9.5v23" stroke="#dde3e8" stroke-width="0.9"/>
    <rect x="21.5" y="15" width="10" height="18" rx="1" fill="#8fadc0"/><rect x="21.5" y="14" width="10" height="2.4" rx="1" fill="#f2f4f6"/>
    <path d="M21.5 20.5h10M21.5 25h10M21.5 29.5h10" stroke="#dde3e8" stroke-width="0.9"/>`,
  shops: `<circle cx="20" cy="20" r="19" fill="#fde6df"/>
    <rect x="7" y="13" width="26" height="8" fill="#fff7e8"/><rect x="6.5" y="11.5" width="27" height="2" rx="0.6" fill="#fff1c7"/>
    <path d="M10 15h3v3h-3zM18.5 15h3v3h-3zM27 15h3v3h-3z" fill="#9cc7df"/>
    <rect x="7" y="21" width="26" height="11" fill="#2fb39a"/>
    <path d="M6.4 21h27.2l-1 3.6H7.4z" fill="#fbf8f2"/><path d="M6.4 21h4.5l-.2 3.6H7.4zM15.4 21h4.5l-.1 3.6h-4.5zM24.5 21H29l.1 3.6h-4.5z" fill="#f0b43c"/>
    <rect x="9.5" y="26" width="12" height="4.6" fill="#9cc7df"/><rect x="24.5" y="26" width="4.4" height="6" fill="#fbf8f2"/>`,
  industrial: `<circle cx="20" cy="20" r="19" fill="#e2e6e9"/>
    <rect x="27" y="6.5" width="3.4" height="15" fill="#a8604f"/><rect x="26.8" y="8.6" width="3.8" height="1.4" fill="#f4f1ea"/>
    <rect x="6" y="21" width="28" height="11" fill="#c9d1d6"/>
    <path d="M6 21v-5.5l7 5.5v-5.5l7 5.5v-5.5l7 5.5v-5.5l7 5.5z" fill="#8f9aa5"/>
    <path d="M9 25h6v7H9zM19 25h6v7h-6z" fill="#f0c75e"/>
    <path d="M9 27.3h6M9 29.6h6M19 27.3h6M19 29.6h6" stroke="#d9b45c" stroke-width="0.7"/>`,
  parks: `<circle cx="20" cy="20" r="19" fill="#b0df88"/>
    <ellipse cx="18" cy="25.5" rx="10" ry="5.6" fill="#ddd6c9"/><ellipse cx="18" cy="25.5" rx="8.9" ry="4.8" fill="#63d1f4"/>
    <rect x="6.2" y="24.7" width="4.4" height="1.6" rx="0.4" fill="#bb5d0d"/>
    <rect x="28.7" y="15.5" width="1.4" height="5" fill="#a1714c"/><circle cx="29.4" cy="13" r="4.6" fill="#6bc357"/>
    <rect x="12.3" y="12" width="1.4" height="4.5" fill="#a1714c"/><circle cx="13" cy="10" r="3.8" fill="#ffadc8"/>
    <circle cx="21.5" cy="12.5" r="3" fill="#85cf61"/>`,
  green: `<circle cx="20" cy="20" r="19" fill="#b9e293"/>
    <rect x="11.3" y="18" width="1.4" height="4" fill="#a1714c"/><path d="M12 6.5 7.5 14.5h9zM12 10.5 7 19h10z" fill="#379e62"/>
    <rect x="23.3" y="17" width="1.4" height="4.5" fill="#a1714c"/><circle cx="24" cy="13.5" r="4.6" fill="#7bcd5d"/>
    <circle cx="30" cy="17.5" r="2.6" fill="#ffbbd1"/>
    <rect x="7.5" y="25" width="11" height="3.6" rx="1.8" fill="#ffd1df"/><rect x="21" y="23.5" width="10.5" height="3.4" rx="1.7" fill="#f6d36a"/>
    <rect x="14.5" y="30.5" width="10" height="3.2" rx="1.6" fill="#c7b8f0"/>`,
  farms: `<circle cx="20" cy="20" r="19" fill="#cdb08a"/>
    <path d="M5.5 24h29M4.6 27.5h30.8M5.6 31h28.8M8.3 34.5h23.4" stroke="#7bc35e" stroke-width="2"/>
    <path d="M3.4 20.5h5" stroke="#e3c76a" stroke-width="2"/>
    <rect x="22.5" y="8.5" width="4.4" height="10.5" fill="#e9eef2"/><path d="M22.5 8.8a2.2 2.2 0 0 1 4.4 0z" fill="#9aa7b2"/>
    <rect x="9" y="12" width="11" height="7.5" fill="#b85a4c"/><path d="M8.3 12.5 14.5 7.8l6.2 4.7z" fill="#5b6b7a"/>
    <rect x="13.2" y="15.3" width="2.6" height="4.2" fill="#f4f1ea"/>`,
  none: `<circle cx="20" cy="20" r="19" fill="#cdeaad"/>
    <circle cx="12.5" cy="24" r="4.6" fill="#5fbc51"/><circle cx="15.5" cy="21.5" r="3.4" fill="#85cf61"/>
    <circle cx="27" cy="15.5" r="3.8" fill="#6bc357"/><circle cx="28" cy="27" r="3.1" fill="#7bcd5d"/>`,
}

/** A Zone's picture, or Roads only's for none: a disc like a Layout's, smaller. */
const zonePicture = (zone: Zone | undefined) =>
  `<svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true">${ZONE_PICTURES[zone?.id ?? 'none']}
    <circle cx="20" cy="20" r="18.5" fill="none" stroke="rgba(27,32,48,0.12)"/></svg>`

/**
 * The screen (#243, "In play"; .scratch/ui-ux/spec.md, "Layout", for what #243 has not yet rebuilt): the status strip
 * along the bottom with the speeds and every reading (`./strip`), the bar of Layouts and Zones with the Price and Undo
 * above it, the selected Junction's panel top-right, the camera's buttons above the strip on the right with the Stage
 * Inspector's toggle (`./stage-inspector`), and the menu above it on the left, which leaves the run through `run`.
 * While a Layout is in the hand, every click on the board drops it. Otherwise the Tools and the route Inspector are
 * used in the world (`./tools`). Drags on the board move the camera, except a drag from a lane end of the selected
 * Junction, which draws a Connection.
 */
export function createUI(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  game: Game,
  view: View,
  run: Pick<Run, 'newRun' | 'switchRun' | 'screen'>,
) {
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!

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
  /** The Zone every Tile laid next is built as, until another is picked; none for Roads only. It is not saved. */
  let zone: Zone | undefined = FIRST_ZONE
  /**
   * A Zone pressed in the bar, where the press was, and once the pointer has moved past a click's slop, the cell under
   * it over the board. Let go over a placed Tile, it rezones that Tile. A Zone never goes in the hand.
   */
  let dragging: { zone: Zone | undefined; from: { x: number; y: number }; moved: boolean; cell: Cell | null } | null = null
  /** The pick in the bar's second row the pointer is over, whose name the row shows. */
  let hovering: number | null = null
  /** What the Rezoning last showed. */
  let shownRezoning = ''

  root.innerHTML = `
    <div class="glass junction" id="junction" hidden></div>
    <div class="glass bar" id="tray">
      <div class="picks">
        <div class="layouts" id="layouts"></div>
        <div class="zones"><span class="zone-name" id="zone-name"></span><div class="zone-picks" id="zone-picks"></div></div>
      </div>
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
          <dt>Pause, and back</dt><dd><kbd>Space</kbd></dd>
          <dt>1×, 4×, 8×</dt><dd><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dd>
          <dt>Turn the tile</dt><dd><kbd>R</kbd> or wheel</dd>
          <dt>Turn it back</dt><dd><kbd>Shift</kbd> <kbd>R</kbd></dd>
          <dt>Put it back</dt><dd><kbd>Esc</kbd> or right click</dd>
          <dt>Deselect</dt><dd><kbd>Esc</kbd></dd>
          <dt>Frame the whole City</dt><dd><kbd>F</kbd></dd>
          <dt>Stage Inspector</dt><dd><kbd>G</kbd></dd>
        </dl>
      </div>
    </div>`

  const text = (id: string) => {
    const el = $(id)
    return reading((value) => (el.textContent = value))
  }
  const show = {
    price: text('price'),
    zoneName: text('zone-name'),
  }
  const strip = createStrip(root, game, view)

  /** Play the Rebuild the game just made. */
  const rebuilt = (relaid: Relaid) => {
    tools.clear()
    view.rebuild(game.sim, relaid)
  }

  /**
   * Whether a Tile is in its Assembly, or the traffic is halted behind one: no Tile is dropped or rezoned until then.
   * ponytail: one Assembly at a time. An Undo is still allowed during one, which lands the Tile at once and takes it
   * off, and its window opens once the Tile has landed. ADR 0006 has several Tiles assemble at once and land in the order dropped: queue the drops in the game
   * when a placement takes effect at its landing (#233).
   */
  const assembling = () => view.rebuilding || view.assembling

  /**
   * Drop a Layout on a cell: a placement built as the Zone picked, or a Swap on a placed Tile, which keeps its own.
   * Refused until the Tile dropped before has landed.
   */
  const place = (layout: Layout, turns: number, cell: Cell) => {
    if (assembling()) return false
    const offer = game.place(layout, turns, cell, zone)
    if (!offer.legal) return false
    if (!offer.affordable) {
      strip.refuse()
      return false
    }
    rebuilt(offer.swap ? { swapped: cellBounds(cell) } : { placed: cellBounds(cell) })
    return true
  }

  /** Rezone the placed Tile on `cell` as `built`, or unzone it: no yen, and no Rebuild. Refused during an Assembly. */
  const rezone = (cell: Cell, built: Zone | undefined) => {
    if (assembling() || !game.rezone(cell, built)) return false
    view.rezone(game.sim, cellBounds(cell))
    return true
  }

  const undo = () => {
    if (view.rebuilding) return
    const before = game.city.tiles
    if (!game.undo()) return
    // An Undo of a placement takes its Tile off; an Undo of a Swap puts the Tile before it back on its cell, and an
    // Undo of a Rezoning its Zone, with no Rebuild.
    const after = game.city
    const gone = before.find((t) => !after.tileAt(t.cell))
    const changed = before.find((t) => {
      const now = after.tileAt(t.cell)
      return now && (now.layout !== t.layout || now.rotation !== t.rotation)
    })
    const rezoned = before.find((t) => after.tileAt(t.cell)?.zone !== t.zone)
    if (gone) rebuilt({ removed: cellBounds(gone.cell) })
    else if (changed) rebuilt({ swapped: cellBounds(changed.cell) })
    else if (rezoned) view.rezone(game.sim, cellBounds(rezoned.cell))
  }

  /**
   * What the hand shows as it stands. Over a legal cell that includes what the drop does to Demand: the Gateways it
   * would close and open, and the change in the City's total, read the way the Gateway labels read; and what the Tile
   * will be built as: the Zone picked, or over a placed Tile, where the drop is a Swap, that Tile's own. The hand is
   * empty while a Zone is dragged.
   */
  const held = (): Held | null => {
    if (!hand || assembling() || dragging?.moved) return null
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
    const placed = city.tileAt(cell)
    const swap = placed !== undefined
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
        [nameOf(placed ? placed.zone : zone), ...notes].join(' · '),
      ],
    }
  }

  /** What letting go of the Zone dragged would make of the placed Tile under it, if it is over one. */
  const rezoning = (): Rezoning | null => {
    const tile = dragging?.moved && dragging.cell && !assembling() ? game.city.tileAt(dragging.cell) : undefined
    if (!dragging || !tile) return null
    const becomes = nameOf(dragging.zone).toLowerCase()
    return tile.zone === dragging.zone
      ? { cell: tile.cell, state: 'unchanged', lines: ['No change', `already ${becomes}`] }
      : { cell: tile.cell, state: 'legal', lines: ['Rezone', `to ${becomes}`] }
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

  // The bar's second row: each Zone, then Roads only. A click picks what the Tiles laid next are built as; a drag
  // onto a placed Tile rezones it, with the Zone's picture following the pointer.
  $('zone-picks').innerHTML = ZONE_PICKS.map((z) => `<button class="zone" aria-label="${nameOf(z)}">${zonePicture(z)}</button>`).join('')
  const zoneButtons = [...$('zone-picks').querySelectorAll<HTMLButtonElement>('.zone')]
  const ghost = document.createElement('div')
  ghost.className = 'zone-ghost'
  ghost.hidden = true
  root.append(ghost)
  zoneButtons.forEach((el, i) => {
    const pick = ZONE_PICKS[i]
    el.onclick = () => (zone = pick)
    el.onpointerenter = () => (hovering = i)
    el.onpointerleave = () => (hovering = null)
    el.onpointerdown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      el.releasePointerCapture?.(e.pointerId)
      dragging = { zone: pick, from: { x: e.clientX, y: e.clientY }, moved: false, cell: null }
      ghost.innerHTML = zonePicture(pick)
    }
  })
  /** Let go of the Zone dragged, without rezoning anything. */
  const dropZone = () => {
    dragging = null
    ghost.hidden = true
  }

  const sheet = $('menu-sheet')
  const showMenu = (open: boolean) => {
    sheet.hidden = !open
    $('menu-button').setAttribute('aria-expanded', String(open))
  }
  $('undo').onclick = undo
  $('menu-button').onclick = () => showMenu(sheet.hidden)
  // A new run takes the place of this one, so it asks first. The Free run switch moves between the two saved runs and
  // loses nothing.
  $('new-run').onclick = () => {
    if (confirm(`Start a new ${game.free ? 'Free run' : 'run'}? This City will be lost.`)) run.newRun()
  }
  $('free-run').onclick = run.switchRun
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
    if (e.button === 2) right = { x: e.clientX, y: e.clientY, held: hand !== null || dragging !== null }
  })
  const tools = createTools($('junction'), canvas, game, view, () => hand !== null || view.rebuilding)
  const jams = createJamMarkers(root, canvas, game, view, tools, () => hand !== null)
  // A Tile that reaches a Stage shows it there and then, with no Rebuild.
  game.onStage = (cell, from, to) => view.stageUp(cellBounds(cell), from, to)
  const growth = createGrowth(root, canvas, game, view, () => hand !== null || dragging !== null)
  window.addEventListener('pointermove', (e) => {
    if (dragging) {
      if (moved(e, dragging.from)) dragging.moved = true
      const p = overScreen(e) ? null : view.pick(e)
      dragging.cell = p && cellAt(p)
      ghost.hidden = !dragging.moved
      ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY - 44}px)`
    }
    if (!hand) return
    if (hand.how === 'pressed' && moved(e, press)) hand.how = 'dragged'
    const p = overScreen(e) ? null : view.pick(e)
    hand.cell = p && cellAt(p)
  })
  window.addEventListener('pointerup', (e) => {
    // A right drag moves the camera, whatever the hand holds. A right click lets go of a Zone dragged first.
    if (e.button === 2 && !moved(e, right)) {
      if (dragging) dropZone()
      else hand = null
    }
    if (e.button !== 0) return
    // A Zone let go over a placed Tile rezones it. Over anything else, or before it moved, nothing happens: a click
    // on it picks it.
    if (dragging) {
      const p = dragging.moved && !overScreen(e) ? view.pick(e) : null
      const built = dragging.zone
      dropZone()
      if (p) rezone(cellAt(p), built)
    }
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
    // Esc lets go of a Zone dragged, or puts back the Tile in the hand, before it lets go of what is selected.
    if (e.key === 'Escape') {
      showMenu(false)
      if (dragging) dropZone()
      else if (hand) hand = null
      else tools.back()
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
  // and a right drag rotates, as does a left drag with Shift, Ctrl or ⌘ for a trackpad. A left press on a lane end of
  // the selected Junction is the Tools': its drag draws a Connection, and the camera never sees it. The wheel zooms
  // toward the pointer, unless a Tile in the hand takes it to turn. A right click without movement puts the Layout in
  // the hand back (above), and a right drag rotates whatever the hand holds.
  watchPresses(canvas, (e) => {
    const rotating = e.button === 2 || (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey))
    if (rotating) return moving((e, from) => view.camera.rotate(e.clientX - from.clientX, e.clientY - from.clientY))
    if (e.button !== 0) return null
    return (
      tools.press(e) ??
      moving(
        (e, from) => view.camera.pan(from, e),
        (e, click) => click && clickBoard(e),
      )
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
   * A click on the board: a drop while a Layout is in the hand, and otherwise the Tools' (a Junction, an Arm's Priority
   * rule, a car, or empty board). Nothing is picked during a Rebuild.
   */
  function clickBoard(e: PointerEvent) {
    if (view.rebuilding) return
    // While a Layout is in the hand, every click is a drop, and the Layout stays in the hand.
    if (hand) {
      const p = view.pick(e)
      if (hand.how === 'picked' && p) place(hand.layout, rotation, cellAt(p))
      return
    }
    tools.click(e)
  }

  const cameraButtons = createCameraButtons(root, view)
  const stageInspector = createStageInspector(cameraButtons.box, game, view, run.screen)

  return {
    /** Sim seconds per real second: 0 while paused. */
    get scale() {
      return strip.speed
    },

    place,
    undo,
    rezone,

    /** Pick what the Tiles laid next are built as, as a click on the bar's second row does. None: Roads only. */
    pick(built: Zone | undefined) {
      zone = built
    },

    /** Show the game as it stands. Call it every frame. */
    update() {
      // The hand is shown again only when what it shows changes. Yen can reach a drop's price, which a loop rebate makes
      // lower than the Price, with nothing else changing. A Change cannot: it takes a click on the screen, or on the
      // board with the hand empty, and the hand over the screen holds no cell.
      const offer = hand?.cell && !assembling() ? game.offer(hand.layout, rotation, hand.cell) : null
      const under = hand?.cell && game.city.tileAt(hand.cell)
      const key = hand ? `${hand.layout.id}:${rotation}:${hand.cell?.x},${hand.cell?.y}:${offer?.legal && offer.affordable}:${game.city.tiles.length}:${assembling()}:${zone?.id}:${under && under.zone?.id}:${dragging?.moved}` : '' // prettier-ignore
      if (key !== shown) view.hold(held())
      shown = key
      const target = dragging?.moved && dragging.cell ? game.city.tileAt(dragging.cell) : undefined
      const rezoningKey =
        dragging && target ? `${dragging.zone?.id}:${target.cell.x},${target.cell.y}:${target.zone?.id}:${assembling()}` : ''
      if (rezoningKey !== shownRezoning) view.showRezoning(rezoning())
      shownRezoning = rezoningKey
      cameraButtons.update()

      const affordable = game.yen >= game.price
      // The bar: the Layout in the hand stands out, grey while the Price is out of reach, and every picture shows its
      // Tile the way it will land on the screen.
      for (const { el, layout } of bar) {
        el.classList.toggle('on', hand?.layout === layout)
        el.classList.toggle('short', hand?.layout === layout && !affordable)
      }
      // The Zone picked stands out, and the row names the one under the pointer, or else the one picked.
      zoneButtons.forEach((el, i) => el.classList.toggle('on', ZONE_PICKS[i] === zone))
      show.zoneName(nameOf(hovering === null ? zone : ZONE_PICKS[hovering]))
      turnPictures((((view.camera.heading * 180) / Math.PI - 90 * rotation) % 360).toFixed(1))
      show.price(yen(game.price))
      const undoButton = $('undo') as HTMLButtonElement
      undoButton.classList.toggle('gone', !game.undoable)
      undoButton.disabled = view.rebuilding
      strip.update()
      tools.update()
      jams.update()
      growth.update()
      stageInspector.update()
    },
  }
}
