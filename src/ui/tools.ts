import type { Game } from '../game/game'
import type { ScreenPoint } from '../render/camera'
import { connection, type Target } from '../render/tools'
import type { View } from '../render/view'
import type { Vec } from '../sim/geometry'
import type { Arm, Connection, Junction, Lane } from '../sim/network'
import { junctionId } from '../sim/tiles'
import type { Gesture } from './press'

const SNAP = 16 // px from a legal lane end at which a Connection being drawn snaps to it
const HINTS: Record<Junction['type'], string> = {
  priority: 'Click the paint to give a road priority. Drag between lane ends to connect them.',
  roundabout: 'Drag between lane ends to connect them. The ring always has priority.',
}

/**
 * The Tools, used in the world with no toolbar and no mode (.scratch/ui-ux/spec.md, "Tools"), and the route Inspector.
 * A soft ring lifts around the Junction under the pointer, and a click selects it: its lane ends show, and `panel` gives
 * its name, Reset and a hint. A click on an Arm's give-way paint, or on the round marker at its line, flips its Priority
 * rule. A drag from an incoming lane end to a legal outgoing one turns that Connection on, or off if it was on; so does
 * a click on each in turn. A click on a car shows its route. `Esc`, a click on empty board or selecting something else
 * lets go. While `busy` (a Layout in the hand, or a Rebuild playing) nothing is selectable.
 *
 * The page routes presses on the board here (`watchPresses`): `press` takes the ones that draw a Connection, and `click`
 * gets every other click. The Tools follow the pointer themselves for the hover.
 */
export function createTools(panel: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View, busy: () => boolean) {
  panel.innerHTML = `
    <div class="row"><span class="name"></span><button class="reset">Reset</button></div>
    <div class="soft hint"></div>`
  const name = panel.querySelector<HTMLElement>('.name')!
  const hint = panel.querySelector<HTMLElement>('.hint')!

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

  const select = (junction: Junction | null) => {
    selected = junction
    under = null
    letGo()
    panel.hidden = !junction
    if (junction) {
      view.inspectCar(null)
      name.textContent = game.city.tiles.find((t) => junctionId(t.cell) === junction.id)?.layout.name ?? 'Junction'
      hint.textContent = HINTS[junction.type]
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

  /** Let go of everything the Tools show, as when a Rebuild replaces the network. */
  const clear = () => {
    hovered = null
    select(null)
    point(rest)
  }

  ;(panel.querySelector('.reset') as HTMLButtonElement).onclick = () => {
    if (!selected) return
    letGo()
    game.reset(selected.id)
    show()
  }
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

    /** `Esc`: let go of the Connection being drawn, then of the selection and the route. */
    back() {
      if (from) {
        letGo()
        return show()
      }
      select(null)
      view.inspectCar(null)
    },

    /** Call it every frame: with a Layout in the hand, nothing stays selected. */
    update() {
      if (busy() && (selected || hovered)) clear()
    },
  }
}
