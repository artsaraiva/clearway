import * as THREE from 'three'
import type { Vec } from '../sim/geometry'
import type { Arm, Connection, Junction, Lane } from '../sim/network'
import type { Priority } from '../sim/spec'
import { glow } from './glow'
import { dashes, ribbons, v3 } from './ribbons'
import { canvasTexture } from './shapes'

// The Tools' blue, reserved for Tools and Inspectors. Every lane end is blue on a white rim, which lifts it off the
// moonlit road plate at night: a circle where Connections start, a ring where they end.
const [BLUE, PALE, WHITE] = ['#1f7aff', '#a8c8fb', '#ffffff']
// m: a lane end's marker, its white rim, a ring's hole as a share of the marker, and how far past its line into the
// Junction it sits, clear of the give-way paint behind the line.
const END = { r: 1.6, rim: 0.45, hole: 0.55, inset: 3 }
// m: the round marker at an Arm's line, which sits on the centre line behind it, level with the give-way paint.
const RULE = { r: 1.9, behind: 1.7 }
// m: how far a click on an Approach lane's give-way paint may land from the middle of its row of triangles.
const PAINT = { r: 2.5, behind: 1.7 }
// The halo around a Junction, the spec's soft ring: m past its outermost lane end, its soft width in m, the pale line
// along its edge, m it lifts, and s to lift.
const HALO = { margin: 4, width: 3, core: '#d6e8ff', lift: 1.5, rise: 0.16 }
// m: the Connection being drawn, its white rim, and the line of a Connection already on.
const TUBE = { core: 1, rim: 1.7, line: 0.55 }
const GROW = 1.25 // the lane end under the pointer, picked, or snapped to
// m above the road plate: under the cars, over the paint.
const Y = { line: 0.2, tube: 0.24, rim: 0.3, end: 0.33, hole: 0.36 }

/**
 * Something on the selected Junction the player can press: an incoming lane end, an outgoing one, or an Arm's Priority
 * rule, which is its round marker and the give-way paint of a yielding Arm. `r` is how far from `at` it reaches.
 */
export type Target = { kind: 'in' | 'out'; lane: Lane; at: Vec; r: number } | { kind: 'rule'; arm: Arm; at: Vec; r: number; paint: boolean }

/** What the Tools show in the world. */
export interface ToolState {
  /** The Junction under the pointer. */
  hovered: Junction | null
  selected: Junction | null
  /** The selected Junction's target under the pointer. */
  under: Target | null
  /** The incoming lane a Connection is being drawn from. */
  from: Lane | null
  /** Where the pointer has drawn it to, on the road plane. */
  aim: Vec | null
  /** The Connection to the legal lane end it snaps to there. */
  snap: Connection | null
}

export const NO_TOOLS: ToolState = { hovered: null, selected: null, under: null, from: null, aim: null, snap: null }

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
const along = (p: Vec, heading: number, d: number): Vec => ({ x: p.x + Math.cos(heading) * d, y: p.y + Math.sin(heading) * d })
/** Where a lane ends and its heading there. */
const endOf = (lane: Lane) => {
  const p = lane.line.pts
  const [a, b] = [p[p.length - 2], p[p.length - 1]]
  return { at: b, heading: Math.atan2(b.y - a.y, b.x - a.x) }
}
/** Where a lane starts and its heading there. */
const startOf = (lane: Lane) => {
  const [a, b] = lane.line.pts
  return { at: a, heading: Math.atan2(b.y - a.y, b.x - a.x) }
}

const reaches = new WeakMap<Junction, number>()
/** How far a Junction's halo reaches from its centre: a little past its outermost lane end. A click inside it selects the Junction. */
export function reach(junction: Junction): number {
  let r = reaches.get(junction)
  if (r !== undefined) return r
  r = 0
  for (const arm of junction.arms) {
    for (const lane of arm.approach) r = Math.max(r, dist(endOf(lane).at, junction.at))
    for (const lane of arm.exit) r = Math.max(r, dist(startOf(lane).at, junction.at))
  }
  reaches.set(junction, (r += HALO.margin))
  return r
}

