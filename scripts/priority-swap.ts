// ponytail: a throwaway check for #45, not a generator and not a test. For each grid seed it builds a warped grid of
// Priority junctions with a column-sweep Reveal, writes one priority-swap Level on every T-junction, and bisects the
// Demand scale on Level seeds 1–10. Then it scans Demand mixes on a T-junction alone, to tell a bad mix from a
// template with no window. Its ceiling is this one question, on right-angle grids under 10 columns; #46 and #47
// build the real generator beside `src/sim`, so delete this once they land.
// Run: node -e "import('vite').then((v) => v.runnerImport('./scripts/priority-swap.ts'))"
import { mulberry32 } from '../src/sim/demand'
import { revealed, validateDistrict, type District, type Level, type Point, type RoadSpec } from '../src/sim/district'
import { buildNetwork } from '../src/sim/network'
import { route, travelTime } from '../src/sim/routing'
import { Sim } from '../src/sim/sim'

// Not settled until #33: 7 m lanes, 56–64 m between parallel Roads, and one more Block of Road out to each Gateway. The
// speed is not settled either, so each grid runs at the street-grid fixture's and at District 1's.
const LANE_WIDTH = 7
const SPEEDS = [8, 13.9]
const SPACING = [56, 64]
const EDGE = 60
const FOOTPRINT = 12 // of a 1-lane right-angle Priority junction with 7 m lanes: where a Road from the Fog ends

// Vehicles per minute at Demand scale 1. The stem is nearly empty: since #52 a yield Arm crawls to its line, so the
// heavy stream jams by yielding at all, and the stem has little to push through it once it yields itself.
const HEAVY = 16
const COUNTER = 1
const SIDE = 0.5 // per side stream; there are up to two

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1)
const STEP = 0.025 // the Demand scales tried are multiples of this
const [LOWEST, HIGHEST] = [4, 160] // × STEP: 0.1 to 4
const BAR = 1.2
const GRIDS = 24

type Side = 'N' | 'E' | 'S' | 'W'
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' }

/** A T-junction of the grid: the two Roads that run straight through it, and its stem, the third. */
interface Tee {
  id: string
  /** The Level that Reveals it. */
  level: number
  through: [string, string]
  stem: string
}

interface Grid {
  shape: string
  /** Every Level but the one under test carries no Demand. */
  district: District
  tees: Tee[]
}

