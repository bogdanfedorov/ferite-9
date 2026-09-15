# Builder

Mission Control releases the **Builder** (4) once the shift quota is closed.
Nothing it places costs any material.

The tool is two choices. First **what** you are placing — belt, wall, or
remove. Then **which shape** the drag makes:

| shape | drag gives you |
| --- | --- |
| pixel | a single cell |
| line | a straight run, level or upright |
| angled | a run that follows the cursor at its own angle |
| rectangle | the dragged box, filled |

Each body offers only the shapes that make sense for it: a belt is a line or
angled, a wall is any of the four, removal takes pixel, line or rectangle.
**Shift** while dragging evens the shape out — an angled run snaps to exactly
45°, a rectangle becomes a square. **R** cycles the shape.

**Belt**: three pixels thick, and the direction you dragged is the direction it
carries, marked by arrows along the run while you drag it and after it stands.
The run has to be clear, with no stone directly above it. Cargo rides on the
top face; sides hold it in place, so on an incline it does not slide back but
climbs — one cell every three frames.

**Wall**: plain solid body. It blocks movement like rock, and the drill will
not chew it — removal is the way it comes down.

**Remove**: every structure the shape covers goes. Touching any part of a belt
takes the whole run, since a belt is one machine; walls come away cell by cell.
