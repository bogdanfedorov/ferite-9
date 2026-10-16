var input = {
  keys: { up: false, down: false, left: false, right: false, shift: false },
  mouse: { x: 0, y: 0, over: false, left: false, right: false, pressed: false, clickReq: false }
};

var MOVE_ACTIONS = ['up', 'down', 'left', 'right'];

var KEY_ACTIONS = {
  heat: toggleHeat,
  shape: cycleShapeKey,
  mute: toggleMute,
  help: function () { toggleScreen('help'); },
  settings: function () { toggleScreen('settings'); }
};

function isMove(act) {
  return MOVE_ACTIONS.indexOf(act) >= 0;
}

function releaseMoves() {
  for (var i = 0; i < MOVE_ACTIONS.length; i++) input.keys[MOVE_ACTIONS[i]] = false;
}

function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  refreshSettingsPanel();
  say(t(settings.muted ? 'msg.soundOff' : 'msg.soundOn'));
  if (!settings.muted) play('soundOn');
}

function toggleHeat() {
  heatView = !heatView;
  el['heat-legend'].classList.toggle('hidden', !heatView);
  say(t(heatView ? 'msg.heatOn' : 'msg.heatOff'));
}

function cycleShapeKey() {
  if (game.tool !== 'build') return;
  cycleBuildShape();
  refreshBuildBars();
  say(tf('msg.buildShape', { shape: t('shape.' + buildShape) }));
  play('pickShape');
}

function selectSlot(act) {
  var slot = el['buildbar'].children[+act.slice(4) - 1];
  if (slot) selectTool(slot.dataset.tool);
}

function onEscape() {
  if (!el['help'].classList.contains('hidden')) toggleScreen('help');
  else selectTool('drill');
}

function onKeyDown(e) {
  var c = e.code;
  input.keys.shift = e.shiftKey;
  if (boot.active) {
    if (c === 'Space' || c === 'Enter') e.preventDefault();
    bootKey(c);
    return;
  }
  if (rebinding()) return;
  var act = keyAction(c);
  if (!el['settings'].classList.contains('hidden')) {
    if (c === 'Escape' || act === 'settings') toggleScreen('settings');
    return;
  }
  if (isMove(act)) {
    input.keys[act] = true;
    e.preventDefault();
  }
  if (act.indexOf('slot') === 0) selectSlot(act);
  if (KEY_ACTIONS[act]) KEY_ACTIONS[act]();
  if (c === 'Escape') onEscape();
}

function onKeyUp(e) {
  var act = keyAction(e.code);
  input.keys.shift = e.shiftKey;
  if (isMove(act)) input.keys[act] = false;
}

function trackMouse(canvas, e) {
  var r = canvas.getBoundingClientRect();
  input.mouse.x = e.clientX - r.left;
  input.mouse.y = e.clientY - r.top;
  input.mouse.over = true;
  input.keys.shift = e.shiftKey;
}

function onMouseDown(e) {
  var mouse = input.mouse;
  if (e.button === 0) {
    mouse.left = true;
    mouse.pressed = true;
    mouse.clickReq = true;
  }
  if (e.button === 2) {
    mouse.right = true;
    var w = screenToWorld(mouse.x, mouse.y);
    fireHook(w[0], w[1]);
    play('hook');
  }
}

function onMouseUp(e) {
  if (e.button === 0) {
    input.mouse.left = false;
    input.mouse.pressed = false;
  }
  if (e.button === 2) {
    input.mouse.right = false;
    releaseHook();
  }
}

function onMouseLeave() {
  input.mouse.over = false;
  input.mouse.left = false;
  input.mouse.right = false;
}

function bindCanvas() {
  var canvas = document.getElementById('game');
  canvas.addEventListener('mousemove', function (e) { trackMouse(canvas, e); });
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('mousedown', function (e) {
    trackMouse(canvas, e);
    onMouseDown(e);
  });
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(view.zoom + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });
}

function onBarClick(bar, fn) {
  var items = el[bar].children;
  for (var i = 0; i < items.length; i++) {
    (function (b) { b.addEventListener('click', function () { fn(b.dataset); }); })(items[i]);
  }
}

function pickBody(data) {
  setBuildBody(data.body);
  refreshBuildBars();
  say(tf('msg.buildBody', { body: t('body.' + buildBody) }));
  play('pickBody');
}

function pickShape(data) {
  setBuildShape(data.shape);
  refreshBuildBars();
  play('pickShape');
}

function bindInput() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  bindCanvas();
  onBarClick('buildbar', function (data) { selectTool(data.tool); });
  onBarClick('bodybar', pickBody);
  onBarClick('shapebar', pickShape);
}
