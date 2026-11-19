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

/** The Zones not yet built to the Finish (#173), with the ticket that builds each. */
const UNFINISHED: Record<string, string> = {
  industrial: '#181',
  green: '#182',
  'high-density': '#183',
  farms: '#184',
  unzoned: '#185',
}
/** The rules each unfinished Zone breaks today, which its ticket takes on. */
const BROKEN: Record<string, string[]> = {
  industrial: ['blank-wall', 'blank-roof', 'scenes', 'empty-pavement'],
  green: ['keeps-clear', 'scenes', 'moves', 'empty-pavement'],
  'high-density': ['keeps-clear', 'neighbours-differ', 'blank-wall', 'blank-roof', 'scenes', 'empty-pavement'],
  farms: ['keeps-clear', 'paths-clear', 'blank-wall', 'blank-roof', 'scenes', 'empty-pavement'],
  unzoned: ['empty-pavement'],
}
/** Left by #193: the bare pavement runs it did not break; #195 owns them. */
const FOUND = '#195'

/** Left by #198: the blank roofs rule 2 found on finished Zones; #216 owns them. */
const BLANK_ROOFS = '#216'

const KNOWN: Known[] = [
  // The seed's coral tower (`src/render/landmarks.ts`), on whichever Zone's Tile it stands, until #189 finishes it:
  // drums in flat coral and cream, and blank decks.
  { rule: 'blank-wall', what: /^tower /, owner: '#189', why: 'the coral tower is drums of flat colour' },
  { rule: 'blank-roof', what: /^tower /, owner: '#189', why: "the coral tower's decks are blank" },
  ...Object.entries(BROKEN).flatMap(([zone, rules]) =>
    rules.map((rule) => ({ rule, zone, owner: UNFINISHED[zone], why: `${zone} is not yet built to the Finish` })),
  ),
  // The kerbside (#176) still leaves 12 to 16 m bare in a few places on the finished Zones: 18 runs over five seeds,
  // between a truck court's way in and a corner's rail, or by a roundabout's flare (199 before #193's kerbside work).
  {
    rule: 'empty-pavement',
    most: 16,
    owner: FOUND,
    why: "the kerbside leaves 12 to 16 m bare by a truck court's way in, a corner's rail or a roundabout's flare",
  },
  // Rule 2 on the finished Zones (#198): a round office tower's band, and the crown or the top tier round a dome or a
  // pyramid, blank where those leave them; a penthouse's deck inside its railing, under 70 m² in sight; an apartment's
  // stair-house at Stage 3, blank on top.
  {
    rule: 'blank-roof',
    zone: 'offices',
    what: /^officeTower has a blank roof round what stands on it/,
    owner: BLANK_ROOFS,
    why: "an office tower's band, crown or top tier is blank round its round body, dome or pyramid",
  },
  {
    rule: 'blank-roof',
    zone: 'offices',
    what: /^officeTower has a blank roof toward/,
    most: 70,
    owner: BLANK_ROOFS,
    why: "a penthouse's deck is blank inside its railing",
  },
  {
    rule: 'blank-roof',
    zone: 'medium-density',
    what: /^apartment /,
    most: 40,
    owner: BLANK_ROOFS,
    why: "an apartment's stair-house is blank on top",
  },
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
  'low-density': { triangles: 2.2e6, meshes: 160 }, // #179: about a tenth over the 1.97 M it builds at Stage 3
  'medium-density': { triangles: 2.3e6, meshes: 160 },
  'high-density': { triangles: 1.95e6, meshes: 160 },
  offices: { triangles: 2.25e6, meshes: 160 },
  shops: { triangles: 2.6e6, meshes: 160 },
  industrial: { triangles: 1.05e6, meshes: 155 },
  parks: { triangles: 2.6e6, meshes: 160 }, // #180: 2.39 M at Stage 3 with coarse trees; its lanterns' bulbs and Block-zoom benches a mesh each
  green: { triangles: 2.45e6, meshes: 108 },
  farms: { triangles: 1.35e6, meshes: 150 },
  unzoned: { triangles: 1.4e6, meshes: 108 },
}
