# Simulation core and shell

Status: test harness in place (`npm test`). The core/shell boundary is closed:
core files reach the shell only through `notice()`, and `npm run lint` checks it. The core already runs headless: loading the core files below
into a Node `vm` context, `generateWorld(seed)` plus 60 `simulate()` steps work
with no code changes (checked 2026-10-17 on `infinite-world`).

## The rule

The game is two layers.

- **Core** is the world model and its rules: cells, materials, heat, objects,
  player physics, economy. It is deterministic for a given seed and input
  sequence, and it never touches a browser API.
- **Shell** is everything that connects the core to a person: canvas, input,
  sound, HUD, menus, settings UI, storage backends, the frame loop.

The shell reads core state and calls core functions. The core never calls the
shell, except through a hook the shell installed with a setter (the existing
`setLangHook` pattern).

A change to the core is done when its unit tests pass. Running the browser is
for checking the shell, not for proving the core works.

## Files

The single list of layers is `tools/layers.js`. It reads the `<script>` tags of
`index.html` in page order and tags each file `shell`, `mixed` or `core`:
`SHELL` and `MIXED` are named there, every other page script is `core`. A new
file is therefore core, the strict layer, until someone says otherwise.
`test/core.js` loads every non-shell script from it, and
`tools/no-browser-in-core.js` checks every core script from it. The table
below mirrors that file; the file wins.

| Layer | Files |
|---|---|
| Core | `lang/*.js`, `sizes.js`, `materials.data.js`, `materials.js`, `notice.js`, `world.js`, `store.js`, `objects.js`, `sandbox.js`, `market.js`, `player.js`, `lib/Shape.js`, `PlayerInteract/Registry.js` |
| Mixed | `i18n.js`, `PlayerInteract/Build.js`, `Toolbelt.js`, `Tools/*.js`, `Buildings/*.js` |
| Shell | `settings.js`, `lore.js`, `disk.js`, `sound.js`, `render.js`, `hud.js`, `input.js`, `game.js` |

**Mixed** files hold core behaviour (what a piece does to cells, what a tool
costs, translation lookup) next to shell code (previews, HUD cards, the
language switch). They load headless and their core paths run headless. Their
shell functions may touch the canvas or the DOM, so the lint rule skips them;
the headless tests are what keep their core paths honest. Splitting each Mixed
file is step 4 of the order of work, not part of this change. `i18n.js` is
Mixed because `setLang`, `applyI18n` and `buildLangSwitches` use `document`
and `localStorage`; `t`, `tf`, `tPick`, `tPlural` are core.

## Notice hook

The core tells the player about an event through one function:

```
notice(sound, text)
  sound  SOUNDS key or null
  text   translated string or null
```

`js/notice.js` (core, loads before `world.js`) declares it with the existing
setter pattern:

```
var onNotice = null;
function setNoticeHook(fn) { onNotice = fn; }
function notice(sound, text) { if (onNotice) onNotice(sound, text); }
```

With no hook installed the core runs silently. The shell installs one hook in
`startGame`, next to `setLangHook`: it plays `sound` with `play()` and shows
`text` with `transmit(text, NOTICE)`. Every core `transmit` today uses
`NOTICE`, so the hook needs no options argument.

Every `play()` and `transmit()` call in a core or Mixed file becomes one
`notice()` call; a `transmit` followed by a `play` becomes a single call:

| File | Calls |
|---|---|
| `market.js` | `deliverPad`, `callDrone` (3 refusals, launch), `abortDrone` |
| `Toolbelt.js` | `spend`, `buyTool`, `upgradePiece` |
| `Build.js` | `reportBuild` -> `notice(report.sound, t(report.text))` |
| `Tools/Drill.js` | `drillHold` -> `notice('drill', null)` |
| `Tools/Hand.js` | `handPress` |
| `Tools/Ignite.js` | `igniteHold` (too far, ignite or fizzle) |

Shell files keep calling `play()` directly; they are the shell.

Two more run-time calls from core into the shell go with this change, because
a sale or a purchase cannot run headless without them:

- `renderToolbelt()` in `deliverPad`, `buyTool`, `upgradePiece`. The core stops
  asking for a redraw. The shell redraws the toolbelt when `toolbeltKey()`
  (money and every toolbelt field it draws) differs from the key it last drew,
  so a change that leaves money equal (a free unlock, a level) is drawn too.
- `game.elapsed` in `priceOf`. Prices decay with wall-clock milliseconds kept
  by the shell, which makes the market non-deterministic. The market gets its
  own clock: `market.age` in simulation frames, reset by `resetMarket`,
  advanced by `tickMarket`. At the fixed 60 Hz step one minute is 3600 frames,
  so prices behave the same while the game runs and stop while it is paused,
  as they do now.

## Storage

Disk is a shell concern. `js/store.js` is core: the bounded chunk and fog
tiers, the spill policy and the read outcomes. It never touches a browser API.
`js/disk.js` is shell: it builds the IndexedDB backend and installs it with
`setDiskBackend`. Without a backend the store keeps everything in memory.

### Backend

One object, three calls, nothing else:

| Call | Resolves | Rejects |
|---|---|---|
| `get(store, key)` | value (**found**) or `undefined` (**absent**) | **error** |
| `put(store, pairs)` | all pairs written | **error** |
| `clear()` | the owner's stores are empty | **error** |

`store` is `'chunks'` or `'fog'`. A backend belongs to exactly one owner (one
running game) and `clear()` empties only that owner's data.

### Read outcome

Every read ends in exactly one report to `world.js`:

| Outcome | Chunk | Fog | Disk index after |
|---|---|---|---|
| found | `chunkArrived(key)` | `fogArrived(key)` | key kept |
| absent | `chunkMissing(key)` | `fogMissing(key)` | key removed |
| error | `chunkFailed(key)` | `fogFailed(key)` | key kept, next read retries |

