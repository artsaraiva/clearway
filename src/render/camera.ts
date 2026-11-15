import * as THREE from 'three'
import type { Bounds } from '../sim/geometry'
import { CELL } from '../sim/tiles'
import { centre } from './slab'

/** A point on the screen, as a pointer event gives it. */
export interface ScreenPoint {
  clientX: number
  clientY: number
}

// Zoom 1 is the start's scale: a City of one Tile and the cells around it, three cells across, fill the frustum's height.
const SPAN = 1.5 * CELL // m: the frustum's half-height at zoom 1
const ZOOM_IN = 8 // the closest zoom
const ZOOM_OUT = 0.6 // the farthest zoom, as a share of the zoom that frames the whole City
// The angle above the horizon the camera looks down from, clamped to about 24°–72°. The start view looks from the
// south-east at about 41°.
const TILT = { low: Math.PI / 2 - 1.15, steep: Math.PI / 2 - 0.32, start: 0.72 }
const START_HEADING = 0.62 // rad
const TURN = 2 * Math.PI // rad of heading, or of tilt, for a drag the canvas's height
const WHEEL = 0.95 // the zoom is multiplied by this for each 100 px the wheel turns away from the player
const FLIGHT = 0.7 // s for a move the player asks for, or that brings a new Tile into view
const SLAB_DEPTH = 19 // m from the road plate down to the slab's underside, whose sides frame the City
// The margins of the canvas the screen's pills cover (index.html), in CSS pixels, with a little room: the readings
// along the top reach 123 px down, and the bar as far up.
// ponytail: fixed numbers, so they go stale if the pills change size, and a Tile brought into view could then stop
// under one. Have the screen hand the camera its pills' rectangles if that starts to happen.
const PILLS = { top: 136, right: 24, bottom: 136, left: 24 }
const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 }

/** Where the camera is. */
interface Pose {
  /** The point of the road plane at the middle of the canvas, as Three x and z. */
  x: number
  z: number
  /** How far the world is turned on screen, in radians clockwise: 0 with north up. */
  heading: number
  /** The angle above the horizon the camera looks down from, in radians. */
  tilt: number
  zoom: number
}

/** The same angle, within half a turn either way of 0. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** The corners of `b` at each of `heights`, as Three points. */
const corners = (b: Bounds, heights: number[]): [number, number, number][] =>
  heights.flatMap((y) => [b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((sy): [number, number, number] => [x, y, -sy])))

/**
 * The orthographic camera, for a City with no bounds. The screen moves it through `controls`: `pan` and `rotate`
 * follow drags and `zoomAt` the wheel, and `northUp`, `frameCity` and `toggleTilt` fly it to a new view. It opens from
 * the south-east with the whole City in frame, and after a Rebuild it stays where it is unless `bringIn` is asked to
 * show a Tile off screen.
 */
