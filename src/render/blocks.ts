import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Field } from './field'
import { raised } from './shapes'

export const KERB = 1.2 // m a Block stands above the road: chunky on purpose, it is the toy look
const BEVEL = 0.24
const PAVEMENT = '#f1ede5'

/** Every Block as one mesh: a bevelled pavement slab raised from each outline of the field. A roundabout's island is one of them. */
export function createBlocks(field: Field): THREE.Mesh {
  const slabs = field.outlines(0).map((loop) => raised(loop, KERB, BEVEL))
  const geometry = slabs.length ? mergeGeometries(slabs) : new THREE.BufferGeometry()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: PAVEMENT, roughness: 0.85 }))
  mesh.castShadow = mesh.receiveShadow = true
  return mesh
}
