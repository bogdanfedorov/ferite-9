var SIZE_M = {
  player: { w: 0.13, h: 0.3 },
  wall: 0.1,
  belt: 0.25
};

function cellsOf(meters) {
  return Math.max(1, Math.round(meters / CELL_SIZE));
}

function thickenCells(cells, n) {
  if (n <= 1) return cells;
  const seen = new Set();
  const out = [];
  for (let k = 0; k < cells.length; k++) {
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
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
