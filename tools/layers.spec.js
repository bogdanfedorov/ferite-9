const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'tools', 'no-browser-in-core.js');

function pageScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

function layerOf(file) {
  const { SCRIPTS } = require('./layers.js');
  return SCRIPTS.find((s) => s.file === file).layer;
}

function lintSource(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ferit9-lint-'));
  const file = path.join(dir, 'probe.js');
  fs.writeFileSync(file, source);
  return spawnSync(process.execPath, [LINT, file], { cwd: ROOT, encoding: 'utf8' });
}

test('layers tag every page script once, in page order', () => {
  const { SCRIPTS } = require('./layers.js');
  assert.deepStrictEqual(
    SCRIPTS.map((s) => s.file),
    pageScripts()
  );
  for (const s of SCRIPTS) assert.ok(['core', 'mixed', 'shell'].includes(s.layer), s.file);
});

test('layers put sound in the shell, market in the core, i18n in mixed', () => {
  assert.strictEqual(layerOf('js/sound.js'), 'shell');
  assert.strictEqual(layerOf('js/market.js'), 'core');
  assert.strictEqual(layerOf('js/notice.js'), 'core');
  assert.strictEqual(layerOf('js/i18n.js'), 'mixed');
  assert.strictEqual(layerOf('js/PlayerInteract/Build.js'), 'mixed');
});

test('the harness loads exactly the non-shell scripts', () => {
  const { SCRIPTS } = require('./layers.js');
  const { CORE_FILES } = require('../test/core.js');
  const wanted = SCRIPTS.filter((s) => s.layer !== 'shell').map((s) => s.file);
  assert.deepStrictEqual(CORE_FILES, wanted);
});

test('boundary lint passes on the repository', () => {
  const run = spawnSync(process.execPath, [LINT], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
});

test('boundary lint rejects browser and shell names in a core file', () => {
  const run = lintSource("function f() {\n  document.title = 'x';\n  play('sale');\n}\n");
  assert.strictEqual(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /document/);
  assert.match(run.stdout, /play/);
});

test('boundary lint ignores property names and local names', () => {
  const run = lintSource('function g(sx) {\n  const o = { play: 1 };\n  return o.play + sx;\n}\n');
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
});
