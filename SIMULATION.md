# Simulation core and shell

Status: proposal. The core already runs headless: loading the core files below
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

- `npm test` runs `node --test test/`.
- `test/core.js` loads the core files into one `vm` context in `index.html`
  order and returns the context, so each test gets a fresh world.
- Tests check the model: invariants after `simulate()` (cell counts per
  material conserved where physics says so, `beltCells` matches belt
  materials, no object inside solid cells), and scenario outcomes for a fixed
  seed.
- No browser, no DOM shim. If a core file needs a shim to load, that is a
  boundary violation to fix, not to paper over.

## Enforcement

- `tools/no-browser-in-core.js` in `npm run lint`: fails if a core file
  references `document`, `window`, `localStorage`, `indexedDB`,
  `requestAnimationFrame`, `performance`, `Audio`, `canvas` or `ctx`.
- `tools/no-dead-functions.js` in `npm run lint`: every function has a caller.

## Order of work

1. Test harness `test/core.js` and first invariant tests on today's core.
2. Lint rule for the core boundary.
3. Move `Mixed` piece files to load headless.
4. Storage backend interface with the fake backend; then fix PR #1 findings
   test-first.
