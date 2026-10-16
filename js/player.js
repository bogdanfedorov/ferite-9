var player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  w: 3,
  h: 5,
  grounded: false,
  inLiquid: false,
  fuel: 100,
  hp: 100,
  heat: 22,
  dryTank: false,
  drilling: false,
  aimX: 0,
  aimY: 0,
  spawnX: 0,
  spawnY: 0,
  deathCause: 'heat',
  fallFrom: 0,
  fallDrop: 0,
  buried: 0,
  lastTemp: 22
};

var REACH = 32;
var JET_EXHAUST = matId('smoke');
var TORCH_FLAME = matId('fire');
var TORCH_TEMP = 500;
var spoil = {};
var DRILL_RADIUS = 2.4;
var DRILL_POWER = 9;
var FALL_SAFE = 30;
var FUEL_BURN_RATE = 0.5;
var JETPAK_POWER = 0.062;
var FOOT_POWER = 0.05;
var WATER_RESISTANCE = 0.6;

var drillOffsets = (() => {
  const out = [];
  const r = Math.ceil(DRILL_RADIUS);
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= DRILL_RADIUS) out.push([x, y, d]);
    }
  }
  out.sort((a, b) => a[2] - b[2]);
  return out;
})();

function resetVitals() {
  player.vx = player.vy = 0;
  player.hp = 100;
  player.fuel = 100;
  player.dryTank = false;
  player.buried = 0;
}

function moveToSpawn() {
  player.x = player.spawnX;
  player.y = player.spawnY;
  player.fallFrom = player.y;
}

function spawnPlayer(x, y) {
  player.spawnX = x;
  player.spawnY = y;
  moveToSpawn();
  resetVitals();
  player.fallDrop = 0;
}

function clearAirlock() {
  const x0 = Math.round(player.spawnX) - 3,
    x1 = Math.round(player.spawnX) + 3;
  const y0 = Math.round(player.spawnY) - 4,
    y1 = Math.round(player.spawnY) + 3;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      const m = mat[y * W + x];
      const st = STATE[m];
      if (st === MT.POWDER) setCellHot(x, y, VOID_ID, 22);
      else if (st === MT.LIQUID) displaceCell(x, y);
    }
  }
}

function spanStart(c, size) {
  return Math.floor(c - size / 2);
}
function spanEnd(c, size) {
  return Math.floor(c + size / 2 - 0.01);
}

function boxBlocked(cx, cy) {
  const x0 = spanStart(cx, player.w),
    x1 = spanEnd(cx, player.w);
  const y0 = spanStart(cy, player.h),
    y1 = spanEnd(cy, player.h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) return true;
      if (BLOCKING[mat[y * W + x]]) return true;
    }
  }
  return false;
}

function sampleEnv() {
  const x0 = spanStart(player.x, player.w),
    x1 = spanEnd(player.x, player.w);
  const y0 = spanStart(player.y, player.h),
    y1 = spanEnd(player.y, player.h);
  let liquid = false,
    hottest = 0,
    n = 0,
    sum = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      const i = y * W + x;
      if (STATE[mat[i]] === MT.LIQUID) liquid = true;
      const t = temp[i];
      if (t > hottest) hottest = t;
      sum += t;
      n++;
    }
  }
  player.inLiquid = liquid;
  player.heat = n ? sum / n : 22;
  return hottest;
}

function moveAxis(dx, dy) {
  const steps = Math.ceil((Math.abs(dx) + Math.abs(dy)) / 0.25) || 1;
  let sx = dx / steps,
    sy = dy / steps;
  let hitX = false,
    hitY = false;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      if (!boxBlocked(player.x + sx, player.y)) player.x += sx;
      else if (!boxBlocked(player.x + sx, player.y - 1)) {
        player.x += sx;
        player.y -= 1;
      } else {
        hitX = true;
        sx = 0;
      }
    }
    if (sy !== 0) {
      if (!boxBlocked(player.x, player.y + sy)) player.y += sy;
      else {
        hitY = true;
        sy = 0;
      }
    }
  }
  return hitX ? (hitY ? 3 : 1) : hitY ? 2 : 0;
}

