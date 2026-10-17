const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

const ROOTS = ['js', 'electron', 'tools', 'test'];
const SKIP = new Set(['node_modules', 'app', 'dist', 'release', '.git']);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression'
]);

function collect(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) collect(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function parse(file) {
  const src = fs.readFileSync(file, 'utf8');
  const ast = acorn.parse(src, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowHashBang: true,
    allowReturnOutsideFunction: true,
    locations: true
  });
  return ast;
}

function children(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === 'string') out.push(item);
    } else if (value && typeof value.type === 'string') {
      out.push(value);
    }
  }
  return out;
}

function declaredFunction(node) {
  if (node.type === 'FunctionDeclaration' && node.id) return node;
  if (node.type === 'VariableDeclarator' && node.init && FUNCTION_TYPES.has(node.init.type)) {
    return node.init;
  }
  return null;
}

function walk(file, node, owner, decls, refs) {
  let inner = owner;
  if (declaredFunction(node)) {
    inner = { file, name: node.id.name, line: node.loc.start.line };
    decls.push(inner);
  }
  if (node.type === 'Identifier') refs.push({ name: node.name, owner });
  for (const child of children(node)) {
    if (child !== node.id || inner === owner) walk(file, child, inner, decls, refs);
  }
}

function liveNames(refs) {
  const live = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const ref of refs) {
      if (live.has(ref.name)) continue;
      if (ref.owner && (ref.owner.name === ref.name || !live.has(ref.owner.name))) continue;
      live.add(ref.name);
      grew = true;
    }
  }
  return live;
}

function main() {
  const files = [];
  for (const root of ROOTS) collect(root, files);

  const decls = [];
  const refs = [];
  for (const file of files) walk(file, parse(file), null, decls, refs);

  const live = liveNames(refs);
  const dead = decls.filter((decl) => !live.has(decl.name));
  for (const decl of dead) {
    process.stdout.write(
      `${decl.file.replace(/\\/g, '/')}:${decl.line} ${decl.name} never called\n`
    );
  }

  if (dead.length > 0) {
    process.stdout.write(
      `\n${dead.length} uncalled function(s). Every function needs a caller in the same change.\n`
    );
    process.exit(1);
  }
  process.stdout.write(`no uncalled functions in ${files.length} files\n`);
}

main();
