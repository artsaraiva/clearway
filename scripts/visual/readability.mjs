// Whether Tool aids, Jam markers and anger marks read as today over a Zone's surfaces (#173), on the 26-Tile City all
// of that Zone: one Junction selected (its halo, lane ends and round markers), stuck cars with anger marks and steam on
// its Approaches, and a Jam marker forced on every Junction, at noon, dusk and night. Laid out as one sheet for a PR:
// the times of day down, the ref and the working tree across.
//
// Usage: npm run readability -- <zones | unzoned | all> [--stage 3] [--against <git ref>]
//
// Writes scripts/visual/out/<zone>-readability-s<stage>.jpg, and its shots under scripts/visual/out/shots/. Without
// --against the sheet holds the working tree alone. The Junction is the Crossroads of the Tile at (2, 0), the shots'
// Street Tile, seen from the north-west, where no tower stands before it.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildCity, launch, lookAt, open, stageAll, turnCamera, zoneNames, zonesFrom } from './city.mjs'
import { closeAll, ROOT, serve } from './serve.mjs'
import { writeSheet } from './sheet.mjs'

const TIMES = { noon: 0.25, dusk: 0.5, night: 0.75 }
/** The selected Junction, with 80 m of road across the screen: its halo fills the frame. */
const AT = { x: 200, y: 0, metres: 80 }
const COLUMN = 900

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { stage: { type: 'string', default: '3' }, against: { type: 'string' } },
})
const stage = Number(values.stage)
if (![1, 2, 3].includes(stage)) throw new Error('--stage takes 1, 2 or 3')
const out = join(ROOT, 'scripts/visual/out')
mkdirSync(join(out, 'shots'), { recursive: true })

/** In the page: two stuck cars on every Road lane that ends at the Junction `at`, and a Jam on every Junction. */
function jam(at) {
  const c = window.clearway
  const lanes = c.sim.net.lanes.filter((l) => {
    const end = l.line.pts[l.line.pts.length - 1]
    return 'road' in l.owner && Math.hypot(end.x - at.x, end.y - at.y) < 22
  })
  c.sim.vehicles = lanes.flatMap((lane, i) =>
    [6, 12.5].map((back, k) => ({ id: i * 2 + k, lane, s: Math.max(1, lane.length - back), v: 0, type: { length: 4.3 }, path: [] })),
  )
  // The game is paused, so nothing reads the Approaches again and every Junction keeps its marker.
  for (const a of c.sim.approaches) a.jammed = true
}

/** In the page: hold the day at `day`, and let the stuck cars stand 12 s more, their anger and steam building. */
function setTime(day) {
  const c = window.clearway
  c.view.holdDay(day)
  for (let i = 0; i < 240; i++) c.view.render(0.05, 0.05)
  for (let i = 0; i < 3; i++) c.frame(0.016)
}

/** Shoot `server`'s City of `zone` at each time of day, to the paths `shot(time)` gives. */
async function shoot(context, server, zone, shot) {
  const page = await open(context, server.url)
  try {
    await buildCity(page, zone)
    await stageAll(page, stage)
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#ui, .growth-layer')) el.style.visibility = 'hidden'
    })
    await page.evaluate(turnCamera, 2)
    await page.evaluate(lookAt, AT)
    await page.evaluate(jam, AT)
    const [x, y] = await page.evaluate((at) => window.clearway.view.camera.onScreen(at), AT)
    await page.mouse.click(x, y) // a real click selects: synthetic pointer events break on pointer capture
    await page.mouse.move(4, 4)
    for (const [time, day] of Object.entries(TIMES)) {
      await page.evaluate(setTime, day)
      await page.waitForTimeout(450) // the halo and the markers lift on the real clock
      await page.evaluate(() => {
        for (let i = 0; i < 3; i++) window.clearway.frame(0.016)
      })
      await page.screenshot({ path: join(out, shot(time)) })
    }
  } finally {
    await page.close()
  }
}

const tree = await serve()
const sides = values.against ? [await serve(values.against), tree] : [tree]
const { browser, context } = await launch()
try {
  const zones = await zonesFrom(positionals, tree)
  const names = await zoneNames(tree)
  for (const zone of zones) {
    const start = performance.now()
    const shot = (side) => (time) => `shots/${zone}-readability-s${stage}-${side}-${time}.png`
    for (const [side, server] of sides.entries()) await shoot(context, server, zone, shot(side))
    const file = join(out, `${zone}-readability-s${stage}.jpg`)
    await writeSheet(browser, file, {
      title: `${names[zone]}, Stage ${stage}: Tool aids, Jam markers and anger marks`,
      columns: sides.map((s) => s.label),
      rows: Object.keys(TIMES).map((time) => [time, sides.map((_, side) => shot(side)(time))]),
      width: COLUMN,
    })
    console.log(`${file} (${((performance.now() - start) / 1000).toFixed(0)} s)`)
  }
} finally {
  await browser.close()
  await closeAll()
}
