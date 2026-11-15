// The numbers the game is tuned by, in one place. They start as the tile sandbox spec's starting numbers
// (.scratch/tile-sandbox/spec.md) and the tuning issue (#89) replaces them.

/** Demand at a Gateway: `base × weight × (1 + growth × (Tiles − 1))` trips a minute. */
export const GATEWAY_DEMAND = {
  /** Trips a minute from a Gateway of weight 1 in a City of one Tile. */
  base: 3,
  /** The weights a Gateway can draw; its position picks one, so some Gateways are busy and some quiet. */
  weights: [1, 1, 2, 3],
  /** Added to every Gateway's rate per Tile placed after the first, as a share of its rate in a City of one Tile. */
  growth: 0.03,
}
