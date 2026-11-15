import type { Game } from '../game/game'
import { PILLS } from '../render/camera'
import { reach } from '../render/tools'
import type { View } from '../render/view'
import type { Junction } from '../sim/network'
import { junctionId } from '../sim/tiles'

// px: the radius of a marker's disc, how far past it its tail reaches, how far above its Junction the tail's tip
// stops, and how far a marker at the edge keeps clear of the pills.
const MARKER = { r: 16, tail: 10, gap: 3, margin: 10 }
// s for a marker to rise clear of its Junction's halo as the Junction is selected: as long as the halo takes to lift.
const RISE = 0.16
const JAM = '#ff4a1f' // the hot red-orange reserved for Jams and refusals

/**
 * The anger mark the stuck cars carry (src/render/emotion.ts), drawn in white on the disc: four arcs back to back,
 * each round toward the middle.
 */
const ANGER = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
]
  .map(([dx, dy]) => {
    const [cx, cy, r] = [16 + dx * 8, 16 + dy * 8, 5.8]
    const a = Math.atan2(-dy, -dx)
    const at = (b: number) => `${(cx + r * Math.cos(b)).toFixed(2)} ${(cy + r * Math.sin(b)).toFixed(2)}`
    return `M${at(a - 0.85)}A${r} ${r} 0 0 1 ${at(a + 0.85)}`
  })
  .join('')
const MARK = `
  <svg class="tail" width="56" height="56" viewBox="-28 -28 56 56" aria-hidden="true">
    <path d="M8 -7.5L${MARKER.r + MARKER.tail} 0L8 7.5z" fill="${JAM}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
  </svg>
  <svg class="disc" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14.75" fill="${JAM}" stroke="#fff" stroke-width="2.5"/>
    <path d="${ANGER}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`

interface Marker {
  el: HTMLButtonElement
  tail: SVGElement
  junction: Junction
  /** Fading out: its Junction's Jam has cleared, or a Rebuild has begun. */
  gone: boolean
  /** How far it has risen clear of its Junction's halo, 0–1: all the way while the Junction is selected. */
  risen: number
  /** The transforms last written, so the page is only touched when they change. */
  move: string
  rotate: string
}

/** What the markers ask of the Tools: which Junction is selected, and selecting one. */
interface Selection {
  readonly selected: Junction | null
  select(junction: Junction): void
}

/**
 * The Jam markers (.scratch/ui-ux/spec.md, "Reading the traffic"): a small hot red-orange disc carrying the anger mark
 * floats above each Junction with a Jam (`Sim.jams`), its tail pointing down at it. Over the selected Junction it rises
 * clear of the halo, so it hides none of the Tools. A marker whose Junction is off screen, or would sit under the
 * screen's pills, waits at the edge of the clear part of the screen and points its tail toward the Junction. A click
 * centres the camera on the Junction and selects it.
 *
 * The markers find the Jam from far out; the stuck cars' emotion stays the main signal in the world. None shows while
 * a Rebuild plays. While a Layout is in the hand they fade back and let clicks through, since every click is a drop.
 */
