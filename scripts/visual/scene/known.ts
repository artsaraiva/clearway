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
/** Found by the scene check on the Zones already built to the level of finish, and not yet filed. */
const FOUND = 'found by #191, not filed'

export const KNOWN: Known[] = [
  ...Object.entries(BROKEN).flatMap(([zone, rules]) =>
    rules.map((rule) => ({ rule, zone, owner: UNFINISHED[zone], why: `${zone} is not yet built to the level of finish` })),
  ),
  // Every Zone: the kerbside (#176) leaves up to 16 m bare, as where a Block's corner faces a roundabout's ring.
  { rule: 'empty-pavement', most: 16, owner: FOUND, why: "the kerbside leaves 13 to 16 m bare, as at a Block's corner on a roundabout" },
  // Medium density (#178).
  {
    rule: 'keeps-clear',
    zone: 'medium-density',
    what: /^(townhouse|wallStairs|gardens|binStore|bikeRack|pocketPark|bathhouse) and (townhouse|wallStairs|gardens|bikeRack|pocketPark)/,
    owner: FOUND,
    why: 'terraced houses, and their stairs, gardens, racks and bin stores, run into the next house',
  },
  {
    rule: 'keeps-clear',
    zone: 'medium-density',
    what: /^(plantings|hedge|apartment|vendingMachine|outsideStairs|courtyards|bathhouse) and (plantings|hedge|apartment|vendingMachine|outsideStairs|courtyards|tree)/,
    owner: FOUND,
    why: "an apartment block's wall hedges overlap its walls, each other, its court's hedge and its stairs",
  },
  {
    rule: 'keeps-clear',
    zone: 'medium-density',
    what: /^(bedTree|tree|vendingMachine|binStore|pocketPark|bikeRack|outsideStairs) on a door step/,
    owner: FOUND,
    why: "trees, vending machines, bin stores, racks, stairs and a pocket park stand before apartments' doors",
  },
  {
    rule: 'keeps-clear',
    zone: 'medium-density',
    what: /^(bathhouse|outsideStairs) on a parking bay/,
    owner: FOUND,
    why: 'a bathhouse or stairs graze a parking bay',
  },
  {
    rule: 'neighbours-differ',
    zone: 'medium-density',
    what: /"terrace /,
    owner: FOUND,
    why: 'terraced houses side by side across a bend or a corner of the row',
  },
  {
    rule: 'paths-clear',
    zone: 'medium-density',
    what: /^scooter's path runs through townhouse/,
    owner: FOUND,
    why: "the delivery scooter's path grazes a terraced house",
  },
  { rule: 'scenes', zone: 'medium-density', what: /^no scene/, owner: FOUND, why: 'some Blocks find no ground for a scene' },
  // Offices (#177).
  {
    rule: 'keeps-clear',
    zone: 'offices',
    what: /sunkenCourt|^(officeTower|planter) on a taxi bay|^parked (on a door step|and officeTower)/,
    owner: FOUND,
    why: "a sunken court's rim under a kerbside planter or over a taxi bay; a tower or a planter on a taxi bay; a taxi before a door",
  },
  { rule: 'inside-block', zone: 'offices', what: /^officeTower/, owner: FOUND, why: "a tower stands over its Block's edge on seed 1" },
  { rule: 'scenes', zone: 'offices', what: /^no scene/, owner: FOUND, why: 'a small Block that finds no ground for a scene' },
  // Shops (#175).
  {
    rule: 'keeps-clear',
    zone: 'shops',
    what: /^(shop|keiTruck|planter) and (shop|keiTruck|planter)/,
    owner: FOUND,
    why: 'shops at a row corner, and kei trucks in the back yards, run into shops',
  },
  {
    rule: 'keeps-clear',
    zone: 'shops',
    what: /pots|menuBoard|plantStand|produce|florist|greengrocer|capsules/,
    owner: FOUND,
    why: "door pots, menu boards and stands crowd a scene's front and the door",
  },
  { rule: 'neighbours-differ', zone: 'shops', owner: FOUND, why: 'shops kept apart only from the lot cut before them' },
  { rule: 'paths-clear', zone: 'shops', what: /^shopper/, owner: FOUND, why: "shoppers walk through a florist's or a greengrocer's stand" },
  { rule: 'scenes', zone: 'shops', owner: FOUND, why: 'shops Blocks without a scene, or with a stand smaller than a car' },
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
  farms: { triangles: 1.2e6, meshes: 150 },
  unzoned: { triangles: 1.4e6, meshes: 108 },
}
