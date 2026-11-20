import { City, LAYOUTS, ZONES, type Cell, type Layout, type Zone } from '../city/city'
import type { Change } from '../sim/spec'
import { Game, LAST_STAGE, newSeed, type Stage } from './game'

// The autosave (.scratch/ui-ux/spec.md, "Save"): one save in localStorage for a normal run and one for a Free run. The
// page opens on the title screen (#243, "Title screen"), which sums up the saved run of the kind last played from its
// text alone, and the run is built as the player leaves the title. A save holds what it takes to build the City and
// its Junctions again, with each Tile's Stage, the yen and the Record. Vehicles and the Undo window are not saved, so
// loading is a Rebuild with a Pre-warm. There is no migration: a save that will not load gives way to a new run, which
// keeps the save's Record if that can be read and the save is of this version. Saves kept under the keys of the game's
// old name are carried over to the new keys as they are.

/** Raise it whenever a save written before would load wrong: when its shape changes, or what its ids name. */
const VERSION = 4
/** Where each kind of run is saved, and which of the two the page opens on. */
const KEY = { run: 'dioramania.run', freeRun: 'dioramania.free-run', playing: 'dioramania.playing' }
/** The same, from before the game was renamed Dioramania (docs/adr/0007-the-game-is-called-dioramania.md). */
const OLD_KEY: typeof KEY = { run: 'clearway.run', freeRun: 'clearway.free-run', playing: 'clearway.playing' }
/**
 * In sessionStorage, set while the page loads again to open a run at once rather than the title: the Paused memo's New
 * run and Free run switch. It is not a save, and goes as soon as it is read.
 */
const AT_ONCE = 'dioramania.at-once'
/** Seconds between saves for yen, the Record and each Tile's progress, which move with every step. */
const EVERY = 5
const NOTICE = {
  older: 'The saved City is from an older version, so this is a new run.',
  damaged: 'The saved City could not be loaded, so this is a new run.',
}

/** What a save keeps of the screen, beside the run. */
export interface Screen {
  /** Whether the Stage Inspector is on. */
  stageInspector: boolean
  /** Whether City notes is open. */
  cityNotes: boolean
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
  /** The Record: the highest Growth reached. Until version 4 it was the most trips a minute carried while Holding. */
  record: number
  /** Missing from a save written before the Stage Inspector, which then opens off: no reason to raise the version. */
  stageInspector?: boolean
  /** Missing from a save written before City notes, which then opens closed: no reason to raise the version either. */
  cityNotes?: boolean
}

const isAmount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
const isInteger = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)
/** A Record a save can hold: a Growth, which is a whole number. */
const isRecord = (n: unknown): n is number => isInteger(n) && n >= 0

/** The save of `game`, with what `screen` keeps of the screen, as the text localStorage holds. */
export function saveOf(game: Game, screen: Screen = { stageInspector: false, cityNotes: false }): string {
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
    stageInspector: screen.stageInspector,
    cityNotes: screen.cityNotes,
  }
  return JSON.stringify(save)
}

/**
 * The run saved as `text`, of the kind `free` says, with what it keeps of the screen, or a new run when there is no
 * save. A save from an older version, or a damaged one, gives way to a new run, and `notice` says so in one line. The
 * new run keeps a damaged save's Record if that can be read, but not an older one's, which may count something else.
 * The Sim starts at its Pre-warm: `step` until `sim.prewarmed`.
 */
export function load(text: string | null, free: boolean): { game: Game; notice: string | null; screen: Screen } {
  const screen = { stageInspector: false, cityNotes: false }
  if (text === null) return { game: new Game(undefined, { free }), notice: null, screen }
  let data: unknown
  try {
    data = JSON.parse(text)
    const game = restore(data as Save, free)
    const { stageInspector, cityNotes } = data as Save
    return { game, notice: null, screen: { stageInspector: stageInspector === true, cityNotes: cityNotes === true } }
  } catch {
    const { notice, record } = refused(data)
    return { game: new Game(undefined, { free, record }), notice, screen }
  }
}

