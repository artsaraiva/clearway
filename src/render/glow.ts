import * as THREE from 'three'

/** Unlit and untouched by tone mapping, so it reads the same in any light: the look of Tool aids and Inspectors. */
export const glow = (color: number | string, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
