var SOL = {
  version: 1,
  parcel: 1,
  deaths: 0,
  causes: {},
  history: [],
  lastCause: '',
  lastDrop: 0,
  lastTemp: 0,
  lastMoney: null
};

var CAUSES = ['lava', 'heat', 'fall', 'hotdrill', 'buried'];

function solName() {
  return `sol_${SOL.version}.${SOL.parcel < 10 ? '0' : ''}${SOL.parcel}`;
}

var DEVIATIONS = [
  { at: 5, pos: 1, add: 'dev.add1', warn: 'dev.warn1' },
  { at: 9, pos: 2, add: 'dev.add2', warn: 'dev.warn2' },
  { at: 14, pos: 0, add: 'dev.add3', warn: 'dev.warn3', stop: true }
];

var boot = {
  active: false,
  steps: [],
  i: 0,
  wait: 0,
  awaiting: false,
  ending: false,
  typing: null,
  pending: '',
  pendingOff: false,
  acking: false,
  reportDeath: false,
  reportLine: '',
  afterLine: '',
  onDone: null,
  skips: 0,
  el: null,
  log: null,
  hint: null,
  id: null
};

function stamp(i) {
  const s = i * 0.34;
  return `[${s < 10 ? '0' : ''}${s.toFixed(1)}]`;
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function topCause() {
  let best = '',
    n = 0;
  for (let i = 0; i < CAUSES.length; i++) {
    const c = CAUSES[i];
    if ((SOL.causes[c] || 0) > n) {
      n = SOL.causes[c];
      best = c;
    }
  }
  return best;
}

function deathTelemetry(cause) {
  if (cause === 'fall') {
    return tf('term.telFall', { d: Math.round(SOL.lastDrop), limit: FALL_SAFE });
  }
  if (cause === 'hotdrill') return tf('term.telDrill', { t: Math.round(SOL.lastTemp) });
  if (cause === 'buried') return t('term.telBuried');
  return tf('term.telHeat', { t: Math.round(SOL.lastTemp) });
}

function buildBootSteps() {
  const s = [],
    short = SOL.deaths >= 4 || boot.skips > 0;
  const first = SOL.deaths === 0;
  const cause = SOL.lastCause;
  const prev =
    SOL.parcel === 1
      ? `sol_${SOL.version - 1}.10`
      : `sol_${SOL.version}.${SOL.parcel <= 10 ? '0' : ''}${SOL.parcel - 1}`;

  s.push({ k: 'log', t: tPick('term.headers') });

  if (boot.reportDeath && !first) {
    s.push({ k: 'head', t: tf('term.lossHead', { cause: t(`cause.${cause}`).toUpperCase() }) });
    s.push({ k: 'log', t: deathTelemetry(cause), cls: 'bl-off' });
    s.push({ k: 'ack', t: boot.reportLine });
  }
  boot.reportDeath = false;

  if (first) {
    s.push({ k: 'log', t: t('term.firstSeries') });
    s.push({ k: 'log', t: t('term.firstFrame') });
    s.push({ k: 'log', t: t('term.firstDrill') });
    s.push({ k: 'log', t: t('term.firstJet') });
    s.push({ k: 'log', t: t('term.firstMem') });
  } else {
    if (SOL.parcel === 1 && SOL.version > 1) {
      s.push({ k: 'log', cls: 'bl-warn', t: tf('term.revision', { v: SOL.version }) });
    }
    s.push({ k: 'log', t: tf('term.assembling', { sol: solName() }) });

    const generic = t('term.assembly').slice();
    let take = short ? 1 : 2;
    while (take-- > 0 && generic.length) {
      s.push({ k: 'log', t: generic.splice((Math.random() * generic.length) | 0, 1)[0] });
    }
    const byCause = t(`term.byCause.${cause}`);
    if (byCause?.length) s.push({ k: 'log', t: pick(byCause) });

    s.push({ k: 'log', d: 620, t: tPick('term.memRead').replace('{prev}', prev) });
    const frags = [],
      seen2 = {};
    for (let h = SOL.history.length - 1; h >= 0 && frags.length < 3; h--) {
      const f = t(`frag.${SOL.history[h]}`);
      if (f && !seen2[f]) {
        seen2[f] = 1;
        frags.push(f);
      }
    }
    const integrity = Math.max(2, 13 - SOL.deaths);
    s.push({
      k: 'log',
      cls: 'bl-warn',
      t: tf('term.memIntegrity', { pct: integrity, frags: frags.join(', ') || '—' })
    });
    s.push({ k: 'log', t: tPick('term.memDrop') });

    const top = topCause();
    if (SOL.deaths >= 3 && top) {
      s.push({
        k: 'log',
        t: tf('term.adviceRepeat', { advice: t(`advice.${top}`), n: SOL.causes[top] })
      });
      s.push({ k: 'log', t: t('term.adviceStatus') });
    }
  }

  s.push({ k: 'log', t: tf('term.balance', { m: market.money }) });
  if (!first) {
    if (SOL.lastMoney === market.money) {
      s.push({ k: 'log', cls: 'bl-warn', t: tf('term.stale', { prev: prev }) });
    } else if (market.money >= START_MONEY * 2) s.push({ k: 'log', t: t('term.pace') });
  }
  SOL.lastMoney = market.money;

  s.push({ k: 'log', d: 460, t: t('term.baselineStart') });

  let dev = null;
  for (let d = DEVIATIONS.length - 1; d >= 0; d--) {
    if (SOL.deaths >= DEVIATIONS[d].at) {
      dev = DEVIATIONS[d];
      break;
    }
  }
  const lines = t('baseline');
  const order = short ? [0, 3, 5] : [0, 1, 2, 3, 4, 5];
  let stopped = false;
  for (let n = 0; n < order.length; n++) {
    const line = lines[order[n]];
    s.push({ k: 'q', t: line.q });
    if (dev && dev.pos === n) {
      s.push({ k: 'a', t: `${line.a} ${t(dev.add)}`, off: true });
      s.push({ k: 'warn', t: t(dev.warn) });
      if (dev.stop) {
        stopped = true;
        break;
      }
    } else {
      s.push({ k: 'a', t: line.a });
    }
  }
  s.push({
    k: 'end',
    t: tf(stopped ? 'term.baselineCut' : 'term.baselineOk', { sol: solName() })
  });
  return s;
}

function bootLine(cls, text) {
  const p = document.createElement('p');
  p.className = `bl ${cls}`;
  p.textContent = text;
  boot.log.appendChild(p);
  while (boot.log.children.length > 16) boot.log.removeChild(boot.log.firstChild);
  boot.log.scrollTop = boot.log.scrollHeight;
  return p;
}

function startBoot(onDone) {
  if (!boot.el) {
    if (onDone) onDone();
    return;
  }
  boot.steps = buildBootSteps();
  boot.i = 0;
  boot.wait = 0;
  boot.awaiting = false;
  boot.ending = false;
  boot.typing = null;
  boot.pending = '';
  boot.acking = false;
  boot.onDone = onDone || null;
  boot.active = true;
  boot.log.innerHTML = '';
  boot.id.textContent = solName();
  boot.hint.textContent = t('term.hintInit');
  boot.el.classList.remove('hidden');
}

function finishBoot() {
  boot.active = false;
  boot.reportDeath = false;
  boot.el.classList.add('hidden');
  if (boot.afterLine) {
    transmit(t('comms.from'), boot.afterLine, { hold: 3800 });
    boot.afterLine = '';
  }
  const cb = boot.onDone;
  boot.onDone = null;
  if (cb) cb();
}

function bootNext() {
  const s = boot.steps[boot.i++];
  if (!s) {
    finishBoot();
    return;
  }

  if (s.k === 'log') {
    bootLine(s.cls || 'bl-log', `${stamp(boot.i)} ${s.t}`);
    boot.wait = s.d || 150;
  } else if (s.k === 'q') {
    const el = bootLine('bl-q', '');
    boot.typing = { el: el, full: `> ${s.t}`, n: 0 };
  } else if (s.k === 'a') {
    boot.pending = s.t;
    boot.pendingOff = !!s.off;
    boot.awaiting = true;
    bootLine('bl-pending', `  ${s.t}`);
    boot.hint.textContent = t('term.hintAnswer');
  } else if (s.k === 'head') {
    bootLine('bl-head', s.t);
    boot.wait = 420;
  } else if (s.k === 'ack') {
    bootLine('bl-report', s.t);
    bootLine('bl-pending', `  ${t('term.ackBtn')}`);
    boot.awaiting = true;
    boot.acking = true;
    boot.hint.textContent = t('term.hintAck');
  } else if (s.k === 'warn') {
    bootLine('bl-warn', `${stamp(boot.i)} ${s.t}`);
    boot.wait = 900;
  } else if (s.k === 'end') {
    bootLine('bl-ok', s.t);
    boot.awaiting = true;
    boot.ending = true;
    boot.hint.textContent = t('term.hintEnter');
  }
}

function tickBoot() {
  if (!boot.active || boot.awaiting) return;
  if (boot.typing) {
    const tp = boot.typing;
    tp.n = Math.min(tp.full.length, tp.n + (comms.reduced ? tp.full.length : 3));
    tp.el.textContent = tp.full.slice(0, tp.n);
    if (tp.n >= tp.full.length) {
      boot.typing = null;
      boot.wait = 260;
    }
    return;
  }
  if (boot.wait > 0) {
    boot.wait -= 33;
    return;
  }
  bootNext();
}

function bootKey(code) {
  if (!boot.active) return;
  if (code === 'Escape') {
    boot.skips++;
    finishBoot();
    return;
  }
  if (code !== 'Enter' && code !== 'Space' && code !== 'NumpadEnter') return;
  if (!boot.awaiting) return;
  if (boot.ending) {
    finishBoot();
    return;
  }
  const last = boot.log.lastChild;
  if (boot.acking) {
    boot.acking = false;
    if (last) {
      last.className = 'bl bl-log';
      last.textContent = `  ${t('term.ackDone')}`;
    }
  } else if (last) {
    last.className = `bl ${boot.pendingOff ? 'bl-off' : 'bl-a'}`;
    last.textContent = `  ${boot.pending}`;
  }
  boot.awaiting = false;
  boot.hint.textContent = '…';
  boot.wait = 180;
}

var comms = {
  queue: [],
  from: '',
  full: '',
  shown: 0,
  hold: 0,
  alarm: false,
  el: null,
  elFrom: null,
  elText: null,
  plate: null,
  plateMeta: null,
  timer: null,
  reduced: false
};

function initLore() {
  comms.el = document.getElementById('comms');
  comms.elFrom = document.getElementById('comms-from');
  comms.elText = document.getElementById('comms-text');
  comms.plate = document.getElementById('callsign');
  comms.statLosses = document.getElementById('stat-losses');
  comms.statExplored = document.getElementById('stat-explored');
  boot.el = document.getElementById('boot');
  boot.log = document.getElementById('boot-log');
  boot.hint = document.getElementById('boot-hint');
  boot.id = document.getElementById('boot-id');
  const skip = document.getElementById('boot-skip');
  if (skip)
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      boot.skips++;
      finishBoot();
    });
  if (boot.el)
    boot.el.addEventListener('click', (e) => {
      if (e.target.id !== 'boot-skip' && !e.target.classList.contains('lang-btn')) bootKey('Enter');
    });
  try {
    comms.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    comms.reduced = false;
  }
  updatePlate();
  comms.timer = setInterval(() => {
    tickBoot();
    tickComms();
  }, 33);
}

