// The scene check's runner (#191): builds each Zone's City at each Stage and seed, runs the rules over each report, and
// prints what failed, what is known, the building forms and scenes built, and how the meshes compare with a ref; and on
// asking, what it built of each kind and where.
import { ZONES } from '../../../src/city/city'
import type { Stage } from '../../../src/game/game'
import { buildReport, type Drop } from './build'
import { boxOf } from './geometry'
import { CEILINGS, knownOf } from './known'
import type { Box, Failure, Report } from './report'
import { rules, sameLots } from './rules'

/** What `npm run check:scene` was asked: see the usage at the head of `../check.mjs`. */
export interface Options {
  zones: string[]
  unzoned: string
  stages: number[]
  seeds: number
  all: boolean
  /** Print what each Stage built of each kind (--counts), and where the first few of `where`'s kind stand (--where). */
  counts: boolean
  where?: string
  city: Drop[]
  /** The ref's own `buildReport`, from a copy of its tree, with --against; and its name. */
  baseline?: { build: typeof buildReport; label: string }
}

/** Failures printed of each rule that fails, unless --all. */
const SHOWN = 4

/** The seeds swept: seed 3 first, the one the sheets are shot on, then 1, 2, 4, 5... */
export const seedsOf = (n: number) => [3, ...Array.from({ length: n + 1 }, (_, i) => i + 1).filter((s) => s !== 3)].slice(0, n)

/** The Zones `names` asks for: ids, commas or spaces, `all` for every Zone and unzoned. */
function zonesOf(names: string[], unzoned: string): string[] {
  const known = ZONES.map((z) => z.id as string)
  const asked = names.flatMap((a) => a.split(',')).filter(Boolean)
  if (asked.includes('all')) return [...known, unzoned]
  const unknown = asked.filter((z) => z !== unzoned && !known.includes(z))
  if (!asked.length || unknown.length)
    throw new Error(`name Zones from ${known.join(', ')}, ${unzoned} or all${unknown.length ? `, not ${unknown}` : ''}`)
  return asked
}

/** Where a failure is, as the check prints it. */
const where = (f: Failure) =>
  [`Stage ${f.stage}`, `seed ${f.seed}`, f.tile !== undefined && `Tile ${f.tile}`, f.block !== undefined && `Block ${f.block}`]
    .filter(Boolean)
    .join(' ')

/** How many of each building form and scene kind a set of reports built, by Stage. */
function mix(reports: Report[]): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>()
  for (const r of reports) {
    const counts = out.get(r.stage) ?? out.set(r.stage, new Map()).get(r.stage)!
    for (const l of r.lots) if (l.form) counts.set(l.form, (counts.get(l.form) ?? 0) + 1)
    for (const s of r.scenes) counts.set(`scene ${s.kind}`, (counts.get(`scene ${s.kind}`) ?? 0) + 1)
  }
  return out
}

/** How many of each name, as `name n` by name. */
function tally(names: string[]): string {
  const n = new Map<string, number>()
  for (const s of names) n.set(s, (n.get(s) ?? 0) + 1)
  return (
    [...n]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([s, k]) => `${s} ${k}`)
      .join(', ') || 'none'
  )
}

/** What a City built on its Blocks, by kind: things by their label (`Thing.what`), scenes and movers by theirs, and pools. */
function counts(r: Report) {
  const things = r.things.filter((t) => t.block >= 0)
  const pools = things.reduce((n, t) => n + t.pools, 0)
  console.log(`  counts Stage ${r.stage}: ${things.length} things, ${r.scenes.length} scenes, ${r.movers.length} movers, ${pools} pools`)
  console.log(`           things ${tally(things.map((t) => t.what))}`)
  console.log(`           scenes ${tally(r.scenes.map((s) => s.kind))}`)
  console.log(`           movers ${tally(r.movers.map((m) => m.kind))}`)
}

/** Places printed of each of scenes, movers and things with --where: the first, one a Block. */
const PLACES = 5

/** A box's middle, as `npm run shots` takes a Close point: a sim point, m. */
const closeOn = (b: Box) => `--close=${Math.round((b.x0 + b.x1) / 2)},${Math.round((b.y0 + b.y1) / 2)}`

/** Where the scenes, movers and things of `kind` stand in a City, the first few of each, one a Block. */
function places(r: Report, kind: string) {
  const corners = (b: Box) => [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y1 },
  ]
  // A mover stands where it rests, as the shots show it unless told to --run.
  const found = Object.entries({
    scene: r.scenes
      .filter((s) => s.kind === kind && s.things.length)
      .map((s) => ({ ...s, box: boxOf(s.things.flatMap((i) => corners(r.things[i].box))) })),
    mover: r.movers.filter((m) => m.kind === kind).map((m) => ({ ...m, box: r.things[m.thing].box })),
    thing: r.things.filter((t) => t.block >= 0 && t.what === kind),
  }).filter(([, of]) => of.length)
  if (!found.length) return console.log(`  where  Stage ${r.stage}: no ${kind} (--counts lists what each Stage built)`)
  console.log(`  where  Stage ${r.stage}: ${found.map(([what, of]) => `${of.length} ${what}${of.length > 1 ? 's' : ''}`).join(', ')}`)
  for (const [what, of] of found) {
    const blocks = new Set<number>()
    for (const p of of) {
      if (blocks.has(p.block)) continue
      blocks.add(p.block)
      console.log(`           ${what} ${kind}, Tile ${p.tile}: ${closeOn(p.box)}`)
      if (blocks.size === PLACES) break
    }
  }
}

