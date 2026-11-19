// The rules of Finish (#173) that can be asserted over a scene report (#191): each a function from a report to what
// failed, with where and by how much. Rules that need judgement are approximations, and say what they leave out.
import { boxesMeet, disc, overlap, toEdge, within } from './geometry'
import type { Box, Claim, Failure, Hull, Lot, Pt, Report, Thing } from './report'

/** m two outlines may overlap before it counts: what a rounded corner or a bevel can account for. */
export const TOLERANCE = 0.1
/** A parked car, as the sim's one car type is drawn: 4.3 m by 2 m. A scene's standing piece is larger (rule 5). */
export const CAR = { long: 4.3, tall: 3 }
/** m² of the Block from which a Block has a second scene at Stage 3 (rule 5). */
export const SECOND_SCENE = 2500
/**
 * m of pavement that may stand empty (rule 3), how far in from the kerb something must stand to fill it, and within how
 * far of the kerb a bay lies at it, as a taxi bay 0.75 m in does.
 */
export const EMPTY = { run: 12, band: 4, step: 1, bay: 1.5 }
/** The reserved colours (the visual-style spec's Palette): nothing within `hue`° of either goes over `chroma` of its chroma. */
export const RESERVED = { tool: '#1f7aff', jam: '#ff4a1f', hue: 30, chroma: 0.65 }
/** m above the ground a vehicle's lowest point may stand: it stands on its wheels. */
export const WHEELS = 0.05
/** m above its base below which a lit part is near the ground (rule 7), and so leaves a pool. */
export const NEAR_GROUND = 4
/** m from a lit thing within which a pool that rides another brick counts as its. */
const POOL_REACH = 1

/** The kit's parked vehicles. */
const PARKED = new Set(['keiTruck', 'keiCar', 'taxi', 'parked'])
/** What is the Block itself, or lies along its whole edge: its outline's hull is not where it stands. */
const GROUND = new Set(['pavement', 'kerbLine', 'island', 'laySlab', 'markPlate'])
/** What a fill dresses the kerbside with, which `src/render/kerbside.ts` already keeps off what stands (#176). */
const KERBSIDE = new Set(['dressKerbside', 'planter', 'bollards'])

/** A rule over one report. */
export type Rule = (r: Report) => Failure[]

/** A failure of rule `rule` on report `r`. */
const fail = (rule: string, r: Report, at: { tile?: string; block?: number }, what: string, by: string): Failure => ({
  rule,
  zone: r.zone,
  stage: r.stage,
  seed: r.seed,
  ...at,
  what,
  by,
})
const m = (v: number) => `${v.toFixed(2)} m`

/** Whether a thing stands up off the ground and takes room: not flat, not a mover's brick, not the Block itself. */
export const standing = (t: Thing) => !t.flat && t.kind !== 'mover' && !GROUND.has(t.what) && t.feet.length > 0

/** How deep two things' feet overlap, 0 if they do not. */
export function depth(a: { feet: Hull[]; box: Box }, b: { feet: Hull[]; box: Box }): number {
  if (!boxesMeet(a.box, b.box)) return 0
  let most = 0
  for (const p of a.feet) for (const q of b.feet) most = Math.max(most, overlap(p, q))
  return most
}

/** The vehicles stand on their wheels: the cars' skins, the movers that drive, and the kit's parked cars. */
export const wheels: Rule = (r) => [
  ...r.vehicles.filter((v) => v.low > WHEELS).map((v) => fail('wheels', r, {}, `${v.name} floats`, m(v.low))),
  ...r.things
    .filter((t) => PARKED.has(t.what) && t.low - t.base > WHEELS)
    .map((t) => fail('wheels', r, t, `parked ${t.what} floats`, m(t.low - t.base))),
]

/** Everything stands inside its Block: each foot of each thing on a Block lies within its outline. */
export const insideBlock: Rule = (r) => {
  const out: Failure[] = []
  for (const t of r.things) {
    if (t.block < 0 || !standing(t)) continue
    const { loop } = r.blocks[t.block]
    let most = 0
    for (const foot of t.feet) for (const p of foot) if (!within(loop, p.x, p.y)) most = Math.max(most, toEdge(loop, p.x, p.y))
    if (most > TOLERANCE) out.push(fail('inside-block', r, t, `${t.what} stands off its Block`, m(most)))
  }
  return out
}

