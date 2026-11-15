import * as THREE from 'three'
import type { Bounds } from '../sim/geometry'
import { centre } from './slab'

const DAY = 180 // real seconds per day
const START = 0 // the day opens in the morning
const LIGHT_DISTANCE = 500 // m from the slab's centre to the light, at least
const MIN_REACH = 250 // m: the shadow map never covers less than this either side of the slab's centre
const SHADOW = { bias: 0.5, normalBias: 0.16, radius: 3 } // m, m and texels, for a shadow map `MIN_REACH` either side
const LIGHTS_ON = 3 // lamp glow at which car lights are fully lit

// The look is authored at these times of day (0–1 around the loop) and interpolated between them. One column per time:
// morning, noon, late afternoon, dusk, sun out, moon in, night, moon out, sun in.
const AT = [0, 0.25, 0.4, 0.5, 0.58, 0.62, 0.75, 0.9, 0.94]
const colors = (...hex: string[]) => hex.map((c) => new THREE.Color(c))
// Noon, dusk and night carry the oversaturated palette picked in #104: a clear cyan noon, an orange and pink dusk, and
// a deep blue night that stays bright. The lights move less than the sky, since they tint the road plate too.
// The one directional light is the sun by day and the moon by night. Its strength is zero either side of each handover,
// so the jump across the sky is never seen.
const LIGHT = {
  color: colors('#fff3e0', '#fffaf0', '#ffe0b3', '#fe9f6f', '#ff9c6e', '#a9c0ff', '#bfd0ff', '#a9c0ff', '#fff3e0'),
  intensity: [2.6, 3, 2.9, 1.8, 0, 0, 1.7, 0, 0],
  azimuth: [-0.82, 0.1, 1.05, 1.76, 1.9, -1.2, 0.3, 1.2, -1],
  elevation: [0.9, 1.2, 0.66, 0.34, 0.15, 0.5, 1, 0.5, 0.3],
}
// The hemisphere light's fill from the sky and from the ground. Night is a bright moonlit blue, not dark. The fill is
// strongest through each handover, where it lights the scene alone, so roads are no darker there than at dusk. (The
// prototype's fill left them nearly black.) Dusk's low sun leaves most of the road plate in shadow, so its fill is
// pink and raised, which keeps its roads legible.
const FILL = {
  sky: colors('#d6ebff', '#d1edfb', '#cfe2ff', '#bd98c9', '#7686d6', '#7686d6', '#adbbf2', '#9aa8e0', '#b8c8ee'),
  ground: colors('#efe6d2', '#f2ead9', '#f4dcc0', '#eaa48c', '#7a6f9c', '#5a5f9c', '#7780c2', '#8a84a8', '#c8b8b8'),
  intensity: [1.25, 1.25, 1.1, 1.1, 2.2, 2.2, 1.75, 1.7, 1.45],
}
// The sky gradient's stops: top, middle, bottom.
const SKY = [
  colors('#bfe2fb', '#68ccf5', '#9ccff3', '#8d6cc2', '#2a3270', '#222a62', '#191c5b', '#3a4a90', '#6a8ad0'),
  colors('#e6f2f6', '#beeaf9', '#d9ecf3', '#d887ae', '#5a5aa0', '#444c92', '#31398e', '#8a8cc0', '#b8c4e0'),
  colors('#f6efe2', '#e5f8f9', '#ffe4c4', '#fcb17e', '#a07aa8', '#7a6aa0', '#5c61b5', '#e0b0a8', '#f4d0b8'),
]
// Emissive strength of windows and lamps.
const GLOW = {
  windows: [0, 0, 0.12, 1.4, 1.5, 1.6, 1.6, 0.6, 0.2],
  lamps: [0, 0, 0, 4, 5, 5, 5, 2, 0.5],
}

/** What glows at the time of day shown. */
export interface Glow {
  /** Emissive strength of the windows. */
  windows: number
  /** Emissive strength of the lamps. */
  lamps: number
  /** Strength of car head and tail lights, 0–1. */
  carLights: number
}

