import { DIRECTIONS, LAYOUTS, ZONES, type Layout, type Zone } from '../city/city'
import { whenChanged, writeDigits, yen } from './readings'
import './toolbar.css'

/** The picks of the Zone palette, in order: each Zone, then none, which the screen calls Roads only. */
const ZONE_PICKS: (Zone | undefined)[] = [...ZONES, undefined]
/** A Zone's name, or the screen's for none. */
export const nameOf = (zone: Zone | undefined) => zone?.name ?? 'Roads only'

const UNDO = `<svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
  <path d="M4.5 3.5L1.8 6.2l2.7 2.7M2.2 6.2h6.3a3.6 3.6 0 0 1 0 7.2H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

/** Each Layout card's fixed tilt, in degrees, in the order of `LAYOUTS`. */
const TILTS = [-2, 1.5, -1, 2, -1.8]
// A Layout card's picture: grass, the roads in asphalt and their dashed middle lines in the kit's paper, as a style
// since a presentation attribute takes no custom property.
const GROUND = '#cfe7b5'
const ROAD = '#5d5750'
const LINE = 'style="stroke: var(--paper)"'
/** The Curve's road at rotation 0, east to north, run on past both edges so that it still reaches them once turned. */
const CURVE = 'M80 32H46A14 14 0 0 1 32 18V-16'

/**
 * A Layout's top-down picture for its card, north up. Its `.turn` group is turned to show the Tile the way it will land
 * on the screen, so each road runs on past the edge, which clips it.
 */
function picture(layout: Layout) {
  const arms = DIRECTIONS.filter((d) => layout.roads[d]).map((d) => [
    Math.round(Math.cos((d * Math.PI) / 2)),
    -Math.round(Math.sin((d * Math.PI) / 2)),
  ])
  const out = (from: number) => arms.map(([x, y]) => `M${32 + from * x} ${32 + from * y}L${32 + 48 * x} ${32 + 48 * y}`).join('')
  const curve = layout.id === 'curve'
  const roundabout = layout.id === 'roundabout'
  // A junction's lines stop short of its middle, and a roundabout's arms have none.
  const lines = curve ? CURVE : roundabout ? '' : out(arms.length > 2 ? 12 : 0)
  const ring = roundabout
    ? `<circle cx="32" cy="32" r="16" fill="${ROAD}"/><circle cx="32" cy="32" r="8.5" fill="${GROUND}" ${LINE} stroke-width="1.5"/>`
    : ''
  return `<svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true">
    <clipPath id="card-${layout.id}"><rect width="64" height="64" rx="3"/></clipPath>
    <rect width="64" height="64" rx="3" fill="${GROUND}"/>
    <g clip-path="url(#card-${layout.id})"><g class="turn">
      <path d="${curve ? CURVE : out(0)}" fill="none" stroke="${ROAD}" stroke-width="18"/>${ring}
      <path d="${lines}" fill="none" ${LINE} stroke-width="2" stroke-dasharray="5 5"/>
    </g></g>
  </svg>`
}

// The Zones' pictures: what each builds, seen from above at a slant on a small disc. Their colours are the world's.
const ZONE_PICTURES: Record<Zone['id'] | 'none', string> = {
  'low-density': `<circle cx="20" cy="20" r="19" fill="#cdeaad"/>
    <rect x="8" y="21" width="15" height="11" rx="1.5" fill="#fdeed6"/><path d="M6 22.5 15.5 13l9.5 9.5z" fill="#d56454"/>
    <rect x="13.5" y="25" width="4" height="7" fill="#9cc7df"/>
    <circle cx="29.5" cy="22" r="5.5" fill="#6bc357"/><circle cx="27" cy="18.5" r="3.6" fill="#92d76e"/>
    <rect x="28.8" y="26" width="1.6" height="6" fill="#a1714c"/>`,
  'medium-density': `<circle cx="20" cy="20" r="19" fill="#f4e6cf"/>
    <rect x="6.5" y="19" width="9" height="13" fill="#f6dfb4"/><rect x="15.5" y="15.5" width="9" height="16.5" fill="#fff4e2"/>
    <rect x="24.5" y="20" width="9" height="12" fill="#d6e4d3"/>
    <path d="M5.8 19.6 7.8 15.6h6.4l2 4z" fill="#4d6575"/><path d="M14.8 16.1 16.8 12.1h6.4l2 4z" fill="#b85a4c"/>
    <path d="M23.8 20.6 25.8 16.6h6.4l2 4z" fill="#5aa69b"/>
    <path d="M8.6 21.5h2.4v2.6H8.6zM17.6 18.5H20v2.6h-2.4zM17.6 23.5H20v2.6h-2.4zM26.6 22.5H29v2.6h-2.4z" fill="#9cc7df"/>
    <path d="M12 27h2v5h-2zM21 27h2v5h-2zM30 27h2v5h-2z" fill="#8a5a3c"/>`,
  'high-density': `<circle cx="20" cy="20" r="19" fill="#dae4f1"/>
    <rect x="10.5" y="30.5" width="19" height="3.5" rx="1" fill="#e9e4da"/>
    <path d="M26 9.4 29.6 8v22.6L26 31z" fill="#e2d6c2"/>
    <rect x="13" y="9" width="14" height="22" rx="1" fill="#fbf3e6"/><rect x="12.4" y="7.6" width="15.2" height="2.2" rx="0.8" fill="#e9e4da"/>
    <path d="M15.4 11.5v17.8M24.6 11.5v17.8" stroke="#9cc7df" stroke-width="2" stroke-dasharray="2 1.7"/>
    <path d="M18.2 12.5h3.6M18.2 16.2h3.6M18.2 19.9h3.6M18.2 23.6h3.6M18.2 27.3h3.6" stroke="#c9cfd6" stroke-width="1.6"/>
    <rect x="15" y="4.6" width="3" height="3.2" fill="#cea680"/><path d="M14.6 4.8 16.5 3.3l1.9 1.5z" fill="#b68b63"/>
    <circle cx="23.6" cy="6.6" r="1.5" fill="#5fbc51"/>`,
  offices: `<circle cx="20" cy="20" r="19" fill="#e2eef5"/>
    <rect x="9" y="8" width="11" height="25" rx="1" fill="#7b9db0"/><rect x="9" y="7" width="11" height="2.4" rx="1" fill="#f2f4f6"/>
    <path d="M12.7 9.5v23M16.3 9.5v23" stroke="#dde3e8" stroke-width="0.9"/>
    <rect x="21.5" y="15" width="10" height="18" rx="1" fill="#8fadc0"/><rect x="21.5" y="14" width="10" height="2.4" rx="1" fill="#f2f4f6"/>
    <path d="M21.5 20.5h10M21.5 25h10M21.5 29.5h10" stroke="#dde3e8" stroke-width="0.9"/>`,
  shops: `<circle cx="20" cy="20" r="19" fill="#fde6df"/>
    <rect x="7" y="13" width="26" height="8" fill="#fff7e8"/><rect x="6.5" y="11.5" width="27" height="2" rx="0.6" fill="#fff1c7"/>
    <path d="M10 15h3v3h-3zM18.5 15h3v3h-3zM27 15h3v3h-3z" fill="#9cc7df"/>
    <rect x="7" y="21" width="26" height="11" fill="#2fb39a"/>
    <path d="M6.4 21h27.2l-1 3.6H7.4z" fill="#fbf8f2"/><path d="M6.4 21h4.5l-.2 3.6H7.4zM15.4 21h4.5l-.1 3.6h-4.5zM24.5 21H29l.1 3.6h-4.5z" fill="#f0b43c"/>
    <rect x="9.5" y="26" width="12" height="4.6" fill="#9cc7df"/><rect x="24.5" y="26" width="4.4" height="6" fill="#fbf8f2"/>`,
  industrial: `<circle cx="20" cy="20" r="19" fill="#e2e6e9"/>
    <rect x="27" y="6.5" width="3.4" height="15" fill="#a8604f"/><rect x="26.8" y="8.6" width="3.8" height="1.4" fill="#f4f1ea"/>
    <rect x="6" y="21" width="28" height="11" fill="#c9d1d6"/>
    <path d="M6 21v-5.5l7 5.5v-5.5l7 5.5v-5.5l7 5.5v-5.5l7 5.5z" fill="#8f9aa5"/>
    <path d="M9 25h6v7H9zM19 25h6v7h-6z" fill="#f0c75e"/>
    <path d="M9 27.3h6M9 29.6h6M19 27.3h6M19 29.6h6" stroke="#d9b45c" stroke-width="0.7"/>`,
  parks: `<circle cx="20" cy="20" r="19" fill="#b0df88"/>
    <ellipse cx="18" cy="25.5" rx="10" ry="5.6" fill="#ddd6c9"/><ellipse cx="18" cy="25.5" rx="8.9" ry="4.8" fill="#63d1f4"/>
    <rect x="6.2" y="24.7" width="4.4" height="1.6" rx="0.4" fill="#bb5d0d"/>
    <rect x="28.7" y="15.5" width="1.4" height="5" fill="#a1714c"/><circle cx="29.4" cy="13" r="4.6" fill="#6bc357"/>
    <rect x="12.3" y="12" width="1.4" height="4.5" fill="#a1714c"/><circle cx="13" cy="10" r="3.8" fill="#ffadc8"/>
    <circle cx="21.5" cy="12.5" r="3" fill="#85cf61"/>`,
  green: `<circle cx="20" cy="20" r="19" fill="#b9e293"/>
    <rect x="11.3" y="18" width="1.4" height="4" fill="#a1714c"/><path d="M12 6.5 7.5 14.5h9zM12 10.5 7 19h10z" fill="#379e62"/>
    <rect x="23.3" y="17" width="1.4" height="4.5" fill="#a1714c"/><circle cx="24" cy="13.5" r="4.6" fill="#7bcd5d"/>
    <circle cx="30" cy="17.5" r="2.6" fill="#ffbbd1"/>
    <rect x="7.5" y="25" width="11" height="3.6" rx="1.8" fill="#ffd1df"/><rect x="21" y="23.5" width="10.5" height="3.4" rx="1.7" fill="#f6d36a"/>
    <rect x="14.5" y="30.5" width="10" height="3.2" rx="1.6" fill="#c7b8f0"/>`,
  farms: `<circle cx="20" cy="20" r="19" fill="#cdb08a"/>
    <path d="M5.5 24h29M4.6 27.5h30.8M5.6 31h28.8M8.3 34.5h23.4" stroke="#7bc35e" stroke-width="2"/>
    <path d="M3.4 20.5h5" stroke="#e3c76a" stroke-width="2"/>
    <rect x="22.5" y="8.5" width="4.4" height="10.5" fill="#e9eef2"/><path d="M22.5 8.8a2.2 2.2 0 0 1 4.4 0z" fill="#9aa7b2"/>
    <rect x="9" y="12" width="11" height="7.5" fill="#b85a4c"/><path d="M8.3 12.5 14.5 7.8l6.2 4.7z" fill="#5b6b7a"/>
    <rect x="13.2" y="15.3" width="2.6" height="4.2" fill="#f4f1ea"/>`,
  none: `<circle cx="20" cy="20" r="19" fill="#cdeaad"/>
    <circle cx="12.5" cy="24" r="4.6" fill="#5fbc51"/><circle cx="15.5" cy="21.5" r="3.4" fill="#85cf61"/>
    <circle cx="27" cy="15.5" r="3.8" fill="#6bc357"/><circle cx="28" cy="27" r="3.1" fill="#7bcd5d"/>`,
}

/** A Zone's picture, or Roads only's for none: a small disc, `size` px across. */
export const zonePicture = (zone: Zone | undefined, size = 34) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${ZONE_PICTURES[zone?.id ?? 'none']}</svg>`