export function createCamera(canvas: HTMLCanvasElement, slab: Bounds) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000)
  const probe = camera.clone() // works out views the camera is not at yet
  let [width, height] = [1, 1]
  let city = slab
  let pose: Pose = { x: 0, z: 0, heading: START_HEADING, tilt: TILT.start, zoom: 1 }
  let opened = false // whether the start view has framed the City, which waits for the canvas to have a size
  let flight: { from: Pose; to: Pose; t: number } | null = null

  /** Set `cam` to look as `p` says. */
  const place = (cam: THREE.OrthographicCamera, p: Pose) => {
    const span = Math.max(SPAN, (1.5 * SPAN * height) / width)
    // How far the road plane seen across the canvas, and what stands on it or hangs under it, lies before and behind
    // the middle of the canvas. The camera stands back past it, so that every pixel looks down onto the road plane.
    const reach = span / p.zoom / Math.tan(p.tilt) + 150
    const distance = reach + 100
    Object.assign(cam, { left: (-span * width) / height, right: (span * width) / height, top: span, bottom: -span })
    Object.assign(cam, { zoom: p.zoom, near: 1, far: distance + reach })
    const across = Math.cos(p.tilt) * distance
    cam.position.set(p.x + Math.sin(p.heading) * across, Math.sin(p.tilt) * distance, p.z + Math.cos(p.heading) * across)
    cam.lookAt(p.x, 0, p.z)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }

  const raycaster = new THREE.Raycaster()
  const road = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const [ndc, v] = [new THREE.Vector2(), new THREE.Vector3()]
  /** The point of the road plane under canvas pixel (`px`, `py`), as `cam` sees it. */
  const roadUnder = (cam: THREE.OrthographicCamera, px: number, py: number) => {
    raycaster.setFromCamera(ndc.set((px / width) * 2 - 1, 1 - (py / height) * 2), cam)
    return raycaster.ray.intersectPlane(road, new THREE.Vector3())
  }
  /** Where Three point `p` lies on the canvas as `cam` sees it, in pixels. */
  const onCanvas = (cam: THREE.OrthographicCamera, [x, y, z]: [number, number, number]): [number, number] => {
    v.set(x, y, z).project(cam)
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height]
  }
  /** A screen point in the canvas's pixels. */
  const local = (p: ScreenPoint): [number, number] => {
    const r = canvas.getBoundingClientRect()
    return [p.clientX - r.left, p.clientY - r.top]
  }

  /** The zoom at which all of `points` lie inside the canvas less `margin`, with the camera otherwise at `p`. */
  const fitZoom = (p: Pose, points: [number, number, number][], margin: typeof NO_MARGIN) => {
    place(probe, { ...p, zoom: 1 })
    const room = (px: number) => Math.max(1, px)
    let zoom = ZOOM_IN
    for (const point of points) {
      const [x, y] = onCanvas(probe, point)
      const [dx, dy] = [x - width / 2, y - height / 2]
      if (dx > 0) zoom = Math.min(zoom, room(width / 2 - margin.right) / dx)
      if (dx < 0) zoom = Math.min(zoom, room(width / 2 - margin.left) / -dx)
      if (dy > 0) zoom = Math.min(zoom, room(height / 2 - margin.bottom) / dy)
      if (dy < 0) zoom = Math.min(zoom, room(height / 2 - margin.top) / -dy)
    }
    return zoom
  }

  /**
   * The view of the whole City from `p`'s heading and tilt: the City and the cells around it, where the next Tile can
   * go, fill the canvas, and none of the City lies under the screen's pills.
   */
  const framing = (p: Pose): Pose => {
    const [x, z] = centre(city)
    const around = { x0: city.x0 - CELL, y0: city.y0 - CELL, x1: city.x1 + CELL, y1: city.y1 + CELL }
    const at = { ...p, x, z }
    const zoom = Math.min(fitZoom(at, corners(around, [0]), NO_MARGIN), fitZoom(at, corners(city, [0, -SLAB_DEPTH]), PILLS))
    return { ...at, zoom }
  }

  /** The view the camera is at, or flying to. */
  const destination = () => (flight ? flight.to : pose)
  const fly = (to: Pose) => {
    flight = { from: { ...pose }, to, t: 0 }
  }

  return {
    camera,

    /** The canvas is now `w` by `h` CSS pixels. The start view waits for this to frame the City. */
    resize(w: number, h: number) {
      ;[width, height] = [Math.max(1, w), Math.max(1, h)]
      if (!opened && w > 0 && h > 0) [pose, opened] = [framing(pose), true]
      place(camera, pose)
    },

    /** The City's slab is now `next` (road plate and rim): what `frameCity` frames. The camera stays where it is. */
    setCity(next: Bounds) {
      city = next
    },

    /**
     * Show `b` on the road plane, as after a Rebuild. Nothing moves if all of it is on screen, even under a pill.
     * Otherwise the camera flies the least distance that brings it all into the part of the canvas the screen's pills
     * leave clear, or, if it is too big for that part, that fills the part with it.
     */
    bringIn(b: Bounds) {
      const to = destination()
      place(probe, to)
      const seen = corners(b, [0]).map((p) => onCanvas(probe, p))
      const [xs, ys] = [seen.map(([x]) => x), seen.map(([, y]) => y)]
      const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      // A pixel's grace, for a cell around the City that `frameCity` has just put at the canvas's edge.
      if (left > -1 && right < width + 1 && top > -1 && bottom < height + 1) return
      /** The least shift of a span `lo`–`hi` that puts it inside `min`–`max`, or makes it cover that if it can't fit. */
      const shift = (lo: number, hi: number, min: number, max: number) =>
        THREE.MathUtils.clamp(0, Math.min(min - lo, max - hi), Math.max(min - lo, max - hi))
      const dx = shift(left, right, PILLS.left, width - PILLS.right)
      const dy = shift(top, bottom, PILLS.top, height - PILLS.bottom)
      if (!dx && !dy) return
      // The world moves by (dx, dy) on screen when the camera centres on what lies that far the other way.
      const middle = roadUnder(probe, width / 2 - dx, height / 2 - dy)
      if (middle) fly({ ...to, x: middle.x, z: middle.z })
    },

    /** `dt` is the real seconds since the last frame, paused or not: a flight carries on while the world is paused. */
    update(dt: number) {
      if (!flight) return
      flight.t = Math.min(1, flight.t + dt / FLIGHT)
      const k = flight.t * flight.t * (3 - 2 * flight.t)
      const { from, to } = flight
      const lerp = (a: number, b: number) => a + (b - a) * k
      pose = {
        x: lerp(from.x, to.x),
        z: lerp(from.z, to.z),
        heading: wrap(from.heading + wrap(to.heading - from.heading) * k), // the short way round
        tilt: lerp(from.tilt, to.tilt),
        zoom: from.zoom * Math.pow(to.zoom / from.zoom, k), // evenly in scale
      }
      place(camera, pose)
      if (flight.t === 1) flight = null
    },

    /** What the screen moves the camera with, and reads it by. */
    controls: {
      /** How far the world is turned on screen, in radians clockwise: 0 with north up. */
      get heading() {
        return pose.heading
      },

      /** The angle above the horizon the camera looks down from, in radians. */
      get tilt() {
        return pose.tilt
      },

      /** Whether the camera looks down from the steepest tilt it allows. */
      get steep() {
        return Math.abs(pose.tilt - TILT.steep) < 0.01
      },

      /** Move the world on screen as a drag from `from` to `to` does: the ground under the pointer stays under it. */
      pan(from: ScreenPoint, to: ScreenPoint) {
        flight = null
        const [a, b] = [roadUnder(camera, ...local(from)), roadUnder(camera, ...local(to))]
        if (!a || !b) return
        pose.x += a.x - b.x
        pose.z += a.z - b.z
        place(camera, pose)
      },

      /** Turn the camera about the middle of the canvas for a drag of `dx` by `dy` pixels: across turns, up and down tilts. */
      rotate(dx: number, dy: number) {
        flight = null
        pose.heading = wrap(pose.heading - (TURN * dx) / height)
        pose.tilt = THREE.MathUtils.clamp(pose.tilt + (TURN * dy) / height, TILT.low, TILT.steep)
        place(camera, pose)
      },

      /**
       * Zoom for `deltaY` pixels of wheel (positive turns away from the player and zooms out), keeping the ground
       * under `at` where it is. The closest zoom is fixed; the farthest leaves the whole City well inside the canvas.
       */
      zoomAt(at: ScreenPoint, deltaY: number) {
        flight = null
        const [px, py] = local(at)
        const before = roadUnder(camera, px, py)
        const next = pose.zoom * Math.pow(WHEEL, deltaY / 100)
        // A limit stops the wheel but never moves the camera back inside it, as when an Undo shrinks the City.
        pose.zoom =
          deltaY > 0 ? Math.max(next, Math.min(pose.zoom, ZOOM_OUT * framing(pose).zoom)) : Math.min(next, Math.max(pose.zoom, ZOOM_IN))
        place(camera, pose)
        const after = roadUnder(camera, px, py)
        if (!before || !after) return
        pose.x += before.x - after.x
        pose.z += before.z - after.z
        place(camera, pose)
      },

      /** Turn north up. */
      northUp() {
        fly({ ...destination(), heading: 0 })
      },

      /** Frame the whole City, from the heading and tilt the camera has. */
      frameCity() {
        fly(framing(destination()))
      },

      /** Flip between the steepest tilt and the start's, whichever is farther from the tilt the camera has. */
      toggleTilt() {
        const to = destination()
        const steep = Math.abs(to.tilt - TILT.steep) > Math.abs(to.tilt - TILT.start)
        fly({ ...to, tilt: steep ? TILT.steep : TILT.start })
      },
    },
  }
}
