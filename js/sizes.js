var CELL_SIZE = 0.01;

var SIZE = {
  m(meters) {
    const cells = Math.round(meters / CELL_SIZE);
    return Math.max(1, cells);
  }
};

function thickenCells(cells, size) {
  if (size.w <= 1 && size.h <= 1) return cells;
  const seen = new Set();
  const out = [];
  for (let k = 0; k < cells.length; k++) {
    for (let dy = 0; dy < size.h; dy++) {
      for (let dx = 0; dx < size.w; dx++) {
        const x = cells[k].x + dx,
          y = cells[k].y + dy;
        const key = y * W + x;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x: x, y: y });
      }
    }
  }
  return out;
}
