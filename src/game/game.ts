import { City, type Cell, type Layout, type Refusal, type Tile, type Zone } from '../city/city'
import { DT, Sim } from '../sim/sim'
import type { Change } from '../sim/spec'
import { junctionId } from '../sim/tiles'
import { ECONOMY } from '../tuning'

// A run of the game: the state beside the Sim. It holds the yen, the City, the Record and the one step of Undo, pays
// for the trips the Sim completes, and rebuilds the Sim whenever the City's roads change (ADR 0002). A Rezoning changes
// only what a Tile is built as, which the Sim does not read, so it runs on. The Changes live in the Sim's
// configuration, which every Rebuild carries over.

/**
 * Whether a placement can be made and the yen it takes: the Price, less the loop rebate. A legal placement goes ahead
 * only when it is `affordable`.
 */
export type Offer = { legal: true; swap: boolean; price: number; affordable: boolean } | { legal: false; reason: Refusal }

/** What an Undo returns to: the City as it was before the last placement, Swap or Rezoning, and the yen it took. */
interface Undo {
  tiles: Tile[]
  paid: number
  /** Every Change before a placement or a Swap, which the Rebuild that undoes it carries over. A Rezoning's Undo makes no Rebuild: null. */
  changes: Change[] | null
}

const WINDOW_STEPS = Math.round(ECONOMY.incomeWindow / DT)
const UNDO_STEPS = Math.round(ECONOMY.undoWindow / DT)

/** Of the Changes `changes`, the ones a Rebuild after a drop on `cell` carries over: a Swap's Tile's go back to defaults. */
const carried = (changes: Change[], cell: Cell, swap: boolean) => (swap ? changes.filter((c) => c.at !== junctionId(cell)) : changes)

/** The seed of a new run. */
export const newSeed = () => Math.floor(Math.random() * 2 ** 32)

export class Game {
  /** Picks the starting Tile and seeds every Sim of the run. */
  readonly seed: number
  /** A Free run: the Price is ¥0, so every Tile and Swap costs nothing. Its Record is kept apart from a normal run's. */
  readonly free: boolean
  yen: number
  /** The most trips per minute the City has carried while Holding. */
  record: number
  /**
   * Called after every Rebuild, Rezoning, Change and Reset, the moments a save of the run must not miss. Yen and the
   * Record move with every step, so a save keeps up with them on its own.
   */
  onUnsaved?: () => void
  private _city: City
  private _sim: Sim
  /** The Sim's completed trips already paid for. */
  private paid = 0
  /** Trips that arrived in each of the last `WINDOW_STEPS` steps of earning, as a ring, and their sum. */
  private arrivals = new Uint16Array(WINDOW_STEPS)
  private cursor = 0
  private trips = 0
  private last?: Undo
  /** Steps of earning since the last placement, Swap or Rezoning. */
  private sinceLast = 0

  /**
   * A new run: a new `seed` draws the starting Tile, and the Price of the next Tile is in hand. `free` makes it a Free
   * run. A test passes a fixed seed, and may start from its own `city` and `yen`. A saved run comes back with its seed,
   * `city`, `changes`, `yen` and `record`. The Sim starts at its Pre-warm: `step` until `sim.prewarmed`.
   */
  constructor(seed = newSeed(), start: { city?: City; changes?: Change[]; yen?: number; record?: number; free?: boolean } = {}) {
    this.seed = seed
    this.free = start.free ?? false
    this._city = start.city ?? City.start(seed)
    this.yen = start.yen ?? this.price
    this.record = start.record ?? 0
    this._sim = this.rebuild(start.changes ?? [])
  }

  get city() {
    return this._city
  }

  /** The simulation of the City as it stands. Every placement and Swap replaces it, and so does the Undo of one. */
  get sim() {
    return this._sim
  }

  /**
   * What the next Tile costs: nothing in a Free run. The loop rebate, the Undo refund and the Income floor all follow it,
   * so a Free run has no floor: it never needs to afford a fix.
   */
  get price() {
    return this.free ? 0 : this._city.price
  }

  /** Trips that arrived over the last minute of earning. */
  get tripsPerMinute() {
    return (this.trips * 60) / ECONOMY.incomeWindow
  }

  /** Yen per minute: the pay of the trips arriving, and never less than the floor. */
  get income() {
    return Math.max(this.tripsPerMinute * ECONOMY.pay, this.incomeFloor)
  }

  /** Whether the last placement, Swap or Rezoning can still be undone. */
  get undoable() {
    return this.last !== undefined && this.sinceLast < UNDO_STEPS
  }

  private get incomeFloor() {
    return this.price * ECONOMY.incomeFloor
  }

