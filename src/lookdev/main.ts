// Throwaway look-dev scene (ticket 03). Open /lookdev.html under `npm run dev`.
import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import district from '../../levels/district-01'
import { DT, Sim, VEHICLE_TYPES } from '../sim/sim'
import * as block from './block'
import { bakeField, groundMaterial } from './field'
import { createPost } from './ink'
import { HOUSE_BELOW, japanLayer } from './japan'
import { colors, inkWidth, type Look } from './look'
import { navLayer } from './nav'
import { buildingLayer, carLayer, markings, parkedCars, plazaLayer, signs, treeLayer } from './props'

const STRESS_CARS = 1000
const SPEED = 4 // sim seconds per real second, the game default
const deg = THREE.MathUtils.degToRad

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const hud = document.querySelector<HTMLElement>('#hud')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))

// PROTOTYPE (issue #16): ?look= is one digit per switch below, then the palette. All zeros is the Maps baseline.
const KEYS = { t: 'toon', o: 'outline', h: 'shadow', k: 'ink', j: 'japan', b: 'paint', n: 'nav', i: 'iso' } as const
const PALETTES = ['maps', 'warm', 'muted', 'golden']
const STYLISED = '101011113' // painterly golden hour; the inked look is 101110002
const BASELINE = '000000000'
const HAZE = 0xffe6c0
const look = {} as Look
function setLook(bits: string) {
  Object.values(KEYS).forEach((k, i) => (look[k] = bits[i] === '1'))
  look.pal = (+bits[Object.keys(KEYS).length] || 0) as Look['pal']
}
setLook(new URLSearchParams(location.search).get('look') ?? STYLISED)
const lookBits = () => [...Object.values(KEYS).map((k) => +look[k]), look.pal].join('')
const post = createPost(renderer)
const draw = () =>
  look.ink || look.paint
    ? post.render(scene, camera, { ink: look.ink, paint: look.paint, inkColor: colors(look).inkLine, haze: HAZE })
    : renderer.render(scene, camera)

