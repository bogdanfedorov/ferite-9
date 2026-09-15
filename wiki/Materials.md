# Materials

Every substance in the world is one entry in the list in `js/materials.data.js`.
The list is plain data — numbers, strings and nested objects only, no references
to anything else in the code — so it can be moved into `materials.json` or any
other format later without touching the engine.

`js/materials.js` reads that list once at load and turns it into the flat typed
arrays the simulation runs on.

## Adding a material

Append an entry. Nothing else needs editing — there is no enum, no id to pick,
no `switch` to extend:

```js
{
  name: 'quartz_sand',
  state: 'powder',
  color: [230, 225, 200],
  grain: 18,
  density: 1500,
  thermalConductivity: 1.1,
  heatCapacity: 800,
  hardness: 6,
  cargo: 'glass',
  melt: { at: 1700, into: 'melt_glass' }
}
```

The id is the position in the list, so appending is always safe; inserting in
the middle renumbers everything after it. Materials reference each other by
`name`, never by id, and an unknown name throws at load with the name in the
message.

Names are `snake_case`. The dictionary keys are derived from the name:
`quartz_sand` reads its label from `mat.quartzSand` and its partitive form
(«взяти піску») from `matGen.quartzSand` in `js/lang/*.js`. A missing key shows
the key itself, so a new material is visible in game before it is translated.

## The state

`state` decides how a cell moves and what it blocks. Everything else in the
engine derives from it:

| state | falls | flows | blocks | drillable |
|---|---|---|---|---|
| `void` | — | — | no | no |
| `powder` | down and sideways | — | yes | no |
| `liquid` | down | sideways by viscosity | no | no |
| `gas` | rises | sideways | no | no |
| `solid` | — | — | yes | yes |
| `structure` | — | — | yes | no, machines own it |

The predicate tables `OPEN`, `MOVABLE`, `BLOCKING`, `RIGID`, `FLUID`, `FIXED`
and `MINEABLE` are filled from the state, so simulation code asks
`if (OPEN[m])`, never `if (m === EMPTY || m === STEAM)`.

Exactly one material carries `isVoid: true` (the cell that means nothing is
there) and one carries `isEdge: true` (what lies outside the grid).

## Physical properties

