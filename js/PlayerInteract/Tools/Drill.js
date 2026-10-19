var DRILL_RADIUS = 2;
var DRILL_POWER = 9;

var drillSpoil = {};

var drillOffsets = SHAPES.circle({ x: 0, y: 0 }, { x: DRILL_RADIUS, y: 0 })
  .map((c) => [c.x, c.y, Math.hypot(c.x, c.y)])
  .sort((a, b) => a[2] - b[2]);

function drillableAt(x, y) {
  if (!inBounds(x, y)) return false;
  const m = mat[y * W + x];
  return MINEABLE[m] === 1;
}

function drillAt(tx, ty) {
  const p = clampToReach(tx, ty);
  const cx = Math.round(p[0]),
    cy = Math.round(p[1]);
  player.drilling = true;
  player.aimX = cx;
  player.aimY = cy;

  let budget = DRILL_POWER;
  let broken = 0,
    splash = 0;

  for (let n = 0; n < drillOffsets.length; n++) {
    const x = cx + drillOffsets[n][0],
      y = cy + drillOffsets[n][1];
    if (!inBounds(x, y)) continue;
    const i = y * W + x;
    const m = mat[i];
    if (!drillableAt(x, y)) continue;

    let portion;
    if (budget > 0) portion = budget;
    else if (splash < 3) {
      portion = DRILL_POWER * 0.25;
      splash++;
    } else break;

    const ct = temp[i];
    if (ct > 260) {
      player.hp -= (ct - 260) * 0.009;
      player.lastTemp = ct;
      if (player.hp <= 0) player.deathCause = 'hotdrill';
    }

    const need = HARD[m] - dmg[i];
    if (portion >= need) {
      setCell(x, y, VOID_ID);
      markEdited(x, y);
      const loose = BREAK_INTO[m];
      if (loose) {
        drillSpoil[loose] = (drillSpoil[loose] || 0) + 1;
        if (drillSpoil[loose] >= 2) {
          drillSpoil[loose] -= 2;
          dropLoose(x, y, loose, ct);
        }
      }
      broken++;
      if (budget > 0) budget -= need;
    } else {
      markDamage(i);
      dmg[i] += portion;
      if (budget > 0) budget = 0;
    }
  }
  return broken;
}

function drillHold(wpt) {
  const got = drillAt(wpt[0], wpt[1]);
  if (got && simFrame % 5 === 0) notice('drill', null);
}

regTool({
  id: 'drill',
  hud: { name: 'tool.drill', desc: 'tool.drill.desc', icon: '▼' },
  sound: 'pickDrill',
  hold: drillHold
});
