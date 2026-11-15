import { expect, it } from 'vitest'
import { City, LAYOUTS, type Layout } from '../city/city'
import { Game } from './game'
import { load, saveOf } from './save'

const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
type Placing = [id: Layout['id'], rotation: number, x: number, y: number]
/** Every Connection of the Junction `at` that is on. */
const open = (game: Game, at: string) => game.sim.configuration().find((c) => c.at === at)!.enable!

/** Ten Tiles: a row east through two Crossroads and a Roundabout, with Straights north and south off the Crossroads. */
const TEN: Placing[] = [
  ['crossroads', 0, 0, 0],
  ['straight', 0, 1, 0],
  ['straight', 0, 2, 0],
  ['crossroads', 0, 3, 0],
  ['straight', 0, 4, 0],
  ['roundabout', 0, 5, 0],
  ['straight', 0, 6, 0],
  ['straight', 1, 0, 1],
  ['straight', 1, 0, 2],
  ['straight', 1, 3, -1],
]

/** A run on the ten Tiles, the last just placed, with Changes at three Junctions, yen and a Record. */
function played(free: boolean) {
  const [[id, rotation, x, y], ...rest] = TEN
  const city = new City([{ cell: { x, y }, layout: layout(id), rotation }])
  for (const [id, rotation, x, y] of rest.slice(0, -1)) expect(city.place(layout(id), rotation, { x, y }).legal).toBe(true)
  const game = new Game(7, { city, yen: 10_000, free })
  const [last, turns, lx, ly] = TEN.at(-1)!
  expect(game.place(layout(last), turns, { x: lx, y: ly })).toMatchObject({ legal: true, affordable: true })
  game.apply({ at: 'c0_0', priority: { h0_0: 'main', 'h-1_0': 'main' } })
  for (const at of ['c3_0', 'c5_0']) game.apply({ at, disable: open(game, at).slice(0, 2) })
  game.yen = 1234.56
  game.record = 41.25
  return game
}

// Economy: a save

it('loads a save back as the same run, with nothing to undo', () => {
  for (const free of [false, true]) {
    const game = played(free)
    expect(game.undoable).toBe(true)
    const { game: back, notice } = load(saveOf(game), free)
    expect(notice).toBeNull()
    expect(back.free).toBe(free)
    expect(back.city.tiles).toEqual(game.city.tiles)
    expect(back.sim.configuration()).toEqual(game.sim.configuration())
    expect(back.yen).toBe(1234.56)
    expect(back.record).toBe(41.25)
    expect(back.price).toBe(game.price)
    expect(back.undoable).toBe(false)
  }
})

it('starts a new run that keeps the Record when a save will not load', () => {
  const text = saveOf(played(false))
  const save = JSON.parse(text)
  const broken: [what: string, text: string, record: number][] = [
    ['cut short', text.slice(0, -12), 0],
    ['from an older version', JSON.stringify({ ...save, version: 0 }), 41.25],
    [
      'a Layout the game lacks',
      JSON.stringify({ ...save, tiles: [{ ...save.tiles[0], layout: 'flyover' }, ...save.tiles.slice(1)] }),
      41.25,
    ],
    [
      'a Tile that joins nothing',
      JSON.stringify({ ...save, tiles: [...save.tiles, { cell: { x: 9, y: 9 }, layout: 'straight', rotation: 0 }] }),
      41.25,
    ],
    ['a Connection the City lacks', JSON.stringify({ ...save, changes: [{ at: 'c0_0', enable: ['h9_9.in0>h0_0.out0'] }] }), 41.25],
    ['no yen', JSON.stringify({ ...save, yen: 'lots' }), 41.25],
  ]
  for (const [what, text, record] of broken) {
    const { game, notice } = load(text, false)
    expect(notice, what).not.toBeNull()
    expect(game.city.tiles, what).toHaveLength(1)
    expect(game.yen, what).toBe(game.price)
    expect(game.record, what).toBe(record)
  }
})
