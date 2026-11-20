import { beyond, DIRECTIONS, FIRST_ZONE, type Cell, type Layout, type Zone } from '../city/city'
import type { Game } from '../game/game'
import type { Run } from '../game/save'
import type { Held, Rezoning } from '../render/hand'
import { labelledDemand } from '../render/labels'
import type { Relaid, View } from '../render/view'
import { cellAt, cellBounds } from '../sim/tiles'
import { createCameraButtons } from './camera-buttons'
import { createCityNotes } from './city-notes'
import { createGrowth } from './growth'
import { createJamMarkers } from './jams'
import { createPaused } from './paused'
import { CLICK_SLOP, watchPresses, type Gesture } from './press'
import { createStageInspector } from './stage-inspector'
import { createStrip } from './strip'
import { createToolbar, nameOf, zonePicture } from './toolbar'
import { createTools } from './tools'
import './screen.css'

const yen = (n: number) => `¥${Math.round(n).toLocaleString('en')}`
const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
/** A change in trips a minute, to the tenth the Gateway labels read: "+4.7 trips/min". */
const tripsChange = (change: number) => {
  const tenths = Math.round(change * 10)
  return `${tenths > 0 ? '+' : tenths < 0 ? '−' : '±'}${(Math.abs(tenths) / 10).toFixed(1)} trips/min`
}

/**
 * The screen (#243, "In play"; .scratch/ui-ux/spec.md, "Layout", for what #243 has not yet rebuilt): the status strip
 * along the bottom with the speeds and every reading (`./strip`), the toolbar above it with the Layouts, the Zone, the
 * Price and Undo (`./toolbar`), the selected Junction's panel top-right, the camera's buttons above the strip on the
 * right with the Stage Inspector's toggle (`./stage-inspector`), and top-left the menu sticker, which pauses the game
 * under the Paused memo and leaves the run through `run` (`./paused`), then the City notes sticker, which opens City
 * notes in the left slot under them (`./city-notes`).
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

  /** Quarter turns counterclockwise of the next drop, shared by every Layout in the toolbar. */
  let rotation = 0
  /**
   * The Layout in the hand, and the cell under the pointer when it is over the board. A press on a Layout's card puts
   * it in the hand. Released without moving, it is `picked`: it stays in the hand, every click on the board drops
   * it, and `Esc` or a right click without movement puts it back. Moved first, it is `dragged`: the release drops it
   * once and lets go. While the hand holds a Layout, nothing on the board can be selected.
   */
  let hand: { layout: Layout; how: 'pressed' | 'picked' | 'dragged'; cell: Cell | null } | null = null
  /** Where the press on the card was, and whether it was on the Layout already picked, which a click puts back. */
  let press = { x: 0, y: 0, again: false }
  /** What the hand last showed, so that it is only rebuilt when that changes. */
  let shown = ''
  /** The Zone every Tile laid next is built as, until another is picked; none for Roads only. It is not saved. */
  let zone: Zone | undefined = FIRST_ZONE
  /**
   * A Zone pressed in the palette, where the press was, and once the pointer has moved past a click's slop, the cell
   * under it over the board. Let go over a placed Tile, it rezones that Tile. A Zone never goes in the hand.
   */
  let dragging: { zone: Zone | undefined; from: { x: number; y: number }; moved: boolean; cell: Cell | null } | null = null
  /** What the Rezoning last showed. */
  let shownRezoning = ''

  root.innerHTML = `
    <div class="glass junction" id="junction" hidden></div>
    <div class="corner" id="corner"></div>`

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

  // The toolbar. A press on a Layout's card puts it in the hand; Enter or Space on a focused card picks it, or puts it
  // back. A click on a Zone in the palette picks what the Tiles laid next are built as; a drag onto a placed Tile
  // rezones it, with the Zone's picture following the pointer.
  const toolbar = createToolbar(root, { pick: (built) => (zone = built), undo })
  for (const { el, layout } of toolbar.cards) {
    el.onpointerdown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      el.releasePointerCapture?.(e.pointerId)
      press = { x: e.clientX, y: e.clientY, again: hand?.how === 'picked' && hand.layout === layout }
      hand = { layout, how: 'pressed', cell: null }
    }
    el.onclick = (e) => {
      if (e.detail === 0) hand = hand?.layout === layout ? null : { layout, how: 'picked', cell: null }
    }
  }
  const turn = (by: number) => (rotation = (((rotation + by) % 4) + 4) % 4)
  const ghost = document.createElement('div')
  ghost.className = 'zone-ghost'
  ghost.hidden = true
  root.append(ghost)
  for (const { el, zone: pick } of toolbar.zones) {
    el.onpointerdown = (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      el.releasePointerCapture?.(e.pointerId)
      dragging = { zone: pick, from: { x: e.clientX, y: e.clientY }, moved: false, cell: null }
      ghost.innerHTML = zonePicture(pick)
    }
  }
  /** Let go of the Zone dragged, without rezoning anything. */
  const dropZone = () => {
    dragging = null
    ghost.hidden = true
  }

  toolbar.el.onwheel = (e) => {
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
    // Esc lets go of a Zone dragged, or closes the Zone palette, or puts back the Tile in the hand, before it lets go of
    // what is selected.
    if (e.key === 'Escape') {
      if (dragging) dropZone()
      else if (toolbar.closePalette()) return
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
  // The Paused memo lets go of what the hand holds as it opens.
  createPaused($('corner'), root, game, run, strip, () => {
    hand = null
    dropZone()
  })
  const stageInspector = createStageInspector(root, cameraButtons.box, game, view, run.screen)
  // Under the top-left stickers, the slot that holds one panel at a time.
  const leftSlot = document.createElement('div')
  leftSlot.className = 'left-slot'
  $('corner').after(leftSlot)
  const cityNotes = createCityNotes($('corner'), leftSlot, game, view, run.screen)

  return {
    /** Sim seconds per real second: 0 while paused. */
    get scale() {
      return strip.speed
    },

    place,
    undo,
    rezone,

    /** Pick what the Tiles laid next are built as, as a click in the Zone palette does. None: Roads only. */
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

      toolbar.update({
        held: hand?.layout,
        short: game.yen < game.price,
        zone,
        turn: ((view.camera.heading * 180) / Math.PI - 90 * rotation) % 360,
        price: game.price,
        free: game.free,
        undoable: game.undoable,
        busy: view.rebuilding,
      })
      strip.update()
      tools.update()
      jams.update()
      growth.update()
      stageInspector.update()
      cityNotes.update()
    },
  }
}
