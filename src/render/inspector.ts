import * as THREE from 'three'
import type { Cell } from '../city/city'
import { pointAt } from '../sim/geometry'
import type { Vehicle } from '../sim/sim'
import { CELL } from '../sim/tiles'
import { KERB } from './blocks'
import { glow } from './glow'
import type { Materials } from './kit'
import { ribbons } from './ribbons'

/** The route Inspector: one car's remaining route as a glowing blue line above the road, redrawn each frame as the car moves. */
export function createRouteInspector() {
  const core = new THREE.Mesh(new THREE.BufferGeometry(), glow('#1f7aff')) // the Tools' blue
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), glow('#62b0ff', 0.3))
  const group = new THREE.Group().add(halo, core)
  return {
    group,
    /** `null` hides it. */
    update(car: Vehicle | null) {
      group.visible = !!car
      if (!car) return
      const { lane, s, path } = car
      const lines = [[pointAt(lane.line, s), ...lane.line.pts.filter((_, i) => lane.line.cum[i] > s)], ...path.map((l) => l.line.pts)]
      core.geometry.dispose()
      halo.geometry.dispose()
      core.geometry = ribbons(lines, 1.2, 0.5)
      halo.geometry = ribbons(lines, 3.6, 0.45)
    },
  }
}

/** A zoned Tile as the Stage Inspector shows it: its cell, its Stage, and whether a Jam holds it back from the next. */
export interface InspectedTile {
  cell: Cell
  stage: number
  heldBack: boolean
}

// The Stage Inspector's tints, Stage 1 to 3, light to strong: the gold of a Stage's stars on the screen, in even steps
// of lightness (OKLCH 0.95, 0.83, 0.71). Kit.ts's rule leaves them free, since all three lie more than 45° of hue from
// the Jam red-orange and further still from the Tool blue. The stripes a Tile held back by a Jam carries are a
// neutral grey, which no Jam marker is.
export const STAGE_TINTS = ['#fbeeb4', '#f2c12e', '#d29600']
export const HELD_BACK = '#7a7670'
const STRIPE = 6 // m from one stripe to the next, across them; half of it is the stripe
// m: what stands lower than this on a zoned Tile is its ground, which takes the tint: kerbs, pavement, lawns, plazas
// and a park's ground. Walls stand on the pavement or a lawn, so the tint climbs no more than a hand up them.
const GROUND = KERB + 0.3
const FADE = 0.2 // s for the tint to come in or go
const STRENGTH = 0.85 // how much of the ground's own colour the tint takes over
// How much of the tinted ground's light is the tint itself, unlit: enough that it reads at dusk and at night as well
// as at noon, as the other Inspectors do, while the ground keeps some of its shading and its shadows.
const UNLIT = 0.5

const DECLARE = /* glsl */ `
uniform float stageShown;
uniform sampler2D stageCells;
uniform vec2 stageOrigin;
uniform vec3 stageTints[3];
uniform vec3 stageHeld;
varying vec3 vStageAt;`

// Each cell's texel holds its Tile's Stage (0 for none) in red and whether a Jam holds it back in green. The stripes run
// diagonally across the map, softened where they get finer than a pixel and evened out to their average further off.
const TINT = /* glsl */ `
vec3 stageTint = vec3(0.0);
float stageK = 0.0;
if (stageShown > 0.0) {
  vec2 onMap = vec2(vStageAt.x, -vStageAt.z);
  float across = (onMap.x + onMap.y) / ${STRIPE.toFixed(1)};
  float soft = fwidth(across) * 2.0;
  float gap = smoothstep(0.5 - soft, 0.5 + soft, abs(fract(across) - 0.5) * 2.0);
  gap = mix(gap, 0.5, clamp(soft * 2.0 - 0.5, 0.0, 1.0));
  ivec2 at = ivec2(floor(onMap / ${CELL.toFixed(1)} + 0.5) - stageOrigin);
  ivec2 size = textureSize(stageCells, 0);
  if (vStageAt.y > 0.005 && vStageAt.y < ${GROUND.toFixed(2)} && all(greaterThanEqual(at, ivec2(0))) && all(lessThan(at, size))) {
    vec4 tile = texelFetch(stageCells, at, 0);
    int stage = int(tile.r * 255.0 + 0.5);
    if (stage > 0) {
      stageTint = stageTints[stage - 1];
      if (tile.g > 0.5) stageTint = mix(stageHeld, stageTint, gap);
      stageK = stageShown;
      diffuseColor.rgb = mix(diffuseColor.rgb, stageTint, stageK * ${STRENGTH.toFixed(2)});
    }
  }
}`
const UNLIT_TINT = /* glsl */ `outgoingLight = mix(outgoingLight, stageTint, stageK * ${UNLIT.toFixed(2)});`

