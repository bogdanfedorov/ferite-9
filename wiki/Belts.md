# Builder

Building is a set of tools in the **E** menu. **Pickup** is open from the
start; **Belt** and **Wall** are bought there with money from the [[Market]].
Nothing they place costs any material.

Everything you build is made of **cells**. A belt is a row of single belt cells,
a wall is a row or a block of single wall cells; there are no machines or
structures that own several cells, so anything can be cut, extended or
rebuilt cell by cell.

## Placing

Hold the **left button** and drag. The game reads the shape from your drag:

- a drag that is flatter than about 27° gives a level run;
- anything steeper gives an exact 45° diagonal;
- a wall (and the pickup zone) also accepts a near-vertical drag as a vertical
  line.

A release places it. The preview is green or red; red means at least one cell
is taken, so nothing is placed. A click without dragging places a single cell.

The **wall** has a second shape, a filled rectangle: **R** or the shape bar
switches between line and rectangle, and **Shift** makes the rectangle a square.

## Removing

With a belt or a wall selected, hold the **right button** and drag. The red
zone is a rectangle, and on release only the belt and wall cells **inside it**
are removed — the rest of a belt that runs through the zone stays where it was.

## The tools

**Belt**: one cell. Each cell remembers its own direction, the direction you
dragged, shown by arrows. A cell takes the pile resting on its top face and
pushes it one cell onward, every three frames. A belt needs open space above
every cell, and cargo only moves if the next spot is free. On a diagonal the
pile climbs or descends with the belt.

**Wall**: one solid cell. It goes in over anything that is not already a
structure — rock, sand or liquid in its cells is replaced, not pushed aside. It
blocks movement like rock, and the drill will not chew it; the right button is
the way it comes down.

**Pickup**: the zone the drone takes cargo from. Drag a rectangle of up to 96
cells. There is only one zone — drawing a new one moves it.