/**
 * Why the save `data` will not load, in one line, and the Record a new run in its place keeps: a damaged save's if it
 * can be read, but not an older one's, which may count something else.
 */
function refused(data: unknown): { notice: string; record: number } {
  const { version, record } = (data ?? {}) as Partial<Save>
  const older = isInteger(version) && version < VERSION
  return { notice: older ? NOTICE.older : NOTICE.damaged, record: !older && isRecord(record) ? record : 0 }
}

/** What the title's stub says of a saved run: the count of its Tiles, the sum of their Stages (its Growth) and the Record. */
interface Summary {
  tiles: number
  growth: number
  record: number
}

/**
 * The saved run `text` summed up from the text alone, without building the run: none when there is no save, or when it
 * would not load, which `notice` then says in the line `load` gives. `record` is what a new run in its place keeps.
 * ponytail: it checks what `restore` checks before building the Game. A save that passes and still throws as its Sim is
 * built (misshapen Changes) promises a City that Play replaces with a new run, with the notice. Build the Sim here too if
 * such saves are ever seen.
 */
function summaryOf(text: string | null): { summary: Summary | null; notice: string | null; record: number } {
  if (text === null) return { summary: null, notice: null, record: 0 }
  let data: unknown
  try {
    data = JSON.parse(text)
    const save = data as Save
    check(save)
    const growth = save.tiles.reduce((sum, { stage }) => sum + (stage ?? 0), 0)
    return { summary: { tiles: save.tiles.length, growth, record: save.record }, notice: null, record: save.record }
  } catch {
    return { summary: null, ...refused(data) }
  }
}

/**
 * The run `save` holds, or an error for a save that will not load. It checks what would otherwise load wrong without
 * a sound; anything else missing or misshapen throws as the City and the Sim are built from it.
 */
function restore(save: Save, free: boolean): Game {
  const { city, stages } = check(save)
  return new Game(save.seed, { city, changes: save.changes, yen: save.yen, record: save.record, free, stages })
}

/**
 * The City `save` holds and each of its zoned Tiles' Stage, or an error for what would load wrong without a sound.
 * Nothing of the run is built but the City, which the rules check it by.
 */
function check(save: Save) {
  if (save.version !== VERSION) throw new Error(`a save of version ${save.version}, not ${VERSION}`)
  if (!isInteger(save.seed) || !isAmount(save.yen) || !isRecord(save.record)) throw new Error('no seed, yen or Record')
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
  return { city, stages }
}

/** The run the page plays, and the Paused memo's three ways out of it. Each loads the page again. */
export interface Run {
  readonly game: Game
  /** One line on why the saved City did not load, when a new run took its place and the title has not said so. */
  readonly notice: string | null
  /** What the save keeps of the screen, for the screen to change. */
  readonly screen: Screen
  /** A new run of the same kind, with a new seed, in place of this one. */
  newRun(): void
  /** The other kind of run, as it was saved: the Free run from a normal run, or back. */
  switchRun(): void
  /** Save the run and go back to the title screen. */
  title(): void
}

/** How the player leaves the title: Play, New run or Free run. */
type Leave = 'play' | 'new' | 'free'

/** The title screen's ways into a run, and what it says of the saved run Play opens. */
export interface Title {
  /** Whether Play opens the Free run: the kind of run last played. */
  readonly free: boolean
  /** The saved run of that kind, summed up from its text; none when there is no save, or it would not load. */
  readonly summary: Summary | null
  /** One line on why that saved run will not load, when it will not. */
  readonly notice: string | null
  /**
   * Build the run the player picked: Play opens the saved run of the kind last played, or a new one when there is none;
   * New run starts that kind again with a new seed, keeping the Record; Free run opens the Free run as it was saved.
   */
  leave(how: Leave): Run
}

