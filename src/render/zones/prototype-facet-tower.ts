// PROTOTYPE, throwaway (`../prototype-look`): high-density residential's tower in the faceted look. Not for main.
import * as THREE from 'three'
import { mulberry32 } from '../../sim/demand'
import { AERIAL, boxFace, type Kit, SHAPES, spot, TANK, to } from '../kit'
import { blob, loft, oct } from '../prototype-look'

const STOREY = 3.1
const PODIUM = 4.6
const TAU = Math.PI * 2
// A tower's wall, the deep colour of its podium and roof, and the bright one of its balconies and awnings.
const PALETTES = [
  { wall: '#ffc793', deep: '#d9674a', pop: '#2f9a8c' },
  { wall: '#a9ecc9', deep: '#2c8d82', pop: '#f2a53a' },
  { wall: '#ffe183', deep: '#e0863a', pop: '#5a70c4' },
  { wall: '#b9c6ff', deep: '#5468bd', pop: '#f4788e' },
  { wall: '#ffb5c8', deep: '#c3547d', pop: '#35a3a8' },
  { wall: '#fff1d8', deep: '#3b80a8', pop: '#e45a4c' },
]
const TRIM = '#fff8ec'
const GREENS = ['#4fae5a', '#6cc04e', '#8fd25a', '#3d9a6b', '#a8d868', '#58b77c']
const BLOSSOM = ['#f6a2b9', '#f4bd4e', '#f3855f']
const [TRUNK, LAWN] = ['#8a5a3c', '#9bd672']
const CLUMPS = [blob(11, 0, 0.22), blob(12, 0, 0.26), blob(13, 0, 0.18)] // twenty faces: a balcony's plants, a hedge's
const CROWNS = [blob(21, 1, 0.2), blob(22, 1, 0.24)] // eighty: a tree's
// A window standing out of its wall as a three-faced bay, its sill and head, and a balcony wider at its lip than at
// its foot. Each stands with its back on z = 0 and comes out along -z, the way the kit's fronts face.
const ORIEL = loft(
  [[-1, 0], [1, 0], [0.55, -0.5], [-0.55, -0.5]],
  [[-1, 0], [1, 0], [0.55, -0.5], [-0.55, -0.5]],
  1.8,
) // prettier-ignore
const SILL = loft(
  [[-1.1, 0], [1.1, 0], [0.6, -0.62], [-0.6, -0.62]],
  [[-1.1, 0], [1.1, 0], [0.6, -0.62], [-0.6, -0.62]],
  0.2,
) // prettier-ignore
const BALCONY = loft(
  [[-1.1, 0], [1.1, 0], [1.1, -0.9], [-1.1, -0.9]],
  [[-1.35, 0], [1.35, 0], [1.35, -1.35], [-1.35, -1.35]],
  1.05,
) // prettier-ignore
const AWNING = loft(
  [[-1, 0], [1, 0], [1, -1], [-1, -1]],
  [[-1, 0], [1, 0], [1, -0.02], [-1, -0.02]],
  1,
) // prettier-ignore

type Plan = { pad?: boolean; beacon?: boolean; form?: string; door?: number; canopy?: boolean; store?: number }

/**
 * A residential tower in the faceted look, as `residentialTower` stands one: a deep-coloured podium with its corners
 * cut, and on it tiers stacked in a spiral, each a little smaller than the one under it and flush with it on two
 * sides, so that a terrace with a tree and hedges turns round the tower as it climbs. Bay windows stand out of every
 * wall, balconies chequer its long faces with plants spilling over them, and its roof is a cut gem, a monopitch or a
 * garden, by its form.
 */
