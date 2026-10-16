var GOODS = [
  { key: 'gravel', base: 4, half: 3 },
  { key: 'sand', base: 5, half: 3 },
  { key: 'coal', base: 10, half: 6 },
  { key: 'ferrite', base: 14, half: 6 },
  { key: 'iron', base: 44, half: 12, event: 'first_iron' },
  { key: 'glass', base: 64, half: 16, event: 'first_glass' }
];

var TOOL_COST = { ignite: 60, wall: 120, belt: 240 };

var PRICE_FLOOR = 0.15;
var START_MONEY = 25;
var ROOM_MONEY = 9999;
var DRONE_FEE = 10;
var DRONE_TRIP = 300;

function indexGoods() {
  const out = {};
  for (let i = 0; i < GOODS.length; i++) out[GOODS[i].key] = GOODS[i];
  return out;
}

var GOOD_OF = indexGoods();

var market = { money: 0, sold: {}, sales: 0, drone: 0 };

function resetMarket(rich) {
  market.money = rich ? ROOM_MONEY : START_MONEY;
  market.sold = {};
  market.sales = 0;
  market.drone = 0;
  for (let i = 0; i < GOODS.length; i++) market.sold[GOODS[i].key] = 0;
}

function priceOf(good) {
  const minutes = game.elapsed / 60000;
  const decay = Math.max(PRICE_FLOOR, 0.5 ** (minutes / good.half));
  return Math.max(1, Math.round(good.base * decay));
}

function sweepPad(take) {
  const counts = {};
  if (!cargoPad) return counts;
  for (let y = cargoPad.y; y < cargoPad.y + cargoPad.h; y++) {
    for (let x = cargoPad.x; x < cargoPad.x + cargoPad.w; x++) {
      if (!inBounds(x, y)) continue;
      const group = CARGO[mat[y * W + x]];
      if (!GOOD_OF[group]) continue;
      counts[group] = (counts[group] || 0) + 1;
      if (take) setCell(x, y, VOID_ID);
    }
  }
  return counts;
}

function payoutOf(counts) {
  let sum = 0;
  for (const key in counts) sum += counts[key] * priceOf(GOOD_OF[key]);
  return sum;
}

function deliverPad() {
  const counts = sweepPad(true);
  const sum = payoutOf(counts);
  for (const key in counts) market.sold[key] += counts[key];
  market.money += sum;
  if (sum > 0) market.sales++;
  say(sum > 0 ? tf('msg.droneSold', { sum: sum }) : t('msg.droneEmpty'));
  play(sum > 0 ? 'sale' : 'denied');
  renderToolbelt();
}

function callDrone() {
  if (market.drone > 0) return;
  if (!cargoPad) {
    say(t('msg.noPad'));
    play('denied');
    return;
  }
  if (market.money < DRONE_FEE) {
    say(tf('msg.cantAfford', { cost: DRONE_FEE }));
    play('denied');
    return;
  }
  market.money -= DRONE_FEE;
  market.drone = DRONE_TRIP;
  say(t('msg.droneOn'));
  play('launch');
}

function tickMarket() {
  if (market.drone <= 0) return;
  market.drone--;
  if (market.drone === DRONE_TRIP >> 1) deliverPad();
}

function buyTool(name) {
  const cost = TOOL_COST[name];
  if (market.money < cost) {
    say(tf('msg.cantAfford', { cost: cost }));
    play('denied');
    return;
  }
  market.money -= cost;
  openTool(name);
  say(tf('msg.bought', { tool: t(`tool.${name}`) }));
  play('unlock');
  renderToolbelt();
}
