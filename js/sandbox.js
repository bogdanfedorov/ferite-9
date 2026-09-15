var sandbox = { on: false, bins: [] };

var ROOM_TEMP = 22;
var ROOM_SKY = 0.62;
var ROOM_BIN_W = 8;
var ROOM_BIN_H = 10;
var ROOM_BIN_GAP = 2;
var ROOM_LABEL_CELLS = 1.15;
var ROOM_LABEL_PAD = 2;
var ROOM_MARGIN = 6;
var ROOM_PAD_W = 8;
var ROOM_PAD_H = 3;
var ROOM_APRON = 26;
var ROOM_REFILL_EVERY = 12;
var ROOM_STABLE_MARGIN = 20;
var ROOM_BTN_W = 4;
var ROOM_BTN_H = 3;
var ROOM_BTN_GAP = 4;

function roomStock() {
  var out = [];
  for (var i = 0; i < MAT_COUNT; i++) {
    if (ISVOID[i] || i === EDGE_ID) continue;
    out.push(i);
  }
  return out;
}

function roomLabelWidth(id) {
  var key = MATS[id].labelKey;
  var longest = MATS[id].name.length;
  for (var code in LANGS) {
    var v = LANGS[code][key];
    if (typeof v === 'string' && v.length > longest) longest = v.length;
  }
  return Math.ceil(longest * ROOM_LABEL_CELLS) + ROOM_LABEL_PAD;
}

function roomBinWidths(stock, room) {
  var wide = [], span = 0, i;
  for (i = 0; i < stock.length; i++) {
    var w = roomLabelWidth(stock[i]);
    if (w < ROOM_BIN_W) w = ROOM_BIN_W;
    wide.push(w);
    span += w + ROOM_BIN_GAP;
  }
  span -= ROOM_BIN_GAP;
  if (span <= room) return wide;

  var k = room / span;
  span = 0;
  for (i = 0; i < wide.length; i++) {
    wide[i] = Math.max(ROOM_BIN_W, Math.floor(wide[i] * k));
    span += wide[i] + ROOM_BIN_GAP;
  }
  return wide;
}

function roomFill(x0, y0, x1, y1, m) {
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      if (!inBounds(x, y)) continue;
      var i = y * W + x;
      mat[i] = m;
      life[i] = LIFE_RND[m] ? LIFE_BASE[m] + rndInt(LIFE_RND[m]) : LIFE_BASE[m];
    }
  }
}

function roomBin(x, floorY, m, w) {
  var wall = EDGE_ID;
  var top = floorY - ROOM_BIN_H;
  roomFill(x - 1, top, x - 1, floorY, wall);
  roomFill(x + w, top, x + w, floorY, wall);
  roomFill(x, floorY, x + w - 1, floorY, wall);
  if (OPEN[m]) roomFill(x, top, x + w - 1, top, wall);
  roomFill(x, top + 1, x + w - 1, floorY - 1, m);
  sandbox.bins.push({ id: m, x: x, w: w, top: top });
}

function roomBinBox(b) {
  return { x0: b.x, x1: b.x + b.w - 1, y0: b.top + 1, y1: b.top + ROOM_BIN_H - 1 };
}

function roomButtonRect(b) {
  var x0 = b.x + ((b.w - ROOM_BTN_W) >> 1);
  var y0 = b.top - ROOM_BTN_GAP - ROOM_BTN_H;
  return { x0: x0, y0: y0, x1: x0 + ROOM_BTN_W, y1: y0 + ROOM_BTN_H };
}

function roomLabelY() {
  return sandbox.bins.length ? sandbox.bins[0].top - 1 : 0;
}

function roomButtonAt(wx, wy) {
  if (!sandbox.on) return null;
  for (var i = 0; i < sandbox.bins.length; i++) {
    var r = roomButtonRect(sandbox.bins[i]);
    if (wx >= r.x0 && wx < r.x1 && wy >= r.y0 && wy < r.y1) return sandbox.bins[i];
  }
  return null;
}

function roomKeepsClear(x, y) {
  var half = player.w / 2 + 1, tall = player.h / 2 + 1;
  return x > player.x - half && x < player.x + half
    && y > player.y - tall && y < player.y + tall;
}

function roomStockLeft(b, box) {
  for (var y = box.y0; y <= box.y1; y++) {
    for (var x = box.x0; x <= box.x1; x++) {
      if (inBounds(x, y) && mat[y * W + x] === b.id) return true;
    }
  }
  return false;
}

