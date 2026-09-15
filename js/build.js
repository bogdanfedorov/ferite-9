/* Конвеєр: перша річ, яку модуль будує не з породи, а з власного заліза.

   Порядок такий: гравець намічає каркас — горизонтальний або рівно під 45° —
   і той висить у повітрі порожній. Далі носить у нього залізо руками.
   Кожна принесена клітинка заліза вкладає кілька клітинок настилу, тож
   стрічка росте на очах від початку до кінця й починає тягнути ще недобудована. */

var BELT_MIN = 3;
var BELT_DECK = matId('belt');
var BELT_FEED = 'iron';
var BELT_REFUND = matId('iron_scrap');
var BELT_MAX = 48;
var BELT_PER_IRON = 4;     // клітинок настилу з однієї клітинки заліза
var BELT_TICK = 3;         // стрічка сіпається раз на стільки кадрів

var blueprints = [];       // недобудоване: {cells, dx, dy, need, have, built, credit, belt}
var belts = [];            // те, що вже везе: {cells, dx, dy, paid}
var beltUnlocked = false;

var beltFrom = null;       // кінці лінії, яку гравець саме тягне мишею
var beltTo = null;

function resetBuild() {
  blueprints.length = 0;
  belts.length = 0;
  beltUnlocked = false;
  beltFrom = null;
  beltTo = null;
}

/* ---------- намітка ---------- */

/* Стрічка вміє тільки два нахили: рівно або 45°. Куди тягнули — туди й повезе. */
function snapBelt(ax, ay, bx, by) {
  ax = Math.round(ax); ay = Math.round(ay);
  bx = Math.round(bx); by = Math.round(by);
  var ddx = bx - ax, ddy = by - ay;
  var len = Math.abs(ddx);
  if (Math.abs(ddy) > len) len = Math.abs(ddy);
  if (len < 1) return null;
  if (len > BELT_MAX) len = BELT_MAX;

  var sx = ddx === 0 ? 0 : (ddx > 0 ? 1 : -1);
  var sy = 0;
  if (Math.abs(ddy) > Math.abs(ddx) * 0.45) sy = ddy > 0 ? 1 : -1;
  if (sx === 0) return null;                 // вертикально стрічка не ходить

  var cells = [];
  for (var k = 0; k <= len; k++) cells.push({ x: ax + sx * k, y: ay + sy * k });
  return { cells: cells, dx: sx, dy: sy };
}

function beltCellAt(x, y) {
  return inBounds(x, y) && GRIPS[mat[y * W + x]] === 1;
}

function ghostAt(x, y) {
  for (var b = 0; b < blueprints.length; b++) {
    var bp = blueprints[b];
    for (var k = bp.built; k < bp.cells.length; k++) {
      if (bp.cells[k].x === x && bp.cells[k].y === y) return bp;
    }
  }
  return null;
}

/* Чи стане каркас: сама доріжка має бути вільна, а над нею — не камінь,
   бо возити нічого буде. */
function beltFits(shape) {
  for (var k = 0; k < shape.cells.length; k++) {
    var c = shape.cells[k];
    if (!inBounds(c.x, c.y) || !inBounds(c.x, c.y - 1)) return false;
    if (!OPEN[mat[c.y * W + c.x]]) return false;
    if (RIGID[mat[(c.y - 1) * W + c.x]]) return false;
    if (ghostAt(c.x, c.y)) return false;
  }
  return true;
}

function beltCost(shape) {
  return Math.max(1, Math.ceil(shape.cells.length / BELT_PER_IRON));
}

function placeBlueprint(shape) {
  blueprints.push({
    cells: shape.cells, dx: shape.dx, dy: shape.dy,
    need: beltCost(shape), have: 0, built: 0, credit: 0, belt: null
  });
  return blueprints[blueprints.length - 1];
}

/* Знімає намітку. Те залізо, що вже лягло настилом, лишається в стрічці —
   назад повертається лише невитрачене. */
