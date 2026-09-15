/* Малювання: растр світу, світіння, векторні накладки машин і гравця. */

var cv, ctx, bmp, bctx, bimg, bpix;
var glowCv, glowCtx, glowImg, glowPix;
var view = { zoom: 5, camX: 0, camY: 0, vw: 0, vh: 0, ox: 0, oy: 0 };

var palR = new Uint8Array(MAT_COUNT), palG = new Uint8Array(MAT_COUNT),
  palB = new Uint8Array(MAT_COUNT), palV = new Uint8Array(MAT_COUNT);
var heatView = false;

function initRender() {
  cv = document.getElementById('game');
  ctx = cv.getContext('2d', { alpha: false });
  bmp = document.createElement('canvas');
  bctx = bmp.getContext('2d', { alpha: false });
  glowCv = document.createElement('canvas');
  glowCtx = glowCv.getContext('2d');
  applyVision();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  cv.width = Math.max(320, window.innerWidth | 0);
  cv.height = Math.max(240, window.innerHeight | 0);
  ctx.imageSmoothingEnabled = false;
  allocBuffers();
}

function allocBuffers() {
  view.vw = Math.min(W, Math.ceil(cv.width / view.zoom) + 2);
  view.vh = Math.min(H, Math.ceil(cv.height / view.zoom) + 2);
  bmp.width = view.vw; bmp.height = view.vh;
  bimg = bctx.createImageData(view.vw, view.vh);
  bpix = new Uint32Array(bimg.data.buffer);
  glowCv.width = Math.max(2, Math.ceil(view.vw / 3));
  glowCv.height = Math.max(2, Math.ceil(view.vh / 3));
  glowImg = glowCtx.createImageData(glowCv.width, glowCv.height);
  glowPix = new Uint32Array(glowImg.data.buffer);
}

function setZoom(z) {
  view.zoom = Math.max(3, Math.min(9, z));
  allocBuffers();
}

function updateCamera() {
  var tx = player.x - view.vw / 2;
  var ty = player.y - view.vh / 2;
  view.camX += (tx - view.camX) * 0.14;
  view.camY += (ty - view.camY) * 0.14;
  if (view.camX < 0) view.camX = 0;
  if (view.camY < 0) view.camY = 0;
  if (view.camX > W - view.vw) view.camX = W - view.vw;
  if (view.camY > H - view.vh) view.camY = H - view.vh;
  view.ox = Math.floor(view.camX);
  view.oy = Math.floor(view.camY);
}

function sx(wx) { return (wx - view.camX) * view.zoom; }
function sy(wy) { return (wy - view.camY) * view.zoom; }
function screenToWorld(px, py) {
  return [view.camX + px / view.zoom, view.camY + py / view.zoom];
}

