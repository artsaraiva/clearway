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

/**
 * The camera's stickers, in a column on the right edge at mid-height (#243, "In play"): the compass shows the heading
 * and turns north up, recenter frames the whole City, as `F` does, and the tilt toggle flips between the steepest tilt
 * and the default. It is pressed, with a stamp-red ring, at the steepest.
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

  let [heading, steep] = [NaN, false]
  return {
    /** The column the stickers stand in, which the Inspectors' toggles join. */
    box,
    /** Show the camera as it stands. Call it every frame. */
    update() {
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
