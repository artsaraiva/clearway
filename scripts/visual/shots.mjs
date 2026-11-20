// Each Zone all over the 26-Tile City at Stages 1, 2 and 3, at the three zooms the Finish is checked at (#173): City
// zoom, the whole City; Tile zoom, one Tile; and Block zoom, one Block. From four quarter-turns of the camera, at noon,
// dusk and night, laid out as sheets for a PR: the Stages side by side, a row for each turn.
//
// Usage: npm run shots -- <zones | unzoned | all> [--times noon,dusk,night] [--turns 4] [--views city,tile,block]
//          [--tile x,y[,m]]... [--block x,y[,m]]... [--stages 1,2,3] [--run <s>] [--query <params>] [--ref <git ref>]
//          [--out <dir>]
//
// Writes <out>/<zone>-<time>-<view>.jpg, a sheet per time of day and zoom for a PR body, with a row for each
// quarter-turn; <out>/<zone>-<time>.jpg, that time's zooms stacked; and the shots under <out>/shots/. <out> defaults to
// scripts/visual/out, or scripts/visual/out/<ref> with --ref, which shoots that ref instead of the working tree.
// --views takes city, tile and block, the three zooms; --times takes morning, noon, afternoon, dusk and night. --tile
// and --block replace every Zone's Tile-zoom and Block-zoom points, sim points in metres (a Tile is 100 m) with the
// metres of road across the screen (110 and 60 unless given, 60 being the closest the camera comes); a point with a
// negative coordinate takes `=` (`--block=-31,-45`). --turns 1 shoots the default heading alone. --run lets the world
// run that many seconds at each time of day before its shots, so moving details stand mid-work and chimneys smoke;
// without it they stand where they rest. --query adds dev parameters to the game's URL, such as `finish=none`.
//
// A comparison is two runs into two folders, their sheets set side by side: for the packed Tile of #175, as built and
// laid deeper, `npm run shots -- shops --views tile --stages 2,3 --turns 1 --times noon,night --run 20 --out
// <dir>/asbuilt`, then the same with `--query deeper --out <dir>/deeper`; each folder's `shops-<time>-tile.jpg` is a
// column.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildCity, DEFAULT_POINTS, frameAll, launch, lookAt, METRES, open, stageAll, turnCamera, zoneNames, zonesFrom } from './city.mjs'
import { closeAll, ROOT, serve } from './serve.mjs'
import { writeSheet } from './sheet.mjs'

const TIMES = { morning: 0, noon: 0.25, afternoon: 0.4, dusk: 0.5, night: 0.75 }
const VIEWS = { city: 'City zoom', tile: 'Tile zoom', block: 'Block zoom' }
// Tile-zoom and Block-zoom points per Zone (seed 3 decides which Tile gets which), one of each for every kind of Block
// where a Zone builds more than one: a Tile at Tile zoom, and a Block of it at Block zoom.
const POINTS = {
  'medium-density': {
    tile: [
      { x: 200, y: 0 }, // terraces
      { x: 100, y: -200 }, // courtyards
    ],
    block: [
      { x: 225, y: -25 },
      { x: 125, y: -225 },
    ],
  },
}
const COLUMN = 640

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    times: { type: 'string', default: 'noon,dusk,night' },
    turns: { type: 'string', default: '4' },
    views: { type: 'string', default: 'city,tile,block' },
    tile: { type: 'string', multiple: true },
    block: { type: 'string', multiple: true },
    stages: { type: 'string', default: '1,2,3' },
    run: { type: 'string', default: '0' },
    query: { type: 'string', default: '' },
    ref: { type: 'string' },
    out: { type: 'string' },
  },
})
const times = values.times.split(',')
if (times.some((t) => !(t in TIMES))) throw new Error(`--times takes ${Object.keys(TIMES).join(', ')}`)
const views = values.views.split(',')
if (views.some((v) => !(v in VIEWS))) throw new Error(`--views takes ${Object.keys(VIEWS).join(', ')}`)
const [turns, stages] = [Number(values.turns), values.stages.split(',').map(Number)]
const points = (list, view) =>
  list?.map((s) => {
    const [x, y, metres] = s.split(',').map(Number)
    return { x, y, metres: metres || METRES[view] }
  })