function drawWorldBitmap() {
  var vw = view.vw, vh = view.vh, ox = view.ox, oy = view.oy;
  var gw = glowCv.width, gh = glowCv.height;
  glowPix.fill(0);

  for (var y = 0; y < vh; y++) {
    var wy = oy + y;
    var rowBase = wy * W;
    var dst = y * vw;
    // білінійна вибірка туману: м'яка межа розвіданого
    var syf = (wy - 4) * 0.125;
    if (syf < 0) syf = 0;
    var fy0 = syf | 0;
    if (fy0 > FCH - 1) fy0 = FCH - 1;
    var fty = syf - fy0;
    var fRowA = fy0 * FCW;
    var fRowB = (fy0 + 1 < FCH ? fy0 + 1 : fy0) * FCW;
    // фонове небо / печерна темрява
    var skyT = wy < surfaceTop ? 1 - wy / Math.max(1, surfaceTop) : 0;
    var bgR, bgG, bgB;
    if (wy < surfaceTop) {
      bgR = 14 + (10 * (1 - skyT)) | 0;
      bgG = 20 + (14 * (1 - skyT)) | 0;
      bgB = 32 + (16 * (1 - skyT)) | 0;
    } else {
      var d = Math.min(1, (wy - surfaceTop) / 260);
      bgR = (13 - 5 * d) | 0; bgG = (18 - 7 * d) | 0; bgB = (25 - 9 * d) | 0;
    }
    for (var x = 0; x < vw; x++) {
      var wx = ox + x;
      var i = rowBase + wx;
      var m = mat[i];
      var r, g, b;

      var sxf = (wx - 4) * 0.125;
      if (sxf < 0) sxf = 0;
      var fx0 = sxf | 0;
      if (fx0 > FCW - 1) fx0 = FCW - 1;
      var ftx = sxf - fx0;
      var fx1 = fx0 + 1 < FCW ? fx0 + 1 : fx0;
      var vA = fogVal[fRowA + fx0], vB = fogVal[fRowA + fx1];
      var vC = fogVal[fRowB + fx0], vD = fogVal[fRowB + fx1];
      var vis = (vA + (vB - vA) * ftx) * (1 - fty) + (vC + (vD - vC) * ftx) * fty;

      if (vis < 0.02) {
        // нерозвідане: суцільна темрява з ледь помітним зерном
        var nn = (shade[i] & 5);
        bpix[dst + x] = 0xff000000 | ((11 + nn) << 16) | ((8 + nn) << 8) | (6 + nn);
        continue;
      }
      if (ISVOID[m]) {
        var n = (shade[i] & 7) - 3;
        r = bgR + n; g = bgG + n; b = bgB + n;
      } else {
        var v = palV[m];
        var s = ((shade[i] - 128) * v) >> 7;
        r = palR[m] + s; g = palG[m] + s; b = palB[m] + s;
        if (SHIMMER[m] === LOOK.FLAME) {
          var l = life[i];
          g = 90 + (l > 60 ? 90 : l + 30);
          r = 250; b = 40 + (shade[i] & 31);
        } else if (SHIMMER[m] === LOOK.PULSE) {
          var pulse = Math.sin((simFrame + shade[i]) * 0.05) * 18;
          r = 224 + pulse; g = 96 + pulse * 0.7; b = 38;
        }
        if (GLOW[m] && vis > 0.35) {
          var gi = ((y / 3) | 0) * gw + ((x / 3) | 0);
          if (gi >= 0 && gi < glowPix.length) {
            var prev = glowPix[gi];
            var pa = (prev >>> 24) & 255;
            if (pa < 235) glowPix[gi] = ((pa + 26) << 24) | (30 << 16) | (100 << 8) | 235;
          }
        }
      }
      if (heatView) {
        var tv = temp[i];
        var k = (tv - 20) / 1380;
        if (k < 0) k = 0; else if (k > 1) k = 1;
        var u;
        if (k < 0.35) { u = k / 0.35; r = 22 + u * 190; g = 58 + u * 74; b = 126 - u * 62; }
        else { u = (k - 0.35) / 0.65; r = 212 + u * 43; g = 132 + u * 118; b = 64 + u * 158; }
        var tex = ((shade[i] - 128) >> 5);
        r += tex; g += tex; b += tex;
      }
      if (vis < 0.995) {
        // напівтемрява на межі розвіданого
        r = 9 + (r - 9) * vis;
        g = 7 + (g - 7) * vis;
        b = 6 + (b - 6) * vis;
      }
      if (r < 0) r = 0; else if (r > 255) r = 255;
      if (g < 0) g = 0; else if (g > 255) g = 255;
      if (b < 0) b = 0; else if (b > 255) b = 255;
      bpix[dst + x] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  bctx.putImageData(bimg, 0, 0);

  var offX = -(view.camX - view.ox) * view.zoom;
  var offY = -(view.camY - view.oy) * view.zoom;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, view.vw, view.vh, offX, offY, view.vw * view.zoom, view.vh * view.zoom);

  glowCtx.putImageData(glowImg, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(glowCv, offX - view.zoom * 2, offY - view.zoom * 2,
    view.vw * view.zoom + view.zoom * 4, view.vh * view.zoom + view.zoom * 4);
  ctx.restore();
}

function drawPipes() {
  var z = view.zoom;
  for (var n = 0; n < pipeList.length; n++) {
    var i = pipeList[n];
    if (!CARRIES[mat[i]]) continue;
    var x = i % W, y = (i / W) | 0;
    if (x < view.ox - 1 || y < view.oy - 1 || x > view.ox + view.vw || y > view.oy + view.vh) continue;
    var px = sx(x), py = sy(y);
    ctx.fillStyle = '#222c38';
    ctx.fillRect(px, py, z, z);
    ctx.fillStyle = '#3d4b5d';
    ctx.fillRect(px, py + z * 0.15, z, z * 0.2);
    var item = pipeItem[i];
    if (item) {
      ctx.fillStyle = 'rgb(' + palR[item] + ',' + palG[item] + ',' + palB[item] + ')';
      ctx.fillRect(px + z * 0.22, py + z * 0.38, z * 0.56, z * 0.46);
    }
  }
}

function drawMachines() {
  var z = view.zoom;
  for (var n = 0; n < machines.length; n++) {
    var m = machines[n];
    if (!m) continue;
    var px = sx(m.x), py = sy(m.y), pw = m.w * z, ph = m.h * z;
    if (px + pw < -20 || py + ph < -20 || px > cv.width + 20 || py > cv.height + 20) continue;

    var powered = power.sat > 0.99 || m.kind === KIND.GENERATOR;
    ctx.fillStyle = '#141c27';
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = '#1d2836';
    ctx.fillRect(px + 1, py + 1, pw - 2, ph * 0.34);
    ctx.strokeStyle = m.active && powered ? '#4d6274' : '#2b3949';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);

    var cx = px + pw / 2, cy = py + ph / 2;

    if (m.kind === KIND.PUMP) {
      ctx.fillStyle = m.active ? uiHex('sand') : '#5b6879';
      ctx.beginPath();
      ctx.moveTo(cx - pw * 0.26, cy - ph * 0.2);
      ctx.lineTo(cx + pw * 0.26, cy - ph * 0.2);
      ctx.lineTo(cx, cy + ph * 0.26);
      ctx.closePath();
      ctx.fill();
      if (m.beamT > 0 && m.beam >= 0) {
        var bxw = m.beam % W, byw = (m.beam / W) | 0;
        ctx.strokeStyle = uiRgba('sand', m.beamT / 10);
        ctx.lineWidth = Math.max(1, z * 0.3);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sx(bxw + 0.5), sy(byw + 0.5));
        ctx.stroke();
      }
    } else if (m.kind === KIND.GENERATOR) {
      ctx.fillStyle = m.burn > 0 ? uiHex('aqua') : '#4a5769';
      ctx.beginPath();
      ctx.moveTo(cx + pw * 0.1, cy - ph * 0.3);
      ctx.lineTo(cx - pw * 0.16, cy + ph * 0.04);
      ctx.lineTo(cx + pw * 0.02, cy + ph * 0.04);
      ctx.lineTo(cx - pw * 0.06, cy + ph * 0.32);
      ctx.lineTo(cx + pw * 0.2, cy - ph * 0.04);
      ctx.lineTo(cx + pw * 0.02, cy - ph * 0.04);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0d131b';
      ctx.fillRect(px + 2, py + ph - 5, pw - 4, 3);
      ctx.fillStyle = uiHex('aqua');
      ctx.fillRect(px + 2, py + ph - 5, (pw - 4) * (m.burn / (m.burnMax || 1)), 3);
    } else if (m.kind === KIND.SILO) {
      ctx.strokeStyle = '#7d8ea3';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - pw * 0.24, cy - ph * 0.24, pw * 0.48, ph * 0.48);
      ctx.fillStyle = uiHex('aqua');
      ctx.fillRect(cx - pw * 0.24, cy + ph * 0.04, pw * 0.48, ph * 0.2);
    }

    // індикатор живлення
    if (DEF[m.kind].draw > 0) {
      ctx.fillStyle = power.sat > 0.99 ? uiHex('ok') : (power.sat > 0.5 ? uiHex('hazard') : uiHex('danger'));
      ctx.fillRect(px + pw - 4, py + 2, 2, 2);
    }
  }
}

