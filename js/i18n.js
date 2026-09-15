/* Локалізація: uk / en / pl.
   Ключі пласкі з крапками; значення — рядок або масив варіантів. */

var LANGS = {};
var LANG = 'uk';
var LANG_LIST = [
  { code: 'uk', label: 'UA' },
  { code: 'en', label: 'EN' },
  { code: 'pl', label: 'PL' }
];
var onLangChange = null;

function regLang(code, data) { LANGS[code] = data; }

function t(key) {
  var d = LANGS[LANG];
  var v = d ? d[key] : undefined;
  if (v === undefined && LANGS.uk) v = LANGS.uk[key];
  return v === undefined ? key : v;
}

/* Підстановка {змінних} у рядок. */
function tf(key, vars) {
  var s = t(key);
  if (typeof s !== 'string') return s;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, function (m, name) {
    return vars[name] === undefined ? m : vars[name];
  });
}

function tPick(key) {
  var arr = t(key);
  if (!arr || !arr.length) return '';
  return arr[(Math.random() * arr.length) | 0];
}

/* Форма числівника: 0 — один, 1 — кілька, 2 — багато. */
function pluralForm(n) {
  if (LANG === 'en') return n === 1 ? 0 : 1;
  var d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 0;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 1;
  return 2;
}

function tPlural(key, n) {
  var forms = t(key);
  if (!forms || !forms.length) return '';
  var i = pluralForm(n);
  return forms[i < forms.length ? i : forms.length - 1];
}

function applyI18n(root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    var v = t(nodes[i].getAttribute('data-i18n'));
    if (typeof v === 'string') nodes[i].textContent = v;
  }
  var html = scope.querySelectorAll('[data-i18n-html]');
  for (i = 0; i < html.length; i++) {
    var h = t(html[i].getAttribute('data-i18n-html'));
    if (typeof h === 'string') html[i].innerHTML = h;
  }
}

function setLang(code, silent) {
  if (!LANGS[code]) return;
  LANG = code;
  try { localStorage.setItem('ferit9.lang', code); } catch (e) { /* приватний режим */ }
  document.documentElement.lang = code;
  applyI18n();
  var btns = document.querySelectorAll('.lang-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('on', btns[i].dataset.lang === code);
  }
  if (!silent && onLangChange) onLangChange();
}

function detectLang() {
  var saved = null;
  try { saved = localStorage.getItem('ferit9.lang'); } catch (e) { /* нема доступу */ }
  if (saved && LANGS[saved]) return saved;
  var nav = (navigator.language || 'uk').toLowerCase();
  if (nav.indexOf('pl') === 0) return 'pl';
  if (nav.indexOf('uk') === 0 || nav.indexOf('ru') === 0) return 'uk';
  return 'en';
}

/* Розставляє перемикачі мови в контейнерах .lang-switch. */
function buildLangSwitches() {
  var holders = document.querySelectorAll('.lang-switch');
  for (var h = 0; h < holders.length; h++) {
    var box = holders[h];
    box.innerHTML = '';
    for (var i = 0; i < LANG_LIST.length; i++) {
      var b = document.createElement('button');
      b.className = 'lang-btn';
      b.type = 'button';
      b.dataset.lang = LANG_LIST[i].code;
      b.textContent = LANG_LIST[i].label;
      b.addEventListener('click', (function (code) {
        return function (e) { e.stopPropagation(); setLang(code); };
      })(LANG_LIST[i].code));
      box.appendChild(b);
    }
  }
}

function initLang() {
  buildLangSwitches();
  setLang(detectLang(), true);
}