function cancelBlueprint(bp) {
  var idx = blueprints.indexOf(bp);
  if (idx < 0) return 0;
  blueprints.splice(idx, 1);
  var back = Math.floor(bp.credit / BELT_PER_IRON);
  if (bp.belt) bp.belt.paid = bp.have - back;
  for (var n = 0; n < back; n++) {
    var c = bp.cells[Math.min(bp.cells.length - 1, bp.built + n * BELT_PER_IRON)];
    placeCell(c.x, c.y - 1, BELT_REFUND, 22);
  }
  return back;
}

/* Розбирає готову стрічку назад у брухт — рівно стільки, скільки коштувала. */
function dismantleBelt(belt) {
  var idx = belts.indexOf(belt);
  if (idx < 0) return 0;
  belts.splice(idx, 1);
  var k;
  for (k = 0; k < belt.cells.length; k++) {
    var c = belt.cells[k];
    if (beltCellAt(c.x, c.y)) setCell(c.x, c.y, VOID_ID);
  }
  for (k = 0; k < belt.paid; k++) {
    var p = belt.cells[Math.min(belt.cells.length - 1, k * BELT_PER_IRON)];
    placeCell(p.x, p.y, BELT_REFUND, 22);
  }
  return belt.paid;
}

function beltUnder(x, y) {
  for (var b = 0; b < belts.length; b++) {
    var cs = belts[b].cells;
    for (var k = 0; k < cs.length; k++) if (cs[k].x === x && cs[k].y === y) return belts[b];
  }
  return null;
}

/* ---------- будівництво ---------- */

/* Кладе одну клітинку настилу. Якщо місце встигло замулити — відсуває.
   Не вийшло взагалі — чекаємо, залізо не пропадає. */
function layBeltCell(bp, c) {
  if (!inBounds(c.x, c.y)) return false;
  var at = mat[c.y * W + c.x];
  if (!OPEN[at]) {
    if (!MOVABLE[at]) return false;
    if (!shoveCell(c.x, c.y, bp.dx, bp.dy)) return false;
  }
  setCell(c.x, c.y, BELT_DECK);
  if (!bp.belt) {
    bp.belt = { cells: [], dx: bp.dx, dy: bp.dy, paid: 0 };
    belts.push(bp.belt);
  }
  bp.belt.cells.push(c);
  return true;
}

/* Приймає залізо, покладене в намітку, і перетворює його на настил. */
function tickBlueprints() {
  for (var b = blueprints.length - 1; b >= 0; b--) {
    var bp = blueprints[b];
    var k, c, i, m;

    // збираємо все залізне, що лежить у каркасі або просто на ньому
    for (k = bp.built; k < bp.cells.length; k++) {
      c = bp.cells[k];
      for (var up = 0; up <= 1; up++) {
        if (!inBounds(c.x, c.y - up)) continue;
        i = (c.y - up) * W + c.x;
        m = mat[i];
        if (CARGO[m] !== BELT_FEED) continue;
        setCell(c.x, c.y - up, VOID_ID);
        bp.have++;
        bp.credit += BELT_PER_IRON;
      }
    }

    while (bp.credit > 0 && bp.built < bp.cells.length) {
      if (!layBeltCell(bp, bp.cells[bp.built])) break;
      bp.built++;
      bp.credit--;
    }
    if (bp.belt) bp.belt.paid = bp.have;

    if (bp.built >= bp.cells.length) {
      blueprints.splice(b, 1);
      if (typeof onBeltDone === 'function') onBeltDone(bp.belt);
    }
  }
}

/* ---------- хід стрічки ---------- */

/* Вантаж їде поверх настилу. Йдемо проти руху, щоб клітинка не проскочила
   всю стрічку за один тік. */
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
      if (!beltCellAt(c.x, c.y)) continue;        // настил зняли або переплавили
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
  if (blueprints.length) tickBlueprints();
  if (belts.length && frame % BELT_TICK === 0) tickBelts();
}