/** Things on the same Block, or on the slab between Blocks, that may meet: pairs whose boxes meet. */
function pairs(things: Thing[]): [Thing, Thing][] {
  const sorted = [...things].sort((a, b) => a.box.x0 - b.box.x0)
  const out: [Thing, Thing][] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    for (let j = i + 1; j < sorted.length && sorted[j].box.x0 < a.box.x1; j++) {
      const b = sorted[j]
      if (a.block !== b.block && a.block >= 0 && b.block >= 0) continue
      if (boxesMeet(a.box, b.box)) out.push([a, b])
    }
  }
  return out
}

/** m tall under which a thing is a bed, a planter or a kerb a tree may be planted in. */
const BED = 0.8

/**
 * Two standing things may share ground when one is built to stand with the other: the parts of one scene, a tree in a
 * bed or a planter, Block-zoom props of one kind in a cluster (pot plants), or the kerbside's own furniture, which
 * `src/render/kerbside.ts` lays together. Everything else keeps clear.
 */
export function together(a: Thing, b: Thing): boolean {
  if (a.scene >= 0 && a.scene === b.scene) return true
  const planted = (t: Thing, bed: Thing) => t.kind === 'tree' && t.what === 'tree' && bed.top - bed.base < BED
  if (planted(a, b) || planted(b, a)) return true
  if (a.layer === 'blockZoom' && b.layer === 'blockZoom' && a.what === b.what) return true
  return KERBSIDE.has(a.what) && KERBSIDE.has(b.what)
}

/**
 * Nothing overlaps what it should keep clear of (#173): no standing thing stands on a parking or taxi bay but a parked
 * car, or on the step before a door but its own building; and no two standing things overlap, scenes, utility poles,
 * lamps and street trees among them, unless they are one scene's.
 */
export const keepsClear: Rule = (r) => {
  const out: Failure[] = []
  const standers = r.things.filter(standing)
  for (const c of r.claims) {
    const claim = { feet: [c.hull], box: boxOfHull(c.hull) }
    for (const t of standers) {
      if (t.id === c.thing || (c.kind !== 'door' && PARKED.has(t.what))) continue
      if (c.block >= 0 && t.block >= 0 && t.block !== c.block) continue
      const d = depth(claim, t)
      if (d > TOLERANCE) out.push(fail('keeps-clear', r, c, `${t.what} on a ${claimName(c)}`, m(d)))
    }
  }
  for (const [a, b] of pairs(standers)) {
    if (together(a, b)) continue
    const d = depth(a, b)
    if (d > TOLERANCE) out.push(fail('keeps-clear', r, a.block >= 0 ? a : b, `${a.what} and ${b.what} overlap`, m(d)))
  }
  return out
}

const claimName = (c: Claim) => ({ bay: 'parking bay', taxi: 'taxi bay', door: 'door step' })[c.kind]
const boxOfHull = (h: Hull): Box => ({
  x0: Math.min(...h.map((p) => p.x)),
  y0: Math.min(...h.map((p) => p.y)),
  x1: Math.max(...h.map((p) => p.x)),
  y1: Math.max(...h.map((p) => p.y)),
})

/** Points every `step` m along a path. */
function along(path: Pt[], step: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i], path[i + 1]]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  if (path.length) out.push(path[path.length - 1])
  return out
}

/**
 * A mover's path keeps clear of what stands (as `keepsClear`'s things do), and stays on its Block; one that goes away
 * comes and goes at a Road: its path starts at the Block's edge.
 */
export const pathsClear: Rule = (r) => {
  const out: Failure[] = []
  const standers = r.things.filter(standing)
  for (const mv of r.movers) {
    if (mv.wide <= 0 || mv.block < 0) continue
    const { loop } = r.blocks[mv.block]
    const near = standers.filter((t) => t.block === mv.block)
    let [worst, hit, off] = [0, '', 0]
    for (const p of along(mv.path, 1)) {
      const body = {
        feet: [disc(p.x, p.y, mv.wide / 2)],
        box: { x0: p.x - mv.wide, y0: p.y - mv.wide, x1: p.x + mv.wide, y1: p.y + mv.wide },
      }
      for (const t of near) {
        const d = depth(body, t)
        if (d > worst) [worst, hit] = [d, t.what]
      }
      // Off the Block, but for the stretch where one that goes away shrinks out of sight at the kerb.
      const fromStart = Math.hypot(p.x - mv.path[0].x, p.y - mv.path[0].y)
      if (!within(loop, p.x, p.y) && !(mv.away && fromStart < 4)) off = Math.max(off, toEdge(loop, p.x, p.y))
    }
    if (worst > TOLERANCE) out.push(fail('paths-clear', r, mv, `${mv.kind}'s path runs through ${hit}`, m(worst)))
    if (off > TOLERANCE + mv.wide / 2) out.push(fail('paths-clear', r, mv, `${mv.kind}'s path leaves its Block`, m(off)))
    if (mv.away) {
      const p = mv.path[0]
      const gap = within(loop, p.x, p.y) ? toEdge(loop, p.x, p.y) : 0
      if (gap > 1.5) out.push(fail('paths-clear', r, mv, `${mv.kind} comes and goes away from a Road`, m(gap)))
    }
  }
  return out
}

