# Living City

Status: open. Explored 2026-11-20 as a prototype, not grilled. It is meant to be split into tickets before anyone builds from it.

Vocabulary in root `GLOSSARY.md`; the terms this spec adds are listed under "Glossary changes". The game's direction is ADR 0005. The world's look today is `.scratch/visual-style/spec.md`, which this spec replaces in part.

The prototype this spec was written from is on branch `prototype-faceted-look`, behind the dev parameter `look=facet`. Its files are named `prototype-*`. It was uncommitted when this was written. The user looked at it on a page that runs the real renderer for three Tiles: <https://claude.ai/artifact/MRaNHFCbzY1gDA27wVh9oP>.

## Problem Statement

The player looks at the City zoomed in and wants to see it come alive in its details. Today it does not, in three ways.

The look sits between two ideas. Buildings are toy-like shapes carrying realistic fine detail: surface pattern on walls and paving, thin railings, soft shadows. Up close that detail is print on a surface. It has no depth, it casts no shadow, and from Tile zoom it blurs into grey.

Nothing blends. Each building stands alone on a pale Lot with wide grey Road between Lots, so the City reads as separate pieces set on a board. At noon the palette is pale, and dusk, the best light the game has, arrives as one even fade.

Nobody lives there. A Walker circles the edge of its Block and never goes anywhere. Cars run Gateway to Gateway and never stop. A Junction has no lights. There is no one to follow and nothing to find out about anyone.

## Solution

The City becomes a low-poly diorama in which every detail is a small object, the picture is blended into one piece, and the Walkers and cars have somewhere to be.

- **The look.** The game's own buildings, unchanged in design and colour, drawn low poly: flat faces, few-sided round shapes, cut corners, flat colour, hard shadows. Windows, sills, shutters, doors, flower boxes and pots are modelled, not printed.
- **The blend.** Soft shade where things meet, a restrained glow round what is lit, and a miniature's lens. At dusk the windows and lamps come on one by one.
- **Walkers.** Each Walker is someone: a name, a home, something they do. They are jointed figures that walk in step. They go into shops, sit on benches, stop to talk, wait at the lights and cross. Residents, shopkeepers and plant workers have a door of their own.
- **Storylets.** The player clicks a Walker to follow them. After a few seconds of watching, a short story in beats begins for that Walker and is written into their log. A Walker the player keeps goes on having Storylets unwatched.
- **Traffic lights.** Priority junctions get Signals. Cars stop on red. Walkers cross on a walk phase.
- **Parking.** Some cars pull off the Road onto a Stand at a house or a shop. The driver gets out, goes in, comes back and drives off.

## User Stories

The look

1. As a player, I want every building to keep the design and colours it has today, so that buildings still look like real ones.
2. As a player, I want every face drawn flat, so that the City reads as a model.
3. As a player, I want trees, bushes, lamps, tanks and cones to be few-sided, so that round things belong to the same model as the boxes.
4. As a player, I want rounded corners to become cut corners, so that no thin slivers of shading appear.
5. As a player, I want walls, roofs and paving in flat colour, so that nothing fine fights the shapes.
6. As a player, I want each part toned very slightly lighter or darker than its neighbours, so that large flat areas do not look dead.
7. As a player, I want hard-edged shadows, so that light and shade are as crisp as the shapes.
8. As a player, I want every window to be a box standing out of its wall, in every bay of every storey, so that windows catch light and cast shadow.
9. As a player, I want sills under windows and shutters on houses, so that the detail the pattern used to draw is still there as objects.
10. As a player, I want a door wherever the pattern drew one, so that buildings have a way in.
11. As a player, I want flower boxes under some windows and pots along the feet of walls, so that the gaps between buildings fill with small living things.
12. As a player, I want no building left with blank walls, so that no Zone looks unfinished in the new look.
13. As a player, I want every Zone drawn this way, so that the City is one look.

The blend

14. As a player, I want soft shade where a building meets the ground and where parts meet each other, so that things sit in the scene.
15. As a player, I want a glow round lit windows and lamps, so that dusk and night feel warm.
16. As a player, I want that glow kept restrained, so that a lit window still shows its shape.
17. As a player, I want the top and foot of the frame slightly out of focus and the corners a little darker, so that the City looks like a miniature.
18. As a player, I want windows and lamps to come on one at a time as dusk falls, so that dusk is something to watch.
19. As a player, I want each lamp's pool of light on the ground to come on with its lamp, so that the two agree.
20. As a player, I want the day to keep passing, so that I see every light.

