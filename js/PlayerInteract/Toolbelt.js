var HOTBAR_SIZE = 8;

var toolbelt = { open: {}, level: {}, slots: [], picked: null };
var toolbeltDrawn = '';

function resetToolbelt(everything) {
  toolbelt.open = {};
  toolbelt.level = {};
  toolbelt.slots = [];
  toolbelt.picked = null;
  for (let i = 0; i < HOTBAR_SIZE; i++) toolbelt.slots.push(null);
  for (let k = 0; k < PIECE_IDS.length; k++) {
    if (everything || !PIECES[PIECE_IDS[k]].cost) openTool(PIECE_IDS[k]);
  }
}

function toolOpen(name) {
  return toolbelt.open[name] === true;
}

function openTool(name) {
  if (toolOpen(name)) return false;
  toolbelt.open[name] = true;
  if (toolbelt.slots.indexOf(name) < 0) {
    const free = toolbelt.slots.indexOf(null);
    if (free >= 0) toolbelt.slots[free] = name;
  }
  return true;
}

function levelOf(name) {
  return toolbelt.level[name] || 0;
}

function pieceStats(name) {
  const levels = PIECES[name].levels;
  return levels ? levels[levelOf(name)] : {};
}

function nextLevelOf(name) {
  const levels = PIECES[name].levels;
  return levels && levelOf(name) + 1 < levels.length ? levels[levelOf(name) + 1] : null;
}

function spend(cost) {
  if (market.money < cost) {
    notice('denied', tf('msg.cantAfford', { cost: cost }));
    return false;
  }
  market.money -= cost;
  return true;
}

function buyTool(name) {
  if (!spend(pieceCost(name))) return;
  openTool(name);
  notice('unlock', tf('msg.bought', { tool: t(PIECES[name].hud.name) }));
}

function upgradePiece(name) {
  const next = nextLevelOf(name);
  if (!toolOpen(name) || !next || !spend(next.cost)) return;
  toolbelt.level[name]++;
  const vars = { tool: t(PIECES[name].hud.name), level: levelOf(name) + 1 };
  notice('unlock', tf('msg.upgraded', vars));
}

function toolbeltKey() {
  return JSON.stringify([
    market.money,
    toolbelt.open,
    toolbelt.level,
    toolbelt.slots,
    toolbelt.picked
  ]);
}

function slotTool(i) {
  return toolbelt.slots[i] || null;
}

function assignSlot(i, name) {
  if (i < 0 || i >= HOTBAR_SIZE || !toolOpen(name)) return;
  const was = toolbelt.slots.indexOf(name);
  if (was >= 0) toolbelt.slots[was] = toolbelt.slots[i];
  toolbelt.slots[i] = name;
}

function pickForSlot(name) {
  toolbelt.picked = toolOpen(name) ? name : null;
}

function placePicked(i) {
  if (!toolbelt.picked) {
    toolbelt.picked = slotTool(i);
    return false;
  }
  assignSlot(i, toolbelt.picked);
  toolbelt.picked = null;
  return true;
}

function slotButton(i) {
  const b = document.createElement('button');
  b.className = 'slot';
  b.type = 'button';
  b.dataset.slot = i;
  const key = document.createElement('kbd');
  key.setAttribute('data-bind', `slot${i + 1}`);
  const name = document.createElement('span');
  name.className = 'sname';
  b.appendChild(key);
  b.appendChild(name);
  return b;
}

function cardPart(card, tag, cls) {
  const node = document.createElement(tag);
  node.className = cls;
  card.appendChild(node);
  return node;
}

function toolCard(id, onUpgrade) {
  const hud = PIECES[id].hud;
  const b = document.createElement('button');
  b.className = 'inv-tool';
  b.type = 'button';
  b.dataset.tool = id;
  cardPart(b, 'span', 'sicon').textContent = hud.icon;
  const name = cardPart(b, 'span', 'sname');
  name.setAttribute('data-i18n', hud.name);
  cardPart(b, 'span', 'scost');
  cardPart(b, 'span', 'slvl');
  const up = cardPart(b, 'span', 'sup');
  up.addEventListener('click', (e) => {
    e.stopPropagation();
    onUpgrade(id);
  });
  return b;
}

function fillSlotRow(row) {
  const items = row.children;
  for (let i = 0; i < items.length; i++) {
    const tool = slotTool(i);
    const name = items[i].lastChild;
    if (tool) name.setAttribute('data-i18n', PIECES[tool].hud.name);
    else name.removeAttribute('data-i18n');
    name.textContent = tool ? t(PIECES[tool].hud.name) : '';
    items[i].classList.toggle('empty', !tool);
    items[i].classList.toggle('active', tool !== null && tool === game.tool);
    items[i].classList.toggle('picked', tool !== null && tool === toolbelt.picked);
  }
}

function upgradeLabel(name) {
  const next = nextLevelOf(name);
  if (!toolOpen(name) || !next) return '';
  return tf('ui.upgrade', { level: levelOf(name) + 2, cost: next.cost });
}

function renderCard(card) {
  const tool = card.dataset.tool;
  const open = toolOpen(tool);
  const levels = PIECES[tool].levels;
  const next = nextLevelOf(tool);
  card.classList.toggle('locked', !open);
  card.classList.toggle('poor', !open && market.money < pieceCost(tool));
  card.classList.toggle('picked', tool === toolbelt.picked);
  card.classList.toggle('active', tool === game.tool);
  const note = card.querySelector('.scost');
  note.textContent = open ? t(PIECES[tool].hud.desc) : `$${pieceCost(tool)}`;
  card.querySelector('.slvl').textContent =
    levels && open ? tf('ui.level', { level: levelOf(tool) + 1 }) : '';
  const up = card.querySelector('.sup');
  up.textContent = upgradeLabel(tool);
  up.classList.toggle('poor', next !== null && market.money < next.cost);
}

function renderToolbelt() {
  toolbeltDrawn = toolbeltKey();
  el['inv-money'].textContent = `$${market.money}`;
  fillSlotRow(el.hotbar);
  fillSlotRow(el['inv-slots']);
  const cards = el['inv-tools'].children;
  for (let i = 0; i < cards.length; i++) renderCard(cards[i]);
}

function buildToolbelt(onSlot, onInvSlot, onTool, onUpgrade) {
  const rows = [
    [el.hotbar, onSlot],
    [el['inv-slots'], onInvSlot]
  ];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r][0];
    row.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const b = slotButton(i);
      b.addEventListener('click', rows[r][1].bind(null, i));
      row.appendChild(b);
    }
  }
  const grid = el['inv-tools'];
  grid.innerHTML = '';
  for (let k = 0; k < PIECE_IDS.length; k++) {
    const card = toolCard(PIECE_IDS[k], onUpgrade);
    card.addEventListener('click', onTool.bind(null, PIECE_IDS[k]));
    grid.appendChild(card);
  }
  applyI18n(grid);
  refreshKeyLabels();
  renderToolbelt();
}