function fillVars(text) {
  const drop = Math.round(SOL.lastDrop);
  return text
    .replace(/\{sol\}/g, solName())
    .replace(/\{p\}/g, SOL.parcel)
    .replace(/\{v\}/g, SOL.version)
    .replace(/\{cm\}/g, tPlural('unit.module', SOL.deaths))
    .replace(/\{c\}/g, SOL.deaths)
    .replace(/\{dc\}/g, tPlural('unit.cell', drop))
    .replace(/\{d\}/g, drop)
    .replace(/\{t\}/g, Math.round(SOL.lastTemp));
}

function transmit(from, text, opts) {
  opts = opts || {};
  const msg = {
    from: from,
    text: fillVars(text),
    hold: opts.hold || 4200,
    alarm: !!opts.alarm
  };
  if (opts.alarm) {
    comms.queue.unshift(msg);
    comms.hold = 0;
  } else if (opts.after) {
    comms.queue.splice(1, 0, msg);
  } else {
    comms.queue.push(msg);
  }
  if (comms.queue.length > 4) comms.queue.length = 4;
}

function tickComms() {
  if (comms.hold > 0) {
    comms.hold -= 33;
    if (comms.shown < comms.full.length) {
      comms.shown = comms.reduced ? comms.full.length : comms.shown + 2;
      comms.elText.textContent = comms.full.slice(0, comms.shown);
    }
    if (comms.hold <= 0) comms.el.classList.add('hidden');
    return;
  }
  const next = comms.queue.shift();
  if (!next) return;
  comms.from = next.from;
  comms.full = next.text;
  comms.shown = comms.reduced ? next.text.length : 0;
  comms.hold = next.hold + next.text.length * 16;
  comms.elFrom.textContent = next.from;
  comms.elText.textContent = comms.reduced ? next.text : '';
  comms.el.classList.toggle('alarm', next.alarm);
  comms.el.classList.remove('hidden');
}

