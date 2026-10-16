var SHAPE_MAX = 48;
var PAD_MAX = 96;
var BELT_TICK = 3;

var BELT_DECK = matId('belt');
var WALL_ID = matId('wall');

var SHAPE_NAMES = {
  line: 'line',
  rect: 'rect'
};

var BODIES = {
  belt: {
    shapes: [SHAPE_NAMES.line],
    vertical: false,
    miss: 'room',
    done: 'belt',
    tint: { ok: 'sand', bad: 'dangerSoft' },
    arrows: true,
    erasable: true,
    fits: (plan) => {
      for (let k = 0; k < plan.cells.length; k++) {
        const c = plan.cells[k];
        if (!inBounds(c.x, c.y) || !OPEN[mat[c.y * W + c.x]]) return false;
        if (!inBounds(c.x, c.y - 1) || RIGID[mat[(c.y - 1) * W + c.x]]) return false;
      }
      return true;
    }, 
    place: (plan) => {
      const code = beltCode(plan.dx, plan.dy);
      for (let k = 0; k < plan.cells.length; k++) {
        const c = plan.cells[k];
        setCell(c.x, c.y, BELT_DECK);
        beltCells.set(c.y * W + c.x, code);
      }
    },
  },
  wall: {
    shapes: [SHAPE_NAMES.line, SHAPE_NAMES.rect],
    vertical: true,
    miss: 'room',
    done: 'wall',
    tint: { ok: 'sand', bad: 'dangerSoft' },
    arrows: false,
    erasable: true,
    fits: clearOfFixed,
    place: (plan) => {
      for (let k = 0; k < plan.cells.length; k++) setCell(plan.cells[k].x, plan.cells[k].y, WALL_ID);
    },
  },
  pad: {
    shapes: [SHAPE_NAMES.rect],
    vertical: true,
    max: PAD_MAX,

    miss: 'room',
    done: 'pad',
    tint: { ok: 'aqua', bad: 'dangerSoft' },
    arrows: false,
    erasable: false,
    fits: clearOfFixed,
    place: (plan) => {
      const first = plan.cells[0],
        last = plan.cells[plan.cells.length - 1];
      setCargoPad({
        x: Math.min(first.x, last.x),
        y: Math.min(first.y, last.y),
        w: Math.abs(last.x - first.x) + 1,
        h: Math.abs(last.y - first.y) + 1
      });
    },
  }
};

var buildBody = 'belt';
var buildShape = SHAPE_NAMES.line;
var buildEven = false;

var beltCells = new Map();
var beltArrived = new Set();
var beltMoves = [];

var buildFrom = null;
var buildTo = null;
var buildAnchor = null;
var buildErase = false;

function resetBuild() {
  beltCells.clear();
  buildEven = false;
  buildBody = 'belt';
  buildShape = SHAPE_NAMES.line;
  endBuildDrag();
}

function activeBody() {
  return BODIES[buildBody];
}

function shapesOfBody() {
  return activeBody().shapes;
}

function setBuildBody(body) {
  if (!BODIES[body]) return;
  buildBody = body;
  if (shapesOfBody().indexOf(buildShape) < 0) buildShape = shapesOfBody()[0];
}

function setBuildShape(shape) {
  if (shapesOfBody().indexOf(shape) < 0) return;
  buildShape = shape;
}

function cycleBuildShape() {
  const allowed = shapesOfBody();
  buildShape = allowed[(allowed.indexOf(buildShape) + 1) % allowed.length];
  return buildShape;
}

function startBuildDrag(wx, wy, erase) {
  buildAnchor = { x: player.x, y: player.y };
  buildFrom = [wx, wy];
  buildTo = buildFrom;
  buildErase = erase;
}

function endBuildDrag() {
  buildFrom = null;
  buildTo = null;
  buildAnchor = null;
  buildErase = false;
}

function stepOf(n) {
  if (n === 0) return 0;
  return n > 0 ? 1 : -1;
}

function beltCode(dx, dy) {
  return (dx + 1) * 3 + (dy + 1);
}

function beltDx(code) {
  return Math.floor(code / 3) - 1;
}

function beltDy(code) {
  return (code % 3) - 1;
}

function gridPoint(wx, wy) {
  const p = clampToReach(wx, wy, buildAnchor);
  return { x: Math.round(p[0]), y: Math.round(p[1]) };
}

function cappedPoint(from, to) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  if (reach <= SHAPE_MAX) return to;
  const scale = SHAPE_MAX / reach;
  return { x: from.x + Math.round(dx * scale), y: from.y + Math.round(dy * scale) };
}

