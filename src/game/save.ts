import { City, LAYOUTS, ZONES, type Cell, type Layout, type Zone } from '../city/city'
import type { Change } from '../sim/spec'
import { Game, LAST_STAGE, newSeed, type Stage } from './game'

// The autosave (.scratch/ui-ux/spec.md, "Save"): one save in localStorage for a normal run and one for a Free run, and
// no menu screen, so the page opens straight into the run last played. A save holds what it takes to build the City
// and its Junctions again, with each Tile's Stage, the yen and the Record. Vehicles and the Undo window are not saved,
// so loading is a Rebuild with a Pre-warm. There is no migration: a save that will not load gives way to a new run,
// which keeps the save's Record if that can be read.

/** Raise it whenever a save written before would load wrong: when its shape changes, or what its ids name. */
const VERSION = 3
/** Where each kind of run is saved, and which of the two the page opens on. */
const KEY = { run: 'clearway.run', freeRun: 'clearway.free-run', playing: 'clearway.playing' }
/** Seconds between saves for yen, the Record and each Tile's progress, which move with every step. */
const EVERY = 5
const NOTICE = {
  older: 'The saved City is from an older version, so this is a new run.',
  damaged: 'The saved City could not be loaded, so this is a new run.',
}

/** What a save holds. */
interface Save {
  version: number
  seed: number
  /**
   * The Tiles in the order they were placed, each Layout and Zone by its id, with its Stage and its progress toward the
   * next. An unzoned Tile's Zone and Stage are null, and its progress 0.
   */
  tiles: { cell: Cell; layout: Layout['id']; rotation: number; zone: Zone['id'] | null; stage: Stage | null; progress: number }[]
  /** Every Junction's configuration, as a Rebuild carries it over. */
  changes: Change[]
  yen: number
  record: number
}

const isAmount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
const isInteger = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** The save of `game`, as the text localStorage holds. */
export function saveOf(game: Game): string {
  const save: Save = {
    version: VERSION,
    seed: game.seed,
    tiles: game.city.tiles.map(({ cell, layout, rotation, zone }) => {
      const grown = game.stageOf(cell)
      return { cell, layout: layout.id, rotation, zone: zone?.id ?? null, stage: grown?.stage ?? null, progress: grown?.progress ?? 0 }
    }),
    changes: game.sim.configuration(),
    yen: game.yen,
    record: game.record,
  }
  return JSON.stringify(save)
}

/**
 * The run saved as `text`, of the kind `free` says, or a new run when there is no save. A save from an older version,
 * or a damaged one, gives way to a new run, which keeps the save's Record if that can be read, and `notice` says so in
 * one line. The Sim starts at its Pre-warm: `step` until `sim.prewarmed`.
 */
export function load(text: string | null, free: boolean): { game: Game; notice: string | null } {
  if (text === null) return { game: new Game(undefined, { free }), notice: null }
  let data: unknown
  try {
    data = JSON.parse(text)
    return { game: restore(data as Save, free), notice: null }
  } catch {
    const { version, record } = (data ?? {}) as Partial<Save>
    return {
      game: new Game(undefined, { free, record: isAmount(record) ? record : 0 }),
      notice: isInteger(version) && version < VERSION ? NOTICE.older : NOTICE.damaged,
    }
  }
}

/**
 * The run `save` holds, or an error for a save that will not load. It checks what would otherwise load wrong without
 * a sound; anything else missing or misshapen throws as the City and the Sim are built from it.
 */