/** A warped grid for a seed: 2×4 or 3×3, a corner or more left out, a few Roads removed, every Junction keeping 3–4 Arms. */
function grid(seed: number, speed: number): Grid {
  const rng = mulberry32(seed)
  const int = (n: number) => Math.floor(rng() * n)
  const [cols, rows] = rng() < 0.5 ? [4, 2] : [3, 3]
  const line = (n: number) => {
    const at = [0]
    for (let k = 1; k < n; k++) at.push(at[k - 1] + SPACING[0] + rng() * (SPACING[1] - SPACING[0]))
    return at.map((v) => Math.round(v - at[n - 1] / 2))
  }
  const xs = line(cols)
  const ys = line(rows).reverse() // row 0 is the northernmost
  const [west, east, south, north] = [xs[0] - EDGE, xs[cols - 1] + EDGE, ys[rows - 1] - EDGE, ys[0] + EDGE]
  const id = (i: number, j: number) => `J${i}${j}`
  const corners = [0, cols - 1].flatMap((i) => [0, rows - 1].map((j) => id(i, j)))

  for (;;) {
    // 9 Junctions are too many, so a 3×3 always loses a corner.
    const gone = new Set<string>()
    const drop = cols === 3 ? 1 + int(3) : int(2)
    while (gone.size < drop) gone.add(corners[int(4)])
    const has = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && !gone.has(id(i, j))

    /** By Road id: the Junctions it joins, each with the side the Road leaves it on. */
    const roads: Record<string, { spec: RoadSpec; ends: [string, Side][] }> = {}
    const add = (road: string, from: Point | string, to: string, ends: [string, Side][]) => {
      roads[road] = { spec: { from, to, lanes: [1, 1] }, ends }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (!has(i, j)) continue
        const here = id(i, j)
        if (has(i + 1, j)) add(`H${i}${j}`, here, id(i + 1, j), [[here, 'E'], [id(i + 1, j), 'W']]) // prettier-ignore
        if (has(i, j + 1)) add(`V${i}${j}`, here, id(i, j + 1), [[here, 'S'], [id(i, j + 1), 'N']]) // prettier-ignore
        if (i === 0) add(`W${j}`, [west, ys[j]], here, [[here, 'W']])
        if (i === cols - 1) add(`E${j}`, [east, ys[j]], here, [[here, 'E']])
        if (j === 0) add(`N${i}`, [xs[i], north], here, [[here, 'N']])
        if (j === rows - 1) add(`S${i}`, [xs[i], south], here, [[here, 'S']])
      }
    }
    const arms = (junction: string) =>
      Object.entries(roads).flatMap(([road, { ends }]) => ends.filter(([j]) => j === junction).map(([, side]) => ({ road, side })))
    const junctions = Object.fromEntries(
      xs.flatMap((x, i) => ys.flatMap((y, j) => (has(i, j) ? [[id(i, j), { type: 'priority' as const, at: [x, y] as Point }]] : []))),
    )
    const ids = Object.keys(junctions)
    const connected = () => {
      const seen = new Set([ids[0]])
      for (const junction of seen) {
        for (const { ends } of Object.values(roads)) {
          if (ends.some(([j]) => j === junction)) for (const [j] of ends) seen.add(j)
        }
      }
      return seen.size === ids.length
    }
    const sound = () => ids.every((j) => arms(j).length >= 3) && connected()
    if (!sound()) continue // two neighbouring corners gone leave a Junction with 2 Arms: draw again

    // Remove up to 3 Roads, each only if the grid stays sound: this is where the T-junctions come from.
    for (let k = 1 + int(3), tries = 0; k > 0 && tries < 40; tries++) {
      const road = Object.keys(roads)[int(Object.keys(roads).length)]
      const kept = roads[road]
      delete roads[road]
      if (sound()) k--
      else roads[road] = kept
    }

    const column = (i: number) => ids.filter((j) => j[1] === String(i))
    // Each column's piece of slab ends where the Roads into the next column do, at that column's footprint.
    const seams = [west, ...xs.slice(1).map((x) => x - FOOTPRINT), east]
    const levels: Level[] = xs.map((_, i) => ({
      reveal: column(i),
      seed: 1,
      tools: ['connector', 'priority'],
      demand: {},
      initial: {},
      solution: [],
      pieces: [{ x0: seams[i], y0: south, x1: seams[i + 1], y1: north }],
    }))
    const tees = ids.flatMap((junction): Tee[] => {
      const at = arms(junction)
      if (at.length !== 3) return []
      const stem = at.find((arm) => !at.some((other) => other.side === OPPOSITE[arm.side]))!
      const [a, b] = at.filter((arm) => arm !== stem)
      return [{ id: junction, level: Number(junction[1]), through: [a.road, b.road], stem: stem.road }]
    })
    return {
      shape: `${rows}×${cols}, ${ids.length} Junctions`,
      district: {
        roadDefaults: { speed, laneWidth: LANE_WIDTH, bikeBand: false, sidewalk: 0, median: 0 },
        junctions,
        roads: Object.fromEntries(Object.entries(roads).map(([road, { spec }]) => [road, spec])),
        levels,
      },
      tees,
    }
  }
}

/**
 * The priority-swap Level on a T-junction, at Demand scale 1: the stem is main, a heavy stream runs straight through
 * on the yielding Roads, and the solution makes those main. Each stream runs between the pair of Gateways with
 * the fastest free-flow trip through the T-junction that way. Null when no Gateway pair gives the heavy stream or a
 * stream out of the stem.
 */
function prioritySwap(district: District, tee: Tee): Level | null {
  const net = buildNetwork(district, revealed(district, tee.level))
  /** By `<Road in>><Road out>` at the T-junction: the fastest Gateway pair that drives it. */
  const fastest: Record<string, { from: string; to: string; time: number }> = {}
  for (const [from, arm] of Object.entries(net.gateways)) {
    for (const to of Object.keys(net.gateways)) {
      const path = from === to ? null : route(net, arm.approach[0], to)
      const through = path?.find((lane) => lane.conn?.arm.junction === tee.id)?.conn
      if (!path || !through || !('road' in through.to.owner)) continue
      const key = `${through.arm.road}>${through.to.owner.road}`
      const time = path.reduce((t, lane) => t + travelTime(lane), 0)
      if (!fastest[key] || time < fastest[key].time) fastest[key] = { from, to, time }
    }
  }
  const [a, b] = fastest[`${tee.through[0]}>${tee.through[1]}`] ? tee.through : [tee.through[1], tee.through[0]]
  const streams = [
    { pair: fastest[`${a}>${b}`], rate: HEAVY },
    { pair: fastest[`${b}>${a}`], rate: COUNTER },
    { pair: fastest[`${tee.stem}>${a}`], rate: SIDE },
    { pair: fastest[`${tee.stem}>${b}`], rate: SIDE },
  ]
  if (!streams[0].pair || !(streams[2].pair || streams[3].pair)) return null
  const demand: Level['demand'] = {}
  for (const { pair, rate } of streams) {
    if (!pair) continue
    const gateway = (demand[pair.from] ??= { rate: 0, to: {} })
    gateway.rate += rate
    gateway.to[pair.to] = (gateway.to[pair.to] ?? 0) + rate
  }
  return {
    ...district.levels[tee.level],
    demand,
    initial: { [tee.id]: { priority: { [tee.stem]: 'main' } } },
    solution: [{ at: tee.id, priority: { [a]: 'main', [b]: 'main', [tee.stem]: 'yield' } }],
  }
}