function evenPoint(from, to) {
  const side = Math.min(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return {
    x: from.x + stepOf(to.x - from.x) * side,
    y: from.y + stepOf(to.y - from.y) * side
  };
}

function snapLine(from, to, vertical) {
  const ax = Math.abs(to.x - from.x),
    ay = Math.abs(to.y - from.y);
  if (ay * 2 <= ax) return { x: to.x, y: from.y };
  if (vertical && ax * 2 <= ay) return { x: from.x, y: to.y };
  const side = Math.max(ax, ay);
  return {
    x: from.x + (to.x >= from.x ? side : -side),
    y: from.y + (to.y >= from.y ? side : -side)
  };
}

function lineBetween(from, to) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const cells = [];
  for (let k = 0; k <= steps; k++) {
    const along = steps === 0 ? 0 : k / steps;
    cells.push({ x: from.x + Math.round(dx * along), y: from.y + Math.round(dy * along) });
  }
  return cells;
}

function rectBetween(from, to) {
  const x0 = Math.min(from.x, to.x),
    x1 = Math.max(from.x, to.x);
  const y0 = Math.min(from.y, to.y),
    y1 = Math.max(from.y, to.y);
  const cells = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) cells.push({ x: x, y: y });
  }
  return cells;
}

function buildPlan(fromWorld, toWorld) {
  const from = gridPoint(fromWorld[0], fromWorld[1]);
  const to = cappedPoint(from, gridPoint(toWorld[0], toWorld[1]));
  if (buildErase) return { cells: rectBetween(from, to), dx: 0, dy: 0 };
  if (buildShape === 'rect') {
    return { cells: rectBetween(from, buildEven ? evenPoint(from, to) : to), dx: 1, dy: 0 };
  }
  const end = snapLine(from, to, activeBody().vertical);
  const dx = stepOf(end.x - from.x);
  if (dx === 0) return { cells: lineBetween(from, end), dx: 1, dy: 0 };
  return { cells: lineBetween(from, end), dx: dx, dy: stepOf(end.y - from.y) };
}

function buildVerdict(plan) {
  const body = activeBody();
  if (body.max && plan.cells.length > body.max) return 'big';
  if (!body.fits(plan)) return body.miss;
  return 'ok';
}

function clearOfFixed(plan) {
  for (let k = 0; k < plan.cells.length; k++) {
    const c = plan.cells[k];
    if (!inBounds(c.x, c.y) || FIXED[mat[c.y * W + c.x]]) return false;
  }
  return true;
}

function removableAt(x, y) {
  if (!inBounds(x, y)) return false;
  const m = mat[y * W + x];
  return m === BELT_DECK || m === WALL_ID;
}

function eraseCells(cells) {
  let gone = 0;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    if (!removableAt(c.x, c.y)) continue;
    const i = c.y * W + c.x;
    beltCells.delete(i);
    setCell(c.x, c.y, VOID_ID);
    gone++;
  }
  return gone;
}

function finishBuild(fromWorld, toWorld) {
  const plan = buildPlan(fromWorld, toWorld);
  buildAnchor = null;
  if (buildErase) return eraseCells(plan.cells) > 0 ? 'removed' : 'nothing';
  const verdict = buildVerdict(plan);
  if (verdict !== 'ok') return verdict;
  activeBody().place(plan);
  return activeBody().done;
}

function planBeltMoves() {
  beltMoves.length = 0;
  for (const [i, code] of beltCells) {
    if (mat[i] !== BELT_DECK) {
      beltCells.delete(i);
      continue;
    }
    const x = i % W,
      y = (i / W) | 0;
    const sx = x,
      sy = y - 1;
    const nx = sx + beltDx(code),
      ny = sy + beltDy(code);
    if (!inBounds(sx, sy) || !inBounds(nx, ny)) continue;
    beltMoves.push(sy * W + sx, ny * W + nx);
  }
}

function applyBeltMoves() {
  beltArrived.clear();
  for (let k = 0; k < beltMoves.length; k += 2) {
    const i = beltMoves[k],
      j = beltMoves[k + 1];
    const m = mat[i];
    if (!MOVABLE[m] || beltArrived.has(i) || !OPEN[mat[j]]) continue;
    const tm = mat[j];
    const hot = temp[i],
      hotT = temp[j];
    setCellHot(j % W, (j / W) | 0, m, hot);
    if (STATE[tm] === MT.GAS) setCellHot(i % W, (i / W) | 0, tm, hotT);
    else setCell(i % W, (i / W) | 0, VOID_ID);
    beltArrived.add(j);
  }
}

function tickBelts() {
  planBeltMoves();
  applyBeltMoves();
}

function tickBuild(frame) {
  if (beltCells.size && frame % BELT_TICK === 0) tickBelts();
}
