var SETTINGS_KEY = 'ferit9.settings';

var VISION_MODES = ['off', 'protan', 'deutan', 'tritan', 'contrast'];
var VISION_SAMPLE = ['ferrite', 'coal', 'iron', 'glass', 'lava', 'water'];

var CVD_SIM = {
  protan: [0.1121, 0.8853, -0.0005, 0.1127, 0.8897, -0.0001, 0.0045, 0, 1.0019],
  deutan: [0.292, 0.7054, -0.0003, 0.2934, 0.7089, -0.0001, -0.0209, 0.0272, 0.9915],
  tritan: [1, 0.1502, -0.1516, 0, 0.8493, 0.1601, 0, 0.4562, 0.544]
};

var CVD_SPREAD = {
  protan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deutan: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  tritan: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0]
};

var CVD_SAT = { protan: 1.35, deutan: 1.35, tritan: 1.3, contrast: 1.5 };

var UI_NAMES = [
  'sand',
  'sandLit',
  'rust',
  'aqua',
  'hazard',
  'danger',
  'dangerSoft',
  'ok',
  'flame',
  'alarm'
];

var UI_BASE = {
  sand: [224, 168, 82],
  sandLit: [232, 196, 128],
  rust: [181, 80, 44],
  aqua: [67, 162, 157],
  hazard: [242, 193, 78],
  danger: [210, 83, 58],
  dangerSoft: [214, 92, 76],
  ok: [111, 191, 140],
  flame: [240, 170, 70],
  alarm: [160, 40, 26]
};

var UI_RGB = {};
var UI_HEX = {};

var KEY_BINDS = [
  { id: 'up', def: ['KeyW', 'ArrowUp', 'Space'] },
  { id: 'down', def: ['KeyS', 'ArrowDown'] },
  { id: 'left', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', def: ['KeyD', 'ArrowRight'] },
  { id: 'slot1', def: ['Digit1'] },
  { id: 'slot2', def: ['Digit2'] },
  { id: 'slot3', def: ['Digit3'] },
  { id: 'slot4', def: ['Digit4'] },
  { id: 'slot5', def: ['Digit5'] },
  { id: 'slot6', def: ['Digit6'] },
  { id: 'slot7', def: ['Digit7'] },
  { id: 'slot8', def: ['Digit8'] },
  { id: 'inventory', def: ['KeyE'] },
  { id: 'drone', def: ['KeyF'] },
  { id: 'shape', def: ['KeyR'] },
  { id: 'heat', def: ['KeyT'] },
  { id: 'mute', def: ['KeyM'] },
  { id: 'help', def: ['KeyH'] },
  { id: 'settings', def: ['KeyO'] }
];

var KEY_GLYPH = {
  Space: '␣',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '⏎',
  Tab: '⇥',
  Backspace: '⌫',
  Escape: 'Esc',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/'
};

var RESERVED_KEYS = { Escape: 1, ShiftLeft: 1, ShiftRight: 1 };

var settings = {
  muted: false,
  volume: 100,
  grabSize: 4,
  vision: 'off',
  keys: {}
};

var keyMap = {};
var onSettingsChange = null;

function setSettingsHook(fn) {
  onSettingsChange = fn;
}
var settingsStored = true;

function defaultKeys() {
  const out = {};
  for (let i = 0; i < KEY_BINDS.length; i++) out[KEY_BINDS[i].id] = KEY_BINDS[i].def.slice();
  return out;
}

function rebuildKeyMap() {
  keyMap = {};
  for (let i = 0; i < KEY_BINDS.length; i++) {
    const id = KEY_BINDS[i].id;
    const list = settings.keys[id] || [];
    for (let k = 0; k < list.length; k++) keyMap[list[k]] = id;
  }
}

function keyAction(code) {
  return keyMap[code] || '';
}

function keyLabel(code) {
  if (KEY_GLYPH[code]) return KEY_GLYPH[code];
  if (code.indexOf('Key') === 0) return code.slice(3);
  if (code.indexOf('Digit') === 0) return code.slice(5);
  if (code.indexOf('Numpad') === 0) return `Num${code.slice(6)}`;
  return code;
}

function bindText(spec) {
  const ids = spec.split(',');
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    const list = settings.keys[ids[i]] || [];
    if (ids.length === 1) {
      for (let k = 0; k < list.length; k++) out.push(keyLabel(list[k]));
    } else if (list.length) out.push(keyLabel(list[0]));
  }
  return out.length ? out.join(' ') : '—';
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(+v);
  if (!Number.isFinite(n)) return fallback;
  return n < lo ? lo : n > hi ? hi : n;
}