const run = (sim: Sim, seconds: number, until = () => false) => {
  for (let i = 0; i < seconds * 30 && !until(); i++) sim.step()
  return sim
}

// The checks of levels/levels.test.ts.
const jams = (district: District, index = 0) => run(new Sim(district, index), 180).flow < 0.5
const wins = (district: District, index = 0) => {
  const solved = new Sim(district, index)
  for (const change of district.levels[index].solution) solved.apply(change)
  return run(solved, 300, () => solved.won).won
}

/** The Demand window of a Level: the lowest scale that jams and the highest that Wins on every seed, by bisection. */
function demandWindow(district: District, index: number, level: Level) {
  const at = (k: number, seed: number): District => {
    const demand = Object.fromEntries(Object.entries(level.demand).map(([g, d]) => [g, { ...d, rate: d.rate * k * STEP }]))
    return { ...district, levels: district.levels.map((l, i) => (i === index ? { ...level, seed, demand } : l)) }
  }
  const alwaysJams = (k: number) => SEEDS.every((seed) => jams(at(k, seed), index))
  const alwaysWins = (k: number) => SEEDS.every((seed) => wins(at(k, seed), index))
  /** The last scale `holds` for, taking it to hold up to some scale and never after. */
  const last = (holds: (k: number) => boolean) => {
    if (!holds(LOWEST)) return null
    let [yes, no] = [LOWEST, HIGHEST + 1]
    while (no - yes > 1) {
      const mid = (yes + no) >> 1
      if (holds(mid)) yes = mid
      else no = mid
    }
    return yes
  }
  const noJam = last((k) => !alwaysJams(k))
  const win = last(alwaysWins)
  const jam = noJam === null ? LOWEST : noJam + 1
  if (jam > HIGHEST || win === null) return { jam: jam > HIGHEST ? null : jam * STEP, win: win && win * STEP, width: 0, both: 0 }
  // Bisection takes each check to flip once. So count the scales that do both: mid-window, which is what a generator
  // would ship, or every second scale of the gap when the window is inverted.
  const tried = win >= jam ? [Math.round((jam + win) / 2)] : Array.from({ length: (jam - win) / 2 + 1 }, (_, i) => win + 2 * i)
  return { jam: jam * STEP, win: win * STEP, width: win / jam, both: tried.filter((k) => alwaysJams(k) && alwaysWins(k)).length }
}

/** A T-junction alone between three Gateways, `reach` m away: W and E run straight through, S is the stem. */
function loneTee(speed: number, reach: number, seed: number, level: Pick<Level, 'demand' | 'initial' | 'solution'>): District {
  return {
    roadDefaults: { speed, laneWidth: LANE_WIDTH, bikeBand: false, sidewalk: 0, median: 0 },
    junctions: { T: { type: 'priority', at: [0, 0] } },
    roads: {
      W: { from: [-reach, 0], to: 'T', lanes: [1, 1] },
      E: { from: [reach, 0], to: 'T', lanes: [1, 1] },
      S: { from: [0, -reach], to: 'T', lanes: [1, 1] },
    },
    levels: [{ reveal: ['T'], seed, tools: ['priority'], pieces: [{ x0: -reach, y0: -reach, x1: reach, y1: reach }], ...level }],
  }
}

