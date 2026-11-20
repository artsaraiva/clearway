// What today's main breaks, each with the issue that owns it, so that the scene check passes on main and a new failure
// stands out (#191); and each Zone's ceiling of triangles and meshes. A Zone's ticket deletes its rows as it fixes them.
import type { Failure } from './report'

/** A known failure: a rule, on a Zone (all if none), whose `what` matches (all if none), and the issue that owns it. */
interface Known {
  rule: string
  zone?: string
  what?: RegExp
  /** The most its amount (its `by`, in m, or m² for a roof) may be. Any if none. */
  most?: number
  owner: string
  why: string
}

/** Left by #193: the bare pavement runs it did not break; #195 owns them. */
const FOUND = '#195'

const KNOWN: Known[] = [
  // The kerbside (#176) still leaves 12 to 16 m bare in a few places on the finished Zones: 18 runs over five seeds,
  // between a truck court's way in and a corner's rail, or by a roundabout's flare (199 before #193's kerbside work).
  {
    rule: 'empty-pavement',
    most: 16,
    owner: FOUND,
    why: "the kerbside leaves 12 to 16 m bare by a truck court's way in, a corner's rail or a roundabout's flare",
  },
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
  'low-density': { triangles: 2.2e6, meshes: 160 }, // #179: about a tenth over the 1.97 M it builds at Stage 3
  'medium-density': { triangles: 2.3e6, meshes: 160 },
  'high-density': { triangles: 2.3e6, meshes: 160 }, // #183: about a tenth over the 2.08 M it builds at Stage 3, a tree in a planter by each tower
  offices: { triangles: 2.25e6, meshes: 160 },
  shops: { triangles: 2.6e6, meshes: 160 },
  industrial: { triangles: 1.3e6, meshes: 155 }, // #181: about a tenth over the 1.21 M it builds at Stage 3 on seed 2, the heaviest
  parks: { triangles: 2.6e6, meshes: 160 }, // #180: 2.39 M at Stage 3 with coarse trees; its lanterns' bulbs and Block-zoom benches a mesh each
  green: { triangles: 2.2e6, meshes: 125 }, // #182: 1.90 M at Stage 3 with coarse trees; its lanterns' bulbs, a stream's water and Block-zoom props a mesh each
  farms: { triangles: 1.55e6, meshes: 160 }, // #184: about a tenth over the 1.39 M it builds at Stage 3 on seed 2, the heaviest; its lit greenhouses' bulbs and Block-zoom props a mesh each
  unzoned: { triangles: 1.85e6, meshes: 108 }, // #185: about a tenth over the 1.7 M it builds on seed 2, the heaviest; most of what it adds is tufts of tall grass, Block-zoom props
}
