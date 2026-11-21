// PROTOTYPE for #303, throwaway: the City's demand, a card for the Tile clicked, and the numbers to play with.
import type { Game } from '../game/game'
import type { View } from '../render/view'
import { cellAt, junctionId } from '../sim/tiles'
import { TRIPS, type DemandId } from '../sim/trips.proto'

const TIMES = ['morning', 'afternoon', 'dusk', 'night']
const NAMES: Record<string, string> = {
  'low-density': 'Homes, low-density',
  'medium-density': 'Homes, medium-density',
  'high-density': 'Homes, high-density',
  shops: 'Shops',
  offices: 'Offices',
  industrial: 'Industrial',
  farms: 'Farm',
  parks: 'Park',
  green: 'Green',
}
/** The three demands, in Cities: Skylines' colours. */
const DEMANDS: { id: DemandId; name: string; colour: string; grows: string }[] = [
  { id: 'homes', name: 'Homes', colour: '#4a4', grows: 'homes of every density' },
  { id: 'shops', name: 'Shops', colour: '#39c', grows: 'shops' },
  { id: 'work', name: 'Work', colour: '#e90', grows: 'offices, industrial and farms' },
]

/** A panel on the left of the page. Call its `update` every frame. */
export function createTripsPanel(game: Game, view: View, canvas: HTMLCanvasElement) {
  const trips = game.tileTrips!
  const panel = document.body.appendChild(document.createElement('div'))
  panel.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:50;width:320px;max-height:calc(100vh - 150px);overflow:auto;background:#fffdf5ee;color:#222;font:12px/1.4 ui-monospace,monospace;padding:8px 10px;border:2px solid #c33;border-radius:6px'
  panel.innerHTML = `<b style="color:#c33">PROTOTYPE #303 · demand</b> <button data-hide style="float:right">hide</button><div data-body><div data-demand></div><div data-state style="color:#777;margin-top:6px"></div><div data-tile style="margin-top:8px;border-top:1px solid #ccc;padding-top:6px"></div><details style="margin-top:8px"><summary>Numbers to play with</summary><div data-knobs></div></details></div>`
  const body = panel.querySelector<HTMLElement>('[data-body]')!
  panel.querySelector<HTMLElement>('[data-hide]')!.onclick = () => (body.hidden = !body.hidden)
  const [demand, state, card, box] = ['demand', 'state', 'tile', 'knobs'].map((k) => panel.querySelector<HTMLElement>(`[data-${k}]`)!)

  // The numbers: single ones as they are, and the lists scaled as a whole from where they started.
  const [fleet, places, grow] = [structuredClone(TRIPS.fleet), structuredClone(TRIPS.places), structuredClone(TRIPS.grow)]
  const scaled = (from: Record<string, number[] | undefined>, to: Record<string, number[] | undefined>, by: number) => {
    for (const k in from) to[k] = from[k]!.map((n) => Math.max(1, Math.round(n * by)))
  }
  const knobs: [string, number, number, (v: number) => void][] = [
    ['where a demand rests in balance (0 to 1)', TRIPS.rest, 0.05, (v) => (TRIPS.rest = v)],
    ['least a demand falls to (0 to 1)', TRIPS.floor, 0.05, (v) => (TRIPS.floor = v)],
    ['jobs a household wants', TRIPS.wants.jobs, 0.1, (v) => (TRIPS.wants.jobs = v)],
    ['shop places a household wants', TRIPS.wants.shopping, 0.1, (v) => (TRIPS.wants.shopping = v)],
    ['trips to grow a Tile ×', 1, 0.25, (v) => scaled(grow, TRIPS.grow, v)],
    ['pace of parks and green (0 to 1)', TRIPS.leisure, 0.1, (v) => (TRIPS.leisure = v)],
    ['vehicles per Tile ×', 1, 0.25, (v) => (scaled(fleet, TRIPS.fleet, v), scaled(places, TRIPS.places, v))],
    ['through trips/min per Gateway', TRIPS.through, 0.5, (v) => (TRIPS.through = v)],
    ['rest at home, s', TRIPS.dwell, 5, (v) => (TRIPS.dwell = v)],
    ['stay at work, s', TRIPS.stay.work, 5, (v) => (TRIPS.stay.work = TRIPS.stay.workers = v)],
    ['stay at shops, s', TRIPS.stay.shopping, 5, (v) => (TRIPS.stay.shopping = TRIPS.stay.customers = v)],
  ]
  for (const [label, value, step, set] of knobs) {
    const row = box.appendChild(document.createElement('label'))
    row.style.cssText = 'display:flex;justify-content:space-between;margin:2px 0'
    row.textContent = label
    const input = row.appendChild(document.createElement('input'))
    Object.assign(input, { type: 'number', value: String(value), step: String(step), min: '0' })
    input.style.width = '60px'
    input.onchange = () => {
      set(Number(input.value))
      game.syncTrips()
    }
    // The game's own keys must not fire while a number is typed.
    input.onkeydown = (e) => e.stopPropagation()
  }

  // A click on a Tile, not a drag of the board, picks it for the card.
  let selected: string | undefined
  let down: PointerEvent | undefined
  canvas.addEventListener('pointerdown', (e) => (down = e))
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) > 5) return
    const p = view.pick(e)
    const tile = p && game.city.tileAt(cellAt(p))
    selected = tile?.zone ? junctionId(tile.cell) : undefined
    last = 0
  })

  /** A bar filled to `share`, with a tick at `mark` if given: where a demand rests in balance. */
  const bar = (share: number, colour: string, mark?: number) =>
    `<span style="position:relative;display:inline-block;width:110px;height:10px;background:#ddd;border-radius:3px;vertical-align:middle"><span style="display:block;height:100%;border-radius:3px;width:${Math.round(share * 100)}%;background:${colour}"></span>${mark === undefined ? '' : `<span style="position:absolute;top:-3px;left:${Math.round(mark * 100)}%;width:2px;height:16px;background:#222"></span>`}</span>`
  const list = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([k, n]) => `<div>&nbsp;&nbsp;${n} ${k}</div>`)
      .join('')

  let last = 0
  return {
    update() {
      const now = performance.now()
      if (now - last < 250 || body.hidden) return
      last = now
      const { households, jobs, shopping } = trips.city
      const why: Record<DemandId, string> = {
        homes: `${jobs} jobs could keep ${Math.round(jobs / TRIPS.wants.jobs)} households busy; the City has ${households}.`,
        shops: `${households} households want room for ${Math.round(households * TRIPS.wants.shopping)} shoppers; the shops have ${shopping}.`,
        work: `${households} households want ${Math.round(households * TRIPS.wants.jobs)} jobs; the City offers ${jobs}.`,
      }
      const most = DEMANDS.reduce((a, b) => (trips.demand[b.id] > trips.demand[a.id] ? b : a))
      demand.innerHTML =
        `<div style="margin:4px 0"><b>Demand</b> <span style="color:#777">· what the City wants more of. A bar past its tick means build more of it, and its Tiles grow faster. Under the tick there is too much of it.</span></div>` +
        DEMANDS.map(
          (d) =>
            `<div title="${why[d.id]}"><span style="display:inline-block;width:52px"><b>${d.name}</b></span>${bar(trips.demand[d.id], d.colour, TRIPS.rest)} ${Math.round(trips.demand[d.id] * 100)}%<div style="color:#777;margin:0 0 4px 52px">${why[d.id]}</div></div>`,
        ).join('') +
        (trips.demand[most.id] > TRIPS.rest + 0.08
          ? `<div>The City most wants <b style="color:${most.colour}">${most.name.toLowerCase()}</b>: place or grow ${most.grows}.</div>`
          : `<div>The City is in balance: everything grows at a normal pace.</div>`)
      state.innerHTML = `It is ${TIMES[Math.floor(trips.clock * 4)]}, day ${Math.floor(game.sim.time / TRIPS.day) + 1}. ${game.sim.vehicles.length} vehicles on the road, ${game.sim.jams.length} Jams, ${trips.starts.length} trips set out in the last minute.`

      const t = selected && trips.tiles.get(selected)
      const growth = selected && trips.growth(selected)
      if (!t || !growth)
        return void (card.innerHTML =
          '<span style="color:#777">Click a zoned Tile on the board to see who lives, works or shops there.</span>')
      const by = DEMANDS.find((d) => d.id === growth.by)
      const { own, here } = trips.people(t.id)
      const pace = Math.round(growth.pace * 100)
      card.innerHTML =
        `<b>${NAMES[t.zone]}</b> ${'★'.repeat(t.stage)}${'☆'.repeat(3 - t.stage)}` +
        (t.stage === 3
          ? '<div>Fully grown.</div>'
          : `<div>${bar(Math.min(1, growth.progress / growth.full), '#222')} to ${'★'.repeat(t.stage + 1)}</div>
             <div style="color:#777">${
               by
                 ? `Grows with <b style="color:${by.colour}">${by.name}</b> demand, now ${pace}%: each trip here counts for ${growth.pace.toFixed(2)} of a trip.`
                 : `No demand drives parks and green yet: each visitor counts for ${growth.pace.toFixed(2)} of a trip.`
             }</div>`) +
        (Object.keys(own).length
          ? `<div style="margin-top:4px">Its ${t.zone === 'industrial' || t.zone === 'farms' ? 'trucks' : 'households (one car each)'}:</div>${list(own)}`
          : '') +
        `<div style="margin-top:4px">Here right now:</div>${list(here) || '<div>&nbsp;&nbsp;nobody visiting</div>'}`
    },
  }
}
