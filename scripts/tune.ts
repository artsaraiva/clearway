// Dev script, not a test: grows scripted Cities headless, a Tile at a time, and reports them against the bars of
// .scratch/tile-sandbox/spec.md. Each City is grown twice. Untouched, to see where a Jam emerges. Then fixed: whenever
// a Junction jams, a search tries Changes first, then a Swap (a Crossroads for a Roundabout, or back), then a placement
// that joins two placed Tiles, which adds a second route.
//   npm run tune
//   CITY=grid npm run tune                 one City
//   SEARCH=0 npm run tune                  untouched only
//   BASE=4 GROWTH=0.05 npm run tune        try numbers without editing src/tuning.ts:
//     BASE, GROWTH, WEIGHTS=1,1,2,3 (Gateway Demand), PRICE_BASE, PRICE_GROWTH, REBATE, FLOOR (per minute, as 1/FLOOR), PAY
//   SEED=2 SEEDS=3 RUN=420 TILES=14 npm run tune   the first seed and how many each measurement runs, sim-seconds
//     measured after the Pre-warm, Tiles to grow to
import { beyond, City, DIRECTIONS, hasRoad, LAYOUTS, type Cell, type Layout, type Tile } from '../src/city/city'
import { DT, Sim } from '../src/sim/sim'
import type { Change, Priority } from '../src/sim/spec'
import { junctionId } from '../src/sim/tiles'
import { ECONOMY, GATEWAY_DEMAND, PRICE } from '../src/tuning'

declare const process: { env: Record<string, string | undefined> }
const env = (name: string) => (process.env[name] === undefined ? undefined : Number(process.env[name]))

GATEWAY_DEMAND.base = env('BASE') ?? GATEWAY_DEMAND.base
GATEWAY_DEMAND.growth = env('GROWTH') ?? GATEWAY_DEMAND.growth
GATEWAY_DEMAND.weights = process.env.WEIGHTS?.split(',').map(Number) ?? GATEWAY_DEMAND.weights
PRICE.base = env('PRICE_BASE') ?? PRICE.base
PRICE.growth = env('PRICE_GROWTH') ?? PRICE.growth
ECONOMY.loopRebate = env('REBATE') ?? ECONOMY.loopRebate
ECONOMY.incomeFloor = env('FLOOR') ? 1 / env('FLOOR')! : ECONOMY.incomeFloor
ECONOMY.pay = env('PAY') ?? ECONOMY.pay

const SEED = env('SEED') ?? 1
const SEEDS = env('SEEDS') ?? 3
const RUN = env('RUN') ?? 420
const TILES = env('TILES') ?? 14
const SEARCH = process.env.SEARCH !== '0'
const TAIL = 120 // the last sim-seconds of a run, which trips a minute and the Junctions' Flow are measured over
const JAM = 0.5 // a Junction whose Approaches move slower than this share of free speed is jammed
const CONFIRM = 3 // candidates of a search round measured in full
const PACE_TILES = 12
const SPEED = 4 // the Pace bar is in minutes played at 4×

type Step = [layout: Layout['id'], rotation: number, x: number, y: number]
/** The first Step is the starting Tile. Rotations are quarter turns counterclockwise; a Curve at 0 joins east and north. */
const CITIES: Record<string, Step[]> = {
  // Compact: four loops around the start, one of them through a Roundabout.
  grid: [
    ['crossroads', 0, 0, 0],
    ['crossroads', 0, 1, 0],
    ['tee', 1, 1, 1],
    ['curve', 3, 0, 1],
    ['roundabout', 0, -1, 0],
    ['tee', 0, 0, -1],
    ['curve', 1, 1, -1],
    ['curve', 0, -1, -1],
    ['crossroads', 0, 2, 0],
    ['tee', 1, -1, 1],
    ['straight', 1, 2, 1],
    ['curve', 0, 2, -1],
    ['crossroads', 0, -2, 0],
    ['straight', 0, 3, 0],
  ],
  // A sprawl: a line that branches, with three loops closed late.
  sprawl: [
    ['tee', 0, 0, 0],
    ['straight', 0, 1, 0],
    ['crossroads', 0, 2, 0],
    ['curve', 0, -1, 0],
    ['tee', 1, 0, 1],
    ['curve', 3, -1, 1],
    ['straight', 1, 2, 1],
    ['tee', 3, 2, -1],
    ['crossroads', 0, 3, 0],
    ['curve', 1, 3, -1],
    ['roundabout', 0, 0, 2],
    ['straight', 0, 4, 0],
    ['tee', 1, 2, 2],
    ['straight', 0, 1, 2],
  ],
  // No loops at all: a tree of Crossroads and T-junctions, so every trip has one route.
  tree: [
    ['crossroads', 0, 0, 0],
    ['straight', 1, 0, 1],
    ['crossroads', 0, 0, 2],
    ['tee', 2, 1, 0],
    ['tee', 2, -1, 0],
    ['straight', 1, 0, -1],
    ['straight', 0, 2, 0],
    ['crossroads', 0, 3, 0],
    ['curve', 0, -2, 0],
    ['tee', 2, 0, 3],
    ['straight', 0, -1, 2],
    ['tee', 0, 1, 2],
    ['straight', 1, 3, 1],
    ['curve', 0, 1, -1],
  ],
}