/* Тріщини на клітинках, які зараз гризе бур. */
function drawDamage() {
  var z = view.zoom;
  for (var n = 0; n < dmgList.length; n++) {
    var i = dmgList[n];
    var d = dmg[i];
    if (!d) continue;
    var m = mat[i];
    var h = HARD[m];
    if (h <= 0) continue;
    var x = i % W, y = (i / W) | 0;
    if (x < view.ox || y < view.oy || x >= view.ox + view.vw || y >= view.oy + view.vh) continue;
    var k = Math.min(1, d / h);
    ctx.fillStyle = 'rgba(8,11,16,' + (0.18 + k * 0.5) + ')';
    ctx.fillRect(sx(x), sy(y), z, z);
    if (k > 0.45) {
      ctx.fillStyle = uiRgba('sand', ((k - 0.45) * 0.5));
      ctx.fillRect(sx(x) + z * 0.35, sy(y) + z * 0.2, Math.max(1, z * 0.3), Math.max(1, z * 0.6));
    }
  }
}

/* Вантажний майданчик біля шлюзу: сюди модуль носить залізо й скло. */
function drawCargoPad() {
  var z = view.zoom;
  var px = sx(cargoPad.x), py = sy(cargoPad.y);
  var pw = cargoPad.w * z, ph = cargoPad.h * z;
  if (px + pw < 0 || py + ph < 0 || px > cv.width || py > cv.height) return;

  ctx.save();
  ctx.globalAlpha = 0.5 + Math.sin(simFrame * 0.04) * 0.12;
  ctx.strokeStyle = uiRgba('sand', 0.9);
  ctx.lineWidth = 1;
  ctx.setLineDash([Math.max(3, z * 0.6), Math.max(3, z * 0.5)]);
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.setLineDash([]);
  ctx.restore();

  // смуга на підлозі майданчика
  ctx.fillStyle = uiRgba('sand', 0.22);
  ctx.fillRect(px, py + ph - Math.max(2, z * 0.25), pw, Math.max(2, z * 0.25));
}