/**
 * Whether two lots lie side by side (#177's `beside` in `src/render/zones/scenes.ts`, for boxes turned as lots are): within
 * 1.5 m of each other one way and sharing more than 1 m of side the other, read in the first lot's frame.
 */
export function beside(a: Hull, b: Hull): boolean {
  const [p, q, s] = [a[0], a[1], a[3]]
  const ux = { x: q.x - p.x, y: q.y - p.y }
  const uy = { x: s.x - p.x, y: s.y - p.y }
  const [lx, ly] = [Math.hypot(ux.x, ux.y), Math.hypot(uy.x, uy.y)]
  const local = (v: Pt) => [((v.x - p.x) * ux.x + (v.y - p.y) * ux.y) / lx, ((v.x - p.x) * uy.x + (v.y - p.y) * uy.y) / ly]
  const pts = b.map(local)
  const [bx0, bx1] = [Math.min(...pts.map((v) => v[0])), Math.max(...pts.map((v) => v[0]))]
  const [by0, by1] = [Math.min(...pts.map((v) => v[1])), Math.max(...pts.map((v) => v[1]))]
  const [gx, gy] = [Math.max(-bx1, bx0 - lx), Math.max(-by1, by0 - ly)]
  return (gx <= 1.5 && gy < -1) || (gy <= 1.5 && gx < -1)
}

/** No two lots side by side share a building form (rule 10): the same building in another colour. */
export const neighbours: Rule = (r) => {
  const out: Failure[] = []
  const formed = r.lots.filter((l): l is Lot & { form: string; ground: Hull } => !!l.form && !!l.ground)
  for (let i = 0; i < formed.length; i++)
    for (let j = i + 1; j < formed.length; j++) {
      const [a, b] = [formed[i], formed[j]]
      if (a.block !== b.block || a.form !== b.form || !beside(a.ground, b.ground)) continue
      out.push(fail('neighbours-differ', r, a, `lots ${a.index} and ${b.index} side by side are both "${a.form}"`, 'same form'))
    }
  return out
}

/** Whether a Block is filled as Blocks are, not given over to a bike lane or a roundabout's island. */
const filled = (r: Report, block: number) => !r.things.some((t) => t.block === block && (t.fill === 'bikeLane' || t.what === 'island'))
/**
 * Whether a Block is filled by its Zone: not given over to the seed's coral tower (`./landmarks`' `tower`), the Block's
 * Landmark in place of a scene (#193).
 */
const zoned = (r: Report, block: number) =>
  !!r.blocks[block].zone && filled(r, block) && !r.things.some((t) => t.block === block && t.fill === 'tower')

/**
 * Whether a thing is a scene's standing piece, larger than a car (rule 5): standing, drawn at every zoom, and longer
 * than a car is (its feet spread over more than `CAR.long` m one way) or taller than `CAR.tall`. Approximation:
 * "larger" is read from its size, not its look, so a parasol over a table (2.8 m across, 2.6 m tall) is not one, and a
 * pergola over the tables or a 4 m sculpture is.
 */
export const standingPiece = (t: Thing) =>
  standing(t) && t.layer === 'solid' && (Math.max(t.box.x1 - t.box.x0, t.box.y1 - t.box.y0) >= CAR.long || t.top - t.base >= CAR.tall)

/**
 * From Stage 2 each Block has a scene, and a second at Stage 3 on a Block of `SECOND_SCENE` m² or more (rule 5). A
 * scene counts once it has a standing piece (`standingPiece`), whatever moves on it: a food truck's court with its
 * truck away must still have one.
 */
