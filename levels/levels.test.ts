import { describe, expect, it } from 'vitest'
import type { District } from '../src/sim/district'
import { Sim } from '../src/sim/sim'

const districts = import.meta.glob<District>('./district-*.ts', { eager: true, import: 'default' })

function run(sim: Sim, seconds: number, until = () => false) {
  for (let i = 0; i < seconds * 30 && !until(); i++) sim.step()
  return sim
}

for (const [file, district] of Object.entries(districts)) {
  district.levels.forEach((level, n) => {
    // The Reveal of Level n, with every earlier Level solved by its reference solution.
    const reveal = () =>
      new Sim(
        district,
        n,
        district.levels.slice(0, n).flatMap((l) => l.solution),
      )

    describe(`${file} Level ${n + 1}`, () => {
      it('jams when left untouched', () => {
        expect(run(reveal(), 180).flow).toBeLessThan(0.5)
      })

      it('is won by its reference solution', () => {
        const sim = reveal()
        for (const change of level.solution) sim.apply(change)
        expect(run(sim, 300, () => sim.won).won).toBe(true)
      })
    })
  })
}
