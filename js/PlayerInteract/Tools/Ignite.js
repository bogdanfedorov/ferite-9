var TORCH_FLAME = matId('fire');
var TORCH_TEMP = 500;
var IGNITE_COOLDOWN = 12;

var igniteCd = 0;

function igniteAt(tx, ty) {
  const p = clampToReach(tx, ty);
  const cx = Math.round(p[0]),
    cy = Math.round(p[1]);
  const spot = shapeCells('rect', { x: cx - 1, y: cy - 1 }, { x: cx + 1, y: cy + 1 });
  let lit = 0;
  for (let k = 0; k < spot.length; k++) {
    const x = spot[k].x,
      y = spot[k].y;
    if (!inBounds(x, y)) continue;
    const i = y * W + x;
    const m = mat[i];
    const point = HOT_T[m];
    if (ISVOID[m]) {
      setCellHot(x, y, TORCH_FLAME, EMITS[TORCH_FLAME]);
      lit++;
    } else if (point > 0 && point <= TORCH_TEMP) {
      temp[i] = point + 80;
      markDirty(x, y);
      lit++;
    } else if (temp[i] < TORCH_TEMP) {
      temp[i] = TORCH_TEMP;
      markDirty(x, y);
    }
  }
  return lit;
}

function igniteHold(wpt) {
  const dx = wpt[0] - player.x,
    dy = wpt[1] - player.y;
  if (Math.sqrt(dx * dx + dy * dy) > REACH + 8) {
    transmit(t('msg.tooFar'), NOTICE);
    return;
  }
  if (igniteCd > 0) return;
  igniteCd = IGNITE_COOLDOWN;
  const lit = igniteAt(wpt[0], wpt[1]);
  play(lit ? 'ignite' : 'fizzle');
  if (!lit) transmit(t('msg.noIgnite'), NOTICE);
}

regTool({
  id: 'ignite',
  hud: { name: 'tool.ignite', desc: 'tool.ignite.desc', icon: '✦' },
  cost: 60,
  sound: 'pickTool',
  sounds: {
    ignite: { freq: 320, dur: 0.14, wave: 'sawtooth', vol: 0.035 },
    fizzle: { freq: 150, dur: 0.14, wave: 'sawtooth', vol: 0.035 }
  },
  ghost: { size: 3, free: (m) => STATE[m] !== MT.STRUCTURE },
  hold: igniteHold,
  reset: () => {
    igniteCd = 0;
  },
  tick: () => {
    if (igniteCd > 0) igniteCd--;
  }
});
