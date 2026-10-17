# Infinite world: design notes

Status: complete in both axes. The sliding window follows the player horizontally and
vertically, chunks that leave it are kept in a bounded in-memory store that spills to
IndexedDB, and the terrain is generated from the seed for any chunk. The window is
`WORLD_W` x `WORLD_H` (1280 x 320) in `js/world.js`; the disk layer is `js/store.js`.

## Why not a bigger fixed grid

Memory grows with area: every cell costs about 19 bytes across `mat`, `shade`,
`life`, `clk`, `flow`, `temp`, `temp2`, `dmg`, `dmgT`. A 4800x3200 world is about
300 MB and the world can never be truly unbounded.

## Options considered

1. **One huge array.** Memory scales with world size. Rejected.
2. **Chunks in a `Map` keyed by `(cx, cy)`.** Classic, but breaks every
   `y * W + x` access (about 40 sites in `player.js`, `objects.js`, `render.js`,
   `sandbox.js`, `Build.js`, ...) and slows the hot path in `simulate()`.
   Rejected.
3. **Sliding window over fixed arrays.** Chosen.

## Chosen design: sliding window

- `mat`, `temp`, etc. stay fixed-size typed arrays (for example 1024x768),
  centred on the player. All existing code keeps using local coordinates.
- `originX` / `originY` map local to world coordinates. They always move in
  whole chunks (64x64 cells).
- When the player leaves the central zone, the window shifts by whole chunks:
  - chunks leaving the window are saved into a `Map` store, keyed by chunk
    coordinates, as copies of the array slices (optionally RLE-compressed);
  - chunks entering the window are restored from the store, or generated if
    absent.
- Cells outside the window are frozen. The window must be larger than the
  screen so the player never sees the border.

## Status

Done:

1. **Generation.** `buildChunk(seed, cx, cy)` depends only on the seed and world
   coordinates, for any `cy`: sky above the surface, sand, hardpan and rock below,
   deposits and caves from noise, deep lava pools from world Y 300 down, and a
   floor of `EDGE` material from `WORLD_FLOOR` (99840 cells) down. Features
   crossing chunk borders match on both sides.
2. **Horizontal window.** `originX` maps local to world X. `shiftWindow` moves it
   by whole chunks, saving leaving columns and loading entering ones.
3. **Vertical window.** `originY` maps local to world Y (`worldY` / `localY`).
   `shiftWindowY` is the exact mirror of `shiftWindow`: rows leave and enter, all
   per-cell layers, fog, hot and dirty tiles, damage, belts, loose objects, the
   cargo pad, the player (including `fallFrom`) and the camera shift together.
   `geothermalGradient` is refilled from `geothermalAt(worldY)` (clamped
   function of world Y). The hard bottom edge of the window is gone. A shift by
   more chunks than the window holds reloads it whole.
4. **Shift margins.** `shiftMargin()` (X) and `shiftMarginY()` (Y) keep the
   frozen edge strip off screen; `setZoom` raises the minimum integral zoom so the
   visible width and height fit what the window can show (`maxViewCells`,
   `maxViewRows`).
5. **Window border.** `EDGE_FREEZE` cells on every side do not simulate.
6. **Per-chunk state.** A stored chunk carries `mat`, `shade`, `life`, `temp` and
   its belt direction codes. Belts stay per-cell data in `beltCells`.
7. **Dirty tracking.** `dirtyT` marks 16x16 tiles holding changes that cannot be
   regenerated from the seed: cell writes (`setCell`, `paintCell`, `swapCells`),
   the torch, burning and latent-heat life changes, and tiles of non-gas
   material left above ambient by the thermal pass. Transient gas does not
   count: `AIRLIKE` (void and expiring gas: smoke, steam, fire) cells swapping
   with each other, a gas appearing in or expiring into air, the gas life
   countdown, and heat held only by air or gas cells and by self-emitting
   materials never mark a tile. A chunk is stored only if a tile is dirty or it
   holds belts; otherwise it is regenerated on re-entry, so clean gas chunks
   are never persisted.
8. **Fog.** Every leaving chunk with seen cells leaves a 64-byte slice in the fog
   tier, dirty or not. Fog alone never makes a chunk dirty.
