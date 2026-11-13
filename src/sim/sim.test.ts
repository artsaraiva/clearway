import { expect, it } from 'vitest'
import district from '../../levels/district-01'
import { Sim } from './sim'

function run(sim: Sim, seconds: number) {
  for (let i = 0; i < seconds * 30; i++) sim.step()
  return sim
}

it('is deterministic for a seed', () => {
  const a = run(new Sim(district), 60)
  const b = run(new Sim(district), 60)
  expect(b.flow).toBe(a.flow)
  expect(b.vehicles.map((v) => [v.id, v.lane.id, v.s])).toEqual(a.vehicles.map((v) => [v.id, v.lane.id, v.s]))
})
