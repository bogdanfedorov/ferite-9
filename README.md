# Ferit-9

Falling-sand mining and smelting sim. A 480×320 cell world with a heat field,
phase transitions and an underground base. Vanilla JavaScript, no bundler and no
runtime dependencies, canvas rendering, Go launcher with `go:embed`.

Gameplay, mechanics and lore live in the [Wiki](../../wiki).

## Run

Open `index.html` in a browser, or:

```bash
make run
```

## Build

```bash
make windows    # dist/Ferit-9.exe
make linux      # dist/ferit-9
make web        # dist/Ferit-9-web.zip for itch.io
make all        # windows + linux
```

The Go build embeds the game into a single binary through `go:embed`. No cgo, no
external modules, so any OS cross-compiles to any other in one command. The
launcher starts an HTTP server on `127.0.0.1` with a random port and a random
token in the path, then opens Edge or Chrome in `--app` mode with a separate
temporary profile.

There is also an Electron build for Steam — it does not depend on the player's
browser and keeps the obfuscated bundle inside asar: `npm run dist:win`.
All three paths are covered in [BUILD.md](BUILD.md).

## Lint

```bash
npm i
npm run lint        # biome + comment check
npm run lint:fix    # biome autofix
```

Formatting and lint rules are in `biome.json`: 2-space indent, single quotes,
semicolons, 100 columns.

**Comments in code are forbidden.** Biome has no rule for this, so the check is
a separate script, `tools/no-comments.js` — it walks `js/`, `electron/` and
`tools/`, skips strings, template literals and regex literals, and fails on any
`//` or `/* */` left in the source. Explanations go into this file, BUILD.md or
the wiki, where they can be read without opening the code.

The rule is also stated in `CLAUDE.md` for anyone using an AI agent on this
repo.

## Localisation

All text sits in `js/lang/*.js`, one flat dictionary per language — lore,
Mission Control lines, the assembly terminal, the basic test. Nothing is
hardcoded in the code, only calls:

| Call | What it does |
|---|---|
| `t('key')` | string from the dictionary |
| `tf('key', {vars})` | substitution |
| `tPick('key')` | random variant from a pool |
| `tPlural('key', n)` | plurals: separate rules for Slavic languages and English |

Markup is translated through `data-i18n` and `data-i18n-html` attributes.

To add a language: copy `js/lang/en.js`, change the code in `regLang(...)`, add
a line to `LANG_LIST` in `js/i18n.js` and a `<script>` tag in `index.html`.

## Simulation

**The grid** is a set of parallel typed arrays in `js/world.js`, one entry per
cell at `y * W + x`:

| Array | Holds |
|---|---|
| `mat` | material id |
| `shade` | per-pixel colour noise |
| `life` | remaining lifetime of gases and embers |
| `clk` | frame stamp, so a cell moves at most once per step |
| `flow` | the direction a liquid is spreading |
| `temp` | temperature, °C |
| `temp2` | diffusion scratch buffer |
| `dmg` | drill work accumulated on the cell |
| `dmgT` | when the cell was last drilled |

Fog of war keeps `seen` (8×8 chunk explored flags) and `fogVal` (the smoothed
0..1 visibility the renderer samples bilinearly).

**Thermodynamics.** Every cell carries a temperature. Materials are described in
SI units — density in kg/m³, thermal conductivity in W/(m·K), heat capacity in
J/(kg·K), latent heat in kJ/kg — and the simulation coefficients are derived
from them, so the substances stay in the right relation to each other and there
is one global knob for how fast the whole field runs.

Conduction is a flux between a pair of cells: the harmonic mean of the two
conductivities over the receiving cell's volumetric heat capacity, precomputed
into a material × material table. Iron carries heat down a whole beam; air takes
almost none out of stone, so a cavity insulates and a furnace has to be closed.
A cell above 200 °C with an open face also radiates, `εσ(T⁴ − T_ambient⁴)`,
which is what cools a pour down to where it can freeze — gases have zero
emissivity, a flame is transparent. What is left is a slow drift toward the
geothermal background, 18 °C at the top to 64 °C near the bottom.

Heat sources pin themselves: embers 1500 °C, lava 1250 °C, fire 760 °C. Phase transitions are named for what they are — `melt`,
`boil`, `ignite`, `freeze`, `condense` — and a melt holds at its freezing point
while it gives off its latent heat, 60 passes for iron. Diffusion runs on 16×16
thermal chunks; a chunk that has settled to the background is skipped until a
neighbour brings in a gradient.

Full property reference: [Materials](../../wiki/Materials).