const scene = new THREE.Scene()
const hemi = new THREE.HemisphereLight() // physical units: Lambert divides by π
const sun = new THREE.DirectionalLight()
sun.shadow.mapSize.set(4096, 4096)
Object.assign(sun.shadow.camera, { left: -330, right: 330, top: 330, bottom: -330, near: 1, far: 1200 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.15
scene.add(hemi, sun)
const world = new THREE.Group()
scene.add(world)

const HALF_FOV = Math.tan(deg(17.5))
const persp = new THREE.PerspectiveCamera(35, 1, 3, 4000)
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 3, 4000)
for (const cam of [persp, ortho]) cam.layers.enable(1) // layer 1: flat things the ink pass skips
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = persp
/** Half the height of the orthographic view at zoom 1, in metres. */
let orthoHalf = 90
const controls = new MapControls(camera, canvas)
Object.assign(controls, {
  enableDamping: true,
  zoomToCursor: true,
  minDistance: 25,
  maxDistance: 650,
  minZoom: 0.3,
  maxZoom: 10,
  minPolarAngle: deg(10),
  maxPolarAngle: deg(75),
})
/** How far a perspective camera would be for the current framing. */
const viewDistance = () => (camera === ortho ? orthoHalf / ortho.zoom / HALF_FOV : controls.getDistance())

/** Camera at `distance` m from a ground target, `tilt` degrees above the horizon, `azimuth` degrees from south. */
function view(distance = 270, tilt = look.iso ? 45 : 55, azimuth = look.iso ? -45 : -25, target = { x: 0, y: 0 }) {
  const [polar, az] = [deg(90 - tilt), deg(azimuth)]
  const d = camera === ortho ? 900 : distance // an orthographic camera just needs to stand clear of the scene
  if (camera === ortho) [orthoHalf, ortho.zoom] = [distance * HALF_FOV, 1]
  controls.target.set(target.x, 0, -target.y)
  camera.position.set(target.x + d * Math.sin(polar) * Math.sin(az), d * Math.cos(polar), -target.y + d * Math.sin(polar) * Math.cos(az))
  resize()
  controls.update()
}

/** Swap between the perspective and the isometric camera, keeping the framing. */
function setCamera(iso: boolean) {
  const next = iso ? ortho : persp
  if (next === camera) return
  const distance = viewDistance()
  const dir = camera.position.clone().sub(controls.target).normalize()
  if (iso) [orthoHalf, ortho.zoom] = [distance * HALF_FOV, 1]
  next.position.copy(controls.target).addScaledVector(dir, iso ? 900 : distance)
  camera = controls.object = next
  resize()
  controls.update()
}

const sim = new Sim(district)
const w = district.roadDefaults.laneWidth
const t0 = performance.now()
const field = bakeField(sim.net, w, block)
const bakeMs = performance.now() - t0
for (let i = 0; i < 900; i++) sim.step() // start with traffic on the roads
// The route line follows one car's planned path, frozen at load.
const routed = sim.vehicles.find((v) => v.path.length >= 2)
const route = routed ? [routed.lane, ...routed.path].flatMap((l) => l.line.pts) : []

let cars: ReturnType<typeof carLayer>
let layers: Record<string, THREE.Object3D> = {}

/** Rebuild every prop and light for the current look. The ground bake is reused. */
function build() {
  world.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose()
  })
  world.clear()
  const c = colors(look)
  scene.background = new THREE.Color(c.ground)
  scene.fog = look.iso ? null : new THREE.Fog(c.ground, 700, 1800) // an orthographic camera has no distance to fade over
  setCamera(look.iso)
  hemi.color.set(c.sky)
  hemi.groundColor.set(c.bounce)
  hemi.intensity = c.hemi
  sun.color.set(c.sun)
  sun.intensity = c.sunPower
  sun.position.set(c.sunDir[0], c.sunDir[1], c.sunDir[2]).normalize().multiplyScalar(500)
  sun.castShadow = renderer.shadowMap.enabled = look.shadow
  // Painted look: wide, diffused shadow edges.
  sun.shadow.radius = look.paint ? 4 : 1
  sun.shadow.map?.dispose()
  sun.shadow.map = null

  const ground = new THREE.Group()
  ground.add(
    new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), groundMaterial(field, c, look.ink, look.ink || look.paint)),
    plazaLayer(block.plazas, look),
  )
  if (look.shadow) {
    // The ground shader is unlit, so a tinted shadow catcher sits just above the paint.
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2).translate(0, 0.06, 0),
      new THREE.ShadowMaterial({ color: c.shade, opacity: look.paint ? 0.34 : 0.4, depthWrite: false }),
    )
    catcher.receiveShadow = true
    ground.add(catcher)
  }
  cars = carLayer(1500, look)
  const tall = block.buildings.filter((b) => b.h >= HOUSE_BELOW)
  const low = block.buildings.filter((b) => b.h < HOUSE_BELOW)
  layers = {
    ground,
    markings: markings(sim.net, w, 'E', look),
    trees: treeLayer(block.trees, look),
    buildings: buildingLayer(look.japan ? tall : block.buildings, look),
    japan: look.japan ? japanLayer(sim.net, w, low, tall, look) : new THREE.Group(),
    signs: signs(sim.net, w, 'N', 'E', look),
    nav: look.nav ? navLayer(sim.net, w, route, c.road) : new THREE.Group(),
    cars: cars.group,
  }
  world.add(...Object.values(layers))
  for (const flat of [ground, layers.markings, cars.blob]) flat.traverse((o) => o.layers.set(1))

  history.replaceState(null, '', `?look=${lookBits()}`)
  bar.replaceChildren(
    ...Object.entries(KEYS).map(([key, k]) => button(`${key.toUpperCase()} ${k}`, look[k], () => (look[k] = !look[k]))),
    button(`P palette: ${PALETTES[look.pal]}`, look.pal > 0, cycle),
    button('M maps ⇄ stylised', false, flip),
  )
}

const bar = document.querySelector<HTMLElement>('#bar')!
function button(label: string, on: boolean, act: () => void) {
  const b = document.createElement('button')
  b.textContent = label
  b.className = on ? 'on' : ''
  b.onclick = () => (act(), build())
  return b
}
const cycle = () => (look.pal = ((look.pal + 1) % PALETTES.length) as Look['pal'])
/** Maps baseline, or the full stylised look. */
const flip = () => setLook(lookBits() === BASELINE ? STYLISED : BASELINE)
build()

let stress = false
const parked = parkedCars(sim.net, STRESS_CARS, VEHICLE_TYPES[0])

function resize() {
  const { clientWidth: cw, clientHeight: ch } = canvas
  renderer.setSize(cw, ch, false)
  post.setSize(cw, ch)
  persp.aspect = cw / ch
  Object.assign(ortho, { left: (-orthoHalf * cw) / ch, right: (orthoHalf * cw) / ch, top: orthoHalf, bottom: -orthoHalf })
  persp.updateProjectionMatrix()
  ortho.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()
view()

let shots = 0
window.addEventListener('keydown', (e) => {
  if (e.key === 'r') view()
  else if (e.key === 'c') stress = !stress
  else if (e.key in KEYS) {
    const k = KEYS[e.key as keyof typeof KEYS]
    look[k] = !look[k]
    build()
  } else if (e.key === 'p') (cycle(), build())
  else if (e.key === 'm') (flip(), build())
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
    draw()
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) // forces a GPU sync; gl.finish may not block
  }
  return (performance.now() - t) / n
}

// Hooks for scripted screenshots and timing.
Object.assign(window, { lookdev: { view, bench, setStress: (on: boolean) => (stress = on) } })

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
  inkWidth.value = THREE.MathUtils.clamp(viewDistance() * 0.0009, 0.05, 0.45)
  draw()
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
