import type { Junction, Lane } from './network'
import type { Vehicle } from './sim'

export const PREWARM = 90 // s the constructor simulates, so the Jam has formed before anyone sees the City
const FLOW_WINDOW = 20
// A Junction has a Jam once Flow over its Approaches, held over the same stretch as Flow, falls under `speed`: half
// their free speed. It clears once that is back over `clear`, and either way it then holds for `hold` s, so a Junction
// near the line neither flickers nor flashes a Jam on for a moment.
const JAM = { speed: 0.5, clear: 0.6, hold: 20 }

export interface Metric {
  flow: number
}

/** Advance Flow by one step of `dt`. Queued spawns count as vehicles at speed 0. */
export function measure(m: Metric, vehicles: Vehicle[], queued: number, dt: number) {
  let sum = 0
  for (const v of vehicles) sum += Math.min(1, v.v / v.vFree)
  const n = vehicles.length + queued
  m.flow += (((n ? sum / n : 1) - m.flow) * dt) / FLOW_WINDOW
}

/** How the traffic into one Junction moves: Flow measured over its Approaches alone. */
export interface Approaches {
  junction: Junction
  lanes: Lane[]
  /** Each vehicle's speed relative to its free speed, averaged over the vehicles on `lanes` and held over time. */
  flow: number
  jammed: boolean
  /** Sim-seconds before `jammed` may change again. */
  hold: number
}

/**
 * Advance each Junction's reading by one step of `dt`. Approaches with nobody on them read as moving freely, so a
 * Junction reads low only while its Approaches keep a queue.
 */
export function measureJams(junctions: Approaches[], dt: number) {
  for (const j of junctions) {
    let [sum, n] = [0, 0]
    for (const lane of j.lanes) {
      for (const v of lane.vehicles) sum += Math.min(1, v.v / v.vFree)
      n += lane.vehicles.length
    }
    j.flow += (((n ? sum / n : 1) - j.flow) * dt) / FLOW_WINDOW
    j.hold = Math.max(0, j.hold - dt)
    const jammed = j.flow < (j.jammed ? JAM.clear : JAM.speed)
    if (jammed !== j.jammed && j.hold <= 0) [j.jammed, j.hold] = [jammed, JAM.hold]
  }
}
