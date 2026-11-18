// What today's main breaks, each with the issue that owns it, so that the scene check passes on main and a new failure
// stands out (#191); and each Zone's ceiling of triangles and meshes. A Zone's ticket deletes its rows as it fixes them.
import type { Failure } from './report'

/** A known failure: a rule, on a Zone (all if none), whose `what` matches (all if none), and the issue that owns it. */
export interface Known {
  rule: string
  zone?: string
  what?: RegExp
  /** The most its amount (its `by`, in m) may be. Any if none. */
  most?: number
  owner: string
  why: string
}

/** The Zones not yet built to the level of finish (#173), with the ticket that builds each. */
const UNFINISHED: Record<string, string> = {
  'low-density': '#179',
  parks: '#180',
  industrial: '#181',
  green: '#182',
  'high-density': '#183',
  farms: '#184',
  unzoned: '#185',
}
/** The rules each unfinished Zone breaks today, which its ticket takes on. */
const BROKEN: Record<string, string[]> = {
  'low-density': ['keeps-clear', 'neighbours-differ', 'scenes', 'empty-pavement'],
  parks: ['keeps-clear', 'scenes', 'moves', 'empty-pavement'],
  industrial: ['scenes', 'empty-pavement'],
  green: ['keeps-clear', 'scenes', 'moves', 'empty-pavement'],
  'high-density': ['keeps-clear', 'neighbours-differ', 'scenes', 'empty-pavement'],
  farms: ['keeps-clear', 'paths-clear', 'scenes', 'empty-pavement'],
  unzoned: ['empty-pavement'],
}
/** Found by the scene check on the Zones already built to the level of finish; #193 owns them. */
const FOUND = '#193'

export const KNOWN: Known[] = [
  ...Object.entries(BROKEN).flatMap(([zone, rules]) =>
    rules.map((rule) => ({ rule, zone, owner: UNFINISHED[zone], why: `${zone} is not yet built to the level of finish` })),
  ),
  // Every Zone: the kerbside (#176) leaves up to 16 m bare, as where a Block's corner faces a roundabout's ring.
  { rule: 'empty-pavement', most: 16, owner: FOUND, why: "the kerbside leaves 13 to 16 m bare, as at a Block's corner on a roundabout" },
  // High density's playgrounds (#155), until #183 rebuilds them.
  { rule: 'keeps-clear', zone: 'high-density', what: /rider|slide|swings|sandbox/, owner: '#183', why: "a playground's pieces touch" },
]

/** The known failure that accounts for `f`, if any. */
export const knownOf = (f: Failure) =>
  KNOWN.find(
    (k) =>
      k.rule === f.rule &&
      (!k.zone || k.zone === f.zone) &&
      (!k.what || k.what.test(f.what)) &&
      (k.most === undefined || parseFloat(f.by) <= k.most),
  )

/**
 * Each Zone's ceiling for its static scenery on the 26-Tile City, at its heaviest Stage and seed: triangles (contact
 * shadows included, the shadow pass not), about a tenth over main's on 2026-11-18, and meshes, one draw call each before
 * the shadow pass, a few over the most of main's over seeds: a material new to a Zone's builds brings a mesh to every
 * Tile (26 more), as #152 and #154 found, and should be a decision, not an accident.
 */
export const CEILINGS: Record<string, { triangles: number; meshes: number }> = {
  'low-density': { triangles: 2.9e6, meshes: 160 },
  'medium-density': { triangles: 2.3e6, meshes: 160 },
  'high-density': { triangles: 1.95e6, meshes: 160 },
  offices: { triangles: 2.25e6, meshes: 160 },
  shops: { triangles: 2.6e6, meshes: 160 },
  industrial: { triangles: 1.05e6, meshes: 155 },
  parks: { triangles: 4e6, meshes: 130 },
  green: { triangles: 2.45e6, meshes: 108 },
  farms: { triangles: 1.35e6, meshes: 150 },
  unzoned: { triangles: 1.4e6, meshes: 108 },
}
