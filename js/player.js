var player = {
  x: 0, y: 0, vx: 0, vy: 0,
  w: 3, h: 5,
  grounded: false, inLiquid: false,
  fuel: 100, hp: 100, heat: 22, dryTank: false,
  drilling: false, aimX: 0, aimY: 0,
  spawnX: 0, spawnY: 0,
  deathCause: 'heat', 
  fallFrom: 0, fallDrop: 0, buried: 0, lastTemp: 22
};

var hook = {
  state: 'idle',        // idle | fly | set
  x: 0, y: 0, vx: 0, vy: 0,
  ax: 0, ay: 0, len: 0, anchor: -1, travel: 0
};

var REACH = 32;
var JET_EXHAUST = matId('smoke');
var TORCH_FLAME = matId('fire');
var TORCH_TEMP = 500;
var spoil = {};
var DRILL_RADIUS = 2.4;
var DRILL_POWER = 9;
var HOOK_SPEED = 1.9;
var HOOK_RANGE = 58;
var FALL_SAFE = 30;  
var FUEL_BURN_RATE = 0.5;
var JETPAK_POWER =  0.062;
var FOOT_POWER = 0.05;
var WATER_RESISTANCE = 0.6;

var drillOffsets = (function () {
  var out = [];
  var r = Math.ceil(DRILL_RADIUS);
  for (var y = -r; y <= r; y++) {
    for (var x = -r; x <= r; x++) {
      var d = Math.sqrt(x * x + y * y);
      if (d <= DRILL_RADIUS) out.push([x, y, d]);
    }
  }
  out.sort(function (a, b) { return a[2] - b[2]; });
  return out;
})();

function spawnPlayer(x, y) {
  player.x = x; player.y = y;
  player.spawnX = x; player.spawnY = y;
  player.vx = player.vy = 0;
  player.hp = 100; player.fuel = 100; player.dryTank = false;
  player.fallFrom = y; player.fallDrop = 0; player.buried = 0;
  hook.state = 'idle';
}

function clearAirlock() {
  var x0 = Math.round(player.spawnX) - 3, x1 = Math.round(player.spawnX) + 3;
  var y0 = Math.round(player.spawnY) - 4, y1 = Math.round(player.spawnY) + 3;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      var m = mat[y * W + x];
      var st = STATE[m];
      if (st === MT.POWDER) setCellHot(x, y, VOID_ID, 22);
      else if (st === MT.LIQUID) displaceCell(x, y);
    }
  }
}


function getPixelRange(cx, width) {
  return [
    Math.floor(cx - width / 2),
    Math.floor(cx + width / 2 - 0.01),
  ];
}

function boxBlocked(cx, cy) {
  var [x0, x1] = getPixelRange(cx,player.w)
  var [y0, y1] = getPixelRange(cy,player.h)

  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) return true;
      if (BLOCKING[mat[y * W + x]]) return true;
    }
  }
  return false;
}

function sampleEnv() {
  var [x0, x1] = getPixelRange(player.x,player.w)
  var [y0, y1] = getPixelRange(player.y,player.h)

  var liquid = false, hottest = 0, n = 0, sum = 0;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      var i = y * W + x;
      if (STATE[mat[i]] === MT.LIQUID) liquid = true;
      var t = temp[i];
      if (t > hottest) hottest = t;
      sum += t; n++;
    }
  }
  player.inLiquid = liquid;
  player.heat = n ? sum / n : 22;
  return hottest;
}

function moveAxis(dx, dy) {
  var steps = Math.ceil((Math.abs(dx) + Math.abs(dy)) / 0.25) || 1;
  var sx = dx / steps, sy = dy / steps;
  var hitX = false, hitY = false;
  for (var i = 0; i < steps; i++) {
    if (sx !== 0) {
      if (!boxBlocked(player.x + sx, player.y)) player.x += sx;
      else if (!boxBlocked(player.x + sx, player.y - 1)) { player.x += sx; player.y -= 1; }
      else { hitX = true; sx = 0; }
    }
    if (sy !== 0) {
      if (!boxBlocked(player.x, player.y + sy)) player.y += sy;
      else { hitY = true; sy = 0; }
    }
  }
  return hitX ? (hitY ? 3 : 1) : (hitY ? 2 : 0);
}