function restore(save: Save, free: boolean): Game {
  if (save.version !== VERSION) throw new Error(`a save of version ${save.version}, not ${VERSION}`)
  if (!isInteger(save.seed) || !isAmount(save.yen) || !isAmount(save.record)) throw new Error('no seed, yen or Record')
  if (save.tiles.some(({ zone }) => zone !== null && !ZONES.some((z) => z.id === zone))) throw new Error('a Tile the game has no Zone for')
  // A zoned Tile has a Stage the game has and progress toward the next, and an unzoned one neither.
  const grown = ({ zone, stage, progress }: Save['tiles'][number]) =>
    zone === null ? stage === null && progress === 0 : isInteger(stage) && stage >= 1 && stage <= LAST_STAGE && isAmount(progress)
  if (!save.tiles.every(grown)) throw new Error('a Tile with a Stage the game has not, or progress that is no amount')
  const tiles = save.tiles.map(({ cell, layout, rotation, zone }) => ({
    cell: { x: cell.x, y: cell.y },
    layout: LAYOUTS.find((l) => l.id === layout)!,
    rotation,
    zone: ZONES.find((z) => z.id === zone),
  }))
  if (tiles.some(({ cell, layout, rotation }) => !layout || ![0, 1, 2, 3].includes(rotation) || !isInteger(cell.x) || !isInteger(cell.y)))
    throw new Error('a Tile the game has no Layout or place for')
  if (!tiles.length || new Set(tiles.map(({ cell }) => `${cell.x},${cell.y}`)).size < tiles.length)
    throw new Error('no Tile, or two on one cell')
  const city = new City(tiles)
  // In a City the rules built, every Tile could be swapped for itself: it matches its neighbours' edges and joins one.
  if (tiles.length > 1 && !tiles.every((t) => city.swap(t.layout, t.rotation, t.cell).legal)) throw new Error('a Tile the rules refuse')
  if (save.changes.some(({ priority = {} }) => Object.values(priority).some((rule) => rule !== 'main' && rule !== 'yield')))
    throw new Error('a Priority rule that is neither main nor yield')
  const stages = save.tiles.flatMap(({ cell, stage, progress }) =>
    stage === null ? [] : [{ cell: { x: cell.x, y: cell.y }, stage, progress }],
  )
  return new Game(save.seed, { city, changes: save.changes, yen: save.yen, record: save.record, free, stages })
}

/** The run the page plays, and the menu's two ways out of it. Each loads the page again. */
export interface Run {
  readonly game: Game
  /** One line on why the saved City did not load, when a new run took its place. */
  readonly notice: string | null
  /** A new run of the same kind, with a new seed, in place of this one. */
  newRun(): void
  /** The other kind of run, as it was saved: the Free run from a normal run, or back. */
  switchRun(): void
}

/**
 * The run the page opens on: the saved run last played, or the Free run with `?free`. From then on it saves itself
 * after every Rebuild, Change and Reset, every few seconds for yen, the Record and each Tile's progress, and as the
 * page is left. Dev only: `?seed=7` plays that run again and leaves the saves alone, as a Free run with `?free`.
 * ponytail: two tabs on one run each save their own City over the other's, and the last to write wins. Listen for the
 * `storage` event and quiet the older tab if players ever keep two open.
 */
export function openRun(params: URLSearchParams): Run {
  if (import.meta.env.DEV && params.has('seed')) return seeded(Number(params.get('seed')), params)
  const free = params.has('free') || read(KEY.playing) === 'free'
  write(KEY.playing, free ? 'free' : 'normal')
  const key = free ? KEY.freeRun : KEY.run
  const { game, notice } = load(read(key), free)
  /** Whether the page is loading again on another run, which this one must not be saved over. */
  let leaving = false
  const keep = () => {
    if (!leaving) write(key, saveOf(game))
  }
  game.onUnsaved = keep
  setInterval(keep, EVERY * 1000)
  addEventListener('pagehide', keep)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') keep()
  })
  // At once, so that a new run keeps its seed, and takes the place of a save that would not load.
  keep()
  return {
    game,
    notice,
    newRun() {
      leaving = true
      write(key, saveOf(new Game(undefined, { free, record: game.record })))
      location.reload()
    },
    switchRun() {
      keep()
      leaving = true
      write(KEY.playing, free ? 'normal' : 'free')
      go(params, (p) => p.delete('free'))
    },
  }
}

/** Dev only: the run of `seed`, never saved. The menu leaves it for a new seed, or for the other kind of run on this one. */
function seeded(seed: number, params: URLSearchParams): Run {
  const free = params.has('free')
  return {
    game: new Game(seed, { free }),
    notice: null,
    newRun: () => go(params, (p) => p.set('seed', String(newSeed()))),
    switchRun: () => go(params, (p) => (free ? p.delete('free') : p.set('free', ''))),
  }
}

/** Load the page again, with `params` as `change` leaves them. */
function go(params: URLSearchParams, change: (p: URLSearchParams) => void) {
  const next = new URLSearchParams(params)
  change(next)
  const query = next.toString()
  location.assign(query ? `?${query}` : location.pathname)
}

/** An item of localStorage, which a browser can refuse: then every load is a new run. */
function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Keep an item in localStorage. */
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Refused, or full: the run plays on, and the last save kept stands.
  }
}
