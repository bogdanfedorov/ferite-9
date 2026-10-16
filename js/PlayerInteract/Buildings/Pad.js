var PAD_MAX = 96;

function padPlace(plan) {
  const first = plan.cells[0],
    last = plan.cells[plan.cells.length - 1];
  setCargoPad({
    x: Math.min(first.x, last.x),
    y: Math.min(first.y, last.y),
    w: Math.abs(last.x - first.x) + 1,
    h: Math.abs(last.y - first.y) + 1
  });
}

function drawCargoPad() {
  const pad = padLocal();
  if (!pad) return;
  const z = view.zoom;
  const px = sx(pad.x),
    py = sy(pad.y);
  const pw = pad.w * z,
    ph = pad.h * z;
  if (px + pw < 0 || py + ph < 0 || px > cv.width || py > cv.height) return;

  ctx.save();
  ctx.globalAlpha = 0.5 + Math.sin(simFrame * 0.04) * 0.12;
  ctx.strokeStyle = uiRgba('sand', 0.9);
  ctx.lineWidth = 1;
  ctx.setLineDash([Math.max(3, z * 0.6), Math.max(3, z * 0.5)]);
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.setLineDash([]);
  ctx.restore();

  ctx.fillStyle = uiRgba('sand', 0.22);
  ctx.fillRect(px, py + ph - Math.max(2, z * 0.25), pw, Math.max(2, z * 0.25));
}

regBuilding({
  id: 'pad',
  hud: { name: 'tool.pad', desc: 'tool.pad.desc', icon: '▭' },
  sound: 'pickTool',
  shapes: ['rect'],
  vertical: true,
  max: PAD_MAX,
  tint: { ok: 'aqua', bad: 'dangerSoft' },
  arrows: false,
  erasable: false,
  done: { text: 'msg.padDone', sound: 'built' },
  big: { text: 'msg.padBig', sound: 'denied' },
  fits: clearOfFixed,
  place: padPlace,
  drawWorld: drawCargoPad
});
