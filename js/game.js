var game = {
  tool: 'drill',
  paused: false,
  menuBack: false
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

var OVERLAYS = ['intro', 'pause', 'help', 'settings', 'inventory'];

var loop = { acc: 0, last: 0, hudTick: 0 };

function selectTool(name) {
  if (!toolOpen(name)) {
    transmit(t('msg.toolLocked'), NOTICE);
    return;
  }
  game.tool = name;
  if (PIECES[name].select) PIECES[name].select();
  endBuildDrag();
  renderToolbelt();
  refreshShapeBar();
  play(PIECES[name].sound);
}

function selectSlot(i) {
  const name = slotTool(i);
  if (name) selectTool(name);
}

function invSlot(i) {
  if (placePicked(i)) play('pickTool');
  renderToolbelt();
}

function invUpgrade(name) {
  upgradePiece(name);
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

function useTool(wpt) {
  const spec = PIECES[game.tool],
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
  transmit(tf('msg.roomReset', { mat: matLabel(bin.id) }), NOTICE);
  play('roomReset');
}

function respawn() {
  followWindow(localX(player.spawnX), Infinity);
  clearAirlock();
  moveToSpawn();
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

function followWindow(lx, maxChunks) {
  const dc = Math.max(-maxChunks, Math.min(maxChunks, windowShiftFor(lx)));
  if (!dc) return;
  const dx = dc * CHUNK_SIZE;
  shiftWindow(dc);
  shiftPlayer(dx);
  shiftObjects(dx);
  shiftCamera(dx);
  endBuildDrag();
}

function step() {
  const mouse = input.mouse;
  if (updatePlayer(input.keys) === 'respawn') respawn();
  followWindow(player.x, 1);
  checkMilestones();

  const wpt = screenToWorld(mouse.x, mouse.y);
  player.drilling = false;
  if (heldObject && !(mouse.left && PIECES[game.tool].grips)) {
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
  tickPieces(simFrame);
  if (sandbox.on) tickTestRoom(simFrame);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!loop.last) loop.last = now;
  const dt = Math.min(100, now - loop.last);
  loop.last = now;

  if (!game.paused) {
    loop.acc += dt;
    let steps = 0;
    while (loop.acc >= 16.6667 && steps < 3) {
      step();
      loop.acc -= 16.6667;
      steps++;
    }
  } else loop.acc = 0;

  if (market.money !== toolbeltMoney) renderToolbelt();
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

function closeScreen(id) {
  toggleScreen(id);
  if (!game.menuBack) return;
  game.menuBack = false;
  toggleScreen('pause');
}

function openFromPause(id) {
  toggleScreen('pause');
  toggleScreen(id);
  game.menuBack = true;
}

function swapWorld() {
  const room = !sandbox.on;
  enterWorld(room);
  refreshSettingsPanel();
  game.menuBack = false;
  toggleScreen('settings');
  transmit(t(room ? 'msg.roomOn' : 'msg.roomOff'), NOTICE);
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
  transmit(t('msg.roomOn'), NOTICE);
}

function onClick(id, fn) {
  document.getElementById(id).addEventListener('click', fn);
}

function bindScreens() {
  onClick('pause-resume', () => {
    toggleScreen('pause');
  });
  onClick('pause-settings', () => {
    openFromPause('settings');
  });
  onClick('pause-help', () => {
    openFromPause('help');
  });
  onClick('set-close', () => {
    closeScreen('settings');
  });
  onClick('set-world-swap', swapWorld);
  onClick('start', startMission);
  onClick('start-room', startRoom);
  onClick('resume', () => {
    closeScreen('help');
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

function showNotice(sound, text) {
  if (sound) play(sound);
  if (text) transmit(text, NOTICE);
}

function applySettings(what) {
  if (what === 'volume' && !settings.muted) play('volume');
  if (what !== 'grabSize') return;
  setGrabSize(settings.grabSize);
  play('grabSize');
}

function enterWorld(room) {
  sandbox.on = room;
  sandbox.bins.length = 0;
  resetMarket(room);
  resetObjects();
  resetPieces();
  resetBuild();
  resetToolbelt(room);
  const seed = Date.now() & 0xffffff || 12345;
  const sp = room
    ? generateTestRoom(seed, WORLD_W, WORLD_H)
    : generateWorld(seed, WORLD_W, WORLD_H);
  setZoom(view.zoom);
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
  setGrabSize(settings.grabSize);
  setSettingsHook(applySettings);
  setNoticeHook(showNotice);
  initLore();
  initRender();
  enterWorld(false);
  buildToolbelt(selectSlot, invSlot, invTool, invUpgrade);
  buildShapeBar();
  bindInput();
  bindScreens();
  updateHud([player.x, player.y]);
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startGame);
else startGame();
