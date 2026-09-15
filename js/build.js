var BELT_MIN = 3;
var BELT_MAX = 48;
var WALL_MAX = 48;
var BELT_TICK = 3;
var BELT_DECK = matId('belt');
var WALL_ID = matId('wall');

var BUILD_SHAPES = ['belt', 'wallLine', 'wallRect'];
var buildShape = 'belt';

var belts = [];
var beltUnlocked = false;

var buildFrom = null;
var buildTo = null;
var buildAnchor = null;

function resetBuild() {
  belts.length = 0;
  beltUnlocked = false;
  buildFrom = null;
  buildTo = null;
  buildAnchor = null;
  buildShape = 'belt';
}

function cycleBuildShape() {
  var i = BUILD_SHAPES.indexOf(buildShape);
  buildShape = BUILD_SHAPES[(i + 1) % BUILD_SHAPES.length];
  return buildShape;
}

function startBuildDrag(wx, wy) {
  buildAnchor = { x: player.x, y: player.y };
  buildFrom = [wx, wy];
  buildTo = buildFrom;
}

function clampBuildPoint(x, y) {
  var p = clampToReach(x, y, buildAnchor);
  return [Math.round(p[0]), Math.round(p[1])];
}

function snapBelt(ax, ay, bx, by) {
  var pa = clampBuildPoint(ax, ay), pb = clampBuildPoint(bx, by);
  ax = pa[0]; ay = pa[1]; bx = pb[0]; by = pb[1];
  var ddx = bx - ax, ddy = by - ay;
  var len = Math.abs(ddx);
  if (Math.abs(ddy) > len) len = Math.abs(ddy);
  if (len < 1) return null;
  if (len > BELT_MAX) len = BELT_MAX;

  var sx = ddx === 0 ? 0 : (ddx > 0 ? 1 : -1);
  var sy = 0;
  if (Math.abs(ddy) > Math.abs(ddx) * 0.45) sy = ddy > 0 ? 1 : -1;
  if (sx === 0) return null;

  var cells = [];
  for (var k = 0; k <= len; k++) cells.push({ x: ax + sx * k, y: ay + sy * k });
  return { cells: cells, dx: sx, dy: sy };
}

function snapWallLine(ax, ay, bx, by) {
  var pa = clampBuildPoint(ax, ay), pb = clampBuildPoint(bx, by);
  var x0 = pa[0], y0 = pa[1], x1 = pb[0], y1 = pb[1];
  var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  var err = dx + dy, x = x0, y = y0;
  var cells = [];
  while (cells.length <= WALL_MAX) {
    cells.push({ x: x, y: y });
    if (x === x1 && y === y1) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return { cells: cells };
}

function snapWallRect(ax, ay, bx, by) {
  var pa = clampBuildPoint(ax, ay), pb = clampBuildPoint(bx, by);
  var x0 = Math.min(pa[0], pb[0]), x1 = Math.max(pa[0], pb[0]);
  var y0 = Math.min(pa[1], pb[1]), y1 = Math.max(pa[1], pb[1]);
  if (x1 - x0 > WALL_MAX) x1 = x0 + WALL_MAX;
  if (y1 - y0 > WALL_MAX) y1 = y0 + WALL_MAX;
  var cells = [];
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) cells.push({ x: x, y: y });
  }
  return { cells: cells };
}

function beltCellAt(x, y) {
  return inBounds(x, y) && GRIPS[mat[y * W + x]] === 1;
}

function beltFits(shape) {
  for (var k = 0; k < shape.cells.length; k++) {
    var c = shape.cells[k];
    if (!inBounds(c.x, c.y) || !inBounds(c.x, c.y - 1)) return false;
    if (!OPEN[mat[c.y * W + c.x]]) return false;
    if (RIGID[mat[(c.y - 1) * W + c.x]]) return false;
  }
  return true;
}