export function createJamMarkers(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  game: Game,
  view: View,
  tools: Selection,
  holding: () => boolean,
) {
  const layer = document.createElement('div')
  layer.className = 'jams'
  // Over the board and its labels, under the screen's pills.
  root.before(layer)
  const markers = new Map<string, Marker>()
  // The window's size, read only when it changes: reading it every frame would force a layout.
  let [width, height] = [innerWidth, innerHeight]
  addEventListener('resize', () => ([width, height] = [innerWidth, innerHeight]))
  let last = performance.now()

  // The wheel over a marker zooms the camera as it does over the board.
  layer.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      canvas.dispatchEvent(new WheelEvent('wheel', e))
    },
    { passive: false },
  )
  layer.addEventListener('contextmenu', (e) => e.preventDefault())

  const add = (junction: Junction) => {
    const el = layer.appendChild(document.createElement('button'))
    el.className = 'jam'
    el.innerHTML = `<span class="pop">${MARK}</span>`
    const name = game.city.tiles.find((t) => junctionId(t.cell) === junction.id)?.layout.name ?? 'Junction'
    el.setAttribute('aria-label', `Traffic is stuck at this ${name}. Go to it`)
    const marker: Marker = { el, tail: el.querySelector('.tail')!, junction, gone: false, risen: 0, move: '', rotate: '' }
    el.onclick = () => {
      if (marker.gone || holding() || view.rebuilding) return
      view.camera.centreOn(marker.junction.at)
      tools.select(marker.junction)
    }
    el.addEventListener('animationend', (e) => {
      if (!marker.gone || e.animationName !== 'jam-out') return
      el.remove()
      if (markers.get(junction.id) === marker) markers.delete(junction.id)
    })
    markers.set(junction.id, marker)
  }
  const fade = (marker: Marker, gone: boolean) => {
    if (marker.gone === gone) return
    marker.gone = gone
    marker.el.classList.toggle('gone', gone)
  }

  /**
   * Put a marker where its Junction is on screen, or at the edge of the clear part of the screen toward it. `dt` is the
   * real seconds since the last frame, since the halo it rises clear of lifts on the real clock.
   * ponytail: markers never make room for each other, so Jams far off in about the same direction stack at the edge,
   * and Jams at neighbouring Junctions overlap with the camera far out. Each marker still opens its own Jam, and a City
   * today holds a handful. Nudge markers at the edge apart along it, or gather a pile into one marker with a count, if
   * piles become common in big Cities.
   */
  const place = (marker: Marker, dt: number) => {
    const { r, tail, gap, margin } = MARKER
    // The part of the screen a marker's middle may take: clear of the pills, with the whole disc inside it.
    const [x0, x1] = [PILLS.left + r + margin, width - PILLS.right - r - margin]
    const [y0, y1] = [PILLS.top + r + margin, height - PILLS.bottom - r - margin]
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]
    const { at } = marker.junction
    const [gx, gy] = view.camera.onScreen(at)
    // Its tail's tip stops just over the Junction, or over the top of its halo while it is selected: the halo's point
    // farthest from the camera, which is straight above its middle on screen.
    const up = tools.selected?.id === marker.junction.id
    marker.risen = Math.max(0, Math.min(1, marker.risen + (up ? dt : -dt) / RISE))
    let [x, y] = [gx, gy]
    if (marker.risen > 0) {
      const [heading, k] = [view.camera.heading, marker.risen * marker.risen * (3 - 2 * marker.risen)]
      const halo = reach(marker.junction)
      y += (view.camera.onScreen({ x: at.x - Math.sin(heading) * halo, y: at.y + Math.cos(heading) * halo })[1] - gy) * k
    }
    y -= r + tail + gap
    let turn = Math.PI / 2
    const edge = !(x >= x0 && x <= x1 && y >= y0 && y <= y1)
    if (edge) {
      // Where the line from the middle of the clear part out to that place crosses its edge, pointing at the Junction.
      const [dx, dy] = [x - cx, y - cy]
      const along = (d: number, lo: number, hi: number, c: number) => (d > 0 ? (hi - c) / d : d < 0 ? (lo - c) / d : Infinity)
      const t = Math.max(0, Math.min(1, along(dx, x0, x1, cx), along(dy, y0, y1, cy)))
      ;[x, y] = [cx + dx * t, cy + dy * t]
      turn = Math.hypot(gx - x, gy - y) > 1 ? Math.atan2(gy - y, gx - x) : Math.atan2(dy, dx)
    }
    marker.el.classList.toggle('edge', edge)
    const move = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
    if (move !== marker.move) marker.el.style.transform = marker.move = move
    const rotate = `rotate(${turn.toFixed(3)}rad)`
    if (rotate !== marker.rotate) marker.tail.style.transform = marker.rotate = rotate
  }

  return {
    /** Show the Jams as they stand. Call it every frame, after the frame is drawn, so it reads this frame's camera. */
    update() {
      // A Rebuild fades every marker out, and the new City's Jams show once its traffic does.
      const jams = view.rebuilding ? [] : game.sim.jams
      const jammed = new Set(jams.map((j) => j.id))
      for (const [id, marker] of markers) if (!jammed.has(id)) fade(marker, true)
      for (const junction of jams) {
        const marker = markers.get(junction.id)
        if (!marker) add(junction)
        else {
          // A Jam back before its marker has faded keeps that marker, on the Junction of the Sim as it stands.
          marker.junction = junction
          fade(marker, false)
        }
      }
      layer.classList.toggle('holding', holding())
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      for (const marker of markers.values()) place(marker, dt)
    },
  }
}