**Fog of war.** Unexplored world does not exist for the simulation — no
particles, no heat. Once an area is uncovered it runs forever, including while
the player is somewhere else. 220 rays leave the module for 34 cells; rock stops
a ray but becomes visible itself, so you see the wall and not what is behind it.
Rays step cell by cell, so they fit into a one-cell-wide drift. The exploration
grid is 8×8 chunks with a bilinear edge.

**Portable objects** live outside the grid. An object remembers exactly which
cells it was made of and returns exactly those when it settles, so matter is
never created or destroyed — verified with a counter. When it drops back into
the grid, a spot is searched for up to 14 cells around, and in fully packed rock
it swaps places with whatever is standing there.

## Performance

153 600 cells by default. Simulation cost grows with the explored area: ~2 ms per step at
the start (26% of the world), ~9 ms with the map fully open. Exploration rays
cost 0.05 ms and run every fourth frame, rendering ~0.5 ms.

## Extension points

- `onObjectImpact(object, speed, target)` fires when a swung lump hits something
  at 0.45 cells per tick or more. This is the seam for forging.
- The test room (`js/sandbox.js`) is a second world generator, not a layer over
  the mine: `generateTestRoom(seed, w, h)` lays a flat floor and one bedrock bin
  per material, built from the material list itself, so a new substance gets its
  own labelled bin for free. `sandbox.on` is what the rest of the code reads —
  `js/player.js` skips fuel burn and fall damage under it, `js/render.js` draws
  the bin headers. Bin width comes from the longest label the material has in any
  registered language, so names stay on one aligned row; the reset button over
  each bin is a world-space rect that `roomButtonAt()` hit-tests before the tool
  chain runs. `tickTestRoom()` walks the bins a few frames apart and tops up or
  repours whichever one has run out, which is what keeps fire lit and melts
  molten. Both worlds are reached through `enterWorld(room)` in `js/game.js`:
  the start screen and the World section of the settings panel call it.
- Adding a substance is appending one entry to the list in
  `js/materials.data.js`. There is no enum of ids, no `switch` and no call site
  to update: the id is the position in the list, materials point at each other
  by name, and everything the simulation needs — movement class, predicates,
  heat coefficients, phase transitions, reactions — is derived at load by
  `js/materials.js`. The data file is plain JSON-shaped data on purpose, so the
  table can move to `materials.json` without the engine noticing.
- Gas lifetime is a material field: `life: [150, 100]` on steam means 150 ticks
  plus up to 100 random, `life: 255` on embers is flat. `setCell` reads
  `LIFE_BASE` / `LIFE_RND` and no longer names any substance.
- Substance-specific behaviour is a property, not a branch. A melt sinks through
  anything `porous`, cargo stays on anything that `grips`, the market
  buys by `cargo` group so scrap and ingot count as the same good.
  Water quenching lava is a `reacts` entry in the table, read as a pair lookup
  in the thermal pass.
- Material predicates are lookup tables, not type comparisons. The registry
  fills `OPEN` (void or gas), `MOVABLE` (powder or liquid), `BLOCKING` (powder,
  solid or structure), `RIGID` (solid or structure), `FIXED` (structure or
  indestructible) and `MINEABLE` (drillable solid) from the `state`, so
  `if (OPEN[m])` replaces every hand-written `m === EMPTY || m === STEAM`.
- World size is a parameter: `generateWorld(seed, w, h)` reallocates every grid
  array and the fog and thermal chunk grids, then lays the
  world out in proportions rather than fixed depths. `WORLD_W` / `WORLD_H` in
  `js/world.js` are the defaults the game passes. Call `allocBuffers()` after a
  size change so the viewport clamps to the new width. At 480×320 generation is
  bit-identical to the fixed-size version. Costs measured here: 38 400 cells
  0.55 ms per step and 0.7 MB of grid, 153 600 cells 1.4 ms and 2.6 MB, 614 400
  cells 3.5 ms and 10.5 MB.
- Both generators share a frame in `js/world.js`: `beginWorld(seed, w, h)`
  resizes if needed, reseeds and clears every grid; `finishWorld(tempOf)`
  clears the pickup zone, sets every cell's starting temperature and wakes all
  thermal chunks. The pickup zone is not generated: the player builds it with
  the Pickup tool, which writes its cells and stores its cargo box with
  `setCargoBox(box)`. Grid writes go through a handful of primitives there:
  `setCell` / `setCellHot` lay a fresh cell (new shade, damage cleared,
  lifetime set, its thermal chunk woken), `paintCell` swaps only the material
  and lifetime for generation, `moveCell` carries a cell and its temperature
  into another and leaves void behind, and `openNear` searches rings outward
  for the nearest open cell.
