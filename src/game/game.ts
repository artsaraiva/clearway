import { City, type Cell, type Layout, type Refusal, type Tile, type Zone } from '../city/city'
import { DT, Sim } from '../sim/sim'
import type { Change } from '../sim/spec'
import { cellAt, junctionId } from '../sim/tiles'
import { Trips } from '../sim/trips.proto'
import { ECONOMY, STAGES } from '../tuning'

// A run of the game: the state beside the Sim. It holds the yen, the City, each zoned Tile's Stage, the Record and the
// one step of Undo, pays for the trips the Sim completes, grows each zoned Tile on the trips its Junction serves, and
// makes a new Sim whenever the City's roads change, which the traffic drives on in (ADR 0006). A Tile placed or swapped
// in changes them when it lands, at the end of its Assembly, and an Undo of a Tile that landed at once. A Rezoning
// changes only what a Tile is built as, which the Sim does not read, so it runs on. The Changes live in the Sim's
// configuration, which every new Sim carries over. A Stage lives here, beside the yen, since the Sim is replaced
// (ADR 0005).

/** How far a zoned Tile has grown. */
export type Stage = 1 | 2 | 3
/** The Stage a Tile grows no further than. */
export const LAST_STAGE = (STAGES.trips.length + 1) as Stage

/** A zoned Tile's Stage, and the trips its Junction has served toward the next: none at the last Stage. */
export interface TileStage {
  stage: Stage
  progress: number
}

/**
 * Whether a placement can be made and the yen it takes: the Price, less the loop rebate. A legal placement goes ahead
 * only when it is `affordable`.
 */
export type Offer = { legal: true; swap: boolean; price: number; affordable: boolean } | { legal: false; reason: Refusal }

/** What an Undo returns to: the City as it was before the last placement, Swap or Rezoning, and the yen it took. */
interface Undo {
  tiles: Tile[]
  paid: number
  /**
   * Every Change before a placement or a Swap, as the City as a whole had them (`changes`), which the new Sim that
   * undoes it once the Tile has landed carries over. A Rezoning's Undo changes no road, and neither does the Undo of a
   * Tile still in its Assembly: null for a Rezoning.
   */
  changes: Change[] | null
  /** A Rezoning's: the rezoned Tile's Junction, and the Stage the Tile had, which undoing it puts back. None: the Tile had no Zone. */
  rezoned?: { id: string; stage: TileStage | undefined }
}

const WINDOW_STEPS = Math.round(ECONOMY.incomeWindow / DT)
const UNDO_STEPS = Math.round(ECONOMY.undoWindow / DT)

/** The Changes `changes` without those of the Junctions on `cells`, which start at their defaults. */
const without = (changes: Change[], cells: Cell[]) => {
  const ids = new Set(cells.map(junctionId))
  return changes.filter((c) => !ids.has(c.at))
}

/** The seed of a new run. */
export const newSeed = () => Math.floor(Math.random() * 2 ** 32)

export class Game {
  /** Picks the starting Tile and seeds every Sim of the run. */
  readonly seed: number
  /** A Free run: the Price is ¥0, so every Tile and Swap costs nothing. Its Record is kept apart from a normal run's. */
  readonly free: boolean
  yen: number
  /**
   * The highest Growth reached in any run of this kind, this one included: a new run carries it over. It rises the
   * moment Growth passes it, and stays when Growth falls, as on an Undo or a Rezoning.
   */
  record: number
  /**
   * Called after every placement, Swap, landing, Undo, Rezoning, Change and Reset, the moments a save of the run must not
   * miss. Yen, the Record and each Tile's progress move with every step, so a save keeps up with them on its own.
   */
  onUnsaved?: () => void
  /** Called as a zoned Tile reaches another Stage: as it grows, or as `setStage` puts it there. */
  onStage?: (cell: Cell, from: Stage, to: Stage) => void
  /** Dev only: a multiplier on the pace of growth. Each trip a Junction serves counts as this many. */
  pace = 1
  /** PROTOTYPE (#303): the trips between Tiles, in a run opened with `?trips`. Tiles then grow by their Needs. */
  readonly tileTrips?: Trips
  private _city: City
  private _sim: Sim
  /** The Sim's completed trips already paid for. */
  private paid = 0
  /** Trips that arrived in each of the last `WINDOW_STEPS` steps of earning, as a ring, and their sum. */
  private arrivals = new Uint16Array(WINDOW_STEPS)
  private cursor = 0
  private trips = 0
  private last?: Undo
  /**
   * Steps of earning since the last placement, Swap or Rezoning, not counting those while a Tile is in its Assembly:
   * the traffic earns all along (ADR 0006), and the window would otherwise run out while the Tile lands.
   */
  private sinceLast = 0
  /** Each zoned Tile's Stage, by its Junction's id. A zoned Tile with none is at Stage 1 with no progress. */
  private stages = new Map<string, TileStage>()
  /** The trips each Junction of the Sim had served when the Tiles last grew on them, by its index. */
  private credited = new Uint32Array(0)

