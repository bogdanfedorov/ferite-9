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
    never lost between eviction and write completion. A failed write is a fault
    (logged, see "Faults"): the disk layer turns off and everything returns to
    `mem` (memory only, unbounded, but safe).
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
    (`chunkMissing` / `fogMissing`) or error (`chunkFailed` / `fogFailed`). A
    rejected read is retried; error means `READ_TRIES` rejections in a row and
    is logged as a fault. An error never regenerates a chunk the player edited.
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
  | `CHUNK_FAILED` | placeholder | disk, unreadable or lost; the player edited it, so it is never regenerated |

- `editedChunks`: `Set` of world chunk keys the player changed (see "Edited
  chunks" below). It is the only input to "may this chunk be regenerated".
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
enter window:  in store RAM            -> READY    (paste, all tiles dirty, belts, objects)
               on disk (read started)   -> LOADING
               edited, no copy anywhere -> FAILED   (fault: copy lost)
               nowhere, near centre     -> READY    (build now, clean)
               nowhere, far             -> QUEUED
QUEUED   -> READY    streamWorld builds it
LOADING  -> READY    chunkArrived: paste stored copy, all tiles dirty, belts, objects
LOADING  -> QUEUED   chunkMissing or chunkFailed, chunk not edited: regenerate
LOADING  -> FAILED   chunkFailed, chunk edited: keep placeholder, never generate
LOADING  -> FAILED   chunkMissing, chunk edited (fault: copy lost)
any      -> (gone)   leave window: READY saved if dirty, belts or objects; others nothing
FAILED   -> LOADING  only by leaving and re-entering (a fresh read)
```

No other transition exists. A chunk is regenerated from the seed only if
`editedChunks` does not hold its key: the seed then reproduces everything but
physics and heat. `FAILED -> QUEUED` and `FAILED -> READY` are forbidden: the
disk copy holds player edits, and generating would show the wrong terrain or,
once dirty, overwrite that copy on leave. A `FAILED` slot never saves, so its
disk copy is never overwritten. A reply for a key
whose slot is outside the window, or not `LOADING`, changes nothing in the
window; a found chunk stays in the store cache for the next entry.

### Operations per state

| Operation | `READY` | `QUEUED` / `LOADING` / `FAILED` |
|---|---|---|
| Cell write (tools, build, physics, objects landing) | allowed, marks tiles dirty | cannot happen: placeholder is bedrock |
| `spawnEntity` scan (respawn, waiting object) | free: place; blocked: one row up | `QUEUED` / `LOADING`: stop, retry later; `FAILED`: bedrock, blocked, scan goes on up |
| `thermoPass` | normal | cells stay at ambient, no heat crosses, no tile marked |
| `simulate` movement | normal | rigid, nothing enters |
| Save on leave | stored if a tile is dirty, it holds belts or it owns objects | nothing stored; a disk copy stays the truth |
| Belts | `beltsIn` on paste | none |
| Player step | runs | frozen while `windowSettled()` is false |

`windowSettled()` is true when no slot within `NEAR_BUILD` of the window centre
is `QUEUED` or `LOADING`. The frame loop skips `step()` until it is true or
`SETTLE_MS` (3 s) has passed; placeholders are inert, so resuming after the
timeout is safe (reads usually land within a frame, thanks to the prefetch
ring). A respawn places the player with `spawnEntity`, which waits for the
slots it needs by itself; `SETTLE_MS` does not apply to it. A near `FAILED`
slot counts as settled: it is a wall until it re-enters.

### Fog

Fog keeps its own two-part record: `pendingFog` (slice read in flight for a
window slot; local bits are partial) and `fogMerge` (bits of a slot that left
while its read was pending, held until the read resolves). Seen bits only ever
grow, so every outcome is an OR merge:

- `fogArrived`: OR held bits into the stored slice; OR the slice into `seen` if
  the slot is still waiting.
- `fogMissing`: the held bits become the stored slice.
- `fogFailed` (after `READ_TRIES`, fault already logged): same as
  `fogMissing`. Fog is visibility, not player work; bits only in the
  unreadable slice are lost.

### Contract with the store (`js/store.js`)

- The store calls exactly one of `chunkArrived` / `chunkMissing` /
  `chunkFailed` per chunk read, and the same for fog; an error (including the
  disk layer turning off with reads in flight) is `*Failed`, never `*Missing`.
- A rejected `get` is retried at once, up to `READ_TRIES` (3) attempts. Only
  the last rejection is reported: the store calls `fault(what, err)` with that
  error, then `chunkFailed` / `fogFailed`.
- After `chunkFailed(key)` the store keeps `key` in its disk index and no longer
  counts it as reading, so a later `tierWaiting` / `tierRead` starts a new read.
- The world never puts a placeholder into a tier, so the store never has to tell
  a placeholder from real data.
- A write reply, success or failure, is dropped if `storeReset` ran after the
  write started (epoch). Only a write of the current game can kill its disk.
- A failed write of the current epoch calls `fault('disk write failed', err)`,
  then turns the disk off: spilled entries go back to `mem`, disk-only keys
  leave the index, every read in flight ends as `*Failed`. `diskLost` and
  `msg.diskLost` are deleted: edited chunks that were only on disk become
  `FAILED` when they enter (copy lost), unedited ones are regenerated, and the
  player is not told; the log is.

Remaining:

0. **Disk failure.** If IndexedDB fails (open error, blocked upgrade, write
   error), the store logs a fault and turns the disk layer off. Entries still in
   memory or waiting to be written stay in memory. Chunks whose only copy was on
   disk are regenerated if the player never edited them and are `FAILED` walls
   if they were. A single failed read is retried and never regenerates anything.
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

Six findings and revisions R1, R2 on `infinite/4-persistence-vertical`. Each one is a piece of state
that had no owner or no reset; the fix gives it one.

### Edited chunks (R1)

Dirty tiles say "store this chunk"; physics and heat set them too. Whether a
chunk may be regenerated needs a different, stricter record: did the player
change it.

- **Data.** `editedChunks`: a `Set` of world chunk keys in `world.js`, cleared
  by `beginWorld`. It is keyed by world key, so it does not move with the
  window, survives the chunk leaving and spilling, and is known without a disk
  read. Keys are never removed during a game. Size is the number of chunks the
  player touched.
- **Writer.** One function, `markEdited(x, y)` (window-local cell), adds the key
  of that cell's chunk. Only player-action paths call it, next to their cell
  write:

  | Path | Where |
  |---|---|
  | dig | `Tools/Drill.js` (`setCell` to void, `dropLoose`) |
  | build, erase | `Buildings/Wall.js` `wallPlace`, `Buildings/Belt.js` `beltPlace`, `Build.js` `eraseCells` |
  | torch | `Tools/Ignite.js` (the flame it places) |
  | grab | `takeObject` (cells it lifts) |
  | object lands | `placeCell` / `swapCell` in `dropObject` (objects exist only by a grab) |
  | object stored | `saveChunk` marks the owner of every object it stores |
  | drone pickup | `market.js` (cells taken from the pad) |
  | spawn pad | `generateWorld` (the pad and its air pocket are not in `buildChunk`) |

  `simulate`, `thermoPass`, belt transport, burning and gas never call it.
- **Reader.** `loadChunk`, `chunkMissing`, `chunkFailed`: regenerate only if
  the key is not in `editedChunks`. An edited chunk that left the window always
  has a record (its edit dirtied a tile), so "edited and no copy anywhere" can
  only be lost data: `FAILED` plus a fault.

### Faults (R1)

A read that keeps failing, a lost copy and a failed write are bugs to
investigate, not game states. The game recovers where it safely can (an
unedited chunk is regenerated, an edited one stays a `FAILED` wall) and logs the
error with its stack. The player is not told.

`js/notice.js` gets a second hook in the existing setter pattern:

```
var onFault = null;
function setFaultHook(fn) { onFault = fn; }
function fault(what, err) { if (onFault) onFault(what, err); }
```

`what` is a short text with the key; `err` is the `Error` the backend rejected
with, so `err.stack` is the real one. Where the core finds lost data itself
(edited chunk, no copy) it passes `new Error(what)`. Callers: `tierReply` after
`READ_TRIES`, the write-failure path in `store.js`, and `world.js` for a lost
copy. With no hook the core is silent.

The shell installs `logFault` in `startGame` (`game.js`): one line (time,
`what`, `err.stack`) to `console.error`, then to the first sink present:

| Runtime | Sink | File |
|---|---|---|
| Electron | new `electron/preload.js` exposes `ferit9.fault(line)` (`contextBridge`, `ipcRenderer.send`); `main.js` appends | `app.getPath('logs')/fault.log` |
| Go launcher | `fetch('_fault', { method: 'POST', body: line })` when the page script the launcher injects sets `FAULT_POST`; the handler appends | `ferit9-fault.log` next to the executable, as `fail()` does |
| plain web, dev page | none | console only |

### `spawnEntity` (findings 1, 2, 5; R2)

One function places anything with a size, the player and returning objects:

```
spawnEntity(e, x, y) -> true | false
  e has w, h and (ox, oy): offset from e.x, e.y to its box centre
  box(y') = columns spanStart(x+ox, w)..spanEnd(x+ox, w), rows likewise from y'+oy, h
  for y' = y, y-1, y-2, ...:
    a box cell is outside the window, or in a QUEUED or LOADING slot -> return false
    no box cell is BLOCKING -> e.x = x, e.y = y', velocity 0, return true
```

- Player: `ox = oy = 0` (its x, y is the box centre, as in `boxBlocked`).
  Object: `ox = w/2`, `oy = h/2`, with `w`, `h` from its cells, set by
  `makeObject` (its x, y is the top-left anchor). Same code for both.
- `QUEUED` and `LOADING` change in place and may become terrain under the box,
  so the scan stops and the caller retries. `FAILED` is different: it stays
  bedrock for as long as it is in the window (its only exit is leaving), so it
  is plain blocked terrain and the scan moves up past it. Nothing is ever
  placed inside or on top of a slot that can still turn into terrain.
- **Player.** `player.respawning` is the only respawn state. `updatePlayer`
  sets it on death (and still returns `'respawn'`, so the shell moves the
  window). `moveToSpawn()` becomes `spawnEntity(player, localX(spawnX),
  localY(spawnY))`; on success it clears `respawning`, sets `fallFrom` and
  `arriving`, and returns true. The shell calls it every frame while
  `respawning` and plays death and boot when it returns true. `loop.respawn`
  and the respawn use of `windowReady` are deleted. `spawnPlayer` clears
  `respawning`, so a pending respawn never fires in the next world.
- A spawn chunk that is `FAILED` (edited, unreadable): the player appears on
  the first free place above it, typically the sky chunk above, and lands on
  the bedrock placeholder. If every row up to the window top is blocked,
  `moveToSpawn` keeps returning false.
- `clearAirlock`, `arrivalHeight` and `ARRIVAL_DROP` are deleted: a buried
  spawn no longer erases cells, the player appears on top of what buries it.
- **Objects.** `unshelveObject` is replaced by
  `spawnEntity(o, localX(o.x), localY(o.y))`: own position, or the first free
  place straight above, or wait.

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
waiting -> live     spawnEntity: own x, y, or the first free place above
live    -> (cells)  dropObject, as today
```

- A chunk that owns objects is stored on leave even when clean.
- A generated chunk owns no objects; a `FAILED` or `LOADING` slot's objects
  stay in its disk record with its terrain. Storing an object marks its owner
  edited, so a chunk holding objects is never regenerated over them.
- Memory is bounded like chunks: `shelvedObjects` only holds objects whose owner
  is in the window, everything else rides in chunk records.

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
| R1 | `store.test.js`: a read that fails once is retried and found; a read that keeps failing is retried `READ_TRIES` times, logged, then failed; a failed write is logged, then reads in flight fail |
| R1 | `chunk-state.test.js`: one failed read still brings edits back; an unedited chunk that cannot be read is regenerated and logged; an edited one stays `FAILED`, keeps its disk copy and is logged; an edited chunk whose copy is lost with the disk stays `FAILED`; a write fault is logged and never told; player actions mark chunks edited, physics does not |
| 1, R2 | `chunk-state.test.js`: respawn waits while the spawn read is loading; one failed spawn read lands on the stored terrain; an edited, unreadable spawn chunk is a wall the player lands above; a buried spawn puts the player on top and erases nothing |
| 2 | `chunk-state.test.js`: a respawn pending when a new world is made is cleared |
| 3 | `store.test.js`: a write from before `storeReset` that fails does not kill the disk |
| 4 | `chunk-state.test.js`: twelve objects leave, spill to disk and all come back with their cells |
| 5, R2 | `chunk-state.test.js`: an object across a chunk border waits while a slot it covers is loading, then lands at its own position; an object whose spot was filled lands right above it |
| 7 | `toolbelt.test.js`: every money-neutral toolbelt change changes `toolbeltKey()` |
