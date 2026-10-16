var input = {
  keys: { up: false, down: false, left: false, right: false, shift: false },
  mouse: {
    x: 0,
    y: 0,
    over: false,
    left: false,
    right: false,
    pressed: false,
    rightPressed: false,
    clickReq: false
  }
};

var MOVE_ACTIONS = ['up', 'down', 'left', 'right'];

var KEY_ACTIONS = {
  heat: toggleHeat,
  shape: cycleShapeKey,
  mute: toggleMute,
  drone: () => {
    callDrone();
  },
  inventory: () => {
    toggleInventory();
  },
  help: () => {
    toggleScreen('help');
  },
  settings: () => {
    toggleScreen('settings');
  }
};

function isMove(act) {
  return MOVE_ACTIONS.indexOf(act) >= 0;
}

function releaseMoves() {
  for (let i = 0; i < MOVE_ACTIONS.length; i++) input.keys[MOVE_ACTIONS[i]] = false;
}

function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  refreshSettingsPanel();
  say(t(settings.muted ? 'msg.soundOff' : 'msg.soundOn'));
  if (!settings.muted) play('soundOn');
}

function toggleHeat() {
  const on = toggleHeatView();
  el['heat-legend'].classList.toggle('hidden', !on);
  say(t(on ? 'msg.heatOn' : 'msg.heatOff'));
}

function cycleShapeKey() {
  if (!isBuilding(game.tool) || shapesOfBuilding().length < 2) return;
  cycleBuildShape();
  refreshShapeBar();
  say(tf('msg.buildShape', { shape: t(`shape.${buildShape}`) }));
  play('pickShape');
}

function onEscape() {
  if (!el.help.classList.contains('hidden')) toggleScreen('help');
  else selectTool('drill');
}

function onKeyDown(e) {
  const c = e.code;
  input.keys.shift = e.shiftKey;
  if (boot.active) {
    if (c === 'Space' || c === 'Enter') e.preventDefault();
    bootKey(c);
    return;
  }
  if (rebinding()) return;
  const act = keyAction(c);
  if (!el.settings.classList.contains('hidden')) {
    if (c === 'Escape' || act === 'settings') toggleScreen('settings');
    return;
  }
  if (!el.inventory.classList.contains('hidden')) {
    onInventoryKey(c, act);
    return;
  }
  if (isMove(act)) {
    input.keys[act] = true;
    e.preventDefault();
  }
  if (act.indexOf('slot') === 0) selectSlot(slotIndex(act));
  if (KEY_ACTIONS[act]) KEY_ACTIONS[act]();
  if (c === 'Escape') onEscape();
}

function slotIndex(act) {
  return +act.slice(4) - 1;
}

function onInventoryKey(c, act) {
  if (c === 'Escape' || act === 'inventory') toggleInventory();
  else if (act.indexOf('slot') === 0) invSlot(slotIndex(act));
}

function onKeyUp(e) {
  const act = keyAction(e.code);
  input.keys.shift = e.shiftKey;
  if (isMove(act)) input.keys[act] = false;
}

function trackMouse(canvas, e) {
  const r = canvas.getBoundingClientRect();
  input.mouse.x = e.clientX - r.left;
  input.mouse.y = e.clientY - r.top;
  input.mouse.over = true;
  input.keys.shift = e.shiftKey;
}

function onMouseDown(e) {
  const mouse = input.mouse;
  if (e.button === 0) {
    mouse.left = true;
    mouse.pressed = true;
    mouse.clickReq = true;
  }
  if (e.button === 2) {
    mouse.right = true;
    mouse.rightPressed = true;
  }
}

function onMouseUp(e) {
  if (e.button === 0) {
    input.mouse.left = false;
    input.mouse.pressed = false;
  }
  if (e.button === 2) input.mouse.right = false;
}

function onMouseLeave() {
  input.mouse.over = false;
  input.mouse.left = false;
  input.mouse.right = false;
}

function bindCanvas() {
  const canvas = document.getElementById('game');
  canvas.addEventListener('mousemove', (e) => {
    trackMouse(canvas, e);
  });
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('mousedown', (e) => {
    trackMouse(canvas, e);
    onMouseDown(e);
  });
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setZoom(view.zoom + (e.deltaY < 0 ? 1 : -1));
    },
    { passive: false }
  );
}

function onBarClick(bar, fn) {
  const items = el[bar].children;
  for (let i = 0; i < items.length; i++) {
    ((b) => {
      b.addEventListener('click', () => {
        fn(b.dataset);
      });
    })(items[i]);
  }
}

function pickShape(data) {
  setBuildShape(data.shape);
  refreshShapeBar();
  play('pickShape');
}

function bindInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  bindCanvas();
  onBarClick('shapebar', pickShape);
}
