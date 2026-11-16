import { expect, it } from 'vitest'
import { City, FIRST_ZONE, LAYOUTS, ZONES, type Layout, type Zone } from '../city/city'
import { Game } from './game'
import { load, saveOf } from './save'

const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
const zone = (id: Zone['id'] | null) => ZONES.find((z) => z.id === id)
/** A Tile as a save holds it. */
type Placed = { cell: { x: number; y: number }; layout: Layout['id']; rotation: number; zone: Zone['id'] | null }
/** A Tile to place, and its Zone: null leaves it unzoned. */
type Placing = [id: Layout['id'], rotation: number, x: number, y: number, zone: Zone['id'] | null]
/** Every Connection of the Junction `at` that is on. */
const open = (game: Game, at: string) => game.sim.configuration().find((c) => c.at === at)!.enable!

/**
 * Ten Tiles of both Zones and unzoned: a row east through two Crossroads and a Roundabout, with Straights north and
 * south off the Crossroads.
 */
const TEN: Placing[] = [
  ['crossroads', 0, 0, 0, 'offices'],
  ['straight', 0, 1, 0, 'offices'],
  ['straight', 0, 2, 0, null],
  ['crossroads', 0, 3, 0, 'low-density'],
  ['straight', 0, 4, 0, 'low-density'],
  ['roundabout', 0, 5, 0, null],
  ['straight', 0, 6, 0, 'low-density'],
  ['straight', 1, 0, 1, 'offices'],
  ['straight', 1, 0, 2, null],
  ['straight', 1, 3, -1, 'low-density'],
]
/** Each Tile's Zone once `played` has rezoned the Straight at (1, 0) to low-density residential. */
const ZONED = ['offices', 'low-density', null, 'low-density', 'low-density', null, 'low-density', 'offices', null, 'low-density']

/** A run on the ten Tiles, the last just placed and then one rezoned, with Changes at three Junctions, yen and a Record. */
function played(free: boolean) {
  const [[id, rotation, x, y, z], ...rest] = TEN
  const city = new City([{ cell: { x, y }, layout: layout(id), rotation, zone: zone(z) }])
  for (const [id, rotation, x, y, z] of rest.slice(0, -1)) expect(city.place(layout(id), rotation, { x, y }, zone(z)).legal).toBe(true)
  const game = new Game(7, { city, yen: 10_000, free })
  const [last, turns, lx, ly, lz] = TEN.at(-1)!
  expect(game.place(layout(last), turns, { x: lx, y: ly }, zone(lz))).toMatchObject({ legal: true, affordable: true })
  expect(game.rezone({ x: 1, y: 0 }, zone('low-density'))).toBe(true)
  game.apply({ at: 'c0_0', priority: { h0_0: 'main', 'h-1_0': 'main' } })
  for (const at of ['c3_0', 'c5_0']) game.apply({ at, disable: open(game, at).slice(0, 2) })
  game.yen = 1234.56
  game.record = 41.25
  return game
}

// Economy: a save

it('loads a save back as the same run, each Tile with its Zone, with nothing to undo', () => {
  for (const free of [false, true]) {
    const game = played(free)
    expect(game.undoable).toBe(true)
    const { game: back, notice } = load(saveOf(game), free)
    expect(notice).toBeNull()
    expect(back.free).toBe(free)
    expect(back.city.tiles.map((t) => t.zone?.id ?? null)).toEqual(ZONED)
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
    // Version 1, from before Zones: a Tile was a cell, a Layout and a rotation.
    [
      'from an older version',
      JSON.stringify({ ...save, version: 1, tiles: save.tiles.map(({ cell, layout, rotation }: Placed) => ({ cell, layout, rotation })) }),
      41.25,
    ],
    [
      'a Layout the game lacks',
      JSON.stringify({ ...save, tiles: [{ ...save.tiles[0], layout: 'flyover' }, ...save.tiles.slice(1)] }),
      41.25,
    ],
    ['a Zone the game lacks', JSON.stringify({ ...save, tiles: [{ ...save.tiles[0], zone: 'casino' }, ...save.tiles.slice(1)] }), 41.25],
    [
      'a Tile that joins nothing',
      JSON.stringify({ ...save, tiles: [...save.tiles, { cell: { x: 9, y: 9 }, layout: 'straight', rotation: 0, zone: null }] }),
      41.25,
    ],
    ['a Connection the City lacks', JSON.stringify({ ...save, changes: [{ at: 'c0_0', enable: ['h9_9.in0>h0_0.out0'] }] }), 41.25],
    ['no yen', JSON.stringify({ ...save, yen: 'lots' }), 41.25],
  ]
  for (const [what, text, record] of broken) {
    const { game, notice } = load(text, false)
    expect(notice, what).not.toBeNull()
    expect(game.city.tiles, what).toHaveLength(1)
    expect(game.city.tiles[0].zone, what).toBe(FIRST_ZONE)
    expect(game.yen, what).toBe(game.price)
    expect(game.record, what).toBe(record)
  }
})