function wallFits(shape) {
  for (var k = 0; k < shape.cells.length; k++) {
    var c = shape.cells[k];
    if (!inBounds(c.x, c.y) || FIXED[mat[c.y * W + c.x]]) return false;
  }
  return true;
}

function placeBelt(shape) {
  var belt = { cells: shape.cells, dx: shape.dx, dy: shape.dy };
  for (var k = 0; k < shape.cells.length; k++) {
    var c = shape.cells[k];
    setCell(c.x, c.y, BELT_DECK);
  }
  belts.push(belt);
  return belt;
}

function placeWall(shape) {
  for (var k = 0; k < shape.cells.length; k++) {
    var c = shape.cells[k];
    setCell(c.x, c.y, WALL_ID);
  }
}

function dismantleBelt(belt) {
  var idx = belts.indexOf(belt);
  if (idx < 0) return false;
  belts.splice(idx, 1);
  for (var k = 0; k < belt.cells.length; k++) {
    var c = belt.cells[k];
    if (beltCellAt(c.x, c.y)) setCell(c.x, c.y, VOID_ID);
  }
  return true;
}

function dismantleWallAt(x, y) {
  if (!inBounds(x, y) || mat[y * W + x] !== WALL_ID) return false;
  setCell(x, y, VOID_ID);
  return true;
}

function beltUnder(x, y) {
  for (var b = 0; b < belts.length; b++) {
    var cs = belts[b].cells;
    for (var k = 0; k < cs.length; k++) if (cs[k].x === x && cs[k].y === y) return belts[b];
  }
  return null;
}

function removeStructureAt(x, y) {
  var built = beltUnder(x, y);
  if (built) { dismantleBelt(built); return true; }
  return dismantleWallAt(x, y);
}

function finishBuild(a, b) {
  var pa = clampBuildPoint(a[0], a[1]), pb = clampBuildPoint(b[0], b[1]);
  if (pa[0] === pb[0] && pa[1] === pb[1]) {
    buildAnchor = null;
    return removeStructureAt(pa[0], pa[1]) ? 'removed' : 'short';
  }

  var shape = buildShape === 'belt' ? snapBelt(a[0], a[1], b[0], b[1])
    : buildShape === 'wallLine' ? snapWallLine(a[0], a[1], b[0], b[1])
      : snapWallRect(a[0], a[1], b[0], b[1]);
  buildAnchor = null;
  var minCells = buildShape === 'belt' ? BELT_MIN : 2;
  if (!shape || shape.cells.length < minCells) return 'short';

  var fits = buildShape === 'belt' ? beltFits(shape) : wallFits(shape);
  if (!fits) return 'room';

  if (buildShape === 'belt') placeBelt(shape); else placeWall(shape);
  return 'built';
}

function tickBelts() {
  for (var b = 0; b < belts.length; b++) {
    var belt = belts[b];
    var cs = belt.cells;
    var back = belt.dx > 0;
    var k = back ? cs.length - 1 : 0;
    var end = back ? -1 : cs.length;
    var st = back ? -1 : 1;

    for (; k !== end; k += st) {
      var c = cs[k];
      if (!beltCellAt(c.x, c.y)) continue;
      var sx = c.x, sy = c.y - 1;
      if (!inBounds(sx, sy)) continue;
      var i = sy * W + sx;
      var m = mat[i];
      if (!MOVABLE[m]) continue;

      var nx = sx + belt.dx, ny = sy + belt.dy;
      if (!inBounds(nx, ny)) continue;
      var j = ny * W + nx;
      var tm = mat[j];
      if (!OPEN[tm]) continue;

      var hot = temp[i], hotT = temp[j];
      setCellHot(nx, ny, m, hot);
      if (STATE[tm] === MT.GAS) setCellHot(sx, sy, tm, hotT);
      else setCell(sx, sy, VOID_ID);
    }
  }
}

function tickBuild(frame) {
  if (belts.length && frame % BELT_TICK === 0) tickBelts();
}
