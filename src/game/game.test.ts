import { expect, it } from 'vitest'
import { City, LAYOUTS, type Layout } from '../city/city'
import { Game } from './game'

const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
type Placing = [id: Layout['id'], rotation: number, x: number, y: number]

/** A run on a City of `tiles`, with `yen` in hand. A Layout unrotated: a Straight runs east–west, a Curve joins east and north. */
function gameOf(yen: number, ...tiles: Placing[]) {
  const [[id, rotation, x, y], ...rest] = tiles
  const city = new City([{ cell: { x, y }, layout: layout(id), rotation }])
  for (const [id, rotation, x, y] of rest) expect(city.place(layout(id), rotation, { x, y }).legal).toBe(true)
  return new Game(1, { city, yen })
}
const place = (game: Game, [id, rotation, x, y]: Placing) => game.place(layout(id), rotation, { x, y })
/** Finish the Pre-warm, then run `seconds` of earning. */
function earn(game: Game, seconds: number) {
  while (!game.sim.prewarmed) game.step()
  for (let i = 0; i < seconds * 30; i++) game.step()
  return game
}
/** Every Connection of the Junction `at` that is on. */
const open = (game: Game, at: string) => game.sim.configuration().find((c) => c.at === at)!.enable!
/** Whether any Gateway sends trips to the Gateway `to`. */
const sendsTo = (game: Game, to: string) => Object.values(game.sim.rates).some((d) => to in d.to)

/** Three Curves of a four-cell ring, open at cell (0, 1). */
const OPEN_RING: Placing[] = [
  ['curve', 0, 0, 0],
  ['curve', 1, 1, 0],
  ['curve', 2, 1, 1],
]

// Economy

it('starts a run with one Tile and the Price of the next in hand', () => {
  const game = new Game(7)
  expect(game.city.tiles).toHaveLength(1)
  expect(game.yen).toBe(350)
  expect(game.price).toBe(350)
})

it('starts the same run from the same seed', () => {
  expect(new Game(7).city.tiles).toEqual(new Game(7).city.tiles)
})

it('raises the Price with every Tile placed, rounded to ¥50', () => {
  const game = gameOf(10_000, ['straight', 0, 0, 0])
  const prices = [game.price]
  for (let x = 1; x <= 4; x++) {
    expect(place(game, ['straight', 0, x, 0])).toMatchObject({ legal: true, price: prices.at(-1) })
    prices.push(game.price)
  }
  expect(prices).toEqual([350, 450, 600, 750, 1000])
  expect(game.yen).toBe(10_000 - 350 - 450 - 600 - 750)
})

it('charges the same Price for every Layout', () => {
  const game = gameOf(350, ['crossroads', 0, 0, 0])
  for (const l of LAYOUTS) expect(game.offer(l, 2, { x: 1, y: 0 })).toMatchObject({ legal: true, price: 350 })
})

it('refuses a placement the player cannot afford', () => {
  const game = gameOf(349, ['straight', 0, 0, 0])
  expect(place(game, ['straight', 0, 1, 0])).toMatchObject({ legal: true, affordable: false })
  expect(game.city.tiles).toHaveLength(1)
  expect(game.yen).toBe(349)
})

it('takes 25% off a placement that joins two placed Tiles', () => {
  const game = gameOf(1000, ...OPEN_RING)
  expect(game.price).toBe(600)
  expect(place(game, ['crossroads', 0, 0, 1])).toMatchObject({ legal: true, price: 450 })
  expect(game.yen).toBe(1000 - 450)
})

it('charges a Swap the Price with no rebate, and does not raise the Price', () => {
  const game = gameOf(2000, ...OPEN_RING, ['crossroads', 0, 0, 1])
  expect(game.price).toBe(750)
  // The Crossroads joins two Tiles, which would earn a placement the rebate.
  expect(place(game, ['roundabout', 0, 0, 1])).toMatchObject({ legal: true, swap: true, price: 750 })
  expect(game.yen).toBe(1250)
  expect(game.price).toBe(750)
})

it('pays for every trip that arrives', () => {
  const game = earn(gameOf(0, ['crossroads', 0, 0, 0]), 120)
  expect(game.yen).toBeGreaterThan(game.price / 25)
  expect(game.income).toBe(game.tripsPerMinute * 10)
})

