var game = {
  tool: 'drill',
  paused: true,
  launched: false,
  elapsed: 0,
  drilled: 0,
  igniteCd: 0
};

var BUILD_REPORTS = {
  belt: { text: 'msg.beltDone', sound: 'built' },
  wall: { text: 'msg.wallDone', sound: 'built' },
  removed: { text: 'msg.structRemoved', sound: 'removed' },
  nothing: { text: 'msg.nothingToRemove', sound: null },
  short: { text: 'msg.beltShort', sound: null },
  room: { text: 'msg.beltRoom', sound: 'denied' }
};

var TOOLS = {
  drill: { sound: 'pickDrill', hold: drillHold },
  hand: { sound: 'pickTool', grips: true, press: handPress },
  ignite: { sound: 'pickTool', hold: igniteHold },
  build: {
    sound: 'pickTool',
    locked: () => !builderUnlocked,
    press: buildPress,
    hold: buildHold,
    idle: buildIdle
  }
};

var MILESTONES = [
  { event: 'first_hook', when: () => hook.state === 'set' },
  { event: 'goal_ready', when: questDone, reward: unlockBuilder },
  { event: 'first_ember', when: () => producedOf('ember') },
  { event: 'first_melt', when: () => producedOf('melt_iron') },
  {
    event: 'dry_tank',
    when: () => player.dryTank,
    opts: { alarm: true, hold: 5200 }
  },
  {
    event: 'glass_hint',
    when: () => nearHotOf('sand') > 6000 && !producedOf('melt_glass'),
    opts: { hold: 6000 }
  }
];

var OVERLAYS = ['intro', 'help', 'settings', 'win'];

var loop = { acc: 0, last: 0, hudTick: 0 };

function selectTool(name) {
  const spec = TOOLS[name];
  if (spec.locked?.()) {
    say(t('msg.builderLocked'));
    return;
  }
  game.tool = name;
  endBuildDrag();
  refreshToolBar();
  play(spec.sound);
}

function reportBuild(outcome) {
  const report = BUILD_REPORTS[outcome];
  say(t(report.text));
  if (report.sound) play(report.sound);
}

function unlockBuilder(quiet) {
  if (builderUnlocked) return;
  builderUnlocked = true;
  showBuilderUnlocked(true);
  if (quiet) return;
  transmit(t('comms.from'), t('comms.beltGift'), { hold: 5600 });
  play('unlock');
}

function drillHold(wpt) {
  const got = drillAt(wpt[0], wpt[1]);
  game.drilled += got;
  if (got && simFrame % 5 === 0) play('drill');
}

function handPress(wpt) {
  if (heldObject) return;
  const g = clampToReach(wpt[0], wpt[1]);
  const gx = Math.floor(g[0]),
    gy = Math.floor(g[1]);
  const only = grabTargetAt(gx, gy);
  if (only && takeObject(gx, gy, only)) {
    say(tf('msg.grabOnly', { mat: matLabel(only) }));
    play('grab');
  } else say(t('msg.nothingToGrab'));
}

function igniteHold(wpt) {
  const dx = wpt[0] - player.x,
    dy = wpt[1] - player.y;
  if (Math.sqrt(dx * dx + dy * dy) > REACH + 8) {
    say(t('msg.tooFar'));
    return;
  }
  if (game.igniteCd > 0) return;
  game.igniteCd = 12;
  const lit = igniteAt(wpt[0], wpt[1]);
  play(lit ? 'ignite' : 'fizzle');
  if (!lit) say(t('msg.noIgnite'));
}

function buildPress(wpt) {
  buildEven = input.keys.shift;
  startBuildDrag(wpt[0], wpt[1]);
}

function buildHold(wpt) {
  buildEven = input.keys.shift;
  if (buildFrom) buildTo = wpt;
}

function buildIdle() {
  buildEven = input.keys.shift;
  if (!buildFrom) return;
  reportBuild(finishBuild(buildFrom, buildTo));
  endBuildDrag();
}

function useTool(wpt) {
  const spec = TOOLS[game.tool],
    mouse = input.mouse;
  if (!mouse.left) {
    if (spec.idle) spec.idle(wpt);
  } else if (mouse.pressed && spec.press) spec.press(wpt);
  else if (spec.hold) spec.hold(wpt);
}

function clickRoomButton(bin) {
  if (!input.mouse.clickReq) return;
  roomResetBin(bin);
  say(tf('msg.roomReset', { mat: matLabel(bin.id) }));
  play('roomReset');
}

function respawn() {
  releaseObject();
  moduleDeath(player.deathCause, { drop: player.fallDrop, temp: player.lastTemp });
  play('death');
  game.paused = true;
  setTimeout(() => {
    play('reboot');
    startBoot(() => {
      game.paused = false;
    });
  }, 900);
}

function checkMilestones() {
  for (let i = 0; i < MILESTONES.length; i++) {
    const m = MILESTONES[i];
    if (!m.when()) continue;
    loreEvent(m.event, m.opts);
    if (m.reward) m.reward();
  }
  const want = questDeliver();
  for (let k = 0; k < want.length; k++) {
    if (want[k].event && cargo[want[k].key]) loreEvent(want[k].event);
  }
}

