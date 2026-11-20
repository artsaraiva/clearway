/**
 * Write a reading that changes into `el`, a `.digits` element of the kit (./kit.css), with each digit in a cell as wide
 * as the widest digit, so the reading does not jitter as it counts. Zen Maru Gothic's digits are proportional and it has
 * no tabular figures to switch on. `text` is the game's own: a number with its ¥, % or words, never markup.
 */
export function writeDigits(el: HTMLElement, text: string) {
  el.innerHTML = text.replace(/\d/g, '<i>$&</i>')
}
