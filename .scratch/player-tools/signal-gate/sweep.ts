import type { District, Priority } from '../../../src/sim/district'
import { TIMING } from '../../../src/sim/network'
import { Sim } from '../../../src/sim/sim'

export function fixture(o: {
  L: number
  lanes: number
  ns: number
  ew: number
  turn: number
  seed: number
  oneWay?: boolean
  left?: boolean
}): District {
  const G = ['N', 'E', 'S', 'W']
  const opp: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' }
  const leftOf: Record<string, string> = { N: 'E', E: 'S', S: 'W', W: 'N' } // from N heading south, a left turn leaves east
  const to = (g: string) =>
    Object.fromEntries(
      G.filter((x) => x !== g)
        .map((x) => [x, x === opp[g] ? 1 - o.turn : o.left ? (x === leftOf[g] ? o.turn : 0) : o.turn / 2])
        .filter(([, w]) => (w as number) > 0),
    )
  const rate: Record<string, number> = o.oneWay ? { N: o.ns, W: o.ew } : { N: o.ns, S: o.ns, E: o.ew, W: o.ew }
  const road = (x: number, y: number) => ({
    from: [x * o.L, y * o.L] as [number, number],
    to: 'X',
    lanes: [o.lanes, o.lanes] as [number, number],
  })
  return {
    roadDefaults: { speed: 13.9, laneWidth: 7, bikeBand: false, sidewalk: 0, median: 0 },
    junctions: { X: { type: 'priority', at: [0, 0] } },
    roads: { N: road(0, 1), E: road(1, 0), S: road(0, -1), W: road(-1, 0) },
    levels: [
      {
        reveal: ['X'],
        seed: o.seed,
        tools: ['signal'],
        demand: Object.fromEntries(Object.entries(rate).map(([g, r]) => [g, { rate: r, to: to(g) }])),
        initial: {},
        solution: [],
        pieces: [{ x0: -o.L, y0: -o.L, x1: o.L, y1: o.L }],
      },
    ],
  }
}

export function trial(d: District, change: { priority?: Record<string, Priority>; signal?: boolean }, secs = 400) {
  const sim = new Sim(d)
  const pre = sim.flow
  sim.apply({ at: 'X', ...change })
  let min = 1,
    maxSus = 0,
    sum = 0,
    n = 0
  for (let i = 0; i < secs * 30; i++) {
    sim.step()
    maxSus = Math.max(maxSus, sim.sustained)
    if (i >= (secs - 120) * 30) {
      min = Math.min(min, sim.flow)
      sum += sim.flow
      n++
    }
  }
  const q = Object.values(sim.queues).reduce((a, b) => a + b.length, 0)
  return { pre, avg: sum / n, min, won: sim.won, maxSus, q }
}

const P: Priority[] = ['main', 'yield']
export function arrangements() {
  const out: Record<string, Priority>[] = []
  for (const n of P) for (const e of P) for (const s of P) for (const w of P) out.push({ N: n, E: e, S: s, W: w })
  return out
}
const f = (x: number) => x.toFixed(2)
if (process.argv[2] === 'grid') {
  for (const oneWay of [false, true])
    for (const lanes of [1, 2])
      for (const L of [200, 300])
        for (const rate of [6, 8, 10, 12, 16, 20]) {
          const o = { L, lanes, ns: rate, ew: rate, turn: 0, seed: 7, oneWay }
          const d = fixture(o)
          const pr = arrangements().map((p) => ({ p, r: trial(d, { priority: p }, 300) }))
          const best = pr.reduce((a, b) => (b.r.avg > a.r.avg ? b : a))
          const worst = pr.reduce((a, b) => (b.r.avg < a.r.avg ? b : a))
          const nsMain = trial(d, { priority: { N: 'main', S: 'main', E: 'yield', W: 'yield' } }, 300)
          let line = `oneWay=${oneWay} lanes=${lanes} L=${L} rate=${rate} | prio best ${f(best.r.avg)}${best.r.won ? 'W' : ''} (${Object.values(
            best.p,
          )
            .map((x) => x[0])
            .join(
              '',
            )}) worst ${f(worst.r.avg)} NSmain ${f(nsMain.avg)}${nsMain.won ? 'W' : ''} wins ${pr.filter((x) => x.r.won).length}/16 | signal`
          for (const g of [6, 8, 12, 16, 20]) {
            TIMING.green = g
            const r = trial(d, { signal: true }, 300)
            line += ` g${g}:${f(r.avg)}${r.won ? 'W' : ''}`
          }
          console.log(line)
        }
}

