var SHAPE_MAX = 48;
var BELT_MIN = 3;
var BELT_TICK = 3;
var BELT_THICK = 3;
var WALL_THICK = 1;

var BELT_DECK = matId('belt');
var WALL_ID = matId('wall');

var TRACES = {
  point: pointAt,
  line: lineBetween,
  angled: lineBetween,
  rect: rectBetween
};

var BODIES = {
  belt: {
    aims: { line: flatPoint, angled: evenPoint },
    thick: BELT_THICK,
    min: BELT_MIN,
    fits: beltFits,
    miss: 'room',
    place: placeBelt,
    done: 'belt',
    tint: { ok: 'sand', bad: 'dangerSoft' },
    arrows: true
  },
  wall: {
    aims: { point: freePoint, line: levelPoint, angled: shiftPoint, rect: shiftPoint },
    thick: WALL_THICK,
    min: 1,
    fits: wallFits,
    miss: 'room',
    place: placeWall,
    done: 'wall',
    tint: { ok: 'sand', bad: 'dangerSoft' },
    arrows: false
  },
  erase: {
    aims: { point: freePoint, line: levelPoint, rect: shiftPoint },
    thick: 1,
    min: 1,
    fits: hasRemovable,
    miss: 'nothing',
    place: eraseCells,
    done: 'removed',
    tint: { ok: 'rust', bad: 'rust' },
    arrows: false
  }
};

var buildBody = 'belt';
var buildShape = 'line';
var buildEven = false;

var belts = [];
var beltByCell = new Map();
var builderUnlocked = false;

var buildFrom = null;
var buildTo = null;
var buildAnchor = null;

function resetBuild() {
  belts.length = 0;
  beltByCell.clear();
  builderUnlocked = false;
  buildEven = false;
  buildBody = 'belt';
  buildShape = 'line';
  endBuildDrag();
}

function activeBody() { return BODIES[buildBody]; }

function shapesOfBody() { return Object.keys(activeBody().aims); }

function setBuildBody(body) {
  if (!BODIES[body]) return;
  buildBody = body;
  if (!activeBody().aims[buildShape]) buildShape = shapesOfBody()[0];
}

function setBuildShape(shape) {
  if (!activeBody().aims[shape]) return;
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

function freePoint(from, to) {
  return to;
}

function flatPoint(from, to) {
  return { x: to.x, y: from.y };
}

function levelPoint(from, to) {
  if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) return flatPoint(from, to);
  return { x: from.x, y: to.y };
}

function evenPoint(from, to) {
  var side = Math.min(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return {
    x: from.x + stepOf(to.x - from.x) * side,
    y: from.y + stepOf(to.y - from.y) * side
  };
}

function shiftPoint(from, to, even) {
  return even ? evenPoint(from, to) : to;
}

function pointAt(from, to) {
  return [{ x: to.x, y: to.y }];
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

function buildCells(fromWorld, toWorld) {
  var from = gridPoint(fromWorld[0], fromWorld[1]);
  var to = cappedPoint(from, gridPoint(toWorld[0], toWorld[1]));
  var aim = activeBody().aims[buildShape];
  return TRACES[buildShape](from, aim(from, to, buildEven));
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
  return thicken(cells, activeBody().thick);
}

function buildVerdict(cells) {
  var body = activeBody();
  if (cells.length < body.min) return 'short';
  if (!body.fits(cells)) return body.miss;
  return 'ok';
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
  var first = surface[0], last = surface[surface.length - 1];
  var belt = { cells: surface, dx: stepOf(last.x - first.x), dy: stepOf(last.y - first.y) };
  for (var k = 0; k < body.length; k++) {
    setCell(body[k].x, body[k].y, BELT_DECK);
    beltByCell.set(body[k].y * W + body[k].x, belt);
  }
  belts.push(belt);
  return belt;
}

function placeWall(cells) {
  for (var k = 0; k < cells.length; k++) setCell(cells[k].x, cells[k].y, WALL_ID);
}

function beltAt(x, y) {
  if (!inBounds(x, y)) return null;
  return beltByCell.get(y * W + x) || null;
}

function removeBelt(belt) {
  var idx = belts.indexOf(belt);
  if (idx < 0) return false;
  belts.splice(idx, 1);
  var body = thicken(belt.cells, BELT_THICK);
  for (var k = 0; k < body.length; k++) {
    var c = body[k];
    var i = c.y * W + c.x;
    if (beltByCell.get(i) === belt) beltByCell.delete(i);
    if (beltCellAt(c.x, c.y)) setCell(c.x, c.y, VOID_ID);
  }
  return true;
}

function wallCellAt(x, y) {
  return inBounds(x, y) && mat[y * W + x] === WALL_ID;
}

function removeWallCell(x, y) {
  if (!wallCellAt(x, y)) return false;
  setCell(x, y, VOID_ID);
  return true;
}

function hasRemovable(cells) {
  for (var k = 0; k < cells.length; k++) {
    var c = cells[k];
    if (beltAt(c.x, c.y) || wallCellAt(c.x, c.y)) return true;
  }
  return false;
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
  var verdict = buildVerdict(cells);
  if (verdict !== 'ok') return verdict;
  activeBody().place(cells);
  return activeBody().done;
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
