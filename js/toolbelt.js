var TOOL_LIST = ['drill', 'hand', 'pad', 'ignite', 'belt', 'wall'];
var STARTER_TOOLS = ['drill', 'hand', 'pad'];
var HOTBAR_SIZE = 8;

var toolbelt = { open: {}, slots: [], picked: null };

function resetToolbelt(everything) {
  const start = everything ? TOOL_LIST : STARTER_TOOLS;
  toolbelt.open = {};
  toolbelt.slots = [];
  toolbelt.picked = null;
  for (let i = 0; i < HOTBAR_SIZE; i++) toolbelt.slots.push(null);
  for (let k = 0; k < start.length; k++) openTool(start[k]);
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

function toolCard(tool) {
  const b = document.createElement('button');
  b.className = 'inv-tool';
  b.type = 'button';
  b.dataset.tool = tool;
  const name = document.createElement('span');
  name.className = 'sname';
  name.setAttribute('data-i18n', `tool.${tool}`);
  const note = document.createElement('span');
  note.className = 'scost';
  b.appendChild(name);
  b.appendChild(note);
  return b;
}

function fillSlotRow(row) {
  const items = row.children;
  for (let i = 0; i < items.length; i++) {
    const tool = slotTool(i);
    const name = items[i].lastChild;
    if (tool) name.setAttribute('data-i18n', `tool.${tool}`);
    else name.removeAttribute('data-i18n');
    name.textContent = tool ? t(`tool.${tool}`) : '';
    items[i].classList.toggle('empty', !tool);
    items[i].classList.toggle('active', tool !== null && tool === game.tool);
    items[i].classList.toggle('picked', tool !== null && tool === toolbelt.picked);
  }
}

function renderToolbelt() {
  el['inv-money'].textContent = `$${market.money}`;
  fillSlotRow(el.hotbar);
  fillSlotRow(el['inv-slots']);
  const cards = el['inv-tools'].children;
  for (let i = 0; i < cards.length; i++) {
    const tool = cards[i].dataset.tool;
    const open = toolOpen(tool);
    cards[i].classList.toggle('locked', !open);
    cards[i].classList.toggle('poor', !open && market.money < TOOL_COST[tool]);
    cards[i].lastChild.textContent = open ? t(`tool.${tool}.cost`) : `$${TOOL_COST[tool]}`;
    cards[i].classList.toggle('picked', tool === toolbelt.picked);
    cards[i].classList.toggle('active', tool === game.tool);
  }
}

function buildToolbelt(onSlot, onInvSlot, onTool) {
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
  for (let k = 0; k < TOOL_LIST.length; k++) {
    const card = toolCard(TOOL_LIST[k]);
    card.addEventListener('click', onTool.bind(null, TOOL_LIST[k]));
    grid.appendChild(card);
  }
  applyI18n(grid);
  refreshKeyLabels();
  renderToolbelt();
}