The camera

21. As a player, I want to move the camera with W A S D and the arrow keys, so that I can get around without dragging.
22. As a player, I want Q and E to turn the camera and R and F to zoom, so that one hand can do everything.
23. As a player, I want a plain drag to move the view, so that the most common move is the easiest.
24. As a player, I want to zoom in closer than Block zoom, so that I can watch one Walker.
25. As a player, I want the camera to stay on a Walker I follow, so that I do not lose them.

Walkers

26. As a player, I want each Walker to have a name, a home, something they do and a trait or two, so that they are someone.
27. As a player, I want a Walker to be the same person every time I load the City, so that I can get to know them.
28. As a player, I want Walkers drawn with legs, arms and a head that move, so that they walk and do not hop.
29. As a player, I want a Walker's feet to keep step with the ground they cover, so that nobody slides.
30. As a player, I want what a Walker carries to swing with the hand that holds it, so that a bag or a briefcase looks held.
31. As a player, I want some Walkers to walk in twos, so that the pavements look sociable.
32. As a player, I want a Walker to stop and look in a window, so that shops look interesting to them.
33. As a player, I want a Walker to go into a shop and come out again, so that doors are used.
34. As a player, I want a Walker to sit on a bench, so that benches are used.
35. As a player, I want a stopped Walker to turn their head and talk with a hand, so that standing still is not freezing.
36. As a player, I want a resident to have a house of their own and go in and out of it, so that homes are lived in.
37. As a player, I want a shopkeeper to have a shop of their own, so that shops are kept by someone.
38. As a player, I want a plant worker to have a plant they clock in at, so that industry has people.
39. As a player, I want Walkers to go up onto terraces and balconies where a building has them, so that those are used too.
40. As a player, I want Walkers to walk from one Tile to the next, so that a resident can reach the shops.
41. As a player, I want a Walker to walk round what stands in their way, so that nobody passes through a planter.

Storylets

42. As a player, I want to click a Walker to follow them, so that I can choose whose life to watch.
43. As a player, I want a Storylet to begin once I have watched a Walker for a few seconds, so that my attention is what starts a story.
44. As a player, I want a Storylet to fit who the Walker is, who they are with and the time of day, so that it reads as theirs.
45. As a player, I want each beat written into the Walker's log when it happens, so that I can read their story as it goes.
46. As a player, I want a log line to say what has happened and not what is about to, so that I never read "crossed over" beside someone still waiting.
47. As a player, I want to keep a Walker, so that their Storylets go on while I look elsewhere.
48. As a player, I want to come back to a Walker I keep and read what they did, so that keeping them pays off.
49. As a player, I want to see the Storylets that ended lately, so that a story outlasts the Walker's time on screen.
50. As a player, I want a marker over the Walker I follow, so that I can find them in a crowd.
51. As a player, I want to stop following with one click or by moving the camera, so that following never traps me.
52. As a player, I want a driver to have Storylets like anyone else, so that a car is also someone's day.

Traffic lights

53. As a player, I want a Priority junction of three Arms or more to have Signals, so that crossing a Road is safe.
54. As a player, I want cars to stop for a red light, so that the lights mean something.
55. As a player, I want a car too close to stop to go through, so that nobody brakes absurdly.
56. As a player, I want a walk phase in which every Arm is red, so that Walkers cross with no car moving.
57. As a player, I want a Walker to wait at the kerb facing across until the walk phase, so that I can see them waiting.
58. As a player, I want a Walker to start across only when the walk phase has time enough left, so that nobody is caught in the Road.
59. As a player, I want waiting Walkers spread along the kerb, so that they do not stand in one spot.
60. As a player, I want a Walker who has crossed to belong to the Block they reach, so that they use its shops and benches.
61. As a player, I want cars waiting at a red light not to show anger, so that anger still means a Jam.
62. As a player, I want lights that do not cause Jams the Tools cannot clear, so that the lights add life without breaking the City.
63. As a player, I want Walkers to cross at a Ring too, so that every Junction can be crossed.

Parking and cars with a purpose