/* Переносні предмети: шматки породи в руці, в польоті або на землі. */
function drawObjects() {
  var z = view.zoom;
  for (var n = 0; n < objects.length; n++) {
    var o = objects[n];
    var px = sx(o.x), py = sy(o.y);
    var span = objSpan(o);
    var ow = span[0] * z, oh = span[1] * z;
    if (px + ow < -20 || py + oh < -20 || px > cv.width + 20 || py > cv.height + 20) continue;

    for (var k = 0; k < o.cells.length; k++) {
      var c = o.cells[k];
      var lift = o.held ? 18 : 0;               // в руці шматок трохи світліший
      ctx.fillStyle = 'rgb(' + Math.min(255, palR[c.mat] + lift) + ',' +
        Math.min(255, palG[c.mat] + lift) + ',' + Math.min(255, palB[c.mat] + lift) + ')';
      ctx.fillRect(sx(o.x + c.dx), sy(o.y + c.dy), z + 1, z + 1);
    }

    ctx.strokeStyle = o.held ? uiRgba('sand', 0.95) : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 0.5, py - 0.5, ow + 1, oh + 1);

    if (o.flash > 0) {
      ctx.fillStyle = 'rgba(255,238,200,' + (o.flash / 14) + ')';
      ctx.fillRect(px - z * 0.5, py - z * 0.5, ow + z, oh + z);
    }

    // маніпулятор: лінія від модуля до того, що він тримає
    if (o.held) {
      ctx.strokeStyle = uiRgba('sand', 0.55);
      ctx.lineWidth = Math.max(1, z * 0.22);
      ctx.beginPath();
      ctx.moveTo(sx(player.x), sy(player.y));
      ctx.lineTo(sx(o.x + o.cx), sy(o.y + o.cy));
      ctx.stroke();
    }
  }
}