/**
 * The Stage Inspector: the ground of every zoned Tile tinted by its Stage, and striped while a Jam holds the Tile back
 * from its next. The buildings keep their own colours, and so does every unzoned Tile. It is drawn by the scenery's
 * own material, `solid`, which it patches, so it adds no geometry and no draw call, and a Tile's piece takes it as it
 * is built, swapped, rezoned or staged up. Create it before anything copies `solid`, as a reveal does, so that the
 * copies draw it too, and after `createMaterials` has laid the surface pattern's patch on it, which it keeps.
 */
export function createStageInspector({ solid }: Materials) {
  const uniforms = {
    stageShown: { value: 0 },
    stageCells: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) },
    stageOrigin: { value: new THREE.Vector2() },
    stageTints: { value: STAGE_TINTS.map((c) => new THREE.Color(c)) },
    stageHeld: { value: new THREE.Color(HELD_BACK) },
  }
  const own = solid.onBeforeCompile.bind(solid) // the surface pattern's patch (#174), which comes first
  solid.onBeforeCompile = (shader, renderer) => {
    own(shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vStageAt;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvStageAt = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECLARE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${TINT}`)
      .replace('#include <opaque_fragment>', `${UNLIT_TINT}\n#include <opaque_fragment>`)
  }

  let on = false
  /** What the cells last showed, so that the texture is only written when it changes. */
  let shown = ''
  return {
    /** Show `tiles`, every zoned Tile of the City; `null` turns the Inspector off. Call it every frame. */
    show(tiles: InspectedTile[] | null) {
      on = tiles !== null
      if (!tiles) return
      const key = tiles.map((t) => `${t.cell.x},${t.cell.y},${t.stage},${+t.heldBack}`).join(';')
      if (key === shown) return
      shown = key
      // The cells from the City's south-west corner to its north-east, or one empty cell for a City with no zoned Tile.
      const xs = tiles.length ? tiles.map((t) => t.cell.x) : [0]
      const ys = tiles.length ? tiles.map((t) => t.cell.y) : [0]
      const [x0, y0] = [Math.min(...xs), Math.min(...ys)]
      const [w, h] = [Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1]
      const data = new Uint8Array(w * h * 4)
      for (const t of tiles) data.set([t.stage, t.heldBack ? 255 : 0], 4 * ((t.cell.y - y0) * w + t.cell.x - x0))
      const cells = uniforms.stageCells.value
      if (cells.image.width === w && cells.image.height === h) cells.image.data!.set(data)
      else {
        cells.dispose()
        uniforms.stageCells.value = new THREE.DataTexture(data, w, h)
      }
      uniforms.stageCells.value.needsUpdate = true
      uniforms.stageOrigin.value.set(x0, y0)
    },
    /** `real` is the real seconds since the last frame: the tint fades in and out on the real clock, paused or not. */
    update(real: number) {
      const fade = uniforms.stageShown
      fade.value = THREE.MathUtils.clamp(fade.value + (on ? real : -real) / FADE, 0, 1)
    },
  }
}
