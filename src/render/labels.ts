import * as THREE from 'three'
import { pointAt, type Bounds } from '../sim/geometry'
import type { Arm, Lane, Network } from '../sim/network'
import type { Sim } from '../sim/sim'
import type { DemandSpec } from '../sim/spec'
import '../ui/board.css'
import type { Field } from './field'
import { v3 } from './ribbons'
import type { Scenery } from './scenery'

// Per kind of landmark: its label's colour, and how high above the road the label floats (m).
const LANDMARKS = {
  tower: { color: '#b4523a', height: 76 },
  park: { color: '#3d7f3a', height: 10 },
  plaza: { color: '#8a6d3b', height: 10 },
}
const AHEAD = 20 // m along a Road to the second point its on-screen direction is read from
const GATEWAY = { beyond: 9, height: 6 } // m past the end of a Gateway's Road, and above it

/** A Gateway's trips a minute as its label reads them, to a tenth. A Gateway that reaches no other sends nothing. */
const perMinute = (rates: DemandSpec, id: string) => (rates[id]?.rate ?? 0).toFixed(1)

/**
 * A City's total Demand as its Gateway labels read: the sum of the trips a minute they show. The player can add it up
 * on the screen, so the change in it from one Sim to the next is the change in the labels, to the tenth.
 */
export const labelledDemand = ({ net, rates }: Pick<Sim, 'net' | 'rates'>) =>
  Object.keys(net.gateways).reduce((sum, id) => sum + Number(perMinute(rates, id)), 0)

/** Where a Gateway's label floats: just past where its Road leaves the slab. */
function gatewayAt(arm: Arm) {
  const end = arm.exit[0].line.pts[arm.exit[0].line.pts.length - 1]
  const start = arm.approach[0].line.pts[0]
  return new THREE.Vector3(
    (end.x + start.x) / 2 + Math.cos(arm.angle) * GATEWAY.beyond,
    GATEWAY.height,
    -((end.y + start.y) / 2 + Math.sin(arm.angle) * GATEWAY.beyond),
  )
}

/**
 * DOM labels over the canvas: each Gateway's trips a minute on a paper tag, and the names from the scenery: each Road's
 * name, lying along the longest of the Roads that share it, and each named landmark's with a coloured dot. Scenery that
 * names nothing gets no names. While the Tile in the hand is over a legal cell, they preview what the drop does to Demand.
 * Styled by `.labels` in `../ui/board.css`.
 * ponytail: labels never make room for each other, so two names can overlap at some camera angles. That is rare with
 * the handful a City has today; hide the lesser of an overlapping pair when Cities carry more names.
 */