- Tools and buildings are *pieces*: one file each under `js/PlayerInteract/`,
  registered with `regTool` / `regBuilding` into `PIECES`. Shapes live in
  `js/lib/Shape.js`. A built thing is a cell of one material, never an object.
  Full guide: [ARCHITECTURE.md](ARCHITECTURE.md). Pieces without a `cost` are
  open at the start; the rest are bought (and levelled up) in the E menu. An
  opened tool drops into the first free cell of the 8-cell hotbar.
- The market is one plain table, `GOODS` in `js/market.js`: a `cargo` group
  name, a base price, and a half-life in minutes. `priceOf(good)` is a pure
  function of `game.elapsed`, so a price needs no state and a new good is one
  line plus a `cargo` tag on its materials. The player builds one pickup zone
  (`padState()` reads it); `callDrone()` charges `DRONE_FEE`, and halfway through the trip
  `deliverPad()` clears the cargo box and pays at the prices of that moment. `event`
  on a good names the lore line fired at its first sale.
- Mission Control lines are plain arrays in `js/lore.js`.
- Key bindings are a plain list in `KEY_BINDS` (`js/settings.js`): an id, the
  default codes, and a `set.key.<id>` dictionary entry. Adding an entry puts a
  row in the settings panel on its own; `keyAction(e.code)` is what `js/input.js`
  reads instead of comparing codes.

## Settings

The settings screen (`O`, or the settings button on the module plate) holds language, sound,
grab size, colour scheme and key bindings. Everything lives in the `settings`
object in `js/settings.js` and is written to `localStorage` under
`ferit9.settings` — language keeps its own key, `ferit9.lang`.

**Grab size** is the side of the square the hand closes on, 1 to 4, so 1 to 16
cells per fistful. The grab always takes a single material: it starts at the
cell under the cursor and spreads over its neighbours of that same material
until the hand is full.

**Colour schemes** are daltonisation, not a repaint. Each material colour is
converted to linear RGB, simulated through a protanope, deuteranope or
tritanope matrix, and the error between the two is folded back into the
channels that viewer still separates — so pairs that used to merge spread along
an axis they can see. Saturation is then lifted a third; the high-contrast mode
skips the simulation and only spreads saturation and contrast. The same
transform runs over the HUD accent colours, which are written back as CSS
custom properties (`--sand`, `--ok`, `--danger` …), so panels, the canvas
overlays and the palette never drift apart. `applyVision()` rebuilds both; it is
the only place material colours reach `palR/palG/palB`.

## Layout

| File | What is in it |
|---|---|
| `js/i18n.js` | localisation engine: `t`, `tf`, `tPick`, `tPlural`, language switch |
| `js/lang/uk,en,pl.js` | dictionaries: UI, lore, terminal, basic test |
| `js/materials.data.js` | the material list: one entry per substance, plain data |
| `js/materials.js` | material registry: ids, predicates, heat coefficients, transitions |
| `js/settings.js` | settings store, key bindings, colour-blind palettes, the settings panel |
| `js/market.js` | goods, prices over time, the drone |
| `js/lore.js` | module callsign, Mission Control channel, death and event lines |
| `js/world.js` | grid, generation, particle simulation, heat field, phase transitions |
| `js/objects.js` | portable objects: grab, drag, hit, drop back into the grid |
| `js/lib/Shape.js` | `SHAPES`: line, slope, rect, circle → cell pools |
| `js/PlayerInteract/` | `Registry.js`, `Build.js`, `Toolbelt.js`, `Tools/*`, `Buildings/*` — see ARCHITECTURE.md |
| `js/sandbox.js` | the test room: flat world, a bin per material, restocking |
| `js/player.js` | driller physics, timed drilling |
| `js/render.js` | world raster, heat map, glow, vector overlays |
| `js/sound.js` | `SOUNDS` table of named tones, `play(name)` |
| `js/hud.js` | DOM cache, meters, market panel, probe chip, shape bar, message line and `say` |
| `js/input.js` | keyboard and mouse state, key actions, shape bar clicks |
| `js/game.js` | `game` state, milestones, step and frame loop, screens |
| `main.go` · `Makefile` | Go launcher: game inside the exe, own window, no cgo |
| `electron/main.js` | main process of the Electron build |
| `tools/build-app.js` | concat, minify and obfuscate into `app/bundle.js` |
| `tools/webzip` | packs the web build for itch.io |
| `tools/fetch-fonts.js` | inlines fonts into `fonts/` for offline use |
| `tools/no-comments.js` | comment check |

Script order is in `index.html`. Dependencies are one-way and modules talk
through globals.