function roomStableTemp(id) {
  var warm = EMITS[id] > 0 ? EMITS[id] : ROOM_TEMP;
  var floor = COLD_T[id] > 0 ? COLD_T[id] + ROOM_STABLE_MARGIN : 0;
  return warm > floor ? warm : floor;
}

function roomRefill(b, wipe) {
  var box = roomBinBox(b);
  var warm = roomStableTemp(b.id);
  for (var y = box.y0; y <= box.y1; y++) {
    for (var x = box.x0; x <= box.x1; x++) {
      if (!inBounds(x, y) || roomKeepsClear(x, y)) continue;
      if (!wipe && !ISVOID[mat[y * W + x]]) continue;
      setCellHot(x, y, b.id, warm);
    }
  }
}

function roomResetBin(b) {
  roomRefill(b, true);
  markHot(b.x, b.top + 1);
}

function tickTestRoom(frame) {
  var count = sandbox.bins.length;
  if (!count || frame % ROOM_REFILL_EVERY) return;
  var b = sandbox.bins[((frame / ROOM_REFILL_EVERY) | 0) % count];
  roomRefill(b, !roomStockLeft(b, roomBinBox(b)));
}

function generateTestRoom(seed, w, h) {
  if (w > 0 && h > 0 && (w !== W || h !== H)) {
    resizeGrid(w, h);
    resizeFactory();
  }
  srand(seed);
  sandbox.bins.length = 0;

  mat.fill(VOID_ID);
  life.fill(0);
  flow.fill(0);
  dmg.fill(0);
  dmgList.length = 0;
  produced.fill(0);
  nearHot.fill(0);

  var x, y, i;
  for (i = 0; i < LEN; i++) shade[i] = (rnd() * 256) | 0;
  for (y = 0; y < H; y++) geothermalGradient[y] = ROOM_TEMP;

  var floorY = Math.round(H * ROOM_SKY);
  surfaceTop = floorY - ROOM_BIN_H - 24;

  roomFill(0, floorY + 1, W - 1, floorY + 8, matId('rock'));
  roomFill(0, floorY + 9, W - 1, H - 1, matId('hardpan'));
  roomFill(0, H - 12, W - 1, H - 1, matId('rock'));
  roomFill(0, 0, 2, H - 1, EDGE_ID);
  roomFill(W - 3, 0, W - 1, H - 1, EDGE_ID);
  roomFill(0, H - 4, W - 1, H - 1, EDGE_ID);
  roomFill(0, floorY, W - 1, floorY, matId('rock'));

  var stock = roomStock();
  var room = W - 2 * ROOM_MARGIN - ROOM_APRON;
  var wide = roomBinWidths(stock, room);
  var span = 0;
  for (i = 0; i < wide.length; i++) span += wide[i] + ROOM_BIN_GAP;
  span -= ROOM_BIN_GAP;

  var start = Math.max(ROOM_MARGIN + ROOM_APRON, ((W - span) >> 1) + (ROOM_APRON >> 1));
  var at = start;
  for (i = 0; i < stock.length; i++) {
    roomBin(at, floorY, stock[i], wide[i]);
    at += wide[i] + ROOM_BIN_GAP;
  }

  var padX = (W >> 1) - (ROOM_PAD_W >> 1);
  var padY = floorY - ROOM_BIN_H - 16;
  roomFill(padX - 1, padY, padX - 1, padY + ROOM_PAD_H - 1, matId('rock'));
  roomFill(padX + ROOM_PAD_W, padY, padX + ROOM_PAD_W, padY + ROOM_PAD_H - 1, matId('rock'));
  roomFill(padX - 1, padY + ROOM_PAD_H, padX + ROOM_PAD_W, padY + ROOM_PAD_H, matId('rock'));
  cargoPad = { x: padX, y: padY, w: ROOM_PAD_W, h: ROOM_PAD_H };
  resetCargo();

  for (i = 0; i < LEN; i++) {
    var m = mat[i];
    temp[i] = RIGID[m] || ISVOID[m] ? ROOM_TEMP : roomStableTemp(m);
    temp2[i] = temp[i];
  }

  clk.fill(0);
  hotA.fill(1);
  hotB.fill(1);
  seen.fill(1);
  fogVal.fill(1);
  seenCount = seen.length;

  return { spawnX: start - (ROOM_APRON >> 1), spawnY: floorY - 4 };
}
