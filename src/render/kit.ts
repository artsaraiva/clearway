import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { canvasTexture, gable, roundedBox, tint } from './shapes'

const TAU = Math.PI * 2
const WALLS = ['#f6efe4', '#f3dac6', '#e5efdf', '#dae7f2', '#f4e4b9', '#efd8dd', '#e3ddef', '#fbf7f0', '#cfe4df']
const ROOFS = ['#d9735b', '#5d7a96', '#6ba39a', '#c79f6a', '#8a80b3', '#e08a6b']
const TOWERS = ['#eef2f5', '#dfe9f1', '#f5f0e7', '#e3ecea', '#f3e8e1']
const LEAVES = {
  round: ['#86c96f', '#6db862', '#9bd47e', '#78bf68', '#8fcc73'],
  sakura: ['#f8bfd0', '#f4a8c0', '#fbd3df', '#f6b3c8'],
  pine: ['#4f9a6a', '#5aa874', '#468f60'],
}

const SPHERE = new THREE.SphereGeometry(1, 16, 12)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
const CONE = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0)
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

/** A colour (painted onto the shared soft-lit material) or a material of the kit. */
export type Look = string | THREE.Material
export type TreeKind = keyof typeof LEAVES
export type BuildingKind = 'house' | 'mid-rise' | 'tower'
export type Kit = ReturnType<typeof createKit>

/**
 * The building and tree kit: the pieces a Block is filled with. Pieces are placed in sim metres, `(x, y)` on the map
 * and `h` above the road, collected, and merged into one mesh per material. Every random choice comes from `rand`,
 * so the same stream builds the same town.
 */
