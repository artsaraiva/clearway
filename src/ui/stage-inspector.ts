import type { Game } from '../game/game'
import type { Screen } from '../game/save'
import { HELD_BACK, STAGE_TINTS, type InspectedTile } from '../render/inspector'
import type { View } from '../render/view'

// Three buildings, each taller than the last: the three Stages.
const STAGES = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">
  <rect x="2.5" y="16" width="5.6" height="7" rx="1"/><rect x="10.2" y="10.5" width="5.6" height="12.5" rx="1"/><rect x="17.9" y="4" width="5.6" height="19" rx="1"/>
</svg>`
/** The diagonal stripes of a Tile held back, as the world draws them, for a swatch. */
const STRIPES = `repeating-linear-gradient(-45deg, ${HELD_BACK} 0 3px, ${STAGE_TINTS[1]} 3px 6px)`

/**
 * The Stage Inspector's toggle and its legend (.scratch/ui-ux/spec.md, "Stage Inspector"). A round button beside the
 * camera's, in `box`, and the `G` key turn it on and off. It is off in a new run, and `screen` keeps the choice in the
 * save. While it is on, the ground of every zoned Tile takes its Stage's tint and a Tile held back by a Jam is striped
 * (`../render/inspector`), and a legend above the buttons says what each means. The stripes wait for a Rebuild to
 * show its cars, as the Jam markers do.
 */
export function createStageInspector(root: HTMLElement, box: HTMLElement, game: Game, view: View, screen: Screen) {
  const button = box.appendChild(document.createElement('button'))
  button.className = 'glass round'
  button.setAttribute('aria-label', 'Stage Inspector')
  button.title = 'Stage Inspector (G)'
  button.innerHTML = STAGES

  const legend = root.appendChild(document.createElement('div'))
  legend.className = 'glass stage-legend'
  legend.innerHTML = `
    <div class="row">${STAGE_TINTS.map((tint, i) => `<span><i style="background:${tint}"></i>${'★'.repeat(i + 1)}</span>`).join('')}</div>
    <div class="row"><span><i style="background:${STRIPES}"></i>held back by a Jam</span></div>`

  const show = () => {
    button.classList.toggle('on', screen.stageInspector)
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