  /**
   * What dropping `layout`, turned `rotation`, on `cell` would take: a placement on an empty cell, a Swap on a taken one.
   * The Zone makes no difference.
   */
  offer(layout: Layout, rotation: number, cell: Cell): Offer {
    const swap = this._city.tileAt(cell) !== undefined
    const verdict = swap ? this._city.swap(layout, rotation, cell) : this._city.drop(layout, rotation, cell)
    if (!verdict.legal) return verdict
    const price = !swap && verdict.joins >= 2 ? this.price * (1 - ECONOMY.loopRebate) : this.price
    return { legal: true, swap, price, affordable: this.yen >= price }
  }

  /**
   * Place a Tile built as `zone` (none: unzoned), or make a Swap, which keeps the Tile's own Zone; pay for it and
   * rebuild. An illegal or unaffordable one changes nothing.
   */
  place(layout: Layout, rotation: number, cell: Cell, zone?: Zone): Offer {
    const offer = this.offer(layout, rotation, cell)
    if (!offer.legal || !offer.affordable) return offer
    const changes = this._sim.configuration()
    this.remember(offer.price, changes)
    this._city.place(layout, rotation, cell, zone)
    this.yen -= offer.price
    this.rebuild(carried(changes, cell, offer.swap))
    return offer
  }

  /**
   * Rezone the Tile on `cell`: build it as `zone`, or unzone it. It costs nothing and makes no Rebuild, so the Sim and
   * its traffic run on, and it can be undone like a placement. False, changing nothing, if no Tile is on `cell` or the
   * Tile is built as `zone` already.
   */
  rezone(cell: Cell, zone?: Zone): boolean {
    const tile = this._city.tileAt(cell)
    if (!tile || tile.zone === zone) return false
    this.remember(0, null)
    this._city.rezone(cell, zone)
    this.onUnsaved?.()
    return true
  }

  /**
   * The Sim that dropping `layout`, turned `rotation`, on `cell` would rebuild the City into, changing nothing in this
   * run: its network and Demand are the ones the drop would make. It is built for reading them, without the Pre-warm
   * or where Connections meet, and must not be stepped. `null` if the drop is refused. Whether it is affordable does
   * not matter.
   * ponytail: it builds the whole network, about 2 ms for a City of 20 Tiles and 6 ms for 40 on an M4 Pro, once for
   * each cell the Tile in the hand moves onto. Build only the dropped Tile's Junction against the network as it stands
   * if larger Cities make the hand stutter.
   */
  preview(layout: Layout, rotation: number, cell: Cell): Sim | null {
    const offer = this.offer(layout, rotation, cell)
    if (!offer.legal) return null
    const city = new City(this._city.tiles)
    city.place(layout, rotation, cell)
    return new Sim(city, carried(this._sim.configuration(), cell, offer.swap), this.seed, { prewarm: false, conflicts: false })
  }

  /**
   * Take back the last placement, Swap or Rezoning: the yen it took is returned, and the City is as it was before it.
   * Undoing a placement or a Swap rebuilds, with every Change as it was; undoing a Rezoning does not. Yen earned since is
   * kept. Refused once the window has passed.
   */
  undo() {
    if (!this.undoable) return false
    const { tiles, paid, changes } = this.last!
    this.last = undefined
    this._city = new City(tiles)
    this.yen += paid
    if (changes) this.rebuild(changes)
    else this.onUnsaved?.()
    return true
  }

  /** Make a Change. */
  apply(change: Change) {
    this._sim.apply(change)
    this.onUnsaved?.()
  }

  /** The Junction `at` back to its default configuration. */
  reset(at: string) {
    this._sim.reset(at)
    this.onUnsaved?.()
  }

  /** One step of the Sim, and the yen it earns. Nothing is earned during the Pre-warm. */
  step() {
    const earning = this._sim.prewarmed
    this._sim.step()
    const arrived = this._sim.completed - this.paid
    this.paid = this._sim.completed
    if (!earning) return

    this.trips += arrived - this.arrivals[this.cursor]
    this.arrivals[this.cursor] = arrived
    this.cursor = (this.cursor + 1) % WINDOW_STEPS
    // Below the floor, the difference is made up, so a jammed City can always afford a fix.
    const short = Math.max(0, this.incomeFloor - this.tripsPerMinute * ECONOMY.pay)
    this.yen += arrived * ECONOMY.pay + (short * DT) / 60
    if (this._sim.holding) this.record = Math.max(this.record, this.tripsPerMinute)
    this.sinceLast++
  }

  /** Keep the City as it stands for an Undo, which takes the place of the one before and opens its window. */
  private remember(paid: number, changes: Change[] | null) {
    this.last = { tiles: [...this._city.tiles], paid, changes }
    this.sinceLast = 0
  }

  /** A new Sim of the City, with `carried` as its configuration. No vehicle survives, and it starts at its Pre-warm. */
  private rebuild(carried: Change[]) {
    this.paid = 0
    this._sim = new Sim(this._city, carried, this.seed, { prewarm: false })
    this.onUnsaved?.()
    return this._sim
  }
}