export const scenes: Rule = (r) => {
  if (r.stage < 2) return []
  const out: Failure[] = []
  r.blocks.forEach((b, i) => {
    if (!zoned(r, i)) return
    const own = r.scenes.filter((s) => s.block === i)
    const counted = own.filter((s) => s.things.some((id) => standingPiece(r.things[id])))
    const need = r.stage === 3 && b.area >= SECOND_SCENE ? 2 : 1
    if (counted.length >= need) return
    const empty = own.filter((s) => !counted.includes(s)).map((s) => s.kind)
    const what = empty.length ? `${empty.join(', ')} with nothing larger than a car standing` : 'no scene'
    out.push(
      fail('scenes', r, { tile: b.tile, block: i }, `${what} on a Block of ${Math.round(b.area)} m²`, `${counted.length} of ${need}`),
    )
  })
  return out
}

/** From Stage 2 something moves on every zoned Tile (rule 6): a mover, washing, a flag or banner, a chimney's plume. */
export const moves: Rule = (r) => {
  if (r.stage < 2) return []
  const tiles = new Set(r.blocks.filter((b) => b.zone).map((b) => b.tile))
  return [...tiles].filter((t) => !r.moving[t]).map((tile) => fail('moves', r, { tile }, 'nothing moves on the Tile', 'none'))
}

/**
 * Lit things near the ground leave their pool (rule 7): every thing with a lit part (the bulb's) within `NEAR_GROUND` m of
 * what it stands on leaves a pool of light, but parked cars, whose lamps are the cars'. Approximation: a pool is counted
 * on the brick it rides or reaches within a metre of it, so a pool laid for a neighbour can stand in for a light's own.
 */
export const pools: Rule = (r) =>
  r.things
    .filter((t) => {
      if (!t.bulbs || t.bulbLow >= NEAR_GROUND || t.pools || PARKED.has(t.what) || r.blocks[t.block]?.finished === false) return false
      // A pool riding another brick still lights it if it reaches within `POOL_REACH` m of it.
      return !r.pools.some((p) => boxesMeet(t.box, { x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r }, POOL_REACH))
    })
    .map((t) => fail('pools', r, t, `${t.what} is lit and leaves no pool`, `${m(t.bulbLow)} up`))

/**
 * Block-zoom props are not drawn at City zoom: their material hides itself there. And small props are Block-zoom props
 * (#173's three zooms), on the Zones built to the Finish: a standing thing under a metre on every side and 1.3 m tall,
 * unlit, drawn on the scenery at every zoom, should be hidden beyond Tile zoom.
 * Approximation: "small" is its size; a small thing meant to read at City zoom would show here.
 */
export const blockZoomProps: Rule = (r) => [
  ...(r.blockZoomHidden ? [] : [fail('block-zoom', r, {}, 'Block-zoom props are drawn at City zoom', 'zoom 1')]),
  ...r.things
    .filter((t) => {
      if (t.block < 0 || !r.blocks[t.block].finished || !standing(t) || t.layer !== 'solid' || t.bulbs) return false
      const [w, d] = [t.box.x1 - t.box.x0, t.box.y1 - t.box.y0]
      return Math.max(w, d) < 1 && t.top - t.base < 1.3 && t.kind !== 'tree' && t.kind !== 'lamp'
    })
    .map((t) => fail('block-zoom', r, t, `${t.what} is small and drawn at City zoom`, `${m(t.top - t.base)} tall`)),
]