function loadSettings() {
  settings.keys = defaultKeys();
  let raw = null;
  try {
    raw = localStorage.getItem(SETTINGS_KEY);
  } catch (e) {
    raw = null;
  }
  let saved = null;
  if (raw) {
    try {
      saved = JSON.parse(raw);
    } catch (e) {
      saved = null;
    }
  }
  if (!saved) {
    rebuildKeyMap();
    return;
  }

  settings.muted = saved.muted === true;
  settings.volume = clampInt(saved.volume, 0, 100, 100);
  settings.grabSize = clampInt(saved.grabSize, GRAB_MIN, GRAB_MAX, 2);
  if (VISION_MODES.indexOf(saved.vision) >= 0) settings.vision = saved.vision;

  if (saved.keys) {
    for (let i = 0; i < KEY_BINDS.length; i++) {
      const id = KEY_BINDS[i].id;
      const list = saved.keys[id];
      if (!list?.length) continue;
      const clean = [];
      for (let k = 0; k < list.length; k++) {
        if (typeof list[k] === 'string' && !RESERVED_KEYS[list[k]]) clean.push(list[k]);
      }
      if (clean.length) settings.keys[id] = clean;
    }
  }
  rebuildKeyMap();
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    settingsStored = true;
  } catch (e) {
    settingsStored = false;
  }
}

function srgbToLin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linToSrgb(c) {
  let v = c < 0 ? 0 : c > 1 ? 1 : c;
  v = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(v * 255);
}

function punch(v) {
  const out = Math.round(128 + (v - 128) * 1.3);
  return out < 0 ? 0 : out > 255 ? 255 : out;
}

function recolor(r, g, b, mode) {
  if (mode === 'off') return [r, g, b];
  let nr = srgbToLin(r),
    ng = srgbToLin(g),
    nb = srgbToLin(b);
  const sim = CVD_SIM[mode];
  if (sim) {
    const er = nr - (sim[0] * nr + sim[1] * ng + sim[2] * nb);
    const eg = ng - (sim[3] * nr + sim[4] * ng + sim[5] * nb);
    const eb = nb - (sim[6] * nr + sim[7] * ng + sim[8] * nb);
    const sp = CVD_SPREAD[mode];
    nr += sp[0] * er + sp[1] * eg + sp[2] * eb;
    ng += sp[3] * er + sp[4] * eg + sp[5] * eb;
    nb += sp[6] * er + sp[7] * eg + sp[8] * eb;
  }
  const k = CVD_SAT[mode] || 1;
  const lum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
  nr = lum + (nr - lum) * k;
  ng = lum + (ng - lum) * k;
  nb = lum + (nb - lum) * k;
  const out = [linToSrgb(nr), linToSrgb(ng), linToSrgb(nb)];
  if (mode === 'contrast') return [punch(out[0]), punch(out[1]), punch(out[2])];
  return out;
}

function rgbHex(c) {
  return `#${(0x1000000 + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1)}`;
}

function uiHex(name) {
  return UI_HEX[name];
}

