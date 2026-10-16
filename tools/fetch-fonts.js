const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'fonts');

const FAMILIES = [
  'IBM+Plex+Sans:wght@400;600',
  'IBM+Plex+Mono:wght@400;600',
  'Unbounded:wght@700;800'
];

const SUBSETS = 'latin,latin-ext,cyrillic,cyrillic-ext';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, binary) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location, binary).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(url + ' → HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const url = 'https://fonts.googleapis.com/css2?family=' +
    FAMILIES.join('&family=') + '&display=swap&subset=' + SUBSETS;

  let css = await get(url, false);
  const links = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) || [])];
  if (!links.length) throw new Error('Google не віддав жодного .woff2 — перевір мережу');

  let saved = 0;
  for (const link of links) {
    const name = link.split('/').slice(-2).join('-').replace(/[^\w.-]/g, '_');
    const file = path.join(OUT, name);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, await get(link, true));
      saved++;
    }
    css = css.split(link).join(name);
  }

  fs.writeFileSync(path.join(OUT, 'fonts.css'), css, 'utf8');
  console.log('fonts/: ' + links.length + ' файлів (' + saved + ' нових) + fonts.css');
  console.log('Збірка тепер підставить локальні шрифти замість Google Fonts.');
}

run().catch((e) => {
  console.error('Не вдалося викачати шрифти:', e.message);
  process.exit(1);
});
