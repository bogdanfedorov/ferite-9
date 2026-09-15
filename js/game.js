/* Цикл гри, керування, HUD. */

(function () {
  var keys = { up: false, down: false, left: false, right: false };
  var mouse = {
    x: 0, y: 0, left: false, right: false,
    pressed: false, clickReq: false
  };
  var tool = 'drill';
  var paused = true;
  var elapsed = 0;
  var msg = '', msgT = 0;
  var launched = false;
  var igniteCd = 0;

  /* ---------- звук ---------- */
  var actx = null;
  function beep(freq, dur, type, vol) {
    if (settings.muted || settings.volume === 0) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = (vol === undefined ? 0.035 : vol) * settings.volume / 100;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* ха думал я буду ообрабативать ошибку */ }
  }

  /* ---------- HUD ---------- */
  var el = {};
  function grab() {
    ['pw-fill', 'pw-use', 'pw-cap', 'net-stat',
      'goal-list', 'launch', 'tip', 'intro', 'help', 'settings', 'win', 'buildbar', 'grid-panel',
      'probe-chip', 'probe-mat', 'probe-t', 'probe-mark', 'heat-legend',
      'hp-num', 'hp-fill', 'fuel-num', 'fuel-fill', 'vital-hp', 'vital-fuel',
      'w-time', 'w-parts', 'w-mach', 'w-lost', 'slot-belt'].forEach(function (id) {
        el[id] = document.getElementById(id);
      });
  }

  var lastVals = {};
  function setVal(id, v) {
    if (lastVals[id] === v) return;
    lastVals[id] = v;
    el[id].textContent = v;
  }

  var goalRows = [];
  function buildGoalPanel() {
    var list = el['goal-list'];
    list.innerHTML = '';
    goalRows = [];
    var want = questDeliver();
    for (var i = 0; i < want.length; i++) {
      var c = want[i];
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.setAttribute('data-i18n', c.label);
      var num = document.createElement('b');
      num.className = 'mono';
      var have = document.createElement('span');
      have.textContent = '0';
      num.appendChild(have);
      num.appendChild(document.createTextNode('/' + c.need));
      var box = document.createElement('div');
      box.className = 'bar';
      var fill = document.createElement('div');
      box.appendChild(fill);
      li.appendChild(name); li.appendChild(num); li.appendChild(box);
      list.appendChild(li);
      goalRows.push({ c: c, li: li, have: have, fill: fill });
    }
    applyI18n(list);
  }

  /* Ціль рахує не склад, а те, що фізично принесли на майданчик. */
  function updateGoalPanel() {
    for (var i = 0; i < goalRows.length; i++) {
      var r = goalRows[i];
      var n = Math.min(cargo[r.c.key] || 0, r.c.need);
      var done = n >= r.c.need;
      if (r.have.textContent !== '' + n) r.have.textContent = n;
      r.fill.style.width = (n / r.c.need * 100) + '%';
      r.fill.classList.toggle('done', done);
      r.li.classList.toggle('done', done);
    }
  }

  /* Смужка стану: зелена → жовта → червона. */
  function setMeter(name, value) {
    var v = Math.max(0, Math.min(100, Math.round(value)));
    setVal(name + '-num', v);
    el[name + '-fill'].style.width = v + '%';
    var box = el['vital-' + name];
    box.classList.toggle('warn', v <= 50 && v > 25);
    box.classList.toggle('crit', v <= 25);
  }

  function updateHud(wpt) {
    var i;
    updatePlate();
    setVal('pw-use', power.use);
    setVal('pw-cap', power.cap);
    var ratio = power.cap > 0 ? Math.min(1, power.use / power.cap) : 0;
    el['pw-fill'].style.width = (ratio * 100) + '%';
    el['pw-fill'].classList.toggle('over', power.sat < 0.999);
    setVal('net-stat', t(power.sat > 0.999 ? 'ui.gridOk' : (power.sat > 0.6 ? 'ui.gridLow' : 'ui.gridOver')));
    el['net-stat'].className = 'stat' + (power.sat > 0.999 ? '' : (power.sat > 0.6 ? ' low' : ' out'));

    // стан модуля
    setMeter('hp', player.hp);
    setMeter('fuel', player.fuel);

    updateGoalPanel();
    var ok = questDone();
    el['launch'].disabled = !ok || launched;

    if (ok) { loreEvent('goal_ready'); unlockBelt(); }
    if (producedOf('ember')) loreEvent('first_ember');
    if (producedOf('melt_iron')) loreEvent('first_melt');
    var want = questDeliver();
    for (i = 0; i < want.length; i++) {
      if (want[i].event && cargo[want[i].key]) loreEvent(want[i].event);
    }
    if (player.dryTank) loreEvent('dry_tank', { alarm: true, hold: 5200 });
    // пісок довго гріється і не тече — підказуємо, що його треба закопати в жар
    if (nearHotOf('sand') > 6000 && !producedOf('melt_glass')) loreEvent('glass_hint', { hold: 6000 });

    el['grid-panel'].classList.toggle('hidden', machines.length === 0);

    updateProbe(wpt);

    if (msgT > 0) {
      el['tip'].textContent = msg;
      el['tip'].parentNode.classList.add('warn');
    } else {
      el['tip'].parentNode.classList.remove('warn');
      el['tip'].textContent = tipFor(tool);
    }
  }

  /* Термощуп їде за курсором: читаєш там, де дивишся. */
  function updateProbe(wpt) {
    var chip = el['probe-chip'];
    if (!mouse.over || paused) { chip.classList.add('hidden'); return; }

    var cx = Math.floor(wpt[0]), cy = Math.floor(wpt[1]);
    var mm = matAt(cx, cy);
    var tv = Math.round(tempAt(cx, cy));
    setVal('probe-mat', matLabel(mm));
    setVal('probe-t', tv);
    chip.classList.toggle('hot', tv > 120);
    chip.classList.remove('hidden');

    // біля краю вікна чип перекидається на інший бік курсора
    var w = chip.offsetWidth || 120, h = chip.offsetHeight || 26;
    var flipX = mouse.x + w + 26 > window.innerWidth;
    var flipY = mouse.y + h + 26 > window.innerHeight;
    chip.style.left = mouse.x + 'px';
    chip.style.top = mouse.y + 'px';
    chip.style.transform = 'translate(' +
      (flipX ? -w - 14 : 14) + 'px,' + (flipY ? -h - 14 : 14) + 'px)';

    if (heatView) {
      var k = Math.max(0, Math.min(1, (tv - 20) / 1380));
      el['probe-mark'].style.left = (k * 100) + '%';
    }
  }

  function tipFor(tool) { return t('tip.' + tool); }

  function say(text) { msg = text; msgT = 150; }

  /* ---------- інструменти ---------- */
  function selectTool(name) {
    if (name === 'belt' && !beltUnlocked) { say(t('msg.beltLocked')); return; }
    tool = name;
    beltFrom = null; beltTo = null;
    var slots = el['buildbar'].children;
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.toggle('active', slots[i].dataset.tool === name);
    }
    beep(name === 'drill' ? 420 : 620, 0.05, 'square', 0.025);
  }

  /* Захват бере лише той матеріал, на який наведено: у перемішаному
     відвалі інакше в жменю лізе все підряд. */
  function grabAt(wpt) {
    var g = clampToReach(wpt[0], wpt[1]);
    var gx = Math.floor(g[0]), gy = Math.floor(g[1]);
    var only = grabTargetAt(gx, gy);
    if (!only) { say(t('msg.nothingToGrab')); return; }

    if (takeObject(gx, gy, only)) {
      say(tf('msg.grabOnly', { mat: matLabel(only) }));
      beep(640, 0.05, 'triangle', 0.025);
    } else say(t('msg.nothingToGrab'));
  }

  /* ---------- стрічка ---------- */

  /* Протяжка скінчилась. Коротка — це не лінія, а клік: розібрати те,
     що під курсором. Довга — ставимо порожній каркас під залізо. */
  function finishBelt(a, b) {
    var shape = snapBelt(a[0], a[1], b[0], b[1]);
    if (!shape || shape.cells.length < BELT_MIN) {
      var cx = Math.round(a[0]), cy = Math.round(a[1]);
      var bp = ghostAt(cx, cy);
      if (bp) {
        say(tf('msg.beltCancel', { n: cancelBlueprint(bp) }));
        beep(220, 0.08, 'square', 0.025);
        return;
      }
      var built = beltUnder(cx, cy);
      if (built) {
        say(tf('msg.beltStrip', { n: dismantleBelt(built) }));
        beep(220, 0.1, 'square', 0.03);
        return;
      }
      say(t('msg.beltShort'));
      return;
    }
    if (!beltFits(shape)) {
      say(t('msg.beltRoom'));
      beep(150, 0.12, 'sawtooth', 0.03);
      return;
    }
    var made = placeBlueprint(shape);
    say(tf('msg.beltFrame', { n: made.need }));
    beep(560, 0.07, 'triangle', 0.03);
  }

  /* Квота закрита — ЦУП відкриває модулю стрічку. */
  function unlockBelt(quiet) {
    if (beltUnlocked) return;
    beltUnlocked = true;
    el['slot-belt'].classList.remove('locked');
    if (quiet) return;
    transmit(t('comms.from'), t('comms.beltGift'), { hold: 5600 });
    beep(680, 0.16, 'triangle', 0.04);
  }

  function onBeltDone() {
    say(t('msg.beltDone'));
    beep(720, 0.12, 'triangle', 0.035);
  }
  window.onBeltDone = onBeltDone;

  function tryUse(wx, wy) {
    var dx = wx - player.x, dy = wy - player.y;
    if (Math.sqrt(dx * dx + dy * dy) > REACH + 8) { say(t('msg.tooFar')); return; }
    if (igniteCd > 0) return;
    igniteCd = 12;
    var lit = igniteAt(wx, wy);
    beep(lit ? 320 : 150, 0.14, 'sawtooth', 0.035);
    if (!lit) say(t('msg.noIgnite'));
  }

  /* ---------- крок гри ---------- */
  function step() {
    if (igniteCd > 0) igniteCd--;
    var res = updatePlayer(keys, mouse.right);
    if (res === 'respawn') {
      releaseObject();
      moduleDeath(player.deathCause, { drop: player.fallDrop, temp: player.lastTemp });
      beep(120, 0.35, 'sawtooth', 0.05);
      paused = true;
      setTimeout(function () {
        beep(300, 0.12, 'triangle', 0.03);
        startBoot(function () { paused = false; });
      }, 900);
    }
    if (hook.state === 'set') loreEvent('first_hook');
    if (power.sat < 0.999) loreEvent('overload', { alarm: true, hold: 4600 });

    var wpt = screenToWorld(mouse.x, mouse.y);
    player.drilling = false;

    // рука: тримаємо матеріал, поки затиснута ЛКМ і вибрана сама рука
    if (heldObject && !(mouse.left && tool === 'hand')) {
      releaseObject();
      beep(300, 0.05, 'square', 0.02);
    }

    var onReset = roomButtonAt(wpt[0], wpt[1]);
    if (onReset) {
      if (mouse.clickReq) {
        roomResetBin(onReset);
        say(tf('msg.roomReset', { mat: matLabel(onReset.id) }));
        beep(560, 0.06, 'triangle', 0.03);
      }
      mouse.pressed = false;
    } else if (tool === 'belt') {
      // стрічку намічають протяжкою: звідки — туди вона потім і повезе
      var bg = clampToReach(wpt[0], wpt[1]);
      if (mouse.left && mouse.pressed) { beltFrom = bg; beltTo = bg; }
      else if (mouse.left && beltFrom) beltTo = bg;
      else if (!mouse.left && beltFrom) {
        finishBelt(beltFrom, beltTo);
        beltFrom = null; beltTo = null;
      }
      mouse.pressed = false;
    } else if (mouse.left && tool === 'hand') {
      if (!heldObject && mouse.pressed) grabAt(wpt);
      mouse.pressed = false;
    } else if (mouse.left) {
      if (tool === 'drill') {
        var got = drillAt(wpt[0], wpt[1]);
        if (got && simFrame % 5 === 0) beep(170 + (simFrame % 5) * 22, 0.03, 'square', 0.013);
      } else if (tool === 'ignite') {
        tryUse(wpt[0], wpt[1]);
      }
      mouse.pressed = false;
    }
    mouse.clickReq = false;

    if ((simFrame & 3) === 0) revealAround(Math.round(player.x), Math.round(player.y), 34);
    updateFog();

    simulate();
    // предмет у руці тягнеться до курсора, але не далі витягнутого маніпулятора
    var grip = clampToReach(wpt[0], wpt[1]);
    stepObjects(grip[0], grip[1]);
    tickMachines();
    tickPipes();
    if ((simFrame & 7) === 0) tickCargoPad();
    tickBuild(simFrame);
    if (sandbox.on) tickTestRoom(simFrame);
    if (msgT > 0) msgT--;
  }

  /* ---------- головний цикл ---------- */
  var acc = 0, last = 0, hudTick = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(100, now - last);
    last = now;

    if (!paused) {
      elapsed += dt;
      acc += dt;
      var steps = 0;
      while (acc >= 16.6667 && steps < 3) { step(); acc -= 16.6667; steps++; }
    } else acc = 0;

    var wpt = screenToWorld(mouse.x, mouse.y);
    render(tool, wpt, true);        // інструменти нічого не коштують: складу немає
    if (++hudTick % 6 === 0) updateHud(wpt);
  }

  /* ---------- керування ---------- */
  function bindInput() {
    var canvas = document.getElementById('game');

    window.addEventListener('keydown', function (e) {
      var c = e.code;
      if (boot.active) {
        // поки триває збирання, клавіші належать терміналу
        if (c === 'Space' || c === 'Enter') e.preventDefault();
        bootKey(c);
        return;
      }
      if (rebinding()) return;
      var act = keyAction(c);

      if (!el['settings'].classList.contains('hidden')) {
        if (c === 'Escape' || act === 'settings') toggleScreen('settings');
        return;
      }

      if (act === 'up') { keys.up = true; e.preventDefault(); }
      if (act === 'down') keys.down = true;
      if (act === 'left') keys.left = true;
      if (act === 'right') keys.right = true;
      if (act.indexOf('slot') === 0) {
        var slot = el['buildbar'].children[+act.slice(4) - 1];
        if (slot) selectTool(slot.dataset.tool);
      }
      if (act === 'heat') {
        heatView = !heatView;
        el['heat-legend'].classList.toggle('hidden', !heatView);
        say(t(heatView ? 'msg.heatOn' : 'msg.heatOff'));
      }
      if (act === 'fuel') {
        var n = manualFuel(player.x, player.y);
        if (n) { say(tf('msg.fueled', { n: n })); beep(480, 0.1, 'triangle', 0.035); }
        else say(t('msg.noFuel'));
      }
      if (act === 'mute') toggleMute();
      if (act === 'help') toggleScreen('help');
      if (act === 'settings') toggleScreen('settings');
      if (c === 'Escape') {
        if (!el['help'].classList.contains('hidden')) toggleScreen('help');
        else selectTool('drill');
      }
    });

    window.addEventListener('keyup', function (e) {
      var c = e.code;
      var act = keyAction(c);
      if (act === 'up') keys.up = false;
      if (act === 'down') keys.down = false;
      if (act === 'left') keys.left = false;
      if (act === 'right') keys.right = false;
    });

    function trackMouse(e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.over = true;
    }

    canvas.addEventListener('mousemove', trackMouse);
    canvas.addEventListener('mouseleave', function () {
      mouse.over = false;
      mouse.left = false;
      mouse.right = false;
    });
    canvas.addEventListener('mousedown', function (e) {
      trackMouse(e);
      if (e.button === 0) { mouse.left = true; mouse.pressed = true; mouse.clickReq = true; }
      if (e.button === 2) {
        mouse.right = true;
        var w = screenToWorld(mouse.x, mouse.y);
        fireHook(w[0], w[1]);
        beep(760, 0.05, 'square', 0.02);
      }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { mouse.left = false; mouse.pressed = false; }
      if (e.button === 2) { mouse.right = false; releaseHook(); }
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      setZoom(view.zoom + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });

    var slots = el['buildbar'].children;
    for (var i = 0; i < slots.length; i++) {
      (function (b) { b.addEventListener('click', function () { selectTool(b.dataset.tool); }); })(slots[i]);
    }

    document.getElementById('btn-help').addEventListener('click', function () {
      toggleScreen('help');
    });
    document.getElementById('btn-settings').addEventListener('click', function () {
      toggleScreen('settings');
    });
    document.getElementById('set-close').addEventListener('click', function () {
      toggleScreen('settings');
    });
    document.getElementById('set-world-swap').addEventListener('click', function () {
      var room = !sandbox.on;
      enterWorld(room);
      if (room) unlockBelt(true);
      refreshSettingsPanel();
      toggleScreen('settings');
      say(t(room ? 'msg.roomOn' : 'msg.roomOff'));
      beep(room ? 440 : 330, 0.12, 'triangle', 0.04);
    });

    document.getElementById('start').addEventListener('click', function () {
      el['intro'].classList.add('hidden');
      beep(330, 0.12, 'triangle', 0.04);
      if (sandbox.on) enterWorld(false);
      startBoot(function () {
        paused = false;
        loreEvent('intro', { hold: 5200 });
      });
    });
    document.getElementById('start-room').addEventListener('click', function () {
      el['intro'].classList.add('hidden');
      beep(440, 0.12, 'triangle', 0.04);
      enterWorld(true);
      unlockBelt(true);
      paused = false;
      say(t('msg.roomOn'));
    });
    document.getElementById('resume').addEventListener('click', function () {
      toggleScreen('help');
    });
    document.getElementById('keep').addEventListener('click', function () {
      toggleScreen('win');
    });
    el['launch'].addEventListener('click', function () {
      if (el['launch'].disabled) return;
      launched = true;
      paused = true;
      var sec = Math.floor(elapsed / 1000);
      el['w-time'].textContent = Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
      el['w-parts'].textContent = stats.processed;
      el['w-mach'].textContent = stats.built;
      el['w-lost'].textContent = SOL.deaths;
      document.getElementById('win-text').textContent = SOL.deaths
        ? tf('win.textLosses', { sol: solName(), n: SOL.deaths })
        : tf('win.textClean', { sol: solName() });
      el['win'].classList.remove('hidden');
      beep(660, 0.5, 'triangle', 0.05);
    });
  }

  function toggleMute() {
    settings.muted = !settings.muted;
    saveSettings();
    refreshSettingsPanel();
    say(t(settings.muted ? 'msg.soundOff' : 'msg.soundOn'));
    if (!settings.muted) beep(520, 0.07, 'triangle', 0.03);
  }

  var OVERLAYS = ['intro', 'help', 'settings', 'win'];

  function toggleScreen(id) {
    el[id].classList.toggle('hidden');
    if (id === 'settings' && !el[id].classList.contains('hidden')) refreshSettingsPanel();
    keys.up = keys.down = keys.left = keys.right = false;
    paused = false;
    for (var i = 0; i < OVERLAYS.length; i++) {
      if (!el[OVERLAYS[i]].classList.contains('hidden')) paused = true;
    }
  }

  /* Перемальовує все, що не має data-i18n: підказки, назви, склад. */
  function refreshLang() {
    lastVals = {};
    selectTool(tool);
    updatePlate();
    refreshSettingsPanel();
    updateHud(screenToWorld(mouse.x, mouse.y));
  }

  function applySettings(what) {
    if (what === 'volume' && !settings.muted) beep(520, 0.05, 'triangle', 0.03);
    if (what === 'grabSize') beep(600, 0.05, 'triangle', 0.025);
  }

  /* ---------- старт ---------- */
  function enterWorld(room) {
    sandbox.on = room;
    sandbox.bins.length = 0;
    launched = false;
    elapsed = 0;
    resetFactory();
    resetQuest();
    resetObjects();
    resetBuild();
    el['slot-belt'].classList.add('locked');
    resetCargo();
    var seed = (Date.now() & 0xffffff) || 12345;
    var sp = room ? generateTestRoom(seed, WORLD_W, WORLD_H)
      : generateWorld(seed, WORLD_W, WORLD_H);
    allocBuffers();
    spawnPlayer(sp.spawnX, sp.spawnY);
    view.camX = player.x - view.vw / 2;
    view.camY = player.y - view.vh / 2;
    buildGoalPanel();
    selectTool('drill');
  }

  function startGame() {
    grab();
    initLang();
    onLangChange = refreshLang;
    initSettings();
    onSettingsChange = applySettings;
    initLore();
    initRender();
    enterWorld(false);
    bindInput();
    updateHud([player.x, player.y]);
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame);
  else startGame();
})();
