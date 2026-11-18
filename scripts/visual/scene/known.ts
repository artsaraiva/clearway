// What today's main breaks, each with the issue that owns it, so that the scene check passes on main and a new failure
// stands out (#191); and each Zone's ceiling of triangles and meshes. A Zone's ticket deletes its rows as it fixes them.
import type { Failure } from './report'

/** A known failure: a rule, on a Zone (all if none), whose `what` matches (all if none), and the issue that owns it. */
export interface Known {
  rule: string
  zone?: string
  what?: RegExp
  owner: string
  why: string
}

export const KNOWN: Known[] = []

/** The known failure that accounts for `f`, if any. */
export const knownOf = (f: Failure) =>
  KNOWN.find((k) => k.rule === f.rule && (!k.zone || k.zone === f.zone) && (!k.what || k.what.test(f.what)))

/**
 * Each Zone's ceiling for its static scenery on the 26-Tile City, at its heaviest Stage: triangles (shadows' decals
 * included, the shadow pass not) and meshes, one draw call each before the shadow pass. About a tenth over main's.
 */
export const CEILINGS: Record<string, { triangles: number; meshes: number }> = {}