function fireHook(tx, ty) {
  var dx = tx - player.x, dy = ty - player.y;
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  hook.state = 'fly';
  hook.x = player.x; hook.y = player.y;
  hook.vx = dx / d * HOOK_SPEED;
  hook.vy = dy / d * HOOK_SPEED;
  hook.travel = 0;
  hook.anchor = -1;
}

function releaseHook() { hook.state = 'idle'; hook.anchor = -1; }

function updateHook(reeling) {
  if (hook.state === 'fly') {
    for (var s = 0; s < 4; s++) {
      hook.x += hook.vx * 0.25;
      hook.y += hook.vy * 0.25;
      hook.travel += HOOK_SPEED * 0.25;
      var cx = Math.floor(hook.x), cy = Math.floor(hook.y);
      if (!inBounds(cx, cy) || hook.travel > HOOK_RANGE) { releaseHook(); return; }
      var m = mat[cy * W + cx];
      if (RIGID[m]) {
        hook.state = 'set';
        hook.anchor = cy * W + cx;
        hook.ax = cx + 0.5; hook.ay = cy + 0.5;
        var dx = hook.ax - player.x, dy = hook.ay - player.y;
        hook.len = Math.max(2, Math.sqrt(dx * dx + dy * dy));
        return;
      }
    }
    return;
  }

  if (hook.state !== 'set') return;

  var m2 = mat[hook.anchor];
  if (!RIGID[m2]) { releaseHook(); return; }

  var ddx = hook.ax - player.x, ddy = hook.ay - player.y;
  var d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.001;
  if (reeling) hook.len = Math.max(2.5, hook.len - 0.26);
  if (d > HOOK_RANGE + 6) { releaseHook(); return; }

  if (d > hook.len) {
    var nx = ddx / d, ny = ddy / d;
    var stretch = d - hook.len;
    player.vx += nx * stretch * 0.12;
    player.vy += ny * stretch * 0.12;
    var radial = player.vx * nx + player.vy * ny;
    if (radial < 0) { player.vx -= nx * radial * 0.5; player.vy -= ny * radial * 0.5; }
    player.vx *= 0.995;
  }
}

