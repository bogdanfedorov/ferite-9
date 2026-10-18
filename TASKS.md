# Tasks

Source: first playtest feedback (2026-10-17). Every task follows the project
process — docs, model, tests, code — and each step is approved before the next.
Design notes live in `design/<id>.md`; approved answers are in each note's
Decisions section.

Status: `todo` · `docs` · `model` · `tests` · `code` · `done` · `backlog`

## Active

Order of work: A1, B1, B2, C1, D3, then the rest. One agent at a time.

| Id | Task | Status | Feedback |
|---|---|---|---|
| A1 | Pickup zone becomes a fixed-size building with open sky above | model | 1, 2, 3, 7 |
| B1 | Wall: place only into empty or gas cells, skip existing wall cells | model | 9, 11 |
| B2 | Belt renders as one belt, not a stack of rows | model | 8 |
| C1 | Jetpack refuels on the ground at the burn rate | model | 5 |
| C3 | Hand lifts a resource out; it spills on release | model | 19 |
| D1 | Fewer notices; drop echoes of the player's own actions | model | 4 |
| D2 | Interface scale setting | model | 6 |
| D3 | HUD text is not selectable | model | 15 |
| D4 | Build menu: tile grid plus detail panel, one menu | model | 14, 15 |
| D5 | Pickup zone status view: cargo and expected payout | model | 16 |
| D6 | Every action reachable by mouse, no hotkey-only actions | model | 18 |
| E1 | Sorter building: pass or block one material | model | 17 |
| B3 | Sized buildings centre on the cursor | todo | 8 |
| G1 | Closing settings while waiting for a key leaves it listening | todo | — |
| G2 | Remove dead CSS, i18n keys and params; lint them | todo | — |

### B3 — Centre on the cursor

`thickenCells` grows every cell of a sized building toward +x and +y, so a
wall's top-left corner sits on the cursor and a belt ends 24 cells past the
release point. Centre the footprint on the cursor.

### G1 — Key rebind

Closing Settings while it waits for a new key leaves it listening
(`settings.js:330`).

### G2 — Dead code beyond functions

Remove `.util-btn`/`.utility` CSS, the unused `sum` in `ui.drone`, the
unreachable `msg.toolLocked` branch. Add `tools/no-dead-css.js` (class and id
selectors absent from `index.html` and JS) and `tools/no-dead-keys.js` (lang
keys never used, keys missing in a language) to `npm run lint`.

### A1 — Pickup zone as a building

A fixed-size block placed like any building. Placement requires every cell of
the block to be empty and a clear column to the sky above it, so it cannot sit
in sand or over resources. Block size is a code constant. The preview tint
reflects only these rules. Its colour must contrast with sand (former A2).

### B1 — Wall placement

Wall cells go only into empty or gas cells. Cells that already hold wall are
skipped, not rejected. Any other material (resources, liquid) makes the plan
invalid. Cost is charged only for new cells.

### B2 — Belt rendering

A belt is several rows thick, and every row draws its own surface stripe and
arrows. Draw the surface and arrows on the top row only and fill the body as
one piece, so the look scales with the belt size constant.

### C1 — Jetpack refuel

Fuel economy is removed for now: while grounded, fuel regenerates at
`FUEL_BURN_RATE` per frame up to the tank limit.

### C3 — Hand carry

Grabbing a resource empties the cell it came from; the resource is held in
hand. While the mouse button is held nothing else can be moved. On release the
held resource spills into free space near the cursor.

### D1 — Notices

Audit every `notice` call. Remove confirmations of actions the player just
performed (built, removed). Collapse repeats into one notice with a counter and
shorten the time a notice stays on screen.

### D2 — Interface scale

A setting (slider) that scales the whole HUD, persisted with other settings.

### D3 — HUD selection

HUD text cannot be selected with the mouse.

### D4 — Build menu

Left: a grid of tiles, each an icon and a label. Right: a detail panel with
the description, price and a buy button when not bought yet. It stays one menu
visually, and the rest of the screen is not darkened, so money stays visible.
Click-to-assign keeps working as today. Remove text that does not say
anything to the player.

### D5 — Pickup zone status

What lies in the pickup zone, by material, and what it sells for at current
prices — shown the way strategy games do it: a top strip or a pinnable list.
Prices move to their own Market view.

### D6 — Mouse-reachable actions

Every hotkey action (heat view `T`, and the rest) must also be reachable with
the mouse, so a player who does not know the key still finds it.

### E1 — Sorter

A belt building with one chosen material and a mode set by the player:
`pass` lets only that material continue and drops the rest; `block` drops that
material and lets the rest continue.

## Closed

| Id | Task | Outcome |
|---|---|---|
| A2 | Pickup zone invisible on sand | Merged into A1 |
| A3 | Zone on soil does not sell | Not a bug: soil has no price |

## Backlog

| Id | Task | Feedback |
|---|---|---|
| C2 | Player sprite proportions; custom player texture | 10 |
| E2 | World feels empty | 13 |
| F1 | Sorting fee for mixed cargo on one pad | 16 |
