var player = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  w: SIZE.m(0.13),
  h: SIZE.m(0.3),
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
  lastTemp: 22,
  arriving: false
};

var REACH = 32;
var JET_EXHAUST = matId('smoke');
var FALL_SAFE = 30;
var ARRIVAL_DROP = 60;
var FUEL_BURN_RATE = 0.5;
var JETPAK_POWER = 0.062;
var FOOT_POWER = 0.05;
var WATER_RESISTANCE = 0.6;

function resetVitals() {
  player.vx = player.vy = 0;
  player.hp = 100;
  player.fuel = 100;
  player.dryTank = false;
  player.buried = 0;
}

function arrivalHeight() {
  let rise = 0;
  while (rise < ARRIVAL_DROP && !boxBlocked(player.spawnX, player.spawnY - rise - 1)) rise++;
  return rise;
}

function moveToSpawn() {
  player.x = player.spawnX;
  player.y = player.spawnY - arrivalHeight();
  player.vx = 0;
  player.vy = 0;
  player.fallFrom = player.y;
  player.arriving = true;
}

function floorBelow(x, y) {
  let fy = Math.round(y);
  while (inBounds(x, fy) && !BLOCKING[mat[fy * W + x]]) fy++;
  return fy;
}

function shiftPlayer(dx) {
  player.x -= dx;
  player.spawnX -= dx;
}

function spawnPlayer(x, y) {
  player.spawnX = x;
  player.spawnY = floorBelow(Math.round(x), y) - player.h / 2;
  clearAirlock();
  moveToSpawn();
  resetVitals();
  player.fallDrop = 0;
}

function clearAirlock() {
  const x0 = spanStart(player.spawnX, player.w) - 2,
    x1 = spanEnd(player.spawnX, player.w) + 2;
  const y0 = spanStart(player.spawnY, player.h) - ARRIVAL_DROP,
    y1 = spanEnd(player.spawnY, player.h);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      const m = mat[y * W + x];
      if (STATE[m] === MT.LIQUID) displaceCell(x, y);
      else if (m !== VOID_ID && !FIXED[m]) setCellHot(x, y, VOID_ID, 22);
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
  if (player.inLiquid) player.arriving = false;

  const hit = moveAxis(player.vx, player.vy);
  if (hit & 1) player.vx = 0;
  player.grounded = false;
  if (hit & 2) {
    if (player.vy > 0) {
      player.grounded = true;
      const drop = player.y - player.fallFrom;
      if (drop > FALL_SAFE && !sandbox.on && !player.arriving) {
        player.fallDrop = drop;
        player.hp -= (drop - FALL_SAFE) * 3.4;
        if (player.hp <= 0) player.deathCause = 'fall';
      }
      player.fallFrom = player.y;
      player.arriving = false;
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