function updatePlate(bump) {
  if (!comms.plate) return;
  comms.plate.textContent = solName();
  if (comms.statLosses) comms.statLosses.textContent = SOL.deaths;
  if (comms.statExplored) {
    comms.statExplored.textContent = `${Math.round((seenCount / (FCW * FCH)) * 100)}%`;
  }
  if (bump && !comms.reduced) {
    comms.plate.classList.remove('bump');
    void comms.plate.offsetWidth;
    comms.plate.classList.add('bump');
  }
}

var loreSeen = {};

function loreEvent(key, opts) {
  if (loreSeen[key]) return;
  loreSeen[key] = 1;
  const line = t(`event.${key}`);
  if (typeof line !== 'string') return;
  transmit(t('comms.from'), line, opts);
}

function pickLine(cause, n) {
  const first = t(`death.${cause}.first`);
  if (n <= first.length) return first[n - 1];
  return pick(t(`death.${cause}.pool`));
}

function moduleDeath(cause, detail) {
  detail = detail || {};
  SOL.deaths++;
  SOL.lastCause = cause;
  SOL.history.push(cause);
  if (SOL.history.length > 8) SOL.history.shift();
  SOL.lastDrop = detail.drop || 0;
  SOL.lastTemp = detail.temp || 0;
  SOL.causes[cause] = (SOL.causes[cause] || 0) + 1;
  const n = SOL.causes[cause];

  boot.reportDeath = true;
  boot.reportLine = fillVars(pickLine(cause, n));

  SOL.parcel++;
  if (SOL.parcel > 10) {
    SOL.version++;
    SOL.parcel = 1;
  }
  boot.afterLine = t('respawn')[(SOL.deaths - 1) % t('respawn').length];
  updatePlate(true);
  return solName();
}
