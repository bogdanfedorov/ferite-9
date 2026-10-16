var cv, ctx, bmp, bctx, bimg, bpix;
var glowCv, glowCtx, glowImg, glowPix;
var view = { zoom: 5, camX: 0, camY: 0, vw: 0, vh: 0, ox: 0, oy: 0 };

var palR = new Uint8Array(MAT_COUNT),
  palG = new Uint8Array(MAT_COUNT),
  palB = new Uint8Array(MAT_COUNT),
  palV = new Uint8Array(MAT_COUNT);
var heatView = false;

function toggleHeatView() {
  heatView = !heatView;
  return heatView;
}

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
  setZoom(view.zoom);
}

function allocBuffers() {
  view.vw = Math.min(W, Math.ceil(cv.width / view.zoom) + 2);
  view.vh = Math.min(H, Math.ceil(cv.height / view.zoom) + 2);
  bmp.width = view.vw;
  bmp.height = view.vh;
  bimg = bctx.createImageData(view.vw, view.vh);
  bpix = new Uint32Array(bimg.data.buffer);
  glowCv.width = Math.max(2, Math.ceil(view.vw / 3));
  glowCv.height = Math.max(2, Math.ceil(view.vh / 3));
  glowImg = glowCtx.createImageData(glowCv.width, glowCv.height);
  glowPix = new Uint32Array(glowImg.data.buffer);
}

function setZoom(z) {
  const floor = Math.ceil(Math.max(3, cv.width / maxViewCells(), cv.height / maxViewRows()));
  view.zoom = Math.max(Math.min(floor, 9), Math.min(9, Math.round(z)));
  allocBuffers();
}

function updateCamera() {
  const tx = player.x - view.vw / 2;
  const ty = player.y - view.vh / 2;
  view.camX += (tx - view.camX) * 0.14;
  view.camY += (ty - view.camY) * 0.14;
  if (view.camX < 0) view.camX = 0;
  if (view.camY < 0) view.camY = 0;
  if (view.camX > W - view.vw) view.camX = W - view.vw;
  if (view.camY > H - view.vh) view.camY = H - view.vh;
  view.ox = Math.floor(view.camX);
  view.oy = Math.floor(view.camY);
}

function shiftCamera(dx, dy) {
  view.camX -= dx;
  view.camY -= dy;
}

function sx(wx) {
  return (wx - view.camX) * view.zoom;
}
function sy(wy) {
  return (wy - view.camY) * view.zoom;
}
function screenToWorld(px, py) {
  return [view.camX + px / view.zoom, view.camY + py / view.zoom];
}

