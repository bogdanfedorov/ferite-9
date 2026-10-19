var BELT_DECK = matId('belt');

var beltCells = new Map();
var beltArrived = new Set();
var beltMoves = [];

function beltCode(dx, dy) {
  return (dx + 1) * 3 + (dy + 1);
}

function beltDx(code) {
  return Math.floor(code / 3) - 1;
}

function beltDy(code) {
  return (code % 3) - 1;
}

function beltFits(plan) {
  for (let k = 0; k < plan.cells.length; k++) {
    const c = plan.cells[k];
    if (!inBounds(c.x, c.y) || !OPEN[mat[c.y * W + c.x]]) return false;
    if (!inBounds(c.x, c.y - 1) || RIGID[mat[(c.y - 1) * W + c.x]]) return false;
  }
  return true;
}

function beltPlace(plan) {
  const code = beltCode(plan.dx, plan.dy);
  for (let k = 0; k < plan.cells.length; k++) {
    const c = plan.cells[k];
    setCell(c.x, c.y, BELT_DECK);
    markEdited(c.x, c.y);
    beltCells.set(c.y * W + c.x, code);
  }
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

function tickBelts(frame) {
  if (!beltCells.size || frame % pieceStats('belt').interval !== 0) return;
  planBeltMoves();
  applyBeltMoves();
}

function shiftBelts(dx, dy) {
  const moved = new Map();
  for (const [i, code] of beltCells) {
    const x = (i % W) - dx,
      y = ((i / W) | 0) - dy;
    if (x >= 0 && x < W && y >= 0 && y < H) moved.set(y * W + x, code);
  }
  beltCells = moved;
}

function beltsOutColumn(lx) {
  const S = CHUNK_SIZE;
  const out = new Map();
  for (const [i, code] of beltCells) {
    const x = (i % W) - lx,
      y = (i / W) | 0;
    if (x < 0 || x >= S) continue;
    const row = y >> CHUNK_SHIFT;
    if (!out.has(row)) out.set(row, new Map());
    out.get(row).set((y - row * S) * S + x, code);
    beltCells.delete(i);
  }
  return out;
}

function beltsOutRow(ly) {
  const S = CHUNK_SIZE;
  const out = new Map();
  for (const [i, code] of beltCells) {
    const x = i % W,
      y = ((i / W) | 0) - ly;
    if (y < 0 || y >= S) continue;
    const col = x >> CHUNK_SHIFT;
    if (!out.has(col)) out.set(col, new Map());
    out.get(col).set(y * S + (x - col * S), code);
    beltCells.delete(i);
  }
  return out;
}

function beltsIn(cells, lx, ly) {
  const S = CHUNK_SIZE;
  for (const [k, code] of cells) {
    beltCells.set((ly + ((k / S) | 0)) * W + lx + (k % S), code);
  }
}

var ARROW_EVERY = 3;

function drawBelts() {
  const z = view.zoom;
  if (z < 2) return;
  for (const [i, code] of beltCells) {
    const x = i % W,
      y = (i / W) | 0;
    const px = sx(x),
      py = sy(y);
    if (px + z < 0 || py + z < 0 || px > cv.width || py > cv.height) continue;
    ctx.fillStyle = uiRgba('sandLit', 0.55);
    ctx.fillRect(px, py, z, Math.max(1, z * 0.3));
    if (x % ARROW_EVERY === 0) {
      drawFlowArrow(x + 0.5, y + 0.5, beltDx(code), beltDy(code), uiRgba('sand', 0.9));
    }
  }
}

regBuilding({
  id: 'belt',
  size: { w: SIZE.m(0.25), h: SIZE.m(0.1) },
  hud: { name: 'tool.belt', desc: 'tool.belt.desc', icon: '»' },
  cost: 240,
  sound: 'pickTool',
  levels: [{ interval: 3 }, { cost: 360, interval: 2 }, { cost: 900, interval: 1 }],
  shapes: ['line'],
  vertical: false,
  tint: { ok: 'sand', bad: 'dangerSoft' },
  arrows: true,
  erasable: true,
  done: { text: 'msg.beltDone', sound: 'built' },
  fits: beltFits,
  place: beltPlace,
  owns: (x, y) => mat[y * W + x] === BELT_DECK,
  remove: (x, y) => {
    beltCells.delete(y * W + x);
  },
  reset: () => {
    beltCells.clear();
  },
  tick: tickBelts,
  drawWorld: drawBelts
});
