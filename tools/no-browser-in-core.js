const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const { ROOT, SCRIPTS } = require('./layers.js');

const BROWSER = [
  'document',
  'window',
  'localStorage',
  'indexedDB',
  'requestAnimationFrame',
  'performance',
  'Audio',
  'AudioContext'
];
const BINDING_PARENTS = new Set([
  'VariableDeclarator',
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'CatchClause',
  'ClassDeclaration'
]);
const BINDING_KEYS = new Set(['id', 'params', 'param']);

function parse(file) {
  return acorn.parse(fs.readFileSync(file, 'utf8'), {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true
  });
}

function walk(node, parent, key, visit) {
  visit(node, parent, key);
  for (const k of Object.keys(node)) {
    const value = node[k];
    const list = Array.isArray(value) ? value : [value];
    for (const child of list) {
      if (child && typeof child.type === 'string') walk(child, node, k, visit);
    }
  }
}

function isPropertyName(parent, key) {
  if (parent.computed) return false;
  if (parent.type === 'MemberExpression') return key === 'property';
  if (parent.type === 'Property') return key === 'key' && !parent.shorthand;
  return key === 'key' && /Method|PropertyDefinition/.test(parent.type);
}

function topLevelNames(file) {
  const names = [];
  for (const node of parse(path.join(ROOT, file)).body) {
    if (node.type === 'FunctionDeclaration') names.push(node.id.name);
    if (node.type !== 'VariableDeclaration') continue;
    for (const decl of node.declarations) names.push(decl.id.name);
  }
  return names;
}

function forbiddenNames() {
  const names = new Map(BROWSER.map((name) => [name, 'the browser']));
  for (const s of SCRIPTS) {
    if (s.layer !== 'shell') continue;
    for (const name of topLevelNames(s.file)) names.set(name, s.file);
  }
  return names;
}

function violations(file, forbidden) {
  const own = new Set();
  const used = [];
  walk(parse(file), null, null, (node, parent, key) => {
    if (node.type !== 'Identifier' || !parent || isPropertyName(parent, key)) return;
    if (BINDING_PARENTS.has(parent.type) && BINDING_KEYS.has(key)) own.add(node.name);
    else if (forbidden.has(node.name)) used.push(node);
  });
  return used.filter((node) => !own.has(node.name));
}

function main() {
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : SCRIPTS.filter((s) => s.layer === 'core').map((s) => path.join(ROOT, s.file));
  const forbidden = forbiddenNames();
  let count = 0;
  for (const file of files) {
    for (const node of violations(file, forbidden)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      process.stdout.write(
        `${rel}:${node.loc.start.line} ${node.name} from ${forbidden.get(node.name)}\n`
      );
      count++;
    }
  }
  if (count > 0) {
    process.stdout.write(`\n${count} core reference(s) to the browser or the shell.\n`);
    process.exit(1);
  }
  process.stdout.write(`no browser or shell references in ${files.length} core files\n`);
}

main();
