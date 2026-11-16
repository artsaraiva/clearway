import type { View } from '../render/view'

// North is the dark half of the needle.
const COMPASS = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
  <path d="M15 3l5 12h-10z" fill="#1b2030"/><path d="M15 27l-5-12h10z" fill="#c4c8d2"/><circle cx="15" cy="15" r="2" fill="#fff"/>
</svg>`
const RECENTER = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
  <path d="M3 9V5a2 2 0 0 1 2-2h4M17 3h4a2 2 0 0 1 2 2v4M23 17v4a2 2 0 0 1-2 2h-4M9 23H5a2 2 0 0 1-2-2v-4"/><circle cx="13" cy="13" r="3.2"/>
</svg>`
const TILT = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
  <path d="M3 18l7-8h13l-7 8z"/><path d="M8 7.5A6 6 0 0 1 14 4"/>
</svg>`

/**
 * The camera's buttons, bottom-right (.scratch/ui-ux/spec.md, "Camera"): the compass shows the heading and turns north
 * up, recenter frames the whole City, as `F` does, and the tilt toggle flips between the steepest tilt and the default.
 * It shows as pressed at the steepest.
 */
export function createCameraButtons(root: HTMLElement, view: View) {
  const box = document.createElement('div')
  box.className = 'camera'
  box.innerHTML = `
    <button class="glass round" aria-label="North up" title="North up">${COMPASS}</button>
    <button class="glass round" aria-label="Frame the whole City" title="Frame the whole City (F)">${RECENTER}</button>
    <button class="glass round" aria-label="Steep tilt" title="Steep tilt" aria-pressed="false">${TILT}</button>`
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
    /** The row the buttons stand in, which the Inspectors' toggles join. */
    box,
    /** Show the camera as it stands. Call it every frame. */
    update() {
      if (view.camera.heading !== heading) {
        heading = view.camera.heading
        needle.style.transform = `rotate(${heading.toFixed(4)}rad)`
      }
      if (view.camera.steep !== steep) {
        steep = view.camera.steep
        tilt.classList.toggle('on', steep)
        tilt.setAttribute('aria-pressed', String(steep))
      }
    },
  }
}
