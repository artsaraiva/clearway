# How builder games level buildings up: research

Written 2026-11-16. Question: how do builder games make buildings upgrade on their own, and what is known about the mechanisms (no design recommendation here).

## Source quality, read this first

Nearly every page here is a community or secondary source. The high-trust sources I wanted were mostly unreachable. Tags:

- **[dev]** developer or publisher page, opened and read.
- **[wiki-P]** Paradox Wikis (hosted by Paradox, community-edited). Each page says it was last verified for CS1 v1.16, and may be outdated.
- **[secondary]** press, Wikipedia, or fan pages, opened and read.
- **[snippet]** only seen in a web-search result summary, page not opened or not reachable. Treat as unverified.

Unreachable: Paradox CS2 dev diary "Economy part two" (HTTP 500, three tries) and the Paradox forum copy (bot wall); EA's "Under the Hood of SimCity's Traffic System" and EA's "SimCity building wealth" (connection errors); simcity.fandom.com, anno1800.fandom.com (HTTP 402); Prima SimCity eGuide (403); cs2.paradoxwikis.com Buildings and Land_value (404). No developer talk or postmortem was found for any game below. Gaps are listed at the end.

## 1. Cities: Skylines 1 (CS1)

- **Levels per zone.** Residential has 5 levels. Commercial, industrial and office have 3. [wiki-P Residential](https://skylines.paradoxwikis.com/Residential), [wiki-P Commercial](https://skylines.paradoxwikis.com/Commercial).
- **Rule.** "Buildings will upgrade to the next level when the factors listed below are high enough." [wiki-P Zoning](https://skylines.paradoxwikis.com/Zoning). The wiki gives **no numeric thresholds**, no level-down rule and no progress-bar description.
- **Factors per zone** [wiki-P Zoning](https://skylines.paradoxwikis.com/Zoning):
  - Residential: land value and average education of residents.
  - Commercial: land value and average wealth of shoppers, measured by the level of their home building.
  - Industrial and office: average education of workers and a service coverage score.
  - Services affect residential and commercial only indirectly, by raising land value.
- **Service coverage weights (industrial / office)**, same page: cargo transport +1 / 0, fire +0.5 / +0.2, public transport +0.333 / +0.333, police, health and death care +0.2 each, entertainment +0.125 / +0.167, schools +0.125 / +0.143 each; noise -0.143 / -0.25, abandonment -0.143 / -0.333, ground pollution -0.167 / -0.25. The weights are relative; strength depends on road distance to the provider and its budget, and a very low budget can cancel a service's benefit.
- **Land value.** High land value is required for top-level residential, commercial and office; industrial does not depend on it. Raised by services, parks and plazas, shoreline; lowered by ground and water pollution, poor service performance and noise. Traffic appears only indirectly, as congested streets causing noise. [wiki-P Land value](https://skylines.paradoxwikis.com/Land_value)
- **Abandonment.** Wiki stub lists causes: flooding, garbage, sewage, corpses, no water or power, crime, pollution, noise, high taxes, and low land value (which "can cause higher-level buildings to be abandoned"). Abandoned buildings lower land value. The page does not explain level-down or give thresholds. [wiki-P Abandonment](https://skylines.paradoxwikis.com/Abandonment). Land value page: if it drops low enough the building is abandoned, and bulldozing speeds redevelopment. [wiki-P Land value](https://skylines.paradoxwikis.com/Land_value)
- **What a level changes.** More households or jobs per cell. Per cell, households: low-density residential about 0.2, 0.25, 0.333, 0.375, 0.417 for L1 to L5; high-density 0.6, 1.0, 1.33, 1.5, about 1.6. Jobs per cell L1 to L3: low commercial 0.5, 0.75, 1.0; high commercial 0.75, 1.0, 1.25; industry 1.0, 1.5, 2.0; office 0.5, 1.1, 1.75. [wiki-P Commercial](https://skylines.paradoxwikis.com/Commercial), [wiki-P Residential](https://skylines.paradoxwikis.com/Residential). Leveled employment buildings give "more and better quality jobs". Tax amounts and traffic generated per level are not on these pages.
- **Density is the player's choice.** Low and high density are separate zone types (the households table has separate Low Res and Hi Res rows). Level changes the figures within the row; no page describes a level turning a low-density building into a high-density one. This is an inference from the two separate tables, not a stated rule.
- **Model: replaced or modified.** Not documented in the pages I could open. [snippet] A Paradox forum thread title ("buildings change type when levelling up") suggests a different building appears, but I could not open it (HTTP 500). Historical buildings can level up without changing appearance. [wiki-P Zoning](https://skylines.paradoxwikis.com/Zoning)
- **Player-facing progress.** [snippet] Community guides say selecting a zoned building shows a level bar whose tooltip names what is missing (education, fire, crime, sickness, dead bodies), and that forcing a level down generally requires bulldozing (a mod thread). Not opened; no official source.

## 2. Cities: Skylines II (CS2)

- **Levels.** "All zoned buildings have Building Levels from 1 to 5." Visuals change every other level; in medium and high density residential, levels 3 and 5 add more apartments. [wiki-P CS2 Zoning](https://cs2.paradoxwikis.com/Zoning) (page opened; undated).
- **Density.** Low density: single houses, one household each. Medium: row houses and small apartment blocks. High: large towers, "generate more traffic". Commercial and office have low and high versions; industrial manufacturing is one type. Same page. Density is the zone the player paints.
- **Rule (current economy model).** When rent exceeds upkeep, residents or companies use the leftover to improve the building, which can raise its level; higher levels cost more to maintain so rent rises. Same page.
- **Downgrade and abandonment.** If residents cannot afford rent, no money goes to upkeep and the building deteriorates; residents leave, it is abandoned, land value drops, homeless citizens may move in, and continued disrepair eventually collapses it. Specialized industry buildings cannot be abandoned. The page describes no direct level-decrease. Same page.
- **Land value** rises when residents' and companies' needs are met (services, shopping, jobs). Same page.
- **Developer wording.** [snippet] Search summary of Paradox's Economy 2.0 dev diary ([dev, unreachable](https://www.paradoxinteractive.com/games/cities-skylines-ii/news/dev-diary-economy-part-two)): paying upkeep raises a "building condition" by a constant amount until the building levels up; non-payment lowers it by the same amount until it collapses. I could not read the original, so verify before relying on it.
- **What a level changes.** Cost to maintain, rent, production and sale speed (commercial), lower utility use and pollution (industry, office), apartment count at some levels. [wiki-P CS2 Zoning](https://cs2.paradoxwikis.com/Zoning). Thresholds, tax and per-level traffic figures are not on the page.
- **Model.** Not documented in the pages I opened.
- **Progress display.** [snippet] A Steam thread describes a progression bar fed by a rent pool that fee-based services draw from. Community only.

## 3. SimCity 4 and SimCity (2013)

- **SimCity 4, density.** [secondary] Zones come in varying densities chosen by the player; agriculture is its own industrial zone; buildings generally need road adjacency; the game simulates decay and gentrification, and a building built for wealthier tenants can house lower-wealth tenants. ([Wikipedia](https://en.wikipedia.org/wiki/SimCity_4)). That page does not name the three wealth tiers.
- **SimCity 4, wealth.** [snippet] Fan wiki results say density and wealth are separate (density is how many Sims a lot holds, wealth is §, §§, §§§, "tax potential"). Sources: [simcity.fandom Density](https://simcity.fandom.com/wiki/Density), [sc4devotion Wealth](https://www.sc4devotion.com/wiki/index.php?title=Wealth) (the latter was opened and only defines wealth as tax potential and is marked a stub).
- **SimCity 4, traffic and commute.** [snippet] Only forum and guide claims: congestion raises commute time and produces "No Job" icons and abandonment; other posters attribute the same symptoms to hitting demand caps or missing utilities. No developer source found. The Wikipedia page only quotes Jeff Speck calling the traffic model "more advanced than what most traffic engineers use".
- **SimCity (2013), density.** Maxis' Ross Treyz: "We no longer define residential, commercial or industrial density through zoning"; density comes from the road type. Dirt roads keep buildings small, wide avenues with streetcars support tall ones. [secondary quoting developer: GameWatcher](https://www.gamewatcher.com/news/2013-01-03-maxis-explains-road-density-in-new-simcity-tutorial-video).
- **SimCity (2013), wealth.** [snippet] Wealth follows land value (government and service buildings, parks, mansion); industry lowers it nearby. Source: [EA news "simcity building wealth"](https://www.ea.com/en-gb/news/simcity-building-wealth) (unreachable; claim from search summary).
- **SimCity (2013), traffic and abandonment.** [snippet] Forum anecdotes only: no road connection, missing power or sewer. The one relevant developer page, [EA "Under the Hood of SimCity's Traffic System"](https://www.ea.com/en-gb/news/simcity-traffic-system), was unreachable. No confirmed link from commute time to growth in 2013.

## 4. Smaller and cozier builders

- **Mini Motorways.** Houses and destinations appear randomly; each destination collects pins; seven (square) or ten (round) uncollected pins start a warning timer that ends the run when full. [secondary: Wikipedia](https://en.wikipedia.org/wiki/Mini_Motorways). The page does not say destinations upgrade. [snippet] A search result claims destinations upgrade to round versions; not confirmed in the fetched page. Road access is the whole game, but it drives failure, not growth.
- **Islanders.** Buildings score from nearby compatible or incompatible buildings and nature; reaching score thresholds unlocks new building themes. No upgrades of placed buildings; traffic management is deliberately left out. [secondary: Wikipedia](https://en.wikipedia.org/wiki/Islanders_(video_game))
- **Dorfromantik.** Points per matching tile edge; quests give points and tiles; the page says nothing about buildings growing or upgrading; railroad is one edge type and rail lines are a quest target. [secondary: Wikipedia](https://en.wikipedia.org/wiki/Dorfromantik)
- **Townscaper.** No growth or progression; the building shapes are chosen by procedural rules from the player's blocks. [snippet: Game Developer feature](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making) (not opened); Boris the Brave describes it as the main example of Editable WFC.
- **Anno 1800 (resident tiers).** A residence advances only when all its Needs are fulfilled; Game Update 12 made this strict ("To upgrade a building it's now required to fulfill all Needs first"). [dev: Anno Union update 12](http://www.anno-union.com/updates/anno-1800-game-update-12/). [snippet] Community wiki: residence must also be full and have construction materials; happiness not required; skyscraper levels can be downgraded with a button. The upgrade is player-triggered in Anno (an upgrade tool), not automatic. Road or market access as a need is not confirmed here.
- **Pocket City, Before We Leave, Kingdoms and Castles.** Not established. Searches returned no usable rules for building upgrades (Pocket City: only a three-bar demand display and XP from building; the other two returned nothing relevant).

## 5. Road access or traffic quality as the main driver of growth

- **OpenTTD (and Transport Tycoon).** Town growth is driven by cargo handled at stations in town influence: growth speeds up when a station loads or unloads at least one item within a 50-day window, with extra food or water conditions in sub-arctic and sub-tropical climates. Towns grow by extending roads, and growth depends on road travel distance to the centre: roads close but disconnected from the centre get no new buildings. Towns demolish and replace buildings with larger ones. Growth stalls with many junctions because the road-growth walk gives up after a set distance. Source: [OpenTTD wiki, Towns](https://wiki.openttd.org/en/Manual/Towns) (community wiki; the page says nothing on traffic jams or speed).
- **SimCity (2013).** Road type sets building density (see section 3). Road type, not traffic quality.
- **No game found** where measured traffic quality alone is the stated driver of building growth. The closest are SC4 commute time (forum claims only) and OpenTTD station service.

## Summary table

| Game | Unit that levels | Levels | Drivers | Can go down | What a level changes | Source |
|---|---|---|---|---|---|---|
| CS1 | Building on a lot | Res 5; com, ind, office 3 | Res: land value, education. Com: land value, shopper wealth. Ind and office: worker education, service coverage. No thresholds published | Abandonment yes (low land value, services, crime, pollution, taxes); level-down not documented | Households or jobs per cell; ind and office get better jobs | [Zoning](https://skylines.paradoxwikis.com/Zoning), [Abandonment](https://skylines.paradoxwikis.com/Abandonment) |
| CS2 | Building on a lot | 1 to 5 | Rent minus upkeep, land value, demand | Deteriorates to abandonment and collapse; no direct level-down documented | Upkeep, rent, apartments (levels 3 and 5), visuals every other level, resource use | [CS2 Zoning](https://cs2.paradoxwikis.com/Zoning) |
| SimCity 4 | Lot | Density 3 x wealth 3 (wealth tiers from snippet) | Demand caps, land value, services; commute claims are forum only | Decay and gentrification (Wikipedia) | Not documented in opened pages | [Wikipedia](https://en.wikipedia.org/wiki/SimCity_4) |
| SimCity (2013) | Building by road type | By road tier | Road type sets density; land value sets wealth (snippet) | Not confirmed | Density, services and traffic load | [GameWatcher](https://www.gamewatcher.com/news/2013-01-03-maxis-explains-road-density-in-new-simcity-tutorial-video) |
| Mini Motorways | Destination | Not confirmed | Pins collected | n/a | n/a | [Wikipedia](https://en.wikipedia.org/wiki/Mini_Motorways) |
| Islanders | None (placed buildings fixed) | 0; unlocks by score | Adjacency score | n/a | New themes unlock | [Wikipedia](https://en.wikipedia.org/wiki/Islanders_(video_game)) |
| Dorfromantik | None | 0 | Edge matches, quests | n/a | Tiles, designs | [Wikipedia](https://en.wikipedia.org/wiki/Dorfromantik) |
| Anno 1800 | Residence | Tiers (count not confirmed) | All Needs fulfilled | Downgrade button on skyscrapers [snippet] | Population capacity, new needs | [Anno Union](http://www.anno-union.com/updates/anno-1800-game-update-12/) |
| OpenTTD | Town (buildings replaced) | Town size | Station service, road distance to centre | Not documented | Bigger buildings, more passengers | [OpenTTD wiki](https://wiki.openttd.org/en/Manual/Towns) |

## Gaps

No numeric CS1 or CS2 thresholds; CS2 diary and EA SimCity pages unread; whether CS levelling swaps or modifies the model; SC4 and SC2013 commute-to-abandonment from any first-party source; Pocket City, Before We Leave, Kingdoms and Castles; Townscaper not opened in full.
