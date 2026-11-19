import { middle, type Bounds, type Vec } from '../../sim/geometry'
import { cellAt, cellBounds } from '../../sim/tiles'
import { area } from '../blocks'
import { to } from '../kit'
import { distance, near, overlap, stands, type RowLot, type Run, type ZoneGround } from './ground'

// Where a Block's scenes stand, as medium density and offices share it (#177, #178): which kinds a Block takes, and
// ground for each along its edge, clear of the kerbside and of each other.

/** A Block's scene (#177, #178): its kind, its ground, and the Stage it stands from. */
export interface Scene<K> {
  kind: K
  ground: RowLot
  from: number
}

/**
 * The kinds of a Block's scenes, drawn from `draw` (#177, #178): one of `kinds` from Stage 2, picked from where the
 * Block lies, and a second of another kind at Stage 3 on a Block of `second` m² or more. The second is drawn on any
 * Block, so that the draws after it stay.
 */
export function sceneOrder<K>(g: ZoneGround, draw: () => number, kinds: readonly K[], second: number): K[] {
  const rest = [...kinds]
  const first = rest.splice(Math.floor(draw() * rest.length), 1)[0]
  return [first, rest[Math.floor(draw() * rest.length)]].slice(0, area(g.block.loop) >= second ? 2 : 1)
}

/**
 * A Block's scenes of the kinds `order` has (`sceneOrder`), the first from Stage 2 and the second at Stage 3 (#177,
 * #178), each on the ground `find` gives its kind as the scenes before it (`out`) leave room; a kind that finds none
 * gives way to another of `kinds` the Block has not taken.
 */
export function placeScenes<K, S extends Scene<K>>(
  order: K[],
  kinds: readonly K[],
  find: (kind: K, out: S[]) => Omit<S, 'kind' | 'from'> | null,
): S[] {
  const out: S[] = []
  for (const drawn of order) {
    for (const kind of [drawn, ...kinds.filter((k) => k !== drawn)]) {
      if (out.some((o) => o.kind === kind)) continue
      const found = find(kind, out)
      if (!found) continue
      out.push({ ...found, kind, from: out.length ? 3 : 2 } as S)
      break
    }
  }
  return out
}

/** Whether ground `l` lies clear of the scenes `out` (#177, #178), 18 m or more from each. */
export const clearOfScenes = (out: Scene<unknown>[], l: RowLot) =>
  !out.some((o) => overlap(o.ground, l) || Math.hypot(o.ground.x - l.x, o.ground.y - l.y) < 18)

/** Whether the way `way` keeps `room` m from each utility pole, lamp and street tree, in that order (#177, #178). */
export function clearOfKerbside(g: ZoneGround, way: Vec[], [poles, lamps, trees]: [number, number, number]): boolean {
  const clear = (p: Vec, room: number) => way.every((a, i) => !i || distance(p, way[i - 1], a) >= room)
  return g.poles.every((p) => clear(p, poles)) && g.lamps.every((p) => clear(p, lamps)) && g.kerbsideTrees.every((p) => clear(p, trees))
}

/**
 * How far out from the front of ground `l`, `along` m along it from its middle (as its front runs), the Block's edge
 * lies straight ahead, if a Road lies across the pavement there rather than the seam with the next Tile (#177); null if
 * not, or not within 12 m.
 */
export function kerbAhead(g: ZoneGround, l: RowLot, along: number): number | null {
  const cell = cellBounds(cellAt(middle(g.block)))
  let last = g.field.sample(...to(l.x, l.y, l.ry, along, l.d / 2))
  for (let out = 0.25; out <= 12; out += 0.25) {
    const here = g.field.sample(...to(l.x, l.y, l.ry, along, l.d / 2 + out))
    if (here > 0) {
      last = here
      continue
    }
    const edge = out - 0.25 + (0.25 * Math.max(0, last)) / (Math.max(0, last) - here || 1)
    const [px, py] = to(l.x, l.y, l.ry, along, l.d / 2 + edge + 3)
    return px > cell.x0 + 1 && px < cell.x1 - 1 && py > cell.y0 + 1 && py < cell.y1 - 1 ? edge : null
  }
  return null
}