export function facetTower(kit: Kit, x: number, y: number, h: number, w: number, d: number, floors: number, stage = 2, more: Plan = {}) {
  const { pad = false, beacon = false, form = 'slab', door, store } = more
  const palette = kit.pick(PALETTES)
  kit.pick(PALETTES) // as many draws as `residentialTower` takes
  kit.formed(form)
  const own = mulberry32(spot(x, y) ^ 0x0fac37e1)
  const hsl = { h: 0, s: 0, l: 0 }
  /** `hex`, a little lighter or darker and a touch off its hue: no two parts quite the same. */
  const vary = (hex: string, by = 0.03) => {
    const c = new THREE.Color(hex)
    c.getHSL(hsl)
    c.setHSL(hsl.h + (own() - 0.5) * 0.016, hsl.s, THREE.MathUtils.clamp(hsl.l + (own() - 0.5) * 2 * by, 0, 1))
    return `#${c.getHexString()}`
  }
  const green = () => vary(own() < 0.1 ? BLOSSOM[Math.floor(own() * 3)] : GREENS[Math.floor(own() * GREENS.length)], 0.04)
  const clump = (cx: number, cy: number, at: number, r: number, tall = 1) =>
    kit.add(CLUMPS[Math.floor(own() * 3)], green(), cx, cy, at, own() * TAU, r, r * tall, r)
  const tree = (cx: number, cy: number, at: number, s: number) => {
    kit.add(SHAPES.thin, TRUNK, cx, cy, at, 0, 0.16 * s, 1.5 * s, 0.16 * s)
    const n = 2 + Math.floor(own() * 2)
    const leaf = green()
    for (let i = 0; i < n; i++) {
      const [a, out, r] = [own() * TAU, i ? 0.7 * s : 0, s * (i ? 0.75 + own() * 0.3 : 1.25)]
      kit.add(
        CROWNS[i % 2],
        i ? vary(leaf, 0.06) : leaf,
        cx + Math.cos(a) * out,
        cy + Math.sin(a) * out,
        at + s * (i ? 1.7 + own() * 0.7 : 2.2),
        own() * TAU,
        r,
        r * 0.85,
        r,
      )
    }
  }
  const plants = [0.2, 0.4, 0.55][stage - 1]
  const lit = [0.4, 0.5, 0.6][stage - 1]

  // The podium: its corners cut, a cornice round its top, glass along every face, and its door under an awning.
  const [pw, pd] = [w + 2.4, d + 2.4]
  kit.add(loft(oct(pw, pd, 1.5), oct(pw, pd, 1.5), PODIUM), palette.deep, x, y, h)
  kit.add(loft(oct(pw + 0.5, pd + 0.5, 1.6), oct(pw + 0.9, pd + 0.9, 1.7), 0.45), TRIM, x, y, h + PODIUM)
  for (let k = 0; k < 4; k++) {
    const { ry, half, len } = boxFace(k, pw, pd)
    const run = len - 3.8
    const n = Math.max(1, Math.floor(run / 3.4))
    const isDoor = k === door
    const isStore = k === store && stage > 1
    for (let i = 0; i < n; i++) {
      const lx = -run / 2 + (run / n) * (i + 0.5)
      const glow = isDoor ? 1.3 : isStore ? 1.5 : undefined
      const glass = glow ? { material: kit.glass, tint: kit.windows[0], glow } : kit.pane(0.5)
      kit.local(kit.cuboid(run / n - 0.6, 2.9, 0.3), glass, x, y, ry, lx, half, h + 0.4)
      if (isDoor || isStore) kit.local(AWNING, vary(palette.pop), x, y, ry, lx, half + 0.1, h + 3.4, (run / n - 0.2) / 2)
    }
    if (isDoor && kit.patterned) {
      kit.doorway(x, y, ry, 2, half + 0.2)
      kit.pool('lobby', ...to(x, y, ry, 0, half + 1.7), h, Math.min(run, 8) + 2, 3, ry)
    }
  }
  for (const [i, j] of [[-1, -1], [1, 1]] as const) clump(x + i * (pw / 2 - 0.9), y + j * (pd / 2 - 0.9), h + PODIUM + 0.5, 0.75, 0.8) // prettier-ignore

  // Its tiers: each `step` m smaller both ways than the one under it and flush with it on two sides, the corner they
  // share turning a quarter each tier.
  const count = floors >= 15 ? 4 : floors >= 9 ? 3 : 2
  const step = Math.min(2.2, (Math.min(w, d) - 6.5) / (count - 1))
  const shares = [[1], [0.58, 0.42], [0.44, 0.32, 0.24], [0.36, 0.28, 0.2, 0.16]][count - 1]
  const turn = Math.floor(own() * 4)
  const CORNERS = [[1, 1], [-1, 1], [-1, -1], [1, -1]] // prettier-ignore
  let [cx, cy, at, left] = [x, y, h + PODIUM + 0.45, floors]
  let [tw, td] = [w, d]
  for (let t = 0; t < count; t++) {
    const n = t === count - 1 ? left : Math.max(2, Math.round(floors * shares[t]))
    left -= n
    const tall = n * STOREY
    const cut = 1.1
    const wall = vary(palette.wall, 0.025)
    kit.add(loft(oct(tw, td, cut), oct(tw, td, cut), tall), wall, cx, cy, at)
    kit.add(loft(oct(tw + 0.3, td + 0.3, cut + 0.1), oct(tw + 0.7, td + 0.7, cut + 0.2), 0.4), TRIM, cx, cy, at + tall)
    for (let k = 0; k < 4; k++) {
      const { ry, half, len } = boxFace(k, tw, td)
      const run = len - 2 * cut - 0.5
      const bays = Math.max(1, Math.floor(run / 3.3))
      const balconied = len >= Math.max(tw, td) - 0.01
      for (let f = 0; f < n; f++) {
        const up = at + f * STOREY
        for (let i = 0; i < bays; i++) {
          const lx = -run / 2 + (run / bays) * (i + 0.5)
          if (balconied && (i + f + t) % 2 === 0) {
            // A balcony, its glass door behind it, and for some plants over its lip and a trail down its front.
            kit.local(kit.cuboid(1.9, 2.3, 0.2), kit.pane(lit), cx, cy, ry, lx, half, up + 0.35)
            kit.local(BALCONY, vary((f + i) % 3 ? palette.pop : TRIM, 0.04), cx, cy, ry, lx, half, up - 0.1)
            if (own() < plants) {
              const side = own() < 0.5 ? -1 : 1
              clump(...to(cx, cy, ry, lx + side * 0.7, half + 0.95), up + 1.05, 0.55 + own() * 0.2, 0.8)
              if (own() < 0.45) clump(...to(cx, cy, ry, lx + side * 0.8, half + 1.4), up + 0.35, 0.36, 1.9)
              if (own() < 0.35) clump(...to(cx, cy, ry, lx - side * 0.65, half + 0.9), up + 1.0, 0.42, 0.85)
            }
          } else {
            kit.local(ORIEL, kit.pane(lit), cx, cy, ry, lx, half, up + 0.75)
            kit.local(SILL, TRIM, cx, cy, ry, lx, half, up + 0.55)
            kit.local(SILL, TRIM, cx, cy, ry, lx, half, up + 2.55)
          }
        }
      }
    }
    at += tall + 0.4
    if (t === count - 1) break
    // The next tier, and on the terrace it leaves: a lawn, a tree at the corner, a hedge along each arm.
    const [i, j] = CORNERS[(turn + t) % 4]
    const [nx, ny] = [cx + (i * step) / 2, cy + (j * step) / 2]
    const [ex, ey] = [cx - i * (tw / 2 - step / 2), cy - j * (td / 2 - step / 2)] // the middles of the terrace's arms
    kit.add(kit.cuboid(step - 0.5, 0.25, td - 2.4), LAWN, ex, cy, at)
    kit.add(kit.cuboid(tw - 2.4, 0.25, step - 0.5), LAWN, cx, ey, at)
    tree(ex + i * 0.1, ey + j * 0.1, at + 0.2, 0.95 + own() * 0.35)
    for (let b = 0; b < 3; b++) {
      clump(ex - i * 0.25, cy + j * (td / 2 - 2.2) * (b / 2 - 0.15), at + 0.55, 0.62 + own() * 0.25, 0.8)
      clump(cx + i * (tw / 2 - 2.2) * (b / 2 - 0.15), ey - j * 0.25, at + 0.55, 0.62 + own() * 0.25, 0.8)
    }
    // Leaves over the terrace's edge.
    clump(ex - i * (step / 2 - 0.1), cy - j * td * 0.18, at - 0.5, 0.5, 2.1)
    clump(cx - i * tw * 0.2, ey - j * (step / 2 - 0.1), at - 0.4, 0.46, 1.8)
    for (let v = 0; v < 4; v++) {
      if (own() < 0.7)
        clump(ex - i * (step / 2 + 0.05), cy + j * td * (0.3 - v * 0.17), at - 0.3 - own() * 0.8, 0.4 + own() * 0.2, 1.5 + own())
      if (own() < 0.7)
        clump(cx + i * tw * (0.3 - v * 0.17), ey - j * (step / 2 + 0.05), at - 0.3 - own() * 0.8, 0.4 + own() * 0.2, 1.5 + own())
    }
    ;[cx, cy, tw, td] = [nx, ny, tw - step, td - step]
  }

  // Its roof.
  const top = at
  if (stage === 3)
    kit.add(
      loft(oct(tw - 1.4, td - 1.4, 0.8), oct(tw - 1.4, td - 1.4, 0.8), 2.2),
      { material: kit.glass, tint: kit.windows[1] },
      cx,
      cy,
      top,
    )
  const base = stage === 3 ? top + 2.2 : top
  if (stage === 3) kit.add(loft(oct(tw - 0.6, td - 0.6, 1), oct(tw - 0.2, td - 0.2, 1.1), 0.4), TRIM, cx, cy, base)
  const roof = stage === 3 ? base + 0.4 : base
  const [rw, rd] = stage === 3 ? [tw - 0.6, td - 0.6] : [tw, td]
  if (beacon) {
    for (const k of pad ? [1, -1] : [1]) {
      const [bx, by] = [cx + k * (rw / 2 - 0.9), cy + k * (rd / 2 - 0.9)]
      kit.add(SHAPES.thin, TRIM, bx, by, roof, 0, 0.1, 2.2, 0.1)
      kit.beacon(bx, by, roof + 2.2 + 0.68, 0.85)
    }
  }
  if (pad) kit.helipad(cx, cy, roof + 0.25, Math.min(rw, rd) / 2 - 1.3)
  else if (form === 'stepped' || form === 'corner') {
    // A garden: a lawn, trees, a hedge, and a water tank on six sides.
    kit.add(loft(oct(rw - 1, rd - 1, 0.8), oct(rw - 1.3, rd - 1.3, 0.8), 0.45), LAWN, cx, cy, roof)
    tree(cx - rw * 0.2, cy + rd * 0.15, roof + 0.4, 1.15)
    tree(cx + rw * 0.22, cy - rd * 0.2, roof + 0.4, 0.85)
    for (let b = 0; b < 4; b++) clump(cx + rw * (0.3 - b * 0.2), cy - rd * 0.36, roof + 0.8, 0.6 + own() * 0.2, 0.8)
    kit.add(SHAPES.thin, TANK.body, cx + rw * 0.24, cy + rd * 0.22, roof + 0.4, 0, 1.15, 2.1, 1.15)
    kit.add(SHAPES.cone12, TANK.lid, cx + rw * 0.24, cy + rd * 0.22, roof + 2.5, 0, 1.3, 1, 1.3)
  } else if (form === 'core') {
    // A roof of two unequal slopes hipped at both ends, a glass dormer in the long one and a mast at one end.
    const [a, b, r] = [rw / 2, rd / 2, -rd * 0.2]
    kit.add(loft(oct(rw, rd, 0.6), [[-a + 2.2, r], [-a + 2.2, r], [a - 2.2, r], [a - 2.2, r], [a - 2.2, r + 0.02], [a - 2.2, r + 0.02], [-a + 2.2, r + 0.02], [-a + 2.2, r + 0.02]], 3.8), vary(palette.pop), cx, cy, roof) // prettier-ignore
    kit.add(
      loft(oct(2.6, 2.2, 0.5), oct(2.6, 2.2, 0.5), 1.9),
      { material: kit.glass, tint: kit.windows[0], glow: 1.3 },
      cx + rw * 0.12,
      cy - b * 0.45,
      roof + 0.6,
    )
    kit.add(loft(oct(3, 2.6, 0.6), oct(1.2, 0.8, 0.2), 0.8), TRIM, cx + rw * 0.12, cy - b * 0.45, roof + 2.5)
    kit.add(SHAPES.pyramid, AERIAL, cx - a + 2.4, cy - r, roof + 3.6, 0, 0.28, 5, 0.28)
  } else {
    // A cut gem: a roof drawn in to a smaller top off its middle, a lit lantern on it under a little cap.
    const [ox, oz] = [rw * 0.12, -rd * 0.1]
    kit.add(loft(oct(rw, rd, 1.1), oct(rw * 0.42, rd * 0.42, 0.5, ox, oz), 3.6), vary(palette.deep), cx, cy, roof)
    kit.add(
      loft(oct(rw * 0.3, rd * 0.3, 0.3, ox, oz), oct(rw * 0.3, rd * 0.3, 0.3, ox, oz), 1.3),
      { material: kit.glass, tint: kit.windows[0], glow: 1.3 },
      cx,
      cy,
      roof + 3.6,
    )
    kit.add(loft(oct(rw * 0.4, rd * 0.4, 0.4, ox, oz), oct(0.3, 0.3, 0.05, ox, oz), 1.5), vary(palette.pop), cx, cy, roof + 4.9)
  }
  kit.shadow(x, y, h, w * 1.4 + 3, d * 1.4 + 3)
  kit.brick('building', x, y, h)
}