function uiRgba(name, a) {
  const c = UI_RGB[name];
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function applyVision() {
  const mode = settings.vision;
  let i;
  for (i = 0; i < MAT_COUNT; i++) {
    if (!MATS[i]) continue;
    const c = recolor(MATS[i].color[0], MATS[i].color[1], MATS[i].color[2], mode);
    palR[i] = c[0];
    palG[i] = c[1];
    palB[i] = c[2];
    palV[i] = MATS[i].grain;
  }
  const root = document.documentElement;
  for (i = 0; i < UI_NAMES.length; i++) {
    const name = UI_NAMES[i];
    const base = UI_BASE[name];
    UI_RGB[name] = recolor(base[0], base[1], base[2], mode);
    UI_HEX[name] = rgbHex(UI_RGB[name]);
    root.style.setProperty(`--${name}`, UI_HEX[name]);
  }
}

var setEl = {};
var visionBtns = [];
var listening = null;

function refreshKeyLabels() {
  const nodes = document.querySelectorAll('[data-bind]');
  for (let i = 0; i < nodes.length; i++) {
    if (listening && nodes[i] === listening.btn) continue;
    nodes[i].textContent = bindText(nodes[i].getAttribute('data-bind'));
  }
}

function rebinding() {
  return listening !== null;
}

function stopListen() {
  if (!listening) return;
  listening.btn.classList.remove('listening');
  listening = null;
  refreshKeyLabels();
}

function startListen(btn, id) {
  stopListen();
  listening = { btn: btn, id: id };
  btn.classList.add('listening');
  btn.textContent = t('set.press');
}

function bindKey(id, code) {
  for (let i = 0; i < KEY_BINDS.length; i++) {
    const other = KEY_BINDS[i].id;
    if (other === id) continue;
    const list = settings.keys[other];
    const at = list.indexOf(code);
    if (at >= 0) list.splice(at, 1);
  }
  settings.keys[id] = [code];
  rebuildKeyMap();
  saveSettings();
  refreshKeyLabels();
}

function captureKey(e) {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  if (RESERVED_KEYS[e.code]) {
    stopListen();
    return;
  }
  bindKey(listening.id, e.code);
  stopListen();
}

function buildKeyRows() {
  const box = setEl.keys;
  box.innerHTML = '';
  for (let i = 0; i < KEY_BINDS.length; i++) {
    const id = KEY_BINDS[i].id;
    const row = document.createElement('div');
    row.className = 'kb-row';
    const name = document.createElement('span');
    name.className = 'kb-name';
    name.setAttribute('data-i18n', `set.key.${id}`);
    const btn = document.createElement('button');
    btn.className = 'kb-key';
    btn.type = 'button';
    btn.setAttribute('data-bind', id);
    row.appendChild(name);
    row.appendChild(btn);
    box.appendChild(row);
    btn.addEventListener(
      'click',
      ((b, k) => () => {
        startListen(b, k);
      })(btn, id)
    );
  }
  applyI18n(box);
}

function markVision() {
  for (let i = 0; i < visionBtns.length; i++) {
    visionBtns[i].btn.classList.toggle('on', visionBtns[i].mode === settings.vision);
  }
}

function setVision(mode) {
  if (VISION_MODES.indexOf(mode) < 0) return;
  settings.vision = mode;
  applyVision();
  markVision();
  saveSettings();
  if (onSettingsChange) onSettingsChange('vision');
}

function buildVisionOptions() {
  const box = setEl.vision;
  box.innerHTML = '';
  visionBtns = [];
  for (let i = 0; i < VISION_MODES.length; i++) {
    const mode = VISION_MODES[i];
    const btn = document.createElement('button');
    btn.className = 'vis-btn';
    btn.type = 'button';
    const strip = document.createElement('span');
    strip.className = 'vis-strip';
    for (let k = 0; k < VISION_SAMPLE.length; k++) {
      const col = MATS[matId(VISION_SAMPLE[k])].color;
      const sw = document.createElement('i');
      sw.style.background = rgbHex(recolor(col[0], col[1], col[2], mode));
      strip.appendChild(sw);
    }
    const name = document.createElement('span');
    name.className = 'vis-name';
    name.setAttribute('data-i18n', `set.vision.${mode}`);
    btn.appendChild(strip);
    btn.appendChild(name);
    box.appendChild(btn);
    visionBtns.push({ mode: mode, btn: btn });
    btn.addEventListener(
      'click',
      ((m) => () => {
        setVision(m);
      })(mode)
    );
  }
  applyI18n(box);
  markVision();
}

function showGrabValue() {
  setEl.grabVal.textContent = `${settings.grabSize}×${settings.grabSize}`;
  setEl.grabNote.textContent = tf('set.grabNote', {
    n: settings.grabSize,
    cells: settings.grabSize * settings.grabSize
  });
}

function showVolumeValue() {
  setEl.volumeVal.textContent = settings.volume;
  setEl.volume.disabled = settings.muted;
  setEl.mute.checked = settings.muted;
}

function refreshSettingsPanel() {
  setEl.grab.value = settings.grabSize;
  setEl.volume.value = settings.volume;
  showGrabValue();
  showVolumeValue();
  markVision();
  if (setEl.world) setEl.world.textContent = t(sandbox.on ? 'set.worldRoom' : 'set.worldMine');
  refreshKeyLabels();
}

function bindSettingsPanel() {
  setEl.mute.addEventListener('change', () => {
    settings.muted = setEl.mute.checked;
    showVolumeValue();
    saveSettings();
    if (onSettingsChange) onSettingsChange('muted');
  });

  setEl.volume.addEventListener('input', () => {
    settings.volume = clampInt(setEl.volume.value, 0, 100, 100);
    showVolumeValue();
    if (onSettingsChange) onSettingsChange('volume');
  });
  setEl.volume.addEventListener('change', saveSettings);

  setEl.grab.addEventListener('input', () => {
    settings.grabSize = clampInt(setEl.grab.value, GRAB_MIN, GRAB_MAX, 2);
    showGrabValue();
  });
  setEl.grab.addEventListener('change', () => {
    saveSettings();
    if (onSettingsChange) onSettingsChange('grabSize');
  });

  setEl.reset.addEventListener('click', () => {
    stopListen();
    settings.keys = defaultKeys();
    rebuildKeyMap();
    saveSettings();
    refreshKeyLabels();
  });

  window.addEventListener('keydown', captureKey, true);
}

function initSettings() {
  loadSettings();
  applyVision();

  setEl.mute = document.getElementById('set-mute');
  setEl.volume = document.getElementById('set-volume');
  setEl.volumeVal = document.getElementById('set-volume-val');
  setEl.grab = document.getElementById('set-grab');
  setEl.grabVal = document.getElementById('set-grab-val');
  setEl.grabNote = document.getElementById('set-grab-note');
  setEl.vision = document.getElementById('set-vision');
  setEl.keys = document.getElementById('set-keys');
  setEl.reset = document.getElementById('set-keys-reset');
  setEl.world = document.getElementById('set-world');

  setEl.grab.min = GRAB_MIN;
  setEl.grab.max = GRAB_MAX;

  buildVisionOptions();
  buildKeyRows();
  bindSettingsPanel();
  refreshSettingsPanel();
}