function step() {
  const mouse = input.mouse;
  if (game.igniteCd > 0) game.igniteCd--;
  if (updatePlayer(input.keys, mouse.right) === 'respawn') respawn();
  checkMilestones();

  const wpt = screenToWorld(mouse.x, mouse.y);
  player.drilling = false;
  if (heldObject && !(mouse.left && TOOLS[game.tool].grips)) {
    releaseObject();
    play('drop');
  }
  const bin = roomButtonAt(wpt[0], wpt[1]);
  if (bin) clickRoomButton(bin);
  else useTool(wpt);
  mouse.pressed = false;
  mouse.clickReq = false;

  if ((simFrame & 3) === 0) revealAround(Math.round(player.x), Math.round(player.y), 34);
  updateFog();
  simulate();
  const grip = clampToReach(wpt[0], wpt[1]);
  stepObjects(grip[0], grip[1]);
  if ((simFrame & 7) === 0) tickCargoPad();
  tickBuild(simFrame);
  if (sandbox.on) tickTestRoom(simFrame);
  tickSay();
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!loop.last) loop.last = now;
  const dt = Math.min(100, now - loop.last);
  loop.last = now;

  if (!game.paused) {
    game.elapsed += dt;
    loop.acc += dt;
    let steps = 0;
    while (loop.acc >= 16.6667 && steps < 3) {
      step();
      loop.acc -= 16.6667;
      steps++;
    }
  } else loop.acc = 0;

  const wpt = screenToWorld(input.mouse.x, input.mouse.y);
  render(game.tool, wpt);
  if (++loop.hudTick % 6 === 0) updateHud(wpt);
}

function toggleScreen(id) {
  el[id].classList.toggle('hidden');
  if (id === 'settings' && !el[id].classList.contains('hidden')) refreshSettingsPanel();
  releaseMoves();
  game.paused = false;
  for (let i = 0; i < OVERLAYS.length; i++) {
    if (!el[OVERLAYS[i]].classList.contains('hidden')) game.paused = true;
  }
}

function swapWorld() {
  const room = !sandbox.on;
  enterWorld(room);
  if (room) unlockBuilder(true);
  refreshSettingsPanel();
  toggleScreen('settings');
  say(t(room ? 'msg.roomOn' : 'msg.roomOff'));
  play(room ? 'room' : 'start');
}

function startMission() {
  el.intro.classList.add('hidden');
  play('start');
  if (sandbox.on) enterWorld(false);
  startBoot(() => {
    game.paused = false;
    loreEvent('intro', { hold: 5200 });
  });
}

function startRoom() {
  el.intro.classList.add('hidden');
  play('room');
  enterWorld(true);
  unlockBuilder(true);
  game.paused = false;
  say(t('msg.roomOn'));
}

function launchShip() {
  if (el.launch.disabled) return;
  game.launched = true;
  game.paused = true;
  const sec = Math.floor(game.elapsed / 1000);
  el['w-time'].textContent = `${Math.floor(sec / 60)}:${(`0${sec % 60}`).slice(-2)}`;
  el['w-cargo'].textContent = cargoTotal();
  el['w-drilled'].textContent = game.drilled;
  el['w-lost'].textContent = SOL.deaths;
  document.getElementById('win-text').textContent = SOL.deaths
    ? tf('win.textLosses', { sol: solName(), n: SOL.deaths })
    : tf('win.textClean', { sol: solName() });
  el.win.classList.remove('hidden');
  play('launch');
}

function onClick(id, fn) {
  document.getElementById(id).addEventListener('click', fn);
}

function bindScreens() {
  onClick('btn-help', () => {
    toggleScreen('help');
  });
  onClick('btn-settings', () => {
    toggleScreen('settings');
  });
  onClick('set-close', () => {
    toggleScreen('settings');
  });
  onClick('set-world-swap', swapWorld);
  onClick('start', startMission);
  onClick('start-room', startRoom);
  onClick('resume', () => {
    toggleScreen('help');
  });
  onClick('keep', () => {
    toggleScreen('win');
  });
  onClick('launch', launchShip);
}

function refreshLang() {
  forgetHudVals();
  selectTool(game.tool);
  updatePlate();
  refreshSettingsPanel();
  updateHud(screenToWorld(input.mouse.x, input.mouse.y));
}

function applySettings(what) {
  if (what === 'volume' && !settings.muted) play('volume');
  if (what === 'grabSize') play('grabSize');
}

function enterWorld(room) {
  sandbox.on = room;
  sandbox.bins.length = 0;
  game.launched = false;
  game.elapsed = 0;
  game.drilled = 0;
  resetQuest();
  resetObjects();
  resetBuild();
  showBuilderUnlocked(false);
  const seed = Date.now() & 0xffffff || 12345;
  const sp = room
    ? generateTestRoom(seed, WORLD_W, WORLD_H)
    : generateWorld(seed, WORLD_W, WORLD_H);
  allocBuffers();
  spawnPlayer(sp.spawnX, sp.spawnY);
  view.camX = player.x - view.vw / 2;
  view.camY = player.y - view.vh / 2;
  buildGoalPanel();
  selectTool('drill');
}

function startGame() {
  grabHud();
  initLang();
  setLangHook(refreshLang);
  initSettings();
  setSettingsHook(applySettings);
  initLore();
  initRender();
  enterWorld(false);
  bindInput();
  bindScreens();
  updateHud([player.x, player.y]);
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame);
else startGame();