const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
const fmt = (n: number) => Math.round(n).toLocaleString('en')
const pct = (n: number) => `${Math.round(n * 100)}%`
const at = (cell: Cell) => `${cell.x},${cell.y}`

/** What a City carries under a configuration, over `RUN` sim-seconds after the Pre-warm, averaged over `SEEDS` seeds. */
interface Result {
  /** Trips a minute its Gateways send, and trips a minute that arrived over the last `TAIL` seconds. */
  demand: number
  trips: number
  flow: number
  /** Flow on the Approaches of each Junction over the last `TAIL` seconds, with the cars waiting off the map at its Gateways. */
  flows: Record<string, number>
  sim: Sim
}

function measure(city: City, carried: Change[]): Result {
  const runs = Array.from({ length: SEEDS }, (_, k) => measureSeed(city, carried, SEED + k))
  const mean = (of: (r: (typeof runs)[number]) => number) => runs.reduce((sum, r) => sum + of(r), 0) / runs.length
  return {
    demand: runs[0].demand,
    trips: mean((r) => r.trips),
    flow: mean((r) => r.flow),
    flows: Object.fromEntries(Object.keys(runs[0].flows).map((id) => [id, mean((r) => r.flows[id])])),
    sim: runs[0].sim,
  }
}

function measureSeed(city: City, carried: Change[], seed: number) {
  const sim = new Sim(city, carried, seed)
  const [steps, tail] = [Math.round(RUN / DT), Math.round(TAIL / DT)]
  const sums: Record<string, [number, number]> = Object.fromEntries(sim.net.junctions.map((j) => [j.id, [0, 0]]))
  let before = 0
  for (let i = 0; i < steps; i++) {
    if (i === steps - tail) before = sim.completed
    sim.step()
    if (i < steps - tail || i % 30) continue
    for (const j of sim.net.junctions) {
      for (const arm of j.arms) {
        for (const lane of arm.approach) {
          for (const v of lane.vehicles) {
            sums[j.id][0] += Math.min(1, v.v / v.vFree)
            sums[j.id][1]++
          }
        }
        if (sim.net.gateways[arm.road] === arm) sums[j.id][1] += sim.queues[arm.road]?.length ?? 0
      }
    }
  }
  return {
    demand: Object.values(sim.rates).reduce((sum, d) => sum + d.rate, 0),
    trips: ((sim.completed - before) / TAIL) * 60,
    flow: sim.flow,
    flows: Object.fromEntries(Object.entries(sums).map(([id, [sum, n]]) => [id, n ? sum / n : 1])),
    sim,
  }
}

const jammed = (r: Pick<Result, 'flows'>) => Object.keys(r.flows).filter((id) => r.flows[id] < JAM).sort((a, b) => r.flows[a] - r.flows[b]) // prettier-ignore
const worst = (r: Result, n: number) => Object.keys(r.flows).sort((a, b) => r.flows[a] - r.flows[b]).slice(0, n) // prettier-ignore
/** Whether no Junction is jammed. */
const clear = (r: Pick<Result, 'flows'>) => jammed(r).length === 0
/** Fewer Jams beat more; with as many, more Flow is better. */
const score = (r: Pick<Result, 'flows' | 'flow'>) => r.flow - jammed(r).length
const income = (city: City, r: Result) => Math.max(r.trips * ECONOMY.pay, city.price * ECONOMY.incomeFloor)
const show = (city: City, r: Result) =>
  `${fmt(r.trips)} of ${fmt(r.demand)} trips/min, Flow ${pct(r.flow)}, ¥${fmt(income(city, r))}/min, jammed: ${jammed(r).join(' ') || 'none'}`

