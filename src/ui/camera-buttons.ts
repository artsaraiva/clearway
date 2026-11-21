import type { Drive } from '../render/camera'
import type { View } from '../render/view'
import './board.css'

// An arrowhead that points north, turned with the camera's heading.
const COMPASS = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3l5 16-5-3.5L7 19z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
</svg>`
const RECENTER = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 9V4.5h4.6M15.2 4.2H20v4.6M20 15v4.8h-4.6M9 20H4.2v-4.6"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>
</svg>`
const TILT = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 15l9-5 9 5-9 5z"/><path d="M12 3v6M9.5 5.5L12 3l2.5 2.5"/>
</svg>`

// The keys that move the camera while held, by where they sit on the keyboard, whatever the keyboard: W A S D and the
// arrows slide the view, Q and E turn it, and Z and X zoom. `R` and `F`, beside them, are taken: `R` turns the Layout
// in the hand and `F` frames the City.
const MOVES: Record<string, Partial<Drive>> = {
  KeyW: { up: 1 },
  ArrowUp: { up: 1 },
  KeyS: { up: -1 },
  ArrowDown: { up: -1 },
  KeyA: { right: -1 },
  ArrowLeft: { right: -1 },
  KeyD: { right: 1 },
  ArrowRight: { right: 1 },
  KeyQ: { turn: 1 },
  KeyE: { turn: -1 },
  KeyZ: { zoom: 1 },
  KeyX: { zoom: -1 },
}
const FAST = 2.5 // times as fast with Shift held

/** Whether a key pressed on `target` is typing, or working a control that takes the arrows. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/**
 * The camera's stickers, in a column on the right edge at mid-height (#243, "In play"): the compass shows the heading
 * and turns north up, recenter frames the whole City, as `F` does, and the tilt toggle flips between the steepest tilt
 * and the default. It is pressed, with a stamp-red ring, at the steepest. The keys that move the camera (`MOVES`) are
 * listened for here too: they move it for as long as they are held, faster with Shift.
 */
export function createCameraButtons(root: HTMLElement, view: View) {
  const box = document.createElement('div')
  box.className = 'camera'
  box.innerHTML = `
    <button class="sticker" aria-label="North up" title="North up">${COMPASS}</button>
    <button class="sticker" aria-label="Frame the whole City" title="Frame the whole City (F)">${RECENTER}</button>
    <button class="sticker" aria-label="Steep tilt" title="Steep tilt" aria-pressed="false">${TILT}</button>`
  root.append(box)
  const [compass, recenter, tilt] = box.querySelectorAll('button')
  const needle = compass.querySelector('svg')!

  compass.onclick = view.camera.northUp
  recenter.onclick = view.camera.frameCity
  tilt.onclick = view.camera.toggleTilt
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) view.camera.frameCity()
  })

  const held = new Set<string>()
  let fast = false
  window.addEventListener('keydown', (e) => {
    // With ⌘, Ctrl or Alt the key is the browser's, which may swallow its release: let go of every key.
    if (e.metaKey || e.ctrlKey || e.altKey) return held.clear()
    fast = e.shiftKey
    if (!(e.code in MOVES) || typing(e.target)) return
    held.add(e.code)
  })
  // On the capture phase, as a release must be heard while the Paused memo keeps the keys to itself.
  window.addEventListener(
    'keyup',
    (e) => {
      fast = e.shiftKey
      held.delete(e.code)
    },
    { capture: true },
  )
  // A key's release is lost to another window, and to the browser's menu.
  for (const lost of ['blur', 'contextmenu']) window.addEventListener(lost, () => held.clear())

  let [heading, steep, last] = [NaN, false, performance.now()]
  return {
    /** The column the stickers stand in, which the Inspectors' toggles join. */
    box,
    /** Show the camera as it stands. Call it every frame. */
    update() {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000) // real seconds, less a stall
      last = now
      // An open dialog, the Paused memo, keeps the keys to itself: a key held as it opened lets go.
      if (held.size && document.querySelector('dialog[open]')) held.clear()
      if (held.size) {
        const sum: Drive = { right: 0, up: 0, turn: 0, zoom: 0 }
        for (const code of held) for (const [k, v] of Object.entries(MOVES[code])) sum[k as keyof Drive] += v
        view.camera.drive(sum, dt, fast ? FAST : 1)
      }
      if (view.camera.heading !== heading) {
        heading = view.camera.heading
        needle.style.transform = `rotate(${heading.toFixed(4)}rad)`
      }
      if (view.camera.steep !== steep) {
        steep = view.camera.steep
        tilt.setAttribute('aria-pressed', String(steep))
      }
    },
  }
}
