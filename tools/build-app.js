const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const Obfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'app');

const FILES = [
  'js/i18n.js',
  'js/lang/uk.js',
  'js/lang/en.js',
  'js/lang/pl.js',
  'js/materials.data.js',
  'js/materials.js',
  'js/settings.js',
  'js/quest.js',
  'js/lore.js',
  'js/world.js',
  'js/objects.js',
  'js/build.js',
  'js/sandbox.js',
  'js/player.js',
  'js/render.js',
  'js/game.js'
];

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'mangled-shuffled',
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  transformObjectKeys: false,
  unicodeEscapeSequence: false
};

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

async function build() {
  const started = Date.now();
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  let raw = '';
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) throw new Error('Немає файлу: ' + f);
    raw += '\n;/* ' + f + ' */\n' + fs.readFileSync(p, 'utf8');
  }
  const rawSize = Buffer.byteLength(raw);

  const min = await minify(raw, {
    ecma: 2018,
    compress: { passes: 2, toplevel: true, drop_console: true },
    mangle: { toplevel: true },
    format: { comments: false }
  });
  if (min.error) throw min.error;

  const obf = Obfuscator.obfuscate(min.code, OBFUSCATOR_OPTIONS).getObfuscatedCode();
  fs.writeFileSync(path.join(OUT, 'bundle.js'), obf, 'utf8');

  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/\n?<script src="js\/[^"]+"><\/script>/g, '');
  html = html.replace('</body>', '<script src="bundle.js"></script>\n</body>');

  const fontsDir = path.join(ROOT, 'fonts');
  const hasFonts = fs.existsSync(path.join(fontsDir, 'fonts.css')) &&
    fs.readdirSync(fontsDir).some((f) => f.toLowerCase().endsWith('.woff2'));
  if (hasFonts) {
    fs.cpSync(fontsDir, path.join(OUT, 'fonts'), { recursive: true });
    html = html
      .replace(/\n?\s*<link rel="preconnect"[^>]*>/g, '')
      .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/,
        '<link rel="stylesheet" href="fonts/fonts.css">');
    console.log('шрифти · вшито локально з fonts/');
  } else {
    console.warn('шрифти · fonts/fonts.css немає — гра тягтиме Google Fonts, офлайн буде фолбек');
    console.warn('           виправити: node tools/fetch-fonts.js');
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');

  fs.copyFileSync(path.join(ROOT, 'style.css'), path.join(OUT, 'style.css'));
  fs.copyFileSync(path.join(ROOT, 'icon.png'), path.join(OUT, 'icon.png'));

  const outSize = Buffer.byteLength(obf);
  console.log(
    'app/ зібрано за ' + (Date.now() - started) + ' мс · ' +
    Math.round(rawSize / 1024) + ' КБ джерел → ' +
    Math.round(outSize / 1024) + ' КБ bundle.js'
  );
}

build().catch((e) => {
  console.error('Збірка впала:', e.message);
  process.exit(1);
});