export function createLabels(canvas: HTMLCanvasElement, camera: THREE.Camera, scenery: Scenery) {
  const layer = document.createElement('div')
  layer.className = 'labels'
  canvas.after(layer)
  type Label = { el: HTMLElement; at: THREE.Vector3; ahead?: THREE.Vector3; shown: string }
  let labels: Label[] = []
  /** Each Gateway's label, by its Road's id. */
  let gateways = new Map<string, HTMLElement>()
  /** The labels of the Gateways the drop in preview would open. */
  let opened: Label[] = []
  /** A label at `at`, lying along the way to `ahead` when that is given. */
  const label = (text: string, at: THREE.Vector3, ahead?: THREE.Vector3, color?: string): Label => {
    const el = layer.appendChild(document.createElement('div'))
    el.textContent = text
    if (color) el.style.color = color
    return { el, at, ahead, shown: '' }
  }
  const add = (text: string, at: THREE.Vector3, ahead?: THREE.Vector3, color?: string) => {
    labels.push(label(text, at, ahead, color))
  }

  /**
   * Preview a drop that would rebuild the City into `after`: a Gateway it would close has its label struck through,
   * and one it would open shows the trips a minute it would send, `lift` m higher than it will stand, beside the Tile
   * in the hand. `null` takes the preview away.
   */
  const preview = (after: Pick<Sim, 'net' | 'rates'> | null, lift = 0) => {
    for (const { el } of opened) el.remove()
    opened = []
    for (const [id, el] of gateways) el.classList.toggle('closed', !!after && !(id in after.net.gateways))
    if (!after) return
    for (const [id, arm] of Object.entries(after.net.gateways)) {
      if (gateways.has(id)) continue
      const gateway = label(`${perMinute(after.rates, id)}/min`, gatewayAt(arm).setY(GATEWAY.height + lift))
      gateway.el.className = 'gateway opened'
      // In place at once: the frame may already be drawn, and the label would show in the corner until the next.
      move(gateway, ...size)
      opened.push(gateway)
    }
  }

  /**
   * Label what is on the slab: the Gateways of `net` with the trips a minute `rates` sends from each, its streets, and
   * the landmarks on a Block of `field` on the pieces of slab `pieces`. It takes any preview away.
   */
  const show = (net: Network, rates: DemandSpec, field: Field, pieces: Bounds[]) => {
    layer.replaceChildren()
    ;[labels, gateways, opened] = [[], new Map(), []]
    for (const [id, arm] of Object.entries(net.gateways)) {
      const gateway = label(`${perMinute(rates, id)}/min`, gatewayAt(arm))
      gateway.el.className = 'gateway'
      gateways.set(id, gateway.el)
      labels.push(gateway)
    }
    const roads = new Map<string, Lane[]>()
    for (const lane of net.lanes) {
      if ('road' in lane.owner) roads.set(lane.owner.road, [...(roads.get(lane.owner.road) ?? []), lane])
    }
    // Roads that share a name are one street: it is named once, on its longest Road.
    const streets = new Map<string, Lane[]>()
    for (const [road, lanes] of roads) {
      const name = scenery.streets[road]
      if (name && lanes[0].length > (streets.get(name)?.[0].length ?? 0)) streets.set(name, lanes)
    }
    for (const [name, lanes] of streets) {
      // The middle of the Road is the middle of its lanes.
      const mids = lanes.map((lane) => pointAt(lane.line, lane.length / 2))
      const [x, y] = [mids.reduce((sum, p) => sum + p.x, 0) / mids.length, mids.reduce((sum, p) => sum + p.y, 0) / mids.length]
      const { heading } = mids[0]
      add(name, v3({ x, y }), v3({ x: x + Math.cos(heading) * AHEAD, y: y + Math.sin(heading) * AHEAD }))
    }
    // A landmark off every Block is not on the slab yet, and stays unnamed.
    for (const { type, name, at } of [...scenery.landmarks, ...scenery.blocks]) {
      const [x, y] = at
      if (name && field.sample(x, y) > 0 && pieces.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1))
        add(`● ${name}`, new THREE.Vector3(at[0], LANDMARKS[type].height, -at[1]), undefined, LANDMARKS[type].color)
    }
  }

  const [a, b] = [new THREE.Vector3(), new THREE.Vector3()]
  /** The canvas's size in CSS pixels at the last `update`. */
  const size: [number, number] = [0, 0]
  /** Move a label to where its point is on a canvas `w` by `h` CSS pixels. */
  function move(label: Label, w: number, h: number) {
    a.copy(label.at).project(camera)
    let transform = `translate(${(((a.x + 1) / 2) * w).toFixed(1)}px,${(((1 - a.y) / 2) * h).toFixed(1)}px) translate(-50%,-50%)`
    if (label.ahead) {
      // Along the Road as it lies on screen, turned whichever way reads left to right.
      b.copy(label.ahead).project(camera)
      let angle = Math.atan2(-(b.y - a.y) * h, (b.x - a.x) * w)
      if (angle > Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      transform += ` rotate(${angle.toFixed(3)}rad)`
    }
    if (transform !== label.shown) label.el.style.transform = label.shown = transform
  }

  return {
    show,
    preview,

    /** Take the labels off the page, for a view that is done with. */
    remove() {
      layer.remove()
    },

    /**
     * Move each label to where its point is now, on a canvas `w` by `h` CSS pixels. Call it after the frame is drawn, so
     * it reads this frame's camera.
     */
    update(w: number, h: number) {
      size[0] = w
      size[1] = h
      for (const label of labels) move(label, w, h)
      for (const label of opened) move(label, w, h)
    },
  }
}
