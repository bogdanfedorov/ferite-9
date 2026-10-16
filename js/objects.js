var objects = [];
var shelvedObjects = [];

var OBJ_MAX = 16;
var OBJ_LIFT = 48;
var SHELF_MAX = 8;
var IMPACT_STEAM = matId('smoke');
var OBJ_GRAV = 0.03;
var OBJ_MAXV = 1.4;
var OBJ_SPRING = 0.3;
var OBJ_DAMP = 0.62;
var OBJ_REST = 24;
var OBJ_IMPACT = 0.45;
var OBJ_ICD = 12;
var SHOVE_R = 3;

var heldObject = null;

function grabbableAt(x, y) {
  const m = matAt(x, y);
  return STATE[m] === MT.POWDER ? m : 0;
}

function isGrabbableCell(i) {
  return STATE[mat[i]] === MT.POWDER;
}

function grabTargetAt(cx, cy) {
  const j = findNear(cx, cy, 0, 2, isGrabbableCell);
  return j < 0 ? 0 : mat[j];
}

function grabPick(cx, cy, only) {
  let dx, dy;
  const fit = (px, py) => grabbableAt(px, py) === only;
  const fitCell = (i) => mat[i] === only && isGrabbableCell(i);

  const anchor = findNear(cx, cy, 0, 2, fitCell);
  if (anchor < 0) return [];
  const ax = anchor % W,
    ay = (anchor / W) | 0;

  const cap = settings.grabSize * settings.grabSize;
  const pick = [[ax, ay]];
  const seen = {};
  seen[anchor] = 1;
  for (let q = 0; q < pick.length && pick.length < cap; q++) {
    for (dy = -1; dy <= 1; dy++) {
      for (dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = pick[q][0] + dx,
          y = pick[q][1] + dy,
          i = y * W + x;
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
  let sumX = 0,
    sumY = 0;
  for (let k = 0; k < cells.length; k++) {
    sumX += cells[k].dx + 0.5;
    sumY += cells[k].dy + 0.5;
  }
  const o = {
    x: bx,
    y: by,
    vx: 0,
    vy: 0,
    cx: sumX / cells.length,
    cy: sumY / cells.length,
    cells: cells,
    held: true,
    rest: 0,
    flash: 0,
    hot: 0,
    icd: 0
  };
  objects.push(o);
  heldObject = o;
  return o;
}

function takeObject(cx, cy, only) {
  if (objects.length >= OBJ_MAX) return null;
  const pick = grabPick(cx, cy, only);
  if (!pick.length) return null;

  let bx = pick[0][0],
    by = pick[0][1],
    k;
  for (k = 1; k < pick.length; k++) {
    if (pick[k][0] < bx) bx = pick[k][0];
    if (pick[k][1] < by) by = pick[k][1];
  }
  const cells = [];
  for (k = 0; k < pick.length; k++) {
    const x = pick[k][0],
      y = pick[k][1],
      i = y * W + x;
    cells.push({ dx: x - bx, dy: y - by, mat: mat[i], temp: temp[i] });
    setCell(x, y, VOID_ID);
  }
  return makeObject(bx, by, cells);
}

function releaseObject() {
  const o = heldObject;
  if (!o) return;
  o.held = false;
  o.vx = 0;
  o.vy = 0;
  heldObject = null;
  dropObject(o);
}

function objBlocked(o, nx, ny, hard) {
  for (let k = 0; k < o.cells.length; k++) {
    const x = Math.floor(nx + o.cells[k].dx);
    const y = Math.floor(ny + o.cells[k].dy);
    if (!inBounds(x, y)) return true;
    const m = mat[y * W + x];
    if (hard ? RIGID[m] : BLOCKING[m]) return true;
  }
  return false;
}

function shoveTarget(x, y, dx, dy) {
  let j = openAt(x + dx, y + dy);
  if (j < 0) j = openAt(x + dy, y + dx);
  if (j < 0) j = openAt(x - dy, y - dx);
  if (j < 0) j = openAt(x, y - 1);
  if (j < 0) j = openAt(x - dx, y - dy);
  if (j < 0) j = openNear(x, y, 2, SHOVE_R);
  return j;
}

function shoveCell(x, y, dx, dy) {
  if (!inBounds(x, y)) return false;
  const i = y * W + x,
    m = mat[i];
  if (OPEN[m]) return true;
  if (!MOVABLE[m]) return false;
  const j = shoveTarget(x, y, dx, dy);
  if (j < 0) return false;
  moveCell(i, j);
  return true;
}

function objPass(o, nx, ny, dx, dy) {
  if (objBlocked(o, nx, ny, true)) return false;
  if (!o.held) return !objBlocked(o, nx, ny, false);
  for (let k = 0; k < o.cells.length; k++) {
    if (!shoveCell(Math.floor(nx + o.cells[k].dx), Math.floor(ny + o.cells[k].dy), dx, dy))
      return false;
  }
  return true;
}

var DROP_R = 14;

function placeCell(x, y, m, hot) {
  if (inBounds(x, y)) {
    const at = mat[y * W + x];
    if (OPEN[at] || (MOVABLE[at] && shoveCell(x, y, 0, -1))) {
      setCellHot(x, y, m, hot);
      return true;
    }
  }
  const j = openNear(x, y, 1, DROP_R);
  if (j < 0) return false;
  putCell(j, m, hot);
  return true;
}

function swapCell(x, y, m, hot) {
  if (!inBounds(x, y)) return null;
  const i = y * W + x;
  const om = mat[i];
  if (!MOVABLE[om]) return null;
  const back = { mat: om, temp: temp[i] };
  setCellHot(x, y, m, hot);
  return back;
}

function dropObject(o) {
  const bx = Math.round(o.x),
    by = Math.round(o.y);
  const left = [];
  for (let k = 0; k < o.cells.length; k++) {
    const c = o.cells[k];
    if (placeCell(bx + c.dx, by + c.dy, c.mat, c.temp)) continue;
    const sw = swapCell(bx + c.dx, by + c.dy, c.mat, c.temp);
    left.push(sw ? { dx: c.dx, dy: c.dy, mat: sw.mat, temp: sw.temp } : c);
  }
  if (left.length) {
    o.cells = left;
    o.rest = 0;
    return false;
  }
  const idx = objects.indexOf(o);
  if (idx >= 0) objects.splice(idx, 1);
  if (heldObject === o) heldObject = null;
  return true;
}

function objSpan(o) {
  let w = 1,
    h = 1;
  for (let k = 0; k < o.cells.length; k++) {
    if (o.cells[k].dx + 1 > w) w = o.cells[k].dx + 1;
    if (o.cells[k].dy + 1 > h) h = o.cells[k].dy + 1;
  }
  return [w, h];
}

function objHeat(o) {
  let h = 0;
  for (let k = 0; k < o.cells.length; k++) if (o.cells[k].temp > h) h = o.cells[k].temp;
  return h;
}

function objectImpact(o, speed, hitMat) {
  if (o.icd > 0) return;
  o.icd = OBJ_ICD;
  o.flash = 10;
  if (objHeat(o) > 200) {
    const bx = Math.round(o.x),
      by = Math.round(o.y);
    const puffs = speed > 0.9 ? 3 : 1;
    for (let k = 0; k < puffs; k++) spawnNear(bx, by + 1, IMPACT_STEAM, 2);
  }
  if (typeof onObjectImpact === 'function') onObjectImpact(o, speed, hitMat);
}

function matUnder(o, nx, ny) {
  for (let k = 0; k < o.cells.length; k++) {
    const x = Math.floor(nx + o.cells[k].dx);
    const y = Math.floor(ny + o.cells[k].dy);
    if (!inBounds(x, y)) return EDGE_ID;
    const m = mat[y * W + x];
    if (BLOCKING[m]) return m;
  }
  return VOID_ID;
}

function moveObject(o) {
  const steps = Math.ceil((Math.abs(o.vx) + Math.abs(o.vy)) / 0.25) || 1;
  let sx = o.vx / steps,
    sy = o.vy / steps;

  for (let s = 0; s < steps; s++) {
    if (sx !== 0) {
      if (objPass(o, o.x + sx, o.y, sx > 0 ? 1 : -1, 0)) o.x += sx;
      else {
        const sp = Math.abs(o.vx);
        if (sp > OBJ_IMPACT) objectImpact(o, sp, matUnder(o, o.x + sx, o.y));
        o.vx = 0;
        sx = 0;
      }
    }
    if (sy !== 0) {
      if (objPass(o, o.x, o.y + sy, 0, sy > 0 ? 1 : -1)) o.y += sy;
      else {
        const sp2 = Math.abs(o.vy);
        if (sp2 > OBJ_IMPACT) objectImpact(o, sp2, matUnder(o, o.x, o.y + sy));
        o.vy = 0;
        sy = 0;
      }
    }
  }
}

function stepObjects(targetX, targetY) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
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

    for (let k = 0; k < o.cells.length; k++) {
      const c = o.cells[k];
      if (c.temp > 24) c.temp -= (c.temp - 22) * 0.0015;
    }

    if (!o.held) {
      const still = Math.abs(o.vx) < 0.02 && Math.abs(o.vy) < 0.02;
      const supported = objBlocked(o, o.x, o.y + 0.3);
      if (still && supported) {
        if (++o.rest > OBJ_REST) dropObject(o);
      } else o.rest = 0;
    }
  }
}

function shelveObject(o) {
  if (o === heldObject) heldObject = null;
  o.held = false;
  o.x = worldX(o.x);
  if (shelvedObjects.length >= SHELF_MAX) shelvedObjects.shift();
  shelvedObjects.push(o);
}

function unshelveObject(o, lx) {
  let y = o.y;
  const top = Math.max(0, y - OBJ_LIFT);
  while (y > top && objBlocked(o, lx, y)) y--;
  if (objBlocked(o, lx, y)) return false;
  o.x = lx;
  o.y = y;
  o.vx = 0;
  o.vy = 0;
  o.rest = 0;
  return true;
}

function shiftObjects(dx) {
  const inside = [];
  for (let k = 0; k < objects.length; k++) {
    const o = objects[k];
    o.x -= dx;
    if (o.x >= 0 && o.x < W) inside.push(o);
    else shelveObject(o);
  }
  const shelved = [];
  for (let k = 0; k < shelvedObjects.length; k++) {
    const o = shelvedObjects[k];
    const lx = localX(o.x);
    if (lx >= 0 && lx < W && unshelveObject(o, lx)) inside.push(o);
    else shelved.push(o);
  }
  shelvedObjects = shelved;
  objects = inside;
}

function resetObjects() {
  objects.length = 0;
  shelvedObjects.length = 0;
  heldObject = null;
}