64. As a player, I want some cars to pull off the Road and park at a house or a shop, so that cars have somewhere to be.
65. As a player, I want a parking car to slow, turn in and stop, so that parking looks driven.
66. As a player, I want the driver to get out and go in, so that the car and the Walker are one story.
67. As a player, I want the driver to come back and drive off, so that the Stand frees up.
68. As a player, I want a delivery to pull up at a shop and be carried in, so that shops are supplied.
69. As a player, I want a shop to have a truck of its own that leaves and comes back with stock, so that the shop works for its living.
70. As a player, I want parked cars not to show anger, so that a parked car is at rest.
71. As a player, I want industry to have Stands too, so that the plant gets its lorries.
72. As a player, I want a car's trip to end where it parks, so that later the City's buildings can ask for the trips they need.

The sky

73. As a player, I want no planes over the City until there is a Tile they belong to, so that nothing in the sky is unexplained.

## Implementation Decisions

Decisions the user made

- **Buildings are restyled, never redesigned.** A first take that rebuilt high-density's towers as stacked tiers in saturated colours was rejected: the user likes that the current buildings look like real ones. A look change alters shading, shape resolution, colour treatment, shadow and pattern. It keeps each Zone's building designs and palette.
- **The low-poly target is the game's one look.** The user asked to scrap the current look and work on the target alone. See "Surface pattern" below for the one part of the current look that may survive as a far-zoom measure.
- **Glow stays restrained.** The first glow was "a tad too intense". The values the user accepted are about half that strength, with lit windows and lamps about a quarter dimmer.
- **Storylets follow Neon Terrarium's model**, as its author describes it: everything about a Walker comes from a seed, once; a Storylet starts only for a Walker the player has watched for a while; a Walker the player keeps has Storylets in the background.
- **"Street lights" means traffic lights at Junctions.**
- **Planes are removed** until a transport Tile exists. That Tile is not part of this spec.
- **Walkers and Storylets get a test seam of their own** (see Testing Decisions).

The look

- One switch in the shared materials and shapes, not a second set of builders: flat shading on every scenery, car and Walker material; the kit's sphere, cylinder and cone become few-sided (a roughened twenty- or eighty-face ball for leaves); the rounded box becomes a box with one-step cut corners.
- Flat colour replaces the surface pattern on every wall, roof and ground. Each part's colour is shifted in lightness by up to about ±2%, decided by where the part stands, so the same City always tones the same way.
- Where a wall would have worn a windowed pattern, the kit builds its windows as boxes from the same bay and storey sizes the pattern used: a pane in every bay of every storey; a sill, or for about a third of windows a flower box; shutters where the pattern drew them; a door in the middle bay of the ground floor where the pattern drew one; a high strip on shed walls. Which panes light at night comes from the wall's own seed, so the kit's random stream, and with it the City's layout, is the same as today.
- Along the foot of a ground-floor wall, pots of leaves stand at about three in five bay boundaries.
- Shadows are hard: the shadow map is read without blur.
- The towers of high-density residential, which kept an older path that built windows as geometry, go through the same wall-window path as every other Zone.

The blend

- The scene is drawn through a pass chain: ambient occlusion from depth, a glow that only takes what is brighter than white, then a lens pass (blur growing toward the top and foot of the frame, a little more saturation, darker corners), then tone mapping. The sky becomes the scene's own background so the passes have nothing transparent to carry.
- Glow strength follows how far the lamps are on: almost none by day, restrained at night.
- Each window and lamp carries its own point in the dusk at which it lights, decided by where it stands. As dusk falls a level rises and each light switches on, at full strength, when the level passes its point. In the morning they go off the same way.

Walkers

- A Walker is a seeded identity plus a small state machine. The identity (name, kind, traits, home, what they do) is drawn once from the Walker's seed. The state machine runs one decision at a time and costs nothing between decisions.

  The states, from the prototype:

  ```ts
  doing: 'stroll' | 'stop' | 'go' | 'act' | 'back' | 'wait'
  step?: 'stop' | 'door' | 'bench' | 'cross' | 'home'
  ```

  A Walker strolls its Block's pavement; to do a step it first walks the pavement to the point nearest the Place, leaves the pavement for the Place (`go`), does the thing (`act`: indoors and out of sight, or seated), and returns to the point it left (`back`). `wait` is standing at a kerb for the walk phase.
