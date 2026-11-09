# 05 Reveal and Fog-edge Gateways

Type: task
Status: ready-for-agent
Blocked by: 03, 04

## Goal

Make a District play Level after Level: Fog-edge Gateways, Reveal as a rebuild, and configuration carried across. Spec: `../spec.md` (Gateways and Demand, Reveal), `docs/adr/0002-reveal-rebuilds-the-simulation.md`.

## Changes

- Level k's network is the Junctions in the `reveal` lists of Levels 1 to k. A Road whose other Junction is still in Fog keeps its full length and is a Gateway (id = Road id) at its fogged end. A Road with no Revealed Junction is absent.
- Reveal rebuilds the sim:
  1. build the new network
  2. carry the configuration of earlier Junctions over by stable lane ids
  3. apply Level k's `initial` to the new Junctions
  4. apply Level k's Demand and seed
  5. Pre-warm 90 s
- Reset restores the snapshot taken at the Reveal.
- Add a dev-only "next Level" button to the throwaway UI, shown after a Win, so Reveals can be playtested. The real Reveal presentation belongs to game ticket 05 (UI/UX).
- Add `npm run bench`, which prints ms per frame at 8×. Check the gate on a 4-Junction fixture: 1,000 vehicles within 4 ms per frame on the main thread. Record the result in a comment here. Move the sim to a web worker only if it fails.

## Test (outcome only, fixture District in `src/sim`)

A two-Level fixture. In Level 1, a roundabout sends traffic into a Fog-edge Gateway; its reference solution Wins. Level 2 Reveals a priority junction on that Road, with Demand that jams it. With Level 1's solution carried over, Level 2 jams after the Reveal, and its reference solution Wins.

## Comments
