var HUD_IDS = [
  'goal-list',
  'launch',
  'tip',
  'intro',
  'help',
  'settings',
  'win',
  'buildbar',
  'bodybar',
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
  'vital-fuel',
  'w-time',
  'w-cargo',
  'w-drilled',
  'w-lost',
  'slot-build'
];

var el = {};
var hud = { msg: '', msgT: 0, lastVals: {}, goalRows: [] };

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

function say(text) {
  hud.msg = text;
  hud.msgT = 150;
}

function tickSay() {
  if (hud.msgT > 0) hud.msgT--;
}

function goalRow(c) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.setAttribute('data-i18n', c.label);
  const num = document.createElement('b');
  num.className = 'mono';
  const have = document.createElement('span');
  have.textContent = '0';
  num.appendChild(have);
  num.appendChild(document.createTextNode(`/${c.need}`));
  const box = document.createElement('div');
  box.className = 'bar';
  const fill = document.createElement('div');
  box.appendChild(fill);
  li.appendChild(name);
  li.appendChild(num);
  li.appendChild(box);
  return { c: c, li: li, have: have, fill: fill };
}

function buildGoalPanel() {
  const list = el['goal-list'];
  list.innerHTML = '';
  hud.goalRows = [];
  const want = questDeliver();
  for (let i = 0; i < want.length; i++) {
    const row = goalRow(want[i]);
    list.appendChild(row.li);
    hud.goalRows.push(row);
  }
  applyI18n(list);
}

function updateGoalPanel() {
  for (let i = 0; i < hud.goalRows.length; i++) {
    const r = hud.goalRows[i];
    const n = Math.min(cargo[r.c.key] || 0, r.c.need);
    const done = n >= r.c.need;
    if (r.have.textContent !== `${n}`) r.have.textContent = n;
    r.fill.style.width = `${(n / r.c.need) * 100}%`;
    r.fill.classList.toggle('done', done);
    r.li.classList.toggle('done', done);
  }
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

function updateTip() {
  const warn = hud.msgT > 0;
  el.tip.textContent = warn ? hud.msg : t(`tip.${game.tool}`);
  el.tip.parentNode.classList.toggle('warn', warn);
}

function updateHud(wpt) {
  updatePlate();
  setMeter('hp', player.hp);
  setMeter('fuel', player.fuel);
  updateGoalPanel();
  el.launch.disabled = !questDone() || game.launched;
  updateProbe(wpt);
  updateTip();
}

function refreshToolBar() {
  const slots = el.buildbar.children;
  for (let i = 0; i < slots.length; i++) {
    slots[i].classList.toggle('active', slots[i].dataset.tool === game.tool);
  }
  const building = game.tool === 'build';
  el.bodybar.classList.toggle('hidden', !building);
  el.shapebar.classList.toggle('hidden', !building);
  if (building) refreshBuildBars();
}

function refreshBuildBars() {
  const bodies = el.bodybar.children;
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].classList.toggle('active', bodies[i].dataset.body === buildBody);
  }
  const allowed = shapesOfBody();
  const shapes = el.shapebar.children;
  for (let k = 0; k < shapes.length; k++) {
    const name = shapes[k].dataset.shape;
    shapes[k].classList.toggle('hidden', allowed.indexOf(name) < 0);
    shapes[k].classList.toggle('active', name === buildShape);
  }
}

function showBuilderUnlocked(on) {
  el['slot-build'].classList.toggle('locked', !on);
}
