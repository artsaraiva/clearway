import { City, type Cell, type Layout, type Refusal, type Tile } from '../city/city'
import { DT, Sim } from '../sim/sim'
import type { Change } from '../sim/spec'
import { junctionId } from '../sim/tiles'
import { ECONOMY } from '../tuning'

// A run of the game: the state beside the Sim. It holds the yen, the City, the Record and the one step of Undo, pays
// for the trips the Sim completes, and rebuilds the Sim whenever the City changes (ADR 0002). The Changes live in the
// Sim's configuration, which every Rebuild carries over.

/**
 * Whether a placement can be made and the yen it takes: the Price, less the loop rebate. A legal placement goes ahead
 * only when it is `affordable`.
 */
export type Offer = { legal: true; swap: boolean; price: number; affordable: boolean } | { legal: false; reason: Refusal }

/** What an Undo returns to: the City and every Change as they were before the last placement or Swap, and the yen it took. */
interface Undo {
  tiles: Tile[]
  changes: Change[]
  paid: number
}

const WINDOW_STEPS = Math.round(ECONOMY.incomeWindow / DT)
const UNDO_STEPS = Math.round(ECONOMY.undoWindow / DT)

/** Of the Changes `changes`, the ones a Rebuild after a drop on `cell` carries over: a Swap's Tile's go back to defaults. */
const carried = (changes: Change[], cell: Cell, swap: boolean) => (swap ? changes.filter((c) => c.at !== junctionId(cell)) : changes)

export class Game {
  /** Picks the starting Tile and seeds every Sim of the run. */
  readonly seed: number
  /** A Free run: the Price is ¥0, so every Tile and Swap costs nothing. Its Record is kept apart from a normal run's. */
  readonly free: boolean
  yen: number
  /** The most trips per minute the City has carried while Holding. */
  record = 0
  private _city: City
  private _sim: Sim
  /** The Sim's completed trips already paid for. */
  private paid = 0
  /** Trips that arrived in each of the last `WINDOW_STEPS` steps of earning, as a ring, and their sum. */
  private arrivals = new Uint16Array(WINDOW_STEPS)
  private cursor = 0
  private trips = 0
  private last?: Undo
  /** Steps of earning since the last placement or Swap. */
  private sincePlacing = 0

  /**
   * A new run: a new `seed` draws the starting Tile, and the Price of the next Tile is in hand. `free` makes it a Free
   * run. A test passes a fixed seed, and may start from its own `city` and `yen`. The Sim starts at its Pre-warm: `step`
   * until `sim.prewarmed`.
   */
  constructor(seed = Math.floor(Math.random() * 2 ** 32), start: { city?: City; yen?: number; free?: boolean } = {}) {
    this.seed = seed
    this.free = start.free ?? false
    this._city = start.city ?? City.start(seed)
    this.yen = start.yen ?? this.price
    this._sim = this.rebuild([])
  }

  get city() {
    return this._city
  }

  /** The simulation of the City as it stands. Every placement, Swap and Undo replaces it. */
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

  /** Whether the last placement or Swap can still be undone. */
  get undoable() {
    return this.last !== undefined && this.sincePlacing < UNDO_STEPS
  }

  private get incomeFloor() {
    return this.price * ECONOMY.incomeFloor
  }

  /** What dropping `layout`, turned `rotation`, on `cell` would take: a placement on an empty cell, a Swap on a taken one. */
  offer(layout: Layout, rotation: number, cell: Cell): Offer {
    const swap = this._city.tiles.some((t) => t.cell.x === cell.x && t.cell.y === cell.y)
    const verdict = swap ? this._city.swap(layout, rotation, cell) : this._city.drop(layout, rotation, cell)
    if (!verdict.legal) return verdict
    const price = !swap && verdict.joins >= 2 ? this.price * (1 - ECONOMY.loopRebate) : this.price
    return { legal: true, swap, price, affordable: this.yen >= price }
  }

  /** Place a Tile or make a Swap, pay for it and rebuild. An illegal or unaffordable one changes nothing. */
  place(layout: Layout, rotation: number, cell: Cell): Offer {
    const offer = this.offer(layout, rotation, cell)
    if (!offer.legal || !offer.affordable) return offer
    const changes = this._sim.configuration()
    this.last = { tiles: [...this._city.tiles], changes, paid: offer.price }
    this.sincePlacing = 0
    this._city.place(layout, rotation, cell)
    this.yen -= offer.price
    this.rebuild(carried(changes, cell, offer.swap))
    return offer
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
   * Take back the last placement or Swap: the yen it took is returned, and the City and every Change are as they were
   * before it. Yen earned since is kept. Refused once the window has passed.
   */
  undo() {
    if (!this.undoable) return false
    const { tiles, changes, paid } = this.last!
    this.last = undefined
    this._city = new City(tiles)
    this.yen += paid
    this.rebuild(changes)
    return true
  }

  /** Make a Change. */
  apply(change: Change) {
    this._sim.apply(change)
  }

  /** The Junction `at` back to its default configuration. */
  reset(at: string) {
    this._sim.reset(at)
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
    this.sincePlacing++
  }

  /** A new Sim of the City, with `carried` as its configuration. No vehicle survives, and it starts at its Pre-warm. */
  private rebuild(carried: Change[]) {
    this.paid = 0
    return (this._sim = new Sim(this._city, carried, this.seed, { prewarm: false }))
  }
}
