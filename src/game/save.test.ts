import { expect, it } from 'vitest'
import { City, FIRST_ZONE, LAYOUTS, ZONES, type Layout, type Zone } from '../city/city'
import { Game } from './game'
import { load, saveOf } from './save'

const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
const zone = (id: Zone['id'] | null) => ZONES.find((z) => z.id === id)
/** A Tile as a save holds it. */
type Placed = { cell: { x: number; y: number }; layout: Layout['id']; rotation: number; zone: Zone['id'] | null; stage: number | null }
/** A Tile to place, and its Zone: null leaves it unzoned. */
type Placing = [id: Layout['id'], rotation: number, x: number, y: number, zone: Zone['id'] | null]
/** Every Connection of the Junction `at` that is on. */
const open = (game: Game, at: string) => game.sim.configuration().find((c) => c.at === at)!.enable!

/**
 * Ten Tiles: a row east through two Crossroads and a Roundabout, with Straights north and south off the Crossroads.
 * Low-density residential is on two of them, and once the Straight at (1, 0) is rezoned to farms, every Zone is on one
 * and the last Tile is unzoned.
 */
const TEN: Placing[] = [
  ['crossroads', 0, 0, 0, 'offices'],
  ['straight', 0, 1, 0, 'low-density'],
  ['straight', 0, 2, 0, null],
  ['crossroads', 0, 3, 0, 'low-density'],
  ['straight', 0, 4, 0, 'medium-density'],
  ['roundabout', 0, 5, 0, 'high-density'],
  ['straight', 0, 6, 0, 'shops'],
  ['straight', 1, 0, 1, 'industrial'],
  ['straight', 1, 0, 2, 'parks'],
  ['straight', 1, 3, -1, 'green'],
]
/** Each Tile's Zone once `played` has rezoned the Straight at (1, 0) to farms. */
const ZONED = ['offices', 'farms', null, 'low-density', 'medium-density', 'high-density', 'shops', 'industrial', 'parks', 'green']
/**
 * How far some of the Tiles have grown as `played` starts. The Straight at (1, 0) loses its Stage to the Rezoning, and
 * the unzoned one at (2, 0) never has one.
 */
const GROWN = [
  { cell: { x: 0, y: 0 }, stage: 3, progress: 0 },
  { cell: { x: 1, y: 0 }, stage: 2, progress: 40 },
  { cell: { x: 2, y: 0 }, stage: 2, progress: 10 },
  { cell: { x: 3, y: 0 }, stage: 2, progress: 87.5 },
  { cell: { x: 4, y: 0 }, stage: 1, progress: 12 },
] as const
/** Each Tile's Stage and progress once `played` has rezoned: null for an unzoned Tile, which has no Stage. */
const STAGED = [
  { stage: 3, progress: 0 },
  { stage: 1, progress: 0 },
  null,
  { stage: 2, progress: 87.5 },
  { stage: 1, progress: 12 },
  { stage: 1, progress: 0 },
  { stage: 1, progress: 0 },
  { stage: 1, progress: 0 },
  { stage: 1, progress: 0 },
  { stage: 1, progress: 0 },
]

/**
 * A run on the ten Tiles, some grown, the last just placed and then one rezoned, with Changes at three Junctions, yen
 * and a Record.
 */
function played(free: boolean) {
  const [[id, rotation, x, y, z], ...rest] = TEN
  const city = new City([{ cell: { x, y }, layout: layout(id), rotation, zone: zone(z) }])
  for (const [id, rotation, x, y, z] of rest.slice(0, -1)) expect(city.place(layout(id), rotation, { x, y }, zone(z)).legal).toBe(true)
  const game = new Game(7, { city, yen: 10_000, free, stages: [...GROWN] })
  const [last, turns, lx, ly, lz] = TEN.at(-1)!
  expect(game.place(layout(last), turns, { x: lx, y: ly }, zone(lz))).toMatchObject({ legal: true, affordable: true })
  expect(game.rezone({ x: 1, y: 0 }, zone('farms'))).toBe(true)
  game.apply({ at: 'c0_0', priority: { h0_0: 'main', 'h-1_0': 'main' } })
  for (const at of ['c3_0', 'c5_0']) game.apply({ at, disable: open(game, at).slice(0, 2) })
  game.yen = 1234.56
  game.record = 41.25
  return game
}

// Economy: a save

it('loads a save back as the same run, each Tile with its Zone and Stage, with nothing to undo', () => {
  expect(new Set(ZONED)).toEqual(new Set([...ZONES.map((z) => z.id), null]))
  for (const free of [false, true]) {
    const game = played(free)
    expect(game.undoable).toBe(true)
    const { game: back, notice } = load(saveOf(game), free)
    expect(notice).toBeNull()
    expect(back.free).toBe(free)
    expect(back.city.tiles.map((t) => t.zone?.id ?? null)).toEqual(ZONED)
    expect(back.city.tiles).toEqual(game.city.tiles)
    expect(game.city.tiles.map((t) => game.stageOf(t.cell) ?? null)).toEqual(STAGED)
    expect(back.city.tiles.map((t) => back.stageOf(t.cell) ?? null)).toEqual(STAGED)
    expect(back.growth).toBe(12)
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
    // Version 2, from before Stages: a Tile was a cell, a Layout, a rotation and a Zone.
    [
      'from an older version',
      JSON.stringify({
        ...save,
        version: 2,
        tiles: save.tiles.map(({ cell, layout, rotation, zone }: Placed) => ({ cell, layout, rotation, zone })),
      }),
      41.25,
    ],
    [
      'a Layout the game lacks',
      JSON.stringify({ ...save, tiles: [{ ...save.tiles[0], layout: 'flyover' }, ...save.tiles.slice(1)] }),
      41.25,
    ],
    ['a Zone the game lacks', JSON.stringify({ ...save, tiles: [{ ...save.tiles[0], zone: 'casino' }, ...save.tiles.slice(1)] }), 41.25],
    ['a Stage the game lacks', JSON.stringify({ ...save, tiles: [{ ...save.tiles[0], stage: 4 }, ...save.tiles.slice(1)] }), 41.25],
    [
      'a Stage on an unzoned Tile',
      JSON.stringify({ ...save, tiles: save.tiles.map((t: Placed) => (t.zone === null ? { ...t, stage: 2 } : t)) }),
      41.25,
    ],
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
