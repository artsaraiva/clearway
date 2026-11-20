import type { Run, Title } from '../game/save'
import { createTitleScene } from '../render/title'
import './board.css'
import './title.css'

/**
 * The title screen (#243, "Title screen"), which the page opens on: the title's one-Tile scene (`../render/title`) in
 * an open blue sky, a taped paper card with the game's name top-left, a ticket bottom-right that says Play, and two
 * kraft tags bottom-left, New run and Free run. The ticket's stub says "Continue" and sums up the saved run Play opens,
 * from `title`; with no saved run, or one that would not load, it has no stub, and a save that would not load also
 * gives the game's one-line notice. New run asks first when a saved run exists, on a paper note.
 *
 * Leaving builds the run through `title`, hands it to `play`, which builds its view with its Pre-warm while the title
 * stays on screen, and then the title goes, its scene with it.
 */
export function createTitle(title: Title, play: (run: Run) => void) {
  const { summary, notice } = title
  const kind = title.free ? 'Free run' : 'run'
  const record = title.free ? 'free-run record' : 'record'
  const root = document.createElement('div')
  root.className = 'title'
  root.innerHTML = `
    <canvas class="scene" role="img" aria-label="One low-density residential tile with cars driving through its crossroads"></canvas>
    <div class="paper card" style="--tilt: -2deg">
      <span class="tape" style="--tilt: -26deg"></span>
      <span class="tape pink" style="--tilt: 22deg"></span>
      <h1>Dioramania</h1>
      <p class="handwritten">lay roads, clear jams, grow a city</p>
    </div>
    <button class="ticket"${summary ? '' : ' data-alone'}>
      <span class="play">Play</span>
      ${
        summary
          ? `<span class="stub">
              <span class="label">Continue</span>
              <span class="handwritten">${[
                ...(title.free ? ['Free run'] : []),
                `${summary.tiles} ${summary.tiles === 1 ? 'tile' : 'tiles'}`,
                `Growth ${summary.growth}`,
                `Record ${summary.record}`,
              ].join('<br>')}</span>
            </span>`
          : ''
      }
    </button>
    <div class="tags">
      <button class="kraft tag new-run" style="--tilt: -3deg"><span class="hole"></span>New run</button>
      <button class="kraft tag free-run" style="--tilt: 2deg" title="Every tile costs ¥0"><span class="hole"></span>Free run</button>
    </div>
    <dialog class="ask" aria-labelledby="title-ask" aria-describedby="title-ask-why">
      <div class="paper note" style="--tilt: 1.5deg">
        <span class="tape yellow"></span>
        <h2 id="title-ask">Start a new ${kind}?</h2>
        <p class="handwritten" id="title-ask-why">This City will be lost for good. Your ${record} of ${summary?.record ?? 0} stays.</p>
        <div class="answers">
          <button class="button keep">Keep this City</button>
          <button class="button primary start">Start a new ${kind}</button>
        </div>
      </div>
    </dialog>`
  if (notice) {
    // The game's one line, as the run would give it, and it stays while the title does.
    const line = document.createElement('div')
    line.className = 'paper notice'
    line.setAttribute('role', 'status')
    line.innerHTML = '<span class="tape yellow"></span>'
    line.append(notice)
    root.append(line)
  }
  document.body.append(root)
  const el = <T extends HTMLElement = HTMLButtonElement>(s: string) => root.querySelector<T>(s)!
  const ask = el<HTMLDialogElement>('.ask')

  // In the page and sized before the scene is built, so that its camera frames the Tile at the canvas's size.
  const scene = createTitleScene(el<HTMLCanvasElement>('.scene'))
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const calm = () => (scene.calm = motion.matches)
  calm()
  motion.addEventListener('change', calm)
  let running = true
  let last = performance.now()
  requestAnimationFrame(function loop(now) {
    if (!running) return
    // The first frame's timestamp can be earlier than the `last` taken at load, so never step back in time.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
    last = now
    scene.frame(dt)
    requestAnimationFrame(loop)
  })

  const leave = (how: Parameters<Title['leave']>[0]) => {
    if (!running) return
    running = false
    if (ask.open) ask.close()
    root.inert = true
    root.dataset.leaving = how
    // A frame for the press to show, then the run is built and drawn under the title, which goes once it is.
    requestAnimationFrame(() =>
      setTimeout(() => {
        play(title.leave(how))
        motion.removeEventListener('change', calm)
        scene.dispose()
        root.remove()
      }),
    )
  }
  el('.ticket').onclick = () => leave('play')
  el('.free-run').onclick = () => leave('free')
  el('.new-run').onclick = () => (summary ? ask.showModal() : leave('new'))
  el('.keep').onclick = () => ask.close()
  el('.start').onclick = () => leave('new')
  // A click on the scrim around the note is the same as Keep this City, and so is `Esc`, which the browser handles.
  ask.addEventListener('click', (e) => {
    if (e.target === ask) ask.close()
  })
}