9. **Loose objects, cargo pad, damage, hot tiles, surface cache.** As before, now
   in both axes. `cargoPad` and waiting objects are in world coordinates; a loose
   object that leaves the window is stored in its owner chunk's record (see
   "Loose objects" below).
   `windowSurf` holds world Y; `surfaceTop` is the window-local value.
10. **Bounded store (`js/store.js`).** Two tiers, `chunkTier` and `fogTier`, share
    one structure: `mem` (insertion order is the LRU order), `spill` (evicted,
    write pending), `cache` (read from disk, not yet used), `disk` (index of keys
    known to be on disk) and `reading` (reads in flight, each with a token).
    `mem` is capped (`CHUNK_MEM_MAX` chunks, `FOG_MEM_MAX` slices); the oldest
    entries move to `spill` and one batched IndexedDB write persists them.
    Lookups try `mem`, `spill`, `cache`, in that order, so an evicted entry is
    never lost between eviction and write completion. A failed write turns the disk
    layer off and returns everything to `mem` (memory only, unbounded, but safe).
    Without a backend the store behaves like before: unbounded, in memory. The
    backend (`get`, `put`, `clear`) and its IndexedDB form in `js/disk.js` are
    described in `SIMULATION.md`, section Storage.
11. **No stalls.** Disk reads are asynchronous. After each shift
    `prefetchAround` requests every on-disk chunk and fog slice in a ring of
    `PREFETCH_RING` chunks around the window. A chunk that enters the window while
    its only copy is on disk is held as an inert placeholder until the read
    resolves; see "Chunk state" below. Fog slices arrive the same way and are
    OR-merged into `seen`.
12. **No world save or resume.** `saveWorld`, `resumeWorld`, `worldMeta`,
    `windowKeysAt`, the resume branch of `generateWorld` and `finishWorld(null)`
    are deleted (world side), as are `storeSnapshot`, `storeLoadIndex`,
    `storeWarm`, `tierMigrate` and the `*_live` overlay stores (store side). Nothing
    called them. The disk is a spill area for one session only. Review finding F6
    (snapshot not atomic) is moot: there is no snapshot.
13. **Stable origin.** The Go build serves the game on `127.0.0.1:<random port>/<token>/`
    with a temporary browser profile removed on exit, so its IndexedDB never
    survives a session. Nothing on disk is meant to outlive a session.
14. **Spread generation.** Chunks that must be generated are built at once only
    near the window centre (`NEAR_BUILD`); the rest are `QUEUED` and built
    nearest first, `BUILD_PER_FRAME` per frame (`streamWorld`, called from the
    frame loop even when paused). A vertical or horizontal shift therefore builds
    nothing synchronously, a respawn reloads the window once (`jumpWindow`) with
    about 12 chunks built at once, and the initial world is built fully before
    play. Waiting objects are retried whenever a chunk becomes `READY`.
15. **Read outcomes.** Every chunk and fog read ends in exactly one of three
    calls from the store: found (`chunkArrived` / `fogArrived`), absent
    (`chunkMissing` / `fogMissing`) or error (`chunkFailed` / `fogFailed`). An
    error is never treated as absent.
16. **Spill per owner.** Each game owns a database `ferit9.spill.<random id>`,
    guarded by a Web Lock of the same name; `storeReset` clears only that
    database. At startup `js/disk.js` deletes every `ferit9.spill.*` database whose
    lock is free, and the old shared `ferit9.world`.

## Chunk state

Review findings F1, F3 and F7 on PR #1 came from one cause: whether a window
chunk holds real terrain was spread over `pendingChunks`, `deferredKeys`,
`deferredQueue`, the cached `placeholders` and the store's `reading` map, and
each operation checked a different subset. They are replaced by one state per
window chunk slot.

### Data

- `chunkState`: `Uint8Array`, one entry per window chunk slot,
  `slot = (ly >> CHUNK_SHIFT) * (W >> CHUNK_SHIFT) + (lx >> CHUNK_SHIFT)`.
  It shifts with the window exactly like `dirtyT`; entering slots get their state
  from `loadChunk`. It is the only record of which slots hold real terrain.
