// PROTOTYPE for #303, throwaway: the small Cities the trips prototype opens on and is measured on.
import { City, LAYOUTS, ZONES, type Layout, type Zone } from '../city/city'

type Step = [layout: Layout['id'], rotation: number, x: number, y: number, zone: Zone['id']]

/** The first 12 Tiles of `npm run tune`'s compact City, zoned as a mixed neighbourhood. */
const MIXED: Step[] = [
  ['crossroads', 0, 0, 0, 'shops'],
  ['crossroads', 0, 1, 0, 'offices'],
  ['tee', 1, 1, 1, 'low-density'],
  ['curve', 3, 0, 1, 'low-density'],
  ['roundabout', 0, -1, 0, 'medium-density'],
  ['tee', 0, 0, -1, 'parks'],
  ['curve', 1, 1, -1, 'low-density'],
  ['curve', 0, -1, -1, 'farms'],
  ['crossroads', 0, 2, 0, 'high-density'],
  ['tee', 1, -1, 1, 'industrial'],
  ['straight', 1, 2, 1, 'green'],
  ['curve', 0, 2, -1, 'medium-density'],
]

/** `mixed`, `homes` (the same roads, every Tile low-density homes), `start` (one Tile) or a number of Tiles of `mixed`. */
export function tripsCity(name: string): City {
  if (name === 'start') return City.start(7)
  const tile = (name: Layout['id']) => LAYOUTS.find((l) => l.id === name)!
  const zoneOf = (id: Zone['id']) => ZONES.find((z) => z.id === (name === 'homes' ? 'low-density' : id))
  const [[layout, rotation, x, y, zone], ...rest] = MIXED.slice(0, Number(name) || MIXED.length)
  const city = new City([{ cell: { x, y }, layout: tile(layout), rotation, zone: zoneOf(zone) }])
  for (const [layout, rotation, x, y, zone] of rest) {
    const verdict = city.place(tile(layout), rotation, { x, y }, zoneOf(zone))
    if (!verdict.legal) throw new Error(`${layout} at ${x},${y}: ${verdict.reason}`)
  }
  return new City(city.tiles)
}