function drawWorldBitmap() {
  const vw = view.vw,
    vh = view.vh,
    ox = view.ox,
    oy = view.oy;
  const gw = glowCv.width;
  glowPix.fill(0);

  for (let y = 0; y < vh; y++) {
    const wy = oy + y;
    const rowBase = wy * W;
    const dst = y * vw;
    let syf = (wy - 4) * 0.125;
    if (syf < 0) syf = 0;
    let fy0 = syf | 0;
    if (fy0 > FCH - 1) fy0 = FCH - 1;
    const fty = syf - fy0;
    const fRowA = fy0 * FCW;
    const fRowB = (fy0 + 1 < FCH ? fy0 + 1 : fy0) * FCW;
    const skyT = wy < surfaceTop ? 1 - wy / Math.max(1, surfaceTop) : 0;
    let bgR, bgG, bgB;
    if (wy < surfaceTop) {
      bgR = (14 + 10 * (1 - skyT)) | 0;
      bgG = (20 + 14 * (1 - skyT)) | 0;
      bgB = (32 + 16 * (1 - skyT)) | 0;
    } else {
      const d = Math.min(1, (wy - surfaceTop) / 260);
      bgR = (13 - 5 * d) | 0;
      bgG = (18 - 7 * d) | 0;
      bgB = (25 - 9 * d) | 0;
    }
    for (let x = 0; x < vw; x++) {
      const wx = ox + x;
      const i = rowBase + wx;
      const m = mat[i];
      let r, g, b;

      let sxf = (wx - 4) * 0.125;
      if (sxf < 0) sxf = 0;
      let fx0 = sxf | 0;
      if (fx0 > FCW - 1) fx0 = FCW - 1;
      const ftx = sxf - fx0;
      const fx1 = fx0 + 1 < FCW ? fx0 + 1 : fx0;
      const vA = fogVal[fRowA + fx0],
        vB = fogVal[fRowA + fx1];
      const vC = fogVal[fRowB + fx0],
        vD = fogVal[fRowB + fx1];
      const vis = (vA + (vB - vA) * ftx) * (1 - fty) + (vC + (vD - vC) * ftx) * fty;

      if (vis < 0.02) {
        const nn = shade[i] & 5;
        bpix[dst + x] = 0xff000000 | ((11 + nn) << 16) | ((8 + nn) << 8) | (6 + nn);
        continue;
      }
      if (ISVOID[m]) {
        const n = (shade[i] & 7) - 3;
        r = bgR + n;
        g = bgG + n;
        b = bgB + n;
      } else {
        const v = palV[m];
        const s = ((shade[i] - 128) * v) >> 7;
        r = palR[m] + s;
        g = palG[m] + s;
        b = palB[m] + s;
        if (SHIMMER[m] === LOOK.FLAME) {
          const l = life[i];
          g = 90 + (l > 60 ? 90 : l + 30);
          r = 250;
          b = 40 + (shade[i] & 31);
        } else if (SHIMMER[m] === LOOK.PULSE) {
          const pulse = Math.sin((simFrame + shade[i]) * 0.05) * 18;
          r = 224 + pulse;
          g = 96 + pulse * 0.7;
          b = 38;
        }
        if (GLOW[m] && vis > 0.35) {
          const gi = ((y / 3) | 0) * gw + ((x / 3) | 0);
          if (gi >= 0 && gi < glowPix.length) {
            const prev = glowPix[gi];
            const pa = (prev >>> 24) & 255;
            if (pa < 235) glowPix[gi] = ((pa + 26) << 24) | (30 << 16) | (100 << 8) | 235;
          }
        }
      }
      if (heatView) {
        const tv = temp[i];
        let k = (tv - 20) / 1380;
        if (k < 0) k = 0;
        else if (k > 1) k = 1;
        let u;
        if (k < 0.35) {
          u = k / 0.35;
          r = 22 + u * 190;
          g = 58 + u * 74;
          b = 126 - u * 62;
        } else {
          u = (k - 0.35) / 0.65;
          r = 212 + u * 43;
          g = 132 + u * 118;
          b = 64 + u * 158;
        }
        const tex = (shade[i] - 128) >> 5;
        r += tex;
        g += tex;
        b += tex;
      }
      if (vis < 0.995) {
        r = 9 + (r - 9) * vis;
        g = 7 + (g - 7) * vis;
        b = 6 + (b - 6) * vis;
      }
      if (r < 0) r = 0;
      else if (r > 255) r = 255;
      if (g < 0) g = 0;
      else if (g > 255) g = 255;
      if (b < 0) b = 0;
      else if (b > 255) b = 255;
      bpix[dst + x] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  }
  bctx.putImageData(bimg, 0, 0);

  const offX = -(view.camX - view.ox) * view.zoom;
  const offY = -(view.camY - view.oy) * view.zoom;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, view.vw, view.vh, offX, offY, view.vw * view.zoom, view.vh * view.zoom);

  glowCtx.putImageData(glowImg, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    glowCv,
    offX - view.zoom * 2,
    offY - view.zoom * 2,
    view.vw * view.zoom + view.zoom * 4,
    view.vh * view.zoom + view.zoom * 4
  );
  ctx.restore();
}

function drawDamage() {
  const z = view.zoom;
  for (let n = 0; n < dmgList.length; n++) {
    const i = dmgList[n];
    const d = dmg[i];
    if (!d) continue;
    const m = mat[i];
    const h = HARD[m];
    if (h <= 0) continue;
    const x = i % W,
      y = (i / W) | 0;
    if (x < view.ox || y < view.oy || x >= view.ox + view.vw || y >= view.oy + view.vh) continue;
    const k = Math.min(1, d / h);
    ctx.fillStyle = `rgba(8,11,16,${0.18 + k * 0.5})`;
    ctx.fillRect(sx(x), sy(y), z, z);
    if (k > 0.45) {
      ctx.fillStyle = uiRgba('sand', (k - 0.45) * 0.5);
      ctx.fillRect(sx(x) + z * 0.35, sy(y) + z * 0.2, Math.max(1, z * 0.3), Math.max(1, z * 0.6));
    }
  }
}