function updatePlayer(keys) {
  const hottest = sampleEnv();

  let acc = player.grounded ? FOOT_POWER : JETPAK_POWER;
  if (player.inLiquid) acc *= WATER_RESISTANCE;
  if (keys.left) player.vx -= acc;
  if (keys.right) player.vx += acc;
  if (!keys.left && !keys.right) player.vx *= player.grounded ? 0.78 : 0.94;
  else player.vx *= 0.94;

  const maxVx = player.inLiquid ? 0.3 : 0.55;
  if (player.vx > maxVx) player.vx = maxVx;
  if (player.vx < -maxVx) player.vx = -maxVx;

  player.vy += player.inLiquid ? 0.006 : 0.024;

  if (keys.up && (sandbox.on || player.fuel > 0)) {
    player.vy -= JETPAK_POWER;
    if (!sandbox.on) player.fuel -= FUEL_BURN_RATE;

    if (player.fuel <= 0) {
      player.fuel = 0;
      player.dryTank = true;
    }
    if (rnd() < 0.25)
      spawnNear(Math.round(player.x), Math.round(player.y + player.h / 2 + 1), JET_EXHAUST, 1);
  }

  if (keys.down) player.vy += 0.03;
  if (player.fuel > 100) player.fuel = 100;

  const maxVy = player.inLiquid ? 0.35 : 0.75;
  if (player.vy > maxVy) player.vy = maxVy;
  if (player.vy < -maxVy) player.vy = -maxVy;
  if (player.inLiquid) player.vy *= 0.94;

  if (player.grounded || player.vy < 0 || player.inLiquid) {
    player.fallFrom = player.y;
  }

  const hit = moveAxis(player.vx, player.vy);
  if (hit & 1) player.vx = 0;
  player.grounded = false;
  if (hit & 2) {
    if (player.vy > 0) {
      player.grounded = true;
      const drop = player.y - player.fallFrom;
      if (drop > FALL_SAFE && !sandbox.on) {
        player.fallDrop = drop;
        player.hp -= (drop - FALL_SAFE) * 3.4;
        if (player.hp <= 0) player.deathCause = 'fall';
      }
      player.fallFrom = player.y;
    }
    player.vy = 0;
  }

  if (boxBlocked(player.x, player.y)) {
    player.buried++;
    for (let k = 1; k <= 6; k++) {
      const s = k * 0.35;
      if (!boxBlocked(player.x, player.y - s)) {
        player.y -= s;
        break;
      }
      if (!boxBlocked(player.x - s, player.y)) {
        player.x -= s;
        break;
      }
      if (!boxBlocked(player.x + s, player.y)) {
        player.x += s;
        break;
      }
    }
    if (player.buried > 60) {
      player.hp -= 0.9;
      if (player.hp <= 0) player.deathCause = 'buried';
    }
  } else if (player.buried > 0) player.buried -= 3;

  if (hottest > 120) {
    player.hp -= (hottest - 120) * 0.0042;
    player.lastTemp = hottest;
    if (player.hp <= 0) player.deathCause = hottest > 1000 ? 'lava' : 'heat';
  } else if (player.hp < 100) player.hp += 0.06;

  if (player.hp > 100) player.hp = 100;
  if (player.hp <= 0) {
    resetVitals();
    clearAirlock();
    moveToSpawn();
    return 'respawn';
  }
  return null;
}

function clampToReach(tx, ty, anchor) {
  const ax = anchor ? anchor.x : player.x,
    ay = anchor ? anchor.y : player.y;
  const dx = tx - ax,
    dy = ty - ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > REACH) return [ax + (dx / d) * REACH, ay + (dy / d) * REACH];
  return [tx, ty];
}

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
      const loose = BREAK_INTO[m];
      if (loose) {
        spoil[loose] = (spoil[loose] || 0) + 1;
        if (spoil[loose] >= 2) {
          spoil[loose] -= 2;
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

function igniteAt(tx, ty) {
  const p = clampToReach(tx, ty);
  const cx = Math.round(p[0]),
    cy = Math.round(p[1]);
  let lit = 0;
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      if (!inBounds(x, y)) continue;
      const i = y * W + x;
      const m = mat[i];
      const point = HOT_T[m];
      if (ISVOID[m]) {
        setCellHot(x, y, TORCH_FLAME, EMITS[TORCH_FLAME]);
        lit++;
      } else if (point > 0 && point <= TORCH_TEMP) {
        temp[i] = point + 80;
        lit++;
      } else if (temp[i] < TORCH_TEMP) temp[i] = TORCH_TEMP;
    }
  }
  return lit;
}
