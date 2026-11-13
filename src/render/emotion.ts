import * as THREE from 'three'
import type { StuckCar } from './cars'
import { canvasTexture } from './shapes'

const MARKS = 60 // anger marks on screen at once; they go to the longest-stuck cars
const [STEAM_AFTER, SHOUT_AFTER] = [10, 9] // real seconds stuck
const STEAM = { life: 1, rise: 5, from: 1.2, to: 4.4, opacity: 0.75 } // s, m/s, then its size in m as it fades
const BUBBLE = { life: 1.8, width: 10.4, height: 5.2 }
// Flavour only: a bubble never carries information.
const SHOUTS = ['もう!', 'はやく!', 'HONK!', 'ちょっと!', 'ぐぬぬ…']

/**
 * Jam emotion, the main Jam signal in the world: an anger mark over each car stuck for a few real seconds, steam
 * from the ones stuck longer, and now and then a speech bubble.
 */
export function createJamEmotion() {
  const group = new THREE.Group()
  const sprite = (map: THREE.Texture, order: number, onTop: boolean) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, transparent: true, depthTest: !onTop, depthWrite: false, toneMapped: false }),
    )
    s.visible = false
    s.renderOrder = order
    group.add(s)
    return s
  }

  // The manga anger mark: four red arcs, back to back.
  const anger = canvasTexture(128, 128, (g) => {
    g.lineCap = 'round'
    for (const [width, color] of [
      [20, '#fff'],
      [11, '#ff3b46'],
    ] as const) {
      g.lineWidth = width
      g.strokeStyle = color
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const a = Math.atan2(-dy, -dx)
        g.beginPath()
        g.arc(64 + dx * 36, 64 + dy * 36, 26, a - 0.85, a + 0.85)
        g.stroke()
      }
    }
  })
  const cloud = canvasTexture(64, 64, (g) => {
    const fade = g.createRadialGradient(32, 32, 4, 32, 32, 30)
    fade.addColorStop(0, 'rgba(255,255,255,1)')
    fade.addColorStop(0.7, 'rgba(255,255,255,0.9)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = fade
    g.fillRect(0, 0, 64, 64)
  })
  const shouts = SHOUTS.map((text) =>
    canvasTexture(256, 128, (g) => {
      g.fillStyle = '#fff'
      g.strokeStyle = '#2f3440'
      g.lineWidth = 6
      g.lineJoin = 'round'
      g.beginPath()
      g.roundRect(8, 8, 240, 86, 40)
      g.fill()
      g.stroke()
      g.beginPath()
      g.moveTo(96, 93)
      g.lineTo(112, 122)
      g.lineTo(136, 93)
      g.fill()
      g.stroke()
      g.fillRect(100, 88, 32, 8)
      g.fillStyle = '#e0323c'
      g.font = "900 42px system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif"
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, 128, 53)
    }),
  )

  const marks = Array.from({ length: MARKS }, () => sprite(anger, 10, true))
  const steam = Array.from({ length: 80 }, () => ({ sprite: sprite(cloud, 8, false), life: 0 }))
  const bubbles = Array.from({ length: 6 }, () => ({ sprite: sprite(shouts[0], 11, true), life: 0 }))
  for (const b of bubbles) b.sprite.center.set(0.44, 0) // the tail's tip
  let t = 0
  let nextShout = 0

  return {
    group,

    /** `dt` is the real seconds since the last frame, 0 while paused. */
    update(angry: StuckCar[], dt: number) {
      t += dt
      angry.sort((a, b) => b.stuck - a.stuck)
      marks.forEach((mark, i) => {
        const car = angry[i]
        mark.visible = !!car
        if (!car) return
        mark.position.set(car.at.x + 0.8, car.at.y + 4, car.at.z)
        mark.scale.setScalar((1.8 + car.anger * 1.8) * (1 + 0.22 * Math.sin(t * 13 + i)))
      })

      for (const car of angry) {
        if (car.stuck < STEAM_AFTER || Math.random() > dt * 2) continue
        const puff = steam.find((p) => p.life <= 0)
        if (!puff) break
        puff.life = STEAM.life
        puff.sprite.position.set(car.at.x, car.at.y + 2.4, car.at.z)
      }
      for (const puff of steam) {
        puff.life -= dt
        puff.sprite.visible = puff.life > 0
        if (puff.life <= 0) continue
        const done = 1 - puff.life / STEAM.life
        puff.sprite.position.y += STEAM.rise * dt
        puff.sprite.scale.setScalar(STEAM.from + (STEAM.to - STEAM.from) * done)
        puff.sprite.material.opacity = Math.min(1, (1 - done) * 1.8) * STEAM.opacity
      }

      nextShout -= dt
      const loud = angry.filter((car) => car.stuck > SHOUT_AFTER)
      const free = bubbles.find((b) => b.life <= 0)
      if (nextShout <= 0 && loud.length && free) {
        nextShout = 0.5 + Math.random() * 0.6
        const car = loud[Math.floor(Math.random() * loud.length)]
        free.life = BUBBLE.life
        free.sprite.material.map = shouts[Math.floor(Math.random() * shouts.length)]
        free.sprite.position.set(car.at.x, car.at.y + 6, car.at.z)
      }
      for (const b of bubbles) {
        b.life -= dt
        b.sprite.visible = b.life > 0
        const pop = Math.min(1, (BUBBLE.life - b.life) / 0.15) * (1 + 0.06 * Math.sin(t * 20))
        b.sprite.scale.set(BUBBLE.width * pop, BUBBLE.height * pop, 1)
        b.sprite.material.opacity = Math.min(1, Math.max(0, b.life / 0.3))
      }
    },
  }
}
