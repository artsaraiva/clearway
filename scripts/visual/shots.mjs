// Each Zone all over the 26-Tile City at Stages 1, 2 and 3, from the default zoom and close up, at noon and at dusk,
// laid out as sheets for a PR: the Stages side by side, the default zoom above the close-ups.
//
// Usage: npm run shots -- <zones | all> [--times noon,dusk] [--at x,y[,zoom]]... [--ref <git ref>] [--out <dir>]
//
// Writes <out>/<zone>-<time>.jpg, a sheet per time of day for a PR body; <out>/<zone>.jpg, every time stacked under the
// Zone's name; and the shots under <out>/shots/. <out> defaults to scripts/visual/out, or scripts/visual/out/<ref>
// with --ref, which shoots that ref instead of the working tree. --times takes morning, noon, afternoon, dusk and
// night. --at replaces every Zone's close-ups with sim points in metres (a Tile is 100 m; zoom as for
// `view.camera.zoomAt`, more negative is closer).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { buildCity, launch, open, stageAll, zonesFrom } from './city.mjs'
import { closeAll, ROOT, serve } from './serve.mjs'

const TIMES = { morning: 0, noon: 0.25, afternoon: 0.4, dusk: 0.5, night: 0.75 }
// Close-ups per Zone, one for each kind of Block where a Zone builds more than one (seed 3 decides which Tile gets which).
const CLOSE = {
  'medium-density': [
    { x: 200, y: 0 }, // terraces
    { x: 100, y: -200 }, // courtyards
  ],
}
const DEFAULT_CLOSE = [{ x: 200, y: 0 }]
const CLOSE_CLIP = { x: 270, y: 150, width: 900, height: 600 }
const COLUMN = 640
const GAP = 8

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    times: { type: 'string', default: 'noon,dusk' },
    at: { type: 'string', multiple: true },
    ref: { type: 'string' },
    out: { type: 'string' },
  },
})
const times = values.times.split(',')
if (times.some((t) => !(t in TIMES))) throw new Error(`--times takes ${Object.keys(TIMES).join(', ')}`)
const at = values.at?.map((s) => {
  const [x, y, zoom] = s.split(',').map(Number)
  return { x, y, zoom }
})
const out = values.out ?? join(ROOT, 'scripts/visual/out', values.ref?.replace(/[^\w.-]+/g, '-') ?? '')
mkdirSync(join(out, 'shots'), { recursive: true })

/** In the page: hold the day at `day`, frame the City, and clip the screenshot to its Tiles. */
function far(day) {
  const c = window.clearway
  c.view.holdDay(day)
  c.view.camera.frameCity()
  for (let i = 0; i < 12; i++) c.frame(0.1)
  const corners = c.game.city.tiles.flatMap((t) =>
    [-50, 50].flatMap((dx) => [-50, 50].map((dy) => c.view.camera.onScreen({ x: t.cell.x * 100 + dx, y: t.cell.y * 100 + dy }))),
  )
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const x = Math.max(0, Math.min(...xs) - 30)
  const y = Math.max(0, Math.min(...ys) - 70) // room for the tallest buildings
  return { x, y, width: Math.min(innerWidth, Math.max(...xs) + 30) - x, height: Math.min(innerHeight, Math.max(...ys) + 40) - y }
}

/** In the page: fly to `at` from the default zoom and zoom in on it. */
function closeUp(at) {
  const c = window.clearway
  c.view.camera.frameCity()
  for (let i = 0; i < 12; i++) c.frame(0.1)
  c.view.camera.centreOn(at)
  for (let i = 0; i < 12; i++) c.frame(0.1)
  const r = document.querySelector('#scene').getBoundingClientRect()
  c.view.camera.zoomAt({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, at.zoom ?? -4000)
  for (let i = 0; i < 4; i++) c.frame(0.1)
}

const SHEET_CSS = `
  body { margin: 0; background: #f6f6f3; color: #1b2030; font: 700 30px system-ui, sans-serif }
  .grid { display: grid; grid-template-columns: repeat(3, ${COLUMN}px); gap: ${GAP}px; place-items: center }
  .grid b { line-height: 40px }
  img { display: block; width: ${COLUMN}px }
  h1 { margin: 0; padding: 14px 16px; font-size: 40px }
  h2 { margin: 0; padding: 12px 16px 4px; font-size: 28px; text-transform: capitalize }`

/** Lay out a Zone's shots as JPEG sheets, in a page of the same Chrome. */
async function writeSheets(browser, zone, name, views) {
  const page = await browser.newPage({ viewport: { width: 3 * COLUMN + 2 * GAP, height: 400 } })
  const stages = [1, 2, 3]
  const grid = (time) =>
    `<div class="grid">${stages.map((s) => `<b>Stage ${s}</b>`).join('')}${views
      .flatMap((view) => stages.map((s) => `<img src="shots/${zone}-${time}-s${s}-${view}.png">`))
      .join('')}</div>`
  const sheets = times.map((time) => [`${zone}-${time}`, grid(time)])
  sheets.push([zone, `<h1>${name}</h1>${times.map((time) => `<h2>${time}</h2>${grid(time)}`).join('')}`])
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
    const page = await open(context, server.url)
    await buildCity(page, zone)
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#ui, .jams, .growth-layer')) el.style.visibility = 'hidden'
    })
    const closes = at ?? CLOSE[zone] ?? DEFAULT_CLOSE
    for (const stage of [1, 2, 3]) {
      await stageAll(page, stage)
      for (const time of times) {
        const shot = (view) => join(out, 'shots', `${zone}-${time}-s${stage}-${view}.png`)
        await page.screenshot({ path: shot('far'), clip: await page.evaluate(far, TIMES[time]) })
        for (const [k, point] of closes.entries()) {
          await page.evaluate(closeUp, point)
          await page.screenshot({ path: shot(`close${k}`), clip: CLOSE_CLIP })
        }
      }
    }
    await page.close()
    await writeSheets(browser, zone, names[zone], ['far', ...closes.map((_, k) => `close${k}`)])
    console.log(
      `${zone}: ${times.map((t) => `${zone}-${t}.jpg`).join(', ')}, ${zone}.jpg (${((performance.now() - start) / 1000).toFixed(0)} s)`,
    )
  }
} finally {
  await browser.close()
  await closeAll()
}