const stemMain = { initial: { T: { priority: { S: 'main' as const } } }, solution: [{ at: 'T', priority: { W: 'main' as const, E: 'main' as const, S: 'yield' as const } }] } // prettier-ignore
const stemYields = { initial: { T: { priority: { W: 'main' as const, E: 'main' as const } } }, solution: [{ at: 'T', priority: { W: 'yield' as const, E: 'yield' as const, S: 'main' as const } }] } // prettier-ignore
/** Ways to put a heavy stream on a yielding Arm, by vehicles per minute of the heavy stream and of the stream it yields to. */
const MIXES: Record<string, (heavy: number, light: number) => Pick<Level, 'demand' | 'initial' | 'solution'>> = {
  'heavy straight through, yielding to the stem': (heavy, light) => ({
    demand: { W: { rate: heavy, to: { E: 1 } }, S: { rate: light, to: { W: 0.5, E: 0.5 } } },
    ...stemMain,
  }),
  'heavy right turn out of the stem': (heavy, light) => ({
    demand: { S: { rate: heavy, to: { E: 1 } }, W: { rate: light, to: { E: 1 } } },
    ...stemYields,
  }),
  'heavy left turn out of the stem': (heavy, light) => ({
    demand: { S: { rate: heavy, to: { W: 1 } }, W: { rate: light, to: { E: 1 } } },
    ...stemYields,
  }),
}
const HEAVY_RATES = [10, 12, 14, 16, 18, 20, 24]
const LIGHT_RATES = [1, 2, 3, 4, 6, 8, 12]

/** Every mix on a T-junction alone: how many of the 10 seeds jam untouched, and how many Win with the solution. */
function scan() {
  let cells = 0
  let best = { jams: 0, wins: 0 }
  for (const [speed, reach] of SPEEDS.flatMap((speed) => [
    [speed, 72],
    [speed, 200],
  ]))
    // prettier-ignore
    for (const [name, mix] of Object.entries(MIXES)) {
      console.log(`\n${name}, ${speed} m/s, ${reach} m Roads. Cells: seeds that jam / seeds that Win.\n`)
      console.log(`| Heavy \\ light per minute | ${LIGHT_RATES.join(' | ')} |`)
      console.log(`| --- |${LIGHT_RATES.map(() => ' --- |').join('')}`)
      for (const heavy of HEAVY_RATES) {
        const row = LIGHT_RATES.map((light) => {
          const districts = SEEDS.map((seed) => loneTee(speed, reach, seed, mix(heavy, light)))
          const cell = { jams: districts.filter((d) => jams(d)).length, wins: districts.filter((d) => wins(d)).length }
          cells++
          if (Math.min(cell.jams, cell.wins) > Math.min(best.jams, best.wins)) best = cell
          return `${cell.jams}/${cell.wins}`
        })
        console.log(`| ${heavy} | ${row.join(' | ')} |`)
      }
    }
  console.log(`\n${cells} mixes. The best on both checks jams on ${best.jams} of 10 seeds and Wins on ${best.wins}.`)
}

const fmt = (scale: number | null) => (scale === null ? 'none' : scale.toFixed(3))
for (const speed of SPEEDS) {
  const widths: number[] = []
  let meeting = 0
  let levels = 0
  console.log(`\n${speed} m/s\n`)
  console.log('| Grid | Shape | T-junction | Level | Lowest that jams | Highest that Wins | Window | Scales that do both | Meets the bar |')
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
  for (let seed = 1; seed <= GRIDS; seed++) {
    const made = grid(seed, speed)
    validateDistrict(made.district)
    let met = false
    for (const tee of made.tees) {
      const level = prioritySwap(made.district, tee)
      const row = (rest: string) => console.log(`| ${seed} | ${made.shape} | ${tee.id} | ${tee.level + 1} | ${rest} |`)
      if (!level) {
        row('no stream | | | | no')
        continue
      }
      const { jam, win, width, both } = demandWindow(made.district, tee.level, level)
      const ok = width >= BAR && both > 0
      met ||= ok
      levels += +ok
      if (width) widths.push(width)
      row(`${fmt(jam)} | ${fmt(win)} | ${width ? width.toFixed(2) + '×' : 'none'} | ${both} | ${ok ? 'yes' : 'no'}`)
    }
    if (!made.tees.length) console.log(`| ${seed} | ${made.shape} | none | | | | | | no |`)
    meeting += +met
  }
  console.log(`\n${meeting} of ${GRIDS} grids have a priority-swap Level that meets the bar, ${levels} Levels in all.`)
  console.log(`${widths.length} Levels have a window, from ${Math.min(...widths).toFixed(2)}× to ${Math.max(...widths).toFixed(2)}×.`)
}
scan()