- **Places** are noted as the City is built: every door's step (those a Zone builds and those the wall-window path builds) and every bench at ground level. A Walker knows the Places its pavement reaches. Terraces and balconies are to be noted the same way, with their height.
- **A door of their own.** On a residential Zone most Walkers get a home door, on shops about a third get a shop they keep, on industry most get a plant they work at. The `home` step goes to that door and stays longer.
- **Twos.** About a third of Walkers have another who walks beside them, does what they do, and is named in their Storylets.
- **Drawing.** Each kind of Walker (shopper, schoolchild, office worker) is one merged model drawn as instances, as today. Every part is tagged with its limb (body, left leg, right leg, left arm, right arm, head) and the point it turns about. The vertex shader swings the limbs from a per-instance pose of four numbers: where in the stride, how far it swings (or, below zero, how far it is sat down), how far the right arm is raised, how far the head is turned. The stride advances with the ground covered, one whole stride being `4 × leg length × sin(swing)`, so feet do not slide. The shadow uses the same shader.
- **Density.** About three times as many Walkers as today.

Storylets

- A Storylet is data: who it fits and its beats. From the prototype:

  ```ts
  interface Storylet {
    title: string
    kinds?: Kind[]           // shopper, schoolchild, office worker
    pair?: boolean           // only for a two, or only for one alone
    when?: ('morning' | 'day' | 'dusk' | 'night')[]
    needs?: 'home' | 'shop' | 'plant'   // only for a Walker with such a door of their own
    beats: [Step, string][]  // a step to do, and the line it leaves in the log
    end: string
  }
  ```

- A Storylet begins for a Walker who has been followed for five seconds, or who is kept, once thirty to seventy seconds have passed since their last one. It is drawn from those that fit and is never the one they had last.
- Beats run in order. The log line of a beat is to be written when the beat is done, not when it starts (the prototype writes it at the start).
- Each Walker has a log of their Storylets. Ended Storylets also go to one City-wide list, newest first, which outlasts the Walker.
- The prototype has fourteen Storylets. The library is expected to grow; adding one is adding data.
- A driver is a Walker who steps out of a parked car. The prototype gives each driver one Storylet outright ("Home for a while", "The delivery"). They are to get Storylets by being watched or kept like any other Walker.

Traffic lights

- A Signal is a way a Priority junction is run, beside the Priority rule. In the prototype every Priority junction of three Arms or more has one; a Ring has none.
- The two Arms most nearly facing each other form one group and the rest the other. The cycle, from the prototype, in seconds:

  ```ts
  const [GO, CLEAR, AMBER, WALK, AFTER] = [12, 3.5, 2.5, 24, 2]
  // group A green, clear, group B green, clear, walk (every Arm red), clear
  const CYCLE = 2 * (GO + CLEAR) + WALK + AFTER   // 57
  ```

  Junctions run out of step with each other.
- A car whose next Connection leaves a red Arm stops at its line if it can still brake to it; one too close goes through. Cars waiting at red on another Arm do not count as approaching for gap acceptance, and a signalled Arm does not crawl at its give-way line.
- Each Arm has a post on its near-side kerb with a mast over the Approach: a head of three lamps facing the cars, and lower down a head of two for the Walkers who cross that Arm. The Walkers' green blinks through the last seconds of the walk.
- A crossing is a zebra's two ends, each snapped to the pavement it lies on. A Walker walks to the end on their pavement, waits, and crosses when the walk phase has enough left to reach the far kerb at a brisk pace (1.5 m/s in the prototype). On the far side the Walker's pavement is the one they reached.
- Anger: a car held at a red light does not grow angry, and a car at a signalled Junction on green grows angry at about a third of the usual rate.

Parking

