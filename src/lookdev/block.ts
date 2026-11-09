import type { Vec } from '../sim/geometry'

// Hand-authored props for the look-dev block, in sim metres (x east, y north, roundabout centre at the origin).
// Echoes the reference: park to the north-west, tower to the north-east, low blocks to the south.
// Deriving these from the road graph is ticket 04's call.

export interface Building {
  pts: Vec[]
  h: number
}

export interface Tree {
  x: number
  y: number
  /** 0 round, 1 tall, 2 conifer */
  kind: 0 | 1 | 2
  s: number
}

const rect = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

/** Grass polygons. The ground shader trims them back from the kerb and off islands, so they may overlap roads. */
export const grass: Vec[][] = [
  rect(-220, 0, 0, 220), // park, NW
  rect(0, 0, 220, 70), // lawn in front of the tower, NE
  rect(-150, -150, -110, -60), // pocket lawn, SW
]

/** Paved plazas, slightly darker than the base. Kept clear of roads: they are drawn as flat meshes, not in the ground bake. */
export const plazas: Vec[][] = [rect(35, -120, 100, -50)]

export const buildings: Building[] = [
  { pts: rect(40, 82, 100, 185), h: 48 }, // tower, NE
  { pts: rect(118, 88, 190, 150), h: 16 },
  { pts: rect(118, 162, 190, 200), h: 22 },
  { pts: rect(-190, -195, -120, -165), h: 12 },
  { pts: [{ x: -100, y: -195 }, { x: -40, y: -195 }, { x: -40, y: -120 }, { x: -62, y: -120 }, { x: -62, y: -165 }, { x: -100, y: -165 }], h: 15 },
  { pts: rect(-195, -100, -165, -40), h: 9 },
  { pts: rect(115, -195, 190, -110), h: 20 },
  { pts: rect(40, -195, 95, -150), h: 10 },
]

const hash = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453
  return v - Math.floor(v)
}
const polar = (r: number, deg: number) => ({ x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180) })

const ringTrees: Tree[] = [28, 45, 62].flatMap((a, i) => [0, 90, 180, 270].map((q) => ({ ...polar(50, a + q), kind: (i % 2) as 0 | 1, s: 1 })))

/** Avenue rows along both sides of every arm, 4.5 m outside the kerb. */
const avenueTrees: Tree[] = [0, 90, 180, 270].flatMap((deg) =>
  [-1, 1].flatMap((side) =>
    Array.from({ length: 9 }, (_, i) => {
      const r = 74 + i * 14
      const a = (deg * Math.PI) / 180
      return { x: Math.cos(a) * r - Math.sin(a) * side * 13.5, y: Math.sin(a) * r + Math.cos(a) * side * 13.5, kind: (i % 2) as 0 | 1, s: 0.9 + 0.2 * hash(deg + i + side) }
    }),
  ),
)

/** Scattered shrubs and the odd conifer in the park. */
const parkTrees: Tree[] = []
for (let x = -190; x <= -30; x += 16) {
  for (let y = 30; y <= 190; y += 16) {
    const n = x * 31 + y
    const t = { x: x + (hash(n) - 0.5) * 9, y: y + (hash(n + 1) - 0.5) * 9 }
    if (Math.hypot(t.x, t.y) < 75) continue
    parkTrees.push(hash(n + 2) < 0.12 ? { ...t, kind: 2, s: 0.9 } : { ...t, kind: 0, s: 0.4 + 0.15 * hash(n + 3) })
  }
}

const plazaTrees: Tree[] = [45, 65, 85].flatMap((x) => [-62, -108].map((y) => ({ x, y, kind: 1 as const, s: 0.85 })))

export const trees: Tree[] = [...ringTrees, ...avenueTrees, ...parkTrees, ...plazaTrees]
