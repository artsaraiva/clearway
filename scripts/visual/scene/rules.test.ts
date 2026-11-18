// The scene check's own rules (#191), each over a report written by hand: not one of the game's test seams.
import { describe, expect, it } from 'vitest'
import { boxOf, turnedBox } from './geometry'
import type { Block, Hull, Lot, Report, Thing } from './report'
import { colours, insideBlock, keepsClear, moves, neighbours, pathsClear, emptyPavement, scenes, wheels } from './rules'

/** A square Block 40 m on a side round the origin, on Tile 0,0. */
const BLOCK: Block = {
  tile: '0,0',
  zone: 'offices',
  finished: true,
  stage: 3,
  loop: [
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: 20, y: 20 },
    { x: -20, y: 20 },
  ],
  area: 1600,
}

let ids = 0
/** A thing standing on the Block, its feet a box `w` by `d` at `(x, y)`, `tall` m tall. */
function thing(what: string, x: number, y: number, w: number, d: number, more: Partial<Thing> & { tall?: number } = {}): Thing {
  const feet: Hull[] = [turnedBox(x, y, w, d, 0)]
  const { tall = 1, ...rest } = more
  return {
    id: ids++,
    tile: '0,0',
    block: 0,
    kind: 'building',
    what,
    fill: 'test',
    lot: -1,
    scene: -1,
    layer: 'solid',
    base: 1.2,
    top: 1.2 + tall,
    low: 1.2,
    feet,
    box: boxOf(feet.flat()),
    area: w * d,
    flat: false,
    tris: 12,
    bulbs: 0,
    bulbLow: Infinity,
    pools: 0,
    ...rest,
  }
}

/** A report of one Block holding `things`, numbered as they lie. */
function report(things: Thing[], more: Partial<Report> = {}): Report {
  return {
    zone: 'offices',
    stage: 3,
    seed: 3,
    blocks: [BLOCK],
    things: things.map((t, id) => ({ ...t, id })),
    claims: [],
    scenes: [],
    lots: [],
    movers: [],
    pools: [],
    moving: { '0,0': 1 },
    colours: {},
    vehicles: [],
    closeHidden: true,
    triangles: 0,
    meshes: 0,
    hash: '',
    ms: 0,
    ...more,
  }
}

describe('wheels', () => {
  it('fails a car skin that floats over the road, as the kei truck without wheels did', () => {
    const r = report([], { vehicles: [{ name: 'car keiTruck', low: 0.32 }] })
    expect(wheels(r).map((f) => [f.what, f.by])).toEqual([['car keiTruck floats', '0.32 m']])
  })

  it('passes cars on their wheels', () => {
    expect(wheels(report([], { vehicles: [{ name: 'car van', low: 0 }] }))).toEqual([])
  })
})

describe('inside-block', () => {
  it('fails a bench half off the Block, by how far it reaches past the edge', () => {
    const [f] = insideBlock(report([thing('bench', 20, 0, 2, 1)]))
    expect(f.what).toBe('bench stands off its Block')
    expect(f.by).toBe('1.00 m')
  })
})

describe('keeps-clear', () => {
  it('fails a hedge across the step before a door, but not the building the door is in', () => {
    const house = thing('apartment', 0, -5, 10, 10)
    const hedge = thing('plantings', 0, 0.8, 4, 0.8, { tall: 0.9 })
    const r = report([house, hedge], { claims: [{ kind: 'door', tile: '0,0', block: 0, hull: turnedBox(0, 0.6, 1.2, 1.2, 0), thing: 0 }] })
    expect(keepsClear(r).map((f) => f.what)).toEqual(['plantings on a door step'])
  })

  it('fails a bin store on a parking bay, and lets a parked car stand in it', () => {
    const bay = { kind: 'bay' as const, tile: '0,0', block: 0, hull: turnedBox(0, 0, 7.5, 5, 0), thing: 2 }
    const r = report(
      [
        thing('parked', -2.5, 0, 2, 4.3),
        thing('binStore', 2.5, 1, 2, 1, { tall: 1.5 }),
        thing('parkingBays', 0, 0, 7.5, 5, { flat: true }),
      ],
      {
        claims: [bay],
      },
    )
    expect(keepsClear(r).map((f) => f.what)).toEqual(['binStore on a parking bay'])
  })

  it('fails two props that overlap, by how deep, and lets a tree stand in its bed', () => {
    const r = report([
      thing('bench', 0, 0, 2, 0.6),
      thing('planter', 1.5, 0, 1.6, 0.6),
      thing('bed', 10, 10, 2, 2, { tall: 0.4 }),
      thing('tree', 10, 10, 0.4, 0.4, { kind: 'tree', tall: 6 }),
    ])
    expect(keepsClear(r).map((f) => [f.what, f.by])).toEqual([['bench and planter overlap', '0.30 m']])
  })
})