export function createKit(rand: () => number) {
  const range = (a: number, b: number) => a + (b - a) * rand()
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]

  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  const glass = new THREE.MeshStandardMaterial({
    color: '#a9c4db',
    roughness: 0.22,
    metalness: 0.1,
    emissive: '#ffc78a',
    emissiveIntensity: 0,
  })
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff4dc', roughness: 0.4, emissive: '#ffd08a', emissiveIntensity: 0 })
  const water = new THREE.MeshStandardMaterial({ color: '#86cbef', roughness: 0.12, metalness: 0.05 })
  // Contact shadows: a blurred dark decal under every building and tree.
  const decal = (map: THREE.Texture, opacity: number) =>
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  const roundShadow = decal(
    canvasTexture(128, 128, (g) => {
      const fade = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      fade.addColorStop(0, 'rgba(25,35,50,0.6)')
      fade.addColorStop(0.5, 'rgba(25,35,50,0.28)')
      fade.addColorStop(1, 'rgba(25,35,50,0)')
      g.fillStyle = fade
      g.fillRect(0, 0, 128, 128)
    }),
    1,
  )
  const squareShadow = decal(
    canvasTexture(128, 128, (g) => {
      g.filter = 'blur(12px)'
      g.fillStyle = 'rgba(25,35,50,0.75)'
      g.fillRect(28, 28, 72, 72)
    }),
    0.8,
  )

  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const [m, q, up] = [new THREE.Matrix4(), new THREE.Quaternion(), new THREE.Vector3(0, 1, 0)]
  /** Add a geometry that is already in place (Three coordinates). The kit takes it over. */
  const push = (geo: THREE.BufferGeometry, look: Look) => {
    const material = typeof look === 'string' ? solid : look
    if (!parts.has(material)) parts.set(material, [])
    parts.get(material)!.push(typeof look === 'string' ? tint(geo, look) : geo)
  }
  /** Add a copy of a shape standing at `(x, y)`, `h` above the road, turned `ry` and scaled. */
  const add = (geo: THREE.BufferGeometry, look: Look, x: number, y: number, h: number, ry = 0, sx = 1, sy = 1, sz = 1) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone()
    push(g.applyMatrix4(m.compose(new THREE.Vector3(x, h, -y), q.setFromAxisAngle(up, ry), new THREE.Vector3(sx, sy, sz))), look)
  }

  // A building repeats one glass band per floor, so boxes are cut once per size.
  const boxes = new Map<string, THREE.BufferGeometry>()
  const box = (w: number, h: number, d: number, r: number, b: number) => {
    const key = [w, h, d, r, b].map((v) => v.toFixed(2)).join()
    if (!boxes.has(key)) boxes.set(key, roundedBox(w, h, d, r, b))
    return boxes.get(key)!
  }
  const shadow = (x: number, y: number, h: number, w: number, d: number, round = false) =>
    add(PLANE, round ? roundShadow : squareShadow, x, y, h + 0.05, 0, w, 1, d)

  return {
    add,
    push,
    box,
    shadow,
    glass,
    bulb,
    water,
    range,
    chance: (p: number) => rand() < p,

    /** A tree of size `s` (1 is about 6 m tall): a cluster of spheres, or stacked cones for a pine. */
    tree(x: number, y: number, h: number, s: number, kind: TreeKind) {
      add(CYLINDER, '#9a7457', x, y, h, 0, 0.36 * s, 3 * s, 0.36 * s)
      if (kind === 'pine') {
        for (let i = 0; i < 3; i++) {
          const r = s * (2.48 - i * 0.6)
          add(CONE, pick(LEAVES.pine), x, y, h + s * (1.6 + i * 1.44), 0, r, s * 2.8, r)
        }
      } else {
        const n = 3 + Math.floor(rand() * 3)
        for (let i = 0; i < n; i++) {
          const [a, out, k] = [rand() * TAU, i ? 1.2 * s : 0, s * (i ? range(1.44, 1.92) : 2.4)]
          add(
            SPHERE,
            pick(LEAVES[kind]),
            x + Math.cos(a) * out,
            y + Math.sin(a) * out,
            h + s * (i ? range(3.6, 5.4) : 4.2),
            0,
            k,
            k * 0.9,
            k,
          )
        }
      }
      shadow(x, y, h, s * 6.8, s * 6.8, true)
    },

    /**
     * A building on a footprint `w` (east–west) by `d`, centred on `(x, y)`: a wall box with a glass band per floor.
     * A house has one floor and a gable roof; `floors` is for the other two.
     */
    building(x: number, y: number, h: number, w: number, d: number, kind: BuildingKind, floors = 1) {
      if (kind === 'house') {
        ;[w, d] = [Math.min(w, 12), Math.min(d, 12)]
        const wall = range(4.4, 6.4)
        add(box(w, wall, d, 0.48, 0.2), pick(WALLS), x, y, h)
        add(box(w + 0.16, 1.04, d + 0.16, 0.56, 0.08), glass, x, y, h + wall * 0.42)
        const along = w >= d // the ridge runs the long way
        add(
          gable((along ? w : d) + 0.8, (along ? d : w) + 1.12, Math.min(w, d) * 0.42),
          pick(ROOFS),
          x,
          y,
          h + wall,
          along ? Math.PI / 2 : 0,
        )
        shadow(x, y, h, w * 1.45 + 2, d * 1.45 + 2)
        return
      }
      const tower = kind === 'tower'
      const [storey, color, corner] = [tower ? 2.96 : 3.4, pick(tower ? TOWERS : WALLS), tower ? 1.4 : 1]
      const top = h + floors * storey + 1.2
      add(box(w, top - h, d, corner, 0.32), color, x, y, h)
      for (let i = 0; i < floors; i++)
        add(box(w + 0.2, tower ? 1.68 : 1.36, d + 0.2, corner + 0.08, 0.08), glass, x, y, h + 1.28 + i * storey)
      if (tower) {
        // A set-back crown, and sometimes a mast.
        const [cw, cd] = [w * 0.66, d * 0.66]
        add(box(cw, 4, cd, 1, 0.24), color, x, y, top)
        add(box(cw + 0.16, 1.2, cd + 0.16, 1.08, 0.08), glass, x, y, top + 1.6)
        if (rand() < 0.6) add(CYLINDER, '#cfd5dc', x + cw * 0.2, y, top + 4, 0, 0.16, range(4.8, 9.6), 0.16)
      } else {
        // Rooftop clutter: a plant box, then a water tank or a few shrubs.
        if (rand() < 0.5) add(box(w * 0.32, 1.28, d * 0.3, 0.24, 0.12), '#d4d8dd', x - w * 0.2, y - d * 0.15, top)
        if (rand() < 0.35) {
          add(CYLINDER, '#c8a88a', x + w * 0.22, y + d * 0.2, top, 0, 1.12, 2.2, 1.12)
          add(CONE, '#b08d6e', x + w * 0.22, y + d * 0.2, top + 2.2, 0, 1.2, 0.8, 1.2)
        } else if (rand() < 0.4) {
          for (let i = 0; i < 3; i++) {
            const k = range(0.88, 1.28)
            add(SPHERE, pick(['#86c96f', '#9bd47e']), x + range(-w, w) * 0.3, y + range(-d, d) * 0.3, top + 0.4, 0, k, k * 0.8, k)
          }
        }
      }
      shadow(x, y, h, w * 1.4 + 2.4, d * 1.4 + 2.4)
    },

    /** A street lamp. */
    lamp(x: number, y: number, h: number) {
      add(CYLINDER, '#7d8794', x, y, h, 0, 0.14, 5, 0.14)
      add(SPHERE, bulb, x, y, h + 5.2, 0, 0.44, 0.44, 0.44)
    },

    /** A cylinder of radii `rx` (east–west) and `ry`, `height` tall. */
    drum(look: Look, x: number, y: number, h: number, rx: number, ry: number, height: number) {
      add(CYLINDER, look, x, y, h, 0, rx, height, ry)
    },

    ball(look: Look, x: number, y: number, h: number, r: number) {
      add(SPHERE, look, x, y, h, 0, r, r, r)
    },

    /** Everything added so far, as one mesh per material. The kit is spent after this. */
    meshes(): THREE.Mesh[] {
      const out = [...parts].map(([material, geos]) => {
        const mesh = new THREE.Mesh(mergeGeometries(geos), material)
        mesh.castShadow = !material.transparent
        mesh.receiveShadow = true
        if (material.transparent) mesh.renderOrder = 2
        for (const g of geos) g.dispose()
        return mesh
      })
      for (const g of boxes.values()) g.dispose()
      parts.clear()
      boxes.clear()
      return out
    },

    /** Light the windows and lamps, by the emissive strength of each: 0 is unlit. */
    setGlow(windows: number, lamps: number) {
      glass.emissiveIntensity = windows
      bulb.emissiveIntensity = lamps
    },
  }
}
