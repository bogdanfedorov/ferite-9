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
   in both axes. `cargoPad` and shelved objects are in world coordinates.
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
    `PREFETCH_RING` chunks around the window. If a chunk that is only on disk is
    needed anyway, the window gets the chunk regenerated from the seed
    immediately (a placeholder, remembered in `pendingChunks`); when the read
    arrives, `chunkArrived` pastes the stored chunk over it if it is still in the
    window. Fog slices arrive the same way and are merged into `seen`. A
    placeholder that leaves the window before the read arrives is not stored
    unless it was modified in between.
12. **Spill only, per owner.** The disk holds the spill of one running game and
    nothing else. Each game owns a database `ferit9.spill.<random id>`, guarded
    by a Web Lock of the same name; `storeReset` clears only that database, and
    databases whose owner is gone are deleted at startup. The earlier snapshot,
    resume and `*_live` overlay code (`saveWorld`, `resumeWorld`, `storeSnapshot`,
    `storeLoadIndex`, `storeWarm`, `tierMigrate`, `tier.over`) had no caller and
    is removed; a game-level save will be designed on its own.
13. **Read outcomes.** A disk read ends as found (`chunkArrived` /
    `fogArrived`), absent (`chunkMissing` / `fogMissing`) or error
    (`chunkFailed` / `fogFailed`). An error keeps the key in the disk index, so
    the saved copy is read again later instead of being replaced by a chunk
    regenerated from the seed.
14. **Spread generation.** Chunks that must be generated are built at once only
    near the window centre (`NEAR_BUILD`); the rest get a cheap placeholder and are
    queued nearest first, `BUILD_PER_FRAME` per frame (`streamWorld`, called from
    the frame loop even when paused). A vertical or horizontal shift therefore
    builds nothing synchronously, a respawn reloads the window once
    (`jumpWindow`) with about 12 chunks built at once, and the initial world is
    built fully before play. Placeholders are never stored; shelved objects are
    retried as chunks are built.
15. **Missing disk entries.** A read that finds nothing forgets the key and the
    placeholder is generated. A read that fails is not "nothing" (see 13). Fog of a chunk that leaves while its slice is still
    being read is OR-merged with the stored slice when the read arrives.

Remaining:

0. **Disk failure loses spilled edits.** If IndexedDB fails on a write, the
   store turns the disk layer off. Entries that were still in memory or waiting
   to be written stay in memory; reads in flight end as error; everything that
   was only on disk is lost: the index is cleared, `diskLost()` tells the world,
   and those chunks are regenerated from the seed. A blocked open fails the same way instead of
   hanging, and a connection that arrives after that is closed.

1. **No game-level save.** The game has no save mechanism (only settings and
   language in `localStorage`). The disk is a session spill, not a save.
2. **Placeholder race.** A placeholder (an unbuilt chunk, or one generated
   while its disk read is pending) is never written to disk. If a chunk with a
   pending read leaves the window before the read lands, its edits are dropped and
   the disk copy wins; edits made to it in that short time are also overwritten
   when the stored chunk arrives. Fog is merged instead of dropped.
3. **Zoom floor.** With a 320-cell window, the minimum integral zoom is raised so
   the view is at most 224 cells tall: about 5 on a 1080p screen, 10 on a 4K
   screen (above the usual maximum of 9). The floor is authoritative.
4. **Depth limits.** The world ends at `WORLD_FLOOR` (99840 cells deep). Ore,
   coal and sand deposits stop at their original depth ranges; deeper chunks hold
   rock, caves and lava. Temperature below world Y 320 is constant.
5. **Chunk data is not compressed** on disk (about 28 KB per chunk).
6. **Shelf limit.** At most `SHELF_MAX` loose objects are kept away from the
   window.
