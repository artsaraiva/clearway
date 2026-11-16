import type { Cell } from '../city/city'
import { LAST_STAGE, type Game } from '../game/game'
import type { View } from '../render/view'
import { middle, type Vec } from '../sim/geometry'
import { cellAt, cellBounds, junctionId } from '../sim/tiles'
import { STAGES } from '../tuning'

/** s a badge takes to rise and fade: its CSS animation's length. */
const BADGE = 1.8
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
 * What the screen shows of Stages (.scratch/ui-ux/spec.md, "Growth"): the City's Growth under the yen, with how many
 * Tiles are at each Stage; a bar over the placed Tile under the pointer with its Stage and its trips toward the next,
 * or why it is not growing; and a badge that rises over a Tile as its Stage-up ends. The bar hides while `busy`, as
 * when a Layout or a Zone is in the player's hand, and during a Rebuild.
 */
export function createGrowth(root: HTMLElement, canvas: HTMLCanvasElement, game: Game, view: View, busy: () => boolean) {
  const pill = document.createElement('div')
  pill.className = 'glass growth'
  pill.innerHTML = `
    <div class="row"><span class="label">Growth</span><b class="total"></b><span class="soft stages"></span></div>
    <div class="soft pace" hidden></div>`
  root.append(pill)
  const [total, stages, pace] = ['.total', '.stages', '.pace'].map((s) => pill.querySelector<HTMLElement>(s)!)

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
    total: changes((v) => (total.textContent = v)),
    stages: changes((v) => (stages.innerHTML = v)),
    pace: changes((v) => {
      pace.hidden = v === ''
      pace.textContent = v
    }),
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

  /** Badges rising over Tiles whose Stage-up just ended, each where its Tile's middle is and how long it has risen. */
  const badges: { el: HTMLElement; at: Vec; age: number }[] = []
  view.onStageUp = (piece, stage) => {
    const el = layer.appendChild(document.createElement('div'))
    el.className = 'stage-badge'
    el.innerHTML = `<span>${stars(stage)}<b>Stage ${stage}</b></span>`
    badges.push({ el, at: middle(piece), age: 0 })
  }
  let last = performance.now()

  return {
    /** Show Growth as it stands. Call it every frame, after the frame is drawn. */
    update() {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      const counts = [0, 0, 0]
      for (const t of game.city.tiles) {
        const grown = game.stageOf(t.cell)
        if (grown) counts[grown.stage - 1]++
      }
      show.total(String(game.growth))
      show.stages(counts.map((n, i) => `<i>${'★'.repeat(i + 1)}</i> ${n}`).join(' · '))
      show.pace(game.pace === 1 ? '' : `Pace ×${game.pace}`)

      const cell = hovered()
      show.hidden(cell ? '' : 'hidden')
      if (cell) {
        const [x, y] = view.camera.onScreen(middle(cellBounds(cell)))
        show.at(`translate(${x.toFixed(1)}px, ${(y + BELOW).toFixed(1)}px)`)
        const grown = game.stageOf(cell)
        const full = grown?.stage === LAST_STAGE
        const jammed = !!grown && !full && game.sim.jams.some((j) => j.id === junctionId(cell))
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

      for (let i = badges.length - 1; i >= 0; i--) {
        const b = badges[i]
        b.age += dt
        if (b.age >= BADGE) {
          b.el.remove()
          badges.splice(i, 1)
          continue
        }
        const [x, y] = view.camera.onScreen(b.at)
        b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      }
    },
  }
}
