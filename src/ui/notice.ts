import './board.css'

/** Seconds a notice stays before it fades. */
const STAY = 12

/**
 * One line on a taped paper note at the top of the screen, as when a saved City would not load. It fades after a while,
 * and a click lets it go at once.
 */
export function showNotice(root: HTMLElement, text: string) {
  const notice = document.createElement('div')
  notice.className = 'paper notice'
  notice.setAttribute('role', 'status')
  notice.innerHTML = '<span class="tape yellow"></span>'
  notice.append(text)
  root.append(notice)
  const fade = () => notice.classList.add('gone')
  notice.onclick = fade
  setTimeout(fade, STAY * 1000)
}
