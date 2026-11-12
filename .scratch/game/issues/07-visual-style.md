# 07 Visual style

Type: grilling
Status: open
Blocked by: 03, 04

## Question

How does the look-dev scene become the production renderer? Decide what `src/render` draws from a District's road graph, how Blocks get filled, and how Fog looks.

## Context

- Map: `.scratch/game/map.md`.
- Look-dev verdict and techniques: `issues/03-look-dev.md` under Answer, especially "Findings to carry into `.scratch/visual-style/spec.md`".
- Road model: `.scratch/road-network/spec.md`. Roads carry edge attributes (bike band, sidewalk width, median) that the sim never reads. Computing Blocks (faces of the road graph) and what fills them is this effort's job.
- `src/render/scene.ts` and `src/lookdev/` are throwaway. `src/lookdev/` is deleted once `.scratch/visual-style/spec.md` exists.
- Building waits on `road-network/02` (the road graph in code). Grilling doesn't.

## To grill

- **Blocks:** what fills each face of the road graph (grass, plaza, buildings, trees)? Authored per District, generated from a seed, or both?
- **Edge attributes:** which render in v1 (bike band, sidewalk, median, splitter islands), and their defaults.
- **Fog and the District edge:** what a fogged area looks like, what lies past the District edge, how a Reveal animates. Shared with `game/05`.
- **Ground bake:** rebake on each Reveal (about 160 ms), or bake the whole District once and mask the Fog?
- **Markings from state:** turn arrows, give-way and stop lines derived from enabled Connections, Priority rules and Signals. Do they update live on a Change?
- **Priority in the world:** exaggerated signs, or leave it to a UI overlay (`game/05`)?
- **Plazas** into the bake (another channel or a material ID).
- **Vehicle types:** the sim has a vehicle-type table; which types ship and how each looks.
- **Known artefact:** the kerb wave where a roundabout mouth meets the ring. Accept it?
- **Budget:** renderer cost alongside the sim's 4 ms per frame gate.

## Resolution produces

- Decisions in `map.md`.
- `.scratch/visual-style/spec.md` plus implementation issues, blocked by `road-network/02`.
- Deleting `src/lookdev/`.

## Comments
