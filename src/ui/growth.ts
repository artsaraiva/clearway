import type { Cell } from '../city/city'
import { LAST_STAGE, type Game } from '../game/game'
import type { View } from '../render/view'
import { middle, type Vec } from '../sim/geometry'
import { cellAt, cellBounds } from '../sim/tiles'
import { STAGES } from '../tuning'

/** px the bar sits below its Tile's middle, clear of a Jam marker, which floats above it. */
const BELOW = 26

/** A Stage as stars: ★★☆ for Stage 2. */
const stars = (stage: number) => '★'.repeat(stage) + '☆'.repeat(LAST_STAGE - stage)

/** Writes `value` with `write` only when it differs from the last one written. */
function changes(write: (value: string) => void) {
  let shown: string | undefined
  return (value: string) => {
    if (value !== shown) write((shown = value))
  }
}

/**
 * What the board shows of Stages (.scratch/ui-ux/spec.md, "Readings"; the City's Growth and the Record are in the
 * status strip, `./strip`): a bar over the placed Tile under the pointer with its Stage and its trips toward the next,
 * or why it is not growing; and a badge that rises over a Tile as its Stage-up ends. The bar hides while `busy`, as
 * when a Layout or a Zone is in the player's hand, and during a Rebuild.
 */
export function createGrowth(root: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View, busy: () => boolean) {
  // Over the board and its labels, under the screen's pills, like the Jam markers.
  const layer = document.createElement('div')
  layer.className = 'growth-layer'
  root.before(layer)
  const bar = layer.appendChild(document.createElement('div'))
  bar.className = 'tile-bar'
  bar.hidden = true
  bar.innerHTML = `<div class="head"><b class="stage"></b><span class="stars"></span></div><div class="track"><i></i></div><div class="note"></div>`
  const [barStage, barStars, barFill, barNote] = ['.stage', '.stars', '.track i', '.note'].map((s) => bar.querySelector<HTMLElement>(s)!)

  const show = {
    at: changes((v) => (bar.style.transform = v)),
    hidden: changes((v) => (bar.hidden = v === 'hidden')),
    look: changes((v) => (bar.className = v)),
    stage: changes((v) => (barStage.textContent = v)),
    stars: changes((v) => (barStars.textContent = v)),
    fill: changes((v) => (barFill.style.width = v)),
    note: changes((v) => (barNote.textContent = v)),
  }

  /** Where the pointer is over the board, or null off it. */
  let pointer: { clientX: number; clientY: number } | null = null
  canvas.addEventListener('pointermove', (e) => (pointer = { clientX: e.clientX, clientY: e.clientY }))
  canvas.addEventListener('pointerleave', () => (pointer = null))
  /** The placed Tile under the pointer, if any, while nothing is in the hand. */
  const hovered = (): Cell | null => {
    if (!pointer || busy() || view.rebuilding) return null
    const p = view.pick(pointer)
    const cell = p && cellAt(p)
    return cell && game.city.tileAt(cell) ? cell : null
  }

  /** Badges rising over Tiles whose Stage-up just ended, each over its Tile's middle until its animation ends. */
  const badges = new Map<HTMLElement, Vec>()
  view.onStageUp = (piece, stage) => {
    const el = layer.appendChild(document.createElement('div'))
    el.className = 'stage-badge'
    el.innerHTML = `<span>${stars(stage)}<b>Stage ${stage}</b></span>`
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
        show.at(`translate(${x.toFixed(1)}px, ${(y + BELOW).toFixed(1)}px) translateX(-50%)`)
        const grown = game.stageOf(cell)
        const full = grown?.stage === LAST_STAGE
        const jammed = game.heldBack(cell)
        show.look(['tile-bar', !grown && 'unzoned', jammed && 'jammed', full && 'full'].filter(Boolean).join(' '))
        if (!grown) {
          show.stage('Roads only')
          show.stars('')
          show.fill('0%')
          show.note('does not grow')
        } else {
          const need = STAGES.trips[grown.stage - 1]
          const trips = `${Math.floor(grown.progress)} / ${need}`
          show.stage(`Stage ${grown.stage}`)
          show.stars(stars(grown.stage))
          show.fill(`${full ? 100 : Math.min(100, (100 * grown.progress) / need).toFixed(1)}%`)
          show.note(full ? 'fully grown' : jammed ? `held back by a Jam · ${trips}` : `${trips} trips`)
        }
      }

      for (const [el, at] of badges) {
        const [x, y] = view.camera.onScreen(at)
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      }
    },
  }
}