- States (top-level `var` constants in `world.js`):

  | State | Cells hold | Copy that is the truth |
  |---|---|---|
  | `CHUNK_READY` | real terrain | the window |
  | `CHUNK_QUEUED` | placeholder | none exists: the seed |
  | `CHUNK_LOADING` | placeholder | disk; read in flight |
  | `CHUNK_FAILED` | placeholder | disk; read failed, copy untouched |

- Dirty is not a state. A `READY` chunk is dirty when one of its `dirtyT` tiles
  is set; tiles stay the single record (the torch and `thermoPass` mark single
  tiles). A non-`READY` slot never has a dirty tile.
- Placeholder: every cell is `bedrock` (`EDGE_ID`: hardness -1, conductivity
  ~0, rigid), `temp` is the row ambient `geothermalGradient[y]`, `life` is
  `lifeOf(EDGE_ID)`. No cache, written in place by one function. It is inert by
  material, not by `if`: tools cannot dig it, nothing can be built on or moved
  into it, powders and liquids rest against it like the window edge, heat does
  not cross it, and at ambient it never sets `lasting`. It is never stored.
- `deferredKeys`, `deferredQueue`, `deferredSort`, `pendingChunks` and
  `placeholders` are deleted. `streamWorld` scans the 100 slots for `QUEUED`
  ones and builds the nearest first.

### Transitions

```
enter window:  in store RAM            -> READY    (paste, all tiles dirty, belts in)
               on disk (read started)   -> LOADING
               nowhere, near centre     -> READY    (build now, clean)
               nowhere, far             -> QUEUED
QUEUED   -> READY    streamWorld builds it
LOADING  -> READY    chunkArrived: paste stored copy, all tiles dirty, belts in
LOADING  -> QUEUED   chunkMissing: no copy exists, generating is safe
LOADING  -> FAILED   chunkFailed: keep placeholder, never generate
any      -> (gone)   leave window: READY saved if dirty or belts; others save nothing
FAILED   -> LOADING  by leaving and re-entering (a fresh read), or by a
                     respawn retrying a slot of the spawn area (a fresh read)
```

No other transition exists. `FAILED -> QUEUED` and `FAILED -> READY` are
forbidden: the disk copy may hold edits, and generating would either show the
wrong terrain or, once edited, overwrite that copy on leave. A reply for a key
whose slot is outside the window, or not `LOADING`, changes nothing in the
window; a found chunk stays in the store cache for the next entry.

### Operations per state

| Operation | `READY` | `QUEUED` / `LOADING` / `FAILED` |
|---|---|---|
| Cell write (tools, build, physics, objects landing) | allowed, marks tiles dirty | cannot happen: placeholder is bedrock |
| Place a waiting object | placed at its own position if every cell it covers is in a `READY` slot | stays waiting; never lifted or moved |
| `thermoPass` | normal | cells stay at ambient, no heat crosses, no tile marked |
| `simulate` movement | normal | rigid, nothing enters |
| Save on leave | stored if a tile is dirty, it holds belts or it owns objects | nothing stored; a disk copy stays the truth |
| Belts | `beltsIn` on paste | none |
| Player step | runs | frozen while `windowSettled()` is false |

`windowSettled()` is true when no slot within `NEAR_BUILD` of the window centre
is `QUEUED` or `LOADING`. The frame loop skips `step()` until it is true or
`SETTLE_MS` (3 s) has passed; placeholders are inert, so resuming after the
timeout is safe (reads usually land within a frame, thanks to the prefetch
ring). A respawn (`jumpWindow`) clears the airlock and places the player
only when its spawn area is `READY` (see "Respawn" below); `SETTLE_MS` never
applies to it. For play, a near `FAILED` slot counts as settled: it is a wall
until it re-enters.

### Fog

Fog keeps its own two-part record: `pendingFog` (slice read in flight for a
window slot; local bits are partial) and `fogMerge` (bits of a slot that left
while its read was pending, held until the read resolves). Seen bits only ever
grow, so every outcome is an OR merge:

- `fogArrived`: OR held bits into the stored slice; OR the slice into `seen` if
  the slot is still waiting.
