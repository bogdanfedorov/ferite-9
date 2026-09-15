var SHAPE_MAX = 48;
var BELT_MIN = 3;
var BELT_TICK = 3;
var BELT_THICK = 3;
var WALL_THICK = 1;

var BELT_DECK = matId('belt');
var WALL_ID = matId('wall');

var BODY_SHAPES = {
  belt: ['line', 'angled'],
  wall: ['point', 'line', 'angled', 'rect'],
  erase: ['point', 'line', 'rect']
};

var buildBody = 'belt';
var buildShape = 'line';
var buildEven = false;

var belts = [];
var beltUnlocked = false;

var buildFrom = null;
var buildTo = null;
var buildAnchor = null;

function resetBuild() {
  belts.length = 0;
  beltUnlocked = false;
  buildEven = false;
  buildBody = 'belt';
  buildShape = 'line';
  endBuildDrag();
}

function shapesOfBody() { return BODY_SHAPES[buildBody]; }

function setBuildBody(body) {
  if (!BODY_SHAPES[body]) return;
  buildBody = body;
  if (shapesOfBody().indexOf(buildShape) < 0) buildShape = shapesOfBody()[0];
}

function setBuildShape(shape) {
  if (shapesOfBody().indexOf(shape) < 0) return;
  buildShape = shape;
}

function cycleBuildShape() {
  var allowed = shapesOfBody();
  buildShape = allowed[(allowed.indexOf(buildShape) + 1) % allowed.length];
  return buildShape;
}

function startBuildDrag(wx, wy) {
  buildAnchor = { x: player.x, y: player.y };
  buildFrom = [wx, wy];
  buildTo = buildFrom;
}

function endBuildDrag() {
  buildFrom = null;
  buildTo = null;
  buildAnchor = null;
}

function stepOf(n) {
  if (n === 0) return 0;
  return n > 0 ? 1 : -1;
}

function gridPoint(wx, wy) {
  var p = clampToReach(wx, wy, buildAnchor);
  return { x: Math.round(p[0]), y: Math.round(p[1]) };
}

function cappedPoint(from, to) {
  var dx = to.x - from.x, dy = to.y - from.y;
  var reach = Math.max(Math.abs(dx), Math.abs(dy));
  if (reach <= SHAPE_MAX) return to;
  var scale = SHAPE_MAX / reach;
  return { x: from.x + Math.round(dx * scale), y: from.y + Math.round(dy * scale) };
}

function levelPoint(from, to) {
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) return { x: to.x, y: from.y };
  return { x: from.x, y: to.y };
}

function evenPoint(from, to) {
  var side = Math.min(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return {
    x: from.x + stepOf(to.x - from.x) * side,
    y: from.y + stepOf(to.y - from.y) * side
  };
}

function lineBetween(from, to) {
  var dx = to.x - from.x, dy = to.y - from.y;
  var steps = Math.max(Math.abs(dx), Math.abs(dy));
  var cells = [];
  for (var k = 0; k <= steps; k++) {
    var along = steps === 0 ? 0 : k / steps;
    cells.push({ x: from.x + Math.round(dx * along), y: from.y + Math.round(dy * along) });
  }
  return cells;
}

function rectBetween(from, to) {
  var x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x);
  var y0 = Math.min(from.y, to.y), y1 = Math.max(from.y, to.y);
  var cells = [];
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) cells.push({ x: x, y: y });
  }
  return cells;
}

function shapeCells(shape, from, to, even) {
  if (shape === 'point') return [{ x: to.x, y: to.y }];
  if (shape === 'line') return lineBetween(from, levelPoint(from, to));
  if (shape === 'angled') return lineBetween(from, even ? evenPoint(from, to) : to);
  return rectBetween(from, even ? evenPoint(from, to) : to);
}

function beltAim(from, to) {
  if (buildShape === 'angled') return evenPoint(from, to);
  return { x: to.x, y: from.y };
}