  /**
   * A new run: a new `seed` draws the starting Tile, and the Price of the next Tile is in hand. `free` makes it a Free
   * run. A test passes a fixed seed, and may start from its own `city` and `yen`. A saved run comes back with its seed,
   * `city`, `changes`, `yen`, `record` and the `stages` of its zoned Tiles. A `record` under the City's Growth rises to
   * it. The Sim starts at its Pre-warm: `step` until `sim.prewarmed`.
   */
  constructor(
    seed = newSeed(),
    start: {
      city?: City
      changes?: Change[]
      yen?: number
      record?: number
      free?: boolean
      stages?: ({ cell: Cell } & TileStage)[]
      trips?: boolean
    } = {},
  ) {
    this.seed = seed
    this.free = start.free ?? false
    if (start.trips) this.tileTrips = new Trips(seed)
    this._city = start.city ?? City.start(seed)
    this.yen = start.yen ?? this.price
    this.record = start.record ?? 0
    for (const { cell, stage, progress } of start.stages ?? [])
      if (this._city.tileAt(cell)?.zone) this.stages.set(junctionId(cell), { stage, progress })
    this.reach()
    this._sim = this.simulate(start.changes ?? [])
  }

  get city() {
    return this._city
  }

  /**
   * The simulation of the City's Tiles that have landed. Every Tile landing replaces it, a Swap's too, and so does the
   * Undo of a placement or a Swap that landed.
   */
  get sim() {
    return this._sim
  }

