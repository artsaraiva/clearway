import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pointAt, type Vec } from '../sim/geometry'
import type { Arm, Lane, Network } from '../sim/network'
import type { NetworkSpec } from '../sim/spec'
import { dashes, mid, ribbons } from './ribbons'

const PAINT_Y = 0.04
const WHITE = 0xffffff
const [CENTRE, DIVIDER] = [0.56, 0.3] // line widths, m
/** Zebra stripes, m: `setback` is from the stop line to the stripes, and `length` how far they run along the Road. */
export const ZEBRA = { stripe: 1.1, pitch: 2.2, length: 4, setback: 1 }
// Give-way triangles: `pitch` is the target spacing across a lane, `base` a triangle's share of its slot, and `setback`
// the gap from the stop line to the row.
const GIVE_WAY = { pitch: 1.75, base: 0.72, length: 2.4, setback: 0.5 }
/** A stop line across an Approach, m: how thick, and how far behind where the lanes end. */
const STOP_LINE = { thick: 0.6, setback: 0.5 }
/** What is painted at an Arm's line: give-way triangles, a stop line for a stop sign or a Signal, or nothing. */
type Rule = 'yield' | 'stop' | ''
const paint = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide })

/**
 * A row of give-way triangles across each Approach lane of every yielding Arm, pointing at the driver who must give way,
 * and a stop line across each Approach lane of an Arm with a stop sign or a Signal.
 */
