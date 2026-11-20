import type { Cell } from '../city/city'
import { LAST_STAGE, type Game } from '../game/game'
import type { View } from '../render/view'
import { middle, type Vec } from '../sim/geometry'
import { cellAt, cellBounds } from '../sim/tiles'
import { STAGES } from '../tuning'
import { whenChanged } from './readings'
import { nameOf } from './toolbar'
import './board.css'

/** px the note sits below its Tile's middle, clear of a Jam marker, which floats above it. */
const BELOW = 26
/** The pips of progress toward the next Stage. */
const PIPS = 10

/** A Stage as stars, those not reached yet outlined: ★★☆ for Stage 2. */
const stars = (stage: number) => '★'.repeat(stage) + (stage < LAST_STAGE ? `<s>${'☆'.repeat(LAST_STAGE - stage)}</s>` : '')

/**
 * What the board shows of Stages (.scratch/ui-ux/spec.md, "Readings"; #243, "In play"; the City's Growth and the Record
 * are in the status strip, `./strip`): a taped paper note on the placed Tile under the pointer with its Zone, its Stage
 * as stars, ten pips of progress toward the next and a handwritten line of the trips still to go, or why it is not
 * growing; and a paper badge that rises over a Tile as its Stage-up ends. The note hides while `busy`, as when a Layout
 * or a Zone is in the player's hand.
 */
export function createGrowth(root: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View, busy: () => boolean) {
  // Over the board and its labels, under the screen's pills, like the Jam markers.
  const layer = document.createElement('div')
  layer.className = 'growth-layer'
  root.before(layer)
  const note = layer.appendChild(document.createElement('div'))
  note.className = 'paper tile-note'
  note.hidden = true
  note.innerHTML = `<span class="tape pink"></span><div class="head"><span class="name"></span><span class="stars"></span></div>
    <div class="pips">${'<i></i>'.repeat(PIPS)}</div><div class="line handwritten"></div>`
  const [noteZone, noteStars, noteLine] = ['.name', '.stars', '.line'].map((s) => note.querySelector<HTMLElement>(s)!)
  const pips = [...note.querySelectorAll('.pips i')]

  const show = {
    at: whenChanged((v) => (note.style.translate = v)),
    hidden: whenChanged((v) => (note.hidden = v === 'hidden')),
    look: whenChanged((v) => (note.className = v)),
    zone: whenChanged((v) => (noteZone.textContent = v)),
    stars: whenChanged((v) => (noteStars.innerHTML = v)),
    /** Progress toward the next Stage, 0–1: its tenths fill pips, and what is left of one half inks the next. */
    pips: whenChanged((v) => {
      const tenths = Number(v) * PIPS
      pips.forEach((pip, i) => (pip.className = i < Math.floor(tenths) ? 'on' : i < tenths ? 'part' : ''))
    }),
    line: whenChanged((v) => (noteLine.textContent = v)),
  }

  /** Where the pointer is over the board, or null off it. */
  let pointer: { clientX: number; clientY: number } | null = null
  canvas.addEventListener('pointermove', (e) => (pointer = { clientX: e.clientX, clientY: e.clientY }))
  canvas.addEventListener('pointerleave', () => (pointer = null))
  /** The placed Tile under the pointer, if any, while nothing is in the hand. */
  const hovered = (): Cell | null => {
    if (!pointer || busy()) return null
    const p = view.pick(pointer)
    const cell = p && cellAt(p)
    return cell && game.city.tileAt(cell) ? cell : null
  }

  /** Badges rising over Tiles whose Stage-up just ended, each over its Tile's middle until its animation ends. */
  const badges = new Map<HTMLElement, Vec>()
  view.onStageUp = (piece, stage) => {
    const el = layer.appendChild(document.createElement('div'))
    el.className = 'stage-badge'
    el.innerHTML = `<span class="paper"><span class="stars">${stars(stage)}</span><b>Stage ${stage}</b></span>`
    el.addEventListener('animationend', () => {
      el.remove()
      badges.delete(el)
    })
    badges.set(el, middle(piece))
  }

  return {
    /** Show the Stages over the board as they stand. Call it every frame, after the frame is drawn. */
    update() {
      const cell = hovered()
      show.hidden(cell ? '' : 'hidden')
      if (cell) {
        const [x, y] = view.camera.onScreen(middle(cellBounds(cell)))
        show.at(`${x.toFixed(1)}px ${(y + BELOW).toFixed(1)}px`)
        const grown = game.stageOf(cell)
        const full = grown?.stage === LAST_STAGE
        const jammed = game.heldBack(cell)
        show.look(['paper tile-note', !grown && 'unzoned', jammed && 'jammed', full && 'full'].filter(Boolean).join(' '))
        show.zone(nameOf(game.city.tileAt(cell)?.zone))
        if (!grown) {
          show.stars('')
          show.pips('0')
          show.line('does not grow')
        } else {
          const need = STAGES.trips[grown.stage - 1]
          const left = Math.max(1, Math.ceil(need - grown.progress))
          show.stars(stars(grown.stage))
          show.pips(full ? '1' : Math.min(1, grown.progress / need).toFixed(3))
          show.line(
            full ? 'fully grown' : jammed ? 'held back by a Jam' : `${left} ${left === 1 ? 'trip' : 'trips'} to Stage ${grown.stage + 1}`,
          )
        }
      }

      for (const [el, at] of badges) {
        const [x, y] = view.camera.onScreen(at)
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      }
    },
  }
}
