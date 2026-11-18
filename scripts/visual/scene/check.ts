// The scene check's runner (#191): builds each Zone's City at each Stage and seed, runs the rules over each report, and
// prints what failed, what is known, the building forms and scenes built, and how the meshes compare with a ref.
import { ZONES } from '../../../src/city/city'
import type { Stage } from '../../../src/game/game'
import { buildReport, type Drop } from './build'
import { CEILINGS, knownOf } from './known'
import type { Failure, Report } from './report'
import { rules, sameLots } from './rules'

/** What `npm run check:scene` was asked: see the usage at the head of `../check.mjs`. */
export interface Options {
  zones: string[]
  unzoned: string
  stages: number[]
  seeds: number
  all: boolean
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
  }
  const total = ((performance.now() - started) / 1000).toFixed(1)
  console.log(fresh ? `\n${fresh} new failure${fresh > 1 ? 's' : ''} (${total} s)` : `\nNo new failures (${total} s)`)
  return fresh ? 1 : 0
}