function giveWayTriangles(arms: Arm[], rules: Rule[], laneWidth: (road: string) => number): THREE.BufferGeometry {
  const pos: number[] = []
  for (const [i, arm] of arms.entries()) {
    if (!rules[i]) continue
    const w = laneWidth(arm.road)
    if (rules[i] === 'stop') {
      for (const lane of arm.approach) {
        const end = pointAt(lane.line, lane.length)
        const [fx, fy, lx, ly] = [Math.cos(end.heading), Math.sin(end.heading), -Math.sin(end.heading), Math.cos(end.heading)]
        const corner = (across: number, back: number) => [
          end.x + lx * across - fx * back,
          PAINT_Y + 0.01,
          -(end.y + ly * across - fy * back),
        ]
        const [near, far] = [STOP_LINE.setback, STOP_LINE.setback + STOP_LINE.thick]
        const [a, b, c, d] = [corner(w / 2, near), corner(-w / 2, near), corner(-w / 2, far), corner(w / 2, far)]
        pos.push(...a, ...b, ...c, ...a, ...c, ...d)
      }
      continue
    }
    const n = Math.max(1, Math.round(w / GIVE_WAY.pitch))
    const half = ((w / n) * GIVE_WAY.base) / 2
    for (const lane of arm.approach) {
      const end = pointAt(lane.line, lane.length)
      const [fx, fy, lx, ly] = [Math.cos(end.heading), Math.sin(end.heading), -Math.sin(end.heading), Math.cos(end.heading)]
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * (w / n) // metres left of the lane's centre
        const [x, y] = [end.x + lx * o - fx * GIVE_WAY.setback, end.y + ly * o - fy * GIVE_WAY.setback]
        for (const [px, py] of [
          [x + lx * half, y + ly * half],
          [x - lx * half, y - ly * half],
          [x - fx * GIVE_WAY.length, y - fy * GIVE_WAY.length],
        ])
          pos.push(px, PAINT_Y + 0.01, -py)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/**
 * Road paint on the plate: a dashed centre line per Road, dashed dividers between the lanes of one direction (and of a
 * Ring), zebra stripes at every Junction mouth, and give-way triangles on every yielding Arm. The Approaches of a
 * roundabout always yield, since its Ring is always main.
 */
export function createRoads(net: Network, spec: NetworkSpec) {
  const laneWidth = (road: string) => spec.roads[road].laneWidth ?? spec.roadDefaults.laneWidth
  const arms = net.junctions.flatMap((j) => j.arms)
  const [centres, dividers, stripes]: Vec[][][] = [[], [], []]
  const between = (lanes: Lane[], gap: number) => {
    for (let i = 1; i < lanes.length; i++) dividers.push(...dashes(mid(lanes[i - 1].line.pts, lanes[i].line.pts), 3, gap))
  }

  // Once per Road, from its own lanes: a Road between two Junctions is an Arm of both.
  const roads = new Map<string, { forward: Lane[]; backward: Lane[] }>()
  for (const lane of net.lanes) {
    if (!('road' in lane.owner)) continue
    const road = roads.get(lane.owner.road) ?? roads.set(lane.owner.road, { forward: [], backward: [] }).get(lane.owner.road)!
    road[lane.owner.forward ? 'forward' : 'backward'].push(lane)
  }
  for (const { forward, backward } of roads.values()) {
    between(forward, 6)
    between(backward, 6)
    // The highest index is the innermost lane of its direction.
    const [a, b] = [forward.at(-1), backward.at(-1)]
    if (a && b) centres.push(...dashes(mid(a.line.pts, [...b.line.pts].reverse()), 4.4, 4.4))
  }

  for (const arm of arms) {
    between(arm.ringOut, 5)
    // Zebra stripes across the whole Road, just past the stop line.
    const first = arm.approach[0]
    const end = pointAt(first.line, first.length)
    const [fx, fy, lx, ly] = [Math.cos(end.heading), Math.sin(end.heading), -Math.sin(end.heading), Math.cos(end.heading)]
    const w = laneWidth(arm.road)
    const across = (arm.approach.length + arm.exit.length) * w
    const n = Math.floor((across - ZEBRA.stripe) / ZEBRA.pitch) + 1
    for (let k = 0; k < n; k++) {
      // Metres left of the first Approach lane's centre, which sits half a lane in from the Road's right edge.
      const o = (across - (n - 1) * ZEBRA.pitch) / 2 + k * ZEBRA.pitch - w / 2
      const [x, y] = [end.x + lx * o + fx * ZEBRA.setback, end.y + ly * o + fy * ZEBRA.setback]
      stripes.push([
        { x, y },
        { x: x + fx * ZEBRA.length, y: y + fy * ZEBRA.length },
      ])
    }
  }

  const group = new THREE.Group()
  const lines = mergeGeometries([
    ribbons(centres, CENTRE, PAINT_Y),
    ribbons(dividers, DIVIDER, PAINT_Y),
    ribbons(stripes, ZEBRA.stripe, PAINT_Y),
  ])
  group.add(new THREE.Mesh(lines, paint(WHITE)))

  const giveWay = new THREE.Mesh(new THREE.BufferGeometry(), paint(WHITE))
  group.add(giveWay)
  for (const mesh of group.children) mesh.receiveShadow = true
  let painted = ''
  /** The network the give-way paint follows, and each Arm's Arm there: its own where that network has none. */
  let followed = net
  let ruling = arms

  return {
    group,
    /**
     * Re-read each Arm's Priority from `live`, the network the traffic drives, and repaint when a Change has moved one.
     * The paint may stand on a network grown by Tiles still in their Assembly, whose Arms `live` lacks: they keep their own.
     */
    update(live: Network = net) {
      if (live !== followed) {
        followed = live
        const key = (arm: Arm) => `${arm.junction} ${arm.road}`
        const there = new Map(live.junctions.flatMap((j) => j.arms.map((arm) => [key(arm), arm])))
        ruling = arms.map((arm) => there.get(key(arm)) ?? arm)
      }
      const signalled = new Set(live.junctions.filter((j) => j.signal).map((j) => j.id))
      // No give-way triangles on an Arm whose Junction has a Signal: its Signal says who goes.
      const rules = ruling.map((arm): Rule => (signalled.has(arm.junction) ? 'stop' : arm.priority === 'main' ? '' : arm.priority))
      const now = rules.map((r) => r[0] ?? '-').join('')
      if (now === painted) return
      painted = now
      giveWay.geometry.dispose()
      giveWay.geometry = giveWayTriangles(arms, rules, laneWidth)
    },
  }
}