if (process.argv[2] === 'turns') {
  const lanes = +process.argv[3]
  for (const [turn, left] of [
    [0.3, false],
    [0.6, false],
    [0.4, true],
    [0.8, true],
  ] as const)
    for (const L of [300, 600])
      for (const rate of [4, 6, 8, 10, 12]) {
        const d = fixture({ L, lanes, ns: rate, ew: rate, turn, seed: 7, left })
        const pr = arrangements().map((p) => ({ p, r: trial(d, { priority: p }, 300) }))
        const best = pr.reduce((a, b) => (b.r.avg > a.r.avg ? b : a))
        const worst = pr.reduce((a, b) => (b.r.avg < a.r.avg ? b : a))
        let line = `lanes=${lanes} L=${L} turn=${turn}${left ? ' (all left)' : ''} rate=${rate} | prio best ${f(best.r.avg)}${best.r.won ? 'W' : ''} (${Object.values(
          best.p,
        )
          .map((x) => x[0])
          .join('')}) worst ${f(worst.r.avg)} wins ${pr.filter((x) => x.r.won).length}/16 | signal`
        for (const c of [1, 3])
          for (const g of [6, 10, 16]) {
            TIMING.green = g
            TIMING.clearance = c
            const r = trial(d, { signal: true }, 300)
            line += ` g${g}c${c}:${f(r.avg)}${r.won ? 'W' : ''}`
          }
        console.log(line)
      }
}
if (process.argv[2] === 'fine') {
  const L = +process.argv[3]
  for (const turn of [0.4, 0.5, 0.6])
    for (const rate of [9, 10, 11, 12]) {
      const d = fixture({ L, lanes: 2, ns: rate, ew: rate, turn, seed: 7, left: true })
      const pr = arrangements().map((p) => ({ p, r: trial(d, { priority: p }, 600) }))
      const best = pr.reduce((a, b) => (b.r.avg > a.r.avg ? b : a))
      const worst = pr.reduce((a, b) => (b.r.avg < a.r.avg ? b : a))
      let line = `L=${L} left=${turn} rate=${rate} | prio best ${f(best.r.avg)} (${Object.values(best.p)
        .map((x) => x[0])
        .join('')}) worst ${f(worst.r.avg)} n>=.8: ${pr.filter((x) => x.r.avg >= 0.8).length} | signal avg/min`
      for (const c of [1, 2])
        for (const g of [6, 8, 10, 12]) {
          TIMING.green = g
          TIMING.clearance = c
          const r = trial(d, { signal: true }, 600)
          line += ` g${g}c${c}:${f(r.avg)}/${f(r.min)}`
        }
      console.log(line)
    }
}
if (process.argv[2] === 'final') {
  const L = +process.argv[3]
  TIMING.green = 10
  TIMING.clearance = 1
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const d = fixture({ L, lanes: 2, ns: 9, ew: 9, turn: 0.5, seed, left: true })
    const pr = arrangements().map((p) => ({ p, r: trial(d, { priority: p }, 600) }))
    const best = pr.reduce((a, b) => (b.r.avg > a.r.avg ? b : a))
    const ns = trial(d, { priority: { N: 'main', S: 'main', E: 'yield', W: 'yield' } }, 180)
    const sim = new Sim(d)
    sim.apply({ at: 'X', priority: { N: 'main', S: 'main', E: 'yield', W: 'yield' } })
    for (let i = 0; i < 180 * 30; i++) sim.step()
    const jam = sim.flow
    sim.apply({ at: 'X', signal: true })
    let wonAt = -1,
      min = 1
    for (let i = 0; i < 900 * 30; i++) {
      sim.step()
      if (sim.won && wonAt < 0) wonAt = i / 30
      if (i > 300 * 30) min = Math.min(min, sim.flow)
    }
    console.log(
      `L=${L} seed=${seed} | prio best ${f(best.r.avg)} (${Object.values(best.p)
        .map((x) => x[0])
        .join(
          '',
        )}) n>=.8 ${pr.filter((x) => x.r.avg >= 0.8).length} anyWon ${pr.filter((x) => x.r.won).length} | NSmain after 180s ${f(jam)} (pre ${f(ns.pre)}) | signal wonAt ${wonAt.toFixed(0)}s min(300-900s) ${f(min)}`,
    )
  }
}
if (process.argv[2] === 'cap') {
  for (const [g, c] of [
    [10, 1],
    [20, 1],
    [1000, 0],
  ]) {
    TIMING.green = g
    TIMING.clearance = c
    for (const turn of [0, 0.5, 1]) {
      const d = fixture({ L: 300, lanes: 2, ns: 60, ew: 0.001, turn, seed: 3, left: true })
      delete (d.levels[0].demand as any).S
      const sim = new Sim(d, 0, [], { prewarm: false })
      sim.apply({ at: 'X', signal: true })
      for (let i = 0; i < 120 * 30; i++) sim.step()
      const c0 = sim.completed
      for (let i = 0; i < 600 * 30; i++) sim.step()
      console.log(`green ${g} clearance ${c} left=${turn}: N arm discharges ${((sim.completed - c0) / 10).toFixed(1)}/min`)
    }
  }
}
if (process.argv[2] === 'hold') {
  TIMING.clearance = 1
  for (const L of [600, 800])
    for (const g of [8, 10, 14]) {
      TIMING.green = g
      let line = `L=${L} green=${g}:`
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const sim = new Sim(fixture({ L, lanes: 2, ns: 9, ew: 9, turn: 0.5, seed, left: true }))
        sim.apply({ at: 'X', priority: { N: 'main', S: 'main', E: 'yield', W: 'yield' } })
        for (let i = 0; i < 180 * 30; i++) sim.step()
        const jam = sim.flow
        sim.apply({ at: 'X', signal: true })
        let run = 0,
          longest = 0,
          sum = 0
        for (let i = 0; i < 900 * 30; i++) {
          sim.step()
          run = sim.flow >= 0.8 ? run + 1 / 30 : 0
          longest = Math.max(longest, run)
          if (i >= 300 * 30) sum += sim.flow
        }
        line += ` s${seed} jam ${f(jam)} avg ${f(sum / (600 * 30))} held ${longest.toFixed(0)}s;`
      }
      console.log(line)
    }
}
