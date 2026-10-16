/* Цикл гри, керування, HUD. */

(function () {
  var keys = { up: false, down: false, left: false, right: false, shift: false };
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
  var drilled = 0;

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
    ['goal-list', 'launch', 'tip', 'intro', 'help', 'settings', 'win', 'buildbar', 'bodybar', 'shapebar',
      'probe-chip', 'probe-mat', 'probe-t', 'probe-mark', 'heat-legend',
      'hp-num', 'hp-fill', 'fuel-num', 'fuel-fill', 'vital-hp', 'vital-fuel',
      'w-time', 'w-cargo', 'w-drilled', 'w-lost', 'slot-build'].forEach(function (id) {
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
    setMeter('hp', player.hp);
    setMeter('fuel', player.fuel);

    updateGoalPanel();
    var ok = questDone();
    el['launch'].disabled = !ok || launched;

    if (ok) { loreEvent('goal_ready'); unlockBuilder(); }
    if (producedOf('ember')) loreEvent('first_ember');
    if (producedOf('melt_iron')) loreEvent('first_melt');
    var want = questDeliver();
    for (i = 0; i < want.length; i++) {
      if (want[i].event && cargo[want[i].key]) loreEvent(want[i].event);
    }
    if (player.dryTank) loreEvent('dry_tank', { alarm: true, hold: 5200 });
    if (nearHotOf('sand') > 6000 && !producedOf('melt_glass')) loreEvent('glass_hint', { hold: 6000 });

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

  function tipFor(tool) {
    return t('tip.' + tool);
  }

  function say(text) { msg = text; msgT = 150; }

  /* ---------- інструменти ---------- */
  function selectTool(name) {
    if (name === 'build' && !builderUnlocked) { say(t('msg.beltLocked')); return; }
    tool = name;
    endBuildDrag();
    var slots = el['buildbar'].children;
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.toggle('active', slots[i].dataset.tool === name);
    }
    el['bodybar'].classList.toggle('hidden', name !== 'build');
    el['shapebar'].classList.toggle('hidden', name !== 'build');
    if (name === 'build') refreshBuildBars();
    beep(name === 'drill' ? 420 : 620, 0.05, 'square', 0.025);
  }

  function refreshBuildBars() {
    var bodies = el['bodybar'].children;
    for (var i = 0; i < bodies.length; i++) {
      bodies[i].classList.toggle('active', bodies[i].dataset.body === buildBody);
    }
    var allowed = shapesOfBody();
    var shapes = el['shapebar'].children;
    for (var k = 0; k < shapes.length; k++) {
      var name = shapes[k].dataset.shape;
      shapes[k].classList.toggle('hidden', allowed.indexOf(name) < 0);
      shapes[k].classList.toggle('active', name === buildShape);
    }
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

  var BUILD_REPORTS = {
    belt: { text: 'msg.beltDone', tone: [560, 0.07, 'triangle', 0.03] },
    wall: { text: 'msg.wallDone', tone: [560, 0.07, 'triangle', 0.03] },
    removed: { text: 'msg.structRemoved', tone: [220, 0.08, 'square', 0.025] },
    nothing: { text: 'msg.nothingToRemove', tone: null },
    short: { text: 'msg.beltShort', tone: null },
    room: { text: 'msg.beltRoom', tone: [150, 0.12, 'sawtooth', 0.03] }
  };

  function reportBuild(outcome) {
    var report = BUILD_REPORTS[outcome];
    say(t(report.text));
    if (report.tone) beep.apply(null, report.tone);
  }

  function unlockBuilder(quiet) {
    if (builderUnlocked) return;
    builderUnlocked = true;
    el['slot-build'].classList.remove('locked');
    if (quiet) return;
    transmit(t('comms.from'), t('comms.beltGift'), { hold: 5600 });
    beep(680, 0.16, 'triangle', 0.04);
  }

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

    var wpt = screenToWorld(mouse.x, mouse.y);
    player.drilling = false;

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
    } else if (tool === 'build') {
      buildEven = keys.shift;
      if (mouse.left && mouse.pressed) startBuildDrag(wpt[0], wpt[1]);
      else if (mouse.left && buildFrom) buildTo = wpt;
      else if (!mouse.left && buildFrom) {
        reportBuild(finishBuild(buildFrom, buildTo));
        endBuildDrag();
      }
      mouse.pressed = false;
    } else if (mouse.left && tool === 'hand') {
      if (!heldObject && mouse.pressed) grabAt(wpt);
      mouse.pressed = false;
    } else if (mouse.left) {
      if (tool === 'drill') {
        var got = drillAt(wpt[0], wpt[1]);
        drilled += got;
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
    var grip = clampToReach(wpt[0], wpt[1]);
    stepObjects(grip[0], grip[1]);
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
    render(tool, wpt);
    if (++hudTick % 6 === 0) updateHud(wpt);
  }

  /* ---------- керування ---------- */
  function bindInput() {
    var canvas = document.getElementById('game');

    window.addEventListener('keydown', function (e) {
      var c = e.code;
      keys.shift = e.shiftKey;
      if (boot.active) {
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
      if (c === 'KeyR' && tool === 'build') {
        cycleBuildShape();
        refreshBuildBars();
        say(tf('msg.buildShape', { shape: t('shape.' + buildShape) }));
        beep(500, 0.05, 'square', 0.02);
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
      keys.shift = e.shiftKey;
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
      keys.shift = e.shiftKey;
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

    var bodies = el['bodybar'].children;
    for (var d = 0; d < bodies.length; d++) {
      (function (b) {
        b.addEventListener('click', function () {
          setBuildBody(b.dataset.body);
          refreshBuildBars();
          say(tf('msg.buildBody', { body: t('body.' + buildBody) }));
          beep(520, 0.05, 'square', 0.02);
        });
      })(bodies[d]);
    }

    var shapes = el['shapebar'].children;
    for (var s = 0; s < shapes.length; s++) {
      (function (b) {
        b.addEventListener('click', function () {
          setBuildShape(b.dataset.shape);
          refreshBuildBars();
          beep(500, 0.05, 'square', 0.02);
        });
      })(shapes[s]);
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
      if (room) unlockBuilder(true);
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
      unlockBuilder(true);
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
      el['w-cargo'].textContent = cargoTotal();
      el['w-drilled'].textContent = drilled;
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
    drilled = 0;
    resetQuest();
    resetObjects();
    resetBuild();
    el['slot-build'].classList.add('locked');
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
