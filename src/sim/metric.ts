import type { Vehicle } from './sim'

export const WIN_FLOW = 0.8
export const WIN_TIME = 60
export const PREWARM = 90 // s the constructor simulates, so the Jam has formed before anyone sees the City; the Holding timer can't run during it (an empty map starts at full flow)
const FLOW_WINDOW = 20

export interface Metric {
  flow: number
  /** Sim-seconds the flow has stayed at or above WIN_FLOW. */
  sustained: number
}

/** Advance Flow and the time it has held by one step of `dt`. Queued spawns count as vehicles at speed 0. */
export function measure(m: Metric, vehicles: Vehicle[], queued: number, time: number, dt: number) {
  let sum = 0
  for (const v of vehicles) sum += Math.min(1, v.v / v.vFree)
  const n = vehicles.length + queued
  m.flow += (((n ? sum / n : 1) - m.flow) * dt) / FLOW_WINDOW
  m.sustained = m.flow >= WIN_FLOW && time >= PREWARM ? m.sustained + dt : 0
}