function updatePlayer(keys, reeling) {
  var hottest = sampleEnv();

  var acc = player.grounded ? FOOT_POWER : JETPAK_POWER;
  if (player.inLiquid) acc *= WATER_RESISTANCE;
  if (keys.left) player.vx -= acc;
  if (keys.right) player.vx += acc;
  if (!keys.left && !keys.right) player.vx *= player.grounded ? 0.78 : 0.94;
  else player.vx *= 0.94;

  var maxVx = hook.state === 'set' ? 1.1 : (player.inLiquid ? 0.3 : 0.55);
  if (player.vx > maxVx) player.vx = maxVx;
  if (player.vx < -maxVx) player.vx = -maxVx;

  player.vy += player.inLiquid ? 0.006 : 0.024;

  if (keys.up && (sandbox.on || player.fuel > 0)) {
    player.vy -= JETPAK_POWER;
    if (!sandbox.on) player.fuel -= FUEL_BURN_RATE;

    if (player.fuel <= 0) { player.fuel = 0; player.dryTank = true; }
    if (rnd() < 0.25) spawnNear(Math.round(player.x), Math.round(player.y + player.h / 2 + 1), JET_EXHAUST, 1);
  }

  if (keys.down) player.vy += 0.03;
  if (player.fuel > 100) player.fuel = 100;

  updateHook(reeling);

  var maxVy = hook.state === 'set' ? 1.2 : (player.inLiquid ? 0.35 : 0.75);
  if (player.vy > maxVy) player.vy = maxVy;
  if (player.vy < -maxVy) player.vy = -maxVy;
  if (player.inLiquid) player.vy *= 0.94;

  if (player.grounded || player.vy < 0 || player.inLiquid || hook.state === 'set') {
    player.fallFrom = player.y;
  }

  var hit = moveAxis(player.vx, player.vy);
  if (hit & 1) player.vx = 0;
  player.grounded = false;
  if (hit & 2) {
    if (player.vy > 0) {
      player.grounded = true;
      var drop = player.y - player.fallFrom;
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
    for (var k = 1; k <= 6; k++) {
      var s = k * 0.35;
      if (!boxBlocked(player.x, player.y - s)) { player.y -= s; break; }
      if (!boxBlocked(player.x - s, player.y)) { player.x -= s; break; }
      if (!boxBlocked(player.x + s, player.y)) { player.x += s; break; }
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
    player.hp = 100;
    player.fuel = 100;
    player.dryTank = false;
    player.buried = 0;
    clearAirlock();
    player.x = player.spawnX; player.y = player.spawnY;
    player.fallFrom = player.y;
    player.vx = player.vy = 0;
    player.fuel = 100;
    releaseHook();
    return 'respawn';
  }
  return null;
}

function clampToReach(tx, ty) {
  var dx = tx - player.x, dy = ty - player.y;
  var d = Math.sqrt(dx * dx + dy * dy);
  if (d > REACH) return [player.x + dx / d * REACH, player.y + dy / d * REACH];
  return [tx, ty];
}

function drillableAt(x, y) {
  if (!inBounds(x, y)) return false;
  var m = mat[y * W + x];
  return MINEABLE[m] === 1;
}

function drillAt(tx, ty) {
  var p = clampToReach(tx, ty);
  var cx = Math.round(p[0]), cy = Math.round(p[1]);
  player.drilling = true;
  player.aimX = cx; player.aimY = cy;

  var budget = DRILL_POWER;
  var broken = 0, splash = 0;

  for (var n = 0; n < drillOffsets.length; n++) {
    var x = cx + drillOffsets[n][0], y = cy + drillOffsets[n][1];
    if (!inBounds(x, y)) continue;
    var i = y * W + x;
    var m = mat[i];
    if (!drillableAt(x, y)) continue;   

    var portion;
    if (budget > 0) portion = budget;
    else if (splash < 3) { portion = DRILL_POWER * 0.25; splash++; }
    else break;

    var ct = temp[i];
    if (ct > 260) {
      player.hp -= (ct - 260) * 0.009;
      player.lastTemp = ct;
      if (player.hp <= 0) player.deathCause = 'hotdrill';
    }

    var need = HARD[m] - dmg[i];
    if (portion >= need) {
      setCell(x, y, VOID_ID);
      var loose = BREAK_INTO[m];
      if (loose) {
        spoil[loose] = (spoil[loose] || 0) + 1;
        if (spoil[loose] >= 2) { spoil[loose] -= 2; dropLoose(x, y, loose, ct); }
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
  var p = clampToReach(tx, ty);
  var cx = Math.round(p[0]), cy = Math.round(p[1]);
  var lit = 0;
  for (var y = cy - 1; y <= cy + 1; y++) {
    for (var x = cx - 1; x <= cx + 1; x++) {
      if (!inBounds(x, y)) continue;
      var i = y * W + x;
      var m = mat[i];
      var point = HOT_T[m];
      if (ISVOID[m]) { setCellHot(x, y, TORCH_FLAME, EMITS[TORCH_FLAME]); lit++; }
      else if (point > 0 && point <= TORCH_TEMP) { temp[i] = point + 80; lit++; }
      else if (temp[i] < TORCH_TEMP) temp[i] = TORCH_TEMP;
    }
  }
  return lit;
}
