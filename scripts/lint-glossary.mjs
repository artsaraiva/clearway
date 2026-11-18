// The mechanical part of "Names come from the glossary" (CODING_STANDARDS.md): a few words GLOSSARY.md lists under
// _Avoid_ or Retired that are never right in new code, caught on the lines a change adds. The rest of the avoid lists
// are ordinary words (side, kind, level, loop) that only a reviewer can judge.
//
// Usage: node scripts/lint-glossary.mjs [--against <ref>]
//
// Without --against it reads the staged change, for the pre-commit hook; with it, what the branch adds since <ref>, for
// CI. Only added lines of src/ and scripts/ are read, so what main already says is left alone. A line that has to say
// the word carries `glossary-ok` in a comment. A line the same change removes elsewhere is a move, and is left alone.
import { execFileSync } from 'node:child_process'

/** Each word, where it counts, and the term to use. `comments` reads a line's comment alone: `street` is a field too. */
const WORDS = [
  { word: /\bDistricts?\b/, say: 'City (District is retired)' },
  {
    // Not the camera distance as a flag, a value or a file name (`--views street`, `-street.jpg`), nor what is accepted.
    word: /(?<![-,=/`.\w])streets?\b(?![-.,`]|['’]s furniture| (lights?|furniture|trees?)\b)/,
    comments: true,
    say: 'Road, or Kerbside for the pavement and what stands on it',
  },
  { word: /\bentrance/i, say: 'door for a building, Gateway for a Road at the City’s edge' },
  { word: /\bPieces?\b/, say: 'Tile, or part for a model’s box' },
  { word: /\b(spawn (point|rate)|intersection|gridlock|congestion|throughput|heatmap)s?\b/i, say: 'the glossary’s term' },
]

const against = process.argv.includes('--against') ? process.argv[process.argv.indexOf('--against') + 1] : null
const range = against ? [`${against}...HEAD`] : ['--cached']
const diff = execFileSync('git', ['diff', ...range, '-U0', '--no-color', '--', 'src', 'scripts'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

/** The comment on a line of TypeScript or JavaScript, near enough: from `//`, or a line inside a block comment. */
const commentOf = (line) => (/^\s*(\/\*|\*)/.test(line) ? line : (line.match(/\/\/.*$/)?.[0] ?? ''))

/** The lines the change removes: one of them added again is code moved, not written. */
const moved = new Set(
  diff
    .split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('--- '))
    .map((l) => l.slice(1).trim()),
)

const found = []
let file = ''
let at = 0
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) file = line.slice(6)
  else if (line.startsWith('@@')) at = Number(line.match(/\+(\d+)/)[1])
  else if (line.startsWith('+')) {
    const text = line.slice(1)
    if (/\.(ts|mjs)$/.test(file) && file !== 'scripts/lint-glossary.mjs' && !text.includes('glossary-ok') && !moved.has(text.trim()))
      for (const { word, comments, say } of WORDS) {
        const hit = (comments ? commentOf(text) : text).match(word)
        if (hit) found.push(`${file}:${at}: "${hit[0]}": say ${say}`)
      }
    at++
  }
}

if (found.length) {
  console.error(`Names come from the glossary (GLOSSARY.md):\n${found.map((f) => `  ${f}`).join('\n')}`)
  process.exit(1)
}
