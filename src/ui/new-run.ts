import { runWords } from './readings'

/**
 * New run's question (#243, "Paused" and "Title screen"), asked on a paper note in the theme before a saved City is
 * replaced: what the note holds for a run of the kind `free` says, whose Record is `record`. Its heading and its line
 * are `${id}-title` and `${id}-why`, for the note to be labelled and described by, and its answers `.keep` and `.start`.
 */
export function newRunQuestion(id: string, free: boolean, record: number) {
  const words = runWords(free)
  return `<span class="tape yellow"></span>
    <h2 id="${id}-title">Start a new ${words.run}?</h2>
    <p class="handwritten" id="${id}-why">${whyNewRun(free, record)}</p>
    <div class="answers">
      <button class="button keep">Keep this City</button>
      <button class="button primary start">Start a new ${words.run}</button>
    </div>`
}

/** The line of New run's question: the City goes, and its Record of `record` stays. */
export const whyNewRun = (free: boolean, record: number) =>
  `This City will be lost for good. Your ${runWords(free).record} of ${record} stays.`
