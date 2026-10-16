# TODO

- [ ] Player respawn drop does not work yet: after death the player still appears right on the platform instead of falling from above without damage.
  - `js/player.js`: `clearAirlock` carves a shaft of `ARRIVAL_DROP` cells above the spawn, `moveToSpawn` lifts the player by `arrivalHeight`, `player.arriving` suppresses fall damage.
  - Check in the running game why the player is not lifted (`arrivalHeight` returns 0, or the shaft is not carved, or `moveToSpawn` is overridden).
