// The 26-Tile seed-3 City in headless Chrome, built and staged through the game's `dioramania` dev hook (src/main.ts).
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
 * The metres of road plane across the canvas at Tile zoom, one Tile filling the screen, and at Block zoom, one Block
 * (`lookAt`). Block zoom is the camera's closest, which comes no nearer: a smaller width shoots the same.
 */
export const METRES = { tile: 110, block: 60 }
/** Where a Zone's Tile-zoom and Block-zoom shots look unless it has points of its own: the Tile at (2, 0), and a Block of it. */
export const DEFAULT_POINTS = { tile: [{ x: 200, y: 0 }], block: [{ x: 225, y: -25 }] }

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

/**
 * Open a seed-3 Free run with the game's own frame loop held, so only `dioramania.frame` moves time. `query` adds dev
 * parameters to the page's URL, such as `finish=none`.
 */
export async function open(context, base, query = '') {
  const page = await context.newPage()
  page.on('pageerror', (e) => console.error('pageerror', e.message))
  page.on('console', (m) => m.type() === 'error' && !m.location().url.endsWith('/favicon.ico') && console.error('console', m.text()))
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0
    // A ref from before the rename (docs/adr/0007-the-game-is-called-dioramania.md) puts the dev hook on `clearway`.
    Object.defineProperty(window, 'clearway', { configurable: true, set: (hook) => (window.dioramania = hook) })
  })
  await page.goto(`${base}/?free&seed=3${query ? `&${query.replace(/^[?&]/, '')}` : ''}`)
  await page.waitForFunction(() => window.dioramania)
  await page.evaluate(() => window.dioramania.frame(0.016))
  return page
}

/** Not a Zone: the name the scripts take for a City of unzoned Tiles, Roads only (#176). */
export const UNZONED = 'unzoned'

/** Build the 26-Tile City all of `zone`, or unzoned, then pause it so it never jams, and frame it. */
export async function buildCity(page, zone) {
  await page.evaluate(
    ({ zone, city }) => {
      const c = window.dioramania
      const settle = () => {
        for (let i = 0; i < 20000 && !c.sim.prewarmed; i++) c.game.step()
        for (let i = 0; i < 2000 && (c.view.rebuilding || c.view.assembling); i++) c.frame(0.1)
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
    { zone: zone === UNZONED ? null : zone, city: CITY },
  )
}

/** Put every Tile at `stage` and play every Stage-up out. */
export async function stageAll(page, stage) {
  await page.evaluate((stage) => {
    const c = window.dioramania
    for (const t of c.game.city.tiles) c.stage(t.cell.x, t.cell.y, stage)
    for (let i = 0; i < 20000 && c.view.stagingUp; i++) c.frame(0.1)
    for (let i = 0; i < 40; i++) c.frame(0.1) // confetti settles
  }, stage)
}

/** In the page: turn the camera `quarters` quarter-turns about the middle of the canvas, keeping its tilt and zoom. */
export function turnCamera(quarters) {
  const c = window.dioramania
  c.view.camera.rotate((-document.querySelector('#scene').getBoundingClientRect().height / 4) * quarters, 0)
  c.frame(0.1)
}

/**
 * In the page: frame the whole City from the camera's heading, and return the clip round its Tiles for a screenshot.
 * The three zooms every sheet shows are this one, City zoom, and `lookAt`'s Tile zoom and Block zoom.
 */
export function frameAll() {
  const c = window.dioramania
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

/**
 * In the page: fly to the sim point `(x, y)` (m; a Tile is 100 m) from the camera's heading and zoom until `metres` of
 * road plane run across the canvas's width (`METRES`).
 */
export function lookAt({ x, y, metres }) {
  const c = window.dioramania
  c.view.camera.frameCity()
  for (let i = 0; i < 12; i++) c.frame(0.1)
  c.view.camera.centreOn({ x, y })
  for (let i = 0; i < 12; i++) c.frame(0.1)
  const r = document.querySelector('#scene').getBoundingClientRect()
  const middle = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
  for (let k = 0; k < 6; k++) {
    const a = c.view.pick({ clientX: middle.clientX - 100, clientY: middle.clientY })
    const b = c.view.pick({ clientX: middle.clientX + 100, clientY: middle.clientY })
    const span = (Math.hypot(b.x - a.x, b.y - a.y) * r.width) / 200
    c.view.camera.zoomAt(middle, (100 * Math.log(span / metres)) / Math.log(0.95))
    c.frame(0.1)
  }
  for (let i = 0; i < 4; i++) c.frame(0.1)
}

/**
 * The Zones named in `args` (commas or spaces, or `all`), checked against what `server` serves, and `unzoned` for a City
 * of Roads only, which `all` leaves out.
 */
export async function zonesFrom(args, server) {
  const known = (await server.zones()).map((z) => z.id)
  const zones = args.flatMap((a) => a.split(',')).filter(Boolean)
  if (zones.includes('all')) return [...known, ...zones.filter((z) => z === UNZONED)]
  const unknown = zones.filter((z) => z !== UNZONED && !known.includes(z))
  if (!zones.length || unknown.length)
    throw new Error(`name Zones from ${known.join(', ')}, ${UNZONED} or all${unknown.length ? `, not ${unknown}` : ''}`)
  return zones
}

/** Each Zone's name by its id, as `server` serves them, and `unzoned`'s. */
export async function zoneNames(server) {
  return { ...Object.fromEntries((await server.zones()).map((z) => [z.id, z.name])), [UNZONED]: 'Unzoned' }
}
