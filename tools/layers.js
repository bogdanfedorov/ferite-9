const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SHELL = [
  'js/settings.js',
  'js/disk.js',
  'js/lore.js',
  'js/sound.js',
  'js/render.js',
  'js/hud.js',
  'js/input.js',
  'js/game.js'
];
const MIXED = [
  'js/i18n.js',
  'js/PlayerInteract/Build.js',
  'js/PlayerInteract/Toolbelt.js',
  'js/PlayerInteract/Tools/',
  'js/PlayerInteract/Buildings/'
];

function layerOf(file) {
  if (SHELL.includes(file)) return 'shell';
  if (MIXED.some((prefix) => file.startsWith(prefix))) return 'mixed';
  return 'core';
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPTS = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => ({
  file: m[1],
  layer: layerOf(m[1])
}));

module.exports = { ROOT, SCRIPTS };
