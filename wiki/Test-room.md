# Test room

A second way into the world, next to **Descend into the shaft** on the start
screen: **Test room**. It is a flat sandbox for trying substances and structures
out without the shift hanging over you.

## What is different

- **Every material in the game, in its own bin.** Bedrock walls, one bin per
  substance, the name written above it. The row is built from the material list,
  so a substance added to `js/materials.data.js` gets its own bin with no extra
  work. Each bin is as wide as the longest name it has to carry in any of the
  three languages, so the names sit on one line and never overlap, and the whole
  header row — names and buttons — is aligned across the row.
- **A reset button over every bin.** The square under the name refills that bin
  on the spot: click it and the bin is poured full again, whatever state it was
  in. While the cursor is over a button the tool underneath does not fire, so a
  reset never drills or grabs by accident.
- **Bins also restock themselves.** Every few seconds one bin is checked: holes
  are topped up, and a bin that has nothing of its own substance left is refilled
  from scratch. Fire that burned out relights, embers that turned to slag come
  back, and a melt that froze is poured again — so molten iron and molten glass
  are always there to pick up.
- **Endless jetpack.** Fuel does not burn. The gauge stays at 100.
- **No fall damage.** Drop from the ceiling onto bedrock and nothing happens.
- **The whole room is surveyed.** Nothing is hidden, everything simulates from
  the first frame.
- **The belt is unlocked** from the start, without waiting for the quota.
- **Room temperature everywhere**, 22 °C with no geothermal gradient, so heat
  you see came from something you did. Liquids that would freeze at room
  temperature are poured just above their freezing point.

Everything else is the real game: the same simulation, the same drill, hand,
torch and belt, the same cargo pad above the row if you want to test deliveries.

## What is not different

Heat still hurts. Standing in a bin of lava or embers will burn the module down
the same way it does in the shaft — the room takes away the fall and the fuel
gauge, not the physics. The apron where you start is far enough from the hot end
of the row to be safe.

## Getting out

The test room is a fresh world, not a layer over the shaft. Press `H` for help
or `O` for settings as usual; reloading the page, or pressing **Descend into the
shaft**, generates a normal mine again.