describe('paths-clear', () => {
  it("fails a scooter's path through a bin store", () => {
    const path = [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: -10, y: 0 },
    ]
    const r = report([thing('binStore', 0, 0, 2, 1, { tall: 1.5 })], {
      movers: [{ kind: 'scooter', tile: '0,0', block: 0, path, wide: 1.1, away: false, thing: 9 }],
    })
    expect(pathsClear(r).map((f) => f.what)).toEqual(["scooter's path runs through binStore"])
  })

  it('fails a food truck that comes and goes in the middle of its Block, not at a Road', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 0 },
    ]
    const r = report([], { movers: [{ kind: 'foodtruck', tile: '0,0', block: 0, path, wide: 2.6, away: true, thing: 9 }] })
    expect(pathsClear(r).map((f) => f.what)).toEqual(['foodtruck comes and goes away from a Road'])
  })
})

describe('neighbours-differ', () => {
  const lot = (index: number, x: number, form: string): Lot => {
    const ground = turnedBox(x, 0, 10, 10, 0)
    return { tile: '0,0', block: 0, index, box: boxOf(ground), form, ground }
  }

  it('fails two lots side by side of one form, as two touching towers of one style were', () => {
    const r = report([], { lots: [lot(0, -5, 'office round'), lot(1, 5, 'office round')] })
    expect(neighbours(r).map((f) => f.what)).toEqual(['lots 0 and 1 side by side are both "office round"'])
  })

  it('passes lots of one form that do not touch, and touching lots of two forms', () => {
    const r = report([], { lots: [lot(0, -5, 'office round'), lot(1, 5, 'office fins'), lot(2, 30, 'office round')] })
    expect(neighbours(r)).toEqual([])
  })
})

describe('scenes', () => {
  const court = (pieces: Thing[]) => report(pieces, { scenes: [{ kind: 'truck', tile: '0,0', block: 0, things: pieces.map((_, i) => i) }] })

  it('fails a truck court with only tables under parasols when the truck is away', () => {
    const tables = [0, 1].map((k) => thing('cafeTable', k * 4, 0, 2.8, 2.8, { scene: 0, tall: 2.6 }))
    expect(scenes(court(tables)).map((f) => f.what)).toEqual(['truck with nothing larger than a car standing on a Block of 1600 m²'])
  })

  it('passes a truck court with a pergola over its tables', () => {
    expect(scenes(court([thing('truckCourt', 0, 0, 9, 3, { scene: 0, tall: 3 })]))).toEqual([])
  })

  it('asks no scene of a Block at Stage 1', () => {
    expect(scenes(report([], { stage: 1 }))).toEqual([])
  })

  it("asks no scene of a Block the seed's coral tower stands on in place of its Zone's fill", () => {
    expect(scenes(report([thing('tower', 0, 0, 12, 12, { fill: 'tower', tall: 40 })]))).toEqual([])
  })
})

describe('moves', () => {
  it('fails a Tile at Stage 2 where nothing moves', () => {
    expect(moves(report([], { stage: 2, moving: {} })).map((f) => f.tile)).toEqual(['0,0'])
  })
})

describe('colours', () => {
  it('fails the Tool blue itself and passes wood', () => {
    const r = report([], { colours: { '1f7aff': 4, a1714c: 9 } })
    expect(colours(r).map((f) => f.what)).toEqual(['#1f7aff (4 triangles)'])
  })

  it('passes the turquoise the cars wear in place of a blue', () => {
    expect(colours(report([], { colours: { '009dcb': 1 } }))).toEqual([])
  })
})

describe('empty-pavement', () => {
  it('fails a Block with nothing standing along 40 m of its edge', () => {
    const r = report([thing('shop', -20, 0, 2, 40), thing('shop', 0, -20, 40, 2), thing('shop', 0, 20, 40, 2)])
    expect(emptyPavement(r).map((f) => f.by)).toEqual(['31 m'])
  })

  it('reads a taxi bay laid at the kerb as no pavement, which breaks the run either side of it', () => {
    const taxi = { kind: 'taxi' as const, tile: '0,0', block: 0, hull: turnedBox(18.75, 0, 2.5, 20, 0), thing: 0 }
    const r = report([thing('shop', -20, 0, 2, 40), thing('shop', 0, -20, 40, 2), thing('shop', 0, 20, 40, 2)], { claims: [taxi] })
    expect(emptyPavement(r)).toEqual([])
  })
})
