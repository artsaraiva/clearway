/**
 * Call `frame` once every frame the browser draws from now on, with the real seconds since the last, at most a tenth so
 * that a frame after the tab was hidden does not leap. Returns what stops it.
 */
export function everyFrame(frame: (dt: number) => void) {
  let running = true
  let last = performance.now()
  requestAnimationFrame(function loop(now) {
    if (!running) return
    // The first frame's timestamp can be earlier than the `last` taken at load, so never step back in time.
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000))
    last = now
    frame(dt)
    requestAnimationFrame(loop)
  })
  return () => {
    running = false
  }
}
