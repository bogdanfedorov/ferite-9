var objects = [];

var OBJ_MAX = 16;
var IMPACT_STEAM = matId('smoke');
var OBJ_GRAV = 0.03;
var OBJ_MAXV = 1.4;
var OBJ_SPRING = 0.30;
var OBJ_DAMP = 0.62;
var OBJ_REST = 24;
var OBJ_IMPACT = 0.45;
var OBJ_ICD = 12;
var SHOVE_R = 3;

var heldObject = null;

function grabbableAt(x, y) {
  var m = matAt(x, y);
  return STATE[m] === MT.POWDER ? m : 0;
}

function squareRing(cx, cy, radius) {
  var points = [];
  for (var y = -radius; y <= radius; y++) {
    for (var x = -radius; x <= radius; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) === radius) points.push([cx + x, cy + y]);
    }
  }
  return points;
}

function findInRings(cx, cy, maxR, fit) {
  for (var r = 0; r <= maxR; r++) {
    var ring = squareRing(cx, cy, r);
    for (var k = 0; k < ring.length; k++) {
      if (fit(ring[k][0], ring[k][1])) return ring[k];
    }
  }
  return null;
}

function grabTargetAt(cx, cy) {
  var p = findInRings(cx, cy, 2, grabbableAt);
  return p ? grabbableAt(p[0], p[1]) : 0;
}

function grabPick(cx, cy, only) {
  var dx, dy;
  var fit = function (px, py) { return grabbableAt(px, py) === only; };

  var anchor = findInRings(cx, cy, 2, fit);
  if (!anchor) return [];
  var ax = anchor[0], ay = anchor[1];

  var cap = settings.grabSize * settings.grabSize;
  var pick = [[ax, ay]];
  var seen = {};
  seen[ay * W + ax] = 1;
  for (var q = 0; q < pick.length && pick.length < cap; q++) {
    for (dy = -1; dy <= 1; dy++) {
      for (dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var x = pick[q][0] + dx, y = pick[q][1] + dy, i = y * W + x;
        if (!fit(x, y) || seen[i]) continue;
        seen[i] = 1;
        pick.push([x, y]);
        if (pick.length >= cap) return pick;
      }
    }
  }
  return pick;
}

function makeObject(bx, by, cells) {
  if (!cells.length) return null;
  var sumX = 0, sumY = 0;
  for (var k = 0; k < cells.length; k++) {
    sumX += cells[k].dx + 0.5;
    sumY += cells[k].dy + 0.5;
  }
  var o = {
    x: bx, y: by, vx: 0, vy: 0,
    cx: sumX / cells.length, cy: sumY / cells.length,
    cells: cells, held: true, rest: 0, flash: 0, hot: 0, icd: 0
  };
  objects.push(o);
  heldObject = o;
  return o;
}

function takeObject(cx, cy, only) {
  if (objects.length >= OBJ_MAX) return null;
  var pick = grabPick(cx, cy, only);
  if (!pick.length) return null;

  var bx = pick[0][0], by = pick[0][1], k;
  for (k = 1; k < pick.length; k++) {
    if (pick[k][0] < bx) bx = pick[k][0];
    if (pick[k][1] < by) by = pick[k][1];
  }
  var cells = [];
  for (k = 0; k < pick.length; k++) {
    var x = pick[k][0], y = pick[k][1], i = y * W + x;
    cells.push({ dx: x - bx, dy: y - by, mat: mat[i], temp: temp[i] });
    setCell(x, y, VOID_ID);
  }
  return makeObject(bx, by, cells);
}

function releaseObject() {
  var o = heldObject;
  if (!o) return;
  o.held = false;
  o.vx = 0;
  o.vy = 0;
  heldObject = null;
  dropObject(o);
}


