// Lays shots out as a labelled JPEG sheet for a PR body, in a page of the scripts' own Chrome.
import { rmSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const LABELS = 150
const GAP = 8

/**
 * Write the JPEG `file`, headed `title`: a column `width` px wide under each of `columns`, and a row for each
 * `[label, shots]`, one shot per column, its path relative to `file`'s folder. Labels and the title are HTML.
 */
export async function writeSheet(browser, file, { title, columns, rows, width }) {
  const css = `
    body { margin: 0; background: #f6f6f3; color: #1b2030; font: 700 26px system-ui, sans-serif }
    .grid { display: grid; grid-template-columns: ${LABELS}px repeat(${columns.length}, ${width}px); gap: ${GAP}px; place-items: center }
    .grid b { line-height: 36px; text-align: center }
    img { display: block; width: ${width}px }
    h1 { margin: 0; padding: 14px 16px; font-size: 36px }`
  const grid = [
    '<b></b>',
    ...columns.map((c) => `<b>${c}</b>`),
    ...rows.flatMap(([label, shots]) => [`<b>${label}</b>`, ...shots.map((s) => `<img src="${s}">`)]),
  ].join('')
  const html = `${file}.html`
  writeFileSync(html, `<!doctype html><style>${css}</style><h1>${title}</h1><div class="grid">${grid}</div>`)
  const page = await browser.newPage({ viewport: { width: LABELS + columns.length * (width + GAP), height: 400 } })
  try {
    await page.goto(pathToFileURL(html).href)
    await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 84 })
  } finally {
    await page.close()
    rmSync(html)
  }
}
