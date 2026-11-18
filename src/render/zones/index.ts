import type { Zone } from '../../city/city'
import { look as farms } from './farms'
import { look as green } from './green'
import type { Look } from './ground'
import { look as highDensity } from './high-density'
import { look as industrial } from './industrial'
import { look as lowDensity } from './low-density'
import { look as mediumDensity } from './medium-density'
import { look as offices } from './offices'
import { look as parks } from './parks'
import { look as shops } from './shops'

// What each Zone builds on a Block (#130 and #136, ported from the neighbourhoods prototype of #127): its building
// shapes, its palette (the kit's, under the rule above `WALLS`), its lot size and the gaps between its buildings. A look
// reads the Block, the ground it must leave free, the kit's random stream and one draw for its Tile, and nothing of
// where the Block lies in the City, so a Zone builds alike at the City's middle and at its edge.
//
// Every Zone builds at its Tile's Stage (#138, #141), through the kit's `staged` and `from`: every lot draws alike at
// every Stage, and each Stage builds the same lot, better. Every lot takes the same draws from the Block's stream
// whatever its Stage, so no lot changes with what another lot's Stage builds. Stage 2 is the look #130 and #136 ported;
// Stage 1 is humbler and Stage 3 goes beyond it, and no Stage builds another kind of building.
//
// Each Zone's look lives in a module of its own beside this one, with its fill, its plans and its scenes (#199); what
// the Zones share to build on a Block is in `./ground` and `./scenes`.

/** Each Zone's look. An unzoned Tile has none: its Blocks are left as grass (`verge`). */
export const LOOKS: Record<Zone['id'], Look> = {
  'low-density': lowDensity,
  'medium-density': mediumDensity,
  'high-density': highDensity,
  offices,
  shops,
  industrial,
  parks,
  green,
  farms,
}