These are real units, and the engine derives the simulation coefficients from
them — see [the thermal model](#thermal-model).

| property | unit | what it does |
|---|---|---|
| `density` | kg/m³ | buoyancy: what sinks through what |
| `thermalConductivity` | W/(m·K) | how fast heat crosses the boundary between two cells |
| `heatCapacity` | J/(kg·K) | how much a cell's temperature changes for the heat it takes |
| `emissivity` | 0…1 | share of black-body radiation from an exposed face, default 0.9, always 0 for gases |
| `latentHeat` | kJ/kg | heat given off while freezing, holds a melt liquid at its freezing point |
| `viscosity` | Pa·s | how far a liquid spreads sideways per step |
| `fuel` | MJ/kg | burn time in a generator; anything above zero is fuel |

Bulk densities are used for powders (loose sand, not quartz), and effective
high-temperature conductivities for glowing beds and melts, where radiation
inside the material carries far more heat than conduction: embers 4 W/(m·K),
flame and melts 3, molten iron 35.

## Gameplay properties

| property | what it does |
|---|---|
| `color` `[r, g, b]`, `grain` | base colour and per-pixel noise amplitude |
| `glow` | adds to the glow buffer |
| `look` | `flame` flickers with the cell's remaining life, `pulse` breathes like lava |
| `hardness` | drill units per cell; `0` cannot be drilled, `-1` is indestructible |
| `breaksInto` | what the drill leaves behind, two cells broken give one cell of spoil |
| `settlesInto` | what a melt hardens into while riding a pipe |
| `cargo` | delivery group: `iron` covers both iron and scrap, so the pad and the belt accept either |
| `porous` | a melt sinks through it — embers, coal, slag |
| `grips` | cargo does not slide off it sideways — the belt deck |
| `carries` | machine logistics route through it — the pipe |
| `life` | ticks before a gas or a bed burns out, `[base, random]` or a flat number |

## Transitions

Phase changes are named for what they physically are. The engine folds them
into one warmer-than and one colder-than table, so all three heating forms
behave the same way:

```js
melt:     { at: 1600, into: 'lava' }        // solid or powder → liquid
boil:     { at: 105,  into: 'steam' }       // liquid → gas
ignite:   { at: 420,  into: 'ember' }       // fuel catches
freeze:   { at: 850,  into: 'iron' }        // liquid → solid
condense: { at: 95,   into: 'water' }       // gas → liquid
expire:   { into: 'smoke', chance: 0.55 }   // what is left when life runs out
burn:     { every: 6, into: 'slag' }        // a burning bed spends one life per N passes
```

`emits` pins a cell to its own temperature: embers 1500 °C, lava 1250 °C, flame
760 °C. That is what makes a heat source a heat source.

A liquid with a `freeze` transition is a melt. It does not solidify the moment
it drops below its freezing point — it holds there while it gives off its
`latentHeat`, which is why a pour stays liquid long enough to be worth carrying.
The hold is `latentHeat · 1000 / (heatCapacity · 5)` passes: 60 for iron, 42 for
glass.

## Reactions

A reaction is a pair rule: this material, touching that one, becomes something
else. Both sides can change, and both can be given a temperature:

```js
reacts: [
  { with: 'water', into: 'rock', at: 620, gives: 'steam', givesAt: 260 }
]
```

Lava quenches into rock and flashes the water to steam; molten iron and molten
glass do the same and leave a solid behind; flame touching water turns to smoke
and leaves the water alone (no `gives`). Omitting `at` keeps the cell's own
temperature.

Reactions are stored as a pair table, so a material only pays for the lookup if
it has any, and adding one never touches the simulation loop.

## Thermal model

Each pass, a cell exchanges heat with its four neighbours, then radiates from
whatever faces are open, then drifts toward the geothermal background.

**Conduction** is flux between two cells, not a property of one. The pair
coefficient is the harmonic mean of both conductivities divided by the receiving
cell's volumetric heat capacity `density · heatCapacity`:

```
coefficient(a, b) = HEAT_STEP / (ρa · ca) · 2 · λa · λb / (λa + λb)
```

All of it is precomputed into one `MAT_COUNT²` table, so the inner loop is four
array reads. Two consequences fall straight out of the physics: iron spreads
heat across a whole beam, and air barely takes heat out of stone — a cavity
insulates, which is why a furnace has to be built out of rock and closed.

**Radiation** is what makes a pour cool down. A cell above 200 °C with an open
face loses `εσ(T⁴ − T_ambient⁴)` through it, which dominates every other loss at
melt temperatures. Gases have zero emissivity — a flame is transparent, it is
the glowing surface that radiates.

**The background drift** is the rest of the rock mass, `AMBIENT_FLOW` divided by
the volumetric heat capacity: stone holds its heat for a long time, a puff of
gas takes the room's temperature almost at once.

The engine constants at the top of `js/materials.js` are the bridge between SI
units and the pass rate:

| constant | what it sets |
|---|---|
| `HEAT_STEP` | time per pass over cell size squared; the one knob for overall heat speed |
| `HEAT_RESPONSE_MAX` | ceiling on how much a low-capacity cell may react per pass — stops gases oscillating |
| `HEAT_COEF_MAX` | per-neighbour stability cap, four neighbours stay below 1 |
| `AMBIENT_FLOW`, `RELAX_MIN/MAX` | the background drift and its bounds |
| `CELL_SIZE`, `RAD_VIEW`, `EMISSIVITY` | radiation: 2 cm cells, how much of the sky a face sees |
| `LATENT_STEP` | degrees per pass a melt sheds while freezing |
| `FUEL_TICKS_PER_MJ` | generator burn time per MJ/kg of fuel |

Changing one of those retunes every material at once and keeps them in the same
relation to each other. Changing a material's `thermalConductivity` retunes that
one substance.