function buildCells(fromWorld, toWorld) {
  var from = gridPoint(fromWorld[0], fromWorld[1]);
  var to = cappedPoint(from, gridPoint(toWorld[0], toWorld[1]));
  if (buildBody === 'belt') return lineBetween(from, beltAim(from, to));
  return shapeCells(buildShape, from, to, buildEven);
}

function thicken(cells, thickness) {
  if (thickness === 1) return cells;
  var out = [];
  for (var k = 0; k < cells.length; k++) {
    for (var down = 0; down < thickness; down++) {
      out.push({ x: cells[k].x, y: cells[k].y + down });
    }
  }
  return out;
}

function bodyCells(cells) {
  return thicken(cells, buildBody === 'belt' ? BELT_THICK : WALL_THICK);
}

function beltCellAt(x, y) {
  return inBounds(x, y) && GRIPS[mat[y * W + x]] === 1;
}

function beltFits(surface) {
  var body = thicken(surface, BELT_THICK);
  var k, c;
  for (k = 0; k < body.length; k++) {
    c = body[k];
    if (!inBounds(c.x, c.y) || !OPEN[mat[c.y * W + c.x]]) return false;
  }
  for (k = 0; k < surface.length; k++) {
    c = surface[k];
    if (!inBounds(c.x, c.y - 1) || RIGID[mat[(c.y - 1) * W + c.x]]) return false;
  }
  return true;
}

function wallFits(cells) {
  for (var k = 0; k < cells.length; k++) {
    var c = cells[k];
    if (!inBounds(c.x, c.y) || FIXED[mat[c.y * W + c.x]]) return false;
  }
  return true;
}

function placeBelt(surface) {
  var body = thicken(surface, BELT_THICK);
  for (var k = 0; k < body.length; k++) setCell(body[k].x, body[k].y, BELT_DECK);
  var first = surface[0], last = surface[surface.length - 1];
  var belt = { cells: surface, dx: stepOf(last.x - first.x), dy: stepOf(last.y - first.y) };
  belts.push(belt);
  return belt;
}

function placeWall(cells) {
  for (var k = 0; k < cells.length; k++) setCell(cells[k].x, cells[k].y, WALL_ID);
}

function beltAt(x, y) {
  for (var b = 0; b < belts.length; b++) {
    var cs = belts[b].cells;
    for (var k = 0; k < cs.length; k++) {
      if (cs[k].x === x && y >= cs[k].y && y < cs[k].y + BELT_THICK) return belts[b];
    }
  }
  return null;
}

function removeBelt(belt) {
  var idx = belts.indexOf(belt);
  if (idx < 0) return false;
  belts.splice(idx, 1);
  var body = thicken(belt.cells, BELT_THICK);
  for (var k = 0; k < body.length; k++) {
    var c = body[k];
    if (beltCellAt(c.x, c.y)) setCell(c.x, c.y, VOID_ID);
  }
  return true;
}

function removeWallCell(x, y) {
  if (!inBounds(x, y) || mat[y * W + x] !== WALL_ID) return false;
  setCell(x, y, VOID_ID);
  return true;
}

function eraseCells(cells) {
  var gone = 0;
  for (var k = 0; k < cells.length; k++) {
    var c = cells[k];
    var belt = beltAt(c.x, c.y);
    if (belt) { removeBelt(belt); gone++; continue; }
    if (removeWallCell(c.x, c.y)) gone++;
  }
  return gone;
}

function finishBuild(fromWorld, toWorld) {
  var cells = buildCells(fromWorld, toWorld);
  buildAnchor = null;

  if (buildBody === 'erase') return eraseCells(cells) ? 'removed' : 'nothing';

  if (buildBody === 'belt') {
    if (cells.length < BELT_MIN) return 'short';
    if (!beltFits(cells)) return 'room';
    placeBelt(cells);
    return 'built';
  }

  if (!wallFits(cells)) return 'room';
  placeWall(cells);
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
