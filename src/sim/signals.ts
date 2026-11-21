import type { Junction, Network } from './network'

export type Light = 'green' | 'amber' | 'red'

/** A Junction's Signal as it stands: which of its two groups each Arm is in, and the Walk phase. */
export interface Signal {
  /** Per Arm, in the Junction's order: 0 for the two Arms most nearly facing each other, 1 for the rest. */
  groups: number[]
  /** Seconds into the cycle at time 0, so that Junctions run out of step with each other. */
  offset: number
  /** What each group's lamps show. */
  shows: [Light, Light]
  /** Whether it is the Walk phase, and the seconds of it left. */
  walk: boolean
  walkLeft: number
}

// The cycle, in s (.scratch/living-city/spec.md, "Traffic lights"): a group's green, the amber and the red after it,
// the Walk phase, and the red after that. Group 0 goes, then group 1, then every Arm is red for the Walk phase.
const [GO, CLEAR, AMBER, WALK, AFTER] = [12, 3.5, 2.5, 24, 2]
const CYCLE = 2 * (GO + CLEAR) + WALK + AFTER

/** Whether the Junction can be run by a Signal: a Priority junction of three Arms or more. A Ring has none. */
export const takesSignal = (junction: Junction) => junction.type === 'priority' && junction.arms.length >= 3

/** A Signal for `junction`, its lamps not yet set. Its place in the cycle comes from the Junction's id, which never changes. */
export function newSignal(junction: Junction): Signal {
  const { arms } = junction
  let [best, pair] = [-Infinity, [0, 1]]
  for (let i = 0; i < arms.length; i++)
    for (let j = i + 1; j < arms.length; j++) {
      const facing = -Math.cos(arms[i].angle - arms[j].angle)
      if (facing > best) [best, pair] = [facing, [i, j]]
    }
  let hash = 0
  for (const ch of junction.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return {
    groups: arms.map((_, i) => (pair.includes(i) ? 0 : 1)),
    offset: (hash % (CYCLE * 10)) / 10,
    shows: ['red', 'red'],
    walk: false,
    walkLeft: 0,
  }
}

/** Set every Signal's lamps, and the light of each of its Arms, for the Sim's `time`. An Arm with no Signal has no light. */
export function runSignals(net: Network, time: number) {
  for (const junction of net.junctions) {
    const s = junction.signal
    if (!s) {
      for (const arm of junction.arms) if (arm.light) arm.light = undefined
      continue
    }
    const t = (time + s.offset) % CYCLE
    const second = GO + CLEAR
    const walkAt = 2 * second
    const show = (from: number): Light => (t < from ? 'red' : t < from + GO ? 'green' : t < from + GO + AMBER ? 'amber' : 'red')
    s.shows = [show(0), show(second)]
    s.walk = t >= walkAt && t < walkAt + WALK
    s.walkLeft = s.walk ? walkAt + WALK - t : 0
    junction.arms.forEach((arm, i) => (arm.light = s.shows[s.groups[i]]))
  }
}
