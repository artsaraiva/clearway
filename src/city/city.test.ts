import { expect, it } from 'vitest'
import { City, LAYOUTS, type Layout } from './city'

const layout = (id: Layout['id']) => LAYOUTS.find((l) => l.id === id)!
const [straight, curve, tee, crossroads, roundabout] = ['straight', 'curve', 'tee', 'crossroads', 'roundabout'].map((id) =>
  layout(id as Layout['id']),
)

/** A City whose starting Tile is `start`, unrotated: a Straight runs east–west, a Curve joins east and north. */
const cityFrom = (start: Layout) => new City([{ cell: { x: 0, y: 0 }, layout: start, rotation: 0 }])

/** Three Curves of a four-cell ring, open at cell (0, 1). */
function openRing() {
  const city = cityFrom(curve)
  expect(city.place(curve, 1, { x: 1, y: 0 }).legal).toBe(true)
  expect(city.place(curve, 2, { x: 1, y: 1 }).legal).toBe(true)
  return city
}

it('allows a drop whose road meets the City', () => {
  expect(cityFrom(straight).drop(straight, 0, { x: 1, y: 0 })).toEqual({ legal: true, joins: 1 })
})

it('refuses a drop on a taken cell', () => {
  expect(cityFrom(straight).drop(straight, 0, { x: 0, y: 0 })).toEqual({ legal: false, reason: 'cell taken' })
})

it('refuses a drop with a mismatched edge', () => {
  const city = cityFrom(straight)
  // A blank edge against the City's road, then a road against the City's blank edge.
  expect(city.drop(straight, 1, { x: 1, y: 0 })).toEqual({ legal: false, reason: 'edge mismatch' })
  expect(city.drop(straight, 1, { x: 0, y: 1 })).toEqual({ legal: false, reason: 'edge mismatch' })
})

it('refuses a drop no road joins to the City', () => {
  const city = cityFrom(straight)
  expect(city.drop(straight, 0, { x: 0, y: 1 })).toEqual({ legal: false, reason: 'no road joins' })
  expect(city.drop(straight, 0, { x: 5, y: 5 })).toEqual({ legal: false, reason: 'no road joins' })
})

it('refuses a drop that leaves fewer than two Gateways', () => {
  const city = openRing()
  expect(city.drop(curve, 3, { x: 0, y: 1 })).toEqual({ legal: false, reason: 'fewer than two Gateways' })
  expect(city.drop(tee, 3, { x: 0, y: 1 })).toEqual({ legal: false, reason: 'fewer than two Gateways' })
})

it('counts the Tiles a drop joins by road', () => {
  expect(openRing().drop(crossroads, 0, { x: 0, y: 1 })).toEqual({ legal: true, joins: 2 })
})

it('leaves the City as it was when a placement is refused', () => {
  const city = cityFrom(straight)
  expect(city.place(straight, 1, { x: 1, y: 0 }).legal).toBe(false)
  expect(city.tiles).toHaveLength(1)
})

it('lists its Gateways by cell and direction', () => {
  const city = cityFrom(straight)
  city.place(curve, 1, { x: 1, y: 0 })
  expect(city.gateways()).toEqual([
    { cell: { x: 0, y: 0 }, direction: 2 },
    { cell: { x: 1, y: 0 }, direction: 1 },
  ])
})

it('swaps a Crossroads for a Roundabout', () => {
  const city = cityFrom(crossroads)
  city.place(straight, 0, { x: 1, y: 0 })
  expect(city.swap(roundabout, 0, { x: 0, y: 0 }).legal).toBe(true)
  city.place(roundabout, 0, { x: 0, y: 0 })
  expect(city.tiles[0].layout).toBe(roundabout)
  expect(city.tiles).toHaveLength(2)
})

it('refuses a Swap that would break a neighbour’s edge', () => {
  const city = cityFrom(crossroads)
  city.place(straight, 0, { x: 1, y: 0 })
  expect(city.swap(straight, 1, { x: 0, y: 0 })).toEqual({ legal: false, reason: 'edge mismatch' })
  expect(city.tiles[0].layout).toBe(crossroads)
})

it('lets a Swap close Gateways that face empty cells', () => {
  const city = cityFrom(crossroads)
  city.place(straight, 0, { x: 1, y: 0 })
  expect(city.place(straight, 0, { x: 0, y: 0 }).legal).toBe(true)
  expect(city.gateways()).toHaveLength(2)
})

it('refuses a Swap that leaves fewer than two Gateways', () => {
  const city = openRing()
  city.place(crossroads, 0, { x: 0, y: 1 })
  expect(city.swap(curve, 3, { x: 0, y: 1 })).toEqual({ legal: false, reason: 'fewer than two Gateways' })
})

it('allows a drop on the open end of a Tile in its Assembly', () => {
  const city = cityFrom(straight)
  expect(city.place(straight, 0, { x: 1, y: 0 }, undefined, { assembling: true }).legal).toBe(true)
  expect(city.assembling.map((t) => t.cell)).toEqual([{ x: 1, y: 0 }])
  expect(city.drop(straight, 0, { x: 2, y: 0 })).toEqual({ legal: true, joins: 1 })
})

it('refuses a Swap of a Tile in its Assembly until it has landed', () => {
  const city = cityFrom(crossroads)
  city.place(straight, 0, { x: 1, y: 0 }, undefined, { assembling: true })
  expect(city.swap(crossroads, 0, { x: 1, y: 0 })).toEqual({ legal: false, reason: 'still assembling' })
  city.land()
  expect(city.swap(crossroads, 0, { x: 1, y: 0 }).legal).toBe(true)
})

it('refuses a Swap on an empty cell', () => {
  expect(cityFrom(straight).swap(straight, 0, { x: 1, y: 0 })).toEqual({ legal: false, reason: 'no Tile to swap' })
})

it('draws the same starting Tile from the same seed', () => {
  expect(City.start(7).tiles).toEqual(City.start(7).tiles)
  expect(City.start(7).tiles).toHaveLength(1)
})

it('draws different starting Tiles from different seeds', () => {
  const starts = new Set(Array.from({ length: 40 }, (_, seed) => City.start(seed).tiles[0]).map((t) => `${t.layout.id}/${t.rotation}`))
  expect(starts.size).toBeGreaterThan(1)
})

it('starts every seed with at least two Gateways', () => {
  for (let seed = 0; seed < 40; seed++) expect(City.start(seed).gateways().length).toBeGreaterThanOrEqual(2)
})