/** What the toolbar shows, as the game stands. */
interface Showing {
  /** The Layout in the hand, if any, and whether the Price is out of reach. */
  held: Layout | undefined
  short: boolean
  /** The Zone the Tiles laid next are built as; none for Roads only. */
  zone: Zone | undefined
  /** How far every card's picture turns, in degrees clockwise. */
  turn: number
  price: number
  free: boolean
  /** Whether Undo's window is open. */
  undoable: boolean
}

/**
 * The toolbar (#243, "In play"): one kraft surface centred above the status strip with the five Layouts as cards, the
 * Zone button, the Price of the next Tile and Undo, which shows only while its window is open. The card of the Layout
 * in the hand lifts and takes a stamp-red ring. The Zone button shows the Zone picked and opens a paper palette above
 * it with the nine Zones and Roads only in two rows of five, each named by its label and on hover, the one picked
 * ringed and named in its head. A click on a Zone picks it with `pick` and closes the palette, as do `Esc` (through
 * `closePalette`) and a press anywhere else.
 *
 * The screen puts a Layout in the hand by its card, and drags a Zone from the palette onto a placed Tile, through
 * `cards` and `zones`.
 */
export function createToolbar(root: HTMLElement, on: { pick: (zone: Zone | undefined) => void; undo: () => void }) {
  const bar = document.createElement('div')
  bar.className = 'kraft toolbar'
  bar.innerHTML = `
    <div class="layouts">${LAYOUTS.map(
      (l, i) =>
        `<button class="card" data-layout="${l.id}" aria-label="${l.name}" title="${l.name}" style="--tilt: ${TILTS[i]}deg">${picture(l)}</button>`,
    ).join('')}</div>
    <span class="rule"></span>
    <div class="zone-pick">
      <button class="paper zone-button" aria-expanded="false" aria-haspopup="true" title="Built as">
        <span class="picture"></span><span class="name"></span><span class="caret" aria-hidden="true">▴</span>
      </button>
      <div class="paper palette" role="group" aria-label="Built as" hidden style="--tilt: 1deg">
        <span class="tape pink"></span>
        <div class="head"><span class="label">Built as</span><b class="named"></b></div>
        <div class="zones">${ZONE_PICKS.map(
          (z) =>
            `<button class="pick" title="${nameOf(z)}" aria-pressed="false"><span class="sticker">${zonePicture(z)}</span><span class="name">${nameOf(z)}</span></button>`,
        ).join('')}</div>
      </div>
    </div>
    <span class="rule"></span>
    <div class="price"><span class="label">Next tile</span><b class="digits"></b></div>
    <button class="button undo" aria-label="Undo" title="Undo">${UNDO}</button>`
  root.append(bar)
  const el = <T extends HTMLElement = HTMLElement>(s: string) => bar.querySelector<T>(s)!
  const [zoneButton, palette, named, priceEl] = ['.zone-button', '.palette', '.named', '.price b'].map((s) => el(s))
  const undoButton = el<HTMLButtonElement>('.undo')

  const cards = [...bar.querySelectorAll<HTMLElement>('[data-layout]')].map((card, i) => ({ el: card, layout: LAYOUTS[i] }))
  const pictures = [...bar.querySelectorAll<SVGGElement>('.turn')]
  const zones = [...palette.querySelectorAll<HTMLButtonElement>('.pick')].map((pick, i) => ({ el: pick, zone: ZONE_PICKS[i] }))

  /** The Zone picked, as last shown. */
  let picked: Zone | undefined

  const showPalette = (open: boolean) => {
    palette.hidden = !open
    zoneButton.setAttribute('aria-expanded', String(open))
  }
  zoneButton.onclick = () => showPalette(palette.hidden)
  zones.forEach(({ el, zone }) => {
    el.onclick = () => {
      on.pick(zone)
      showPalette(false)
    }
  })
  undoButton.onclick = on.undo
  window.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Node ? e.target : null
    if (!palette.hidden && !palette.contains(target) && !zoneButton.contains(target)) showPalette(false)
  })

  const show = {
    turn: whenChanged((degrees) => pictures.forEach((g) => g.setAttribute('transform', `rotate(${degrees} 32 32)`))),
    zone: whenChanged((id) => {
      el('.zone-button .picture').innerHTML = zonePicture(picked, 32)
      el('.zone-button .name').textContent = named.textContent = nameOf(picked)
      zoneButton.setAttribute('aria-label', `Built as ${nameOf(picked)}`)
      zones.forEach(({ el, zone }) => el.setAttribute('aria-pressed', String((zone?.id ?? 'none') === id)))
    }),
    price: whenChanged((price) => writeDigits(priceEl, price)),
  }

  return {
    el: bar,
    /** Each Layout's card. */
    cards,
    /** Each pick of the Zone palette. */
    zones,

    /** Close the Zone palette, if it is open. Whether it was. */
    closePalette() {
      const open = !palette.hidden
      showPalette(false)
      return open
    },

    update(now: Showing) {
      for (const { el, layout } of cards) {
        el.classList.toggle('held', now.held === layout)
        el.classList.toggle('short', now.held === layout && now.short)
      }
      show.turn(now.turn.toFixed(1))
      picked = now.zone
      show.zone(now.zone?.id ?? 'none')
      show.price(now.free ? 'Free' : yen(now.price))
      undoButton.classList.toggle('gone', !now.undoable)
    },
  }
}
