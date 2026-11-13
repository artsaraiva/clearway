// Throwaway look-dev scene (ticket 03). Open /lookdev.html under `npm run dev`.
import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import level from '../../levels/roundabout-01'
import { DT, Sim, VEHICLE_TYPES } from '../sim/sim'
import * as block from './block'
import { bakeField, groundMaterial, PALETTE } from './field'
import { buildingLayer, carLayer, markings, parkedCars, plazaLayer, signs, treeLayer } from './props'

const STRESS_CARS = 1000
const SPEED = 4 // sim seconds per real second, the game default
const deg = THREE.MathUtils.degToRad

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const hud = document.querySelector<HTMLElement>('#hud')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))

const scene = new THREE.Scene()
scene.background = new THREE.Color(PALETTE.ground)
scene.fog = new THREE.Fog(PALETTE.ground, 700, 1800)
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcbc3, 2.6)) // physical units: Lambert divides by π
const sun = new THREE.DirectionalLight(0xffffff, 1.0)
sun.position.set(-0.6, 1, 0.4)
scene.add(sun)

const camera = new THREE.PerspectiveCamera(35, 1, 3, 4000)
const controls = new MapControls(camera, canvas)
Object.assign(controls, {
  enableDamping: true,
  zoomToCursor: true,
  minDistance: 25,
  maxDistance: 650,
  minPolarAngle: deg(10),
  maxPolarAngle: deg(75),
})

/** Camera at `distance` m from a ground target, `tilt` degrees above the horizon, `azimuth` degrees from south. */
function view(distance = 270, tilt = 55, azimuth = -25, target = { x: 0, y: 0 }) {
  const [polar, az] = [deg(90 - tilt), deg(azimuth)]
  controls.target.set(target.x, 0, -target.y)
  camera.position.set(
    target.x + distance * Math.sin(polar) * Math.sin(az),
    distance * Math.cos(polar),
    -target.y + distance * Math.sin(polar) * Math.cos(az),
  )
  controls.update()
}

const sim = new Sim(level)
const w = level.roundabout.laneWidth
const t0 = performance.now()
const field = bakeField(sim.net, w, block)
const bakeMs = performance.now() - t0

const ground = new THREE.Group()
ground.add(new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), groundMaterial(field)), plazaLayer(block.plazas))
const cars = carLayer(1500)
const layers = {
  ground,
  markings: markings(sim.net, w, 'E'),
  trees: treeLayer(block.trees),
  buildings: buildingLayer(block.buildings),
  signs: signs(sim.net, w, 'N', 'E'),
  cars: cars.group,
}
scene.add(...Object.values(layers))

let stress = false
const parked = parkedCars(sim.net, STRESS_CARS, VEHICLE_TYPES[0])

function resize() {
  const { clientWidth: cw, clientHeight: ch } = canvas
  renderer.setSize(cw, ch, false)
  camera.aspect = cw / ch
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()
view()

let shots = 0
window.addEventListener('keydown', (e) => {
  if (e.key === 'r') view()
  else if (e.key === 'c') stress = !stress
  else if (e.key === 's') {
    canvas.toBlob((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob!)
      a.download = `lookdev-${String(++shots).padStart(2, '0')}.png`
      a.click()
    })
  } else if (/^[1-9]$/.test(e.key)) {
    const layer = Object.values(layers)[+e.key - 1]
    if (layer) layer.visible = !layer.visible
  }
})

/** Uncapped cost: ms per frame for n back-to-back renders, waiting on the GPU each time. */
function bench(n = 120) {
  const gl = renderer.getContext()
  const px = new Uint8Array(4)
  const t = performance.now()
  for (let i = 0; i < n; i++) {
    renderer.render(scene, camera)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) // forces a GPU sync; gl.finish may not block
  }
  return (performance.now() - t) / n
}

// Hooks for scripted screenshots and timing.
Object.assign(window, { lookdev: { view, layers, bench, setStress: (on: boolean) => (stress = on) } })

let [acc, last, since, frames, cpu] = [0, performance.now(), performance.now(), 0, 0]
requestAnimationFrame(function frame(now) {
  const start = performance.now()
  if (!stress) {
    acc += Math.min(0.1, (now - last) / 1000) * SPEED
    while (acc >= DT) {
      sim.step()
      acc -= DT
    }
  }
  last = now
  cars.update(stress ? parked : sim.vehicles)
  controls.update()
  renderer.render(scene, camera)
  cpu += performance.now() - start
  frames++
  if (now - since > 500) {
    const { calls, triangles } = renderer.info.render
    hud.textContent = [
      `${((frames * 1000) / (now - since)).toFixed(0)} fps · ${(cpu / frames).toFixed(1)} ms cpu/frame`,
      `${calls} draws · ${(triangles / 1000).toFixed(0)}k tris · ${renderer.getPixelRatio()}x`,
      `cars: ${stress ? `${parked.length} static` : `${sim.vehicles.length} live sim`} · bake ${bakeMs.toFixed(0)} ms`,
      Object.entries(layers)
        .map(([k, l], i) => `${i + 1} ${l.visible ? k : '·'.repeat(k.length)}`)
        .join('  '),
      'R reset · S screenshot · C 1000 cars',
    ].join('\n')
    ;[since, frames, cpu] = [now, 0, 0]
  }
  requestAnimationFrame(frame)
})
