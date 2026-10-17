# Simulation core and shell

Status: test harness in place (`npm test`). The core already runs headless: loading the core files below
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

| Layer | Files |
|---|---|
| Core | `i18n.js`, `lang/*.js`, `sizes.js`, `materials.data.js`, `materials.js`, `world.js`, `objects.js`, `sandbox.js`, `market.js`, `player.js`, `lib/Shape.js`, `PlayerInteract/Registry.js` |
| Shell | `settings.js`, `lore.js`, `sound.js`, `render.js`, `hud.js`, `input.js`, `game.js` |
| Mixed | `PlayerInteract/Build.js`, `Toolbelt.js`, `Tools/*.js`, `Buildings/*.js` |

**Mixed** files define what a piece does to cells (core) together with its
HUD and previews (shell). They load headless: a piece names its sounds by key,
and all sound definitions live in `SOUNDS` in `sound.js`.

## Storage

Disk is a shell concern. The core talks to storage through one backend object
with `get`, `put`, `clear`. Each call has one of three outcomes:
`found | absent | error`. The browser installs the IndexedDB backend. Tests
install a fake backend that can delay, reorder and fail replies. This is how
review findings 1-4 on PR #1 become reproducible tests instead of browser
sessions.

## Tests

- `npm test` runs every `test/**/*.test.js`.
- `test/core.js` loads the core files (every `index.html` script that is not
  shell, in page order) into the Node global scope and exports it as `core`.
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

## Known violations

Core files call `play()` from `sound.js` at run time: `market.js`,
`PlayerInteract/Build.js`, `Toolbelt.js`, `Tools/Drill.js`, `Tools/Hand.js`,
`Tools/Ignite.js`. A test that sells, builds or drills throws until these
calls go through a hook the shell installs.

## Enforcement

- `tools/no-browser-in-core.js` in `npm run lint`: fails if a core file
  references `document`, `window`, `localStorage`, `indexedDB`,
  `requestAnimationFrame`, `performance`, `Audio`, `canvas` or `ctx`.
- `tools/no-dead-functions.js` in `npm run lint`: every function has a caller.

## Order of work

1. Done: test harness `test/core.js`, first tests in `test/world.test.js`.
2. Lint rule for the core boundary.
3. Move `Mixed` piece files to load headless.
4. Storage backend interface with the fake backend; then fix PR #1 findings
   test-first.