/* Видно наперед рівно ті клітинки, що підуть у жменю. */
function drawGrabHint(wx, wy) {
  if (heldObject) return;
  var cx = Math.floor(wx), cy = Math.floor(wy);
  var dx = wx - player.x, dy = wy - player.y;
  if (Math.sqrt(dx * dx + dy * dy) > REACH) return;

  var only = grabTargetAt(cx, cy);
  if (!only) return;
  var pick = grabPick(cx, cy, only);
  var z = view.zoom;
  ctx.strokeStyle = uiRgba('sandLit', 0.95);
  ctx.fillStyle = uiRgba('sandLit', 0.28);
  ctx.lineWidth = 1;
  for (var k = 0; k < pick.length; k++) {
    var px = sx(pick[k][0]), py = sy(pick[k][1]);
    ctx.fillRect(px, py, z, z);
    ctx.strokeRect(px + 0.5, py + 0.5, z - 1, z - 1);
  }
}

function drawFlowArrow(cx, cy, dx, dy, color) {
  var z = view.zoom;
  var n = Math.sqrt(dx * dx + dy * dy) || 1;
  var ndx = dx / n, ndy = dy / n;
  var px = sx(cx), py = sy(cy);
  var len = z * 0.36, wing = z * 0.24;
  var tx = px + ndx * len, ty = py + ndy * len;
  var bx = px - ndx * len * 0.5, by = py - ndy * len * 0.5;
  var wx = -ndy * wing, wy = ndx * wing;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx + wx, by + wy);
  ctx.lineTo(bx - wx, by - wy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawBelts() {
  var z = view.zoom;
  if (z < 2) return;
  for (var b = 0; b < belts.length; b++) {
    var belt = belts[b];
    var cs = belt.cells;
    for (var k = 0; k < cs.length; k++) {
      var c = cs[k];
      if (!GRIPS[mat[c.y * W + c.x]]) continue;
      var px = sx(c.x), py = sy(c.y);
      if (px + z < 0 || py + z < 0 || px > cv.width || py > cv.height) continue;
      ctx.fillStyle = uiRgba('sandLit', 0.55);
      ctx.fillRect(px, py, z, 3);
      drawFlowArrow(c.x + 0.5, c.y + 0.5, belt.dx, belt.dy, uiRgba('sand', 0.9));
    }
  }
}

function drawBeltPreview(from, to) {
  if (!from || !to) return;
  var shape = snapBelt(from[0], from[1], to[0], to[1]);
  if (!shape) return;
  var ok = beltFits(shape) && shape.cells.length >= BELT_MIN;
  var z = view.zoom;
  ctx.fillStyle = ok ? uiRgba('sand', 0.20) : uiRgba('dangerSoft', 0.22);
  ctx.strokeStyle = ok ? uiRgba('sand', 0.8) : uiRgba('dangerSoft', 0.8);
  ctx.lineWidth = 1;
  for (var k = 0; k < shape.cells.length; k++) {
    var c = shape.cells[k];
    ctx.fillRect(sx(c.x), sy(c.y), z, z);
    drawFlowArrow(c.x + 0.5, c.y + 0.5, shape.dx, shape.dy,
      ok ? uiRgba('sand', 0.9) : uiRgba('dangerSoft', 0.9));
  }
}

function drawWallPreview(from, to, shape) {
  if (!from || !to) return;
  var s = shape === 'wallRect' ? snapWallRect(from[0], from[1], to[0], to[1])
    : snapWallLine(from[0], from[1], to[0], to[1]);
  if (!s) return;
  var ok = wallFits(s);
  var z = view.zoom;
  ctx.fillStyle = ok ? uiRgba('sand', 0.22) : uiRgba('dangerSoft', 0.22);
  ctx.strokeStyle = ok ? uiRgba('sand', 0.85) : uiRgba('dangerSoft', 0.85);
  ctx.lineWidth = 1;
  for (var k = 0; k < s.cells.length; k++) {
    var c = s.cells[k];
    ctx.fillRect(sx(c.x), sy(c.y), z, z);
    ctx.strokeRect(sx(c.x) + 0.5, sy(c.y) + 0.5, z - 1, z - 1);
  }
}

/* Трос захвата. */
function drawHook() {
  if (hook.state === 'idle') return;
  var hx = hook.state === 'set' ? hook.ax : hook.x;
  var hy = hook.state === 'set' ? hook.ay : hook.y;
  ctx.strokeStyle = hook.state === 'set' ? 'rgba(196,206,220,0.9)' : 'rgba(140,152,168,0.8)';
  ctx.lineWidth = Math.max(1, view.zoom * 0.18);
  ctx.beginPath();
  ctx.moveTo(sx(player.x), sy(player.y));
  ctx.lineTo(sx(hx), sy(hy));
  ctx.stroke();
  ctx.fillStyle = hook.state === 'set' ? uiHex('sand') : '#c2cad6';
  var s = Math.max(3, view.zoom * 0.8);
  ctx.fillRect(sx(hx) - s / 2, sy(hy) - s / 2, s, s);
}

function drawPlayer() {
  var z = view.zoom;
  var px = sx(player.x - player.w / 2), py = sy(player.y - player.h / 2);
  var pw = player.w * z, ph = player.h * z;

  if (player.drilling) {
    var g = ctx.createLinearGradient(sx(player.x), sy(player.y), sx(player.aimX), sy(player.aimY));
    g.addColorStop(0, uiRgba('sand', 0.75));
    g.addColorStop(1, uiRgba('sand', 0.1));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.5, z * 0.35);
    ctx.beginPath();
    ctx.moveTo(sx(player.x), sy(player.y));
    ctx.lineTo(sx(player.aimX + 0.5), sy(player.aimY + 0.5));
    ctx.stroke();
    ctx.strokeStyle = uiRgba('sand', 0.6);
    ctx.lineWidth = 1;
    var rr = (DRILL_RADIUS + 0.4) * z * (0.9 + Math.sin(simFrame * 0.3) * 0.06);
    ctx.beginPath();
    ctx.arc(sx(player.aimX + 0.5), sy(player.aimY + 0.5), rr, 0, 6.284);
    ctx.stroke();
  }

  ctx.fillStyle = '#c2cad6';
  ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#1b2430';
  ctx.fillRect(px, py + ph * 0.62, pw, ph * 0.38);
  ctx.fillStyle = uiHex('sand');
  ctx.fillRect(px + pw * 0.18, py + ph * 0.16, pw * 0.64, ph * 0.3);

  if (player.fuel < 100 && !player.grounded) {
    ctx.fillStyle = uiRgba('flame', (0.35 + Math.random() * 0.35));
    ctx.fillRect(px + pw * 0.2, py + ph, pw * 0.6, z * (0.6 + Math.random()));
  }

  if (player.hp < 100) {
    ctx.fillStyle = '#0d131b';
    ctx.fillRect(px - 1, py - 6, pw + 2, 3);
    ctx.fillStyle = player.hp > 40 ? uiHex('ok') : uiHex('danger');
    ctx.fillRect(px - 1, py - 6, (pw + 2) * (player.hp / 100), 3);
  }

  // паливо ранця
  ctx.fillStyle = '#0d131b';
  ctx.fillRect(px - 1, py + ph + 3, pw + 2, 2);
  ctx.fillStyle = uiHex('aqua');
  ctx.fillRect(px - 1, py + ph + 3, (pw + 2) * (player.fuel / 100), 2);
}

