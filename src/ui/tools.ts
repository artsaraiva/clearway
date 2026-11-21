import type { Game } from '../game/game'
import type { ScreenPoint } from '../render/camera'
import { connection, type Target } from '../render/tools'
import type { View } from '../render/view'
import type { Vec } from '../sim/geometry'
import type { Arm, Connection, Junction, Lane, Network } from '../sim/network'
import { junctionId } from '../sim/tiles'
import './junction-note.css'
import type { Gesture } from './press'

const SNAP = 16 // px from a legal lane end at which a Connection being drawn snaps to it
const KINDS: Record<Junction['type'], string> = { priority: 'priority junction', roundabout: 'roundabout' }
const HINTS: Record<Junction['type'], string> = {
  priority: 'Click the paint to give a road priority. Drag between lane ends to connect them.',
  roundabout: 'Drag between lane ends to connect them. The ring always has priority.',
}
/**
 * The marks the Tools draw on the selected Junction (src/render/tools.ts), as the note's legend draws them: an Arm's
 * round marker, main or yield, and a lane end, a circle where Connections start and a ring where they end. Each sits
 * on a white disc, as in the world, and takes the Tools' blue from the note.
 */
const mark = (inner: string) =>
  `<svg width="20" height="20" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="63" fill="#fff"/>${inner}</svg>`
const RING = '<circle cx="64" cy="64" r="47" fill="none" stroke="currentColor" stroke-width="9"/>'
const MAIN = mark(`${RING}<path d="M64 38L90 64L64 90L38 64z" fill="currentColor"/>`)
const YIELD = mark(`${RING}<path d="M38 50H90L64 90z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>`)
const START = mark('<circle cx="64" cy="64" r="49" fill="currentColor"/>')
const END = mark('<circle cx="64" cy="64" r="49" fill="currentColor"/><circle cx="64" cy="64" r="27" fill="#fff"/>')

/**
 * The Tools, used in the world with no toolbar and no mode (.scratch/ui-ux/spec.md, "Tools"), and the route Inspector.
 * A soft ring lifts around the Junction under the pointer, and a click selects it: its lane ends show, and `note`, a
 * paper note in the left slot (#243, "Junction selected"), gives its Layout and its kind, an "In a Jam" stamp while it
 * is in one, the hint for the two Tools, a legend for their marks, Reset and Done, which lets go as `Esc` does. A click
 * on an Arm's give-way paint, or on the round marker at its line, flips its Priority rule. A drag from an incoming lane
 * end to a legal outgoing one turns that Connection on, or off if it was on; so does a click on each in turn. A click on
 * a car shows its route. `Esc`, a click on empty board, Done or selecting something else lets go. While `busy` (a Layout
 * in the hand) nothing is selectable.
 *
 * The page routes presses on the board here (`watchPresses`): `press` takes the ones that draw a Connection, and `click`
 * gets every other click. The Tools follow the pointer themselves for the hover.
 */
