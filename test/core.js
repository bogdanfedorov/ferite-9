const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SHELL = new Set([
  'js/settings.js',
  'js/lore.js',
  'js/sound.js',
  'js/render.js',
  'js/hud.js',
  'js/input.js',
  'js/game.js'
]);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CORE_FILES = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
  .map((m) => m[1])
  .filter((file) => !SHELL.has(file));

for (const file of CORE_FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}

module.exports = { core: globalThis, CORE_FILES };