function drawGhost(tool, wx, wy, affordable) {
  var z = view.zoom;
  if (tool === 'drill' || tool === 'hand') return;   // ці інструменти мають власні позначки
  var d = null, kind = -1;
  for (var k = 0; k < DEF.length; k++) if (DEF[k].key === tool) { d = DEF[k]; kind = k; }

  if (tool === 'dismantle') {
    ctx.strokeStyle = uiRgba('rust', 0.9);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx(Math.floor(wx)) + 0.5, sy(Math.floor(wy)) + 0.5, z - 1, z - 1);
    return;
  }
  var w = d ? d.w : (tool === 'ignite' ? 3 : 1), h = d ? d.h : (tool === 'ignite' ? 3 : 1);
  var gx = Math.floor(wx - w / 2), gy = Math.floor(wy - h / 2);
  var dx = wx - player.x, dy = wy - player.y;
  var inReach = Math.sqrt(dx * dx + dy * dy) < REACH + 8;
  var spotMat = matAt(Math.floor(wx), Math.floor(wy));
  var free = d ? areaFree(gx, gy, w, h)
    : (tool === 'ignite' || tool === 'pipe' ? STATE[spotMat] !== MT.STRUCTURE
      : !BLOCKING[spotMat]);
  var ok = affordable && inReach && free;

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ok ? uiHex('aqua') : uiHex('danger');
  ctx.fillRect(sx(gx), sy(gy), w * z, h * z);
  ctx.restore();
  ctx.strokeStyle = ok ? uiRgba('ok', 0.9) : uiRgba('danger', 0.9);
  ctx.lineWidth = 1;
  ctx.strokeRect(sx(gx) + 0.5, sy(gy) + 0.5, w * z - 1, h * z - 1);

  if (kind === KIND.PUMP) {
    ctx.strokeStyle = uiRgba('sand', 0.35);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(sx(gx + w / 2), sy(gy + h / 2), DEF[KIND.PUMP].reach * z, 0, 6.284);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

var vignette = null;
function drawVignette() {
  if (!vignette || vignette.w !== cv.width) {
    var g = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * 0.32,
      cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    vignette = { g: g, w: cv.width };
  }
  ctx.fillStyle = vignette.g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (player.hp < 50) {
    ctx.fillStyle = uiRgba('alarm', (0.34 * (1 - player.hp / 50)));
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
}

function drawResetIcon(cx, cy, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.34);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.05);
  ctx.stroke();
  var tip = r * 0.62;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r - tip * 0.7, cy - r * 0.7);
  ctx.lineTo(cx - r + tip * 0.7, cy - r * 0.7);
  ctx.lineTo(cx - r, cy - r * 0.7 + tip);
  ctx.closePath();
  ctx.fill();
}