/** A colour's OKLCH lightness, chroma and hue (°), from its hex. */
export function oklch(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = lin
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

/** Whether a colour encroaches on a reserved one: within its hue and over its share of that one's chroma. */
export function reserved(hex: string): string | null {
  const [, c, h] = oklch(hex)
  for (const [name, ref] of [
    ['Tool blue', RESERVED.tool],
    ['Jam red-orange', RESERVED.jam],
  ]) {
    const [, rc, rh] = oklch(ref)
    const dh = Math.min(Math.abs(h - rh), 360 - Math.abs(h - rh))
    // In whole percent, as the Palette states each colour's share: the roofs' brick #d56454 is 65.3%, at the cap.
    if (dh <= RESERVED.hue && Math.round((c / rc) * 100) > RESERVED.chroma * 100)
      return `${name}: ${Math.round((c / rc) * 100)}% of its chroma, ${Math.round(dh)}° off`
  }
  return null
}

/** No colour on the scenery within 30° of the Tool blue or the Jam red-orange is over 65% of its chroma. */
export const colours: Rule = (r) =>
  Object.keys(r.colours).flatMap((hex) => {
    const why = reserved(`#${hex}`)
    return why ? [fail('colours', r, {}, `#${hex} (${r.colours[hex]} triangles)`, why)] : []
  })

/** The static scenery's triangles and meshes stay under the Zone's ceiling (`ceilings`). */
export const budget =
  (ceilings: Record<string, { triangles: number; meshes: number }>): Rule =>
  (r) => {
    const cap = ceilings[r.zone]
    if (!cap) return [fail('budget', r, {}, `no ceiling for ${r.zone}`, '-')]
    const out: Failure[] = []
    if (r.triangles > cap.triangles)
      out.push(
        fail('budget', r, {}, 'triangles over the ceiling', `${(r.triangles / 1e6).toFixed(2)} M of ${(cap.triangles / 1e6).toFixed(2)} M`),
      )
    if (r.meshes > cap.meshes) out.push(fail('budget', r, {}, 'meshes over the ceiling', `${r.meshes} of ${cap.meshes}`))
    return out
  }

/**
 * No 12 m of pavement stands empty (rule 3): walking each Block's kerb where it faces a Road a metre at a time, something
 * standing (any layer, a wall too) within `EMPTY.band` m of the kerb, or a utility pole or lamp beside it. A taxi or a
 * parking bay laid at the kerb is no pavement, a lay-by off the Road, and breaks the run (#193). Approximation: only
 * what stands counts, so paving or a planted bed alone leaves the pavement empty, as a bare run of joints is.
 */
export const emptyPavement: Rule = (r) => {
  const out: Failure[] = []
  const standers = r.things.filter(standing)
  r.blocks.forEach((b, i) => {
    if (!filled(r, i)) return
    const near = standers.filter((t) => t.block === i || t.block < 0)
    const bays = r.claims.filter((c) => c.block === i && c.kind !== 'door').map((c) => ({ feet: [c.hull], box: boxOfHull(c.hull) }))
    const runs = b.kerb ?? [along([...b.loop, b.loop[0]], EMPTY.step)]
    let [longest, at]: [number, Pt | null] = [0, null]
    for (const pts of runs) {
      let run = 0
      for (const p of pts) {
        const probe = {
          feet: [disc(p.x, p.y, EMPTY.band)],
          box: { x0: p.x - EMPTY.band, y0: p.y - EMPTY.band, x1: p.x + EMPTY.band, y1: p.y + EMPTY.band },
        }
        const lay = {
          feet: [disc(p.x, p.y, EMPTY.bay)],
          box: { x0: p.x - EMPTY.bay, y0: p.y - EMPTY.bay, x1: p.x + EMPTY.bay, y1: p.y + EMPTY.bay },
        }
        run = near.some((t) => depth(probe, t) > 0) || bays.some((c) => depth(lay, c) > 0) ? 0 : run + 1
        if (run > longest) [longest, at] = [run, p]
      }
    }
    if (at && longest * EMPTY.step >= EMPTY.run)
      out.push(
        fail(
          'empty-pavement',
          r,
          { tile: b.tile, block: i },
          `pavement empty toward (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`,
          `${longest * EMPTY.step} m`,
        ),
      )
  })
  return out
}

/** Every rule over one report, by name. */
export function rules(ceilings: Record<string, { triangles: number; meshes: number }>): Record<string, Rule> {
  return {
    wheels,
    'inside-block': insideBlock,
    'keeps-clear': keepsClear,
    'paths-clear': pathsClear,
    'neighbours-differ': neighbours,
    scenes,
    moves,
    'empty-pavement': emptyPavement,
    pools,
    'block-zoom': blockZoomProps,
    colours,
    budget: budget(ceilings),
  }
}

/**
 * A lot is the same lot at every Stage: each lot with a building at one Stage has one at every other on the same
 * ground. Over the reports of one Zone and seed at each Stage.
 */
export function sameLots(reports: Report[]): Failure[] {
  const out: Failure[] = []
  const byStage = reports.map((r) => new Map(r.lots.filter((l) => l.form && l.ground).map((l) => [`${l.block}:${l.index}`, l])))
  reports.forEach((r, s) => {
    for (const [key, lot] of byStage[s]) {
      for (let o = 0; o < reports.length; o++) {
        if (o === s) continue
        const other = byStage[o].get(key)
        if (!other) {
          if (o > s)
            out.push(fail('same-lots', r, lot, `lot ${lot.index} has a building at Stage ${r.stage} and none at ${reports[o].stage}`, '-'))
          continue
        }
        const moved = Math.max(...lot.ground!.map((p, k) => Math.hypot(p.x - other.ground![k].x, p.y - other.ground![k].y)))
        if (o > s && moved > TOLERANCE)
          out.push(fail('same-lots', r, lot, `lot ${lot.index} lies elsewhere at Stage ${reports[o].stage}`, m(moved)))
      }
    }
  })
  return out
}