- `fogMissing`: the held bits become the stored slice.
- `fogFailed`: nothing changes. The key stays pending, held bits stay in
  `fogMerge`, and the next read after re-entry merges them. A local slice is
  never put over an unread disk slice.

### Contract with the store (`js/store.js`)

- The store calls exactly one of `chunkArrived` / `chunkMissing` /
  `chunkFailed` per chunk read, and the same for fog; an error (including the
  disk layer turning off with reads in flight) is `*Failed`, never `*Missing`.
- After `chunkFailed(key)` the store keeps `key` in its disk index and no longer
  counts it as reading, so a later `tierWaiting` / `tierRead` starts a new read.
- The world never puts a placeholder into a tier, so the store never has to tell
  a placeholder from real data.
- A write reply, success or failure, is dropped if `storeReset` ran after the
  write started (epoch). Only a write of the current game can kill its disk.
- When the disk is declared dead, the store first resolves every read in flight
  as failed, drops disk-only keys from its index, then calls `diskLost()` once.
  `diskLost` turns every `FAILED` slot into `QUEUED` (nobody can read that data
  again in this session), stores held fog bits as the slices, and tells the
  player (`msg.diskLost`).

Remaining:

0. **Disk failure.** If IndexedDB fails (open error, blocked upgrade, write
   error), the store turns the disk layer off. Entries still in memory or
   waiting to be written stay in memory. Chunks whose only copy was on disk are
   unreachable and are regenerated from the seed after `diskLost`; the player is
   told. A single failed read on a working disk never regenerates anything.
1. **Game-level save is not planned.** The game has no save mechanism (only
   settings and language in `localStorage`).
2. **Placeholders are visible.** A `QUEUED` or `LOADING` slot inside the view
   shows bedrock until it is built or read; usually for a frame or two.
3. **Zoom floor.** With a 320-cell window, the minimum integral zoom is raised so
   the view is at most 224 cells tall: about 5 on a 1080p screen, 10 on a 4K
   screen (above the usual maximum of 9). The floor is authoritative.
4. **Depth limits.** The world ends at `WORLD_FLOOR` (99840 cells deep). Ore,
   coal and sand deposits stop at their original depth ranges; deeper chunks hold
   rock, caves and lava. Temperature below world Y 320 is constant.
5. **Chunk data is not compressed** on disk (about 28 KB per chunk).

## Review fixes, round 4

Six findings on `infinite/4-persistence-vertical`. Each one is a piece of state
that had no owner or no reset; the fix gives it one.

### Respawn (findings 1, 2)

Respawn moves from the shell (`loop.respawn`, `windowReady`, `SETTLE_MS`) into
the core, so it is testable and is reset with the world.

Data, in `player` (`js/player.js`):

| Field | Meaning |
|---|---|
| `respawning` | a respawn is pending: the player is dead and not yet placed |
| `spawnTries` | fresh reads started for the spawn area in this respawn; 0 when not respawning |

The **spawn area** is the rectangle `clearAirlock` clears plus the floor row
under it: everything `clearAirlock`, `moveToSpawn` and the arrival fall touch.
Only its window slots count: the shell centres the window on the spawn before
the first `respawnStep`, and cells outside the window are skipped by
`clearAirlock` and block `moveToSpawn` like the window edge.

```
beginRespawn()   respawning = true, spawnTries = 0      (shell then moves the window)
respawnStep()    called by the shell every frame, paused or not; true exactly once:
  every window slot touching the spawn area is READY
      -> clearAirlock, moveToSpawn, respawning = false, return true
  a slot there is FAILED and spawnTries <  SPAWN_TRIES
      -> fresh read: FAILED -> LOADING, spawnTries++
  a slot there is FAILED and spawnTries >= SPAWN_TRIES
      -> diskFailed(): the disk is dead, diskLost turns FAILED -> QUEUED
  otherwise (QUEUED, LOADING)   -> wait
spawnPlayer()    respawning = false, spawnTries = 0      (every new world)
```

- The player is never placed over a placeholder: `READY` is the only state in
  which the spawn area holds real terrain. A `FAILED` slot is not settled for a
  respawn.
- No timeout. `LOADING` always ends in one of the three read outcomes (store
  contract); `QUEUED` slots near the centre are built at once by `jumpWindow`,
  others by `streamWorld`, nearest first.
