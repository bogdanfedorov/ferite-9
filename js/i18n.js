var LANGS = {};
var LANG = 'uk';
var LANG_LIST = [
  { code: 'uk', label: 'UA' },
  { code: 'en', label: 'EN' },
  { code: 'pl', label: 'PL' }
];
var onLangChange = null;

function setLangHook(fn) {
  onLangChange = fn;
}

function regLang(code, data) {
  LANGS[code] = data;
}

function t(key) {
  const d = LANGS[LANG];
  let v = d ? d[key] : undefined;
  if (v === undefined && LANGS.uk) v = LANGS.uk[key];
  return v === undefined ? key : v;
}

function tf(key, vars) {
  const s = t(key);
  if (typeof s !== 'string') return s;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : vars[name]));
}

function tPick(key) {
  const arr = t(key);
  if (!arr?.length) return '';
  return arr[(Math.random() * arr.length) | 0];
}

function pluralForm(n) {
  if (LANG === 'en') return n === 1 ? 0 : 1;
  const d10 = n % 10,
    d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 0;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 1;
  return 2;
}

function tPlural(key, n) {
  const forms = t(key);
  if (!forms?.length) return '';
  const i = pluralForm(n);
  return forms[i < forms.length ? i : forms.length - 1];
}

function applyI18n(root) {
  const scope = root || document;
  const nodes = scope.querySelectorAll('[data-i18n]');
  for (let i = 0; i < nodes.length; i++) {
    const v = t(nodes[i].getAttribute('data-i18n'));
    if (typeof v === 'string') nodes[i].textContent = v;
  }
  const html = scope.querySelectorAll('[data-i18n-html]');
  for (i = 0; i < html.length; i++) {
    const h = t(html[i].getAttribute('data-i18n-html'));
    if (typeof h === 'string') html[i].innerHTML = h;
  }
}

function setLang(code, silent) {
  if (!LANGS[code]) return;
  LANG = code;
  try {
    localStorage.setItem('ferit9.lang', code);
  } catch (e) {}
  document.documentElement.lang = code;
  applyI18n();
  const btns = document.querySelectorAll('.lang-btn');
  for (let i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('on', btns[i].dataset.lang === code);
  }
  if (!silent && onLangChange) onLangChange();
}

function detectLang() {
  let saved = null;
  try {
    saved = localStorage.getItem('ferit9.lang');
  } catch (e) {}
  if (saved && LANGS[saved]) return saved;
  const nav = (navigator.language || 'uk').toLowerCase();
  if (nav.indexOf('pl') === 0) return 'pl';
  if (nav.indexOf('uk') === 0 || nav.indexOf('ru') === 0) return 'uk';
  return 'en';
}

function buildLangSwitches() {
  const holders = document.querySelectorAll('.lang-switch');
  for (let h = 0; h < holders.length; h++) {
    const box = holders[h];
    box.innerHTML = '';
    for (let i = 0; i < LANG_LIST.length; i++) {
      const b = document.createElement('button');
      b.className = 'lang-btn';
      b.type = 'button';
      b.dataset.lang = LANG_LIST[i].code;
      b.textContent = LANG_LIST[i].label;
      b.addEventListener(
        'click',
        ((code) => (e) => {
          e.stopPropagation();
          setLang(code);
        })(LANG_LIST[i].code)
      );
      box.appendChild(b);
    }
  }
}

function initLang() {
  buildLangSwitches();
  setLang(detectLang(), true);
}
