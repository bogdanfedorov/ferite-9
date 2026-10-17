var GRAB_MIN = 1;
var GRAB_MAX = 8;

function handPress(wpt) {
  if (heldObject) return;
  const g = clampToReach(wpt[0], wpt[1]);
  const gx = Math.floor(g[0]),
    gy = Math.floor(g[1]);
  const only = grabTargetAt(gx, gy);
  if (only && takeObject(gx, gy, only)) notice('grab', null);
  else notice(null, t('msg.nothingToGrab'));
}

function drawGrabHint(mouseWorld) {
  if (heldObject) return;
  const wx = mouseWorld[0],
    wy = mouseWorld[1];
  const cx = Math.floor(wx),
    cy = Math.floor(wy);
  const dx = wx - player.x,
    dy = wy - player.y;
  if (Math.sqrt(dx * dx + dy * dy) > REACH) return;

  const only = grabTargetAt(cx, cy);
  if (!only) return;
  const pick = grabPick(cx, cy, only);
  const z = view.zoom;
  ctx.strokeStyle = uiRgba('sandLit', 0.95);
  ctx.fillStyle = uiRgba('sandLit', 0.28);
  ctx.lineWidth = 1;
  for (let k = 0; k < pick.length; k++) {
    const px = sx(pick[k][0]),
      py = sy(pick[k][1]);
    ctx.fillRect(px, py, z, z);
    ctx.strokeRect(px + 0.5, py + 0.5, z - 1, z - 1);
  }
}

regTool({
  id: 'hand',
  hud: { name: 'tool.hand', desc: 'tool.hand.desc', icon: '◐' },
  sound: 'pickTool',
  grips: true,
  press: handPress,
  overlay: drawGrabHint
});
