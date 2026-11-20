import { LAST_STAGE, type Game } from '../game/game'
import type { Screen } from '../game/save'
import { runWords, whenChanged, writeDigits, yen } from './readings'
import './city-notes.css'

/** A notebook page with three lines on it. */
const NOTES = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M6 3.5h12v17H6zM9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
/** Every Stage, from the first. */
const STAGES = Array.from({ length: LAST_STAGE }, (_, i) => i + 1)

/**
 * City notes (#243, "In play"): the detail the status strip leaves out, on a 280 px paper note in the left slot. A
 * sticker in the top-left group opens and closes it, ringed in stamp red while it is open, and `screen` keeps the choice
 * in the save. It holds four groups: the traffic (Flow, trips a minute, Junctions in a Jam, Income a minute); Growth
 * with the Record and a bar per Stage counting its Tiles; the count of Tiles with the next Price; and one handwritten
 * line while a Jam holds Tiles at their Stage.
 */
export function createCityNotes(corner: HTMLElement, slot: HTMLElement, game: Game, screen: Screen) {
  const button = corner.appendChild(document.createElement('button'))
  button.className = 'sticker'
  button.setAttribute('aria-label', 'City notes')
  button.title = 'City notes'
  button.innerHTML = NOTES

  const panel = slot.appendChild(document.createElement('section'))
  panel.className = 'paper city-notes'
  panel.style.setProperty('--tilt', '-0.8deg')
  panel.setAttribute('aria-label', 'City notes')
  panel.innerHTML = `
    <span class="tape" style="--tilt: -3deg"></span>
    <header><h2>City notes</h2><button class="close" aria-label="Close City notes">×</button></header>
    <span class="label">Traffic</span>
    <dl>
      <dt class="handwritten">Flow</dt><dd class="digits flow"></dd>
      <dt class="handwritten">Trips a minute</dt><dd class="digits trips"></dd>
      <dt class="handwritten">Junctions in a Jam</dt><dd class="digits junctions"></dd>
      <dt class="handwritten">Income a minute</dt><dd class="digits income"></dd>
    </dl>
    <span class="rule across"></span>
    <span class="label digits growth"></span>
    <div class="stages">${STAGES.map(
      (s) => `<span class="stars" title="Stage ${s}">${'★'.repeat(s)}</span><span class="meter"><i></i></span><b class="digits"></b>`,
    ).join('')}</div>
    <span class="rule across"></span>
    <span class="label digits tiles"></span>
    <p class="handwritten digits jam-line" hidden></p>`
  const el = (s: string) => panel.querySelector<HTMLElement>(s)!
  const [flow, trips, jams, income, growth, tiles, jamLine] = [
    '.flow',
    '.trips',
    '.junctions',
    '.income',
    '.growth',
    '.tiles',
    '.jam-line',
  ].map(el)
  const bars = [...panel.querySelectorAll<HTMLElement>('.meter i')]
  const counts = [...panel.querySelectorAll<HTMLElement>('.stages b')]

  const digits = (target: HTMLElement) => whenChanged((v) => writeDigits(target, v))
  const show = {
    flow: digits(flow),
    trips: digits(trips),
    jams: whenChanged((v) => {
      writeDigits(jams, v)
      jams.classList.toggle('jammed', v !== '0')
    }),
    income: digits(income),
    growth: digits(growth),
    bars: bars.map((bar) => whenChanged((v) => (bar.style.width = v))),
    counts: counts.map(digits),
    tiles: digits(tiles),
    jamLine: whenChanged((v) => {
      jamLine.hidden = v === ''
      writeDigits(jamLine, v)
    }),
  }
  /** Show the notes open or closed, as `screen` keeps them. */
  const showOpenOrClosed = () => {
    button.setAttribute('aria-pressed', String(screen.cityNotes))
    panel.hidden = !screen.cityNotes
  }
  const toggle = () => {
    screen.cityNotes = !screen.cityNotes
    showOpenOrClosed()
  }
  button.onclick = toggle
  el('.close').onclick = toggle
  showOpenOrClosed()

  return {
    /** Show the City as it stands, while the notes are open. Call it every frame. */
    update() {
      if (!screen.cityNotes) return
      const placed = game.city.tiles
      show.flow(`${Math.round(game.sim.flow * 100)}%`)
      show.trips(String(Math.round(game.tripsPerMinute)))
      show.jams(String(game.sim.jams.length))
      // Each Junction is one Tile's, so a Jam holds back at most one Tile.
      const held = placed.filter((t) => game.heldBack(t.cell))
      show.jamLine(
        held.length === 1
          ? `A Jam at the ${held[0].layout.name} holds its Tile at Stage ${game.stageOf(held[0].cell)!.stage}.`
          : held.length
            ? `Jams hold ${held.length} Tiles at their Stage.`
            : '',
      )
      show.income(yen(game.income))
      show.growth(`Growth ${game.growth} · ${runWords(game.free).record} ${game.record}`)
      const at = STAGES.map(() => 0)
      for (const { cell } of placed) {
        const grown = game.stageOf(cell)
        if (grown) at[grown.stage - 1]++
      }
      at.forEach((n, i) => {
        show.bars[i](`${((n / placed.length) * 100).toFixed(1)}%`)
        show.counts[i](String(n))
      })
      show.tiles(`Tiles ${placed.length} · next ${game.free ? 'free' : yen(game.price)}`)
    },
  }
}
