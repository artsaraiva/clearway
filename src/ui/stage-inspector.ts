import type { Game } from '../game/game'
import type { Screen } from '../game/save'
import { HELD_BACK, STAGE_TINTS, type InspectedTile } from '../render/inspector'
import type { View } from '../render/view'
import './board.css'

// A star, as each Stage is counted in stars.
const STAR = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4-4.9-2.8-4.9 2.8 1.1-5.4-4-3.7 5.4-.6z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/>
</svg>`
/** The diagonal stripes of a Tile held back, as the world draws them, for a swatch. */
const STRIPES = `repeating-linear-gradient(-45deg, ${HELD_BACK} 0 3px, ${STAGE_TINTS[1]} 3px 6px)`

/**
 * The Stage Inspector's toggle and its legend (.scratch/ui-ux/spec.md, "Stage Inspector"; #243, "In play"). A sticker
 * under the camera's, in `box`, and the `G` key turn it on and off. It is off in a new run, and `screen` keeps the
 * choice in the save. While it is on, the sticker takes a stamp-red ring, the ground of every zoned Tile takes its
 * Stage's tint and a Tile held back by a Jam is striped (`../render/inspector`), and a paper slip beside the sticker
 * says what each means. The stripes wait for a Rebuild to show its cars, as the Jam markers do.
 */
export function createStageInspector(box: HTMLElement, game: Game, view: View, screen: Screen) {
  const holder = box.appendChild(document.createElement('div'))
  holder.className = 'inspector'
  const button = holder.appendChild(document.createElement('button'))
  button.className = 'sticker'
  button.setAttribute('aria-label', 'Stage Inspector')
  button.title = 'Stage Inspector (G)'
  button.innerHTML = STAR

  const legend = holder.appendChild(document.createElement('div'))
  legend.className = 'paper stage-legend'
  legend.innerHTML = `
    <div class="row">${STAGE_TINTS.map((tint, i) => `<span><i style="background:${tint}"></i><span class="stars">${'★'.repeat(i + 1)}</span></span>`).join('')}</div>
    <div class="row"><span><i style="background:${STRIPES}"></i><span class="handwritten">held back by a Jam</span></span></div>`

  const show = () => {
    button.setAttribute('aria-pressed', String(screen.stageInspector))
    legend.hidden = !screen.stageInspector
  }
  const toggle = () => {
    screen.stageInspector = !screen.stageInspector
    show()
  }
  button.onclick = toggle
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'g' || e.key === 'G') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) toggle()
  })
  show()

  return {
    /** Show the City's Stages as they stand, while the Inspector is on. Call it every frame. */
    update() {
      if (!screen.stageInspector) return view.inspectStages(null)
      const tiles: InspectedTile[] = []
      for (const { cell } of game.city.tiles) {
        const grown = game.stageOf(cell)
        if (grown) tiles.push({ cell, stage: grown.stage, heldBack: !view.rebuilding && game.heldBack(cell) })
      }
      view.inspectStages(tiles)
    },
  }
}
