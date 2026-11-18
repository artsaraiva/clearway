import * as THREE from 'three'
import type { Cell } from '../city/city'
import type { Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { CELL, cellBounds, junctionId } from '../sim/tiles'
import { KERB, type Block } from './blocks'
import type { Field } from './field'
import { avenue, lampSpots, STREET_TREES } from './fill'
import type { Kit } from './kit'
import type { Scenery } from './scenery'

// Utility poles with two wires along one side of every Road (#148), from the prototype of #146. m: how far apart the
// poles stand (six to a cell, so that the spacing runs on unbroken across a seam), how far in from the kerb, how tall,
// the crossbar's width and how far its middle stands toward the road from the pole (so that both wires clear what the
// Zones build), how high the transformer drum hangs, the radii of pole and wire, and how far a wire sags for each metre
// of its span.
const POLES = { spacing: CELL / 6, inset: 0.45, height: 9, bar: 1.8, toRoad: 0.35, drum: 5.6, radius: 0.15, wire: 0.07, sag: 0.06 }
const [POLE, DRUM, WIRE] = ['#6f7986', '#c4ccd4', '#2a3142']
// m: the moves along its Road a pole tries, in turn, to keep clear of a lamp, the room it keeps from one, how far a
// T-junction's stem line reaches to join the line it meets through a corner pole, and how far out from a Junction's
// centre a corner pole is looked for.
const ROOM = { shifts: [1.5, -1.5, 3, -3], lamp: 1.8, branch: 20, corner: 40 }
const ROD = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)
const BAR = new THREE.BoxGeometry(0.2, 0.2, POLES.bar)
/** Where a wire leaves its pole, the height of the crossbar's ends. */
const TOP = KERB + POLES.height - 0.7

/** A utility pole: where it stands, the way to the road beside it (a unit vector), and whether it carries a transformer drum. */
export interface Post extends Vec {
  toRoad: Vec
  drum: boolean
}

/** The pole at the end of one of a Tile's lines nearest its cell's edge, where the line carries on across the seam to the next Tile's. */
export interface LineEnd {
  road: string
  post: Post
}

/**
 * Two wires from the crossbar of pole `a` to that of pole `b`, sagging more the longer the span, as one brick that grows
 * out from its middle. Each pole's ends are paired in order across the span, so that the wires never cross.
 */
export function stringWires(kit: Kit, a: Post, b: Post) {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const span = Math.hypot(dx, dy)
  const sag = POLES.sag * span
  /** How far left of the span `q` lies. */
  const left = (q: Vec) => dx * (q.y - a.y) - dy * (q.x - a.x)
  const ends = (p: Post) =>
    [POLES.toRoad + POLES.bar / 2, POLES.toRoad - POLES.bar / 2]
      .map((o) => ({ x: p.x + p.toRoad.x * o, y: p.y + p.toRoad.y * o }))
      .sort((u, v) => left(u) - left(v))
  const [from, to] = [ends(a), ends(b)]
  for (let i = 0; i < 2; i++) {
    const [p, q] = [from[i], to[i]]
    // A quadratic curve's middle lies halfway to its control point, so the control point is twice the sag down.
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(p.x, TOP, -p.y),
      new THREE.Vector3((p.x + q.x) / 2, TOP - 2 * sag, -(p.y + q.y) / 2),
      new THREE.Vector3(q.x, TOP, -q.y),
    )
    kit.push(new THREE.TubeGeometry(curve, 8, POLES.wire, 4).toNonIndexed(), WIRE)
  }
  kit.brick('wire', (a.x + b.x) / 2, (a.y + b.y) / 2, TOP - sag)
}

/**
 * A pole, its crossbar across the road, and its drum if it carries one, as one brick that grows in like a lamp. With a
 * street light (#175), an arm reaches out over the road with a lamp's head that lights at dusk and leaves a pool on the
 * road under it.
 */
function stand(kit: Kit, p: Post, light = false) {
  const { x: tx, y: ty } = p.toRoad
  kit.add(ROD, POLE, p.x, p.y, KERB, 0, POLES.radius, POLES.height, POLES.radius)
  // The bar's length runs along Three's z, south: turned `ry`, it runs along (sin ry, -cos ry) on the map.
  kit.add(BAR, POLE, p.x + tx * POLES.toRoad, p.y + ty * POLES.toRoad, KERB + POLES.height - 0.9, Math.atan2(tx, -ty))
  // The drum hangs beside the pole along the road, clear of the Block's buildings.
  if (p.drum) kit.add(ROD, DRUM, p.x - ty * 0.5, p.y + tx * 0.5, KERB + POLES.drum, 0, 0.36, 1.2, 0.36)
  if (light) {
    const { reach, at } = STREET_LIGHT
    const ry = Math.atan2(tx, -ty)
    kit.add(kit.cuboid(0.12, 0.12, reach), POLE, p.x + (tx * reach) / 2, p.y + (ty * reach) / 2, KERB + at, ry)
    kit.add(kit.cuboid(0.36, 0.16, 0.75), kit.bulb, p.x + tx * (reach - 0.2), p.y + ty * (reach - 0.2), KERB + at - 0.16, ry)
    kit.pool('pole', p.x + tx * (reach + 0.4), p.y + ty * (reach + 0.4), 0, STREET_LIGHT.pool, STREET_LIGHT.pool)
  }
  kit.brick('pole', p.x, p.y, KERB)
}
// A street light on every third pole (#175, of every Tile since #176): how far its arm reaches over the road, how high
// it is (m above the kerb), and how wide its pool.
const STREET_LIGHT = { reach: 2.1, at: 6.4, pool: 6.5, every: 3 }

