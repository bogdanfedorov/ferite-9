# Infinite world: design notes

Status: horizontal sliding window implemented, including state outside the
material arrays. Not implemented: persistence of the chunk store to disk and the
vertical axis. The window is `WORLD_W` x `WORLD_H` (1280 x 320) in `js/world.js`.

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

1. **Generation.** `buildChunk(seed, cx, cy)` depends only on the seed and
   world coordinates; features crossing chunk borders match on both sides.
2. **Horizontal window.** `originX` maps local to world X. `shiftWindow` moves
   it by whole chunks, saving leaving columns and loading entering ones.
   `shiftMargin()` is the larger of a constant and half the visible width plus
   the frozen edge strip plus one chunk, capped inside the window; `setZoom`
   keeps an integral zoom with the visible width below what the cap allows
   (re-applied when the canvas resizes and after the world is generated), so
   the frozen strip is never on screen.
3. **Window border.** `EDGE_FREEZE` cells on each side do not simulate.
4. **Per-chunk state.** A stored chunk carries `mat`, `shade`, `life`, `temp`
   and its belt direction codes. Belts stay per-cell data in `beltCells`.
5. **Dirty tracking.** `dirtyT` marks 16x16 tiles that were modified: cell
   writes (`setCell`, `paintCell`, `swapCells`), direct tool writes (the torch
   calls `markDirty`), gas life countdown, burning and latent-heat life changes,
   and tiles left above ambient temperature by the thermal pass. Hot tiles
   (`hotA`/`hotB`) are separate and do not imply modified. A leaving chunk is
   stored only if a tile of it is dirty or it holds belts; otherwise it is
   regenerated from the seed on re-entry.
6. **Fog.** Every leaving chunk with seen cells leaves a 64-byte slice in
   `fogStore`, dirty or not; it is pasted back on re-entry, so caves stay
   mapped. Fog alone never makes a chunk dirty. `seenCount` counts the window
   only, so the explored % is relative to the window.
7. **Loose objects.** Objects that leave the window move to `shelvedObjects`
   with world X and come back when their column is in the window again, lifted
   out of solid terrain if needed. At most `SHELF_MAX` are kept; the oldest is dropped when the shelf is full.
8. **Pickup zone.** Its cells move with the window like any other cell;
   `cargoBox` is in world coordinates and `cargoBoxLocal()` converts.
   `padState()` is `away` while the box is not fully inside the window: a call
   is refused and a drone on its way in turns back and refunds the fee.
   Removing the zone also clears its cells in stored chunks.
9. **Damage.** `dmg` and `dmgT` shift with the window and `dmgList` is rebuilt.
10. **Hot tiles.** Entering columns are marked hot.
11. **Surface.** `windowSurf` caches the surface row, shifts with the window
    and `surfaceTop` is recomputed from it on every shift.

Remaining:

1. **Persistence.** `chunkStore` lives in memory only. Saving it (and the
   shelved objects and pad) to disk is not done.
2. **Vertical axis.** Unbounded horizontally; depth is still bounded by
   `WORLD_H`. `geothermalGradient` is still an array of length `H`.
3. **Fog slices.** `fogStore` grows by 64 bytes per visited chunk and is never
   pruned.
