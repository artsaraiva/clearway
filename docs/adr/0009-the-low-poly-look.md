# The low-poly look is the game's one look, and a look change keeps the buildings

The look of the visual-style spec (`.scratch/visual-style/spec.md`) sat between two ideas: toy-like shapes carrying realistic fine detail. The detail was a surface pattern on walls and paving, so up close it was print with no depth and no shadow, and from Tile zoom it blurred into grey. After the prototype on branch `prototype-faceted-look` (dev parameter `look=facet`) the user chose the low-poly look over it and asked to work on that look alone ([#270](https://github.com/artsaraiva/dioramania/issues/270)): flat faces, few-sided round shapes, cut corners, flat colour, hard shadows, and windows, sills, shutters, doors, flower boxes and pots built as small objects. The picture is then blended into one piece: soft shade where things meet, a restrained glow round what is lit, a miniature's lens, and windows and lamps that come on one by one at dusk.

The rule that comes with it: **buildings are restyled, never redesigned.** A look change may alter shading, how finely a shape is drawn, how colour is treated, shadow and pattern. It keeps each Zone's building designs and its palette.

## Considered options

- **Keep the look of the visual-style spec.** Rejected: the player looks at the City from Block zoom, and there its detail is print.
- **Redesign the buildings to suit low poly.** A first take rebuilt high-density residential's towers as stacked tiers in saturated colours. Rejected: the user likes that the game's buildings look like real ones.

## Consequences

- The look is one change to the materials and shapes every Zone shares, not a second set of builders. Each Zone keeps its building designs and its palette.
- The visual-style spec is superseded in part. Its header says which parts; the rest of it still holds.
- Post-processing returns. The visual-style spec cut its one bloom pass at 6.2 ms a frame ([#29](https://github.com/artsaraiva/dioramania/issues/29)) and allowed none. The blend is a chain of passes, and it has not been measured against the 1,000-car frame budget.
- Windows built as objects cost triangles in every bay, where the surface pattern cost none. So the pattern's fate waits on a measurement: if the look holds the frame budget at City zoom the pattern is removed, and if not it stands in for the built detail farther out than Tile zoom.
- Only high-density and low-density residential, shops and industrial were looked at in the low-poly look. The other Zones are checked as they are moved over.
