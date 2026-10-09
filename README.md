# Wildcat CEO

A browser game about running an independent oil and gas company. You are the CEO: you lease minerals, negotiate with farmers, hire (and fire) the people who do the actual work, design and frac wells, keep them producing, sell the oil, and survive regulators, activists, price cycles and your own bad decisions.

Influences: *Turmoil* (land, drilling, the price loop), Molleindustria's *McDonald's Video Game* and *Oiligarchy* (systems satire: every shortcut has a cost that someone else pays).

## Run it

On Windows, double-click `run.bat`. It starts the server and opens the game in your browser; close the window to stop it. `test.bat` runs the smoke test and the headless bot.

No build step, no dependencies. Needs Node 18+ only for the tiny static server (ES modules don't load from `file://`).

```
npm run dev
```

Then open http://localhost:8080. Any static file server works as well (`python -m http.server 8080`, GitHub Pages, etc.). The page loads four Google Fonts (Special Elite, Playfair Display, Caveat, IM Fell English) for the 1952 look; offline it falls back to system fonts and still works.

Layout: the masthead, the ticker tape and *The Dry Fork Clarion* strip frame a stage that shows one screen at a time. You start in your **office** (click the desk, phone, cabinet, radio, wall plat, calendar or door); the **plat** screen is the county map with the manila folder of tabs docked beside it; **town** is a walkable Main Street (arrow keys or click; Space to enter a building or talk); each building is an illustrated **interior** with people to talk to; the **field** shows the selected section and its wells. `N` advances the month anywhere, `M`/`T`/`O` jump to the plat, town and office, `Esc` steps back. Below 860px wide the plat and folder stack and a touch d-pad appears in town.

Headless balance test (a scripted bot plays N years and prints the ledger):

```
node test/headless.mjs [seed] [years] [-v]
```

## How the game works

- **Setting**: September 1952, Dry Fork County, Oklahoma. Prices, costs, wages and interest follow the historical track from the proration years through the 1973 embargo, the 1986 crash and the shale boom; technology (fracturing, submersible pumps, digital and 3D seismic, horizontal drilling, shale) unlocks with the decades.
- **The founding year**: you step off the train with about $12,000 and no company. Recruit a geologist (Doc Pruitt at the cafe, Miss Cobb at the store), a rig (Sandoval's cable-tool spudder at the yard, or the Jessup brothers' rotary at the depot) and about $20,000 of capital (Cravens at the hotel, Widow Hargrove and the pastor at the church, a note from the bank), each on their own terms (equity, retainers, a counter-offer at 70% they may or may not take). Founders leave town if you dawdle; the hotel bill comes due every month. When the checklist in the masthead is complete, sign the articles of incorporation in the rooms over the Mercantile. Twelve months or the money gone and you go back to Tulsa to sell insurance.
- **Time**: one turn = one month. `Space` or `N` advances a month. Auto-play with a speed control. Save/Load uses the browser's localStorage (older saves are migrated on load).
- **Map**: 140 parcels (14 × 10 sections) of 320 acres. Each has a surface owner (farm, ranch, subdivision, state/federal land, town, preserve), a mineral owner (sometimes a different party: a *split estate*), hidden geology, and a survey level.
- **Geology**: two targets everywhere. The *Frontier Sandstone* is a shallow conventional reservoir: oil sits in discrete **fields** (elliptical closures spanning several sections). Inside a closure the sand is oil-bearing, with the thickest column at the crest; outside it is wet and a well is a dry hole. Only 2D/3D seismic tells you whether a parcel is inside. Each field is a shared reservoir with oil in place, a drive mechanism, and a pressure that every well (yours and the rivals') draws down; water cut rises as it depletes and sooner near the edge. A waterflood restores pressure and adds ~15% recovery. The *Blackfork Shale* is a deep unconventional play (horizontal wells, multistage fracs, expensive, rarely dry but often mediocre). Surveys give estimates with error bars; skilled geologists tighten them. Drilling reveals the truth and improves neighbours' estimates.
- **Rivals**: four companies with different styles (a shale driller, two conventional operators who have been pumping the old fields for decades, and a land-flipper) start the game holding acreage, some owned outright, some held by production. They lease, drill, discover fields, drill dry holes and flip acreage each month. You can offer to buy their undrilled acreage; producing acreage isn't for sale.
- **Land**: lease negotiations (bonus per acre, royalty) with owners who have their own greed, memory of your lowballs, and a regional hype level that rises with oil prices and good wells. Public land goes to sealed-bid auction against competitors. Surface agreements have damages and conditions (recycled water only, harvest pauses, restoration bonds). Split estates can be forced through the courts, which is legal and everyone hates you for it.
- **Staff**: eight roles. Every task is executed by a specific person and their skill (1–10) and traits drive the outcome: survey accuracy, negotiation odds, drilling cost/time/blowouts, frac effectiveness and screenouts, equipment wear and opex, realized prices, permit speed, activism growth. Busy people can't take a second job; contractors of unknown skill fill gaps. Reputation affects the candidate pool.
- **Wells**: design lateral length, stage spacing, proppant type and intensity, frac fluid, water source, casing, artificial lift (or perf/frac for vertical wells). The estimate updates live with cost breakdown, IP, EUR, NPV, payout, dry-hole risk and warnings when the design doesn't fit the rock. Wells go permit → drill → complete → producing, with cost overruns, blowouts, dry holes and screenouts along the way. Production follows Arps hyperbolic decline (volumetrically limited for the sandstone); water cut rises; health decays and failures need workovers.
- **Market**: mean-reverting oil and gas prices with boom/bust regimes and shocks. Trucking vs pipeline differentials, gas flaring vs a gathering system, disposal wells (with earthquake risk), swaps for hedging.
- **People**: the mayor, the county judge, the sheriff, the editor, the banker, the cafe owner, the state commission's field agent and the pastor are named people with dispositions, parties, greed, honesty and secrets. Each can be approached in their building for what they control (permits, spacing exceptions, a bigger credit line, burying or planting a story, dropping an investigation, a word from the pulpit, gossip) by persuasion, an envelope, a campaign contribution, a favour, blackmail with dirt you hold, or a cowboy leaning on the door. Landowners can be asked for access the same way. Elections in November of even years swap the officeholders. The People tab lists them, and the rivals' standing.
- **Government**: the county gets a permit budget for the year (the judge can find room on the docket, for a consideration), the commission sets the proration allowable until 1972 and Rule 37 spacing needs the field agent's exception. Two parties with different severance taxes, permit times, inspection rates and fines; statutes (pits, flaring, setbacks, water rules) arrive by year whoever is in the courthouse.
- **The Clarion**: everything you do can become a story that brews, prints, gets buried and resurfaces. What gets printed (goodwill and notoriety) drives reputation. Buy advertising, buy the paper and decide what runs, or plant stories about the neighbours. The Clarion tab is the clippings file.
- **The law**: bribes, blackmail, threats, libel and cover-ups are crimes on a record; heat draws the sheriff, then the state. Investigations gather evidence to an indictment, a trial, a fine with a permit freeze, or two years in the penitentiary while Dot keeps the lights on. A lawyer on retainer slows them, a detective from Tulsa digs up dirt on the officials and the rivals, and the sheriff can be told about the neighbours.
- **Crews, weather and rivals**: morale, wildcat strikes, deaths on the rig, drinkers on tour and hot oil; tornadoes, floods, ice storms, droughts, tank and prairie fires and well fires, with a Hartford policy that pays seventy cents on the dollar; rivals with their own ethics who bribe the courthouse, plant stories, top-lease and poach.
- **Community**: an environmental score driven by what you actually do (flaring, fresh water, spills, forced access, restoration), an activism meter that escalates from protests to lawsuits to national campaigns, and programs ranging from honest groundwater monitoring to astroturf groups and a documentary about eagles.
- **Events**: sick cattle, whistleblowers, poaching competitors, senators' dinners, rig deals, ice storms, union drives, a man with a dowsing rod.
- **Losing**: exceed your credit line for three months and the bank takes the keys. Score is company value (cash + PV10 of reserves) net of any equity you sold.

## Code layout

```
index.html, css/theme.css, css/style.css   shell, 1952 design tokens (paper/ink/brass), styling
css/scenes.css                  the town canvas, rooms, field, dialogue box, hints, d-pad
js/main.js                      bootstrap: state, ui, chrome (topbar/ticker/news/drawer), modals, save/load, render() router
js/ui/actions.js                the data-action table (the only place the UI mutates the sim)
js/ui/screens.js                screen state machine: title | office | map | town | interior | field; goto(), back(), key hints
js/ui/input.js                  one keydown/keyup pair; key set for the town loop; dialogue -> modal -> screen -> global dispatch
js/ui/dialogue.js               dialogue box: portrait, typewriter text, numbered options (same node shape as events)
js/scenes/engine.js             rAF loop with dt clamp, DPR canvas sizing, easing camera
js/scenes/sprites.js            12x16 pixel walkers built from parts, props, 24x24 portraits, 3x5 pixel font
js/scenes/townData.js           the 48x28 tile map of Dry Fork, buildings, props, townsfolk, sync(state) extras
js/scenes/town.js               overworld: collision, click-to-walk (BFS), procedural facades, prompts
js/scenes/interior.js, rooms.js generic SVG room renderer and the room definitions (office, storefront, bank, courthouse, sheriff, clarion, cafe, store, depot, church, rig yard, hotel)
js/scenes/talk.js               NPC dialogue trees, the adapter from the sim's conversation()/founderTalk() nodes, the event-to-dialogue bridge
js/scenes/field.js              the Field: SVG landscape of the selected section with its wells
js/sim.js                       new game, monthly tick, valuation
js/geology.js                   basin generation, oil fields (pools), surveys, estimates vs truth
js/competitors.js               rival companies: holdings, legacy wells, monthly leasing/drilling, acreage sales
js/land.js                      parcels, leases, surface agreements, auctions, competitors, hype
js/staff.js                     candidates, hiring, traits, effective skill, task assignment
js/wells.js                     design, cost, performance model, lifecycle, production, maintenance
js/market.js                    prices, differentials, midstream, hedges
js/government.js                parties, permit budgets, proration, Rule 37, inspections, statutes
js/environment.js               env score, activism, incidents, community programs
js/events.js                    decision events
js/era.js, js/tech.js           calendar, cost index, inflate(), interest rates; technology unlocks by year
js/people.js                    the officeholders, elections, approach() and the conversation nodes
js/press.js                     the Clarion: stories, clippings, ads, buying the paper
js/law.js                       crimes, dirt, heat, investigations, sentences, the caretaker months
js/labor.js, js/disasters.js    crews and strikes; acts of God and the insurance policy
js/founding.js                  the founding year: founders, founderTalk(), formCompany()
js/geography.js                 river, county road, railroad, depot, bridge (own seeded RNG, stored in state)
js/ui/platmap.js                hand-drawn SVG county plat map (memoised static layers + live ownership/wells)
js/ui/ticker.js                 ticker tape and period ads
js/ui/*.js                      panels, modals, charts (plain DOM, no framework)
test/headless.mjs               scripted bot for balance checks
test/smoke.mjs, test/pooltest.mjs   world-generation and field-depletion checks
test/geotest.mjs                geography determinism and plat map render check
test/eratest.mjs, approachtest.mjs, foundtest.mjs   era tables, approach() Monte Carlo, the founding year
```

Everything is deterministic for a given seed (enter one on the new-game screen).