/**
 * The utility poles of the Tile on `cell`, and the wires strung between them, added to `kit` a brick each. Returns the
 * poles at the ends of its lines, for the wires across its seams (`stringWires`, once the next Tile is there), and every
 * pole it stood, for the street's furniture to keep off (#176).
 *
 * Each Road has a line of poles on one side: the south side of a Road running east–west and the east side of one
 * running north–south, so that a line meets the next Tile's on the same side. On a Curve both lines take the outside
 * of the bend and turn its corner on a corner pole; where that puts a line on the other side from the next Tile's, the
 * wire across the seam crosses the Road. A line carries on across its Junction where its Road runs straight on, though
 * not across a Ring, and the stem of a T-junction joins the line it meets.
 *
 * The poles stand where the cell puts them, half a spacing in from each edge and a spacing apart, whatever the Tiles
 * around it, so that a seam's wire always finds them; on an avenue, between its street trees. They stand on the
 * pavement just in from the kerb, which what the Zones build keeps clear of, and move along the Road to keep clear of a
 * lamp, or are left out. Where the kerbside is dressed (`lit`, #175; every Tile since #176), every third carries a
 * street light.
 */
export function standPoles(
  kit: Kit,
  cell: Cell,
  net: Network,
  spec: NetworkSpec,
  field: Field,
  blocks: Block[],
  scenery: Scenery,
  lit = false,
): { ends: LineEnd[]; posts: Post[] } {
  const junction = net.junctions.find((j) => j.id === junctionId(cell))
  if (!junction) return { ends: [], posts: [] }
  const box = cellBounds(cell)
  const lamps = blocks.flatMap((b) => lampSpots(b, field))
  /** Whether a pole can stand at `p`: on the cell's pavement, with room for its girth, and clear of the lamps. */
  const free = (p: Vec) =>
    p.x > box.x0 &&
    p.x < box.x1 &&
    p.y > box.y0 &&
    p.y < box.y1 &&
    field.sample(p.x, p.y) >= POLES.radius + 0.1 &&
    !lamps.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < ROOM.lamp)

  // Each Arm by the way it goes: 0 east, 1 north, 2 west, 3 south.
  const arms = new Map(junction.arms.map((arm) => [Math.round(arm.angle / (Math.PI / 2)) % 4, arm.road]))
  const ring = junction.type === 'roundabout'
  /** How far out from the centre each Arm meets the Ring, within which no pole stands: the island is a Block too. */
  const mouths = new Map(
    junction.arms.map((arm) => [
      Math.round(arm.angle / (Math.PI / 2)) % 4,
      ring ? Math.hypot(arm.center.x - junction.at.x, arm.center.y - junction.at.y) : 0,
    ]),
  )
  /**
   * A corner pole where the kerb crosses the diagonal from the Junction's centre toward `(ox, oy)`, facing back to it:
   * on the pavement, but no further in than a pole on a straight kerb, where it would stand among the Block's buildings.
   */
  const corner = (ox: number, oy: number): Post | null => {
    const toRoad = { x: -ox * Math.SQRT1_2, y: -oy * Math.SQRT1_2 }
    for (let d = 0; d < ROOM.corner; d += 0.25) {
      const p = { x: junction.at.x - toRoad.x * d, y: junction.at.y - toRoad.y * d, toRoad, drum: false }
      if (field.sample(p.x, p.y) >= POLES.inset) return free(p) ? p : null
    }
    return null
  }
  const curve = !ring && arms.size === 2 && arms.has(0) !== arms.has(2)
  // The side of its Road each line takes: an east–west Road's to the south (-1) or the north, a north–south Road's to
  // the east (1) or the west; on a Curve, the side away from its other Arm.
  const sides = [curve && arms.has(3) ? 1 : -1, curve && arms.has(0) ? -1 : 1]

  /** Each Arm's line of poles, from the Junction outward. */
  const lines = new Map<number, Post[]>()
  for (const [dir, road] of arms) {
    const eastWest = dir % 2 === 0
    const side = sides[dir % 2]
    // A Road runs west to east or south to north (forward), and its lane 0 is its rightmost, beside the kerb: the south
    // kerb's lane is an east–west Road's forward lane 0, and the east kerb's a north–south Road's.
    const forward = eastWest ? side < 0 : side > 0
    const lane = net.lanes.find((l) => 'road' in l.owner && l.owner.road === road && l.owner.forward === forward && l.index === 0)
    if (!lane) continue
    const out = (spec.roads[road]?.laneWidth ?? spec.roadDefaults.laneWidth) / 2 + POLES.inset
    const [a, b] = [lane.line.pts[0], lane.line.pts[lane.line.pts.length - 1]]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length]
    const toRoad = { x: -uy, y: ux } // to the left of the lane, from the kerb back to the road
    /** The pole `s` m along the lane, out on its kerb. */
    const at = (s: number, drum: boolean): Post => ({ x: a.x + ux * s - toRoad.x * out, y: a.y + uy * s - toRoad.y * out, toRoad, drum })
    // Where along the lane the Arm's poles stand.
    const spots: Post[] = []
    if (avenue(scenery, lane)) {
      // The street trees stand half a spacing from the lane's start and a spacing apart: the poles go between them.
      for (let k = 1; k * STREET_TREES.spacing < lane.length; k++) spots.push(at(k * STREET_TREES.spacing, k % 2 === 0))
    } else {
      // Half a spacing in from the cell's edges and a spacing apart, every other pole with a drum, counted from the
      // cell's south-west corner so that the drums alternate across a seam too.
      const [low, start, unit] = eastWest ? [box.x0, a.x, ux] : [box.y0, a.y, uy]
      for (let k = 0; k < 6; k++) spots.push(at((low + (k + 0.5) * POLES.spacing - start) / unit, k % 2 === 0))
    }
    const centre = eastWest ? junction.at.x : junction.at.y
    const reach = (p: Vec) => (dir < 2 ? 1 : -1) * ((eastWest ? p.x : p.y) - centre) // out from the Junction along this Arm
    const line: Post[] = []
    for (const spot of spots) {
      if (reach(spot) <= mouths.get(dir)!) continue
      const moved = [0, ...ROOM.shifts].map((d) => ({ ...spot, x: spot.x + ux * d, y: spot.y + uy * d })).find(free)
      if (moved) line.push(moved)
    }
    lines.set(
      dir,
      line.sort((p, q) => reach(p) - reach(q)),
    )
  }

  const spans: [Post, Post][] = []
  for (const line of lines.values()) for (let i = 1; i < line.length; i++) spans.push([line[i - 1], line[i]])
  // Across the Junction, where the Road runs straight on.
  if (!ring) {
    for (const [d, e] of [
      [0, 2],
      [1, 3],
    ]) {
      const [p, q] = [lines.get(d)?.[0], lines.get(e)?.[0]]
      if (p && q) spans.push([p, q])
    }
  }
  const corners: Post[] = []
  /** Turn the end of line `from` on a corner pole toward `(ox, oy)` and on to `to`, or the nearest pole of `to`. */
  const turn = (from: Post, ox: number, oy: number, to: Post[], most = Infinity) => {
    const post = corner(ox, oy)
    if (!post || Math.hypot(post.x - from.x, post.y - from.y) > most) return
    const near = (p: Post) => Math.hypot(p.x - post.x, p.y - post.y)
    const joins = [...to].sort((p, q) => near(p) - near(q))[0]
    if (!joins) return
    corners.push(post)
    spans.push([from, post], [post, joins])
  }
  /** Which way from the centre the line `line` lies, across its Road. */
  const off = (line: Post[], eastWest: boolean) => Math.sign(eastWest ? line[0].y - junction.at.y : line[0].x - junction.at.x)
  if (curve) {
    // Round the outside of the bend.
    const [ew, ns] = [lines.get(arms.has(0) ? 0 : 2), lines.get(arms.has(1) ? 1 : 3)]
    if (ew?.length && ns?.length) turn(ew[0], off(ns, false), off(ew, true), [ns[0]])
  } else if (!ring) {
    // A stem with no Road straight on turns the corner of the Junction it meets onto the line across it, if near.
    for (const [d, line] of lines) {
      if (lines.has((d + 2) % 4) || !line.length) continue
      const across = [...lines].filter(([e, l]) => e % 2 !== d % 2 && l.length)
      if (!across.length) continue
      const [stem, through] = [off(line, d % 2 === 0), off(across[0][1], d % 2 !== 0)]
      const [ox, oy] = d % 2 === 0 ? [through, stem] : [stem, through]
      turn(
        line[0],
        ox,
        oy,
        across.flatMap(([, l]) => l),
        ROOM.branch,
      )
    }
  }

  for (const line of lines.values()) line.forEach((post, i) => stand(kit, post, lit && i % STREET_LIGHT.every === 1))
  for (const post of corners) stand(kit, post)
  for (const [a, b] of spans) stringWires(kit, a, b)
  return {
    ends: [...lines].flatMap(([dir, line]) => (line.length ? [{ road: arms.get(dir)!, post: line[line.length - 1] }] : [])),
    posts: [...[...lines.values()].flat(), ...corners],
  }
}
