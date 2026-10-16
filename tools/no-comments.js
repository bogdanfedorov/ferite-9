const fs = require('node:fs');
const path = require('node:path');

const ROOTS = ['js', 'electron', 'tools'];
const SKIP = new Set(['node_modules', 'app', 'dist', 'release', '.git']);
const KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'case',
  'do',
  'else',
  'yield',
  'await',
  'throw'
]);
const REGEX_AFTER = '([{,;:=!&|?+-*%~^<>';

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

function wordBefore(src, at) {
  let end = at;
  while (end > 0 && /\s/.test(src[end - 1])) end--;
  let start = end;
  while (start > 0 && /[A-Za-z_$]/.test(src[start - 1])) start--;
  return src.slice(start, end);
}

function regexAllowed(src, at) {
  let j = at - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  const c = src[j];
  if (REGEX_AFTER.indexOf(c) !== -1) return true;
  if (/[A-Za-z_$]/.test(c)) return KEYWORDS.has(wordBefore(src, at));
  return false;
}

function skipString(src, at, quote) {
  let i = at + 1;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function skipRegex(src, at) {
  let i = at + 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '\n') return i;
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
    i++;
  }
  return i;
}

function scan(src) {
  const hits = [];
  const frames = [];
  const n = src.length;
  let mode = 'code';
  let depth = 0;
  let i = 0;

  while (i < n) {
    const c = src[i];

    if (mode === 'template') {
      if (c === '\\') {
        i += 2;
      } else if (c === '`') {
        const frame = frames.pop();
        mode = 'code';
        depth = frame ? frame.depth : 0;
        i++;
      } else if (c === '$' && src[i + 1] === '{') {
        frames.push({ kind: 'template', depth: 0 });
        mode = 'code';
        depth = 0;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (c === '`') {
      frames.push({ kind: 'code', depth: depth });
      mode = 'template';
      i++;
    } else if (c === '"' || c === "'") {
      i = skipString(src, i, c);
    } else if (c === '{') {
      depth++;
      i++;
    } else if (c === '}') {
      const top = frames[frames.length - 1];
      if (depth === 0 && top && top.kind === 'template') {
        frames.pop();
        mode = 'template';
      } else {
        depth--;
      }
      i++;
    } else if (c === '/' && src[i + 1] === '/') {
      hits.push(i);
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      hits.push(i);
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
    } else if (c === '/' && regexAllowed(src, i)) {
      i = skipRegex(src, i);
    } else {
      i++;
    }
  }

  return hits;
}

function position(src, offset) {
  let line = 1;
  let start = 0;
  for (let i = 0; i < offset; i++) {
    if (src[i] === '\n') {
      line++;
      start = i + 1;
    }
  }
  return `${line}:${offset - start + 1}`;
}

function main() {
  const files = [];
  for (const root of ROOTS) collect(root, files);

  let total = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const hits = scan(src);
    total += hits.length;
    for (const offset of hits) {
      process.stdout.write(`${file.replace(/\\/g, '/')}:${position(src, offset)} comment\n`);
    }
  }

  if (total > 0) {
    process.stdout.write(
      `\n${total} comment(s) found. Comments are not allowed in this codebase.\n`
    );
    process.exit(1);
  }
  process.stdout.write(`no comments in ${files.length} files\n`);
}

main();
