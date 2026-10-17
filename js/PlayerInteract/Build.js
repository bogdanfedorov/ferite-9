var BUILD_REPORTS = {
  removed: { text: 'msg.structRemoved', sound: 'removed' },
  nothing: { text: 'msg.nothingToRemove', sound: null },
  room: { text: 'msg.beltRoom', sound: 'denied' }
};

var buildId = null;
var buildShape = 'line';
var buildEven = false;

var buildFrom = null;
var buildTo = null;
var buildErase = false;

function regBuilding(spec) {
  spec.kind = 'building';
  spec.use = buildUse;
  spec.select = () => setBuildId(spec.id);
  spec.overlay = drawBuildPreview;
  spec.ghost = { size: 1 };
  return regPiece(spec);
}

function isBuilding(id) {
  return PIECES[id] !== undefined && PIECES[id].kind === 'building';
}

function activeBuilding() {
  return PIECES[buildId];
}

function shapesOfBuilding() {
  return activeBuilding().shapes;
}

function resetBuild() {
  buildEven = false;
  buildId = null;
  buildShape = 'line';
  endBuildDrag();
}

function setBuildId(id) {
  if (!isBuilding(id)) return;
  buildId = id;
  if (shapesOfBuilding().indexOf(buildShape) < 0) buildShape = shapesOfBuilding()[0];
}

function setBuildShape(shape) {
  if (shapesOfBuilding().indexOf(shape) < 0) return;
  buildShape = shape;
}

function cycleBuildShape() {
  const allowed = shapesOfBuilding();
  buildShape = allowed[(allowed.indexOf(buildShape) + 1) % allowed.length];
  return buildShape;
}

function startBuildDrag(wx, wy, erase) {
  buildFrom = [wx, wy];
  buildTo = buildFrom;
  buildErase = erase;
}

function endBuildDrag() {
  buildFrom = null;
  buildTo = null;
  buildErase = false;
}

function gridPoint(wx, wy) {
  return { x: Math.round(wx), y: Math.round(wy) };
}

function buildPlan(fromWorld, toWorld) {
  const from = gridPoint(fromWorld[0], fromWorld[1]);
  const to = cappedPoint(from, gridPoint(toWorld[0], toWorld[1]));
  if (buildErase) return { cells: shapeCells('rect', from, to), dx: 1, dy: 0 };
  const opt = { vertical: activeBuilding().vertical, even: buildEven };
  const cells = shapeCells(buildShape, from, to, opt);
  const heading = shapeHeading(cells);
  const size = activeBuilding().size || { w: 1, h: 1 };
  return { cells: thickenCells(cells, size), dx: heading.dx, dy: heading.dy };
}

function buildVerdict(plan) {
  const spec = activeBuilding();
  if (spec.max && plan.cells.length > spec.max) return 'big';
  if (!spec.fits(plan)) return 'room';
  return 'ok';
}

function clearOfFixed(plan) {
  for (let k = 0; k < plan.cells.length; k++) {
    const c = plan.cells[k];
    if (!inBounds(c.x, c.y) || FIXED[mat[c.y * W + c.x]]) return false;
  }
  return true;
}

function ownerAt(x, y) {
  if (!inBounds(x, y)) return null;
  for (let k = 0; k < PIECE_IDS.length; k++) {
    const piece = PIECES[PIECE_IDS[k]];
    if (piece.owns && piece.owns(x, y)) return piece;
  }
  return null;
}

function removableAt(x, y) {
  return ownerAt(x, y) !== null;
}

function eraseCells(cells) {
  let gone = 0;
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const owner = ownerAt(c.x, c.y);
    if (!owner) continue;
    if (owner.remove) owner.remove(c.x, c.y);
    setCell(c.x, c.y, VOID_ID);
    gone++;
  }
  return gone;
}

function finishBuild(fromWorld, toWorld) {
  const plan = buildPlan(fromWorld, toWorld);
  if (buildErase) return eraseCells(plan.cells) > 0 ? BUILD_REPORTS.removed : BUILD_REPORTS.nothing;
  const spec = activeBuilding();
  const verdict = buildVerdict(plan);
  if (verdict === 'big') return spec.big;
  if (verdict === 'room') return BUILD_REPORTS.room;
  spec.place(plan);
  return spec.done;
}

function reportBuild(report) {
  transmit(t(report.text), NOTICE);
  if (report.sound) play(report.sound);
}

function buildUse(wpt) {
  const mouse = input.mouse;
  buildEven = input.keys.shift;
  if (!buildFrom) {
    if (mouse.pressed) startBuildDrag(wpt[0], wpt[1], false);
    else if (mouse.rightPressed && activeBuilding().erasable) startBuildDrag(wpt[0], wpt[1], true);
    return;
  }
  if (buildErase ? mouse.right : mouse.left) {
    buildTo = wpt;
    return;
  }
  reportBuild(finishBuild(buildFrom, buildTo));
  endBuildDrag();
}

function drawErasePreview(cells) {
  const z = view.zoom;
  const first = cells[0],
    last = cells[cells.length - 1];
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    ctx.fillStyle = uiRgba('danger', removableAt(c.x, c.y) ? 0.5 : 0.14);
    ctx.fillRect(sx(c.x), sy(c.y), z, z);
  }
  ctx.strokeStyle = uiRgba('danger', 0.9);
  ctx.lineWidth = 1;
  ctx.strokeRect(
    sx(first.x) + 0.5,
    sy(first.y) + 0.5,
    (last.x - first.x + 1) * z - 1,
    (last.y - first.y + 1) * z - 1
  );
}

function drawBuildPreview() {
  if (!buildFrom || !buildTo) return;
  const plan = buildPlan(buildFrom, buildTo);
  if (!plan.cells.length) return;
  if (buildErase) {
    drawErasePreview(plan.cells);
    return;
  }

  const spec = activeBuilding();
  const tint = buildVerdict(plan) === 'ok' ? spec.tint.ok : spec.tint.bad;
  const z = view.zoom;
  ctx.fillStyle = uiRgba(tint, 0.22);
  ctx.strokeStyle = uiRgba(tint, 0.85);
  ctx.lineWidth = 1;

  for (let k = 0; k < plan.cells.length; k++) {
    const c = plan.cells[k];
    ctx.fillRect(sx(c.x), sy(c.y), z, z);
    ctx.strokeRect(sx(c.x) + 0.5, sy(c.y) + 0.5, z - 1, z - 1);
  }

  if (!spec.arrows) return;
  for (let k = 0; k < plan.cells.length; k++) {
    const c = plan.cells[k];
    if (c.x % ARROW_EVERY === 0) drawFlowArrow(c.x + 0.5, c.y + 0.5, plan.dx, plan.dy, uiRgba(tint, 0.9));
  }
}
