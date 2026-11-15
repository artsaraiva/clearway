/** px a pointer may travel during a press and still be a click. Past it the press is a drag, for the rest of it. */
export const CLICK_SLOP = 4

/** A point on the screen, as a pointer event gives it. */
export interface At {
  clientX: number
  clientY: number
}

/** How one press is handled, from the button going down to it coming up. */
export interface Gesture {
  /**
   * The pointer moved, from `from`, during a press that is a drag. The press becomes one on the move that takes it
   * past CLICK_SLOP, and that move comes from where the press began, so no movement is lost.
   */
  drag?(e: PointerEvent, from: At): void
  /** The press is over: `click` is whether it stayed a click. A cancelled press is not one. */
  end?(e: PointerEvent, click: boolean): void
}

/**
 * Tell clicks from drags on `el`. Each press asks `start` how to handle it, and `start` returns `null` to leave it
 * alone. A press is a click until the pointer has travelled CLICK_SLOP from where it went down, and a drag from then
 * on, even if it comes back. `el` keeps the pointer for the press, so a drag carries on over the screen's pills and
 * past the window's edge. Buttons pressed during a press belong to it, and the right button's menu never opens.
 */
export function watchPresses(el: HTMLElement, start: (e: PointerEvent) => Gesture | null) {
  let press: { id: number; gesture: Gesture; down: At; last: At; dragging: boolean } | null = null
  const at = (e: PointerEvent): At => ({ clientX: e.clientX, clientY: e.clientY })

  el.addEventListener('pointerdown', (e) => {
    if (press) return
    const gesture = start(e)
    if (!gesture) return
    el.setPointerCapture(e.pointerId)
    press = { id: e.pointerId, gesture, down: at(e), last: at(e), dragging: false }
  })
  el.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return
    const { down } = press
    if (!press.dragging && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) <= CLICK_SLOP) return
    press.dragging = true
    press.gesture.drag?.(e, press.last)
    press.last = at(e)
  })
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!press || e.pointerId !== press.id) return
    const { gesture, dragging } = press
    press = null
    gesture.end?.(e, !dragging && !cancelled)
  }
  el.addEventListener('pointerup', (e) => end(e, false))
  el.addEventListener('pointercancel', (e) => end(e, true))
  el.addEventListener('lostpointercapture', (e) => end(e, true))
  el.addEventListener('contextmenu', (e) => e.preventDefault())
}