function drawRoomBins(mouseWorld) {
  var z = view.zoom;
  var hover = roomButtonAt(mouseWorld[0], mouseWorld[1]);
  var size = Math.round(Math.max(8, Math.min(12, z * 1.5)));
  var labelY = sy(roomLabelY()) - 2;
  ctx.save();
  ctx.font = '600 ' + size + 'px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (var n = 0; n < sandbox.bins.length; n++) {
    var b = sandbox.bins[n];
    var mid = sx(b.x + b.w / 2);
    if (mid < -120 || mid > cv.width + 120) continue;
    var r = roomButtonRect(b);
    var bx = sx(r.x0), by = sy(r.y0);
    var bw = (r.x1 - r.x0) * z, bh = (r.y1 - r.y0) * z;
    var lit = hover === b;
    ctx.fillStyle = lit ? uiRgba('sand', 0.9) : 'rgba(12,16,22,0.82)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = lit ? uiHex('sandLit') : uiRgba('sand', 0.55);
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    drawResetIcon(bx + bw / 2, by + bh / 2, Math.max(2, bh * 0.24),
      lit ? '#1a1206' : uiHex('sand'));

    if (z < 3) continue;
    var name = matLabel(b.id);
    var tw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(8,11,16,0.72)';
    ctx.fillRect(mid - tw / 2 - 4, labelY - size - 3, tw + 8, size + 6);
    ctx.fillStyle = uiHex('sand');
    ctx.fillText(name, mid, labelY);
  }
  ctx.restore();
}

function render(tool, mouseWorld, affordable) {
  updateCamera();
  drawWorldBitmap();
  drawDamage();
  drawCargoPad();
  drawBelts();
  drawPipes();
  drawMachines();
  drawObjects();
  drawHook();
  drawPlayer();
  if (tool === 'belt') {
    if (buildShape === 'belt') drawBeltPreview(buildFrom, buildTo);
    else drawWallPreview(buildFrom, buildTo, buildShape);
  }
  if (tool === 'hand') drawGrabHint(mouseWorld[0], mouseWorld[1]);
  if (sandbox.on) drawRoomBins(mouseWorld);
  if (!roomButtonAt(mouseWorld[0], mouseWorld[1])) {
    drawGhost(tool, mouseWorld[0], mouseWorld[1], affordable);
  }
  drawVignette();
}