export function createTools(note: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View, busy: () => boolean) {
  note.className = 'paper junction-note'
  note.style.setProperty('--tilt', '-0.8deg')
  note.setAttribute('aria-label', 'Junction')
  note.hidden = true
  note.innerHTML = `
    <span class="tape yellow" style="--tilt: -3deg"></span>
    <header><span class="label">Junction</span><span class="stamp in-jam" hidden>In a Jam</span></header>
    <div class="heading"><h2 class="name"></h2><span class="handwritten kind"></span></div>
    <span class="rule across"></span>
    <p class="handwritten hint"></p>
    <ul class="legend">
      <li class="priority"><span class="marks">${MAIN}</span>Main road</li>
      <li class="priority"><span class="marks">${YIELD}</span>Yield</li>
      <li><span class="marks">${START}${END}</span>Lane end</li>
    </ul>
    <span class="rule across"></span>
    <div class="actions"><button class="button reset">Reset</button><button class="button primary done">Done · Esc</button></div>`
  const el = (s: string) => note.querySelector<HTMLElement>(s)!
  const [name, kind, hint, inJam] = ['.name', '.kind', '.hint', '.in-jam'].map(el)
  // A roundabout has no Priority rule, so no round markers to read.
  const rules = [...note.querySelectorAll<HTMLElement>('.legend .priority')]

  let hovered: Junction | null = null
  let selected: Junction | null = null
  let under: Target | null = null
  /** The incoming lane picked for a Connection, where the pointer has drawn it to, and the legal Connection it snaps to there. */
  let from: Lane | null = null
  let aim: Vec | null = null
  let snap: Connection | null = null
  // The canvas's own cursor, shown wherever the pointer is not over something to click.
  const rest = canvas.style.cursor

  const show = () => view.showTools({ hovered, selected, under, from, aim, snap })
  // The camera writes the cursor too, while it is dragged, so this reads it back rather than remembering it.
  const point = (c: string) => {
    if (canvas.style.cursor !== c) canvas.style.cursor = c
  }
  const letGo = () => {
    from = aim = snap = null
  }

  /** The "In a Jam" stamp follows the selected Junction's Jam, as its marker does. */
  const stamp = () => {
    const id = selected?.id
    const jammed = id !== undefined && game.sim.jams.some((j) => j.id === id)
    if (inJam.hidden === jammed) inJam.hidden = !jammed
  }

  const select = (junction: Junction | null) => {
    selected = junction
    under = null
    letGo()
    note.hidden = !junction
    if (junction) {
      view.inspectCar(null)
      name.textContent = game.city.tiles.find((t) => junctionId(t.cell) === junction.id)?.layout.name ?? 'Junction'
      kind.textContent = KINDS[junction.type]
      hint.textContent = HINTS[junction.type]
      for (const li of rules) li.hidden = junction.type !== 'priority'
      stamp()
    }
    show()
  }

  /** Draw the Connection from the picked lane to the pointer, snapped to the nearest legal lane end within reach. */
  const follow = (e: ScreenPoint) => {
    const lane = from
    if (!lane || !selected) return
    aim = view.pick(e)
    const end = view.toolAt(e, selected, SNAP, (t) => t.kind === 'out' && connection(lane, t.lane) !== null)
    snap = end?.kind === 'out' ? connection(lane, end.lane) : null
  }

  const toggle = (c: Connection) => game.apply({ at: c.arm.junction, [c.enabled ? 'disable' : 'enable']: [c.ref] })
  const flip = (arm: Arm) => game.apply({ at: arm.junction, priority: { [arm.road]: arm.priority === 'main' ? 'yield' : 'main' } })

  /** The halo, the target under the pointer and the cursor follow the pointer, and so does a Connection being drawn. */
  const hover = (e: PointerEvent) => {
    if (busy()) return
    if (from) follow(e)
    // While the camera is dragged, nothing lifts under the pointer.
    const board = e.buttons === 0 && e.target === canvas
    hovered = board ? view.junctionAt(e) : null
    under = board && selected ? view.toolAt(e, selected) : null
    if (e.buttons === 0) point(board && ((hovered && hovered !== selected) || under) ? 'pointer' : rest)
    show()
  }

  /** Where a Connection being drawn is let go: on a legal lane end it turns that Connection on, or off; anywhere else nothing changes. */
  const land = (e: PointerEvent) => {
    follow(e)
    if (snap) toggle(snap)
    letGo()
  }

  /**
   * A press on an incoming lane end of the selected Junction draws a Connection from it, and so does the second press
   * of click-then-click, on a legal lane end. Every other press is the camera's.
   */
  const press = (e: PointerEvent): Gesture | null => {
    if (busy() || !selected) return null
    const t = view.toolAt(e, selected)
    const picked = from
    if (t?.kind === 'in') {
      from = t.lane
      follow(e)
      point('grabbing')
      show()
      return {
        drag(e) {
          follow(e)
          show()
        },
        end(e, click) {
          // A click picks the lane end for a click on an outgoing one next, or lets go of it if it was picked already.
          if (!click) land(e)
          else if (picked === t.lane) letGo()
          hover(e)
        },
      }
    }
    if (picked && t?.kind === 'out' && connection(picked, t.lane))
      return {
        end(e) {
          land(e)
          hover(e)
        },
      }
    return null
  }

  /** A click on the board that no press of the Tools took. */
  const click = (e: PointerEvent) => {
    if (busy()) return
    letGo()
    const t = selected && view.toolAt(e, selected)
    const junction = view.junctionAt(e)
    if (t?.kind === 'rule') flip(t.arm)
    // Anywhere else on the selected Junction, a click only lets go of a picked lane end.
    else if (!t && !(selected && junction === selected)) {
      // A car or empty board lets the Junction go.
      const car = junction ? null : view.carAt(e)
      select(junction)
      if (!junction) view.inspectCar(car)
    }
    hover(e)
  }

  /** Let go of everything the Tools show. */
  const clear = () => {
    hovered = null
    select(null)
    point(rest)
  }

  el('.reset').onclick = () => {
    if (!selected) return
    letGo()
    game.reset(selected.id)
    show()
  }
  el('.done').onclick = () => select(null)
  window.addEventListener('pointermove', hover)
  canvas.addEventListener('pointerleave', () => {
    if (from || !(hovered || under)) return
    hovered = under = null
    show()
  })

  return {
    press,
    click,
    clear,
    /** Select `junction`, as a click on it does. */
    select,

    /** The selected Junction. */
    get selected() {
      return selected
    },

    /**
     * Find what the Tools show again on `net`, the network a Tile landing grew from the one before: the Junction
     * selected and the lane end picked, by id, so a Change goes on being made while Tiles land. What the pointer is over
     * is found again as it moves.
     */
    moveOnto(net: Network) {
      const again = (j: Junction | null) => (j && net.junctions.find((k) => k.id === j.id)) ?? null
      hovered = again(hovered)
      selected = again(selected)
      from = (selected && from && net.lanes.find((l) => l.id === from!.id)) ?? null
      under = snap = null
      if (!from) aim = null
      note.hidden = !selected
      show()
    },

    /** `Esc`: let go of the Connection being drawn, then of the selection and the route. */
    back() {
      if (from) {
        letGo()
        return show()
      }
      select(null)
      view.inspectCar(null)
    },

    /** Call it every frame: with a Layout in the hand, nothing stays selected, and the stamp follows the Jams. */
    update() {
      if (busy() && (selected || hovered)) clear()
      stamp()
    },
  }
}