interface Named {
  name: string
  change: Change
}

/** Single Changes to try at a Junction: every main/yield split of a Priority junction's Arms, and each disabled kind of Connection opened. */
function candidates(sim: Sim, id: string): Named[] {
  const junction = sim.net.junctions.find((j) => j.id === id)!
  const out: Named[] = []
  if (junction.type === 'roundabout') {
    // The same Connection at every Arm: an Approach lane onto the other Ring lane, a Ring lane out by the other Exit lane.
    const refs = new Set(
      junction.arms.flatMap((a) => a.connections.filter((c) => !c.enabled).map((c) => c.ref.replaceAll(`${a.road}.`, '*.'))),
    )
    return [...refs].map((ref) => ({ name: `open ${ref}`, change: { at: id, enable: [ref] } }))
  }
  const roads = junction.arms.map((a) => a.road)
  if (roads.length > 2) {
    for (let mask = 1; mask < (1 << roads.length) - 1; mask++) {
      const priority = Object.fromEntries(roads.map((r, k) => [r, (mask >> k) & 1 ? 'main' : 'yield'])) as Record<string, Priority>
      out.push({ name: `main ${roads.filter((_, k) => (mask >> k) & 1).join('+')}`, change: { at: id, priority } })
    }
  }
  // Every lane of an Arm may take the turn to another, each into its own lane.
  for (const arm of junction.arms) {
    for (const to of junction.arms) {
      if (to === arm) continue
      const refs = arm.approach.map((l) => `${arm.road}.in${l.index}>${to.road}.out${Math.min(l.index, to.exit.length - 1)}`)
      const off = refs.filter((ref) => !arm.connections.find((c) => c.ref === ref)?.enabled)
      if (off.length) out.push({ name: `open ${off.join(', ')}`, change: { at: id, enable: off } })
    }
  }
  return out
}

/**
 * Greedy: at the worst Junctions, the single Change that helps most, again and again until no Junction is jammed or
 * nothing helps. Every candidate is screened on one seed, and only the `CONFIRM` best are measured in full.
 */
function searchChanges(city: City, carried: Change[], now: Result, rounds = 4) {
  const made: Named[] = []
  for (let round = 0; round < rounds && !clear(now); round++) {
    const screened = worst(now, 3)
      .flatMap((id) => candidates(now.sim, id))
      .map((c) => ({ c, screen: measureSeed(city, [...carried, c.change], SEED) }))
      .sort((a, b) => score(b.screen) - score(a.screen))
    let best: { c: Named; result: Result } | undefined
    for (const { c } of screened.slice(0, CONFIRM)) {
      const result = measure(city, [...carried, c.change])
      if (score(result) > score(best?.result ?? now) + 0.02) best = { c, result }
      if (clear(result)) break
    }
    if (!best) break
    carried = [...carried, best.c.change]
    made.push(best.c)
    now = best.result
  }
  return { carried, made, result: now }
}

/** The Swaps to try: every Crossroads for a Roundabout and every Roundabout for a Crossroads, the worst Junction first. */
function swaps(city: City, now: Result): Tile[] {
  const other = { crossroads: 'roundabout', roundabout: 'crossroads' } as const
  return city.tiles
    .filter((t) => t.layout.id === 'crossroads' || t.layout.id === 'roundabout')
    .sort((a, b) => now.flows[junctionId(a.cell)] - now.flows[junctionId(b.cell)])
    .map((t) => ({ ...t, layout: layout(other[t.layout.id as keyof typeof other]) }))
}

