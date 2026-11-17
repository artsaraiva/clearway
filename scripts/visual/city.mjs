// The 26-Tile seed-3 City in headless Chrome, built and staged through the game's `clearway` dev hook (src/main.ts).
import { chromium } from 'playwright-core'

/** After the Crossroads a `?free&seed=3` run starts on at (0, 0): Layout, quarter turns, x, y, in drop order. */
export const CITY = [
  ['roundabout', 0, 1, 0], ['tee', 0, -1, 0], ['curve', 3, -1, 1], ['tee', 2, 0, 1], ['curve', 2, 1, 1],
  ['crossroads', 0, 2, 0], ['straight', 0, 3, 0], ['straight', 1, 0, -1], ['tee', 3, 1, -1], ['curve', 1, 2, -1],
  ['straight', 1, 2, 1], ['crossroads', 0, 1, -2], ['tee', 0, 0, -2], ['curve', 2, 2, -2], ['straight', 1, 2, 2],
  ['roundabout', 0, -1, -2], ['curve', 2, -1, -1], ['tee', 0, 1, -3], ['curve', 0, -2, 0], ['straight', 0, 4, 0],
  ['tee', 2, 0, -3], ['crossroads', 0, 2, -3], ['tee', 2, -2, -1], ['curve', 2, -2, 1], ['straight', 1, 2, 3],
] // prettier-ignore

export const VIEWPORT = { width: 1440, height: 900 }

/**
 * Headless Google Chrome on the GPU (Metal on a Mac), 1440 × 900 at 2×. Its frame times match a visible browser's,
 * where the desktop app's Browser pane runs as a background page whenever it is hidden.
 */
export async function launch() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  })
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
  return { browser, context }
}

/** Open a seed-3 Free run with the game's own frame loop held, so only `clearway.frame` moves time. */
export async function open(context, base) {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('pageerror', e.message))
  page.on('console', (m) => m.type() === 'error' && !m.location().url.endsWith('/favicon.ico') && console.error('console', m.text()))
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0
  })
  await page.goto(`${base}/?free&seed=3`)
  await page.waitForFunction(() => window.clearway)
  await page.evaluate(() => window.clearway.frame(0.016))
  return page
}

/** Build the 26-Tile City all of `zone`, then pause it so it never jams, and frame it. */
export async function buildCity(page, zone) {
  await page.evaluate(
    ({ zone, city }) => {
      const c = window.clearway
      const settle = () => {
        for (let i = 0; i < 20000 && !c.sim.prewarmed; i++) c.game.step()
        for (let i = 0; i < 2000 && c.view.rebuilding; i++) c.frame(0.1)
      }
      c.pick(zone)
      c.rezone(0, 0, zone)
      for (let i = 0; i < 40; i++) c.frame(0.1)
      for (const [id, r, x, y] of city) {
        if (!c.place(id, r, x, y)) throw new Error(`refused ${id} at ${x},${y}`)
        settle()
      }
      document.querySelector('[data-scale="0"]').click()
      c.view.camera.frameCity()
      for (let i = 0; i < 10; i++) c.frame(0.1)
    },
    { zone, city: CITY },
  )
}

/** Put every Tile at `stage` and play every Stage-up out. */
export async function stageAll(page, stage) {
  await page.evaluate((stage) => {
    const c = window.clearway
    for (const t of c.game.city.tiles) c.stage(t.cell.x, t.cell.y, stage)
    for (let i = 0; i < 20000 && c.view.stagingUp; i++) c.frame(0.1)
    for (let i = 0; i < 40; i++) c.frame(0.1) // confetti settles
  }, stage)
}

/** The Zones named in `args` (commas or spaces, or `all`), checked against what `server` serves. */
export async function zonesFrom(args, server) {
  const known = (await server.zones()).map((z) => z.id)
  const zones = args.flatMap((a) => a.split(',')).filter(Boolean)
  if (zones.includes('all')) return known
  const unknown = zones.filter((z) => !known.includes(z))
  if (!zones.length || unknown.length)
    throw new Error(`name Zones from ${known.join(', ')} or all${unknown.length ? `, not ${unknown}` : ''}`)
  return zones
}
