var PAD_WIDTH = SIZE.m(0.4);
var PAD_THICK = SIZE.m(0.03);
var PILE_WIDTH = SIZE.m(0.02);
var PILE_SPACING = SIZE.m(0.1);
var PILE_MAX = SIZE.m(0.3);
var CARGO_BOX_H = SIZE.m(0.2);
var PAD_ID = matId('pad');

function pileOffsets() {
  const out = [];
  for (let o = 0; o + PILE_WIDTH <= PAD_WIDTH; o += PILE_SPACING) out.push(o);
  const last = PAD_WIDTH - PILE_WIDTH;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

var PILE_OFFSETS = pileOffsets();

function supportAt(x, y) {
  return inBounds(x, y) && BLOCKING[mat[y * W + x]] === 1;
}

function supportInRow(x0, w, y) {
  for (let x = x0; x < x0 + w; x++) if (supportAt(x, y)) return true;
  return false;
}

function addRect(cells, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) cells.push({ x: x, y: y });
  }
}

function settleBottom(left, row) {
  let bottom = row;
  while (bottom + 1 < H && !supportInRow(left, PAD_WIDTH, bottom + 1)) bottom++;
  return bottom;
}

function pileGap(x0, y0) {
  let gap = 0;
  while (y0 + gap < H && !supportInRow(x0, PILE_WIDTH, y0 + gap)) gap++;
  return gap;
}

function padPlan(from) {
  const left = from.x - ((PAD_WIDTH - 1) >> 1);
  const bottom = settleBottom(left, from.y);
  const top = bottom - PAD_THICK + 1;
  const cells = [];
  addRect(cells, left, top, PAD_WIDTH, PAD_THICK);
  let high = false;
  for (let k = 0; k < PILE_OFFSETS.length; k++) {
    const gap = pileGap(left + PILE_OFFSETS[k], bottom + 1);
    if (gap > PILE_MAX || bottom + 1 + gap >= H) high = true;
    addRect(cells, left + PILE_OFFSETS[k], bottom + 1, PILE_WIDTH, gap);
  }
  return { cells: cells, dx: 1, dy: 0, left: left, top: top, high: high };
}

function platformOpen(left, top) {
  for (let y = top; y < top + PAD_THICK; y++) {
    for (let x = left; x < left + PAD_WIDTH; x++) {
      if (!inBounds(x, y) || !OPEN[mat[y * W + x]]) return false;
    }
  }
  return true;
}

function skyClear(left, below) {
  for (let y = 0; y < below; y++) {
    for (let x = left; x < left + PAD_WIDTH; x++) if (RIGID[mat[y * W + x]]) return false;
  }
  return true;
}

function padVerdict(plan) {
  if (cargoBox) return 'exists';
  if (!platformOpen(plan.left, plan.top)) return 'room';
  if (!skyClear(plan.left, plan.top)) return 'sky';
  if (plan.high) return 'high';
  return 'ok';
}

function padPlace(plan) {
  for (let k = 0; k < plan.cells.length; k++) setCell(plan.cells[k].x, plan.cells[k].y, PAD_ID);
  setCargoBox({
    x: worldX(plan.left),
    y: plan.top - CARGO_BOX_H,
    w: PAD_WIDTH,
    h: CARGO_BOX_H
  });
}

function padRemove() {
  eraseMaterial(PAD_ID);
  setCargoBox(null);
}

function padState() {
  const box = cargoBoxLocal();
  if (!box) return 'none';
  if (box.x < 0 || box.x + box.w > W) return 'away';
  return skyClear(box.x, box.y) ? 'ready' : 'blocked';
}

function drawCargoBox() {
  const box = cargoBoxLocal();
  if (!box) return;
  const z = view.zoom;
  const px = sx(box.x),
    py = sy(box.y);
  const pw = box.w * z,
    ph = box.h * z;
  if (px + pw < 0 || py + ph < 0 || px > cv.width || py > cv.height) return;

  ctx.save();
  ctx.globalAlpha = 0.6 + Math.sin(simFrame * 0.04) * 0.15;
  ctx.strokeStyle = uiRgba('pad', 0.95);
  ctx.lineWidth = 1;
  ctx.setLineDash([Math.max(3, z * 0.6), Math.max(3, z * 0.5)]);
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.setLineDash([]);
  ctx.restore();
}

regBuilding({
  id: 'pad',
  hud: { name: 'tool.pad', desc: 'tool.pad.desc', icon: '▭' },
  sound: 'pickTool',
  shapes: ['rect'],
  vertical: true,
  tint: { ok: 'pad', bad: 'danger' },
  arrows: false,
  erasable: true,
  done: { text: 'msg.padDone', sound: 'built' },
  plan: padPlan,
  verdict: padVerdict,
  place: padPlace,
  owns: (x, y) => mat[y * W + x] === PAD_ID,
  remove: padRemove,
  drawWorld: drawCargoBox
});
