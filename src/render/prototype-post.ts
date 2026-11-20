// PROTOTYPE, throwaway (`./prototype-look`): what blends the faceted look's scene into one picture. Soft shade where
// things meet (ambient occlusion), a glow round what is lit, and a miniature's lens: the top and the foot of the
// frame out of focus, its corners a little darker. Not for main.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

// The lens: a blur that grows from a band in focus across the middle of the frame toward its top and its foot, a
// little more colour, and darker corners.
const LENS = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, blur: { value: 5 }, band: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float blur; uniform float band; varying vec2 vUv;
    void main() {
      float away = smoothstep(band, 0.5, abs(vUv.y - 0.5));
      float r = away * blur;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.2;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * texel * r) * 0.065;
        sum += texture2D(tDiffuse, vUv + vec2(cos(a + 0.39), sin(a + 0.39)) * texel * r * 0.5) * 0.035;
      }
      float grey = dot(sum.rgb, vec3(0.299, 0.587, 0.114));
      sum.rgb = mix(vec3(grey), sum.rgb, 1.12);
      vec2 q = vUv - 0.5;
      sum.rgb *= 1.0 - 0.32 * smoothstep(0.35, 0.95, length(q) * 1.25);
      gl_FragColor = sum;
    }`,
}

/** The scene drawn through the blend, in place of the renderer's own draw. The sky goes behind the scene as its background, as the page's gradient has it. */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const shade = new GTAOPass(scene, camera, 1, 1)
  shade.updateGtaoMaterial({ radius: 2.6, distanceExponent: 1.4, thickness: 1.4, scale: 1.25, samples: 16, screenSpaceRadius: false })
  shade.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 16 })
  shade.blendIntensity = 0.9
  composer.addPass(shade)
  const glow = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.42, 1)
  composer.addPass(glow)
  const lens = new ShaderPass(LENS)
  composer.addPass(lens)
  composer.addPass(new OutputPass())

  // The sky, as the page's gradient behind the canvas has it, drawn as the scene's background.
  const paper = document.createElement('canvas')
  ;[paper.width, paper.height] = [4, 256]
  const sky = new THREE.CanvasTexture(paper)
  sky.colorSpace = THREE.SRGBColorSpace
  scene.background = sky
  let shown = ''
  const paint = () => {
    const css = canvas.style.background
    if (css === shown) return
    shown = css
    const stops = css.match(/rgb\([^)]*\)|#[0-9a-f]{6}/gi)
    if (!stops || stops.length < 2) return
    const g = paper.getContext('2d')!
    const fade = g.createLinearGradient(0, 0, 0, 256)
    stops.forEach((c, i) => fade.addColorStop(i / (stops.length - 1), c))
    g.fillStyle = fade
    g.fillRect(0, 0, 4, 256)
    sky.needsUpdate = true
  }

  return {
    setSize(w: number, h: number) {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, h)
      const ratio = renderer.getPixelRatio()
      lens.uniforms.texel.value.set(1 / (w * ratio), 1 / (h * ratio))
      lens.uniforms.blur.value = 4.5 * ratio
    },
    /** Draw the scene, glowing as far as the lights are on (0 to 1). */
    render(lit: number) {
      paint()
      glow.strength = 0.06 + 0.2 * lit
      composer.render()
    },
  }
}
