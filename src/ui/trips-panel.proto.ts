// PROTOTYPE for #303, throwaway: the trips prototype's state, on the page, and the numbers to play with.
import type { Game } from '../game/game'
import { cellAt } from '../sim/tiles'
import { TRIPS } from '../sim/trips.proto'

const TIMES = ['morning', 'afternoon', 'dusk', 'night']
const STATES = {
  home: 'home',
  leaving: 'out',
  out: 'out',
  staying: 'away',
  returning: 'away',
  back: 'out',
  beyond: 'beyond',
  entering: 'beyond',
}

/** A panel on the left of the page. Call its `update` every frame. */
export function createTripsPanel(game: Game) {
  const trips = game.tileTrips!
  const panel = document.body.appendChild(document.createElement('div'))
  panel.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:50;width:300px;max-height:calc(100vh - 150px);overflow:auto;background:#fffdf5ee;color:#222;font:12px/1.35 ui-monospace,monospace;padding:8px 10px;border:2px solid #c33;border-radius:6px'
  panel.innerHTML = `<b style="color:#c33">PROTOTYPE #303 · trips between Tiles</b> <button data-hide style="float:right">hide</button><div data-body><div data-state></div><details open><summary>Tiles and their Needs</summary><div data-tiles></div></details><details><summary>Numbers to play with</summary><div data-knobs></div></details></div>`
  const body = panel.querySelector<HTMLElement>('[data-body]')!
  panel.querySelector<HTMLElement>('[data-hide]')!.onclick = () => (body.hidden = !body.hidden)
  const state = panel.querySelector<HTMLElement>('[data-state]')!
  const tiles = panel.querySelector<HTMLElement>('[data-tiles]')!

  // The numbers: single ones as they are, and the lists scaled as a whole from where they started.
  const fleet = structuredClone(TRIPS.fleet)
  const places = structuredClone(TRIPS.places)
  const counts = structuredClone(TRIPS.counts)
  const scaled = (from: Record<string, number[] | undefined>, to: Record<string, number[] | undefined>, by: number) => {
    for (const k in from) to[k] = from[k]!.map((n) => Math.max(1, Math.round(n * by)))
  }
  const times = (from: Record<string, number[]>, to: Record<string, number[]>, by: number) => {
    for (const k in from) to[k] = from[k].map((n) => n * by)
  }
  const knobs: [string, number, number, (v: number) => void][] = [
    ['through trips/min per Gateway', TRIPS.through, 0.5, (v) => (TRIPS.through = v)],
    ['vehicles per Tile ×', 1, 0.25, (v) => (scaled(fleet, TRIPS.fleet, v), scaled(places, TRIPS.places, v))],
    ['arrivals to fill a Need ×', 1, 0.25, (v) => times(counts, TRIPS.counts, v)],
    ['rest at home, s', TRIPS.dwell, 5, (v) => (TRIPS.dwell = v)],
    ['away beyond a Gateway, s', TRIPS.beyond, 5, (v) => (TRIPS.beyond = v)],
    ['stay at work, s', TRIPS.stay.work, 5, (v) => (TRIPS.stay.work = TRIPS.stay.workers = v)],
    ['stay at shops, s', TRIPS.stay.shopping, 5, (v) => (TRIPS.stay.shopping = TRIPS.stay.customers = v)],
    ['nearer partner: spread, s', TRIPS.spread, 5, (v) => (TRIPS.spread = v)],
  ]
  const box = panel.querySelector<HTMLElement>('[data-knobs]')!
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
  box.insertAdjacentHTML('beforeend', '<div style="color:#777;margin-top:4px">Through traffic changes at the next Tile placed.</div>')

  let last = 0
  return {
    update() {
      const now = performance.now()
      if (now - last < 250 || body.hidden) return
      last = now
      const gateways = Object.keys(game.sim.net.gateways).length
      const tally = (outside: boolean) => {
        const n: Record<string, number> = { home: 0, out: 0, away: 0, beyond: 0 }
        for (const c of trips.cars) if (!!c.outside === outside) n[STATES[c.state]]++
        return n
      }
      const [own, outs] = [tally(false), tally(true)]
      const bar = (share: number) => '█'.repeat(Math.round(share * 8)).padEnd(8, '░')
      const rows = [...trips.tiles.values()].map((t) => {
        const cell = cellAt(game.sim.net.junctions.find((j) => j.id === t.id)?.at ?? { x: 0, y: 0 })
        const mine = trips.cars.filter((c) => c.tile === t.id && !c.outside)
        const needs = trips
          .needs(t.id)
          .map(
            (n) =>
              `<span style="color:${n.count >= n.full ? '#283' : '#222'}">${n.need} ${bar(Math.min(1, n.count / n.full))} ${Math.min(n.count, n.full)}/${n.full}</span>`,
          )
          .join('<br>&nbsp;&nbsp;')
        return `<div style="margin-top:4px"><b>${t.zone}</b> ${'★'.repeat(t.stage)} <span style="color:#777">(${cell.x},${cell.y})${mine.length ? ` · ${mine.filter((c) => c.state === 'home').length}/${mine.length} at home` : ''}</span><br>&nbsp;&nbsp;${t.stage === 3 ? 'grown' : needs}</div>`
      })
      state.innerHTML = `
        <div><b>${TIMES[Math.floor(trips.clock * 4)]}</b> ${bar((trips.clock * 4) % 1)} · day ${Math.floor(game.sim.time / TRIPS.day) + 1} · ${Math.floor(game.sim.time / 60)} min</div>
        <div>on the road <b>${game.sim.vehicles.length}</b> · trips/min <b>${trips.starts.length}</b> · Jams ${game.sim.jams.length}</div>
        <div>in by a Gateway/min <b>${(trips.entries.length / (gateways || 1)).toFixed(1)}</b> per Gateway (${gateways} Gateways)</div>
        <div>the City's own: ${own.home} home · ${own.out} driving · ${own.away} visiting · ${own.beyond} beyond</div>
        <div>outsiders: ${outs.out} driving · ${outs.away} visiting · ${outs.beyond} beyond</div>
        <div>Needs met ${trips.total.met}, ${trips.total.metBeyond} of them beyond a Gateway</div>`
      tiles.innerHTML = rows.join('')
    },
  }
}
