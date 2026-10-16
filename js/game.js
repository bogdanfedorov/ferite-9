var game = {
  tool: 'drill',
  paused: true,
  elapsed: 0,
  igniteCd: 0
};

var BUILD_REPORTS = {
  belt: { text: 'msg.beltDone', sound: 'built' },
  wall: { text: 'msg.wallDone', sound: 'built' },
  removed: { text: 'msg.structRemoved', sound: 'removed' },
  nothing: { text: 'msg.nothingToRemove', sound: null },
  pad: { text: 'msg.padDone', sound: 'built' },
  big: { text: 'msg.padBig', sound: 'denied' },
  room: { text: 'msg.beltRoom', sound: 'denied' }
};

var BUILD_TOOL = { sound: 'pickTool', use: buildUse };

var TOOLS = {
  drill: { sound: 'pickDrill', hold: drillHold },
  hand: { sound: 'pickTool', grips: true, press: handPress },
  ignite: { sound: 'pickTool', hold: igniteHold },
  pad: BUILD_TOOL,
  belt: BUILD_TOOL,
  wall: BUILD_TOOL
};

var MILESTONES = [
  { event: 'first_pad', when: () => cargoPad !== null },
  { event: 'first_sale', when: () => market.sales > 0 },
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

var OVERLAYS = ['intro', 'help', 'settings', 'inventory'];

var loop = { acc: 0, last: 0, hudTick: 0 };

function selectTool(name) {
  if (!toolOpen(name)) {
    say(t('msg.toolLocked'));
    return;
  }
  game.tool = name;
  if (BODIES[name]) setBuildBody(name);
  endBuildDrag();
  renderToolbelt();
  refreshShapeBar();
  play(TOOLS[name].sound);
}

function selectSlot(i) {
  const name = slotTool(i);
  if (name) selectTool(name);
}

function invSlot(i) {
  if (placePicked(i)) play('pickTool');
  renderToolbelt();
}

function invTool(name) {
  if (!toolOpen(name)) {
    buyTool(name);
    return;
  }
  pickForSlot(name);
  renderToolbelt();
}

function toggleInventory() {
  if (game.paused && el.inventory.classList.contains('hidden')) return;
  pickForSlot(null);
  renderToolbelt();
  toggleScreen('inventory');
}

function reportBuild(outcome) {
  const report = BUILD_REPORTS[outcome];
  say(t(report.text));
  if (report.sound) play(report.sound);
}

function drillHold(wpt) {
  const got = drillAt(wpt[0], wpt[1]);
  if (got && simFrame % 5 === 0) play('drill');
}

function handPress(wpt) {
  if (heldObject) return;
  const g = clampToReach(wpt[0], wpt[1]);
  const gx = Math.floor(g[0]),
    gy = Math.floor(g[1]);
  const only = grabTargetAt(gx, gy);
  if (only && takeObject(gx, gy, only)) play('grab');
  else say(t('msg.nothingToGrab'));
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

function buildUse(wpt) {
  const mouse = input.mouse;
  buildEven = input.keys.shift;
  if (!buildFrom) {
    if (mouse.pressed) startBuildDrag(wpt[0], wpt[1], false);
    else if (mouse.rightPressed && activeBody().erasable) startBuildDrag(wpt[0], wpt[1], true);
    return;
  }
  if (buildErase ? mouse.right : mouse.left) {
    buildTo = wpt;
    return;
  }
  reportBuild(finishBuild(buildFrom, buildTo));
  endBuildDrag();
}

function useTool(wpt) {
  const spec = TOOLS[game.tool],
    mouse = input.mouse;
  if (spec.use) spec.use(wpt);
  else if (!mouse.left) {
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
  for (let k = 0; k < GOODS.length; k++) {
    if (GOODS[k].event && market.sold[GOODS[k].key] > 0) loreEvent(GOODS[k].event);
  }
}

function step() {
  const mouse = input.mouse;
  if (game.igniteCd > 0) game.igniteCd--;
  if (updatePlayer(input.keys) === 'respawn') respawn();
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
  mouse.rightPressed = false;

  if ((simFrame & 3) === 0) revealAround(Math.round(player.x), Math.round(player.y), 34);
  updateFog();
  simulate();
  const grip = clampToReach(wpt[0], wpt[1]);
  stepObjects(grip[0], grip[1]);
  tickMarket();
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
  game.paused = false;
  say(t('msg.roomOn'));
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
  onClick('drone-btn', callDrone);
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
  game.elapsed = 0;
  resetMarket(room);
  resetObjects();
  resetBuild();
  resetToolbelt(room);
  const seed = Date.now() & 0xffffff || 12345;
  const sp = room
    ? generateTestRoom(seed, WORLD_W, WORLD_H)
    : generateWorld(seed, WORLD_W, WORLD_H);
  allocBuffers();
  spawnPlayer(sp.spawnX, sp.spawnY);
  view.camX = player.x - view.vw / 2;
  view.camY = player.y - view.vh / 2;
  buildMarketPanel();
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
  buildToolbelt(selectSlot, invSlot, invTool);
  bindInput();
  bindScreens();
  updateHud([player.x, player.y]);
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame);
else startGame();
