// PROTOTYPE (issue #16): map furniture for the stylised look. A route line, a destination pin, street names. Throwaway.
import * as THREE from 'three'
import { ribbons } from '../render/scene'
import type { Vec } from '../sim/geometry'
import type { Network } from '../sim/network'
import { armFrame, basic, decal } from './props'

const NAMES = ['Sakura-dori', 'Hikari Avenue', 'Midori Street', 'Kita Boulevard']
const BLUE = 0x2f8bff

/** A glowing route along `route` (sim polyline) with a pin at its end, plus a name painted along each arm. */
export function navLayer(net: Network, w: number, route: Vec[], road: number): THREE.Group {
  const group = new THREE.Group()
  if (route.length > 1) {
    const glow = basic(BLUE)
    Object.assign(glow, { transparent: true, opacity: 0.2, depthWrite: false })
    const flat = [new THREE.Mesh(ribbons([route], 5.5, 0.04), glow), new THREE.Mesh(ribbons([route], 1.6, 0.05), basic(BLUE))]
    for (const m of flat) m.layers.set(1)
    const end = route[route.length - 1]
    const pin = new THREE.Group().add(
      new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 4.4, 20).rotateX(Math.PI).translate(0, 2.2, 0),
        new THREE.MeshLambertMaterial({ color: 0xff5a5f }),
      ),
      new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 16).translate(0, 5.6, 0), new THREE.MeshLambertMaterial({ color: 0xff5a5f })),
      new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 12).translate(0, 5.6, 0).scale(1, 1, 2.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ),
    )
    pin.position.set(end.x, 0, -end.y)
    pin.traverse((o) => (o.castShadow = true))
    group.add(...flat, pin)
  }

  Object.values(net.gateways).forEach((arm, i) => {
    const f = armFrame(arm, w)
    // Run the text so it reads left to right from the default camera, south of the block.
    const along = f.u.x > 0.01 || (Math.abs(f.u.x) <= 0.01 && f.u.y > 0) ? f.u : { x: -f.u.x, y: -f.u.y }
    const label = decal(
      [640, 72],
      [44, 5],
      f.at(78, 0),
      along,
      (ctx) => {
        ctx.font = '600 46px "Helvetica Neue", Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 12
        ctx.strokeStyle = `#${road.toString(16).padStart(6, '0')}` // halo in road colour hides the centre line
        ctx.strokeText(NAMES[i % NAMES.length], 320, 38)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(NAMES[i % NAMES.length], 320, 38)
      },
      0.03,
    )
    label.layers.set(1)
    group.add(label)
  })
  return group
}