- `SPAWN_TRIES` is 3. A single failed read still never regenerates a chunk:
  the only way the spawn chunk is regenerated is the disk being declared dead,
  which is the existing `diskLost` path, and the player is told.
- `spawnPlayer` runs for every world `enterWorld` makes, so a respawn pending in
  one world cannot fire in the next. The shell keeps only presentation (death
  sound, boot screen) and the play timeout; `enterWorld` resets `loop.waitFrom`.

### Write replies after `storeReset` (finding 3)

`tierFlush` already passes the epoch to the success path. The failure path gets
it too: a rejected `put` whose epoch is not `diskEpoch` changes nothing. A
`clear()` started by `storeReset` belongs to the new epoch, so its failure still
kills the disk.

### Loose objects (findings 4, 5)

A loose object is per-chunk data, like belts. `SHELF_MAX`, `OBJ_LIFT` and the
lift in `unshelveObject` are deleted.

- **Owner.** The chunk holding the object's anchor cell
  (`floor(o.x)`, `floor(o.y)`) owns it.
- **Record.** A stored chunk carries `objects`: `null` or an array of
  `{ x, y, cells }`, `x`/`y` in world coordinates, `cells` as in a live object.
  Velocity, hold, rest and flash are not stored; an object comes back at rest.
  The record goes through `chunkTier` like the terrain: `mem`, `spill`, disk,
  `cache`, `chunkArrived`.
- **States**, each object in exactly one place:

  | State | Where | Coordinates |
  |---|---|---|
  | live | `objects` | window-local |
  | waiting | `shelvedObjects` | world; owner slot is in the window and `READY` |
  | stored | owner chunk record | world |

```
live    -> stored   owner slot leaves the window (saveChunk; a hold is dropped)
waiting -> stored   owner slot leaves the window (saveChunk)
live    -> waiting  a slot it covers leaves the window, its owner stays
stored  -> waiting  owner slot becomes READY from a stored record
waiting -> live     every cell it covers is in a READY slot; same x, y
live    -> (cells)  dropObject, as today
```

- A chunk that owns objects is stored on leave even when clean.
- A generated chunk owns no objects; a `FAILED` or `LOADING` slot's objects stay
  in its disk record with its terrain. After `diskLost` the objects of lost
  records are lost with them, like their terrain, and the player is told.
- Memory is bounded like chunks: `shelvedObjects` only holds objects whose owner
  is in the window, everything else rides in chunk records.
- A waiting object whose slots are all `READY` but whose own position is blocked
  (cells changed around it while it was away) is dropped in place with
  `dropObject`, exactly like a release: its cells go to the nearest open cells.
  It is never moved to another position as an object.

### Toolbelt redraw (finding 7)

The shell redraws the toolbelt when what it draws changed, not when money did.
`toolbeltKey()` (core part of `Toolbelt.js`) returns a string built from
`market.money`, `toolbelt.open`, `toolbelt.level`, `toolbelt.slots` and
`toolbelt.picked`. `renderToolbelt` stores the key it drew (`toolbeltDrawn`,
replacing `toolbeltMoney`); the frame loop redraws when `toolbeltKey()`
differs. The core never asks for a redraw, and no writer has to remember to
bump a counter. The explicit `renderToolbelt()` calls after toolbelt writes in
`game.js` become redundant; `selectTool` keeps its call because `game.tool` is
shell state.

### Tests

| Finding | Test |
|---|---|
| 1 | `test/chunk-state.test.js`: respawn waits for a `FAILED` spawn slot and retries it; waits for a `LOADING` read with no timeout; a read that keeps failing ends in `diskLost` and a playable spawn |
| 2 | `test/chunk-state.test.js`: a respawn pending when a new world is made does nothing |
| 3 | `test/store.test.js`: a write from before `storeReset` that fails does not kill the disk |
| 4 | `test/chunk-state.test.js`: twelve objects leave the window, spill to disk and all come back with their cells |
| 5 | `test/chunk-state.test.js`: an object across a chunk border stays waiting while one of its slots is loading, then lands at its own position |
| 7 | `test/toolbelt.test.js`: every money-neutral toolbelt change changes `toolbeltKey()` |
