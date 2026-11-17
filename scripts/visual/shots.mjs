// Each Zone all over the 26-Tile City at Stages 1, 2 and 3, at the three distances the level of finish is checked at
// (#173: Framed, the whole City; Street, one Tile; Close, one Block), from four quarter-turns of the camera, at noon,
// dusk and night, laid out as sheets for a PR: the Stages side by side, a row for each turn.
//
// Usage: npm run shots -- <zones | all> [--times noon,dusk,night] [--turns 4] [--views framed,street,close]
//          [--street x,y[,m]]... [--close x,y[,m]]... [--stages 1,2,3] [--run <s>] [--query <params>] [--ref <git ref>]
//          [--out <dir>]
//
// Writes <out>/<zone>-<time>-<view>.jpg, a sheet per time of day and distance for a PR body, with a row for each
// quarter-turn; <out>/<zone>-<time>.jpg, that time's distances stacked; and the shots under <out>/shots/. <out>
// defaults to scripts/visual/out, or scripts/visual/out/<ref> with --ref, which shoots that ref instead of the working
// tree. --times takes morning, noon, afternoon, dusk and night. --street and --close replace every Zone's Street and
// Close points, sim points in metres (a Tile is 100 m) with the metres of road across the screen (110 and 40 unless
// given). --turns 1 shoots the default heading alone. --run lets the world run that many seconds at each time of day
// before its shots, so moving details stand mid-work and chimneys smoke; without it they stand where they rest.
// --query adds dev parameters to the game's URL, such as `finish=none`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildCity, DEFAULT_POINTS, frameAll, launch, lookAt, METRES, open, stageAll, turnCamera, zonesFrom } from './city.mjs'
import { closeAll, ROOT, serve } from './serve.mjs'

const TIMES = { morning: 0, noon: 0.25, afternoon: 0.4, dusk: 0.5, night: 0.75 }
const VIEWS = { framed: 'Framed', street: 'Street', close: 'Close' }
// Street and Close points per Zone (seed 3 decides which Tile gets which), one of each for every kind of Block where a
// Zone builds more than one: a Tile at Street, and a Block of it at Close.
const POINTS = {
  'medium-density': {
    street: [
      { x: 200, y: 0 }, // terraces
      { x: 100, y: -200 }, // courtyards
    ],
    close: [
      { x: 225, y: -25 },
      { x: 125, y: -225 },
    ],
  },
}
const COLUMN = 640
const GAP = 8

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    times: { type: 'string', default: 'noon,dusk,night' },
    turns: { type: 'string', default: '4' },
    views: { type: 'string', default: 'framed,street,close' },
    street: { type: 'string', multiple: true },
    close: { type: 'string', multiple: true },
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
const given = { street: points(values.street, 'street'), close: points(values.close, 'close') }
const out = values.out ?? join(ROOT, 'scripts/visual/out', values.ref?.replace(/[^\w.-]+/g, '-') ?? '')
mkdirSync(join(out, 'shots'), { recursive: true })

/** In the page: hold the day at `day` and let the world run `run` s. */
function setTime({ day, run }) {
  const c = window.clearway
  c.view.holdDay(day)
  // The game is paused, so `frame` would pass dt 0. Its cars stand still meanwhile, and would look stuck in a Jam: none
  // is drawn while the world runs, which forgets how long each has stood.
  const vehicles = c.sim.vehicles
  c.sim.vehicles = []
  for (let i = 0; i < run * 10; i++) c.view.render(0.1, 0.1)
  c.sim.vehicles = vehicles
}

const SHEET_CSS = `
  body { margin: 0; background: #f6f6f3; color: #1b2030; font: 700 26px system-ui, sans-serif }
  .grid { display: grid; grid-template-columns: 150px repeat(${stages.length}, ${COLUMN}px); gap: ${GAP}px; place-items: center }
  .grid b { line-height: 36px; text-align: center }
  img { display: block; width: ${COLUMN}px }
  h1 { margin: 0; padding: 14px 16px; font-size: 36px; text-transform: capitalize }`

/** Lay out a Zone's shots as JPEG sheets, in a page of the same Chrome: `rows` are `[view, key]` pairs. */
async function writeSheets(browser, zone, name, rows) {
  const page = await browser.newPage({ viewport: { width: 150 + stages.length * (COLUMN + GAP), height: 400 } })
  const label = (key) => {
    const [view, k, turn] = key.split('-')
    return `${VIEWS[view]}${k > 0 ? ` ${Number(k) + 1}` : ''}${turns > 1 ? `<br>turn ${turn}` : ''}`
  }
  const grid = (time, keys) =>
    `<div class="grid"><b></b>${stages.map((s) => `<b>Stage ${s}</b>`).join('')}${keys
      .map((key) => `<b>${label(key)}</b>${stages.map((s) => `<img src="shots/${zone}-${time}-s${s}-${key}.png">`).join('')}`)
      .join('')}</div>`
  const sheets = times.flatMap((time) => [
    ...views.map((view) => [`${zone}-${time}-${view}`, `<h1>${name}, ${VIEWS[view]}, ${time}</h1>${grid(time, rows[view])}`]),
    [
      `${zone}-${time}`,
      `<h1>${name}, ${time}</h1>${grid(
        time,
        views.flatMap((view) => rows[view]),
      )}`,
    ],
  ])
  for (const [file, body] of sheets) {
    writeFileSync(join(out, 'sheet.html'), `<!doctype html><style>${SHEET_CSS}</style>${body}`)
    await page.goto(pathToFileURL(join(out, 'sheet.html')).href)
    await page.screenshot({ path: join(out, `${file}.jpg`), fullPage: true, type: 'jpeg', quality: 84 })
  }
  await page.close()
}

const server = await serve(values.ref)
const { browser, context } = await launch()
try {
  const zones = await zonesFrom(positionals, server)
  const names = Object.fromEntries((await server.zones()).map((z) => [z.id, z.name]))
  console.log(`Shooting the ${server.label} into ${out}`)
  for (const zone of zones) {
    const start = performance.now()
    const page = await open(context, server.url, values.query)
    await buildCity(page, zone)
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#ui, .jams, .growth-layer')) el.style.visibility = 'hidden'
    })
    const at = {
      street: given.street ?? (POINTS[zone] ?? DEFAULT_POINTS).street.map((p) => ({ ...p, metres: METRES.street })),
      close: given.close ?? (POINTS[zone] ?? DEFAULT_POINTS).close.map((p) => ({ ...p, metres: METRES.close })),
    }
    // The shots' keys, per view: `<view>-<point>-<turn>`.
    const rows = Object.fromEntries(
      views.map((view) => [
        view,
        (view === 'framed' ? [null] : at[view]).flatMap((_, k) => Array.from({ length: turns }, (_, turn) => `${view}-${k}-${turn}`)),
      ]),
    )
    for (const stage of stages) {
      await stageAll(page, stage)
      for (const time of times) {
        await page.evaluate(setTime, { day: TIMES[time], run: Number(values.run) })
        for (let turn = 0; turn < turns; turn++) {
          const shot = (key) => join(out, 'shots', `${zone}-${time}-s${stage}-${key}.png`)
          if (views.includes('framed')) await page.screenshot({ path: shot(`framed-0-${turn}`), clip: await page.evaluate(frameAll) })
          for (const view of ['street', 'close']) {
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