/** Run the check. Returns the exit code: 1 if any rule failed in a way no known failure accounts for. */
export async function main(o: Options): Promise<number> {
  const zones = zonesOf(o.zones, o.unzoned)
  const seeds = seedsOf(o.seeds)
  const checks = rules(CEILINGS)
  let fresh = 0
  const started = performance.now()
  for (const zone of zones) {
    const t0 = performance.now()
    const reports: Report[] = []
    const failures: Failure[] = []
    for (const seed of seeds) {
      const bySeed: Report[] = []
      for (const stage of o.stages) {
        const r = buildReport({ city: o.city, zone: zone === o.unzoned ? undefined : (zone as never), stage: stage as Stage, seed })
        bySeed.push(r)
        for (const rule of Object.values(checks)) failures.push(...rule(r))
      }
      failures.push(...sameLots(bySeed))
      reports.push(...bySeed)
    }
    const seconds = (performance.now() - t0) / 1000
    const builds = reports.reduce((s, r) => s + r.ms, 0) / reports.length / 1000
    console.log(
      `\n${zone}: stages ${o.stages.join(',')} × ${seeds.length} seed${seeds.length > 1 ? 's' : ''}, ${seconds.toFixed(1)} s (${builds.toFixed(1)} s a City built, ${(seconds / reports.length).toFixed(1)} s checked)`,
    )
    for (const name of [...Object.keys(checks), 'same-lots']) {
      const mine = failures.filter((f) => f.rule === name)
      const known = mine.filter((f) => knownOf(f))
      const news = mine.filter((f) => !knownOf(f))
      fresh += news.length
      if (!mine.length) {
        console.log(`  pass   ${name}`)
        continue
      }
      if (news.length) {
        console.log(`  FAIL   ${name}: ${news.length} new${known.length ? `, ${known.length} known` : ''}`)
        for (const f of o.all ? news : news.slice(0, SHOWN)) console.log(`           ${where(f)}: ${f.what} by ${f.by}`)
        if (!o.all && news.length > SHOWN) console.log(`           and ${news.length - SHOWN} more (--all lists them)`)
      }
      const owners = new Map<string, Failure[]>()
      for (const f of known) {
        const k = knownOf(f)!
        const key = `${k.owner}: ${k.why}`
        owners.set(key, [...(owners.get(key) ?? []), f])
      }
      for (const [owner, fs] of owners) {
        console.log(`  known  ${name}: ${fs.length}, ${owner}`)
        if (o.all) for (const f of fs) console.log(`           ${where(f)}: ${f.what} by ${f.by}`)
      }
    }
    // The building forms and scenes built, and the meshes, beside the ref's.
    const base = o.baseline
      ? seeds.flatMap((seed) =>
          o.stages.map((stage) =>
            o.baseline!.build({ city: o.city, zone: zone === o.unzoned ? undefined : (zone as never), stage: stage as Stage, seed }),
          ),
        )
      : []
    const [ours, theirs] = [mix(reports), mix(base)]
    for (const stage of o.stages) {
      const counts = ours.get(stage) ?? new Map<string, number>()
      const before = theirs.get(stage)
      const names = [...new Set([...counts.keys(), ...(before?.keys() ?? [])])].sort()
      const shown = names.map((n) => {
        const [a, b] = [counts.get(n) ?? 0, before?.get(n) ?? 0]
        return before && before.size && a !== b ? `${n} ${a} (was ${b})` : `${n} ${a}`
      })
      if (shown.length)
        console.log(`  forms  Stage ${stage}: ${shown.join(', ')}${o.baseline && !before?.size ? ' (the ref records none)' : ''}`)
      const r = reports.find((x) => x.stage === stage && x.seed === seeds[0])!
      const b = base.find((x) => x.stage === stage && x.seed === seeds[0])
      const tris = `${(r.triangles / 1e6).toFixed(2)} M triangles, ${r.meshes} meshes`
      if (!b) console.log(`  mesh   Stage ${stage}: ${r.hash}, ${tris}`)
      else if (b.hash === r.hash) console.log(`  mesh   Stage ${stage}: same as ${o.baseline!.label} (${r.hash}), ${tris}`)
      else
        console.log(
          `  mesh   Stage ${stage}: CHANGED from ${o.baseline!.label}, ${tris} against ${(b.triangles / 1e6).toFixed(2)} M and ${b.meshes}`,
        )
    }
    // What the sheets' seed built of each kind, and where.
    for (const r of reports.filter((x) => x.seed === seeds[0])) {
      if (o.counts) counts(r)
      if (o.where) places(r, o.where)
    }
  }
  const total = ((performance.now() - started) / 1000).toFixed(1)
  console.log(fresh ? `\n${fresh} new failure${fresh > 1 ? 's' : ''} (${total} s)` : `\nNo new failures (${total} s)`)
  return fresh ? 1 : 0
}