/** The placements to try: every legal drop that joins two or more placed Tiles by road, so it adds a second route. */
function placements(city: City): Tile[] {
  const out = new Map<string, Tile>()
  for (const tile of city.tiles) {
    for (const d of DIRECTIONS) {
      const cell = beyond(tile.cell, d)
      for (const l of LAYOUTS) {
        for (let rotation = 0; rotation < 4; rotation++) {
          const verdict = city.drop(l, rotation, cell)
          if (!verdict.legal || verdict.joins < 2) continue
          const candidate = { cell, layout: l, rotation }
          // A Layout turned onto itself is the same Tile.
          const roads = DIRECTIONS.map((side) => (hasRoad(candidate, side) ? 1 : 0)).join('')
          out.set(`${at(cell)} ${l.id === 'roundabout' ? 'r' : ''}${roads}`, candidate)
        }
      }
    }
  }
  return [...out.values()]
}

/** The first of `tiles` that leaves no Junction jammed once placed; failing that, the best of them with Changes on top. */
function searchBuilding(city: City, carried: Change[], tiles: Tile[]) {
  let best: { tile: Tile; city: City; carried: Change[]; made: Named[]; result: Result } | undefined
  for (const tile of tiles) {
    const built = new City(city.tiles)
    const swap = city.tiles.some((t) => at(t.cell) === at(tile.cell))
    built.place(tile.layout, tile.rotation, tile.cell)
    // A Swap resets the swapped Tile's Changes.
    const kept = swap ? carried.filter((c) => c.at !== junctionId(tile.cell)) : carried
    const result = measure(built, kept)
    if (!best || score(result) > score(best.result)) best = { tile, city: built, carried: kept, made: [], result }
    if (clear(result)) return best
  }
  if (!best) return undefined
  const changed = searchChanges(best.city, best.carried, best.result, 2)
  return { ...best, ...changed }
}

type Fix = 'Change' | 'Swap' | 'placement' | 'none'

function grow(name: string, steps: Step[], fix: boolean) {
  console.log(fix ? '-- fixed whenever a Junction jams' : '-- untouched')
  const [first, ...rest] = steps
  let city = new City([{ layout: layout(first[0]), rotation: first[1], cell: { x: first[2], y: first[3] } }])
  let carried: Change[] = []
  let now = measure(city, carried)
  /** Sim-minutes of earning so far. The second Tile is paid for from the hand. */
  let minutes = 0
  let hand = city.price
  let pace: number | undefined
  const fixes: { tiles: number; by: Fix }[] = []
  let firstJam: number | undefined
  const pay = (yen: number) => {
    const fromHand = Math.min(hand, yen)
    hand -= fromHand
    minutes += (yen - fromHand) / income(city, now)
  }
  const report = (what: string) =>
    console.log(`${String(city.tiles.length).padStart(2)} ${what} (${city.gateways().length} Gateways): ${show(city, now)}`)

  report(`start: ${first[0]}`)
  for (const [id, rotation, x, y] of rest) {
    if (city.tiles.length >= TILES) break
    const cell = { x, y }
    const verdict = city.drop(layout(id), rotation, cell)
    if (!verdict.legal) {
      console.log(`   SKIPPED ${id} at ${at(cell)}: ${verdict.reason}`)
      continue
    }
    pay(city.price * (verdict.joins >= 2 ? 1 - ECONOMY.loopRebate : 1))
    city.place(layout(id), rotation, cell)
    now = measure(city, carried)
    if (city.tiles.length === PACE_TILES) pace = minutes
    report(`${id} at ${at(cell)}${verdict.joins >= 2 ? ' (loop)' : ''}`)
    if (clear(now)) continue
    firstJam ??= city.tiles.length
    if (!fix) continue

    const tiles = city.tiles.length
    const changed = searchChanges(city, carried, now)
    for (const c of changed.made) console.log(`      Change at ${c.change.at}: ${c.name}`)
    carried = changed.carried
    now = changed.result
    if (clear(now)) {
      console.log(`      → Changes clear the Jams: ${show(city, now)}`)
      fixes.push({ tiles, by: 'Change' })
      continue
    }
    console.log(`      no Change clears the Jams (best: ${show(city, now)})`)
    // Both kinds of building are tried, to learn which clear the Jams; the first that does is the one built.
    let built: (NonNullable<ReturnType<typeof searchBuilding>> & { kind: Exclude<Fix, 'Change' | 'none'> }) | undefined
    for (const [kind, candidates] of [
      ['Swap', swaps(city, now)],
      ['placement', placements(city)],
    ] as const) {
      const found = searchBuilding(city, carried, candidates)
      if (!found) {
        console.log(`      no ${kind} to try`)
        continue
      }
      const what = `${kind} of ${found.tile.layout.id} at ${at(found.tile.cell)}${found.made.map((c) => `, Change at ${c.change.at}: ${c.name}`).join('')}`
      if (!clear(found.result)) {
        console.log(`      no ${kind} clears the Jams (best: ${what} → ${show(found.city, found.result)})`)
        continue
      }
      console.log(`      → ${what} clears the Jams${built ? ' too' : ''}: ${show(found.city, found.result)}`)
      fixes.push({ tiles, by: kind })
      built ??= { ...found, kind }
    }
    if (!built) {
      fixes.push({ tiles, by: 'none' })
      continue
    }
    pay(city.price * (built.kind === 'placement' ? 1 - ECONOMY.loopRebate : 1))
    ;({ city, carried, result: now } = built)
  }
  console.log(
    `   ${city.tiles.length} Tiles after ${minutes.toFixed(0)} sim-min` +
      (pace === undefined ? '' : `; ${PACE_TILES} Tiles after ${pace.toFixed(0)} sim-min, ${(pace / SPEED).toFixed(1)} min at ${SPEED}×`),
  )
  return { name, firstJam, fixes, pace }
}

