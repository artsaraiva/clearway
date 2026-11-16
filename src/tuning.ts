// The numbers the game is tuned by, in one place. Tuned against the bars of the tile sandbox spec
// (.scratch/tile-sandbox/spec.md) with `npm run tune`, which reports how scripted Cities fare under them.

/** Demand at a Gateway: `base × weight × (1 + growth × (Tiles − 1))` trips a minute. */
export const GATEWAY_DEMAND = {
  /** Trips a minute from a Gateway of weight 1 in a City of one Tile. */
  base: 1.75,
  /** The weights a Gateway can draw; its position picks one, so some Gateways are busy and some quiet. */
  weights: [1, 1, 2, 3],
  /** Added to every Gateway's rate per Tile placed after the first, as a share of its rate in a City of one Tile. */
  growth: 0.12,
}

/** The Price of the next Tile: `base × growth^(Tiles − 1)`, rounded to the nearest `round` yen. */
export const PRICE = { base: 350, growth: 1.3, round: 50 }

export const ECONOMY = {
  /** Yen for each trip that leaves at the Gateway it set out for. */
  pay: 10,
  /** The share of the Price a placement that joins two or more placed Tiles by road does not pay. */
  loopRebate: 0.25,
  /** Sim-seconds of earning Income is measured over. */
  incomeWindow: 60,
  /** The Income floor, as a share of the Price per minute. */
  incomeFloor: 1 / 25,
  /** Sim-seconds of earning after a placement, a Swap or a Rezoning in which it can be undone. */
  undoWindow: 10,
}