  /**
   * Every Junction's configuration as the City as a whole has it, as Changes: the Sim's, but for the Junctions of the
   * Tiles in their Assembly, which land with their defaults. A swapped one's Changes in the Sim are its old Layout's.
   */
  get changes(): Change[] {
    return without(
      this._sim.configuration(),
      this._city.assembling.map((t) => t.cell),
    )
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

  /** The Stage of the Tile on `cell`, and its progress toward the next. None for an unzoned Tile, which never grows, or an empty cell. */
  stageOf(cell: Cell): TileStage | undefined {
    if (!this._city.tileAt(cell)?.zone) return undefined
    const grown = this.stages.get(junctionId(cell)) ?? { stage: 1 as Stage, progress: 0 }
    if (!this.tileTrips || grown.stage === LAST_STAGE) return grown
    // PROTOTYPE (#303): progress is the share of the Tile's Needs that is full, on the scale the screen reads.
    const needs = this.tileTrips.needs(junctionId(cell))
    const share = needs.reduce((s, n) => s + Math.min(1, n.count / n.full), 0) / (needs.length || 1)
    return { stage: grown.stage, progress: share * STAGES.trips[grown.stage - 1] }
  }

  /** Whether a Jam holds the Tile on `cell` back from its next Stage: a zoned Tile short of the last whose Junction is in a Jam. */
  heldBack(cell: Cell): boolean {
    const grown = this.stageOf(cell)
    return !this.tileTrips && !!grown && grown.stage < LAST_STAGE && this._sim.jams.some((j) => j.id === junctionId(cell))
  }

  /** The City's Growth: the sum of the Stages of its zoned Tiles. */
  get growth() {
    return this._city.tiles.reduce((sum, t) => sum + (this.stageOf(t.cell)?.stage ?? 0), 0)
  }

  /**
   * Dev only: put the zoned Tile on `cell` at `stage`, with no progress, as if it had grown there; lower too, which no
   * Tile in play ever goes. False, changing nothing, if no zoned Tile is on `cell`.
   */
  setStage(cell: Cell, stage: Stage): boolean {
    const now = this.stageOf(cell)
    if (!now) return false
    this.stages.set(junctionId(cell), { stage, progress: 0 })
    this.syncTrips()
    this.reach()
    if (stage !== now.stage) this.onStage?.(cell, now.stage, stage)
    return true
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
   * The Zone makes no difference. A drop may follow others still in their Assembly, and a placement pays the Price of
   * its place in the order.
   */
  offer(layout: Layout, rotation: number, cell: Cell): Offer {
    const swap = this._city.tileAt(cell) !== undefined
    const verdict = swap ? this._city.swap(layout, rotation, cell) : this._city.drop(layout, rotation, cell)
    if (!verdict.legal) return verdict
    const price = !swap && verdict.joins >= 2 ? this.price * (1 - ECONOMY.loopRebate) : this.price
    return { legal: true, swap, price, affordable: this.yen >= price }
  }

  /**
   * Place a Tile built as `zone` (none: unzoned), or make a Swap, which keeps the Tile's own Zone and Stage, and pay for
   * it. Either starts the Tile's Assembly: the traffic runs as before, on the Tile before for a Swap, until it lands
   * (`land`). An illegal or unaffordable one changes nothing.
   */
  place(layout: Layout, rotation: number, cell: Cell, zone?: Zone): Offer {
    const offer = this.offer(layout, rotation, cell)
    if (!offer.legal || !offer.affordable) return offer
    this.remember(offer.price, this.changes)
    this._city.place(layout, rotation, cell, zone, { assembling: true })
    this.yen -= offer.price
    this.reach()
    this.onUnsaved?.()
    return offer
  }

  /**
   * Land the first Tile in its Assembly, as the screen says it has: the network grows by it, or a swapped Tile's Layout
   * takes the place of the one before, and the traffic drives on (ADR 0006). Every Change stays in force but the
   * swapped Tile's, which go back to their defaults. False, changing nothing, if no Tile is in its Assembly.
   */
  land(): boolean {
    const tile = this._city.land()
    if (!tile) return false
    this.simulate(without(this._sim.configuration(), [tile.cell]), this._sim)
    return true
  }

  /**
   * Rezone the Tile on `cell`: build it as `zone`, which starts it again at Stage 1, or unzone it. It costs nothing and
   * changes no road, so the Sim and its traffic run on, and it can be undone like a placement. False, changing nothing,
   * if no Tile is on `cell`, the Tile is built as `zone` already, or it is in its Assembly.
   */
  rezone(cell: Cell, zone?: Zone): boolean {
    const tile = this._city.tileAt(cell)
    if (!tile || tile.zone === zone || this._city.assembling.includes(tile)) return false
    const id = junctionId(cell)
    this.remember(0, null, { id, stage: this.stageOf(cell) })
    this._city.rezone(cell, zone)
    this.stages.delete(id)
    this.syncTrips()
    this.reach()
    this.onUnsaved?.()
    return true
  }

  /**
   * A Sim of the whole City with `layout`, turned `rotation`, dropped on `cell`, every Tile in its Assembly landed,
   * changing nothing in this run: its network and Demand are the ones the drop would make. It is built for reading
   * them, without the Pre-warm or where Connections meet, and must not be stepped. `null` if the drop is refused.
   * Whether it is affordable does not matter.
   * ponytail: it builds the whole network, about 2 ms for a City of 20 Tiles and 6 ms for 40 on an M4 Pro, once for
   * each cell the Tile in the hand moves onto. Build only the dropped Tile's Junction against the network as it stands
   * if larger Cities make the hand stutter.
   */
  preview(layout: Layout, rotation: number, cell: Cell): Sim | null {
    const offer = this.offer(layout, rotation, cell)
    if (!offer.legal) return null
    const city = new City(this._city.tiles)
    city.place(layout, rotation, cell)
    return new Sim(city, without(this.changes, [cell]), this.seed, { prewarm: false, conflicts: false })
  }

  /**
   * A Sim of the whole City, every Tile in its Assembly landed, built for reading as a `preview`'s is: the network
   * a Tile in its Assembly is built on, and the Demand a drop now changes. It must not be stepped.
   */
  plan(): Sim {
    return new Sim(new City(this._city.tiles), this.changes, this.seed, { prewarm: false, conflicts: false })
  }

  /**
   * Take back the last placement, Swap or Rezoning: the yen it took is returned, and the City is as it was before it.
   * Undoing a placement or a Swap that landed makes a new Sim at once, with every Change as it was, and the traffic
   * drives on in it (ADR 0006): the vehicles on a Tile taken off, or inside a swapped Tile's Junction, are removed.
   * Undoing a placement or a Swap still in its Assembly takes it off at once, and the traffic, which never reached it,
   * runs on as it is. Undoing a Rezoning changes no road either, and puts back the Stage the Tile had. A Tile the Undo
   * takes off takes its Stage with it. Yen earned and Stages grown since are kept. Refused once the window has passed.
   */
  undo() {
    if (!this.undoable) return false
    const { tiles, paid, changes, rezoned } = this.last!
    this.last = undefined
    const assembling = this._city.assembling
    this._city = new City(tiles, this._city)
    const landed = !assembling.some((t) => !tiles.includes(t))
    const placed = new Set(tiles.map((t) => junctionId(t.cell)))
    for (const id of [...this.stages.keys()]) if (!placed.has(id)) this.stages.delete(id)
    if (rezoned?.stage) this.stages.set(rezoned.id, rezoned.stage)
    else if (rezoned) this.stages.delete(rezoned.id)
    this.yen += paid
    // Undoing a Rezoning puts back a Stage, which with the Stages grown since can take Growth past the Record.
    this.reach()
    if (changes && landed) this.simulate(changes, this._sim)
    else this.onUnsaved?.()
    this.syncTrips()
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
    this.grow(earning)
    if (!earning) return

    this.trips += arrived - this.arrivals[this.cursor]
    this.arrivals[this.cursor] = arrived
    this.cursor = (this.cursor + 1) % WINDOW_STEPS
    // Below the floor, the difference is made up, so a jammed City can always afford a fix.
    const short = Math.max(0, this.incomeFloor - this.tripsPerMinute * ECONOMY.pay)
    this.yen += arrived * ECONOMY.pay + (short * DT) / 60
    if (!this._city.assembling.length) this.sinceLast++
  }

  /**
   * Give each zoned Tile the trips its Junction served this step as progress, `pace` to a trip, while the game is
   * `earning`: trips served during a Pre-warm count for nothing. A Tile that gathers enough reaches its next Stage there
   * and then, and one at the last Stage gathers none.
   */
  private grow(earning: boolean) {
    if (this.tileTrips) {
      // PROTOTYPE (#303): a Tile whose every Need is full reaches its next Stage, Jam or no Jam.
      for (const id of this.tileTrips.ripe()) {
        const cell = this._city.tiles.find((t) => junctionId(t.cell) === id)!.cell
        const stage = this.stageOf(cell)!.stage
        this.stages.set(id, { stage: (stage + 1) as Stage, progress: 0 })
        this.syncTrips()
        this.reach()
        this.onStage?.(cell, stage, (stage + 1) as Stage)
      }
      return
    }
    const { served, net } = this._sim
    for (let k = 0; k < served.length; k++) {
      const trips = served[k] - this.credited[k]
      if (!trips) continue
      this.credited[k] = served[k]
      if (!earning) continue
      const cell = cellAt(net.junctions[k].at)
      const now = this.stageOf(cell)
      if (!now || now.stage === LAST_STAGE) continue
      let [stage, progress] = [now.stage as number, now.progress + trips * this.pace]
      while (stage < LAST_STAGE && progress >= STAGES.trips[stage - 1]) progress -= STAGES.trips[stage++ - 1]
      if (stage === LAST_STAGE) progress = 0
      this.stages.set(net.junctions[k].id, { stage: stage as Stage, progress })
      if (stage === now.stage) continue
      this.reach()
      this.onStage?.(cell, now.stage, stage as Stage)
    }
  }

  /** PROTOTYPE (#303): tell the trips which Tiles are zoned as what, at which Stage. */
  syncTrips() {
    this.tileTrips?.sync(
      this._city
        .landed()
        .tiles.filter((t) => t.zone)
        .map((t) => ({ id: junctionId(t.cell), zone: t.zone!.id, stage: this.stageOf(t.cell)?.stage ?? 1 })),
    )
  }

  /** Raise the Record to Growth, if Growth has passed it. */
  private reach() {
    this.record = Math.max(this.record, this.growth)
  }

  /** Keep the City as it stands for an Undo, which takes the place of the one before and opens its window. */
  private remember(paid: number, changes: Change[] | null, rezoned?: Undo['rezoned']) {
    this.last = { tiles: [...this._city.tiles], paid, changes, rezoned }
    this.sinceLast = 0
  }

  /**
   * A new Sim of the City's Tiles that have landed, with `carried` as its configuration. The traffic of `traffic`, the
   * Sim before, drives on in it; with none, as when a run opens or loads, it starts at its Pre-warm.
   */
  private simulate(carried: Change[], traffic?: Sim) {
    this.paid = 0
    this._sim = new Sim(this._city.landed(), carried, this.seed, { prewarm: false, traffic, trips: this.tileTrips })
    this.syncTrips()
    this.credited = new Uint32Array(this._sim.served.length)
    this.onUnsaved?.()
    return this._sim
  }
}