const priceOf = (n: number) =>
  new City(Array.from({ length: n }, (_, x) => ({ cell: { x, y: 0 }, layout: layout('straight'), rotation: 0 }))).price
console.log(
  `Gateway Demand: base ${GATEWAY_DEMAND.base}, weights ${GATEWAY_DEMAND.weights.join(' ')}, growth ${GATEWAY_DEMAND.growth}. ` +
    `Pay ¥${ECONOMY.pay}. Price base ¥${PRICE.base}, growth ${PRICE.growth}: ${[1, 2, 3, 5, 8, 11].map((n) => `#${n + 1} ¥${fmt(priceOf(n))}`).join(' ')}. ` +
    `Loop rebate ${pct(ECONOMY.loopRebate)}, Income floor Price ÷ ${(1 / ECONOMY.incomeFloor).toFixed(0)} a minute. Seeds ${SEED} to ${SEED + SEEDS - 1}, ${RUN} s runs.`,
)
const summaries: { untouched: ReturnType<typeof grow>; fixed?: ReturnType<typeof grow> }[] = []
for (const [name, steps] of Object.entries(CITIES)) {
  if (process.env.CITY && process.env.CITY !== name) continue
  console.log(`\n=== City "${name}" ===`)
  summaries.push({ untouched: grow(name, steps, false), fixed: SEARCH ? grow(name, steps, true) : undefined })
}

const list = (fixes: { tiles: number; by: Fix }[], ...by: Fix[]) => fixes.filter((f) => by.includes(f.by)).map((f) => f.tiles).join(', ') || 'never' // prettier-ignore
const mins = (pace?: number) => (pace === undefined ? 'n/a' : `${pace.toFixed(0)} sim-min, ${(pace / SPEED).toFixed(1)} min at ${SPEED}×`)
console.log('\n=== Bars ===')
for (const { untouched, fixed } of summaries) {
  console.log(`City "${untouched.name}"`)
  console.log(`   A Jam emerges (by about 6 Tiles): untouched, first jams at ${untouched.firstJam ?? 'no Tile count tried'}`)
  if (fixed) {
    console.log(`   Changes work early (to about 10): Changes cleared the Jams at ${list(fixed.fixes, 'Change')} Tiles`)
    console.log(
      `   Building works late: a Swap cleared them at ${list(fixed.fixes, 'Swap')}, a placement at ${list(fixed.fixes, 'placement')}, nothing at ${list(fixed.fixes, 'none')}`,
    )
  }
  console.log(
    `   Pace (10–20 min at ${SPEED}× for ${PACE_TILES} Tiles): untouched ${mins(untouched.pace)}${fixed ? `; fixed ${mins(fixed.pace)}` : ''}`,
  )
}
console.log(
  `Recovery (within 30 sim-min): at the Income floor alone a Tile or a Swap takes ${(1 / ECONOMY.incomeFloor).toFixed(0)} sim-min, ` +
    `a placement that closes a loop ${((1 - ECONOMY.loopRebate) / ECONOMY.incomeFloor).toFixed(1)}`,
)
