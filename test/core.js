const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, SCRIPTS } = require('../tools/layers.js');

const CORE_FILES = SCRIPTS.filter((s) => s.layer !== 'shell').map((s) => s.file);

for (const file of CORE_FILES) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}

module.exports = { core: globalThis, CORE_FILES };
