var SHAPE_MAX = 48;

function stepOf(n) {
  if (n === 0) return 0;
  return n > 0 ? 1 : -1;
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

function discAround(center, edge) {
  const r = Math.round(Math.hypot(edge.x - center.x, edge.y - center.y));
  const limit = r * r + r;
  const cells = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= limit) cells.push({ x: center.x + dx, y: center.y + dy });
    }
  }
  return cells;
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

function cappedPoint(from, to) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  if (reach <= SHAPE_MAX) return to;
  const scale = SHAPE_MAX / reach;
  return { x: from.x + Math.round(dx * scale), y: from.y + Math.round(dy * scale) };
}

var SHAPES = {
  line: (from, to, opt) => lineBetween(from, snapLine(from, to, opt.vertical)),
  slope: (from, to) => lineBetween(from, to),
  rect: (from, to, opt) => rectBetween(from, opt.even ? evenPoint(from, to) : to),
  circle: (from, to) => discAround(from, to)
};

function shapeCells(name, from, to, opt) {
  return SHAPES[name](from, to, opt || {});
}

function shapeHeading(cells) {
  const first = cells[0],
    last = cells[cells.length - 1];
  const dx = stepOf(last.x - first.x);
  if (dx === 0) return { dx: 1, dy: 0 };
  return { dx: dx, dy: stepOf(last.y - first.y) };
}
