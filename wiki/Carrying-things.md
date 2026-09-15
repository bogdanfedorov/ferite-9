# Carrying things

The **Hand** (2) picks up a fistful of loose material straight out of the world.
Hold the left button and a lump appears in the manipulator; move the mouse and it
follows the cursor; let go and it settles back into the grid on the spot.

The fistful is always **one material only** — the one the cursor is over. In a
mixed spoil heap the manipulator does not rake in gravel, coal and scrap
together: it spreads out from the cell you aimed at over its neighbours of the
same material, and stops when the hand is full (grab size `n` holds up to `n²`
cells, 4 by default). The highlight shows the selection in advance: exactly the
cells that will go into the fistful light up.

The object lives **outside the grid**: it remembers exactly which cells it was
made of and gives back exactly those when it settles. Matter is neither created
nor destroyed — checked with a counter: 4 cells of iron left the world and 4
came back.

The spring to the cursor is deliberately under-damped. You can work a lump up to
1.4 cells per tick and **hit stone with it without letting go**. An impact from
0.45 gives dust and a flash — that is the seam forging will sit in.

In the hand the manipulator has force behind it: what you carry **shoves loose
material and liquid** out of the way, so you can be seen dragging a lump through
a dune rather than only through air. Solid rock stops it as it always did.

## Release

Releasing the left button — or switching away from the Hand — materialises the
load immediately, at the position it had at that moment. There is no throw and no
settling flight. A spot is searched for up to 14 cells around each cell, and in
fully packed rock it **swaps places** with whatever is standing there. If some
cell still finds nowhere to go, that remainder stays an object under gravity
until a gap opens: matter never disappears, including when the player drags a
lump into the thick of another material and releases it.
