// Dev script, not a test: the current Level's jam and clear pass rates over seeds 1–10, with the checks from src/sim/sim.test.ts.
import level, { solve } from '../levels/roundabout-01'
import { Sim } from '../src/sim/sim'

const flowAfter = (sim: Sim, seconds: number) => {
  for (let i = 0; i < seconds * 30; i++) sim.step()
  return sim.flow
}

let jams = 0
let clears = 0
for (let seed = 1; seed <= 10; seed++) {
  const jam = flowAfter(new Sim({ ...level, seed }), 180) < 0.5
  const solved = new Sim({ ...level, seed })
  solve(solved)
  const clear = flowAfter(solved, 180) >= 0.8
  jams += +jam
  clears += +clear
  console.log(`seed ${seed}: ${jam ? 'jams' : 'no jam'}, ${clear ? 'clears' : 'stays jammed'}`)
}
console.log(`jam ${jams}/10, clear ${clears}/10 (shipped seed: ${level.seed})`)
