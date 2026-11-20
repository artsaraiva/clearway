import type { Game } from '../game/game'
import { runWords, whenChanged, writeDigits, yen } from './readings'
import './strip.css'

/** The speeds the strip offers, in sim seconds per real second: Pause, 1×, 4×, 8×. A run opens at 4×. */
const SPEEDS = [0, 1, 4, 8]
const FIRST_SPEED = 4

const PAUSE = `<svg width="11" height="13" viewBox="0 0 14 16" aria-hidden="true">
  <rect x="1" y="1" width="4" height="14" rx="1" fill="currentColor"/><rect x="9" y="1" width="4" height="14" rx="1" fill="currentColor"/>
</svg>`

/**
 * The status strip (#243, "In play"): one paper strip along the bottom of the screen holding every reading. Pause, 1×,
 * 4× and 8×, the one in use filled stamp red; Flow as a bar with its percentage; Growth with the Record; and yen,
 * largest, at the right end with Income beside it. Below about 1100 px it drops its text labels before it wraps.
 *
 * `Space` pauses, and back to the speed before; `1`, `2` and `3` pick 1×, 4× and 8×.
 */
export function createStrip(root: HTMLElement, game: Game) {
  const strip = document.createElement('div')
  strip.className = 'paper strip'
  // The visual scripts pause the game by clicking `[data-scale="0"]` (scripts/visual/city.mjs).
  strip.innerHTML = `
    <div class="speed" role="group" aria-label="Speed">${SPEEDS.map(
      (s) =>
        `<button class="button" data-scale="${s}" ${s ? '' : `aria-label="Pause" title="Pause (Space)"`}>${s ? `${s}×` : PAUSE}</button>`,
    ).join('')}</div>
    <span class="rule"></span>
    <div class="reading" title="Flow">
      <span class="label">Flow</span><span class="gauge"><i></i></span><b class="digits flow"></b>
    </div>
    <span class="rule"></span>
    <div class="reading" title="Growth: every Tile's Stage, added up">
      <span class="label">Growth</span><b class="digits growth"></b><span class="handwritten digits record"></span><b class="pace" hidden></b>
    </div>
    <div class="reading money">
      <b class="digits yen"></b><span class="handwritten digits income"></span>
    </div>`
  root.append(strip)
  const el = (s: string) => strip.querySelector<HTMLElement>(s)!
  const [flow, fill, growth, record, pace, yenEl, income] = ['.flow', '.gauge i', '.growth', '.record', '.pace', '.yen', '.income'].map(el)
  const buttons = [...strip.querySelectorAll<HTMLButtonElement>('[data-scale]')]

  /** Sim seconds per real second: 0 while paused. */
  let speed = FIRST_SPEED
  /** The speed in use before the game was paused, which `Space` goes back to. */
  let before = FIRST_SPEED
  const setSpeed = (s: number) => {
    if (s) before = s
    speed = s
  }
  buttons.forEach((b) => (b.onclick = () => setSpeed(Number(b.dataset.scale))))
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === ' ') {
      // In play Space pauses, and is not also a click on the button that has focus, as a click leaves it there. An open
      // dialog, the Paused memo, keeps its keys from the game (./paused.ts), so there Space works its buttons.
      e.preventDefault()
      setSpeed(speed ? 0 : before)
    }
    const picked = ['1', '2', '3'].indexOf(e.key)
    if (picked >= 0) setSpeed(SPEEDS[picked + 1])
  })

  const show = {
    speed: whenChanged((v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scale === v)))),
    flow: whenChanged((v) => writeDigits(flow, v)),
    fill: whenChanged((v) => (fill.style.width = v)),
    growth: whenChanged((v) => writeDigits(growth, v)),
    record: whenChanged((v) => writeDigits(record, v)),
    pace: whenChanged((v) => {
      pace.hidden = v === ''
      pace.textContent = v
    }),
    yen: whenChanged((v) => writeDigits(yenEl, v)),
    income: whenChanged((v) => writeDigits(income, v)),
  }

  return {
    /**
     * Sim seconds per real second: 0 while paused. Setting it is a press of that speed's button, so a speed other than
     * 0 is the one `Space` goes back to.
     */
    get speed() {
      return speed
    },
    set speed(s: number) {
      setSpeed(s)
    },

    /** Flash yen in stamp red, as when the player cannot afford a drop. */
    refuse() {
      yenEl.classList.remove('refused')
      void yenEl.offsetWidth // restarts the flash
      yenEl.classList.add('refused')
    },

    /** Show the game as it stands. Call it every frame. */
    update() {
      show.speed(String(speed))
      show.flow(`${Math.round(game.sim.flow * 100)}%`)
      show.fill(`${Math.min(100, game.sim.flow * 100).toFixed(1)}%`)
      show.growth(String(game.growth))
      show.record(`${runWords(game.free).record} ${game.record}`)
      // Dev only: the pace of growth, when it is sped up.
      show.pace(game.pace === 1 ? '' : `pace ×${game.pace}`)
      // Yen counts whole yen down, so it never shows the Price before the Tile is affordable.
      show.yen(yen(Math.floor(game.yen)))
      show.income(`+${yen(game.income)} a minute`)
    },
  }
}
