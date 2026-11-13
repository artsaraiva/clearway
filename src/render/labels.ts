import * as THREE from 'three'
import type { District } from '../sim/district'
import { pointAt } from '../sim/geometry'
import type { Lane, Network } from '../sim/network'
import type { Field } from './field'
import { v3 } from './ribbons'

// Per kind of landmark: its label's colour, and how high above the road the label floats (m).
const LANDMARKS = {
  tower: { color: '#b4523a', height: 76 },
  park: { color: '#3d7f3a', height: 10 },
  plaza: { color: '#8a6d3b', height: 10 },
}
const AHEAD = 20 // m along a Road to the second point its on-screen direction is read from

/**
 * Names from the District file as DOM labels over the canvas: each street's name lying along its longest Road, and
 * each named landmark's with a coloured dot. A District with no scenery gets none. Styled by `.labels` in the page.
 * ponytail: labels never make room for each other, so two names can overlap at some camera angles. That is rare with
 * the handful a District has today; hide the lesser of an overlapping pair when Districts carry more names.
 */
export function createLabels(canvas: HTMLCanvasElement, camera: THREE.Camera, net: Network, district: District, field: Field) {
  const layer = document.createElement('div')
  layer.className = 'labels'
  canvas.after(layer)
  const labels: { el: HTMLElement; at: THREE.Vector3; ahead?: THREE.Vector3; shown: string }[] = []
  const add = (text: string, at: THREE.Vector3, ahead?: THREE.Vector3, color?: string) => {
    const el = layer.appendChild(document.createElement('div'))
    el.textContent = text
    if (color) el.style.color = color
    labels.push({ el, at, ahead, shown: '' })
  }

  const { scenery } = district
  if (scenery) {
    const roads = new Map<string, Lane[]>()
    for (const lane of net.lanes) {
      if ('road' in lane.owner) roads.set(lane.owner.road, [...(roads.get(lane.owner.road) ?? []), lane])
    }
    // Roads that share a name are one street: it is named once, on its longest Road out of the Fog.
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
    // A landmark off every Block is still in the Fog, and stays unnamed.
    for (const { type, name, at } of [...scenery.landmarks, ...scenery.blocks]) {
      if (name && field.sample(...at) > 0)
        add(`● ${name}`, new THREE.Vector3(at[0], LANDMARKS[type].height, -at[1]), undefined, LANDMARKS[type].color)
    }
  }

  const [a, b] = [new THREE.Vector3(), new THREE.Vector3()]
  return {
    /**
     * Move each label to where its point is now, on a canvas `w` by `h` CSS pixels. Call it after the frame is drawn, so
     * it reads this frame's camera.
     */
    update(w: number, h: number) {
      for (const label of labels) {
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
    },
  }
}