/** Whether a straight run of the Block's outline faces a Road at its middle, rather than the seam with the next Tile. */
export const facesRoad = (r: Run) => r.onRoad(r.a.x + (r.ux * r.len) / 2, r.a.y + (r.uy * r.len) / 2)

/**
 * Whether lots `a` and `b` lie side by side (#177): within 1.5 m of each other one way, as lots cut apart touch or a
 * street tree has moved an edge back, and sharing more than 1 m of side the other way, so not corner to corner.
 */
export function beside(a: Bounds, b: Bounds): boolean {
  const [gx, gy] = [Math.max(a.x0 - b.x1, b.x0 - a.x1), Math.max(a.y0 - b.y1, b.y0 - a.y1)] // gaps: below 0, an overlap
  return (gx <= 1.5 && gy < -1) || (gy <= 1.5 && gx < -1)
}

/**
 * Ground of each size of `sizes` in turn, m along a straight run of `candidates` (the Block's runs, `runs`) and in
 * from it: its middle at least `ends` m in from its run's ends, on a run facing a Road where one fits and any run where
 * none does, standing on the Block `clear` m in from its edge, clear of the street trees and `lampRoom` m clear of the
 * lamps, and as `ok` has it; null if none is found. Where along which run is drawn from `draw`: a few tries at random
 * (#177), or, if `slide`, every metre along every run from one drawn to start, for a Block whose buildings leave little
 * room (#178).
 */
export function alongEdge(
  g: ZoneGround,
  draw: () => number,
  candidates: Run[],
  sizes: (readonly [number, number])[],
  { lampRoom, clear, ends, slide = false }: { lampRoom: number; clear: number; ends: number; slide?: boolean },
  ok: (l: RowLot) => boolean,
): RowLot | null {
  const shift = slide ? Math.floor(draw() * Math.max(1, candidates.length)) : 0
  const shifted = candidates.map((_, k) => candidates[(k + shift) % candidates.length])
  const ordered = [...shifted.filter(facesRoad), ...shifted.filter((r) => !facesRoad(r))]
  for (const [w, d] of sizes) {
    for (const [run, s] of slide ? slid(ordered, w, ends) : tried(candidates, w, ends, draw)) {
      const [fx, fy] = [run.a.x + run.ux * s, run.a.y + run.uy * s]
      const l = { x: fx - (run.nx * d) / 2, y: fy - (run.ny * d) / 2, w, d, ry: run.ry, onRoad: run.onRoad(fx, fy) }
      if (!stands(g, l.x, l.y, w, d, clear, l.ry) || g.lamps.some((p) => near(l, p.x, p.y, lampRoom))) continue
      if (ok(l)) return l
    }
  }
  return null
}

/** `size`, then halfway down to `least`, then `least`: the sizes `alongEdge` tries, largest first. */
export const smaller = (size: readonly [number, number], least: readonly [number, number]): (readonly [number, number])[] => [
  size,
  [(size[0] + least[0]) / 2, (size[1] + least[1]) / 2],
  least,
]

/**
 * A few spots along `candidates` for ground `w` m long, its middle `ends` m in from its run's ends (#177): runs facing
 * a Road first where one fits, then any, eight tries on each, each run and spot drawn from `draw`.
 */
function* tried(candidates: Run[], w: number, ends: number, draw: () => number): Generator<[Run, number]> {
  const fits = candidates.filter((r) => r.len >= w + 2 * ends)
  const road = fits.filter(facesRoad)
  for (const pool of road.length ? [road, fits] : [fits]) {
    for (let tries = 0; tries < 8 && pool.length; tries++) {
      const run = pool[Math.floor(draw() * pool.length)]
      yield [run, w / 2 + ends + draw() * (run.len - w - 2 * ends)]
    }
  }
}

/** Every metre along each of `runs` in turn for ground `w` m long, its middle `ends` m in from the run's ends (#178). */
function* slid(runs: Run[], w: number, ends: number): Generator<[Run, number]> {
  for (const run of runs) for (let s = w / 2 + ends; s <= run.len - w / 2 - ends; s += 1) yield [run, s]
}
