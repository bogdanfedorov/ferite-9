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
| Core | `i18n.js`, `lang/*.js`, `sizes.js`, `materials.data.js`, `materials.js`, `world.js`, `store.js`, `objects.js`, `sandbox.js`, `market.js`, `player.js`, `lib/Shape.js`, `PlayerInteract/Registry.js` |
| Shell | `settings.js`, `lore.js`, `disk.js`, `sound.js`, `render.js`, `hud.js`, `input.js`, `game.js` |
| Mixed | `PlayerInteract/Build.js`, `Toolbelt.js`, `Tools/*.js`, `Buildings/*.js` |

**Mixed** files define what a piece does to cells (core) together with its
HUD and previews (shell). They load headless: a piece names its sounds by key,
and all sound definitions live in `SOUNDS` in `sound.js`.

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

A failed **write** turns the disk layer off for the rest of the session:
spilled entries go back to `mem`, reads in flight end as **error**, and keys
that were only on disk are lost (the index is cleared).

### Ownership

Each running game owns one database, `ferit9.spill.<random id>`, with the
stores `chunks` and `fog`. Nothing else is stored: there is no save, resume,
meta record or overlay (removed, they had no caller). So `storeReset` clears
only its own database, and another tab never sees or wipes it.

Before it opens its database, the owner takes a Web Lock with the database
name and holds it until the page closes. At startup `js/disk.js` lists
`ferit9.spill.*` databases and deletes each one whose lock it can take: its
owner is gone. A live owner holds its lock before its database exists, so a
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
   test-first. Model and failing tests: `test/store.test.js`, `test/disk.test.js`.