/**
 * The run the page opens on, or the title screen, which waits for the player to pick one. A page opens on the title,
 * except when it loads again to open a run at once, which then is the saved run last played, or the Free run with
 * `?free`. From the moment it is built a run saves itself after every Rebuild, Change and Reset, every few seconds for
 * yen, the Record and each Tile's progress, and as the page is left. The title saves nothing. Dev only: `?seed=7`
 * skips the title and plays that run again, leaving the saves alone, as a Free run with `?free`.
 * ponytail: two tabs on one run each save their own City over the other's, and the last to write wins. Listen for the
 * `storage` event and quiet the older tab if players ever keep two open.
 */
export function openRun(params: URLSearchParams): Run | Title {
  if (import.meta.env.DEV && params.has('seed')) return seeded(Number(params.get('seed')), params)
  carryOver()
  const free = params.has('free') || read(KEY.playing) === 'free'
  if (takeAtOnce()) return begin(params, free)
  const { summary, notice, record } = summaryOf(read(free ? KEY.freeRun : KEY.run))
  return {
    free,
    summary,
    notice,
    leave(how) {
      if (how === 'new') return begin(params, free, new Game(undefined, { free, record }))
      // The title has said why the saved run of the kind last played will not load.
      return begin(params, how === 'free' || free, undefined, how === 'play' || free)
    },
  }
}

/**
 * Build the run of the kind `free` says and keep it saved: `fresh` in place of the save, or the saved run. `told` says
 * the title has already given the notice of a save that would not load.
 */
function begin(params: URLSearchParams, free: boolean, fresh?: Game, told = false): Run {
  write(KEY.playing, free ? 'free' : 'normal')
  const key = free ? KEY.freeRun : KEY.run
  const loaded = fresh ? { game: fresh, notice: null, screen: { stageInspector: false, cityNotes: false } } : load(read(key), free)
  const { game, screen } = loaded
  /** Whether the page is loading again on another run, which this one must not be saved over. */
  let leaving = false
  const keep = () => {
    if (!leaving) write(key, saveOf(game, screen))
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
    notice: told ? null : loaded.notice,
    screen,
    newRun() {
      leaving = true
      write(key, saveOf(new Game(undefined, { free, record: game.record })))
      atOnce()
      location.reload()
    },
    switchRun() {
      keep()
      leaving = true
      write(KEY.playing, free ? 'normal' : 'free')
      atOnce()
      go(params, (p) => p.delete('free'))
    },
    title() {
      keep()
      leaving = true
      go(params, (p) => p.delete('free'))
    },
  }
}

/** Keep under each new key what its old key holds while the new one is empty: the saves, and the kind of run last played. */
function carryOver() {
  for (const kind of Object.keys(KEY) as (keyof typeof KEY)[]) {
    const old = read(OLD_KEY[kind])
    if (old !== null && read(KEY[kind]) === null) write(KEY[kind], old)
  }
}

/** Have the page, as it loads again, open the run at once rather than the title. */
function atOnce() {
  try {
    sessionStorage.setItem(AT_ONCE, '')
  } catch {
    // Refused: the page opens on the title, and Play goes on from there.
  }
}

/** Whether the page loads again to open the run at once; asked once, as the page opens. */
function takeAtOnce() {
  try {
    const set = sessionStorage.getItem(AT_ONCE) !== null
    sessionStorage.removeItem(AT_ONCE)
    return set
  } catch {
    return false
  }
}

/**
 * Dev only: the run of `seed`, never saved. The menu leaves it for a new seed, or for the other kind of run on this one,
 * and its Title screen for the title of the saved runs.
 */
function seeded(seed: number, params: URLSearchParams): Run {
  const free = params.has('free')
  return {
    game: new Game(seed, { free }),
    notice: null,
    screen: { stageInspector: false, cityNotes: false },
    newRun: () => go(params, (p) => p.set('seed', String(newSeed()))),
    switchRun: () => go(params, (p) => (free ? p.delete('free') : p.set('free', ''))),
    title: () => go(params, (p) => p.delete('seed')),
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