function objBlocked(o, nx, ny, hard) {
  for (var k = 0; k < o.cells.length; k++) {
    var x = Math.floor(nx + o.cells[k].dx);
    var y = Math.floor(ny + o.cells[k].dy);
    if (!inBounds(x, y)) return true;
    var m = mat[y * W + x];
    if (hard ? RIGID[m] : BLOCKING[m]) return true;
  }
  return false;
}

function shoveCell(x, y, dx, dy) {
  if (!inBounds(x, y)) return false;
  var i = y * W + x, m = mat[i];
  if (OPEN[m]) return true;
  if (!MOVABLE[m]) return false;
  var hot = temp[i];

  var way = [dx, dy, dy, dx, -dy, -dx, 0, -1, -dx, -dy];
  var k, nx, ny;
  for (k = 0; k < way.length; k += 2) {
    nx = x + way[k]; ny = y + way[k + 1];
    if ((nx === x && ny === y) || !inBounds(nx, ny)) continue;
    if (OPEN[mat[ny * W + nx]]) {
      setCellHot(nx, ny, m, hot); setCell(x, y, VOID_ID); return true;
    }
  }
  for (var r = 2; r <= SHOVE_R; r++) {
    for (var oy = -r; oy <= r; oy++) {
      for (var ox = -r; ox <= r; ox++) {
        if (ox !== -r && ox !== r && oy !== -r && oy !== r) continue;
        nx = x + ox; ny = y + oy;
        if (!inBounds(nx, ny)) continue;
        if (OPEN[mat[ny * W + nx]]) {
          setCellHot(nx, ny, m, hot); setCell(x, y, VOID_ID); return true;
        }
      }
    }
  }
  return false;
}


function objPass(o, nx, ny, dx, dy) {
  if (objBlocked(o, nx, ny, true)) return false;
  if (!o.held) return !objBlocked(o, nx, ny, false);
  for (var k = 0; k < o.cells.length; k++) {
    if (!shoveCell(Math.floor(nx + o.cells[k].dx),
      Math.floor(ny + o.cells[k].dy), dx, dy)) return false;
  }
  return true;
}

var DROP_R = 14;

function placeCell(x, y, m, hot) {
  if (inBounds(x, y)) {
    var at = mat[y * W + x];
    if (OPEN[at]) { setCellHot(x, y, m, hot); return true; }
    if (MOVABLE[at] && shoveCell(x, y, 0, -1)) {
      setCellHot(x, y, m, hot); return true;
    }
  }
  for (var r = 1; r <= DROP_R; r++) {
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (dx !== -r && dx !== r && dy !== -r && dy !== r) continue;
        var px = x + dx, py = y + dy;
        if (!inBounds(px, py)) continue;
        if (OPEN[mat[py * W + px]]) { setCellHot(px, py, m, hot); return true; }
      }
    }
  }
  return false;
}

function swapCell(x, y, m, hot) {
  if (!inBounds(x, y)) return null;
  var i = y * W + x;
  var om = mat[i];
  if (!MOVABLE[om]) return null;
  var back = { mat: om, temp: temp[i] };
  setCellHot(x, y, m, hot);
  return back;
}

function dropObject(o) {
  var bx = Math.round(o.x), by = Math.round(o.y);
  var left = [];
  for (var k = 0; k < o.cells.length; k++) {
    var c = o.cells[k];
    if (placeCell(bx + c.dx, by + c.dy, c.mat, c.temp)) continue;
    var sw = swapCell(bx + c.dx, by + c.dy, c.mat, c.temp);
    left.push(sw ? { dx: c.dx, dy: c.dy, mat: sw.mat, temp: sw.temp } : c);
  }
  if (left.length) {
    o.cells = left;
    o.rest = 0;
    return false;
  }
  var idx = objects.indexOf(o);
  if (idx >= 0) objects.splice(idx, 1);
  if (heldObject === o) heldObject = null;
  return true;
}

