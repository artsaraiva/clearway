// PROTOTYPE for #303, throwaway: measures the trips prototype headless against today's game, on the same Cities.
//   node -e "import('vite').then((v) => v.runnerImport('./scripts/trips.proto.ts'))"
//   CITY=homes MIN=30 SEEDS=3 ...   the City (mixed, homes, or a number of Tiles of mixed), sim-minutes, seeds
import { Game } from '../src/game/game'
import { tripsCity } from '../src/game/trips-cities.proto'
import { DT } from '../src/sim/sim'
import { junctionId } from '../src/sim/tiles'
import { TRIPS } from '../src/sim/trips.proto'
import { GATEWAY_DEMAND } from '../src/tuning'

declare const process: { env: Record<string, string | undefined> }
const MIN = Number(process.env.MIN ?? 30)
const SEEDS = Number(process.env.SEEDS ?? 3)
const NAMES = (process.env.CITY ?? 'mixed,homes').split(',')
for (const [k, v] of Object.entries(process.env)) {
  // T_through=2 T_dwell=30 T_fleet=1.5 T_counts=2 ...
  if (!k.startsWith('T_') || v === undefined) continue
  const name = k.slice(2)
  const scale = (o: Record<string, number[] | undefined>) =>
    Object.keys(o).forEach((z) => (o[z] = o[z]!.map((n) => Math.max(1, Math.round(n * Number(v))))))
  if (name === 'fleet') (scale(TRIPS.fleet), scale(TRIPS.places))
  else if (name === 'grow')
    Object.keys(TRIPS.grow).forEach((z) => (TRIPS.grow[z as 'shops'] = TRIPS.grow[z as 'shops'].map((c) => c * Number(v))))
  else (TRIPS as unknown as Record<string, number>)[name] = Number(v)
}

if (process.env.BASE) GATEWAY_DEMAND.base = Number(process.env.BASE)
const ONLY = process.env.ONLY
const mean = (a: number[]) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : NaN)
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-')

function run(name: string, seed: number, trips: boolean) {
  const game = new Game(seed, { city: tripsCity(name), free: true, trips })
  while (!game.sim.prewarmed) game.step()
  const t0 = game.sim.time
  const reached: Record<string, number[]> = {}
  game.onStage = (cell, _from, to) =>
    ((reached[`${game.city.tileAt(cell)!.zone!.id} ${junctionId(cell)}`] ??= [])[to] = (game.sim.time - t0) / 60)
  let [onRoad, jams, steps, exits] = [0, 0, 0, 0]
  const done0 = game.sim.completed
  for (; game.sim.time - t0 < MIN * 60; steps++) {
    game.step()
    onRoad += game.sim.vehicles.length
    jams += game.sim.jams.length
  }
  exits = game.sim.completed - done0
  const gateways = Object.keys(game.sim.net.gateways).length
  const tt = game.tileTrips
  const rates = Object.values(game.sim.rates).reduce((s, r) => s + r.rate, 0)
  return {
    gateways,
    onRoad: onRoad / steps,
    jams: jams / steps,
    flow: game.sim.flow,
    // Today every trip is one Gateway entry; the prototype counts its own.
    starts: tt ? tt.total.starts / ((steps * DT) / 60) : rates,
    entries: (tt ? tt.total.entries / ((steps * DT) / 60) : rates) / gateways,
    exits: exits / MIN / gateways,
    quarters: tt?.total.byQuarter.map((n) => n / ((steps * DT) / 60 / 4)),
    met: tt && [tt.total.met, tt.total.metBeyond],
    reached,
    tiles: game.city.tiles.filter((t) => t.zone).length,
    left: tt && [`demand homes ${f(tt.demand.homes, 2)} shops ${f(tt.demand.shops, 2)} work ${f(tt.demand.work, 2)} at the end`],
  }
}

for (const name of NAMES) {
  for (const trips of [false, true]) {
    if (ONLY && (ONLY === 'today') === trips) continue
    const runs = Array.from({ length: SEEDS }, (_, i) => run(name, i + 1, trips))
    const r = runs[0]
    console.log(
      `\n== ${name} · ${trips ? 'PROTOTYPE trips between Tiles' : 'today'} · ${r.gateways} Gateways, ${r.tiles} zoned Tiles, ${MIN} min, ${SEEDS} seeds`,
    )
    console.log(
      `  on the road ${f(mean(runs.map((x) => x.onRoad)))} · trips/min ${f(mean(runs.map((x) => x.starts)))} · in per Gateway/min ${f(mean(runs.map((x) => x.entries)))} · out per Gateway/min ${f(mean(runs.map((x) => x.exits)))} · Jams ${f(mean(runs.map((x) => x.jams)), 2)} · Flow ${f(mean(runs.map((x) => x.flow)), 2)}`,
    )
    if (r.quarters)
      console.log(
        `  trips/min by time of day (morning, afternoon, dusk, night): ${r.quarters.map((_, i) => f(mean(runs.map((x) => x.quarters![i])))).join(' ')}`,
      )
    if (r.met)
      console.log(`  Needs met ${f(mean(runs.map((x) => x.met![0])), 0)}, beyond a Gateway ${f(mean(runs.map((x) => x.met![1])), 0)}`)
    for (const stage of [2, 3]) {
      const keys = [...new Set(runs.flatMap((x) => Object.keys(x.reached)))].sort()
      const all = runs
        .flatMap((x) =>
          Object.values(x.reached)
            .map((t) => t[stage])
            .filter((t) => t !== undefined),
        )
        .sort((a, b) => a - b)
      console.log(
        `  Stage ${stage}: ${all.length}/${r.tiles * SEEDS} Tiles · first ${f(all[0])} median ${f(all[Math.floor(all.length / 2)])} last ${f(all.at(-1)!)} min`,
      )
      console.log(
        '    ' +
          keys
            .map(
              (k) =>
                `${k.replace(/ c/, '(').replace('_', ',')}) ${f(mean(runs.flatMap((x) => (x.reached[k]?.[stage] !== undefined ? [x.reached[k][stage]] : []))))}`,
            )
            .join(' · '),
      )
    }
    if (r.left?.length) console.log('  seed 1: ' + r.left.join(' | '))
  }
}