- A **Stand** is a place off the Road where one car can stand. In the prototype, about 70% of the parked cars a Zone lays at houses and of the kei trucks it lays at shops are left out and their places become Stands. Each Stand is bound to the nearest point of an outermost Road lane within 30 m.
- About two in five cars that come down a lane with a free Stand ahead take it. The car slows, stops beside the Stand, leaves its lane, and is drawn easing onto the Stand. When its driver is back, or after four minutes, it waits for a gap in its lane and joins it again on the route it had.
- In the prototype this is the same trip, paused. The decision for the game is that a trip ends where the car parks and a new one starts when it leaves, which is the change ADR 0005 names and [#95](https://github.com/artsaraiva/clearway/issues/95) designs. Demand by category (homes sending trips to shops and work, in the manner of Cities: Skylines) hangs off that and is not designed here.

The camera

- Keys move, turn and zoom the camera; a plain drag moves it; a right-drag or Shift-drag orbits. The closest zoom is nearly three times closer than Block zoom. Following a Walker keeps them near the middle of the screen until the player moves the camera or lets go.

What must change from the prototype before it is the game

- **Seeded, not random.** The prototype draws Walkers' seeds, their choices and which cars park from the page's random numbers. In the game each is drawn from the City's seed, so that a seed gives the same City, Walkers and traffic every run. The sim's rule that a seed gives the same result must hold with Signals and parking on.
- **No global switches.** The prototype turns Signals and parking on through module-level flags and passes Places, Stands, crossings and parked cars between modules through module-level lists. In the game they belong to the Sim, the City and the view that owns them, and survive a Rebuild, a Swap and an Undo.
- **Walkers out of the drawing code.** Who a Walker is, what they decide and their Storylets move into a module with no drawing in it, which the drawing code reads. That is what makes the Walkers seam testable.
- **Saved.** Which Walkers the player keeps, and their logs, are part of a saved run.

Surface pattern

- The surface pattern is drawn at no cost in triangles; modelled windows cost triangles for every bay. The author of Neon Terrarium reports spending two thirds of that project on performance and drawing small detail as texture for that reason. The target has not been measured against the 1,000-car frame budget.
- Decision: measure first. If the target holds the frame budget at City zoom, the surface pattern is removed. If it does not, modelled detail is drawn from Tile zoom inward and the pattern stands in for it farther out, as Block-zoom props already fade.

Glossary changes

- **Walker** loses "Decoration only: traffic never meets one." A Walker is someone with a name and a log, and traffic stops for them at a Signal.
- New: **Storylet** (a short story in beats that happens to a Walker the player watches or keeps), **Place** (somewhere a Walker can go: a door, a bench, a terrace), **Signal** (traffic lights running a Priority junction in phases), **Walk phase** (the phase in which every Arm is red and Walkers cross), **Stand** (a place off the Road where one car can park), **Follow** and **Keep** (what the player does to a Walker). A name is needed for the zoom closer than Block zoom.
- An ADR is owed for each of: the low-poly look replacing the look of `.scratch/visual-style/spec.md`; Walkers meeting traffic; Signals as a second way to run a Priority junction, and whether the player chooses it with a Tool.

## Testing Decisions

A good test here asserts an outcome the player could see: a car stopped or went, a Walker crossed or waited, a log holds these lines in this order. It never asserts how the outcome was reached.

- **Simulation outcomes** (the existing seam): with Signals on, a car on a red Arm is stopped at its line and one on a green Arm goes through; in the walk phase no car enters the Junction; a car that takes a Stand leaves its lane and later rejoins it and completes its route; a seed gives the same result every run with Signals and parking on. Prior art: the tests that a City jams as configured and that a seed gives the same result.
- **Walkers** (a new seam, agreed with the user on 2026-11-20; CLAUDE.md's list of seams is to gain it): the same seed gives the same Walker; a Storylet begins only for a Walker who has been followed long enough or is kept, and only one that fits them; its beats run in order and end in the Walker's log; a Walker starts across a Road only in the walk phase with time enough left; a save loads back the Walkers the player keeps and their logs. Prior art: the Stages tests, which drive game state and read it back.
- Everything else (the look, the blend, the figures' motion, the lights' lamps, the camera, the page) is verified by running the game, as CLAUDE.md has it for `src/render` and `src/ui`. The scene check and the frame-time bench apply to the look.

## Out of Scope

- A transport or airport Tile, and the planes that would belong to it.
- Demand by category and trips that start and end at Tiles: [#95](https://github.com/artsaraiva/clearway/issues/95). This spec depends on it for cars with real destinations and stops at "the same trip, paused" until it lands.
- Interiors, furnishing a home, and Walkers' relationships beyond the one who walks beside them.
- Crime, jobs with consequences, or any Storylet that changes the City. A Storylet is something to read.
- Whether the player switches a Junction between Signals and the Priority rule with a Tool: an ADR, then its own tickets.
- Sound.
- Touch.

## Further Notes

Not built in the prototype

- **Terraces and balconies.** No Walker goes up to one.
- **A shop's own truck.** Deliveries arrive from the traffic and leave again; no truck belongs to a shop.
- **Trips that end at a Stand.** A parked car is its trip paused.
- **Walking between Tiles.** A Walker crosses at their own Junction and stays on their own Tile.
- **Stands on industry.** Nothing parks at a plant.
- **Crossing at a Ring.** A Ring has no Signal, so nobody crosses there.
- **Drivers' Storylets by watching.** Each driver gets one fixed Storylet without being watched.
- **Other Zones' buildings checked.** Only high-density, low-density, shops and industrial were looked at in the target look.
- **Saving.** Nothing about Walkers, Storylets or parked cars is saved.

Rough spots in the prototype

- A parking car glides in a straight line from its lane across the pavement to its Stand, and jumps back when it leaves.
- Of seven Stands found on the three Tiles, five could be bound to a lane.
- Shed walls get a door on every patterned wall, so some doors face a wall or a neighbour.
- Off the pavement a Walker walks straight to a door or a bench and can pass through a planter, a pot or a corner of a building.
- Pots are placed along every ground-floor wall without checking what stands beside it, so a pot can poke into the next building.
- A lamp's pool of light on the ground fades up with the old even fade, before its lamp switches on.
- A Storylet's log line is written when its beat starts: "crossed over" can show while the Walker still waits.
- The Road at the Junction is about 24 m wide, so only Walkers at the kerb in the first six seconds or so of the walk phase go; the rest wait a whole cycle. A waiting Walker gives up after 150 seconds.
- Cars have green for 24 of every 57 seconds. Jams with Signals on were not measured.
- Give-way triangles are still painted on Arms that now have a Signal.
- The glow washed out lit windows before it was halved; the accepted values are untested at night on a large City.
- With flat colour, low-density houses lost their windows until the wall-window path gave them boxes; any wall whose windows a Zone builds some other way was not checked.
- The lights' lamps, the marker over a followed Walker and each lamp are separate draws: fine for three Tiles, not for a large City.
- The target was run at 60 frames a second for two small views in headless Chrome early on, before the blend's later passes, Walkers, Signals and parking. Nothing was measured after that.
- The page's own panel, clicks and keys run only inside the artifact's canvas and were never tested; everything else was checked in a local headless render.
- The whole prototype is uncommitted on its branch.

What the user approved, and what they had not

- Approved: the low-poly look over the current one; keeping the buildings' designs; the target Block's direction ("yes this direction"), with the glow turned down; jointed Walkers; traffic lights.
- Not yet approved when this was written: the three-Tile page with parking, drivers, and residents, shopkeepers and plant workers. The user asked for this spec before saying.

Sources

- Neon Terrarium, <https://jannstudios.itch.io/neon-terrarium>, and its author's answers in a Reddit thread the user shared as screenshots: seeded Walkers, Storylets that start when watched, detail baked as texture for performance, a one-page style guide, a "lab" page of variants before anything goes into the game.
- Dorfromantik, for the feeling of a handmade piece.

A one-page style guide for the target look (palettes per Zone, short rules a build is checked against) is worth writing once the look is settled. It would replace the parts of `.scratch/visual-style/spec.md` this spec overturns.

## Issues

- Spec: [#270](https://github.com/artsaraiva/dioramania/issues/270)
- [#271](https://github.com/artsaraiva/dioramania/issues/271) Capture the prototype
- [#272](https://github.com/artsaraiva/dioramania/issues/272) Record the look and the Walker in the glossary and ADRs
- [#273](https://github.com/artsaraiva/dioramania/issues/273) Remove the planes
- [#274](https://github.com/artsaraiva/dioramania/issues/274) Grill: how each Zone works into the City
- [#275](https://github.com/artsaraiva/dioramania/issues/275) Grill: the seams between Tiles
- [#276](https://github.com/artsaraiva/dioramania/issues/276) Low-poly shading and shapes behind a dev switch, blocked by [#271](https://github.com/artsaraiva/dioramania/issues/271)
- [#277](https://github.com/artsaraiva/dioramania/issues/277) Windows, sills, shutters and doors as objects, blocked by [#276](https://github.com/artsaraiva/dioramania/issues/276)
- [#278](https://github.com/artsaraiva/dioramania/issues/278) Flower boxes and pots, blocked by [#277](https://github.com/artsaraiva/dioramania/issues/277)
- [#279](https://github.com/artsaraiva/dioramania/issues/279) Sweep the remaining Zones in the look, blocked by [#277](https://github.com/artsaraiva/dioramania/issues/277)
- [#280](https://github.com/artsaraiva/dioramania/issues/280) Measure the look against the frame budget, blocked by [#277](https://github.com/artsaraiva/dioramania/issues/277)
- [#281](https://github.com/artsaraiva/dioramania/issues/281) Make low poly the game's one look, blocked by [#279](https://github.com/artsaraiva/dioramania/issues/279), [#280](https://github.com/artsaraiva/dioramania/issues/280)
- [#282](https://github.com/artsaraiva/dioramania/issues/282) A one-page style guide, blocked by [#281](https://github.com/artsaraiva/dioramania/issues/281)
- [#283](https://github.com/artsaraiva/dioramania/issues/283) Soft shade, restrained glow and the miniature lens, blocked by [#276](https://github.com/artsaraiva/dioramania/issues/276)
- [#284](https://github.com/artsaraiva/dioramania/issues/284) Dusk as an event, blocked by [#277](https://github.com/artsaraiva/dioramania/issues/277)
- [#285](https://github.com/artsaraiva/dioramania/issues/285) Keys, drag-to-move and the closer zoom
- [#286](https://github.com/artsaraiva/dioramania/issues/286) Walkers with an identity, in a module of their own, blocked by [#272](https://github.com/artsaraiva/dioramania/issues/272)
- [#287](https://github.com/artsaraiva/dioramania/issues/287) Jointed Walkers that walk in step, blocked by [#286](https://github.com/artsaraiva/dioramania/issues/286)
- [#288](https://github.com/artsaraiva/dioramania/issues/288) Places, and things for Walkers to do, blocked by [#287](https://github.com/artsaraiva/dioramania/issues/287)
- [#289](https://github.com/artsaraiva/dioramania/issues/289) Follow a Walker, blocked by [#286](https://github.com/artsaraiva/dioramania/issues/286)
- [#290](https://github.com/artsaraiva/dioramania/issues/290) Storylets, blocked by [#288](https://github.com/artsaraiva/dioramania/issues/288), [#289](https://github.com/artsaraiva/dioramania/issues/289)
- [#291](https://github.com/artsaraiva/dioramania/issues/291) A door of their own, blocked by [#290](https://github.com/artsaraiva/dioramania/issues/290)
- [#292](https://github.com/artsaraiva/dioramania/issues/292) Keep Walkers across a save, blocked by [#290](https://github.com/artsaraiva/dioramania/issues/290)
- [#293](https://github.com/artsaraiva/dioramania/issues/293) Terraces and balconies, blocked by [#288](https://github.com/artsaraiva/dioramania/issues/288)
- [#294](https://github.com/artsaraiva/dioramania/issues/294) Walking between Tiles, blocked by [#288](https://github.com/artsaraiva/dioramania/issues/288), [#275](https://github.com/artsaraiva/dioramania/issues/275)
- [#295](https://github.com/artsaraiva/dioramania/issues/295) Signals at Priority junctions, blocked by [#272](https://github.com/artsaraiva/dioramania/issues/272)
- [#296](https://github.com/artsaraiva/dioramania/issues/296) Walkers cross on the walk phase, blocked by [#288](https://github.com/artsaraiva/dioramania/issues/288), [#295](https://github.com/artsaraiva/dioramania/issues/295)
- [#297](https://github.com/artsaraiva/dioramania/issues/297) Stands and cars that park, blocked by [#272](https://github.com/artsaraiva/dioramania/issues/272)
- [#298](https://github.com/artsaraiva/dioramania/issues/298) Drivers, blocked by [#290](https://github.com/artsaraiva/dioramania/issues/290), [#297](https://github.com/artsaraiva/dioramania/issues/297)
- [#299](https://github.com/artsaraiva/dioramania/issues/299) A shop's own truck, blocked by [#298](https://github.com/artsaraiva/dioramania/issues/298)

Left to open Grills, with a comment on each pointing here: whether the player chooses Signals with a Tool ([#55](https://github.com/artsaraiva/dioramania/issues/55)); trips that end where a car parks, and Demand by category ([#95](https://github.com/artsaraiva/dioramania/issues/95)); Walkers crossing at a Ring ([#35](https://github.com/artsaraiva/dioramania/issues/35)).
