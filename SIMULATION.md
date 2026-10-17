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
| Core | `lang/*.js`, `sizes.js`, `materials.data.js`, `materials.js`, `notice.js`, `world.js`, `objects.js`, `sandbox.js`, `market.js`, `player.js`, `lib/Shape.js`, `PlayerInteract/Registry.js` |
| Mixed | `i18n.js`, `PlayerInteract/Build.js`, `Toolbelt.js`, `Tools/*.js`, `Buildings/*.js` |
| Shell | `settings.js`, `lore.js`, `sound.js`, `render.js`, `hud.js`, `input.js`, `game.js` |

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
  asking for a redraw. The shell redraws the toolbelt when `market.money`
  differs from the value it last drew; every one of those calls changes money,
  and so does `callDrone`, which today leaves the display stale.
- `game.elapsed` in `priceOf`. Prices decay with wall-clock milliseconds kept
  by the shell, which makes the market non-deterministic. The market gets its
  own clock: `market.age` in simulation frames, reset by `resetMarket`,
  advanced by `tickMarket`. At the fixed 60 Hz step one minute is 3600 frames,
  so prices behave the same while the game runs and stop while it is paused,
  as they do now.

## Storage

Disk is a shell concern. The core talks to storage through one backend object
with `get`, `put`, `clear`. Each call has one of three outcomes:
`found | absent | error`. The browser installs the IndexedDB backend. Tests
install a fake backend that can delay, reorder and fail replies. This is how
review findings 1-4 on PR #1 become reproducible tests instead of browser
sessions.

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
2. Done: close the boundary: notice hook, market clock, the two setters,
   `tools/layers.js`, lint rule for the core boundary.
3. Done as part of 2: Mixed files load and run their core paths headless.
4. Split Mixed files so the lint rule can check their core halves.
5. Storage backend interface with the fake backend; then fix PR #1 findings
   test-first.
