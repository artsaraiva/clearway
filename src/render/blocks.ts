import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Field } from './field'

const KERB = 1.2 // m a Block stands above the road: chunky on purpose, it is the toy look
const BEVEL = 0.24
const PAVEMENT = '#f1ede5'

/** Every Block as one mesh: a bevelled pavement slab raised from each outline of the field. A roundabout's island is one of them. */
export function createBlocks(field: Field): THREE.Mesh {
  const slabs = field.outlines(0).map(
    (loop) =>
      new THREE.ExtrudeGeometry(new THREE.Shape(loop.map((p) => new THREE.Vector2(p.x, p.y))), {
        depth: KERB - BEVEL,
        bevelEnabled: true,
        bevelThickness: BEVEL,
        bevelSize: BEVEL,
        bevelOffset: -BEVEL,
        bevelSegments: 2,
      }),
  )
  // Extruded along +z from the sim's (x, y); turned so that it rises along +y at Three's (x, -y).
  const geometry = slabs.length ? mergeGeometries(slabs).rotateX(-Math.PI / 2) : new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: PAVEMENT, roughness: 0.85 }))
  mesh.castShadow = mesh.receiveShadow = true
  return mesh
}
