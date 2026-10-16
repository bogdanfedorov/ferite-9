# Infinite world: design notes

Status: planned, not implemented. The world is currently a fixed grid
(`WORLD_W` x `WORLD_H` in `js/world.js`).

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

## Required changes

1. **Generation.** Replace `generateWorld(seed, W, H)` with
   `generateChunk(seed, cx, cy)`. It must depend only on the seed and world
   coordinates, using a coordinate hash and noise instead of the sequential
   `rnd()`. Caves and ore veins crossing chunk borders must match on both
   sides.
2. **Vertical axis.** Unbounded horizontally; the sky is the top. Depth below
   may be bounded or very deep. `geothermalGradient` becomes a function of world
   Y instead of an array of length `H`.
3. **Window border.** Liquids and heat must not leak out: freeze cells outside
   the window.
4. **State outside the material arrays.** `dmgList`, anchored objects in
   `objects.js`, fog (`seen`, `fogVal`), hot chunks (`hotA`, `hotB`), market and
   parcels either store world coordinates or shift with the window.
5. **Persistence.** Modified chunks stay in the store; untouched chunks are
   regenerated from the seed.

## Implementation order

1. `generateChunk` plus horizontal window shifting with `originX` / `originY`,
   materials only.
2. Fog, objects, hot chunks, damage list.
3. Persistence of modified chunks.
4. Vertical extension.

Before step 1, restore `WORLD_W` / `WORLD_H` to a window-sized value.