const given = { tile: points(values.tile, 'tile'), block: points(values.block, 'block') }
const out = values.out ?? join(ROOT, 'scripts/visual/out', values.ref?.replace(/[^\w.-]+/g, '-') ?? '')
mkdirSync(join(out, 'shots'), { recursive: true })

/** In the page: hold the day at `day` and let the world run `run` s. */
function setTime({ day, run }) {
  const c = window.dioramania
  c.view.holdDay(day)
  // The game is paused, so `frame` would pass dt 0. Its cars stand still meanwhile, and would look stuck in a Jam: none
  // is drawn while the world runs, which forgets how long each has stood.
  const vehicles = c.sim.vehicles
  c.sim.vehicles = []
  for (let i = 0; i < run * 10; i++) c.view.render(0.1, 0.1)
  c.sim.vehicles = vehicles
}

/** Lay out a Zone's shots as JPEG sheets: `rows` are each view's shot keys. */
async function writeSheets(browser, zone, name, rows) {
  const label = (key) => {
    const [view, k, turn] = key.split('-')
    return `${VIEWS[view]}${k > 0 ? ` ${Number(k) + 1}` : ''}${turns > 1 ? `<br>turn ${turn}` : ''}`
  }
  const sheet = (file, title, time, keys) =>
    writeSheet(browser, join(out, `${file}.jpg`), {
      title,
      columns: stages.map((s) => `Stage ${s}`),
      rows: keys.map((key) => [label(key), stages.map((s) => `shots/${zone}-${time}-s${s}-${key}.png`)]),
      width: COLUMN,
    })
  const stacked = views.flatMap((view) => rows[view])
  for (const time of times) {
    for (const view of views) await sheet(`${zone}-${time}-${view}`, `${name}, ${VIEWS[view]}, ${time}`, time, rows[view])
    await sheet(`${zone}-${time}`, `${name}, ${time}`, time, stacked)
  }
}

const server = await serve(values.ref)
const { browser, context } = await launch()
try {
  const zones = await zonesFrom(positionals, server)
  const names = await zoneNames(server)
  console.log(`Shooting the ${server.label} into ${out}`)
  for (const zone of zones) {
    const start = performance.now()
    const page = await open(context, server.url, values.query)
    await buildCity(page, zone)
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#ui, .jams, .growth-layer')) el.style.visibility = 'hidden'
    })
    const at = {
      tile: given.tile ?? (POINTS[zone] ?? DEFAULT_POINTS).tile.map((p) => ({ ...p, metres: METRES.tile })),
      block: given.block ?? (POINTS[zone] ?? DEFAULT_POINTS).block.map((p) => ({ ...p, metres: METRES.block })),
    }
    // The shots' keys, per view: `<view>-<point>-<turn>`.
    const rows = Object.fromEntries(
      views.map((view) => [
        view,
        (view === 'city' ? [null] : at[view]).flatMap((_, k) => Array.from({ length: turns }, (_, turn) => `${view}-${k}-${turn}`)),
      ]),
    )
    for (const stage of stages) {
      await stageAll(page, stage)
      for (const time of times) {
        await page.evaluate(setTime, { day: TIMES[time], run: Number(values.run) })
        for (let turn = 0; turn < turns; turn++) {
          const shot = (key) => join(out, 'shots', `${zone}-${time}-s${stage}-${key}.png`)
          if (views.includes('city')) await page.screenshot({ path: shot(`city-0-${turn}`), clip: await page.evaluate(frameAll) })
          for (const view of ['tile', 'block']) {
            if (!views.includes(view)) continue
            for (const [k, point] of at[view].entries()) {
              await page.evaluate(lookAt, point)
              await page.screenshot({ path: shot(`${view}-${k}-${turn}`) })
            }
          }
          await page.evaluate(turnCamera, 1)
        }
        if (turns % 4) await page.evaluate(turnCamera, 4 - (turns % 4)) // back to the default heading
      }
    }
    await page.close()
    await writeSheets(browser, zone, names[zone], rows)
    console.log(
      `${zone}: ${times.flatMap((t) => [...views.map((v) => `${zone}-${t}-${v}.jpg`), `${zone}-${t}.jpg`]).join(', ')} ` +
        `(${((performance.now() - start) / 1000).toFixed(0)} s)`,
    )
  }
} finally {
  await browser.close()
  await closeAll()
}