it('earns nothing during the Pre-warm', () => {
  const game = gameOf(0, ['crossroads', 0, 0, 0])
  while (!game.sim.prewarmed) game.step()
  expect(game.sim.completed).toBeGreaterThan(0)
  expect(game.yen).toBe(0)
})

it('pays the Income floor when no trip arrives', () => {
  const game = gameOf(350, ['crossroads', 0, 0, 0])
  // Every Connection of the Crossroads closed: after the Rebuild no Gateway reaches another, so nothing is sent.
  game.apply({ at: 'c0_0', disable: open(game, 'c0_0') })
  expect(place(game, ['straight', 0, 1, 0])).toMatchObject({ legal: true, affordable: true })
  earn(game, 60)
  expect(game.sim.completed).toBe(0)
  expect(game.price).toBe(450)
  expect(game.income).toBeCloseTo(450 / 25)
  expect(game.yen).toBeCloseTo(450 / 25)
})

// Undo

it('undoes a placement for a full refund, with the City and every Change as they were', () => {
  const game = gameOf(1000, ...OPEN_RING)
  const [tiles, changes] = [[...game.city.tiles], game.sim.configuration()]
  place(game, ['crossroads', 0, 0, 1])
  game.apply({ at: 'c0_0', priority: { h0_0: 'main' } })
  earn(game, 9)
  const earned = game.yen - (1000 - 450)
  expect(game.undoable).toBe(true)
  expect(game.undo()).toBe(true)
  expect(game.yen).toBe(1000 + earned) // yen earned in between is kept
  expect(game.price).toBe(600)
  expect(game.city.tiles).toEqual(tiles)
  expect(game.sim.configuration()).toEqual(changes)
})

it('undoes a Swap, with the swapped Tile and its Changes back', () => {
  const game = gameOf(1000, ['crossroads', 0, 0, 0], ['straight', 0, 1, 0])
  game.apply({ at: 'c0_0', priority: { h0_0: 'main', 'h-1_0': 'main' } })
  const changes = game.sim.configuration()
  place(game, ['roundabout', 0, 0, 0])
  expect(game.yen).toBe(550)
  expect(game.undo()).toBe(true)
  expect(game.yen).toBe(1000)
  expect(game.city.tiles[0].layout).toBe(layout('crossroads'))
  expect(game.sim.configuration()).toEqual(changes)
})

it('refuses an Undo after 10 sim-seconds of earning', () => {
  const game = gameOf(1000, ['straight', 0, 0, 0])
  place(game, ['straight', 0, 1, 0])
  earn(game, 10)
  const yen = game.yen
  expect(game.undoable).toBe(false)
  expect(game.undo()).toBe(false)
  expect(game.yen).toBe(yen)
  expect(game.city.tiles).toHaveLength(2)
})

it('does not count the Pre-warm against the Undo window', () => {
  const game = gameOf(1000, ['straight', 0, 0, 0])
  place(game, ['straight', 0, 1, 0])
  expect(earn(game, 0).undoable).toBe(true)
})

it('undoes only the last placement', () => {
  const game = gameOf(1000, ['straight', 0, 0, 0])
  place(game, ['straight', 0, 1, 0])
  place(game, ['straight', 0, 2, 0])
  expect(game.undo()).toBe(true)
  expect(game.undo()).toBe(false)
  expect(game.city.tiles).toHaveLength(2)
})

// Simulation outcomes

it('resets the swapped Tile’s Changes and keeps its neighbours’ in force', () => {
  const [NORTH, EAST] = ['v0_0', 'h1_0'] // the Crossroads' north Gateway and the Straight's east one
  const game = gameOf(1000, ['crossroads', 0, 0, 0], ['straight', 0, 1, 0])
  expect(sendsTo(game, NORTH)).toBe(true)
  expect(game.sim.rates[EAST]).toBeDefined()
  // Two Changes: nothing leaves the Crossroads to the north, and nothing crosses the Straight.
  const north = open(game, 'c0_0').filter((ref) => ref.includes(`>${NORTH}.`))
  game.apply({ at: 'c0_0', disable: north })
  game.apply({ at: 'c1_0', disable: open(game, 'c1_0') })

  expect(place(game, ['roundabout', 0, 0, 0])).toMatchObject({ legal: true, swap: true })
  expect(sendsTo(game, NORTH)).toBe(true)
  expect(game.sim.rates[EAST]).toBeUndefined()
})
