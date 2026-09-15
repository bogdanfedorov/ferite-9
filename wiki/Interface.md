# Interface

The HUD sits in the corners so the middle of the screen stays the game.

- **top left, the module**: callsign, hull integrity and jetpack fuel (bars go
  green, yellow, red), and below them — only in heat map mode — the temperature
  scale;
- **top right, production**: power grid and cargo to orbit. A disabled shuttle
  button says what exactly is missing;
- **bottom left, the Mission Control channel**; bottom right, the utility
  buttons (help, sound, settings, language); bottom centre, the build panel;
- **the thermal probe follows the cursor**, so you read rock and temperature
  where you are looking instead of in a corner. Near the edge of the window the
  chip flips to the other side.

The build panel keeps a single row down to about 700 px wide, then wraps into
even rows. Below 980 px the utility buttons stay as icons, below 640 px the hint
line is hidden.

The module plate shows the percentage of the world explored.