/**
 * Every target on a Junction: each Approach's lane ends, past the line where the lane ends, and on a Priority junction
 * each Arm's round marker and, while it yields, its give-way paint. On a roundabout the Ring's lane ends sit on the Ring
 * at each Arm, and there is no Priority rule: the Ring is always main.
 */
export function targets(junction: Junction): Target[] {
  const out: Target[] = []
  // A Straight's lane ends face each other across a short gap, so they sit closer to their lines.
  const inset = Math.min(END.inset, dist(junction.arms[0].center, junction.at) / 3)
  for (const arm of junction.arms) {
    for (const lane of [...arm.approach, ...arm.ringIn]) {
      const { at, heading } = endOf(lane)
      out.push({ kind: 'in', lane, at: along(at, heading, inset), r: END.r + END.rim })
    }
    for (const lane of [...arm.ringOut, ...arm.exit]) {
      const { at, heading } = startOf(lane)
      out.push({ kind: 'out', lane, at: along(at, heading, -inset), r: END.r + END.rim })
    }
    if (junction.type !== 'priority') continue
    out.push({ kind: 'rule', arm, at: along(arm.center, arm.angle, RULE.behind), r: RULE.r + END.rim, paint: false })
    if (arm.priority !== 'yield') continue
    for (const lane of arm.approach) {
      const { at, heading } = endOf(lane)
      out.push({ kind: 'rule', arm, at: along(at, heading, -PAINT.behind), r: PAINT.r, paint: true })
    }
  }
  return out
}

/** The target nearest `p` that reaches it, or comes within `slack` m of it. A target the point is inside beats one it is only near. */
export function nearest(list: Target[], p: Vec, slack: number): Target | null {
  let best: Target | null = null
  let gap = Infinity
  for (const t of list) {
    const d = dist(t.at, p) - t.r
    if (d <= slack && d < gap) [best, gap] = [t, d]
  }
  return best
}

/** The Connection from `from` to the lane end `to`, if the Junction offers one. */
export const connection = (from: Lane, to: Lane) => from.next.find((c) => c.to === to) ?? null

/** The round marker's face: give-way triangle for a yielding Arm, a diamond for a main one. Drawn pointing out along the Arm. */
const faces = new Map<Priority, THREE.Texture>()
function face(priority: Priority) {
  let texture = faces.get(priority)
  if (texture) return texture
  texture = canvasTexture(128, 128, (g) => {
    g.fillStyle = WHITE
    g.beginPath()
    g.arc(64, 64, 63, 0, 2 * Math.PI)
    g.fill()
    g.strokeStyle = g.fillStyle = BLUE
    g.lineWidth = 9
    g.beginPath()
    g.arc(64, 64, 47, 0, 2 * Math.PI)
    g.stroke()
    g.lineJoin = 'round'
    g.beginPath()
    if (priority === 'yield') {
      // Its point toward the driver who gives way, like the paint.
      g.moveTo(38, 50)
      g.lineTo(90, 50)
      g.lineTo(64, 90)
      g.closePath()
      g.lineWidth = 8
      g.stroke()
    } else {
      g.moveTo(64, 38)
      g.lineTo(90, 64)
      g.lineTo(64, 90)
      g.lineTo(38, 64)
      g.closePath()
      g.fill()
    }
  })
  faces.set(priority, texture)
  return texture
}

const DISC = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)

/**
 * A soft halo of `radius` m on the road plane: blue fading in toward its edge, where a pale line lifts it off the
 * moonlit road plate at night, and out just past it.
 */