function drawDrone() {
  const pad = padLocal();
  if (market.drone <= 0 || !pad) return;
  const z = view.zoom;
  const lift = Math.abs(1 - (2 * market.drone) / DRONE_TRIP);
  const cx = sx(pad.x + pad.w / 2),
    cy = sy(pad.y - 3 - lift * 36);
  const w = 6 * z,
    h = 2 * z;
  ctx.fillStyle = uiHex('sand');
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.fillStyle = '#c2cad6';
  ctx.fillRect(cx - w / 2 - z, cy - h / 2 - z * 0.6, w + 2 * z, Math.max(1, z * 0.4));
  if (lift > 0.12) return;
  ctx.fillStyle = uiRgba('sand', 0.25);
  ctx.fillRect(sx(pad.x), cy + h / 2, pad.w * z, sy(pad.y + pad.h) - cy - h / 2);
}

function drawObjects() {
  const z = view.zoom;
  for (let n = 0; n < objects.length; n++) {
    const o = objects[n];
    const px = sx(o.x),
      py = sy(o.y);
    const span = objSpan(o);
    const ow = span[0] * z,
      oh = span[1] * z;
    if (px + ow < -20 || py + oh < -20 || px > cv.width + 20 || py > cv.height + 20) continue;

    for (let k = 0; k < o.cells.length; k++) {
      const c = o.cells[k];
      const lift = o.held ? 18 : 0;
      ctx.fillStyle =
        'rgb(' +
        Math.min(255, palR[c.mat] + lift) +
        ',' +
        Math.min(255, palG[c.mat] + lift) +
        ',' +
        Math.min(255, palB[c.mat] + lift) +
        ')';
      ctx.fillRect(sx(o.x + c.dx), sy(o.y + c.dy), z + 1, z + 1);
    }

    ctx.strokeStyle = o.held ? uiRgba('sand', 0.95) : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 0.5, py - 0.5, ow + 1, oh + 1);

    if (o.flash > 0) {
      ctx.fillStyle = `rgba(255,238,200,${o.flash / 14})`;
      ctx.fillRect(px - z * 0.5, py - z * 0.5, ow + z, oh + z);
    }

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

function drawFlowArrow(cx, cy, dx, dy, color) {
  const z = view.zoom;
  const n = Math.sqrt(dx * dx + dy * dy) || 1;
  const ndx = dx / n,
    ndy = dy / n;
  const px = sx(cx),
    py = sy(cy);
  const len = z * 0.36,
    wing = z * 0.24;
  const tx = px + ndx * len,
    ty = py + ndy * len;
  const bx = px - ndx * len * 0.5,
    by = py - ndy * len * 0.5;
  const wx = -ndy * wing,
    wy = ndx * wing;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx + wx, by + wy);
  ctx.lineTo(bx - wx, by - wy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPlayer() {
  const z = view.zoom;
  const px = sx(player.x - player.w / 2),
    py = sy(player.y - player.h / 2);
  const pw = player.w * z,
    ph = player.h * z;

  if (player.drilling) {
    const g = ctx.createLinearGradient(
      sx(player.x),
      sy(player.y),
      sx(player.aimX),
      sy(player.aimY)
    );
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
    const rr = (DRILL_RADIUS + 0.4) * z * (0.9 + Math.sin(simFrame * 0.3) * 0.06);
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
    ctx.fillStyle = uiRgba('flame', 0.35 + Math.random() * 0.35);
    ctx.fillRect(px + pw * 0.2, py + ph, pw * 0.6, z * (0.6 + Math.random()));
  }

  if (player.hp < 100) {
    ctx.fillStyle = '#0d131b';
    ctx.fillRect(px - 1, py - 6, pw + 2, 3);
    ctx.fillStyle = player.hp > 40 ? uiHex('ok') : uiHex('danger');
    ctx.fillRect(px - 1, py - 6, (pw + 2) * (player.hp / 100), 3);
  }

  ctx.fillStyle = '#0d131b';
  ctx.fillRect(px - 1, py + ph + 3, pw + 2, 2);
  ctx.fillStyle = uiHex('aqua');
  ctx.fillRect(px - 1, py + ph + 3, (pw + 2) * (player.fuel / 100), 2);
}

function drawGhost(tool, wx, wy) {
  const ghost = PIECES[tool].ghost;
  if (!ghost) return;
  const z = view.zoom;
  const size = ghost.size;
  const gx = Math.floor(wx - size / 2),
    gy = Math.floor(wy - size / 2);
  const dx = wx - player.x,
    dy = wy - player.y;
  const inReach = Math.sqrt(dx * dx + dy * dy) < REACH + 8;
  const spotMat = matAt(Math.floor(wx), Math.floor(wy));
  const free = ghost.free ? ghost.free(spotMat) : !BLOCKING[spotMat];
  const ok = inReach && free;

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ok ? uiHex('aqua') : uiHex('danger');
  ctx.fillRect(sx(gx), sy(gy), size * z, size * z);
  ctx.restore();
  ctx.strokeStyle = ok ? uiRgba('ok', 0.9) : uiRgba('danger', 0.9);
  ctx.lineWidth = 1;
  ctx.strokeRect(sx(gx) + 0.5, sy(gy) + 0.5, size * z - 1, size * z - 1);
}

var vignette = null;
function drawVignette() {
  if (!vignette || vignette.w !== cv.width) {
    const g = ctx.createRadialGradient(
      cv.width / 2,
      cv.height / 2,
      Math.min(cv.width, cv.height) * 0.32,
      cv.width / 2,
      cv.height / 2,
      Math.max(cv.width, cv.height) * 0.78
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    vignette = { g: g, w: cv.width };
  }
  ctx.fillStyle = vignette.g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  if (player.hp < 50) {
    ctx.fillStyle = uiRgba('alarm', 0.34 * (1 - player.hp / 50));
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
}

function drawResetIcon(cx, cy, r, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r * 0.34);
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.05);
  ctx.stroke();
  const tip = r * 0.62;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - r - tip * 0.7, cy - r * 0.7);
  ctx.lineTo(cx - r + tip * 0.7, cy - r * 0.7);
  ctx.lineTo(cx - r, cy - r * 0.7 + tip);
  ctx.closePath();
  ctx.fill();
}

function drawRoomBins(mouseWorld) {
  const z = view.zoom;
  const hover = roomButtonAt(mouseWorld[0], mouseWorld[1]);
  const size = Math.round(Math.max(8, Math.min(12, z * 1.5)));
  const labelY = sy(roomLabelY()) - 2;
  ctx.save();
  ctx.font = `600 ${size}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let n = 0; n < sandbox.bins.length; n++) {
    const b = sandbox.bins[n];
    const mid = sx(b.x + b.w / 2);
    if (mid < -120 || mid > cv.width + 120) continue;
    const r = roomButtonRect(b);
    const bx = sx(r.x0),
      by = sy(r.y0);
    const bw = (r.x1 - r.x0) * z,
      bh = (r.y1 - r.y0) * z;
    const lit = hover === b;
    ctx.fillStyle = lit ? uiRgba('sand', 0.9) : 'rgba(12,16,22,0.82)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = lit ? uiHex('sandLit') : uiRgba('sand', 0.55);
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    drawResetIcon(
      bx + bw / 2,
      by + bh / 2,
      Math.max(2, bh * 0.24),
      lit ? '#1a1206' : uiHex('sand')
    );

    if (z < 3) continue;
    const name = matLabel(b.id);
    const tw = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(8,11,16,0.72)';
    ctx.fillRect(mid - tw / 2 - 4, labelY - size - 3, tw + 8, size + 6);
    ctx.fillStyle = uiHex('sand');
    ctx.fillText(name, mid, labelY);
  }
  ctx.restore();
}

function render(tool, mouseWorld) {
  updateCamera();
  drawWorldBitmap();
  drawDamage();
  drawPieces();
  drawDrone();
  drawObjects();
  drawPlayer();
  if (PIECES[tool].overlay) PIECES[tool].overlay(mouseWorld);
  if (sandbox.on) drawRoomBins(mouseWorld);
  if (!roomButtonAt(mouseWorld[0], mouseWorld[1])) {
    drawGhost(tool, mouseWorld[0], mouseWorld[1]);
  }
  drawVignette();
}
