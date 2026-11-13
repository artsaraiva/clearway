// PROTOTYPE (issue #16): full-screen pass. Ink lines from a normal + depth buffer, and a painterly filter. Throwaway.
import * as THREE from 'three'

/** GLSL value noise, shared with the ground shader. */
export const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D tColor, tNormal, tDepth;
  uniform vec2 px; // one CSS pixel, which is one texel of the normal buffer
  uniform float near, far, uInk, uPaint, uOrtho;
  uniform vec3 inkColor, haze;
  varying vec2 vUv;
  ${NOISE}
  float z(vec2 u) {
    float d = texture2D(tDepth, u).r;
    return uOrtho > 0.5 ? near + d * (far - near) : near * far / (far - d * (far - near));
  }
  vec3 n(vec2 u) { return texture2D(tNormal, u).rgb * 2.0 - 1.0; }

  // Kuwahara: of the four windows around a pixel, keep the mean of the calmest. Flattens detail into dabs
  // and keeps edges, which is what makes a render read as painted.
  vec3 kuwahara(vec2 uv, out vec3 blur) {
    vec3 best = vec3(0.0);
    float calm = 1e9;
    blur = vec3(0.0);
    for (int q = 0; q < 4; q++) {
      vec2 s = vec2(q == 0 || q == 2 ? -1.0 : 1.0, q < 2 ? -1.0 : 1.0) * px * 0.55;
      vec3 m = vec3(0.0), m2 = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4; j++) {
          vec3 c = texture2D(tColor, uv + s * vec2(float(i), float(j))).rgb;
          m += c;
          m2 += c * c;
        }
      }
      m /= 16.0;
      m2 = m2 / 16.0 - m * m;
      float v = m2.r + m2.g + m2.b;
      blur += m / 4.0;
      if (v < calm) { calm = v; best = m; }
    }
    return best;
  }

  void main() {
    vec2 p = vUv / px;
    vec2 wobble = vec2(noise(p / 22.0), noise(p / 22.0 + 31.0)) - 0.5;
    vec3 col = texture2D(tColor, vUv).rgb;

    if (uPaint > 0.5) {
      vec3 blur;
      col = kuwahara(vUv + wobble * 1.5 * px, blur);
      col += max(blur - 0.92, 0.0) * 0.8; // bloom, roughly: bright areas spill
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 1.2);
      col = mix(col, haze, smoothstep(0.5, 1.0, vUv.y) * 0.16); // distance haze toward the top of the frame
      col *= 1.0 + (noise(p / 2.5) - 0.5) * 0.05 + (noise(p / 45.0) - 0.5) * 0.05; // paper grain, uneven wash
      col *= 1.0 - 0.18 * pow(length(vUv - 0.5) * 1.3, 3.0);
    }

    if (uInk > 0.5) {
      // Wobble where the line lands, and how thick it is, so it reads as drawn rather than traced.
      vec2 u = vUv + wobble * 3.0 * px;
      vec2 o = px * mix(0.6, 1.5, noise(p / 60.0));
      vec2 l = u - vec2(o.x, 0), r = u + vec2(o.x, 0), d = u - vec2(0, o.y), t = u + vec2(0, o.y);
      // Depth: second difference, so tilted flat surfaces stay clean.
      float z0 = z(u), zl = z(l), zr = z(r), zd = z(d), zt = z(t);
      float edge = smoothstep(0.003, 0.006, (abs(zl + zr - 2.0 * z0) + abs(zd + zt - 2.0 * z0)) / z0);
      // Normals: creases inside a silhouette.
      vec3 n0 = n(u);
      edge = max(edge, smoothstep(0.3, 0.6, 4.0 - dot(n0, n(l)) - dot(n0, n(r)) - dot(n0, n(d)) - dot(n0, n(t))));
      edge *= smoothstep(0.12, 0.3, noise(p / 7.0)); // gaps in the stroke
      edge *= mix(1.0, 0.3, smoothstep(200.0, 600.0, min(min(z0, zl), min(zr, min(zd, zt))))); // thin out far props
      col = mix(col, inkColor, edge);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

type Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera

/**
 * Up to two renders, then a composite: the scene in colour and, for ink, the props alone as normals + depth
 * (anything on layer 1, such as the ground and paint, is left out). A quad then paints and inks the result.
 */
export function createPost(renderer: THREE.WebGLRenderer) {
  const color = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType })
  // Half the pixel density and no smoothing: the line comes out chunky.
  const normal = new THREE.WebGLRenderTarget(1, 1, {
    depthTexture: new THREE.DepthTexture(1, 1),
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })
  const normalMat = new THREE.MeshNormalMaterial()
  const uniforms = {
    tColor: { value: color.texture },
    tNormal: { value: normal.texture },
    tDepth: { value: normal.depthTexture },
    px: { value: new THREE.Vector2() },
    near: { value: 1 },
    far: { value: 1 },
    uInk: { value: 0 },
    uPaint: { value: 0 },
    uOrtho: { value: 0 },
    inkColor: { value: new THREE.Color() },
    haze: { value: new THREE.Color() },
  }
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader,
      depthTest: false,
    }),
  )
  quad.frustumCulled = false
  const quadCamera = new THREE.Camera()

  return {
    setSize(cssW: number, cssH: number) {
      const ratio = renderer.getPixelRatio()
      color.setSize(cssW * ratio, cssH * ratio)
      normal.setSize(cssW, cssH)
      uniforms.px.value.set(1 / cssW, 1 / cssH)
    },
    render(scene: THREE.Scene, camera: Camera, opts: { ink: boolean; paint: boolean; inkColor: number; haze: number }) {
      renderer.setRenderTarget(color)
      renderer.render(scene, camera)

      if (opts.ink) {
        const background = scene.background
        scene.background = null
        scene.overrideMaterial = normalMat
        camera.layers.set(0)
        renderer.setRenderTarget(normal)
        renderer.setClearColor(0x8080ff)
        renderer.render(scene, camera)
        camera.layers.enable(1)
        scene.overrideMaterial = null
        scene.background = background
      }

      uniforms.near.value = camera.near
      uniforms.far.value = camera.far
      uniforms.uInk.value = +opts.ink
      uniforms.uPaint.value = +opts.paint
      uniforms.uOrtho.value = +(camera instanceof THREE.OrthographicCamera)
      uniforms.inkColor.value.set(opts.inkColor)
      uniforms.haze.value.set(opts.haze)
      renderer.setRenderTarget(null)
      renderer.render(quad, quadCamera)
    },
  }
}
