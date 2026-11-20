import type { Game } from '../game/game'
import type { Run } from '../game/save'
import './paused.css'

const MENU = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M5 7.2c4.5-.6 9.5.4 14-.2M5 12.1c4.7.4 9.3-.3 14 .1M5 17c4.4-.5 9.6.3 14-.1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</svg>`
const PAUSE = `<svg width="20" height="24" viewBox="0 0 14 16" aria-hidden="true">
  <rect x="1" y="1" width="4" height="14" rx="1" fill="currentColor"/><rect x="9" y="1" width="4" height="14" rx="1" fill="currentColor"/>
</svg>`
const TICK = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
  <path d="M4.5 11.5l4.2 4.3 9-10.3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

/** Every key the game has, and what it does: the keys card's rows. */
const KEYS: [string, string][] = [
  ['Pause, and back', 'Space'],
  ['1×, 4×, 8×', '1 2 3'],
  ['Turn the tile', 'R or wheel'],
  ['Turn it back', 'Shift R'],
  ['Put it back', 'Esc or right click'],
  ['Deselect', 'Esc'],
  ['Turn the view', 'Shift drag'],
  ['Frame the whole City', 'F'],
  ['Stage Inspector', 'G'],
  ['Resume', 'Esc'],
]

/**
 * The Paused memo (#243, "Paused"): the menu sticker, top-left in `corner`, pauses the game and lays a paper memo over
 * the board, dimmed by a scrim of ink. The memo has the word Paused with a pause stamp, a red Resume button, New run,
 * the Free run switch, and one handwritten line summing up the City; a kraft card beside it lists the keys. Resume,
 * `Esc` and a click on the scrim close it and give the strip back the speed it had. While it is open no other key
 * reaches the game.
 *
 * New run asks first, on a paper note laid over the memo; then the run starts again through `run`, of the same kind,
 * keeping the Record. The Free run switch moves to the other saved run. `opened` runs as the memo opens, for the screen
 * to let go of what the hand holds.
 */
export function createPaused(
  corner: HTMLElement,
  root: HTMLElement,
  game: Game,
  run: Pick<Run, 'newRun' | 'switchRun'>,
  strip: { speed: number },
  opened: () => void,
) {
  const sticker = document.createElement('button')
  sticker.className = 'sticker'
  sticker.setAttribute('aria-label', 'Menu')
  sticker.setAttribute('aria-haspopup', 'dialog')
  sticker.title = 'Menu'
  sticker.innerHTML = MENU
  corner.prepend(sticker)

  const kind = game.free ? 'Free run' : 'run'
  const dialog = document.createElement('dialog')
  dialog.className = 'paused'
  dialog.setAttribute('aria-labelledby', 'paused-title')
  dialog.innerHTML = `
    <div class="pair">
      <div class="paper memo" style="--tilt: -1.2deg">
        <span class="tape pink"></span>
        <div class="sheet">
          <div class="head">
            <h1 id="paused-title">Paused</h1>
            <span class="stamp">${PAUSE}</span>
          </div>
          <button class="button primary resume" autofocus>Resume</button>
          <div class="rows">
            <button class="new-run">New run</button>
            <button class="free-run" role="switch" aria-checked="${game.free}">
              <span>Free run <span class="handwritten">every tile costs ¥0</span></span><i class="box">${game.free ? TICK : ''}</i>
            </button>
          </div>
          <p class="handwritten summary"></p>
        </div>
        <div class="paper ask" role="alertdialog" aria-labelledby="ask-title" aria-describedby="ask-why" style="--tilt: 2.4deg" hidden>
          <span class="tape yellow"></span>
          <h2 id="ask-title">Start a new ${kind}?</h2>
          <p class="handwritten" id="ask-why"></p>
          <div class="answers">
            <button class="button keep">Keep this City</button>
            <button class="button primary start">Start a new ${kind}</button>
          </div>
        </div>
      </div>
      <div class="kraft keys" style="--tilt: 2.5deg">
        <span class="tape"></span>
        <h2 class="label">Keys</h2>
        <dl>${KEYS.map(([what, key]) => `<dt class="handwritten">${what}</dt><dd>${key}</dd>`).join('')}</dl>
      </div>
    </div>`
  root.append(dialog)
  const el = <T extends HTMLElement = HTMLElement>(s: string) => dialog.querySelector<T>(s)!
  const [pair, sheet, ask, keys, summary, why] = ['.pair', '.sheet', '.ask', '.keys', '.summary', '#ask-why'].map((s) => el(s))

  /** The speed the game had when the memo opened, which closing it gives back; null while it is closed. */
  let before: number | null = null
  const open = () => {
    if (dialog.open) return
    before = strip.speed
    strip.speed = 0
    const record = game.free ? 'free-run record' : 'record'
    const tiles = game.city.tiles.length
    summary.textContent = `${tiles} ${tiles === 1 ? 'tile' : 'tiles'} · Growth ${game.growth} · ${record} ${game.record}`
    why.textContent = `This City will be lost for good. Your ${record} of ${game.record} stays.`
    opened()
    dialog.showModal()
  }
  /** Show or put away New run's question. While it is up, the memo under it and the keys card take no clicks. */
  const asking = (up: boolean) => {
    ask.hidden = !up
    sheet.inert = keys.inert = up
    ;(up ? el('.keep') : el('.new-run')).focus()
  }
  /** The game goes on at the speed it had, at once, before another key can change it. */
  const closed = () => {
    if (before === null) return
    ask.hidden = true
    sheet.inert = keys.inert = false
    strip.speed = before
    before = null
  }
  const close = () => {
    dialog.close()
    closed()
  }
  /** One step back: from New run's question to the memo, and from the memo to the game. */
  const back = () => {
    if (!ask.hidden) asking(false)
    else close()
  }
  // The browser can close the memo itself, and tells of it a moment later.
  dialog.addEventListener('close', closed)

  sticker.onclick = open
  el('.resume').onclick = close
  el('.new-run').onclick = () => asking(true)
  el('.keep').onclick = () => asking(false)
  el('.start').onclick = run.newRun
  el('.free-run').onclick = run.switchRun
  // A click on the scrim, around the memo and the card, is a step back.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target === pair) back()
  })
  // While the memo is open the keys are its own: `Esc` steps back, and nothing reaches the game's keys, which are
  // listened for on the window too. `Tab`, `Enter` and `Space` still work the memo's buttons.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!dialog.open) return
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        back()
      }
    },
    { capture: true },
  )
  dialog.addEventListener('cancel', (e) => e.preventDefault())
}
