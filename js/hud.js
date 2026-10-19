var HUD_IDS = [
  'market-list',
  'market-sum',
  'money',
  'drone-btn',
  'pause',
  'intro',
  'help',
  'settings',
  'hotbar',
  'inventory',
  'inv-tools',
  'inv-slots',
  'inv-money',
  'shapebar',
  'probe-chip',
  'probe-mat',
  'probe-t',
  'probe-mark',
  'heat-legend',
  'hp-num',
  'hp-fill',
  'fuel-num',
  'fuel-fill',
  'vital-hp',
  'vital-fuel'
];

var el = {};
var hud = { lastVals: {}, marketRows: [] };

function grabHud() {
  for (let i = 0; i < HUD_IDS.length; i++) el[HUD_IDS[i]] = document.getElementById(HUD_IDS[i]);
}

function setVal(id, v) {
  if (hud.lastVals[id] === v) return;
  hud.lastVals[id] = v;
  el[id].textContent = v;
}

function forgetHudVals() {
  hud.lastVals = {};
}

function marketRow(good) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.setAttribute('data-i18n', `mat.${good.key}`);
  const count = document.createElement('span');
  count.className = 'mono mk-count';
  const price = document.createElement('b');
  price.className = 'mono';
  const box = document.createElement('div');
  box.className = 'bar';
  const fill = document.createElement('div');
  box.appendChild(fill);
  li.appendChild(name);
  li.appendChild(count);
  li.appendChild(price);
  li.appendChild(box);
  return { good: good, li: li, count: count, price: price, fill: fill };
}

function buildMarketPanel() {
  const list = el['market-list'];
  list.innerHTML = '';
  hud.marketRows = [];
  for (let i = 0; i < GOODS.length; i++) {
    const row = marketRow(GOODS[i]);
    list.appendChild(row.li);
    hud.marketRows.push(row);
  }
  applyI18n(list);
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function droneLabel(value) {
  if (market.drone > 0) return t('ui.droneBusy');
  const refusal = PAD_REFUSAL[padState()];
  if (refusal) return t(refusal);
  if (market.money < DRONE_FEE) return tf('ui.dronePoor', { fee: DRONE_FEE });
  return tf('ui.drone', { fee: DRONE_FEE, sum: value });
}

function updateMarketPanel() {
  const counts = sweepPad(false);
  for (let i = 0; i < hud.marketRows.length; i++) {
    const r = hud.marketRows[i];
    const n = counts[r.good.key] || 0;
    const price = priceOf(r.good);
    setText(r.count, n ? `×${n}` : '');
    setText(r.price, `$${price}`);
    r.fill.style.width = `${Math.min(100, (price / r.good.base) * 100)}%`;
    r.li.classList.toggle('stocked', n > 0);
  }
  const value = payoutOf(counts);
  setVal('money', `$${market.money}`);
  setVal('market-sum', tf('ui.inZone', { sum: value }));
  const ready = market.drone <= 0 && padState() === 'ready' && market.money >= DRONE_FEE;
  el['drone-btn'].disabled = !ready;
  el['drone-btn'].classList.toggle('worth', ready && value > DRONE_FEE);
  setVal('drone-btn', droneLabel(value));
}

function setMeter(name, value) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  setVal(`${name}-num`, v);
  el[`${name}-fill`].style.width = `${v}%`;
  const box = el[`vital-${name}`];
  box.classList.toggle('warn', v <= 50 && v > 25);
  box.classList.toggle('crit', v <= 25);
}

function placeProbe(chip) {
  const mouse = input.mouse;
  const w = chip.offsetWidth || 120,
    h = chip.offsetHeight || 26;
  const flipX = mouse.x + w + 26 > window.innerWidth;
  const flipY = mouse.y + h + 26 > window.innerHeight;
  chip.style.left = `${mouse.x}px`;
  chip.style.top = `${mouse.y}px`;
  chip.style.transform = `translate(${flipX ? -w - 14 : 14}px,${flipY ? -h - 14 : 14}px)`;
}

function updateProbe(wpt) {
  const chip = el['probe-chip'];
  if (!input.mouse.over || game.paused) {
    chip.classList.add('hidden');
    return;
  }
  const cx = Math.floor(wpt[0]),
    cy = Math.floor(wpt[1]);
  const tv = Math.round(tempAt(cx, cy));
  setVal('probe-mat', matLabel(matAt(cx, cy)));
  setVal('probe-t', tv);
  chip.classList.toggle('hot', tv > 120);
  chip.classList.remove('hidden');
  placeProbe(chip);
  if (heatView) {
    const k = Math.max(0, Math.min(1, (tv - 20) / 1380));
    el['probe-mark'].style.left = `${k * 100}%`;
  }
}

function updateHud(wpt) {
  updatePlate();
  setMeter('hp', player.hp);
  setMeter('fuel', player.fuel);
  updateMarketPanel();
  updateProbe(wpt);
}

function refreshShapeBar() {
  const allowed = isBuilding(game.tool) ? shapesOfBuilding() : [];
  el.shapebar.classList.toggle('hidden', allowed.length < 2);
  const shapes = el.shapebar.children;
  for (let k = 0; k < shapes.length; k++) {
    const name = shapes[k].dataset.shape;
    shapes[k].classList.toggle('hidden', allowed.indexOf(name) < 0);
    shapes[k].classList.toggle('active', name === buildShape);
  }
}

function buildShapeBar() {
  const bar = el.shapebar;
  bar.innerHTML = '';
  for (const name in SHAPES) {
    const b = document.createElement('button');
    b.className = 'shape';
    b.dataset.shape = name;
    b.setAttribute('data-i18n', `shape.${name}`);
    bar.appendChild(b);
  }
  applyI18n(bar);
}
