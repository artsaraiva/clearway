// Whether Tool aids, Jam markers and anger marks read as today over a Zone's surfaces (#173), on the 26-Tile City all
// of that Zone: one Junction selected (its halo, lane ends and round markers), stuck cars with anger marks and steam on
// its Approaches, and a Jam marker forced on every Junction, at noon, dusk and night. Laid out as one sheet for a PR:
// the times of day down, the ref and the working tree across.
//
// Usage: npm run readability -- <zones | unzoned | all> [--stage 3] [--against <git ref>]
//
// Writes scripts/visual/out/<zone>-readability-s<stage>.jpg, and its shots under scripts/visual/out/shots/. Without
// --against the sheet holds the working tree alone. The Junction is the Crossroads of the Tile at (2, 0), the shots'
// Tile-zoom Tile, seen from the north-west, where no tower stands before it.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildCity, launch, lookAt, open, stageAll, turnCamera, zoneNames, zonesFrom } from './city.mjs'
import { closeAll, ROOT, serve } from './serve.mjs'
import { writeSheet } from './sheet.mjs'

const TIMES = { noon: 0.25, dusk: 0.5, night: 0.75 }
/**
 * The selected Junction, with 80 m of road across the screen. ponytail: one Junction from one heading for every Zone;
 * a Zone that builds tall on its north-west corners, or a change to `CITY`, hides it. Take it as a flag then.
 */
const JUNCTION = { x: 200, y: 0, metres: 80 }
/** The middle of the 1440 × 900 screen, where the halo fills most of the frame and no edge-pinned Jam marker shows. */
const CLIP = { x: 173, y: 72, width: 1094, height: 756 }
const COLUMN = 900

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { stage: { type: 'string', default: '3' }, against: { type: 'string' } },
})
const stage = Number(values.stage)
if (![1, 2, 3].includes(stage)) throw new Error('--stage takes 1, 2 or 3')
const out = join(ROOT, 'scripts/visual/out')
mkdirSync(join(out, 'shots'), { recursive: true })

/** In the page: two stuck cars on each of the Junction `at`'s Approach lanes, and a Jam on every Junction. */
function forceJams(at) {
  const c = window.dioramania
  // A Road lane whose end lies inside the Junction's 22 m radius feeds it.
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
function standAt(day) {
  const c = window.dioramania
  c.view.holdDay(day)
  for (let i = 0; i < 240; i++) c.view.render(0.05, 0.05)
  for (let i = 0; i < 3; i++) c.frame(0.016)
}

/** Shoot `server`'s City of `zone` at each time of day, to the paths `shot(time)` gives, and say what the last showed. */
async function shoot(context, server, zone, shot) {
  const page = await open(context, server.url)
  try {
    await buildCity(page, zone)
    await stageAll(page, stage)
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#ui, .growth-layer')) el.style.visibility = 'hidden'
    })
    await page.evaluate(turnCamera, 2)
    await page.evaluate(lookAt, JUNCTION)
    await page.evaluate(forceJams, JUNCTION)
    const [x, y] = await page.evaluate((at) => window.dioramania.view.camera.onScreen(at), JUNCTION)
    await page.mouse.click(x, y) // a real click selects: synthetic pointer events break on pointer capture
    await page.mouse.move(4, 4) // off the board's middle, so no hovered Junction lifts a halo of its own
    for (const [time, day] of Object.entries(TIMES)) {
      await page.evaluate(standAt, day)
      await page.waitForTimeout(450) // the halo and the markers lift on the real clock
      await page.evaluate(() => {
        for (let i = 0; i < 3; i++) window.dioramania.frame(0.016)
      })
      await page.screenshot({ path: join(out, shot(time)), clip: CLIP })
    }
    const [markers, jams, cars] = await page.evaluate(() => [
      document.querySelectorAll('.jams .jam:not(.gone)').length,
      window.dioramania.sim.jams.length,
      window.dioramania.sim.vehicles.length,
    ])
    console.log(`${server.label}: ${markers} Jam markers for ${jams} Jams, ${cars} stuck cars`)
  } finally {
    await page.close()
  }
}

const tree = await serve()
const sides = [...(values.against ? [['ref', await serve(values.against)]] : []), ['tree', tree]]
const { browser, context } = await launch()
try {
  const zones = await zonesFrom(positionals, tree)
  const names = await zoneNames(tree)
  for (const zone of zones) {
    const start = performance.now()
    const shot = (side) => (time) => `shots/${zone}-readability-s${stage}-${side}-${time}.png`
    for (const [side, server] of sides) await shoot(context, server, zone, shot(side))
    const file = join(out, `${zone}-readability-s${stage}.jpg`)
    await writeSheet(browser, file, {
      title: `${names[zone]}, Stage ${stage}: Tool aids, Jam markers and anger marks`,
      columns: sides.map(([, server]) => server.label),
      rows: Object.keys(TIMES).map((time) => [time, sides.map(([side]) => shot(side)(time))]),
      width: COLUMN,
    })
    console.log(`${file} (${((performance.now() - start) / 1000).toFixed(0)} s)`)
  }
} finally {
  await browser.close()
  await closeAll()
}