function objSpan(o) {
  var w = 1, h = 1;
  for (var k = 0; k < o.cells.length; k++) {
    if (o.cells[k].dx + 1 > w) w = o.cells[k].dx + 1;
    if (o.cells[k].dy + 1 > h) h = o.cells[k].dy + 1;
  }
  return [w, h];
}

function objHeat(o) {
  var h = 0;
  for (var k = 0; k < o.cells.length; k++) if (o.cells[k].temp > h) h = o.cells[k].temp;
  return h;
}

function objectImpact(o, speed, hitMat) {
  if (o.icd > 0) return;
  o.icd = OBJ_ICD;
  o.flash = 10;
  if (objHeat(o) > 200) {
    var bx = Math.round(o.x), by = Math.round(o.y);
    var puffs = speed > 0.9 ? 3 : 1;
    for (var k = 0; k < puffs; k++) spawnNear(bx, by + 1, IMPACT_STEAM, 2);
  }
  if (typeof onObjectImpact === 'function') onObjectImpact(o, speed, hitMat);
}

function matUnder(o, nx, ny) {
  for (var k = 0; k < o.cells.length; k++) {
    var x = Math.floor(nx + o.cells[k].dx);
    var y = Math.floor(ny + o.cells[k].dy);
    if (!inBounds(x, y)) return EDGE_ID;
    var m = mat[y * W + x];
    if (BLOCKING[m]) return m;
  }
  return VOID_ID;
}

function moveObject(o) {
  var steps = Math.ceil((Math.abs(o.vx) + Math.abs(o.vy)) / 0.25) || 1;
  var sx = o.vx / steps, sy = o.vy / steps;

  for (var s = 0; s < steps; s++) {
    if (sx !== 0) {
      if (objPass(o, o.x + sx, o.y, sx > 0 ? 1 : -1, 0)) o.x += sx;
      else {
        var sp = Math.abs(o.vx);
        if (sp > OBJ_IMPACT) objectImpact(o, sp, matUnder(o, o.x + sx, o.y));
        o.vx = 0; sx = 0;
      }
    }
    if (sy !== 0) {
      if (objPass(o, o.x, o.y + sy, 0, sy > 0 ? 1 : -1)) o.y += sy;
      else {
        var sp2 = Math.abs(o.vy);
        if (sp2 > OBJ_IMPACT) objectImpact(o, sp2, matUnder(o, o.x, o.y + sy));
        o.vy = 0; sy = 0;
      }
    }
  }
}

function stepObjects(targetX, targetY) {
  for (var i = objects.length - 1; i >= 0; i--) {
    var o = objects[i];
    if (o.flash > 0) o.flash--;
    if (o.icd > 0) o.icd--;

    if (o.held) {
      o.vx += (targetX - (o.x + o.cx)) * OBJ_SPRING;
      o.vy += (targetY - (o.y + o.cy)) * OBJ_SPRING;
      o.vx *= OBJ_DAMP;
      o.vy *= OBJ_DAMP;
      o.rest = 0;
    } else {
      o.vy += OBJ_GRAV;
      o.vx *= 0.99;
    }

    if (o.vx > OBJ_MAXV) o.vx = OBJ_MAXV;
    if (o.vx < -OBJ_MAXV) o.vx = -OBJ_MAXV;
    if (o.vy > OBJ_MAXV) o.vy = OBJ_MAXV;
    if (o.vy < -OBJ_MAXV) o.vy = -OBJ_MAXV;

    moveObject(o);

    for (var k = 0; k < o.cells.length; k++) {
      var c = o.cells[k];
      if (c.temp > 24) c.temp -= (c.temp - 22) * 0.0015;
    }

    if (!o.held) {
      var still = Math.abs(o.vx) < 0.02 && Math.abs(o.vy) < 0.02;
      var supported = objBlocked(o, o.x, o.y + 0.3);
      if (still && supported) {
        if (++o.rest > OBJ_REST) dropObject(o);
      } else o.rest = 0;
    }
  }
}

function resetObjects() {
  objects.length = 0;
  heldObject = null;
}
