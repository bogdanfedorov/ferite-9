var WALL_ID = matId('wall');

function wallPlace(plan) {
  for (let k = 0; k < plan.cells.length; k++) setCell(plan.cells[k].x, plan.cells[k].y, WALL_ID);
}

regBuilding({
  id: 'wall',
  size: { w: SIZE.m(0.1), h: SIZE.m(0.1) },
  hud: { name: 'tool.wall', desc: 'tool.wall.desc', icon: '▦' },
  cost: 120,
  sound: 'pickTool',
  shapes: ['line', 'slope', 'rect', 'circle'],
  vertical: true,
  tint: { ok: 'sand', bad: 'dangerSoft' },
  arrows: false,
  erasable: true,
  done: { text: 'msg.wallDone', sound: 'built' },
  fits: clearOfFixed,
  place: wallPlace,
  owns: (x, y) => mat[y * W + x] === WALL_ID
});
