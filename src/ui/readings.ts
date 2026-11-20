// How the screen writes the game's readings: yen, the names of the kind of run, and readings that change every frame.

/** An amount of yen, to the whole yen: "¥1,350". */
export const yen = (n: number) => `¥${Math.round(n).toLocaleString('en')}`

/** What the screen calls a run of the kind `free` says, and its Record: "Free run" and "free-run record", or "run" and "record". */
export const runWords = (free: boolean) => (free ? { run: 'Free run', record: 'free-run record' } : { run: 'run', record: 'record' })

/** Writes `value` with `write` only when it differs from the last one written. */
export function whenChanged(write: (value: string) => void) {
  let shown: string | undefined
  return (value: string) => {
    if (value !== shown) write((shown = value))
  }
}

/**
 * Write a reading that changes into `el`, a `.digits` element of the kit (./kit.css), with each digit in a cell as wide
 * as the widest digit, so the reading does not jitter as it counts. Zen Maru Gothic's digits are proportional and it has
 * no tabular figures to switch on. `text` is the game's own: a number with its ¥, % or words, never markup.
 */
export function writeDigits(el: HTMLElement, text: string) {
  el.innerHTML = text.replace(/\d/g, '<i>$&</i>')
}