function softHalo(radius: number): THREE.BufferGeometry {
  const steps = 128
  const [blue, pale] = [new THREE.Color(BLUE), new THREE.Color(HALO.core)]
  const stops: [number, THREE.Color, number][] = [
    [-1, blue, 0],
    [-0.3, blue, 0.45],
    [-0.08, blue, 0.9],
    [-0.04, pale, 1],
    [0.04, pale, 1],
    [0.08, blue, 0.9],
    [0.3, blue, 0],
  ]
  const [pos, col, index]: number[][] = [[], [], []]
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    for (const [at, c, alpha] of stops) {
      const r = radius + at * HALO.width
      pos.push(Math.cos(a) * r, 0, -Math.sin(a) * r)
      col.push(c.r, c.g, c.b, alpha)
    }
  }
  const n = stops.length
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < n - 1; k++) {
      const [a, b, c2, d] = [i * n + k, i * n + k + 1, (i + 1) * n + k, (i + 1) * n + k + 1]
      index.push(a, c2, b, b, c2, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  g.setIndex(index)
  return g
}

/** A halo that lifts around one Junction and settles back when it lets go of it. `strength` is its opacity when lifted. */
function halo(strength: number) {
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
  )
  mesh.visible = false
  let around: Junction | null = null
  let t = 0
  return {
    mesh,
    get around() {
      return around
    },
    /** Lift around `junction`, from `from` of the way up; `null` lets go. */
    set(junction: Junction | null, from = 0) {
      if (junction === around) return
      if (junction) {
        mesh.geometry.dispose()
        mesh.geometry = softHalo(reach(junction))
        mesh.position.copy(v3(junction.at))
        t = from
      }
      around = junction
    },
    /** Let go at once, with no settling back. */
    hide() {
      ;[around, t] = [null, 0]
      mesh.visible = false
    },
    /** How far up it is, 0–1. */
    get t() {
      return t
    },
    update(dt: number) {
      t = Math.max(0, Math.min(1, t + (around ? dt : -dt) / HALO.rise))
      const k = t * t * (3 - 2 * t)
      mesh.visible = k > 0
      mesh.position.y = HALO.lift * k
      mesh.material.opacity = strength * k
    },
  }
}

/**
 * The Tools in the world (.scratch/ui-ux/spec.md, "Tools"), in the same language as the route Inspector: a soft halo
 * that lifts around the Junction under the pointer and stays around the selected one. The selected Junction shows its
 * Connections as blue lines, every lane end at once, and on a Priority junction a round marker at each Arm's line. A
 * Connection being drawn is a blue tube from its lane end to the pointer, along the Connection once it snaps to a legal
 * lane end, and dashed when letting go there would turn that Connection off.
 */
