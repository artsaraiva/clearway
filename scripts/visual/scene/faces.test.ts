// The scene check's reading of walls and roofs (#198), over geometry built here as the kit builds it: not one of the
// game's test seams. Each case runs the read faces through rules 1 and 2 and asserts what they fail.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { facesOf, type Part } from './faces'
import { boxOf, turnedBox } from './geometry'
import type { Report, Thing } from './report'
import { blankRoofs, blankWalls } from './rules'

/** m above the road a building stands on, as the kit's lots do. */
const BASE = 1.2

/** A box `w` east–west by `d` north–south and `h` tall, its foot `from` m over the road, centred on `(x, y)`, on the building. */
const box = (w: number, d: number, h: number, from = BASE, x = 0, y = 0, material = 'solid'): Part => ({
  geo: new THREE.BoxGeometry(w, h, d).translate(x, from + h / 2, -y),
  material,
  brick: 0,
})

/** What rules 1 and 2 fail on one building of `parts`, by rule. */
function failures(parts: Part[]): { walls: string[]; roofs: string[] } {
  const { walls, roofs } = facesOf(parts, [{ kind: 'building', at: { y: BASE } }])
  const feet = [turnedBox(0, 0, 10, 8, 0)]
  const house: Thing = {
    ...{ id: 0, tile: '0,0', block: 0, kind: 'building', what: 'house', fill: 'test', lot: -1, scene: -1, layer: 'solid' },
    ...{ base: BASE, top: BASE + 6, low: BASE, feet, box: boxOf(feet.flat()), area: 80, flat: false, tris: 12 },
    ...{ bulbs: 0, bulbLow: Infinity, pools: 0 },
  }
  const on = { tile: '0,0', block: 0, thing: 0 }
  const r = {
    zone: 'medium-density',
    stage: 1,
    seed: 3,
    things: [house],
    walls: walls.map(({ brick: _, ...w }) => ({ ...on, ...w })),
    roofs: roofs.map(({ brick: _, ...f }) => ({ ...on, ...f })),
  } as unknown as Report
  return { walls: blankWalls(r).map((f) => f.what), roofs: blankRoofs(r).map((f) => f.what) }
}

describe('the walls and roofs read off a building', () => {
  it('fails each wall of a plain box two storeys tall, saying which way it faces, and its bare roof', () => {
    const { walls, roofs } = failures([box(10, 8, 6)])
    expect(walls.map((w) => w.replace(/ toward.*/, '')).sort()).toEqual(
      ['east', 'north', 'west', 'south'].map((way) => `house has a blank wall facing ${way}`).sort(),
    )
    expect(walls.length).toBe(4)
    expect(roofs).toEqual(['house has a blank roof toward (0, 0)'])
  })

  it('passes a box that wears surface pattern on its walls and roof', () => {
    const part = box(10, 8, 6)
    const n = part.geo.attributes.position.count
    part.geo.setAttribute('pattern', new THREE.BufferAttribute(new Float32Array(n * 3).fill(10.5), 3))
    expect(failures([part])).toEqual({ walls: [], roofs: [] })
  })

  it('reads windows 2.4 m apart on each storey of the south wall as breaking it up', () => {
    const windows = [-3.6, -1.2, 1.2, 3.6].flatMap((x) => [1, 4].map((v) => box(1.2, 0.2, 1.4, BASE + v, x, -4.05, 'glass')))
    const { walls } = failures([box(10, 8, 6), ...windows])
    expect(walls.some((w) => w.includes('facing south'))).toBe(false)
    expect(walls.length).toBe(3)
  })

  it('joins the storeys of a wall built a box each, so two blank storeys fail as one wall', () => {
    const { walls } = failures([box(10, 8, 3), box(10, 8, 3, BASE + 3)])
    expect(walls.length).toBe(4)
  })

  it('reads a drum 2.5 m across its many facets as one curved wall, and fails it', () => {
    const drum: Part = {
      geo: new THREE.CylinderGeometry(2.5, 2.5, 10, 32).translate(0, BASE + 5, 0),
      material: 'solid',
      brick: 0,
    }
    const { walls } = failures([drum])
    expect(walls.length).toBe(1)
  })

  it('passes a flat roof with roof kit in its middle, and fails one with a parapet alone', () => {
    const parapet = [
      box(10, 0.4, 1, BASE + 6, 0, 3.8),
      box(10, 0.4, 1, BASE + 6, 0, -3.8),
      box(0.4, 8, 1, BASE + 6, 4.8, 0),
      box(0.4, 8, 1, BASE + 6, -4.8, 0),
    ]
    expect(failures([box(10, 8, 6), ...parapet]).roofs.length).toBe(1)
    expect(failures([box(10, 8, 6), ...parapet, box(1.6, 1.2, 1.2, BASE + 6, 1, 1)]).roofs).toEqual([])
  })
})
