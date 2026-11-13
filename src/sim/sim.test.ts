import { expect, it } from 'vitest'
import level, { solve } from '../../levels/roundabout-01'
import { Sim } from './sim'

function run(sim: Sim, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) sim.step()
  return sim
}

it('jams with the initial connections', () => {
  expect(run(new Sim(level), 180).flow).toBeLessThan(0.5)
})

it('connecting the inner ring clears the jam', () => {
  const sim = new Sim(level)
  solve(sim)
  expect(run(sim, 180).flow).toBeGreaterThanOrEqual(0.8)
})

it('is deterministic for a seed', () => {
  const a = run(new Sim(level), 60)
  const b = run(new Sim(level), 60)
  expect(b.flow).toBe(a.flow)
  expect(b.vehicles.map((v) => [v.id, v.lane.id, v.s])).toEqual(a.vehicles.map((v) => [v.id, v.lane.id, v.s]))
})