export function createTools() {
  const hover = halo(0.7)
  const chosen = halo(0.85)
  /** The selected Junction's lane ends, Connections and round markers: rebuilt when any of them changes. */
  const aids = new THREE.Group()
  const tube = new THREE.Group()
  const group = new THREE.Group().add(hover.mesh, chosen.mesh, aids, tube)
  let state = NO_TOOLS
  let drawn = ''
  let last = performance.now()

  const clear = (g: THREE.Group) => {
    for (const o of g.children) {
      const mesh = o as THREE.Mesh
      if (mesh.geometry !== DISC) mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    g.clear()
  }
  const strip = (lines: Vec[][], width: number, y: number, color: string, opacity = 1) =>
    new THREE.Mesh(ribbons(lines, width, y), glow(color, opacity))
  const disc = (p: Vec, r: number, y: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(DISC, material)
    mesh.position.copy(v3(p, y))
    mesh.scale.set(r, 1, r)
    return mesh
  }

  /** Lay out the selected Junction as it stands. */
  const drawAids = (junction: Junction) => {
    const { from, snap, under } = state
    const on = junction.arms.flatMap((a) => a.connections).filter((c) => c.enabled)
    // The Connections of the lane end being drawn from, or pointed at, stand out as tubes; the rest are thin lines.
    // The one the tube snaps to is drawn by the tube.
    const lead = from ?? (under?.kind === 'in' ? under.lane : null)
    const led = on.filter((c) => c.from === lead && c !== snap).map((c) => c.lane.line.pts)
    const rest = on.filter((c) => c.from !== lead).map((c) => c.lane.line.pts)
    if (rest.length) aids.add(strip(rest, TUBE.line, Y.line, BLUE, lead ? 0.4 : 0.85))
    if (led.length) aids.add(strip(led, TUBE.rim, Y.tube - 0.02, WHITE), strip(led, TUBE.core, Y.tube, BLUE))
    for (const t of targets(junction)) {
      if (t.kind === 'rule') {
        if (t.paint) continue
        const material = new THREE.MeshBasicMaterial({ map: face(t.arm.priority), transparent: true, toneMapped: false })
        const mark = disc(t.at, t.r, Y.end, material)
        mark.rotation.y = t.arm.angle + Math.PI / 2
        aids.add(mark)
        continue
      }
      // While a Connection is drawn, the lane ends it cannot reach go pale.
      const reachable = !from || t.kind === 'in' || connection(from, t.lane)
      const big = t.lane === from || t.lane === snap?.to || (under?.kind === t.kind && under.lane === t.lane)
      const r = END.r * (big ? GROW : 1)
      aids.add(disc(t.at, r + END.rim, Y.rim, glow(WHITE)), disc(t.at, r, Y.end, glow(reachable ? BLUE : PALE)))
      if (t.kind === 'out') aids.add(disc(t.at, r * END.hole, Y.hole, glow(WHITE)))
    }
  }

  /** The Connection being drawn: along the Connection it snaps to, or curving from its lane end toward the pointer. */
  const drawTube = () => {
    clear(tube)
    const { from, aim, snap } = state
    if (!from) return
    let line: Vec[]
    if (snap) line = snap.lane.line.pts
    else if (aim) {
      const { at, heading } = endOf(from)
      const bend = along(at, heading, dist(at, aim) * 0.45)
      line = Array.from({ length: 17 }, (_, i) => {
        const [t, u] = [i / 16, 1 - i / 16]
        return { x: u * u * at.x + 2 * u * t * bend.x + t * t * aim.x, y: u * u * at.y + 2 * u * t * bend.y + t * t * aim.y }
      })
    } else return
    // Letting go on a Connection already on turns it off: the tube is dashed there.
    const lines = snap?.enabled ? dashes(line, 1.6, 1.1) : [line]
    tube.add(strip(lines, TUBE.rim, Y.tube, WHITE), strip(lines, TUBE.core, Y.tube + 0.02, BLUE))
    // Short of a lane end, the tube ends in a round tip under the pointer.
    const tip = line[line.length - 1]
    if (!snap) tube.add(disc(tip, TUBE.rim * 0.75, Y.tube + 0.04, glow(WHITE)), disc(tip, TUBE.core * 0.8, Y.tube + 0.06, glow(BLUE)))
  }

  return {
    group,

    show(next: ToolState) {
      const moved = next.from !== state.from || next.aim !== state.aim || next.snap !== state.snap
      state = next
      // A Junction picked from under the pointer takes over the halo the hover had lifted.
      const picked = next.selected && next.selected !== chosen.around && next.selected === hover.around
      chosen.set(next.selected, picked ? hover.t : 0)
      if (picked) hover.hide()
      hover.set(next.hovered === next.selected ? null : next.hovered)
      if (moved) drawTube()
    },

    /**
     * Lift the halos on the real clock, since the player uses the Tools while paused too, and redraw the selected
     * Junction when a Change has moved it.
     */
    update() {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      hover.update(dt)
      chosen.update(dt)
      const junction = state.selected
      const { from, snap, under } = state
      const key = junction
        ? [
            junction.id,
            junction.arms.map((a) => a.priority[0] + a.connections.map((c) => +c.enabled).join('')).join(),
            from?.id,
            snap?.id,
            under && (under.kind === 'rule' ? `rule:${under.arm.road}` : `${under.kind}:${under.lane.id}`),
          ].join('|')
        : ''
      if (key === drawn) return
      drawn = key
      clear(aids)
      if (junction) drawAids(junction)
      // A Change can turn on or off the Connection the tube snaps to.
      drawTube()
    },
  }
}
