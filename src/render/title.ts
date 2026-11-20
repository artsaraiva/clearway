import { City, FIRST_ZONE, LAYOUTS } from '../city/city'
import { DT, Sim } from '../sim/sim'
import { cellBounds, gatewayDemand } from '../sim/tiles'
import { GATEWAY_DEMAND } from '../tuning'
import { SEEDED } from './scenery'
import { createView } from './view'

/**
 * The title's Demand, as a share of one Tile's own. One Tile sends under two trips a minute from a Gateway, which
 * leaves the Crossroads empty most of the time. With the seed below, this many times that keeps two cars or more on the
 * Tile 95% of an hour, leaves it empty for 8 s at most, and first jams after 38 minutes. The mock-up's 8 jams it for good.
 */
const SHOW = 4.5
/** The seeds of its buildings and of its traffic, fixed so that the title always shows the same Tile. */
const SEED = { scenery: 3, sim: 1 }
/**
 * The camera: its zoom (a Tile about 0.7 of the canvas's height across), and how far right and down of the middle the
 * Tile's centre sits, as shares of the canvas's height, which leave room for the title card top-left.
 */
const VIEW = { zoom: 1.5, right: 0.05, down: -0.02 }
/** Noon: the time of day the title holds. */
const NOON = 0.25

/**
 * The title screen's scene (#243, "Title screen"): one Tile, a Crossroads built as low-density residential at Stage 3,
 * drawn by the game's own view on `canvas` in open sky at noon, with cars driving on it. Its traffic is for show: its
 * Demand is raised, and it is no run (no yen, no Growth, never saved). Nothing on it can be picked or moved.
 */
export function createTitleScene(canvas: HTMLCanvasElement) {
  const tile = { cell: { x: 0, y: 0 }, layout: LAYOUTS.find((l) => l.id === 'crossroads')!, rotation: 0, zone: FIRST_ZONE }
  const city = new City([tile])
  // Read the network and its Demand quickly, then build the Sim that drives on it, its Demand raised, and Pre-warm it.
  const quick = new Sim(city, [], SEED.sim, { prewarm: false, conflicts: false })
  const demand = gatewayDemand(city, quick.net, { ...GATEWAY_DEMAND, base: GATEWAY_DEMAND.base * SHOW })
  const sim = new Sim({ network: quick.spec, demand }, [], SEED.sim)
  const piece = cellBounds(tile.cell)
  const view = createView(
    canvas,
    sim,
    {
      pieces: [piece],
      scenery: { theme: 'city', seed: SEED.scenery, landmarks: [], blocks: [], streets: {}, avenues: [], seeded: SEEDED },
      zoneOf: () => tile.zone,
      stageOf: () => 3,
    },
    undefined,
    true,
  )
  view.holdDay(NOON)
  view.camera.look({ x: (piece.x0 + piece.x1) / 2, y: (piece.y0 + piece.y1) / 2 }, VIEW.zoom, VIEW.right, VIEW.down)
  let acc = 0

  return {
    /** Whether the world moves less, as the browser's reduced motion asks: the clouds stop and the cars stop shaking. */
    set calm(on: boolean) {
      view.calm = on
    },

    /** One frame: `dt` real seconds of traffic at 1×, drawn. */
    frame(dt: number) {
      acc += dt
      while (acc >= DT) {
        sim.step()
        acc -= DT
      }
      view.render(dt)
    },

    /** Let go of the canvas, as the title gives way to a run. */
    dispose: view.dispose,
  }
}
