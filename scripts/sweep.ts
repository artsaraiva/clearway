// Dev script, not a test: each Level's jam and win pass rates over seeds 1–10, with the checks from levels/levels.test.ts.
import district from '../levels/district-01'
import type { District } from '../src/sim/district'
import { Sim } from '../src/sim/sim'

const run = (sim: Sim, seconds: number, until = () => false) => {
  for (let i = 0; i < seconds * 30 && !until(); i++) sim.step()
  return sim
}

district.levels.forEach((level, n) => {
  let jams = 0
  let wins = 0
  for (let seed = 1; seed <= 10; seed++) {
    const seeded: District = { ...district, levels: district.levels.map((l, i) => (i === n ? { ...l, seed } : l)) }
    const reveal = () =>
      new Sim(
        seeded,
        n,
        district.levels.slice(0, n).flatMap((l) => l.solution),
      )
    const jam = run(reveal(), 180).flow < 0.5
    const solved = reveal()
    for (const change of level.solution) solved.apply(change)
    const win = run(solved, 300, () => solved.won).won
    jams += +jam
    wins += +win
    console.log(`Level ${n + 1} seed ${seed}: ${jam ? 'jams' : 'no jam'}, ${win ? 'wins' : 'no win'}`)
  }
  console.log(`Level ${n + 1}: jam ${jams}/10, win ${wins}/10 (shipped seed: ${level.seed})`)
})
