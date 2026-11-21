// The scene check (#191): builds the 26-Tile City of each Zone in Node, without drawing it, and asserts the rules of
// Finish of #173 that can be asserted over what was placed, across seeds. No browser, no GPU, no pictures.
//
// Usage: npm run check:scene -- <zones | unzoned | all> [--stages 1,2,3] [--seeds 1] [--against <git ref>] [--all]
//          [--counts] [--where <kind>]
//
// Prints, for each Zone, a pass or fail line per rule, each failure with its Stage, seed, Tile and Block, what and by how
// much; the building forms and scenes it built at each Stage; and with --against, the same counts and a hash of every
// mesh on the ref, seed 3's and then which other seeds swept changed, so that a Zone whose meshes changed stands out.
// Rules today's main breaks are listed as known with the issue that owns each (scene/known.ts): they print, but only a
// new failure exits non-zero. --seeds sweeps that many seeds of the Blocks' fill, seed 3 (the sheets') first; --all
// prints every failure, not the first few of each.
//
// On seed 3, the City the sheets shoot: --counts prints at each Stage how many things of each kind stand on the Zone's
// Blocks (the kit's method or the Zone's building that built each, else its fill: house, gardenShed, bench), its scenes
// and movers by kind, and its pools. --where <kind> prints where the first few scenes, movers and things of that kind
// stand at each Stage, one a Block, with their Tile: the middle of each as a sim point (m), to pass on as it is to
// `npm run shots -- <zone> --stages <stage> --block=x,y`, adding `,m` for more metres of road across the shot.
//
// LOOK=lowpoly in the environment builds the low-poly look (src/render/look.ts, #276), as `?look=lowpoly` does on the
// page: `LOOK=lowpoly npm run check:scene -- shops`.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { runnerImport } from 'vite'
import { CITY, UNZONED } from './city.mjs'
import { ROOT } from './serve.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stages: { type: 'string', default: '1,2,3' },
    seeds: { type: 'string', default: '1' },
    against: { type: 'string' },
    all: { type: 'boolean', default: false },
    counts: { type: 'boolean', default: false },
    where: { type: 'string' },
  },
})

/**
 * `ref`'s tree to build the baseline from: its `src`, and this tree's scene check to read it with, which reads an older
 * kit's meshes though it labels nothing. Its own copy, so nothing it imports is this tree's.
 */
function refTree(ref) {
  const sha = execFileSync('git', ['rev-parse', '--short', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim()
  const root = mkdtempSync(join(tmpdir(), 'dioramania-scene-'))
  execFileSync('tar', ['-x', '-C', root], { input: execFileSync('git', ['archive', sha, 'src'], { cwd: ROOT, maxBuffer: 1 << 30 }) })
  cpSync(join(ROOT, 'scripts/visual/scene'), join(root, 'scripts/visual/scene'), { recursive: true })
  symlinkSync(join(ROOT, 'node_modules'), join(root, 'node_modules'))
  return { root, label: ref.startsWith(sha) || sha.startsWith(ref) ? sha : `${ref} (${sha})` }
}

const tree = values.against && refTree(values.against)
try {
  const baseline = tree && {
    build: (await runnerImport(join(tree.root, 'scripts/visual/scene/build.ts'), { root: tree.root, configFile: false, logLevel: 'error' }))
      .module.buildReport,
    label: tree.label,
  }
  const { module: check } = await runnerImport('./scripts/visual/scene/check.ts')
  process.exitCode = await check.main({
    baseline,
    zones: positionals,
    unzoned: UNZONED,
    stages: values.stages.split(',').map(Number),
    seeds: Number(values.seeds),
    all: values.all,
    counts: values.counts,
    where: values.where,
    city: CITY,
  })
} finally {
  if (tree) rmSync(tree.root, { recursive: true, force: true })
}