An error is never reported as absent: absent means "regenerate from the seed",
and a regenerated chunk that is edited and spilled would overwrite the real
save. A reply is dropped unchanged if `storeReset` ran after the read started
(epoch) or a newer read of the same key replaced it (token).

A failed **write** of the current epoch turns the disk layer off for the rest
of the session (a write started before `storeReset` is ignored either way):
spilled entries go back to `mem`, reads in flight end as **error**, keys that
were only on disk are lost (the index is cleared), and then `diskLost()` is
called once so the world can regenerate those chunks and tell the player.

### Ownership

Each running game owns one database, `ferit9.spill.<random id>`, with the
stores `chunks` and `fog`. Nothing else is stored: there is no save, resume,
meta record or overlay (removed, they had no caller). So `storeReset` clears
only its own database, and another tab never sees or wipes it.

Before it opens its database, the owner takes a Web Lock with the database
name and holds it until the page closes. At startup `js/disk.js` lists
`ferit9.spill.*` databases, and the old shared `ferit9.world`, and deletes each
one whose lock it can take: its owner is gone. Without `navigator.locks` or
`indexedDB.databases` the sweep is skipped; the game still uses its own
database. A live owner holds its lock before its database exists, so a
sweep never deletes it.

`open` handles every event of the request: on `blocked` the call fails with
**error**, and a connection that still arrives later is closed at once.

### Tests

`test/store.test.js` loads `js/store.js` alone into a `vm` context with
recorders for the six report functions, so each test is a fresh store.
`test/fake-disk.js` is a backend whose replies can be held, released in any
order, or failed. `test/disk.test.js` loads what `index.html` loads of
`store.js` and `disk.js` into one context per tab, over one shared fake
`indexedDB` and lock manager, so two tabs run side by side.

## Tests

- `npm test` runs every `test/**/*.test.js`.
- `test/core.js` loads the core and Mixed files (every script `tools/layers.js` does not
  tag shell, in page order) into the Node global scope and exports it as `core`.
  A separate `vm` context is about 30x slower, because every global lookup
  goes through the context proxy. `node --test` runs each test file in its own
  process, so files never share state; inside a file, `generateWorld(seed)`
  resets the world.
- Tests check the model: invariants after `simulate()` (cell counts per
  material conserved where physics says so, `beltCells` matches belt
  materials, no object inside solid cells), and scenario outcomes for a fixed
  seed.
- No browser, no DOM shim. If a core file needs a shim to load, that is a
  boundary violation to fix, not to paper over.

## Closed violations

All fixed on `infinite/core-boundary`. Found by listing every top-level name a core or Mixed file uses that only a
shell file declares (2026-10-17):

| File | Shell names used at run time | Fix |
|---|---|---|
| `market.js` | `play`, `transmit`, `NOTICE`, `game.elapsed` | notice hook, `market.age` |
| `Toolbelt.js` | `play`, `transmit`, `NOTICE`, `renderToolbelt` path | notice hook, shell redraw |
| `Build.js`, `Tools/Hand.js`, `Tools/Ignite.js`, `Tools/Drill.js` | `play`, `transmit`, `NOTICE` | notice hook |
| `world.js` | `view.vw` in `shiftMargin` | `setViewCells(n)` in `world.js`, called by the shell on zoom and resize |
| `objects.js` | `settings.grabSize` in `grabPick` | `setGrabSize(n)` in `objects.js`, called by the shell's settings hook |
| `i18n.js` | `document`, `localStorage` | tagged Mixed |

Drawing code in Mixed files (`ctx`, `view`, `sx`, `uiRgba`, `el`, `input`) is
shell code inside a Mixed file and is not a violation.

## Enforcement

- `tools/no-browser-in-core.js` in `npm run lint`. For every core file it
  fails on a reference to
  - a browser global: `document`, `window`, `localStorage`, `indexedDB`,
    `requestAnimationFrame`, `performance`, `Audio`, `AudioContext`;
  - a top-level name declared in a shell file (`play`, `transmit`, `game`,
    `view`, `settings`, `ctx`, `cv`, ...). This is what catches a core file
    calling the shell; a list of browser APIs alone would not have caught
    `play()` in `market.js`.

  Property names (`a.play`, `{ play: 1 }`) and names the file itself declares
  (a parameter called `sx`) are not references. Run with file arguments, it
  checks those files as core; this is how its tests feed it bad input.
- `tools/no-dead-functions.js` in `npm run lint`: every function has a caller.

## Tests for this change

- `test/notice.test.js`: each listed core action, run headless with a hook
  installed, reports the expected `[sound, text]` pairs; a drone sale pays
  out; prices decay with `tickMarket` frames.
- `test/silent.test.js`: the same actions run without a hook and do not throw.
- `test/layers.test.js`: `tools/layers.js` tags every page script once, in
  page order; `test/core.js` loads exactly the non-shell scripts; the lint
  rule passes on the repository and rejects a core file that uses `document`
  or `play`.

## Order of work

1. Done: test harness `test/core.js`, first tests in `test/world.test.js`.
| Core | `lang/*.js`, `sizes.js`, `materials.data.js`, `materials.js`, `notice.js`, `world.js`, `store.js`, `objects.js`, `sandbox.js`, `market.js`, `player.js`, `lib/Shape.js`, `PlayerInteract/Registry.js` |
| Mixed | `i18n.js`, `PlayerInteract/Build.js`, `Toolbelt.js`, `Tools/*.js`, `Buildings/*.js` |
| Shell | `settings.js`, `lore.js`, `disk.js`, `sound.js`, `render.js`, `hud.js`, `input.js`, `game.js` |
