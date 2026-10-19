# Builder

Building is a set of tools in the **E** menu. **Pickup** is open from the
start; **Belt** and **Wall** are bought there with money from the [[Market]].
Nothing they place costs any material.

Everything you build is made of **cells**. A belt is a row of single belt cells,
a wall is a row or a block of single wall cells, and the pickup zone is a slab
of zone cells on piles. Belts and walls can be cut, extended or rebuilt cell by
cell; the pickup zone is placed and removed as a whole.

## Placing

Hold the **left button** and drag. The game reads the shape from your drag:

- a drag that is flatter than about 27° gives a level run;
- anything steeper gives an exact 45° diagonal;
- a wall also accepts a near-vertical drag as a vertical line.

A release places it. The preview is tinted ok or red; red means the build is
refused, and the reason is written next to the cursor. A click without dragging
places a single cell.

The **wall** has a second shape, a filled rectangle: **R** or the shape bar
switches between line and rectangle, and **Shift** makes the rectangle a square.

## Removing

With a building selected, hold the **right button** and drag. The red area is
a rectangle, and on release only the belt and wall cells **inside it** are
removed — the rest of a belt that runs through it stays where it was. Touching
any cell of the pickup zone removes the whole zone, even the parts that lie
outside the simulated window, and whatever rested on it falls.

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

**Pickup**: the zone the drone takes cargo from. It is free and has a fixed
size: a platform 40 cm wide and 3 cm thick. While it is selected, the preview
follows the cursor and shows the whole building where it would end up; one
click builds it.

- The column you point at becomes the middle of the platform. The platform
  drops straight down as one rigid piece and stops on the first support under
  any part of it — ground, rock, sand or a building. Liquid is not support.
- Where the ground under the platform is lower, piles grow down from its
  underside to the first support: one at each end and one every 10 cm. A pile
  may be at most 30 cm long; longer than that, or no ground at all, and the
  build is refused as too high. Piles go through water to the bottom.
- The platform's own cells must be empty — air, smoke or steam — and inside the
  simulated window. Pointing into the ground does not lift the platform out of
  it; that is refused as no room.
- The whole sky above the platform must be free of anything solid, because the
  drone comes from above. Sand or water falling through does not count.
- There is only one zone. To move it, remove it with the right button and build
  it again.

Once built, the zone does not change: the drill does not touch it, heat and
lava do not melt it, and it stays where it was even if the ground under it is
dug away. It is drawn in its own colour, which stands out on sand, soil and
rock; the drone and its beam use the same colour.