/**
 * The day cycle: morning, noon, dusk and night on a looping clock of its own. It moves one directional light (with a
 * soft shadow map covering the slab), a hemisphere light and the sky gradient behind the transparent canvas, and says
 * what glows. It is cosmetic: nothing in the sim reads it.
 * ponytail: one shadow map covers the whole slab, so its shadows soften as the City grows: a texel is 12 cm up to 3
 * cells across and half a metre at 12. Cascade the shadow map on the camera's view if a large City's shadows look
 * too soft.
 */
export function createDay(canvas: HTMLCanvasElement, slab: Bounds) {
  const fill = new THREE.HemisphereLight()
  const light = new THREE.DirectionalLight()
  light.castShadow = true
  // If shadows break the frame budget, this shrinks before any look decision changes.
  light.shadow.mapSize.set(4096, 4096)
  let distance = LIGHT_DISTANCE

  /** Light the slab `next` (plate and rim): the shadow map covers all of it. */
  const fit = (next: Bounds) => {
    const [cx, cz] = centre(next)
    // The slab's diagonal, with room for tall buildings.
    const reach = Math.max(MIN_REACH, 0.8 * Math.max(next.x1 - next.x0, next.y1 - next.y0))
    // Far enough out that the whole slab lies in front of the light however low it stands.
    distance = Math.max(LIGHT_DISTANCE, 1.25 * reach)
    light.target.position.set(cx, 0, cz)
    Object.assign(light.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 2 * distance })
    light.shadow.camera.updateProjectionMatrix()
    // Kept the same on the ground as the map's texels grow: the depth bias in metres, the offset along the normal in
    // texels, and the blur in metres down to one texel.
    const texels = reach / MIN_REACH
    light.shadow.bias = -SHADOW.bias / (2 * distance)
    light.shadow.normalBias = SHADOW.normalBias * texels
    light.shadow.radius = Math.max(1, SHADOW.radius / texels)
  }
  fit(slab)

  let clock = START
  let held = false // stopped by `hold`
  let sky = ''
  const mixed = new THREE.Color()

  /** Show the time of day `p`, 0–1. */
  const show = (p: number): Glow => {
    let i = AT.length - 1
    while (AT[i] > p) i--
    const j = (i + 1) % AT.length
    const k = (p - AT[i]) / ((AT[j] || 1) - AT[i])
    const num = (track: number[]) => track[i] + (track[j] - track[i]) * k
    const mix = (track: THREE.Color[]) => mixed.copy(track[i]).lerp(track[j], k)

    light.color.copy(mix(LIGHT.color))
    light.intensity = num(LIGHT.intensity)
    const [az, el] = [num(LIGHT.azimuth), num(LIGHT.elevation)]
    light.position
      .set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
      .multiplyScalar(distance)
      .add(light.target.position)
    fill.color.copy(mix(FILL.sky))
    fill.groundColor.copy(mix(FILL.ground))
    fill.intensity = num(FILL.intensity)

    const gradient = `linear-gradient(180deg,${SKY.map((stop, s) => `#${mix(stop).getHexString()} ${s * 50}%`).join(',')})`
    if (gradient !== sky) canvas.style.background = sky = gradient

    const lamps = num(GLOW.lamps)
    return { windows: num(GLOW.windows), lamps, carLights: Math.min(1, lamps / LIGHTS_ON) }
  }

  return {
    lights: [fill, light, light.target],

    fit,

    /** Move the clock on by `dt` real seconds and show the time it reaches. */
    update(dt: number): Glow {
      if (!held) clock = (clock + dt / DAY) % 1
      return show(clock)
    },

    /**
     * Stop the clock at a time of day, 0–1 (0 morning, 0.25 noon, 0.5 dusk, 0.75 night). For looking at one light while
     * building the game: the player has no control over the time of day.
     */
    hold(p: number) {
      held = true
      clock = ((p % 1) + 1) % 1 || 0 // anything that is not a number shows the morning
    },
  }
}
